# Phase 0 Research: In-Browser RL Autoplay Training

## 1. RL algorithm choice

**Decision**: A small-CNN DQN (Deep Q-Network) with epsilon-greedy
exploration, a fixed-capacity replay buffer, and a periodically-synced target
network — the scaled-down classic Atari DQN recipe, not a novel architecture.

- Observation: single or 2-frame-stacked grayscale downsample of the canvas
  (e.g. 42×42–48×48), normalized to `[0,1]`.
- Action space: a curated subset of `GbaButton` — `UP, DOWN, LEFT, RIGHT, A, B`
  (excludes `START`/`SELECT`/`L`/`R`, which don't help "see new screens" and
  only add exploration variance for a reward signal that is screen-novelty
  based).
- Network: `conv(8,3x3,s2) → conv(16,3x3,s2) → flatten → dense(128,relu) →
  dense(numActions,linear)`. Small enough to run forward+backward passes well
  under a training-tick interval on WebGL/WebGPU, and still usable (just
  slower) on a CPU fallback.
- Loss: Huber loss on TD-error vs. a target network synced every ~1000 steps —
  standard DQN stabilization, addresses the two classic online-RL failure
  modes (moving target, correlated updates) with well-understood fixes.

**Rationale**: Feasible to implement and ship as a single feature ("not a
research paper"). Its replay buffer is not a liability — it is what makes
FR-010 (bounded memory) a hard, testable constant (a fixed-size array) rather
than an emergent property of training-loop stability.

**Alternatives considered**: On-policy actor-critic (A2C-style) — avoids a
replay buffer, but online policy-gradient methods are higher-variance and
reward-scale-sensitive, making "demonstrably better than random after 30
minutes" (spec SC-003) harder to guarantee in a v1, and harder to bound memory
for (variance/entropy hyperparameters vs. one fixed-capacity buffer).

## 2. Where training runs (main thread vs. Web Worker)

**Decision**: Main thread for v1.

**Rationale**: mGBA renders directly into the `<canvas>` it owns (no
frame-buffer callback exists — confirmed in `src/emulator/core.ts` and
`Display.tsx`), so frame capture is inherently main-thread; the canvas can't
be `OffscreenCanvas`-transferred away from mGBA while it owns rendering. That
alone means any worker-based split still needs a main-thread capture step, so
a worker would only isolate the backward-pass compute, at the cost of
serializing frames/rewards across `postMessage` and syncing weights back for
action selection — real complexity for a network this small. mGBA's own
COOP/COEP threading (already configured in `vite.config.ts` for feature 001)
is page-level and does not conflict with an additional dedicated worker; one
is simply not needed here.

**Implementation discipline**: all TF.js tensor ops use `tf.tidy()`/explicit
`.dispose()` (the standard cause of unbounded GPU memory growth in TF.js is
leaked tensors — directly relevant to spec SC-006's 4-hour no-crash
requirement) and async tensor reads (`tensor.data()`, never `.dataSync()`) so
a training step never blocks canvas paint. `RLTrainingController` runs on its
own `setTimeout` cadence, decoupled from both React's render loop and mGBA's
internal frame loop — the same independent-cadence pattern
`src/ai/decisionLoop.ts` already uses for the Ollama controller.

**Alternatives considered**: Worker-based training via
`@tensorflow/tfjs-backend-wasm`/`cpu` backend — documented as a future
optimization only, to pursue if main-thread jank is measured in practice; not
built for v1.

## 3. Novelty/exploration reward mechanism

**Decision**: Average-hash (aHash) over a downsampled grayscale frame:
draw the source canvas into an offscreen 32×32 canvas, average-pool down to
an 8×8 grid, compute the mean, produce a 64-bit hash where `bit_i = pixel_i >=
mean`. `NoveltyMemory` is a capped `Map<hash, lastSeenStep>` (~20,000 entries,
~1MB), with FIFO eviction using `Map`'s insertion-order iteration once
capacity is exceeded.

**Rationale**: aHash tolerates the minor animation/dithering noise (sprite
blink, tile animation) that would make byte-exact frame hashing treat nearly
every frame as "novel," while still being cheap enough to compute every
decision tick. A hard capacity constant on `NoveltyMemory` directly satisfies
FR-010 (bounded memory over long sessions) without needing an eviction
policy more complex than FIFO — true LRU recency isn't required for this
purpose, since the goal is capping memory, not recency-weighting rewards.

**Reward per step**: `reward = isNew ? NOVELTY_REWARD : STEP_PENALTY` (e.g.
`+1.0` new-screen bonus vs. `-0.01` per-step penalty), so idling nets negative
reward while net exploration progress is positive. The live "novelty metric"
(spec US1 AC2, US3 AC2) is a rolling-window discovery *rate* (new hashes per
last-N steps), not just a monotonically-increasing total — so stagnation is
visible as a flattening trend, letting the user make an informed reset/stop
decision (US3 AC2).

**Alternatives considered**: Exact pixel/PNG-byte equality — rejected, far too
sensitive to animation noise, would classify almost every frame as novel and
provide no useful learning signal.

## 4. Fast-forward/frame-skip integration

**Decision**: Extend `EmulatorCore` (`src/emulator/types.ts`) with
`setTrainingSpeed(multiplier: number, frameSkip: number): void` and
`restoreNormalSpeed(): void`. `MgbaEmulatorCore` (`src/emulator/core.ts`)
implements these via the real mGBA API already confirmed present in
`node_modules/@thenick775/mgba-wasm/dist/mgba.d.ts`:
`Module.setFastForwardMultiplier(multiplier)` and
`Module.setCoreSettings({ frameSkip, rewindEnable: false,
autoSaveStateEnable: false })` (disabling rewind/auto-save-state during
training avoids overhead irrelevant to RL, since `EpisodeManager` already
tracks progress in-app).

**Rationale**: `setFastForwardMultiplier`/`setCoreSettings` are existing,
already-typed methods on the real mGBA module (no new emulator dependency).
`restoreNormalSpeed()` snapshots the pre-training core settings once (the
first time training starts) so repeated pause/resume cycles are idempotent
and don't accumulate drift, and calls `setFastForwardMultiplier(1)` plus
re-applies the snapshotted defaults. Because these are synchronous WASM calls
(not an async round trip), pausing satisfies spec SC-004 (<2s return to
manual play) trivially.

**Important distinction**: fast-forward multiplies emulated-frames-per-real-
second (spec SC-002's "≥2x effective frame throughput"); it is independent of
`RLTrainingController`'s own decision-tick `setTimeout` cadence (proposed
~100–150ms — tighter than `DecisionLoop`'s ~700ms+jitter, since local TF.js
inference is far faster than an Ollama HTTP round trip). These are two
separate throughput knobs and should not be conflated.

**Backgrounded tab (FR-014)**: listen for `document.visibilitychange`; on
`document.hidden`, call `RLTrainingController.pause()` explicitly rather than
relying on implicit `setTimeout` throttling (which could leave a training step
half-recorded); auto-resume on visibility return only if training was
actively running before backgrounding (track a `wasRunningBeforeHidden` flag).

## 5. Episode boundary

**Decision**: Dual trigger, whichever fires first ends the episode:
`EPISODE_MAX_STEPS = 1000` decision-ticks, OR `STUCK_STEP_THRESHOLD = 150`
consecutive ticks with zero new novelty hashes discovered. On boundary: push
`episodeReward` into a capped ring buffer (`REWARD_HISTORY_CAPACITY = 500`,
feeding spec US3's reward-history view), increment `episodeCount`, reset the
per-episode step counter and cumulative reward — but do **not** reset
`NoveltyMemory`, the replay buffer, or the game itself.

**Rationale**: No RAM-derived win/loss/reset signal exists (spec Assumptions:
screen-only observations). Forcing a literal game reset every episode (e.g.
via save-state reload) would disrupt the "watch it play live" UX (spec
US1/FR-002) and risk conflicting with FR-013 (training must not corrupt user
save states). Episodes here are therefore a metrics/scheduling bookkeeping
construct (driving epsilon-decay scheduling, reward-history charting, and
target-network sync cadence), not a literal `env.reset()` — a deliberate
departure from classic Atari-style episodic RL, justified by the single
continuous world with no RAM access. Only the explicit user-triggered
"Reset" (spec US1 AC5) clears `NoveltyMemory`, the replay buffer, episode
count, and reinitializes the DQN's weights.

**Alternatives considered**: Reloading a save state at episode end for a
literal reset — explicitly deferred (not built for v1) since it risks
interacting badly with FR-013 and would interrupt live viewing.

## 6. Policy persistence

**Decision**: TF.js's `indexeddb://` scheme
(`model.save('indexeddb://rl-policy-model/<id>')` /
`tf.loadLayersModel('indexeddb://rl-policy-model/<id>')`) stores model
topology + weights in TF.js's own internal IndexedDB database — a separate
namespace from the app's existing `idb-keyval` store, paired manually via a
shared `id`. New `src/storage/rlPolicies.ts` (mirroring the existing
`src/storage/saveStates.ts` CRUD pattern) stores `RLPolicyMeta` (id,
romChecksum, label, createdAt, updatedAt, episodesTrained, totalSteps) in
`idb-keyval`, alongside `saveRLPolicy`/`loadRLPolicyModel`/
`listAllRLPolicies`/`listRLPoliciesForRom`/`deleteRLPolicy` functions.
`deleteRLPolicy` must call both the `idb-keyval` delete **and**
`tf.io.removeModel('indexeddb://rl-policy-model/<id>')` — otherwise orphaned
model weights persist and worsen the storage-quota edge case in the spec.

**Rationale**: Reuses the exact metadata/list/filter/sort pattern already
proven in `saveStates.ts`, minimizing new conventions. The ROM-checksum
mismatch warning (spec FR-012) reuses the identical UX pattern
`LoadStatePanel` already implements for game save states: compare
`RLPolicyMeta.romChecksum` to `GameSession.romChecksum` before allowing
"load as inference controller" or "resume training from."

**Alternatives considered**: Storing raw model weights inside `idb-keyval`
directly — rejected; TF.js's own `indexeddb://` I/O already handles model
(de)serialization correctly and is the library's supported persistence path,
reimplementing it would be needless and risk correctness bugs.

## 7. Controller arbitration (extending GameSession)

**Decision**: Extend `GameSession.controlMode` (`src/services/gameSession.ts`)
from `'manual' | 'ai'` to `'manual' | 'ai-llm' | 'rl-training' |
'rl-inference'`, replacing the single `aiControllerProfileId: string | null`
field with a discriminated `ActiveController` union:

```ts
type ActiveController =
  | { type: 'none' }
  | { type: 'llm'; profileId: string }
  | { type: 'rl-training'; policyId: string | null } // null = fresh untitled policy
  | { type: 'rl-inference'; policyId: string };
```

`enableAiControl` is renamed `enableLlmControl`; new `startRlTraining(policyId)`
and `enableRlInference(policyId)` methods added. `takeManualControl()`
generalizes to preempt from any of the three non-manual modes (was:
`'ai'`-only).

**Rationale**: Confirmed by direct read of the current `GameSession` (feature
001): it models exactly one non-manual controller today via a single
`ai`/`aiControllerProfileId` pair. Bolting on parallel booleans
(`isTrainingActive`, `isRlInferenceActive`) for three now-mutually-exclusive
non-manual states risks drift (two booleans could both end up `true`); a
single discriminated union makes "exactly one active controller" a type-level
invariant instead of a runtime convention. `App.tsx`'s existing pattern —
stopping `decisionLoop` whenever `controlMode !== 'ai-llm'` — generalizes
directly to also stop `RLTrainingController` whenever `controlMode` isn't one
of the RL modes, preserving FR-009 (only one controller drives input) by
construction rather than by each panel needing to know about the others.

**Alternatives considered**: Parallel boolean flags per controller type —
rejected per above (drift risk, not type-safe against "more than one active").

## 8. Backend availability handling

**Decision**: `src/rl/backend.ts` exports `initTfBackend()`, which tries, in
order, inside try/catch plus `await tf.ready()`: `webgpu` (only if
`navigator.gpu` exists and `@tensorflow/tfjs-backend-webgpu` registered it) →
`webgl` (near-universal in evergreen browsers) → `cpu` (always available).
Called lazily on the first "Start Training" click (not app load), so users
who never touch RL pay no TF.js init cost. Result cached for the session.

**Rationale**: Directly satisfies FR-011: if the resolved backend is `cpu`,
surface a non-blocking message via the existing `reportError` channel
("Training will run in a slower CPU-only mode") and still allow training to
proceed — never hard-block. Hard unsupportability is only reported if TF.js
fails to initialize any backend at all, which is practically unreachable
since `cpu` always works.

**Alternatives considered**: Eagerly initializing TF.js at app load —
rejected; adds load-time cost for the majority of users who may only ever use
manual play or the Ollama controller.

## 9. File/module layout

**Decision**: New `src/rl/` directory (parallel to the existing `src/ai/`):
`types.ts`, `actionSpace.ts`, `frameProcessing.ts`, `noveltyMemory.ts`,
`replayBuffer.ts`, `dqnAgent.ts`, `rewardModel.ts`, `episodeManager.ts`,
`backend.ts`, `trainingController.ts`. New `src/storage/rlPolicies.ts`. New
`src/components/RLTrainingPanel/{RLTrainingPanel.tsx,RLMetricsView.tsx}`.
Modified: `src/emulator/types.ts`/`core.ts`, `src/services/gameSession.ts`,
`src/pages/App.tsx`, `src/components/AIControlPanel/AIControlPanel.tsx`
(rename only).

**Rationale**: Mirrors the existing `src/ai/` architectural role (a
self-contained controller-logic module plugging into `GameSession`/`App.tsx`)
so the codebase gains a second controller type via the same seams, not a
parallel structure.

## 10. New npm dependencies

**Decision**: `@tensorflow/tfjs` (umbrella package: core + layers API + WebGL
+ CPU backends bundled) for v1 simplicity, rather than hand-picking
`@tensorflow/tfjs-core`/`-layers`/`-backend-webgl`/`-backend-cpu` separately
(split out later only if bundle size becomes a measured problem). Optional,
additive `@tensorflow/tfjs-backend-webgpu` behind the fallback chain in
research item 8 — separately versioned from core/layers, historically rougher
cross-browser coverage (Firefox WebGPU lags Chrome), never treated as a hard
requirement. New devDependency `fake-indexeddb`, needed to unit/integration
test `src/storage/rlPolicies.ts` (both the `idb-keyval` metadata and TF.js's
`indexeddb://` model I/O) in jsdom, which provides no native `indexedDB`.

**Bundle-size mitigation**: TF.js (core+layers+webgl) is non-trivial (several
hundred KB min+gzip). `RLTrainingController`/`RLTrainingPanel` use a lazy
dynamic `import('@tensorflow/tfjs')` on first use; Vite code-splits dynamic
imports automatically, so users who never touch RL training pay no load-time
cost — consistent with the app's existing lean dependency footprint
(`package.json` currently has 3 runtime dependencies from feature 001: react,
react-dom, @thenick775/mgba-wasm, plus idb-keyval).

**Alternatives considered**: Hand-picking individual `@tensorflow/tfjs-*`
sub-packages upfront — deferred; adds complexity with no proven benefit until
bundle size is actually measured as a problem.

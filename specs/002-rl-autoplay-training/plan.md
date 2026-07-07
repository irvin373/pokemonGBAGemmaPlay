# Implementation Plan: In-Browser RL Autoplay Training

**Branch**: `002-rl-autoplay-training` | **Date**: 2026-07-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-rl-autoplay-training/spec.md`

## Summary

Add a third AI controller type to the existing browser GBA emulator: an
in-browser reinforcement-learning agent (small-CNN DQN, TensorFlow.js) that
trains live from downsampled screen frames while the emulator runs at
accelerated speed, rewarded by screen-novelty (no RAM access is available in
the browser WASM core). The user can start/pause/resume/reset training,
watch live episode/reward/novelty metrics, save/load named policies locally,
and run a saved policy in normal-speed inference mode — mutually exclusive
with manual control and the existing Ollama LLM controller.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19 (unchanged from feature 001)

**Primary Dependencies**: `@tensorflow/tfjs` (umbrella: core + layers +
WebGL/CPU backends), optional `@tensorflow/tfjs-backend-webgpu`; existing
`idb-keyval` (policy metadata, paired with TF.js's own `indexeddb://` model
storage); existing `@thenick775/mgba-wasm` (reused via new `EmulatorCore`
methods, no new emulator dependency)

**Storage**: Browser IndexedDB via two namespaces — the app's existing
`idb-keyval` store (policy metadata: id, romChecksum, label, timestamps,
episodesTrained, totalSteps) and TF.js's own `indexeddb://rl-policy-model/<id>`
namespace (model topology + weights), joined by `id`

**Testing**: Vitest + React Testing Library (unchanged); new devDependency
`fake-indexeddb` (jsdom has no native IndexedDB — needed to test the new
policy-storage layer, including TF.js's `indexeddb://` I/O); Playwright e2e
gated the same way as feature 001 (env-var-gated, no ROM in CI)

**Target Platform**: Same as feature 001 — modern desktop browser, WASM +
Canvas + IndexedDB, single local machine. RL training additionally needs
WebGL (near-universal) or ideally WebGPU; falls back to CPU-only TF.js
backend, never hard-blocked

**Project Type**: Single-page web application (frontend-only, unchanged)

**Performance Goals**: Training steps must not block canvas paint (`tf.tidy()`
/ `.dispose()` discipline, async `.data()` never `.dataSync()`); training runs
the emulator at ≥2x effective frame throughput via fast-forward + frame skip;
a 4-hour continuous session must not grow memory unboundedly (fixed-capacity
replay buffer and novelty-hash map, both hard-capped constants)

**Constraints**: Same single-local-user, fully client-side, no-backend model
as feature 001; RL training and inference must coexist with — and be mutually
exclusive with — the existing manual and Ollama-LLM controllers (only one
drives input at a time); training must never corrupt user game save states

**Scale/Scope**: Single local user, one active training session or inference
controller at a time, a handful of saved RL policies (tens, not thousands)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template (same state
as when feature 001 was planned) — no ratified principles exist to evaluate
against.

**Gate result**: PASS (vacuously — nothing to violate). Same recommendation
as feature 001: run `/speckit-constitution` to ratify code-quality/testing/
UX-consistency/performance principles before they're needed to arbitrate a
real disagreement.

## Project Structure

### Documentation (this feature)

```text
specs/002-rl-autoplay-training/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── rl/                          # NEW — RL-specific logic, parallel to src/ai/
│   ├── types.ts                  # Transition, EpisodeStats, RLPolicyConfig
│   ├── actionSpace.ts            # curated RL_ACTIONS: GbaButton[] + index<->button helpers
│   ├── frameProcessing.ts        # captureDownsampledFrame(core) + computeAverageHash(pixels,w,h)
│   ├── noveltyMemory.ts          # NoveltyMemory: capped Map<hash,int>, FIFO eviction
│   ├── replayBuffer.ts           # ReplayBuffer: fixed-capacity circular array
│   ├── dqnAgent.ts               # DqnAgent: online+target tf.LayersModel, selectAction/trainStep
│   ├── rewardModel.ts            # computeReward(isNew) + constants
│   ├── episodeManager.ts         # EpisodeManager: episode boundary + reward history
│   ├── backend.ts                # initTfBackend(): webgpu -> webgl -> cpu fallback chain
│   └── trainingController.ts     # RLTrainingController: DecisionLoop-analogous orchestrator
├── storage/
│   ├── saveStates.ts              # existing (feature 001)
│   └── rlPolicies.ts              # NEW — RL policy CRUD (idb-keyval meta + tf.io indexeddb://)
├── services/
│   └── gameSession.ts             # MODIFIED — ControlMode/ActiveController extended (see below)
├── emulator/
│   ├── types.ts                   # MODIFIED — + setTrainingSpeed/restoreNormalSpeed
│   └── core.ts                    # MODIFIED — implements the two new methods via mGBA API
├── components/
│   ├── AIControlPanel/            # MODIFIED — 'ai' -> 'ai-llm' rename only
│   └── RLTrainingPanel/           # NEW
│       ├── RLTrainingPanel.tsx     # start/pause/resume/reset, policy save/load/select
│       └── RLMetricsView.tsx       # live episode/reward/novelty + reward-history sparkline
└── pages/
    └── App.tsx                    # MODIFIED — wire RLTrainingController + RLTrainingPanel

tests/
├── unit/                          # + noveltyMemory, replayBuffer, episodeManager, rewardModel,
│                                    frameProcessing (hash determinism), trainingController
│                                    (fake-timer, mirrors decisionLoop.test.ts)
├── integration/                   # + gameSession (mutual-exclusion across 4 control modes),
│                                    rlPolicies (save/list/load/delete round-trip, fake-indexeddb)
└── e2e/                           # + rl-training.spec.ts (env-var gated, same pattern as
                                     gba-emulator.spec.ts)
```

**Structure Decision**: Same single-project frontend-only layout as feature
001 (no `backend/`). New `src/rl/` directory parallels the existing `src/ai/`
directory (LLM controller) — same architectural role, different controller
type, both plugging into `GameSession` and `App.tsx` the same way.

## Complexity Tracking

> Constitution has no ratified gates yet (see Constitution Check), so there
> are no violations to justify. No entries.

**Note**: this feature *does* introduce a breaking change to an existing
contract (`GameSession.ControlMode`/`AIControllerProfileId` from feature 001
— `'ai'` renames to `'ai-llm'`, single profile-id field becomes a
discriminated `ActiveController` union). This is a deliberate extension to
support 3 mutually-exclusive non-manual modes cleanly rather than 2 parallel
booleans bolted on; documented in `data-model.md` and
`contracts/game-session-control-mode.md`, and `src/components/AIControlPanel/
AIControlPanel.tsx` is updated in the same change so feature 001 keeps
working.

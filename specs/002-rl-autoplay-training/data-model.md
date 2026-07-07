# Phase 1 Data Model: In-Browser RL Autoplay Training

## Training Session

In-memory only, owned by `RLTrainingController` (`src/rl/trainingController.ts`).
Not persisted — a fresh training session's live counters start at zero each
time the app loads (persisted policy weights are a separate concept, see
**RL Policy** below).

| Field | Type | Notes |
|---|---|---|
| `status` | `"stopped" \| "running" \| "paused"` | Drives UI start/pause/resume/reset affordances (FR-002) |
| `episodeCount` | number | Incremented at each episode boundary (research.md #5) |
| `episodeReward` | number | Cumulative reward for the *current* episode; resets to 0 at episode boundary |
| `rewardHistory` | number[] (capped ring buffer, `REWARD_HISTORY_CAPACITY = 500`) | Completed-episode rewards, most recent last; feeds US3's reward-history view |
| `totalSteps` | number | Lifetime decision-ticks since last full Reset; persisted into `RLPolicy.totalSteps` on save |
| `noveltyDiscoveryRate` | number (0..1) | Rolling-window fraction of recent ticks that discovered a new novelty hash; feeds the live "exploration metric" (FR-005) and stagnation visibility (US3 AC2) |
| `noveltyRateHistory` | number[] (capped, `NOVELTY_RATE_HISTORY_CAPACITY = 500`) | `noveltyDiscoveryRate` sampled at each episode boundary, most recent last; feeds US3's novelty-trend view (a flattening line signals stagnation) |

**Transitions**:
- `stopped -> running`: user starts training (FR-002). Triggers
  `core.setTrainingSpeed(...)` (research.md #4) and `initTfBackend()`
  (research.md #8) on first start.
- `running -> paused`: user pauses, OR tab becomes hidden
  (`document.visibilitychange`, research.md #4/FR-014). Triggers
  `core.restoreNormalSpeed()`.
- `paused -> running`: user resumes, OR tab becomes visible again AND training
  was running before hiding (`wasRunningBeforeHidden` flag).
- `running|paused -> stopped` (Reset): clears `episodeCount`, `episodeReward`,
  `rewardHistory`, `totalSteps`, `noveltyDiscoveryRate`, the `NoveltyMemory`
  contents, the `ReplayBuffer` contents, and reinitializes `DqnAgent`'s
  weights (FR-002/US1 AC5). Does **not** touch the game itself or any saved
  `RLPolicy`.

## RL Policy

Persisted across two storage namespaces, joined by `id` (research.md #6):
metadata in the app's existing `idb-keyval` store (mirrors `SaveState`'s
pattern in `src/storage/saveStates.ts`); model topology + weights in TF.js's
own `indexeddb://rl-policy-model/<id>` namespace via `model.save()`/
`tf.loadLayersModel()`.

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | Primary key, also used as the TF.js `indexeddb://rl-policy-model/<id>` path segment |
| `romChecksum` | string | Same SHA-256 convention as `SaveState.romChecksum` (feature 001) — enables the mismatch warning (FR-012) |
| `label` | string | User-assigned name |
| `createdAt` | ISO datetime string | Set once, on first save |
| `updatedAt` | ISO datetime string | Set on every subsequent save (e.g. after resuming training and re-saving) |
| `episodesTrained` | number | Snapshot of `TrainingSession.episodeCount` at save time |
| `totalSteps` | number | Snapshot of `TrainingSession.totalSteps` at save time |

**Validation rules**:
- `label` required, non-empty.
- Loading a policy (for inference or to resume training) whose `romChecksum`
  differs from the active `GameSession.romChecksum` MUST surface a warning
  before proceeding — identical rule to `SaveState` (feature 001).
- Deleting a policy MUST remove both the `idb-keyval` metadata entry AND the
  TF.js `indexeddb://rl-policy-model/<id>` model artifacts (research.md #6) —
  a partial delete (metadata only) is a defect, not an acceptable partial
  state.

## Novelty Memory

In-memory only, owned by `RLTrainingController` via `src/rl/noveltyMemory.ts`.
Not persisted (loading a saved `RLPolicy` restores trained weights, not
novelty-memory contents — resuming training from a saved policy starts
novelty tracking fresh, since the point of novelty memory is *this session's*
exploration bookkeeping, not a portable record of "screens ever seen").

| Field | Type | Notes |
|---|---|---|
| (internal) `seen` | `Map<string, number>` (hash -> last-seen step), capped at `NOVELTY_MEMORY_CAPACITY = 20_000` | FIFO eviction via `Map` insertion order once capacity exceeded (research.md #3) |

**Operations**: `observe(hash): { isNew: boolean; uniqueCount: number }`,
`reset()` (called only by the user-triggered Training Session Reset, never by
an episode boundary — research.md #5).

## AI Controller Selection (extends feature 001's `GameSession`)

Replaces feature 001's `controlMode: 'manual' | 'ai'` +
`aiControllerProfileId: string | null` with:

```ts
type ControlMode = 'manual' | 'ai-llm' | 'rl-training' | 'rl-inference';

type ActiveController =
  | { type: 'none' }
  | { type: 'llm'; profileId: string }
  | { type: 'rl-training'; policyId: string | null } // null = fresh untitled policy
  | { type: 'rl-inference'; policyId: string };
```

**Validation rules**:
- Exactly one of `{'manual'} ∪ ActiveController` drives input at any time
  (FR-009) — enforced by construction: `GameSession` exposes
  `takeManualControl()`, `enableLlmControl(profileId)`,
  `startRlTraining(policyId)`, `enableRlInference(policyId)`, each of which
  fully replaces `controlMode`/`activeController` rather than layering state.
- `takeManualControl()` is a no-op if already `'manual'`; otherwise it
  transitions to `'manual'` and the caller (`App.tsx`) is responsible for
  stopping whichever loop (`DecisionLoop` or `RLTrainingController`) was
  driving the prior mode — same pattern feature 001 already uses for the LLM
  controller.

## Relationships

```text
RLPolicy 0..* --- 1 romChecksum            (same convention as SaveState, feature 001)
TrainingSession 1 --- 1 NoveltyMemory       (owned, in-memory, per app session)
TrainingSession 1 --- 1 DqnAgent            (owned; DqnAgent's weights ARE what gets
                                              persisted into an RLPolicy on save)
GameSession 1 --- 0..1 ActiveController     (exactly one active at a time, or 'none')
ActiveController{type:'rl-training'|'rl-inference'} --- 0..1 RLPolicy  (via policyId)
```

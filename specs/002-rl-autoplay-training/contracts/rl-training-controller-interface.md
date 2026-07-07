# Contract: RLTrainingController (`src/rl/trainingController.ts`)

Internal interface between the React UI layer (`RLTrainingPanel`) and the RL
training/inference orchestrator. Mirrors how `src/ai/decisionLoop.ts`'s
`DecisionLoop` is consumed by `AIControlPanel`/`App.tsx` for the existing LLM
controller (independent `setTimeout` cadence, start/stop lifecycle,
callback-based reporting — no polling from the UI side).

```ts
interface TrainingMetrics {
  status: 'stopped' | 'running' | 'paused';
  episodeCount: number;
  episodeReward: number;
  rewardHistory: number[]; // capped, most recent last
  totalSteps: number;
  noveltyDiscoveryRate: number; // 0..1, rolling window
}

class RLTrainingController {
  constructor(
    core: EmulatorCore,
    onMetrics: (metrics: TrainingMetrics) => void,
    onError: (message: string) => void,
  );

  /** Begins training (or resumes from an existing DqnAgent if one is loaded).
   *  Calls core.setTrainingSpeed(...) and initTfBackend() on first invocation. */
  start(): void;

  /** Stops the decision loop and calls core.restoreNormalSpeed(); training
   *  state (episode count, reward history, replay buffer, weights) is preserved. */
  pause(): void;

  /** Resumes a paused session exactly where it left off. */
  resume(): void;

  /** Clears episode count, reward history, replay buffer, novelty memory,
   *  and reinitializes the DqnAgent's weights (FR-002/US1 AC5). Does not
   *  touch the game itself or any saved RLPolicy. */
  reset(): void;

  /** Switches from training mode to inference-only mode using the given
   *  (already-loaded) DqnAgent weights — no replay/training, normal speed,
   *  used when the user selects a saved policy as the active controller
   *  (US2 AC3). */
  runInference(agent: DqnAgent): void;

  /** Returns the current DqnAgent so its weights can be persisted via
   *  src/storage/rlPolicies.ts (FR-006). */
  getAgent(): DqnAgent;

  /** Injects an already-loaded agent (e.g. a saved policy loaded via
   *  src/storage/rlPolicies.ts) so a subsequent start() resumes training it
   *  instead of creating a fresh one (US2 AC4). Only valid while stopped. */
  useAgent(agent: DqnAgent): void;
}
```

**Contract rules**:
- Exactly one training tick is in flight at a time; `start()`/`resume()` are
  no-ops if already running (matches `DecisionLoop.start()`'s idempotency).
- Every tick, regardless of outcome, MUST invoke `onMetrics` with the current
  `TrainingMetrics` snapshot — the UI never polls or derives these itself
  (same "push, don't poll" pattern as `DecisionLoop.onMessage`).
- On `document.visibilitychange` making the tab hidden while `status ===
  'running'`, the controller MUST call its own `pause()` path (not merely let
  `setTimeout` throttle), and MUST remember to auto-`resume()` on visibility
  return only if it was actively running before hiding (FR-014).
- `pause()`/`restoreNormalSpeed()` MUST complete synchronously enough that the
  UI can treat "paused" as immediately safe for manual input (SC-004).
- Any error from `initTfBackend()`, TF.js tensor operations, or the underlying
  `EmulatorCore` MUST route through `onError`, never throw uncaught into the
  render loop or silently stop training without telling the user (mirrors
  `DecisionLoop`'s `OllamaUnreachableError` handling for FR-013's sibling
  requirement, FR-011, for RL).
- `runInference()` MUST NOT allocate or grow a replay buffer, and MUST call
  `core.restoreNormalSpeed()` (or never have called `setTrainingSpeed` at
  all) — inference always runs at normal game speed (spec US2 AC3, FR-008).

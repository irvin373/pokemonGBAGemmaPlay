# Contract: GameSession Control Mode Extension

**Breaking change to feature 001's `src/services/gameSession.ts`.** Existing
consumers (`src/components/AIControlPanel/AIControlPanel.tsx`, `src/pages/App.tsx`)
MUST be updated in the same change that introduces this extension — this is
not additive-only.

## Before (feature 001)

```ts
type ControlMode = 'manual' | 'ai';

interface GameSessionState {
  // ...
  controlMode: ControlMode;
  aiControllerProfileId: string | null;
}

// GameSession methods: enableAiControl(profileId), takeManualControl(), ...
```

## After (feature 002)

```ts
type ControlMode = 'manual' | 'ai-llm' | 'rl-training' | 'rl-inference';

type ActiveController =
  | { type: 'none' }
  | { type: 'llm'; profileId: string }
  | { type: 'rl-training'; policyId: string | null }
  | { type: 'rl-inference'; policyId: string };

interface GameSessionState {
  // ...
  controlMode: ControlMode;
  activeController: ActiveController; // replaces aiControllerProfileId
}

// GameSession methods:
//   enableLlmControl(profileId)     // renamed from enableAiControl
//   startRlTraining(policyId)       // new
//   enableRlInference(policyId)     // new
//   takeManualControl()             // generalized: preempts any of the 3 non-manual modes
```

**Migration notes for existing feature-001 code**:
- `AIControlPanel.tsx`: its `onEnable` callback currently calls
  `session.enableAiControl(profile.id)` — update to `enableLlmControl`.
- Anywhere `state.controlMode === 'ai'` is checked (e.g. `App.tsx`'s effect
  stopping `decisionLoop` when not in AI mode) — update to `'ai-llm'`.
- Anywhere `state.aiControllerProfileId` is read — read
  `state.activeController` and narrow on `type === 'llm'` instead.

**Contract rules**:
- At most one of `{'ai-llm', 'rl-training', 'rl-inference'}` is ever active;
  `'manual'` means `activeController.type === 'none'`. This is a type-level
  invariant (a single discriminated field), not a runtime convention to
  maintain across multiple booleans (FR-009).
- `takeManualControl()` transitions `controlMode` to `'manual'` and
  `activeController` to `{ type: 'none' }` from any of the three non-manual
  modes; it is a no-op if already manual. The caller (`App.tsx`) remains
  responsible for stopping whichever loop (`DecisionLoop` or
  `RLTrainingController`) was active — `GameSession` only tracks state, it
  does not own the loops (unchanged ownership model from feature 001).
- `enableLlmControl`, `startRlTraining`, and `enableRlInference` all require
  `status === 'running'` (a ROM must be loaded) — same guard
  `enableAiControl` already had.
- `romLoaded()` and `reportError()` continue to force `controlMode` back to
  `'manual'` / `activeController: { type: 'none' }` on a fresh ROM load or any
  reported error, unchanged from feature 001's behavior for the old `'ai'`
  mode.

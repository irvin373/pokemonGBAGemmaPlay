---

description: "Task list for In-Browser RL Autoplay Training"
---

# Tasks: In-Browser RL Autoplay Training

**Input**: Design documents from `/specs/002-rl-autoplay-training/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Not explicitly requested in spec.md; per-story test tasks are omitted.
Test tooling (fake-indexeddb for the new IndexedDB-backed storage) is set up in
Setup, and validation tests are added in the final Polish phase, following the
same convention as feature 001.

**Organization**: Tasks are grouped by user story (spec.md priorities P1/P2/P3) to
enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- File paths follow plan.md's Project Structure

## Path Conventions

Single project (per plan.md, unchanged from feature 001): `src/`, `tests/` at
repository root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and scaffolding for the RL feature

- [X] T001 Add `@tensorflow/tfjs`, `@tensorflow/tfjs-backend-webgpu`, and devDependency `fake-indexeddb` to package.json; run `npm install`
- [X] T002 [P] Create `src/rl/` and `src/components/RLTrainingPanel/` directory structure per plan.md Project Structure (depends on T001)
- [X] T003 [P] Configure the `fake-indexeddb` polyfill in tests/setup.ts so IndexedDB-backed storage (idb-keyval + TF.js `indexeddb://`) is testable in jsdom (depends on T001)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Define shared RL types (`Transition`, `EpisodeStats`, `RLPolicyConfig`) in src/rl/types.ts (depends on T002)
- [X] T005 Define curated action space (`RL_ACTIONS: GbaButton[]`, index<->button helpers — movement + A/B, excluding START/SELECT/L/R per research.md #1) in src/rl/actionSpace.ts (depends on T004)
- [X] T006 Extend `EmulatorCore` interface with `setTrainingSpeed(multiplier, frameSkip)`/`restoreNormalSpeed()` in src/emulator/types.ts per contracts/emulator-core-extension.md (depends on T001)
- [X] T007 Implement `setTrainingSpeed`/`restoreNormalSpeed` in `MgbaEmulatorCore` — via mGBA's `setFastForwardMultiplier`/`setCoreSettings`, snapshotting pre-training settings once for idempotent pause/resume — in src/emulator/core.ts (depends on T006)
- [X] T008 Extend `GameSession`: `ControlMode` -> `'manual'|'ai-llm'|'rl-training'|'rl-inference'`, replace `aiControllerProfileId` with discriminated `ActiveController`, rename `enableAiControl`->`enableLlmControl`, generalize `takeManualControl()`, add `startRlTraining(policyId)`/`enableRlInference(policyId)` in src/services/gameSession.ts per contracts/game-session-control-mode.md (depends on T004)
- [X] T009 Update existing feature-001 consumers for the breaking rename: `App.tsx`'s `controlMode === 'ai'` checks and `enableAiControl` call become `'ai-llm'`/`enableLlmControl` (AIControlPanel.tsx itself needed no change — it is props-driven and never referenced the old names directly) in src/pages/App.tsx (depends on T008)
- [X] T010 [P] Implement `initTfBackend()` — webgpu -> webgl -> cpu fallback chain behind try/catch + `tf.ready()`, called lazily on first use — in src/rl/backend.ts (depends on T001)

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 - Train an RL agent by watching it play (Priority: P1) 🎯 MVP

**Goal**: User starts RL training on a loaded ROM, watches the agent play
autonomously at accelerated speed with live episode/reward/novelty metrics,
and can pause (instant manual control), resume, or reset at any time.

**Independent Test**: Start training on a loaded ROM, observe autonomous
input at accelerated speed, watch metrics update, pause (confirm manual
control), resume (confirm continuity), reset (confirm zeroed metrics).

### Implementation for User Story 1

- [X] T011 [P] [US1] Implement `captureDownsampledFrame(core)` + `computeAverageHash(pixels, w, h)` (aHash over 32x32->8x8 grayscale, research.md #3) in src/rl/frameProcessing.ts (depends on T007)
- [X] T012 [P] [US1] Implement `NoveltyMemory` (capped `Map<hash,int>`, FIFO eviction, `observe()`/`reset()`) in src/rl/noveltyMemory.ts (depends on T004)
- [X] T013 [P] [US1] Implement `ReplayBuffer` (fixed-capacity circular array, `push()`/`sampleBatch()`) in src/rl/replayBuffer.ts (depends on T004)
- [X] T014 [P] [US1] Implement `computeReward(isNew)` + reward constants (novelty bonus vs. step penalty, research.md #3) in src/rl/rewardModel.ts (depends on T004)
- [X] T015 [US1] Implement `DqnAgent` — online+target `tf.LayersModel` (conv/conv/dense per research.md #1), `selectAction`, `trainStep`, `updateTargetNetwork` (as `syncTargetWeights`), `getEpsilon`, model save/load passthrough (`getModel`/`loadFrom`) — in src/rl/dqnAgent.ts (depends on T005, T010)
- [X] T016 [US1] Implement `EpisodeManager` — episode boundary at `EPISODE_MAX_STEPS` OR `STUCK_STEP_THRESHOLD` novelty stagnation (research.md #5), capped reward-history ring buffer — in src/rl/episodeManager.ts (depends on T014)
- [X] T017 [US1] Implement `RLTrainingController` — independent decision-tick loop, `start`/`pause`/`resume`/`reset`, `onMetrics`/`onError` callbacks, `document.visibilitychange` auto-pause (FR-014) — in src/rl/trainingController.ts per contracts/rl-training-controller-interface.md (depends on T011, T012, T013, T015, T016, T007)
- [X] T018 [P] [US1] Build `RLTrainingPanel` (start/pause/resume/reset controls) in src/components/RLTrainingPanel/RLTrainingPanel.tsx (depends on T017)
- [X] T019 [P] [US1] Build `RLMetricsView` showing live episode count, current-episode reward, and novelty discovery rate (FR-005) in src/components/RLTrainingPanel/RLMetricsView.tsx (depends on T017)
- [X] T020 [US1] Wire `RLTrainingController`/`RLTrainingPanel`/`RLMetricsView` into `App.tsx` (pause controller whenever `controlMode` leaves `rl-training`/`rl-inference` — pause preserves progress, unlike decisionLoop.stop()); guard `SaveStatePanel`/`LoadStatePanel` while an RL mode is active (FR-013) in src/pages/App.tsx (depends on T008, T009, T017, T018, T019)

**Checkpoint**: User Story 1 is fully functional and testable independently

---

## Phase 4: User Story 2 - Save a trained policy and run it as an autoplay controller (Priority: P2)

**Goal**: User saves the current policy under a name, and later selects a
saved policy as the active AI controller (alongside the existing LLM
controller) to watch it play at normal speed, or resumes training from it.

**Independent Test**: Train briefly, save the policy, reload the tab, select
the saved policy as controller, enable it, confirm normal-speed autoplay with
instant manual override.

### Implementation for User Story 2

- [X] T021 [P] [US2] Implement RL policy CRUD — `idb-keyval` metadata (`RLPolicyMeta`) paired with TF.js `indexeddb://rl-policy-model/<id>` weights, `deleteRLPolicy` removing both — in src/storage/rlPolicies.ts per contracts/rl-policy-storage.md (depends on T001)
- [X] T022 [US2] Implement `RLTrainingController.runInference(agent)` — normal speed, no replay-buffer growth (FR-008) — in src/rl/trainingController.ts (depends on T017) (implemented alongside T017; also added `useAgent()` to support resuming training from a loaded policy, US2 AC4)
- [X] T023 [US2] Add "Save Policy" action (label input, calls `controller.getAgent()` + storage/rlPolicies.ts) to src/components/RLTrainingPanel/RLTrainingPanel.tsx (depends on T021, T017)
- [X] T024 [US2] Build `RLPolicyLibrary` (saved-policy list, "Run as Controller"/"Resume Training" actions, romChecksum-mismatch warning mirroring `LoadStatePanel`, FR-012) in src/components/RLTrainingPanel/RLPolicyLibrary.tsx (depends on T021)
- [X] T025 [US2] Wire `RLPolicyLibrary` into `App.tsx` — `session.enableRlInference(policyId)`/`startRlTraining(policyId)` + `controller.runInference()` — in src/pages/App.tsx (depends on T022, T024, T020)

**Checkpoint**: User Stories 1 AND 2 both work independently

---

## Phase 5: User Story 3 - Understand and steer what the agent is learning (Priority: P3)

**Goal**: User can see a rolling reward-per-episode history and a novelty
trend to judge whether training is progressing or has stagnated.

**Independent Test**: During active training, open the progress view and
confirm reward history and a novelty trend are visible and update as
episodes complete.

### Implementation for User Story 3

- [X] T026 [US3] Extend `RLMetricsView` to render the capped reward-history (T016's ring buffer) as a sparkline and the novelty discovery rate as a visible trend (stagnation flattens, US3 AC2) in src/components/RLTrainingPanel/RLMetricsView.tsx (depends on T019, T016) (added `noveltyRateHistory` to `TrainingMetrics`, sampled per episode boundary, to make the trend renderable)

**Checkpoint**: All user stories are independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation and cross-story hardening

- [X] T027 [P] Add unit tests for `noveltyMemory`, `replayBuffer`, `episodeManager`, `rewardModel`, and `frameProcessing` (hash determinism on raw pixel arrays) in tests/unit/
- [X] T028 [P] Add unit test for `RLTrainingController` (fake-timer, mirrors tests/unit/decisionLoop.test.ts: start/pause/resume/reset, `setTrainingSpeed`/`restoreNormalSpeed` call points, visibility-hidden auto-pause) in tests/unit/trainingController.test.ts
- [X] T029 [P] Add integration test for `GameSession` mutual-exclusion across `manual`/`ai-llm`/`rl-training`/`rl-inference` (FR-009) in tests/integration/gameSession.test.ts
- [X] T030 [P] Add integration test for `rlPolicies` save/list/load/delete round-trip using `fake-indexeddb` in tests/integration/rlPolicies.test.ts (uses the real `@tensorflow/tfjs` package with the `cpu` backend against a tiny model — exercises the actual `indexeddb://` I/O, not a mock)
- [X] T031 [P] Add Playwright e2e test covering quickstart.md RL scenarios (env-var gated, no ROM in CI, mirrors tests/e2e/gba-emulator.spec.ts) in tests/e2e/rl-training.spec.ts
- [ ] T032 Run quickstart.md validation end-to-end manually — BLOCKED: requires a user-supplied, legally-owned FireRed ROM and a WebGL/WebGPU-capable browser, neither available in this environment. Smoke-tested what's possible without a ROM (see notes).
- [ ] T033 4-hour continuous-training soak test verifying bounded memory (SC-006) — BLOCKED: same reason as T032; also requires hours of wall-clock observation.

**Notes on T032/T033**: with `npm run dev`, the app boots with no console errors and the RL panel correctly stays hidden until a ROM is loaded (untestable further without a ROM). `npm run build` succeeds and confirms TF.js is code-split into its own lazy-loaded chunk (not part of the main bundle), consistent with the lazy dynamic-import design in research.md #10. The ROM-dependent parts of quickstart.md (actually starting training, watching live metrics, the 4-hour soak, save/load-as-controller round trip) still need to be run by a user with a real ROM and a GPU-capable browser.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
  Note T008/T009 are a breaking change shared with feature 001's existing
  Ollama controller; they must land together.
- **User Stories (Phase 3-5)**: All depend on Foundational; `App.tsx`
  composition tasks (T020, T025) touch the same file sequentially
- **Polish (Phase 6)**: Depends on all three user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependency on other stories
- **User Story 2 (P2)**: Depends on US1's `RLTrainingController`/`RLTrainingPanel`
  existing (T017, T020) to extend rather than replace
- **User Story 3 (P3)**: Depends on US1's `RLMetricsView`/`EpisodeManager`
  (T016, T019) existing to extend

### Parallel Opportunities

- T002, T003 in parallel after T001
- T010 in parallel with T004-T009 (independent of the GameSession/EmulatorCore changes)
- T011, T012, T013, T014 in parallel (independent files, Foundational-only dependencies)
- T018, T019 in parallel (Panel vs. MetricsView, both depend only on T017)
- T027, T028, T029, T030, T031 in parallel in Polish phase

---

## Parallel Example: User Story 1

```bash
Task: "Implement NoveltyMemory in src/rl/noveltyMemory.ts"
Task: "Implement ReplayBuffer in src/rl/replayBuffer.ts"
Task: "Implement computeReward in src/rl/rewardModel.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (includes the feature-001-breaking
   `GameSession` rename — validate feature 001's Ollama controller still
   works before moving on)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: manually run quickstart.md Scenario 1
5. Demo if ready

### Incremental Delivery

1. Setup + Foundational -> foundation ready (and feature 001 still works)
2. User Story 1 -> validate train/pause/resume/reset -> demo (MVP)
3. User Story 2 -> validate save/load/inference -> demo
4. User Story 3 -> validate reward history/novelty trend -> demo
5. Polish phase -> full test suite, quickstart.md, soak test

---

## Notes

- [P] tasks touch different files with no unmet dependency
- `App.tsx` composition tasks (T020, T025) are the main serialization point
  across stories since they share one file, same pattern as feature 001
- T008/T009 (the `GameSession` breaking rename) is the highest-risk task set —
  verify feature 001's existing Ollama controller (`AIControlPanel`, manual
  preemption) still passes its existing tests before starting User Story 1
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently

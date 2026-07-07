---

description: "Task list for Browser GBA Emulator for Pokemon FireRed"
---

# Tasks: Browser GBA Emulator for Pokemon FireRed

**Input**: Design documents from `/specs/001-browser-gba-emulator/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Not explicitly requested in spec.md; per-story test tasks are omitted. Test
tooling chosen in plan.md (Vitest, React Testing Library, Playwright) is set up in
Setup, and validation tests are added in the final Polish phase.

**Organization**: Tasks are grouped by user story (spec.md priorities P1/P2/P3) to
enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- File paths follow plan.md's Project Structure (single-project frontend layout)

## Path Conventions

Single project (per plan.md): `src/`, `tests/` at repository root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create project structure per plan.md (src/components, src/emulator, src/ai, src/storage, src/pages, src/services, tests/unit, tests/integration, tests/e2e)
- [X] T002 Initialize React 19 + TypeScript 5.x project (Vite) with `mgba-wasm` and `idb-keyval` dependencies in package.json (depends on T001)
- [X] T003 [P] Configure ESLint + Prettier for TypeScript/React in .eslintrc and .prettierrc (depends on T002)
- [X] T004 [P] Configure Vitest + React Testing Library in vitest.config.ts (depends on T002)
- [X] T005 [P] Configure Playwright e2e runner in playwright.config.ts (depends on T002)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T006 Define `GbaButton` union type and `EmulatorCore` interface shape per contracts/emulator-core-interface.md in src/emulator/types.ts (depends on T002)
- [X] T007 Implement `EmulatorCore` wrapper around `mgba-wasm` (loadRom, attach, pressButton/releaseButton, saveState/loadState, captureFrameAsPngBase64) in src/emulator/core.ts (depends on T006)
- [X] T008 [P] Implement keyboard-to-`GbaButton` mapping in src/emulator/keyboard.ts (depends on T006)
- [X] T009 Implement `GameSession` service — idle/running/error state machine, romChecksum, controlMode per data-model.md in src/services/gameSession.ts (depends on T007)
- [X] T010 [P] Implement shared error-surfacing helper (FR-013/FR-014 user-facing error messages) in src/lib/errors.ts (depends on T002)

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 - Play FireRed in the browser (Priority: P1) 🎯 MVP

**Goal**: User selects a FireRed ROM, sees it render on a 2D display, and controls
it via keyboard or on-screen buttons.

**Independent Test**: Load a FireRed ROM file, confirm the title screen renders,
and complete the opening sequence using only manual controls.

### Implementation for User Story 1

- [X] T011 [P] [US1] Build `Display` component rendering the emulator's live canvas output (`EmulatorCore.attach`) in src/components/Display/Display.tsx (depends on T007)
- [X] T012 [P] [US1] Build `Controller` component (on-screen GBA button pad calling pressButton/releaseButton) in src/components/Controller/Controller.tsx (depends on T007)
- [X] T013 [US1] Implement `useKeyboardControls` hook wiring keyboard.ts mapping into EmulatorCore input in src/components/Controller/useKeyboardControls.ts (depends on T008)
- [X] T014 [US1] Build `RomLoader` component (file picker, `loadRom` call, FR-014 invalid-ROM error via GameSession.status) in src/components/RomLoader/RomLoader.tsx (depends on T009, T010)
- [X] T015 [US1] Compose `App.tsx` wiring RomLoader, Display, Controller, and GameSession together in src/pages/App.tsx (depends on T011, T012, T013, T014)

**Checkpoint**: User Story 1 is fully functional and testable independently

---

## Phase 4: User Story 2 - Save and resume progress (Priority: P2)

**Goal**: User can save the full emulator state and later resume from exactly
that point, across multiple named save states per ROM.

**Independent Test**: Play to a distinct state, save, reload the app, load the
save, and confirm the game resumes identically.

### Implementation for User Story 2

- [X] T016 [P] [US2] Implement `SaveState` CRUD over IndexedDB (`idb-keyval`), keyed by id + romChecksum, per data-model.md in src/storage/saveStates.ts
- [X] T017 [US2] Implement "Save State" action (label input, calls `EmulatorCore.saveState()` + storage/saveStates.ts) in src/components/SaveLoadPanel/SaveStatePanel.tsx (depends on T016, T007)
- [X] T018 [US2] Implement "Load State" list + load flow (calls `EmulatorCore.loadState()`, surfaces romChecksum-mismatch warning per spec.md edge case) in src/components/SaveLoadPanel/LoadStatePanel.tsx (depends on T016, T009)
- [X] T019 [US2] Wire `SaveStatePanel`/`LoadStatePanel` into `App.tsx` in src/pages/App.tsx (depends on T017, T018, T015)

**Checkpoint**: User Stories 1 AND 2 both work independently

---

## Phase 5: User Story 3 - Let an AI play autonomously (Priority: P3)

**Goal**: User selects an Ollama-served Gemma model, enables fully autonomous
autoplay, tunes a human↔robotic style dial, and can reclaim manual control
instantly; unreachable AI backend surfaces a clear error.

**Independent Test**: Enable autoplay, observe continuous valid inputs, adjust
the style dial and observe a behavior change, reclaim manual control with one
action, and confirm a clear error when Ollama is stopped.

### Implementation for User Story 3

- [X] T020 [P] [US3] Implement Ollama client (`GET /api/tags`, `POST /api/generate`) per contracts/ollama-api.md in src/ai/ollamaClient.ts
- [X] T021 [P] [US3] Implement frame capture (canvas → base64 PNG) in src/ai/contextCapture.ts (depends on T007)
- [X] T022 [US3] Implement `AIControllerProfile` model + persisted preference (modelName, styleValue) per data-model.md in src/ai/aiControllerProfile.ts
- [X] T023 [US3] Implement decision loop — cadence timer, styleValue→jitter+temperature mapping (research.md #3), button-token parsing with no-op fallback on unrecognized response, dispatch to `EmulatorCore` in src/ai/decisionLoop.ts (depends on T020, T021, T022)
- [X] T024 [US3] Build `AIControlPanel` (model select from T020's `/api/tags`, style dial, enable/disable) in src/components/AIControlPanel/AIControlPanel.tsx (depends on T023)
- [X] T025 [US3] Wire AI-backend-unreachable / model-unavailable errors into `GameSession.status` per FR-013 in src/services/gameSession.ts (depends on T009, T020)
- [X] T026 [US3] Wire `AIControlPanel` into `App.tsx`, with manual input always taking precedence over autoplay (FR-011) in src/pages/App.tsx (depends on T024, T015)

**Checkpoint**: All user stories are independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation and cross-story hardening

- [X] T027 [P] Add unit tests for keyboard mapping (T008) and style-dial jitter/temperature mapping (T023) in tests/unit/
- [X] T028 [P] Add integration tests for `EmulatorCore`↔React binding and `ollamaClient` against a mocked endpoint in tests/integration/
- [X] T029 [P] Add Playwright e2e test covering quickstart.md scenarios (load → play → save → reload → load → autoplay toggle → take-over → Ollama-down error) in tests/e2e/ (gated on `E2E_ROM_PATH`; skips cleanly without a ROM)
- [ ] T030 Run quickstart.md validation end-to-end manually — BLOCKED: needs a user-supplied, legally-owned FireRed ROM and a local Ollama instance with a vision-capable model, neither available in this environment. Smoke-tested what's possible without a ROM (see notes).
- [ ] T031 Performance pass (~59.7fps sustained render, AI loop non-blocking) — BLOCKED: same reason as T030, requires actual gameplay to measure.

**Notes on T030/T031**: with `npm run dev`, the app boots with no console errors, `mgba.js`/`mgba.wasm` load (200) and the threaded WASM workers start successfully under the COOP/COEP headers, and on-screen controller buttons dispatch without error. The ROM-dependent parts of quickstart.md (loading FireRed, save/load round-trip, AI autoplay, 30-minute soak, fps measurement) still need to be run by a user with a real ROM and local Ollama.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational; independently
  implementable/testable thereafter, though App.tsx composition tasks (T015,
  T019, T026) touch the same file sequentially
- **Polish (Phase 6)**: Depends on all three user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependency on other stories
- **User Story 2 (P2)**: Independently testable; T019 composes into the same
  `App.tsx` as US1's T015, so run after T015
- **User Story 3 (P3)**: Independently testable; T026 composes into the same
  `App.tsx`, so run after T015 (and, in practice, after T019)

### Parallel Opportunities

- T003, T004, T005 (Setup tooling configs) in parallel after T002
- T008, T010 in parallel with T007 (different files, no shared dependency)
- T011, T012 in parallel (Display vs. Controller components)
- T016 can start in parallel with US1 work once Foundational is done
- T020, T021 in parallel (independent AI-support files)
- T027, T028, T029 in parallel in Polish phase

---

## Parallel Example: User Story 1

```bash
Task: "Build Display component in src/components/Display/Display.tsx"
Task: "Build Controller component in src/components/Controller/Controller.tsx"
```

## Parallel Example: User Story 3

```bash
Task: "Implement Ollama client in src/ai/ollamaClient.ts"
Task: "Implement frame capture in src/ai/contextCapture.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: manually play FireRed end-to-end via quickstart.md Scenario 1
5. Demo if ready

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. User Story 1 → validate → demo (MVP)
3. User Story 2 → validate save/load → demo
4. User Story 3 → validate AI autoplay → demo
5. Polish phase → run full quickstart.md, confirm performance targets

---

## Notes

- [P] tasks touch different files with no unmet dependency
- App.tsx composition tasks (T015, T019, T026) are the main serialization point
  across stories since they share one file
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently

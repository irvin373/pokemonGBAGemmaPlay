# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Browser-based GBA emulator for playing a user-supplied Pokemon FireRed ROM, with local save states and two autoplay modes: an LLM-driven mode using a locally-running Ollama vision model, and a from-scratch DQN reinforcement-learning mode trained in-browser with TensorFlow.js. Frontend-only React 19 + TypeScript SPA — there is no application backend; the only external process is the user's own Ollama instance at `http://localhost:11434` (RL training needs no external process, just GPU/CPU in-browser).

## Commands

```sh
npm run dev          # Vite dev server on :5173 (COOP/COEP headers configured — required)
npm run build        # tsc -b && vite build
npm run lint         # eslint .
npm run format       # prettier --write .
npm test             # vitest run (unit + integration)
npx vitest run tests/unit/keyboard.test.ts        # single test file
npx vitest run -t 'partial test name'             # single test by name
npm run test:e2e     # Playwright; SKIPS unless E2E_ROM_PATH points to a .gba ROM
```

E2E and any real gameplay validation need a user-supplied, legally-owned FireRed ROM (never bundle or download one — FR-001) and, for LLM autoplay, Ollama running with a vision-capable model and CORS allowed: `OLLAMA_ORIGINS="http://localhost:5173" ollama serve`.

## Spec-driven workflow

This repo uses Spec Kit, with two feature specs layered on the same codebase:

- `specs/001-browser-gba-emulator/` — the emulator core, save states, and LLM autoplay (FR-001..FR-015).
- `specs/002-rl-autoplay-training/` — the DQN training/inference mode layered on top (its own FR numbering; contracts here are addenda to feature 001's, e.g. `emulator-core-extension.md` adds to `emulator-core-interface.md` rather than replacing it).

Each feature dir follows the same shape: `spec.md` (requirements), `plan.md`, `research.md` (decision rationale), `data-model.md` (entity shapes), `contracts/` (interface contracts), `tasks.md` (task checklist — mark tasks `[X]` as completed). **When changing an interface documented in `contracts/`, update the contract file in the same change** — this has been done consistently so far.

`.specify/memory/constitution.md` is still the unfilled template; there are no ratified project principles yet.

## Architecture

The load-bearing boundary is `EmulatorCore` (`src/emulator/types.ts`, implemented by `MgbaEmulatorCore` in `src/emulator/core.ts`): React components and the AI loop depend only on this interface, never on `@thenick775/mgba-wasm` directly. Key realities of that WASM core (documented in `specs/.../contracts/emulator-core-interface.md`):

- mGBA renders **directly into the `<canvas>`** it is constructed with (SDL2); there is no frame callback. `attach(canvas)` must be called once (Display component does this) before anything else.
- It is a **threaded** Emscripten build — the page must be served cross-origin-isolated. COOP/COEP headers are set in `vite.config.ts` for both `server` and `preview`; keep them for any new hosting path.
- Save states are slot/file-backed inside mGBA's virtual FS. `saveState()` writes slot 0 then reads the file back out of `FS` to get a portable ArrayBuffer; `loadState(blob)` writes the blob into the expected FS path first. Persistence to IndexedDB happens in `src/storage/saveStates.ts` (idb-keyval), keyed by ROM SHA-256 checksum so loading a save from a different ROM triggers a warning.

**Single input path**: keyboard (`useKeyboardControls`), on-screen pad (`Controller`), the LLM loop, and the RL agent all call the same `pressButton`/`releaseButton` — never special-case by input source. Any manual input immediately preempts autoplay (FR-011): `App.tsx`'s `takeManualControl` stops whichever loop is active (`DecisionLoop` or `RLTrainingController`) and flips `GameSession.controlMode`.

**LLM autoplay pipeline** (`src/ai/`): `DecisionLoop` runs on its own `setTimeout` cadence (deliberately decoupled from the render loop — never make it block rendering). Each tick: capture canvas frame as base64 PNG → `requestNextButton` POSTs it to Ollama `/api/generate` with `DECISION_PROMPT` → `extractGbaButton` parses the reply (labeled `BUTTON: <name>` line first; single-letter buttons A/B/L/R are never scanned out of prose because they collide with English words) → press/release, and the full raw model reply is surfaced to the UI via `onMessage`. The human↔robotic `styleValue` (0..1) maps to both decision-timing jitter and Ollama `temperature`. Ollama failures throw `OllamaUnreachableError`, which stops the loop and lands in `GameSession` as a user-facing error (FR-013) — never let autoplay hang silently.

**RL training pipeline** (`src/rl/`): `RLTrainingController` mirrors `DecisionLoop`'s shape (own `setTimeout` cadence, push-only `onMetrics`/`onError` callbacks, no UI polling) but drives a DQN agent instead of an HTTP call. Per tick: capture frame → `frameProcessing.ts` downsamples/grayscales it into a fixed-size tensor input → `dqnAgent.ts` picks an action over `actionSpace.ts`'s fixed discrete button set → the resulting screen is hashed and checked against `NoveltyMemory` (bounded `Map`, FIFO eviction at 20k entries) to compute reward via `rewardModel.ts` (`+1.0` new screen, `-0.01` per step otherwise, so idling is net-negative) → the `Transition` goes into `replayBuffer.ts` and `episodeManager.ts` tracks episode boundaries/`rewardHistory`. `backend.ts#initTfBackend()` lazily picks TF.js's execution backend `webgpu → webgl → cpu`, caching the result and never hard-failing (cpu always succeeds; `degraded: true` signals a slow fallback to the UI). Training vs. inference reuses the same `DqnAgent`: `runInference()` skips replay-buffer growth and restores normal emulation speed, while training calls `core.setTrainingSpeed(multiplier, frameSkip)` for throughput and must restore the pre-training speed/settings on pause (not a hardcoded default). Trained weights persist via `src/storage/rlPolicies.ts`, which is deliberately split across two IndexedDB paths joined by the same id: TF.js's own `model.save('indexeddb://rl-policy-model/<id>')` for weights, and `idb-keyval` for `RLPolicyMeta` — never hand-serialize weights into `idb-keyval`.

**State**: `GameSession` (`src/services/gameSession.ts`) is a tiny subscribe/getState store consumed via `useSyncExternalStore` in `App.tsx` — no state library. `App.tsx` is the only composition point wiring core, session, panels, and both loops together. `controlMode` is `'manual' | 'ai-llm' | 'rl-training' | 'rl-inference'`, and the concurrently-active controller is a single discriminated `activeController` field (`{type: 'none'|'llm'|'rl-training'|'rl-inference', ...}`) — a type-level invariant that at most one autoplay mode runs at a time, not a runtime convention across separate booleans.

## Testing notes

- jsdom lacks `PointerEvent` — dispatch plain `Event('pointerdown')` in component tests.
- `DecisionLoop` tests use `vi.useFakeTimers()` + `vi.runOnlyPendingTimersAsync()`; Ollama is mocked by spying on `ollamaClient` exports or stubbing global `fetch`.
- `tests/setup.ts` installs `fake-indexeddb/auto` globally, so `rlPolicies.ts`/`saveStates.ts` IndexedDB calls work unmocked in unit/integration tests.
- `tsconfig.node.json` intentionally only includes `vite.config.ts` — vitest/playwright configs are excluded from `tsc -b` because vitest bundles its own vite whose plugin types conflict.

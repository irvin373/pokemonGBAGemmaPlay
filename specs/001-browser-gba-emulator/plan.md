# Implementation Plan: Browser GBA Emulator for Pokemon FireRed

**Branch**: `001-browser-gba-emulator` | **Date**: 2026-07-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-browser-gba-emulator/spec.md`

## Summary

A single-page React app that emulates a GBA in-browser to play a user-provided
Pokemon FireRed ROM: renders the 2D screen to a `<canvas>`, exposes on-screen +
keyboard controls, persists save states locally (IndexedDB), and offers a fully
autonomous AI autoplay mode that captures the live screen, sends it to a
locally-running Ollama Gemma model, and converts the model's decision into GBA
button presses — with a human-vs-robotic style dial and instant manual override.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19

**Primary Dependencies**: React (per user input); `mgba-wasm` (WASM GBA emulation
core — avoids writing a GBA core from scratch); `idb-keyval` (IndexedDB save-state
persistence); native `fetch` to a local Ollama HTTP endpoint (no Ollama SDK
required)

**Storage**: Browser IndexedDB (ROM is not persisted — session-only; save states
and user preferences ARE persisted across sessions)

**Testing**: Vitest + React Testing Library (unit/component), Playwright
(end-to-end: boot ROM, save/load, autoplay toggle)

**Target Platform**: Modern desktop browser (Chrome/Firefox/Edge, WebAssembly +
Canvas + IndexedDB support required) running entirely client-side on the user's
own machine, alongside a locally-running Ollama instance (`http://localhost:11434`)

**Project Type**: Single-page web application (frontend-only; no application
backend — the only "server" involved is the user's own local Ollama process)

**Performance Goals**: Sustain native GBA frame rate (~59.7 fps) during emulation;
input-to-action latency under 16ms (one frame) for manual control; AI decision
loop MUST NOT block or stall the render loop (runs on a decision cadence, not
per-frame)

**Constraints**: Fully client-side/offline-capable except the AI autoplay feature,
which requires the local Ollama endpoint to be reachable; no ROM distribution;
no user accounts/auth; single browser tab/session at a time

**Scale/Scope**: Single local user, one active Game Session (one ROM) at a time,
a handful of named save states per ROM

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template for this project
(no ratified principles exist yet — all placeholders remain literal, e.g.
`[PRINCIPLE_1_NAME]`). There are therefore no ratified gates to evaluate against.

**Gate result**: PASS (vacuously — nothing to violate). Recommendation: run
`/speckit-constitution` before or alongside implementation so code-quality,
testing, UX-consistency, and performance principles are ratified and enforceable
for this feature; until then, this plan applies reasonable defaults (see
Technical Context: Testing, Performance Goals) in their place.

## Project Structure

### Documentation (this feature)

```text
specs/001-browser-gba-emulator/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── Display/            # <canvas> renderer bound to emulator core frame output
│   ├── Controller/          # On-screen GBA button pad
│   └── AIControlPanel/      # Model select, human<->robotic style dial, enable/disable
├── emulator/
│   ├── core.ts              # mgba-wasm lifecycle: load ROM, step frame, input, save/load state
│   └── keyboard.ts          # Keyboard-to-GBA-button mapping
├── ai/
│   ├── ollamaClient.ts       # fetch wrapper for local Ollama /api/generate
│   ├── contextCapture.ts     # canvas -> base64 frame for model input
│   └── decisionLoop.ts       # decision cadence, style-dial jitter, action dispatch
├── storage/
│   └── saveStates.ts         # IndexedDB save-state CRUD (idb-keyval)
├── pages/
│   └── App.tsx               # top-level composition
└── services/
    └── gameSession.ts        # Game Session state (loaded ROM, active control mode)

tests/
├── unit/                     # keyboard mapping, style-dial jitter, save-state CRUD
├── integration/               # emulator core <-> React binding, Ollama client against a mock
└── e2e/                       # Playwright: load ROM -> play -> save -> reload -> load -> autoplay toggle
```

**Structure Decision**: Single-project frontend-only layout (no `backend/` — per
Technical Context there is no application server; the local Ollama process is an
external dependency reached over HTTP, not a service this codebase deploys).

## Complexity Tracking

> Constitution has no ratified gates yet (see Constitution Check), so there are no
> violations to justify. No entries.

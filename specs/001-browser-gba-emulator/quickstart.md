# Quickstart: Browser GBA Emulator for Pokemon FireRed

Validation guide for this feature end-to-end. See [data-model.md](./data-model.md)
and [contracts/](./contracts/) for entity/interface details this references.

## Prerequisites

- Node.js + package manager for the React app (per Technical Context: React 18+,
  TypeScript 5.x).
- [Ollama](https://ollama.com) installed locally, with a vision-capable Gemma
  model pulled (research.md #2), e.g.:
  ```sh
  ollama pull gemma3
  ```
- Ollama started with CORS allowed for the app's dev origin (research.md #5):
  ```sh
  OLLAMA_ORIGINS="http://localhost:5173" ollama serve
  ```
- Your own legally-owned Pokemon FireRed ROM file (`.gba`). This project does
  not provide one (FR-001).

## Setup

```sh
npm install
npm run dev
```
Open the printed local URL in a browser.

## Scenario 1 — Play manually (User Story 1)

1. In the app, select your FireRed ROM file.
   - **Expected**: title screen renders within ~10s (SC-001).
2. Use on-screen buttons or keyboard to start a new game and walk around.
   - **Expected**: character moves immediately on D-pad/arrow input; A/B/Start/Select
     trigger the expected menus/dialogue.

## Scenario 2 — Save and resume (User Story 2)

1. While mid-game, trigger "Save State" and give it a label.
   - **Expected**: confirmation shown; entry appears in the save-state list.
2. Reload the browser tab, re-select the same ROM, open the save-state list, and
   load the save you created.
   - **Expected**: game resumes at the exact same position/party/inventory
     (SC-002).
3. (Edge case) Load a different ROM, then attempt to load a save state created
   under the first ROM's checksum.
   - **Expected**: a mismatch warning is shown before (not instead of) loading.

## Scenario 3 — AI autoplay (User Story 3)

1. With a game running, open the AI Control Panel, confirm the Gemma/Ollama
   model appears in the list (pulled from `GET /api/tags`, contracts/ollama-api.md),
   select it, and enable autoplay.
   - **Expected**: within one decision cycle, the game starts receiving button
     presses with no further user input.
2. Move the human↔robotic style dial from one extreme to the other while
   autoplay runs.
   - **Expected**: observably different pacing/decisiveness (research.md #3).
3. Press any manual control (or the explicit "Take Over" action).
   - **Expected**: autoplay stops immediately; manual control resumes (SC-003).
4. Stop the local Ollama process, then enable autoplay again.
   - **Expected**: a clear "AI backend unreachable" error is shown; no hang or
     crash (FR-013).

## Non-functional checks

- While playing manually, confirm no visible stutter (target ~59.7 fps,
  Technical Context: Performance Goals).
- Run autoplay continuously for 30 minutes; confirm no crash/freeze (SC-004).

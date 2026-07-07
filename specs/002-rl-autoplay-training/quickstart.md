# Quickstart: In-Browser RL Autoplay Training

Validation guide for this feature end-to-end. See [data-model.md](./data-model.md)
and [contracts/](./contracts/) for entity/interface details this references.
Builds on feature 001's prerequisites (`specs/001-browser-gba-emulator/quickstart.md`).

## Prerequisites

- Everything from feature 001's quickstart (Node.js toolchain, a
  legally-owned FireRed ROM file).
- A browser with WebGL support (near-universal) for reasonable training
  speed; WebGPU (Chrome/Edge, behind `navigator.gpu`) if available, but not
  required — CPU fallback works, just slower (research.md #8).
- No Ollama/LLM setup needed for this feature specifically (RL training is
  fully local/offline), though the existing LLM controller from feature 001
  remains available side-by-side.

## Setup

```sh
npm install   # picks up @tensorflow/tfjs (+ optional webgpu backend)
npm run dev
```

## Scenario 1 — Train and watch (User Story 1)

1. Load your FireRed ROM (as in feature 001), then open the RL Training panel
   and click "Start Training."
   - **Expected**: within ~30s, episode count, current-episode reward, and a
     novelty/exploration metric appear and update live (SC-001). The game
     visibly runs faster than normal play (SC-002).
2. Watch the agent play — it should be pressing buttons on its own with no
   further input from you.
3. Click "Pause."
   - **Expected**: agent input stops, the game returns to normal speed, and
     you can immediately move the character manually (SC-004, <2s).
4. Click "Resume."
   - **Expected**: training continues; episode count and metrics do not reset
     to zero (they resume from where they were).
5. Click "Reset."
   - **Expected**: episode count, reward, and novelty metrics all return to
     zero, and the agent's behavior reverts to untrained (random-ish).

## Scenario 2 — Save, reload, run as inference controller (User Story 2)

1. Start training, let it run for a few minutes, then click "Save Policy" and
   give it a name.
   - **Expected**: the policy appears in a "Saved Policies" list.
2. Reload the browser tab, re-load the same ROM, open the RL panel, and
   select the saved policy.
   - **Expected**: it's selectable as an AI controller option alongside the
     existing LLM (Ollama) controller from feature 001.
3. Enable it as the active controller (inference mode, not training).
   - **Expected**: the agent plays at normal game speed (no fast-forward),
     and pressing any manual control instantly reclaims control (same rule as
     the LLM controller, SC-007).
4. (Edge case) Load a different ROM, then attempt to load a policy saved
   under the first ROM's checksum.
   - **Expected**: a mismatch warning appears before proceeding, same UX as
     feature 001's save-state mismatch warning.
5. Re-select training mode using the saved policy (rather than a fresh one).
   - **Expected**: training resumes improving that policy rather than
     starting from scratch.

## Scenario 3 — Long-session stability (User Story 1 / Polish)

This scenario cannot be fully automated — run manually:

1. Start training and let it run continuously for as long as practical
   (ideally ~4 hours, per SC-006).
   - **Expected**: no tab crash, no unbounded memory growth (watch browser
     task manager — memory should plateau once the replay buffer and novelty
     map hit their capacity constants, not climb indefinitely).
2. Leave the tab backgrounded (switch to another tab) for a few minutes
   during training, then return.
   - **Expected**: training paused while backgrounded and resumed
     automatically on return (FR-014), rather than silently corrupting
     progress.

## Non-functional checks

- Confirm the RL feature's dependencies are lazy-loaded: inspect the network
  tab on first page load (no RL training touched yet) and confirm
  `@tensorflow/tfjs` is NOT fetched until "Start Training" is first clicked.
- Confirm switching between the LLM controller and RL inference/training
  mode never allows two controllers to drive input simultaneously (FR-009) —
  toggle rapidly between them and confirm no split/duplicate button presses.

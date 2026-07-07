# Feature Specification: In-Browser RL Autoplay Training

**Feature Branch**: `002-rl-autoplay-training`

**Created**: 2026-07-04

**Status**: Draft

**Input**: User description: "Add an in-browser Reinforcement Learning autoplay mode to the GBA emulator. The RL agent trains directly in the browser (TensorFlow.js with WebGPU/WebGL backend) while the emulator runs, learning to play Pokemon FireRed from screen frames. Features: user can start/pause/resume/reset training from the UI; training progress display (episode count, cumulative reward, exploration metric); reward based on novelty/exploration (screen-state hashing) since RAM introspection is unavailable in the browser WASM core; use the emulator's fast-forward multiplier and frame skip during training to maximize throughput; trained policy can be saved/loaded locally (IndexedDB) and run in inference mode as a new AI controller type alongside the existing Ollama controller; user can watch the agent play live during and after training. Single local user, same app as feature 001."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Train an RL agent by watching it play (Priority: P1)

A player loads their FireRed ROM, opens the training panel, and starts a training
session. The agent begins pressing buttons on its own, the emulator runs at
accelerated speed, and the player watches live progress numbers (episodes,
reward, how much of the game world the agent has newly "seen") tick up. The
player can pause training at any time (returning the emulator to normal speed
and manual control) and resume later in the same session.

**Why this priority**: Training is the core of the feature — without a way to
train, there is nothing to save, load, or watch. Also the riskiest part, so it
must be proven first.

**Independent Test**: Start training on a loaded ROM, observe the agent issuing
inputs autonomously at accelerated speed, watch episode/reward/novelty numbers
update, pause, confirm manual control returns, resume, confirm training
continues from where it left off.

**Acceptance Scenarios**:

1. **Given** a ROM is loaded and running, **When** the user starts training,
   **Then** the agent begins issuing game inputs without user involvement and
   the emulator switches to accelerated speed.
2. **Given** training is active, **When** the user views the training panel,
   **Then** it shows current episode count, cumulative reward for the current
   episode, and an exploration/novelty metric, all updating live.
3. **Given** training is active, **When** the user pauses training, **Then**
   agent input stops, the emulator returns to normal speed, and manual control
   works immediately.
4. **Given** training is paused, **When** the user resumes, **Then** training
   continues with prior progress intact (episode count and learned behavior are
   not reset).
5. **Given** training is active, **When** the user resets training, **Then**
   progress metrics return to zero and the agent behaves as untrained.

### User Story 2 - Save a trained policy and run it as an autoplay controller (Priority: P2)

After training for a while, the player saves the current policy under a name.
Later (including after closing and reopening the browser), the player selects
that saved policy as the AI controller — alongside the existing Ollama option —
and watches it play the game at normal speed without any further training.

**Why this priority**: Persistence and inference make training worthwhile
across sessions; depends on US1 existing.

**Independent Test**: Train briefly, save the policy with a name, reload the
browser tab, select the saved policy as the active controller, enable autoplay,
and confirm the agent plays using that policy at normal speed.

**Acceptance Scenarios**:

1. **Given** a training session with progress, **When** the user saves the
   policy with a name, **Then** it is stored locally and appears in the list of
   saved policies.
2. **Given** at least one saved policy exists, **When** the user reopens the
   app and loads that policy, **Then** it is selectable as an AI controller
   type alongside the existing LLM (Ollama) controller.
3. **Given** a loaded policy is selected as the controller, **When** the user
   enables autoplay, **Then** the agent plays at normal game speed using the
   policy, with no training-related slowdown, and the user can reclaim manual
   control instantly (same rule as the existing controller).
4. **Given** a saved policy, **When** the user resumes training from it,
   **Then** training continues improving that policy rather than starting from
   scratch.

### User Story 3 - Understand and steer what the agent is learning (Priority: P3)

While training runs, the player wants insight into whether the agent is
actually learning: a rolling view of reward over recent episodes and how much
new territory the agent is discovering, so they can decide to keep training,
reset, or stop and save.

**Why this priority**: Quality-of-life on top of US1; training works without
it, but without feedback users cannot judge multi-hour sessions.

**Independent Test**: During an active training session, open the progress
view and confirm reward-per-episode history and a novelty trend are visible and
update as episodes complete.

**Acceptance Scenarios**:

1. **Given** training has completed multiple episodes, **When** the user views
   progress, **Then** a per-episode reward history (at minimum the recent
   episodes) is visible.
2. **Given** the agent stops discovering new screens for an extended period,
   **When** the user views the novelty metric, **Then** the stagnation is
   visible (metric flattens), enabling an informed reset/stop decision.

### Edge Cases

- What happens when the user starts training before any ROM is loaded?
- What happens when the browser tab is backgrounded during training (timers
  throttle)? Training should pause or degrade gracefully, not corrupt state.
- What happens when device storage quota is exceeded while saving a policy?
- What happens when a saved policy was trained on a different ROM than the one
  currently loaded?
- What happens when the graphics acceleration backend is unavailable on the
  user's browser? The feature must degrade (slower training) or clearly report
  unsupportability rather than crash.
- What happens when the user enables the LLM (Ollama) controller while RL
  training is active, or vice versa? Only one controller may drive input at a
  time.
- What happens when the user saves a game save-state while training is active?
- What happens if training runs for hours and memory grows (replay buffers)?
  The app must bound memory so the tab does not crash.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a training mode in which an RL agent learns
  to play the loaded game entirely on the user's machine in the browser, using
  only screen images as observations (no game-memory introspection).
- **FR-002**: Users MUST be able to start, pause, resume, and reset training
  from the UI; pause MUST restore normal emulator speed and manual control
  immediately.
- **FR-003**: During training, the system MUST run the emulator at accelerated
  speed (fast-forward and/or frame skipping) to maximize learning throughput,
  and MUST restore normal speed when training stops.
- **FR-004**: The system MUST compute the training reward from screen novelty
  (recognizing and rewarding screens/areas the agent has not seen before),
  since game-memory-based rewards are unavailable.
- **FR-005**: The training panel MUST display live progress: episode count,
  current-episode cumulative reward, and an exploration/novelty metric, plus a
  recent per-episode reward history.
- **FR-006**: Users MUST be able to save the current trained policy locally
  under a user-assigned name, and saved policies MUST survive browser restarts.
- **FR-007**: Users MUST be able to load a saved policy and (a) run it in
  inference mode as an AI controller selectable alongside the existing LLM
  (Ollama) controller, or (b) continue training from it.
- **FR-008**: Inference mode MUST run at normal game speed and obey the same
  manual-override rule as the existing controller: any manual input immediately
  reclaims control.
- **FR-009**: Only one AI controller (RL training, RL inference, or LLM) may
  drive game input at any moment; activating one MUST deactivate the others.
- **FR-010**: The system MUST bound training memory usage (e.g., replay/novelty
  buffers) so long sessions do not crash the tab.
- **FR-011**: The system MUST surface a clear message when the accelerated
  compute backend is unavailable, and either continue on a slower fallback or
  explain that training is unsupported on this browser — never fail silently.
- **FR-012**: The system MUST warn when loading a policy that was trained on a
  different ROM than the currently loaded one (same checksum rule as save
  states).
- **FR-013**: Training MUST NOT corrupt or interfere with the user's game
  save states; saving/loading game states while training is active MUST either
  work safely or be blocked with a clear message.
- **FR-014**: If the browser tab loses focus during training, the system MUST
  pause or safely degrade training rather than silently producing corrupted
  progress.

### Key Entities

- **Training Session**: The live in-memory training run — current episode
  number, per-episode cumulative reward, novelty statistics, and
  training-active/paused status. Exists only while the app is open.
- **RL Policy**: A named, persisted snapshot of the agent's learned behavior,
  tagged with the ROM checksum it was trained on and training metadata
  (episodes trained, creation/update time). Loadable for inference or further
  training.
- **Novelty Memory**: The bounded record of screen states already seen, used to
  compute exploration rewards; resettable with the session.
- **AI Controller Selection**: Extension of the existing controller choice —
  now one of: LLM (Ollama) or a named RL Policy in inference mode.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can start RL training within 2 clicks of loading a ROM,
  and see progress numbers updating within 30 seconds of starting.
- **SC-002**: During training, the game runs measurably faster than normal
  play (at least 2x effective frame throughput on a supported browser).
- **SC-003**: After 30 minutes of training on a fresh game, the novelty metric
  shows the agent has discovered more unique screens than an agent pressing
  random buttons for the same duration (learning is demonstrably better than
  random).
- **SC-004**: Pausing training returns the user to playable manual control in
  under 2 seconds, 100% of the time.
- **SC-005**: A saved policy survives a full browser restart and can be
  running in inference mode within 15 seconds of reopening the app.
- **SC-006**: A 4-hour continuous training session completes without the tab
  crashing or memory growing unboundedly.
- **SC-007**: Switching between RL inference and the LLM controller takes a
  single selection and takes effect in under 2 seconds.

## Assumptions

- Same single-local-user, browser-only deployment as feature 001; no servers,
  no accounts, nothing leaves the machine.
- Observations are screen images only — the browser emulator core does not
  expose game memory, so rewards derive from screen novelty rather than
  in-game achievements (badges, captures). Catching Pokemon is therefore NOT a
  direct training objective in this feature; exploration is the proxy goal.
- Realistic expectation (documented for users): in-browser single-environment
  training will produce an agent that explores; it is not expected to complete
  the game. The feature's value is watchable, resumable, local RL.
- Training uses the user's GPU via the browser where available; a slower
  fallback (or clear unsupported message) covers other browsers per FR-011.
- Policy storage shares the same local storage mechanism and ROM-checksum
  tagging convention as feature 001's save states.
- One policy is "active" at a time; policy library size is small (tens, not
  thousands).

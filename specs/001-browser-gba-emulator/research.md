# Phase 0 Research: Browser GBA Emulator for Pokemon FireRed

## 1. GBA emulation core

**Decision**: Use `mgba-wasm` (WebAssembly build of the mGBA core) as the
emulation engine, driven from a thin TypeScript wrapper (`src/emulator/core.ts`).

**Rationale**: mGBA is a mature, high-accuracy GBA core with an existing WASM
build; it already implements save states, exposes a frame-buffer to render to
canvas, and accepts button input programmatically — exactly the primitives
FR-002 through FR-007 need. Writing a GBA core from scratch is out of scope for
this feature and would dwarf its effort budget.

**Alternatives considered**:
- Hand-rolled JS/WASM GBA core — rejected: multi-year effort, high risk of
  FireRed-specific incompatibilities.
- `gbajs`-style pure-JS cores — rejected: noticeably lower performance and
  accuracy than mGBA's WASM build; risks missing the ~60fps target (SC/perf goal).

## 2. Feeding "game context" to the AI (FR-012)

**Decision**: Capture the live canvas frame as a base64-encoded PNG at a fixed
decision cadence (not every frame) and send it as an image input to a
vision-capable Ollama-served Gemma model via `/api/generate`, alongside a short
text prompt describing available buttons and the current control goal.

**Rationale**: The screen is the only context representation guaranteed to be
available and general enough to reflect arbitrary in-game state (menus, battles,
overworld, dialogue) without reverse-engineering FireRed's memory layout. This
keeps FR-012 decoupled from any specific game version/ROM revision.

**Alternatives considered**:
- Reading emulator RAM/memory addresses for structured state (party HP, map ID,
  etc.) — rejected for v1: requires FireRed-specific memory-map reverse
  engineering, far larger effort, and different mappings per ROM revision;
  revisit later as an optional enhancement layered on top of vision input.
- Sending raw tile/VRAM data instead of a rendered screenshot — rejected: no
  standard model input format for this; a PNG frame is directly consumable by
  vision-capable models with no custom encoding.

**Model requirement this creates**: the selected Ollama model MUST support image
input (a vision-capable Gemma variant). This is a deployment prerequisite
documented in quickstart.md, not something the app can silently work around.

## 3. Decision cadence & "human vs. robotic" style (FR-010)

**Decision**: Run the AI decision loop on its own timer independent of the
emulator's render loop (e.g., request a decision every N frames), and implement
the human↔robotic dial as two linked parameters on that loop:
(a) inter-decision delay jitter (larger, more variable delays = "more human"),
and (b) the model's `temperature`/sampling setting passed to Ollama (higher =
more varied/less optimal choices = "more human"; near-zero = "more robotic").

**Rationale**: Keeping the AI loop decoupled from the render loop satisfies the
Performance Goals constraint (AI must not stall rendering). Expressing the style
dial as jitter + temperature is a small, directly observable, testable mapping
(satisfies Acceptance Scenario "AI's play behavior visibly changes").

**Alternatives considered**:
- Deterministic single "style" enum with hard-coded behavior presets — rejected:
  spec calls for an adjustable spectrum, not discrete modes.
- Simulating human-like mouse/touch imprecision — rejected: GBA input is
  discrete button presses, there is no analog pointer to jitter.

## 4. Save state persistence (FR-005, FR-006, FR-007)

**Decision**: Persist save states in browser IndexedDB via `idb-keyval`, keyed
by a user-assigned name/timestamp and the ROM's checksum (to detect ROM/save
mismatches per the spec's edge cases).

**Rationale**: IndexedDB is the standard, quota-generous, structured local
storage mechanism available to browser apps; `idb-keyval` gives a minimal
key-value API without a heavier ORM layer. Storing the ROM checksum alongside
each save state directly supports the "different ROM revision" edge case
(FR-014-adjacent) by letting the app warn on mismatch before loading.

**Alternatives considered**:
- `localStorage` — rejected: capacity far too small for GBA save-state blobs.
- Downloadable save files only (no in-browser persistence) — rejected: fails
  SC-002 ("resume ... 100% of the time") for a user who simply reopens the tab.

## 5. Reaching local Ollama from the browser

**Decision**: Call Ollama's local REST API directly from the browser
(`fetch('http://localhost:11434/api/generate', ...)`), with quickstart.md
documenting that the user must start Ollama with CORS allowed for the app's
origin (`OLLAMA_ORIGINS`) since this is a same-machine, single-user deployment.

**Rationale**: Matches the "single local user" scope decision (no app-owned
backend/proxy needed); avoids introducing a server component purely to relay
HTTP calls that the browser can make directly on localhost.

**Alternatives considered**:
- A small local proxy server bundled with the app — rejected: adds a backend
  component and deployment step for no benefit given single-machine scope.

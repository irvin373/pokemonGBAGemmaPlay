# Phase 1 Data Model: Browser GBA Emulator for Pokemon FireRed

## GameSession

The in-memory representation of the currently running emulation. Not persisted
directly (the ROM itself is never written to storage); rebuilt each time a ROM
is loaded.

| Field | Type | Notes |
|---|---|---|
| `romChecksum` | string | Hash of the loaded ROM bytes; used to match save states to the correct ROM/revision (research.md #4) |
| `romName` | string | Display name derived from the ROM header/filename |
| `controlMode` | `"manual" \| "ai"` | Which controller is currently driving input (FR-008, FR-011) |
| `aiControllerProfileId` | string \| null | Set when `controlMode === "ai"`; references an `AIControllerProfile` |
| `status` | `"idle" \| "running" \| "error"` | `"error"` covers invalid ROM (FR-014) and unreachable AI backend (FR-013) |
| `errorMessage` | string \| null | User-facing message when `status === "error"` |

**Transitions**:
- `idle -> running`: valid ROM loaded successfully.
- `idle -> error`: ROM validation fails (FR-014).
- `running -> running` (`controlMode` toggles): manual override always wins immediately (FR-011).
- `running -> error`: AI backend becomes unreachable while `controlMode === "ai"` (FR-013).
- `error -> idle`: user dismisses error / loads a new ROM.

## SaveState

Persisted in IndexedDB (research.md #4). One ROM can have many save states.

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | Primary key |
| `romChecksum` | string | Must match the currently loaded ROM's checksum to load without a warning (edge case: mismatched ROM revision) |
| `label` | string | User-assigned or auto-generated name |
| `createdAt` | ISO datetime string | For display/sorting (FR-007: multiple save states) |
| `emulatorStateBlob` | binary (ArrayBuffer/Blob) | Opaque full emulator state snapshot from the core (FR-005, FR-006) |

**Validation rules**:
- `label` required, non-empty, unique per `romChecksum` (prevents ambiguous overwrite).
- Loading a `SaveState` whose `romChecksum` differs from the active `GameSession.romChecksum` MUST surface a warning before proceeding (edge case from spec.md).

## AIControllerProfile

Configuration selecting and tuning the AI autoplay controller (FR-009, FR-010).
Persisted in browser storage as a user preference (not per-ROM).

| Field | Type | Notes |
|---|---|---|
| `id` | string | e.g., `"gemma-ollama"` — v1 ships with exactly one, but the field is a stable id so more can be added later (spec Assumptions) |
| `modelName` | string | Ollama model tag to request, e.g., `"gemma3:vision"` — MUST be a vision-capable model (research.md #2) |
| `styleValue` | number (0.0–1.0) | 0 = fully robotic, 1 = fully human; drives both decision-timing jitter and sampling temperature (research.md #3) |

**Validation rules**:
- `styleValue` clamped to `[0, 1]`.
- `modelName` MUST be one of the models the local Ollama instance reports as installed (checked at selection time, not hard-coded) — surfaces FR-013's "model unavailable" error if not.

## Relationships

```text
GameSession 1 --- 0..* SaveState        (via romChecksum)
GameSession 0..1 --- 1 AIControllerProfile  (via aiControllerProfileId, only while controlMode = "ai")
```

# Contract: Emulator Core Interface (`src/emulator/core.ts`)

Internal interface between the React UI layer and the `@thenick775/mgba-wasm`
core. UI components (Display, Controller, AIControlPanel) depend only on this
shape, not on the WASM module directly — keeps the underlying engine swappable
per research.md #1.

```ts
interface EmulatorCore {
  attach(canvas: HTMLCanvasElement): Promise<void>; // mGBA renders directly into this canvas via SDL2

  loadRom(file: File): Promise<{ ok: true; romChecksum: string; romName: string }
                              | { ok: false; romChecksum: string; romName: string; error: string }>; // FR-001, FR-014

  pressButton(button: GbaButton): void;   // FR-003, FR-004
  releaseButton(button: GbaButton): void;

  saveState(): Promise<ArrayBuffer>;      // FR-005 — opaque blob, stored via storage/saveStates.ts
  loadState(blob: ArrayBuffer): Promise<{ ok: true } | { ok: false; error: string }>; // FR-006

  captureFrameAsPngBase64(): string;      // feeds ai/contextCapture.ts, research.md #2
}

type GbaButton = "UP" | "DOWN" | "LEFT" | "RIGHT" | "A" | "B" | "START" | "SELECT" | "L" | "R";
```

**Contract rules**:
- `attach` MUST be called once, after the `<canvas>` element mounts, before any
  other method — mGBA's module is constructed with the canvas and renders into
  it directly (there is no separate frame-buffer callback to consume).
- `loadRom` MUST resolve with `ok: false` (never throw) for invalid/non-GBA
  files or files the core rejects — UI maps this directly to the FR-014 error
  message.
- `captureFrameAsPngBase64` uses the core's own `screenshot()` facility: mGBA
  writes a PNG into its virtual-FS screenshots directory, which is read back,
  base64-encoded, and deleted. Reading the `<canvas>` directly via
  `canvas.toDataURL` does NOT work — mGBA's SDL2/WebGL context is created with
  `preserveDrawingBuffer: false`, so the drawing buffer is already cleared by
  the time JS can read it and the capture comes back fully transparent. The
  `toDataURL` path is kept only as a last-resort fallback if `screenshot()`
  fails.
- `pressButton`/`releaseButton` are called identically whether the source is
  keyboard, on-screen touch, or the AI decision loop — single input path,
  no special-casing per controller source.
- `saveState`/`loadState` wrap the core's slot-based, file-backed save states
  (mGBA writes/reads a file under its virtual filesystem per slot): `saveState`
  locates and reads back the file the core just wrote so it can be persisted
  externally (IndexedDB); `loadState` writes the given blob into that same
  virtual path before invoking the core's load. This is a workaround for the
  core exposing no direct in-memory state accessor.
- Requires the page to be served with cross-origin isolation headers
  (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy:
  require-corp`) because the WASM core uses threads.

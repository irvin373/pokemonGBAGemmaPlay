export const GBA_BUTTONS = [
  'UP',
  'DOWN',
  'LEFT',
  'RIGHT',
  'A',
  'B',
  'START',
  'SELECT',
  'L',
  'R',
] as const;

export type GbaButton = (typeof GBA_BUTTONS)[number];

export interface LoadRomResult {
  ok: boolean;
  romChecksum: string;
  romName: string;
  error?: string;
}

export interface LoadStateResult {
  ok: boolean;
  error?: string;
}

/**
 * UI-facing emulator contract (specs/001-browser-gba-emulator/contracts/emulator-core-interface.md).
 * Keeps React components decoupled from the underlying WASM core implementation.
 */
export interface EmulatorCore {
  attach(canvas: HTMLCanvasElement): Promise<void>;
  loadRom(file: File): Promise<LoadRomResult>;
  pressButton(button: GbaButton): void;
  releaseButton(button: GbaButton): void;
  saveState(): Promise<ArrayBuffer>;
  loadState(blob: ArrayBuffer): Promise<LoadStateResult>;
  captureFrameAsPngBase64(): string;

  /** Accelerates emulation for RL training throughput (FR-003, spec 002). */
  setTrainingSpeed(multiplier: number, frameSkip: number): void;

  /** Restores the speed/settings active before setTrainingSpeed was first
   *  called. Idempotent — safe to call even if never accelerated. */
  restoreNormalSpeed(): void;
}

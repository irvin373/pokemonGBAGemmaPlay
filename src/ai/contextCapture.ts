import type { EmulatorCore } from '../emulator/types';

/** Captures the current game screen for the AI decision loop (research.md #2). */
export function captureFrame(core: EmulatorCore): string {
  return core.captureFrameAsPngBase64();
}

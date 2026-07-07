import type { EmulatorCore } from '../emulator/types';
import type { AIControllerProfile } from './aiControllerProfile';
import { captureFrame } from './contextCapture';
import { requestNextButton, OllamaUnreachableError } from './ollamaClient';

const BASE_CADENCE_MS = 700;
const MAX_JITTER_MS = 900;
const BUTTON_HOLD_MS = 120;

/**
 * Runs on its own timer independent of the emulator's render loop so autoplay
 * decisions never block rendering (Performance Goals, research.md #3).
 * styleValue drives both inter-decision jitter and Ollama's sampling temperature:
 * 0 = robotic (fast, deterministic), 1 = human (slower, more variable/varied).
 */
export class DecisionLoop {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;

  constructor(
    private readonly core: EmulatorCore,
    private readonly getProfile: () => AIControllerProfile,
    private readonly onError: (message: string) => void,
    private readonly onMessage: (message: string) => void = () => {},
  ) {}

  start(): void {
    this.stopped = false;
    this.scheduleNext();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private scheduleNext(): void {
    if (this.stopped) return;
    const { styleValue } = this.getProfile();
    const delay = BASE_CADENCE_MS + Math.random() * MAX_JITTER_MS * styleValue;
    this.timer = setTimeout(() => void this.tick(), delay);
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    const profile = this.getProfile();

    try {
      const frame = captureFrame(this.core);
      const { button, message } = await requestNextButton(profile.modelName, frame, profile.styleValue);
      if (this.stopped) return;

      this.onMessage(message);

      if (button) {
        this.core.pressButton(button);
        setTimeout(() => this.core.releaseButton(button), BUTTON_HOLD_MS);
      }
      // No recognized button in the response is treated as a no-op this cycle
      // (spec edge case: AI produces an invalid/unrecognized action).
    } catch (error) {
      if (error instanceof OllamaUnreachableError) {
        this.onError(error.message);
        this.stop();
        return;
      }
      throw error;
    }

    this.scheduleNext();
  }
}

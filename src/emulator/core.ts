import mGBA from '@thenick775/mgba-wasm';
import type { EmulatorCore, GbaButton, LoadRomResult, LoadStateResult } from './types';

type MgbaModule = Awaited<ReturnType<typeof mGBA>>;

const BUTTON_TO_INPUT_NAME: Record<GbaButton, string> = {
  UP: 'Up',
  DOWN: 'Down',
  LEFT: 'Left',
  RIGHT: 'Right',
  A: 'A',
  B: 'B',
  START: 'Start',
  SELECT: 'Select',
  L: 'L',
  R: 'R',
};

const SAVE_STATE_SLOT = 0;

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function baseNameWithoutExt(path: string): string {
  const parts = path.split('.');
  parts.pop();
  return parts.join('.');
}

const NORMAL_CORE_SETTINGS = {
  frameSkip: 0,
  rewindEnable: true,
  autoSaveStateEnable: true,
} as const;

export class MgbaEmulatorCore implements EmulatorCore {
  private module: MgbaModule | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private romBaseName: string | null = null;
  private preTrainingFastForward: number | null = null;

  async attach(canvas: HTMLCanvasElement): Promise<void> {
    this.module = await mGBA({ canvas });
    this.canvas = canvas;
    await this.module.FSInit();
  }

  async loadRom(file: File): Promise<LoadRomResult> {
    const module = this.requireModule();
    const buffer = await file.arrayBuffer();
    const romChecksum = await sha256Hex(buffer);

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !['gba', 'gbc', 'gb', 'zip', '7z'].includes(extension)) {
      return { ok: false, romChecksum: '', romName: file.name, error: 'Unrecognized ROM file type.' };
    }

    const uploaded = await new Promise<void>((resolve) => {
      module.uploadRom(file, () => resolve());
    });
    void uploaded;

    const { gamePath } = module.filePaths();
    const romPath = `${gamePath}/${file.name}`;
    const loaded = module.loadGame(romPath);

    if (!loaded) {
      return {
        ok: false,
        romChecksum: '',
        romName: file.name,
        error: 'This file could not be loaded — it may not be a valid GBA ROM.',
      };
    }

    this.romBaseName = baseNameWithoutExt(file.name);
    return { ok: true, romChecksum, romName: file.name };
  }

  pressButton(button: GbaButton): void {
    this.requireModule().buttonPress(BUTTON_TO_INPUT_NAME[button]);
  }

  releaseButton(button: GbaButton): void {
    this.requireModule().buttonUnpress(BUTTON_TO_INPUT_NAME[button]);
  }

  async saveState(): Promise<ArrayBuffer> {
    const module = this.requireModule();
    const { saveStatePath } = module.filePaths();

    const saved = module.saveState(SAVE_STATE_SLOT);
    if (!saved) {
      throw new Error('Emulator core failed to write a save state.');
    }

    // mGBA's C core owns the on-disk save-state filename; find what it just wrote
    // rather than assuming a naming convention (workaround: no JS-exposed path).
    const entries = module.FS.readdir(saveStatePath) as string[];
    const baseName = this.romBaseName ?? '';
    const match = entries.find(
      (name) => name.startsWith(baseName) && name !== '.' && name !== '..',
    );
    if (!match) {
      throw new Error('Save state file was not found after saving.');
    }

    const bytes = module.FS.readFile(`${saveStatePath}/${match}`);
    const copy = bytes.slice();
    return copy.buffer as ArrayBuffer;
  }

  async loadState(blob: ArrayBuffer): Promise<LoadStateResult> {
    const module = this.requireModule();
    const { saveStatePath } = module.filePaths();
    const baseName = this.romBaseName ?? 'state';
    const path = `${saveStatePath}/${baseName}.ss${SAVE_STATE_SLOT}`;

    module.FS.writeFile(path, new Uint8Array(blob));
    const loaded = module.loadState(SAVE_STATE_SLOT);

    if (!loaded) {
      return { ok: false, error: 'This save state could not be loaded.' };
    }
    return { ok: true };
  }

  captureFrameAsPngBase64(): string {
    // mGBA's SDL2/WebGL context has preserveDrawingBuffer: false, so reading the
    // canvas via toDataURL() returns a fully transparent image. Use the core's
    // own screenshot facility (writes a PNG into the virtual FS) instead.
    const module = this.requireModule();
    const fileName = 'ai-current-frame.png';

    if (module.screenshot(fileName)) {
      const { screenshotsPath } = module.filePaths();
      const path = `${screenshotsPath}/${fileName}`;
      try {
        const bytes = module.FS.readFile(path);
        module.FS.unlink(path);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
      } catch {
        // fall through to the canvas fallback below
      }
    }

    if (!this.canvas) {
      throw new Error('Emulator canvas is not attached.');
    }
    return this.canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
  }

  setTrainingSpeed(multiplier: number, frameSkip: number): void {
    const module = this.requireModule();
    if (this.preTrainingFastForward === null) {
      this.preTrainingFastForward = module.getFastForwardMultiplier();
    }
    module.setFastForwardMultiplier(multiplier);
    module.setCoreSettings({ frameSkip, rewindEnable: false, autoSaveStateEnable: false });
  }

  restoreNormalSpeed(): void {
    const module = this.requireModule();
    module.setFastForwardMultiplier(this.preTrainingFastForward ?? 1);
    module.setCoreSettings(NORMAL_CORE_SETTINGS);
  }

  private requireModule(): MgbaModule {
    if (!this.module) {
      throw new Error('Emulator core is not attached to a canvas yet.');
    }
    return this.module;
  }
}

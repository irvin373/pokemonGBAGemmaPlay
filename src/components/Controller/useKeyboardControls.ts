import { useEffect } from 'react';
import type { EmulatorCore } from '../../emulator/types';
import { mapKeyToGbaButton } from '../../emulator/keyboard';

/** Wires keyboard input to the same button path as on-screen/AI input (FR-004). */
export function useKeyboardControls(core: EmulatorCore, onManualInput: () => void): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const button = mapKeyToGbaButton(event.code);
      if (!button) return;
      onManualInput();
      core.pressButton(button);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      const button = mapKeyToGbaButton(event.code);
      if (!button) return;
      core.releaseButton(button);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [core, onManualInput]);
}

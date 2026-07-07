import type { GbaButton } from './types';

export const KEY_TO_GBA_BUTTON: Record<string, GbaButton> = {
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  KeyX: 'A',
  KeyZ: 'B',
  Enter: 'START',
  ShiftRight: 'SELECT',
  KeyA: 'L',
  KeyS: 'R',
};

export function mapKeyToGbaButton(code: string): GbaButton | null {
  return KEY_TO_GBA_BUTTON[code] ?? null;
}

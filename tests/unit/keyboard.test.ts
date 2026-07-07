import { describe, expect, it } from 'vitest';
import { mapKeyToGbaButton } from '../../src/emulator/keyboard';

describe('mapKeyToGbaButton', () => {
  it('maps arrow keys to D-pad buttons', () => {
    expect(mapKeyToGbaButton('ArrowUp')).toBe('UP');
    expect(mapKeyToGbaButton('ArrowDown')).toBe('DOWN');
    expect(mapKeyToGbaButton('ArrowLeft')).toBe('LEFT');
    expect(mapKeyToGbaButton('ArrowRight')).toBe('RIGHT');
  });

  it('maps face and system buttons', () => {
    expect(mapKeyToGbaButton('KeyX')).toBe('A');
    expect(mapKeyToGbaButton('KeyZ')).toBe('B');
    expect(mapKeyToGbaButton('Enter')).toBe('START');
    expect(mapKeyToGbaButton('ShiftRight')).toBe('SELECT');
  });

  it('returns null for unmapped keys', () => {
    expect(mapKeyToGbaButton('KeyQ')).toBeNull();
    expect(mapKeyToGbaButton('Escape')).toBeNull();
  });
});

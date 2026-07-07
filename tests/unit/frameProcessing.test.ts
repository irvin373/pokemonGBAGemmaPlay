import { describe, expect, it } from 'vitest';
import { computeAverageHash } from '../../src/rl/frameProcessing';

function solidFrame(width: number, height: number, value: number): Uint8Array {
  return new Uint8Array(width * height).fill(value);
}

describe('computeAverageHash', () => {
  it('is deterministic for identical pixel input', () => {
    const pixels = new Uint8Array(32 * 32).map((_, i) => (i * 7) % 256);
    expect(computeAverageHash(pixels, 32, 32)).toBe(computeAverageHash(pixels, 32, 32));
  });

  it('produces a 16-character hex string', () => {
    const pixels = solidFrame(32, 32, 128);
    const hash = computeAverageHash(pixels, 32, 32);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('produces different hashes for clearly different frames', () => {
    const dark = solidFrame(32, 32, 10);
    const bright = solidFrame(32, 32, 240);
    const halfSplit = new Uint8Array(32 * 32);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        halfSplit[y * 32 + x] = x < 16 ? 10 : 240;
      }
    }
    expect(computeAverageHash(dark, 32, 32)).not.toBe(computeAverageHash(halfSplit, 32, 32));
    expect(computeAverageHash(bright, 32, 32)).not.toBe(computeAverageHash(halfSplit, 32, 32));
  });

  it('tolerates minor per-pixel noise that does not change which side of the mean a cell falls on', () => {
    // Strong dark/bright contrast (not a knife-edge uniform frame) so small
    // per-pixel noise can't flip any cell across the overall mean.
    const base = new Uint8Array(32 * 32);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        base[y * 32 + x] = x < 16 ? 10 : 240;
      }
    }
    const noisy = base.map((v, i) => v + (i % 2 === 0 ? 3 : -3));
    expect(computeAverageHash(noisy, 32, 32)).toBe(computeAverageHash(base, 32, 32));
  });

  it('throws for dimensions not divisible by the hash grid size', () => {
    const pixels = new Uint8Array(30 * 30);
    expect(() => computeAverageHash(pixels, 30, 30)).toThrow();
  });
});

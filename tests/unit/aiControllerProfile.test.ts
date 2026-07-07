import { describe, expect, it } from 'vitest';
import { clampStyleValue } from '../../src/ai/aiControllerProfile';

describe('clampStyleValue', () => {
  it('clamps values below 0 up to 0', () => {
    expect(clampStyleValue(-0.5)).toBe(0);
  });

  it('clamps values above 1 down to 1', () => {
    expect(clampStyleValue(1.5)).toBe(1);
  });

  it('passes through values already in range', () => {
    expect(clampStyleValue(0.35)).toBe(0.35);
  });
});

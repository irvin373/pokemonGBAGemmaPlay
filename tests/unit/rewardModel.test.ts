import { describe, expect, it } from 'vitest';
import { computeReward, NOVELTY_REWARD, STEP_PENALTY } from '../../src/rl/rewardModel';

describe('computeReward', () => {
  it('rewards discovering a new screen', () => {
    expect(computeReward(true)).toBe(NOVELTY_REWARD);
  });

  it('penalizes a step that discovered nothing new', () => {
    expect(computeReward(false)).toBe(STEP_PENALTY);
  });

  it('novelty reward is positive and the step penalty is negative', () => {
    expect(NOVELTY_REWARD).toBeGreaterThan(0);
    expect(STEP_PENALTY).toBeLessThan(0);
  });
});

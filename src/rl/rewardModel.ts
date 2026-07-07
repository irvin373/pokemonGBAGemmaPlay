/** New-screen bonus vs. per-step penalty (research.md #3) — idling nets
 *  negative reward while net exploration progress is positive. */
export const NOVELTY_REWARD = 1.0;
export const STEP_PENALTY = -0.01;

export function computeReward(isNew: boolean): number {
  return isNew ? NOVELTY_REWARD : STEP_PENALTY;
}

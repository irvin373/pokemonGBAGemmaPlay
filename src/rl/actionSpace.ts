import type { GbaButton } from '../emulator/types';

/**
 * Curated subset of GbaButton for RL (research.md #1). Excludes
 * START/SELECT/L/R — they don't help "see new screens" and only add
 * exploration variance for a screen-novelty reward signal.
 */
export const RL_ACTIONS: readonly GbaButton[] = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'A', 'B'];

export function actionIndexToButton(index: number): GbaButton {
  const button = RL_ACTIONS[index];
  if (!button) throw new Error(`Invalid RL action index: ${index}`);
  return button;
}

export function buttonToActionIndex(button: GbaButton): number {
  return RL_ACTIONS.indexOf(button);
}

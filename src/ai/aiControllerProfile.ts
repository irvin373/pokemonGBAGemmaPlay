import { get, set } from 'idb-keyval';

export interface AIControllerProfile {
  id: string;
  modelName: string;
  /** 0 = fully robotic, 1 = fully human (data-model.md AIControllerProfile). */
  styleValue: number;
}

const STORAGE_KEY = 'ai-controller-profile';

export const DEFAULT_AI_CONTROLLER_PROFILE: AIControllerProfile = {
  id: 'gemma-ollama',
  modelName: '',
  styleValue: 0.5,
};

export function clampStyleValue(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export async function loadAiControllerProfile(): Promise<AIControllerProfile> {
  const stored = await get<AIControllerProfile>(STORAGE_KEY);
  return stored ?? { ...DEFAULT_AI_CONTROLLER_PROFILE };
}

export async function saveAiControllerProfile(profile: AIControllerProfile): Promise<void> {
  await set(STORAGE_KEY, { ...profile, styleValue: clampStyleValue(profile.styleValue) });
}

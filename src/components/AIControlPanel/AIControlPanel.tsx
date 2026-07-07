import { useEffect, useState } from 'react';
import { listOllamaModels, OllamaUnreachableError } from '../../ai/ollamaClient';
import {
  clampStyleValue,
  loadAiControllerProfile,
  saveAiControllerProfile,
  type AIControllerProfile,
} from '../../ai/aiControllerProfile';

interface AIControlPanelProps {
  active: boolean;
  onEnable: (profile: AIControllerProfile) => void;
  onDisable: () => void;
  onError: (message: string) => void;
}

/** Model select, human<->robotic style dial, enable/disable (FR-009, FR-010). */
export function AIControlPanel({ active, onEnable, onDisable, onError }: AIControlPanelProps) {
  const [models, setModels] = useState<string[]>([]);
  const [profile, setProfile] = useState<AIControllerProfile | null>(null);

  useEffect(() => {
    loadAiControllerProfile().then(setProfile);
  }, []);

  useEffect(() => {
    listOllamaModels()
      .then((list) => setModels(list.map((m) => m.name)))
      .catch((error) => {
        if (error instanceof OllamaUnreachableError) onError(error.message);
      });
  }, [onError]);

  if (!profile) return null;

  const updateProfile = async (patch: Partial<AIControllerProfile>) => {
    const next = { ...profile, ...patch };
    setProfile(next);
    await saveAiControllerProfile(next);
  };

  const handleToggle = () => {
    if (active) {
      onDisable();
      return;
    }
    if (!profile.modelName) {
      onError('Select an AI model before enabling autoplay.');
      return;
    }
    if (!models.includes(profile.modelName)) {
      onError(`Model "${profile.modelName}" is not available in your local Ollama instance.`);
      return;
    }
    onEnable(profile);
  };

  return (
    <div data-testid="ai-control-panel">
      <label htmlFor="ai-model-select">AI model</label>
      <select
        id="ai-model-select"
        value={profile.modelName}
        onChange={(e) => void updateProfile({ modelName: e.target.value })}
        disabled={active}
      >
        <option value="">Select a model…</option>
        {models.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>

      <label htmlFor="ai-style-dial">More robotic ↔ More human</label>
      <input
        id="ai-style-dial"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={profile.styleValue}
        onChange={(e) => void updateProfile({ styleValue: clampStyleValue(Number(e.target.value)) })}
      />

      <button type="button" onClick={handleToggle}>
        {active ? 'Take Over' : 'Enable Autoplay'}
      </button>
    </div>
  );
}

import { useState } from 'react';

interface RLTrainingPanelProps {
  status: 'stopped' | 'running' | 'paused';
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onSavePolicy: (label: string) => Promise<void>;
}

/** Start/pause/resume/reset controls for RL training (FR-002, US1), plus
 *  saving the current policy under a name (FR-006, US2). */
export function RLTrainingPanel({
  status,
  onStart,
  onPause,
  onResume,
  onReset,
  onSavePolicy,
}: RLTrainingPanelProps) {
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const handleSave = async () => {
    if (!label.trim()) return;
    setSaving(true);
    setConfirmation(null);
    try {
      await onSavePolicy(label.trim());
      setConfirmation(`Saved "${label.trim()}".`);
      setLabel('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="rl-training-panel">
      {status === 'stopped' && (
        <button type="button" onClick={onStart}>
          Start Training
        </button>
      )}
      {status === 'running' && (
        <button type="button" onClick={onPause}>
          Pause
        </button>
      )}
      {status === 'paused' && (
        <button type="button" onClick={onResume}>
          Resume
        </button>
      )}
      {(status === 'running' || status === 'paused') && (
        <button type="button" onClick={onReset}>
          Reset
        </button>
      )}

      {status !== 'stopped' && (
        <div data-testid="rl-save-policy">
          <input
            aria-label="Policy name"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Policy name"
            disabled={saving}
          />
          <button type="button" onClick={() => void handleSave()} disabled={saving || !label.trim()}>
            Save Policy
          </button>
          {confirmation && <p role="status">{confirmation}</p>}
        </div>
      )}
    </div>
  );
}

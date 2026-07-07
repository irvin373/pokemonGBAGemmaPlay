import { useState } from 'react';
import type { EmulatorCore } from '../../emulator/types';
import { createSaveState } from '../../storage/saveStates';

interface SaveStatePanelProps {
  core: EmulatorCore;
  romChecksum: string;
  onSaved: () => void;
}

/** "Save State" action (FR-005, FR-007). */
export function SaveStatePanel({ core, romChecksum, onSaved }: SaveStatePanelProps) {
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const handleSave = async () => {
    if (!label.trim()) return;
    setSaving(true);
    setConfirmation(null);
    try {
      const blob = await core.saveState();
      await createSaveState(romChecksum, label.trim(), blob);
      setConfirmation(`Saved "${label.trim()}".`);
      setLabel('');
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="save-state-panel">
      <input
        aria-label="Save state label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Save name"
        disabled={saving}
      />
      <button type="button" onClick={handleSave} disabled={saving || !label.trim()}>
        Save State
      </button>
      {confirmation && <p role="status">{confirmation}</p>}
    </div>
  );
}

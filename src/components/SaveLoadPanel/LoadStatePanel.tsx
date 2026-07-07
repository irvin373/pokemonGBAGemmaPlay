import { useEffect, useState } from 'react';
import type { EmulatorCore } from '../../emulator/types';
import { listAllSaveStates, type SaveState } from '../../storage/saveStates';

interface LoadStatePanelProps {
  core: EmulatorCore;
  romChecksum: string;
  onLoaded: () => void;
  onError: (message: string) => void;
  refreshKey: number;
}

/** "Load State" list + load flow, with ROM-mismatch warning (FR-006, spec edge case). */
export function LoadStatePanel({ core, romChecksum, onLoaded, onError, refreshKey }: LoadStatePanelProps) {
  const [saveStates, setSaveStates] = useState<SaveState[]>([]);
  const [pendingMismatch, setPendingMismatch] = useState<SaveState | null>(null);

  useEffect(() => {
    listAllSaveStates().then(setSaveStates);
  }, [refreshKey]);

  const applyLoad = async (saveState: SaveState) => {
    const result = await core.loadState(saveState.emulatorStateBlob);
    if (result.ok) {
      onLoaded();
    } else {
      onError(result.error ?? 'This save state could not be loaded.');
    }
  };

  const handleLoad = (saveState: SaveState) => {
    if (saveState.romChecksum !== romChecksum) {
      setPendingMismatch(saveState);
      return;
    }
    void applyLoad(saveState);
  };

  return (
    <div data-testid="load-state-panel">
      <ul>
        {saveStates.map((saveState) => (
          <li key={saveState.id}>
            {saveState.label} ({new Date(saveState.createdAt).toLocaleString()})
            <button type="button" onClick={() => handleLoad(saveState)}>
              Load
            </button>
          </li>
        ))}
      </ul>
      {pendingMismatch && (
        <div role="alertdialog" data-testid="rom-mismatch-warning">
          <p>
            "{pendingMismatch.label}" was saved with a different ROM than the one currently
            loaded. Loading it may not work correctly. Continue anyway?
          </p>
          <button
            type="button"
            onClick={() => {
              void applyLoad(pendingMismatch);
              setPendingMismatch(null);
            }}
          >
            Load anyway
          </button>
          <button type="button" onClick={() => setPendingMismatch(null)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

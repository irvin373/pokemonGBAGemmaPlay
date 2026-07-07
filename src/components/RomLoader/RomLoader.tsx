import { useRef, useState } from 'react';
import type { EmulatorCore } from '../../emulator/types';
import type { GameSession } from '../../services/gameSession';

interface RomLoaderProps {
  core: EmulatorCore;
  session: GameSession;
}

/** ROM file picker + load flow (FR-001, FR-014). */
export function RomLoader({ core, session }: RomLoaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    try {
      const result = await core.loadRom(file);
      if (result.ok) {
        session.romLoaded(result.romChecksum, result.romName);
      } else {
        session.romLoadFailed(result.romName, result.error ?? 'Failed to load ROM.');
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div data-testid="rom-loader">
      <label htmlFor="rom-file-input">Load your own Pokemon FireRed ROM (.gba)</label>
      <input
        id="rom-file-input"
        ref={inputRef}
        type="file"
        accept=".gba,.gbc,.gb,.zip,.7z"
        disabled={busy}
        onChange={handleChange}
      />
    </div>
  );
}

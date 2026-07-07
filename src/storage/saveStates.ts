import { get, set, del, keys } from 'idb-keyval';

export interface SaveState {
  id: string;
  romChecksum: string;
  label: string;
  createdAt: string;
  emulatorStateBlob: ArrayBuffer;
}

const KEY_PREFIX = 'save-state:';

function keyFor(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

/** SaveState CRUD over IndexedDB (data-model.md SaveState, FR-005/006/007). */
export async function createSaveState(
  romChecksum: string,
  label: string,
  emulatorStateBlob: ArrayBuffer,
): Promise<SaveState> {
  const saveState: SaveState = {
    id: crypto.randomUUID(),
    romChecksum,
    label,
    createdAt: new Date().toISOString(),
    emulatorStateBlob,
  };
  await set(keyFor(saveState.id), saveState);
  return saveState;
}

export async function listAllSaveStates(): Promise<SaveState[]> {
  const allKeys = await keys();
  const saveStates: SaveState[] = [];
  for (const key of allKeys) {
    if (typeof key !== 'string' || !key.startsWith(KEY_PREFIX)) continue;
    const saveState = await get<SaveState>(key);
    if (saveState) saveStates.push(saveState);
  }
  return saveStates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Save states for the currently loaded ROM — no mismatch warning needed for these. */
export async function listSaveStatesForRom(romChecksum: string): Promise<SaveState[]> {
  const all = await listAllSaveStates();
  return all.filter((saveState) => saveState.romChecksum === romChecksum);
}

export async function deleteSaveState(id: string): Promise<void> {
  await del(keyFor(id));
}

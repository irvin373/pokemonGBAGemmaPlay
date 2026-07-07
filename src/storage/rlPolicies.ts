import { get, set, del, keys } from 'idb-keyval';
import type * as tfTypes from '@tensorflow/tfjs';

export interface RLPolicyMeta {
  id: string;
  romChecksum: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  episodesTrained: number;
  totalSteps: number;
}

const KEY_PREFIX = 'rl-policy:';
const MODEL_URL_PREFIX = 'indexeddb://rl-policy-model/';

function keyFor(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

function modelUrlFor(id: string): string {
  return `${MODEL_URL_PREFIX}${id}`;
}

/**
 * RL policy CRUD (contracts/rl-policy-storage.md): model topology + weights
 * persist via TF.js's own `indexeddb://` scheme (a separate DB namespace),
 * metadata persists in the app's existing idb-keyval store, joined by `id`.
 */
export async function saveRLPolicy(
  model: tfTypes.LayersModel,
  romChecksum: string,
  label: string,
  trainingSnapshot: { episodesTrained: number; totalSteps: number },
  existingId?: string,
): Promise<RLPolicyMeta> {
  const id = existingId ?? crypto.randomUUID();
  await model.save(modelUrlFor(id));

  const now = new Date().toISOString();
  const existing = existingId ? await get<RLPolicyMeta>(keyFor(existingId)) : undefined;

  const meta: RLPolicyMeta = {
    id,
    romChecksum,
    label: existing?.label ?? label,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    episodesTrained: trainingSnapshot.episodesTrained,
    totalSteps: trainingSnapshot.totalSteps,
  };
  await set(keyFor(id), meta);
  return meta;
}

export async function loadRLPolicyModel(id: string): Promise<tfTypes.LayersModel> {
  const tf = await import('@tensorflow/tfjs');
  try {
    return await tf.loadLayersModel(modelUrlFor(id));
  } catch (error) {
    throw new Error(
      `Saved RL policy weights for "${id}" could not be loaded — they may be missing or corrupted.`,
      { cause: error },
    );
  }
}

export async function listAllRLPolicies(): Promise<RLPolicyMeta[]> {
  const allKeys = await keys();
  const policies: RLPolicyMeta[] = [];
  for (const key of allKeys) {
    if (typeof key !== 'string' || !key.startsWith(KEY_PREFIX)) continue;
    const meta = await get<RLPolicyMeta>(key);
    if (meta) policies.push(meta);
  }
  return policies.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listRLPoliciesForRom(romChecksum: string): Promise<RLPolicyMeta[]> {
  const all = await listAllRLPolicies();
  return all.filter((policy) => policy.romChecksum === romChecksum);
}

/** Removes both the idb-keyval metadata AND the TF.js model artifacts —
 *  a partial delete would leave orphaned state either direction. */
export async function deleteRLPolicy(id: string): Promise<void> {
  const tf = await import('@tensorflow/tfjs');
  const results = await Promise.allSettled([
    del(keyFor(id)),
    tf.io.removeModel(modelUrlFor(id)),
  ]);
  const failure = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  if (failure) throw failure.reason;
}

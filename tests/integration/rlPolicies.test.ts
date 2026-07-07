import { beforeAll, describe, expect, it } from 'vitest';
import type * as tfTypes from '@tensorflow/tfjs';
import {
  saveRLPolicy,
  loadRLPolicyModel,
  listAllRLPolicies,
  listRLPoliciesForRom,
  deleteRLPolicy,
} from '../../src/storage/rlPolicies';

let tf: typeof tfTypes;

function makeTinyModel(): tfTypes.LayersModel {
  return tf.sequential({
    layers: [tf.layers.dense({ inputShape: [2], units: 2 })],
  });
}

describe('rlPolicies storage (idb-keyval metadata + TF.js indexeddb:// weights)', () => {
  beforeAll(async () => {
    tf = await import('@tensorflow/tfjs');
    await tf.setBackend('cpu');
    await tf.ready();
  });

  it('saves a new policy and lists it', async () => {
    const model = makeTinyModel();
    const meta = await saveRLPolicy(model, 'rom-a', 'first-policy', {
      episodesTrained: 3,
      totalSteps: 100,
    });

    expect(meta.romChecksum).toBe('rom-a');
    expect(meta.label).toBe('first-policy');
    expect(meta.createdAt).toBe(meta.updatedAt);

    const all = await listAllRLPolicies();
    expect(all.some((p) => p.id === meta.id)).toBe(true);
  });

  it('filters policies by romChecksum (FR-012 support)', async () => {
    const modelA = makeTinyModel();
    const modelB = makeTinyModel();
    const metaA = await saveRLPolicy(modelA, 'rom-x', 'policy-x', {
      episodesTrained: 1,
      totalSteps: 10,
    });
    await saveRLPolicy(modelB, 'rom-y', 'policy-y', { episodesTrained: 1, totalSteps: 10 });

    const forRomX = await listRLPoliciesForRom('rom-x');
    expect(forRomX.map((p) => p.id)).toContain(metaA.id);
    expect(forRomX.every((p) => p.romChecksum === 'rom-x')).toBe(true);
  });

  it('loads back a saved model that can run inference', async () => {
    const model = makeTinyModel();
    const meta = await saveRLPolicy(model, 'rom-b', 'loadable-policy', {
      episodesTrained: 2,
      totalSteps: 50,
    });

    const loaded = await loadRLPolicyModel(meta.id);
    const output = loaded.predict(tf.zeros([1, 2])) as tfTypes.Tensor;
    expect(output.shape).toEqual([1, 2]);
    output.dispose();
  });

  it('updates in place (preserving createdAt) when saving with an existing id', async () => {
    const model = makeTinyModel();
    const meta = await saveRLPolicy(model, 'rom-c', 'v1', { episodesTrained: 1, totalSteps: 10 });

    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = await saveRLPolicy(
      makeTinyModel(),
      'rom-c',
      'v1',
      { episodesTrained: 4, totalSteps: 40 },
      meta.id,
    );

    expect(updated.id).toBe(meta.id);
    expect(updated.createdAt).toBe(meta.createdAt);
    expect(updated.episodesTrained).toBe(4);

    const all = await listAllRLPolicies();
    expect(all.filter((p) => p.id === meta.id)).toHaveLength(1);
  });

  it('deletes both metadata and model weights', async () => {
    const model = makeTinyModel();
    const meta = await saveRLPolicy(model, 'rom-d', 'to-delete', {
      episodesTrained: 1,
      totalSteps: 10,
    });

    await deleteRLPolicy(meta.id);

    const all = await listAllRLPolicies();
    expect(all.some((p) => p.id === meta.id)).toBe(false);
    await expect(loadRLPolicyModel(meta.id)).rejects.toThrow();
  });
});

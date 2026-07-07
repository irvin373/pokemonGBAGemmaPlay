export type TfBackendKind = 'webgpu' | 'webgl' | 'cpu';

export interface TfBackendResult {
  backend: TfBackendKind;
  /** True when running on a slower fallback (no GPU acceleration, FR-011). */
  degraded: boolean;
}

let cached: TfBackendResult | null = null;

/**
 * Lazily initializes TensorFlow.js, trying webgpu -> webgl -> cpu in order.
 * Never hard-blocks (research.md #8, FR-011) — cpu always succeeds, so the
 * only failure mode is TF.js itself failing to load at all.
 */
export async function initTfBackend(): Promise<TfBackendResult> {
  if (cached) return cached;

  const tf = await import('@tensorflow/tfjs');

  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      await import('@tensorflow/tfjs-backend-webgpu');
      await tf.setBackend('webgpu');
      await tf.ready();
      cached = { backend: 'webgpu', degraded: false };
      return cached;
    } catch {
      // fall through to webgl
    }
  }

  try {
    await tf.setBackend('webgl');
    await tf.ready();
    cached = { backend: 'webgl', degraded: false };
    return cached;
  } catch {
    // fall through to cpu
  }

  await tf.setBackend('cpu');
  await tf.ready();
  cached = { backend: 'cpu', degraded: true };
  return cached;
}

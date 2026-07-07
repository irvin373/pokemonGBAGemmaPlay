import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmulatorCore } from '../../src/emulator/types';

vi.mock('../../src/rl/backend', () => ({
  initTfBackend: vi.fn().mockResolvedValue({ backend: 'cpu', degraded: true }),
}));

vi.mock('../../src/rl/frameProcessing', () => ({
  captureDownsampledFrame: vi.fn().mockResolvedValue(new Uint8Array(32 * 32).fill(100)),
  computeAverageHash: vi.fn().mockReturnValue('deadbeef'),
}));

vi.mock('../../src/rl/dqnAgent', () => {
  class DqnAgent {
    init = vi.fn().mockResolvedValue(undefined);
    loadFrom = vi.fn().mockResolvedValue(undefined);
    selectAction = vi.fn().mockResolvedValue(0);
    trainStep = vi.fn().mockResolvedValue(0);
    getEpsilon = vi.fn().mockReturnValue(0.5);
    getModel = vi.fn();
    syncTargetWeights = vi.fn();
  }
  return { DqnAgent };
});

// Imported after the mocks above so trainingController picks up mocked deps.
const { RLTrainingController } = await import('../../src/rl/trainingController');

/** start() defers scheduling its first tick until two chained promises
 *  resolve (initTfBackend, agent.init); flush those microtasks explicitly
 *  rather than relying on fake-timer tick execution to happen to run one. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function makeCore(): EmulatorCore {
  return {
    attach: vi.fn(),
    loadRom: vi.fn(),
    pressButton: vi.fn(),
    releaseButton: vi.fn(),
    saveState: vi.fn(),
    loadState: vi.fn(),
    captureFrameAsPngBase64: vi.fn(() => 'fake-base64'),
    setTrainingSpeed: vi.fn(),
    restoreNormalSpeed: vi.fn(),
  };
}

describe('RLTrainingController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // clearAllMocks (not restoreAllMocks): these vi.fn()s live inside vi.mock
    // factories rather than spying on a real module, so "restoring" them
    // reverts to a bare stub with no return value, breaking later tests.
    vi.clearAllMocks();
  });

  it('accelerates the emulator on start and begins emitting running metrics', async () => {
    const core = makeCore();
    const onMetrics = vi.fn();
    const controller = new RLTrainingController(core, onMetrics, vi.fn());

    controller.start();
    await vi.runOnlyPendingTimersAsync();

    expect(core.setTrainingSpeed).toHaveBeenCalled();
    expect(onMetrics).toHaveBeenCalledWith(expect.objectContaining({ status: 'running' }));

    controller.dispose();
  });

  it('restores normal speed and stops ticking on pause', async () => {
    const core = makeCore();
    const controller = new RLTrainingController(core, vi.fn(), vi.fn());

    controller.start();
    await flushMicrotasks();
    controller.pause();

    expect(core.restoreNormalSpeed).toHaveBeenCalled();

    const pressCallsAtPause = (core.pressButton as ReturnType<typeof vi.fn>).mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect((core.pressButton as ReturnType<typeof vi.fn>).mock.calls.length).toBe(pressCallsAtPause);

    controller.dispose();
  });

  it('resumes ticking after pause without resetting progress', async () => {
    const core = makeCore();
    const onMetrics = vi.fn();
    const onError = vi.fn();
    const controller = new RLTrainingController(core, onMetrics, onError);

    controller.start();
    await flushMicrotasks();
    controller.pause();

    controller.resume();
    await vi.runOnlyPendingTimersAsync();

    expect(onError).not.toHaveBeenCalled();
    const ranAfterResume = onMetrics.mock.calls.some(
      ([metrics]) => metrics.status === 'running' && metrics.totalSteps >= 1,
    );
    expect(ranAfterResume).toBe(true);

    controller.dispose();
  });

  it('reset() zeroes metrics and restores normal speed', async () => {
    const core = makeCore();
    const onMetrics = vi.fn();
    const controller = new RLTrainingController(core, onMetrics, vi.fn());

    controller.start();
    await vi.runOnlyPendingTimersAsync();
    controller.reset();

    expect(core.restoreNormalSpeed).toHaveBeenCalled();
    expect(onMetrics).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'stopped', episodeCount: 0, totalSteps: 0 }),
    );

    controller.dispose();
  });

  it('auto-pauses training when the tab becomes hidden (FR-014)', async () => {
    const core = makeCore();
    const controller = new RLTrainingController(core, vi.fn(), vi.fn());

    controller.start();
    await flushMicrotasks();

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(core.restoreNormalSpeed).toHaveBeenCalled();

    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    controller.dispose();
  });
});

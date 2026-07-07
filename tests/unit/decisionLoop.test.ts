import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DecisionLoop } from '../../src/ai/decisionLoop';
import * as ollamaClient from '../../src/ai/ollamaClient';
import type { EmulatorCore } from '../../src/emulator/types';
import type { AIControllerProfile } from '../../src/ai/aiControllerProfile';

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

describe('DecisionLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('passes styleValue as the Ollama sampling temperature (research.md #3)', async () => {
    const core = makeCore();
    const profile: AIControllerProfile = { id: 'p', modelName: 'gemma3', styleValue: 0.75 };
    const spy = vi
      .spyOn(ollamaClient, 'requestNextButton')
      .mockResolvedValue({ button: 'A', message: 'A' });

    const loop = new DecisionLoop(core, () => profile, vi.fn());
    loop.start();
    await vi.runOnlyPendingTimersAsync();

    expect(spy).toHaveBeenCalledWith('gemma3', 'fake-base64', 0.75);
    loop.stop();
  });

  it('presses and later releases the returned button', async () => {
    const core = makeCore();
    const profile: AIControllerProfile = { id: 'p', modelName: 'gemma3', styleValue: 0 };
    vi.spyOn(ollamaClient, 'requestNextButton').mockResolvedValue({ button: 'A', message: 'A' });

    const loop = new DecisionLoop(core, () => profile, vi.fn());
    loop.start();
    await vi.runOnlyPendingTimersAsync();

    expect(core.pressButton).toHaveBeenCalledWith('A');
    await vi.advanceTimersByTimeAsync(200);
    expect(core.releaseButton).toHaveBeenCalledWith('A');
    loop.stop();
  });

  it('treats an unrecognized response as a no-op (spec edge case)', async () => {
    const core = makeCore();
    const profile: AIControllerProfile = { id: 'p', modelName: 'gemma3', styleValue: 0 };
    vi.spyOn(ollamaClient, 'requestNextButton').mockResolvedValue({
      button: null,
      message: "I'm not sure what to press here.",
    });

    const loop = new DecisionLoop(core, () => profile, vi.fn());
    loop.start();
    await vi.runOnlyPendingTimersAsync();

    expect(core.pressButton).not.toHaveBeenCalled();
    loop.stop();
  });

  it('forwards the model full raw message to onMessage (for display in the UI)', async () => {
    const core = makeCore();
    const profile: AIControllerProfile = { id: 'p', modelName: 'gemma3', styleValue: 0 };
    vi.spyOn(ollamaClient, 'requestNextButton').mockResolvedValue({
      button: 'RIGHT',
      message: "I'll walk RIGHT toward the tall grass to look for wild Pokemon.",
    });
    const onMessage = vi.fn();

    const loop = new DecisionLoop(core, () => profile, vi.fn(), onMessage);
    loop.start();
    await vi.runOnlyPendingTimersAsync();

    expect(onMessage).toHaveBeenCalledWith(
      "I'll walk RIGHT toward the tall grass to look for wild Pokemon.",
    );
    loop.stop();
  });

  it('reports an error and stops when the AI backend is unreachable (FR-013)', async () => {
    const core = makeCore();
    const profile: AIControllerProfile = { id: 'p', modelName: 'gemma3', styleValue: 0 };
    vi.spyOn(ollamaClient, 'requestNextButton').mockRejectedValue(
      new ollamaClient.OllamaUnreachableError(),
    );
    const onError = vi.fn();

    const loop = new DecisionLoop(core, () => profile, onError);
    loop.start();
    await vi.runOnlyPendingTimersAsync();

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('unreachable'));
  });
});

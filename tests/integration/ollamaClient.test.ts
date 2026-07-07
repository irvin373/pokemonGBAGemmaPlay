import { afterEach, describe, expect, it, vi } from 'vitest';
import { listOllamaModels, requestNextButton, OllamaUnreachableError } from '../../src/ai/ollamaClient';

describe('ollamaClient against a mocked local Ollama endpoint', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists installed models from GET /api/tags', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ models: [{ name: 'gemma3:vision' }] }),
      }),
    );

    const models = await listOllamaModels();
    expect(models).toEqual([{ name: 'gemma3:vision' }]);
  });

  it('throws OllamaUnreachableError when the endpoint cannot be reached (FR-013)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    await expect(listOllamaModels()).rejects.toBeInstanceOf(OllamaUnreachableError);
  });

  it('parses a recognized button from POST /api/generate and returns the raw message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: 'a' }),
      }),
    );

    const decision = await requestNextButton('gemma3:vision', 'base64frame', 0.2);
    expect(decision).toEqual({ button: 'A', message: 'a' });
  });

  it('returns a null button (but still the raw message) for an unrecognized response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: 'not a button' }),
      }),
    );

    const decision = await requestNextButton('gemma3:vision', 'base64frame', 0.2);
    expect(decision).toEqual({ button: null, message: 'not a button' });
  });

  it('extracts a multi-letter button from a wordy response', async () => {
    const message = "I'll walk LEFT toward the tall grass to find a wild Pokemon.";
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: message }),
      }),
    );

    const decision = await requestNextButton('gemma3:vision', 'base64frame', 0.2);
    expect(decision).toEqual({ button: 'LEFT', message });
  });

  it('parses a single-letter button from the labeled BUTTON line with reasoning present', async () => {
    const message = 'The dialogue box is open, so I will advance it.\nBUTTON: A';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: message }),
      }),
    );

    const decision = await requestNextButton('gemma3:vision', 'base64frame', 0.2);
    expect(decision).toEqual({ button: 'A', message });
  });

  it('prefers the labeled BUTTON line over button names in the reasoning text', async () => {
    const message = 'I could go LEFT, but the grass is to the right.\nBUTTON: RIGHT';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: message }),
      }),
    );

    const decision = await requestNextButton('gemma3:vision', 'base64frame', 0.2);
    expect(decision).toEqual({ button: 'RIGHT', message });
  });

  it('does not mistake the word "a" inside a sentence for the A button', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: 'I should press a button to continue.' }),
      }),
    );

    const decision = await requestNextButton('gemma3:vision', 'base64frame', 0.2);
    expect(decision.button).toBeNull();
  });
});

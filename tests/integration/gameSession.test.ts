import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/services/gameSession';

describe('GameSession control-mode mutual exclusion (FR-009)', () => {
  it('starts idle/manual with no active controller', () => {
    const session = new GameSession();
    expect(session.getState().controlMode).toBe('manual');
    expect(session.getState().activeController).toEqual({ type: 'none' });
  });

  it('enabling the LLM controller after a ROM loads sets exactly that controller', () => {
    const session = new GameSession();
    session.romLoaded('checksum', 'rom.gba');
    session.enableLlmControl('profile-1');

    expect(session.getState().controlMode).toBe('ai-llm');
    expect(session.getState().activeController).toEqual({ type: 'llm', profileId: 'profile-1' });
  });

  it('starting RL training replaces the LLM controller rather than layering it', () => {
    const session = new GameSession();
    session.romLoaded('checksum', 'rom.gba');
    session.enableLlmControl('profile-1');
    session.startRlTraining(null);

    expect(session.getState().controlMode).toBe('rl-training');
    expect(session.getState().activeController).toEqual({ type: 'rl-training', policyId: null });
  });

  it('enabling RL inference replaces RL training rather than coexisting with it', () => {
    const session = new GameSession();
    session.romLoaded('checksum', 'rom.gba');
    session.startRlTraining(null);
    session.enableRlInference('policy-1');

    expect(session.getState().controlMode).toBe('rl-inference');
    expect(session.getState().activeController).toEqual({ type: 'rl-inference', policyId: 'policy-1' });
  });

  it('takeManualControl preempts any of the three non-manual modes', () => {
    for (const activate of [
      (s: GameSession) => s.enableLlmControl('p'),
      (s: GameSession) => s.startRlTraining(null),
      (s: GameSession) => s.enableRlInference('p'),
    ]) {
      const session = new GameSession();
      session.romLoaded('checksum', 'rom.gba');
      activate(session);
      session.takeManualControl();

      expect(session.getState().controlMode).toBe('manual');
      expect(session.getState().activeController).toEqual({ type: 'none' });
    }
  });

  it('none of the non-manual controllers can be enabled before a ROM is running', () => {
    const session = new GameSession();
    session.enableLlmControl('profile-1');
    session.startRlTraining(null);
    session.enableRlInference('policy-1');

    expect(session.getState().controlMode).toBe('manual');
  });

  it('reportError forces control back to manual with no active controller', () => {
    const session = new GameSession();
    session.romLoaded('checksum', 'rom.gba');
    session.enableRlInference('policy-1');
    session.reportError('boom');

    expect(session.getState().controlMode).toBe('manual');
    expect(session.getState().activeController).toEqual({ type: 'none' });
    expect(session.getState().status).toBe('error');
  });
});

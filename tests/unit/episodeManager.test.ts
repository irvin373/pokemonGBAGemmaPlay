import { describe, expect, it } from 'vitest';
import { EpisodeManager } from '../../src/rl/episodeManager';

describe('EpisodeManager', () => {
  it('accumulates reward within an episode without ending it', () => {
    const manager = new EpisodeManager();
    const ended = manager.recordStep(1, true);
    expect(ended).toBe(false);
    expect(manager.getState().episodeReward).toBe(1);
    expect(manager.getState().episodeCount).toBe(0);
  });

  it('ends an episode after STUCK_STEP_THRESHOLD consecutive non-novel steps', () => {
    const manager = new EpisodeManager();
    let ended = false;
    for (let i = 0; i < 150; i++) {
      ended = manager.recordStep(-0.01, false);
    }
    expect(ended).toBe(true);
    expect(manager.getState().episodeCount).toBe(1);
    // episode reward resets after the boundary
    expect(manager.getState().episodeReward).toBe(0);
  });

  it('ends an episode after EPISODE_MAX_STEPS even with continued novelty', () => {
    const manager = new EpisodeManager();
    let ended = false;
    for (let i = 0; i < 1000; i++) {
      ended = manager.recordStep(1, true);
    }
    expect(ended).toBe(true);
    expect(manager.getState().episodeCount).toBe(1);
  });

  it('pushes completed-episode reward into rewardHistory', () => {
    const manager = new EpisodeManager();
    for (let i = 0; i < 1000; i++) manager.recordStep(1, true);
    expect(manager.getState().rewardHistory).toEqual([1000]);
  });

  it('clears episode count, reward, and history on reset', () => {
    const manager = new EpisodeManager();
    for (let i = 0; i < 1000; i++) manager.recordStep(1, true);
    manager.reset();
    const state = manager.getState();
    expect(state.episodeCount).toBe(0);
    expect(state.episodeReward).toBe(0);
    expect(state.rewardHistory).toEqual([]);
  });
});

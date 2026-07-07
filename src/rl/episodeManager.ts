const EPISODE_MAX_STEPS = 1000;
const STUCK_STEP_THRESHOLD = 150;
const REWARD_HISTORY_CAPACITY = 500;

export interface EpisodeManagerState {
  episodeCount: number;
  episodeReward: number;
  rewardHistory: number[]; // capped, most recent last
}

/**
 * Episode boundary as a bookkeeping construct, not a literal game reset
 * (research.md #5): ends at EPISODE_MAX_STEPS OR STUCK_STEP_THRESHOLD
 * consecutive non-novel steps, whichever first. Never touches the game or
 * NoveltyMemory/ReplayBuffer — only the explicit user Reset does that.
 */
export class EpisodeManager {
  private episodeCount = 0;
  private episodeReward = 0;
  private stepsInEpisode = 0;
  private stepsSinceLastNovelHash = 0;
  private rewardHistory: number[] = [];

  /** Records one decision-tick's reward/novelty outcome. Returns true if
   *  this step ended the current episode. */
  recordStep(reward: number, isNovel: boolean): boolean {
    this.episodeReward += reward;
    this.stepsInEpisode++;
    this.stepsSinceLastNovelHash = isNovel ? 0 : this.stepsSinceLastNovelHash + 1;

    const ended =
      this.stepsInEpisode >= EPISODE_MAX_STEPS ||
      this.stepsSinceLastNovelHash >= STUCK_STEP_THRESHOLD;

    if (ended) {
      this.rewardHistory.push(this.episodeReward);
      if (this.rewardHistory.length > REWARD_HISTORY_CAPACITY) {
        this.rewardHistory.shift();
      }
      this.episodeCount++;
      this.episodeReward = 0;
      this.stepsInEpisode = 0;
      this.stepsSinceLastNovelHash = 0;
    }

    return ended;
  }

  getState(): EpisodeManagerState {
    return {
      episodeCount: this.episodeCount,
      episodeReward: this.episodeReward,
      rewardHistory: [...this.rewardHistory],
    };
  }

  /** Clears episode count, current-episode reward, and reward history.
   *  Only called by the explicit user-triggered Reset (US1 AC5). */
  reset(): void {
    this.episodeCount = 0;
    this.episodeReward = 0;
    this.stepsInEpisode = 0;
    this.stepsSinceLastNovelHash = 0;
    this.rewardHistory = [];
  }
}

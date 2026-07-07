/** One recorded step for replay (data-model.md: feeds ReplayBuffer/DqnAgent). */
export interface Transition {
  state: Float32Array;
  actionIndex: number;
  reward: number;
  nextState: Float32Array;
}

/** Snapshot of a completed episode (data-model.md Training Session.rewardHistory). */
export interface EpisodeStats {
  episodeIndex: number;
  totalReward: number;
  steps: number;
}

/** Config for constructing/initializing a DqnAgent (research.md #1). */
export interface RLPolicyConfig {
  actionCount: number;
  inputWidth: number;
  inputHeight: number;
}

import type { EmulatorCore } from '../emulator/types';
import type { GbaButton } from '../emulator/types';
import { RL_ACTIONS, actionIndexToButton } from './actionSpace';
import { captureDownsampledFrame, computeAverageHash } from './frameProcessing';
import { NoveltyMemory } from './noveltyMemory';
import { ReplayBuffer } from './replayBuffer';
import { computeReward } from './rewardModel';
import { EpisodeManager } from './episodeManager';
import { DqnAgent } from './dqnAgent';
import { initTfBackend } from './backend';
import type { Transition } from './types';

export const FRAME_SIZE = 32; // divisible by 8 (frameProcessing's hash grid)
const DECISION_INTERVAL_MS = 120;
const BUTTON_HOLD_MS = 80;
const BATCH_SIZE = 32;
const MIN_REPLAY_SIZE = 200;
const NOVELTY_RATE_WINDOW = 100;
const NOVELTY_RATE_HISTORY_CAPACITY = 500;
const TRAINING_FF_MULTIPLIER = 4;
const TRAINING_FRAME_SKIP = 2;

export interface TrainingMetrics {
  status: 'stopped' | 'running' | 'paused';
  episodeCount: number;
  episodeReward: number;
  rewardHistory: number[];
  totalSteps: number;
  noveltyDiscoveryRate: number;
  /** noveltyDiscoveryRate sampled at each episode boundary (capped, most
   *  recent last) — lets the UI show a trend, not just the instantaneous
   *  rate (US3 AC2: stagnation should be visible as a flattening line). */
  noveltyRateHistory: number[];
}

type Mode = 'train' | 'infer';

/**
 * RL training/inference orchestrator (contracts/rl-training-controller-interface.md).
 * Runs on its own setTimeout cadence, decoupled from the emulator's render
 * loop and React's render cycle — mirrors src/ai/decisionLoop.ts's pattern
 * for the LLM controller.
 */
export class RLTrainingController {
  private agent: DqnAgent | null = null;
  private mode: Mode = 'train';
  private status: TrainingMetrics['status'] = 'stopped';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private wasRunningBeforeHidden = false;

  private noveltyMemory = new NoveltyMemory();
  private replayBuffer = new ReplayBuffer();
  private episodeManager = new EpisodeManager();
  private totalSteps = 0;
  private recentNovelty: boolean[] = [];
  private noveltyRateHistory: number[] = [];

  private prevState: Float32Array | null = null;
  private prevActionIndex: number | null = null;

  constructor(
    private readonly core: EmulatorCore,
    private readonly onMetrics: (metrics: TrainingMetrics) => void,
    private readonly onError: (message: string) => void,
  ) {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  start(): void {
    if (this.status === 'running') return;
    this.mode = 'train';
    void this.beginTraining();
  }

  /** Injects an already-loaded agent (e.g. from storage/rlPolicies.ts) so a
   *  subsequent start() resumes training it instead of creating a fresh one
   *  (US2 AC4). Only valid while stopped. */
  useAgent(agent: DqnAgent): void {
    if (this.status !== 'stopped') return;
    this.agent = agent;
  }

  private async beginTraining(): Promise<void> {
    try {
      if (!this.agent) {
        await initTfBackend();
        this.agent = new DqnAgent({
          actionCount: RL_ACTIONS.length,
          inputWidth: FRAME_SIZE,
          inputHeight: FRAME_SIZE,
        });
        await this.agent.init();
      }
      this.core.setTrainingSpeed(TRAINING_FF_MULTIPLIER, TRAINING_FRAME_SKIP);
      this.status = 'running';
      this.scheduleNext();
    } catch (error) {
      this.onError(error instanceof Error ? error.message : 'Failed to start RL training.');
    }
  }

  /** Normal-speed inference using an already-trained agent (FR-008, US2 AC3) —
   *  no replay growth, no training steps, greedy action selection only. */
  runInference(agent: DqnAgent): void {
    this.agent = agent;
    this.mode = 'infer';
    this.core.restoreNormalSpeed();
    this.status = 'running';
    this.scheduleNext();
  }

  pause(): void {
    if (this.status !== 'running') return;
    this.stopTimer();
    this.core.restoreNormalSpeed();
    this.status = 'paused';
    this.emitMetrics();
  }

  resume(): void {
    if (this.status !== 'paused') return;
    if (this.mode === 'train') {
      this.core.setTrainingSpeed(TRAINING_FF_MULTIPLIER, TRAINING_FRAME_SKIP);
    }
    this.status = 'running';
    this.scheduleNext();
  }

  /** Stops the loop and clears all training progress — episode count, reward
   *  history, replay buffer, novelty memory, and the agent's weights — but
   *  never touches the game itself (US1 AC5, research.md #5). */
  reset(): void {
    this.stopTimer();
    this.core.restoreNormalSpeed();
    this.status = 'stopped';
    this.mode = 'train';
    this.noveltyMemory.reset();
    this.replayBuffer.reset();
    this.episodeManager.reset();
    this.totalSteps = 0;
    this.recentNovelty = [];
    this.noveltyRateHistory = [];
    this.prevState = null;
    this.prevActionIndex = null;
    this.agent = null;
    this.emitMetrics();
  }

  getAgent(): DqnAgent {
    if (!this.agent) throw new Error('No RL agent available yet — start training first.');
    return this.agent;
  }

  dispose(): void {
    this.stopTimer();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      if (this.status === 'running' && this.mode === 'train') {
        this.wasRunningBeforeHidden = true;
        this.pause();
      }
    } else if (this.wasRunningBeforeHidden) {
      this.wasRunningBeforeHidden = false;
      this.resume();
    }
  };

  private stopTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private scheduleNext(): void {
    if (this.status !== 'running') return;
    this.timer = setTimeout(() => void this.tick(), DECISION_INTERVAL_MS);
  }

  private async tick(): Promise<void> {
    if (this.status !== 'running' || !this.agent) return;

    try {
      const pixels = await captureDownsampledFrame(this.core, FRAME_SIZE);
      if (this.status !== 'running') return;

      const state = new Float32Array(pixels.length);
      for (let i = 0; i < pixels.length; i++) state[i] = pixels[i] / 255;

      if (this.mode === 'train') {
        await this.trainingTick(pixels, state);
      } else {
        await this.inferenceTick(state);
      }
    } catch (error) {
      this.onError(error instanceof Error ? error.message : 'RL controller encountered an error.');
      this.stopTimer();
      this.status = 'stopped';
      return;
    }

    this.scheduleNext();
  }

  private async trainingTick(pixels: Uint8Array, state: Float32Array): Promise<void> {
    const agent = this.agent!;
    const hash = computeAverageHash(pixels, FRAME_SIZE, FRAME_SIZE);
    const { isNew } = this.noveltyMemory.observe(hash, this.totalSteps);
    const reward = computeReward(isNew);

    this.recordNoveltyRate(isNew);
    const episodeEnded = this.episodeManager.recordStep(reward, isNew);
    if (episodeEnded) {
      this.noveltyRateHistory.push(this.noveltyDiscoveryRate);
      if (this.noveltyRateHistory.length > NOVELTY_RATE_HISTORY_CAPACITY) {
        this.noveltyRateHistory.shift();
      }
    }

    if (this.prevState && this.prevActionIndex !== null) {
      const transition: Transition = {
        state: this.prevState,
        actionIndex: this.prevActionIndex,
        reward,
        nextState: state,
      };
      this.replayBuffer.push(transition);
    }

    const epsilon = agent.getEpsilon(this.totalSteps);
    const actionIndex = await agent.selectAction(state, epsilon);
    this.pressAction(actionIndex);

    this.prevState = state;
    this.prevActionIndex = actionIndex;
    this.totalSteps++;

    if (this.replayBuffer.size >= MIN_REPLAY_SIZE) {
      await agent.trainStep(this.replayBuffer.sampleBatch(BATCH_SIZE));
    }

    this.emitMetrics();
  }

  private async inferenceTick(state: Float32Array): Promise<void> {
    const actionIndex = await this.agent!.selectAction(state, 0);
    this.pressAction(actionIndex);
  }

  private pressAction(actionIndex: number): void {
    const button: GbaButton = actionIndexToButton(actionIndex);
    this.core.pressButton(button);
    setTimeout(() => this.core.releaseButton(button), BUTTON_HOLD_MS);
  }

  private recordNoveltyRate(isNew: boolean): void {
    this.recentNovelty.push(isNew);
    if (this.recentNovelty.length > NOVELTY_RATE_WINDOW) this.recentNovelty.shift();
  }

  private get noveltyDiscoveryRate(): number {
    if (this.recentNovelty.length === 0) return 0;
    const novelCount = this.recentNovelty.filter(Boolean).length;
    return novelCount / this.recentNovelty.length;
  }

  private emitMetrics(): void {
    const episodeState = this.episodeManager.getState();
    this.onMetrics({
      status: this.status,
      episodeCount: episodeState.episodeCount,
      episodeReward: episodeState.episodeReward,
      rewardHistory: episodeState.rewardHistory,
      totalSteps: this.totalSteps,
      noveltyDiscoveryRate: this.noveltyDiscoveryRate,
      noveltyRateHistory: [...this.noveltyRateHistory],
    });
  }
}

import type * as tfTypes from '@tensorflow/tfjs';
import type { RLPolicyConfig, Transition } from './types';

type TfModule = typeof tfTypes;

const GAMMA = 0.99;
const TARGET_SYNC_INTERVAL = 1000;
const EPSILON_START = 1.0;
const EPSILON_END = 0.05;
const EPSILON_DECAY_STEPS = 50_000;
const LEARNING_RATE = 0.00025;

/**
 * Small-CNN DQN (research.md #1): online + target tf.LayersModel, epsilon-
 * greedy action selection, Huber-loss TD-error training against a
 * periodically-synced target network. TF.js is loaded lazily via dynamic
 * import so users who never touch RL training pay no load cost.
 */
export class DqnAgent {
  private tf: TfModule | null = null;
  private onlineModel: tfTypes.LayersModel | null = null;
  private targetModel: tfTypes.LayersModel | null = null;
  private optimizer: tfTypes.Optimizer | null = null;
  private stepsSinceSync = 0;

  constructor(private readonly config: RLPolicyConfig) {}

  /** Builds fresh online + target networks with random initial weights. */
  async init(): Promise<void> {
    const tf = await this.requireTfLoaded();
    this.onlineModel = this.buildModel(tf);
    this.targetModel = this.buildModel(tf);
    this.optimizer = tf.train.adam(LEARNING_RATE);
    this.syncTargetWeights();
  }

  /** Wraps an already-loaded model (e.g. from storage/rlPolicies.ts) for
   *  inference or resumed training, per research.md #6. */
  async loadFrom(model: tfTypes.LayersModel): Promise<void> {
    const tf = await this.requireTfLoaded();
    this.onlineModel = model;
    this.targetModel = this.buildModel(tf);
    this.optimizer = tf.train.adam(LEARNING_RATE);
    this.syncTargetWeights();
  }

  getModel(): tfTypes.LayersModel {
    if (!this.onlineModel) throw new Error('DqnAgent has not been initialized.');
    return this.onlineModel;
  }

  getEpsilon(stepCount: number): number {
    const t = Math.min(1, stepCount / EPSILON_DECAY_STEPS);
    return EPSILON_START + (EPSILON_END - EPSILON_START) * t;
  }

  /** Epsilon-greedy action selection. Reads the chosen action via async
   *  tensor.data() (never dataSync), and disposes intermediates via
   *  tf.tidy() so a decision tick never blocks canvas paint (research.md #2). */
  async selectAction(state: Float32Array, epsilon: number): Promise<number> {
    if (Math.random() < epsilon) {
      return Math.floor(Math.random() * this.config.actionCount);
    }

    const tf = this.requireTf();
    const model = this.requireOnlineModel();
    const { inputWidth, inputHeight } = this.config;

    const actionTensor = tf.tidy(() => {
      const input = tf.tensor4d(Array.from(state), [1, inputHeight, inputWidth, 1]);
      const qValues = model.apply(input) as tfTypes.Tensor;
      return qValues.argMax(1);
    });
    const [actionIndex] = await actionTensor.data();
    actionTensor.dispose();
    return actionIndex;
  }

  /** One gradient step over a sampled batch of transitions. The target
   *  network's Q-values are computed OUTSIDE the differentiated closure
   *  (standard tfjs DQN pattern) so no gradient ever reaches its weights —
   *  only the online model's variables are updated. Returns the scalar loss. */
  async trainStep(batch: Transition[]): Promise<number> {
    if (batch.length === 0) return 0;

    const tf = this.requireTf();
    const online = this.requireOnlineModel();
    const target = this.requireTargetModel();
    const optimizer = this.requireOptimizer();
    const { inputWidth, inputHeight, actionCount } = this.config;
    const batchSize = batch.length;

    const states = tf.tensor4d(
      batch.flatMap((t) => Array.from(t.state)),
      [batchSize, inputHeight, inputWidth, 1],
    );
    const nextStates = tf.tensor4d(
      batch.flatMap((t) => Array.from(t.nextState)),
      [batchSize, inputHeight, inputWidth, 1],
    );
    const rewards = tf.tensor1d(batch.map((t) => t.reward));
    const actionMask = tf.oneHot(
      tf.tensor1d(
        batch.map((t) => t.actionIndex),
        'int32',
      ),
      actionCount,
    );

    const targetQ = tf.tidy(() => {
      const nextQ = target.apply(nextStates) as tfTypes.Tensor2D;
      const maxNextQ = nextQ.max(1);
      return rewards.add(maxNextQ.mul(GAMMA)) as tfTypes.Tensor1D;
    });

    let lossTensor: tfTypes.Scalar | null = null;
    optimizer.minimize(() => {
      const loss = tf.tidy(() => {
        const qValues = online.apply(states) as tfTypes.Tensor2D;
        const predicted = qValues.mul(actionMask).sum(1) as tfTypes.Tensor1D;
        return tf.losses.huberLoss(targetQ, predicted) as tfTypes.Scalar;
      });
      lossTensor = loss;
      return loss;
    });

    const lossValue = lossTensor ? (await (lossTensor as tfTypes.Scalar).data())[0] : 0;

    states.dispose();
    nextStates.dispose();
    rewards.dispose();
    actionMask.dispose();
    targetQ.dispose();
    (lossTensor as tfTypes.Scalar | null)?.dispose();

    this.stepsSinceSync++;
    if (this.stepsSinceSync >= TARGET_SYNC_INTERVAL) {
      this.syncTargetWeights();
      this.stepsSinceSync = 0;
    }

    return lossValue;
  }

  /** Copies online weights into the target network. Called once after
   *  init/loadFrom, and periodically during training (every
   *  TARGET_SYNC_INTERVAL steps) for DQN stability. */
  syncTargetWeights(): void {
    if (!this.onlineModel || !this.targetModel) return;
    const weights = this.onlineModel.getWeights().map((w) => w.clone());
    this.targetModel.setWeights(weights);
    weights.forEach((w) => w.dispose());
  }

  private buildModel(tf: TfModule): tfTypes.LayersModel {
    const { inputWidth, inputHeight, actionCount } = this.config;
    return tf.sequential({
      layers: [
        tf.layers.conv2d({
          inputShape: [inputHeight, inputWidth, 1],
          filters: 8,
          kernelSize: 3,
          strides: 2,
          activation: 'relu',
        }),
        tf.layers.conv2d({ filters: 16, kernelSize: 3, strides: 2, activation: 'relu' }),
        tf.layers.flatten(),
        tf.layers.dense({ units: 128, activation: 'relu' }),
        tf.layers.dense({ units: actionCount, activation: 'linear' }),
      ],
    });
  }

  private async requireTfLoaded(): Promise<TfModule> {
    if (!this.tf) this.tf = await import('@tensorflow/tfjs');
    return this.tf;
  }

  private requireTf(): TfModule {
    if (!this.tf) throw new Error('DqnAgent has not been initialized.');
    return this.tf;
  }

  private requireOnlineModel(): tfTypes.LayersModel {
    if (!this.onlineModel) throw new Error('DqnAgent has not been initialized.');
    return this.onlineModel;
  }

  private requireTargetModel(): tfTypes.LayersModel {
    if (!this.targetModel) throw new Error('DqnAgent has not been initialized.');
    return this.targetModel;
  }

  private requireOptimizer(): tfTypes.Optimizer {
    if (!this.optimizer) throw new Error('DqnAgent has not been initialized.');
    return this.optimizer;
  }
}

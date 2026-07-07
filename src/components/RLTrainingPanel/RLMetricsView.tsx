import type { TrainingMetrics } from '../../rl/trainingController';

interface RLMetricsViewProps {
  metrics: TrainingMetrics;
}

const SPARKLINE_WIDTH = 200;
const SPARKLINE_HEIGHT = 40;

function Sparkline({ values, testId }: { values: number[]; testId: string }) {
  if (values.length < 2) {
    return (
      <p data-testid={testId} data-empty="true">
        Not enough episodes yet.
      </p>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = SPARKLINE_WIDTH / (values.length - 1);

  const points = values
    .map((value, index) => {
      const x = index * step;
      const y = SPARKLINE_HEIGHT - ((value - min) / range) * SPARKLINE_HEIGHT;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      data-testid={testId}
      width={SPARKLINE_WIDTH}
      height={SPARKLINE_HEIGHT}
      viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
      role="img"
      aria-label="trend chart"
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

/**
 * Live training progress (FR-005, US1 AC2) plus a per-episode reward history
 * sparkline and novelty-discovery-rate trend (US3 AC1/AC2) — stagnation
 * shows up as the novelty trend line flattening out, letting the user decide
 * whether to keep training, reset, or stop and save.
 */
export function RLMetricsView({ metrics }: RLMetricsViewProps) {
  return (
    <div data-testid="rl-metrics-view">
      <dl>
        <dt>Episode</dt>
        <dd data-testid="rl-metric-episode">{metrics.episodeCount}</dd>

        <dt>Current episode reward</dt>
        <dd data-testid="rl-metric-reward">{metrics.episodeReward.toFixed(2)}</dd>

        <dt>Exploration (novelty discovery rate)</dt>
        <dd data-testid="rl-metric-novelty">{(metrics.noveltyDiscoveryRate * 100).toFixed(1)}%</dd>

        <dt>Total steps</dt>
        <dd data-testid="rl-metric-steps">{metrics.totalSteps}</dd>
      </dl>

      <h3>Reward per episode</h3>
      <Sparkline values={metrics.rewardHistory} testId="rl-reward-history-sparkline" />

      <h3>Novelty discovery trend</h3>
      <Sparkline values={metrics.noveltyRateHistory} testId="rl-novelty-trend-sparkline" />
    </div>
  );
}

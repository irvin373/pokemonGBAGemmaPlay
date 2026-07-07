import { describe, expect, it } from 'vitest';
import { ReplayBuffer } from '../../src/rl/replayBuffer';
import type { Transition } from '../../src/rl/types';

function makeTransition(actionIndex: number): Transition {
  return {
    state: new Float32Array([actionIndex]),
    actionIndex,
    reward: 1,
    nextState: new Float32Array([actionIndex + 1]),
  };
}

describe('ReplayBuffer', () => {
  it('grows up to capacity', () => {
    const buffer = new ReplayBuffer(3);
    buffer.push(makeTransition(0));
    buffer.push(makeTransition(1));
    expect(buffer.size).toBe(2);
  });

  it('never exceeds its fixed capacity (FR-010)', () => {
    const buffer = new ReplayBuffer(3);
    for (let i = 0; i < 10; i++) buffer.push(makeTransition(i));
    expect(buffer.size).toBe(3);
  });

  it('sampleBatch never returns more than the requested or available size', () => {
    const buffer = new ReplayBuffer(5);
    buffer.push(makeTransition(0));
    buffer.push(makeTransition(1));
    expect(buffer.sampleBatch(10)).toHaveLength(2);
    expect(buffer.sampleBatch(1)).toHaveLength(1);
  });

  it('clears all transitions on reset', () => {
    const buffer = new ReplayBuffer(5);
    buffer.push(makeTransition(0));
    buffer.reset();
    expect(buffer.size).toBe(0);
  });
});

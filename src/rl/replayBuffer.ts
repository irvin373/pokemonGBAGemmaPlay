import type { Transition } from './types';

const REPLAY_BUFFER_CAPACITY = 10_000;

/**
 * Fixed-capacity circular buffer of transitions (research.md #1). A hard
 * capacity constant is what makes FR-010 (bounded memory) verifiable rather
 * than an emergent property of training-loop stability.
 */
export class ReplayBuffer {
  private buffer: Transition[] = [];
  private writeIndex = 0;

  constructor(private readonly capacity: number = REPLAY_BUFFER_CAPACITY) {}

  push(transition: Transition): void {
    if (this.buffer.length < this.capacity) {
      this.buffer.push(transition);
    } else {
      this.buffer[this.writeIndex] = transition;
    }
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
  }

  get size(): number {
    return this.buffer.length;
  }

  sampleBatch(batchSize: number): Transition[] {
    const n = Math.min(batchSize, this.buffer.length);
    const sample: Transition[] = [];
    for (let i = 0; i < n; i++) {
      const index = Math.floor(Math.random() * this.buffer.length);
      sample.push(this.buffer[index]);
    }
    return sample;
  }

  reset(): void {
    this.buffer = [];
    this.writeIndex = 0;
  }
}

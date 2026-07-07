import { describe, expect, it } from 'vitest';
import { NoveltyMemory } from '../../src/rl/noveltyMemory';

describe('NoveltyMemory', () => {
  it('reports a hash as new the first time it is observed', () => {
    const memory = new NoveltyMemory(10);
    const result = memory.observe('hash-a', 0);
    expect(result.isNew).toBe(true);
    expect(result.uniqueCount).toBe(1);
  });

  it('reports a previously-seen hash as not new', () => {
    const memory = new NoveltyMemory(10);
    memory.observe('hash-a', 0);
    const result = memory.observe('hash-a', 1);
    expect(result.isNew).toBe(false);
    expect(result.uniqueCount).toBe(1);
  });

  it('evicts the oldest entry (FIFO) once capacity is exceeded', () => {
    const memory = new NoveltyMemory(2);
    memory.observe('hash-a', 0);
    memory.observe('hash-b', 1);
    memory.observe('hash-c', 2); // evicts hash-a

    expect(memory.uniqueCount).toBe(2);
    // hash-a was evicted, so observing it again reports "new"
    expect(memory.observe('hash-a', 3).isNew).toBe(true);
  });

  it('clears all tracked hashes on reset', () => {
    const memory = new NoveltyMemory(10);
    memory.observe('hash-a', 0);
    memory.reset();
    expect(memory.uniqueCount).toBe(0);
    expect(memory.observe('hash-a', 1).isNew).toBe(true);
  });
});

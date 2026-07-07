const NOVELTY_MEMORY_CAPACITY = 20_000;

export interface NoveltyObservation {
  isNew: boolean;
  uniqueCount: number;
}

/**
 * Bounded record of screen hashes already seen (data-model.md Novelty
 * Memory). FIFO eviction via Map insertion order once capacity is exceeded —
 * true LRU recency isn't needed, only a hard memory cap (FR-010).
 */
export class NoveltyMemory {
  private seen = new Map<string, number>();

  constructor(private readonly capacity: number = NOVELTY_MEMORY_CAPACITY) {}

  observe(hash: string, step: number): NoveltyObservation {
    const isNew = !this.seen.has(hash);

    if (isNew && this.seen.size >= this.capacity) {
      const oldestKey = this.seen.keys().next().value;
      if (oldestKey !== undefined) this.seen.delete(oldestKey);
    }

    this.seen.set(hash, step);
    return { isNew, uniqueCount: this.seen.size };
  }

  get uniqueCount(): number {
    return this.seen.size;
  }

  /** Clears all tracked hashes. Only called by an explicit user Reset (US1 AC5),
   *  never by an episode boundary (research.md #5). */
  reset(): void {
    this.seen.clear();
  }
}

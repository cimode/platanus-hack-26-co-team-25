/**
 * rng.ts — seeded, deterministic randomness for the quiz domain.
 *
 * Every "random" choice a participant experiences — which scenario domains they
 * are given, which order the four options appear in — must be reproducible from
 * their id alone. Two reasons, both load-bearing:
 *
 *   1. `quiz-progress` recomputes the shown order for a block the participant
 *      already answered and it must match what was stored (docs/domain.md D10).
 *   2. A generation that has to be retried must produce the *same* assignment
 *      table, or a participant's batch 2 could cover a domain their batch 1
 *      already used.
 *
 * Contract: pure TypeScript, zero runtime dependencies, no Math.random, no Date.
 */

/** 32-bit FNV-1a. Small, stable across engines, good enough to seed a shuffle. */
export function seedFrom(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * mulberry32 — the same generator `domain/scoring` simulates respondents with.
 * Small state, good distribution, identical output on every engine.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates over a copy. Unbiased; every permutation is reachable. */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}

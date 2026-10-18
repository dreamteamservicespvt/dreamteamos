/**
 * A small seeded random generator (xmur3 seed + mulberry32) so a generated item is reproducible from its seed:
 * the same seed always gives the same question, numbers and answer key (FR-012 — the item can be reconstructed).
 */
export interface Rng {
  /** [0, 1) */
  next(): number;
  int(min: number, max: number): number;
  pick<T>(list: readonly T[]): T;
  shuffle<T>(list: readonly T[]): T[];
  /** k distinct elements */
  sample<T>(list: readonly T[], k: number): T[];
  chance(p: number): boolean;
  seed: string;
}

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed: string): Rng {
  const next = mulberry32(xmur3(seed)());
  const rng: Rng = {
    seed,
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    shuffle: (list) => {
      const a = [...list];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    sample: (list, k) => rng.shuffle(list).slice(0, Math.max(0, Math.min(k, list.length))),
    chance: (p) => next() < p,
  };
  return rng;
}

/** A fresh seed string (time + random), used when no reproducible seed is required. */
export function freshSeed(prefix = ""): string {
  const r = Math.floor(Math.random() * 2 ** 32).toString(36);
  return `${prefix}${Date.now().toString(36)}${r}`;
}

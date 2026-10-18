/**
 * The content library's shared parts: the template contract, name pools, formatting and option helpers.
 *
 * ── The template contract ─────────────────────────────────────────────────────────────────────────
 * A family generates a question FROM A SEED, computing its answer in code — so every answer key is correct by
 * construction (FR-007) and the item can be rebuilt from its seed for an audit (FR-012). Each family offers several
 * FORMS (different questions about the situation) and several SETTINGS per track (different workplace situations);
 * `family:form:setting` is the item's solution signature, which a learner never meets twice (FR-009). Names and
 * numbers change with the seed but never make an item "new" (the normalized fingerprint and the signature see through
 * them — AC-006). Every scenario is fictional and says so in the UI (MSRS §13.1).
 */
import type { Rng } from "../core/rng.js";
import type { Difficulty, DimensionId, GapKind, ItemKey, ItemType, TrackId } from "../core/types.js";

export interface GenContext {
  track: TrackId;
  difficulty: Difficulty;
  form: string;
  setting: string;
  rng: Rng;
}

export interface Generated {
  type: ItemType;
  scenario: string;
  question: string;
  /** In canonical order; `key.correct` / `key.order` index into this order. */
  options?: string[];
  unit?: string;
  key: ItemKey;
  objective: string;
  /** The gap the coach names when this is missed (FR-022). */
  gap: GapKind;
  teaches?: boolean;
}

export interface Family {
  id: string;
  version: string;
  /** The dimension(s) it measures; the first is primary. */
  dims: DimensionId[];
  /** Objective or open. */
  open: boolean;
  forms: readonly string[];
  /** Setting ids per track (the scenarios it can be written in). */
  settings: Readonly<Record<TrackId, readonly string[]>>;
  /** Lowest / highest difficulty it can write. */
  minDifficulty: Difficulty;
  maxDifficulty: Difficulty;
  generate(ctx: GenContext): Generated;
}

// ── Names (fictional; a mix that reads like the company's own city) ─────────────────────────────────

export const PEOPLE = [
  "Ravi", "Sravani", "Kiran", "Lakshmi", "Anil", "Divya", "Suresh", "Manasa", "Prasad", "Keerthi", "Naveen", "Swathi",
  "Harsha", "Bhavani", "Vamsi", "Pooja", "Srinivas", "Teja", "Madhavi", "Rahul", "Sneha", "Gopi", "Anusha", "Venkat",
] as const;

export const BUSINESSES = [
  "Sri Lakshmi Jewellers", "Annapurna Sweets", "Vasavi Textiles", "Green Leaf Restaurant", "Sai Dental Clinic",
  "Krishna Real Estate", "Bright Minds School", "Ganesh Mobiles", "Royal Furniture", "Durga Opticals",
  "Coastal Fish Market", "Sunrise Bakery", "Venkateswara Hardware", "Pearl Beauty Parlour", "Om Sai Travels",
  "Kakinada Kitchens", "Vijaya Medicals", "Star Fitness Gym", "Raja Sarees", "Siri Kids Wear",
] as const;

export const PROJECT_NAMES = ["Diwali offer ad", "Grand opening promo", "Summer sale poster", "Admissions video", "Festival wishes video", "Monthly social plan", "New branch reel", "Customer testimonial clip"] as const;

/** Every capitalised word of the name pools — the similarity check treats them as names even at a sentence start. */
export const NAME_WORDS: ReadonlySet<string> = new Set(
  [...PEOPLE, ...BUSINESSES, "Madhavi", "Gopi", "Anusha", "Swathi", "Naveen", "Pooja", "Ravi", "Divya", "Teja", "Rao"]
    .flatMap((n) => n.split(/\s+/))
    .filter((w) => /^[A-Z]/.test(w)),
);

/** ₹ with Indian digit grouping: 1,25,000. */
export function rupees(n: number): string {
  const neg = n < 0;
  const s = Math.round(Math.abs(n)).toString();
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${neg ? "−" : ""}₹${rest ? `${rest},${last3}` : last3}`;
}

export const pct = (n: number, digits = 0) => `${(Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits)}%`;

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A small markdown table (the UI renders it). */
export function table(headers: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  const line = (cells: ReadonlyArray<string | number>) => `| ${cells.map(String).join(" | ")} |`;
  return [line(headers), `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map(line)].join("\n");
}

/** Ordinal words: 1 → "first". */
export const ORDINAL = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"] as const;

/**
 * Options with exactly one correct answer: `correct` + distinct distractors (duplicates of the answer or each other
 * are dropped), padded from `fallback`. Returns the options (canonical order: shuffled once by the seed) and the index.
 */
export function singleChoice(rng: Rng, correct: string, distractors: readonly string[], fallback: readonly string[] = [], count = 4): { options: string[]; index: number } {
  const seen = new Set([norm(correct)]);
  const picked: string[] = [];
  for (const d of [...distractors, ...fallback]) {
    if (picked.length >= count - 1) break;
    const k = norm(d);
    if (!d || seen.has(k)) continue;
    seen.add(k);
    picked.push(d);
  }
  if (picked.length < count - 1) throw new Error("not enough distinct distractors");
  const options = rng.shuffle([correct, ...picked]);
  return { options, index: options.indexOf(correct) };
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Numeric distractors near a value: plausible mistakes, distinct, positive when the answer is. */
export function nearNumbers(rng: Rng, answer: number, mistakes: readonly number[], step = 1): number[] {
  const out = new Set<number>();
  for (const m of mistakes) if (m !== answer && Number.isFinite(m) && (answer <= 0 || m > 0)) out.add(round2(m));
  let k = 1;
  while (out.size < 6 && k < 50) {
    const v = round2(answer + (rng.chance(0.5) ? 1 : -1) * step * k);
    if (v !== answer && (answer <= 0 || v > 0)) out.add(v);
    k++;
  }
  return [...out];
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pick k distinct names. */
export function names(rng: Rng, pool: readonly string[], k: number): string[] {
  return rng.sample(pool, k);
}

/** A seconds time limit by type and difficulty (soft for practice; enforced for rank and league items). */
export function timeLimitFor(open: boolean, d: Difficulty): number {
  return open ? 360 + d * 60 : 60 + d * 30;
}

/** Hints are written approach-first, then closer — never the answer itself (FR-023). */
export function hints(...h: string[]): string[] {
  return h.filter(Boolean);
}

export function key(partial: Partial<ItemKey> & { explanation: string; hints: string[] }): ItemKey {
  return partial as ItemKey;
}

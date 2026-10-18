/**
 * The template catalogue: every family, and the picker that turns a session slot into a fresh item.
 *
 * Picking (FR-008, FR-009, FR-011): the candidates are every (family, form, setting) that measures the slot's dimension,
 * suits the slot's type (open / objective) and difficulty, is not in the learner's used signatures and not in the slot's
 * `avoidSettings`. Same-track settings come first; other tracks' settings are used for a transfer check (the skill in a
 * new context) or when the learner has used up their own track's. A family whose PRIMARY dimension is the slot's is
 * preferred over one that only touches it. Generation is retried with new seeds when a puzzle does not settle.
 */
import { makeRng } from "../core/rng.js";
import type { Difficulty, DimensionId, TrackId } from "../core/types.js";
import type { Family, Generated } from "./kit.js";
import { LOGIC_FAMILIES } from "./families/logic.js";
import { COGNITIVE_FAMILIES } from "./families/cognitive.js";
import { CRITICAL_FAMILIES } from "./families/critical.js";
import { PROBLEM_FAMILIES } from "./families/problem.js";
import { DECISION_FAMILIES } from "./families/decision.js";
import { EXECUTION_FAMILIES } from "./families/execution.js";
import { PEOPLE_FAMILIES } from "./families/people.js";
import { LEARNING_FAMILIES } from "./families/learning.js";
import { OPEN_FAMILIES } from "./families/open.js";

export const FAMILIES: readonly Family[] = [
  ...LOGIC_FAMILIES, ...COGNITIVE_FAMILIES, ...CRITICAL_FAMILIES, ...PROBLEM_FAMILIES, ...DECISION_FAMILIES,
  ...EXECUTION_FAMILIES, ...PEOPLE_FAMILIES, ...LEARNING_FAMILIES, ...OPEN_FAMILIES,
];

export const FAMILY_BY_ID: ReadonlyMap<string, Family> = new Map(FAMILIES.map((f) => [f.id, f]));

export const CATALOGUE_VERSION = `cat-1:${FAMILIES.map((f) => `${f.id}@${f.version}`).join(",").length}`;

const TRACKS: TrackId[] = ["sales", "technical", "admin"];

export const signatureOf = (family: string, form: string, setting: string) => `${family}:${form}:${setting}`;

export interface TemplateRequest {
  dim: DimensionId;
  difficulty: Difficulty;
  track: TrackId;
  /** "open" = an open answer; "objective" = anything else; undefined = objective first, open if none. */
  kind?: "open" | "objective";
  family?: string;
  form?: string;
  avoidSettings?: readonly string[];
  /** Serve in another track's settings (a transfer check across roles). */
  trackOverride?: TrackId;
  usedSignatures: ReadonlySet<string>;
  seed: string;
  /** Skip these (family:form:setting) — e.g. candidates already rejected by the similarity check this round. */
  exclude?: ReadonlySet<string>;
  /** Patterns withdrawn by calibration (`core/calibration.patternKeyOf`: family~form~d<level>) — not served for now. */
  excludePatterns?: ReadonlySet<string>;
}

export interface TemplateCandidate {
  family: Family;
  form: string;
  setting: string;
  /** The track whose setting was used. */
  settingTrack: TrackId;
  difficulty: Difficulty;
  signature: string;
  generated: Generated;
  seed: string;
}

interface Combo { family: Family; form: string; setting: string; track: TrackId; primary: boolean; sameTrack: boolean }

/** Every unused combination for a request, best first. */
export function combosFor(req: TemplateRequest): Combo[] {
  const contentTrack = req.trackOverride ?? req.track;
  const out: Combo[] = [];
  for (const f of FAMILIES) {
    if (!f.dims.includes(req.dim)) continue;
    if (req.family && f.id !== req.family) continue;
    if (req.kind === "open" && !f.open) continue;
    if (req.kind === "objective" && f.open) continue;
    if (req.difficulty < f.minDifficulty || req.difficulty > f.maxDifficulty) {
      // Allow one level of slack so an easy or hard slot is never empty for lack of a family.
      if (req.difficulty < f.minDifficulty - 1 || req.difficulty > f.maxDifficulty + 1) continue;
    }
    // The level this family would write at (generateTemplate clamps the same way) — the calibration pattern's level.
    const level = Math.min(f.maxDifficulty, Math.max(f.minDifficulty, req.difficulty));
    for (const form of f.forms) {
      if (req.form && form !== req.form) continue;
      if (req.excludePatterns?.has(`${f.id}~${form}~d${level}`)) continue;
      for (const t of TRACKS) {
        for (const setting of f.settings[t]) {
          const sig = signatureOf(f.id, form, setting);
          if (req.usedSignatures.has(sig) || req.exclude?.has(sig)) continue;
          if (req.avoidSettings?.includes(setting)) continue;
          out.push({ family: f, form, setting, track: t, primary: f.dims[0] === req.dim, sameTrack: t === contentTrack });
        }
      }
    }
  }
  const rng = makeRng(`${req.seed}:order`);
  const shuffled = rng.shuffle(out);
  // Same (content) track first, primary-dimension families first, objective before open when the kind is open-ended.
  const rank = (c: Combo) => (c.sameTrack ? 0 : 4) + (c.primary ? 0 : 2) + (req.kind === undefined && c.family.open ? 1 : 0);
  return shuffled.sort((a, b) => rank(a) - rank(b));
}

/** A fresh template item for the request, or null when the template space is used up for it. */
export function generateTemplate(req: TemplateRequest, maxCombos = 6): TemplateCandidate | null {
  const combos = combosFor(req);
  for (const c of combos.slice(0, maxCombos)) {
    const d = Math.min(c.family.maxDifficulty, Math.max(c.family.minDifficulty, req.difficulty)) as Difficulty;
    for (let attempt = 0; attempt < 5; attempt++) {
      const seed = `${req.seed}:${c.family.id}:${c.form}:${c.setting}:${attempt}`;
      try {
        const generated = c.family.generate({ track: c.track, difficulty: d, form: c.form, setting: c.setting, rng: makeRng(seed) });
        return { family: c.family, form: c.form, setting: c.setting, settingTrack: c.track, difficulty: d, signature: signatureOf(c.family.id, c.form, c.setting), generated, seed };
      } catch {
        // a puzzle that did not settle with this seed — try another
      }
    }
  }
  return null;
}

/** Which dimensions each track can be served from templates at all (a coverage check for tests and the admin view). */
export function coverage(): Record<TrackId, Record<DimensionId, { objective: number; open: number }>> {
  const out = {} as Record<TrackId, Record<DimensionId, { objective: number; open: number }>>;
  for (const t of TRACKS) {
    out[t] = {} as Record<DimensionId, { objective: number; open: number }>;
    for (const f of FAMILIES) {
      for (const d of f.dims) {
        const cell = (out[t][d] ??= { objective: 0, open: 0 });
        const n = f.forms.length * f.settings[t].length;
        if (f.open) cell.open += n;
        else cell.objective += n;
      }
    }
  }
  return out;
}

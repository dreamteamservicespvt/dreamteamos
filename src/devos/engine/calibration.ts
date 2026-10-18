/**
 * Question calibration over the store (FR-013) — the rules are `core/calibration.ts`.
 *
 *   recordCalibration   every scored answer adds to its pattern (`devos_calibration/{pattern}`), best effort: a lost
 *                       count under contention costs one sample, never the answer;
 *   runCalibration      the tick's daily roll-over judges the patterns answered in the last 30 days and writes the
 *                       flagged ones to `devos_bank/calibration_flags` (with fresh counters, so a returning pattern is
 *                       measured anew);
 *   flaggedPatterns     what serving skips (`bank.findCandidate`), read once per request.
 */
import { CALIBRATION_FLAG_DAYS, judgePattern, patternKeyOf, type PatternSource } from "../core/calibration.js";
import type { AuditEvent } from "../core/types.js";
import { loadPolicy, PATH, type Deps } from "./context.js";
import { signRecord } from "./integrity.js";
import type { Doc } from "./store.js";

export const CALIBRATION_COLLECTION = "devos_calibration";
export const CALIBRATION_FLAGS = "devos_bank/calibration_flags";
const DAY_MS = 86_400_000;

export interface PatternDoc { key: string; source: string; family: string; form: string; track: string; dim: string; difficulty: number; n: number; correct: number; ms: number; updatedAt: number }
export interface PatternFlag { reason: string; n: number; correct: number; at: number; until: number }

/** Count one scored answer for its pattern. Never throws. */
export async function recordCalibration(deps: Deps, q: PatternSource, passed: boolean, ms: number): Promise<void> {
  const key = patternKeyOf(q);
  const path = `${CALIBRATION_COLLECTION}/${key}`;
  try {
    await deps.store.tx(async (t) => {
      const c = (await t.get(path)) as unknown as PatternDoc | null;
      t.set(path, {
        key, source: q.source, family: q.family, form: q.form, track: q.track, dim: q.dim, difficulty: q.difficulty,
        n: (c?.n ?? 0) + 1, correct: (c?.correct ?? 0) + (passed ? 1 : 0), ms: (c?.ms ?? 0) + Math.max(0, Math.min(ms, 3_600_000)),
        updatedAt: deps.now(),
      } as unknown as Doc);
    });
  } catch (e) {
    deps.log("warn", "calibration count lost", e instanceof Error ? e.message : e);
  }
}

const flagCache = new WeakMap<Deps, Promise<Set<string>>>();

/** The patterns not to serve right now (expired flags are ignored). Read once per request. */
export function flaggedPatterns(deps: Deps): Promise<Set<string>> {
  let p = flagCache.get(deps);
  if (!p) {
    p = deps.store.get(CALIBRATION_FLAGS).then((doc) => {
      const now = deps.now();
      const flags = ((doc?.flags ?? {}) as Record<string, PatternFlag>);
      return new Set(Object.entries(flags).filter(([, f]) => f.until > now).map(([k]) => k));
    }).catch(() => new Set<string>());
    flagCache.set(deps, p);
  }
  return p;
}

/** Judge the recently answered patterns; flag the poor ones. Returns what changed. */
export async function runCalibration(deps: Deps): Promise<{ judged: number; flagged: string[]; expired: number }> {
  const now = deps.now();
  const rows = await deps.store.query(CALIBRATION_COLLECTION, [["updatedAt", ">=", now - 30 * DAY_MS]]);
  const current = ((await deps.store.get(CALIBRATION_FLAGS))?.flags ?? {}) as Record<string, PatternFlag>;
  const keep: Record<string, PatternFlag> = {};
  let expired = 0;
  for (const [k, f] of Object.entries(current)) {
    if (f.until > now) keep[k] = f;
    else if (f.until > now - 90 * DAY_MS) { keep[k] = f; expired++; } // kept a while as history (the admin view)
  }
  const flagged: string[] = [];
  for (const r of rows) {
    const c = r.data as unknown as PatternDoc;
    if (keep[c.key] && keep[c.key].until > now) continue;
    const reason = judgePattern(c);
    if (!reason) continue;
    keep[c.key] = { reason, n: c.n, correct: c.correct, at: now, until: now + CALIBRATION_FLAG_DAYS * DAY_MS };
    flagged.push(c.key);
    // Fresh counters: when the flag expires the pattern is measured again from zero, not judged on the old answers.
    await deps.store.set(`${CALIBRATION_COLLECTION}/${c.key}`, { n: 0, correct: 0, ms: 0, flaggedAt: now, previous: { n: c.n, correct: c.correct } }, true);
  }
  // Replaced whole (not merged): a merge would keep map keys that were dropped from `keep`.
  await deps.store.set(CALIBRATION_FLAGS, { flags: keep, updatedAt: now });
  if (flagged.length) {
    // Audited like an admin action (admin.audit's shape and signature), with the service as the actor (FR-060).
    const policy = await loadPolicy(deps);
    const ev: AuditEvent = {
      id: `au_calibration_${now}`, actor: "system", actorName: "Automatic calibration", action: "calibration_flag",
      target: flagged.join(",").slice(0, 400), at: now, policyVersion: policy.version,
      detail: flagged.map((k) => `${k}: ${keep[k].reason}`).join(" | ").slice(0, 800),
    };
    await deps.store.set(PATH.audit(ev.id), (await signRecord(deps.secrets, "audit", ev)) as unknown as Doc);
  }
  return { judged: rows.length, flagged, expired };
}

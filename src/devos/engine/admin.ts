/**
 * The Administrative Control Center's operations (MSRS §4, FR-050 – FR-055, FR-060).
 *
 * Who: platform administrators (main admin, tech admin) do everything; the sales admin reads the Sales track's people
 * (department view). Every change is an audit event with actor, target and policy version, signed; history is never
 * rewritten (a correction is a new record; a policy change is a new version and old attempts keep theirs).
 */
import { DIMENSION_IDS } from "../core/dimensions.js";
import { replayDimension, weightedSummary } from "../core/mastery.js";
import { nextPolicyVersion, parsePolicy, validatePolicy, type DevPolicy } from "../core/policy.js";
import type { AuditEvent, DevAttempt, DevEvidence, DevProfile, DevTask, QuestionDoc, TrackId, XpTransaction } from "../core/types.js";
import { adminScopeTracks, assertActive, assertPlatformAdmin, DevError, loadPolicy, PATH, shortId, type Actor, type Deps } from "./context.js";
import { checkRecord, signRecord } from "./integrity.js";
import { buildSnapshot, generateReport, readAllProfiles, rebuildSnapshot, type Snapshot } from "./reports.js";
import { finishOpenGrading } from "./learner.js";
import { voidAttempt } from "./review.js";
import { CALIBRATION_FLAGS, type PatternFlag } from "./calibration.js";
import type { Doc } from "./store.js";

const TRACKS: TrackId[] = ["sales", "technical", "admin"];

export async function audit(deps: Deps, actor: Pick<Actor, "uid" | "name">, action: string, target: string, detail?: string): Promise<void> {
  const policy = await loadPolicy(deps);
  const ev: AuditEvent = { id: shortId("au_"), actor: actor.uid, actorName: actor.name, action, target, at: deps.now(), policyVersion: policy.version, detail: detail?.slice(0, 800) };
  await deps.store.set(PATH.audit(ev.id), (await signRecord(deps.secrets, "audit", ev)) as unknown as Doc);
}

function scopeOf(actor: Actor): TrackId[] {
  assertActive(actor);
  const s = adminScopeTracks(actor);
  if (!s) throw new DevError(403, "not_admin", "The Control Center is for administrators.");
  return s === "all" ? TRACKS : s;
}

export async function adminOverview(deps: Deps, actor: Actor, fresh = false): Promise<Snapshot> {
  const tracks = scopeOf(actor);
  const policy = await loadPolicy(deps);
  if (tracks.length < TRACKS.length) {
    // A department admin (the sales admin → Sales): EVERY number is built from their tracks' people alone — counts,
    // quests, answers, skill averages, ranks, effectiveness — not just the people list (the browser test found the
    // company-wide KPIs and the other tracks' averages on the sales admin's Overview). No health or pool data.
    const profiles = (await readAllProfiles(deps)).filter((p) => tracks.includes(p.track));
    return { ...buildSnapshot(profiles, policy, null, deps.now()), targets: [], scope: tracks };
  }
  let snap = (await deps.store.get(PATH.snapshot)) as unknown as Snapshot | null;
  // Rebuilt when over 5 minutes old (one read per person): at 60 minutes the browser test opened an Overview showing
  // "0 answers" half an hour after the day's activity. Refresh forces it.
  if (!snap || fresh || deps.now() - snap.builtAt > 5 * 60_000) snap = await rebuildSnapshot(deps, policy);
  return snap;
}

export interface PersonDetail {
  profile: DevProfile;
  attempts: DevAttempt[];
  tasks: DevTask[];
  xp: XpTransaction[];
  rankEvents: Record<string, unknown>[];
  achievements: Record<string, unknown>[];
  corrections: Record<string, unknown>[];
}

export async function adminPerson(deps: Deps, actor: Actor, uid: string): Promise<PersonDetail> {
  const tracks = scopeOf(actor);
  const profile = (await deps.store.get(PATH.user(uid))) as unknown as DevProfile | null;
  if (!profile) throw new DevError(404, "no_profile", "This person has no Development OS record yet.");
  if (!tracks.includes(profile.track)) throw new DevError(403, "scope", "This person is outside your department.");
  const [attempts, tasks, xp, rankEvents, achievements, corrections] = await Promise.all([
    deps.store.query(PATH.attempts(uid), [], { orderBy: ["createdAt", "desc"], limit: 80 }),
    deps.store.query(PATH.tasks(uid), [], { orderBy: ["createdAt", "desc"], limit: 60 }),
    deps.store.query(PATH.xps(uid), [], { orderBy: ["recordedAt", "desc"], limit: 80 }),
    deps.store.query(PATH.rankEvents(uid)),
    deps.store.query(PATH.achievements(uid)),
    deps.store.query("devos_corrections", [["uid", "==", uid]]),
  ]);
  return {
    profile,
    attempts: attempts.map((r) => r.data as unknown as DevAttempt),
    tasks: tasks.map((r) => r.data as unknown as DevTask),
    xp: xp.map((r) => r.data as unknown as XpTransaction),
    rankEvents: rankEvents.map((r) => r.data),
    achievements: achievements.map((r) => r.data),
    corrections: corrections.map((r) => r.data),
  };
}

export async function adminSetTrack(deps: Deps, actor: Actor, input: { uid: string; track: TrackId; reason: string }): Promise<void> {
  assertPlatformAdmin(actor);
  if (!TRACKS.includes(input.track)) throw new DevError(400, "track", "Unknown track.");
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 5) throw new DevError(400, "reason", "Give a short reason (it is kept in the person's history).");
  const policy = await loadPolicy(deps);
  const now = deps.now();
  await deps.store.tx(async (t) => {
    const p = (await t.get(PATH.user(input.uid))) as unknown as DevProfile | null;
    if (!p) throw new DevError(404, "no_profile", "This person has no Development OS record yet.");
    if (p.track === input.track) return;
    const history = [...p.trackHistory];
    if (history.length) history[history.length - 1] = { ...history[history.length - 1], to: now };
    history.push({ track: input.track, from: now, by: actor.uid, reason, policyVersion: policy.version });
    const next = { ...p, track: input.track, trackHistory: history, summary: weightedSummary(p.dims, policy.weights[input.track]), updatedAt: now };
    t.set(PATH.user(input.uid), (await signRecord(deps.secrets, "profile", next)) as unknown as Doc);
  });
  await audit(deps, actor, "set_track", input.uid, `${input.track}: ${reason}`);
}

export async function adminSetEnrollment(deps: Deps, actor: Actor, input: { uid: string; enrolled: boolean; reason: string }): Promise<void> {
  assertPlatformAdmin(actor);
  const now = deps.now();
  const p = (await deps.store.get(PATH.user(input.uid))) as unknown as DevProfile | null;
  if (!p) {
    const user = await deps.store.get(PATH.userDoc(input.uid));
    if (!user) throw new DevError(404, "no_user", "No such person.");
  }
  await deps.store.set(PATH.user(input.uid), { uid: input.uid, enrolled: !!input.enrolled, ...(p && !input.enrolled && p.status === "active" ? { status: "paused" } : {}), ...(p && input.enrolled && p.status === "paused" ? { status: "active" } : {}), updatedAt: now }, true);
  await audit(deps, actor, input.enrolled ? "enrol" : "unenrol", input.uid, String(input.reason ?? "").slice(0, 300));
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** `over` laid over `base`, objects merged key by key, everything else (numbers, strings, arrays) replaced. */
function deepMerge(base: unknown, over: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(over)) return over === undefined ? base : over;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = deepMerge(base[k], v);
  return out;
}

/** Every value the admin sent that the lenient reader (`parsePolicy`) would have changed or dropped. */
export function policyCoercions(sent: unknown, parsed: unknown, path = ""): string[] {
  if (sent === undefined) return [];
  if (isPlainObject(sent)) {
    if (!isPlainObject(parsed)) return [`${path || "the policy"} is not a setting`];
    return Object.entries(sent).flatMap(([k, v]) => policyCoercions(v, parsed[k], path ? `${path}.${k}` : k));
  }
  return JSON.stringify(sent) === JSON.stringify(parsed) ? [] : [`${path} = ${JSON.stringify(sent).slice(0, 60)}`];
}

export async function adminSavePolicy(deps: Deps, actor: Actor, input: { policy: unknown; reason: string }): Promise<DevPolicy> {
  assertPlatformAdmin(actor);
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 5) throw new DevError(400, "reason", "Say why the policy is changing (kept with the version).");
  const current = await loadPolicy(deps);
  // The server's own fields are not the admin's to send.
  const sent = isPlainObject(input.policy) ? { ...input.policy } : {};
  for (const k of ["version", "updatedAt", "updatedBy", "updatedByName", "reason"]) delete sent[k];
  // Merged deeply: a change to one track's weights must not reset the other tracks (a shallow merge did).
  const proposed = parsePolicy(deepMerge(current, sent));
  // The reader is lenient by design (an old or half-saved document never breaks a run), so on SAVE every value it would
  // silently replace is refused instead — the browser test saved weights totalling 194 and got the defaults as "v3".
  const problems: string[] = [];
  if (isPlainObject(sent.weights)) {
    for (const t of TRACKS) {
      const col = deepMerge(current.weights[t], (sent.weights as Record<string, unknown>)[t]) as Record<string, number>;
      const total = DIMENSION_IDS.reduce((s, d) => s + (Number(col?.[d]) || 0), 0);
      if (Math.abs(total - 100) > 0.001) problems.push(`The ${t} weights total ${Math.round(total * 100) / 100}, not 100.`);
    }
  }
  const coerced = policyCoercions(sent, proposed).filter((p) => !(problems.length && p.startsWith("weights.")));
  if (coerced.length) problems.push(`Not accepted (out of range or not a valid value): ${coerced.slice(0, 8).join("; ")}.`);
  problems.push(...validatePolicy(proposed));
  if (problems.length) throw new DevError(400, "invalid_policy", problems.join(" "));
  const now = deps.now();
  const next: DevPolicy = { ...proposed, version: nextPolicyVersion(current.version), updatedAt: now, updatedBy: actor.uid, updatedByName: actor.name, reason };
  await deps.store.set(PATH.policyVersion(next.version), next as unknown as Doc);
  await deps.store.set(PATH.policy, next as unknown as Doc);
  deps.policyCache = next;
  await audit(deps, actor, "save_policy", next.version, reason);
  return next;
}

export async function adminVoid(deps: Deps, actor: Actor, input: { uid: string; attemptId: string; reason: string }) {
  assertPlatformAdmin(actor);
  const policy = await loadPolicy(deps);
  const c = await voidAttempt(deps, policy, input.uid, input.attemptId, actor.uid, String(input.reason ?? "admin: platform fault"));
  await audit(deps, actor, "void_attempt", `${input.uid}/${input.attemptId}`, input.reason);
  return c;
}

export async function adminRegrade(deps: Deps, actor: Actor, input: { uid: string; attemptId: string }) {
  assertPlatformAdmin(actor);
  const policy = await loadPolicy(deps);
  const r = await finishOpenGrading(deps, policy, input.uid, input.attemptId);
  await audit(deps, actor, "regrade", `${input.uid}/${input.attemptId}`, r ? `graded ${r.attempt.scoring?.score}` : "still pending");
  return { graded: !!r, score: r?.attempt.scoring?.score ?? null };
}

/**
 * Withdraw a question (FR-013): it is never served again, and every answer already given to it stops counting toward
 * mastery until it is revalidated — each is voided by an appended correction (the original answer stays, FR-048) and
 * its dimension re-settled. The people it was served to are on the question (`servedTo`).
 */
export async function adminQuarantine(deps: Deps, actor: Actor, input: { qid: string; reason: string }): Promise<{ voided: number }> {
  assertPlatformAdmin(actor);
  const policy = await loadPolicy(deps);
  const q = (await deps.store.get(PATH.question(input.qid))) as unknown as QuestionDoc | null;
  if (!q) throw new DevError(404, "no_question", "No such question.");
  await deps.store.set(PATH.question(input.qid), { status: "quarantined", poolState: `${q.track}|${q.dim}|${q.difficulty}|${q.type === "open" ? "open" : "objective"}|quarantined`, updatedAt: deps.now(), stats: { ...(q.stats ?? { answered: 0, correct: 0, totalMs: 0, flags: 0 }), flags: (q.stats?.flags ?? 0) + 1 } }, true);
  let voided = 0;
  for (const uid of (q.servedTo ?? []).slice(0, 50)) {
    for (const r of await deps.store.query(PATH.attempts(uid), [["qid", "==", input.qid]])) {
      const a = r.data as unknown as DevAttempt;
      const o = a.current?.outcome ?? a.outcome;
      if (o !== "passed" && o !== "failed") continue; // nothing counted: pending, expired, already void
      await voidAttempt(deps, policy, uid, r.id, actor.uid, `Question withdrawn: ${input.reason}`);
      voided++;
    }
  }
  await audit(deps, actor, "quarantine_question", input.qid, `${input.reason} — ${voided} answer${voided === 1 ? "" : "s"} voided`);
  return { voided };
}

export async function adminQuestions(deps: Deps, actor: Actor) {
  assertPlatformAdmin(actor); // the bank is company-wide
  const [jobs, quarantined, pool, flagsDoc] = await Promise.all([
    deps.store.query(PATH.jobs, [], { orderBy: ["createdAt", "desc"], limit: 25 }),
    deps.store.query(PATH.questions, [["status", "==", "quarantined"]], { limit: 30 }),
    deps.store.query(PATH.questions, [["status", "==", "pool"]], { limit: 300 }),
    deps.store.get(CALIBRATION_FLAGS),
  ]);
  const now = deps.now();
  // Patterns calibration withdrew (FR-013), newest first: active ones and those back in service in the last 90 days.
  const calibration = Object.entries(((flagsDoc?.flags ?? {}) as Record<string, PatternFlag>))
    .map(([key, f]) => ({ key, ...f, active: f.until > now }))
    .sort((a, b) => b.at - a.at);
  const byKey: Record<string, number> = {};
  for (const r of pool) {
    const q = r.data as unknown as QuestionDoc;
    const k = `${q.track}|${q.dim}|${q.difficulty}|${q.type}`;
    byKey[k] = (byKey[k] ?? 0) + 1;
  }
  return {
    pool: { total: pool.length, byKey },
    jobs: jobs.map((r) => r.data),
    calibration,
    quarantined: quarantined.map((r) => {
      const q = r.data as unknown as QuestionDoc;
      return { id: r.id, track: q.track, dim: q.dim, difficulty: q.difficulty, type: q.type, question: q.public.question, checks: q.validation.checks, stats: q.stats };
    }),
  };
}

export async function adminAudit(deps: Deps, actor: Actor) {
  assertPlatformAdmin(actor);
  const rows = await deps.store.query(PATH.audits, [], { orderBy: ["at", "desc"], limit: 120 });
  const out = [];
  for (const r of rows) out.push({ ...(r.data as object), integrity: await checkRecord(deps.secrets, "audit", r.data as Record<string, unknown> & { sig?: string }) });
  return out;
}

export async function adminExceptions(deps: Deps, actor: Actor) {
  const tracks = scopeOf(actor);
  const since = deps.now() - 30 * 86_400_000;
  const [corrections, queue] = await Promise.all([
    deps.store.query("devos_corrections", [["at", ">=", since]], { limit: 100 }),
    deps.store.get("devos_queue/grading"),
  ]);
  let rows = corrections.map((r) => r.data);
  let items = ((queue?.items as { uid: string }[] | undefined) ?? []);
  if (tracks.length < TRACKS.length) {
    // A department admin sees only their tracks' reviews and waiting grades (the browser test found the sales admin
    // reading technical people's appeals and voids).
    const uids = [...new Set([...rows.map((c) => String(c.uid)), ...items.map((i) => i.uid)])];
    const trackOf = new Map(await Promise.all(uids.map(async (u) => [u, ((await deps.store.get(PATH.user(u))) as unknown as DevProfile | null)?.track] as const)));
    const mine = (uid: string) => { const t = trackOf.get(uid); return !!t && tracks.includes(t); };
    rows = rows.filter((c) => mine(String(c.uid)));
    items = items.filter((i) => mine(i.uid));
  }
  return { corrections: rows.sort((a, b) => Number(b.at) - Number(a.at)), queue: items };
}

export async function adminReports(deps: Deps, actor: Actor) {
  assertPlatformAdmin(actor); // the AI reports cover the whole company
  const rows = await deps.store.query(PATH.reports, [], { orderBy: ["generatedAt", "desc"], limit: 14 });
  return rows.map((r) => r.data);
}

export async function adminGenerateReport(deps: Deps, actor: Actor) {
  assertPlatformAdmin(actor);
  const policy = await loadPolicy(deps);
  const snap = await rebuildSnapshot(deps, policy);
  const r = await generateReport(deps, policy, snap);
  await audit(deps, actor, "generate_report", r.id);
  return r;
}

/**
 * A person's whole record, machine-readable (FR-054, NFR-016). Logged as an export. Platform admins only: a bulk copy
 * of personal records is more than the department view's read-only scope (the browser test had the sales admin
 * exporting the whole company).
 */
export async function adminExport(deps: Deps, actor: Actor, input: { uid?: string }) {
  assertPlatformAdmin(actor);
  if (input.uid) {
    const detail = await adminPerson(deps, actor, input.uid);
    const [evidence, sessions] = await Promise.all([deps.store.query(PATH.evidences(input.uid)), deps.store.query(`devos_users/${input.uid}/sessions`)]);
    await audit(deps, actor, "export_person", input.uid);
    return { kind: "person", exportedAt: deps.now(), ...detail, evidence: evidence.map((r) => r.data), sessions: sessions.map((r) => r.data) };
  }
  const snap = await adminOverview(deps, actor, true);
  await audit(deps, actor, "export_company", "all", `${snap.people.length} people`);
  return { kind: "company", exportedAt: deps.now(), people: snap.people, counts: snap.counts, dims: snap.dims };
}

/** Check the signatures of a person's records; with `repair`, rebuild the profile from the ledgers (FR-037, NFR-009). */
export async function adminIntegrity(deps: Deps, actor: Actor, input: { uid: string; repair?: boolean }) {
  assertPlatformAdmin(actor);
  const policy = await loadPolicy(deps);
  return checkPerson(deps, policy, input.uid, { repair: !!input.repair, by: actor });
}

type SignedRow = Record<string, unknown> & { sig?: string };

/**
 * One person's records against their signatures; with `repair`, a profile edited outside the server (or no longer
 * matching its ledgers) is rebuilt from the ledgers. Used by the admin's Integrity button and, every day with nobody
 * looking, by the tick for any profile whose signature fails (owner, 2026-10-18: "0% human involvement").
 *
 * ── Only rows the server signed count ── A row whose signature is wrong (edited) or missing (the server signs every
 * row it writes — so one with none was written from a browser) is left out of the ledger totals; before, a forged XP
 * row still counted in the rebuilt total. A row signed under an earlier key (a rotated service account) cannot be
 * checked and still counts.
 */
export async function checkPerson(deps: Deps, policy: DevPolicy, uid: string, opts: { repair: boolean; by: Pick<Actor, "uid" | "name"> }) {
  const profile = (await deps.store.get(PATH.user(uid))) as unknown as (DevProfile & { sig?: string }) | null;
  if (!profile) throw new DevError(404, "no_profile", "No record.");
  const [xpRows, attemptRows, rankRows, evRows] = await Promise.all([
    deps.store.query(PATH.xps(uid)), deps.store.query(PATH.attempts(uid), [], { orderBy: ["createdAt", "desc"], limit: 100 }),
    deps.store.query(PATH.rankEvents(uid)), deps.store.query(PATH.evidences(uid)),
  ]);
  const verdicts = { profile: await checkRecord(deps.secrets, "profile", profile as unknown as SignedRow), xpTampered: 0, attemptsTampered: 0, rankTampered: 0 };
  const counts = async (kind: "xp" | "rank", row: SignedRow) => {
    const v = await checkRecord(deps.secrets, kind, row);
    return v === "ok" || (v === "unknown" && !!row.sig);
  };
  const xpOk: XpTransaction[] = [];
  for (const r of xpRows) { if (await counts("xp", r.data as SignedRow)) xpOk.push(r.data as unknown as XpTransaction); else verdicts.xpTampered++; }
  for (const r of attemptRows) if ((await checkRecord(deps.secrets, "attempt", r.data as SignedRow)) === "tampered") verdicts.attemptsTampered++;
  const rankOk: { newRank?: number }[] = [];
  for (const r of rankRows) { if (await counts("rank", r.data as SignedRow)) rankOk.push(r.data as { newRank?: number }); else verdicts.rankTampered++; }
  const xpTotal = xpOk.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const rankFromLedger = Math.max(1, ...rankOk.map((e) => Number(e.newRank) || 1));
  const ledgerMismatch = xpTotal !== profile.xp.total || rankFromLedger !== profile.rank.level;
  let repaired = false;
  const actor = opts.by;
  if (opts.repair && (verdicts.profile === "tampered" || ledgerMismatch)) {
    const evidence = evRows.map((r) => r.data as unknown as DevEvidence & { void?: boolean }).filter((e) => !e.void);
    const rules = { upScore: policy.scoring.upScore, downScore: policy.scoring.downScore, upAfter: policy.scoring.upAfter, downAfter: policy.scoring.downAfter, recentPerDim: policy.scoring.recentPerDim };
    const now = deps.now();
    const dims = { ...profile.dims };
    for (const d of DIMENSION_IDS) {
      const evs = evidence.filter((e) => e.dim === d).map((e) => ({ score: e.score, difficulty: e.difficulty, quality: e.quality, kind: e.kind, setting: e.setting, sourceId: e.sourceId, at: e.recordedAt, guess: e.guess }));
      dims[d] = { ...replayDimension(evs, rules, now), retention: profile.dims[d].retention };
    }
    const next: DevProfile = {
      ...profile, dims, summary: weightedSummary(dims, policy.weights[profile.track]), xp: { ...profile.xp, total: xpTotal },
      rank: { ...profile.rank, level: rankFromLedger as DevProfile["rank"]["level"] },
      integrity: [...(profile.integrity ?? []), { at: now, note: `rebuilt from ledgers by ${actor.name}` }].slice(-10), updatedAt: now,
    };
    await deps.store.set(PATH.user(uid), (await signRecord(deps.secrets, "profile", next)) as unknown as Doc);
    repaired = true;
    await audit(deps, actor, "repair_profile", uid, JSON.stringify(verdicts));
  }
  return { ...verdicts, xpLedger: xpTotal, xpProfile: profile.xp.total, rankLedger: rankFromLedger, rankProfile: profile.rank.level, ledgerMismatch, repaired };
}

/** Everyone the admin may see who is staff, with whether they have started (for the people list). */
export async function adminStaff(deps: Deps, actor: Actor) {
  const tracks = scopeOf(actor);
  const policy = await loadPolicy(deps);
  const users = await deps.store.query(PATH.users);
  const profiles = new Map((await deps.store.query("devos_users")).map((r) => [r.id, r.data as unknown as DevProfile]));
  return users
    .map((r) => ({ uid: r.id, ...(r.data as { name?: string; role?: string; isActive?: boolean; externalCreator?: boolean }) }))
    .filter((u) => u.isActive !== false && !u.externalCreator && u.role)
    .map((u) => {
      const p = profiles.get(u.uid);
      const track = (p?.track ?? policy.defaultTrackByRole[u.role!] ?? "admin") as TrackId;
      return { uid: u.uid, name: u.name ?? "", role: u.role!, track, started: !!p && p.status !== "invited", enrolled: p?.enrolled ?? !!policy.enrollRoles[u.role!], status: p?.status ?? "invited" };
    })
    .filter((u) => tracks.includes(u.track));
}

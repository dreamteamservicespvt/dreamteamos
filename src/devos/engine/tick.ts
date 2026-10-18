/**
 * The tick — the scheduled worker that runs the Development OS with every browser closed (FR-057, NFR-001, AC-021).
 *
 * Woken by the cron (`api/devos.ts` GET with CRON_SECRET: cron-job.org every 30 minutes + Vercel's daily cron) and, as
 * a safety net, by a staff member's app when the last run is stale (`catchup` — it still runs on the server). Each run
 * does bounded, idempotent steps within a time budget and leaves a heartbeat in `devos_health/current`:
 *   once a day (claimed in `devos_runs/roll_<day>`, so two runs never both do it): expire overdue tasks (a platform
 *     fault becomes `system_error`, never a failure — FR-030), create today's quests and this week's challenges for
 *     everyone, invite people who have not started, open the leagues and the team missions, close ended seasons,
 *     rebuild the admin snapshot and write the daily report;
 *   at 9:00 and 17:00 IST (claimed): the "quest ready" and "quest still waiting" notices, outside quiet hours;
 *   every run: grade the queued answers, close due leagues, settle missions, top up the AI pool, refresh the boards.
 */
import { addDays, isWorkday, istDay, istHour, timeLabel } from "../core/days.js";
import { DIMENSION_IDS } from "../core/dimensions.js";
import { isLearnerUnder, type DevPolicy } from "../core/policy.js";
import { refreshConfidence } from "../core/mastery.js";
import type { DevProfile, DevSession, DevTask, HealthDoc, TickSummary, TrackId } from "../core/types.js";
import { replenishPool, type PoolTarget } from "./aipool.js";
import { closeDueLeagues, closeEndedSeasons, ensureLeague, ensureMission, rebuildBoards, settleMissions } from "./competition.js";
import { loadPolicy, PATH, type Deps } from "./context.js";
import { ensureTodayFor, finishOpenGrading, newProfile } from "./learner.js";
import { checkRecord, signRecord } from "./integrity.js";
import { checkPerson } from "./admin.js";
import { generateReport, rebuildSnapshot, type Snapshot } from "./reports.js";
import { gradePractical, resumeAppeal } from "./review.js";
import { calendarFor, closeAndSettle } from "./progress.js";
import { runCalibration } from "./calibration.js";
import { dequeueGrading, enqueueGrading, isQueued, QUEUE_PATH, type QueueItem } from "./queue.js";
import type { Doc } from "./store.js";

export { QUEUE_PATH };

const dequeue = dequeueGrading;

/** Create-once claim: true for exactly one caller per id. */
async function claim(deps: Deps, id: string): Promise<boolean> {
  return deps.store.tx(async (t) => {
    if (await t.get(PATH.run(id))) return false;
    t.set(PATH.run(id), { id, at: deps.now() });
    return true;
  });
}

interface StaffUser { uid: string; name: string; role: string; team: string; isActive: boolean; externalCreator: boolean }

async function readStaff(deps: Deps): Promise<StaffUser[]> {
  const rows = await deps.store.query(PATH.users);
  return rows.map((r) => {
    const d = r.data as { name?: string; role?: string; createdBy?: string; isActive?: boolean; externalCreator?: boolean };
    return { uid: r.id, name: String(d.name ?? ""), role: String(d.role ?? ""), team: String(d.createdBy ?? ""), isActive: d.isActive !== false, externalCreator: !!d.externalCreator };
  }).filter((u) => u.role && u.isActive && !u.externalCreator);
}

const quiet = (policy: DevPolicy, hour: number) => {
  const { quietFromHour: from, quietToHour: to } = policy.notifications;
  return from > to ? hour >= from || hour < to : hour >= from && hour < to;
};

/**
 * Put back in the grading queue whatever of this person's is still waiting for a grade but is not queued (queue.ts):
 * an open answer still `pending_validation` (looked for only when the profile counts one), a practical with
 * `submissionPending`. One small query each; nothing is graded here — the queue step does that.
 */
async function requeueStranded(deps: Deps, uid: string, pendingAnswers: number, queueDoc: Doc | null): Promise<number> {
  const missing: QueueItem[] = [];
  if (pendingAnswers > 0) {
    for (const r of await deps.store.query(PATH.attempts(uid), [["outcome", "==", "pending_validation"]])) {
      if (!isQueued(queueDoc, uid, r.id)) missing.push({ uid, kind: "attempt", id: r.id, since: Number(r.data.submittedAt) || deps.now() });
    }
  }
  for (const r of await deps.store.query(PATH.tasks(uid), [["submissionPending", "==", true]])) {
    const at = Number((r.data.submission as { at?: number } | undefined)?.at);
    if (!isQueued(queueDoc, uid, r.id)) missing.push({ uid, kind: "task", id: r.id, since: at || deps.now() });
  }
  // Kept at the time they started waiting, so this same run's grading step can take them (it skips the last 2 min).
  for (const { since, ...m } of missing) await enqueueGrading(deps, m, since);
  return missing.length;
}

/** The same for appeals still waiting for the graders (one query for the whole company — `pending` is rare). */
async function requeueAppeals(deps: Deps, queueDoc: Doc | null): Promise<number> {
  let n = 0;
  for (const r of await deps.store.query("devos_corrections", [["pending", "==", true]], { limit: 100 })) {
    const uid = String(r.data.uid ?? "");
    if (!uid || isQueued(queueDoc, uid, r.id)) continue;
    await enqueueGrading(deps, { uid, kind: "appeal", id: r.id }, Number(r.data.at) || deps.now());
    n++;
  }
  return n;
}

/** Expire this person's overdue tasks (the deadline is the server's — FR-029). */
async function expireOverdue(deps: Deps, policy: DevPolicy, uid: string): Promise<number> {
  const now = deps.now();
  const grace = policy.scoring.timeGraceSec * 1000;
  const rows = await deps.store.query(PATH.tasks(uid), [["state", "in", ["assigned", "in_progress"]]]);
  let n = 0;
  for (const r of rows) {
    const task = r.data as unknown as DevTask;
    // A timed assessment ends with its own clock (a rank assessment's 30 minutes), long before its task's date.
    const timed = task.kind === "rank" || task.kind === "league";
    const session = timed || now > task.dueAt + grace ? ((await deps.store.get(PATH.session(uid, task.id))) as unknown as DevSession | null) : null;
    const due = timed && session ? Math.min(task.dueAt, session.dueAt) : task.dueAt;
    if (now <= due + grace) continue;
    if (task.kind === "baseline") {
      // The baseline never "fails" for being slow — it stays open, a week at a time.
      await deps.store.set(PATH.task(uid, task.id), { dueAt: now + 7 * 86_400_000, events: [...task.events, { from: task.state, to: task.state, at: now, by: "system", reason: "deadline extended — the baseline stays open" }] }, true);
      continue;
    }
    if (session && session.slots.some((s) => s.state === "answered" || (timed && (s.state === "served" || s.state === "expired")))) {
      // Answered in part — or an assessment with a question already shown: close the rest (each counts as 0) and settle.
      // A task like that ends "expired" (a quest earns no quest XP); a rank assessment walked away from is recorded as
      // taken, so its cooldown applies (core/progress.completeTask).
      await closeAndSettle(deps, policy, uid, task.id, "the deadline passed before it was answered");
      n++;
      continue;
    }
    const fault = !!session?.slots.some((s) => s.state === "skipped_system");
    const to = fault ? "system_error" : "expired";
    await deps.store.tx(async (t) => {
      const fresh = (await t.get(PATH.task(uid, task.id))) as unknown as DevTask;
      if (!["assigned", "in_progress"].includes(fresh.state)) return;
      t.set(PATH.task(uid, task.id), { ...fresh, state: to, events: [...fresh.events, { from: fresh.state, to, at: now, by: "system", reason: fault ? "closed — a platform fault, not counted against you" : "the deadline passed" }] } as unknown as Doc);
      const p = (await t.get(PATH.user(uid))) as unknown as DevProfile | null;
      if (p && to === "expired") t.set(PATH.user(uid), { stats: { ...p.stats, tasksExpired: p.stats.tasksExpired + 1 }, updatedAt: now }, true);
    });
    n++;
  }
  return n;
}

export interface TickOptions {
  reason: "cron" | "manual" | "catchup";
  budgetMs?: number;
  /** What woke a cron run (api/devos: the Vercel cron's schedule, or "open"); shown on the Automation tab. */
  trigger?: string;
}

export async function runTick(deps: Deps, opts: TickOptions): Promise<TickSummary> {
  const started = deps.now();
  const wall = Date.now();
  const budget = opts.budgetMs ?? 45_000;
  const left = () => budget - (Date.now() - wall);
  const policy = await loadPolicy(deps);
  const day = istDay(started);
  const hour = istHour(started);
  const summary: TickSummary = { at: started, ms: 0, mode: policy.mode, steps: [], questsCreated: 0, expired: 0, graded: 0, generated: 0, notifications: 0, errors: 0, trigger: (opts.trigger ?? opts.reason).slice(0, 40) };
  const step = async (id: string, minLeft: number, fn: () => Promise<string>) => {
    if (left() < minLeft) { summary.steps.push({ id, ok: true, note: "skipped (time budget)", ms: 0 }); return; }
    const t0 = Date.now();
    try {
      const note = await fn();
      summary.steps.push({ id, ok: true, note, ms: Date.now() - t0 });
    } catch (e) {
      summary.errors++;
      summary.steps.push({ id, ok: false, note: e instanceof Error ? e.message.slice(0, 200) : String(e), ms: Date.now() - t0 });
      deps.log("error", `devos tick step ${id} failed`, e instanceof Error ? e.message : e);
    }
  };

  if (policy.mode !== "off") {
    let staff: StaffUser[] | null = null;
    let snapshot: Snapshot | null = null;

    if (hour >= 6) {
      await step("rollover", 15_000, async () => {
        if (!(await claim(deps, `roll_${day}`))) return "already done today";
        staff = await readStaff(deps);
        const profiles = new Map((await deps.store.query("devos_users")).map((r) => [r.id, r.data as unknown as DevProfile]));
        const queueDoc = await deps.store.get(QUEUE_PATH);
        // Invites go out on working days only — never on a Sunday, a company holiday or the person's approved leave
        // (the same calendar as the quests): an invitation on a day off is noise, and the first one would otherwise
        // reach the whole company on whatever day the module happened to go live.
        const { cal, awayFor } = await calendarFor(deps, policy);
        const workday = isWorkday(day, cal);
        let invited = 0;
        let requeued = 0;
        for (const u of staff) {
          if (left() < 8_000) break;
          const p = profiles.get(u.uid);
          const learner = isLearnerUnder(policy, u, p?.enrolled ?? undefined);
          if (!learner) continue;
          if (!p || p.status === "invited") {
            if (!policy.autoInvite || !policy.notifications.enabled || !workday) continue;
            const inv = p?.invites;
            const due = !inv || (inv.count < policy.inviteMax && addDays(inv.lastDay, policy.inviteEveryDays) <= day);
            if (!due) continue;
            if ((await awayFor(u.uid)).has(day)) continue;
            const invites = { count: (inv?.count ?? 0) + 1, lastDay: day };
            if (p) await deps.store.set(PATH.user(u.uid), { invites }, true);
            else {
              // A COMPLETE profile, exactly as their first visit would make it (+ the invite count). A partial one — just
              // `invites` and a status — crashed the person's first visit (the browser test found it, 2026-10-18).
              const fresh = newProfile({ uid: u.uid, name: u.name, role: u.role, team: u.team, isActive: true }, policy, started);
              await deps.store.set(PATH.user(u.uid), (await signRecord(deps.secrets, "profile", { ...fresh, invites })) as unknown as Doc);
            }
            if (await deps.notify.send({ uid: u.uid, type: "devos_invite", title: "Your AI Development OS is ready", message: "Take your 20-minute baseline: ten short challenges that build your personal training plan.", link: "/dev-os", key: `devos_invite_${u.uid}_${day}`, push: !quiet(policy, hour) })) summary.notifications++;
            invited++;
            continue;
          }
          if (p.status !== "active") continue;
          requeued += await requeueStranded(deps, u.uid, p.stats?.pending ?? 0, queueDoc);
          summary.expired += await expireOverdue(deps, policy, u.uid);
          const res = await ensureTodayFor(deps, policy, u.uid, u);
          summary.questsCreated += res.created.length;
          // Staleness lowers confidence, never the score (FR-040).
          if (DIMENSION_IDS.some((d) => p.dims[d].lastAt !== null)) await deps.store.set(PATH.user(u.uid), { dims: refreshConfidence(p.dims, started) }, true);
        }
        requeued += await requeueAppeals(deps, queueDoc).catch(() => 0);
        // ── Integrity with nobody looking (owner, 2026-10-18: "0% human involvement") ── Every profile's signature is
        // checked each morning — they were read above, so it costs no reads; one edited outside the server is rebuilt
        // from its signed ledgers (admin.checkPerson) and the repair audited. It used to wait for an admin's Integrity button.
        let repairedProfiles = 0;
        for (const p of profiles.values()) {
          if ((await checkRecord(deps.secrets, "profile", p as unknown as Record<string, unknown> & { sig?: string })) !== "tampered") continue;
          const r = await checkPerson(deps, policy, p.uid, { repair: true, by: { uid: "system", name: "the daily integrity check" } }).catch(() => null);
          if (r?.repaired) repairedProfiles++;
        }
        const tracks: TrackId[] = ["sales", "technical", "admin"];
        for (const t of tracks) {
          const learners = [...profiles.values()].filter((p) => p.track === t && p.status === "active" && p.onboarding.baseline === "complete").map((p) => ({ uid: p.uid, name: p.name }));
          if (learners.length) await ensureLeague(deps, policy, t);
          await ensureMission(deps, policy, t, learners);
        }
        const closed = await closeEndedSeasons(deps, policy);
        // Question calibration (FR-013): withdraw the patterns almost nobody — or, at a hard level, everybody — passes.
        const calibration = await runCalibration(deps).catch((e) => {
          deps.log("warn", "calibration skipped", e instanceof Error ? e.message : e);
          return { judged: 0, flagged: [] as string[], expired: 0 };
        });
        snapshot = await rebuildSnapshot(deps, policy);
        const report = await generateReport(deps, policy, snapshot);
        for (const u of staff.filter((x) => x.role === "main_admin" || x.role === "tech_admin")) {
          if (await deps.notify.send({ uid: u.uid, type: "devos_report", title: "Development report for today", message: report.claims[0]?.text ?? "Open the Control Center for today's summary.", link: "/dev-os/admin/reports", key: `devos_report_${day}_${u.uid}`, push: false })) summary.notifications++;
        }
        return `${staff.length} staff · ${summary.questsCreated} tasks created · ${summary.expired} expired · ${invited} invited${requeued ? ` · ${requeued} re-queued for grading` : ""}${repairedProfiles ? ` · ${repairedProfiles} profile(s) edited outside the server rebuilt from their ledgers` : ""}${calibration.flagged.length ? ` · ${calibration.flagged.length} question pattern(s) withdrawn by calibration` : ""} · seasons closed: ${closed.join(",") || "none"}`;
      });
    }

    if (policy.notifications.enabled && hour >= policy.notifications.questReadyHour && hour < 17) {
      await step("quest_ready", 6_000, async () => {
        if (!(await claim(deps, `ready_${day}`))) return "already sent today";
        const rows = await deps.store.query("devos_users", [["status", "==", "active"]]);
        let sent = 0;
        for (const r of rows) {
          const p = r.data as unknown as DevProfile;
          const quest = (await deps.store.get(PATH.task(p.uid, `quest_${day}`))) as unknown as DevTask | null;
          if (!quest || quest.state !== "assigned") continue;
          if (await deps.notify.send({ uid: p.uid, type: "devos_quest", title: "Today's quest is ready", message: `${quest.blueprint?.length ?? 3} short challenges · about ${quest.estMinutes} minutes. ${quest.why}`.slice(0, 220), link: "/dev-os", key: `devos_quest_${p.uid}_${day}`, push: !quiet(policy, hour) })) sent++;
        }
        summary.notifications += sent;
        return `${sent} sent`;
      });
    }

    if (policy.notifications.enabled && hour >= policy.notifications.dueReminderHour && !quiet(policy, hour)) {
      await step("quest_due", 6_000, async () => {
        if (!(await claim(deps, `due_${day}`))) return "already sent today";
        const rows = await deps.store.query("devos_users", [["status", "==", "active"]]);
        let sent = 0;
        for (const r of rows) {
          const p = r.data as unknown as DevProfile;
          const quest = (await deps.store.get(PATH.task(p.uid, `quest_${day}`))) as unknown as DevTask | null;
          if (!quest || !["assigned", "in_progress"].includes(quest.state)) continue;
          const closes = timeLabel(quest.dueAt);
          if (await deps.notify.send({ uid: p.uid, type: "devos_due", title: "Your quest is still waiting", message: p.streak.current >= 2 ? `Keep your ${p.streak.current}-day streak — about ${quest.estMinutes} minutes, closes at ${closes}.` : `About ${quest.estMinutes} minutes — it closes at ${closes}.`, link: "/dev-os", key: `devos_due_${p.uid}_${day}`, push: true })) sent++;
        }
        summary.notifications += sent;
        return `${sent} sent`;
      });
    }

    await step("grading_queue", 12_000, async () => {
      const q = await deps.store.get(QUEUE_PATH);
      // An answer is queued the moment it is saved (queue.ts) and its own request is usually still grading it — leave
      // anything younger than two minutes to that request, so the judges are not asked twice.
      const settled = deps.now() - 120_000;
      const items = ((q?.items as QueueItem[]) ?? []).filter((it) => (it.since ?? 0) <= settled).slice(0, 3);
      const done: QueueItem[] = [];
      for (const it of items) {
        if (left() < 10_000) break;
        if (it.kind === "attempt") {
          const r = await finishOpenGrading(deps, policy, it.uid, it.id);
          const a = await deps.store.get(PATH.attempt(it.uid, it.id));
          if (r || a?.outcome !== "pending_validation") done.push(it);
          if (r) summary.graded++;
        } else if (it.kind === "appeal") {
          // An appeal the graders could not answer when it was made — decided here, never by a person.
          if ((await resumeAppeal(deps, policy, it.uid, it.id)) === "resolved") { done.push(it); summary.graded++; }
        } else {
          const ok = await gradePractical(deps, policy, it.uid, it.id);
          const tsk = await deps.store.get(PATH.task(it.uid, it.id));
          if (ok || tsk?.state !== "completed" || tsk?.scoring) done.push(it);
          if (ok) summary.graded++;
        }
      }
      await dequeue(deps, done);
      return `${done.length} of ${items.length} settled`;
    });

    await step("leagues", 5_000, async () => `${await closeDueLeagues(deps, policy)} closed`);
    await step("missions", 5_000, async () => `${await settleMissions(deps, policy)} settled`);

    await step("ai_pool", 20_000, async () => {
      if (!deps.ai || !policy.ai.enabled) return "AI off";
      const snap = snapshot ?? ((await deps.store.get(PATH.snapshot)) as unknown as Snapshot | null);
      const targets: PoolTarget[] = (snap?.targets ?? []).map((t) => ({ track: t.track, dim: t.dim, difficulty: Math.min(5, Math.max(1, t.difficulty)) as PoolTarget["difficulty"], kind: t.kind }));
      if (!targets.length) return "no demand yet";
      const r = await replenishPool(deps, policy, targets, opts.reason === "manual" ? 3 : 2);
      summary.generated += r.accepted;
      await bumpQuality(deps, day, { generated: r.accepted, rejected: r.rejected, duplicatesBlocked: r.duplicates }, r.calls);
      return `${r.accepted} accepted · ${r.rejected} rejected · ${r.duplicates} duplicates`;
    });

    await step("boards", 4_000, async () => {
      const b = await rebuildBoards(deps, policy);
      return `${b.seasonId}: ${b.boards.mastery.length} on Mastery`;
    });
  }

  summary.ms = deps.now() - started;
  await deps.store.set(PATH.health, { lastTickAt: started, lastTick: summary, updatedAt: deps.now() }, true);
  return summary;
}

/** Add to today's quality and AI counters on the health document. */
export async function bumpQuality(deps: Deps, day: string, add: Partial<HealthDoc["quality"]>, calls: { ok: boolean; tokensIn?: number; tokensOut?: number; error?: string }[] = []): Promise<void> {
  await deps.store.tx(async (t) => {
    const h = ((await t.get(PATH.health)) as unknown as HealthDoc | null) ?? null;
    const q = h?.quality?.day === day ? h.quality : { day, generated: 0, rejected: 0, duplicatesBlocked: 0, judgeDisagreements: 0, pendingValidation: 0 };
    const ai = h?.ai?.day === day ? h.ai : { day, calls: 0, failures: 0, tokensIn: 0, tokensOut: 0 };
    const failed = calls.filter((c) => !c.ok);
    t.set(PATH.health, {
      quality: { ...q, generated: q.generated + (add.generated ?? 0), rejected: q.rejected + (add.rejected ?? 0), duplicatesBlocked: q.duplicatesBlocked + (add.duplicatesBlocked ?? 0), judgeDisagreements: q.judgeDisagreements + (add.judgeDisagreements ?? 0), pendingValidation: q.pendingValidation + (add.pendingValidation ?? 0) },
      ai: { ...ai, calls: ai.calls + calls.length, failures: ai.failures + failed.length, tokensIn: ai.tokensIn + calls.reduce((s, c) => s + (c.tokensIn ?? 0), 0), tokensOut: ai.tokensOut + calls.reduce((s, c) => s + (c.tokensOut ?? 0), 0), ...(failed.length ? { lastError: failed[failed.length - 1].error } : {}), ...(calls.length > failed.length ? { lastOkAt: deps.now() } : {}) },
      updatedAt: deps.now(),
    }, true);
  });
}

/** How long a key Google refused is skipped (then tried once again — a replaced or restored key comes back by itself). */
export const DEAD_KEY_SKIP_MS = 24 * 3_600_000;

/**
 * Remember the keys this request found dead (fingerprints only — never a key), so the next requests skip them
 * (`geminiPort` `skip`). Without it every request paid one Gemini request per dead key (11 of 30 on 2026-10-18).
 */
export async function recordDeadKeys(deps: Deps, found: { fp: string; why: string }[]): Promise<void> {
  if (!found.length) return;
  const now = deps.now();
  await deps.store.tx(async (t) => {
    const h = (await t.get(PATH.health)) as unknown as HealthDoc | null;
    const keep = (h?.deadKeys ?? []).filter((k) => k.until > now && !found.some((f) => f.fp === k.fp));
    const fresh = found.map((f) => ({ fp: f.fp, why: f.why.slice(0, 120), until: now + DEAD_KEY_SKIP_MS }));
    t.set(PATH.health, { deadKeys: [...keep, ...fresh].slice(-60), updatedAt: now }, true);
  });
}

/** The fingerprints to skip now. */
export const deadKeyFingerprints = (h: Pick<HealthDoc, "deadKeys"> | null, now: number): string[] =>
  (h?.deadKeys ?? []).filter((k) => k.until > now).map((k) => k.fp);

/** One tick slot when the tick is open (no CRON_SECRET — api/devos.ts): 20 minutes for the whole company. */
export const TICK_SLOT_MS = 20 * 60_000;

/**
 * Claim this slot for an open tick: true for the first caller of the slot, false for every other one (one document,
 * `devos_runs/open`, in a transaction). So with nobody setting anything up, any number of callers — the Vercel crons, a
 * retry, a stranger — make the tick run at most once per slot.
 */
export async function claimTickSlot(deps: Deps, slotMs = TICK_SLOT_MS): Promise<boolean> {
  const slot = Math.floor(deps.now() / slotMs);
  return deps.store.tx(async (t) => {
    const d = (await t.get(PATH.run("open"))) as { slot?: number } | null;
    if (d && Number(d.slot) >= slot) return false;
    t.set(PATH.run("open"), { slot, at: deps.now() } as unknown as Doc);
    return true;
  });
}

/** Is a catch-up run due (the cron has not run for a while during the working day)? */
export async function catchupDue(deps: Deps): Promise<boolean> {
  const h = (await deps.store.get(PATH.health)) as unknown as HealthDoc | null;
  const now = deps.now();
  const hour = istHour(now);
  if (hour < 6 || hour >= 21) return false;
  const day = istDay(now);
  const rolled = await deps.store.get(PATH.run(`roll_${day}`));
  if (!rolled) return true;
  return !h?.lastTickAt || now - h.lastTickAt > 2 * 3_600_000;
}

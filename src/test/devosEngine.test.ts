/**
 * The Development OS engine end to end (2026-10-18) on the in-memory Firestore with the deterministic fake AI — the
 * integration layer of MSRS §18.1 and the acceptance criteria it can prove without live services.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));

import * as sdk from "firebase/firestore";
import * as mem from "./memoryFirestore";
import { clientStore, type ClientSdk } from "@/devos/engine/store";
import { deriveSecrets, open } from "@/devos/core/crypto";
import { fakeAi } from "@/devos/engine/fakeAi";
import type { Actor, Deps, Notice } from "@/devos/engine/context";
import { PATH } from "@/devos/engine/context";
import { ensureProfile, onboard, startTask, answer, nextItem, hint, ensureTodayFor, startPractice, startRankAssessment, setBoardPrivacy } from "@/devos/engine/learner";
import { dispatch } from "@/devos/engine/router";
import { appeal, coach, submitPractical } from "@/devos/engine/review";
import { joinLeague, closeDueLeagues } from "@/devos/engine/competition";
import { runTick } from "@/devos/engine/tick";
import { applyAttempt } from "@/devos/engine/progress";
import { replenishPool } from "@/devos/engine/aipool";
import { adminIntegrity, adminOverview, adminPerson, adminQuarantine, adminQuestions, adminSavePolicy } from "@/devos/engine/admin";
import { flaggedPatterns } from "@/devos/engine/calibration";
import { judgePattern } from "@/devos/core/calibration";
import { generateTemplate } from "@/devos/content/catalogue";
import { DEFAULT_POLICY, validatePolicy } from "@/devos/core/policy";
import { timeLabel } from "@/devos/core/days";
import { evaluateRank } from "@/devos/core/ranks";
import { rankBlueprint } from "@/devos/core/director";
import { seasonOf } from "@/devos/core/season";
import { similarityDecision } from "@/devos/core/similarity";
import type { AttemptResponse, DevAttempt, DevProfile, DevSession, DevTask, Exposure, ItemKey, PublicItem, QuestionDoc, SeenEntry } from "@/devos/core/types";

const store = clientStore(sdk as unknown as ClientSdk, {});
let clock = Date.UTC(2026, 9, 20, 5, 0); // Tue 20 Oct 2026, 10:30 IST
const notices: Notice[] = [];

async function makeDeps(ai = fakeAi()): Promise<Deps> {
  return {
    store, ai, secrets: await deriveSecrets("unit-test-secret-material-0123456789"), now: () => clock,
    notify: { send: async (n) => { if (notices.some((x) => x.key === n.key)) return false; notices.push(n); return true; } },
    log: () => undefined,
  };
}

const ravi: Actor = { uid: "u_ravi", name: "Ravi Kumar", role: "sales_member", team: "sa1", isActive: true };
const teja: Actor = { uid: "u_teja", name: "Teja Rao", role: "tech_member", team: "ta1", isActive: true };
const boss: Actor = { uid: "u_boss", name: "Owner", role: "main_admin", team: "", isActive: true };

/** The right answer for the item on screen (the test reads the sealed key — the learner never can). */
async function rightAnswer(deps: Deps, uid: string, item: PublicItem): Promise<AttemptResponse> {
  const q = mem.__read(PATH.question(item.qid)) as unknown as QuestionDoc;
  const key = (await open<ItemKey>(deps.secrets, q.key))!;
  const ex = mem.__read(PATH.exposure(uid, item.qid)) as unknown as Exposure;
  if (item.type === "mcq" || item.type === "multi") return { kind: "choice", selected: key.correct!.map((o) => ex.optionOrder!.indexOf(o)) };
  if (item.type === "numeric") return { kind: "number", value: key.value! };
  if (item.type === "order") return { kind: "order", order: key.order!.map((o) => ex.optionOrder!.indexOf(o)) };
  return { kind: "text", text: key.exemplar ?? "I would acknowledge the concern, explain the reason clearly, and give a specific next step with a time." };
}

async function wrongAnswer(deps: Deps, uid: string, item: PublicItem): Promise<AttemptResponse> {
  const right = await rightAnswer(deps, uid, item);
  if (right.kind === "choice") return { kind: "choice", selected: [(right.selected[0] + 1) % item.options!.length] };
  if (right.kind === "number") return { kind: "number", value: right.value + 7 };
  if (right.kind === "order") return { kind: "order", order: [...right.order].reverse() };
  return { kind: "text", text: "ok" };
}

async function finishTask(deps: Deps, actor: Actor, taskId: string, correct = true) {
  let play = await startTask(deps, actor, taskId);
  let guard = 0;
  while (play.item && guard++ < 20) {
    const resp = correct ? await rightAnswer(deps, actor.uid, play.item) : await wrongAnswer(deps, actor.uid, play.item);
    await answer(deps, actor, { taskId, slotIndex: play.slotIndex, response: resp });
    play = await nextItem(deps, actor, taskId);
  }
  return play;
}

beforeEach(() => {
  mem.__reset();
  notices.length = 0;
  clock = Date.UTC(2026, 9, 20, 5, 0);
  mem.__seed("users/u_ravi", { uid: "u_ravi", name: "Ravi Kumar", role: "sales_member", createdBy: "sa1", isActive: true });
  mem.__seed("users/u_teja", { uid: "u_teja", name: "Teja Rao", role: "tech_member", createdBy: "ta1", isActive: true });
  mem.__seed("users/u_boss", { uid: "u_boss", name: "Owner", role: "main_admin", createdBy: "", isActive: true });
});

describe("devos engine — onboarding and the baseline (AC-001, FR-004)", () => {
  it("creates a profile, onboards with consent, and completes a ten-dimension baseline", async () => {
    const deps = await makeDeps();
    const p0 = await ensureProfile(deps, ravi);
    expect(p0.status).toBe("invited");
    await expect(onboard(deps, ravi, { consent: false, answers: {}, track: "sales" })).rejects.toThrow(/accept/);
    const { taskId } = await onboard(deps, ravi, { consent: true, answers: { work: ["calls"], coding: ["no"] }, track: "sales" });
    expect(taskId).toBe("baseline");
    const play = await finishTask(deps, ravi, "baseline", true);
    expect(play.item).toBeNull();
    const p = mem.__read(PATH.user("u_ravi")) as unknown as DevProfile;
    expect(p.onboarding.baseline).toBe("complete");
    const measured = Object.values(p.dims).filter((d) => d.score !== null).length;
    expect(measured).toBe(10);
    expect(p.xp.total).toBeGreaterThanOrEqual(100);
    expect(p.badges).toContain("first_steps");
    expect(p.rank.level).toBe(1);
    expect(p.summary).not.toBeNull();
    // Every slot was recorded as an immutable attempt with a signature.
    const attempts = mem.__all(PATH.attempts("u_ravi")) as unknown as DevAttempt[];
    expect(attempts.length).toBe(10);
    expect(attempts.every((a) => typeof a.sig === "string" && a.appliedAt)).toBe(true);
  });
});

describe("devos engine — never the same question twice (AC-005, AC-006, FR-008, FR-009)", () => {
  it("serves only fresh, non-duplicate items across many sessions", async () => {
    const deps = await makeDeps();
    await onboard(deps, teja, { consent: true, answers: {}, track: "technical" });
    await finishTask(deps, teja, "baseline", true);
    for (let i = 0; i < 6; i++) {
      clock += 3600_000;
      const { taskId } = await startPractice(deps, teja);
      await finishTask(deps, teja, taskId, i % 2 === 0);
    }
    const seen = (mem.__read(PATH.seen("u_teja", 0))?.e ?? []) as SeenEntry[];
    expect(seen.length).toBeGreaterThanOrEqual(12);
    expect(new Set(seen.map((e) => e.q)).size).toBe(seen.length);
    expect(new Set(seen.map((e) => e.s)).size).toBe(seen.length);
    for (let i = 0; i < seen.length; i++) {
      const d = similarityDecision({ x: seen[i].x, n: seen[i].n, m: seen[i].m, s: seen[i].s }, seen.filter((_, j) => j !== i), { lexicalJaccard: 0.62, simhashMaxHamming: 9 });
      expect(d.duplicate, `item ${i} duplicates ${d.nearest} (${d.reason})`).toBe(false);
    }
    // The exposure was written for every served item (before its content went out).
    for (const e of seen) expect(mem.__read(PATH.exposure("u_teja", e.q))).toBeTruthy();
  });
});

describe("devos engine — attempts, XP and idempotency (AC-009, AC-022, FR-034)", () => {
  it("answering twice never double-counts and a failure creates a fresh retry", async () => {
    const deps = await makeDeps();
    await onboard(deps, ravi, { consent: true, answers: {}, track: "sales" });
    await finishTask(deps, ravi, "baseline", true);
    const { taskId } = await startPractice(deps, ravi, "logical");
    const play = await startTask(deps, ravi, taskId);
    const resp = await wrongAnswer(deps, ravi.uid, play.item!);
    const r1 = await answer(deps, ravi, { taskId, slotIndex: play.slotIndex, response: resp });
    const xpAfter = (mem.__read(PATH.user("u_ravi")) as unknown as DevProfile).xp.total;
    const xpRows = mem.__all(PATH.xps("u_ravi")).length;
    const r2 = await answer(deps, ravi, { taskId, slotIndex: play.slotIndex, response: await rightAnswer(deps, ravi.uid, play.item!) });
    expect(r2.attempt.id).toBe(r1.attempt.id);
    expect(r2.attempt.outcome).toBe("failed");
    expect((mem.__read(PATH.user("u_ravi")) as unknown as DevProfile).xp.total).toBe(xpAfter);
    expect(mem.__all(PATH.xps("u_ravi")).length).toBe(xpRows);
    expect(r1.attempt.feedback?.next).toMatch(/fresh try/i);
    expect(r1.remediationTaskId).toBeTruthy();
    const fix = mem.__read(PATH.task("u_ravi", r1.remediationTaskId!)) as unknown as DevTask;
    expect(fix.kind).toBe("remediation");
    expect(fix.blueprint![0].avoidSettings).toContain(r1.attempt.setting);
    const fixPlay = await startTask(deps, ravi, fix.id);
    expect(fixPlay.item).toBeTruthy();
    const fixAttemptSetting = (mem.__read(PATH.question(fixPlay.item!.qid)) as unknown as QuestionDoc).setting;
    expect(fixAttemptSetting).not.toBe(r1.attempt.setting);
  });

  it("an answer after the deadline is recorded as expired and earns nothing", async () => {
    const deps = await makeDeps();
    await onboard(deps, ravi, { consent: true, answers: {}, track: "sales" });
    await finishTask(deps, ravi, "baseline", true);
    const { taskId } = await startPractice(deps, ravi);
    const play = await startTask(deps, ravi, taskId);
    clock += 3 * 86_400_000;
    const r = await answer(deps, ravi, { taskId, slotIndex: play.slotIndex, response: await rightAnswer(deps, ravi.uid, play.item!) });
    expect(r.attempt.outcome).toBe("expired");
    expect(r.attempt.reasonCode).toBe("deadline");
    expect(r.xpGained).toBe(0);
  });

  it("hints are progressive and reduce the score", async () => {
    const deps = await makeDeps();
    await onboard(deps, ravi, { consent: true, answers: {}, track: "sales" });
    await finishTask(deps, ravi, "baseline", true);
    const { taskId } = await startPractice(deps, ravi, "decision");
    const play = await startTask(deps, ravi, taskId);
    expect(play.hints).toEqual([]);
    const h1 = await hint(deps, ravi, taskId, play.slotIndex);
    expect(h1.used).toBe(1);
    // Leaving and coming back shows the hint already taken (it already counts in the score).
    const resumed = await nextItem(deps, ravi, taskId);
    expect(resumed.item?.qid).toBe(play.item!.qid);
    expect(resumed.hints).toEqual([h1.hint]);
    const r = await answer(deps, ravi, { taskId, slotIndex: play.slotIndex, response: await rightAnswer(deps, ravi.uid, play.item!) });
    expect(r.attempt.hintsUsed).toBe(1);
    if (r.attempt.item.type !== "open") {
      expect(r.attempt.scoring!.passed).toBe(true);
      expect(r.attempt.scoring!.score).toBeLessThan(100);
    }
  });
});

describe("devos engine — open answers and AI failure (FR-018, FR-027, AC-023, AC-026)", () => {
  it("keeps an open answer pending while the AI is down, then the tick grades it", async () => {
    const down = fakeAi({ down: true });
    const deps = await makeDeps(down);
    await onboard(deps, ravi, { consent: true, answers: {}, track: "sales" });
    let play = await startTask(deps, ravi, "baseline");
    let pendingId: string | null = null;
    while (play.item) {
      const r = await answer(deps, ravi, { taskId: "baseline", slotIndex: play.slotIndex, response: await rightAnswer(deps, ravi.uid, play.item) });
      if (r.attempt.outcome === "pending_validation") pendingId = r.attempt.id;
      play = await nextItem(deps, ravi, "baseline");
    }
    expect(pendingId).toBeTruthy();
    const queue = mem.__read("devos_queue/grading")?.items as { id: string }[];
    expect(queue.some((q) => q.id === pendingId)).toBe(true);
    const task = mem.__read(PATH.task("u_ravi", "baseline")) as unknown as DevTask;
    expect(task.state).toBe("completed");
    const up = await makeDeps(fakeAi());
    clock += 3600_000;
    const summary = await runTick(up, { reason: "manual" });
    expect(summary.graded).toBeGreaterThan(0);
    const graded = mem.__read(PATH.attempt("u_ravi", pendingId!)) as unknown as DevAttempt;
    expect(["passed", "failed"]).toContain(graded.outcome);
    expect(graded.scoring!.criteria!.length).toBeGreaterThan(2);
  });

  it("an open answer joins the grading queue with its save, leaves it once graded, and a lost one is re-queued", async () => {
    // Graded at once: queued in the save's transaction, taken out when the judges settle it.
    const deps = await makeDeps();
    await onboard(deps, ravi, { consent: true, answers: {}, track: "sales" });
    let play = await startTask(deps, ravi, "baseline");
    let openId: string | null = null;
    while (play.item) {
      const r = await answer(deps, ravi, { taskId: "baseline", slotIndex: play.slotIndex, response: await rightAnswer(deps, ravi.uid, play.item) });
      if (r.attempt.item.type === "open") openId = r.attempt.id;
      play = await nextItem(deps, ravi, "baseline");
    }
    expect(openId).toBeTruthy();
    expect(((mem.__read("devos_queue/grading")?.items as { id: string }[]) ?? []).some((q) => q.id === openId)).toBe(false);

    // The request died mid-grading AND the queue lost it (the case the old code stranded for ever): Teja's open
    // answer is pending, the queue is empty — the next morning's roll-over puts it back and the same run grades it.
    const down = await makeDeps(fakeAi({ down: true }));
    await onboard(down, teja, { consent: true, answers: {}, track: "technical" });
    play = await startTask(down, teja, "baseline");
    const pendingIds: string[] = [];
    while (play.item) {
      const r = await answer(down, teja, { taskId: "baseline", slotIndex: play.slotIndex, response: await rightAnswer(down, teja.uid, play.item) });
      if (r.attempt.outcome === "pending_validation") pendingIds.push(r.attempt.id);
      play = await nextItem(down, teja, "baseline");
    }
    expect(pendingIds.length).toBeGreaterThan(0);
    expect((mem.__read("devos_queue/grading")?.items as { id: string }[]).map((q) => q.id)).toEqual(expect.arrayContaining(pendingIds));
    mem.__seed("devos_queue/grading", { items: [] });
    clock = Date.UTC(2026, 9, 21, 1, 30); // Wed 21 Oct, 07:00 IST — a new day's roll-over
    const summary = await runTick(await makeDeps(fakeAi()), { reason: "cron" });
    expect(summary.steps.find((s) => s.id === "rollover")?.note).toContain(`${pendingIds.length} re-queued for grading`);
    const outcomes = pendingIds.map((id) => (mem.__read(PATH.attempt("u_teja", id)) as unknown as DevAttempt).outcome);
    // The grading step takes up to three a run; the rest stay queued for the next run, none is lost.
    expect(outcomes.filter((o) => o === "passed" || o === "failed").length).toBe(Math.min(3, pendingIds.length));
    const stillQueued = ((mem.__read("devos_queue/grading")?.items as { id: string }[]) ?? []).map((q) => q.id);
    for (const [i, id] of pendingIds.entries()) if (outcomes[i] === "pending_validation") expect(stillQueued).toContain(id);
  });

  it("judges that disagree go to an adjudicator, never to an invented score", async () => {
    const deps = await makeDeps(fakeAi({ disagree: true }));
    await onboard(deps, teja, { consent: true, answers: {}, track: "technical" });
    let play = await startTask(deps, teja, "baseline");
    const outcomes: string[] = [];
    while (play.item) {
      const r = await answer(deps, teja, { taskId: "baseline", slotIndex: play.slotIndex, response: await rightAnswer(deps, teja.uid, play.item) });
      if (r.attempt.item.type === "open") outcomes.push(r.attempt.outcome);
      if (r.attempt.scoring?.method === "rubric_ai_adjudicated") expect(r.attempt.scoring.judges!.length).toBe(3);
      play = await nextItem(deps, teja, "baseline");
    }
    expect(outcomes.length).toBeGreaterThan(0);
    expect(outcomes.every((o) => ["passed", "failed", "pending_validation"].includes(o))).toBe(true);
  });
});

describe("devos engine — ranks are earned by evidence, never by XP (AC-016, FR-036)", () => {
  it("huge XP alone does not promote", async () => {
    const deps = await makeDeps();
    await onboard(deps, ravi, { consent: true, answers: {}, track: "sales" });
    await finishTask(deps, ravi, "baseline", true);
    const p = mem.__read(PATH.user("u_ravi")) as unknown as DevProfile;
    const rich = { ...p, xp: { ...p.xp, total: 999999 } };
    const ev = evaluateRank(rich, DEFAULT_POLICY, clock);
    expect(ev.eligible).toBe(false);
    expect(ev.gates.find((g) => g.id === "assessment")?.passed).toBe(false);
  });

  it("a promotion is issued exactly once — a retried answer or a replayed apply never issues it again", async () => {
    const deps = await makeDeps();
    await onboard(deps, ravi, { consent: true, answers: {}, track: "sales" });
    await finishTask(deps, ravi, "baseline", true);
    // One valid answer short of rank 2: every other gate already met (seeded — the test is about the write, not the gates).
    const p = mem.__read(PATH.user("u_ravi")) as unknown as DevProfile;
    const dims = Object.fromEntries(Object.entries(p.dims).map(([d, s]) => [d, { ...s, score: Math.max(s.score ?? 0, 70), confidence: "high" }]));
    const gate = DEFAULT_POLICY.rankGates[2];
    mem.__seed(PATH.user("u_ravi"), {
      ...p, dims,
      gates: {
        ...p.gates, validAttempts: gate.minValidAttempts - 1,
        assessments: [{ level: 2, score: 90, at: clock, sessionId: "rank_seeded", valid: true }],
        practicals: [{ difficulty: 3, score: 90, at: clock, taskId: "challenge_seeded", kind: "challenge" }],
      },
    });
    const { taskId } = await startPractice(deps, ravi);
    const play = await startTask(deps, ravi, taskId);
    const resp = await rightAnswer(deps, ravi.uid, play.item!);
    const first = await answer(deps, ravi, { taskId, slotIndex: play.slotIndex, response: resp });
    expect(first.rankUp).toBe(2);
    const again = await answer(deps, ravi, { taskId, slotIndex: play.slotIndex, response: resp });
    expect(again.rankUp).toBeNull();
    expect(again.xpGained).toBe(0);
    expect(await applyAttempt(deps, DEFAULT_POLICY, "u_ravi", first.attempt.id)).toBeNull();
    expect(mem.__all(PATH.rankEvents("u_ravi")).map((e) => e.id)).toEqual(["rank_2"]);
    expect(mem.__all(PATH.xps("u_ravi")).filter((x) => x.id === "xp_rank_2").length).toBe(1);
    const after = mem.__read(PATH.user("u_ravi")) as unknown as DevProfile;
    expect(after.rank.level).toBe(2);
    expect(after.rank.eventId).toBe("rank_2");
  });

  it("a rank assessment opens only after enough evidence", async () => {
    const deps = await makeDeps();
    await onboard(deps, ravi, { consent: true, answers: {}, track: "sales" });
    await finishTask(deps, ravi, "baseline", true);
    await expect(startRankAssessment(deps, ravi)).rejects.toThrow(/more items/);
  });
});

describe("devos engine — the tick runs everything with the browsers closed (AC-021, FR-057)", () => {
  it("the plan starts the moment the baseline ends; then the tick makes each working day's quest once", async () => {
    const deps = await makeDeps();
    await onboard(deps, ravi, { consent: true, answers: {}, track: "sales" });
    await finishTask(deps, ravi, "baseline", true);
    // Today's quest and the week's challenge exist as soon as the baseline is done (Tue 10:30 IST) — no page reload.
    const quest = mem.__read(PATH.task("u_ravi", "quest_2026-10-20")) as unknown as DevTask;
    expect(quest?.kind).toBe("quest");
    expect(quest.blueprint!.length).toBe(DEFAULT_POLICY.cadence.questItems);
    expect(mem.__read(PATH.task("u_ravi", "challenge_2026-10-19"))).toBeTruthy();
    // The next working day the tick makes the new quest, once, and sends the "ready" notice once.
    clock = Date.UTC(2026, 9, 21, 4, 0); // Wed 21 Oct, 09:30 IST
    const s1 = await runTick(await makeDeps(), { reason: "cron" });
    expect(s1.questsCreated).toBeGreaterThanOrEqual(1);
    expect(mem.__read(PATH.task("u_ravi", "quest_2026-10-21"))).toBeTruthy();
    const s2 = await runTick(await makeDeps(), { reason: "cron" });
    expect(s2.questsCreated).toBe(0);
    expect(notices.filter((n) => n.type === "devos_quest").length).toBe(1);
    // Teja never onboarded: invited, not given a quest.
    expect(notices.some((n) => n.uid === "u_teja" && n.type === "devos_invite")).toBe(true);
    expect(mem.__read(PATH.task("u_teja", "quest_2026-10-21"))).toBeUndefined();
  });

  it("does not create a quest on a Sunday or a holiday", async () => {
    const deps = await makeDeps();
    await onboard(deps, ravi, { consent: true, answers: {}, track: "sales" });
    await finishTask(deps, ravi, "baseline", true);
    mem.__seed("holidays/2026-10-21", { name: "Festival" });
    clock = Date.UTC(2026, 9, 21, 5, 0);
    const fresh = await makeDeps(); // the holiday list is read once per request
    const r = await ensureTodayFor(fresh, DEFAULT_POLICY, "u_ravi", { role: "sales_member", isActive: true });
    expect(r.reason).toBe("day_off");
    clock = Date.UTC(2026, 9, 25, 5, 0); // a Sunday
    const sunday = await ensureTodayFor(await makeDeps(), DEFAULT_POLICY, "u_ravi", { role: "sales_member", isActive: true });
    expect(sunday.reason).toBe("day_off");
  });

  it("invites people who have not started on working days only — never on a Sunday, a holiday or their leave", async () => {
    const invites = () => notices.filter((n) => n.type === "devos_invite").map((n) => n.uid).sort();
    mem.__seed("leave_requests/l1", { memberId: "u_teja", status: "approved", fromDate: "2026-10-26", toDate: "2026-10-26", duration: "full_day" });
    clock = Date.UTC(2026, 9, 25, 1, 30); // Sunday 25 Oct, 07:00 IST
    await runTick(await makeDeps(), { reason: "cron" });
    expect(invites()).toEqual([]);
    clock = Date.UTC(2026, 9, 26, 1, 30); // Monday 26 Oct — Teja is on approved leave
    await runTick(await makeDeps(), { reason: "cron" });
    expect(invites()).toEqual(["u_ravi"]); // the main admin is not enrolled by default
    clock = Date.UTC(2026, 9, 27, 1, 30); // Tuesday — Teja is back; Ravi's next reminder is 3 days after his first
    await runTick(await makeDeps(), { reason: "cron" });
    expect(invites()).toEqual(["u_ravi", "u_teja"]);

    // The invite made a COMPLETE profile (a partial one crashed the first visit — found in the browser test), so the
    // person's first open and onboarding just work.
    const invited = mem.__read(PATH.user("u_ravi")) as unknown as DevProfile;
    expect(invited.status).toBe("invited");
    expect(invited.onboarding.baseline).toBe("not_started");
    expect(Object.keys(invited.dims)).toHaveLength(10);
    expect(invited.invites?.count).toBe(1);
    const deps = await makeDeps();
    expect((await ensureProfile(deps, ravi)).invites?.count).toBe(1);
    await onboard(deps, ravi, { consent: true, answers: {}, track: "sales" });
    expect((mem.__read(PATH.user("u_ravi")) as unknown as DevProfile).onboarding.baseline).toBe("in_progress");
  });

  it("a half-written profile (as older invites left) is completed on the first visit, keeping its invites", async () => {
    mem.__seed(PATH.user("u_teja"), { uid: "u_teja", status: "invited", name: "Teja Rao", role: "tech_member", invites: { count: 2, lastDay: "2026-10-16" } });
    const p = await ensureProfile(await makeDeps(), teja);
    expect(p.onboarding.baseline).toBe("not_started");
    expect(p.invites).toEqual({ count: 2, lastDay: "2026-10-16" });
    const stored = mem.__read(PATH.user("u_teja")) as unknown as DevProfile;
    expect(Object.keys(stored.dims)).toHaveLength(10);
    expect(typeof stored.sig).toBe("string");
  });

  it("expires an overdue quest and keeps the baseline open", async () => {
    const deps = await makeDeps();
    await onboard(deps, ravi, { consent: true, answers: {}, track: "sales" });
    await finishTask(deps, ravi, "baseline", true);
    await runTick(deps, { reason: "cron" });
    clock = Date.UTC(2026, 9, 21, 5, 0);
    await runTick(deps, { reason: "cron" });
    const old = mem.__read(PATH.task("u_ravi", "quest_2026-10-20")) as unknown as DevTask;
    expect(old.state).toBe("expired");
    expect(mem.__read(PATH.task("u_ravi", "quest_2026-10-21"))).toBeTruthy();
  });
});

describe("devos engine — practical work, appeals, the coach", () => {
  it("rejects incomplete evidence and grades a complete submission", async () => {
    const deps = await makeDeps();
    await onboard(deps, ravi, { consent: true, answers: {}, track: "sales" });
    await finishTask(deps, ravi, "baseline", true);
    await runTick(deps, { reason: "cron" });
    const ch = mem.__read(PATH.task("u_ravi", "challenge_2026-10-19")) as unknown as DevTask;
    await expect(submitPractical(deps, ravi, { taskId: ch.id, fields: {} })).rejects.toThrow(/required/);
    const fields: Record<string, unknown> = {};
    for (const e of ch.evidence!) {
      if (e.kind === "text") fields[e.id] = "Plan: call Krishna Real Estate on Monday at 11 AM with two samples, then Sai Dental on Tuesday, ordered by value and likelihood; results reported Saturday with numbers.";
      if (e.kind === "number") fields[e.id] = 5;
      if (e.kind === "checklist") fields[e.id] = (e.items ?? []).map(() => true);
      if (e.kind === "link") fields[e.id] = "https://drive.google.com/file/d/abc";
    }
    const done = await submitPractical(deps, ravi, { taskId: ch.id, fields });
    expect(["passed", "failed"]).toContain(done.state);
    expect(done.scoring?.criteria?.length).toBeGreaterThan(2);
  });

  it("an appeal on a template item is upheld with the worked reason; the coach answers", async () => {
    const deps = await makeDeps();
    await onboard(deps, ravi, { consent: true, answers: {}, track: "sales" });
    await finishTask(deps, ravi, "baseline", true);
    const { taskId } = await startPractice(deps, ravi, "logical");
    const play = await startTask(deps, ravi, taskId);
    const r = await answer(deps, ravi, { taskId, slotIndex: play.slotIndex, response: await wrongAnswer(deps, ravi.uid, play.item!) });
    const a = await appeal(deps, ravi, { attemptId: r.attempt.id, reason: "I think the correct option is a different one." });
    expect(a.outcome).toBe("upheld");
    await expect(appeal(deps, ravi, { attemptId: r.attempt.id, reason: "Again please look at this one." })).rejects.toThrow(/already/);
    const c = await coach(deps, ravi, { attemptId: r.attempt.id, ask: "Why is my answer wrong?" });
    expect(c.reply.length).toBeGreaterThan(10);
  });
});

describe("devos engine — leagues, integrity, the AI pool, admin scope", () => {
  it("a league gives each participant a variant and closes into ratings", async () => {
    const deps = await makeDeps();
    for (const a of [ravi]) {
      await onboard(deps, a, { consent: true, answers: {}, track: "sales" });
      await finishTask(deps, a, "baseline", true);
    }
    mem.__seed("users/u_kiran", { uid: "u_kiran", name: "Kiran", role: "sales_member", createdBy: "sa1", isActive: true });
    const kiran: Actor = { uid: "u_kiran", name: "Kiran", role: "sales_member", team: "sa1", isActive: true };
    await onboard(deps, kiran, { consent: true, answers: {}, track: "sales" });
    await finishTask(deps, kiran, "baseline", false);
    const j1 = await joinLeague(deps, ravi);
    const j2 = await joinLeague(deps, kiran);
    expect(j1.round.id).toBe(j2.round.id);
    await finishTask(deps, ravi, j1.taskId, true);
    await finishTask(deps, kiran, j2.taskId, false);
    const s1 = mem.__read(PATH.session("u_ravi", j1.taskId)) as unknown as DevSession;
    const s2 = mem.__read(PATH.session("u_kiran", j2.taskId)) as unknown as DevSession;
    expect(s1.slots.map((s) => s.qid)).not.toEqual(s2.slots.map((s) => s.qid));
    clock = Date.UTC(2026, 9, 24, 15, 0); // Sat 24 Oct 20:30 IST
    expect(await closeDueLeagues(deps, DEFAULT_POLICY)).toBe(1);
    const round = mem.__read(PATH.league(j1.round.id)) as { state: string; results: { uid: string; position: number; ratingAfter: number }[] };
    expect(round.state).toBe("closed");
    expect(round.results[0].uid).toBe("u_ravi");
    expect(round.results[0].ratingAfter).toBeGreaterThan(1000);
  });

  it("detects a ledger row edited outside the server", async () => {
    const deps = await makeDeps();
    await onboard(deps, ravi, { consent: true, answers: {}, track: "sales" });
    await finishTask(deps, ravi, "baseline", true);
    const row = mem.__all(PATH.xps("u_ravi"))[0];
    mem.__seed(PATH.xp("u_ravi", row.id), { ...row, amount: 50000 });
    const report = await adminIntegrity(deps, boss, { uid: "u_ravi", repair: true });
    expect(report.xpTampered).toBe(1);
  });

  it("validates AI items: a wrong key is caught by the independent solver", async () => {
    const ai = fakeAi({ wrongKeyEvery: 2 });
    const deps = await makeDeps(ai);
    const r = await replenishPool(deps, DEFAULT_POLICY, [{ track: "sales", dim: "logical", difficulty: 3, kind: "objective" }], 1);
    expect(r.generated).toBeGreaterThan(0);
    expect(r.rejected).toBeGreaterThan(0);
    expect(r.accepted).toBeGreaterThan(0);
    const pool = mem.__all(PATH.questions).filter((q) => q.status === "pool") as unknown as QuestionDoc[];
    expect(pool.every((q) => q.validation.checks.some((c) => c.id === "independent_solver" && c.passed))).toBe(true);
  });

  it("closing a season keeps every skill, rank, badge and lifetime XP; its boards freeze and award the winner", async () => {
    const deps = await makeDeps();
    await onboard(deps, ravi, { consent: true, answers: {}, track: "sales" });
    await finishTask(deps, ravi, "baseline", true);
    const before = mem.__read(PATH.user("u_ravi")) as unknown as DevProfile;
    expect(before.xp.total).toBeGreaterThan(0);
    clock = Date.UTC(2026, 10, 16, 1, 30); // Mon 16 Nov 07:00 IST — the first day of Season 2
    const summary = await runTick(await makeDeps(), { reason: "cron" });
    expect(summary.steps.find((s) => s.id === "rollover")?.note).toContain("seasons closed: S1");
    const after = mem.__read(PATH.user("u_ravi")) as unknown as DevProfile;
    for (const d of Object.keys(before.dims) as (keyof DevProfile["dims"])[]) expect(after.dims[d].score).toBe(before.dims[d].score);
    expect(after.rank.level).toBe(before.rank.level);
    expect(after.xp.total).toBe(before.xp.total);
    expect(after.badges).toEqual(expect.arrayContaining(before.badges));
    expect((mem.__read(PATH.season("S1")) as { final?: boolean }).final).toBe(true);
    const s1 = mem.__read(PATH.boards("S1")) as unknown as { final: boolean; boards: { mastery: { uid: string }[] } };
    expect(s1.final).toBe(true);
    if (s1.boards.mastery[0]) expect(mem.__read(PATH.achievement(s1.boards.mastery[0].uid, "season_S1_mastery"))).toBeTruthy();
    // A second run the same day closes nothing again (the claim and `final` both hold).
    expect((await runTick(await makeDeps(), { reason: "cron" })).steps.find((s) => s.id === "rollover")?.note).toBe("already done today");
  });

  it("a day before the first season belongs to Season 1, never a 'Season 0'", () => {
    const anchor = DEFAULT_POLICY.cadence.seasonAnchor; // Monday 2026-10-19
    expect(seasonOf("2026-10-18", anchor, 4)).toEqual({ id: "S1", index: 1, start: "2026-10-19", end: "2026-11-15" });
    expect(seasonOf("2026-10-19", anchor, 4).id).toBe("S1");
    expect(seasonOf("2026-11-15", anchor, 4).id).toBe("S1");
    expect(seasonOf("2026-11-16", anchor, 4)).toMatchObject({ id: "S2", start: "2026-11-16", end: "2026-12-13" });
  });

  it("withdrawing a question voids every answer to it (kept, corrected) and re-settles the skill (FR-013)", async () => {
    const deps = await makeDeps();
    await onboard(deps, ravi, { consent: true, answers: {}, track: "sales" });
    await finishTask(deps, ravi, "baseline", true);
    const a = (mem.__all(PATH.attempts("u_ravi")) as unknown as DevAttempt[]).find((x) => x.outcome === "passed" && x.item.type !== "open")!;
    const before = (mem.__read(PATH.user("u_ravi")) as unknown as DevProfile).dims[a.dim];
    await expect(adminQuarantine(deps, ravi, { qid: a.qid, reason: "not an admin" })).rejects.toMatchObject({ status: 403 });
    const r = await adminQuarantine(deps, boss, { qid: a.qid, reason: "the scenario contradicts itself" });
    expect(r.voided).toBe(1);
    const after = mem.__read(PATH.attempt("u_ravi", a.id)) as unknown as DevAttempt;
    expect(after.outcome).toBe("passed"); // the original stays
    expect(after.current?.outcome).toBe("system_error");
    expect((mem.__read(PATH.question(a.qid)) as unknown as QuestionDoc).status).toBe("quarantined");
    const dim = (mem.__read(PATH.user("u_ravi")) as unknown as DevProfile).dims[a.dim];
    expect(dim.n).toBe(before.n - 1);
    // Withdrawing again changes nothing more (already void).
    expect((await adminQuarantine(deps, boss, { qid: a.qid, reason: "again" })).voided).toBe(0);
  });

  it("calibration counts answers per pattern, withdraws a pattern nobody passes, and brings it back after 14 days (FR-013)", async () => {
    expect(judgePattern({ n: 19, correct: 0, difficulty: 2 })).toBeNull(); // too few answers to tell
    expect(judgePattern({ n: 20, correct: 2, difficulty: 2 })).toMatch(/Only 10%/);
    expect(judgePattern({ n: 30, correct: 30, difficulty: 2 })).toBeNull(); // easy and easy-level: fine
    expect(judgePattern({ n: 30, correct: 30, difficulty: 4 })).toMatch(/too easy/);
    expect(judgePattern({ n: 40, correct: 28, difficulty: 3 })).toBeNull(); // ~70%: what the engine aims for

    const deps = await makeDeps();
    await onboard(deps, ravi, { consent: true, answers: {}, track: "sales" });
    await finishTask(deps, ravi, "baseline", true);
    const counted = mem.__all("devos_calibration") as unknown as { n: number }[];
    expect(counted.reduce((s, c) => s + c.n, 0)).toBe(10); // every baseline answer, objective and open

    // One template pattern answered 25 times with 2 passes: withdrawn at the next roll-over.
    const c = generateTemplate({ dim: "logical", difficulty: 3, track: "sales", kind: "objective", usedSignatures: new Set(), seed: "cal" })!;
    const key = `${c.family.id}~${c.form}~d${c.difficulty}`;
    mem.__seed(`devos_calibration/${key}`, { key, source: "template", family: c.family.id, form: c.form, track: "sales", dim: "logical", difficulty: c.difficulty, n: 25, correct: 2, ms: 25 * 40_000, updatedAt: clock });
    clock = Date.UTC(2026, 9, 21, 1, 30); // Wed 07:00 IST
    const tick = await runTick(await makeDeps(), { reason: "cron" });
    expect(tick.steps.find((s) => s.id === "rollover")?.note).toMatch(/1 question pattern\(s\) withdrawn by calibration/);
    expect((mem.__read(`devos_calibration/${key}`) as { n: number }).n).toBe(0); // measured again from zero later
    expect(mem.__all(PATH.audits).some((a) => a.action === "calibration_flag")).toBe(true);
    const withdrawn = await flaggedPatterns(await makeDeps());
    expect(withdrawn.has(key)).toBe(true);
    for (let i = 0; i < 25; i++) {
      const t = generateTemplate({ dim: "logical", difficulty: 3, track: "sales", kind: "objective", usedSignatures: new Set(), seed: `x${i}`, excludePatterns: withdrawn });
      expect(t && `${t.family.id}~${t.form}~d${t.difficulty}`).not.toBe(key);
    }
    const q = (await adminQuestions(await makeDeps(), boss)) as { calibration: { key: string; active: boolean }[] };
    expect(q.calibration.find((x) => x.key === key)?.active).toBe(true);
    clock += 15 * 86_400_000; // two weeks later the pattern is served again
    expect((await flaggedPatterns(await makeDeps())).has(key)).toBe(false);
  });

  it("only admins see the Control Center; a learner gets a 403", async () => {
    const deps = await makeDeps();
    await expect(adminOverview(deps, ravi)).rejects.toMatchObject({ status: 403 });
    await onboard(deps, teja, { consent: true, answers: {}, track: "technical" });
    const salesAdmin: Actor = { uid: "u_sa", name: "Sales Admin", role: "sales_admin", team: "", isActive: true };
    await expect(adminPerson(deps, salesAdmin, "u_teja")).rejects.toMatchObject({ status: 403 });
    const overview = await adminOverview(deps, boss, true);
    expect(overview.people.length).toBeGreaterThan(0);
    await expect(adminSavePolicy(deps, ravi, { policy: {}, reason: "trying" })).rejects.toMatchObject({ status: 403 });
    const bad = await adminSavePolicy(deps, boss, { policy: { weights: { ...DEFAULT_POLICY.weights, sales: { ...DEFAULT_POLICY.weights.sales, communication: 99 } } }, reason: "test weights" }).catch((e) => e);
    // Refused — not "saved" with the default column swapped in (the old assertion accepted either).
    expect(bad.status).toBe(400);
    expect(bad.message).toMatch(/sales weights total 184/);
  });
});

describe("devos engine — fixes from the browser test (2026-10-18)", () => {
  const salesAdmin: Actor = { uid: "u_sa", name: "Sales Admin", role: "sales_admin", team: "", isActive: true };

  it("a department admin's overview, exceptions and export cover their track only", async () => {
    const deps = await makeDeps();
    await onboard(deps, ravi, { consent: true, answers: {}, track: "sales" });
    await finishTask(deps, ravi, "baseline", true);
    await onboard(deps, teja, { consent: true, answers: {}, track: "technical" });
    await finishTask(deps, teja, "baseline", true);
    const tejaAttempt = (mem.__all(PATH.attempts("u_teja")) as unknown as DevAttempt[]).find((a) => a.outcome === "passed")!;
    await dispatch(deps, boss, "admin.void", { uid: "u_teja", attemptId: tejaAttempt.id, reason: "a technical-track fault" });
    const snap = await adminOverview(deps, salesAdmin);
    expect(snap.scope).toEqual(["sales"]);
    expect(snap.people.map((p) => p.uid)).toEqual(["u_ravi"]);
    expect(snap.counts.profiles).toBe(1);
    expect(snap.dims.technical.logical.n).toBe(0); // no technical numbers at all
    const ex = (await dispatch(deps, salesAdmin, "admin.exceptions", {})) as { corrections: { uid: string }[] };
    expect(ex.corrections.some((c) => c.uid === "u_teja")).toBe(false);
    const all = (await dispatch(deps, boss, "admin.exceptions", {})) as { corrections: { uid: string }[] };
    expect(all.corrections.some((c) => c.uid === "u_teja")).toBe(true);
    await expect(dispatch(deps, salesAdmin, "admin.export", {})).rejects.toMatchObject({ status: 403 });
  });

  it("a policy save refuses anything the reader would silently change, and merges a partial change deeply", async () => {
    const deps = await makeDeps();
    const r1 = (await dispatch(deps, boss, "admin.policy", { policy: { scoring: { passMark: -5 } }, reason: "a typo" }).catch((e: unknown) => e)) as { status: number; message: string };
    expect(r1.status).toBe(400);
    expect(r1.message).toMatch(/scoring\.passMark/);
    const r2 = (await dispatch(deps, boss, "admin.policy", { policy: { cadence: { seasonAnchor: "next monday" } }, reason: "a typo" }).catch((e: unknown) => e)) as { status: number };
    expect(r2.status).toBe(400);
    // One track's weights changed (still totalling 100): the other tracks keep theirs.
    const sales = { ...DEFAULT_POLICY.weights.sales, communication: 20, cognitive: 0 };
    const saved = (await dispatch(deps, boss, "admin.policy", { policy: { weights: { sales } }, reason: "sales leans on communication" })) as { version: string; weights: typeof DEFAULT_POLICY.weights };
    expect(saved.version).toBe("v1");
    expect(saved.weights.sales.communication).toBe(20);
    expect(saved.weights.technical).toEqual(DEFAULT_POLICY.weights.technical);
  });

  it("void actions answer { ok: true }; an empty written answer is refused; an order must be a permutation", async () => {
    const deps = await makeDeps();
    await onboard(deps, teja, { consent: true, answers: {}, track: "technical" });
    expect(await dispatch(deps, boss, "admin.track", { uid: "u_teja", track: "admin", reason: "moved to the office" })).toEqual({ ok: true });
    expect(await dispatch(deps, teja, "privacy", { hidden: true })).toEqual({ ok: true });
    let play = await startTask(deps, teja, "baseline");
    let guard = 0;
    while (play.item && guard++ < 12) {
      if (play.item.type === "open") {
        await expect(answer(deps, teja, { taskId: "baseline", slotIndex: play.slotIndex, response: { kind: "text", text: "   " } })).rejects.toMatchObject({ status: 400 });
      }
      if (play.item.type === "order") {
        const n = play.item.options!.length;
        await expect(answer(deps, teja, { taskId: "baseline", slotIndex: play.slotIndex, response: { kind: "order", order: new Array(n).fill(0) } })).rejects.toMatchObject({ status: 400 });
      }
      await answer(deps, teja, { taskId: "baseline", slotIndex: play.slotIndex, response: await rightAnswer(deps, "u_teja", play.item) });
      play = await nextItem(deps, teja, "baseline");
    }
    expect(guard).toBeGreaterThan(1);
  });

  it("hiding from the boards takes effect at once; a reviewed answer says so and offers no second review", async () => {
    const deps = await makeDeps();
    await onboard(deps, ravi, { consent: true, answers: {}, track: "sales" });
    await finishTask(deps, ravi, "baseline", true);
    await dispatch(deps, ravi, "boards", {});
    await setBoardPrivacy(deps, ravi, true);
    const boards = mem.__read(PATH.boards("S1")) as unknown as { boards: { mastery: { uid: string; name: string }[] } };
    const me = boards.boards.mastery.find((e) => e.uid === "u_ravi");
    if (me) expect(me.name).not.toContain("Ravi");
    const a = (mem.__all(PATH.attempts("u_ravi")) as unknown as DevAttempt[]).find((x) => x.source === "template" && x.outcome === "passed")!;
    const r = await appeal(deps, ravi, { attemptId: a.id, reason: "I believe another option is also right." });
    expect(r.outcome).toBe("upheld");
    const after = mem.__read(PATH.attempt("u_ravi", a.id)) as unknown as DevAttempt;
    expect(after.appeal?.outcome).toBe("upheld");
    await expect(appeal(deps, ravi, { attemptId: a.id, reason: "Trying again with the same answer." })).rejects.toMatchObject({ status: 409 });
  });

  it("the Control Center counts daily quests against quests assigned, and the rank assessment waits for the other gates", async () => {
    const deps = await makeDeps();
    await onboard(deps, ravi, { consent: true, answers: {}, track: "sales" });
    await finishTask(deps, ravi, "baseline", true);
    await finishTask(deps, ravi, "quest_2026-10-20", true);
    const practice = await startPractice(deps, ravi, "logical");
    await finishTask(deps, ravi, practice.taskId, true);
    const snap = await adminOverview(deps, boss, true);
    expect(snap.quests.today).toEqual({ assigned: 1, done: 1 }); // the practice and the baseline are not quests
    // Enough answers for the evidence gate, but other gates (practical, floors) not yet passed: the assessment waits.
    const p = mem.__read(PATH.user("u_ravi")) as unknown as DevProfile;
    mem.__seed(PATH.user("u_ravi"), { ...p, gates: { ...p.gates, validAttempts: 40 } });
    await expect(startRankAssessment(deps, ravi)).rejects.toThrow(/every other gate/);
  });
});

describe("devos engine — time limits and deadlines are honest (2026-10-18)", () => {
  const kiran: Actor = { uid: "u_kiran", name: "Kiran", role: "sales_member", team: "sa1", isActive: true };

  async function ready(actor: Actor) {
    const deps = await makeDeps();
    if (actor.uid === "u_kiran") mem.__seed("users/u_kiran", { uid: "u_kiran", name: "Kiran", role: "sales_member", createdBy: "sa1", isActive: true });
    await onboard(deps, actor, { consent: true, answers: {}, track: "sales" });
    await finishTask(deps, actor, "baseline", true);
    return deps;
  }

  it("a league question left to run out counts as 0, and the entry is in even when the LAST one runs out", async () => {
    const deps = await ready(ravi);
    const j = await joinLeague(deps, ravi);
    let play = await startTask(deps, ravi, j.taskId);
    clock += (play.item!.timeLimitSec + 1) * 1000; // the first: nothing sent, its time runs out
    play = await nextItem(deps, ravi, j.taskId);
    let guard = 0;
    while (play.item && guard++ < 10) {
      const last = play.session!.slots.every((s, i) => i === play.slotIndex || s.state !== "pending");
      if (last) { clock += (play.item.timeLimitSec + 1) * 1000; play = await nextItem(deps, ravi, j.taskId); break; }
      await answer(deps, ravi, { taskId: j.taskId, slotIndex: play.slotIndex, response: await rightAnswer(deps, ravi.uid, play.item) });
      play = await nextItem(deps, ravi, j.taskId);
    }
    expect(play.item).toBeNull();
    const s = mem.__read(PATH.session("u_ravi", j.taskId)) as unknown as DevSession;
    expect(s.result!.expired).toBe(2);
    expect(s.result!.score).toBeLessThanOrEqual(Math.round((100 * (s.slots.length - 2)) / s.slots.length));
    expect((mem.__read(PATH.task("u_ravi", j.taskId)) as unknown as DevTask).state).toBe("completed");
    const entry = mem.__read(PATH.leagueEntry(j.round.id, "u_ravi")) as { done: boolean; score: number };
    expect(entry.done).toBe(true);
    expect(entry.score).toBe(s.result!.score);
  });

  it("walking away from a league round still counts: the close settles it with the rest as 0", async () => {
    const deps = await ready(ravi);
    await ready(kiran);
    const a = await joinLeague(deps, ravi);
    const b = await joinLeague(deps, kiran);
    await finishTask(deps, ravi, a.taskId, true);
    const play = await startTask(deps, kiran, b.taskId);
    await answer(deps, kiran, { taskId: b.taskId, slotIndex: play.slotIndex, response: await rightAnswer(deps, kiran.uid, play.item!) });
    clock = Date.UTC(2026, 9, 24, 15, 0); // Sat 24 Oct 20:30 IST — Kiran never came back
    expect(await closeDueLeagues(deps, DEFAULT_POLICY)).toBe(1);
    const round = mem.__read(PATH.league(a.round.id)) as { results: { uid: string; score: number; position: number }[] };
    const k = round.results.find((r) => r.uid === "u_kiran")!;
    expect(k).toBeTruthy();
    expect(k.score).toBeLessThanOrEqual(20); // 1 of 5 answered — the other four count as 0
    expect(round.results[0].uid).toBe("u_ravi");
  });

  it("a quest not finished by its deadline is expired — no quest XP, not a done quest — but its answers still count", async () => {
    const deps = await ready(ravi);
    const qid = "quest_2026-10-20"; // made when the baseline ended
    let play = await startTask(deps, ravi, qid);
    await answer(deps, ravi, { taskId: qid, slotIndex: play.slotIndex, response: await rightAnswer(deps, ravi.uid, play.item!) });
    const before = mem.__read(PATH.user("u_ravi")) as unknown as DevProfile;
    clock = Date.UTC(2026, 9, 20, 18, 0); // 23:30 IST — past 23:00 and its grace
    play = await nextItem(deps, ravi, qid);
    expect(play.item).toBeNull();
    expect(play.reason).toBe("expired");
    const task = mem.__read(PATH.task("u_ravi", qid)) as unknown as DevTask;
    expect(task.state).toBe("expired");
    const after = mem.__read(PATH.user("u_ravi")) as unknown as DevProfile;
    expect(after.stats.questsDone ?? 0).toBe(before.stats.questsDone ?? 0);
    expect(after.days.find((d) => d.day === "2026-10-20")?.questDone ?? 0).toBe(0);
    expect(after.stats.tasksExpired).toBe(before.stats.tasksExpired + 1);
    expect(mem.__read(PATH.xp("u_ravi", `xp_t_${qid}`))).toBeFalsy();
    // The one answered in time was applied when it was answered (and is not applied again).
    expect(after.stats.attempts).toBe(before.stats.attempts);
    const first = mem.__read(PATH.attempt("u_ravi", `${qid}_0`)) as unknown as DevAttempt;
    expect(["passed", "failed", "partial"]).toContain(first.outcome);
    expect(first.appliedAt).toBeTruthy();
    // No question is served after the deadline.
    const s = mem.__read(PATH.session("u_ravi", qid)) as unknown as DevSession;
    expect(s.slots.filter((x) => x.state === "expired").every((x) => !x.qid)).toBe(true);
  });

  it("a quest is due at the policy's hour (23:00 IST); one made late in the evening keeps an hour", async () => {
    const deps = await ready(ravi);
    const q = mem.__read(PATH.task("u_ravi", "quest_2026-10-20")) as unknown as DevTask;
    expect(q.dueAt).toBe(Date.UTC(2026, 9, 20, 17, 30));
    expect(timeLabel(q.dueAt)).toBe("11 PM");
    clock = Date.UTC(2026, 9, 21, 17, 0); // Wed 21 Oct, 22:30 IST
    await ensureTodayFor(deps, DEFAULT_POLICY, "u_ravi", { role: "sales_member", isActive: true });
    const late = mem.__read(PATH.task("u_ravi", "quest_2026-10-21")) as unknown as DevTask;
    expect(late.dueAt).toBe(Date.UTC(2026, 9, 21, 18, 0)); // 23:30 IST
    expect(validatePolicy({ ...DEFAULT_POLICY, cadence: { ...DEFAULT_POLICY.cadence, questDueHour: 8 } }).join(" ")).toMatch(/quest is due/);
  });

  it("finishing the baseline on a Sunday says why there is no quest — in the same answer, not at the next visit", async () => {
    clock = Date.UTC(2026, 9, 25, 5, 0); // Sun 25 Oct, 10:30 IST
    const deps = await makeDeps();
    await onboard(deps, ravi, { consent: true, answers: {}, track: "sales" });
    let play = await startTask(deps, ravi, "baseline");
    let last: Awaited<ReturnType<typeof answer>> | null = null;
    let guard = 0;
    while (play.item && guard++ < 20) {
      last = await answer(deps, ravi, { taskId: "baseline", slotIndex: play.slotIndex, response: await rightAnswer(deps, ravi.uid, play.item) });
      play = await nextItem(deps, ravi, "baseline");
    }
    expect((mem.__read(PATH.user("u_ravi")) as unknown as DevProfile).onboarding.baseline).toBe("complete");
    expect(last?.today?.reason).toBe("day_off");
    expect(mem.__read(PATH.task("u_ravi", "quest_2026-10-25"))).toBeFalsy();
  });

  it("the baseline never expires: an answer nine days later (no tick ran) is still scored", async () => {
    const deps = await makeDeps();
    await onboard(deps, ravi, { consent: true, answers: {}, track: "sales" });
    let play = await startTask(deps, ravi, "baseline");
    await answer(deps, ravi, { taskId: "baseline", slotIndex: play.slotIndex, response: await rightAnswer(deps, ravi.uid, play.item!) });
    clock += 9 * 86_400_000;
    play = await nextItem(deps, ravi, "baseline");
    expect(play.item).toBeTruthy();
    const r = await answer(deps, ravi, { taskId: "baseline", slotIndex: play.slotIndex, response: await rightAnswer(deps, ravi.uid, play.item!) });
    expect(r.attempt.outcome).toBe("passed");
    await finishTask(deps, ravi, "baseline", true);
    const p = mem.__read(PATH.user("u_ravi")) as unknown as DevProfile;
    expect(p.onboarding.baseline).toBe("complete");
    expect(Object.values(p.dims).filter((d) => d.score !== null).length).toBe(10);
  });

  it("a rank assessment walked away from counts as taken (the rest as 0), and a second one is never opened beside it", async () => {
    const deps = await ready(ravi);
    const p = mem.__read(PATH.user("u_ravi")) as unknown as DevProfile;
    const id = "rank_2_2026-10-20";
    const blueprint = rankBlueprint(p, DEFAULT_POLICY, 2);
    mem.__seed(PATH.task("u_ravi", id), {
      id, uid: "u_ravi", kind: "rank", title: "PRO assessment", why: "test", track: "sales", dims: [...new Set(blueprint.map((s) => s.dim))],
      day: "2026-10-20", createdAt: clock, dueAt: clock + 2 * 86_400_000, state: "assigned",
      events: [{ from: null, to: "assigned", at: clock, by: "u_ravi", reason: "rank assessment requested" }],
      blueprint, estMinutes: 30, xpReward: 0, difficulty: blueprint[0].difficulty, idem: id, forRank: 2,
    });
    // While it is still in its time, asking again continues it.
    const play = await startTask(deps, ravi, id);
    expect((await startRankAssessment(deps, ravi)).taskId).toBe(id);
    await answer(deps, ravi, { taskId: id, slotIndex: play.slotIndex, response: await rightAnswer(deps, ravi.uid, play.item!) });
    clock += 86_400_000; // walked away; the next day they try again
    await expect(startRankAssessment(deps, ravi)).rejects.toMatchObject({ status: 409 });
    expect((mem.__read(PATH.task("u_ravi", id)) as unknown as DevTask).state).toBe("failed");
    const rec = (mem.__read(PATH.user("u_ravi")) as unknown as DevProfile).gates.assessments.find((x) => x.sessionId === id)!;
    expect(rec.valid).toBe(true);
    expect(rec.score).toBeLessThan(20);
    const s = mem.__read(PATH.session("u_ravi", id)) as unknown as DevSession;
    expect(s.slots.filter((x) => x.state === "expired").length).toBe(s.slots.length - 1);
    expect(mem.__all(PATH.tasks("u_ravi")).filter((t) => t.kind === "rank").length).toBe(1);
  });
});

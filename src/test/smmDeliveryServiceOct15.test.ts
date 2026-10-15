/**
 * SMM Delivery Control's WRITES on the in-memory Firestore (2026-10-15, phase 3): switching a month on saves its
 * plan once (only the planner's pieces, never `uploadDate`), every answer goes through the month's one
 * transaction with its limits (Do it now renews once a day, a block needs a note for "other", history capped at 10,
 * a move to another week needs a reason and tells the lead, a late piece is moved only by a manager, a 3rd reassign
 * needs an admin, a post needs its links or a reason), the view-only lead is refused on a month she is not on,
 * the classic stage buttons leave their stamps, and a lead's answers go to her own `smm_alert_state`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn(async (_n: Record<string, unknown>) => undefined) }));
vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("@/services/notifications", () => ({ sendNotification, notifyTechTeamLeaders: vi.fn(async () => undefined) }));

const mem = await import("./memoryFirestore");
const { useAuthStore } = await import("@/store/authStore");
const svc = await import("@/services/smmDelivery");
const smm = await import("@/services/smm");
import { month as fixtureMonth, piece } from "./smmDeliveryFixtures";
import { istMoment, planMonth } from "@/utils/smmCadence";
import { monitorSmm } from "@/utils/smmMonitor";
import { DEFAULT_SMM_DELIVERY } from "@/utils/smmDeliverySettings";
import type { AppUser } from "@/types";
import type { SmmDeliveryItem, SmmDeliveryMonth } from "@/utils/smmCadence";

const person = (uid: string, role: string, over: Partial<AppUser> = {}) =>
  ({ uid, id: uid, name: uid[0].toUpperCase() + uid.slice(1), role, isActive: true, ...over }) as unknown as AppUser;
const KIRAN = person("kiran", "tech_admin");
const LEADER = person("teja", "tech_team_leader");
const RAVI = person("ravi", "tech_member");
const PRIYA = person("priya", "tech_member");
const MANASA = person("manasa", "tech_member", { smmLeader: true });
const SITA = person("sita", "sales_member");
const signIn = (u: AppUser | null) => useAuthStore.setState({ user: u, loading: false });

/** Mon 19 Oct 2026, 11:00 IST — inside week 1 (15–21 Oct, deadline Wed 21 Oct 7 PM). */
const MON = istMoment("2026-10-19", 11);
const ctx = (now = MON) => ({ holidays: null, settings: DEFAULT_SMM_DELIVERY, now });

const PATH = "smm_campaigns/m1";
const read = () => mem.__read(PATH) as unknown as SmmDeliveryMonth;
const itemOf = (id: string) => read().items.find((i) => i.id === id) as SmmDeliveryItem;

function seedMonth(items: Record<string, unknown>[], over: Record<string, unknown> = {}) {
  const m = fixtureMonth({ items, watchers: ["ravi", "priya", "mani", "sita"], ...over });
  mem.__seed(PATH, { ...m, id: undefined } as never);
}

beforeEach(() => {
  mem.__reset();
  sendNotification.mockClear();
  for (const u of [KIRAN, LEADER, RAVI, PRIYA, MANASA, SITA]) mem.__seed(`users/${u.uid}`, u as never);
  signIn(KIRAN);
});

describe("switching a month on", () => {
  it("saves a week on each piece the planner placed, stamps the month, and leaves dated pieces reading their own date", async () => {
    seedMonth([
      piece({ id: "a" }), piece({ id: "b" }), piece({ id: "c" }),
      piece({ id: "dated", uploadDate: "2026-11-06" }),
    ]);
    const r = await svc.switchOnMonth("m1", ctx());
    expect(r).toEqual({ planned: 3, already: false });
    const m = read();
    expect(m.delivery).toMatchObject({ activatedByName: "Kiran", baselineAt: MON, rule: "front_back_v1" });
    expect(itemOf("a").plan).toMatchObject({ week: 1, by: "auto" });
    expect(itemOf("b").plan).toMatchObject({ week: 2, by: "auto" });
    expect(itemOf("c").plan).toMatchObject({ week: 3, by: "auto" });
    expect(itemOf("dated").plan ?? null).toBeNull();
    // The classic date is never written by the planner.
    expect(itemOf("a").uploadDate).toBeNull();
    // Done once: a second press changes nothing.
    expect(await svc.switchOnMonth("m1", ctx())).toEqual({ planned: 0, already: true });
  });

  it("only a manager switches a month on; a month nobody is on is refused with a sentence", async () => {
    seedMonth([piece({ id: "a" })]);
    signIn(RAVI);
    await expect(svc.switchOnMonth("m1", ctx())).rejects.toThrow(/Only the tech admin/);
    signIn(LEADER);
    mem.__seed(PATH, { ...fixtureMonth({ items: [piece()], team: { creator: null, publisher: null, marketer: null, assistants: [] } }), id: undefined } as never);
    await expect(svc.switchOnMonth("m1", ctx())).rejects.toThrow(/Nobody is on it/);
  });

  it("re-planning moves only the planner's pieces; a week a person chose stays", async () => {
    seedMonth([piece({ id: "a" }), piece({ id: "b", plan: { week: 4, by: "ravi" } }), piece({ id: "c" })]);
    await svc.switchOnMonth("m1", ctx());
    expect(itemOf("b").plan).toMatchObject({ week: 4, by: "ravi" });
    await svc.replanMonth("m1", ctx());
    expect(itemOf("b").plan).toMatchObject({ week: 4, by: "ravi" });
    expect(itemOf("a").plan?.by).toBe("auto");
  });
});

describe("the owner's answers", () => {
  it("Do it now: 45 minutes of quiet, renewed once a day — a third press the same day is refused", async () => {
    seedMonth([piece({ id: "a", plan: { week: 1, by: "auto" } })]);
    signIn(RAVI);
    await svc.answerEta("m1", "a", "focus", ctx());
    expect(itemOf("a").eta).toMatchObject({ kind: "focus", until: MON + 45 * 60_000, byUid: "ravi", focusUsed: 1 });
    await svc.answerEta("m1", "a", "focus", ctx(MON + 50 * 60_000));
    expect(itemOf("a").eta?.focusUsed).toBe(2);
    await expect(svc.answerEta("m1", "a", "focus", ctx(MON + 100 * 60_000))).rejects.toThrow(/already renewed once today/);
  });

  it("Need more time lasts today only and twice a piece; never after the deadline", async () => {
    seedMonth([piece({ id: "a", plan: { week: 1, by: "auto" } })]);
    signIn(RAVI);
    await svc.answerEta("m1", "a", "more_time", ctx());
    expect(itemOf("a").eta).toMatchObject({ kind: "more_time", until: istMoment("2026-10-19", 20), moreTimeUsed: 1 });
    await svc.answerEta("m1", "a", "more_time", ctx(MON + 3_600_000));
    await expect(svc.answerEta("m1", "a", "more_time", ctx(MON + 7_200_000))).rejects.toThrow(/already given 2 times/);
    const afterDeadline = istMoment("2026-10-21", 19, 30);
    seedMonth([piece({ id: "z", plan: { week: 1, by: "auto" } })]);
    await expect(svc.answerEta("m1", "z", "focus", ctx(afterDeadline))).rejects.toThrow(/deadline has passed/);
  });

  it("Blocked: 'something else' needs a note; the salesperson confirms a client block; anybody on it clears it", async () => {
    seedMonth([piece({ id: "a", plan: { week: 1, by: "auto" } })]);
    signIn(RAVI);
    await expect(svc.answerBlocked("m1", "a", { kind: "other", note: "" }, ctx())).rejects.toThrow(/Say what is in the way/);
    await svc.answerBlocked("m1", "a", { kind: "client_approval" }, ctx());
    expect(itemOf("a").blocker).toMatchObject({ kind: "client_approval", byUid: "ravi", expiresAt: MON + 24 * 3_600_000, confirmedByUid: null });
    await expect(svc.confirmBlocker("m1", "a", ctx())).rejects.toThrow(/Only the person who must clear/);
    signIn(SITA);
    await svc.confirmBlocker("m1", "a", ctx());
    expect(itemOf("a").blocker?.confirmedByUid).toBe("sita");
    signIn(RAVI);
    await svc.clearBlocker("m1", "a");
    expect(itemOf("a").blocker).toBeNull();
  });

  it("late reasons: 'Other' needs words, and the list keeps the newest 10", async () => {
    seedMonth([piece({ id: "a", plan: { week: 1, by: "auto" } })]);
    signIn(RAVI);
    await expect(svc.answerLate("m1", "a", { step: "send", reason: "Other", note: "" })).rejects.toThrow(/Say why/);
    for (let i = 0; i < 12; i++) await svc.answerLate("m1", "a", { step: "send", reason: "Too much work today", note: `n${i}` }, { holidays: null, now: MON + i });
    const list = itemOf("a").lateReasons || [];
    expect(list).toHaveLength(10);
    expect(list[0].note).toBe("n2");
    expect(list[9].note).toBe("n11");
  });

  it("the view-only Social Media Team Lead cannot answer on a month she is not on", async () => {
    seedMonth([piece({ id: "a", plan: { week: 1, by: "auto" } })]);
    signIn(MANASA);
    await expect(svc.answerEta("m1", "a", "focus", ctx())).rejects.toThrow(/View only/);
  });

  it("check-out reasons are saved per month in one go, each with who and when", async () => {
    seedMonth([piece({ id: "a" }), piece({ id: "b" })]);
    signIn(RAVI);
    const r = await svc.saveCheckoutReasons([
      { campaignId: "m1", itemId: "a", step: "send", reason: "Too much work today" },
      { campaignId: "m1", itemId: "b", step: "send", reason: "Flow credits ran out", newTime: MON + 86_400_000 },
    ], { now: MON });
    expect(r).toEqual({ saved: 2, failed: [] });
    expect(itemOf("b").lateReasons?.[0]).toMatchObject({ reason: "Flow credits ran out", byUid: "ravi", at: MON, newTime: MON + 86_400_000 });
  });
});

describe("moves and reassigns", () => {
  it("to another week: a reason, and the Social Media Team Lead is told; within the week: nobody is told", async () => {
    seedMonth([piece({ id: "a", plan: { week: 1, by: "auto" } })]);
    signIn(RAVI);
    await expect(svc.movePiece("m1", "a", { toWeek: 2, reason: "" }, ctx())).rejects.toThrow(/Say why it moves/);
    const r = await svc.movePiece("m1", "a", { toWeek: 2, reason: "Client is travelling" }, ctx());
    expect(r.notifyLead).toBe(true);
    expect(itemOf("a").plan).toMatchObject({ week: 2, by: "ravi" });
    expect(itemOf("a").moves?.[0]).toMatchObject({ fromWeek: 1, toWeek: 2, reason: "Client is travelling", byUid: "ravi" });
    expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "manasa", type: "smm_moved" }));
    sendNotification.mockClear();
    await svc.movePiece("m1", "a", { toWeek: 2, reason: "" }, ctx());
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("a late piece is moved only by a manager — nobody escapes a late week by moving its date", async () => {
    seedMonth([piece({ id: "a", plan: { week: 1, by: "auto" } })]);
    const thu = istMoment("2026-10-22", 10);
    signIn(RAVI);
    await expect(svc.movePiece("m1", "a", { toWeek: 2, reason: "Client is travelling" }, ctx(thu))).rejects.toThrow(/ask your team leader/);
    signIn(LEADER);
    await svc.movePiece("m1", "a", { toWeek: 2, reason: "Client is travelling" }, ctx(thu));
    expect(itemOf("a").plan?.week).toBe(2);
  });

  it("out of the month: managers only, and the planner then stops chasing it here", async () => {
    seedMonth([piece({ id: "a", plan: { week: 4, by: "auto" } }), piece({ id: "b" })]);
    signIn(RAVI);
    await expect(svc.movePiece("m1", "a", { toWeek: "out", reason: "Client asked for next month" }, ctx())).rejects.toThrow(/Only the tech admin/);
    signIn(KIRAN);
    await svc.movePiece("m1", "a", { toWeek: "out", reason: "Client asked for next month" }, ctx());
    const plan = planMonth(read(), { today: "2026-10-19", holidays: null });
    expect(plan.movedOut).toEqual(["a"]);
    expect(plan.tasks.find((t) => t.itemId === "a")?.counted).toBe(false);
  });

  it("a reassign tells the new owner; the 3rd needs the tech admin or the main admin", async () => {
    seedMonth([piece({ id: "a", plan: { week: 1, by: "auto" }, makerUid: "ravi", makerName: "Ravi" })]);
    signIn(LEADER);
    await svc.reassignPiece("m1", "a", "maker", { uid: "priya", name: "Priya" }, { now: MON });
    expect(itemOf("a")).toMatchObject({ makerUid: "priya", makerName: "Priya" });
    expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "priya", type: "smm_reassigned" }));
    await svc.reassignPiece("m1", "a", "maker", { uid: "ravi", name: "Ravi" }, { now: MON + 1 });
    await expect(svc.reassignPiece("m1", "a", "maker", { uid: "priya", name: "Priya" }, { now: MON + 2 })).rejects.toThrow(/already reassigned 2 times/);
    signIn(KIRAN);
    await svc.reassignPiece("m1", "a", "maker", { uid: "priya", name: "Priya" }, { now: MON + 3 });
    expect(itemOf("a").reassigns).toHaveLength(3);
    signIn(RAVI);
    await expect(svc.reassignPiece("m1", "a", "maker", { uid: "ravi", name: "Ravi" })).rejects.toThrow(/Only a team leader/);
  });
});

describe("approval, posting, footage", () => {
  it("an approval recorded by the tech side keeps who and how, and the salesperson is told", async () => {
    seedMonth([piece({ id: "a", status: "awaiting_approval", approval: { state: "waiting", askedAt: MON - 86_400_000, chases: [] } })]);
    signIn(RAVI);
    await expect(svc.recordApprovalWithProof("m1", "a", { approved: true, who: "", via: "whatsapp" })).rejects.toThrow(/Say who/);
    await svc.recordApprovalWithProof("m1", "a", { approved: true, who: "Lakshmi garu", via: "whatsapp" }, { now: MON });
    expect(itemOf("a")).toMatchObject({ status: "approved", approvalProof: { approved: true, who: "Lakshmi garu", via: "whatsapp", byUid: "ravi" } });
    expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "sita", type: "smm_approved" }));
  });

  it("Posted needs a link on each account, on that account's site — or a reason there is none", async () => {
    seedMonth([piece({ id: "a", status: "approved", platforms: ["instagram", "facebook"], approval: { state: "approved", askedAt: MON, respondedAt: MON, chases: [] } })]);
    signIn(PRIYA);
    await expect(svc.markPostedWithLinks("m1", "a", { postUrls: { instagram: "https://youtube.com/x" } })).rejects.toThrow(/not on Instagram/);
    await expect(svc.markPostedWithLinks("m1", "a", { postUrls: { instagram: "https://www.instagram.com/p/abc" } })).rejects.toThrow(/say why there is no link/);
    await svc.markPostedWithLinks("m1", "a", { postUrls: { instagram: "instagram.com/p/abc" }, noLinkReason: "Facebook page is down today" });
    expect(itemOf("a")).toMatchObject({ status: "posted", postUrls: { instagram: "https://instagram.com/p/abc" }, noLinkReason: "Facebook page is down today" });
  });

  it("a real video's footage: received, or pending — the client never sent it", async () => {
    seedMonth([piece({ id: "r", kind: "real_video" }), piece({ id: "v" })], { commitments: { ai_ad: 1, poster: 0, real_video: 1 } });
    signIn(SITA);
    await svc.setFootage("m1", "r", { state: "received", link: "https://drive.google.com/x" }, { now: MON });
    expect(itemOf("r").footage).toMatchObject({ state: "received", link: "https://drive.google.com/x", at: MON, byName: "Sita" });
    await expect(svc.setFootage("m1", "v", { state: "received" })).rejects.toThrow(/Only a real video/);
  });

  it("the classic stage buttons stamp when a piece was started and first sent; a change asked is a revision", async () => {
    seedMonth([piece({ id: "a" })]);
    signIn(RAVI);
    await smm.setItemStatus("m1", "a", "in_progress", { uid: "ravi", name: "Ravi" });
    const started = itemOf("a").startedAt as number;
    expect(typeof started).toBe("number");
    await smm.requestApproval("m1", "a");
    expect(typeof itemOf("a").madeAt).toBe("number");
    expect(itemOf("a").startedAt).toBe(started);
    await smm.recordApproval("m1", "a", { approved: false, note: "Change the colour" }, { uid: "sita", name: "Sita" });
    await smm.recordApproval("m1", "a", { approved: false }, { uid: "sita", name: "Sita" });
    expect(itemOf("a").revisions).toBe(2);
  });
});

describe("the Starting line and accepted titles", () => {
  it("kept as pending: it leaves the supervisor's Starting line; a catch-up moves it to a later week", async () => {
    seedMonth([piece({ id: "a", plan: { week: 1, by: "auto" } }), piece({ id: "b", plan: { week: 1, by: "auto" } })]);
    const thu = istMoment("2026-10-22", 10);
    const before = monitorSmm({ now: thu, months: [read()], holidays: null, people: [], settings: { ...DEFAULT_SMM_DELIVERY, mode: "live" } });
    expect(before.startingLine.map((s) => s.itemId).sort()).toEqual(["a", "b"]);
    await svc.decideStartingLine("m1", "a", { decision: "pending" }, ctx(thu));
    await svc.decideStartingLine("m1", "b", { decision: "catch_up", toWeek: 3 }, ctx(thu));
    const after = monitorSmm({ now: thu, months: [read()], holidays: null, people: [], settings: { ...DEFAULT_SMM_DELIVERY, mode: "live" } });
    expect(after.startingLine).toEqual([]);
    expect(itemOf("b").plan).toMatchObject({ week: 3, by: "kiran" });
    expect(itemOf("a").startingLine).toMatchObject({ decision: "pending", byName: "Kiran" });
  });

  it("accepted AI titles go on the plan (never over the team's own title); a festival in the piece's week fixes its day", async () => {
    seedMonth([piece({ id: "a", plan: { week: 1, by: "auto" } }), piece({ id: "b", title: "Owner's own" })]);
    signIn(RAVI);
    await svc.acceptPlanSuggestions("m1", [
      { itemId: "a", title: "Diwali gold offer", idea: "Gold coins for Diwali", caption: "Shine this Diwali", hashtags: ["#Diwali"], festival: { name: "Dussehra", date: "2026-10-20" } },
      { itemId: "b", title: "AI title", idea: "", caption: "", hashtags: [], festival: null },
    ], ctx());
    expect(itemOf("a").plan).toMatchObject({ week: 1, title: "Diwali gold offer", idea: "Gold coins for Diwali", hashtags: ["#Diwali"], fixedDate: "2026-10-20", fixedReason: "festival" });
    expect(itemOf("b").title).toBe("Owner's own");
    expect(itemOf("b").plan?.title).toBe("AI title");
  });
});

describe("smm_alert_state — a lead's answers go to her own document", () => {
  it("writes the person's own answer and drops answers older than two weeks", async () => {
    mem.__seed("smm_alert_state/manasa", { answers: { old: { kind: "on_it", at: MON - 20 * 86_400_000 }, keep: { kind: "called", at: MON - 86_400_000 } } });
    signIn(MANASA);
    await svc.answerAlert("a", "on_it", null, { now: MON });
    const doc = mem.__read("smm_alert_state/manasa") as { answers: Record<string, { kind: string; at: number; byName: string }> };
    expect(Object.keys(doc.answers).sort()).toEqual(["a", "keep"]);
    expect(doc.answers.a).toMatchObject({ kind: "on_it", at: MON, byName: "Manasa" });
    const seen: unknown[] = [];
    const stop = svc.watchAlertAnswers((a) => seen.push(a));
    await Promise.resolve();
    stop();
    expect(seen.at(-1)).toMatchObject({ manasa: { a: { kind: "on_it", at: MON } } });
  });

  it("Remind tells the owner once a day and records the lead's answer", async () => {
    signIn(MANASA);
    await svc.remindOwner({ id: "m1", businessName: "Lakshmi Jewellers" }, "a", { uid: "ravi" }, "the video for week 2");
    expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "ravi", type: "smm_remind", once: true, link: "/smm/control/m1" }));
    expect((mem.__read("smm_alert_state/manasa") as { answers: Record<string, { kind: string }> }).answers.a.kind).toBe("remind");
  });
});

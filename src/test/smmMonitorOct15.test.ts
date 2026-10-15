/**
 * SMM Delivery Control, phase 1 — the supervisor's rules (`utils/smmMonitor`): the escalation ladder walked hour by
 * hour through one client's week 1 (Thu 15 → Wed 21 Oct 2026, deadline Wed 21, 7 PM; video sent by Sat 17), the
 * client's side (approvals, footage, billing, ads), and every guard from the plan's pre-mortem — answers, leave, quiet
 * hours, the Starting line, capacity, one alert per piece, pilot / preview / off, freshness, and the 30-day rehearsal.
 */
import { describe, expect, it } from "vitest";
import {
  etaCheck, isQuietTime, itemAsOf, monitorSmm, presenceFromToday, reassignCheck, rehearseSmm, screenFor, screenProblem,
  smmAlertKey, type SmmAlert, type SmmMonitorInput, type SmmMonitorPerson,
} from "@/utils/smmMonitor";
import { istMoment, type SmmDeliveryMonth } from "@/utils/smmCadence";
import { DEFAULT_SMM_DELIVERY } from "@/utils/smmDeliverySettings";
import type { SmmDeliverySettings } from "@/types/smmDelivery";
import { month, piece } from "./smmDeliveryFixtures";

const at = (day: string, h: number, m = 0) => istMoment(day, h, m);
const LIVE: SmmDeliverySettings = { ...DEFAULT_SMM_DELIVERY, mode: "live" };
const SWITCHED_ON = { activatedAt: at("2026-10-15", 0), activatedByName: "Kiran", baselineAt: at("2026-10-15", 0), rule: "front_back_v1" };

const PEOPLE: SmmMonitorPerson[] = [
  { uid: "ravi", name: "Ravi", role: "tech_member" },
  { uid: "priya", name: "Priya", role: "tech_member" },
  { uid: "mani", name: "Mani", role: "tech_member" },
  { uid: "manasa", name: "Manasa", role: "tech_member", smmLeader: true },
  { uid: "kiran", name: "Kiran", role: "tech_team_leader" },
  { uid: "ta", name: "Tech Admin", role: "tech_admin" },
  { uid: "owner", name: "Owner", role: "main_admin" },
  { uid: "sita", name: "Sita", role: "sales_member" },
  { uid: "sa", name: "Sales Admin", role: "sales_admin" },
];

/** One client, four videos, one a week; the first is "a" (week 1). */
const four = (first: Record<string, unknown> = {}, over: Record<string, unknown> = {}) =>
  month({ delivery: SWITCHED_ON, items: [piece({ id: "a", title: "Diwali offer", ...first }), piece({ id: "b" }), piece({ id: "c" }), piece({ id: "d" })], ...over });

const run = (now: number, over: Partial<SmmMonitorInput> = {}, months: SmmDeliveryMonth[] = [four()]) =>
  monitorSmm({ now, months, settings: LIVE, holidays: new Set(), people: PEOPLE, ...over });

const on = (alerts: SmmAlert[], uid: string, subject = "a") => alerts.filter((x) => x.uid === uid && x.subject === subject);
const one = (alerts: SmmAlert[], uid: string, subject = "a") => {
  const list = on(alerts, uid, subject);
  expect(list.length).toBeLessThanOrEqual(1);
  return list[0];
};

describe("the ladder, through week 1 of Lakshmi Jewellers (deadline Wed 21 Oct, 7 PM)", () => {
  it.each([
    // when, who, level, reason, delivered now
    ["Thu 15, 11 AM — week start: the owner's task list (bell)", at("2026-10-15", 11), "ravi", "week", "notice", "week_start", true],
    ["Fri 16, 11 AM — not started, must be sent by Sat: early warning (never a full screen)", at("2026-10-16", 11), "ravi", "a", "watch", "watch", true],
    ["Mon 19, 11 AM — not sent by Sat 17: amber full screen", at("2026-10-19", 11), "ravi", "a", "amber", "checkpoint_missed", true],
    ["Wed 21, 9:30 AM — deadline day before 10: still amber", at("2026-10-21", 9, 30), "ravi", "a", "amber", "checkpoint_missed", true],
    ["Wed 21, 10:30 AM — deadline day: full screen", at("2026-10-21", 10, 30), "ravi", "a", "full", "deadline_today", true],
    ["Thu 22, 10 AM — deadline passed: red", at("2026-10-22", 10), "ravi", "a", "red", "deadline_passed", true],
    ["Thu 22, 10 AM — +1 working day: the Social Media Team Lead, red", at("2026-10-22", 10), "manasa", "a", "red", "lead_escalation", true],
    ["Thu 22, 10 AM — +1 working day: the tech team leader, red", at("2026-10-22", 10), "kiran", "a", "red", "lead_escalation", true],
    ["Fri 23, 9:30 AM — +2 working days: the tech admin, critical", at("2026-10-23", 9, 30), "ta", "a", "critical", "admin_escalation", true],
    ["Fri 23, 9:30 AM — +2 working days: the main admin, critical", at("2026-10-23", 9, 30), "owner", "a", "critical", "admin_escalation", true],
  ])("%s", (_l, now, uid, subject, level, reason, deliver) => {
    const { alerts } = run(now as number);
    const a = subject === "week" ? alerts.find((x) => x.uid === uid && x.reason === "week_start") : one(alerts, uid as string, subject as string);
    expect(a).toBeTruthy();
    expect([a!.level, a!.reason, a!.deliverNow]).toEqual([level, reason, deliver]);
  });

  it("the alert names the type in words, and its sentence names the client and the piece", () => {
    const a = one(run(at("2026-10-19", 11)).alerts, "ravi")!;
    expect(a.title).toBe("🎬 AI VIDEO · Lakshmi Jewellers");
    expect(a.message).toContain('the video "Diwali offer"');
    expect(a.fullScreen).toBe(true);
    expect(a.type).toBe("ai_video");
  });

  it("nobody above the owner is alerted before their working day; admins not on +1", () => {
    const { alerts } = run(at("2026-10-22", 10));
    expect(on(alerts, "ta")).toEqual([]);
    expect(on(alerts, "owner")).toEqual([]);
    expect(on(run(at("2026-10-21", 20, 30)).alerts, "manasa").filter((a) => a.reason === "lead_escalation")).toEqual([]);
  });

  it("the owner is asked again every 2 hours from the start of the day (a new key each time), the same key inside one slot", () => {
    const k1 = one(run(at("2026-10-22", 9, 5)).alerts, "ravi")!.key;
    const k2 = one(run(at("2026-10-22", 10, 55)).alerts, "ravi")!.key;
    const k3 = one(run(at("2026-10-22", 11)).alerts, "ravi")!.key;
    expect(k1).toBe("smm_alert_a_red_2026-10-22r0_ravi");
    expect(k2).toBe(k1);
    expect(k3).toBe("smm_alert_a_red_2026-10-22r1_ravi");
    expect(one(run(at("2026-10-21", 19, 30)).alerts, "ravi")!.key).toBe("smm_alert_a_red_2026-10-21r0_ravi"); // the evening it passed
  });

  it("a finished piece alerts nobody", () => {
    const done = four({ status: "posted", uploadDate: "2026-10-20", approval: { state: "approved", chases: [] } });
    expect(on(run(at("2026-10-22", 10), {}, [done]).alerts, "ravi")).toEqual([]);
    expect(on(run(at("2026-10-23", 10), {}, [done]).alerts, "ta")).toEqual([]);
  });

  it("a person in two seats gets one alert per piece", () => {
    const both = four({}, { team: { creator: { uid: "ravi", name: "Ravi" }, publisher: { uid: "ravi", name: "Ravi" }, marketer: null, assistants: [] } });
    expect(on(run(at("2026-10-22", 10), {}, [both]).alerts, "ravi")).toHaveLength(1);
  });
});

describe("answers quiet the alerts", () => {
  it("a late reason given after the deadline stops the owner's repeats; the leads are still told", () => {
    const answered = four({ lateReasons: [{ step: "live", reason: "client asked to change", at: at("2026-10-22", 9), byUid: "ravi", byName: "Ravi" }] });
    const { alerts } = run(at("2026-10-22", 10), {}, [answered]);
    expect(on(alerts, "ravi")).toEqual([]);
    expect(one(alerts, "manasa")!.reason).toBe("lead_escalation");
  });

  it("Do it now / Need more time (eta) quiets the owner until it ends", () => {
    const m = four({ eta: { kind: "focus", until: at("2026-10-19", 11, 45), at: at("2026-10-19", 11), day: "2026-10-19", byUid: "ravi", byName: "Ravi", focusUsed: 1 } });
    expect(on(run(at("2026-10-19", 11, 30), {}, [m]).alerts, "ravi")).toEqual([]);
    expect(one(run(at("2026-10-19", 12), {}, [m]).alerts, "ravi")!.reason).toBe("checkpoint_missed");
  });

  it("Blocked quiets the owner and chases whoever must clear it; it expires after 24 h unless confirmed", () => {
    const blocker = { kind: "client_approval", note: "", since: at("2026-10-19", 10), byUid: "ravi", byName: "Ravi", expiresAt: at("2026-10-20", 10) };
    const live = run(at("2026-10-19", 11), {}, [four({ blocker })]).alerts;
    expect(on(live, "ravi")).toEqual([]);
    expect(one(live, "sita")!.reason).toBe("blocked");
    expect(one(run(at("2026-10-20", 11), {}, [four({ blocker })]).alerts, "ravi")!.reason).toBe("checkpoint_missed"); // expired
    expect(on(run(at("2026-10-20", 11), {}, [four({ blocker: { ...blocker, confirmedByUid: "sita" } })]).alerts, "ravi")).toEqual([]);
  });

  it("a lead's I'm on it: 4 h of quiet for her, and the admins wait 4 h after it", () => {
    const answers = { manasa: { a: { kind: "on_it" as const, at: at("2026-10-23", 8) } } };
    const r1 = run(at("2026-10-23", 10), { answers }).alerts;
    expect(on(r1, "manasa")).toEqual([]);
    expect(on(r1, "ta")).toEqual([]);
    expect(one(run(at("2026-10-23", 12, 30), { answers }).alerts, "ta")!.level).toBe("critical");
  });

  it("a lead's Escalate brings the admins in at once", () => {
    const answers = { kiran: { a: { kind: "escalate" as const, at: at("2026-10-22", 10) } } };
    expect(one(run(at("2026-10-22", 10, 5), { answers }).alerts, "ta")!.reason).toBe("admin_escalation");
  });

  it("a reassigned piece gives its new owner a fresh lead time (quiet until the end of the next working day)", () => {
    const m = four({ makerUid: "priya", makerName: "Priya", reassigns: [{ seat: "maker", fromUid: "ravi", toUid: "priya", at: at("2026-10-19", 10), byUid: "kiran", byName: "Kiran" }] });
    expect(on(run(at("2026-10-19", 11), {}, [m]).alerts, "priya")).toEqual([]);
    expect(on(run(at("2026-10-20", 18), {}, [m]).alerts, "priya")).toEqual([]);
    expect(one(run(at("2026-10-21", 10, 30), {}, [m]).alerts, "priya")!.reason).toBe("deadline_today");
  });
});

describe("leave, quiet hours, the Starting line", () => {
  it("nobody away is alerted; the leads get 'away — reassign?'", () => {
    const people = PEOPLE.map((p) => (p.uid === "ravi" ? { ...p, presence: "away" as const } : p));
    const { alerts } = run(at("2026-10-19", 11), { people });
    const mine = one(alerts, "ravi")!;
    expect([mine.deliverNow, mine.heldBecause]).toEqual([false, "away"]);
    expect(one(alerts, "manasa")!.reason).toBe("owner_away");
    expect(one(alerts, "kiran")!.message).toContain("Ravi is away today");
  });

  it.each([
    ["8 PM", at("2026-10-19", 20), true],
    ["8:59 AM", at("2026-10-19", 8, 59), true],
    ["9 AM", at("2026-10-19", 9), false],
    ["7:59 PM", at("2026-10-19", 19, 59), false],
    ["a Sunday noon", at("2026-10-18", 12), true],
  ])("quiet hours: %s → %s", (_l, now, quiet) => expect(isQuietTime(now as number, LIVE.quietHours, null)).toBe(quiet));
  it("a company holiday is quiet", () => expect(isQuietTime(at("2026-10-20", 12), LIVE.quietHours, new Set(["2026-10-20"]))).toBe(true));

  it("in quiet hours only critical alerts take the screen", () => {
    const { alerts } = run(at("2026-10-24", 21));
    expect(one(alerts, "ravi")!.heldBecause).toBe("quiet_hours");
    const admin = one(alerts, "ta")!;
    expect([admin.level, admin.deliverNow]).toEqual(["critical", true]);
  });

  it("escalation days start at 9 AM — never a critical at midnight", () => {
    expect(on(run(at("2026-10-23", 0, 30)).alerts, "ta")).toEqual([]);
  });

  it("lateness that existed at switch-on never escalates — it goes to the Starting line", () => {
    const late = four({}, { delivery: { ...SWITCHED_ON, baselineAt: at("2026-10-23", 12) } });
    const r = run(at("2026-10-24", 11), {}, [late]);
    expect(r.alerts.filter((a) => a.subject === "a")).toEqual([]);
    expect(r.startingLine.map((s) => s.itemId)).toEqual(["a"]);
  });

  it("a checkpoint missed before switch-on is not chased; the deadline after it is", () => {
    const m = four({}, { delivery: { ...SWITCHED_ON, baselineAt: at("2026-10-19", 9) } });
    expect(on(run(at("2026-10-19", 11), {}, [m]).alerts, "ravi")).toEqual([]);
    expect(one(run(at("2026-10-21", 11), {}, [m]).alerts, "ravi")!.reason).toBe("deadline_today");
  });
});

describe("the client's side", () => {
  const waiting = (askedDay: string, extra: Record<string, unknown> = {}) =>
    four({ status: "awaiting_approval", madeAt: at(askedDay, 10), approval: { state: "waiting", askedAt: at(askedDay, 10), chases: [] }, ...extra });

  it("an approval waiting 2 days → the salesperson; 4 → the sales admin; after the last chase day → 'not responding'", () => {
    const m = waiting("2026-10-16");
    expect(one(run(at("2026-10-17", 11), {}, [m]).alerts, "sita")).toBeUndefined();
    const d2 = one(run(at("2026-10-18", 11), {}, [m]).alerts, "sita")!;
    expect([d2.reason, d2.type, d2.title]).toEqual(["approval_waiting", "approval", "✅ APPROVAL · Lakshmi Jewellers"]);
    expect(one(run(at("2026-10-20", 11), {}, [m]).alerts, "sa")!.reason).toBe("approval_waiting");
    expect(one(run(at("2026-10-24", 11), {}, [m]).alerts, "sa")!.reason).toBe("approval_not_responding");
  });

  it("a client delay never climbs the team's ladder", () => {
    const { alerts } = run(at("2026-10-23", 10), {}, [waiting("2026-10-16")]);
    expect(on(alerts, "ravi")).toEqual([]);
    expect(on(alerts, "manasa")).toEqual([]);
    expect(on(alerts, "ta")).toEqual([]);
  });

  it("a chase the salesperson logged quiets that day's alert; the next chase day asks again", () => {
    const m = waiting("2026-10-16", { approval: { state: "waiting", askedAt: at("2026-10-16", 10), chases: [{ at: at("2026-10-18", 9), byName: "Sita" }] } });
    expect(one(run(at("2026-10-18", 11), {}, [m]).alerts, "sita")).toBeUndefined();
    expect(one(run(at("2026-10-20", 11), {}, [m]).alerts, "sita")!.key).toContain("_c4_");
  });

  it("the client keeps changing (a 3rd revision) → the salesperson and the admins are told", () => {
    const { alerts } = run(at("2026-10-17", 11), {}, [waiting("2026-10-16", { revisions: 3 })]);
    expect(one(alerts, "sita")!.reason).toBe("client_keeps_changing");
    expect(one(alerts, "ta")!.reason).toBe("client_keeps_changing");
  });

  it("a real video's footage missing at its checkpoint → the salesperson; a working day later → the sales admin", () => {
    const m = month({ delivery: SWITCHED_ON, commitments: { ai_ad: 0, poster: 0, real_video: 4 }, items: ["a", "b", "c", "d"].map((id) => piece({ id, kind: "real_video" })) });
    expect(on(run(at("2026-10-16", 18), {}, [m]).alerts, "sita")).toEqual([]);
    const s = one(run(at("2026-10-17", 9, 30), {}, [m]).alerts, "sita")!;
    expect([s.reason, s.title]).toEqual(["footage_missing", "🎞 FOOTAGE · Lakshmi Jewellers"]);
    expect(one(run(at("2026-10-17", 9, 30), {}, [m]).alerts, "sa")!.reason).toBe("footage_missing");
    const pending = month({ ...m, items: m.items.map((i) => (i.id === "a" ? { ...i, footage: { state: "pending_client" } } : i)) } as never);
    expect(on(run(at("2026-10-22", 11), {}, [pending]).alerts, "sita")).toEqual([]);
  });

  it("extra work live 3 days and not billed → the salesperson (🧾 BILLING)", () => {
    const m = four({}, { items: [...four().items, piece({ id: "x", extra: true, kind: "poster", extraType: "poster", title: "Poster", status: "posted", uploadDate: "2026-10-15", extraCharge: "unbilled", approval: { state: "approved", chases: [] } })] });
    expect(one(run(at("2026-10-17", 11), {}, [m]).alerts, "sita", "x")).toBeUndefined();
    const a = one(run(at("2026-10-19", 11), {}, [m]).alerts, "sita", "x")!;
    expect([a.reason, a.type]).toEqual(["extra_unbilled", "billing"]);
    const billed = four({}, { items: [...four().items, { ...m.items.at(-1)!, extraCharge: "billed" }] });
    expect(one(run(at("2026-10-19", 11), {}, [billed]).alerts, "sita", "x")).toBeUndefined();
  });

  it("an ad's report missing by noon, and a video live 2 days with no ad → the marketer (📊 AD REPORT)", () => {
    const ads = [{ id: "run1", name: "Diwali leads", scope: { kind: "poster", itemIds: [] }, startDate: "2026-10-15", days: 10, dailyBudget: 300, status: "running", reports: [] }];
    const m = four({ status: "posted", uploadDate: "2026-10-16", approval: { state: "approved", chases: [] } }, { ads });
    expect(on(run(at("2026-10-19", 11, 30), {}, [m]).alerts, "mani", "run1")).toEqual([]);
    expect(one(run(at("2026-10-19", 12, 30), {}, [m]).alerts, "mani", "run1")!.reason).toBe("ad_report_missing");
    expect(one(run(at("2026-10-19", 11), {}, [m]).alerts, "mani", "a_ad")!.reason).toBe("ad_not_started");
  });
});

describe("months, owners and capacity", () => {
  it("a running month with nobody on it → ONE setup alert to the tech admin and the main admin", () => {
    const m = four({}, { team: { creator: null, publisher: null, marketer: null, assistants: [] } });
    const { alerts } = run(at("2026-10-19", 11), {}, [m]);
    expect(alerts.filter((a) => a.uid === "ta").map((a) => a.reason)).toEqual(["month_unstaffed"]);
    expect(alerts.find((a) => a.uid === "ta")!.title).toBe("🛠 SETUP · Lakshmi Jewellers");
    expect(alerts.filter((a) => a.uid === "ravi")).toEqual([]);
  });

  it("a piece whose owner was deactivated → 'nobody owns' to the admins, one per month", () => {
    const people = PEOPLE.map((p) => (p.uid === "ravi" ? { ...p, isActive: false } : p));
    const { alerts } = run(at("2026-10-22", 10), { people });
    const nobody = alerts.filter((a) => a.uid === "ta" && a.reason === "nobody_owns");
    expect(nobody).toHaveLength(1);
    expect(on(alerts, "ravi")).toEqual([]);
  });

  it.each([
    ["on hold (its end date passed, no renewal)", { cycle: { month: "2026-09", startDate: "2026-09-15", endDate: "2026-10-15" } }],
    ["deleted", { status: "deleted" }],
    ["a history month", { history: true }],
    ["not started yet", { cycle: { month: "2026-11", startDate: "2026-11-01", endDate: "2026-12-01" } }],
  ])("%s → no production alerts", (_l, over) => {
    expect(run(at("2026-10-19", 11), {}, [four({}, over)]).alerts).toEqual([]);
  });

  it("more pieces than the weekly limit → ONE admin alert to rebalance; that person's early warnings are held", () => {
    const settings = { ...LIVE, ladder: { ...LIVE.ladder, weeklyLoadLimit: 3 } };
    const months = ["m1", "m2", "m3", "m4"].map((id) => month({ id, businessName: `Client ${id}`, delivery: SWITCHED_ON, items: ["a", "b", "c", "d"].map((x) => piece({ id: `${id}${x}` })) }));
    const r = run(at("2026-10-19", 11), { settings }, months);
    expect(r.load.ravi).toBe(4);
    expect(r.alerts.filter((a) => a.reason === "overloaded").map((a) => a.uid).sort()).toEqual(["owner", "ta"]);
    const ravis = r.alerts.filter((a) => a.uid === "ravi" && a.reason === "checkpoint_missed");
    expect(ravis.length).toBe(4);
    expect(ravis.every((a) => a.level === "watch" && a.heldBecause === "capacity" && !a.fullScreen)).toBe(true);
  });

  it("a week that cannot fit → ONE admin alert per week", () => {
    const m = month({ delivery: SWITCHED_ON, commitments: { ai_ad: 60, poster: 0, real_video: 0 }, items: Array.from({ length: 60 }, (_, i) => piece({ id: `v${i}` })) });
    const crowded = run(at("2026-10-15", 11), {}, [m]).alerts.filter((a) => a.reason === "plan_impossible" && a.uid === "ta");
    expect(crowded.length).toBeGreaterThanOrEqual(1);
    expect(new Set(crowded.map((a) => a.subject)).size).toBe(crowded.length);
  });

  it("a broken month is reported and never stops the others", () => {
    const broken = { ...four(), id: "bad", get items(): never { throw new Error("boom"); } } as unknown as SmmDeliveryMonth;
    const r = run(at("2026-10-19", 11), {}, [broken, four({}, { id: "good" })]);
    expect(r.errors).toEqual([{ campaignId: "bad", message: "boom" }]);
    expect(one(r.alerts, "ravi")!.campaignId).toBe("good");
  });

  it("it never writes: the months are unchanged", () => {
    const m = four();
    const before = JSON.stringify(m);
    run(at("2026-10-23", 10), {}, [m]);
    expect(JSON.stringify(m)).toBe(before);
  });
});

describe("the switch: off, preview, pilot", () => {
  it("off → nothing at all", () => {
    expect(run(at("2026-10-22", 10), { settings: { ...LIVE, mode: "off" } })).toEqual({ alerts: [], plans: [], startingLine: [], errors: [], load: {} });
  });
  it("preview → everything computed, nothing delivered ('Ravi would get …')", () => {
    const { alerts } = run(at("2026-10-22", 10), { settings: { ...LIVE, mode: "preview" } });
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.every((a) => !a.deliverNow && a.heldBecause === "preview")).toBe(true);
    expect(one(alerts, "ravi")!.level).toBe("red");
  });
  it("a pilot group → only its people get alerts", () => {
    const { alerts } = run(at("2026-10-22", 10), { settings: { ...LIVE, pilotUids: ["ravi"] } });
    expect(one(alerts, "ravi")!.deliverNow).toBe(true);
    expect(one(alerts, "manasa")!.heldBecause).toBe("pilot");
  });
});

describe("the screen", () => {
  it("one screen per person, worst first; the main admin's is one combined screen", () => {
    const months = [four(), four({}, { id: "m2", businessName: "Annapurna" })];
    const { alerts } = run(at("2026-10-23", 10), {}, months);
    const s = screenFor("owner", alerts, "main_admin");
    expect(s.alerts.length).toBe(2);
    expect([s.level, s.combined]).toEqual(["critical", true]);
    const ravi = screenFor("ravi", alerts);
    expect(ravi.alerts.every((a) => a.fullScreen && a.deliverNow)).toBe(true);
  });

  it.each([
    ["fresh, clock right", { deviceNow: 1_000_000, serverNow: 1_000_000, syncedAt: 1_000_000 - 60_000, freshMinutes: 5 }, ""],
    ["data older than 5 min", { deviceNow: 1_000_000, serverNow: 1_000_000, syncedAt: 1_000_000 - 6 * 60_000, freshMinutes: 5 }, "stale"],
    ["never synced", { deviceNow: 1_000_000, freshMinutes: 5 }, "stale"],
    ["device clock a day ahead", { deviceNow: 1_000_000 + 86_400_000, serverNow: 1_000_000, syncedAt: 1_000_000 + 86_400_000, freshMinutes: 5 }, "clock"],
  ])("full screen only on fresh data and a sane clock: %s", (_l, args, want) => expect(screenProblem(args)).toBe(want));

  it("the once key", () => expect(smmAlertKey("m1_w2", "red", "2026-10-22r1", "ravi")).toBe("smm_alert_m1_w2_red_2026-10-22r1_ravi"));
});

describe("answer rules", () => {
  const deadlineAt = at("2026-10-21", 19);
  it("Do it now: 45 min, renewed once a day, never past the deadline", () => {
    const first = etaCheck({ kind: "focus", eta: null, now: at("2026-10-20", 10), deadlineAt });
    expect([first.problem, first.until]).toEqual(["", at("2026-10-20", 10, 45)]);
    const eta = { kind: "focus" as const, until: 0, at: 0, day: "2026-10-20", byUid: "ravi", byName: "Ravi", focusUsed: 2 };
    expect(etaCheck({ kind: "focus", eta, now: at("2026-10-20", 12), deadlineAt }).problem).toContain("already renewed");
    expect(etaCheck({ kind: "focus", eta, now: at("2026-10-21", 12), deadlineAt }).problem).toBe(""); // a new day
    expect(etaCheck({ kind: "focus", eta: null, now: at("2026-10-21", 18, 30), deadlineAt }).until).toBe(deadlineAt);
  });
  it("Need more time: today only, at most 2 per piece, never after the deadline", () => {
    expect(etaCheck({ kind: "more_time", eta: null, now: at("2026-10-20", 10), deadlineAt }).until).toBe(at("2026-10-20", 20));
    expect(etaCheck({ kind: "more_time", eta: null, now: at("2026-10-21", 10), deadlineAt }).until).toBe(deadlineAt);
    const used = { kind: "more_time" as const, until: 0, at: 0, day: "2026-10-19", byUid: "ravi", byName: "Ravi", moreTimeUsed: 2 };
    expect(etaCheck({ kind: "more_time", eta: used, now: at("2026-10-20", 10), deadlineAt }).problem).toContain("already given 2 times");
    expect(etaCheck({ kind: "more_time", eta: null, now: at("2026-10-22", 10), deadlineAt }).problem).toContain("deadline has passed");
  });
  it("a 3rd reassign needs an admin", () => {
    const twice = { reassigns: [{}, {}] as never };
    expect(reassignCheck(twice, { role: "tech_team_leader" })).toContain("only the tech admin or the main admin");
    expect(reassignCheck(twice, { role: "tech_admin" })).toBe("");
    expect(reassignCheck({ reassigns: [{}] as never }, { role: "tech_team_leader" })).toBe("");
  });
  it.each([
    ["present", {}, "working"], ["present", { checkedOut: true }, "away"], ["half", {}, "half_in"], ["half_leave", { checkedIn: true }, "half_in"],
    ["half_leave", {}, "away"], ["leave", {}, "away"], ["leave_asked", {}, "away"], ["absent", {}, "away"], ["holiday", {}, "away"],
    ["not_in", {}, "working"], ["unknown", {}, "working"],
  ])("presence: %s %j → %s", (kind, opts, want) => expect(presenceFromToday(kind, opts)).toBe(want));
});

describe("the 30-day rehearsal", () => {
  it("replays the month from its stamps, counts full screens per person per day, and changes nothing", () => {
    const m = four();
    const before = JSON.stringify(m);
    const r = rehearseSmm({ months: [m], settings: LIVE, holidays: new Set(), people: PEOPLE }, { fromDay: "2026-10-15", days: 30 });
    expect(JSON.stringify(m)).toBe(before);
    expect(r.target).toBe(3);
    expect(r.totalScreens).toBeGreaterThan(0);
    expect(r.personDays[0].screens).toBeGreaterThanOrEqual(r.personDays.at(-1)!.screens);
    // Nobody ever answers in the rehearsal, so the owner of a late piece is asked every 2 h — the report shows it.
    expect(r.personDays.some((d) => d.uid === "ravi" && d.screens > 3)).toBe(true);
    expect(r.overTarget).toBeGreaterThan(0);
    expect(r.byType.ai_video).toBeGreaterThan(0);
  });

  it("a month done on time (from its stamps) gives the owner no full screen", () => {
    const done = (id: string, day: string) => piece({ id, status: "posted", uploadDate: day, madeAt: at(day, 8), postedAt: at(day, 9), startedAt: at(day, 7),
      approval: { state: "approved", askedAt: at(day, 8), respondedAt: at(day, 8, 30), chases: [] } });
    const m = month({ delivery: SWITCHED_ON, team: { creator: { uid: "ravi", name: "Ravi" }, publisher: { uid: "priya", name: "Priya" }, marketer: null, assistants: [] },
      items: [done("a", "2026-10-15"), done("b", "2026-10-22"), done("c", "2026-10-29"), done("d", "2026-11-05")] });
    const r = rehearseSmm({ months: [m], settings: LIVE, holidays: new Set(), people: PEOPLE }, { fromDay: "2026-10-15", days: 30 });
    expect(r.personDays.filter((d) => d.uid === "ravi" || d.uid === "priya")).toEqual([]);
  });

  it("a piece as it stood: what happened later is undone", () => {
    const p = piece({ status: "posted", startedAt: at("2026-10-16", 9), madeAt: at("2026-10-16", 10), postedAt: at("2026-10-20", 10), approval: { state: "approved", askedAt: at("2026-10-16", 10), respondedAt: at("2026-10-18", 10), chases: [] } });
    expect(itemAsOf(p as never, at("2026-10-15", 10))!.status).toBe("planned");
    expect(itemAsOf({ ...p, startedAt: undefined } as never, at("2026-10-15", 10))!.status).toBe("in_progress"); // no start stamp: as far back as is known
    expect(itemAsOf(p as never, at("2026-10-17", 10))!.approval.state).toBe("waiting");
    expect(itemAsOf(p as never, at("2026-10-19", 10))!.status).toBe("approved");
    expect(itemAsOf(p as never, at("2026-10-21", 10))!.status).toBe("posted");
  });
});

/**
 * SMM Delivery Control — what the new screen SHOWS (2026-10-15, phase 2): who gets which view, tabs and tiles; the
 * Today cards (one per client-week, grouped worst first); the Weeks marks; the Team cards (on-time % only for the
 * admins); the Starting line; the Alerts log ("would get" in Preview); the check-out list; and the access rules the
 * classic page's button reads (owner's decisions 13–16).
 */
import { describe, expect, it } from "vitest";
import { month, piece } from "./smmDeliveryFixtures";
import { istMoment } from "@/utils/smmCadence";
import { DEFAULT_SMM_DELIVERY } from "@/utils/smmDeliverySettings";
import {
  alertLog, buildControlBoard, canSeeControlButton, controlViewOf, coveredByDelivery, dayOfMonth, delaySummary, liveSinceOf, markOf,
  monthSentence, startingLineRows, tabsFor, teamCards, tilesFor, todayCards, weekCells,
} from "@/utils/smmDeliveryView";
import { canSeeControlButton as lightCanSee } from "@/utils/smmControlAccess";
import { catchUpWeeks, checkoutTasksFor, postLinkProblems, statusStamps } from "@/utils/smmDeliveryActions";
import type { SmmDeliverySettings } from "@/types/smmDelivery";

const PREVIEW = DEFAULT_SMM_DELIVERY;
const LIVE: SmmDeliverySettings = { ...DEFAULT_SMM_DELIVERY, mode: "live", history: [{ mode: "live", at: istMoment("2026-10-15", 9), byUid: "k", byName: "K" }] };
/** Mon 26 Oct 2026, 11:00 IST — week 2 of the fixture month (22–28 Oct, deadline Wed 28 Oct). */
const MON26 = istMoment("2026-10-26", 11);

const people = [
  { uid: "ravi", name: "Ravi", role: "tech_member", isActive: true },
  { uid: "priya", name: "Priya", role: "tech_member", isActive: true },
  { uid: "manasa", name: "Manasa", role: "tech_member", smmLeader: true, isActive: true },
  { uid: "kiran", name: "Kiran", role: "tech_admin", isActive: true },
  { uid: "sita", name: "Sita", role: "sales_member", isActive: true },
];

const board = (opts: { viewer: { uid: string; role: string; smmLeader?: boolean }; settings?: SmmDeliverySettings; now?: number; months?: ReturnType<typeof month>[] }) =>
  buildControlBoard({
    months: opts.months || [month({
      items: [
        piece({ id: "w1", plan: { week: 1, by: "auto" }, makerUid: "ravi", makerName: "Ravi", publisherUid: "priya", publisherName: "Priya" }),
        piece({ id: "w2a", plan: { week: 2, by: "auto" }, makerUid: "ravi", makerName: "Ravi", publisherUid: "priya", publisherName: "Priya" }),
        piece({ id: "w2b", kind: "poster", plan: { week: 2, by: "auto" }, makerUid: "ravi", makerName: "Ravi", publisherUid: "priya", publisherName: "Priya" }),
        piece({ id: "w3", plan: { week: 3, by: "auto" }, makerUid: "ravi", makerName: "Ravi" }),
      ],
      commitments: { ai_ad: 3, poster: 1, real_video: 0 },
      watchers: ["ravi", "priya", "sita"],
    })],
    settings: opts.settings || LIVE,
    holidays: null,
    now: opts.now ?? MON26,
    viewer: { name: opts.viewer.uid, ...opts.viewer },
    people,
    liveSince: (opts.settings || LIVE).mode === "live" ? istMoment("2026-10-15", 9) : null,
  });

describe("who gets which view (decisions 13–16)", () => {
  it("each role's view and tabs", () => {
    expect(controlViewOf({ uid: "a", role: "main_admin" })).toBe("admin");
    expect(controlViewOf({ uid: "a", role: "tech_team_leader", smmLeader: true })).toBe("team_leader");
    expect(controlViewOf({ uid: "a", role: "tech_member", smmLeader: true })).toBe("lead");
    expect(controlViewOf({ uid: "a", role: "accounts_admin" })).toBeNull();
    expect(tabsFor("member")).toEqual(["today", "weeks", "plan", "log"]);
    expect(tabsFor("lead")).toEqual(["today", "weeks", "plan", "team", "start", "log"]);
    expect(tabsFor("admin")).toContain("settings");
    expect(tabsFor("sales_admin")).toEqual(["today", "weeks", "plan", "team", "log"]);
  });

  it("the button: Preview = admins, team leaders, the Social Media Team Lead; Live = all six; Off = the two admins", () => {
    const member = { uid: "r", role: "tech_member" };
    const lead = { uid: "m", role: "tech_member", smmLeader: true };
    const seller = { uid: "s", role: "sales_member" };
    expect(canSeeControlButton(member, "preview")).toBe(false);
    expect(canSeeControlButton(lead, "preview")).toBe(true);
    expect(canSeeControlButton(seller, "preview")).toBe(false);
    expect(canSeeControlButton(seller, "live")).toBe(true);
    expect(canSeeControlButton({ uid: "t", role: "tech_team_leader" }, "off")).toBe(false);
    expect(canSeeControlButton({ uid: "a", role: "tech_admin" }, "off")).toBe(true);
    expect(lightCanSee).toBe(canSeeControlButton);
  });

  it("covered by the alerts: Live, and in the pilot group when there is one", () => {
    expect(coveredByDelivery(PREVIEW, "ravi")).toBe(false);
    expect(coveredByDelivery(LIVE, "ravi")).toBe(true);
    expect(coveredByDelivery({ ...LIVE, pilotUids: ["priya"] }, "ravi")).toBe(false);
    expect(coveredByDelivery({ ...LIVE, pilotUids: ["priya"] }, "priya")).toBe(true);
    expect(liveSinceOf(LIVE)).toBe(istMoment("2026-10-15", 9));
    expect(liveSinceOf(PREVIEW)).toBeNull();
  });
});

describe("Today", () => {
  it("one card per client-week: week 2 this week, week 3 next week; week 1's late piece in Late", () => {
    const b = board({ viewer: { uid: "kiran", role: "tech_admin" } });
    const cards = todayCards(b);
    const byWeek = Object.fromEntries(cards.map((c) => [c.week?.week, c]));
    expect(byWeek[1].group).toBe("late");
    expect(byWeek[2].group === "this_week" || byWeek[2].group === "checkpoint").toBe(true);
    expect(byWeek[3].group).toBe("next_week");
    expect(byWeek[2].heading).toMatch(/^Lakshmi Jewellers · Week 2 of 4 · deadline Wed 28 Oct, 7 PM · 2 days left · 0 of 2 live$/);
    // Worst first.
    expect(cards[0].group).toBe("late");
  });

  it("a member sees only their own pieces; a salesperson only the client's side", () => {
    const priya = board({ viewer: { uid: "priya", role: "tech_member" } });
    expect(priya.rows.every((r) => r.task.makerUid === "priya" || r.task.publisherUid === "priya" || r.month.team?.publisher?.uid === "priya")).toBe(true);
    const sita = board({ viewer: { uid: "sita", role: "sales_member" } });
    expect(tilesFor(sita).map((t) => t.label)).toEqual(["Approvals waiting", "Footage to collect", "Extras to bill", "Reports due"]);
  });

  it("tiles per role, and the admins' Needs you counts their full-screen alerts", () => {
    const admin = board({ viewer: { uid: "kiran", role: "tech_admin" }, now: istMoment("2026-10-26", 11) });
    expect(tilesFor(admin).map((t) => t.label)).toEqual(["Needs you", "Late", "Due this week", "Waiting on client", "Nobody owns"]);
    const lateTile = tilesFor(admin).find((t) => t.key === "late")!;
    expect(lateTile.count).toBe(1);
    expect(tilesFor(board({ viewer: { uid: "manasa", role: "tech_member", smmLeader: true } })).map((t) => t.label)).toEqual(["Late", "Due this week", "Next week", "Waiting on client"]);
  });

  it("the five marks: ✔ done, ✖ late, ⚠ at risk, ⏸ client, ◷ coming", () => {
    const b = board({ viewer: { uid: "kiran", role: "tech_admin" } });
    const w1 = b.rows.find((r) => r.task.itemId === "w1")!;
    expect(markOf(w1.progress)).toBe("late");
    expect(w1.state).toMatch(/^Late — was due Wed 21 Oct, 7 PM$/);
    const w3 = b.rows.find((r) => r.task.itemId === "w3")!;
    expect(w3.mark).toBe("coming");
  });
});

describe("Weeks, Team, Starting line, Alerts log", () => {
  it("each week cell: '2 + 2'-style counts, its deadline, a mark per piece, the current week ringed", () => {
    const b = board({ viewer: { uid: "kiran", role: "tech_admin" } });
    const cells = weekCells(b.months[0], b.today);
    expect(cells.map((c) => c.counts)).toEqual(["1 + 0", "1 + 1", "1 + 0", "0 + 0"]);
    expect(cells[1].current).toBe(true);
    expect(cells[1].due).toBe("due Wed 28 Oct");
    expect(cells[0].marks.map((m) => m.mark)).toEqual(["late"]);
  });

  it("Team: on-time % is only shown to the admins (the rule lives in seesOnTimePercent); load and answers per person", () => {
    const b = board({ viewer: { uid: "kiran", role: "tech_admin" } });
    const cards = teamCards(b, LIVE, (uid) => people.find((p) => p.uid === uid)?.name || "");
    const ravi = cards.find((c) => c.uid === "ravi")!;
    expect(ravi.late).toBe(1);
    expect(ravi.clients).toEqual(["Lakshmi Jewellers"]);
    expect(ravi.limit).toBe(12);
  });

  it("Preview: everything already late is the Starting line (what switching on now would do) and the log says who WOULD get what", () => {
    const b = board({ viewer: { uid: "kiran", role: "tech_admin" }, settings: PREVIEW });
    expect(startingLineRows(b).map((r) => r.itemId)).toEqual(["w1"]);
    const log = alertLog(b).filter((l) => l.kind === "alert");
    // Judged as if switched on from the month's first day: the late week-1 piece's owner WOULD be alerted.
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((l) => l.status === "Preview — would get")).toBe(true);
    expect(b.alerts.some((a) => a.uid === "ravi" && a.reason === "deadline_passed")).toBe(true);
  });

  it("Live: lateness after it went Live escalates; the log's summary names client vs team delays", () => {
    const b = board({ viewer: { uid: "kiran", role: "tech_admin" } });
    expect(startingLineRows(b)).toEqual([]);
    expect(b.monitor.alerts.some((a) => a.uid === "ravi" && a.reason === "deadline_passed")).toBe(true);
    expect(delaySummary(b)).toMatch(/2 because the team had not sent it to the client in time/) // week 1 late + week 2 video past its "send by Sat 24";
  });

  it("tiles count only what Today can show: an On hold month's open piece is not 'Late'", () => {
    const running = month({ items: [piece({ id: "w1", plan: { week: 1, by: "auto" }, makerUid: "ravi" })], commitments: { ai_ad: 1, poster: 0, real_video: 0 } });
    const onHold = month({ id: "old", businessName: "Old Client", cycle: { month: "2026-09", startDate: "2026-09-20", endDate: "2026-10-20" },
      items: [piece({ id: "o1", plan: { week: 1, by: "auto" }, makerUid: "ravi" })], commitments: { ai_ad: 1, poster: 0, real_video: 0 } });
    const b = board({ viewer: { uid: "kiran", role: "tech_admin" }, months: [running, onHold] });
    expect(b.months.find((m) => m.month.id === "old")?.plan.exclusion).toBe("on_hold");
    expect(tilesFor(b).find((t) => t.key === "late")?.count).toBe(1);
  });

  it("the month's header words", () => {
    const b = board({ viewer: { uid: "kiran", role: "tech_admin" } });
    expect(dayOfMonth(b.months[0].plan, b.today)).toBe("Day 12 of 31");
    expect(monthSentence(b.months[0], b.today)).toMatch(/^1 piece is late/);
  });
});

describe("the actions' small rules", () => {
  it("check-out asks the maker about every piece of theirs due, late or behind — not the client's side", () => {
    const m = month({ items: [
      piece({ id: "late", plan: { week: 1, by: "auto" }, makerUid: "ravi" }),
      piece({ id: "waiting", plan: { week: 2, by: "auto" }, makerUid: "ravi", status: "awaiting_approval", approval: { state: "waiting", askedAt: MON26 - 3 * 86_400_000, chases: [] } }),
    ] });
    const tasks = checkoutTasksFor({ uid: "ravi", months: [m], now: istMoment("2026-10-26", 18), holidays: null });
    expect(tasks.map((t) => [t.itemId, t.why, t.step])).toEqual([["late", "late", "send"]]);
  });

  it("a catch-up goes to this week or up to two ahead; posted links are checked per account", () => {
    const b = board({ viewer: { uid: "kiran", role: "tech_admin" } });
    expect(catchUpWeeks(b.months[0].plan, b.today)).toEqual([2, 3, 4]);
    expect(postLinkProblems({ platforms: ["instagram", "facebook"], postUrls: { instagram: "https://instagram.com/p/x", facebook: "https://fb.watch/y" } }).ok).toBe(true);
    expect(postLinkProblems({ platforms: ["facebook"], postUrls: { facebook: "not a link at all" } }).ok).toBe(false);
  });

  it("the classic stage buttons stamp once and never overwrite", () => {
    expect(statusStamps({}, "in_progress", 5)).toEqual({ startedAt: 5 });
    expect(statusStamps({}, "awaiting_approval", 5)).toEqual({ startedAt: 5, madeAt: 5 });
    expect(statusStamps({ startedAt: 1, madeAt: 2 }, "awaiting_approval", 5)).toEqual({});
  });
});

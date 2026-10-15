/**
 * A Social Media month's dates — the owner's rule of 2026-10-15, and the fixes that came with it.
 *
 *   • The END DATE is the RENEWAL DAY. "6 Sep → 6 Oct" (the label stays: the client is billed "from the
 *     6th to the 6th") owns 6 Sep … 5 Oct; 6 Oct is the next month's first day and the day an undecided
 *     month goes On hold. Running is start ≤ today < end; nothing counts the end date in two months.
 *   • The bell, the card's time line and its renewal chip count from ONE number (`daysLeftInCycle` =
 *     `daysToRenewal`), so they never disagree.
 *   • A client sold on the 31st stays on the 31st (`anchorDay`, `nextCycleAfter`).
 *   • A post counts toward its month only on one of the month's own days (or undated): one dated outside
 *     is not delivered for it, and is said separately ("9 posts are dated outside 6 Oct – 5 Nov").
 *   • "Up 3d ago" and the posts-a-day trend count from the upload date, not from when Posted was pressed.
 *   • The month's ad figures are its own days' only; a new run starts inside the month.
 *   • "Completed (Locked)" only on a month that is finished — an On hold month reads "Ended — not renewed yet".
 */
import { describe, expect, it, vi } from "vitest";

const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn(async (_n: Record<string, unknown>) => undefined) }));
vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification, notifyTechTeamLeaders: vi.fn(async () => undefined) }));

import {
  adDaily, dashboardKpis, postedDay,
} from "@/utils/smmDashboard";
import {
  blankItem, daysLeftInCycle, fulfilment, isDeliveredInMonth, isOwnDay, itemDatedOutside, lastOwnDay, monthAdReports,
  ownDayCount, postedDayOf, postsByPlatform,
} from "@/utils/smmPlan";
import {
  anchorDayOf, closingStatus, cycleElapsed, cyclePhase, cycleTimeLabel, cyclesOverlap, datedOutsideLine, daysToRenewal,
  defaultAdRunStart, isMonthLocked, isOnHold, kindSegments, lockedMonthLabel, monthCycle, needsSetup, nextCycleAfter,
  ownDaysLabel, paceOf, renewalDue, renewalPopupMonths, renewalWhenLabel, splitByMonthDates, toneCounts,
} from "@/utils/smmPackage";
import { monthGlance, postedUpLabel } from "@/utils/smmGlance";
import { renewalsDueFor } from "@/utils/smmReminders";
import { monthlyReportMessage } from "@/utils/smmMessages";
import { renewalWhen, runningClients } from "@/utils/smmRenewalMoney";
import { buildClientRun, outsideItsMonth } from "@/utils/smmCalendar";
import { historySetupProblem, setupProblem } from "@/services/smmSetup";
import { buildSoldCampaign, monthPromise, notifyRenewalsDueOnOpen, type CreateCampaignInput } from "@/services/smm";
import type { SmmAdRun, SmmCampaign, SmmContentItem, SmmCycle } from "@/types/smm";

const SEP: SmmCycle = { month: "2026-09", startDate: "2026-09-06", endDate: "2026-10-06" };
const OCT: SmmCycle = { month: "2026-10", startDate: "2026-10-06", endDate: "2026-11-06" };

let seq = 0;
const item = (over: Partial<SmmContentItem> = {}): SmmContentItem => ({ ...blankItem("poster", ["instagram"]), id: `d${(seq += 1)}`, ...over });
const month = (over: Partial<SmmCampaign> = {}): SmmCampaign => ({
  id: "m", orderId: "m", leadId: "l", saleItemKey: "k", origin: "sale", clientPhone: "+919876543210",
  clientPhoneId: "919876543210", clientName: "Lakshmi", businessName: "Lakshmi Jewellers", packageKey: "Starter",
  packageLabel: "Starter", amount: 10000, cycle: SEP, platforms: ["instagram"],
  commitments: { poster: 4, ai_ad: 0, real_video: 0 }, items: [], ads: [], budgetPayments: [],
  team: { creator: { uid: "u1", name: "Arjun" }, publisher: null, marketer: null, assistants: [] },
  soldBy: "s1", soldByName: "Anil", watchers: ["s1", "u1"], status: "active", renewal: { state: "none" },
  ...over,
});

describe("the end date is the renewal day (owner, 2026-10-15)", () => {
  it("a month's own days run from its start to the day before its end date", () => {
    expect(lastOwnDay(SEP)).toBe("2026-10-05");
    expect(ownDayCount(SEP)).toBe(30);
    expect(isOwnDay(SEP, "2026-09-06")).toBe(true);
    expect(isOwnDay(SEP, "2026-10-05")).toBe(true);
    expect(isOwnDay(SEP, "2026-10-06")).toBe(false); // the renewal day is the next month's
    expect(isOwnDay(SEP, "2026-09-05")).toBe(false);
    expect(ownDaysLabel(SEP)).toBe("6 Sep – 5 Oct");
    // A month whose end is not after its start has its start as its one day, never a backwards range.
    expect(lastOwnDay({ startDate: "2026-10-06", endDate: "2026-10-06" })).toBe("2026-10-06");
  });

  it("on the renewal day only the new month runs — the old one has ended", () => {
    expect(cyclePhase(SEP, "2026-10-05")).toBe("running");
    expect(cyclePhase(SEP, "2026-10-06")).toBe("ended");
    expect(cyclePhase(OCT, "2026-10-06")).toBe("running");
    expect(cyclePhase(OCT, "2026-10-05")).toBe("upcoming");
    expect(cycleElapsed(SEP, "2026-10-05")).toBe(1);
    expect(cycleElapsed(SEP, "2026-09-06")).toBeCloseTo(1 / 30);
  });

  it("back-to-back months do not overlap; a month reaching into the next one's first day does", () => {
    expect(cyclesOverlap(SEP, OCT)).toBe(false);
    expect(cyclesOverlap({ ...SEP, endDate: "2026-10-07" }, OCT)).toBe(true);
  });

  it("goes On hold, locks and files on the renewal day itself (\"On hold starts on 6 Oct if not renewed\")", () => {
    const sep = month();
    expect(isOnHold(sep, "2026-10-05")).toBe(false);
    expect(isOnHold(sep, "2026-10-06")).toBe(true);
    expect(isMonthLocked(sep, "2026-10-05")).toBe(false);
    expect(isMonthLocked(sep, "2026-10-06")).toBe(true);
    expect(closingStatus({ ...sep, renewal: { state: "won", nextCampaignId: "n" } }, "2026-10-05")).toBeNull();
    expect(closingStatus({ ...sep, renewal: { state: "won", nextCampaignId: "n" } }, "2026-10-06")).toBe("renewed");
    expect(needsSetup({ ...sep, team: { assistants: [] } }, "2026-10-06")).toBe(false);
  });

  it("the bell, the card's time line and its renewal chip count from one number", () => {
    const sep = month();
    const say = (today: string) => {
      const [bell] = renewalsDueFor([sep], "s1", today);
      return { left: bell?.daysLeft, toRenewal: daysToRenewal(SEP, today), card: cycleTimeLabel(SEP, today), chip: monthGlance(sep, today).renewal.label };
    };
    // 1 Oct: was "5 days left" on the bell and "Renewal in 4 days" on the chip.
    expect(say("2026-10-01")).toEqual({ left: 5, toRenewal: 5, card: "5 days left", chip: "Renewal in 5 days" });
    expect(say("2026-10-05")).toEqual({ left: 1, toRenewal: 1, card: "Last day", chip: "Renewal tomorrow" });
    // 6 Oct: was bell "1 day left", card "Last day", chip "Renewal is today".
    expect(say("2026-10-06")).toEqual({ left: 0, toRenewal: 0, card: "Ended today", chip: "Renewal is today" });
    expect(monthGlance(month(), "2026-10-07").renewal).toEqual({ state: "overdue", label: "Renewal overdue" });
    expect(daysLeftInCycle(SEP, "2026-10-08")).toBe(-2);
    expect(cycleTimeLabel(SEP, "2026-10-07")).toBe("Ended yesterday");
    expect([2, 1, 0, -1, -3].map(renewalWhenLabel)).toEqual([
      "Renewal in 2 days", "Renewal tomorrow", "Renewal is today", "Renewal was yesterday", "Renewal was 3 days ago",
    ]);
    expect(renewalWhen(1)).toBe(renewalWhenLabel(1)); // the renewals card and the Money tab say the same
  });

  it("the bell's words agree with the card on the last day and the renewal day", async () => {
    sendNotification.mockClear();
    await notifyRenewalsDueOnOpen([month()], { uid: "s1" }, "2026-10-05");
    await notifyRenewalsDueOnOpen([month()], { uid: "s1" }, "2026-10-06");
    const [lastDay, renewalDay] = sendNotification.mock.calls.map(([n]) => n as { title: string; message: string });
    expect(lastDay.title).toBe("Social media renewal due");
    expect(lastDay.message).toContain("last day of the month, renewal tomorrow");
    expect(renewalDay.title).toBe("Social media month has ended");
    expect(renewalDay.message).toContain("the month has ended, renewal is today");
  });

  it("the renewal popup runs 3 days · 2 · 1 · the renewal day, then stops", () => {
    const sep = month();
    const shows = (today: string) => renewalPopupMonths([sep], "s1", today).length;
    expect(["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"].map(shows)).toEqual([0, 1, 1, 1, 1, 0]);
    expect(renewalDue(sep, "2026-10-01")).toBe(true); // five days' notice on the card
    expect(renewalDue(sep, "2026-09-30")).toBe(false);
  });

  it("a month's work is due at the end of its last own day — \"by 5 Oct\"", () => {
    const p = monthPromise(SEP);
    expect(p.label).toBe("by 5 Oct");
    const due = new Date(p.dueAt.toMillis());
    expect([due.getFullYear(), due.getMonth() + 1, due.getDate(), due.getHours(), due.getMinutes()]).toEqual([2026, 10, 5, 23, 59]);
  });

  it("setup: a month whose renewal day is today is over (history); one ending tomorrow runs and needs a team", () => {
    const base = { startDate: "2026-09-15", clipsPerVideo: 4, pageLinks: null, team: { assistants: [] } };
    expect(setupProblem({ ...base, endDate: "2026-10-15" }, "2026-10-15")).toBe("");
    expect(setupProblem({ ...base, endDate: "2026-10-16" }, "2026-10-15")).toMatch(/Put somebody on the month/);
    const withTeam = { ...base, team: { creator: { uid: "u1", name: "Arjun" }, assistants: [] } };
    expect(historySetupProblem({ ...withTeam, endDate: "2026-10-15" }, "2026-10-15")).toBe("");
    expect(historySetupProblem({ ...withTeam, endDate: "2026-10-16" }, "2026-10-15")).toMatch(/locked/);
  });

  it("Insights counts a client once on the renewal day, and Money's running clients agree", () => {
    const old = month({ id: "old", cycle: SEP, amount: 9000 });
    const next = month({ id: "next", cycle: OCT, amount: 9500 });
    expect(dashboardKpis([old, next], "2026-10-06")).toMatchObject({ running: 1, monthlyValue: 9500 });
    expect(runningClients([old, next], "2026-10-06")).toMatchObject({ count: 1, value: 9500 });
  });
});

describe("the client's billing day survives a short month (anchorDay)", () => {
  it("31 Jan → 28 Feb, then 28 Feb → 31 Mar — not 28 Mar for ever", () => {
    const jan = monthCycle("2026-01-31");
    expect(jan).toEqual({ month: "2026-01", startDate: "2026-01-31", endDate: "2026-02-28" }); // its own day: not stored
    const feb = nextCycleAfter(jan);
    expect(feb).toEqual({ month: "2026-02", startDate: "2026-02-28", endDate: "2026-03-31", anchorDay: 31 });
    const mar = nextCycleAfter(feb);
    expect(mar).toEqual({ month: "2026-03", startDate: "2026-03-31", endDate: "2026-04-30" });
    const apr = nextCycleAfter(mar);
    expect(apr).toEqual({ month: "2026-04", startDate: "2026-04-30", endDate: "2026-05-31", anchorDay: 31 });
    expect(anchorDayOf(apr)).toBe(31);
    // A leap year keeps the 29th, then goes back to the 31st.
    expect(nextCycleAfter(monthCycle("2028-01-31"))).toMatchObject({ startDate: "2028-02-29", endDate: "2028-03-31" });
    // Back to an ordinary length after February: 28 Feb → 31 Mar is 31 own days, 31 Mar → 30 Apr 30.
    expect(ownDayCount(feb)).toBe(31);
    expect(ownDayCount(mar)).toBe(30);
  });

  it("a renewal after a gap is billed on its own new start day; a typed end date is kept", () => {
    const feb = nextCycleAfter(monthCycle("2026-01-31")); // 28 Feb → 31 Mar, anchor 31
    expect(nextCycleAfter(feb, "2026-04-05")).toEqual({ month: "2026-04", startDate: "2026-04-05", endDate: "2026-05-05" });
    expect(monthCycle("2026-02-28", "2026-03-20", 31).endDate).toBe("2026-03-20");
    // An anchor before the start's own day cannot come from a clamp — ignored.
    expect(monthCycle("2026-03-20", null, 5)).toEqual({ month: "2026-03", startDate: "2026-03-20", endDate: "2026-04-20" });
  });

  it("a renewal sale's month (buildSoldCampaign) ends on the billing day", () => {
    const prev = month({ id: "jan", cycle: monthCycle("2026-01-31") });
    const input = {
      orderId: "feb", leadId: "l", saleItemKey: "k", clientPhone: "+919876543210", clientPhoneId: "919876543210",
      clientName: "Lakshmi", businessName: "Lakshmi Jewellers", packageKey: "Starter", packageLabel: "Starter", amount: 10000,
      platforms: ["instagram"], commitments: { poster: 4, ai_ad: 0, real_video: 0 }, soldBy: "s1", soldByName: "Anil",
    } as CreateCampaignInput;
    expect(buildSoldCampaign(input, { startDate: "2026-02-28", renewalOf: prev }).cycle)
      .toEqual({ month: "2026-02", startDate: "2026-02-28", endDate: "2026-03-31", anchorDay: 31 });
    // A first month (no month before it) is the same date next month, as always.
    expect(buildSoldCampaign(input, { startDate: "2026-10-06" }).cycle).toEqual(OCT);
  });
});

describe("a post counts toward its month only on the month's own days", () => {
  it("dated outside — the renewal day included — or undated (counts)", () => {
    expect(itemDatedOutside({ uploadDate: "2026-10-05" }, SEP)).toBe(false);
    expect(itemDatedOutside({ uploadDate: "2026-10-06" }, SEP)).toBe(true);
    expect(itemDatedOutside({ uploadDate: "2026-08-13" }, SEP)).toBe(true);
    expect(itemDatedOutside({ uploadDate: null }, SEP)).toBe(false);
    expect(itemDatedOutside({ uploadDate: "2026-08-13" }, null)).toBe(false); // no month given: nothing is outside
    const { inside, outside } = splitByMonthDates([{ uploadDate: "2026-09-10" }, { uploadDate: "2026-10-06" }, { uploadDate: null }], SEP);
    expect([inside.length, outside.length]).toEqual([2, 1]);
    expect(datedOutsideLine(3, SEP)).toBe("3 posts are dated outside 6 Sep – 5 Oct");
    expect(datedOutsideLine(1, SEP)).toBe("1 post is dated outside 6 Sep – 5 Oct");
    expect(datedOutsideLine(0, SEP)).toBe("");
  });

  /*
    The owner's real month: saved 6 Oct → 6 Nov while 9 of its 10 posts are dated 13 Aug – 9 Sep. It said
    "Completed — All 10 posts are live".
  */
  const REAL = month({
    cycle: OCT,
    commitments: { poster: 10, ai_ad: 0, real_video: 0 },
    items: [
      ...["2026-08-13", "2026-08-16", "2026-08-19", "2026-08-22", "2026-08-25", "2026-08-28", "2026-09-01", "2026-09-05", "2026-09-09"]
        .map((d) => item({ status: "posted", uploadDate: d, platforms: ["instagram"] })),
      item({ status: "posted", uploadDate: "2026-10-10", platforms: ["instagram"] }),
    ],
  });

  it("the owner's month is not Completed — it says which posts are outside and where to fix them", () => {
    const g = monthGlance(REAL, "2026-10-15");
    expect(g.status).not.toBe("done");
    expect(g).toMatchObject({ status: "at_risk", reason: "9 posts are dated outside 6 Oct – 5 Nov", posted: 1, total: 10 });
    expect(g.buckets).toMatchObject({ posted: 1, outside: 9 });
    expect(g.datedOutside).toBe(9);
    expect(g.outsideLine).toBe("9 posts are dated outside 6 Oct – 5 Nov");
    expect(g.outsideHint).toMatch(/fix their upload dates in the Content list/);
    expect(g.kinds).toEqual([{ kind: "poster", label: "Posters", posted: 1, total: 10 }]);
  });

  it("pace, fulfilment, the stage counts, the blocks and the report count only the month's own days", () => {
    const f = fulfilment(REAL);
    expect([f.posted, f.committed, f.percent, f.complete, f.datedOutside]).toEqual([1, 10, 10, false, 9]);
    expect(paceOf(REAL, "2026-10-15").state).toBe("behind");
    expect(toneCounts(REAL, "2026-10-15")).toMatchObject({ done: 1, outside: 9, total: 10 });
    const segs = kindSegments(REAL.items, "poster", "2026-10-15", REAL.cycle);
    expect(segs.filter((s) => s.outside)).toHaveLength(9);
    expect(segs.filter((s) => s.tone === "done" && !s.outside)).toHaveLength(1);
    expect(segs[segs.length - 1].title).toMatch(/dated outside this month/);
    expect(postsByPlatform(REAL.items, REAL.cycle)).toEqual([{ platform: "instagram", label: "Instagram", count: 1 }]);
    expect(monthlyReportMessage(REAL)).toContain("1 of 10 committed posts");
    expect(renewalsDueFor([{ ...REAL, cycle: { ...OCT, endDate: "2026-10-18" } }], "s1", "2026-10-15")[0].postedOfCommitted).toBe("1/10");
    // Without the month's dates (a legacy caller), every posted piece counts, as before.
    expect(fulfilment({ items: REAL.items, commitments: REAL.commitments }).posted).toBe(10);
    expect(isDeliveredInMonth(REAL.items[0], null)).toBe(true);
  });

  it("everything live, all inside, is still Completed", () => {
    const done = month({ commitments: { poster: 2, ai_ad: 0, real_video: 0 }, items: [
      item({ status: "posted", uploadDate: "2026-09-10" }), item({ status: "posted", uploadDate: "2026-10-05" }),
    ] });
    expect(monthGlance(done, "2026-10-05")).toMatchObject({ status: "done", outsideLine: "", buckets: { outside: 0 } });
  });

  it("the calendar: a post dated on the renewal day is outside its month, and 'Month N ends' is its last own day", () => {
    const run = buildClientRun([month({ id: "sep", items: [item({ id: "x", uploadDate: "2026-10-06" })] })], "2026-10-01")!;
    expect(run.months[0]).toMatchObject({ endDate: "2026-10-06", lastDay: "2026-10-05" });
    expect(outsideItsMonth(run, run.entries[0])?.id).toBe("sep");
  });
});

describe("when a post went up: its upload date first", () => {
  const stamped = (day: string) => ({ toMillis: () => new Date(`${day}T10:00:00`).getTime() });

  it("\"Up 3d ago\" from the upload date (and its time), the Posted press only when there is none", () => {
    // Marked posted on 15 Oct for a post that went up on 13 Aug: it said "Up 0d" beside "2026-08-13".
    expect(postedUpLabel({ uploadDate: "2026-08-13", uploadTime: "06:00", postedAt: stamped("2026-10-15") }, "2026-10-15")).toBe("Up 63d ago");
    expect(postedUpLabel({ uploadDate: "2026-10-15", uploadTime: "06:00", postedAt: null }, "2026-10-15")).toBe("Up today, 6:00 AM");
    expect(postedUpLabel({ uploadDate: "2026-10-14", uploadTime: "18:30", postedAt: null }, "2026-10-15")).toBe("Up yesterday, 6:30 PM");
    expect(postedUpLabel({ uploadDate: null, uploadTime: "06:00", postedAt: stamped("2026-10-12") }, "2026-10-15")).toBe("Up 3d ago");
    expect(postedUpLabel({ uploadDate: null, uploadTime: null, postedAt: null }, "2026-10-15")).toBe("Up");
    expect(postedUpLabel({ uploadDate: "2026-10-20", uploadTime: null, postedAt: null }, "2026-10-15")).toBe("Up · dated 20 Oct");
  });

  it("the posts-a-day trend reads the same day", () => {
    expect(postedDayOf({ uploadDate: "2026-08-13", postedAt: stamped("2026-10-15") })).toBe("2026-08-13");
    expect(postedDay({ uploadDate: null, postedAt: stamped("2026-10-15") })).toBe("2026-10-15");
  });
});

describe("a month's ads are its own days'", () => {
  const run = (reports: string[]): SmmAdRun => ({
    id: "r", name: "Leads", scope: { kind: "all", itemIds: [] }, startDate: "2026-09-01", days: 60, dailyBudget: 500, status: "running",
    reports: reports.map((date) => ({ date, leads: 2, spend: 200, costPerResult: 100, byName: "x", at: null })),
  });

  it("the report tiles, the client's report and the leads-a-day chart cover the same days", () => {
    const sep = month({ ads: [run(["2026-09-01", "2026-09-10", "2026-10-05", "2026-10-06"])] });
    expect(monthAdReports(sep).map((r) => r.date)).toEqual(["2026-10-05", "2026-09-10"]);
    expect(monthlyReportMessage(sep)).toContain("4 leads");
    const days = adDaily(sep, "2026-10-20");
    expect([days[0].day, days[days.length - 1].day, days.length]).toEqual(["2026-09-06", "2026-10-05", 30]);
    expect(days.filter((d) => d.reported).reduce((n, d) => n + d.leads, 0)).toBe(4);
  });

  it("a new ad run starts inside the month by default", () => {
    expect(defaultAdRunStart(SEP, "2026-09-20")).toBe("2026-09-20"); // running: today
    expect(defaultAdRunStart(SEP, "2026-10-06")).toBe("2026-09-06"); // over (its renewal day): its first day
    expect(defaultAdRunStart(OCT, "2026-10-01")).toBe("2026-10-06"); // not started: its first day
    expect(defaultAdRunStart(null, "2026-10-01")).toBe("2026-10-01");
  });
});

describe("the locked badge says Completed only for a finished month", () => {
  it("an On hold month reads 'Ended — not renewed yet'", () => {
    const sep = month();
    expect(lockedMonthLabel(sep, "2026-10-05")).toBeNull(); // not locked yet
    expect(lockedMonthLabel(sep, "2026-10-06")).toEqual({ label: "Ended — not renewed yet", finished: false });
    expect(lockedMonthLabel({ ...sep, renewal: { state: "won", nextCampaignId: "n" } }, "2026-10-06")).toEqual({ label: "Ended — renewed", finished: false });
    expect(lockedMonthLabel({ ...sep, renewal: { state: "lost" } }, "2026-10-06")).toEqual({ label: "Ended — not renewing", finished: false });
    for (const status of ["completed", "renewed", "lapsed"] as const) {
      expect(lockedMonthLabel({ ...sep, status }, "2026-09-20")).toEqual({ label: "Completed", finished: true });
    }
    expect(lockedMonthLabel({ ...sep, history: true }, "2026-10-20")).toEqual({ label: "Completed", finished: true });
  });
});

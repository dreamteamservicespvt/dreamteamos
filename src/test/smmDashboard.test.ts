import { describe, expect, it } from "vitest";
import {
  adDaily, adsSummary, byUrgency, compactRupees, dashboardKpis, dashboardMonths, deliverySummary, pacePoints, postedDay,
  relativeDay, renewalRunway, scheduleBetween, scheduleDays, stageBreakdown, teamWorkload,
} from "@/utils/smmDashboard";
import { niceScale } from "@/components/smm/dashboard/chartKit";
import type { SmmCampaign, SmmContentItem } from "@/types/smm";

const TODAY = "2026-10-04";
const NOW = Date.parse("2026-10-04T12:00:00");
const DAY = 86_400_000;

let seq = 0;
const item = (over: Partial<SmmContentItem> = {}): SmmContentItem => ({
  id: `it${(seq += 1)}`,
  kind: "poster",
  title: "Post",
  uploadDate: null,
  uploadTime: "06:00",
  platforms: ["instagram"],
  status: "planned",
  approval: { state: "not_sent", askedAt: null, respondedAt: null, note: null, byName: null, chases: [] },
  extra: false,
  postedAt: null,
  ...over,
});
const posted = (uploadDate: string, postedOn?: string, over: Partial<SmmContentItem> = {}) =>
  item({ status: "posted", uploadDate, postedAt: postedOn ? Date.parse(`${postedOn}T10:00:00`) : null, ...over });

const month = (over: Partial<SmmCampaign>): SmmCampaign => ({
  id: "x", orderId: "x", leadId: "l", saleItemKey: "k", origin: "sale", clientPhone: "+919876543210",
  clientPhoneId: "919876543210", clientName: "Client", businessName: "Business", packageKey: "Starter",
  packageLabel: "Starter", amount: 0, cycle: { month: "2026-09", startDate: "2026-09-01", endDate: "2026-10-01" },
  platforms: ["instagram"], commitments: { poster: 0, ai_ad: 0, real_video: 0 }, items: [], ads: [], budgetPayments: [],
  team: { creator: null, publisher: null, marketer: null, assistants: [] }, soldBy: "s1", soldByName: "Anil",
  watchers: ["s1"], status: "active", renewal: { state: "none" },
  ...over,
});

/*
  A — running (20 Sep → 20 Oct), 6 owed: 2 posted, 1 approved, 1 with the client, 1 late, 1 undated.
  B — running, ends in 2 days, 4 of 4 posted, renewal pitched.
  C — ended 1 Oct with 1 of 2 posted and no decision: overdue renewal, one late piece.
  D — starts 10 Oct, nobody on it, nothing planned yet.
  E (history) and F (completed) are not in play.
*/
function fixture() {
  const A = month({
    id: "A", businessName: "Annapurna Sweets", amount: 10000,
    cycle: { month: "2026-09", startDate: "2026-09-20", endDate: "2026-10-20" },
    commitments: { poster: 4, ai_ad: 2, real_video: 0 },
    team: { creator: { uid: "u1", name: "Arjun" }, publisher: { uid: "u2", name: "Divya" }, marketer: null, assistants: [] },
    items: [
      posted("2026-10-01", "2026-10-01"),
      posted("2026-10-03", "2026-10-03", { kind: "ai_ad" }),
      item({ status: "approved", uploadDate: "2026-10-05", approval: { state: "approved", askedAt: NOW - 5 * DAY, respondedAt: NOW - 4 * DAY } }),
      item({ status: "awaiting_approval", uploadDate: "2026-10-06", kind: "ai_ad", approval: { state: "waiting", askedAt: NOW - 3 * DAY, respondedAt: null } }),
      item({ status: "planned", uploadDate: "2026-10-01", title: "Diwali offer" }),
      item({ status: "planned", uploadDate: null }),
    ],
    ads: [{
      id: "r1", name: "Leads", scope: { kind: "all", itemIds: [] }, startDate: "2026-09-01", days: 40, dailyBudget: 500,
      status: "running",
      reports: [
        { date: "2026-10-02", leads: 5, spend: 500, costPerResult: 100, byName: "x", at: null },
        { date: "2026-10-03", leads: 3, spend: 300, costPerResult: 100, byName: "x", at: null },
        { date: "2026-09-01", leads: 10, spend: 1000, costPerResult: 100, byName: "x", at: null },
      ],
    }],
  });
  const B = month({
    id: "B", businessName: "Bharat Motors", amount: 20000,
    cycle: { month: "2026-09", startDate: "2026-09-06", endDate: "2026-10-06" },
    commitments: { poster: 0, ai_ad: 4, real_video: 0 },
    team: { creator: { uid: "u1", name: "Arjun" }, publisher: null, marketer: null, assistants: [] },
    renewal: { state: "pitched" },
    items: [
      posted("2026-09-25", "2026-09-25", { kind: "ai_ad" }),
      posted("2026-09-25", "2026-09-25", { kind: "ai_ad" }),
      posted("2026-09-15", undefined, { kind: "ai_ad" }),
      posted("2026-09-15", undefined, { kind: "ai_ad" }),
    ],
    ads: [{ id: "r2", name: "Plan", scope: { kind: "all", itemIds: [] }, startDate: "2026-10-10", days: 5, dailyBudget: 300, status: "planned", reports: [] }],
  });
  const C = month({
    id: "C", businessName: "Chandra Textiles", amount: 5000,
    cycle: { month: "2026-09", startDate: "2026-09-01", endDate: "2026-10-01" },
    commitments: { poster: 2, ai_ad: 0, real_video: 0 },
    items: [posted("2026-09-28"), item({ status: "planned", uploadDate: "2026-09-30" })],
  });
  const D = month({
    id: "D", businessName: "Durga Hospital", amount: 8000,
    cycle: { month: "2026-10", startDate: "2026-10-10", endDate: "2026-11-10" },
    commitments: { poster: 2, ai_ad: 0, real_video: 0 },
  });
  const E = month({ id: "E", history: true, commitments: { poster: 2, ai_ad: 0, real_video: 0 } });
  const F = month({ id: "F", status: "completed" });
  return { A, B, C, D, all: dashboardMonths([A, B, C, D, E, F]) };
}

describe("dashboardMonths", () => {
  it("keeps the months still in play — active and not history", () => {
    expect(fixture().all.map((c) => c.id)).toEqual(["A", "B", "C", "D"]);
  });
});

describe("dashboardKpis", () => {
  it("adds up the headline numbers", () => {
    const k = dashboardKpis(fixture().all, TODAY, NOW);
    expect(k).toEqual({
      running: 3, awaitingRenewal: 1, monthlyValue: 38000, dueThisWeek: 2, late: 2, lateMonths: 2,
      waiting: 1, waitDays: 3 + 1, renewalsDue: 2, renewalsValue: 25000, needsSetup: 1,
    });
  });
});

describe("deliverySummary", () => {
  it("measures posts out against posts promised and against each month's own calendar", () => {
    const d = deliverySummary(fixture().all, TODAY);
    expect(d).toMatchObject({
      committed: 14, posted: 7, percent: 50,
      // A floor(6 × 15/31) = 2 · B floor(4 × 29/31) = 3 (finished early, still only its calendar) · C all 2 · D none
      expected: 7, expectedPercent: 50,
      behindBy: 1, monthsBehind: 1, monthsOnTrack: 2, monthsTotal: 4,
    });
  });

  it("draws the last fourteen days of posting, by the day each went live", () => {
    const { trend } = deliverySummary(fixture().all, TODAY);
    expect(trend).toHaveLength(14);
    expect(trend[0].day).toBe("2026-09-21");
    expect(trend[13].day).toBe(TODAY);
    const byDay = Object.fromEntries(trend.filter((t) => t.count).map((t) => [t.day, t.count]));
    // C's piece has no posted stamp — it counts on its planned day.
    expect(byDay).toEqual({ "2026-09-25": 2, "2026-09-28": 1, "2026-10-01": 1, "2026-10-03": 1 });
  });

  it("is empty, not broken, with nothing promised", () => {
    expect(deliverySummary([], TODAY)).toMatchObject({ committed: 0, percent: 0, expectedPercent: 0 });
  });
});

describe("postedDay", () => {
  it("prefers the posted stamp, then the planned day", () => {
    expect(postedDay({ postedAt: { toMillis: () => Date.parse("2026-10-02T09:00:00") }, uploadDate: "2026-10-01" })).toBe("2026-10-02");
    expect(postedDay({ postedAt: null, uploadDate: "2026-10-01" })).toBe("2026-10-01");
    expect(postedDay({ postedAt: null, uploadDate: null })).toBeNull();
  });
});

describe("stageBreakdown", () => {
  it("puts every promised piece in one stage — done first, late last", () => {
    const s = stageBreakdown(fixture().all, TODAY);
    expect(s.slices.map((x) => [x.key, x.count])).toEqual([
      ["done", 7], ["ready", 1], ["wait", 1], ["work", 0], ["idle", 1], ["unplanned", 2], ["late", 2],
    ]);
    expect(s.total).toBe(14);
    expect(s.undated).toBe(1);
    expect(s.slices[0].percent).toBe(50);
  });
});

describe("scheduleDays", () => {
  it("lays out two weeks back and two ahead, each piece on its planned day", () => {
    const days = scheduleDays(fixture().all, TODAY);
    expect(days).toHaveLength(28);
    expect(days[0].day).toBe("2026-09-21");
    expect(days.find((d) => d.isToday)?.day).toBe(TODAY);
    const oct1 = days.find((d) => d.day === "2026-10-01")!;
    expect(oct1.counts).toMatchObject({ done: 1, late: 1 });
    expect(oct1.isPast).toBe(true);
    expect(oct1.items.map((i) => i.title)).toContain("Diwali offer");
    const oct6 = days.find((d) => d.day === "2026-10-06")!;
    expect(oct6.counts.wait).toBe(1);
    // B's pieces planned for 15 Sep fall outside the window.
    expect(days.reduce((n, d) => n + d.total, 0)).toBe(2 + 1 + 1 + 1 + 2 + 2);
  });
});

describe("pacePoints and byUrgency", () => {
  it("places each client by time gone and work out, and names its health", () => {
    const points = pacePoints(fixture().all, TODAY);
    const by = Object.fromEntries(points.map((p) => [p.id, p]));
    expect(by.A).toMatchObject({ health: "bad", late: 1, posted: 2, committed: 6, expected: 2, waiting: 1 });
    expect(by.A.elapsed).toBeCloseTo(15 / 31, 5);
    expect(by.B).toMatchObject({ health: "good", delivered: 1 });
    expect(by.C).toMatchObject({ health: "bad", elapsed: 1, behindBy: 1, timeLabel: "Ended 3 days ago" });
    expect(by.D).toMatchObject({ health: "idle", elapsed: 0, expected: 0 });
  });

  it("puts late work first, then the furthest behind, the healthy last", () => {
    expect(byUrgency(pacePoints(fixture().all, TODAY)).map((p) => p.id)).toEqual(["C", "A", "D", "B"]);
  });
});

describe("renewalRunway", () => {
  it("lists the coming renewal dates with their state and worth", () => {
    const r = renewalRunway(fixture().all, TODAY);
    expect(r.marks.map((m) => [m.id, m.state, m.daysTo])).toEqual([
      ["C", "overdue", -3], ["B", "pitched", 2], ["A", "open", 16],
    ]);
    expect(r.thisWeek).toEqual({ count: 1, amount: 20000 });
    expect(r.upcoming).toEqual({ count: 2, amount: 30000 });
    expect(r.overdue).toEqual({ count: 1, amount: 5000 });
    expect(r.renewed).toEqual({ count: 0, amount: 0 });
  });

  it("counts a linked or won renewal as renewed, and a lost one as lost", () => {
    const { A, B } = fixture();
    const r = renewalRunway([
      { ...A, renewal: { state: "none", nextCampaignId: "A2" } },
      { ...B, renewal: { state: "lost" } },
    ], TODAY);
    expect(r.marks.map((m) => m.state)).toEqual(["lost", "renewed"]);
    expect(r.renewed.amount).toBe(10000);
  });
});

describe("teamWorkload", () => {
  it("gives each piece to whoever makes and posts it, counted once per person", () => {
    const rows = teamWorkload(fixture().all, TODAY);
    expect(rows.map((r) => r.uid)).toEqual(["u1", "u2"]);
    expect(rows[0]).toMatchObject({ name: "Arjun", months: 2, total: 10, posted: 6, inFlight: 1, waiting: 1, notStarted: 1, late: 1, open: 4 });
    expect(rows[1]).toMatchObject({ name: "Divya", months: 1, total: 6, posted: 2, late: 1, open: 4 });
  });

  it("uses a piece's own maker before the month's seat", () => {
    const { A } = fixture();
    const one = { ...A, items: [item({ status: "in_progress", uploadDate: "2026-10-09", makerUid: "u9", makerName: "Sita" })] };
    const rows = teamWorkload([one], TODAY);
    expect(rows.find((r) => r.uid === "u9")).toMatchObject({ name: "Sita", inFlight: 1, months: 0 });
    expect(rows.find((r) => r.uid === "u1")?.total).toBe(0);
  });
});

describe("adsSummary", () => {
  it("adds up the ads and draws the last fourteen days", () => {
    const a = adsSummary(fixture().all, TODAY);
    expect(a).toMatchObject({ leads: 18, spend: 1800, costPerResult: 100, daysReported: 3, runsLive: 1, hasAds: true });
    expect(a.series).toHaveLength(14);
    expect(a.series.find((s) => s.day === "2026-10-02")).toEqual({ day: "2026-10-02", leads: 5, spend: 500 });
    expect(a.byClient).toEqual([{ id: "A", name: "Annapurna Sweets", leads: 18, spend: 1800, costPerResult: 100 }]);
  });

  it("ends the trend yesterday until today's figures are entered — no drop to nothing every morning", () => {
    const a = adsSummary(fixture().all, TODAY);
    expect(a.series[13].day).toBe("2026-10-03");
    const { A } = fixture();
    const withToday = { ...A, ads: [{ ...A.ads[0], reports: [...A.ads[0].reports, { date: TODAY, leads: 2, spend: 200, costPerResult: 100, byName: "x", at: null }] }] };
    expect(adsSummary([withToday], TODAY).series[13]).toEqual({ day: TODAY, leads: 2, spend: 200 });
  });

  it("says there are no ads when no month has a campaign", () => {
    const { C, D } = fixture();
    expect(adsSummary([C, D], TODAY).hasAds).toBe(false);
  });
});

describe("a month's own days", () => {
  it("lays the calendar over the month's dates", () => {
    const { A } = fixture();
    const days = scheduleBetween([A], TODAY, A.cycle.startDate, A.cycle.endDate);
    expect(days).toHaveLength(31);
    expect(days[0].day).toBe("2026-09-20");
    expect(days[30].day).toBe("2026-10-20");
    expect(days.find((d) => d.isToday)?.day).toBe(TODAY);
    expect(days.filter((d) => d.isPast)).toHaveLength(14);
  });

  it("draws the ads day by day up to today, marking the days nobody reported", () => {
    const { A } = fixture();
    const daily = adDaily(A, TODAY);
    expect(daily).toHaveLength(15);
    expect(daily.find((d) => d.day === "2026-10-02")).toEqual({ day: "2026-10-02", leads: 5, spend: 500, reported: true });
    expect(daily.find((d) => d.day === "2026-09-21")).toEqual({ day: "2026-09-21", leads: 0, spend: 0, reported: false });
    expect(adDaily({ ...A, cycle: { month: "2026-11", startDate: "2026-11-01", endDate: "2026-12-01" } }, TODAY)).toEqual([]);
  });
});

describe("niceScale", () => {
  it("keeps small counts on a scale of at least three, and rounds the rest to clean steps", () => {
    expect(niceScale(0)).toEqual({ top: 3, step: 1, ticks: [0, 1, 2, 3] });
    expect(niceScale(1)).toEqual({ top: 3, step: 1, ticks: [0, 1, 2, 3] });
    expect(niceScale(10)).toEqual({ top: 10, step: 5, ticks: [0, 5, 10] });
    expect(niceScale(140).top).toBeGreaterThanOrEqual(140);
  });
});

describe("formatting", () => {
  it("writes rupees the way a tile has room for", () => {
    expect(compactRupees(45000)).toBe("₹45,000");
    expect(compactRupees(100000)).toBe("₹1L");
    expect(compactRupees(125000)).toBe("₹1.3L");
    expect(compactRupees(34000000)).toBe("₹3.4Cr");
    expect(compactRupees(0)).toBe("₹0");
  });

  it("names a day relative to today", () => {
    expect([0, 1, -1, 3, -2].map(relativeDay)).toEqual(["Today", "Tomorrow", "Yesterday", "In 3 days", "2 days ago"]);
  });
});

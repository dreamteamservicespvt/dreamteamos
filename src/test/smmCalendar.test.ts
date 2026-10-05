/**
 * The client calendar's rules (utils/smmCalendar, 2026-10-05, redrawn twice that day): a normal calendar —
 * one calendar month per page across all the client's months — three marks, every post on its UPLOAD date,
 * plain sentences.
 *
 * One client across three months, today Monday 5 Oct 2026: Month 1 (5 Aug → 5 Sep, renewed) with a post
 * marked posted two days after its upload date, one posted with no stamp, one never posted and one never
 * given a day; Month 2 (5 Sep → 5 Oct, last day today) with a late post, one due today and one with no day
 * yet; Month 3 starting today.
 */
import { describe, it, expect } from "vitest";
import {
  buildClientRun, calendarClients, calendarPage, canSeeSmmMonth, clientKeyOf, clientMonthOn, clientMonths, dayMarks,
  entryNote, longDayLabel, monthBounds, monthOf, monthShort, monthTitle, openingDay, openingMonth, outsideItsMonth,
  phaseLabel, rangeLabel, shiftMonth, shortMonthYear, waitingNote, weekGrid, type ClientRun, type CalendarEntry,
} from "@/utils/smmCalendar";
import type { SmmCampaign, SmmContentItem } from "@/types/smm";

const TODAY = "2026-10-05";
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 11, 0).getTime();

const item = (id: string, over: Partial<SmmContentItem> = {}): SmmContentItem => ({
  id, kind: "ai_ad", title: id.toUpperCase(), uploadDate: null, uploadTime: null, platforms: ["instagram"],
  status: "planned", approval: { state: "not_sent", askedAt: null, respondedAt: null, note: null, byName: null, chases: [] },
  extra: false, postedAt: null, ...over,
});
const month = (over: Partial<SmmCampaign> & { id: string }): SmmCampaign => ({
  orderId: over.id, leadId: "l", saleItemKey: "k", origin: "sale", clientPhone: "+919876543210",
  clientPhoneId: "919876543210", clientName: "Lakshmi", businessName: "Lakshmi Jewellers", packageKey: "Starter",
  packageLabel: "Starter", amount: 10000, cycle: { month: "2026-09", startDate: "2026-09-05", endDate: "2026-10-05" },
  platforms: ["instagram"], commitments: { poster: 0, ai_ad: 4, real_video: 0 }, items: [], ads: [], budgetPayments: [],
  team: { creator: { uid: "arjun", name: "Arjun" }, publisher: null, marketer: null, assistants: [] }, soldBy: "anil",
  soldByName: "Anil", watchers: ["anil", "arjun"], status: "active", renewal: { state: "none" }, ...over,
});

const M1 = month({
  id: "m1", monthNumber: 1, status: "renewed", cycle: { month: "2026-08", startDate: "2026-08-05", endDate: "2026-09-05" },
  items: [
    item("p1", { status: "posted", uploadDate: "2026-08-10", postedAt: at(2026, 8, 12) }),
    item("p2", { status: "posted", uploadDate: "2026-08-20" }),
    item("p3", { uploadDate: "2026-08-25" }),
    item("p4"),
  ],
});
const M2 = month({
  id: "m2", monthNumber: 2,
  items: [
    item("p5", { status: "posted", uploadDate: "2026-09-10", postedAt: at(2026, 9, 10) }),
    item("p6", { uploadDate: "2026-10-01", uploadTime: "18:00", status: "awaiting_approval", approval: { state: "waiting" } as SmmContentItem["approval"] }),
    item("p7", { uploadDate: "2026-10-05", uploadTime: "09:00", kind: "poster" }),
    item("p8"),
  ],
});
const M3 = month({
  id: "m3", monthNumber: 3, cycle: { month: "2026-10", startDate: "2026-10-05", endDate: "2026-11-05" },
  items: [item("p10", { uploadDate: "2026-10-20" })],
});

const RUN = buildClientRun([M3, M1, M2], TODAY)!;
const entry = (run: ClientRun, id: string): CalendarEntry => run.entries.find((e) => e.item.id === id)!;
const ids = (list: CalendarEntry[]) => list.map((e) => e.item.id);

describe("days, weeks and month names", () => {
  it("draws whole weeks, Monday first", () => {
    const days = weekGrid("2026-10-01", "2026-10-31"); // a Thursday to a Saturday
    expect(days[0]).toBe("2026-09-28");
    expect(days[days.length - 1]).toBe("2026-11-01");
    expect(days).toHaveLength(35);
    expect(weekGrid("2026-10-05", "2026-10-01")).toEqual([]);
  });

  it("steps and names calendar months, across a year too", () => {
    expect(monthOf("2026-10-05")).toBe("2026-10");
    expect(monthTitle("2026-10")).toBe("October 2026");
    expect(monthShort("2026-09")).toBe("Sep");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-10", -14)).toBe("2025-08");
    expect(monthBounds("2026-02")).toEqual({ first: "2026-02-01", last: "2026-02-28" });
    expect(monthBounds("2028-02").last).toBe("2028-02-29");
  });

  it("names dates the way people say them", () => {
    expect(rangeLabel("2026-09-05", "2026-10-05")).toBe("5 Sep – 5 Oct 2026");
    expect(rangeLabel("2026-12-20", "2027-01-20")).toBe("20 Dec 2026 – 20 Jan 2027");
    expect(shortMonthYear("2026-09-05")).toBe("Sep 2026");
    expect(longDayLabel("2026-10-13")).toBe("Tuesday, 13 October 2026");
  });
});

describe("which months, and whose", () => {
  it("an overseer sees all; a member or salesperson only the months they are on or sold", () => {
    expect(canSeeSmmMonth(M2, { uid: "kiran", role: "tech_admin" })).toBe(true);
    expect(canSeeSmmMonth(M2, { uid: "x", role: "tech_member", smmLeader: true })).toBe(true);
    expect(canSeeSmmMonth(M2, { uid: "arjun", role: "tech_member" })).toBe(true);
    expect(canSeeSmmMonth({ ...M2, watchers: [] }, { uid: "anil", role: "sales_member" })).toBe(true); // sold it
    expect(canSeeSmmMonth(M2, { uid: "divya", role: "tech_member" })).toBe(false);
    expect(canSeeSmmMonth({ ...M2, status: "deleted" }, { uid: "kiran", role: "tech_admin" })).toBe(false);
    expect(canSeeSmmMonth(M2, null)).toBe(false);
  });

  it("knows a client by their number, lists their months first to last, and leaves deleted ones out", () => {
    expect(clientKeyOf(M1)).toBe("919876543210");
    expect(clientKeyOf({ ...M1, clientPhoneId: "" })).toBe("month:m1");
    expect(clientMonths([M3, M1, { ...M2, status: "deleted" }, M2]).map((c) => c.id)).toEqual(["m1", "m2", "m3"]);
  });
});

describe("the client's run", () => {
  it("gathers every month and post, and how far the arrows reach", () => {
    expect(RUN.months.map((m) => `${m.name} ${m.phase}`)).toEqual(["Month 1 ended", "Month 2 running", "Month 3 running"]);
    expect(RUN.entries).toHaveLength(9);
    expect(RUN.first).toBe("2026-08");
    expect(RUN.last).toBe("2026-11");
    expect(buildClientRun([], TODAY)).toBeNull();
    expect(buildClientRun([{ ...M1, status: "deleted" }], TODAY)).toBeNull();
  });

  it("puts every post on its upload date — never on the day Posted was pressed", () => {
    expect(entry(RUN, "p1").day).toBe("2026-08-10"); // marked posted on the 12th
    expect(entry(RUN, "p1").markedDay).toBe("2026-08-12");
    expect(entry(RUN, "p2").day).toBe("2026-08-20"); // posted before the stamp existed
    expect(entry(RUN, "p4").day).toBeNull();
    // Only a posted piece with no upload date falls back to the day it was marked posted.
    const run = buildClientRun([{ ...M2, items: [item("q", { status: "posted", postedAt: at(2026, 9, 20) })] }], TODAY)!;
    expect(entry(run, "q").day).toBe("2026-09-20");
  });

  it("the owner's month (2026-10-05): nine posts marked posted together today stay on their own days", () => {
    const dhana = month({
      id: "dl", monthNumber: 1, cycle: { month: "2026-09", startDate: "2026-09-06", endDate: "2026-10-06" },
      items: ["2026-08-04", "2026-08-15", "2026-09-02", "2026-09-20"].map((d, i) =>
        item(`d${i}`, { status: "posted", uploadDate: d, uploadTime: "06:00", postedAt: at(2026, 10, 5) })),
    });
    const run = buildClientRun([dhana], TODAY)!;
    expect(run.entries.map((e) => e.day)).toEqual(["2026-08-04", "2026-08-15", "2026-09-02", "2026-09-20"]);
    expect(calendarPage(run, "2026-10").byDay.has(TODAY)).toBe(false); // nothing piles onto today
    // Dates typed a month early (before the month's start) are still reached, counted and named.
    expect(run.first).toBe("2026-08");
    const aug = calendarPage(run, "2026-08");
    expect(aug.counts).toEqual({ posted: 2, notPosted: 0, coming: 0 });
    expect(aug.months.map((m) => m.id)).toEqual(["dl"]);
    expect(aug.markers.size).toBe(0);
    expect(outsideItsMonth(run, entry(run, "d0"))?.name).toBe("Month 1");
    expect(outsideItsMonth(run, entry(run, "d3"))).toBeNull();
  });

  it("narrows to one kind, and leaves a history month's blank plan out", () => {
    const posters = buildClientRun([M2], TODAY, "poster")!;
    expect(ids(posters.entries)).toEqual(["p7"]);
    const hist = month({
      id: "h", history: true, status: "completed", cycle: { month: "2026-06", startDate: "2026-06-01", endDate: "2026-07-01" },
      items: [item("blank"), item("old", { status: "posted", uploadDate: "2026-06-10" })],
    });
    const run = buildClientRun([hist], TODAY)!;
    expect(ids(run.entries)).toEqual(["old"]);
    expect(phaseLabel(run.months[0], TODAY)).toBe("Added after it ended");
  });

  it("knows which month a day is in — the new one on a handover day", () => {
    expect(clientMonthOn(RUN.months, "2026-08-04")).toBeNull();
    expect(clientMonthOn(RUN.months, "2026-08-20")?.id).toBe("m1");
    expect(clientMonthOn(RUN.months, "2026-09-05")?.id).toBe("m2");
    expect(clientMonthOn(RUN.months, TODAY)?.id).toBe("m3");
    expect(clientMonthOn(RUN.months, "2026-11-06")).toBeNull();
  });
});

describe("one calendar month, laid out", () => {
  it("October: the posts on its days, the client's months in it, where they start and end", () => {
    const oct = calendarPage(RUN, "2026-10");
    expect(oct.title).toBe("October 2026");
    expect(oct.days[0]).toBe("2026-09-28");
    expect(oct.days).toHaveLength(35);
    expect(oct.counts).toEqual({ posted: 0, notPosted: 1, coming: 2 }); // p6 late; p7, p10 to come
    expect(entry(RUN, "p6").state).toBe("late");
    expect(dayMarks(oct.byDay.get(TODAY)!)).toEqual([{ mark: "coming", count: 1 }]);
    expect(oct.byDay.has("2026-09-28")).toBe(false); // a day of September is drawn empty
    expect(oct.months.map((m) => m.id)).toEqual(["m2", "m3"]);
    expect(ids(oct.undated)).toEqual(["p8"]); // Month 1's undated post is not October's
    expect(oct.markers.get(TODAY)!.map((m) => `${m.kind} ${m.month.id}`)).toEqual(["end m2", "start m3"]);
    expect(oct.markers.has("2026-11-05")).toBe(false); // November's page says that
  });

  it("September holds two months; August is a finished one", () => {
    const sep = calendarPage(RUN, "2026-09");
    expect(sep.counts).toEqual({ posted: 1, notPosted: 0, coming: 0 });
    expect(sep.months.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(ids(sep.undated)).toEqual(["p4", "p8"]);
    const aug = calendarPage(RUN, "2026-08");
    expect(aug.counts).toEqual({ posted: 2, notPosted: 1, coming: 0 });
    expect(aug.byDay.get("2026-08-25")![0].mark).toBe("notPosted");
    expect(aug.markers.get("2026-08-05")!.map((m) => m.kind)).toEqual(["start"]);
  });

  it("orders a day's posts by time, then name", () => {
    const run = buildClientRun([{ ...M2, items: [
      item("b", { uploadDate: "2026-10-10", uploadTime: "18:00" }),
      item("a", { uploadDate: "2026-10-10" }),
      item("c", { uploadDate: "2026-10-10", uploadTime: "09:00" }),
    ] }], TODAY)!;
    expect(ids(calendarPage(run, "2026-10").byDay.get("2026-10-10")!)).toEqual(["c", "b", "a"]);
  });
});

describe("where it opens", () => {
  it("on today's page while the month it is about runs, else the page holding the middle of it", () => {
    expect(openingMonth(RUN, TODAY, "m2")).toBe("2026-10"); // Month 2's last day is today
    expect(openingMonth(RUN, TODAY, "m1")).toBe("2026-08"); // 5 Aug – 5 Sep: its middle is 20 Aug
    expect(openingMonth(RUN, TODAY)).toBe("2026-10"); // the month running today
    expect(openingMonth(buildClientRun([M1], TODAY)!, TODAY)).toBe("2026-08"); // the latest, finished
    expect(openingMonth(buildClientRun([M3], "2026-09-20")!, "2026-09-20")).toBe("2026-10"); // still to start
  });

  it("picks today when it is part of the page, else the first day with posts, else the month's first day", () => {
    expect(openingDay(RUN, calendarPage(RUN, "2026-10"), TODAY)).toBe(TODAY);
    expect(openingDay(RUN, calendarPage(RUN, "2026-08"), TODAY)).toBe("2026-08-10");
    const empty = buildClientRun([{ ...M1, items: [] }], TODAY)!;
    expect(openingDay(empty, calendarPage(empty, "2026-08"), TODAY)).toBe("2026-08-05");
    expect(openingDay(empty, calendarPage(empty, "2026-09"), "2026-09-20")).toBe("2026-09-01"); // the 20th is after it
  });

  it("says where a month is in two words", () => {
    expect(phaseLabel(RUN.months[1], TODAY)).toBe("Running now");
    expect(phaseLabel(RUN.months[0], TODAY)).toBe("Finished");
    const early = buildClientRun([M3], "2026-10-02")!;
    expect(phaseLabel(early.months[0], "2026-10-02")).toBe("Starts in 3 days");
  });
});

describe("a post in plain words", () => {
  it("says what happened and when — by its upload date", () => {
    expect(entryNote(entry(RUN, "p1"), TODAY)).toBe("Posted on 10 Aug");
    expect(entryNote(entry(RUN, "p5"), TODAY)).toBe("Posted on 10 Sep");
    expect(entryNote(entry(RUN, "p2"), TODAY)).toBe("Posted on 20 Aug");
    expect(entryNote(entry(RUN, "p3"), TODAY)).toBe("Not posted — it was due on 25 Aug");
    expect(entryNote(entry(RUN, "p4"), TODAY)).toBe("Not posted — no date was given");
    expect(entryNote(entry(RUN, "p6"), TODAY)).toBe("Not posted — it was due on 1 Oct");
    expect(entryNote(entry(RUN, "p7"), TODAY)).toBe("To be posted today");
    expect(entryNote(entry(RUN, "p10"), TODAY)).toBe("To be posted on 20 Oct");
    expect(entryNote(entry(RUN, "p8"), TODAY)).toBe("No date given yet");
    const run = buildClientRun([{ ...M2, items: [
      item("marked", { status: "posted", postedAt: at(2026, 9, 20) }),
      item("bare", { status: "posted" }),
    ] }], TODAY)!;
    expect(entryNote(entry(run, "marked"), TODAY)).toBe("Marked posted on 20 Sep — no upload date was given");
    expect(entryNote(entry(run, "bare"), TODAY)).toBe("Posted — no date was given");
  });

  it("says what a post still to go up is waiting for", () => {
    expect(waitingNote(entry(RUN, "p6").item)).toBe("Waiting for the client's approval");
    expect(waitingNote(item("x", { approval: { state: "changes" } as SmmContentItem["approval"] }))).toBe("The client asked for changes");
    expect(waitingNote(item("x", { status: "in_progress" }))).toBe("Being made");
    expect(waitingNote(item("x", { status: "scheduled", approval: { state: "approved" } as SmmContentItem["approval"] }))).toBe("Approved by the client — ready to post");
    expect(waitingNote(entry(RUN, "p5").item)).toBeNull();
  });
});

describe("the clients to pick from", () => {
  it("one per client, A to Z, on the month they are in now", () => {
    const other = month({ id: "z", clientPhoneId: "911111111111", businessName: "Annapurna Sweets", status: "completed", cycle: { month: "2026-07", startDate: "2026-07-01", endDate: "2026-08-01" } });
    const list = calendarClients([M3, M1, M2, other, { ...M2, id: "gone", status: "deleted" }]);
    expect(list.map((c) => c.name)).toEqual(["Annapurna Sweets", "Lakshmi Jewellers"]);
    expect(list[1].months).toBe(3);
    expect(list[1].running).toBe(true);
    expect(list[1].current.id).toBe("m3");
    expect(list[0].running).toBe(false);
  });
});

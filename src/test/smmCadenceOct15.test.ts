/**
 * SMM Delivery Control, phase 1 — the weekly rules (`utils/smmCadence`), table-driven, with the owner's own
 * examples (2026-10-15): 4+4 → 1+1 a week; 6+6 → 2+2 in weeks 1 and 4, 1+1 in weeks 2 and 3; 8+8 → 2+2 a week;
 * and the plan's worked week: Week 2, 22–28 Oct, deadline Wed 28 Oct — video sent by Sat 24 (Sunday skipped),
 * poster by Mon 26, approved by Tue 27, live by Wed 28, 7 PM.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  addDaysIso, crowdedWeeks, istDay, istHour, istMoment, isWorkingDay, monthExclusion, monthWeeks, moveCheck, onTimeSummary,
  planMonth, splitAcrossWeeks, taskCheckpoints, taskProgress, toMs, weekdayOf, weekTargets, workingDaysAfter, workingDaysBefore,
  type SmmDeliveryMonth,
} from "@/utils/smmCadence";
import { DEFAULT_SMM_DELIVERY } from "@/utils/smmDeliverySettings";
import { excludedReason } from "@/utils/smmDeliveryHealth";
import { isOnHold } from "@/utils/smmPackage";
import { month, piece } from "./smmDeliveryFixtures";

const S = DEFAULT_SMM_DELIVERY;

const CTX = { today: "2026-10-15", holidays: new Set<string>() };

describe("alias-free — the server checker (api/) reuses these rules", () => {
  it.each(["smmCadence.ts", "smmMonitor.ts"])("%s has no @/ import", (file) => {
    const src = readFileSync(resolve(__dirname, "../utils", file), "utf8");
    expect(src).not.toMatch(/from\s+["']@\//);
    expect(src).not.toMatch(/import\(["']@\//);
    // …and only relative imports of alias-free files. The two runtime ones carry `.js` (phase 6: the server loads
    // them as Node ESM, which needs the extension — `smmServerCheckerOct15` checks every file the server loads).
    for (const m of src.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
      expect(["../types/smm", "../types/smmDelivery", "./smmDeliverySettings.js", "./smmCadence.js"]).toContain(m[1]);
    }
  });
});

describe("India time and working days", () => {
  it("days are dates, whatever the device's zone; times are India time", () => {
    expect(weekdayOf("2026-10-15")).toBe(4); // Thursday
    expect(weekdayOf("2026-10-28")).toBe(3); // Wednesday
    expect(istMoment("2026-10-28", 19)).toBe(Date.UTC(2026, 9, 28, 13, 30));
    expect(istDay(Date.UTC(2026, 9, 15, 18, 31))).toBe("2026-10-16"); // 00:01 IST the next day
    expect(istHour(Date.UTC(2026, 9, 15, 3, 30))).toBe(9);
    expect(addDaysIso("2026-02-28", 1)).toBe("2026-03-01");
  });

  it.each([
    ["Sunday", "2026-10-18", null, false],
    ["Saturday", "2026-10-17", null, true],
    ["a holiday", "2026-10-20", new Set(["2026-10-20"]), false],
    ["holidays unknown → Sundays only", "2026-10-20", null, true],
  ])("%s", (_l, day, hol, want) => expect(isWorkingDay(day as string, hol as Set<string> | null)).toBe(want));

  it("counts working days back and forward, skipping Sundays and holidays", () => {
    expect(workingDaysBefore("2026-10-28", 3, null)).toBe("2026-10-24"); // Tue, Mon, (Sun), Sat
    expect(workingDaysBefore("2026-10-28", 0, null)).toBe("2026-10-28");
    expect(workingDaysBefore("2026-10-28", 1, new Set(["2026-10-27"]))).toBe("2026-10-26");
    expect(workingDaysAfter("2026-10-24", "2026-10-26", null)).toBe(1); // Sunday not counted
  });

  it("reads every stored time", () => {
    expect(toMs(5)).toBe(5);
    expect(toMs({ toMillis: () => 7 })).toBe(7);
    expect(toMs({ seconds: 2, nanoseconds: 5e6 })).toBe(2005);
    expect(toMs("nope")).toBeNull();
    expect(toMs(undefined)).toBeNull();
  });
});

describe("how many a week — owner's decision 1", () => {
  it.each([
    [0, [0, 0, 0, 0]], [1, [1, 0, 0, 0]], [2, [1, 0, 0, 1]], [3, [1, 1, 0, 1]], [4, [1, 1, 1, 1]], [5, [2, 1, 1, 1]],
    [6, [2, 1, 1, 2]], [7, [2, 2, 1, 2]], [8, [2, 2, 2, 2]], [10, [3, 2, 2, 3]], [12, [3, 3, 3, 3]],
  ])("%i → %j", (n, want) => expect(splitAcrossWeeks(n)).toEqual(want));

  it.each([
    ["Starter 4 + 4 → 1 + 1 every week", 4, [1, 1, 1, 1]],
    ["Plus 6 + 6 → 2 + 2 in weeks 1 and 4, 1 + 1 in weeks 2 and 3", 6, [2, 1, 1, 2]],
    ["Pro 8 + 8 → 2 + 2 every week", 8, [2, 2, 2, 2]],
  ])("owner's example: %s", (_l, n, want) => {
    const t = weekTargets({ ai_ad: n as number, poster: n as number, real_video: 0 }, { firstMonth: false });
    expect(t.ai_ad).toEqual(want);
    expect(t.poster).toEqual(want);
  });

  it("a first month never puts a real video in week 1; a renewal does", () => {
    expect(weekTargets({ real_video: 2 }, { firstMonth: true }).real_video).toEqual([0, 1, 0, 1]);
    expect(weekTargets({ real_video: 2 }, { firstMonth: false }).real_video).toEqual([1, 0, 0, 1]);
    expect(weekTargets({ real_video: 5 }, { firstMonth: true }).real_video).toEqual([0, 3, 1, 1]);
  });
});

describe("the weeks of a client's month", () => {
  it("15 Oct → 15 Nov: weeks of 7, 7, 7 and 10 days, each with its last working day at 7 PM", () => {
    const w = monthWeeks({ startDate: "2026-10-15", endDate: "2026-11-15" }, { holidays: null, deadlineHour: 19 })!;
    expect(w.map((x) => [x.start, x.end, x.days, x.deadlineDay])).toEqual([
      ["2026-10-15", "2026-10-21", 7, "2026-10-21"],
      ["2026-10-22", "2026-10-28", 7, "2026-10-28"],
      ["2026-10-29", "2026-11-04", 7, "2026-11-04"],
      ["2026-11-05", "2026-11-14", 10, "2026-11-14"], // the end date (15 Nov) is the renewal day — not in this month
    ]);
    expect(w[1].deadlineAt).toBe(istMoment("2026-10-28", 19));
  });

  it("a month from 31 Jan ends 28 Feb; week 4 is 21 → 27 Feb", () => {
    const w = monthWeeks({ startDate: "2027-01-31", endDate: "2027-02-28" }, { holidays: null, deadlineHour: 19 })!;
    expect([w[3].start, w[3].end, w[3].days]).toEqual(["2027-02-21", "2027-02-27", 7]);
    expect(w[3].deadlineDay).toBe("2027-02-27"); // a Saturday
  });

  it("a deadline on a Sunday or a holiday steps back", () => {
    const w = monthWeeks({ startDate: "2026-10-19", endDate: "2026-11-19" }, { holidays: new Set(["2026-10-24"]), deadlineHour: 19 })!;
    expect(w[0].end).toBe("2026-10-25"); // Sunday
    expect(w[0].deadlineDay).toBe("2026-10-23"); // Sat 24 is a holiday → Fri 23
    const sundaysOnly = monthWeeks({ startDate: "2026-10-19", endDate: "2026-11-19" }, { holidays: null, deadlineHour: 19 })!;
    expect(sundaysOnly[0].deadlineDay).toBe("2026-10-24");
  });

  it("the deadline hour comes from the settings", () => {
    const w = monthWeeks({ startDate: "2026-10-15", endDate: "2026-11-15" }, { holidays: null, deadlineHour: 18 })!;
    expect(w[0].deadlineAt).toBe(istMoment("2026-10-21", 18));
  });

  it.each([
    ["broken dates", { startDate: "2026-10-15", endDate: "x" }],
    ["end before start", { startDate: "2026-10-15", endDate: "2026-10-01" }],
    ["shorter than 22 days", { startDate: "2026-10-01", endDate: "2026-10-20" }],
  ])("%s → no weeks", (_l, cycle) => expect(monthWeeks(cycle, { holidays: null, deadlineHour: 19 })).toBeNull());
});

describe("checkpoints — the plan's worked example (Week 2, 22–28 Oct, deadline Wed 28 Oct)", () => {
  const deadlineAt = istMoment("2026-10-28", 19);
  const cps = (item: Record<string, unknown>, clips = 4, holidays: Set<string> | null = null, floorDay = "2026-10-22") =>
    taskCheckpoints({ item: item as never, deadlineDay: "2026-10-28", deadlineAt, floorDay, monthClips: clips, holidays, settings: S });
  const days = (r: ReturnType<typeof cps>) => Object.fromEntries(r.checkpoints.map((c) => [c.step, c.day]));

  it("video sent by Sat 24 (Sunday skipped), approved by Tue 27, live by Wed 28, 7 PM", () => {
    const r = cps({ kind: "ai_ad", extra: false });
    expect(days(r)).toEqual({ send: "2026-10-24", approved: "2026-10-27", live: "2026-10-28" });
    expect(r.checkpoints.at(-1)!.at).toBe(deadlineAt);
    expect(r.checkpoints[0].at).toBe(istMoment("2026-10-24", 19));
    expect(r.compressed).toBe(false);
  });
  it("poster sent by Mon 26", () => expect(days(cps({ kind: "poster", extra: false })).send).toBe("2026-10-26"));
  it("a long video (6 clips) one more day — Fri 23", () => expect(days(cps({ kind: "ai_ad", extra: false }, 6)).send).toBe("2026-10-23"));
  it("a real video: footage by Fri 23 (−4), sent by Mon 26 (−2)", () => {
    expect(days(cps({ kind: "real_video", extra: false }))).toEqual({ footage: "2026-10-23", send: "2026-10-26", approved: "2026-10-27", live: "2026-10-28" });
  });
  it("an extra 48-second video counts as a long video; an extra poster as a poster", () => {
    expect(days(cps({ kind: "ai_ad", extra: true, extraType: "promotional", extraDuration: "48s" })).send).toBe("2026-10-23");
    expect(days(cps({ kind: "poster", extra: true, extraType: "poster" })).send).toBe("2026-10-26");
  });
  it("a checkpoint never falls before the week's first working day — it is pulled up and marked compressed", () => {
    const r = cps({ kind: "ai_ad", extra: false }, 4, new Set(["2026-10-23", "2026-10-24", "2026-10-26"]), "2026-10-22");
    expect(days(r).send).toBe("2026-10-22");
    expect(r.compressed).toBe(true);
  });
  it("the checkpoint days come from the settings", () => {
    const r = taskCheckpoints({ item: { kind: "ai_ad", extra: false } as never, deadlineDay: "2026-10-28", deadlineAt, floorDay: "2026-10-22", monthClips: 4, holidays: null,
      settings: { ...S, checkpoints: { ...S.checkpoints, sendVideo: 4 } } });
    expect(r.checkpoints[0].day).toBe("2026-10-23");
  });
});

describe("the month's plan", () => {
  const weeksOf = (m: SmmDeliveryMonth) => Object.fromEntries(planMonth(m, CTX).tasks.map((t) => [t.itemId, t.week]));

  it("4 undated videos → one a week, each with its week's deadline", () => {
    const items = [piece({ id: "a" }), piece({ id: "b" }), piece({ id: "c" }), piece({ id: "d" })];
    const plan = planMonth(month({ items }), CTX);
    expect(plan.tasks.map((t) => t.week)).toEqual([1, 2, 3, 4]);
    expect(plan.tasks.map((t) => t.deadlineDay)).toEqual(["2026-10-21", "2026-10-28", "2026-11-04", "2026-11-14"]);
    expect(plan.tasks.every((t) => t.source === "auto" && t.counted)).toBe(true);
  });

  it("6 posters → 2, 1, 1, 2", () => {
    const items = Array.from({ length: 6 }, (_, i) => piece({ id: `q${i}`, kind: "poster" }));
    const plan = planMonth(month({ items, commitments: { ai_ad: 0, poster: 6, real_video: 0 } }), CTX);
    expect(plan.tasks.map((t) => t.week)).toEqual([1, 1, 2, 3, 4, 4]);
  });

  it("a hand-typed date is kept: the piece takes its date's week, the others fill around it", () => {
    const items = [piece({ id: "a" }), piece({ id: "b", uploadDate: "2026-10-30" }), piece({ id: "c" }), piece({ id: "d" })];
    expect(weeksOf(month({ items }))).toEqual({ a: 1, b: 3, c: 2, d: 4 });
    expect(planMonth(month({ items }), CTX).tasks.find((t) => t.itemId === "b")!.source).toBe("date");
  });

  it("pieces carried from last month go first, in week 1", () => {
    const carried = { campaignId: "m0", label: "September" };
    const items = [piece({ id: "a" }), piece({ id: "b", carriedFrom: carried }), piece({ id: "c", carriedFrom: carried }), piece({ id: "d" })];
    expect(weeksOf(month({ items }))).toEqual({ b: 1, c: 1, a: 3, d: 4 });
  });

  it("a saved plan wins over the team's date (moving the date never escapes the week)", () => {
    const items = [piece({ id: "a", plan: { week: 2, by: "auto" }, uploadDate: "2026-10-30" }), piece({ id: "b" }), piece({ id: "c" }), piece({ id: "d" })];
    const t = planMonth(month({ items }), CTX).tasks.find((x) => x.itemId === "a")!;
    expect([t.week, t.source, t.deadlineDay]).toEqual([2, "plan", "2026-10-28"]);
  });

  it("rows beyond the promise are not counted (the untouched ones first); promised pieces with no row are listed", () => {
    const extraRows = [piece({ id: "a", title: "Diwali" }), piece({ id: "b" }), piece({ id: "c", title: "x" }), piece({ id: "d", title: "y" }), piece({ id: "e", title: "z" })];
    const plan = planMonth(month({ items: extraRows }), CTX);
    expect(plan.uncounted).toEqual(["b"]);
    expect(plan.tasks.find((t) => t.itemId === "b")!.counted).toBe(false);
    const short = planMonth(month({ items: [piece({ id: "a" }), piece({ id: "b" }), piece({ id: "c" })] }), CTX);
    expect(short.missing).toEqual([{ week: 4, kind: "ai_ad", count: 1 }]);
  });

  it("extra work keeps its own needed-by date, outside the count; with no date it has no deadline", () => {
    const items = [piece({ id: "x", extra: true, kind: "ai_ad", extraType: "wishes", uploadDate: "2026-10-23" }), piece({ id: "y", extra: true, kind: "poster" })];
    const plan = planMonth(month({ items, commitments: { ai_ad: 0, poster: 0, real_video: 0 } }), CTX);
    const x = plan.tasks.find((t) => t.itemId === "x")!;
    expect([x.type, x.fixed, x.counted, x.week, x.deadlineDay, x.deadlineAt]).toEqual(["extra", "extra", false, 2, "2026-10-23", istMoment("2026-10-23", 19)]);
    expect(plan.tasks.find((t) => t.itemId === "y")!.deadlineAt).toBeNull();
    expect(plan.problem).toBe("nothing_promised");
  });

  it("a festival post is due on the festival morning, even a Sunday; it is approved the working day before", () => {
    const items = [piece({ id: "f", plan: { week: 4, fixedDate: "2026-11-08", fixedReason: "festival", by: "auto" } }), piece(), piece(), piece()];
    const t = planMonth(month({ items }), CTX).tasks.find((x) => x.itemId === "f")!;
    expect(weekdayOf("2026-11-08")).toBe(0);
    expect([t.fixed, t.week, t.deadlineDay, t.deadlineAt]).toEqual(["festival", 4, "2026-11-08", istMoment("2026-11-08", 6)]);
    expect(t.checkpoints.find((c) => c.step === "approved")!.day).toBe("2026-11-07");
  });

  it("a client's first month: no post before day 4, week 1 keeps its full count (2 a day as a last resort)", () => {
    const items = [...Array.from({ length: 8 }, (_, i) => piece({ id: `v${i}` })), ...Array.from({ length: 8 }, (_, i) => piece({ id: `q${i}`, kind: "poster" }))];
    const plan = planMonth(month({ items, renewalOf: null, monthNumber: 1, commitments: { ai_ad: 8, poster: 8, real_video: 0 } }), CTX);
    expect(plan.firstMonth).toBe(true);
    expect(plan.firstPostDay).toBe("2026-10-18");
    const w1 = plan.tasks.filter((t) => t.week === 1);
    expect(w1).toHaveLength(4);
    for (const t of w1) {
      expect(t.suggestedDate! >= "2026-10-19").toBe(true); // 18 Oct is a Sunday
      expect(t.suggestedDate! <= "2026-10-21").toBe(true);
    }
    expect(plan.bunched).toEqual([]);
    expect(crowdedWeeks(plan)).toEqual([]);
  });

  it("suggested days spread over Mon–Sat; never on a Sunday or past the deadline; bunched days are flagged", () => {
    const items = Array.from({ length: 8 }, (_, i) => piece({ id: `v${i}` }));
    const plan = planMonth(month({ items, commitments: { ai_ad: 8, poster: 0, real_video: 0 } }), CTX);
    for (const t of plan.tasks) {
      expect(weekdayOf(t.suggestedDate!)).not.toBe(0);
      expect(t.suggestedDate! <= t.deadlineDay!).toBe(true);
    }
    expect(new Set(plan.tasks.filter((t) => t.week === 1).map((t) => t.suggestedDate)).size).toBe(2);
    const bunched = [1, 2, 3].map((i) => piece({ id: `b${i}`, uploadDate: "2026-10-16" }));
    expect(planMonth(month({ items: [...bunched, piece()] }), CTX).bunched).toEqual([{ day: "2026-10-16", count: 3 }]);
  });

  it("owners come from the piece, else the month's seats", () => {
    const t = planMonth(month({ items: [piece({ id: "a", publisherUid: "kiran", publisherName: "Kiran" })] }), CTX).tasks[0];
    expect([t.makerUid, t.makerName, t.publisherUid, t.publisherName]).toEqual(["ravi", "Ravi", "kiran", "Kiran"]);
  });

  it("never writes: the month is unchanged and planning twice gives the same plan", () => {
    const m = month({ items: [piece({ id: "a" }), piece({ id: "b" })] });
    const before = JSON.stringify(m);
    const one = planMonth(m, CTX);
    expect(JSON.stringify(m)).toBe(before);
    expect(planMonth(m, CTX)).toEqual(one);
    expect(m.items.every((i) => i.uploadDate === null)).toBe(true);
  });

  it.each([
    ["broken dates", { cycle: { month: "2026-10", startDate: "bad", endDate: "2026-11-15" } }, "bad_dates"],
    ["too short", { cycle: { month: "2026-10", startDate: "2026-10-15", endDate: "2026-11-01" } }, "too_short"],
  ])("%s → a problem, no tasks", (_l, over, problem) => {
    const plan = planMonth(month({ ...over, items: [piece()] }), CTX);
    expect([plan.problem, plan.tasks.length]).toEqual([problem, 0]);
  });

  it("a week that cannot fit (more than 2 a day) is crowded", () => {
    const items = Array.from({ length: 60 }, (_, i) => piece({ id: `v${i}` }));
    const plan = planMonth(month({ items, commitments: { ai_ad: 60, poster: 0, real_video: 0 } }), CTX);
    expect(crowdedWeeks(plan).map((c) => c.week)).toContain(1);
  });
});

describe("where a piece has got to, and who a late piece counts against", () => {
  const W1_DEADLINE = istMoment("2026-10-21", 19);
  const at = (day: string, h: number, m = 0) => istMoment(day, h, m);
  const prog = (over: Record<string, unknown>, now: number, kind = "ai_ad") => {
    const it = piece({ id: "a", kind, ...over });
    const others = [piece(), piece(), piece()].map((p) => ({ ...p, kind }));
    const m = month({ items: [it, ...others], commitments: { ai_ad: kind === "ai_ad" ? 4 : 0, poster: 0, real_video: kind === "real_video" ? 4 : 0 } });
    const t = planMonth(m, CTX).tasks.find((x) => x.itemId === "a")!;
    return taskProgress(t, it as never, now);
  };

  it.each([
    ["before its week → not due", {}, at("2026-10-14", 12), "not_due", null],
    ["inside its week → on track, next: make (maker)", {}, at("2026-10-16", 12), "on_track", null],
    ["not sent by Sat 17 → checkpoint missed, the team's", {}, at("2026-10-19", 12), "checkpoint_missed", "team"],
    ["deadline day → due today", {}, at("2026-10-21", 12), "due_today", "team"],
    ["past the deadline → late", {}, at("2026-10-22", 10), "late", "team"],
  ])("%s", (_l, over, now, state, blame) => {
    const p = prog(over, now);
    expect(p.state).toBe(state);
    expect(p.blame).toBe(blame);
  });

  it("sent on time, the client approved late → the client's", () => {
    const p = prog({ status: "approved", madeAt: at("2026-10-16", 12), approval: { state: "approved", askedAt: at("2026-10-16", 12), respondedAt: at("2026-10-21", 9), chases: [] } }, at("2026-10-22", 10));
    expect([p.state, p.firstMissed, p.blame, p.step, p.stepOwner]).toEqual(["late", "approved", "client", "post", "publisher"]);
  });

  it("approved on time, posted after the deadline → the publisher's", () => {
    // Its saved plan keeps it in week 1 — without one, its 22 Oct date would put it in week 2 (the team's date is kept).
    const p = prog({ plan: { week: 1, by: "auto" }, status: "posted", madeAt: at("2026-10-16", 12), uploadDate: "2026-10-22", uploadTime: "06:00",
      approval: { state: "approved", askedAt: at("2026-10-16", 12), respondedAt: at("2026-10-19", 12), chases: [] } }, at("2026-10-23", 10));
    expect([p.state, p.onTime, p.blame]).toEqual(["done", false, "publisher"]);
  });

  it("live by the deadline (upload date + time) → on time, nobody to blame", () => {
    const p = prog({ status: "posted", uploadDate: "2026-10-21", uploadTime: "06:00", approval: { state: "approved", chases: [] } }, at("2026-10-25", 10));
    expect([p.state, p.onTime, p.blame, p.liveAt]).toEqual(["done", true, null, at("2026-10-21", 6)]);
  });

  it("posted with no upload date → judged by when Posted was pressed", () => {
    const p = prog({ status: "posted", postedAt: W1_DEADLINE + 3_600_000, approval: { state: "approved", chases: [] } }, at("2026-10-25", 10));
    expect(p.onTime).toBe(false);
  });

  it("waiting on the client is the salesperson's step", () => {
    const p = prog({ status: "awaiting_approval", madeAt: at("2026-10-16", 12), approval: { state: "waiting", askedAt: at("2026-10-16", 12), chases: [] } }, at("2026-10-19", 10));
    expect([p.step, p.stepOwner, p.waitingOnClient]).toEqual(["approve", "salesperson", true]);
  });

  it("a real video: footage first (the salesperson's); the client never sending it is pending, never the team's", () => {
    expect(prog({}, at("2026-10-16", 10), "real_video").step).toBe("footage");
    const late = prog({}, at("2026-10-17", 10), "real_video"); // footage due Fri 16, 7 PM (−4 working days from Wed 21)
    expect([late.firstMissed, late.blame]).toEqual(["footage", "client"]);
    expect(prog({ footage: { state: "pending_client" } }, at("2026-10-23", 10), "real_video").state).toBe("pending_client");
    expect(prog({ status: "in_progress" }, at("2026-10-16", 10), "real_video").step).toBe("make"); // being made → it has footage
  });

  it("on-time % never counts a client delay against the team", () => {
    const s = onTimeSummary([
      { onTime: true, blame: null, state: "done" }, { onTime: false, blame: "team", state: "late" },
      { onTime: false, blame: "client", state: "late" }, { onTime: null, blame: null, state: "on_track" }, { onTime: null, blame: null, state: "pending_client" },
    ] as never);
    expect(s).toMatchObject({ decided: 3, onTime: 1, lateTeam: 1, lateClient: 1, pendingClient: 1, percent: 50 });
  });
});

describe("moving a piece", () => {
  const member = { role: "tech_member" };
  const leader = { role: "tech_team_leader" };
  it.each([
    ["within its week — free", { fromWeek: 2, toWeek: 2, user: member }, "same_week", "", false],
    ["to another week — needs a reason", { fromWeek: 2, toWeek: 3, user: member }, "other_week", "Say why", true],
    ["to another week with a reason — the lead is told", { fromWeek: 2, toWeek: 3, reason: "client asked to wait", user: member }, "other_week", "", true],
    ["out of the month — a member cannot", { fromWeek: 2, toWeek: "out", reason: "client asked", user: member }, "out_of_month", "Only the tech admin", false],
    ["out of the month — a team leader can", { fromWeek: 2, toWeek: "out", reason: "client asked", user: leader }, "out_of_month", "", true],
    ["after its deadline — a member cannot move it away", { fromWeek: 1, toWeek: 2, reason: "more time please", user: member, late: true }, "other_week", "already ended", false],
    ["after its deadline — the team leader can (a catch-up)", { fromWeek: 1, toWeek: 2, reason: "catch-up plan", user: leader, late: true }, "other_week", "", true],
  ])("%s", (_l, args, scope, problem, notify) => {
    const r = moveCheck(args as never);
    expect(r.scope).toBe(scope);
    if (problem) expect(r.problem).toContain(problem);
    else expect(r.problem).toBe("");
    expect(r.notifyLead).toBe(notify);
  });
});

describe("which months are left out — the same rule as the health check and the classic On hold", () => {
  const cases: [string, Record<string, unknown>, string, string | null][] = [
    ["running", {}, "2026-10-20", null],
    ["upcoming", {}, "2026-10-10", null],
    ["the last own day (end − 1) still runs", {}, "2026-11-14", null],
    ["the end date (renewal day), undecided → on hold", {}, "2026-11-15", "on_hold"],
    ["past the end, undecided → on hold", {}, "2026-11-20", "on_hold"],
    ["past the end, renewed → ended", { renewal: { state: "won" } }, "2026-11-20", "ended"],
    ["deleted", { status: "deleted" }, "2026-10-20", "deleted"],
    ["removed", { status: "removed" }, "2026-10-20", "removed"],
    ["history", { history: true }, "2026-10-20", "history"],
    ["completed", { status: "completed" }, "2026-10-20", "finished"],
    ["lapsed", { status: "lapsed" }, "2026-10-20", "finished"],
  ];
  it.each(cases)("%s", (_l, over, today, want) => {
    const m = month(over);
    expect(monthExclusion(m, today)).toBe(want);
    expect(excludedReason(m as never, today) !== null).toBe(want !== null);
    if (want === "on_hold" || want === null) expect(isOnHold(m as never, today)).toBe(want === "on_hold");
  });
});

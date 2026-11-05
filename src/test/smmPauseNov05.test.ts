/**
 * Pausing a running SMM month (owner, 2026-11-05) — the pure rules in `utils/smmPause`.
 */
import { describe, expect, it } from "vitest";
import {
  SMM_PAUSE_MAX_DAYS, activePause, cancelPauseProblem, closedPauses, endAfterPause, monthPauseBlock, pauseDays,
  pauseIsOver, pauseProblem, pauseReasonLine, pauseSentence, pausedDaysOf, pausedTotal, restartProblem, upcomingPause,
} from "@/utils/smmPause";
import type { SmmPause } from "@/types/smm";

const pause = (from: string, until: string, extra: Partial<SmmPause> = {}): SmmPause => ({
  from, until, reasonKind: "client_asked", note: null, proofUrl: null, endBefore: "2026-12-06", at: 1, byUid: "u1", byName: "Ravi", ...extra,
});

const month = (over: any = {}) => ({
  status: "active" as const,
  history: false,
  cycle: { month: "2026-11", startDate: "2026-11-06", endDate: "2026-12-06" },
  renewal: { state: "none" } as any,
  pause: null as SmmPause | null,
  pauses: null as any,
  ...over,
});

const ok = { from: "2026-11-10", until: "2026-11-15", reasonKind: "client_asked" as const };

describe("pause days and the renewal day", () => {
  it("counts from … until − 1 and moves the renewal day by exactly that", () => {
    expect(pauseDays("2026-11-10", "2026-11-15")).toBe(5);
    expect(pauseDays("2026-11-10", "2026-11-10")).toBe(0);
    expect(pauseDays("bad", "2026-11-10")).toBe(0);
    expect(endAfterPause("2026-12-06", "2026-11-10", "2026-11-15")).toBe("2026-12-11");
    expect(endAfterPause("2026-12-28", "2026-12-20", "2027-01-05")).toBe("2027-01-13");
  });

  it("is paused only from its first day up to (not on) the restart day", () => {
    const c = month({ pause: pause("2026-11-10", "2026-11-15") });
    expect(upcomingPause(c, "2026-11-09")).not.toBeNull();
    expect(activePause(c, "2026-11-09")).toBeNull();
    expect(activePause(c, "2026-11-10")).not.toBeNull();
    expect(activePause(c, "2026-11-14")).not.toBeNull();
    expect(activePause(c, "2026-11-15")).toBeNull();
    expect(pauseIsOver(c, "2026-11-15")).toBe(true);
    expect(upcomingPause(c, "2026-11-15")).toBeNull();
  });

  it("lists every paused day once, earlier pauses included", () => {
    const c = month({
      pause: pause("2026-11-20", "2026-11-22"),
      pauses: [{ ...pause("2026-11-08", "2026-11-12"), days: 3, endedOn: "2026-11-11" }],
    });
    expect(pausedDaysOf(c)).toEqual(["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-20", "2026-11-21"]);
    expect(pausedTotal(c)).toBe(5);
    expect(pausedDaysOf(month())).toEqual([]);
  });
});

describe("who may pause what", () => {
  const ctx = { today: "2026-11-08" };

  it("accepts a normal pause", () => {
    expect(pauseProblem(month(), ok, ctx)).toBeNull();
    expect(pauseProblem(month(), { ...ok, from: "2026-11-08" }, ctx)).toBeNull();
  });

  it("refuses months that are not running", () => {
    expect(pauseProblem(month({ status: "completed" }), ok, ctx)).toMatch(/running/);
    expect(pauseProblem(month({ history: true }), ok, ctx)).toMatch(/running/);
    expect(pauseProblem(month({ status: "deleted" }), ok, ctx)).toMatch(/running/);
    expect(monthPauseBlock(month(), "2026-12-06")).toMatch(/ended/);
    expect(pauseProblem(month({ renewal: { state: "won", nextCampaignId: "m2" } }), ok, ctx))
      .toBe("Its next month already exists; move that month's dates first.");
  });

  it("refuses broken dates", () => {
    expect(pauseProblem(month(), { ...ok, from: "2026-11-07" }, ctx)).toMatch(/past/);
    expect(pauseProblem(month(), { ...ok, from: "2026-12-06", until: "2026-12-08" }, ctx)).toMatch(/renewal day/);
    expect(pauseProblem(month(), { ...ok, until: "2026-11-10" }, ctx)).toMatch(/after the first/);
    expect(pauseProblem(month(), { ...ok, until: "" }, ctx)).toMatch(/restarts/);
  });

  it("a month not started yet may be paused from its first day, not before", () => {
    const early = { today: "2026-11-01" };
    expect(pauseProblem(month(), { ...ok, from: "2026-11-06" }, early)).toBeNull();
    expect(pauseProblem(month(), { ...ok, from: "2026-11-03" }, early)).toMatch(/before the month/);
  });

  it("needs a reason, and a note for Other", () => {
    expect(pauseProblem(month(), { ...ok, reasonKind: "" }, ctx)).toMatch(/why/);
    expect(pauseProblem(month(), { ...ok, reasonKind: "other", note: "" }, ctx)).toMatch(/Write why/);
    expect(pauseProblem(month(), { ...ok, reasonKind: "other", note: "Owner travelling" }, ctx)).toBeNull();
  });

  it("caps the month at 15 paused days unless an admin goes past it", () => {
    expect(SMM_PAUSE_MAX_DAYS).toBe(15);
    expect(pauseProblem(month(), { ...ok, until: "2026-11-25" }, ctx)).toBeNull(); // 15
    expect(pauseProblem(month(), { ...ok, until: "2026-11-26" }, ctx)).toMatch(/at most 15 days in all \(15 left\)/);
    expect(pauseProblem(month(), { ...ok, until: "2026-11-26" }, { ...ctx, canExceed: true })).toBeNull();
    const used = month({ pauses: [{ ...pause("2026-11-06", "2026-11-08"), days: 2, endedOn: "2026-11-08" }] });
    expect(pauseProblem(used, { ...ok, until: "2026-11-24" }, ctx)).toMatch(/13 left/);
  });

  it("one pause at a time; a finished one does not block a new one", () => {
    expect(pauseProblem(month({ pause: pause("2026-11-10", "2026-11-12") }), ok, ctx)).toMatch(/already paused/);
    expect(pauseProblem(month({ pause: pause("2026-11-06", "2026-11-08") }), ok, ctx)).toBeNull();
  });
});

describe("changing the restart day and cancelling", () => {
  const c = month({ pause: pause("2026-11-10", "2026-11-15") });

  it("resume now / extend / refuse", () => {
    expect(restartProblem(c, "2026-11-12", { today: "2026-11-12" })).toBeNull();
    expect(restartProblem(c, "2026-11-20", { today: "2026-11-12" })).toBeNull();
    expect(restartProblem(c, "2026-11-11", { today: "2026-11-12" })).toMatch(/past/);
    expect(restartProblem(c, "2026-11-10", { today: "2026-11-09" })).toMatch(/cancel/);
    expect(restartProblem(c, "2026-11-30", { today: "2026-11-12" })).toMatch(/at most 15/);
    expect(restartProblem(month(), "2026-11-20", { today: "2026-11-12" })).toMatch(/not paused/);
  });

  it("cancels only before or on its first day", () => {
    expect(cancelPauseProblem(c, "2026-11-09")).toBeNull();
    expect(cancelPauseProblem(c, "2026-11-10")).toBeNull();
    expect(cancelPauseProblem(c, "2026-11-11")).toMatch(/resume/);
  });

  it("closes into the record with the days really taken", () => {
    const rec = closedPauses(c, "2026-11-12", "Kiran");
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ from: "2026-11-10", until: "2026-11-12", days: 2, endedOn: "2026-11-12", endedByName: "Kiran" });
    expect(closedPauses(c, "2026-11-20")[0].days).toBe(5);
    expect(closedPauses(c, "2026-11-10")).toHaveLength(0);
  });
});

describe("sentences", () => {
  const c = month({ cycle: { month: "2026-11", startDate: "2026-11-06", endDate: "2026-12-11" }, pause: pause("2026-11-10", "2026-11-15") });
  it("says the pause in words", () => {
    expect(pauseSentence(c, "2026-11-11")).toBe("Paused 10–14 Nov · back on 15 Nov · renewal moved to 11 Dec");
    expect(pauseSentence(c, "2026-11-08")).toBe("Pauses 10–14 Nov · back on 15 Nov · renewal moved to 11 Dec");
    expect(pauseSentence(c, "2026-11-15")).toBeNull();
    const across = month({ pause: pause("2026-11-28", "2026-12-03") });
    expect(pauseSentence(across, "2026-11-28")).toMatch(/^Paused 28 Nov–2 Dec · back on 3 Dec/);
    expect(pauseReasonLine({ reasonKind: "shop_closed", note: "painting" })).toBe("Shop closed / renovation — painting");
  });
});

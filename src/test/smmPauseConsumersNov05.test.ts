/**
 * A paused SMM month (owner, 2026-11-05) as every reader sees it: Delivery Control's weeks and exclusion,
 * the health check, `smmPackage.isPaused` (parity), the board's glance, the 11 AM / 5 PM check, the due
 * reminders — and the pure writes (`pausePatch`, `restartPatch`, `cancelPausePatch`).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { monthExclusion, monthWeeks, planMonth } from "@/utils/smmCadence";
import { DEFAULT_SMM_DELIVERY } from "@/utils/smmDeliverySettings";
import { excludedReason } from "@/utils/smmDeliveryHealth";
import { isOnHold, isPaused } from "@/utils/smmPackage";
import { monthGlance } from "@/utils/smmGlance";
import { statusCheckMonths } from "@/utils/smmStatusCheck";
import { approvalChasesFor, dueItemsFor } from "@/utils/smmReminders";
import {
  canExceedPauseCap, canPauseMonth, cancelPausePatch, pausePatch, restartPatch, shiftItemsForPause,
} from "@/utils/smmPause";
import type { SmmPause } from "@/types/smm";
import { month, piece } from "./smmDeliveryFixtures";

/** 15 Oct → 15 Nov, paused 20–24 Oct (back on 25 Oct): the renewal day moved 15 Nov → 20 Nov. */
const PAUSE: SmmPause = {
  from: "2026-10-20", until: "2026-10-25", reasonKind: "shop_closed", note: "painting", proofUrl: null,
  endBefore: "2026-11-15", at: 1, byUid: "sita", byName: "Sita",
};
const paused = (over: Record<string, unknown> = {}) =>
  month({ cycle: { month: "2026-10", startDate: "2026-10-15", endDate: "2026-11-20" }, pause: PAUSE, ...over });

describe("Delivery Control while paused", () => {
  it("counts the weeks in days the month runs — week 4 does not swallow the paused days", () => {
    const set = new Set(["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]);
    const weeks = monthWeeks({ startDate: "2026-10-15", endDate: "2026-11-20" }, { holidays: set, deadlineHour: 19, paused: set })!;
    expect(weeks.map((w) => [w.start, w.end])).toEqual([
      ["2026-10-15", "2026-10-26"], ["2026-10-27", "2026-11-02"], ["2026-11-03", "2026-11-09"], ["2026-11-10", "2026-11-19"],
    ]);
    expect(weeks[0].workingDays.some((d) => set.has(d))).toBe(false);
    // Without a pause: exactly 7-day weeks, as before.
    const plain = monthWeeks({ startDate: "2026-10-15", endDate: "2026-11-15" }, { holidays: null, deadlineHour: 19 })!;
    expect(plain.map((w) => w.start)).toEqual(["2026-10-15", "2026-10-22", "2026-10-29", "2026-11-05"]);
  });

  it("planMonth uses the paused days and marks the month paused only while it is", () => {
    const c = paused();
    const during = planMonth(c, { today: "2026-10-21", holidays: new Set(), settings: DEFAULT_SMM_DELIVERY } as any);
    expect(during.exclusion).toBe("paused");
    expect(during.weeks[1].start).toBe("2026-10-27");
    const after = planMonth(c, { today: "2026-10-26", holidays: new Set(), settings: DEFAULT_SMM_DELIVERY } as any);
    expect(after.exclusion).toBeNull();
    expect(after.weeks[1].start).toBe("2026-10-27"); // a finished pause still shapes the weeks
  });

  it("parity: monthExclusion, isPaused and the health check agree", () => {
    const c = paused();
    for (const day of ["2026-10-19", "2026-10-20", "2026-10-24", "2026-10-25", "2026-11-19", "2026-11-20"]) {
      const ex = monthExclusion(c, day);
      expect(ex === "paused").toBe(isPaused(c as any, day));
      expect(!!excludedReason(c as any, day)).toBe(ex !== null);
      expect(ex === "on_hold").toBe(isOnHold(c as any, day));
    }
    expect(excludedReason(c as any, "2026-10-21")).toMatch(/^Paused 20–24 Oct · back on 25 Oct · renewal moved to 20 Nov \(Shop closed \/ renovation — painting\)/);
  });

  it("the server checker's chain imports the pause rules with .js", () => {
    const src = readFileSync(resolve(__dirname, "../utils/smmCadence.ts"), "utf8");
    expect(src).toMatch(/from "\.\/smmPause\.js"/);
    const pause = readFileSync(resolve(__dirname, "../utils/smmPause.ts"), "utf8");
    expect(pause).not.toMatch(/from "@\//);
    expect(pause.match(/^import (?!type).*$/gm) || []).toEqual([]);
  });
});

describe("the classic board and reminders while paused", () => {
  const item = piece({ id: "p1", uploadDate: "2026-10-21", status: "planned", makerUid: "ravi", publisherUid: "priya" });

  it("the card says Paused, not Off track", () => {
    const g = monthGlance(paused({ items: [{ ...item, uploadDate: "2026-10-16" }] }) as any, "2026-10-21");
    expect(g.status).toBe("paused");
    expect(g.reason).toBe("Paused till 24 Oct — Shop closed / renovation — painting · back on 25 Oct, renewal 20 Nov");
    expect(monthGlance(paused({ items: [{ ...item, uploadDate: "2026-10-16" }] }) as any, "2026-10-26").status).not.toBe("paused");
  });

  it("no 11 AM / 5 PM check, no due card, no approval chase", () => {
    const c = paused({ items: [item] }) as any;
    expect(statusCheckMonths([c], "ravi", "2026-10-21")).toEqual([]);
    expect(statusCheckMonths([c], "ravi", "2026-10-26").length).toBe(1);
    expect(dueItemsFor([c], "ravi", "2026-10-21")).toEqual([]);
    const waiting = paused({ items: [{ ...item, status: "awaiting_approval", approval: { state: "waiting", askedAt: Date.parse("2026-10-10T10:00:00"), chases: [] } }] }) as any;
    expect(approvalChasesFor([waiting], "sita", Date.parse("2026-10-21T12:00:00"))).toEqual([]);
    expect(approvalChasesFor([waiting], "sita", Date.parse("2026-10-26T12:00:00")).length).toBe(1);
  });
});

describe("the writes", () => {
  const admin = { uid: "a1", name: "Kiran", role: "tech_admin" };
  const sales = { uid: "sita", name: "Sita", role: "sales_member" };
  const member = { uid: "ravi", name: "Ravi", role: "tech_member" };
  const base = () => month({
    items: [
      piece({ id: "a", uploadDate: "2026-10-22", status: "planned" }),
      piece({ id: "b", uploadDate: "2026-10-18", status: "planned" }),
      piece({ id: "c", uploadDate: "2026-10-23", status: "posted" }),
      piece({ id: "d", uploadDate: "2026-11-08", status: "planned", plan: { week: 4, fixedDate: "2026-11-08", fixedReason: "festival" } }),
      piece({ id: "e", uploadDate: null, status: "planned", plan: { week: 2, suggestedDate: "2026-10-24" } }),
    ],
  }) as any;

  it("who may pause", () => {
    expect(canPauseMonth(sales, { soldBy: "sita" })).toBe(true);
    expect(canPauseMonth(member, { soldBy: "sita" })).toBe(false);
    expect(canPauseMonth({ uid: "x", role: "sales_admin" }, { soldBy: "sita" })).toBe(true);
    expect(canExceedPauseCap(admin)).toBe(true);
    expect(canExceedPauseCap({ role: "tech_team_leader" })).toBe(false);
  });

  it("moves the renewal day and the unposted pieces, keeps posted and festival ones", () => {
    const p = pausePatch(base(), { from: "2026-10-20", until: "2026-10-25", reasonKind: "client_asked" }, sales, "2026-10-19", 5);
    expect(p.cycle.endDate).toBe("2026-11-20");
    const by = Object.fromEntries(p.items.map((i: any) => [i.id, i]));
    expect(by.a.uploadDate).toBe("2026-10-27");
    expect(by.b.uploadDate).toBe("2026-10-18");
    expect(by.c.uploadDate).toBe("2026-10-23");
    expect(by.d.uploadDate).toBe("2026-11-08");
    expect(by.e.plan.suggestedDate).toBe("2026-10-29");
    expect(p.pause).toMatchObject({ from: "2026-10-20", until: "2026-10-25", endBefore: "2026-11-15", byName: "Sita" });
    expect(() => pausePatch(base(), { from: "2026-10-20", until: "2026-10-25", reasonKind: "client_asked" }, member, "2026-10-19", 5))
      .toThrow(/salesperson or an admin/);
  });

  it("resume now / extend / cancel come back to the same dates", () => {
    const first = pausePatch(base(), { from: "2026-10-20", until: "2026-10-25", reasonKind: "client_asked" }, sales, "2026-10-19", 5);
    const pausedMonth = { ...base(), ...first };
    const early = restartPatch(pausedMonth, "2026-10-22", sales, "2026-10-22");
    expect(early.cycle.endDate).toBe("2026-11-17");
    expect(early.pause).toBeNull();
    expect(early.pauses).toEqual([expect.objectContaining({ days: 2, endedOn: "2026-10-22", endedByName: "Sita" })]);
    expect(early.items.find((i: any) => i.id === "a")!.uploadDate).toBe("2026-10-24");
    const longer = restartPatch(pausedMonth, "2026-10-28", sales, "2026-10-21");
    expect(longer.cycle.endDate).toBe("2026-11-23");
    expect(longer.pause!.until).toBe("2026-10-28");
    expect(longer.items.find((i: any) => i.id === "a")!.uploadDate).toBe("2026-10-30");
    const undone = cancelPausePatch(pausedMonth, sales, "2026-10-19");
    expect(undone.cycle.endDate).toBe("2026-11-15");
    expect(undone.items.map((i: any) => i.uploadDate)).toEqual(base().items.map((i: any) => i.uploadDate));
    expect(undone.pause).toBeNull();
  });

  it("shiftItemsForPause leaves nothing changed for delta 0", () => {
    const items = base().items;
    expect(shiftItemsForPause(items, "2026-10-20", 0)).toBe(items);
  });
});

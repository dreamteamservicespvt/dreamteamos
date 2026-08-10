import { describe, it, expect } from "vitest";
import {
  memberProductivity, payToDate, ratioBand, formatRatio, RATIO_TARGET, RATIO_LIMIT,
} from "@/utils/techProductivity";
import type { Order, WorkAssignment } from "@/types";
import type { PeriodFilter } from "@/utils/periodFilter";

/**
 * Pay against the value produced — the number the tech admin uses to decide whether somebody is
 * worth what they cost. Getting it wrong in either direction is expensive: too generous and a
 * loss-making member looks fine, too harsh and a productive one is questioned over a counting bug.
 */

/** The real pay cycle: `2026-07` on a cycle basis means 10 Jul → 9 Aug. */
const period: PeriodFilter = { mode: "month", month: "2026-07", day: "", monthBasis: "cycle" };

const job = (over: Partial<WorkAssignment> = {}): WorkAssignment => ({
  id: "a1",
  assignedTo: "tech1",
  assignedBy: "admin1",
  status: "verified",
  totalPrice: 5000,
  completedDate: "2026-07-15",
  category: "promotional",
  clipCount: 2,
  duration: "16s",
  pricePerUnit: 5000,
  uniqueId: "P1",
  accessCode: "1111",
  displayTitle: "Promo",
  sessions: [],
  totalDurationSeconds: 0,
  date: "2026-07-15",
  includesEndCredits: false,
  assignedAt: null,
  ...over,
} as unknown as WorkAssignment);

/** A bulk order whose videos live as slots, with no work assignment anywhere. */
const bulkOrder = (slots: { n: number; uid?: string; done?: boolean; day?: string }[]): Order => ({
  id: "o1",
  category: "bulk_ads",
  quantity: slots.length,
  unitAmount: 1000,
  amount: 1000 * slots.length,
  bulkVideos: slots.map((s) => ({
    n: s.n,
    status: s.done ? "completed" : "assigned",
    assignedTo: s.uid ?? null,
    completedAt: s.day
      ? { seconds: Math.floor(new Date(`${s.day}T12:00:00`).getTime() / 1000) }
      : null,
  })),
} as unknown as Order);

describe("what a member produced", () => {
  it("counts delivered ads and their client value", () => {
    const p = memberProductivity({
      uid: "tech1", pay: 10000, filter: period,
      assignments: [job({ id: "a1" }), job({ id: "a2", totalPrice: 3000 })],
    });

    expect(p.videos).toBe(2);
    expect(p.workValue).toBe(8000);
  });

  it("ignores other people's work", () => {
    const p = memberProductivity({
      uid: "tech1", pay: 10000, filter: period,
      assignments: [job({ id: "a1" }), job({ id: "a2", assignedTo: "tech2" })],
    });
    expect(p.videos).toBe(1);
  });

  it("ignores work that has not been delivered", () => {
    const p = memberProductivity({
      uid: "tech1", pay: 10000, filter: period,
      assignments: [job({ id: "a1", status: "in_progress" }), job({ id: "a2", status: "assigned" })],
    });
    expect(p.videos).toBe(0);
    expect(p.workValue).toBe(0);
  });

  it("ignores work delivered outside the pay period", () => {
    const p = memberProductivity({
      uid: "tech1", pay: 10000, filter: period,
      assignments: [job({ id: "a1", completedDate: "2026-06-20" })],
    });
    expect(p.videos).toBe(0);
  });
});

/**
 * The failure that would have made this feature actively harmful: bulk videos never become work
 * assignments, so a member who spent the month on them would have shown as delivering nothing.
 */
describe("bulk videos, which never become assignments", () => {
  it("counts the videos this member actually finished", () => {
    const p = memberProductivity({
      uid: "tech1", pay: 10000, filter: period,
      assignments: [],
      orders: [bulkOrder([
        { n: 1, uid: "tech1", done: true, day: "2026-07-15" },
        { n: 2, uid: "tech1", done: true, day: "2026-07-16" },
        { n: 3, uid: "tech2", done: true, day: "2026-07-16" },
        { n: 4, uid: "tech1" },
      ])],
    });

    expect(p.videos).toBe(2);
    // Valued per video, not per order — three members on one order must not each be credited
    // with the whole thing.
    expect(p.workValue).toBe(2000);
  });

  it("ignores a bulk video finished in another period", () => {
    const p = memberProductivity({
      uid: "tech1", pay: 10000, filter: period,
      assignments: [],
      orders: [bulkOrder([{ n: 1, uid: "tech1", done: true, day: "2026-06-01" }])],
    });
    expect(p.videos).toBe(0);
  });

  it("adds bulk work to ordinary work rather than replacing it", () => {
    const p = memberProductivity({
      uid: "tech1", pay: 10000, filter: period,
      assignments: [job()],
      orders: [bulkOrder([{ n: 1, uid: "tech1", done: true, day: "2026-07-15" }])],
    });
    expect(p.videos).toBe(2);
    expect(p.workValue).toBe(6000);
  });
});

/**
 * A social-media month is one assignment covering many ads. Counting it as one video would
 * under-report its owner tenfold; counting it for every track owner would double-count.
 */
describe("a social-media month", () => {
  const smm = (trackUid: string, adsDone: number): Order => ({
    id: "o2",
    category: "social_media_management",
    progress: {
      kind: "smm",
      targets: { ads: 8, posters: 0, posted: 0, campaigns: 0 },
      done: { ads: adsDone, posters: 0, posted: 0, campaigns: 0 },
      tracks: { ad_creation: { uid: trackUid, name: "Whoever" } },
      completedTracks: [],
      log: [],
    },
  } as unknown as Order);

  it("credits the ads to whoever holds the ad-creation track", () => {
    const p = memberProductivity({
      uid: "tech1", pay: 10000, filter: period,
      assignments: [job({ orderId: "o2" })],
      orders: [smm("tech1", 6)],
    });
    expect(p.videos).toBe(6);
  });

  it("does not credit them to somebody holding a different track", () => {
    const p = memberProductivity({
      uid: "tech1", pay: 10000, filter: period,
      assignments: [job({ orderId: "o2" })],
      orders: [smm("tech2", 6)],
    });
    // Their own job still counts once; the other person's ads are not theirs.
    expect(p.videos).toBe(1);
  });
});

describe("the pay-to-work ratio", () => {
  it("is pay as a percentage of the value produced", () => {
    const p = memberProductivity({
      uid: "tech1", pay: 10000, filter: period,
      assignments: [job({ totalPrice: 200000 })],
    });
    expect(p.ratioPercent).toBeCloseTo(5);
  });

  /**
   * Null, never zero. Zero is the best possible score, and showing it for somebody who delivered
   * nothing would rank the least productive member as the most efficient.
   */
  it("is undefined when nothing was delivered, not zero", () => {
    const p = memberProductivity({ uid: "tech1", pay: 10000, filter: period, assignments: [] });
    expect(p.ratioPercent).toBeNull();
    expect(formatRatio(p.ratioPercent)).toBe("No work delivered");
    expect(ratioBand(p.ratioPercent)).toBe("over");
  });

  it("bands on target, watch and over", () => {
    expect(ratioBand(3)).toBe("on_target");
    expect(ratioBand(RATIO_TARGET)).toBe("on_target");
    expect(ratioBand(RATIO_TARGET + 0.1)).toBe("watch");
    expect(ratioBand(RATIO_LIMIT)).toBe("watch");
    expect(ratioBand(RATIO_LIMIT + 0.1)).toBe("over");
    expect(ratioBand(25)).toBe("over");
  });

  it("prints to one decimal", () => {
    expect(formatRatio(5.25)).toBe("5.3%");
    expect(formatRatio(12)).toBe("12.0%");
  });
});

/**
 * A pay period runs 10th → 9th and the payroll page opens on the one we are IN — which on payday
 * itself is a day old. Measuring a whole month's salary against a day's output would paint every
 * member red for most of every month, and a number that is always red is a number nobody reads.
 */
describe("a pay period that is still running", () => {
  const bounds = { start: "2026-07-10", end: "2026-08-09" };

  it("charges only the salary earned so far", () => {
    // 16 of the 31 days have elapsed.
    const { pay, inProgress } = payToDate(31000, bounds, new Date("2026-07-25T10:00:00"));
    expect(inProgress).toBe(true);
    expect(Math.round(pay)).toBe(16000);
  });

  it("charges the whole salary once the period has closed", () => {
    const { pay, inProgress } = payToDate(31000, bounds, new Date("2026-08-10T10:00:00"));
    expect(inProgress).toBe(false);
    expect(pay).toBe(31000);
  });

  it("charges one day on the first day, not a month", () => {
    const { pay } = payToDate(31000, bounds, new Date("2026-07-10T10:00:00"));
    expect(Math.round(pay)).toBe(1000);
  });

  it("charges nothing for a period that has not started", () => {
    const { pay, inProgress } = payToDate(31000, bounds, new Date("2026-07-01T10:00:00"));
    expect(pay).toBe(0);
    expect(inProgress).toBe(true);
  });

  /**
   * The whole point, shown as the verdict actually flipping.
   *
   * Half-way through the period a member on ₹10,000 has delivered ₹150,000 of work. Charged the
   * whole month's salary they read as 6.7% — above target, when they are in fact ahead of it.
   * Charged what they have actually cost so far, they read as 3.4%.
   */
  it("stops a member who is ahead of target from reading as behind it", () => {
    const work = 150000;
    const naive = memberProductivity({
      uid: "tech1", pay: 10000, filter: period, assignments: [job({ totalPrice: work })],
    });
    expect(ratioBand(naive.ratioPercent)).toBe("watch");

    const { pay } = payToDate(10000, bounds, new Date("2026-07-25T10:00:00"));
    const fair = memberProductivity({
      uid: "tech1", pay, filter: period, assignments: [job({ totalPrice: work })],
    });
    expect(ratioBand(fair.ratioPercent)).toBe("on_target");
  });
});

import { describe, it, expect } from "vitest";
import { saleStatusView } from "@/utils/saleStatus";
import { buildPromise } from "@/utils/promiseSla";
import type { Order, SaleDetail } from "@/types";

/**
 * The status chip on a sale row.
 *
 * It used to appear only once the work was LOCKED — that is, only from the moment the tech team
 * had already started. So the three states a seller is actually asked about by a client on the
 * phone ("has anyone picked it up", "is it being made", "is it late") were the three the row could
 * not answer, and the member's only recourse was to message the tech team.
 */

const HOUR = 3_600_000;
const START = Date.UTC(2026, 8, 9, 9, 0, 0);
const NOW = START + HOUR; // an hour into a 24-hour promise

const sale = (over = false): SaleDetail =>
  ({
    category: "promotional", packageKey: "30 Seconds + Poster", amount: 999,
    ...(over ? { discountNeedsApproval: true, discountApproval: "pending" } : {}),
  }) as unknown as SaleDetail;

const order = (patch: Partial<Order> = {}): Order =>
  ({
    id: "o1", status: "unassigned",
    promise: buildPromise({ presetKey: "promotional_24h", startMs: START }),
    ...patch,
  }) as unknown as Order;

describe("what the chip says", () => {
  it("holds a sale the member discounted past their authority", () => {
    // No order exists at all for these — see services/orders.upsertOrderForSale.
    const v = saleStatusView(sale(true), null, NOW);
    expect(v.stage).toBe("withheld");
    expect(v.label).toMatch(/sales admin/i);
  });

  /**
   * The seconds after a sale is recorded, and any sale the queue has not loaded. "Waiting for the
   * tech team" is true of both, and a blank chip is the thing this exists to remove.
   */
  it("reads a missing order as queued, not as an error", () => {
    expect(saleStatusView(sale(), null, NOW).stage).toBe("queued");
    expect(saleStatusView(sale(), undefined, NOW).label).toBe("Waiting for the tech team");
  });

  it("names whoever is making it", () => {
    const v = saleStatusView(sale(), order({ status: "assigned", assignedToName: "Kiran" }), NOW);
    expect(v.stage).toBe("in_production");
    expect(v.label).toBe("Being made by Kiran");
    expect(v.assigneeName).toBe("Kiran");
  });

  it("falls back to a plain 'In production' when nobody is named", () => {
    expect(saleStatusView(sale(), order({ status: "assigned" }), NOW).label).toBe("In production");
  });

  it("distinguishes delivered from signed off", () => {
    expect(saleStatusView(sale(), order({ status: "completed" }), NOW).label).toBe("Delivered");
    expect(saleStatusView(sale(), order({ status: "verified" }), NOW).label).toBe("Delivered & signed off");
  });

  it("shows a cancelled order as cancelled", () => {
    expect(saleStatusView(sale(), order({ status: "cancelled" }), NOW).stage).toBe("cancelled");
  });

  /** A deleted order on an over-discounted sale is the withhold, not a cancellation. */
  it("reads a cancelled order on an unapproved price as still withheld", () => {
    expect(saleStatusView(sale(true), order({ status: "cancelled" }), NOW).stage).toBe("withheld");
  });
});

describe("the countdown and the delay", () => {
  const LATE = START + 30 * HOUR;

  it("counts down while there is time left", () => {
    const v = saleStatusView(sale(), order({ status: "assigned" }), NOW);
    expect(v.delayed).toBe(false);
    expect(v.countdown).toContain("left");
  });

  it("warns in the last few hours", () => {
    const v = saleStatusView(sale(), order({ status: "assigned" }), START + 20 * HOUR);
    expect(v.dueSoon).toBe(true);
    expect(v.delayed).toBe(false);
  });

  it("turns the chip red and says so once the promise is blown", () => {
    const v = saleStatusView(sale(), order({ status: "assigned", assignedToName: "Kiran" }), LATE);
    expect(v.delayed).toBe(true);
    expect(v.label).toBe("Overdue with Kiran");
    expect(v.countdown).toContain("overdue");
    expect(v.tone).toContain("destructive");
  });

  /**
   * Nobody has picked it up and the clock has run out. "Not picked up" rather than "delayed",
   * because the useful fact is that no one is on it — not that a clock expired on nobody.
   */
  it("says a queued job is unpicked rather than merely late", () => {
    expect(saleStatusView(sale(), order({ status: "unassigned" }), LATE).label)
      .toBe("Not picked up — overdue");
  });

  it("never calls delivered work late", () => {
    const v = saleStatusView(sale(), order({ status: "completed" }), LATE);
    expect(v.delayed).toBe(false);
    expect(v.countdown).toBe("");
  });

  it("says nothing about time on a sale with no promise", () => {
    const v = saleStatusView(sale(), order({ status: "assigned", promise: null }), NOW);
    expect(v.countdown).toBe("");
    expect(v.delayed).toBe(false);
  });

  it("flags a promise that has already had its one extension", () => {
    const p = buildPromise({ presetKey: "promotional_24h", startMs: START });
    const extended = { ...p, extension: { hours: 24, at: null, by: "u", byName: "Asha", byRole: "tech_team_leader" as const } };
    expect(saleStatusView(sale(), order({ status: "assigned", promise: extended }), NOW).extended).toBe(true);
    expect(saleStatusView(sale(), order({ status: "assigned" }), NOW).extended).toBe(false);
  });
});

describe("multi-deliverable orders", () => {
  const monthly = (done = 0) => order({
    status: "assigned",
    progress: {
      kind: "smm",
      targets: { ads: 8, posters: 8, posted: 16, stories: 16, campaigns: 8 },
      done: { ads: done, posters: 0, posted: 0, stories: 0, campaigns: 0 },
      tracks: {}, completedTracks: [], log: [],
    },
  } as Partial<Order>);

  it("says how much of a month is actually done", () => {
    expect(saleStatusView(sale(), monthly(5), NOW).progress).toContain("5 of 8 videos created");
  });

  it("drops the line once everything is delivered", () => {
    const finished = order({
      status: "completed",
      progress: {
        kind: "smm",
        targets: { ads: 8, posters: 8, posted: 16, stories: 16, campaigns: 8 },
        done: { ads: 8, posters: 8, posted: 16, stories: 16, campaigns: 8 },
        tracks: {}, completedTracks: [], log: [],
      },
    } as Partial<Order>);
    expect(saleStatusView(sale(), finished, NOW).progress).toBe("");
  });

  it("says nothing about progress on an ordinary single ad", () => {
    expect(saleStatusView(sale(), order({ status: "assigned" }), NOW).progress).toBe("");
  });
});

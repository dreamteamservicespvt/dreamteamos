import { describe, it, expect } from "vitest";
import {
  collectedInDays, collectedInRange, collectedOf, hasPendingPayment, paymentEvents, pendingOf,
  pendingSales, totalPending, withPayment,
} from "@/utils/salePayments";
import { dayRevenue } from "@/utils/salesRevenue";
import { computeCommissionInRange, computeUnpaidCommission } from "@/services/settlements";
import { collectReadiness } from "@/utils/collectReadiness";
import type { Lead, Order, SaleDetail } from "@/types";

/**
 * Money agreed versus money received.
 *
 * A sale used to be one number and the system assumed the cash arrived with it. Half up front is
 * the norm on a social-media month, and it happens on ads too — so a member either logged the full
 * amount and drew commission on money nobody had handed over, or did not log the sale at all.
 */

const at = (iso: string) => ({ seconds: Math.floor(Date.parse(iso) / 1000) });

const sale = (patch: Partial<SaleDetail> = {}): SaleDetail => ({
  category: "promotional",
  packageKey: "p1",
  amount: 1000,
  verificationStatus: "verified",
  submittedAt: at("2026-08-01T10:00:00"),
  ...patch,
} as SaleDetail);

const lead = (items: SaleDetail[], id = "l1"): Lead => ({
  id,
  phone: "9876543210",
  displayName: "Sharma Electronics",
  status: "answered",
  saleDone: true,
  assignedTo: "u1",
  createdAt: at("2026-07-20T09:00:00"),
  saleItems: items,
} as Lead);

describe("a sale nobody marked partial", () => {
  it("is one payment of the whole price, on the day of the sale", () => {
    const events = paymentEvents(sale(), lead([sale()]));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ amount: 1000, day: "2026-08-01", recorded: false });
  });

  it("counts as fully collected, with nothing pending", () => {
    const s = sale();
    expect(collectedOf(s)).toBe(1000);
    expect(pendingOf(s)).toBe(0);
    expect(hasPendingPayment(s)).toBe(false);
  });

  it("keeps behaving exactly as it did — no backfill needed", () => {
    // The whole compatibility claim in one assertion: an untouched record still totals its price
    // on its own day, so every existing screen returns what it always returned.
    const s = sale();
    expect(collectedInDays(s, lead([s]), new Set(["2026-08-01"]))).toBe(1000);
    expect(collectedInDays(s, lead([s]), new Set(["2026-08-02"]))).toBe(0);
  });
});

describe("a sale taken at 50% up front", () => {
  const half = sale({
    amount: 40000,
    partialPayment: true,
    payments: [{ id: "p1", amount: 20000, collectedAt: at("2026-08-01T10:00:00"), note: "Advance at sale" }],
  });

  it("counts only the money actually received", () => {
    expect(collectedOf(half)).toBe(20000);
    expect(pendingOf(half)).toBe(20000);
    expect(hasPendingPayment(half)).toBe(true);
  });

  it("puts the balance on the day it is collected, not on the sale's day", () => {
    const settled = sale({
      ...half,
      payments: [
        ...(half.payments || []),
        { id: "p2", amount: 20000, collectedAt: at("2026-09-14T16:00:00"), note: "Balance" },
      ],
    });

    expect(collectedInDays(settled, null, new Set(["2026-08-01"]))).toBe(20000);
    expect(collectedInDays(settled, null, new Set(["2026-09-14"]))).toBe(20000);
    expect(collectedOf(settled)).toBe(40000);
    expect(pendingOf(settled)).toBe(0);
  });

  it("never reports a negative balance when more was collected than the price", () => {
    // A typo, not a debt. Left negative it would silently cancel another sale's real balance.
    const over = sale({
      amount: 1000,
      partialPayment: true,
      payments: [{ id: "p1", amount: 1500, collectedAt: at("2026-08-01T10:00:00") }],
    });
    expect(pendingOf(over)).toBe(0);
  });

  it("is not chased once the sale has been rejected", () => {
    expect(hasPendingPayment(sale({ ...half, verificationStatus: "rejected" }))).toBe(false);
  });

  it("is still chased while the sale is only pending verification", () => {
    // Whether the paperwork has caught up has nothing to do with whether the client owes money.
    expect(hasPendingPayment(sale({ ...half, verificationStatus: "pending" }))).toBe(true);
  });
});

describe("adding a payment to a sale that was full", () => {
  it("writes down the money already taken before adding the new instalment", () => {
    // Without this, adding a ₹400 top-up to a ₹1,000 paid-in-full sale would drop its collected
    // total from 1,000 to 400 — the sale would appear to have lost money.
    const s = sale({ amount: 1400 });
    const list = withPayment(s, { id: "p2", amount: 400, collectedAt: at("2026-09-01T10:00:00") }, lead([s]));
    expect(list).toHaveLength(2);
    expect(list[0].amount).toBe(1400);
    expect(list[1].amount).toBe(400);
  });

  it("appends to an existing list without disturbing it", () => {
    const s = sale({
      amount: 3000,
      partialPayment: true,
      payments: [{ id: "p1", amount: 1000, collectedAt: at("2026-08-01T10:00:00") }],
    });
    const list = withPayment(s, { id: "p2", amount: 500, collectedAt: at("2026-09-01T10:00:00") });
    expect(list.map((p) => p.amount)).toEqual([1000, 500]);
  });
});

describe("the chase list", () => {
  const leads = [
    lead([sale({ amount: 1000, partialPayment: true, payments: [{ id: "a", amount: 400, collectedAt: at("2026-08-01T10:00:00") }] })], "l1"),
    lead([sale({ amount: 40000, partialPayment: true, payments: [{ id: "b", amount: 20000, collectedAt: at("2026-08-02T10:00:00") }] })], "l2"),
    lead([sale({ amount: 999 })], "l3"),
  ];

  it("lists only sales that still owe money, biggest balance first", () => {
    const rows = pendingSales(leads);
    expect(rows).toHaveLength(2);
    expect(rows[0].pending).toBe(20000);
    expect(rows[1].pending).toBe(600);
  });

  it("totals what is outstanding across every lead", () => {
    expect(totalPending(leads)).toBe(20600);
  });

  it("carries enough to address the sale for an update", () => {
    const row = pendingSales(leads)[0];
    expect(row.lead.id).toBe("l2");
    expect(row.index).toBe(0);
    expect(row.collected).toBe(20000);
    expect(row.price).toBe(40000);
  });
});

describe("revenue on the day", () => {
  it("credits the advance on the sale's day and the balance on its own", () => {
    const s = sale({
      amount: 40000,
      partialPayment: true,
      payments: [
        { id: "a", amount: 20000, collectedAt: at("2026-08-01T10:00:00") },
        { id: "b", amount: 20000, collectedAt: at("2026-09-14T10:00:00") },
      ],
    });
    const ls = [lead([s])];

    expect(dayRevenue(ls, new Set(["2026-08-01"])).total).toBe(20000);
    expect(dayRevenue(ls, new Set(["2026-09-14"])).total).toBe(20000);
    expect(dayRevenue(ls, null).total).toBe(40000);
  });

  it("shows nothing on a day money was neither sold nor collected", () => {
    const s = sale({ amount: 1000, partialPayment: true, payments: [{ id: "a", amount: 500, collectedAt: at("2026-08-01T10:00:00") }] });
    expect(dayRevenue([lead([s])], new Set(["2026-08-05"])).total).toBe(0);
  });

  it("still breaks the day down by TICKET price, not by what was collected", () => {
    // "Three 499s and a 999" stays true whether or not one of those clients paid half.
    const s = sale({ amount: 1000, partialPayment: true, payments: [{ id: "a", amount: 500, collectedAt: at("2026-08-01T10:00:00") }] });
    const day = dayRevenue([lead([s])], new Set(["2026-08-01"]));
    expect(day.total).toBe(500);
    expect(day.breakdown).toEqual([{ amount: 1000, count: 1, categories: ["Promotional Ad"] }]);
  });

  it("leaves an ordinary fully-paid day exactly as it was", () => {
    const ls = [lead([sale({ amount: 499 }), sale({ amount: 999 })])];
    expect(dayRevenue(ls, new Set(["2026-08-01"])).total).toBe(1498);
  });
});

describe("commission", () => {
  const partial = sale({
    amount: 40000,
    verificationStatus: "verified",
    verifiedAt: at("2026-08-02T10:00:00"),
    partialPayment: true,
    payments: [{ id: "a", amount: 20000, collectedAt: at("2026-08-01T10:00:00") }],
  });

  it("is paid on money received, never on the invoice", () => {
    const r = computeCommissionInRange([lead([partial])], "2026-08-01", "2026-08-31", 5);
    expect(r.base).toBe(20000);
    expect(r.commission).toBe(1000);
  });

  it("pays the balance in the cycle it was collected in", () => {
    const settled = sale({
      ...partial,
      payments: [
        ...(partial.payments || []),
        { id: "b", amount: 20000, collectedAt: at("2026-09-14T10:00:00") },
      ],
    });
    expect(computeCommissionInRange([lead([settled])], "2026-08-01", "2026-08-31", 5).base).toBe(20000);
    expect(computeCommissionInRange([lead([settled])], "2026-09-01", "2026-09-30", 5).base).toBe(20000);
  });

  it("leaves an ordinary sale's commission untouched", () => {
    const r = computeCommissionInRange([lead([sale({ amount: 1000 })])], "2026-08-01", "2026-08-31", 10);
    expect(r).toEqual({ base: 1000, commission: 100, saleCount: 1 });
  });

  it("does not owe a member anything for a sale with no money against it yet", () => {
    const nothingYet = sale({ amount: 5000, partialPayment: true, payments: [] });
    expect(computeUnpaidCommission([lead([nothingYet])], 0, 5).base).toBe(0);
  });
});

/**
 * The balance on a social-media month is due on a DELIVERY, not a date: the client pays the rest
 * once the first post exists, is up, and the campaign is running. The tech side records exactly
 * that as it works, so the sale can promote itself the moment the work lands.
 */
describe("knowing when the balance is due", () => {
  const smm = (done: Partial<{ ads: number; posted: number; campaigns: number }>, completedTracks: string[] = []): Order => ({
    id: "o1",
    status: "assigned",
    category: "social_media_management",
    progress: {
      kind: "smm",
      targets: { ads: 8, posters: 8, posted: 8, campaigns: 8 },
      done: { ads: 0, posters: 0, posted: 0, campaigns: 0, ...done },
      tracks: {},
      completedTracks,
      log: [],
    },
  } as unknown as Order);

  it("is ready once a post is created, posted and the marketing is running", () => {
    const r = collectReadiness(smm({ ads: 1, posted: 1, campaigns: 1 }));
    expect(r.ready).toBe(true);
    expect(r.reason).toMatch(/posted and marketing running/i);
  });

  it("is not ready while any of the three is still outstanding", () => {
    const r = collectReadiness(smm({ ads: 3, posted: 3 }));
    expect(r.ready).toBe(false);
    expect(r.reason).toMatch(/waiting on marketing running/i);
  });

  it("accepts a whole leg signed off even when its counter has not moved", () => {
    const r = collectReadiness(smm({ ads: 1, posted: 1 }, ["digital_marketing"]));
    expect(r.ready).toBe(true);
  });

  it("says plainly that nothing has started", () => {
    expect(collectReadiness(smm({})).reason).toBe("Work not started yet");
  });

  it("treats an ordinary ad as due on delivery", () => {
    expect(collectReadiness({ id: "o", status: "completed" } as Order).ready).toBe(true);
    expect(collectReadiness({ id: "o", status: "assigned" } as Order).ready).toBe(false);
  });

  it("never crashes on a sale whose order has not been created yet", () => {
    expect(collectReadiness(null).ready).toBe(false);
    expect(collectReadiness(undefined).reason).toBe("Waiting for the tech team");
  });
});

describe("collectedInRange", () => {
  it("is inclusive at both ends", () => {
    const s = sale({
      amount: 300,
      partialPayment: true,
      payments: [
        { id: "a", amount: 100, collectedAt: at("2026-08-01T10:00:00") },
        { id: "b", amount: 100, collectedAt: at("2026-08-15T10:00:00") },
        { id: "c", amount: 100, collectedAt: at("2026-08-31T10:00:00") },
      ],
    });
    expect(collectedInRange(s, null, "2026-08-01", "2026-08-31")).toBe(300);
    expect(collectedInRange(s, null, "2026-08-02", "2026-08-30")).toBe(100);
  });
});

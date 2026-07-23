import { describe, it, expect } from "vitest";
import { clientTotal, workAmount } from "@/utils/clientValue";
import type { Client, ClientWorkItem } from "@/types";

/**
 * The Clients list was showing ₹0 for every backfilled client because their `totalSaleAmount` is
 * genuinely 0 — the value lives in the delivered amount. These lock the fix: a client is totalled
 * from their jobs, taking the sale price when there is one and the delivered price otherwise.
 */

const work = (f: Partial<ClientWorkItem>): ClientWorkItem => ({
  orderId: "o", category: "promotional", title: "", billing: "one_time", soldBy: "", soldByName: "",
  saleAmount: 0, fromAd: false, deliveredBy: "", deliveredByName: null, deliveredAmount: 0, deliveredAt: null,
  ...f,
} as ClientWorkItem);

const client = (f: Partial<Client>): Client => ({
  phone: "+91", phoneId: "91", name: "X", works: [], totalSaleAmount: 0, totalDeliveredAmount: 0, workCount: 0,
  ...f,
} as Client);

describe("workAmount", () => {
  it("uses the sale price when present", () => {
    expect(workAmount(work({ saleAmount: 999, deliveredAmount: 500 }))).toBe(999);
  });
  it("falls back to the delivered price when there was no sale record", () => {
    expect(workAmount(work({ saleAmount: 0, deliveredAmount: 500 }))).toBe(500);
  });
  it("is 0 only when the job carries no figure at all", () => {
    expect(workAmount(work({}))).toBe(0);
  });
});

describe("clientTotal", () => {
  it("sums order-sourced jobs by their sale price", () => {
    const c = client({ works: [work({ saleAmount: 999 }), work({ saleAmount: 1999 })], totalSaleAmount: 2998 });
    expect(clientTotal(c)).toBe(2998);
  });

  it("no longer reads ₹0 for a backfilled client — it totals the delivered amounts", () => {
    // Exactly the bug: sale total 0, but real delivered work.
    const c = client({
      works: [work({ saleAmount: 0, deliveredAmount: 499 }), work({ saleAmount: 0, deliveredAmount: 999 })],
      totalSaleAmount: 0, totalDeliveredAmount: 1498,
    });
    expect(clientTotal(c)).toBe(1498);
  });

  it("mixes sale and delivered figures across jobs", () => {
    const c = client({ works: [work({ saleAmount: 999 }), work({ saleAmount: 0, deliveredAmount: 499 })] });
    expect(clientTotal(c)).toBe(1498);
  });

  it("falls back to stored totals when a client has no itemised works", () => {
    expect(clientTotal(client({ works: [], totalSaleAmount: 0, totalDeliveredAmount: 750 }))).toBe(750);
    expect(clientTotal(client({ works: [], totalSaleAmount: 1200 }))).toBe(1200);
  });
});

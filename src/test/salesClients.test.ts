import { describe, it, expect } from "vitest";
import { buildSalesClients, soldWithin } from "@/utils/salesClients";
import type { Client, Order } from "@/types";

/**
 * A sales member's own book.
 *
 * The bug this replaces was measurable: one member had sold to 710 customers and her Clients page
 * offered 53, because the page was built from DELIVERED work and from a `soldByIds` field filled in
 * by a backfill nobody had run. Both of those are ways of hiding a customer she is entitled to ring.
 */

const order = (over: Partial<Order> = {}): Order => ({
  id: "o1",
  clientPhone: "+919876543210",
  clientPhoneId: "919876543210",
  businessName: "Sharma Electronics",
  category: "promotional",
  amount: 999,
  status: "unassigned",
  soldBy: "sales1",
  createdAt: { seconds: Math.floor(Date.parse("2026-07-15T10:00:00Z") / 1000) },
  ...over,
} as unknown as Order);

const client = (over: Partial<Client> = {}): Client => ({
  phoneId: "919876543210",
  phone: "+919876543210",
  name: "Sharma Electronics Ltd",
  works: [{ orderId: "o1", category: "promotional", title: "Ad", soldBy: "sales1", soldByName: "R", saleAmount: 999, fromAd: true, deliveredAt: { seconds: 1 } }],
  ...over,
} as unknown as Client);

describe("building the book from orders", () => {
  it("includes a customer whose work has not been delivered", () => {
    // The whole point: a client bought this morning is callable this morning.
    const rows = buildSalesClients({ orders: [order()], clients: [] });

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Sharma Electronics");
    expect(rows[0].awaitingDelivery).toBe(true);
    expect(rows[0].works).toEqual([]);
  });

  it("does not need the client record to exist at all", () => {
    const rows = buildSalesClients({ orders: [order()], clients: [] });
    expect(rows[0].client).toBeNull();
    expect(rows[0].totalSold).toBe(999);
  });

  it("merges the client record in when there is one", () => {
    const rows = buildSalesClients({ orders: [order()], clients: [client()] });

    expect(rows[0].awaitingDelivery).toBe(false);
    expect(rows[0].works).toHaveLength(1);
    // The client record's name wins — an admin may have corrected it there.
    expect(rows[0].name).toBe("Sharma Electronics Ltd");
  });

  it("groups every sale to one customer into a single row", () => {
    const rows = buildSalesClients({
      orders: [
        order({ id: "o1", amount: 999, createdAt: { seconds: 1000 } as never }),
        order({ id: "o2", amount: 1999, createdAt: { seconds: 2000 } as never }),
      ],
      clients: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].orders).toHaveLength(2);
    expect(rows[0].totalSold).toBe(2998);
    expect(rows[0].firstSoldMs).toBe(1000 * 1000);
    expect(rows[0].lastSoldMs).toBe(2000 * 1000);
    // Newest first, so the last thing they bought is the thing you talk about.
    expect(rows[0].orders[0].id).toBe("o2");
  });

  it("keeps separate customers separate", () => {
    const rows = buildSalesClients({
      orders: [order(), order({ id: "o2", clientPhoneId: "919000000001", businessName: "Other" })],
      clients: [],
    });
    expect(rows).toHaveLength(2);
  });

  /** A reversed sale is not a customer relationship, and ringing them about it is worse than not. */
  it("leaves out cancelled and deleted sales", () => {
    const rows = buildSalesClients({
      orders: [
        order({ id: "o1", status: "cancelled" }),
        order({ id: "o2", clientPhoneId: "919000000002", deleted: true }),
        order({ id: "o3", clientPhoneId: "919000000003", status: "deleted" }),
      ],
      clients: [],
    });
    expect(rows).toEqual([]);
  });

  it("puts the most recent customer first", () => {
    const rows = buildSalesClients({
      orders: [
        order({ id: "o1", clientPhoneId: "111", createdAt: { seconds: 1000 } as never }),
        order({ id: "o2", clientPhoneId: "222", createdAt: { seconds: 5000 } as never }),
      ],
      clients: [],
    });
    expect(rows.map(r => r.phoneId)).toEqual(["222", "111"]);
  });

  it("falls back to the digits of the phone when the order carries no id", () => {
    const rows = buildSalesClients({
      orders: [order({ clientPhoneId: undefined as never, clientPhone: "+91 98765 43210" })],
      clients: [],
    });
    expect(rows[0].phoneId).toBe("919876543210");
  });

  it("ignores a client record for somebody they never sold to", () => {
    const rows = buildSalesClients({
      orders: [order()],
      clients: [client(), client({ phoneId: "919999999999", name: "Stranger" })],
    });
    expect(rows).toHaveLength(1);
  });
});

describe("which period a customer belongs to", () => {
  /**
   * The sale date, not the delivery date. Whether the tech team shipped in July or August is not a
   * fact about the seller's month, and filtering on it moves customers between months for reasons
   * the seller had no part in.
   */
  it("matches on when they bought", () => {
    const rows = buildSalesClients({
      orders: [order({ createdAt: { seconds: Math.floor(Date.parse("2026-07-15T10:00:00") / 1000) } as never })],
      clients: [],
    });

    expect(soldWithin(rows[0], day => day.startsWith("2026-07"))).toBe(true);
    expect(soldWithin(rows[0], day => day.startsWith("2026-08"))).toBe(false);
  });

  it("keeps a customer who bought at any point in the window", () => {
    const rows = buildSalesClients({
      orders: [
        order({ id: "o1", createdAt: { seconds: Math.floor(Date.parse("2026-06-01T10:00:00") / 1000) } as never }),
        order({ id: "o2", createdAt: { seconds: Math.floor(Date.parse("2026-07-15T10:00:00") / 1000) } as never }),
      ],
      clients: [],
    });
    expect(soldWithin(rows[0], day => day.startsWith("2026-07"))).toBe(true);
  });
});

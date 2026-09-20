import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Lead, Order, SaleDetail } from "@/types";

/**
 * The "ghost order" bug: deleting an order used to hard-delete the doc, so the next time the sale
 * was touched (a re-verify) it was recreated from scratch and reappeared in the queue. Deletion is
 * now a tombstone, and every recreation path must respect it. These lock that in.
 */

const store = new Map<string, any>();

vi.mock("firebase/firestore", () => {
  /*
    Keyed by `collection/id`, exactly as Firestore is.

    It used to key on the id alone, which quietly made `orders/o1` and `smm_campaigns/o1` the SAME
    document — so a write to a sold month's plan landed on its order and overwrote the very status
    these tests exist to pin. Two collections, two documents.
  */
  const key = (ref: { path: string }) => ref.path;
  const applyPatch = (ref: { path: string }, patch: Record<string, any>) => {
    store.set(key(ref), { ...(store.get(key(ref)) || {}), ...patch });
  };
  const idOf = (path: string) => path.split("/").slice(1).join("/");
  return {
    collection: (_db: unknown, name: string) => ({ name }),
    doc: (_db: unknown, name: string, id: string) => ({ id, path: `${name}/${id}` }),
    getDoc: async (ref: { path: string; id: string }) => ({
      exists: () => store.has(key(ref)),
      id: ref.id,
      data: () => store.get(key(ref)),
    }),
    setDoc: async (ref: { path: string }, data: any) => { store.set(key(ref), data); },
    updateDoc: async (ref: { path: string }, patch: any) => applyPatch(ref, patch),
    deleteDoc: async (ref: { path: string }) => { store.delete(key(ref)); },
    writeBatch: () => {
      const ops: (() => void)[] = [];
      return {
        update: (ref: { path: string }, patch: any) => ops.push(() => applyPatch(ref, patch)),
        delete: (ref: { path: string }) => ops.push(() => store.delete(key(ref))),
        set: (ref: { path: string }, data: any) => ops.push(() => store.set(key(ref), data)),
        commit: async () => { ops.forEach((op) => op()); ops.length = 0; },
      };
    },
    // Enough query support for findUnassignedOrderForPhone: equality constraints, within one
    // collection — a query never reaches across collections, and pretending it does hid the bug
    // above for as long as the fake existed.
    where: (field: string, _op: string, value: unknown) => ({ field, value }),
    query: (coll: { name: string }, ...constraints: { field: string; value: unknown }[]) => ({ coll, constraints }),
    getDocs: async (q: { coll?: { name: string }; constraints: { field: string; value: unknown }[] }) => {
      const prefix = q.coll?.name ? `${q.coll.name}/` : "";
      const docs = [...store.entries()]
        .filter(([path]) => path.startsWith(prefix))
        .filter(([, data]) => q.constraints.every((c) => data?.[c.field] === c.value))
        .map(([path, data]) => ({ id: idOf(path), data: () => data }));
      return { docs, empty: docs.length === 0 };
    },
    serverTimestamp: () => ({ __server: true }),
    Timestamp: { now: () => ({ seconds: 1_800_000_000 }) },
    arrayUnion: (...items: unknown[]) => ({ __arrayUnion: items }),
    // Used by the activity log and the history query, neither of which these tests exercise —
    // but a missing export is an import-time failure, not a lazy one.
    addDoc: async () => ({ id: "log1" }),
    orderBy: (field: string, dir?: string) => ({ field, dir }),
    limit: (n: number) => ({ n }),
  };
});

/** The order document, read from the fake store by its real path. */
const orderInStore = (id: string) => store.get(`orders/${id}`);
/** The social-media month for that same order, which is a DIFFERENT document. */
const campaignInStore = (id: string) => store.get(`smm_campaigns/${id}`);

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification: async () => undefined }));

const { upsertOrderForSale, deleteOrders, restoreOrders, purgeOrders, cancelOrderForSale, revertOrderToUnassigned, markOrderCompleted, orderDocId, findUnassignedOrderForPhone } =
  await import("@/services/orders");

const item: SaleDetail = {
  category: "promotional", packageKey: "30 Seconds + Poster", amount: 999,
  verificationStatus: "pending", submittedAt: { seconds: 1_700_000_000 },
} as SaleDetail;
const lead = { id: "lead1", phone: "+919876543210", displayName: "Ramesh", realName: "Sharma" } as Lead;
const id = orderDocId(lead.id, item, 0);

describe("the order carries the business the ad is FOR", () => {
  beforeEach(() => store.clear());

  it("uses the business name typed on the sale, not the client's name", async () => {
    const withBusiness = { ...item, requirement: { businessName: "Gupta Electronics" } } as SaleDetail;
    await upsertOrderForSale({ lead, item: withBusiness, itemIndex: 0, soldByName: "Anita" });
    const o = orderInStore(orderDocId(lead.id, withBusiness, 0)) as Order;
    expect(o.businessName).toBe("Gupta Electronics");
    // The client is kept alongside — one client can order ads for several businesses.
    expect(o.clientName).toBe("Sharma");
  });

  it("falls back to the client's name when no business was given", async () => {
    await upsertOrderForSale({ lead, item, itemIndex: 0, soldByName: "Anita" });
    expect((orderInStore(id) as Order).businessName).toBe("Sharma");
  });
});

describe("findUnassignedOrderForPhone (manual assignment adopts a waiting order)", () => {
  beforeEach(() => store.clear());

  it("finds the unassigned order for that client's number", async () => {
    await upsertOrderForSale({ lead, item, itemIndex: 0, soldByName: "Anita" });
    const found = await findUnassignedOrderForPhone("+91 98765 43210", "promotional");
    expect(found?.id).toBe(id);
  });

  it("ignores orders that are already assigned or deleted", async () => {
    await upsertOrderForSale({ lead, item, itemIndex: 0, soldByName: "Anita" });
    await deleteOrders([{ id } as Order]);
    expect(await findUnassignedOrderForPhone("+919876543210", "promotional")).toBeNull();
  });

  it("returns null for a number with no waiting order", async () => {
    await upsertOrderForSale({ lead, item, itemIndex: 0, soldByName: "Anita" });
    expect(await findUnassignedOrderForPhone("+919999999999")).toBeNull();
  });
});

beforeEach(() => store.clear());

async function seedOrder() {
  await upsertOrderForSale({ lead, item, itemIndex: 0, soldByName: "Anita", saleVerified: false });
}

describe("order deletion is a permanent tombstone", () => {
  it("deleteOrders marks the order deleted instead of removing the doc", async () => {
    await seedOrder();
    expect((orderInStore(id) as Order).status).toBe("unassigned");

    const n = await deleteOrders([{ id } as Order]);
    expect(n).toBe(1);
    const o = orderInStore(id) as Order;
    expect(o.status).toBe("deleted");
    expect(o.deleted).toBe(true);
  });

  it("a deleted order is NOT resurrected when the sale is re-verified", async () => {
    await seedOrder();
    await deleteOrders([{ id } as Order]);

    // Simulates a later sales-admin verify firing upsert again for the same sale item.
    await upsertOrderForSale({ lead, item, itemIndex: 0, soldByName: "Anita", saleVerified: true, verifierUid: "admin1" });

    const o = orderInStore(id) as Order;
    expect(o.status).toBe("deleted");
    expect(o.deleted).toBe(true);
  });

  it("cancelling the sale doesn't revive a deleted order", async () => {
    await seedOrder();
    await deleteOrders([{ id } as Order]);
    await cancelOrderForSale({ leadId: lead.id, item, itemIndex: 0 });
    expect((orderInStore(id) as Order).status).toBe("deleted");
  });

  it("re-queueing (tech work deleted) doesn't revive a deleted order", async () => {
    await seedOrder();
    await deleteOrders([{ id } as Order]);
    await revertOrderToUnassigned(id);
    expect((orderInStore(id) as Order).status).toBe("deleted");
  });

  it("completing orphaned work doesn't revive a deleted order", async () => {
    await seedOrder();
    await deleteOrders([{ id } as Order]);
    await markOrderCompleted(id);
    expect((orderInStore(id) as Order).status).toBe("deleted");
  });

  /**
   * The month goes with the order.
   *
   * Removing an order used to leave its social-media month running: the campaign is keyed on the
   * order, but nothing told it the order had gone. The member who had been assigned kept seeing the
   * client on their Social Media list, kept being reminded about its posts, and could still record
   * work against a job that no longer existed.
   */
  it("takes the order's social-media month off the board with it", async () => {
    await seedOrder();
    store.set(`smm_campaigns/${id}`, { id, orderId: id, status: "active" });

    await deleteOrders([{ id } as Order]);

    expect((orderInStore(id) as Order).status).toBe("deleted");
    expect(campaignInStore(id).status).toBe("removed");
  });

  it("puts the month back when the order is restored", async () => {
    await seedOrder();
    store.set(`smm_campaigns/${id}`, { id, orderId: id, status: "active" });
    await deleteOrders([{ id } as Order]);
    await restoreOrders([{ id } as Order]);

    expect((orderInStore(id) as Order).status).toBe("unassigned");
    expect(campaignInStore(id).status).toBe("active");
  });

  it("erases the month when the order is purged", async () => {
    await seedOrder();
    store.set(`smm_campaigns/${id}`, { id, orderId: id, status: "active" });
    await purgeOrders([{ id } as Order]);

    expect(orderInStore(id)).toBeUndefined();
    expect(campaignInStore(id)).toBeUndefined();
  });

  it("leaves an ordinary ad order alone — most orders have no month at all", async () => {
    await seedOrder();
    // No campaign document exists. Removing the order must not fail because of that.
    await expect(deleteOrders([{ id } as Order])).resolves.toBe(1);
    expect((orderInStore(id) as Order).status).toBe("deleted");
    expect(campaignInStore(id)).toBeUndefined();
  });

  it("a still-live order re-verifies normally (tombstone only blocks deleted ones)", async () => {
    await seedOrder();
    await upsertOrderForSale({ lead, item, itemIndex: 0, soldByName: "Anita", saleVerified: true, verifierUid: "admin1" });
    const o = orderInStore(id) as Order;
    expect(o.status).toBe("unassigned");
    expect(o.saleVerified).toBe(true);
  });
});

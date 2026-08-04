import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Lead, Order, SaleDetail } from "@/types";

/**
 * The "ghost order" bug: deleting an order used to hard-delete the doc, so the next time the sale
 * was touched (a re-verify) it was recreated from scratch and reappeared in the queue. Deletion is
 * now a tombstone, and every recreation path must respect it. These lock that in.
 */

const store = new Map<string, any>();

vi.mock("firebase/firestore", () => {
  const applyPatch = (id: string, patch: Record<string, any>) => {
    store.set(id, { ...(store.get(id) || {}), ...patch });
  };
  return {
    collection: (_db: unknown, name: string) => ({ name }),
    doc: (_db: unknown, _name: string, id: string) => ({ id }),
    getDoc: async (ref: { id: string }) => ({
      exists: () => store.has(ref.id),
      id: ref.id,
      data: () => store.get(ref.id),
    }),
    setDoc: async (ref: { id: string }, data: any) => { store.set(ref.id, data); },
    updateDoc: async (ref: { id: string }, patch: any) => applyPatch(ref.id, patch),
    deleteDoc: async (ref: { id: string }) => { store.delete(ref.id); },
    writeBatch: () => {
      const ops: (() => void)[] = [];
      return {
        update: (ref: { id: string }, patch: any) => ops.push(() => applyPatch(ref.id, patch)),
        delete: (ref: { id: string }) => ops.push(() => store.delete(ref.id)),
        set: (ref: { id: string }, data: any) => ops.push(() => store.set(ref.id, data)),
        commit: async () => { ops.forEach((op) => op()); ops.length = 0; },
      };
    },
    // Enough query support for findUnassignedOrderForPhone: equality constraints over the store.
    where: (field: string, _op: string, value: unknown) => ({ field, value }),
    query: (_coll: unknown, ...constraints: { field: string; value: unknown }[]) => ({ constraints }),
    getDocs: async (q: { constraints: { field: string; value: unknown }[] }) => {
      const docs = [...store.entries()]
        .filter(([, data]) => q.constraints.every((c) => data?.[c.field] === c.value))
        .map(([id, data]) => ({ id, data: () => data }));
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

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification: async () => undefined }));

const { upsertOrderForSale, deleteOrders, cancelOrderForSale, revertOrderToUnassigned, markOrderCompleted, orderDocId, findUnassignedOrderForPhone } =
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
    const o = store.get(orderDocId(lead.id, withBusiness, 0)) as Order;
    expect(o.businessName).toBe("Gupta Electronics");
    // The client is kept alongside — one client can order ads for several businesses.
    expect(o.clientName).toBe("Sharma");
  });

  it("falls back to the client's name when no business was given", async () => {
    await upsertOrderForSale({ lead, item, itemIndex: 0, soldByName: "Anita" });
    expect((store.get(id) as Order).businessName).toBe("Sharma");
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
    expect((store.get(id) as Order).status).toBe("unassigned");

    const n = await deleteOrders([{ id } as Order]);
    expect(n).toBe(1);
    const o = store.get(id) as Order;
    expect(o.status).toBe("deleted");
    expect(o.deleted).toBe(true);
  });

  it("a deleted order is NOT resurrected when the sale is re-verified", async () => {
    await seedOrder();
    await deleteOrders([{ id } as Order]);

    // Simulates a later sales-admin verify firing upsert again for the same sale item.
    await upsertOrderForSale({ lead, item, itemIndex: 0, soldByName: "Anita", saleVerified: true, verifierUid: "admin1" });

    const o = store.get(id) as Order;
    expect(o.status).toBe("deleted");
    expect(o.deleted).toBe(true);
  });

  it("cancelling the sale doesn't revive a deleted order", async () => {
    await seedOrder();
    await deleteOrders([{ id } as Order]);
    await cancelOrderForSale({ leadId: lead.id, item, itemIndex: 0 });
    expect((store.get(id) as Order).status).toBe("deleted");
  });

  it("re-queueing (tech work deleted) doesn't revive a deleted order", async () => {
    await seedOrder();
    await deleteOrders([{ id } as Order]);
    await revertOrderToUnassigned(id);
    expect((store.get(id) as Order).status).toBe("deleted");
  });

  it("completing orphaned work doesn't revive a deleted order", async () => {
    await seedOrder();
    await deleteOrders([{ id } as Order]);
    await markOrderCompleted(id);
    expect((store.get(id) as Order).status).toBe("deleted");
  });

  it("a still-live order re-verifies normally (tombstone only blocks deleted ones)", async () => {
    await seedOrder();
    await upsertOrderForSale({ lead, item, itemIndex: 0, soldByName: "Anita", saleVerified: true, verifierUid: "admin1" });
    const o = store.get(id) as Order;
    expect(o.status).toBe("unassigned");
    expect(o.saleVerified).toBe(true);
  });
});

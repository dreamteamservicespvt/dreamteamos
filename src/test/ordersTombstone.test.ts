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
    query: (...args: unknown[]) => args,
    where: (...args: unknown[]) => args,
    serverTimestamp: () => ({ __server: true }),
    Timestamp: { now: () => ({ seconds: 1_800_000_000 }) },
    arrayUnion: (...items: unknown[]) => ({ __arrayUnion: items }),
  };
});

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification: async () => undefined }));

const { upsertOrderForSale, deleteOrders, cancelOrderForSale, revertOrderToUnassigned, markOrderCompleted, orderDocId } =
  await import("@/services/orders");

const item: SaleDetail = {
  category: "promotional", packageKey: "30 Seconds + Poster", amount: 999,
  verificationStatus: "pending", submittedAt: { seconds: 1_700_000_000 },
} as SaleDetail;
const lead = { id: "lead1", phone: "+919876543210", displayName: "Ramesh", realName: "Sharma" } as Lead;
const id = orderDocId(lead.id, item, 0);

beforeEach(() => store.clear());

async function seedOrder() {
  await upsertOrderForSale({ lead, item, itemIndex: 0, soldByName: "Anita", saleVerified: false });
}

describe("order deletion is a permanent tombstone", () => {
  it("deleteOrders marks the order deleted instead of removing the doc", async () => {
    await seedOrder();
    expect((store.get(id) as Order).status).toBe("unassigned");

    const n = await deleteOrders([id]);
    expect(n).toBe(1);
    const o = store.get(id) as Order;
    expect(o.status).toBe("deleted");
    expect(o.deleted).toBe(true);
  });

  it("a deleted order is NOT resurrected when the sale is re-verified", async () => {
    await seedOrder();
    await deleteOrders([id]);

    // Simulates a later sales-admin verify firing upsert again for the same sale item.
    await upsertOrderForSale({ lead, item, itemIndex: 0, soldByName: "Anita", saleVerified: true, verifierUid: "admin1" });

    const o = store.get(id) as Order;
    expect(o.status).toBe("deleted");
    expect(o.deleted).toBe(true);
  });

  it("cancelling the sale doesn't revive a deleted order", async () => {
    await seedOrder();
    await deleteOrders([id]);
    await cancelOrderForSale({ leadId: lead.id, item, itemIndex: 0 });
    expect((store.get(id) as Order).status).toBe("deleted");
  });

  it("re-queueing (tech work deleted) doesn't revive a deleted order", async () => {
    await seedOrder();
    await deleteOrders([id]);
    await revertOrderToUnassigned(id);
    expect((store.get(id) as Order).status).toBe("deleted");
  });

  it("completing orphaned work doesn't revive a deleted order", async () => {
    await seedOrder();
    await deleteOrders([id]);
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

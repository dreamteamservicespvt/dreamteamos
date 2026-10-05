import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Lead, Order, SaleDetail } from "@/types";

/**
 * A discount over the member's limit no longer holds the sale back (2026-10-05, owner).
 *
 * A sales member may take 10% off on their own; past that the sales admin approves the discount.
 * Until 2026-10-05 such a sale had no order until they did. The owner's rule now: every sale reaches
 * the tech side the moment it is recorded — the approval still happens in Sales Approvals, and a sale
 * the sales admin rejects is pulled back like any rejected sale (`cancelOrderForSale`, not here).
 * Sales held under the old rule get their order when a sales admin opens Sales Approvals
 * (`releaseHeldSales`).
 *
 * This drives the real `upsertOrderForSale` against an in-memory store, because the guarantee is
 * about what does and does not end up in the `orders` collection.
 */

const store = new Map<string, any>();

/**
 * Keys are `collection/id`, not bare ids.
 *
 * They used to be bare, which quietly made every collection the same collection. A sale opens a
 * client chat under the ORDER's id — a different collection, the same id — and the moment that
 * started happening for held sales too, the chat doc landed on the order's key and "no order was
 * created" read as false. The product was right; the double was lying about where things live.
 */
const key = (name: string, id: string) => `${name}/${id}`;

vi.mock("firebase/firestore", () => {
  const applyPatch = (k: string, patch: Record<string, any>) => {
    store.set(k, { ...(store.get(k) || {}), ...patch });
  };
  return {
    collection: (_db: unknown, name: string) => ({ name }),
    doc: (_db: unknown, name: string, id: string) => ({ id, key: `${name}/${id}` }),
    getDoc: async (ref: { key: string; id: string }) => ({
      exists: () => store.has(ref.key),
      id: ref.id,
      data: () => store.get(ref.key),
    }),
    setDoc: async (ref: { key: string }, data: any) => { store.set(ref.key, data); },
    updateDoc: async (ref: { key: string }, patch: any) => applyPatch(ref.key, patch),
    deleteDoc: async (ref: { key: string }) => { store.delete(ref.key); },
    writeBatch: () => {
      const ops: (() => void)[] = [];
      return {
        update: (ref: { key: string }, patch: any) => ops.push(() => applyPatch(ref.key, patch)),
        delete: (ref: { key: string }) => ops.push(() => store.delete(ref.key)),
        set: (ref: { key: string }, data: any) => ops.push(() => store.set(ref.key, data)),
        commit: async () => { ops.forEach((op) => op()); ops.length = 0; },
      };
    },
    where: (field: string, _op: string, value: unknown) => ({ field, value }),
    query: (coll: { name: string }, ...constraints: { field: string; value: unknown }[]) =>
      ({ name: coll?.name, constraints }),
    getDocs: async (q: { name?: string; constraints: { field: string; value: unknown }[] }) => {
      const docs = [...store.entries()]
        .filter(([k]) => !q.name || k.startsWith(`${q.name}/`))
        .filter(([, data]) => q.constraints.every((c) => data?.[c.field] === c.value))
        .map(([k, data]) => ({ id: k.split("/").slice(1).join("/"), data: () => data }));
      return { docs, empty: docs.length === 0 };
    },
    serverTimestamp: () => ({ __server: true }),
    Timestamp: { now: () => ({ seconds: 1_800_000_000 }) },
    arrayUnion: (...items: unknown[]) => ({ __arrayUnion: items }),
    addDoc: async () => ({ id: "log1" }),
    orderBy: (field: string, dir?: string) => ({ field, dir }),
    limit: (n: number) => ({ n }),
  };
});

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification: async () => undefined }));

const { upsertOrderForSale, orderDocId } = await import("@/services/orders");

const lead = { id: "lead1", phone: "+919876543210", displayName: "Ramesh" } as Lead;

const sale = (over: Partial<SaleDetail> = {}): SaleDetail => ({
  category: "promotional",
  packageKey: "30 Seconds + Poster",
  amount: 999,
  verificationStatus: "pending",
  submittedAt: { seconds: 1_700_000_000 },
  ...over,
} as SaleDetail);

const send = (item: SaleDetail, saleVerified = false) =>
  upsertOrderForSale({ lead, item, itemIndex: 0, soldByName: "Kusuma", saleVerified });

/** The key an ORDER would live under — the collection is part of it, deliberately. */
const idFor = (item: SaleDetail) => key("orders", orderDocId(lead.id, item, 0));

beforeEach(() => store.clear());

describe("an ordinary sale", () => {
  it("reaches the tech queue at once, exactly as before", async () => {
    const item = sale();
    await send(item);
    expect(store.has(idFor(item))).toBe(true);
  });

  it("reaches it when the discount is within what a member may give", async () => {
    const item = sale({ discountNeedsApproval: false, earnedDiscountAmount: 100 });
    await send(item);
    expect(store.has(idFor(item))).toBe(true);
  });
});

describe("a sale discounted past the member's own limit (2026-10-05)", () => {
  it("reaches the tech queue at once, marked as not yet approved", async () => {
    const item = sale({ discountNeedsApproval: true, discountApproval: "pending" });
    await send(item);
    const order = store.get(idFor(item)) as Order;
    expect(order?.status).toBe("unassigned");
    expect(order?.saleVerified).toBe(false); // the tech side's "Pending approval" chip
  });

  it("is signed off on the same order when the sales admin approves it", async () => {
    const item = sale({ discountNeedsApproval: true, discountApproval: "pending" });
    await send(item);
    await send({ ...item, discountApproval: "approved", verificationStatus: "verified" }, true);
    expect(store.get(idFor(item))?.saleVerified).toBe(true);
    expect([...store.keys()].filter((k) => k.startsWith("orders/"))).toHaveLength(1);
  });
});

describe("a sale that was already with the tech team", () => {
  it("stays with them when an edit pushes its discount past the limit — and keeps its job", async () => {
    const item = sale();
    await send(item);
    store.set(idFor(item), { ...store.get(idFor(item)), status: "assigned", assignedTo: "tech1" });

    const discounted = { ...item, amount: 800, discountNeedsApproval: true, discountApproval: "pending" as const };
    await send(discounted);
    expect(store.get(idFor(discounted))).toMatchObject({ status: "assigned", assignedTo: "tech1", amount: 800 });
  });
});

describe("sales held under the old rule (releaseHeldSales)", () => {
  it("get their order when a sales admin opens Sales Approvals — once", async () => {
    const { releaseHeldSales } = await import("@/services/orders");
    const held = sale({ discountNeedsApproval: true, discountApproval: "pending" });
    const fine = sale({ submittedAt: { seconds: 1_700_000_500 } } as Partial<SaleDetail>);
    const rejected = sale({ discountNeedsApproval: true, verificationStatus: "rejected", submittedAt: { seconds: 1_700_000_900 } } as Partial<SaleDetail>);
    const old = { ...lead, assignedTo: "m1", saleItems: [held, fine, rejected] } as Lead;

    expect(await releaseHeldSales([old], () => "Kusuma")).toBe(1);
    expect(store.get(key("orders", orderDocId(lead.id, held, 0)))?.saleVerified).toBe(false);
    expect(store.has(key("orders", orderDocId(lead.id, fine, 1)))).toBe(false); // not held: not this sweep's
    expect(store.has(key("orders", orderDocId(lead.id, rejected, 2)))).toBe(false);
    expect(await releaseHeldSales([old], () => "Kusuma")).toBe(0);
  });
});

describe("what the order carries for a custom-length sale", () => {
  it("passes the base service and the length through to the tech side", async () => {
    const item = sale({
      category: "custom",
      packageKey: "custom",
      customBaseCategory: "promotional",
      customDurationSeconds: 120,
      amount: 3743,
    });
    await send(item);
    const order = store.get(idFor(item)) as Order;
    expect(order.customBaseCategory).toBe("promotional");
    expect(order.customDurationSeconds).toBe(120);
  });

  it("passes the earned discount through, so the admin can see what was given", async () => {
    const item = sale({
      earnedDiscount: { review: { screenshotUrl: "https://cdn.test/r.png" } },
      earnedDiscountAmount: 100,
    });
    await send(item);
    const order = store.get(idFor(item)) as Order;
    expect(order.earnedDiscount?.review?.screenshotUrl).toBe("https://cdn.test/r.png");
    expect(order.earnedDiscountAmount).toBe(100);
  });
});

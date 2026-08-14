import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Lead, Order, SaleDetail } from "@/types";

/**
 * A price nobody has agreed does not reach the people who build against it.
 *
 * A sales member may take 10% off on their own. Past that the sales admin has to confirm it, and
 * until they do there is no order at all — not a hidden one, not a badged one. The tech team's
 * screens are built to show them work they can start, and work that has started cannot be
 * un-started: an ad built against a discount the company never agreed to has already cost the
 * money it was supposed to protect.
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

describe("a sale discounted past the member's own limit", () => {
  it("does not reach the tech queue at all", async () => {
    const item = sale({ discountNeedsApproval: true, discountApproval: "pending" });
    await send(item);
    expect(store.has(idFor(item))).toBe(false);
  });

  it("stays out of it while the sales admin has not decided", async () => {
    const item = sale({ discountNeedsApproval: true });
    await send(item);
    await send(item);          // a sale edit re-runs this; it must not slip through on a retry
    expect(store.has(idFor(item))).toBe(false);
  });

  it("stays out of it after the sales admin turns the price down", async () => {
    const item = sale({ discountNeedsApproval: true, discountApproval: "rejected" });
    await send(item);
    expect(store.has(idFor(item))).toBe(false);
  });

  it("arrives the moment the sales admin agrees the price", async () => {
    const held = sale({ discountNeedsApproval: true, discountApproval: "pending" });
    await send(held);
    expect(store.has(idFor(held))).toBe(false);

    const approved = { ...held, discountApproval: "approved" as const, verificationStatus: "verified" as const };
    await send(approved, true);
    const order = store.get(idFor(approved)) as Order;
    expect(order).toBeTruthy();
    expect(order.saleVerified).toBe(true);
  });
});

describe("a sale that was already with the tech team", () => {
  it("is pulled back when an edit pushes its discount past the limit", async () => {
    // The member edited the price after the order went out. Leaving it standing would have the
    // tech team building against a figure that is no longer the agreed one. Nothing has been
    // assigned yet, so the order simply goes — there is nobody to warn.
    const item = sale();
    await send(item);
    expect(store.get(idFor(item))?.status).toBe("unassigned");

    const discounted = { ...item, discountNeedsApproval: true, discountApproval: "pending" as const };
    await send(discounted);
    expect(store.has(idFor(discounted))).toBe(false);
  });

  it("cancels loudly instead of vanishing when a member is already building it", async () => {
    const item = sale();
    await send(item);
    // The tech admin has given the job to somebody.
    store.set(idFor(item), { ...store.get(idFor(item)), status: "assigned", assignedTo: "tech1" });

    const discounted = { ...item, discountNeedsApproval: true, discountApproval: "pending" as const };
    await send(discounted);
    // Still there, and marked — a job disappearing out from under the person doing it is worse
    // than a job that says why it stopped.
    expect(store.get(idFor(discounted))?.status).toBe("cancelled");
  });

  it("comes back when the admin approves it", async () => {
    const item = sale();
    await send(item);
    const discounted = { ...item, discountNeedsApproval: true, discountApproval: "pending" as const };
    await send(discounted);
    expect(store.has(idFor(item))).toBe(false);

    await send({ ...discounted, discountApproval: "approved" }, true);
    expect(store.get(idFor(item))?.status).toBe("unassigned");
    expect(store.get(idFor(item))?.saleVerified).toBe(true);
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

import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Every sale opens a client chat. No exceptions.
 *
 * The room is where the client's photos, logo, tagline and changes of mind go, and it has to exist
 * from the moment of sale because that is when the client is talking. One case did not get one: a
 * sale discounted past the member's own authority returned early — no order, and with it no chat.
 *
 * Withholding the ORDER is deliberate and stays: the tech team must never be handed work at a price
 * nobody has agreed. But that was never a reason to take away the place the brief goes, and it is
 * the worst possible case to take it away in — the price is still being negotiated, so the client is
 * mid-conversation. The room is team-only until somebody is assigned, so opening it early exposes
 * nothing to the customer and puts nothing in the tech queue.
 */

const calls = { ensureSaleOrderChat: [] as unknown[], cancelled: 0, setDoc: 0 };

vi.mock("@/services/firebase", () => ({ db: {}, staffDb: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), doc: vi.fn(() => ({})), getDoc: vi.fn(async () => ({ exists: () => false })),
  getDocs: vi.fn(async () => ({ docs: [], empty: true })),
  setDoc: vi.fn(async () => { calls.setDoc += 1; }),
  updateDoc: vi.fn(), deleteDoc: vi.fn(), addDoc: vi.fn(),
  query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(), arrayUnion: vi.fn(), arrayRemove: vi.fn(), increment: vi.fn(),
  writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn() })),
  Timestamp: { now: () => ({ seconds: 1, toMillis: () => 1000 }), fromMillis: (n: number) => ({ seconds: n / 1000 }) },
  runTransaction: vi.fn(),
}));
vi.mock("@/services/orderChat", () => ({
  ensureSaleOrderChat: vi.fn(async (input: unknown) => { calls.ensureSaleOrderChat.push(input); }),
  deleteOrderChat: vi.fn(),
}));
vi.mock("@/services/notifications", () => ({ createNotification: vi.fn(), notifyRole: vi.fn() }));
vi.mock("@/services/activity", () => ({ logActivity: vi.fn() }));

import { upsertOrderForSale } from "@/services/orders";
import type { Lead, SaleDetail } from "@/types";

const lead = {
  id: "lead1",
  phone: "+919849834102",
  displayName: "Fish Shop",
  realName: "Fish Shop",
  assignedTo: "member1",
} as unknown as Lead;

const saleAt = { seconds: 1_755_000_000, toMillis: () => 1_755_000_000_000 };

const sale = (over: Partial<SaleDetail> = {}): SaleDetail => ({
  category: "promotional",
  packageKey: "basic",
  amount: 899,
  verificationStatus: "pending",
  submittedAt: saleAt,
  ...over,
} as SaleDetail);

beforeEach(() => {
  calls.ensureSaleOrderChat = [];
  calls.cancelled = 0;
  calls.setDoc = 0;
});

describe("a sale within the member's own discount authority", () => {
  it("opens the chat", async () => {
    await upsertOrderForSale({ lead, item: sale(), itemIndex: 0, soldByName: "Kusuma" });
    expect(calls.ensureSaleOrderChat).toHaveLength(1);
  });
});

describe("a sale discounted past what the member may give", () => {
  const held = sale({ discountNeedsApproval: true, discountApproval: null } as Partial<SaleDetail>);

  /** The bug: this sale used to get no room at all. */
  it("still opens the chat", async () => {
    await upsertOrderForSale({ lead, item: held, itemIndex: 0, soldByName: "Kusuma" });
    expect(calls.ensureSaleOrderChat).toHaveLength(1);
  });

  it("puts the seller on it, so it reaches their Client Chats", async () => {
    await upsertOrderForSale({ lead, item: held, itemIndex: 0, soldByName: "Kusuma" });
    const input = calls.ensureSaleOrderChat[0] as { soldByUid?: string; clientPhone?: string };
    expect(input.soldByUid).toBe("member1");
    expect(input.clientPhone).toBe("+919849834102");
  });

  /** The room and the order are different things, and only one of them is being withheld. */
  it("still does not create the order", async () => {
    await upsertOrderForSale({ lead, item: held, itemIndex: 0, soldByName: "Kusuma" });
    expect(calls.setDoc).toBe(0);
  });

  /** Once the price is agreed, the order appears and attaches to the room already there. */
  it("creates the order once the discount is approved", async () => {
    const approved = sale({ discountNeedsApproval: true, discountApproval: "approved" } as Partial<SaleDetail>);
    await upsertOrderForSale({ lead, item: approved, itemIndex: 0, soldByName: "Kusuma" });
    expect(calls.setDoc).toBeGreaterThan(0);
    expect(calls.ensureSaleOrderChat).toHaveLength(1);
  });

  /**
   * Both paths must key the room the same way, or approval would open a SECOND room and the brief
   * captured while the price was being agreed would be stranded in the first.
   */
  it("uses the same room id before and after approval", async () => {
    await upsertOrderForSale({ lead, item: held, itemIndex: 0, soldByName: "Kusuma" });
    const beforeId = (calls.ensureSaleOrderChat[0] as { orderId: string }).orderId;

    calls.ensureSaleOrderChat = [];
    const approved = sale({ discountNeedsApproval: true, discountApproval: "approved" } as Partial<SaleDetail>);
    await upsertOrderForSale({ lead, item: approved, itemIndex: 0, soldByName: "Kusuma" });
    const afterId = (calls.ensureSaleOrderChat[0] as { orderId: string }).orderId;

    expect(beforeId).toBe(afterId);
  });
});

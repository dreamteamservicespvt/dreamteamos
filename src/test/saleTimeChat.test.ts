import { describe, it, expect, vi, beforeEach } from "vitest";
import { orderChatIdOf } from "@/utils/orderChatId";

/**
 * The room now opens with the SALE, not with the assignment.
 *
 * Three things have to hold for that to be safe, and each of them is a way a customer's
 * conversation could quietly be destroyed:
 *
 *  1. A sale that is edited must not reset its own room. `upsertOrderForSale` runs again on
 *     approval and on every subsequent edit, and the room holds unread counters, a participant
 *     list and the client's whole thread.
 *  2. An assignment must JOIN the room rather than open a second one. Getting the key wrong gives
 *     every order-backed job two rooms — one with the brief in it, one the tech member is looking
 *     at — and neither side can see the other.
 *  3. The customer must not be let in before somebody is responsible for answering them.
 */

const store = new Map<string, Record<string, unknown>>();

const ARRAY_UNION = "__arrayUnion";
const SERVER_TS = "__serverTimestamp";

/** Applies the sentinels the real Firestore would, so a patch reads back like a document. */
function applyPatch(id: string, patch: Record<string, unknown>) {
  const current = { ...(store.get(id) || {}) };
  for (const [key, value] of Object.entries(patch)) {
    const union = value as { [ARRAY_UNION]?: unknown[] };
    if (union && typeof union === "object" && ARRAY_UNION in union) {
      const existing = (current[key] as unknown[]) || [];
      current[key] = Array.from(new Set([...existing, ...(union[ARRAY_UNION] || [])]));
      continue;
    }
    // Dotted paths, as used for `participantNames.<uid>`.
    if (key.includes(".")) {
      const [head, tail] = key.split(".");
      current[head] = { ...((current[head] as Record<string, unknown>) || {}), [tail]: value };
      continue;
    }
    current[key] = value;
  }
  store.set(id, current);
}

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join("/") }),
  doc: (_db: unknown, _col: string, id: string) => ({ id }),
  getDoc: async (ref: { id: string }) => ({
    exists: () => store.has(ref.id),
    data: () => store.get(ref.id),
  }),
  setDoc: async (ref: { id: string }, value: Record<string, unknown>) => { store.set(ref.id, value); },
  updateDoc: async (ref: { id: string }, patch: Record<string, unknown>) => {
    if (!store.has(ref.id)) throw new Error("No document to update");
    applyPatch(ref.id, patch);
  },
  deleteDoc: async (ref: { id: string }) => { store.delete(ref.id); },
  addDoc: async () => ({ id: "msg1" }),
  serverTimestamp: () => SERVER_TS,
  increment: (n: number) => n,
  arrayUnion: (...items: unknown[]) => ({ [ARRAY_UNION]: items }),
  arrayRemove: () => ({}),
}));

vi.mock("@/services/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("@/utils/platform", () => ({ isNative: () => false }));

const {
  ensureSaleOrderChat, attachAssignmentToChat, detachAssignmentFromChat, createOrderChat,
} = await import("@/services/orderChat");

const room = (id: string) => store.get(id) as Record<string, any>;

const sale = {
  orderId: "order1",
  category: "promotional",
  businessName: "Sharma Electronics",
  clientName: "Mr Sharma",
  clientPhone: "+919876543210",
  soldByUid: "sales1",
  soldByName: "Ravi",
  salesAdminUid: "salesadmin1",
};

beforeEach(() => { store.clear(); });

describe("the room a sale opens", () => {
  it("exists as soon as the sale is taken, with the seller in it", async () => {
    await ensureSaleOrderChat(sale);

    expect(room("order1")).toBeTruthy();
    expect(room("order1").participants).toContain("sales1");
    expect(room("order1").participants).toContain("salesadmin1");
    expect(room("order1").businessName).toBe("Sharma Electronics");
  });

  /** Nobody is answering yet, so nobody may be invited. */
  it("is not open to the customer", async () => {
    await ensureSaleOrderChat(sale);
    expect(room("order1").clientReady).toBe(false);
    expect(room("order1").memberUid).toBe("");
  });

  /**
   * The one that would destroy real conversations. `upsertOrderForSale` runs on every edit of the
   * sale, and an unconditional write would blank the thread's own state each time.
   */
  it("survives the sale being edited, without resetting the conversation", async () => {
    await ensureSaleOrderChat(sale);
    // Somebody has since read and written in it.
    applyPatch("order1", { unreadCounts: { sales1: 4 }, lastMessage: "Here is my logo" });

    await ensureSaleOrderChat({ ...sale, businessName: "Sharma Electronics & Sons" });

    expect(room("order1").businessName).toBe("Sharma Electronics & Sons");
    expect(room("order1").unreadCounts).toEqual({ sales1: 4 });
    expect(room("order1").lastMessage).toBe("Here is my logo");
  });

  it("does not invent a second room on re-entry", async () => {
    await ensureSaleOrderChat(sale);
    await ensureSaleOrderChat(sale);
    expect(store.size).toBe(1);
  });
});

describe("handing the room to the member who gets the job", () => {
  const attach = () => attachAssignmentToChat({
    chatId: "order1",
    assignmentId: "assign1",
    accessCode: "4321",
    uniqueId: "P014",
    memberUid: "tech1",
    memberName: "Hasini",
    assignerUid: "admin1",
    assignerName: "Admin",
    techAdminUid: "admin1",
  });

  it("joins the conversation the seller has been using, not a new one", async () => {
    await ensureSaleOrderChat(sale);
    applyPatch("order1", { lastMessage: "Client wants the logo in blue" });

    await attach();

    expect(store.size).toBe(1);
    expect(room("order1").lastMessage).toBe("Client wants the logo in blue");
    expect(room("order1").assignmentId).toBe("assign1");
    expect(room("order1").memberUid).toBe("tech1");
    expect(room("order1").uniqueId).toBe("P014");
  });

  it("keeps the seller in the room and adds the tech side", async () => {
    await ensureSaleOrderChat(sale);
    await attach();

    expect(room("order1").participants).toEqual(
      expect.arrayContaining(["sales1", "salesadmin1", "tech1", "admin1"]),
    );
    expect(room("order1").participantNames.tech1).toBe("Hasini");
  });

  it("is the moment the customer may be let in", async () => {
    await ensureSaleOrderChat(sale);
    expect(room("order1").clientReady).toBe(false);

    await attach();
    expect(room("order1").clientReady).toBe(true);
  });

  /** A sale taken before rooms opened at sale time has nothing to attach to. */
  it("falls back to opening a room outright when there is none", async () => {
    await attachAssignmentToChat({
      chatId: "order1",
      assignmentId: "assign1",
      accessCode: "4321",
      uniqueId: "P014",
      memberUid: "tech1",
      assignerUid: "admin1",
      fallback: {
        chatId: "order1",
        accessCode: "4321",
        uniqueId: "P014",
        memberUid: "tech1",
        assignerUid: "admin1",
        orderId: "order1",
      },
    });

    expect(room("order1")).toBeTruthy();
    expect(room("order1").memberUid).toBe("tech1");
    expect(room("order1").clientReady).toBe(true);
  });
});

describe("taking the job back off a member", () => {
  it("leaves the conversation standing for whoever picks it up next", async () => {
    await ensureSaleOrderChat(sale);
    await attachAssignmentToChat({
      chatId: "order1", assignmentId: "assign1", accessCode: "4321", uniqueId: "P014",
      memberUid: "tech1", memberName: "Hasini", assignerUid: "admin1",
    });
    applyPatch("order1", { lastMessage: "Here is my logo" });

    await detachAssignmentFromChat("order1", "Back to the queue");

    // The room and everyone in it survive; only the assignee is cleared.
    expect(store.has("order1")).toBe(true);
    expect(room("order1").memberUid).toBe("");
    expect(room("order1").assignmentId).toBeNull();
    expect(room("order1").status).toBe("open");
    // The seller stays, because the sale is still theirs and so is the client.
    expect(room("order1").participants).toContain("sales1");
    expect(room("order1").businessName).toBe("Sharma Electronics");
    // The note explaining what happened is the newest thing in the thread, which is the point of
    // writing it — the previous preview being replaced is correct, not lost history.
    expect(room("order1").lastMessage).toBe("Back to the queue");
    expect(room("order1").lastMessageBy).toBe("system");
  });

  /**
   * A customer already in their own thread must not be shut out because the work moved desks.
   * This is why `clientReady` is set once and never cleared.
   */
  it("does not lock out a customer who is already in the conversation", async () => {
    await ensureSaleOrderChat(sale);
    await attachAssignmentToChat({
      chatId: "order1", assignmentId: "assign1", accessCode: "4321", uniqueId: "P014",
      memberUid: "tech1", assignerUid: "admin1",
    });

    await detachAssignmentFromChat("order1");

    expect(room("order1").clientReady).toBe(true);
  });
});

describe("which document a job's chat lives in", () => {
  it("uses the order's room for work that came from a sale", () => {
    expect(orderChatIdOf({ id: "assign1", chatId: "order1" })).toBe("order1");
  });

  /**
   * The compatibility rule the whole re-keying rests on. Hundreds of rooms already exist under an
   * assignment id, some holding links a customer has in their WhatsApp history — deriving the id
   * any other way would move those rooms out from under their own conversations.
   */
  it("leaves an older assignment on its own room", () => {
    expect(orderChatIdOf({ id: "assign1" })).toBe("assign1");
    expect(orderChatIdOf({ id: "assign1", chatId: null })).toBe("assign1");
  });

  it("keeps a direct Work Assign job on its own room, since it has no order", () => {
    expect(orderChatIdOf({ id: "direct1", chatId: undefined })).toBe("direct1");
  });
});

describe("a job created with no sale behind it", () => {
  it("still opens its own room, client-ready from the start", async () => {
    await createOrderChat({
      assignmentId: "direct1",
      accessCode: "1111",
      uniqueId: "W002",
      memberUid: "tech1",
      assignerUid: "admin1",
    });

    expect(room("direct1").memberUid).toBe("tech1");
    expect(room("direct1").clientReady).toBe(true);
  });
});

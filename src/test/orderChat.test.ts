import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The client chat's rules of life: it opens with the work, closes when the work is delivered, and
 * opens again when the work moves to someone else.
 *
 * These are the transitions that decide whether a customer can type, so they are worth pinning
 * down away from the UI: a chat that stays open after delivery invites "one more small change"
 * forever, and one that stays shut after a reassignment leaves the new member unreachable.
 */

type Doc = Record<string, unknown>;

/** A stand-in Firestore: paths to documents, plus every document added to a subcollection. */
const fake = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  const added: { path: string; data: Record<string, unknown> }[] = [];
  return { store, added };
});

const { store, added } = fake;

vi.mock("@/services/firebase", () => ({ db: {}, firebaseConfig: {} }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  setDoc: vi.fn(async (ref: { path: string }, data: Doc) => { fake.store.set(ref.path, data); }),
  updateDoc: vi.fn(async (ref: { path: string }, patch: Doc) => {
    fake.store.set(ref.path, { ...(fake.store.get(ref.path) || {}), ...patch });
  }),
  deleteDoc: vi.fn(async (ref: { path: string }) => { fake.store.delete(ref.path); }),
  getDoc: vi.fn(async (ref: { path: string }) => {
    const data = fake.store.get(ref.path);
    return { exists: () => !!data, data: () => data, id: ref.path.split("/").pop() };
  }),
  addDoc: vi.fn(async (ref: { path: string }, data: Doc) => {
    fake.added.push({ path: ref.path, data });
    return { id: `m${fake.added.length}` };
  }),
  serverTimestamp: () => "TS",
  increment: (n: number) => ({ __increment: n }),
  arrayUnion: (...v: unknown[]) => ({ __arrayUnion: v }),
  arrayRemove: (...v: unknown[]) => ({ __arrayRemove: v }),
}));
vi.mock("@/utils/platform", () => ({ isNative: () => false }));

import { updateDoc } from "firebase/firestore";

import {
  createOrderChat, lockOrderChat, reopenOrderChat, deleteOrderChat, buildClientChatMessage,
  messagePreview, sendOrderChatMessage,
} from "@/services/orderChat";

const CHAT = "order_chats/w1";

async function seedRoom() {
  await createOrderChat({
    assignmentId: "w1",
    accessCode: "4821",
    uniqueId: "P001",
    businessName: "Sharma Electronics",
    clientPhone: "919999999999",
    memberUid: "member1",
    memberName: "Hasini",
    assignerUid: "leader1",
    assignerName: "Lead",
    techAdminUid: "admin1",
    orderId: "o1",
  });
}

describe("the client chat's lifecycle", () => {
  beforeEach(() => {
    store.clear();
    added.length = 0;
    vi.clearAllMocks();
  });

  it("opens with the assignment, holding the same code and everyone who may read it", async () => {
    await seedRoom();
    const room = store.get(CHAT)!;
    expect(room.status).toBe("open");
    expect(room.accessCode).toBe("4821");
    expect(room.memberUid).toBe("member1");
    // The member, whoever assigned it, and the admin over that team — nobody else.
    expect(room.participants).toEqual(["member1", "leader1", "admin1"]);
  });

  it("goes view-only when the work is delivered, and says so in the conversation", async () => {
    await seedRoom();
    await lockOrderChat("w1");
    expect(store.get(CHAT)!.status).toBe("locked");
    const system = added.filter((a) => a.path === "order_chats/w1/messages");
    expect(system).toHaveLength(1);
    expect(String(system[0].data.text)).toMatch(/view-only/i);
    expect(system[0].data.type).toBe("system");
  });

  it("does not announce the same closure twice", async () => {
    await seedRoom();
    await lockOrderChat("w1");
    await lockOrderChat("w1");
    expect(added.filter((a) => a.path === "order_chats/w1/messages")).toHaveLength(1);
  });

  it("refuses to send into a closed chat", async () => {
    await seedRoom();
    await lockOrderChat("w1");
    await expect(sendOrderChatMessage({} as never, {
      chatId: "w1", senderId: "client", senderName: "Sharma", text: "one more change please",
    })).rejects.toThrow(/closed/i);
  });

  it("re-opens for the new member when the work is reassigned, and calls follow them", async () => {
    await seedRoom();
    await lockOrderChat("w1");
    await reopenOrderChat("w1", { uid: "member2", name: "Ravi" });

    const room = store.get(CHAT)!;
    expect(room.status).toBe("open");
    expect(room.memberUid).toBe("member2");
    expect(room.memberName).toBe("Ravi");
    expect(room.participants).toEqual({ __arrayUnion: ["member2"] });

    // The room moves to Ravi, but the CUSTOMER is never told his name. Every staff message sits on
    // one unnamed side of this conversation on purpose — they bought from a business, not from an
    // individual — and this system line was the one place a real name leaked into their view.
    const lastLine = added[added.length - 1];
    expect(String(lastLine.data.text)).toMatch(/reassigned within our team/i);
    expect(String(lastLine.data.text)).not.toMatch(/Ravi/);
  });

  it("re-opens without a member change when work is sent back for edits", async () => {
    await seedRoom();
    await lockOrderChat("w1");
    await reopenOrderChat("w1", undefined, "The team is making changes — this chat is open again.");

    expect(store.get(CHAT)!.status).toBe("open");
    expect(store.get(CHAT)!.memberUid).toBe("member1");
    expect(String(added[added.length - 1].data.text)).toMatch(/making changes/i);
  });

  it("goes away with the assignment", async () => {
    await seedRoom();
    await deleteOrderChat("w1");
    expect(store.has(CHAT)).toBe(false);
  });

  it("survives a missing room rather than taking the caller down with it", async () => {
    await expect(lockOrderChat("nope")).resolves.toBeUndefined();
    await expect(reopenOrderChat("nope")).resolves.toBeUndefined();
  });
});

describe("what the client is sent", () => {
  it("carries the link, and asks the customer for nothing at all", () => {
    const message = buildClientChatMessage({
      businessName: "Sharma Electronics",
      uniqueId: "P001",
      chatId: "abc123",
      category: "promotional",
    });
    expect(message).toContain("/c/abc123");
    expect(message).toContain("Sharma Electronics");
    expect(message).toMatch(/nothing to install/i);
    // The code was the single biggest reason a chat was never opened — see api/order-chat.ts.
    expect(message).toMatch(/no code to enter/i);
    expect(message).not.toMatch(/🔑/);
    // Names what was bought...
    expect(message).toContain("Promotional Ad");
    // ...says what the chat is for...
    expect(message).toMatch(/preview/i);
    expect(message).toMatch(/final ad/i);
    // ...and never names the member. A client who asks for one person by name is stranded the day
    // that job moves to somebody else.
    expect(message).not.toMatch(/Hasini/);
    expect(message).toMatch(/our team/i);
  });

  it("still reads properly for a job with no business name saved", () => {
    const message = buildClientChatMessage({ chatId: "abc123" });
    expect(message).toContain("/c/abc123");
    expect(message).not.toContain("undefined");
  });
});

describe("message previews", () => {
  it("names the kind of attachment rather than showing an empty line", () => {
    expect(messagePreview("voice", "")).toBe("🎤 Voice message");
    expect(messagePreview("image", "")).toBe("📷 Photo");
    expect(messagePreview("video", "")).toBe("🎬 Video");
    expect(messagePreview("file", "", "brief.pdf")).toBe("📎 brief.pdf");
    expect(messagePreview("text", "hello")).toBe("hello");
  });
});

describe("sending a message", () => {
  beforeEach(() => { store.clear(); added.length = 0; vi.clearAllMocks(); });

  it("bumps unread for everyone not currently reading, including the client", async () => {
    await seedRoom();
    await sendOrderChatMessage({} as never, {
      chatId: "w1", senderId: "member1", senderName: "Hasini", text: "Here is the first cut",
    });

    const room = store.get(CHAT)!;
    expect(room.lastMessage).toBe("Here is the first cut");
    expect(room.lastMessageBy).toBe("member1");
    // The sender is never bumped; everyone else on the room is, and so is the customer.
    expect(room["unreadCounts.member1"]).toBeUndefined();
    expect(room["unreadCounts.leader1"]).toEqual({ __increment: 1 });
    expect(room["unreadCounts.admin1"]).toEqual({ __increment: 1 });
    expect(room["unreadCounts.client"]).toEqual({ __increment: 1 });
  });

  it("leaves out anyone who has the room open", async () => {
    await seedRoom();
    await updateDoc({ path: CHAT } as never, { activeUsers: ["client"] });
    await sendOrderChatMessage({} as never, {
      chatId: "w1", senderId: "member1", senderName: "Hasini", text: "ready?",
    });
    expect(store.get(CHAT)!["unreadCounts.client"]).toBeUndefined();
  });
});

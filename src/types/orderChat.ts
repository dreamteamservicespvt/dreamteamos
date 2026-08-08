/**
 * The per-assignment chat that replaces making a WhatsApp group for every order.
 *
 * One room per work assignment, holding the assigned member, the team leader, the tech admin and
 * the one client the job is for. The client is not a user of this system and never becomes one —
 * they hold a link and the same four digits the assignment already carries, which is why the code
 * lives on the room as well as on the assignment.
 */

import type { WorkAssignmentStatus } from "@/types";

/** Who wrote a message. Staff are their uid; the customer is always this literal. */
export const CLIENT_SENDER_ID = "client";

/**
 * Which side of the company a staff message came from.
 *
 * Stamped on the message rather than derived from the room's participant lists, because a person's
 * role can change and a message is a record of who said something *at the time*. It is also what
 * lets the customer's screen name the sales member while keeping the tech team anonymous — see the
 * rendering rule in components/order-chat/OrderChatPanel.
 *
 * Absent on every message written before sales could reach this room, which reads as "tech" — and
 * that is exactly right, because until now nobody else could write here.
 */
export type OrderChatSenderRole = "tech" | "sales";

/** The key a room's unread counter and presence list use for the customer. */
export type OrderChatViewerKey = string; // a staff uid, or CLIENT_SENDER_ID

export type OrderChatStatus = "open" | "locked";

export type OrderChatMessageType =
  | "text" | "image" | "video" | "file" | "voice" | "emoji"
  /** Written by the app, not a person: "work reassigned to X", "work delivered". */
  | "system";

export interface OrderChatMessage {
  id: string;
  senderId: string;
  /** Denormalised so the client sees "Ravi" without being able to read the staff directory. */
  senderName: string;
  /** Tech or sales. Absent on messages written before sales joined these rooms. */
  senderRole?: OrderChatSenderRole;
  text: string;
  type?: OrderChatMessageType;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  /** Voice note length in seconds. */
  duration?: number;
  replyToId?: string;
  replyToText?: string;
  replyToSenderId?: string;
  deletedAt?: unknown;
  createdAt: unknown;
}

export interface OrderChatDoc {
  id: string;
  /** Doc id is the assignment id; kept as a field too so a query result reads on its own. */
  assignmentId: string;
  orderId?: string | null;
  /** The readable job id (P001 / W002) — what the client is told the chat is about. */
  uniqueId: string;
  /** The catalog key of what was ordered, so the client's message can name it. */
  category?: string;
  businessName: string;
  clientName?: string;
  /** Normalised WhatsApp number, used to pre-fill the share message. Never shown to the member. */
  clientPhone?: string;
  /** Mirrored from the assignment. Verified on the server; never sent to the client's browser. */
  accessCode: string;
  /** The current assignee. The only person a client's call rings. */
  memberUid: string;
  memberName: string;
  /**
   * The sales member who sold this ad.
   *
   * On the room because the client habitually gives their material to whoever sold to them, and
   * that person had no way of putting it where the team could see it. Also what the "enquire about
   * another ad" button resolves against — each seller works a different business number.
   */
  soldByUid?: string | null;
  soldByName?: string | null;
  /** Staff allowed in: the member, whoever assigned it, the tech admin above them, and the seller. */
  participants: string[];
  participantNames: Record<string, string>;
  status: OrderChatStatus;
  /**
   * Where the work itself has got to, mirrored from the assignment.
   *
   * `status` above is about the *room* (can anyone still type in it); this is about the *job*.
   * Mirrored rather than joined because the people who need it — a sales member looking down a
   * list of their clients' chats — would otherwise pay one document read per row to learn it.
   */
  workStatus?: WorkAssignmentStatus;
  /**
   * Set when the room was closed because the work was DELIVERED, rather than because the job went
   * back to the queue. Only a delivery earns the right to ask the customer how it went.
   */
  reviewInvited?: boolean;
  /** What the customer said about the finished work. Written by them; editable by them. */
  clientReview?: ClientReview | null;
  lastMessage?: string;
  lastMessageAt?: unknown;
  lastMessageBy?: string;
  unreadCounts?: Record<string, number>;
  /** Who currently has the room open — suppresses unread bumps and pushes for them. */
  activeUsers?: string[];
  /**
   * When each viewer last said they were looking, as epoch milliseconds.
   *
   * ── Why presence needs a clock ────────────────────────────────────────────────────────────────
   * `activeUsers` is a flag that is added on open and removed on close, and "close" depends on the
   * app getting a chance to say goodbye. On a phone it usually does not: swiping the app away, the
   * OS reclaiming it, or losing signal all skip `beforeunload` entirely. The member was then left
   * in `activeUsers` for ever, and since the server suppresses the push for anyone "already
   * looking", every later message from that client went silently into a badge nobody was watching.
   *
   * A timestamp cannot get stuck. The client refreshes it while the room is open and the server
   * only believes presence that is recent (see PRESENCE_FRESH_MS), so the worst a missed goodbye
   * can now cost is one notification, not all of them.
   */
  activeAt?: Record<string, number>;
  createdAt?: unknown;
  lockedAt?: unknown;
  /** Wrong-code throttling. Written only by the serverless join endpoint. */
  failedAttempts?: number;
  lockedUntil?: number;
}

/** What a viewer is allowed to do in a room, decided once and passed down to the UI. */
export interface OrderChatIdentity {
  /** Staff uid, or CLIENT_SENDER_ID for the customer. */
  senderId: string;
  senderName: string;
  isClient: boolean;
  /** Which side of the company this person is on. Absent for the customer. */
  role?: OrderChatSenderRole;
}

/**
 * The customer's verdict on a delivered ad.
 *
 * Two scores rather than one, because they fail independently and the fix for each is a different
 * person's job: an ad that came out beautifully after a fortnight of chasing is five and two, and
 * a single averaged "4" hides which half went wrong.
 *
 * Both default to five in the UI. A customer who is happy taps Submit; the comment box only
 * appears when a score comes down, which is the only case where "why?" is worth asking.
 */
export interface ClientReview {
  /** The ad itself, 1–5. */
  work: number;
  /** Being dealt with — replies, timing, being kept informed. 1–5. */
  service: number;
  /** Why a score was reduced. Empty when both are five. */
  comment?: string;
  submittedAt: unknown;
  /** Set when they came back and changed their mind. */
  updatedAt?: unknown;
}

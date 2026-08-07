/**
 * The per-assignment chat that replaces making a WhatsApp group for every order.
 *
 * One room per work assignment, holding the assigned member, the team leader, the tech admin and
 * the one client the job is for. The client is not a user of this system and never becomes one —
 * they hold a link and the same four digits the assignment already carries, which is why the code
 * lives on the room as well as on the assignment.
 */

/** Who wrote a message. Staff are their uid; the customer is always this literal. */
export const CLIENT_SENDER_ID = "client";

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
  /** Staff allowed in: the member, whoever assigned it, and the tech admin above them. */
  participants: string[];
  participantNames: Record<string, string>;
  status: OrderChatStatus;
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
}

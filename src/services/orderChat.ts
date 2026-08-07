/**
 * The order chat: creating it, locking it, and putting messages in it.
 *
 * Every write here takes the Firestore instance to use. Staff pass the app's own `db`; the client
 * passes the isolated instance their guest token is signed in on (see services/guestFirebase.ts),
 * because a customer opening a chat link on a shared machine must not be able to disturb — or
 * inherit — a staff session that happens to be signed in there.
 */
import {
  collection, addDoc, doc, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp, increment,
  arrayUnion, arrayRemove, type Firestore,
} from "firebase/firestore";
import { auth, db } from "@/services/firebase";
import { isNative } from "@/utils/platform";
import { COMPANY } from "@/utils/company";
import { categoryLabel } from "@/utils/serviceCatalog";
import { CLIENT_SENDER_ID } from "@/types/orderChat";
import type { OrderChatDoc, OrderChatMessageType } from "@/types/orderChat";

export const ORDER_CHATS = "order_chats";

/**
 * Where the client's link points.
 *
 * Never `window.location.origin` on native: inside the Android shell the origin is
 * `https://localhost`, so a leader sharing from their phone would send the customer a link to a
 * server that only exists on the leader's own device. A browser keeps its own origin so the link
 * works against a dev server too.
 */
const PROD_ORIGIN = "https://dreamteamos.vercel.app";

/** Inside the Android shell `fetch("/api/…")` resolves to a server that only exists on that phone. */
const API_BASE = isNative() ? PROD_ORIGIN : "";

export function orderChatLink(chatId: string): string {
  const origin = isNative() ? PROD_ORIGIN : window.location.origin;
  return `${origin}/c/${chatId}`;
}

/**
 * The message a leader or admin sends the client.
 *
 * Says what was bought, not who is making it. Naming the member turned a company into one
 * person — the client starts asking for "Aasritha" by name, and the day that job moves to
 * somebody else the client believes they have been dropped. They are talking to the team.
 *
 * It also says what the chat is FOR, in the order the client will use it: send us your material,
 * see the preview here, collect the finished ad here. A link with no promise attached is a link
 * nobody opens.
 */
export function buildClientChatMessage(input: {
  businessName?: string;
  uniqueId?: string;
  chatId: string;
  /** The work's catalog key, so the message can name what was actually ordered. */
  category?: string;
}): string {
  const { businessName, uniqueId, chatId, category } = input;
  const what = category ? categoryLabel(category) : "ad";
  return [
    `Hello${businessName ? ` ${businessName}` : ""}! 👋`,
    ``,
    `Your ${what}${uniqueId ? ` (${uniqueId})` : ""} has started.`,
    `Tap the link below to chat with our team — share your photos, videos, logo and any details,`,
    `and see your preview and the final ad in the same place. You can call the team from there too.`,
    ``,
    `🔗 ${orderChatLink(chatId)}`,
    ``,
    // The one instruction left. Everything else the page does for them — see api/order-chat.ts for
    // why there is no longer a code to find in this message and type into a box.
    `Just tap the link. Nothing to install, nothing to sign up for, no code to enter.`,
    ``,
    `— ${COMPANY.name}`,
  ].join("\n");
}

export interface CreateOrderChatInput {
  assignmentId: string;
  accessCode: string;
  uniqueId: string;
  /** What was ordered — a promotional ad, a wishes video — for the client's message. */
  category?: string;
  businessName?: string;
  clientName?: string;
  clientPhone?: string;
  memberUid: string;
  memberName?: string;
  /** Whoever assigned the work — leader or admin. */
  assignerUid: string;
  assignerName?: string;
  /** The tech admin above the team, when the assigner was a team leader. */
  techAdminUid?: string | null;
  orderId?: string | null;
}

/**
 * Creates the room for a new assignment.
 *
 * Never throws into the caller: a chat that failed to be created must not take the assignment down
 * with it, because the work itself is what matters and the room can be recreated by reassigning.
 */
export async function createOrderChat(input: CreateOrderChatInput): Promise<void> {
  const {
    assignmentId, accessCode, uniqueId, category, businessName, clientName, clientPhone,
    memberUid, memberName, assignerUid, assignerName, techAdminUid, orderId,
  } = input;

  const participants = Array.from(new Set([memberUid, assignerUid, techAdminUid].filter(Boolean) as string[]));
  const participantNames: Record<string, string> = {};
  if (memberName) participantNames[memberUid] = memberName;
  if (assignerName) participantNames[assignerUid] = assignerName;

  try {
    await setDoc(doc(db, ORDER_CHATS, assignmentId), {
      assignmentId,
      ...(orderId ? { orderId } : {}),
      uniqueId,
      ...(category ? { category } : {}),
      businessName: businessName || "",
      ...(clientName ? { clientName } : {}),
      ...(clientPhone ? { clientPhone } : {}),
      accessCode,
      memberUid,
      memberName: memberName || "",
      participants,
      participantNames,
      status: "open",
      unreadCounts: {},
      activeUsers: [],
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("[orderChat] could not create room for", assignmentId, err);
  }
}

/**
 * The room for an assignment that predates this feature — or lost its room somehow.
 *
 * Every job assigned before order chats existed has no room, and there are hundreds of them. Rather
 * than leave a dead "Chat with client" button on all of that history, the room is created the first
 * time someone actually opens or shares it.
 *
 * Created OPEN even when the job is already delivered: this only ever runs because a person
 * deliberately started a conversation with that client, and handing them a chat they cannot type
 * into would be a strange answer to the button they just pressed. Delivery closes a chat that
 * exists; it does not forbid starting one afterwards.
 */
export async function ensureOrderChat(input: {
  assignment: {
    id: string; accessCode: string; uniqueId: string; assignedTo: string; assignedBy?: string;
    category?: string; businessName?: string; clientName?: string; businessWhatsapp?: string;
    orderId?: string;
  };
  memberName?: string;
  /** Whoever is opening it — added to the room so they can read it. */
  actorUid: string;
  actorName?: string;
  techAdminUid?: string | null;
}): Promise<void> {
  const { assignment: a, memberName, actorUid, actorName, techAdminUid } = input;
  try {
    const snap = await getDoc(doc(db, ORDER_CHATS, a.id));
    if (snap.exists()) {
      // Someone new is looking at it — make sure they can keep reading it afterwards.
      if (!((snap.data().participants as string[]) || []).includes(actorUid)) {
        await updateDoc(doc(db, ORDER_CHATS, a.id), {
          participants: arrayUnion(actorUid),
          ...(actorName ? { [`participantNames.${actorUid}`]: actorName } : {}),
        });
      }
      return;
    }
    await createOrderChat({
      assignmentId: a.id,
      accessCode: a.accessCode,
      uniqueId: a.uniqueId,
      category: a.category,
      businessName: a.businessName || a.clientName,
      clientPhone: a.businessWhatsapp,
      memberUid: a.assignedTo,
      memberName,
      assignerUid: a.assignedBy || actorUid,
      assignerName: a.assignedBy === actorUid ? actorName : undefined,
      techAdminUid: techAdminUid ?? null,
      orderId: a.orderId ?? null,
    });
    // The opener is not always the original assigner, and must not lock themselves out.
    await updateDoc(doc(db, ORDER_CHATS, a.id), {
      participants: arrayUnion(actorUid),
      ...(actorName ? { [`participantNames.${actorUid}`]: actorName } : {}),
    });
  } catch (err) {
    console.error("[orderChat] could not ensure a room for", a.id, err);
  }
}

/** A line the app writes into the conversation so both sides see what changed and when. */
async function writeSystemMessage(chatId: string, text: string): Promise<void> {
  await addDoc(collection(db, ORDER_CHATS, chatId, "messages"), {
    senderId: "system",
    senderName: "",
    text,
    type: "system" as OrderChatMessageType,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, ORDER_CHATS, chatId), {
    lastMessage: text,
    lastMessageAt: serverTimestamp(),
    lastMessageBy: "system",
  });
}

/**
 * Closes the room to new messages, leaving every message in it readable.
 *
 * Delivered work is the common case, and the client keeps their files: they can reopen the same
 * link months later and still scroll back to what was sent. Only typing goes away.
 */
export async function lockOrderChat(chatId: string, note?: string): Promise<void> {
  try {
    const snap = await getDoc(doc(db, ORDER_CHATS, chatId));
    if (!snap.exists()) return;
    if (snap.data().status === "locked") return; // already closed — don't write the notice twice
    await updateDoc(doc(db, ORDER_CHATS, chatId), { status: "locked", lockedAt: serverTimestamp() });
    await writeSystemMessage(chatId, note || "Work delivered — this chat is now view-only.");
  } catch (err) {
    console.error("[orderChat] could not lock", chatId, err);
  }
}

/**
 * Re-opens the room, optionally for a different member.
 *
 * Used when work is reassigned and when a completion is undone. Calls follow `memberUid`, so this
 * is also what stops a client ringing the person who no longer holds the job.
 */
export async function reopenOrderChat(
  chatId: string,
  member?: { uid: string; name?: string },
  note?: string,
): Promise<void> {
  try {
    const snap = await getDoc(doc(db, ORDER_CHATS, chatId));
    if (!snap.exists()) return;
    const current = snap.data() as OrderChatDoc;
    const changingMember = !!member && member.uid !== current.memberUid;

    await updateDoc(doc(db, ORDER_CHATS, chatId), {
      status: "open",
      lockedAt: null,
      ...(member
        ? {
            memberUid: member.uid,
            memberName: member.name || "",
            participants: arrayUnion(member.uid),
            ...(member.name ? { [`participantNames.${member.uid}`]: member.name } : {}),
          }
        : {}),
    });

    if (note) await writeSystemMessage(chatId, note);
    else if (changingMember) {
      await writeSystemMessage(chatId, `Work reassigned to ${member?.name || "another team member"}.`);
    } else {
      await writeSystemMessage(chatId, "This chat is open again.");
    }
  } catch (err) {
    console.error("[orderChat] could not reopen", chatId, err);
  }
}

/** The assignment is gone, so the room is too. */
export async function deleteOrderChat(chatId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, ORDER_CHATS, chatId));
  } catch (err) {
    console.error("[orderChat] could not delete", chatId, err);
  }
}

/** Keeps the room's client details current when an admin edits the assignment. */
export async function syncOrderChatDetails(
  chatId: string,
  patch: { businessName?: string; clientPhone?: string; uniqueId?: string },
): Promise<void> {
  try {
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v != null && v !== ""));
    if (!Object.keys(clean).length) return;
    await updateDoc(doc(db, ORDER_CHATS, chatId), clean);
  } catch { /* the room may not exist for older assignments — nothing to sync */ }
}

/**
 * Reach the customer on their phone when the team says something.
 *
 * The mirror of `alertTeam` in orderChatGuest, and the half that was missing: a room bumped an
 * unread counter for a customer who had closed the tab, which is a signal nobody ever sees. The
 * server decides who to push to from the chat document and the caller's own token, so a member can
 * only ever reach the customer of a room they are actually on.
 *
 * Fire-and-forget. A message that landed in the room but failed to raise a notification is still a
 * message that landed; an error thrown here would take the send down with it.
 */
export function alertClient(body: {
  chatId: string;
  kind: "message" | "call";
  preview?: string;
  /** Which call the notification should let them answer. Client calls are voice only. */
  callDocId?: string;
}): void {
  Promise.resolve(auth.currentUser?.getIdToken())
    .then((token) => {
      if (!token) return;
      return fetch(`${API_BASE}/api/order-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "notify-client", ...body }),
      });
    })
    .catch(() => { /* no API server (dev) or offline */ });
}

/** A one-line preview for the room list and the notification body. */
export function messagePreview(type: OrderChatMessageType | undefined, text: string, fileName?: string): string {
  switch (type) {
    case "voice": return "🎤 Voice message";
    case "image": return "📷 Photo";
    case "video": return "🎬 Video";
    case "file": return fileName ? `📎 ${fileName}` : "📎 File";
    case "emoji": return text || "😀";
    default: return text;
  }
}

export interface SendOrderChatMessageInput {
  chatId: string;
  senderId: string;
  senderName: string;
  text?: string;
  type?: OrderChatMessageType;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  duration?: number;
  replyTo?: { id: string; text: string; senderId: string } | null;
}

/**
 * Writes a message and updates the room's preview and unread counters.
 *
 * Unread is bumped for everyone who is not currently looking at the room — including the client,
 * whose badge is the only "you have a reply" signal they get, since a customer with no account has
 * nothing to push to.
 */
export async function sendOrderChatMessage(
  dbi: Firestore,
  input: SendOrderChatMessageInput,
): Promise<void> {
  const { chatId, senderId, senderName, text = "", type = "text", fileUrl, fileName, fileType, duration, replyTo } = input;
  const trimmed = text.trim();
  if (type === "text" && !trimmed) return;

  const roomRef = doc(dbi, ORDER_CHATS, chatId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) throw new Error("This chat no longer exists.");
  const room = snap.data() as OrderChatDoc;
  if (room.status === "locked") throw new Error("This chat is closed.");

  await addDoc(collection(dbi, ORDER_CHATS, chatId, "messages"), {
    senderId,
    senderName,
    text: trimmed,
    type,
    ...(fileUrl ? { fileUrl } : {}),
    ...(fileName ? { fileName } : {}),
    ...(fileType ? { fileType } : {}),
    ...(duration != null ? { duration } : {}),
    ...(replyTo ? { replyToId: replyTo.id, replyToText: replyTo.text, replyToSenderId: replyTo.senderId } : {}),
    createdAt: serverTimestamp(),
  });

  const roomPresence = room as { activeUsers?: string[]; activeAt?: Record<string, number> };
  const preview = messagePreview(type, trimmed, fileName);
  // Everyone who could be waiting on this: the staff on the room, plus the customer. Presence is
  // judged on a recent heartbeat, not a flag that a killed app never got to clear.
  const audience = Array.from(new Set([...(room.participants || []), CLIENT_SENDER_ID]))
    .filter((k) => k !== senderId && !isViewerPresent(roomPresence, k));

  const bumps: Record<string, unknown> = {};
  audience.forEach((k) => { bumps[`unreadCounts.${k}`] = increment(1); });

  await updateDoc(roomRef, {
    lastMessage: preview,
    lastMessageAt: serverTimestamp(),
    lastMessageBy: senderId,
    ...bumps,
  });
}

/*
 * Deleting a message is deliberately not offered.
 *
 * This is a record of what a client asked for and what was delivered to them, and both sides refer
 * back to it — a photo of a shopfront, a change requested on a Tuesday. A delete button turns that
 * into something either side can quietly edit after the fact. Messages that were soft-deleted
 * before the button was removed still render as "This message was deleted".
 */

/** Clears a viewer's badge. */
export async function markOrderChatRead(dbi: Firestore, chatId: string, viewer: string): Promise<void> {
  try {
    await updateDoc(doc(dbi, ORDER_CHATS, chatId), { [`unreadCounts.${viewer}`]: 0 });
  } catch { /* best effort — a stale badge is not worth an error in the user's face */ }
}

/**
 * How recent a presence heartbeat has to be to count as "still looking".
 *
 * Comfortably more than the heartbeat interval, so an ordinary slow write or a few seconds of bad
 * signal does not make a member who is plainly reading the room look absent. Exported so the
 * client, the server and the tests all use one number.
 */
export const PRESENCE_FRESH_MS = 120_000;

/** How often an open room re-asserts presence. Half the freshness window, so one lost write is fine. */
export const PRESENCE_HEARTBEAT_MS = 45_000;

/** True when this viewer's last heartbeat is recent enough to suppress a notification. */
export function isViewerPresent(room: { activeUsers?: string[]; activeAt?: Record<string, number> } | null | undefined, viewer: string, now = Date.now()): boolean {
  if (!room) return false;
  const beat = room.activeAt?.[viewer];
  // A heartbeat is the only evidence that survives a phone being swiped away mid-conversation.
  if (typeof beat === "number") return now - beat < PRESENCE_FRESH_MS;
  /**
   * No heartbeat recorded: this is a room last written by a build that only kept the flag. Trust
   * it, so behaviour is unchanged for anyone mid-conversation across the deploy — the very next
   * open writes a timestamp and the room self-heals.
   */
  return (room.activeUsers || []).includes(viewer);
}

/**
 * Presence, so someone reading the room right now is not also pinged about it.
 *
 * Writes a timestamp as well as the flag. See `OrderChatDoc.activeAt` for why the flag alone left
 * members permanently "present" and silently killed their client notifications.
 */
export async function setOrderChatPresence(
  dbi: Firestore, chatId: string, viewer: string, present: boolean,
): Promise<void> {
  try {
    await updateDoc(doc(dbi, ORDER_CHATS, chatId), {
      activeUsers: present ? arrayUnion(viewer) : arrayRemove(viewer),
      // Zeroed rather than deleted on leave: an old timestamp reads as "left long ago", which is
      // exactly right, and needs no special case at either end.
      [`activeAt.${viewer}`]: present ? Date.now() : 0,
      ...(present ? { [`unreadCounts.${viewer}`]: 0 } : {}),
    });
  } catch { /* best effort */ }
}

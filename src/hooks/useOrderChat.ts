/**
 * Live view of one order chat, for whoever is looking at it.
 *
 * The same hook serves the tech member, the leader, the admin and the customer — the only
 * differences are which Firestore instance the reads go through and what name goes on a message.
 * Keeping one implementation is what stops the client's half of the conversation drifting away
 * from the team's half.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection, doc, onSnapshot, orderBy, query, where, type Firestore,
} from "firebase/firestore";
import { db as staffDb } from "@/services/firebase";
import {
  ORDER_CHATS, PRESENCE_HEARTBEAT_MS, sendOrderChatMessage, markOrderChatRead, setOrderChatPresence,
  messagePreview,
} from "@/services/orderChat";
import { playChatMessageSound } from "@/utils/audio";
import type { OrderChatDoc, OrderChatIdentity, OrderChatMessage, OrderChatMessageType } from "@/types/orderChat";

export interface UseOrderChatOptions {
  chatId: string | null;
  identity: OrderChatIdentity | null;
  /** The guest page passes its isolated instance; staff use the app's own. */
  dbi?: Firestore;
  /** Called after the client sends something, so the server can alert the member. */
  onSent?: (preview: string) => void;
}

export function useOrderChat({ chatId, identity, dbi = staffDb, onSent }: UseOrderChatOptions) {
  const [room, setRoom] = useState<OrderChatDoc | null>(null);
  const [messages, setMessages] = useState<OrderChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [sending, setSending] = useState(false);
  const seenCount = useRef(0);
  const firstLoad = useRef(true);

  const viewer = identity?.senderId ?? null;

  // ── The room itself ──
  useEffect(() => {
    if (!chatId) { setRoom(null); setLoading(false); return; }
    const unsub = onSnapshot(
      doc(dbi, ORDER_CHATS, chatId),
      (snap) => {
        setMissing(!snap.exists());
        setRoom(snap.exists() ? ({ id: snap.id, ...snap.data() } as OrderChatDoc) : null);
        setLoading(false);
      },
      () => { setLoading(false); setMissing(true); },
    );
    return unsub;
  }, [chatId, dbi]);

  // ── Messages ──
  useEffect(() => {
    if (!chatId) { setMessages([]); return; }
    firstLoad.current = true;
    seenCount.current = 0;
    const q = query(collection(dbi, ORDER_CHATS, chatId, "messages"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrderChatMessage));
      setMessages(list);
      // A sound for someone else's message only, and never for the backlog on open.
      if (!firstLoad.current && list.length > seenCount.current) {
        const newest = list[list.length - 1];
        if (newest && newest.senderId !== viewer && newest.type !== "system") playChatMessageSound();
      }
      seenCount.current = list.length;
      firstLoad.current = false;
    });
    return unsub;
  }, [chatId, dbi, viewer]);

  // ── Presence: reading it now means not being pinged about it ──
  useEffect(() => {
    if (!chatId || !viewer) return;
    setOrderChatPresence(dbi, chatId, viewer, true);

    const leave = () => { setOrderChatPresence(dbi, chatId, viewer, false); };
    const onVisibility = () => {
      if (document.hidden) leave();
      else setOrderChatPresence(dbi, chatId, viewer, true);
    };
    /**
     * Keep saying so, rather than saying it once and relying on being able to take it back.
     *
     * `beforeunload` does not fire when a phone's app is swiped away or killed by the OS, so the
     * "I have left" write simply never happened — and the member stayed marked present for ever,
     * which the server reads as "no need to notify them". Every later message from that client
     * went silently into a badge. A heartbeat expires on its own, so the worst a missed goodbye
     * costs is one notification. See services/orderChat.isViewerPresent.
     */
    const beat = window.setInterval(() => {
      if (!document.hidden) setOrderChatPresence(dbi, chatId, viewer, true);
    }, PRESENCE_HEARTBEAT_MS);

    window.addEventListener("beforeunload", leave);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(beat);
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("visibilitychange", onVisibility);
      leave();
    };
  }, [chatId, viewer, dbi]);

  // Anything that arrives while the room is open is already read.
  useEffect(() => {
    if (!chatId || !viewer || !messages.length) return;
    if ((room?.unreadCounts?.[viewer] ?? 0) > 0) markOrderChatRead(dbi, chatId, viewer);
  }, [chatId, viewer, dbi, messages.length, room?.unreadCounts]);

  const locked = room?.status === "locked";
  const canSend = !!identity && !!room && !locked;

  const send = useCallback(async (input: {
    text?: string;
    type?: OrderChatMessageType;
    fileUrl?: string;
    fileName?: string;
    fileType?: string;
    duration?: number;
    replyTo?: { id: string; text: string; senderId: string } | null;
  }) => {
    if (!chatId || !identity) return;
    setSending(true);
    try {
      await sendOrderChatMessage(dbi, {
        chatId,
        senderId: identity.senderId,
        senderName: identity.senderName,
        senderRole: identity.role,
        ...input,
      });
      onSent?.(messagePreview(input.type, input.text || "", input.fileName));
    } finally {
      setSending(false);
    }
  }, [chatId, identity, dbi, onSent]);

  return { room, messages, loading, missing, locked, canSend, sending, send };
}

/**
 * Every room this person is on.
 *
 * One listener for the whole page rather than one per card: a member with twenty jobs open should
 * cost twenty documents once, not twenty listeners that each re-read on every change.
 *
 * Scoped by `participants`, which is also what the sales member's route in depends on — a seller
 * is put on the room when the work is assigned, so their client conversations arrive here without
 * a second query against orders.
 */
export function useMyOrderChats(uid: string | undefined) {
  const [rooms, setRooms] = useState<OrderChatDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setRooms([]); setLoading(false); return; }
    setLoading(true);
    const q = query(collection(staffDb, ORDER_CHATS), where("participants", "array-contains", uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRooms(snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrderChatDoc)));
        setLoading(false);
      },
      (err) => {
        console.warn("[orderChat] room listener failed", err);
        setRooms([]);
        setLoading(false);
      },
    );
    return unsub;
  }, [uid]);

  return { rooms, loading };
}

/** The same rooms, reduced to what a job card needs: a badge and whether it is still open. */
export function useOrderChatUnread(uid: string | undefined) {
  const { rooms } = useMyOrderChats(uid);

  return useMemo(() => {
    const byAssignment: Record<string, { unread: number; status: string }> = {};
    rooms.forEach((r) => {
      byAssignment[r.id] = { unread: (uid && r.unreadCounts?.[uid]) || 0, status: r.status };
    });
    return byAssignment;
  }, [rooms, uid]);
}

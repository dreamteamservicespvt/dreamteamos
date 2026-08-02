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
  ORDER_CHATS, sendOrderChatMessage, deleteOrderChatMessage, markOrderChatRead, setOrderChatPresence,
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
    window.addEventListener("beforeunload", leave);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
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
        ...input,
      });
      onSent?.(messagePreview(input.type, input.text || "", input.fileName));
    } finally {
      setSending(false);
    }
  }, [chatId, identity, dbi, onSent]);

  const remove = useCallback(async (messageId: string) => {
    if (!chatId) return;
    await deleteOrderChatMessage(dbi, chatId, messageId);
  }, [chatId, dbi]);

  return { room, messages, loading, missing, locked, canSend, sending, send, remove };
}

/**
 * Unread counts for every room a staff member is on, keyed by assignment id.
 *
 * One listener for the whole page rather than one per card: a member with twenty jobs open should
 * cost twenty documents once, not twenty listeners that each re-read on every change.
 */
export function useOrderChatUnread(uid: string | undefined) {
  const [rooms, setRooms] = useState<OrderChatDoc[]>([]);

  useEffect(() => {
    if (!uid) { setRooms([]); return; }
    const q = query(collection(staffDb, ORDER_CHATS), where("participants", "array-contains", uid));
    const unsub = onSnapshot(
      q,
      (snap) => setRooms(snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrderChatDoc))),
      (err) => { console.warn("[orderChat] unread listener failed", err); setRooms([]); },
    );
    return unsub;
  }, [uid]);

  return useMemo(() => {
    const byAssignment: Record<string, { unread: number; status: string }> = {};
    rooms.forEach((r) => {
      byAssignment[r.id] = { unread: (uid && r.unreadCounts?.[uid]) || 0, status: r.status };
    });
    return byAssignment;
  }, [rooms, uid]);
}

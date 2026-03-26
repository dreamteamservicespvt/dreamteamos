import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection, query, where, doc, setDoc, addDoc, updateDoc, onSnapshot,
  orderBy, serverTimestamp, increment, getDoc,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { sendNotification } from "@/services/notifications";
import { getChatRoomId, getChatContactRoles, getChatRoute } from "@/utils/chatHelpers";
import { playChatMessageSound } from "@/utils/audio";
import type { AppUser, ChatRoom, ChatMessage } from "@/types";
export type { ChatMessage };

export interface ChatContact {
  uid: string;
  name: string;
  avatar?: string;
  role: string;
  lastMessage?: string;
  lastMessageAt?: any;
  unreadCount: number;
}

export function useChat() {
  const user = useAuthStore((s) => s.user);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const prevMsgCount = useRef(0);
  const initialMsgLoad = useRef(true);

  // 1. Load contacts based on role (supports multiple roles)
  useEffect(() => {
    if (!user) return;
    const roles = getChatContactRoles(user.role);
    if (roles.length === 0) { setLoadingContacts(false); return; }

    // Firestore "in" supports up to 30 values
    const q = query(
      collection(db, "users"),
      where("role", "in", roles),
      where("isActive", "==", true),
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((d) => ({ uid: d.id, ...d.data() } as AppUser))
        .filter((u) => u.uid !== user.uid); // exclude self
      setContacts(
        list.map((u) => ({
          uid: u.uid,
          name: u.name,
          avatar: u.avatar,
          role: u.role,
          unreadCount: 0,
        })),
      );
      setLoadingContacts(false);
    });
    return unsub;
  }, [user?.uid, user?.role]);

  // 2. Load all rooms where current user is a participant
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "chatRooms"),
      where("participants", "array-contains", user.uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatRoom));
      setRooms(list);
    });
    return unsub;
  }, [user?.uid]);

  // 3. Merge room data into contacts (last message, unread)
  useEffect(() => {
    if (!user) return;
    setContacts((prev) =>
      prev.map((c) => {
        const roomId = getChatRoomId(user.uid, c.uid);
        const room = rooms.find((r) => r.id === roomId);
        if (!room) return { ...c, lastMessage: undefined, lastMessageAt: undefined, unreadCount: 0 };
        return {
          ...c,
          lastMessage: room.lastMessage,
          lastMessageAt: room.lastMessageAt,
          unreadCount: room.unreadCounts?.[user.uid] ?? 0,
        };
      }),
    );
  }, [rooms, user?.uid]);

  // 4. Load messages for the active room
  useEffect(() => {
    if (!activeRoomId) { setMessages([]); return; }
    setLoadingMessages(true);
    initialMsgLoad.current = true;
    prevMsgCount.current = 0;

    const q = query(
      collection(db, "chatRooms", activeRoomId, "messages"),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage));
      setMessages(list);
      setLoadingMessages(false);

      // Play sound for NEW incoming messages (not initial load, not own messages)
      if (!initialMsgLoad.current && list.length > prevMsgCount.current) {
        const newest = list[list.length - 1];
        if (newest && newest.senderId !== user?.uid) {
          playChatMessageSound();
        }
      }
      prevMsgCount.current = list.length;
      initialMsgLoad.current = false;
    });
    return unsub;
  }, [activeRoomId, user?.uid]);

  // 5. Presence — add / remove from activeUsers on room
  useEffect(() => {
    if (!activeRoomId || !user) return;

    const roomRef = doc(db, "chatRooms", activeRoomId);

    // Mark as active & clear unread
    const enter = async () => {
      const snap = await getDoc(roomRef);
      if (!snap.exists()) return;
      const data = snap.data();
      const active: string[] = data.activeUsers ?? [];
      if (!active.includes(user.uid)) {
        await updateDoc(roomRef, {
          activeUsers: [...active, user.uid],
          [`unreadCounts.${user.uid}`]: 0,
        });
      } else {
        await updateDoc(roomRef, { [`unreadCounts.${user.uid}`]: 0 });
      }
    };
    enter();

    // Leave handler
    const leave = async () => {
      try {
        const snap = await getDoc(roomRef);
        if (!snap.exists()) return;
        const active: string[] = snap.data().activeUsers ?? [];
        await updateDoc(roomRef, {
          activeUsers: active.filter((u) => u !== user.uid),
        });
      } catch { /* component unmounted — best effort */ }
    };

    const handleBeforeUnload = () => { leave(); };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      leave();
    };
  }, [activeRoomId, user?.uid]);

  // Open a room with a contact
  const openRoom = useCallback(
    (contactUid: string) => {
      if (!user) return;
      setActiveRoomId(getChatRoomId(user.uid, contactUid));
    },
    [user?.uid],
  );

  // Send a message
  const sendMessage = useCallback(
    async (text: string) => {
      if (!user || !activeRoomId || !text.trim()) return;
      const trimmed = text.trim();

      // Find the other participant
      const parts = activeRoomId.split("_");
      const receiverId = parts.find((p) => p !== user.uid) ?? parts[1];
      const contact = contacts.find((c) => c.uid === receiverId);

      const roomRef = doc(db, "chatRooms", activeRoomId);
      const roomSnap = await getDoc(roomRef);

      // Create room if it doesn't exist
      if (!roomSnap.exists()) {
        await setDoc(roomRef, {
          participants: [user.uid, receiverId],
          participantNames: {
            [user.uid]: user.name,
            [receiverId]: contact?.name ?? "",
          },
          participantAvatars: {
            [user.uid]: user.avatar ?? "",
            [receiverId]: contact?.avatar ?? "",
          },
          activeUsers: [user.uid],
          lastMessage: trimmed,
          lastMessageAt: serverTimestamp(),
          lastMessageBy: user.uid,
          unreadCounts: { [user.uid]: 0, [receiverId]: 0 },
          createdAt: serverTimestamp(),
        });
      }

      // Write message
      await addDoc(collection(db, "chatRooms", activeRoomId, "messages"), {
        senderId: user.uid,
        text: trimmed,
        createdAt: serverTimestamp(),
      });

      // Update room metadata
      const active: string[] = roomSnap.exists()
        ? roomSnap.data().activeUsers ?? []
        : [user.uid];
      const receiverIsActive = active.includes(receiverId);

      await updateDoc(roomRef, {
        lastMessage: trimmed,
        lastMessageAt: serverTimestamp(),
        lastMessageBy: user.uid,
        ...(!receiverIsActive ? { [`unreadCounts.${receiverId}`]: increment(1) } : {}),
      });

      // Notification — only if receiver is NOT viewing this room
      if (!receiverIsActive && contact) {
        const link = getChatRoute(contact.role as any);
        sendNotification({
          userId: receiverId,
          type: "chat_message",
          title: `Message from ${user.name}`,
          message: trimmed.length > 80 ? trimmed.slice(0, 80) + "…" : trimmed,
          link,
        });
      }
    },
    [user, activeRoomId, contacts],
  );

  const totalUnread = contacts.reduce((s, c) => s + c.unreadCount, 0);

  return {
    contacts,
    activeRoomId,
    messages,
    loadingContacts,
    loadingMessages,
    totalUnread,
    openRoom,
    sendMessage,
    closeRoom: () => setActiveRoomId(null),
  };
}

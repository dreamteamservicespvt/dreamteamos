import { useState, useEffect, useRef } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, orderBy, limit, writeBatch } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { playNotificationSound } from "@/utils/audio";

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  link?: string;
  createdAt: any;
}

/**
 * Rows that must not make a sound here.
 *
 * A call already has a ringtone, playing over the incoming-call popup. The bell chiming underneath
 * it was the third of three alerts for one event — notification, popup, chime — and the one that
 * made the other two feel like a bug. The row is still written and still readable in the bell; it
 * just does not announce itself twice.
 */
const SILENT_NOTIFICATION_TYPES = new Set(["voice_call", "video_call", "order_chat_call"]);

export function useNotifications() {
  const user = useAuthStore((s) => s.user);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const previousUnreadCount = useRef(0);
  const initialLoad = useRef(true);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification));
      setNotifications(list);
      
      const currentUnreadCount = list.filter((n) => !n.read).length;
      setUnreadCount(currentUnreadCount);

      // The newest unread row is the one that just arrived; a call announces itself.
      const arrived = list.find((n) => !n.read);
      if (!initialLoad.current && currentUnreadCount > previousUnreadCount.current
        && !SILENT_NOTIFICATION_TYPES.has(arrived?.type || "")) {
        playNotificationSound();
      }
      
      previousUnreadCount.current = currentUnreadCount;
      initialLoad.current = false;
    }, (err) => {
      console.warn("Notification query error, using fallback:", err);
      const fallbackQ = query(
        collection(db, "notifications"),
        where("userId", "==", user.uid)
      );
      const fallbackUnsub = onSnapshot(fallbackQ, (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setNotifications(list.slice(0, 50));
        
        const currentUnreadCount = list.filter((n) => !n.read).length;
        setUnreadCount(currentUnreadCount);

        // The newest unread row is the one that just arrived; a call announces itself.
        const arrived = list.find((n) => !n.read);
        if (!initialLoad.current && currentUnreadCount > previousUnreadCount.current
          && !SILENT_NOTIFICATION_TYPES.has(arrived?.type || "")) {
          playNotificationSound();
        }
        
        previousUnreadCount.current = currentUnreadCount;
        initialLoad.current = false;
      });
      return fallbackUnsub;
    });
    return unsub;
  }, [user?.uid]);

  const markAsRead = async (notifId: string) => {
    try {
      await updateDoc(doc(db, "notifications", notifId), { read: true });
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    try {
      const batch = writeBatch(db);
      unread.forEach((n) => {
        batch.update(doc(db, "notifications", n.id), { read: true });
      });
      await batch.commit();
    } catch (err) {
      console.error("Failed to mark all as read:", err);
      // Fallback: update one by one
      for (const n of unread) {
        try { await updateDoc(doc(db, "notifications", n.id), { read: true }); } catch {}
      }
    }
  };

  const clearAll = async () => {
    if (notifications.length === 0) return;
    try {
      const batch = writeBatch(db);
      notifications.forEach((n) => {
        batch.delete(doc(db, "notifications", n.id));
      });
      await batch.commit();
    } catch (err) {
      console.error("Failed to clear notifications:", err);
      // Fallback: delete one by one
      for (const n of notifications) {
        try { await deleteDoc(doc(db, "notifications", n.id)); } catch {}
      }
    }
  };

  return { notifications, unreadCount, markAsRead, markAllAsRead, clearAll };
}

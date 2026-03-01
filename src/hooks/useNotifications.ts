import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, orderBy, limit, writeBatch } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: any;
}

export function useNotifications() {
  const user = useAuthStore((s) => s.user);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

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
      setUnreadCount(list.filter((n) => !n.read).length);
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
        setUnreadCount(list.filter((n) => !n.read).length);
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

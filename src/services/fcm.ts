import { getMessaging, getToken, deleteToken, onMessage } from "firebase/messaging";
import { doc, setDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";
import app, { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string;

let messagingInstance: ReturnType<typeof getMessaging> | null = null;

function getMessagingInstance() {
  if (!messagingInstance) {
    messagingInstance = getMessaging(app);
  }
  return messagingInstance;
}

/**
 * Request notification permission, get FCM token, and store it in Firestore.
 * Call once when the authenticated user loads.
 */
export async function initFCM(userId: string): Promise<void> {
  try {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const sw = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

    const messaging = getMessagingInstance();
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: sw,
    });

    if (!token) return;

    // Store token in Firestore — use token as doc ID to avoid duplicates
    await setDoc(doc(db, "fcmTokens", token), {
      userId,
      token,
      createdAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
    });
  } catch (err) {
    console.error("FCM init failed:", err);
  }
}

/**
 * Listen for foreground messages and show a browser notification.
 * Returns an unsubscribe function.
 */
export function onForegroundMessage(callback?: (payload: any) => void): () => void {
  try {
    const messaging = getMessagingInstance();
    return onMessage(messaging, (payload) => {
      if (callback) callback(payload);
      // Show notification even in foreground
      if (payload.notification) {
        const { title, body } = payload.notification;
        if (Notification.permission === "granted") {
          new Notification(title || "DTS Manager", {
            body: body || "You have a new notification",
          });
        }
      }
    });
  } catch {
    return () => {};
  }
}

/**
 * Delete the current FCM token and remove all tokens for this user from Firestore.
 * Call on logout.
 */
export async function deleteFCMToken(userId: string): Promise<void> {
  try {
    const messaging = getMessagingInstance();
    await deleteToken(messaging);

    // Remove all tokens for this user
    const q = query(collection(db, "fcmTokens"), where("userId", "==", userId));
    const snap = await getDocs(q);
    const deletePromises = snap.docs.map((d) => deleteDoc(doc(db, "fcmTokens", d.id)));
    await Promise.all(deletePromises);
  } catch (err) {
    console.error("FCM token cleanup failed:", err);
  }
}

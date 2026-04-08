import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import { isNative } from "@/utils/platform";

interface SendNotificationParams {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  callDocId?: string;
}

/**
 * On native (Capacitor), fetch("/api/...") hits https://localhost which doesn't exist.
 * We must use the absolute Vercel URL so the serverless function is reachable.
 */
const API_BASE = isNative() ? "https://dreamteamos.vercel.app" : "";

/**
 * Creates a Firestore notification document and triggers a web push notification.
 * The push call is fire-and-forget — it never blocks the main action.
 */
export async function sendNotification({ userId, type, title, message, link, callDocId }: SendNotificationParams): Promise<void> {
  // 1. Write the in-app notification to Firestore (this powers the existing bell + sound system)
  await addDoc(collection(db, "notifications"), {
    userId,
    type,
    title,
    message,
    read: false,
    ...(link ? { link } : {}),
    createdAt: serverTimestamp(),
  });

  // 2. Fire-and-forget: trigger web push via the serverless API
  try {
    fetch(`${API_BASE}/api/send-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, title, message, link, type, callDocId }),
    }).then((res) => {
      if (!res.ok) {
        console.error("[Push] API responded with", res.status, res.statusText);
      }
    }).catch((err) => {
      console.error("[Push] fetch failed:", err);
    });
  } catch (err) {
    console.error("[Push] send error:", err);
  }
}

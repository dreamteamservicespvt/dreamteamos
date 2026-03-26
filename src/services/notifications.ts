import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase";

interface SendNotificationParams {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}

/**
 * Creates a Firestore notification document and triggers a web push notification.
 * The push call is fire-and-forget — it never blocks the main action.
 */
export async function sendNotification({ userId, type, title, message, link }: SendNotificationParams): Promise<void> {
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
    fetch("/api/send-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, title, message, link, type }),
    }).catch(() => {
      // Silently ignore push failures — in-app notification already saved
    });
  } catch {
    // Silently ignore
  }
}

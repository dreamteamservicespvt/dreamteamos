import { addDoc, collection, getDocs, query, serverTimestamp, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { isNative } from "@/utils/platform";

interface SendNotificationParams {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  callDocId?: string;
  /** Optional structured payload (e.g. { status, date } for an attendance update) so a
   *  consumer like UpdatePopup can render a rich UI without parsing the message string. */
  meta?: Record<string, unknown>;
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
export async function sendNotification({ userId, type, title, message, link, callDocId, meta }: SendNotificationParams): Promise<void> {
  // 1. Write the in-app notification to Firestore (this powers the existing bell + sound system)
  await addDoc(collection(db, "notifications"), {
    userId,
    type,
    title,
    message,
    read: false,
    ...(link ? { link } : {}),
    ...(meta ? { meta } : {}),
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

/**
 * Notify every tech team leader who supervises a given tech team (team leaders and members
 * created by the same tech admin share the same `createdBy`). Used to keep team leaders in
 * the loop on their team's work (e.g. new assignments and completions) — previously these
 * notifications never reached them. Optionally skips one uid to avoid a duplicate when the
 * assigner/verifier is already that team leader.
 */
export async function notifyTechTeamLeaders(params: {
  /** The admin uid that created the team member (member.createdBy). */
  teamAdminUid: string;
  /** A uid to skip (e.g. the assigner) so they don't get a duplicate notification. */
  excludeUserId?: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}): Promise<void> {
  const { teamAdminUid, excludeUserId, type, title, message, link } = params;
  if (!teamAdminUid) return;
  try {
    const snap = await getDocs(
      query(
        collection(db, "users"),
        where("role", "==", "tech_team_leader"),
        where("createdBy", "==", teamAdminUid),
      ),
    );
    await Promise.all(
      snap.docs
        .filter((d) => d.id !== excludeUserId)
        .map((d) => sendNotification({ userId: d.id, type, title, message, ...(link ? { link } : {}) })),
    );
  } catch (err) {
    console.error("[Notify] tech team-leader fan-out failed:", err);
  }
}

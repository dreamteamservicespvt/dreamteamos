import { addDoc, collection, doc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
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
  /**
   * Makes this notification idempotent: the same key always writes to the same document, so
   * sending it twice updates one row instead of creating a second.
   *
   * Use it for anything that describes an EVENT rather than a message — "work completed", "spec
   * updated". A tech member submitting work from a phone was producing seven to ten identical
   * notifications, because the submit button fired on every tap while five slow writes ran and
   * each call did an unconditional `addDoc`. The button no longer allows that, but a key here
   * means no future caller can recreate the problem either.
   *
   * Build it from the event, never from the clock: `work_completed_<assignmentId>_<recipient>`.
   */
  dedupeKey?: string;
}

/** Firestore ids cannot contain `/` and must be non-empty; keep keys boring and predictable. */
function safeDocId(key: string): string {
  return key.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 1500);
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
export async function sendNotification({ userId, type, title, message, link, callDocId, meta, dedupeKey }: SendNotificationParams): Promise<void> {
  // 1. Write the in-app notification to Firestore (this powers the existing bell + sound system)
  const payload = {
    userId,
    type,
    title,
    message,
    read: false,
    ...(link ? { link } : {}),
    ...(meta ? { meta } : {}),
    createdAt: serverTimestamp(),
  };

  if (dedupeKey) {
    // Same event, same document — a repeat refreshes the row rather than stacking another one.
    await setDoc(doc(db, "notifications", safeDocId(dedupeKey)), payload);
  } else {
    await addDoc(collection(db, "notifications"), payload);
  }

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
  /**
   * Idempotency key for the fan-out. The recipient's uid is appended per leader, so one event
   * yields exactly one notification per leader however many times this is called.
   */
  dedupeKey?: string;
}): Promise<void> {
  const { teamAdminUid, excludeUserId, type, title, message, link, dedupeKey } = params;
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
        .map((d) => sendNotification({
          userId: d.id, type, title, message,
          ...(link ? { link } : {}),
          ...(dedupeKey ? { dedupeKey: `${dedupeKey}_${d.id}` } : {}),
        })),
    );
  } catch (err) {
    console.error("[Notify] tech team-leader fan-out failed:", err);
  }
}

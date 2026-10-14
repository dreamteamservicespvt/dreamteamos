/**
 * Old notifications, deleted now and then (owner, 2026-10-13: "clean up notifications older than about
 * 90 days now and then, to keep the database small").
 *
 * ── Why a sweep from somebody's app, and why once a day company-wide ──────────────────────────
 * Nothing had ever deleted a notification, so `notifications` only grew. There is no scheduler (the
 * project is on the free plan, no Cloud Functions), so — like the other sweeps — it runs when the app
 * is opened: the first signed-in app of the day deletes every row older than `NOTIFICATION_KEEP_DAYS`,
 * for everybody (a person who never signs in again would otherwise keep theirs for ever), at most
 * `CLEANUP_DAILY_MAX` rows a day. One app a day, not one per person: the day is claimed in a
 * transaction on `app_settings/notification_cleanup`, so ten people opening the app at 9:30 do not
 * each read the same thousand old rows. A device that has looked today does not look again
 * (localStorage), so the claim costs one read per device per day.
 *
 * Safe to delete: every `once` reminder's key carries its day (birthday_…_<day>, smm_due_…_<day>,
 * smm_renewal_due_…_<day>, smm_renew_remind_…_<day>, drive_folder_missing_…_<day>), so a 90-day-old
 * row is never the record that stops today's reminder. A cleared point (`notification_state`) older
 * than every row left is harmless.
 *
 * Never fatal: a failure is logged and tried again another day.
 */
import {
  Timestamp, collection, doc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp, setDoc, where,
  writeBatch,
} from "firebase/firestore";
import { format } from "date-fns";
import { db } from "@/services/firebase";
import { CLEANUP_DAILY_MAX, WRITE_CHUNK, cleanupCutoff } from "@/utils/notificationInbox";

const ROWS = "notifications";
/** `{ day, startedAt, byUid, doneAt?, deleted? }` — the last day the clean-up ran, and what it did. */
const CLAIM_PATH = ["app_settings", "notification_cleanup"] as const;
const LOOKED_KEY = "dts_notification_cleanup_day";

/** How long after sign-in the sweep waits, so it never competes with the first page's own reads. */
export const CLEANUP_DELAY_MS = 30_000;

const today = (now: Date) => format(now, "yyyy-MM-dd");

function lookedToday(day: string): boolean {
  try {
    return localStorage.getItem(LOOKED_KEY) === day;
  } catch {
    return false;
  }
}

function noteLooked(day: string): void {
  try {
    localStorage.setItem(LOOKED_KEY, day);
  } catch {
    /* private window: the claim below still keeps it to one run a day */
  }
}

/** Takes today's clean-up for this app. False when another app already took it today. */
export async function claimCleanupDay(uid: string, day: string): Promise<boolean> {
  const ref = doc(db, ...CLAIM_PATH);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists() && snap.data()?.day === day) return false;
    tx.set(ref, { day, startedAt: serverTimestamp(), byUid: uid });
    return true;
  });
}

/**
 * Deletes rows written before `cutoff`, oldest first, at most `max`. Returns how many. Reads ONLY the
 * rows it deletes (a `createdAt` range — the single-field index Firestore keeps by itself).
 */
export async function deleteNotificationsBefore(cutoff: Date, max = CLEANUP_DAILY_MAX): Promise<number> {
  let deleted = 0;
  while (deleted < max) {
    const want = Math.min(WRITE_CHUNK, max - deleted);
    const snap = await getDocs(query(
      collection(db, ROWS),
      where("createdAt", "<", Timestamp.fromDate(cutoff)),
      orderBy("createdAt"),
      limit(want),
    ));
    if (snap.empty) break;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.docs.length;
    if (snap.docs.length < want) break;
  }
  return deleted;
}

/** The sweep: at most once a day across the company. Resolves to how many rows it deleted. */
export async function cleanUpOldNotificationsOnOpen(uid: string, now = new Date()): Promise<number> {
  const day = today(now);
  if (!uid || lookedToday(day)) return 0;
  noteLooked(day);
  try {
    if (!(await claimCleanupDay(uid, day))) return 0;
    const deleted = await deleteNotificationsBefore(cleanupCutoff(now));
    await setDoc(doc(db, ...CLAIM_PATH), { doneAt: serverTimestamp(), deleted }, { merge: true });
    return deleted;
  } catch (err) {
    console.warn("[notifications] the 90-day clean-up did not finish; it runs again another day:", err);
    return 0;
  }
}

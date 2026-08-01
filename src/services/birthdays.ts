/**
 * Telling the team whose birthday it is.
 *
 * ── Why this runs in the browser ──────────────────────────────────────────────────────────────
 * There is no server. The same on-open sweep pattern the delivery deadlines already use
 * (services/orders.notifyDueOrdersOnOpen) applies here: whoever opens the platform first that day
 * does the telling, and everyone else's sweep finds the work already done.
 *
 * That only works because `sendNotification` de-duplicates on a key. The key here is
 * `birthday_<person>_<date>_<recipient>`, so a birthday produces exactly one notification per
 * teammate per year no matter how many people open the app or how many times — without it, a team
 * of fifteen would each get fifteen copies.
 *
 * ── What it costs ─────────────────────────────────────────────────────────────────────────────
 * One read of the active team, once per session, and only on a day that actually has a birthday do
 * any writes happen at all. On most days this does nothing.
 */
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { birthdayNoticeMessage, birthdaysOn, isoDay } from "@/utils/birthdays";
import type { AppUser } from "@/types";

/** Roles that are actual colleagues. External creators are outside people with tool access only. */
function isTeammate(u: AppUser): boolean {
  return u.isActive !== false && !u.externalCreator;
}

/** The team, once. Fetched rather than subscribed — this runs at most once a session. */
export async function fetchTeamForBirthdays(): Promise<AppUser[]> {
  try {
    const snap = await getDocs(query(collection(db, "users"), where("isActive", "==", true)));
    return snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser)).filter(isTeammate);
  } catch (err) {
    console.error("[birthdays] could not read the team:", err);
    return [];
  }
}

/**
 * Tell everyone else whose birthday it is. Never throws — nobody's day should break over a
 * greeting, and the sweep runs on every page load.
 *
 * The birthday people are not notified about themselves; they get the greeting instead.
 */
export async function notifyBirthdaysOnOpen(
  team: AppUser[],
  today: Date = new Date(),
): Promise<void> {
  const celebrating = birthdaysOn(team.map((u) => ({ ...u, dob: u.dob })), today);
  if (celebrating.length === 0) return;

  const day = isoDay(today);
  const celebratingIds = new Set(celebrating.map((p) => p.uid));
  const message = birthdayNoticeMessage(celebrating);
  const key = celebrating.map((p) => p.uid).join("-");

  for (const member of team) {
    if (celebratingIds.has(member.uid)) continue;
    try {
      await sendNotification({
        userId: member.uid,
        type: "birthday",
        title: celebrating.length === 1 ? "🎂 Birthday today" : "🎂 Birthdays today",
        message,
        // One per teammate per birthday per day, however many people open the app.
        dedupeKey: `birthday_${key}_${day}_${member.uid}`,
      });
    } catch (err) {
      console.error("[birthdays] could not notify a teammate:", err);
    }
  }
}

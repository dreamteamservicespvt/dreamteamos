/**
 * The one thing about an employee that the whole internet may read.
 *
 * An ID card's QR opens `/verify/{uid}` in whatever phone scanned it — a client's security desk, a
 * landlord, a bank — so that page cannot require an account. Pointing it at `employee_profiles`
 * meant leaving the record that holds PAN, Aadhaar, addresses and salary readable by anyone with
 * the public API key, which is far too high a price for confirming somebody works here.
 *
 * So the handful of fields already printed on the card the person is holding are copied to their
 * own document, and only that is public. Verification tells a stranger nothing the badge in their
 * hand did not already tell them; the HR record can then be locked to the employee and their admin.
 *
 * A copy has to be kept in step, which is the cost. It is written from the two records it derives
 * from whenever either changes, and `syncPublicBadges` rebuilds the lot if they ever drift.
 */
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import type { AppUser } from "@/types";
import type { EmployeeProfile } from "@/types/hr";

export const PUBLIC_BADGES = "public_badges";

/** Exactly what is printed on the card — nothing else may be added here. */
export interface PublicBadge {
  name: string;
  employeeId: string;
  designation: string;
  department: string;
  photoUrl: string | null;
  /** yyyy-MM-dd, as stored. The page formats it. */
  joiningDate: string | null;
  /** Whether they work here today. The question a scan is actually asking. */
  active: boolean;
  /** Their last day, when they have left — so an old card says so rather than nothing. */
  lastWorkingDay: string | null;
  updatedAt?: unknown;
}

const DEPARTMENTS: Record<string, string> = { tech: "Technology", sales: "Sales" };

/**
 * Build the badge from the two records.
 *
 * Pure, so the rule about what may be exposed is testable on its own — the expensive mistake here
 * is not a stale badge, it is a field creeping in that should never have left the HR record.
 */
export function buildPublicBadge(
  user: Partial<AppUser> & { uid: string },
  profile?: Partial<EmployeeProfile> | null,
): PublicBadge {
  const role = String(user.role || "");
  return {
    name: (user.name || "").trim() || "—",
    employeeId: (user.employeeId || "").trim(),
    designation: (profile?.designation || "").trim(),
    department: DEPARTMENTS[String(profile?.department || "")]
      || (role.startsWith("sales") ? "Sales" : "Technology"),
    photoUrl: profile?.photoUrl || user.avatar || null,
    joiningDate: profile?.joiningDate || null,
    // Someone deactivated, or marked exited by HR, is not currently employed here.
    active: user.isActive !== false && profile?.stage !== "exited",
    lastWorkingDay: profile?.separation?.lastWorkingDay || null,
  };
}

/**
 * Refresh one person's badge from whatever the records say now.
 *
 * Best effort throughout: a failed badge write must never take down the save that triggered it.
 * The badge is a projection, and the records it is built from remain the truth.
 */
export async function syncPublicBadge(uid: string): Promise<void> {
  if (!uid) return;
  try {
    const [userSnap, profileSnap] = await Promise.all([
      getDoc(doc(db, "users", uid)),
      getDoc(doc(db, "employee_profiles", uid)).catch(() => null),
    ]);
    if (!userSnap.exists()) return;

    const user = { uid, ...(userSnap.data() as Partial<AppUser>) };
    const profile = profileSnap?.exists() ? (profileSnap.data() as Partial<EmployeeProfile>) : null;

    // Outside creators are not employees; publishing a badge for one would let a card be
    // "verified" for somebody the company never employed.
    if (user.externalCreator) {
      await setDoc(doc(db, PUBLIC_BADGES, uid), { active: false, updatedAt: serverTimestamp() }, { merge: true });
      return;
    }

    await setDoc(
      doc(db, PUBLIC_BADGES, uid),
      { ...buildPublicBadge(user, profile), updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (err) {
    console.error("[publicBadge] could not sync", uid, err);
  }
}

/** Rebuild a whole team's badges — used by the admin backfill after this shipped. */
export async function syncPublicBadges(uids: string[]): Promise<number> {
  let done = 0;
  for (const uid of [...new Set(uids)].filter(Boolean)) {
    await syncPublicBadge(uid);
    done += 1;
  }
  return done;
}

/**
 * The login password an admin set for a team member, kept so it can be sent back when the member
 * forgets it.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────────────────────
 * Members forget their password constantly, and until now the admin had nothing to give them: the
 * Firebase client SDK cannot read a password, and it cannot set someone else's either. The
 * "Share Credentials" message papered over it by claiming the password was the same as the email,
 * which was simply untrue for anyone whose password was set to anything else.
 *
 * ── Why its own collection ────────────────────────────────────────────────────────────────────
 * Not a field on the user doc. Half the app subscribes to the WHOLE `users` collection
 * (`useFirestoreCollection('users')`), so a password stored there would be downloaded by every
 * screen that lists people, on every session. Here it is one document read on demand, only when an
 * admin actually asks to see it — which also keeps it off the Firestore free-tier budget.
 *
 * ── The one thing that must be done outside this file ─────────────────────────────────────────
 * These are readable passwords. The protection is access control, and it lives in the Firebase
 * console, not in this repository:
 *
 *   match /member_credentials/{uid} {
 *     allow read, write: if request.auth != null
 *       && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
 *          in ['main_admin', 'tech_admin', 'sales_admin'];
 *   }
 *
 * Without that rule the collection is as readable as anything else in the database.
 */
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase";

const COLLECTION = "member_credentials";

export interface MemberCredential {
  uid: string;
  email: string;
  password: string;
  /** Who last set it — an admin uid, or the member's own uid when they changed it themselves. */
  setBy: string;
  setByName: string;
  updatedAt: unknown;
}

/**
 * Record the password a member can log in with.
 *
 * Called at creation AND whenever a member changes their own password, because a stored copy that
 * goes stale the first time someone uses Change Password is worse than none: the admin sends it in
 * good faith and the member cannot get in.
 *
 * Never throws. Creating the account is the part that must not fail — a credential that did not
 * save leaves the admin exactly where they were before this existed.
 */
export async function saveMemberPassword(params: {
  uid: string;
  email: string;
  password: string;
  setBy: string;
  setByName?: string;
}): Promise<void> {
  const { uid, email, password, setBy, setByName } = params;
  if (!uid || !password) return;
  try {
    await setDoc(doc(db, COLLECTION, uid), {
      uid,
      email: email.trim().toLowerCase(),
      password,
      setBy,
      setByName: setByName || "",
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("[memberCredentials] saveMemberPassword failed:", err);
  }
}

/** The stored password, or `null` when none was ever recorded (or it cannot be read). */
export async function fetchMemberPassword(uid: string): Promise<string | null> {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, COLLECTION, uid));
    if (!snap.exists()) return null;
    return (snap.data() as MemberCredential).password || null;
  } catch (err) {
    console.error("[memberCredentials] fetchMemberPassword failed:", err);
    return null;
  }
}

/** Drop a departed member's stored password. Never throws — deleting the member is what matters. */
export async function deleteMemberPassword(uid: string): Promise<void> {
  if (!uid) return;
  try {
    await deleteDoc(doc(db, COLLECTION, uid));
  } catch (err) {
    console.error("[memberCredentials] deleteMemberPassword failed:", err);
  }
}

/**
 * The WhatsApp login message for a member.
 *
 * The password goes in when we have one, and the old "contact your admin" line stands in when we
 * do not — a member created before this existed must not be sent a message with a blank where
 * their password should be.
 */
export function buildCredentialsMessage(params: {
  email: string;
  password?: string | null;
  loginUrl: string;
}): string {
  const { email, password, loginUrl } = params;
  return [
    `🌐 *Website Login*`,
    ``,
    `📧 *Your Email:* ${email}`,
    password ? `🔑 *Your Password:* ${password}` : `🔑 *Password:* please ask your admin`,
    `🔗 *Login here:* ${loginUrl}`,
    ``,
    password
      ? `Please keep this safe. You can change it any time from your profile.`
      : `If you forgot your password, please contact your admin.`,
  ].join("\n");
}

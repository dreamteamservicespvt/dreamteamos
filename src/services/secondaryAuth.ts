import { auth } from "@/services/firebase";
import { isNative } from "@/utils/platform";

/**
 * Create a staff member's login without signing the admin out.
 *
 * ── On the server since 2026-10-18 ───────────────────────────────────────────────────────────────
 * It used to call `createUserWithEmailAndPassword` from the browser on a second Firebase app instance. That needs
 * Firebase's PUBLIC email sign-up switched on — and with it on, anybody with the public web key could register their own
 * account, which the Firestore rules treat as staff (2026-10-18 rules audit, G1). Production now asks `api/staff-account`
 * (the Admin SDK; it checks the caller is an admin allowed to create `role`), so public sign-up can be switched off.
 * `vite dev` serves no `/api`, so a DEV build keeps the old browser path (the in-memory harness and local work).
 *
 * Returns `{ user: { uid } }` like the SDK's credential, and throws errors carrying Firebase's client codes
 * (`auth/email-already-in-use`, `auth/weak-password`, …) — the screens read `err.code` as before.
 */
export async function createUserWithoutSignOut(email: string, password: string, role: string): Promise<{ user: { uid: string } }> {
  if (import.meta.env.DEV) return createInBrowser(email, password);
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw Object.assign(new Error("Sign in again to add a member."), { code: "auth/requires-recent-login" });
  const base = isNative() ? "https://dreamteamos.vercel.app" : "";
  const res = await fetch(`${base}/api/staff-account`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, password, role }),
  });
  const body = (await res.json().catch(() => ({}))) as { uid?: string; error?: string; code?: string };
  if (!res.ok || !body.uid) throw Object.assign(new Error(body.error || "Could not create the account."), { code: body.code || "auth/internal-error" });
  return { user: { uid: body.uid } };
}

/** DEV only: the former browser path on a second app instance, so the admin stays signed in. */
async function createInBrowser(email: string, password: string): Promise<{ user: { uid: string } }> {
  const [{ initializeApp, getApps }, { getAuth, createUserWithEmailAndPassword }, { firebaseConfig }] = await Promise.all([
    import("firebase/app"), import("firebase/auth"), import("@/services/firebase"),
  ]);
  const secondaryApp = getApps().find((a) => a.name === "secondary") ?? initializeApp(firebaseConfig, "secondary");
  const secondaryAuth = getAuth(secondaryApp);
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  await secondaryAuth.signOut();
  return { user: { uid: cred.user.uid } };
}

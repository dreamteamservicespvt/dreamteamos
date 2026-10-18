/**
 * Creating a staff login — on the server (2026-10-18).
 *
 * ── Why ───────────────────────────────────────────────────────────────────────────────────────────
 * The admins' "add member" screens (main admin Team Management, tech / sales admin My Team) used to create the Firebase
 * account from the browser (`services/secondaryAuth`, a second app instance). That only works while Firebase's PUBLIC
 * email sign-up is switched on — and with it on, anybody holding the public web key can register an account of their own
 * through the Auth REST API, which the Firestore rules then treat as staff (`isStaff()` = signed in and not a chat
 * guest; the 2026-10-18 rules audit, G1). With accounts created here, public sign-up can be switched OFF
 * (Firebase console → Authentication → Settings → User actions → untick "Enable create (sign-up)"); the hiring link
 * (`api/onboarding`) already creates accounts on the server.
 *
 * POST `{ email, password, role }` with the admin's Firebase ID token. Who may create whom — as the screens allow:
 *   main_admin → every role except main_admin · tech_admin → tech_member / tech_team_leader · sales_admin → sales_member.
 * The caller must be an active staff member. Answers `{ uid }`, or `{ error, code }` with Firebase's client error codes
 * (`auth/email-already-in-use`, `auth/weak-password`, `auth/invalid-email`) so the screens' messages keep working.
 * Only the login is made here; the screens still write `users/{uid}` and the stored password, as before.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import admin from "firebase-admin";

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}");
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const ALLOWED_ORIGINS = ["https://localhost", "https://dreamteamos.vercel.app"];

/** The roles each admin may create (the screens' own rule). */
export const CAN_CREATE: Record<string, string[]> = {
  main_admin: ["tech_admin", "sales_admin", "accounts_admin", "tech_team_leader", "tech_member", "sales_member"],
  tech_admin: ["tech_member", "tech_team_leader"],
  sales_admin: ["sales_member"],
};

/** Firebase Admin's error codes → the client SDK's, which the screens already read. */
function clientCode(code: string): string {
  if (code === "auth/email-already-exists") return "auth/email-already-in-use";
  if (code === "auth/invalid-password") return "auth/weak-password";
  return code || "auth/internal-error";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = String(req.headers.origin || "");
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization ?? ""))?.[1];
  if (!token) return res.status(401).json({ error: "Sign in again to add a member.", code: "auth/requires-recent-login" });
  let callerUid: string;
  try {
    callerUid = (await admin.auth().verifyIdToken(token)).uid;
  } catch {
    return res.status(401).json({ error: "Sign in again to add a member.", code: "auth/requires-recent-login" });
  }

  const body = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {}) as Record<string, unknown>;
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const role = String(body.role ?? "");

  try {
    const caller = await admin.firestore().collection("users").doc(callerUid).get();
    const callerRole = String(caller.data()?.role ?? "");
    if (!caller.exists || caller.data()?.isActive === false || !(CAN_CREATE[callerRole] ?? []).includes(role)) {
      return res.status(403).json({ error: "You cannot add this kind of account.", code: "permission-denied" });
    }
  } catch (err) {
    console.error("[staff-account] caller check failed:", err);
    return res.status(500).json({ error: "Could not check your account — please try again.", code: "internal" });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Please enter a valid email address.", code: "auth/invalid-email" });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters.", code: "auth/weak-password" });

  try {
    const user = await admin.auth().createUser({ email, password });
    return res.status(200).json({ uid: user.uid });
  } catch (err) {
    const code = clientCode(String((err as { code?: unknown }).code ?? ""));
    const status = code === "auth/email-already-in-use" ? 409 : code === "auth/weak-password" || code === "auth/invalid-email" ? 400 : 500;
    if (status === 500) console.error("[staff-account] createUser failed:", err);
    return res.status(status).json({ error: status === 409 ? "Email already in use." : status === 400 ? "That email or password is not accepted." : "Could not create the account.", code });
  }
}

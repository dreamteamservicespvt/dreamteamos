/**
 * The customer's side of the connection.
 *
 * Everything here runs on a SEPARATE Firebase app instance. A client link is a URL that gets
 * forwarded around and opened anywhere — including on a machine where a team member is signed in —
 * and signing a guest into the app's own auth instance would throw that member out of their own
 * account. The guest gets their own instance, their own session, and no reach into the rest of the
 * app.
 */
import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, signInWithCustomToken, type Auth } from "firebase/auth";
import { getFirestore, doc, getDoc, type Firestore } from "firebase/firestore";
import { getMessaging, getToken, type Messaging } from "firebase/messaging";
import { firebaseConfig } from "@/services/firebase";
import { isNative } from "@/utils/platform";
import type { OrderChatDoc } from "@/types/orderChat";

const GUEST_APP_NAME = "orderChatGuest";

let cached: { app: FirebaseApp; auth: Auth; db: Firestore } | null = null;

function guestApp() {
  if (cached) return cached;
  const app = getApps().find((a) => a.name === GUEST_APP_NAME)
    ? getApp(GUEST_APP_NAME)
    : initializeApp(firebaseConfig, GUEST_APP_NAME);
  // Deliberately the default in-memory cache: a customer's phone should not be left holding an
  // on-disk copy of someone's business conversation, and the tab is short-lived anyway.
  cached = { app, auth: getAuth(app), db: getFirestore(app) };
  return cached;
}

export function guestDb(): Firestore {
  return guestApp().db;
}

/** The id the customer writes messages and places calls under, for one room. */
export function guestUid(chatId: string): string {
  return `guest_${chatId}`;
}

const devJoinKey = (chatId: string) => `orderChatDevJoin_${chatId}`;

/**
 * Whether this browser already holds a session for this room.
 *
 * Firebase restores the guest session from storage asynchronously, so this waits for the first
 * auth callback rather than reading `currentUser` too early and re-running the sign-in on every
 * refresh.
 */
export function hasGuestSession(chatId: string): Promise<boolean> {
  const { auth } = guestApp();
  return new Promise((resolve) => {
    const unsub = auth.onAuthStateChanged((u) => {
      unsub();
      if (u?.uid === guestUid(chatId)) { resolve(true); return; }
      // Dev has no serverless function to mint a token, so the session is remembered locally.
      resolve(import.meta.env.DEV && sessionStorage.getItem(devJoinKey(chatId)) === "1");
    });
  });
}

const API_BASE = isNative() ? "https://dreamteamos.vercel.app" : "";

export interface OpenResult {
  ok: boolean;
  /** Present when ok — what the header shows before any message has loaded. */
  chat?: { id: string; businessName: string; uniqueId: string; memberName: string; status: string };
  error?: "not_found" | "network";
}

/**
 * Exchanges the link the customer followed for access to that one room.
 *
 * There is nothing to type. The server checks the room exists and hands back a Firebase custom
 * token carrying an `orderChat` claim, which is what the Firestore rules match on — so the page
 * can read and write this conversation and reach nothing else. See api/order-chat.ts for why the
 * link itself is treated as the credential.
 */
export async function openOrderChat(chatId: string): Promise<OpenResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/order-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "open", chatId }),
    });
  } catch {
    return devFallbackOpen(chatId);
  }

  if (!res.ok) {
    let body: Record<string, unknown> = {};
    try { body = await res.json(); } catch { /* an HTML error page — treat as unreachable */ }
    if (body.error === "not_found") return { ok: false, error: "not_found" };
    return devFallbackOpen(chatId);
  }

  const data = await res.json();
  const { auth } = guestApp();
  await signInWithCustomToken(auth, data.token);
  return { ok: true, chat: data.chat };
}

/**
 * Opening the chat against a plain `vite dev` server, which has no serverless functions.
 *
 * Compiled out of production builds — `import.meta.env.DEV` is a literal `false` there, so the
 * whole branch is removed.
 */
async function devFallbackOpen(chatId: string): Promise<OpenResult> {
  if (!import.meta.env.DEV) return { ok: false, error: "network" };
  try {
    const snap = await getDoc(doc(guestDb(), "order_chats", chatId));
    if (!snap.exists()) return { ok: false, error: "not_found" };
    const room = snap.data() as OrderChatDoc;
    console.warn("[orderChat] dev fallback: no API server running, signed in as nobody");
    sessionStorage.setItem(devJoinKey(chatId), "1");
    return {
      ok: true,
      chat: {
        id: chatId,
        businessName: room.businessName || "",
        uniqueId: room.uniqueId || "",
        memberName: room.memberName || "",
        status: room.status || "open",
      },
    };
  } catch {
    return { ok: false, error: "network" };
  }
}

/**
 * Asks the server to alert the team.
 *
 * Sends the guest's own token: the server will only ring a member for someone holding a session
 * for that chat, so a stray link cannot be turned into a way of making a phone ring on demand.
 * Fire-and-forget either way — a customer's message must land in the room whether or not the
 * notification behind it got out.
 */
export function alertTeam(body: {
  chatId: string;
  kind: "message" | "call";
  preview?: string;
  callDocId?: string;
  callType?: "voice" | "video";
}): void {
  const { auth } = guestApp();
  Promise.resolve(auth.currentUser?.getIdToken())
    .then((token) => fetch(`${API_BASE}/api/order-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ action: "notify", ...body }),
    }))
    .catch(() => { /* no API server (dev) or offline — the message itself already went through */ });
}

// ─── Being reachable with the page shut ──────────────────────────────────────────────────────

export type PushState = "unsupported" | "default" | "granted" | "denied";

/** What this browser can do about notifications, before anyone has been asked anything. */
export function pushState(): PushState {
  if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) return "unsupported";
  return Notification.permission as PushState;
}

let messagingInstance: Messaging | null = null;

/**
 * Ask for notification permission and register this browser against this one room.
 *
 * ── Why the client page insists on this ───────────────────────────────────────────────────────
 * A customer is not sitting on this page. They send a photo of their shopfront and go back to
 * running their shop, and the reply lands hours later in a tab they closed. Without a notification
 * there is no reply — there is a message in a room nobody reopens, and the customer concludes
 * nobody answered. The unread badge only works for someone who comes back to look at it, and the
 * whole point of this feature is that they should not have to.
 *
 * Registered against `guest_<chatId>`, so the token is only ever sent to for this conversation and
 * a customer with two orders gets two separate, unlinked registrations.
 *
 * Returns the state the browser ended up in. `denied` is permanent until the customer changes it
 * in their own browser settings, which is why the page has to say so rather than ask again.
 */
export async function enableGuestPush(chatId: string): Promise<PushState> {
  if (pushState() === "unsupported") return "unsupported";
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return permission as PushState;

    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    // getToken needs an ACTIVE worker; a freshly registered one is still installing.
    await navigator.serviceWorker.ready;

    const { app, auth } = guestApp();
    messagingInstance = messagingInstance || getMessaging(app);
    const token = await getToken(messagingInstance, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY as string,
      serviceWorkerRegistration: registration,
    });
    if (!token) return "granted";

    const idToken = await auth.currentUser?.getIdToken();
    await fetch(`${API_BASE}/api/order-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({ action: "register-push", chatId, token }),
    });
    return "granted";
  } catch (err) {
    // Permission may well have been granted even if the token round-trip failed (no API server in
    // dev, a blocked worker). Report what the browser actually says rather than guessing.
    console.warn("[orderChat] could not register for notifications", err);
    return pushState();
  }
}

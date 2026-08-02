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
 * Whether this browser has already proved the code for this room.
 *
 * Firebase restores the guest session from storage asynchronously, so this waits for the first
 * auth callback rather than reading `currentUser` too early and sending a customer who is already
 * signed in back to the code screen on every refresh.
 */
export function hasGuestSession(chatId: string): Promise<boolean> {
  const { auth } = guestApp();
  return new Promise((resolve) => {
    const unsub = auth.onAuthStateChanged((u) => {
      unsub();
      if (u?.uid === guestUid(chatId)) { resolve(true); return; }
      // Dev has no serverless function to mint a token, so the join is remembered locally instead.
      resolve(import.meta.env.DEV && sessionStorage.getItem(devJoinKey(chatId)) === "1");
    });
  });
}

const API_BASE = isNative() ? "https://dreamteamos.vercel.app" : "";

export interface JoinResult {
  ok: boolean;
  /** Present when ok — what the header shows before any message has loaded. */
  chat?: { id: string; businessName: string; uniqueId: string; memberName: string; status: string };
  error?: "wrong_code" | "locked" | "not_found" | "network";
  attemptsLeft?: number;
  retryInSeconds?: number;
}

/**
 * Exchanges the four digits the customer typed for access to one room.
 *
 * The code is checked on the server (see api/order-chat.ts) and comes back as a Firebase custom
 * token carrying an `orderChat` claim, which is what the Firestore rules match on. Nothing that
 * could be used to open a different room is ever in the page.
 */
export async function joinOrderChat(chatId: string, code: string): Promise<JoinResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/order-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join", chatId, code }),
    });
  } catch {
    return devFallbackJoin(chatId, code);
  }

  if (!res.ok) {
    let body: Record<string, unknown> = {};
    try { body = await res.json(); } catch { /* an HTML error page — treat as unreachable */ }
    const error = body.error as JoinResult["error"] | undefined;
    if (!error) return devFallbackJoin(chatId, code);
    return {
      ok: false,
      error,
      attemptsLeft: body.attemptsLeft as number | undefined,
      retryInSeconds: body.retryInSeconds as number | undefined,
    };
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
 * whole branch is removed and the only way in remains the server-checked one.
 */
async function devFallbackJoin(chatId: string, code: string): Promise<JoinResult> {
  if (!import.meta.env.DEV) return { ok: false, error: "network" };
  try {
    const snap = await getDoc(doc(guestDb(), "order_chats", chatId));
    if (!snap.exists()) return { ok: false, error: "not_found" };
    const room = snap.data() as OrderChatDoc;
    if (String(room.accessCode) !== code) return { ok: false, error: "wrong_code" };
    console.warn("[orderChat] dev fallback: code checked in the browser, no API server running");
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
 * Asks the server to alert the team. Fire-and-forget: a customer's message must land in the room
 * whether or not the notification behind it got out.
 */
export function alertTeam(body: {
  chatId: string;
  kind: "message" | "call";
  preview?: string;
  callDocId?: string;
  callType?: "voice" | "video";
}): void {
  fetch(`${API_BASE}/api/order-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "notify", ...body }),
  }).catch(() => { /* no API server (dev) or offline — the message itself already went through */ });
}

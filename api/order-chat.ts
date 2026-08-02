/**
 * The client's way into an order chat, and their way of raising an alert.
 *
 * A customer has no account here and never will, so the two things they need are done for them on
 * the server: proving they hold the 4-digit code, and reaching the member who is doing their work.
 *
 * The code is checked here rather than in the page because a code compared in the browser has to be
 * sent to the browser first, where anyone holding the link can read it straight out of the network
 * tab. Instead the client posts what they typed, and gets back a Firebase custom token scoped by an
 * `orderChat` claim to exactly one room — which is also what the Firestore rules read.
 *
 * Notifications are raised here for the same reason: the recipients are derived from the chat
 * document, so a guest cannot address anyone the chat does not already contain.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import admin from "firebase-admin";

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}");
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const adminDb = admin.firestore();

/** Wrong tries allowed before the room stops answering, and for how long it stays quiet. */
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const APP_ICON = "https://res.cloudinary.com/dvmrhs2ek/image/upload/v1774554466/jdqjbuvcdo40o5gzdlvz.png";

/** Sends a push to one user, and writes the in-app row the bell reads. */
async function alertUser(opts: {
  userId: string; type: string; title: string; message: string; link: string; callDocId?: string;
}) {
  const { userId, type, title, message, link, callDocId } = opts;

  await adminDb.collection("notifications").add({
    userId, type, title, message, link, read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const tokensSnap = await adminDb.collection("fcmTokens").where("userId", "==", userId).get();
  if (tokensSnap.empty) return;
  const tokens = tokensSnap.docs.map((d) => d.data().token as string);

  const isCall = type === "voice_call" || type === "video_call";
  const channelId = isCall ? "calls" : type === "chat_message" ? "messages" : "default";

  try {
    await admin.messaging().sendEachForMulticast({
      tokens,
      data: {
        title, body: message, type, channelId, link, icon: APP_ICON,
        ...(callDocId ? { callDocId } : {}),
      },
      android: { priority: "high", ttl: isCall ? 0 : 86400000 },
      webpush: { headers: { Urgency: "high" }, notification: { title, body: message, icon: APP_ICON } },
    });
  } catch (err) {
    console.error("[order-chat] push failed", err);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin || "";
  // The client opens this page in an ordinary browser, so any origin may legitimately call it;
  // nothing here is authorised by origin — `join` is authorised by the code, `notify` by the room.
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { action, chatId } = req.body || {};
    if (!chatId || typeof chatId !== "string") {
      return res.status(400).json({ error: "Missing chatId" });
    }

    const roomRef = adminDb.collection("order_chats").doc(chatId);
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) return res.status(404).json({ error: "not_found" });
    const room = roomSnap.data() as Record<string, any>;

    // ── Prove the code and hand back a token for this one room ──────────────────────────────────
    if (action === "join") {
      const code = String(req.body.code ?? "");

      const lockedUntil = Number(room.lockedUntil || 0);
      if (lockedUntil > Date.now()) {
        return res.status(429).json({
          error: "locked",
          retryInSeconds: Math.ceil((lockedUntil - Date.now()) / 1000),
        });
      }

      if (!code || code !== String(room.accessCode)) {
        const attempts = Number(room.failedAttempts || 0) + 1;
        const nowLocked = attempts >= MAX_ATTEMPTS;
        await roomRef.update({
          failedAttempts: nowLocked ? 0 : attempts,
          ...(nowLocked ? { lockedUntil: Date.now() + LOCKOUT_MS } : {}),
        });
        return res.status(401).json({
          error: nowLocked ? "locked" : "wrong_code",
          attemptsLeft: nowLocked ? 0 : MAX_ATTEMPTS - attempts,
          ...(nowLocked ? { retryInSeconds: Math.ceil(LOCKOUT_MS / 1000) } : {}),
        });
      }

      if (room.failedAttempts) await roomRef.update({ failedAttempts: 0, lockedUntil: 0 });

      const token = await admin.auth().createCustomToken(`guest_${chatId}`, { orderChat: chatId });

      return res.status(200).json({
        token,
        chat: {
          id: chatId,
          businessName: room.businessName || "",
          uniqueId: room.uniqueId || "",
          memberName: room.memberName || "",
          status: room.status || "open",
        },
      });
    }

    // ── Tell the team the client wants them ─────────────────────────────────────────────────────
    if (action === "notify") {
      const kind = String(req.body.kind || "message"); // "message" | "call"
      const preview = String(req.body.preview || "").slice(0, 120);
      const callDocId = req.body.callDocId ? String(req.body.callDocId) : undefined;
      const callType = req.body.callType === "video" ? "video" : "voice";

      const memberUid = String(room.memberUid || "");
      const who = room.businessName || room.clientName || "The client";
      const link = "/tech/my-work";

      if (kind === "call") {
        if (memberUid) {
          await alertUser({
            userId: memberUid,
            type: callType === "video" ? "video_call" : "voice_call",
            title: `Incoming ${callType} call from ${who}`,
            message: `${who} is calling about ${room.uniqueId || "your assigned work"}`,
            link,
            callDocId,
          });
        }
        /**
         * Leader and admin are told, but never rung. They hold many orders at once, so a phone
         * ringing for every client of every member is the fastest way to make them mute the app.
         */
        const watchers: string[] = (room.participants || []).filter((uid: string) => uid && uid !== memberUid);
        await Promise.all(watchers.map((uid) => alertUser({
          userId: uid,
          type: "order_chat_call",
          title: "Client is calling",
          message: `${who} is calling ${room.memberName || "the assigned member"} about ${room.uniqueId || "their work"}.`,
          link,
        })));
        return res.status(200).json({ success: true });
      }

      // A message: only the member is pushed. The others get a badge on the assignment card.
      const active: string[] = room.activeUsers || [];
      if (memberUid && !active.includes(memberUid)) {
        await alertUser({
          userId: memberUid,
          type: "chat_message",
          title: `${who} sent a message`,
          message: preview || "New message about your assigned work",
          link,
        });
      }
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (error) {
    console.error("[order-chat] error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

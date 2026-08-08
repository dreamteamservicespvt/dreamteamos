/**
 * The client's way into an order chat, and the alerts that travel in both directions.
 *
 * A customer has no account here and never will, so everything they cannot do for themselves is
 * done for them on the server: getting into their own room, reaching the member doing their work,
 * and being reachable when they are not looking at the page.
 *
 * ── Why there is no longer a code to type ─────────────────────────────────────────────────────
 * The chat used to be opened with four digits sent alongside the link. It was the wrong lock for
 * these customers. Half of them are small business owners reached on WhatsApp who do not read past
 * the first line of a message, and asking them to find a code in it and type it into a box was the
 * single biggest reason a chat was never opened at all — the feature exists to be easier than a
 * WhatsApp group, and it was harder.
 *
 * The link IS the credential now. `chatId` is a Firestore auto-id: 20 characters from a 62-symbol
 * alphabet, which is not something anyone guesses their way into. It is the same bearer-URL model
 * as an unlisted document link, and the exposure is one customer's own conversation about their own
 * order. What the link does NOT do is let its holder reach anything else: the token minted below is
 * scoped by an `orderChat` claim to exactly this room, and every rule in the database matches on it.
 *
 * Notifications are raised here rather than from either browser because the recipients are derived
 * from the chat document — so neither side can address anyone the room does not already contain.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import admin from "firebase-admin";

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}");
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const adminDb = admin.firestore();

const APP_ICON = "https://res.cloudinary.com/dvmrhs2ek/image/upload/v1774554466/jdqjbuvcdo40o5gzdlvz.png";

/**
 * What the customer is told they are talking to.
 *
 * Duplicated from utils/company rather than imported: this file runs on Vercel's Node runtime and
 * must not pull in the browser bundle's module graph.
 */
const COMPANY_NAME = "Dream Team Services";

/** The id a customer holds for one room — their sender id, their call id, their push id. */
const guestUid = (chatId: string) => `guest_${chatId}`;

interface Room {
  businessName?: string;
  clientName?: string;
  clientPhone?: string;
  uniqueId?: string;
  memberUid?: string;
  memberName?: string;
  soldByUid?: string;
  soldByName?: string;
  orderId?: string;
  status?: string;
  participants?: string[];
  activeUsers?: string[];
  clientReview?: { work?: number; service?: number } | null;
  activeAt?: Record<string, number>;
}

/**
 * How recent a presence heartbeat has to be to count as "still reading this".
 *
 * Mirrors PRESENCE_FRESH_MS in services/orderChat — kept as its own constant because this file is
 * a serverless function and deliberately does not import the browser bundle's module graph.
 */
const PRESENCE_FRESH_MS = 120_000;

/**
 * Is this viewer actually looking at the room right now?
 *
 * ── Why a flag was not enough ─────────────────────────────────────────────────────────────────
 * Presence used to be membership of `activeUsers`: added when the room opened, removed when it
 * closed. On a phone the "removed" half frequently never ran — swiping the app away, the OS
 * reclaiming it, or a dropped connection all skip it. The member stayed listed as present for
 * ever, and this function's caller reads present as "no need to notify them", so every subsequent
 * message from that client vanished into a badge nobody was looking at. That is the reported bug:
 * the notification simply stopped coming, permanently, for the busiest conversations.
 *
 * A heartbeat expires by itself. The room refreshes it while it is open, so a stuck flag costs at
 * most one suppressed notification instead of all of them.
 */
function isPresent(room: Room, viewer: string, now = Date.now()): boolean {
  const beat = room.activeAt?.[viewer];
  if (typeof beat === "number") return now - beat < PRESENCE_FRESH_MS;
  // Written by a build that only kept the flag — trust it, and it self-heals on the next open.
  return (room.activeUsers || []).includes(viewer);
}

/** A score is one of five stars. Anything else is a browser that has been tampered with. */
const star = (v: unknown): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : 5;
};

/**
 * The clients collection is keyed by the customer's number, digits only.
 *
 * Duplicated from utils/phone.phoneLockId rather than imported — this file runs on Vercel's Node
 * runtime and must not pull in the browser bundle's module graph. The input is already normalised
 * (it was written by the app), so stripping non-digits is the whole of it.
 */
const phoneKey = (phone?: string): string => (phone || "").replace(/[^0-9]/g, "");

/** Sends a push to one recipient, and writes the in-app row the bell reads. */
async function alertUser(opts: {
  userId: string;
  type: string;
  title: string;
  message: string;
  link: string;
  callDocId?: string;
  /** Skip the Firestore row — a customer has no bell to write to. */
  pushOnly?: boolean;
}) {
  const { userId, type, title, message, link, callDocId, pushOnly } = opts;

  if (!pushOnly) {
    await adminDb.collection("notifications").add({
      userId, type, title, message, link, read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  const tokensSnap = await adminDb.collection("fcmTokens").where("userId", "==", userId).get();
  if (tokensSnap.empty) return;
  // Row ids are kept alongside the tokens because a guest's id is `<token>__<chatId>`, not the
  // bare token — deleting a dead one has to go by the row, not by what is inside it.
  const rows = tokensSnap.docs.map((d) => ({ id: d.id, token: d.data().token as string }));
  const tokens = rows.map((r) => r.token);

  const isCall = type === "voice_call" || type === "video_call";
  const channelId = isCall ? "calls" : type === "chat_message" ? "messages" : "default";

  try {
    const result = await admin.messaging().sendEachForMulticast({
      tokens,
      data: {
        title, body: message, type, channelId, link, icon: APP_ICON,
        ...(callDocId ? { callDocId } : {}),
      },
      android: { priority: "high", ttl: isCall ? 0 : 86400000 },
      // Data-only, with no `notification` block — see api/send-notification.ts for the full
      // reasoning. In short: a `notification` payload is auto-displayed by the browser AND our
      // service worker displays one from `data`, which is where the doubled banners came from.
      webpush: { headers: { Urgency: "high" } },
    });

    /**
     * Retire tokens the device behind them has thrown away.
     *
     * A customer's browser reissues its token whenever storage is cleared, and every dead one stays
     * in the collection being sent to forever. Left alone, a room ends up with a dozen tokens, and
     * every push costs a dozen failed sends before the one that lands.
     */
    const dead = result.responses
      .map((r, i) => (r.success ? null : { id: rows[i].id, code: r.error?.code }))
      .filter((r): r is { id: string; code?: string } =>
        !!r && (r.code === "messaging/registration-token-not-registered"
          || r.code === "messaging/invalid-registration-token"));
    await Promise.all(dead.map((d) => adminDb.collection("fcmTokens").doc(d.id).delete().catch(() => {})));
  } catch (err) {
    console.error("[order-chat] push failed", err);
  }
}

/**
 * Only our own pages may call this from a browser.
 *
 * Reflecting whatever `Origin` arrives would let any site on the internet script this endpoint from
 * a visitor's browser — which for `notify` means ringing a member's phone. Preview deployments are
 * matched by name rather than listed, since their hostnames change with every push.
 */
function allowedOrigin(origin: string): string | null {
  if (!origin) return null;
  if (origin === "https://dreamteamos.vercel.app") return origin;
  if (origin === "https://localhost") return origin;            // the Capacitor shell
  if (/^https:\/\/dreamteamos-[a-z0-9-]+\.vercel\.app$/.test(origin)) return origin;
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return origin; // vite dev
  return null;
}

const bearer = (authHeader?: string): string =>
  authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

/**
 * Proves the caller is the customer whose link this is.
 *
 * `open` is authorised by holding the link; everything after it is authorised by the token the
 * link bought. Without this, anyone who came by a chat URL could post `notify` in a loop and ring
 * the assigned member's phone until they turned the app off.
 */
async function isGuestOf(chatId: string, authHeader?: string): Promise<boolean> {
  const token = bearer(authHeader);
  if (!token) return false;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded.orderChat === chatId;
  } catch {
    return false;
  }
}

/**
 * Where a notification should actually land this particular person.
 *
 * Routes in this app are gated by role — `AppLayout` bounces anyone whose role is not on the
 * route's allow-list straight to the login screen. Every alert from here used to link to
 * `/tech/my-work`, which is a tech member's page, so a team leader or an admin who tapped
 * "Client is calling" was signed out of the app instead of being shown the call. One read per
 * recipient, and only on a notification, is a fair price for a link that works.
 */
async function homeFor(userId: string): Promise<string> {
  try {
    const snap = await adminDb.collection("users").doc(userId).get();
    switch (snap.data()?.role) {
      case "tech_member": return "/tech/my-work";
      case "tech_team_leader": return "/team-leader/work-assign";
      case "tech_admin":
      case "main_admin": return "/tech-admin/work-assign";
      // The seller is on these rooms now, and this is the page that lists them.
      case "sales_member": return "/sales/client-chats";
      default: return "/";
    }
  } catch {
    // "/" resolves to whatever that person's own default page is, which is never a dead end.
    return "/";
  }
}

/** Proves the caller is a signed-in member of staff who belongs to this room. Returns their uid. */
async function staffOf(chatId: string, room: Room, authHeader?: string): Promise<string | null> {
  const token = bearer(authHeader);
  if (!token) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    // A guest token carries the claim; a staff account never does. Belt and braces — the
    // participants check below would fail for a guest anyway.
    if (decoded.orderChat) return null;
    const uid = decoded.uid;
    return (room.participants || []).includes(uid) ? uid : null;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = allowedOrigin(req.headers.origin || "");
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

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
    const room = (roomSnap.data() || {}) as Room;

    const who = room.businessName || room.clientName || "The client";
    const clientLink = `/c/${chatId}`;

    // ── Open the room: the link is the credential ───────────────────────────────────────────────
    if (action === "open") {
      const token = await admin.auth().createCustomToken(guestUid(chatId), { orderChat: chatId });
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

    // ── The customer's device, so it can be reached with the page shut ──────────────────────────
    if (action === "register-push") {
      if (!(await isGuestOf(chatId, req.headers.authorization))) {
        return res.status(403).json({ error: "forbidden" });
      }
      const token = String(req.body.token || "");
      if (!token) return res.status(400).json({ error: "Missing token" });
      /**
       * Keyed by token AND room, unlike a staff registration.
       *
       * A browser has exactly one FCM token, and staff store it under that token as the document
       * id. A customer with two orders open in the same browser would then have their second chat
       * overwrite the `userId` on the first — and the first conversation would silently stop being
       * able to reach them. One row per room fixes that; `alertUser` queries on `userId`, so the
       * shape of the id is nothing it cares about.
       */
      await adminDb.collection("fcmTokens").doc(`${token}__${chatId}`).set({
        userId: guestUid(chatId),
        token,
        platform: "web",
        orderChat: chatId,
        createdAt: new Date().toISOString(),
      });
      return res.status(200).json({ success: true });
    }

    // ── Tell the team the client wants them ─────────────────────────────────────────────────────
    if (action === "notify") {
      if (!(await isGuestOf(chatId, req.headers.authorization))) {
        return res.status(403).json({ error: "forbidden" });
      }

      const kind = String(req.body.kind || "message"); // "message" | "call"
      const preview = String(req.body.preview || "").slice(0, 120);
      const callDocId = req.body.callDocId ? String(req.body.callDocId) : undefined;

      const memberUid = String(room.memberUid || "");

      if (kind === "call") {
        if (memberUid) {
          const home = await homeFor(memberUid);
          await alertUser({
            userId: memberUid,
            type: "voice_call",
            title: `Incoming call from ${who}`,
            message: `${who} is calling about ${room.uniqueId || "your assigned work"}`,
            // Straight to the call, not to a list of jobs. Tapping a ringing phone has to put the
            // answer button in front of the member, not somewhere they can navigate to it from.
            link: callDocId ? `${home}?call=${callDocId}` : home,
            callDocId,
          });
        }
        /**
         * Leader and admin are told, but never rung. They hold many orders at once, so a phone
         * ringing for every client of every member is the fastest way to make them mute the app.
         */
        const watchers: string[] = (room.participants || []).filter((uid) => uid && uid !== memberUid);
        await Promise.all(watchers.map(async (uid) => alertUser({
          userId: uid,
          type: "order_chat_call",
          title: "Client is calling",
          message: `${who} is calling ${room.memberName || "the assigned member"} about ${room.uniqueId || "their work"}.`,
          link: await homeFor(uid),
        })));
        return res.status(200).json({ success: true });
      }

      // A message: only the member is pushed. The others get a badge on the assignment card.
      if (memberUid && !isPresent(room, memberUid)) {
        const home = await homeFor(memberUid);
        await alertUser({
          userId: memberUid,
          type: "chat_message",
          title: `${who} sent a message`,
          message: preview || "New message about your assigned work",
          // Only My Work knows how to open a chat from a link; a leader lands on their own page
          // and opens it from the job, which is where they were going to do it from anyway.
          link: home === "/tech/my-work" ? `${home}?chat=${chatId}` : home,
        });
      }
      return res.status(200).json({ success: true });
    }

    // ── Tell the client the team wants them ─────────────────────────────────────────────────────
    /**
     * The other half of the conversation, and the half that was missing.
     *
     * A customer with the tab closed had no way of learning that the ad they are waiting for had
     * arrived — the room bumped an unread counter nobody was looking at. Now their browser is
     * registered above and reachable here, which is the whole reason the page asks for permission
     * before it lets them in.
     */
    if (action === "notify-client") {
      const uid = await staffOf(chatId, room, req.headers.authorization);
      if (!uid) return res.status(403).json({ error: "forbidden" });

      const kind = String(req.body.kind || "message");
      const preview = String(req.body.preview || "").slice(0, 120);
      const callDocId = req.body.callDocId ? String(req.body.callDocId) : undefined;
      /**
       * The company, never the member's name.
       *
       * A notification is the one part of this that lands on a stranger's lock screen, so it is
       * the last place an individual's name should appear. The customer is dealing with Dream Team
       * Services; the day their job is reassigned, nothing they have seen needs to change.
       */
      const from = COMPANY_NAME;

      // Reading the room right now is the same as having been told.
      if (kind !== "call" && isPresent(room, "client")) return res.status(200).json({ success: true });

      await alertUser({
        userId: guestUid(chatId),
        pushOnly: true, // no account, so no bell — the phone's own notification is the whole point
        type: kind === "call" ? "voice_call" : "chat_message",
        title: kind === "call" ? `${from} is calling you` : `${from} sent you a message`,
        message: kind === "call"
          ? `About your ${room.uniqueId || "order"} — tap to answer`
          : preview || "Open your project chat to read it",
        link: kind === "call" && callDocId ? `${clientLink}?call=${callDocId}` : clientLink,
        callDocId,
      });
      return res.status(200).json({ success: true });
    }

    // ── Where "ask about another ad" should send them ───────────────────────────────────────────
    /**
     * Resolved here, at the moment the button is drawn, rather than copied onto the room when the
     * job was assigned.
     *
     * Sellers change handsets, and a number mirrored onto three hundred conversations months ago
     * is three hundred dead ends nobody will notice until a customer complains that nobody
     * answered. One read, always current. It also means a stranger holding the link learns nothing
     * about our staff until they actually ask to be put in touch.
     */
    if (action === "enquiry-target") {
      if (!(await isGuestOf(chatId, req.headers.authorization))) {
        return res.status(403).json({ error: "forbidden" });
      }
      if (!room.soldByUid) return res.status(200).json({ phone: null, name: null });
      try {
        const seller = await adminDb.collection("users").doc(room.soldByUid).get();
        const data = seller.data() || {};
        const phone = String(data.businessWhatsapp || "").trim();
        // An inactive seller's number is not somewhere to send a warm lead.
        const usable = phone && data.isActive !== false ? phone : null;
        return res.status(200).json({ phone: usable, name: usable ? (data.name || null) : null });
      } catch {
        return res.status(200).json({ phone: null, name: null });
      }
    }

    // ── What the customer thought of the finished ad ────────────────────────────────────────────
    /**
     * The customer's browser has already written the review onto its own chat document — that is
     * the copy that matters and the one their screen reads back. This mirrors it outward to the
     * places staff work, and tells the two people who earned it.
     *
     * Mirroring is done here rather than in the browser because a guest can write to exactly one
     * document — their own room — and must never be able to touch an order or a client record.
     */
    if (action === "submit-review") {
      if (!(await isGuestOf(chatId, req.headers.authorization))) {
        return res.status(403).json({ error: "forbidden" });
      }

      const work = star(req.body.work);
      const service = star(req.body.service);
      const comment = String(req.body.comment || "").slice(0, 500).trim();
      const previous = room.clientReview || null;
      const changed = !previous || previous.work !== work || previous.service !== service;

      const review = {
        work,
        service,
        ...(comment ? { comment } : {}),
        submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // The room, again — the browser wrote it too, but a review that reached the server and not
      // the room would be a review the customer cannot see they gave.
      await roomRef.set({ clientReview: review }, { merge: true });

      if (room.orderId) {
        await adminDb.collection("orders").doc(room.orderId)
          .set({ clientReview: review }, { merge: true })
          .catch(() => { /* the order may have been purged; the review still stands */ });
      }

      /**
       * Onto the customer's own record, so "what do they think of us?" is answerable before an
       * upsell call rather than after it. Read-modify-write on an array keyed by assignment, since
       * a second review from the same job is an edit, not another opinion.
       */
      const clientId = phoneKey(room.clientPhone);
      if (clientId) {
        try {
          const clientRef = adminDb.collection("clients").doc(clientId);
          const snap = await clientRef.get();
          if (snap.exists) {
            const rows: Record<string, unknown>[] = (snap.data()?.reviews as Record<string, unknown>[]) || [];
            const entry = {
              assignmentId: chatId,
              orderId: room.orderId || null,
              uniqueId: room.uniqueId || null,
              work,
              service,
              comment: comment || null,
              soldBy: room.soldByUid || null,
              soldByName: room.soldByName || null,
              deliveredBy: room.memberUid || null,
              deliveredByName: room.memberName || null,
              at: admin.firestore.Timestamp.now(),
            };
            const at = rows.findIndex((r) => r.assignmentId === chatId);
            if (at >= 0) rows[at] = entry; else rows.push(entry);
            await clientRef.set({ reviews: rows }, { merge: true });
          }
        } catch (err) {
          console.error("[order-chat] could not put the review on the client record", err);
        }
      }

      /**
       * Told once per verdict, not once per keystroke.
       *
       * A customer nudging a comment about does not need to ring two phones again — only a score
       * that actually moved is news. Both the maker and the seller hear it: one is being told how
       * their work landed, the other whether this client is worth calling back next month.
       */
      if (changed) {
        const stars = `${work}★ work · ${service}★ service`;
        const audience = Array.from(new Set([room.memberUid, room.soldByUid].filter(Boolean) as string[]));
        await Promise.all(audience.map(async (uid) => alertUser({
          userId: uid,
          type: work <= 3 || service <= 3 ? "client_review_low" : "client_review",
          title: work <= 3 || service <= 3 ? "A client rated their ad poorly" : "A client reviewed their ad",
          message: `${who} rated ${room.uniqueId || "their ad"} ${stars}.${comment ? ` "${comment}"` : ""}`,
          link: await homeFor(uid),
        })));
      }

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (error) {
    console.error("[order-chat] error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

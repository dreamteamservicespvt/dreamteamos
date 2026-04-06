import type { VercelRequest, VercelResponse } from "@vercel/node";
import admin from "firebase-admin";

// Initialize Firebase Admin SDK once
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const adminDb = admin.firestore();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS: allow Capacitor native app (https://localhost) and the web origin
  const origin = req.headers.origin || "";
  const allowedOrigins = ["https://localhost", "https://dreamteamos.vercel.app"];
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userId, title, message, link, type } = req.body;

    if (!userId || !title || !message) {
      return res.status(400).json({ error: "Missing required fields: userId, title, message" });
    }

    // Get all FCM tokens for this user
    const tokensSnap = await adminDb
      .collection("fcmTokens")
      .where("userId", "==", userId)
      .get();

    if (tokensSnap.empty) {
      return res.status(200).json({ success: true, sent: 0, reason: "No FCM tokens found" });
    }

    const tokens = tokensSnap.docs.map((d) => d.data().token as string);

    const APP_ICON = "https://res.cloudinary.com/dvmrhs2ek/image/upload/v1774554466/jdqjbuvcdo40o5gzdlvz.png";

    // Determine the correct Android notification channel based on type
    const notifType = type || "general";
    const channelId = (notifType === "voice_call" || notifType === "video_call") ? "calls"
      : notifType === "chat_message" ? "messages"
      : "default";

    // Send push with both notification + data keys.
    // - notification key: lets Android show a system tray notification natively
    // - data key: carries payload for service worker (web) and tapAction (native)
    const pushMessage: admin.messaging.MulticastMessage = {
      tokens,
      notification: {
        title,
        body: message,
      },
      data: {
        title,
        body: message,
        type: notifType,
        link: link || "/",
        icon: APP_ICON,
      },
      android: {
        priority: "high",
        notification: {
          channelId,
          icon: "ic_notification",
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
      // Keep web behavior: data-only so service worker controls display
      webpush: {
        headers: { Urgency: "high" },
      },
    };

    const response = await admin.messaging().sendEachForMulticast(pushMessage);

    // Clean up invalid tokens
    const invalidTokens: string[] = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const code = resp.error?.code;
        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered"
        ) {
          invalidTokens.push(tokens[idx]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      const batch = adminDb.batch();
      for (const token of invalidTokens) {
        batch.delete(adminDb.collection("fcmTokens").doc(token));
      }
      await batch.commit();
    }

    return res.status(200).json({
      success: true,
      sent: response.successCount,
      failed: response.failureCount,
      cleaned: invalidTokens.length,
    });
  } catch (error: any) {
    console.error("Push notification error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

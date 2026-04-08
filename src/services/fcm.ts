import { getMessaging, getToken, deleteToken, onMessage } from "firebase/messaging";
import { doc, setDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";
import app, { db } from "@/services/firebase";
import { isNative } from "@/utils/platform";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string;

let messagingInstance: ReturnType<typeof getMessaging> | null = null;

function getMessagingInstance() {
  if (!messagingInstance) {
    messagingInstance = getMessaging(app);
  }
  return messagingInstance;
}

// ══════════════════════════════════════════════════
// NATIVE (Android) push notification helpers
// ══════════════════════════════════════════════════

let nativeListenersRegistered = false;

async function initFCMNative(userId: string): Promise<void> {
  const { PushNotifications } = await import("@capacitor/push-notifications");

  // Request permission (Android 13+ requires runtime prompt)
  const permResult = await PushNotifications.requestPermissions();
  if (permResult.receive !== "granted") return;

  // Register for push — triggers the 'registration' event
  await PushNotifications.register();

  if (!nativeListenersRegistered) {
    nativeListenersRegistered = true;

    // Receive the native FCM token
    PushNotifications.addListener("registration", async (tokenResult) => {
      const token = tokenResult.value;
      if (!token) return;
      await setDoc(doc(db, "fcmTokens", token), {
        userId,
        token,
        platform: "android",
        createdAt: new Date().toISOString(),
      });
    });

    PushNotifications.addListener("registrationError", (err) => {
      console.error("Native push registration error:", err);
    });

    // Foreground notification — show a local notification (heads-up) so user sees it
    PushNotifications.addListener("pushNotificationReceived", (notification) => {
      // Use the Capacitor LocalNotifications plugin to display a heads-up notification
      import("@capacitor/local-notifications").then(({ LocalNotifications }) => {
        const data = notification.data || {};
        const type = data.type || "general";
        // Pick channel based on type
        const channelId = data.channelId
          || ((type === "voice_call" || type === "video_call") ? "calls"
            : type === "chat_message" ? "messages"
            : "default");

        LocalNotifications.schedule({
          notifications: [{
            title: notification.title || data.title || "Dream Team",
            body: notification.body || data.body || "",
            id: Date.now(),
            channelId,
            extra: data,
            smallIcon: "ic_notification",
          }],
        });
      }).catch(() => {
        // Fallback: ignore if LocalNotifications not available
      });
    });

    // User tapped a push notification — navigate to the link
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const link = action.notification.data?.link;
      if (link && typeof link === "string" && link !== "/") {
        // Use hash-based navigation instead of full page reload
        // Full reload destroys React state → Firebase auth re-init → brief null user → logout
        setTimeout(() => {
          window.location.hash = "";
          // Use history.pushState + React Router-compatible navigation
          const navEvent = new PopStateEvent("popstate");
          window.history.pushState({}, "", link);
          window.dispatchEvent(navEvent);
        }, 500); // Small delay to let the app fully resume from background
      }
    });

    // User tapped a local notification (foreground re-posted) — navigate to the link
    import("@capacitor/local-notifications").then(({ LocalNotifications }) => {
      LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
        const link = action.notification.extra?.link;
        if (link && typeof link === "string" && link !== "/") {
          setTimeout(() => {
            window.location.hash = "";
            const navEvent = new PopStateEvent("popstate");
            window.history.pushState({}, "", link);
            window.dispatchEvent(navEvent);
          }, 300);
        }
      });
    }).catch(() => {});
  }
}

async function deleteFCMNative(userId: string): Promise<void> {
  // Remove all tokens for this user from Firestore
  const q = query(collection(db, "fcmTokens"), where("userId", "==", userId));
  const snap = await getDocs(q);
  const deletePromises = snap.docs.map((d) => deleteDoc(doc(db, "fcmTokens", d.id)));
  await Promise.all(deletePromises);
}

// ══════════════════════════════════════════════════
// WEB push notification helpers (existing logic)
// ══════════════════════════════════════════════════

async function initFCMWeb(userId: string): Promise<void> {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;

  const sw = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

  // Wait for the service worker to be active before requesting an FCM token
  if (sw.installing) {
    await new Promise<void>((resolve) => {
      sw.installing!.addEventListener("statechange", function onStateChange() {
        if (this.state === "activated") {
          this.removeEventListener("statechange", onStateChange);
          resolve();
        }
      });
    });
  } else if (sw.waiting) {
    await new Promise<void>((resolve) => {
      sw.waiting!.addEventListener("statechange", function onStateChange() {
        if (this.state === "activated") {
          this.removeEventListener("statechange", onStateChange);
          resolve();
        }
      });
    });
  }

  const messaging = getMessagingInstance();
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: sw,
  });

  if (!token) return;

  await setDoc(doc(db, "fcmTokens", token), {
    userId,
    token,
    platform: "web",
    createdAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
  });
}

async function deleteFCMWeb(userId: string): Promise<void> {
  const messaging = getMessagingInstance();
  await deleteToken(messaging);

  const q = query(collection(db, "fcmTokens"), where("userId", "==", userId));
  const snap = await getDocs(q);
  const deletePromises = snap.docs.map((d) => deleteDoc(doc(db, "fcmTokens", d.id)));
  await Promise.all(deletePromises);
}

// ══════════════════════════════════════════════════
// Public API — auto-selects native vs web path
// ══════════════════════════════════════════════════

/**
 * Request notification permission, get FCM token, and store it in Firestore.
 * Call once when the authenticated user loads.
 */
export async function initFCM(userId: string): Promise<void> {
  try {
    if (isNative()) {
      await initFCMNative(userId);
    } else {
      await initFCMWeb(userId);
    }
  } catch (err) {
    console.error("FCM init failed:", err);
  }
}

/**
 * Listen for foreground messages and show a browser notification.
 * Returns an unsubscribe function. On native, this is a no-op (handled by native listener).
 */
export function onForegroundMessage(callback?: (payload: any) => void): () => void {
  if (isNative()) return () => {};
  try {
    const messaging = getMessagingInstance();
    return onMessage(messaging, (payload) => {
      if (callback) callback(payload);
    });
  } catch {
    return () => {};
  }
}

/**
 * Delete the current FCM token and remove all tokens for this user from Firestore.
 * Call on logout.
 */
export async function deleteFCMToken(userId: string): Promise<void> {
  try {
    if (isNative()) {
      await deleteFCMNative(userId);
    } else {
      await deleteFCMWeb(userId);
    }
  } catch (err) {
    console.error("FCM token cleanup failed:", err);
  }
}

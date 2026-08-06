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

/**
 * A stable id for this install.
 *
 * FCM tokens are not stable: they rotate, and a browser that clears storage or a PWA that is
 * reinstalled issues a brand new one. Every one of those was stored as another row for the same
 * person, and the push API sends to every row it finds — so ONE event arrived on ONE phone two or
 * three times. (The old token is often still deliverable, so it is not cleaned up as invalid.)
 *
 * Tagging each token with the device it came from lets a new token replace its predecessor instead
 * of joining it. Best-effort: a browser with storage blocked returns "" and simply keeps the old
 * behaviour rather than failing to register at all.
 */
const DEVICE_ID_KEY = "dts_device_id";

function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const created = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    return "";
  }
}

/**
 * Store this token and retire any earlier token this same device holds for this same user.
 *
 * Filtered in memory rather than with a second `where`: a user's token set is a handful of rows,
 * and one equality query needs no composite index to exist first.
 */
async function saveToken(
  userId: string,
  token: string,
  platform: "web" | "android",
  extra: Record<string, string> = {},
): Promise<void> {
  const device = deviceId();
  await setDoc(doc(db, "fcmTokens", token), {
    userId,
    token,
    platform,
    ...(device ? { deviceId: device } : {}),
    createdAt: new Date().toISOString(),
    ...extra,
  });

  if (!device) return;
  try {
    const snap = await getDocs(query(collection(db, "fcmTokens"), where("userId", "==", userId)));
    await Promise.all(
      snap.docs
        .filter((d) => d.id !== token && (d.data() as { deviceId?: string }).deviceId === device)
        .map((d) => deleteDoc(doc(db, "fcmTokens", d.id))),
    );
  } catch (err) {
    // A cleanup failure must never stop the new token from being usable.
    console.error("Stale FCM token cleanup failed:", err);
  }
}

/**
 * Follow a notification's link without reloading the app.
 *
 * ── Two things this must not do ───────────────────────────────────────────────────────────────
 * 1. **Reload.** A full navigation tears React down, Firebase auth re-initialises, and there is a
 *    window where the user is null — which is what people report as being logged out by tapping a
 *    notification. `pushState` plus a synthetic popstate moves React Router without any of that.
 * 2. **Touch `location.hash`.** The previous version cleared the hash first, and assigning to it
 *    is itself a navigation in some WebViews — the exact reload it was written to avoid.
 *
 * `/` is followed like anything else now: RootRedirect resolves it to whatever the reader's own
 * home page is, carrying `?call=` along with it, which is how a tapped call notification reaches
 * the answer screen for a role whose route the sender could not have known.
 */
function followNotificationLink(link: unknown, delayMs: number): void {
  if (typeof link !== "string" || !link.startsWith("/")) return;
  // Same-origin paths only — a link is data that arrived over the wire.
  if (link.startsWith("//")) return;
  // A moment for the app to finish resuming from the background before the route changes.
  setTimeout(() => {
    window.history.pushState({}, "", link);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, delayMs);
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
      await saveToken(userId, token, "android");
    });

    PushNotifications.addListener("registrationError", (err) => {
      console.error("Native push registration error:", err);
    });

    // Foreground notification — show a local notification (heads-up) so user sees it
    PushNotifications.addListener("pushNotificationReceived", (notification) => {
      const data = notification.data || {};
      const type = data.type || "general";

      /**
       * A call the app is already ringing for does not also get a notification.
       *
       * This listener only fires while the app is running, and while the app is running
       * `VideoCallManager` has the incoming-call popup on screen with its own ringtone. Posting a
       * heads-up notification on top of it was the second of the two alerts people were getting
       * for one call. Answering from the notification and answering from the popup did the same
       * thing, so one of them was pure noise.
       */
      if (type === "voice_call" || type === "video_call") return;

      // Use the Capacitor LocalNotifications plugin to display a heads-up notification
      import("@capacitor/local-notifications").then(({ LocalNotifications }) => {
        const channelId = data.channelId || (type === "chat_message" ? "messages" : "default");

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

    // User tapped a push notification — go where it points.
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      followNotificationLink(action.notification.data?.link, 500);
    });

    // User tapped a local notification (foreground re-posted) — navigate to the link
    import("@capacitor/local-notifications").then(({ LocalNotifications }) => {
      LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
        followNotificationLink(action.notification.extra?.link, 300);
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

  await saveToken(userId, token, "web", { userAgent: navigator.userAgent });
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

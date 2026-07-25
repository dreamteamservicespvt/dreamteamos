/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDJcuVz64r8STeCmY-SqhFlv1nKvbjGmC8",
  authDomain: "dts-manager.firebaseapp.com",
  projectId: "dts-manager",
  storageBucket: "dts-manager.firebasestorage.app",
  messagingSenderId: "569171106682",
  appId: "1:569171106682:web:326467f9b90e953b2e14c3",
  measurementId: "G-3LWNG8G36G",
});

const APP_ICON = "https://res.cloudinary.com/dvmrhs2ek/image/upload/v1774554466/jdqjbuvcdo40o5gzdlvz.png";

// Handle push events directly so Chrome always sees showNotification()
// inside event.waitUntil — this prevents the
// "The site has been updated in the background" default notification.
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  // Firebase data-only messages put everything under payload.data
  const data = payload.data || payload;
  const title = data.title || "DTS Manager";
  const options = {
    body: data.body || "You have a new notification",
    icon: data.icon || APP_ICON,
    badge: APP_ICON,
    data: data,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link;
  if (link) {
    event.waitUntil(clients.openWindow(link));
  } else {
    event.waitUntil(clients.openWindow("/"));
  }
});

// ─── Updating ────────────────────────────────────────────────────────────────────────────────
// By default a new worker installs and then WAITS, indefinitely, until every tab running the old
// one has been closed. An installed PWA is rarely "closed" — it is left open on a phone for weeks —
// so the replacement never took over and members were reinstalling the app to get new versions.
//
// This worker caches nothing, so there is no risk in swapping it immediately: taking control at
// once simply means the newest code is the code that runs.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Drop anything a previous version of this worker may have cached. A stale app shell left
    // behind by an older build is exactly what kept serving old code.
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch {
      // Cache Storage unavailable — nothing cached, nothing to clear.
    }
    await self.clients.claim();
  })());
});

// Lets the page ask this worker to step aside the moment a new one is ready.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

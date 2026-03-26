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

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  // We send data-only messages, so read title/body from payload.data
  const data = payload.data || {};
  const notifTitle = data.title || "DTS Manager";
  const notifOptions = {
    body: data.body || "You have a new notification",
    icon: "/favicon.ico",
    data: data,
  };
  self.registration.showNotification(notifTitle, notifOptions);
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

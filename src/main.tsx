import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initCapacitorPlugins } from "@/services/capacitor-plugins";

// Initialize native Capacitor plugins (no-ops on web)
initCapacitorPlugins();

// PWA installability: some browsers only offer "Install app" once a service worker is
// active. The FCM worker doubles as ours, but fcm.ts registers it only after notification
// permission — register it up-front too (same URL + scope, so the later call is a no-op).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/firebase-messaging-sw.js").catch(() => {});
  });
}

// PWA install: the browser fires `beforeinstallprompt` once, often before React mounts.
// Stash it globally so the "Install App" button (see components/layout/InstallAppButton)
// can trigger the native install prompt whenever the user clicks — and re-broadcast it as
// a custom event for components already mounted.
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  (window as any).__deferredInstallPrompt = e;
  window.dispatchEvent(new CustomEvent("dts-install-available"));
});
window.addEventListener("appinstalled", () => {
  (window as any).__deferredInstallPrompt = null;
  window.dispatchEvent(new CustomEvent("dts-install-done"));
});

createRoot(document.getElementById("root")!).render(<App />);

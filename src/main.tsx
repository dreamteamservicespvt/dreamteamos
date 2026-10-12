import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initCapacitorPlugins } from "@/services/capacitor-plugins";

// Initialize native Capacitor plugins (no-ops on web)
initCapacitorPlugins();

// Deployment chunk recovery: When a new version is deployed to production, previously loaded
// tabs will request outdated JavaScript chunks that no longer exist on the server.
// Vite emits `vite:preloadError`, while dynamic imports reject with module fetch/MIME failures.
// Automatically reload the page once so the user seamlessly receives the latest bundle.
function triggerDeploymentReload(reason: string) {
  const reloadKey = "dts_deployment_reload_ts";
  const lastReload = sessionStorage.getItem(reloadKey);
  const now = Date.now();
  if (!lastReload || now - Number(lastReload) > 15000) {
    sessionStorage.setItem(reloadKey, String(now));
    console.warn(`[DeploymentReload] Refreshing page due to: ${reason}`);
    window.location.reload();
  }
}

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  triggerDeploymentReload("vite:preloadError");
});

window.addEventListener("unhandledrejection", (event) => {
  const msg = String(event.reason?.message || event.reason || "");
  if (
    msg.includes("dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("Strict MIME type checking") ||
    msg.includes("Failed to fetch")
  ) {
    event.preventDefault();
    triggerDeploymentReload("unhandledrejection: " + msg);
  }
});

// PWA installability: some browsers only offer "Install app" once a service worker is
// active. The FCM worker doubles as ours, but fcm.ts registers it only after notification
// permission — register it up-front too (same URL + scope, so the later call is a no-op).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // `updateViaCache: "none"` makes the browser revalidate the worker script itself on every
    // check. Without it the browser may serve the worker from its own HTTP cache, so a new worker
    // is never even discovered — one of the reasons installed apps stayed on old code.
    navigator.serviceWorker
      .register("/firebase-messaging-sw.js", { updateViaCache: "none" })
      .then((reg) => { void reg.update().catch(() => {}); })
      .catch(() => {});
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

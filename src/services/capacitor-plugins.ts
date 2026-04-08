import { isNative } from "@/utils/platform";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { Keyboard } from "@capacitor/keyboard";
import { App } from "@capacitor/app";

/**
 * Initialize native Capacitor plugins. Call once on app startup.
 * Gracefully no-ops on web.
 */
export async function initCapacitorPlugins(): Promise<void> {
  if (!isNative()) return;

  try {
    // Status bar: transparent + overlay the webview.
    // We use CSS safe-area-inset-top to push content below the status bar.
    // This is the ONLY approach that works consistently on ALL Android devices
    // (Samsung One UI, Xiaomi MIUI, Pixel, etc.)
    await StatusBar.setBackgroundColor({ color: "#00000000" });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setOverlaysWebView({ overlay: true });

    // Measure actual status bar height and set CSS variable
    const info = await StatusBar.getInfo();
    // On some Capacitor versions getInfo doesn't return height,
    // so we also rely on env(safe-area-inset-top) in CSS
    document.documentElement.classList.add("native-app");
  } catch (e) {
    console.warn("StatusBar init failed:", e);
  }

  try {
    // Hide splash screen (auto-shown on launch)
    await SplashScreen.hide();
  } catch (e) {
    console.warn("SplashScreen hide failed:", e);
  }

  try {
    // Keyboard: resize mode is 'none' in config — we manually adjust
    await Keyboard.setAccessoryBarVisible({ isVisible: true });
    await Keyboard.setScroll({ isDisabled: true });

    Keyboard.addListener("keyboardWillShow", (info) => {
      document.documentElement.style.setProperty("--keyboard-height", `${info.keyboardHeight}px`);
      document.body.classList.add("keyboard-open");
    });

    Keyboard.addListener("keyboardWillHide", () => {
      document.documentElement.style.setProperty("--keyboard-height", "0px");
      document.body.classList.remove("keyboard-open");
    });
  } catch (e) {
    console.warn("Keyboard init failed:", e);
  }
}

/**
 * Register the hardware back button handler.
 * Returns an unsubscribe function.
 */
export function registerBackButton(onBack: () => void): () => void {
  if (!isNative()) return () => {};

  const listener = App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      onBack();
    } else {
      App.exitApp();
    }
  });

  return () => {
    listener.then((l) => l.remove());
  };
}

/**
 * Listen for deep-link / app URL open events.
 * Returns an unsubscribe function.
 */
export function registerDeepLinks(onUrl: (url: string) => void): () => void {
  if (!isNative()) return () => {};

  const listener = App.addListener("appUrlOpen", (event) => {
    const slug = event.url.split("com.dreamteam.app").pop();
    if (slug) onUrl(slug);
  });

  return () => {
    listener.then((l) => l.remove());
  };
}

import { useEffect, useState } from "react";
import { MonitorDown, X, MoreVertical, Share, Smartphone } from "lucide-react";
import { isNative } from "@/utils/platform";

/** True when already running as an installed app (PWA standalone or iOS homescreen). */
const isStandalone = (): boolean =>
  window.matchMedia?.("(display-mode: standalone)")?.matches || (navigator as any).standalone === true;

const isIOS = (): boolean => /iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * "Install App" entry for every role, shown in the sidebar. When the browser exposes the
 * native install prompt (Chrome/Edge on desktop & Android) one click installs directly;
 * otherwise a short instructions popup shows the browser-menu path (⋮ → Install app /
 * Add to Home Screen, or Share → Add to Home Screen on iOS). Hidden inside the native
 * Capacitor app and once already installed.
 */
export default function InstallAppButton({ collapsed = false }: { collapsed?: boolean }) {
  const [canPrompt, setCanPrompt] = useState<boolean>(() => !!(window as any).__deferredInstallPrompt);
  const [hidden, setHidden] = useState<boolean>(() => isNative() || isStandalone());
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const onAvailable = () => setCanPrompt(true);
    const onDone = () => { setCanPrompt(false); setHidden(true); };
    window.addEventListener("dts-install-available", onAvailable);
    window.addEventListener("dts-install-done", onDone);
    return () => {
      window.removeEventListener("dts-install-available", onAvailable);
      window.removeEventListener("dts-install-done", onDone);
    };
  }, []);

  if (hidden) return null;

  const handleClick = async () => {
    const deferred = (window as any).__deferredInstallPrompt;
    if (deferred) {
      deferred.prompt();
      try {
        const { outcome } = await deferred.userChoice;
        if (outcome === "accepted") setHidden(true);
      } catch { /* ignore */ }
      (window as any).__deferredInstallPrompt = null;
      setCanPrompt(false);
      return;
    }
    setShowHelp(true);
  };

  return (
    <>
      <button
        onClick={handleClick}
        title="Install DTS Manager as an app"
        className={`flex items-center gap-3 rounded-lg text-primary bg-primary/10 hover:bg-primary/20 transition-colors font-medium text-sm ${
          collapsed ? "w-10 h-10 mx-auto justify-center" : "w-full px-3 h-10"
        }`}
      >
        <MonitorDown size={18} className="shrink-0" />
        {!collapsed && <span className="truncate">Install App</span>}
      </button>

      {showHelp && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowHelp(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-bold text-foreground flex items-center gap-2">
                <Smartphone size={17} className="text-primary" /> Install DTS Manager
              </h3>
              <button onClick={() => setShowHelp(false)} className="p-1 rounded-md hover:bg-accent text-muted-foreground"><X size={16} /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Install this app from your browser menu — it opens full-screen from your home screen or desktop, just like a normal app.
            </p>
            {isIOS() ? (
              <ol className="space-y-2.5 text-sm text-foreground">
                <li className="flex items-start gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center mt-0.5">1</span>
                  <span>Tap the <Share size={13} className="inline text-primary" /> <b>Share</b> button in Safari's toolbar.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center mt-0.5">2</span>
                  <span>Scroll down and tap <b>Add to Home Screen</b>.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center mt-0.5">3</span>
                  <span>Tap <b>Add</b> — DTS Manager appears on your home screen.</span>
                </li>
              </ol>
            ) : (
              <ol className="space-y-2.5 text-sm text-foreground">
                <li className="flex items-start gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center mt-0.5">1</span>
                  <span>Open your browser menu — the <MoreVertical size={13} className="inline text-primary" /> <b>three dots</b> at the top-right.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center mt-0.5">2</span>
                  <span>Choose <b>Install app</b> (or <b>Add to Home screen</b> on mobile).</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center mt-0.5">3</span>
                  <span>Confirm — DTS Manager installs to your device.</span>
                </li>
              </ol>
            )}
            <button onClick={() => setShowHelp(false)}
              className="mt-4 w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

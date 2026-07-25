/**
 * "A new version is ready" — one tap to take it.
 *
 * Deliberately not automatic. Reloading throws away whatever is on screen, and in this app that can
 * be a generated set of prompts or a half-written sale; the normal workflow even involves leaving
 * the app and coming back, so reloading on return would destroy work at the worst possible moment.
 *
 * The one exception is the login screen, where there is provably nothing to lose — an update there
 * applies on its own, which also means anyone who was stuck on a stale build gets fixed simply by
 * opening the app.
 */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { RefreshCw, X } from "lucide-react";
import { applyUpdate, onUpdateAvailable, startUpdateWatch } from "@/services/appUpdate";

export default function AppUpdateBanner() {
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying] = useState(false);
  const location = useLocation();

  useEffect(() => startUpdateWatch(), []);
  useEffect(() => onUpdateAvailable(() => setAvailable(true)), []);

  // Nothing on the login screen is worth keeping, so take the update without asking.
  useEffect(() => {
    if (available && !applying && location.pathname === "/login") {
      setApplying(true);
      void applyUpdate();
    }
  }, [available, applying, location.pathname]);

  if (!available || dismissed || location.pathname === "/login") return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3 pointer-events-none">
      <div
        data-test="update-banner"
        className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-primary/40 bg-card/95 px-4 py-3 shadow-2xl backdrop-blur"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">A new version is ready</p>
          <p className="text-xs text-muted-foreground">
            Finish what you're doing, then update. Nothing on screen is lost until you tap Update.
          </p>
        </div>
        <button
          type="button"
          disabled={applying}
          onClick={() => { setApplying(true); void applyUpdate(); }}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${applying ? "animate-spin" : ""}`} />
          {applying ? "Updating…" : "Update"}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Not now"
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

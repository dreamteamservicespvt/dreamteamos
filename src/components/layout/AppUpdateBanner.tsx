/**
 * "A new version is ready" — one tap to take it.
 *
 * Deliberately not automatic while someone is working. Reloading throws away whatever is on screen,
 * and in this app that can be a generated set of prompts or a half-written sale; the normal workflow
 * even involves leaving the app and coming back, so reloading on every return would destroy work at
 * the worst possible moment.
 *
 * It IS automatic where nothing can be lost, and that is now two places rather than one:
 *
 *   • the login screen, where there is provably nothing on screen worth keeping;
 *   • coming back to an app that has been in the background for half an hour with nothing held and
 *     no dirty form field — the member has plainly moved on from whatever was open.
 *
 * The second one matters because sign-in persists: a member who installed the app months ago never
 * passes the login screen, so before this the banner was their only route to a new version.
 *
 * And "Not now" is a SNOOZE, not a mute. Dismissing used to hide the offer for the life of the app
 * session, which on an installed phone app is weeks — one stray tap on the X and that member simply
 * stopped receiving updates. Now it comes back: after half an hour, or the next time they return to
 * the app, whichever is sooner.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { RefreshCw, X } from "lucide-react";
import { applyUpdate, onUpdateAvailable, safeToAutoApply, startUpdateWatch } from "@/services/appUpdate";

/** How long "Not now" lasts before the offer returns on its own. */
const SNOOZE_MS = 30 * 60 * 1000;

/**
 * How long the app must have been in the background before returning to it counts as "they have
 * moved on". Comfortably longer than the copy-a-prompt-and-come-back round trip the ad generator
 * is built around, which is minutes.
 */
const AWAY_BEFORE_AUTO_MS = 30 * 60 * 1000;

export default function AppUpdateBanner() {
  const [available, setAvailable] = useState(false);
  const [snoozedUntil, setSnoozedUntil] = useState(0);
  const [applying, setApplying] = useState(false);
  const location = useLocation();
  const hiddenSince = useRef<number | null>(null);
  const applyingRef = useRef(false);

  useEffect(() => startUpdateWatch(), []);
  useEffect(() => onUpdateAvailable(() => setAvailable(true)), []);

  /** Take the update once, whatever asks for it. */
  const take = useCallback(() => {
    if (applyingRef.current) return;
    applyingRef.current = true;
    setApplying(true);
    void applyUpdate();
  }, []);

  // Nothing on the login screen is worth keeping, so take the update without asking.
  useEffect(() => {
    if (available && location.pathname === "/login") take();
  }, [available, location.pathname, take]);

  /**
   * Returning to the app: the moment a stale build is both most likely and most fixable.
   *
   * A long absence with nothing held is taken silently. A short one only un-snoozes the banner —
   * they stepped out for a minute and are still in the middle of something.
   */
  useEffect(() => {
    const onHidden = () => { hiddenSince.current = Date.now(); };
    const onVisible = () => {
      const away = hiddenSince.current ? Date.now() - hiddenSince.current : 0;
      hiddenSince.current = null;
      if (!available) return;
      if (away >= AWAY_BEFORE_AUTO_MS && location.pathname !== "/login" && safeToAutoApply()) {
        take();
        return;
      }
      // Back in the app with an update waiting: ask again, even if they waved it away earlier.
      setSnoozedUntil(0);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") onHidden();
      else onVisible();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onHidden);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onHidden);
      window.removeEventListener("focus", onVisible);
    };
  }, [available, location.pathname, take]);

  // A snooze that never lapses is a mute. Wake the offer back up when it expires.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!snoozedUntil) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [snoozedUntil]);

  const snoozed = snoozedUntil > now;
  if (!available || snoozed || location.pathname === "/login") return null;

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
          onClick={take}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${applying ? "animate-spin" : ""}`} />
          {applying ? "Updating…" : "Update"}
        </button>
        <button
          type="button"
          onClick={() => { setNow(Date.now()); setSnoozedUntil(Date.now() + SNOOZE_MS); }}
          aria-label="Not now"
          title="Remind me later"
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

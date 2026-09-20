import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/** The answer, read straight from the window. `false` where there is no window (tests, SSR). */
function currentlyMobile(): boolean {
  return typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT;
}

/**
 * Whether this is a phone-sized screen.
 *
 * ── Why the first render has to be right ──────────────────────────────────────────────
 * This started as `undefined` and was filled in by an effect, so the first paint always answered
 * "not mobile". On a phone that meant the desktop sidebar rendered first — a 240px rail, with the
 * page pushed 240px across — and then the effect corrected it a frame later. Because the layout
 * animates its margin, the correction was not a swap but a visible slide: the screen flashed on
 * every mount, which on this app is every navigation.
 *
 * Reading `window.innerWidth` in the initialiser costs one synchronous layout read and makes the
 * first render the right one. The listener below still handles a window being resized or a phone
 * being turned.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(currentlyMobile);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(currentlyMobile());
    mql.addEventListener("change", onChange);
    // One more read on mount: between the initialiser and this effect the window may have changed
    // (a rotation during load, or a restored window), and the listener only fires on CHANGES.
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}

/**
 * "You have unsaved changes — leave anyway?" for a screen that holds typed work.
 *
 * The app runs on `BrowserRouter`, where React Router's `useBlocker` does not exist (it needs a data
 * router), so the two exits are covered by hand:
 *  - closing, reloading or typing a new address → the browser's own `beforeunload` prompt;
 *  - any in-app link (the sidebar, the logo, a breadcrumb) → caught on the way down, BEFORE React
 *    Router's `<Link>` sees it (`<Link>` ignores a click whose default was prevented), and only
 *    followed if `ask()` says yes.
 *
 * What it cannot stop — the phone's back button, a notification tap that calls `navigate()` — is why
 * the Invoice Builder ALSO keeps an on-device copy of unsaved edits and offers it back on reopening.
 * This hook is the polite door; the copy is the safety net.
 */
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

export function useLeaveGuard(active: boolean, ask: () => Promise<boolean>): void {
  const navigate = useNavigate();
  const activeRef = useRef(active);
  const askRef = useRef(ask);
  activeRef.current = active;
  askRef.current = ask;

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!activeRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };

    const onClick = (e: MouseEvent) => {
      if (!activeRef.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // opening in a new tab loses nothing
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      void askRef.current().then((leave) => {
        if (leave) navigate(`${url.pathname}${url.search}${url.hash}`);
      });
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [navigate]);
}

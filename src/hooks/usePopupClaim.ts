import { useEffect, useRef } from "react";
import { usePopupStore } from "@/store/popupStore";
import type { PopupKind } from "@/utils/popupCoordinator";

/**
 * "I am on screen" — told to the popup coordinator (`store/popupStore`) for as long as `active` is true.
 *
 * Only reports: the component shows and hides exactly as it did before. Popups that wait their turn (the
 * post-status check, the SMM alerts) read the claims and stay away while it holds the screen.
 *
 * `pending` is for a gate that is still finding out whether it will show (the daily check-in while its
 * reads come in): it holds the screen without counting as a popup that was shown, so nothing waits ten
 * minutes after it if it never appeared.
 */
export function usePopupClaim(kind: PopupKind, active: boolean, pending = false): void {
  const idRef = useRef<string | null>(null);

  useEffect(() => {
    if (!active) return;
    const id = usePopupStore.getState().claim(kind, pending);
    idRef.current = id;
    return () => {
      idRef.current = null;
      usePopupStore.getState().release(id);
    };
    // `pending` is applied below without re-claiming, so a gate turning from pending to shown keeps its claim.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, active]);

  useEffect(() => {
    if (idRef.current) usePopupStore.getState().setPending(idRef.current, pending);
  }, [pending, active]);
}

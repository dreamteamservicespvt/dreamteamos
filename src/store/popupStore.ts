import { create } from "zustand";
import {
  popupVerdict, recordClose,
  type PopupClaim, type PopupClose, type PopupKind, type PopupVerdict,
} from "@/utils/popupCoordinator";

/**
 * The popup coordinator's live registry (2026-10-15) — what is holding the screen right now, and what
 * closed last. Rules in `utils/popupCoordinator`; a component reports itself with `hooks/usePopupClaim`;
 * a popup that waits its turn opens through `tryOpenPopup`.
 *
 * Per tab, in memory: a reload starts with nothing on screen, which is what a reload is.
 */
interface PopupStore {
  claims: PopupClaim[];
  closes: PopupClose[];
  /** Adds a claim and returns its id. */
  claim: (kind: PopupKind, pending?: boolean) => string;
  /** A pending claim that has decided to show (or gone back to waiting). */
  setPending: (id: string, pending: boolean) => void;
  /** Takes a claim off. One that was SHOWN starts the gap; one still pending never showed anything. */
  release: (id: string) => void;
}

let nextId = 0;

export const usePopupStore = create<PopupStore>((set) => ({
  claims: [],
  closes: [],
  claim: (kind, pending = false) => {
    const id = `${kind}-${++nextId}`;
    set((s) => ({ claims: [...s.claims, { id, kind, pending, since: Date.now() }] }));
    return id;
  },
  setPending: (id, pending) =>
    set((s) => ({
      claims: s.claims.map((c) => (c.id === id && c.pending !== pending ? { ...c, pending, since: Date.now() } : c)),
    })),
  release: (id) =>
    set((s) => {
      const gone = s.claims.find((c) => c.id === id);
      if (!gone) return s;
      return {
        claims: s.claims.filter((c) => c.id !== id),
        closes: gone.pending ? s.closes : recordClose(s.closes, gone.kind, Date.now()),
      };
    }),
}));

/**
 * A window the person opened themselves, on screen now: a dialog, an alert, a full-screen form, the phone
 * menu. Kept from the post-status check's old look at the page (2026-10-05) as the coordinator's `busy`
 * input — a popup that waits never interrupts somebody halfway through a form. The app's own popups are
 * known from their claims; this is only for everything else. A hidden overlay has no box.
 */
export function personIsBusy(): boolean {
  if (typeof document === "undefined") return false;
  const open = document.querySelectorAll('[role="dialog"], [role="alertdialog"], .fixed.inset-0');
  return Array.from(open).some((el) => el.getClientRects().length > 0);
}

/** May a popup of `kind` open now? (Read-only — `tryOpenPopup` also takes the screen.) */
export function popupVerdictNow(kind: PopupKind, opts: { gapMs?: number; urgent?: boolean } = {}): PopupVerdict {
  const { claims, closes } = usePopupStore.getState();
  return popupVerdict(kind, { claims, closes, busy: personIsBusy() }, Date.now(), opts);
}

/**
 * Opens a popup that waits its turn: when the verdict is yes, the screen is claimed in the same step (so
 * two waiting popups can never both get a yes) and the release is returned — call it when the popup
 * closes. Null = not now; ask again on the next tick.
 */
export function tryOpenPopup(kind: PopupKind, opts: { gapMs?: number; urgent?: boolean } = {}): (() => void) | null {
  if (!popupVerdictNow(kind, opts).ok) return null;
  const store = usePopupStore.getState();
  const id = store.claim(kind);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    usePopupStore.getState().release(id);
  };
}

/** Tests only: an empty screen. */
export function __resetPopupsForTests(): void {
  usePopupStore.setState({ claims: [], closes: [] });
}

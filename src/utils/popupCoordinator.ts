/**
 * The popup coordinator's rules — when may a popup the app opens BY ITSELF come on screen? (2026-10-15)
 *
 * ── Why one coordinator ─────────────────────────────────────────────────────────────────────────
 * The app opens several things on its own: the daily check-in gate, the unsigned-agreement gate, the
 * profile prompt, the work update popup, the birthday greeting, the salesperson's renewal countdown, the
 * 11 AM / 5 PM post-status check, and — with SMM Delivery Control (`.claude/rules/smm.md` §9.9) — the urgent
 * full-screen alerts. Until now the only one that waited for the others was the post-status check, and it
 * did so by looking at the page (`[role=dialog], .fixed.inset-0` with a box). That look could not see:
 *   • an incoming call — the ringing card is a floating `fixed top-4` panel, not a full-screen overlay, so
 *     the check opened while a call was ringing;
 *   • the check-in gate before it appears — its three reads (check-in, holiday, jobs) can take longer
 *     than the check's 8-second head start on a slow phone, and the gate then opened on top of it;
 *   • what just closed — two different popups could follow each other back to back.
 * So every popup the app opens by itself now SAYS when it is on screen (`usePopupClaim`), a call and the
 * AI studio say so too, and a popup that waits asks one question: `popupVerdict`. The popups that do not
 * wait (the gates, the update popup, …) only report — they open exactly when they opened before.
 *
 * The look at the page stays as ONE input, `busy`: a window the person opened themselves (editing a post,
 * a sale form, a dialog) is a task in progress, and a popup that waits never opens over it — as before.
 *
 * Pure: no React, no DOM, no Firestore. The live registry is `store/popupStore`.
 */

/** Everything that can hold the screen. `call` and `studio` are surfaces, the rest are popups. */
export type PopupKind =
  /** VideoCallManager: ringing, calling or in a call. Nothing that waits ever covers it. */
  | "call"
  /** The AI studio is open (full screen) — a run may be in progress. */
  | "studio"
  /** The tech member's mandatory daily check-in — pending until it knows whether it is needed. */
  | "checkin"
  | "agreement"
  | "profile"
  | "update"
  | "birthday"
  | "smm_renewal"
  | "smm_status_check"
  /** SMM Delivery Control's urgent alerts (phase 4). */
  | "smm_alert";

/** A call or the studio is a place the person is working in, not a popup — nothing is counted after it closes. */
export const POPUP_SURFACES: readonly PopupKind[] = ["call", "studio"];

/** Owner's rule (SMM Delivery Control, `smm.md` §9.9): ten minutes between two DIFFERENT popups. */
export const POPUP_GAP_MS = 10 * 60 * 1000;

/**
 * How long a "pending" claim is believed. The check-in gate holds the screen while its reads are still
 * coming in; a read that never answers (a refused listener) must not keep every other popup away all
 * day, so after two minutes a pending claim is ignored.
 */
export const POPUP_PENDING_LIMIT_MS = 2 * 60 * 1000;

/** Something on screen (or about to be). */
export interface PopupClaim {
  id: string;
  kind: PopupKind;
  /** True while it is still finding out whether it will show (the check-in gate loading). */
  pending: boolean;
  /** When it was claimed / last changed, ms. */
  since: number;
}

/** A popup that was SHOWN and has closed — the start of the gap. */
export interface PopupClose {
  kind: PopupKind;
  at: number;
}

export type PopupWait = "call" | "studio" | "popup" | "busy" | "gap";

export interface PopupVerdict {
  ok: boolean;
  /** Why it has to wait. */
  wait?: PopupWait;
  /** The kind it is waiting for (call / studio / popup / gap). */
  by?: PopupKind;
  /** When the gap is over, ms (only for `gap`). */
  until?: number;
}

export interface PopupState {
  claims: readonly PopupClaim[];
  /** The latest close of each popup kind that was shown. */
  closes: readonly PopupClose[];
  /** The person has a window of their own open (a dialog, a form, the phone menu). */
  busy: boolean;
}

/** A claim that still counts: shown, or pending for less than the limit. */
export function claimHolds(claim: PopupClaim, now: number): boolean {
  return !claim.pending || now - claim.since < POPUP_PENDING_LIMIT_MS;
}

/**
 * May a popup of `kind` open now? Asked by a popup that waits its turn (the post-status check, the SMM
 * alerts), never by the gates.
 *
 * In order: a call (never covered) → anything else holding the screen, the studio included → a window the
 * person opened → the ten-minute gap after a DIFFERENT popup closed. A popup of the same kind already on
 * screen also waits (one at a time). `urgent` (a critical SMM alert, 2026-10-15 phase 4) skips only the gap —
 * it still never covers a call, the studio, another popup or a window the person opened.
 */
export function popupVerdict(
  kind: PopupKind,
  state: PopupState,
  now: number,
  opts: { gapMs?: number; urgent?: boolean } = {},
): PopupVerdict {
  const holding = state.claims.filter((c) => claimHolds(c, now));
  if (holding.some((c) => c.kind === "call")) return { ok: false, wait: "call", by: "call" };
  const studio = holding.find((c) => c.kind === "studio");
  const other = holding.find((c) => c.kind !== "studio");
  if (other) return { ok: false, wait: "popup", by: other.kind };
  if (studio) return { ok: false, wait: "studio", by: "studio" };
  if (state.busy) return { ok: false, wait: "busy" };
  if (opts.urgent) return { ok: true };
  const gapMs = opts.gapMs ?? POPUP_GAP_MS;
  const last = state.closes
    .filter((c) => c.kind !== kind && !POPUP_SURFACES.includes(c.kind))
    .reduce<PopupClose | null>((latest, c) => (!latest || c.at > latest.at ? c : latest), null);
  if (last && now - last.at < gapMs) return { ok: false, wait: "gap", by: last.kind, until: last.at + gapMs };
  return { ok: true };
}

/** The close log after `kind` was shown and closed at `at` — one entry per kind, the latest. */
export function recordClose(closes: readonly PopupClose[], kind: PopupKind, at: number): PopupClose[] {
  if (POPUP_SURFACES.includes(kind)) return [...closes];
  return [...closes.filter((c) => c.kind !== kind), { kind, at }];
}

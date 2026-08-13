/**
 * When a sale was DECIDED — approved or rejected.
 *
 * ── The bug this exists to prevent ────────────────────────────────────────────────────────────
 * The approvals queue dated a decided sale by `lead.lastUpdated`, which is the last time anything
 * at all happened to the lead: a note added, a call logged, another sale recorded, a status change.
 * Filtering "what did I approve yesterday" on that listed sales approved weeks earlier whose lead
 * happened to be touched yesterday, and hid sales approved yesterday on a lead touched since.
 *
 * The decision's own stamp is the answer: `verifiedAt` written at approval, `rejectedAt` at
 * rejection. Rejection clears `verifiedAt`, which is why a rejected row must never be read from it.
 *
 * Rows decided before these stamps existed have neither, and fall back to the lead — wrong for the
 * same reason as before, but visible, which beats dropping real history out of the list entirely.
 */

interface StampLike { seconds?: number }

export interface DecidableSale {
  verificationStatus?: string;
  verifiedAt?: unknown;
  rejectedAt?: unknown;
}

export interface DecidableLead {
  lastUpdated?: StampLike | null;
}

/** Epoch ms the sale was decided, or 0 when nothing dates it. */
export function decidedAtMs(item: DecidableSale, lead?: DecidableLead | null): number {
  const own = item.verificationStatus === "rejected"
    ? (item.rejectedAt as StampLike | null)?.seconds
    : (item.verifiedAt as StampLike | null)?.seconds;
  const seconds = own || lead?.lastUpdated?.seconds || 0;
  return seconds * 1000;
}

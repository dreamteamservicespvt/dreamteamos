/**
 * SMM Delivery Control, phase 7 (2026-10-15) — the CLIENT approves a piece with one tap in their own chat link.
 *
 * ── Why ─────────────────────────────────────────────────────────────────────────────────────────
 * Approval is the step that waits longest, and it waits on a WhatsApp reply somebody then has to type into the
 * app. The client already has a link of their own — the order chat (`/c/<chatId>`, `api/order-chat`) — and for a
 * Social Media month that chat IS the month (its id is the month's id: a sold month's order id, or the month's own
 * id for a month with no sale). So the chat shows "Waiting for your approval" with ✔ Approve / ✎ Changes for every
 * piece the team sent, and the answer is recorded exactly as `smm.recordApproval` records it (stage, approval,
 * who answered) plus `approvalProof` (via the client chat) — the client approval rule is untouched (owner's
 * decision 12): it is still the client who says yes.
 *
 * Pure and written WITHOUT the `@/` alias (the server function runs it; Node ESM on Vercel needs `.js` on
 * runtime imports — this file has none).
 */
import type { SmmContentItem } from "../types/smm";
import type { SmmApprovalProof } from "../types/smmDelivery";

export interface SmmClientPiece {
  itemId: string;
  title: string;
  /** "Video" / "Poster" / "Real video" / "Extra: Poster". */
  label: string;
  /** ms, when it was sent to the client (null when unknown). */
  sentAt: number | null;
}

const KIND_LABEL: Record<string, string> = { ai_ad: "Video", poster: "Poster", real_video: "Real video" };

function ms(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const o = v as { toMillis?: () => number; seconds?: number; _seconds?: number };
  if (typeof o.toMillis === "function") return o.toMillis();
  if (typeof o.seconds === "number") return o.seconds * 1000;
  if (typeof o._seconds === "number") return o._seconds * 1000;
  return null;
}

type MonthLike = { status?: string; items?: SmmContentItem[] | null };

/** A month that can still be answered on: not deleted or taken off the board. */
export function monthOpenForClient(month: MonthLike | null | undefined): boolean {
  return !!month && month.status !== "deleted" && month.status !== "removed";
}

/** The pieces waiting for this client's answer: sent (awaiting approval), not answered yet. */
export function piecesAwaitingClient(month: MonthLike | null | undefined): SmmClientPiece[] {
  if (!monthOpenForClient(month)) return [];
  return (month!.items || [])
    .filter((i) => i.status === "awaiting_approval" && i.approval?.state === "waiting")
    .map((i) => ({
      itemId: i.id,
      title: (i.title || "").trim() || `${KIND_LABEL[i.kind] || "Post"} (untitled)`,
      label: i.extra ? `Extra: ${KIND_LABEL[i.kind] || "Post"}` : KIND_LABEL[i.kind] || "Post",
      sentAt: ms((i as SmmContentItem & { madeAt?: unknown }).madeAt) ?? ms(i.approval?.askedAt),
    }))
    .sort((a, b) => (a.sentAt ?? 0) - (b.sentAt ?? 0));
}

export const SMM_CLIENT_NOTE_MAX = 500;

/**
 * The month's items after the client answered one piece — or the sentence why not (it was answered already,
 * it is not waiting, it is not on this month). `stamp` is what the database stores as the answer's time (the
 * server passes a Firestore Timestamp, as `recordApproval` writes); `now` is ms for the proof.
 */
export function clientAnswerItems(
  month: MonthLike,
  itemId: string,
  input: { approved: boolean; note?: string | null; clientName: string; guestUid: string; now: number; stamp: unknown },
): { problem: string; items: SmmContentItem[] | null; item: SmmContentItem | null } {
  if (!monthOpenForClient(month)) return { problem: "This month is no longer available.", items: null, item: null };
  const items = month.items || [];
  const at = items.findIndex((i) => i.id === itemId);
  if (at < 0) return { problem: "This post is no longer waiting for you.", items: null, item: null };
  const it = items[at];
  if (it.status !== "awaiting_approval" || it.approval?.state !== "waiting") {
    return { problem: "This post was already answered — thank you.", items: null, item: null };
  }
  const note = (input.note || "").trim().slice(0, SMM_CLIENT_NOTE_MAX);
  if (!input.approved && note.length < 3) return { problem: "Please say what to change.", items: null, item: null };
  const who = (input.clientName || "").trim() || "The client";
  const proof: SmmApprovalProof = { approved: input.approved, who, via: "client_chat", screenshotUrl: null, at: input.now, byUid: input.guestUid, byName: who };
  const prevRevisions = Number((it as SmmContentItem & { revisions?: number }).revisions) || 0;
  const next = {
    ...it,
    status: input.approved ? "approved" : "changes_requested",
    approval: {
      ...it.approval,
      state: input.approved ? "approved" : "changes",
      askedAt: it.approval?.askedAt || input.stamp,
      respondedAt: input.stamp,
      note: note || null,
      byName: `${who} (client chat)`,
    },
    approvalProof: proof,
    ...(input.approved ? {} : { revisions: prevRevisions + 1 }),
    updatedAt: input.stamp,
  } as SmmContentItem;
  const out = [...items];
  out[at] = next;
  return { problem: "", items: out, item: next };
}

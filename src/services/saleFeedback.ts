/**
 * The follow-up call, written down.
 *
 * ── What this is for ─────────────────────────────────────────────────────────────────────────
 * A delivered ad is the start of the next sale, not the end of the last one. The call that turns
 * one into the other has always been made — "did you like it?", "how did it go?" — and has never
 * been recorded anywhere, so what a client thought of their last ad was known only to whoever rang
 * them, and only until they forgot. It is also the single most useful thing to know before pitching
 * them anything, which is why it now gates the upsell rather than sitting beside it.
 *
 * ── Why it is not the star review ────────────────────────────────────────────────────────────
 * `Order.clientReview` is the customer's own doing: they open their chat and leave 1–5 stars, and
 * most of them never do. This is the member's job, in the member's words, about a conversation that
 * actually happened. Both are kept and both are shown; collapsing them would either let a member
 * fill in the customer's own rating, or leave a customer who never opened their chat permanently
 * un-upsellable.
 *
 * Written to the ORDER — see `ClientWorkFeedback` for why not the client document.
 */
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import type { ClientWorkFeedback, Order, UserRole } from "@/types";

export interface FeedbackPatch {
  work?: ClientWorkFeedback["work"];
  service?: ClientWorkFeedback["service"];
  notes?: string | null;
  status?: ClientWorkFeedback["status"];
}

/**
 * Whether this person may record what the client said about this job.
 *
 * The seller, because it is their call to make and their client to keep. The sales admin over the
 * team, because they take these calls too when a member is out. The tech admin and the team leader
 * are deliberately NOT included: they can read every word of it — how the work was received is
 * exactly what they need — but a rating of your own department's work, entered by your own
 * department, is not feedback.
 */
export function canRecordFeedback(
  order: Order,
  actor: { uid?: string; role?: UserRole } | null | undefined,
): boolean {
  if (!actor?.uid) return false;
  if (actor.uid === order.soldBy) return true;
  return actor.role === "sales_admin" || actor.role === "main_admin";
}

/**
 * Merge a change into this order's feedback.
 *
 * A merge rather than a replace because the row is filled in over one conversation, a field at a
 * time — the status moves as the member dials, the ratings come mid-call, the note afterwards — and
 * each of those is its own write. Replacing would mean a note typed after the ratings wiped them.
 */
export async function saveSaleFeedback(params: {
  order: Order;
  patch: FeedbackPatch;
  actor: { uid: string; name: string; role: UserRole };
}): Promise<{ ok: boolean; message: string }> {
  const { order, patch, actor } = params;

  if (!canRecordFeedback(order, actor)) {
    return { ok: false, message: "Only the member who sold this — or their sales admin — can record the feedback." };
  }

  const next: ClientWorkFeedback = {
    ...(order.feedback || {}),
    ...patch,
    // Trimmed to null rather than kept as "": a blank note and no note are the same thing, and
    // storing the difference makes "has anything been written here" two questions instead of one.
    ...(patch.notes !== undefined ? { notes: patch.notes?.trim() || null } : {}),
    by: actor.uid,
    byName: actor.name,
    at: serverTimestamp(),
  };

  try {
    await updateDoc(doc(db, "orders", order.id), { feedback: next, updatedAt: serverTimestamp() });
    return { ok: true, message: "Saved." };
  } catch (err) {
    console.error("[saleFeedback] save failed:", err);
    return { ok: false, message: "Could not save that. Try again." };
  }
}

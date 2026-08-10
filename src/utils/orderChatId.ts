/**
 * Which document holds a job's client chat.
 *
 * ── Why this is not simply the assignment id any more ─────────────────────────────────────────
 * It used to be, and that made the room impossible to open before the work was handed out — which
 * is exactly the window the sales member needs it in. The client gives their brief, their logo and
 * their half-remembered change of mind to the person who SOLD them the ad, days before anyone is
 * assigned, and that material had nowhere to go.
 *
 * So an order-backed job keys its room on the ORDER, whose id is deterministic and stable for the
 * whole life of the sale (`orderDocId`). The room opens with the sale, the assignment is attached
 * to it later, and the same thread — and the same link the customer holds — survives the job being
 * unassigned and given to somebody else. That is a change from the old behaviour, where reassigning
 * minted a brand-new room and quietly abandoned the conversation.
 *
 * ── Why an explicit field rather than "use orderId if present" ────────────────────────────────
 * Because of the hundreds of rooms that already exist under an assignment id, some of them holding
 * live links a customer has in their WhatsApp history. Deriving the id from `orderId` would move
 * every one of those rooms out from under its own conversation. `chatId` is written only on
 * assignments created from now on, so an older assignment falls through to its own id and keeps
 * the room it has always had. No migration, and nothing in a customer's hand stops working.
 */

/** The parts of an assignment that decide where its chat lives. */
export interface ChatKeyed {
  id: string;
  /** Set at assignment time for order-backed work. Absent on older records and on direct jobs. */
  chatId?: string | null;
}

/**
 * The chat document id for a job.
 *
 * Direct Work Assign jobs have no order and no `chatId`, so they stay keyed on the assignment —
 * there is nothing earlier than the assignment for them to key on.
 */
export function orderChatIdOf(assignment: ChatKeyed): string {
  return assignment.chatId || assignment.id;
}

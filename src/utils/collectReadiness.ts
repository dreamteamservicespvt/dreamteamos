/**
 * When a pending balance becomes worth chasing.
 *
 * ── Why this is not just "it is overdue" ──────────────────────────────────────────────────────
 * The balance on a social-media month is not due on a date. It is due on a DELIVERY: the client
 * agreed to pay the rest once the first post exists, is up on their page, and the campaign is
 * running. Chasing before that is chasing for nothing, and it is how a member burns the goodwill
 * they will need when the money genuinely is due.
 *
 * The tech side already records exactly that, on the order — `progress.done` counts ads, posters,
 * posts and campaigns, and `completedTracks` records whole legs signed off. So the moment the work
 * lands, the sale can move itself to the top of the member's list. Nobody has to tell them; the
 * thing they were waiting for is the thing that tells them.
 *
 * ── Why an ordinary ad is different ───────────────────────────────────────────────────────────
 * A single ad has no milestones — it is delivered or it is not. Its balance becomes collectable
 * when the order is completed, which is the same promise in a simpler shape.
 */
import type { Order, OrderTrack } from "@/types";

export interface CollectReadiness {
  /** The work the balance was conditional on is done — collect now. */
  ready: boolean;
  /** One line saying why, in the words a member would use to the client. */
  reason: string;
}

const NOT_STARTED: CollectReadiness = {
  ready: false,
  reason: "Work not started yet",
};

/** The three things a social-media client is told they are paying the balance for. */
const SMM_GATES: { track: OrderTrack; field: "ads" | "posted" | "campaigns"; label: string }[] = [
  { track: "ad_creation", field: "ads", label: "post created" },
  { track: "social_upload", field: "posted", label: "posted" },
  { track: "digital_marketing", field: "campaigns", label: "marketing running" },
];

/**
 * Has the tech team done enough for this balance to be due?
 *
 * `order` may be missing — a sale whose order has not been created, or one a member is looking at
 * before the queue has caught up. That reads as not ready rather than as an error: the balance is
 * still listed and still chaseable by hand, it just does not jump the queue.
 */
export function collectReadiness(order: Order | null | undefined): CollectReadiness {
  if (!order) return { ready: false, reason: "Waiting for the tech team" };

  const progress = order.progress;

  if (progress?.kind === "smm") {
    const done = progress.done || { ads: 0, posters: 0, posted: 0, campaigns: 0 };
    const completed = new Set(progress.completedTracks || []);
    // A leg counts as done either because its counter moved or because its owner signed the whole
    // leg off — a member who marks "social uploading finished" has finished it, whatever the count.
    const met = SMM_GATES.filter((g) => completed.has(g.track) || (done[g.field] || 0) >= 1);

    if (met.length === SMM_GATES.length) {
      return { ready: true, reason: "First post created, posted and marketing running" };
    }
    if (met.length === 0) return NOT_STARTED;
    return {
      ready: false,
      reason: `${met.map((g) => g.label).join(", ")} — waiting on ${
        SMM_GATES.filter((g) => !met.includes(g)).map((g) => g.label).join(" and ")
      }`,
    };
  }

  // Everything else: delivered is delivered.
  if (order.status === "completed" || order.status === "verified") {
    return { ready: true, reason: "Work delivered" };
  }
  if (order.status === "assigned") return { ready: false, reason: "Tech team is working on it" };
  return NOT_STARTED;
}

/**
 * How much of a multi-deliverable order is actually done.
 *
 * Ordinary orders are one ad: assigned, made, delivered. A social-media month and a bulk order are
 * not — a Pro month owes 8 ads, 8 posters, 8 uploads and 8 campaigns, and a bulk order owes N ads.
 * For those, "assigned" says almost nothing, which is exactly the gap this closes: the order
 * carries running counts, so anyone looking at it can see 3 of 8 rather than a status that has
 * been true for a fortnight.
 */
import { packageDeliverables, isBulkCategory, effectiveAdCategory } from "@/utils/serviceCatalog";
import type {
  Order, OrderProgress, OrderProgressCounts, OrderProgressField, OrderTrack, WorkAssignment,
} from "@/types";

const ZERO: OrderProgressCounts = { ads: 0, posters: 0, posted: 0, campaigns: 0 };

/** The counters each job is responsible for. Progress is edited through this map, not free-hand. */
export const TRACK_FIELDS: Record<OrderTrack, OrderProgressField[]> = {
  ad_creation: ["ads", "posters"],
  social_upload: ["posted"],
  digital_marketing: ["campaigns"],
};

export const PROGRESS_FIELD_LABELS: Record<OrderProgressField, string> = {
  ads: "Ads created",
  posters: "Posters created",
  posted: "Posted on social media",
  campaigns: "Ads running",
};

/**
 * The progress a freshly-created order should carry, or `null` for the ordinary single-ad orders
 * that have nothing to count.
 *
 * Bulk orders track the videos and their posters; they have no uploading or marketing leg, so those
 * targets stay at zero and never appear on screen. Wishes videos ship WITHOUT a poster — every
 * wishes package is plain seconds — so a bulk wishes order counts videos only. Counting posters
 * nobody agreed to make would leave the order permanently stuck at "8 of 8 ads · 0 of 8 posters".
 */
export function initialProgress(input: {
  category: string;
  packageKey?: string;
  quantity?: number;
  bulkAdType?: string | null;
}): OrderProgress | null {
  const { category, packageKey, quantity, bulkAdType } = input;

  if (category === "social_media_management") {
    const quota = packageKey ? packageDeliverables(category, packageKey) : undefined;
    if (!quota) return null; // a custom-priced month has no defined quota to count down
    return blankProgress("smm", { ...quota });
  }

  if (isBulkCategory(category)) {
    const n = Math.max(0, Math.floor(Number(quantity) || 0));
    if (n <= 0) return null;
    const posters = effectiveAdCategory(category, bulkAdType) === "wishes" ? 0 : n;
    return blankProgress("bulk", { ...ZERO, ads: n, posters });
  }

  return null;
}

function blankProgress(kind: OrderProgress["kind"], targets: OrderProgressCounts): OrderProgress {
  return { kind, targets, done: { ...ZERO }, tracks: {}, completedTracks: [], log: [], completedAt: null };
}

/** The counters this order actually owes — a zero target is not a thing anyone has to do. */
export function activeFields(progress: OrderProgress): OrderProgressField[] {
  return (Object.keys(PROGRESS_FIELD_LABELS) as OrderProgressField[])
    .filter((f) => (progress.targets[f] || 0) > 0);
}

/** The jobs this order splits into — bulk work has only ad creation. */
export function activeTracks(progress: OrderProgress): OrderTrack[] {
  return (Object.keys(TRACK_FIELDS) as OrderTrack[])
    .filter((t) => TRACK_FIELDS[t].some((f) => (progress.targets[f] || 0) > 0));
}

/** A track is finished when every counter it owns has met its target, or it was marked done. */
export function isTrackComplete(progress: OrderProgress, track: OrderTrack): boolean {
  if (progress.completedTracks?.includes(track)) return true;
  const fields = TRACK_FIELDS[track].filter((f) => (progress.targets[f] || 0) > 0);
  if (fields.length === 0) return false;
  return fields.every((f) => (progress.done[f] || 0) >= (progress.targets[f] || 0));
}

/** Every counter met. This is what takes the order off the top of the queue. */
export function isProgressComplete(progress: OrderProgress | null | undefined): boolean {
  if (!progress) return false;
  const fields = activeFields(progress);
  if (fields.length === 0) return false;
  return fields.every((f) => (progress.done[f] || 0) >= (progress.targets[f] || 0));
}

/** 0–100 across every counter the order owes, for the bar. */
export function progressPercent(progress: OrderProgress | null | undefined): number {
  if (!progress) return 0;
  const fields = activeFields(progress);
  if (fields.length === 0) return 0;
  let done = 0, target = 0;
  for (const f of fields) {
    target += progress.targets[f] || 0;
    done += Math.min(progress.done[f] || 0, progress.targets[f] || 0);
  }
  return target === 0 ? 0 : Math.round((done / target) * 100);
}

/** "5 of 8 ads · 3 of 8 posters" — the one-line summary on a card. */
export function progressSummary(progress: OrderProgress | null | undefined): string {
  if (!progress) return "";
  return activeFields(progress)
    .map((f) => `${progress.done[f] || 0} of ${progress.targets[f] || 0} ${PROGRESS_FIELD_LABELS[f].toLowerCase()}`)
    .join(" · ");
}

/**
 * Orders that must sit at the top of every queue until they are finished.
 *
 * A month's work and a bulk order both stretch over days and are easy to lose behind the steady
 * drip of single ads — which is the whole reason they are pinned rather than merely sorted.
 */
export function isPinnedOrder(order: Order): boolean {
  return !!order.progress && !isProgressComplete(order.progress);
}

/** Whether this person may move the counters: the two admins, or someone holding a track. */
export function canEditProgress(
  progress: OrderProgress | null | undefined,
  role: string | undefined,
  uid: string | undefined,
): boolean {
  if (!progress) return false;
  if (role === "tech_admin" || role === "main_admin" || role === "tech_team_leader") return true;
  if (!uid) return false;
  return Object.values(progress.tracks || {}).some((a) => a?.uid === uid);
}

/** The tracks a given member holds — what their own card should show and let them edit. */
export function tracksForMember(progress: OrderProgress, uid: string): OrderTrack[] {
  return (Object.keys(progress.tracks || {}) as OrderTrack[])
    .filter((t) => progress.tracks[t]?.uid === uid);
}

/**
 * The counters a member may edit. Admins and team leaders get everything; a member gets only the
 * counters belonging to the tracks they were given, so nobody quietly closes someone else's job.
 */
export function editableFields(
  progress: OrderProgress,
  role: string | undefined,
  uid: string | undefined,
): OrderProgressField[] {
  const all = activeFields(progress);
  if (role === "tech_admin" || role === "main_admin" || role === "tech_team_leader") return all;
  if (!uid) return [];
  const mine = new Set(tracksForMember(progress, uid).flatMap((t) => TRACK_FIELDS[t]));
  return all.filter((f) => mine.has(f));
}

/** Every assignment fulfilling this order — a split month has one per member. */
export function assignmentsForOrder(order: Order, assignments: WorkAssignment[]): WorkAssignment[] {
  return assignments.filter((a) => a.orderId === order.id);
}

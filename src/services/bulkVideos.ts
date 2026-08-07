/**
 * Handing out and ticking off the individual videos of a bulk order.
 *
 * ── Why the counter is written too ────────────────────────────────────────────────────────────
 * A bulk order already carries `progress.done.ads`, and half the app reads it: the queue's sort,
 * the pinning rule, the progress bar, the "fully delivered" state, the client-side readiness
 * check for a pending balance. Introducing a second source of truth for "how many are done" and
 * leaving the first one stale would quietly break all of it.
 *
 * So the list is authoritative and the counter is DERIVED from it on every write — one update,
 * both fields, never out of step. Nothing downstream had to change, and anything still reading the
 * counter keeps getting the right answer.
 *
 * ── Why writes take the whole list ────────────────────────────────────────────────────────────
 * Two people can be assigning from the same order at once. Firestore array element updates cannot
 * be addressed by index safely under that, so each mutation rebuilds the list from the copy it was
 * handed and writes it whole — the same reasoning as `updateOrderProgress` setting an absolute
 * value rather than incrementing.
 */
import { doc, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { bulkVideosOf } from "@/utils/bulkVideos";
import type { AppUser, BulkVideoSlot, Order, OrderProgress } from "@/types";

type Actor = Pick<AppUser, "uid" | "name">;

/**
 * The Firestore patch for a new slot list: the list itself, plus the counter kept in step with it.
 *
 * `posters` is left alone. A bulk order's poster quota is a separate deliverable with its own
 * count, and forcing it to follow the video list would mark posters delivered that nobody made.
 */
function patchFor(order: Order, slots: BulkVideoSlot[]): Record<string, unknown> {
  const completed = slots.filter((s) => s.status === "completed").length;
  const patch: Record<string, unknown> = {
    bulkVideos: slots,
    updatedAt: serverTimestamp(),
  };

  const progress = order.progress;
  if (progress) {
    const done = { ...progress.done, ads: Math.min(completed, progress.targets.ads || completed) };
    const everythingDone = (Object.keys(progress.targets) as (keyof typeof progress.targets)[])
      .filter((f) => (progress.targets[f] || 0) > 0)
      .every((f) => (done[f] || 0) >= (progress.targets[f] || 0));
    const updated: OrderProgress = {
      ...progress,
      done,
      completedAt: everythingDone ? (progress.completedAt ?? Timestamp.now()) : null,
    };
    patch.progress = updated;
  }
  return patch;
}

/**
 * Give one or more videos to a member.
 *
 * Videos are addressed by their number, not their index, so two people assigning at the same
 * moment cannot hand out each other's. Already-completed videos are skipped rather than refused —
 * selecting "all remaining" and pressing assign should do the sensible thing, not fail because one
 * of them was finished thirty seconds ago.
 */
export async function assignBulkVideos(params: {
  order: Order;
  /** 1-based video numbers. */
  numbers: number[];
  member: { uid: string; name: string };
  actor: Actor;
}): Promise<number> {
  const { order, numbers, member, actor } = params;
  const wanted = new Set(numbers);
  const slots = bulkVideosOf(order);

  let changed = 0;
  const next = slots.map((s) => {
    if (!wanted.has(s.n) || s.status === "completed") return s;
    if (s.assignedTo === member.uid) return s;
    changed += 1;
    return {
      ...s,
      status: "assigned" as const,
      assignedTo: member.uid,
      assignedToName: member.name,
      assignedAt: Timestamp.now(),
    };
  });

  if (changed === 0) return 0;
  await updateDoc(doc(db, "orders", order.id), patchFor(order, next));

  const label = order.businessName || "a bulk order";
  await sendNotification({
    userId: member.uid,
    type: "work_assigned",
    title: changed === 1 ? "A video assigned to you" : `${changed} videos assigned to you`,
    message: `${actor.name} gave you ${changed} video${changed === 1 ? "" : "s"} on "${label}". Open My Work to start.`,
    link: "/tech/my-work",
    // Keyed on the order, the member and how many they now hold, so re-assigning the same batch
    // twice is one notification rather than two identical ones a second apart.
    dedupeKey: `bulk_assigned_${order.id}_${member.uid}_${changed}`,
  });

  return changed;
}

/** Take a video back off whoever holds it, so it returns to the unassigned pool. */
export async function unassignBulkVideo(params: {
  order: Order;
  n: number;
  actor: Actor;
}): Promise<void> {
  const { order, n } = params;
  const slots = bulkVideosOf(order);
  const target = slots.find((s) => s.n === n);
  if (!target || !target.assignedTo) return;

  const next = slots.map((s) => (
    s.n === n
      ? { n: s.n, status: "pending" as const, ...(s.title ? { title: s.title } : {}) }
      : s
  ));
  await updateDoc(doc(db, "orders", order.id), patchFor(order, next));
}

/**
 * Tick a video off, or put it back.
 *
 * Re-openable on purpose: "done" gets pressed by accident, and a member who cannot undo it has to
 * find an admin to correct a thing they did themselves ten seconds ago.
 */
export async function setBulkVideoComplete(params: {
  order: Order;
  n: number;
  complete: boolean;
  actor: Actor;
}): Promise<void> {
  const { order, n, complete, actor } = params;
  const slots = bulkVideosOf(order);
  const target = slots.find((s) => s.n === n);
  if (!target) return;
  if ((target.status === "completed") === complete) return;

  const next = slots.map((s) => {
    if (s.n !== n) return s;
    return complete
      ? {
        ...s,
        status: "completed" as const,
        completedAt: Timestamp.now(),
        completedByName: actor.name,
      }
      : {
        ...s,
        // Back to whoever owns it, not back to the pool — undoing "done" is not giving it up.
        status: (s.assignedTo ? "assigned" : "pending") as "assigned" | "pending",
        completedAt: null,
        completedByName: null,
      };
  });

  await updateDoc(doc(db, "orders", order.id), patchFor(order, next));

  if (!complete) return;

  // Tell whoever is answerable for the order — not the person who just pressed the button.
  const watchers = Array.from(new Set([order.techAdminId, order.assignedTo]))
    .filter((u): u is string => !!u && u !== actor.uid);
  const remaining = next.filter((s) => s.status !== "completed").length;
  const label = order.businessName || "a bulk order";

  for (const userId of watchers) {
    await sendNotification({
      userId,
      type: remaining === 0 ? "order_progress_complete" : "order_progress",
      title: remaining === 0 ? "Bulk order fully delivered" : "Video completed",
      message: remaining === 0
        ? `Every video on "${label}" is now finished.`
        : `${actor.name} finished video ${n} on "${label}" — ${remaining} left.`,
      link: "/tech-admin/orders",
      dedupeKey: `bulk_done_${order.id}_${n}_${userId}`,
    });
  }
}

/**
 * Set the whole list at once — used when an admin shares an order out in one go.
 *
 * Takes a number→uid map so a single write covers "1–4 to Kiran, 5–7 to Asha", rather than one
 * round trip per member with the order half-assigned in between.
 */
export async function assignBulkVideoBatch(params: {
  order: Order;
  /** Video number → the member taking it. An empty string un-assigns that video. */
  picks: Record<number, string>;
  members: Pick<AppUser, "uid" | "name">[];
  actor: Actor;
}): Promise<number> {
  const { order, picks, members, actor } = params;
  const nameOf = (uid: string) => members.find((m) => m.uid === uid)?.name || "";
  const slots = bulkVideosOf(order);

  let changed = 0;
  const perMember = new Map<string, number>();

  const next = slots.map((s) => {
    if (!(s.n in picks) || s.status === "completed") return s;
    const uid = picks[s.n];
    if ((s.assignedTo || "") === uid) return s;
    changed += 1;
    if (!uid) return { n: s.n, status: "pending" as const, ...(s.title ? { title: s.title } : {}) };
    perMember.set(uid, (perMember.get(uid) || 0) + 1);
    return {
      ...s,
      status: "assigned" as const,
      assignedTo: uid,
      assignedToName: nameOf(uid),
      assignedAt: Timestamp.now(),
    };
  });

  if (changed === 0) return 0;
  await updateDoc(doc(db, "orders", order.id), patchFor(order, next));

  const label = order.businessName || "a bulk order";
  for (const [uid, count] of perMember) {
    await sendNotification({
      userId: uid,
      type: "work_assigned",
      title: count === 1 ? "A video assigned to you" : `${count} videos assigned to you`,
      message: `${actor.name} gave you ${count} video${count === 1 ? "" : "s"} on "${label}". Open My Work to start.`,
      link: "/tech/my-work",
      dedupeKey: `bulk_assigned_${order.id}_${uid}_${count}`,
    });
  }

  return changed;
}

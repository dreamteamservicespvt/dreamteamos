import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase";

/**
 * The append-only record of who did what.
 *
 * Originally sales-only. The tech side had no equivalent at all, which is how two paid-for orders
 * could leave the delivery queue on 2 Aug with nothing anywhere naming the person who removed them
 * or the reason. Every tech action that moves work between people, or takes it out of the pipeline,
 * now writes here too — and reads back on the tech admin's Activity History page.
 */
export type ActivityAction =
  // ── sales ──
  | "verified_sale"
  | "rejected_sale"
  | "revoked_sale"
  | "deleted_sale"
  | "bulk_verified_sales"
  | "bulk_rejected_sales"
  | "submitted_sale"
  | "edited_sale_item"
  | "deleted_sale_item"
  | "deleted_lead"
  | "resolved_duplicate_sale"
  // ── tech: work moving between people ──
  | "assigned_work"
  | "unassigned_work"
  | "reassigned_work"
  | "verified_work"
  // ── tech: orders leaving (or coming back into) the delivery queue ──
  | "deleted_orders"
  | "restored_orders"
  | "cleaned_up_orders"
  // ── tech: money charged against an order ──
  | "added_penalty"
  | "removed_penalty";

/** Who can appear in the feed. Tech roles were added when tech actions started being recorded. */
export type ActivityActorRole =
  | "sales_admin"
  | "sales_member"
  | "tech_admin"
  | "tech_team_leader";

export const TECH_ACTIVITY_ACTIONS: ActivityAction[] = [
  "assigned_work", "unassigned_work", "reassigned_work", "verified_work",
  "deleted_orders", "restored_orders", "cleaned_up_orders", "added_penalty", "removed_penalty",
];

export interface ActivityLogEntry {
  actorId: string;
  actorName: string;
  actorRole: ActivityActorRole;
  /**
   * The admin whose feed this belongs to. For a tech team leader that is the tech admin above
   * them, so one page shows the whole department rather than each role keeping its own private log.
   */
  adminId: string;
  action: ActivityAction;
  details: Record<string, any>;
  createdAt: any;
}

export async function logActivity(entry: Omit<ActivityLogEntry, "createdAt">): Promise<void> {
  try {
    await addDoc(collection(db, "activityLogs"), {
      ...entry,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("[ActivityLog] Failed to write log:", err);
  }
}

/** The minimum an actor has to carry for their action to be attributable. */
export interface ActivityActor {
  uid: string;
  name?: string | null;
  role?: string | null;
  /** The admin who created this user — the tech admin, for anyone on the tech team. */
  createdBy?: string | null;
}

/**
 * Record a tech-side action. Never throws and never blocks the action it describes.
 *
 * `adminId` resolves to the tech admin's own uid when they act, and to their admin when a team
 * leader does — so both land in the same feed. An actor without either is still logged (under its
 * own uid) rather than dropped: a missing link must lose the grouping, not the record.
 */
export async function logTechActivity(params: {
  actor: ActivityActor | null | undefined;
  action: ActivityAction;
  details: Record<string, any>;
}): Promise<void> {
  const { actor, action, details } = params;
  if (!actor?.uid) return;
  const role: ActivityActorRole = actor.role === "tech_team_leader" ? "tech_team_leader" : "tech_admin";
  await logActivity({
    actorId: actor.uid,
    actorName: actor.name || "",
    actorRole: role,
    adminId: (role === "tech_team_leader" ? actor.createdBy : actor.uid) || actor.uid,
    action,
    details,
  });
}

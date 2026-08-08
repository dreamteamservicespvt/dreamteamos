import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { sendNotification } from "./notifications";
import { upsertClientOnWorkVerify } from "./clients";
import { syncOrderChatWorkStatus } from "./orderChat";
import { logTechActivity, type ActivityActor } from "./activityLog";
import type { WorkAssignment } from "@/types";

/**
 * Approves delivered work.
 *
 * Shared by the Work Assign page (bulk "Verify All") and the Work Reports page (per-assignment
 * verify) so both surfaces run the exact same three steps: flip the status, tell the member, and
 * record the delivery against the client.
 *
 * Failures are logged and swallowed per the existing UI contract — the live Firestore listener
 * reflects whatever actually succeeded.
 */
export async function verifyAssignments(
  items: WorkAssignment[],
  verifierUid: string,
  memberNameFor: (uid: string) => string,
  /**
   * The verifier, for the activity feed. Verifying is what takes an order OUT of the queue — it
   * flips to "verified" and stops being active work — so it is the single most important tech
   * action to be able to trace back to a person and a moment.
   */
  actor?: ActivityActor | null,
): Promise<void> {
  try {
    for (const assignment of items) {
      await updateDoc(doc(db, "work_assignments", assignment.id), {
        status: "verified",
        verifiedAt: serverTimestamp(),
        verifiedBy: verifierUid,
      });

      // The client chat says "Delivered" from here on — for the seller as much as for the tech
      // side, since "has it actually gone out?" is the question they field from the customer.
      await syncOrderChatWorkStatus(assignment.id, "verified");

      await sendNotification({
        userId: assignment.assignedTo,
        type: "work_verified",
        title: "Work Verified!",
        message: `Your ${assignment.category} work (${assignment.displayTitle}) has been verified and approved.`,
        // Verifying the same job twice — a re-run, a retry, two admins at once — is one notification.
        dedupeKey: `work_verified_${assignment.id}`,
      });

      // Order-driven work → record the delivery on the client (single customer view).
      await upsertClientOnWorkVerify({
        assignment,
        deliveredByName: memberNameFor(assignment.assignedTo),
      });

      await logTechActivity({
        actor,
        action: "verified_work",
        details: {
          assignmentId: assignment.id,
          uniqueId: assignment.uniqueId,
          memberUid: assignment.assignedTo,
          memberName: memberNameFor(assignment.assignedTo),
          category: assignment.category,
          businessName: assignment.businessName || assignment.clientName || "",
          orderId: assignment.orderId ?? null,
        },
      });
    }
  } catch (error) {
    console.error("Failed to verify assignment(s):", error);
  }
}

/** Work that has been delivered and is waiting on an approval decision. */
export const awaitingVerification = (assignments: WorkAssignment[]): WorkAssignment[] =>
  assignments.filter((a) => a.status === "completed");

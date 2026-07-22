import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { sendNotification } from "./notifications";
import { upsertClientOnWorkVerify } from "./clients";
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
): Promise<void> {
  try {
    for (const assignment of items) {
      await updateDoc(doc(db, "work_assignments", assignment.id), {
        status: "verified",
        verifiedAt: serverTimestamp(),
        verifiedBy: verifierUid,
      });

      await sendNotification({
        userId: assignment.assignedTo,
        type: "work_verified",
        title: "Work Verified!",
        message: `Your ${assignment.category} work (${assignment.displayTitle}) has been verified and approved.`,
      });

      // Order-driven work → record the delivery on the client (single customer view).
      await upsertClientOnWorkVerify({
        assignment,
        deliveredByName: memberNameFor(assignment.assignedTo),
      });
    }
  } catch (error) {
    console.error("Failed to verify assignment(s):", error);
  }
}

/** Work that has been delivered and is waiting on an approval decision. */
export const awaitingVerification = (assignments: WorkAssignment[]): WorkAssignment[] =>
  assignments.filter((a) => a.status === "completed");

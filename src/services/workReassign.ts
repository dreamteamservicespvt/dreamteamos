import { deleteField, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { reopenOrderChat } from "@/services/orderChat";
import { orderChatIdOf } from "@/utils/orderChatId";
import { logTechActivity, type ActivityActor } from "@/services/activityLog";
import type { WorkAssignment } from "@/types";

/**
 * Move an assignment to another tech member. The work disappears from the first member
 * (assignedTo changes) and lands on the new member as a fresh "assigned" task: status,
 * sessions, and completion markers are reset so the new member starts clean. Both members
 * are notified (the new member gets the normal "work assigned" popup/notification).
 */
export async function reassignWork(
  assignment: WorkAssignment,
  newMember: { uid: string; name: string },
  by: { uid: string; name: string },
  /** The reassigner, with role + admin, so the move lands in the tech activity feed. */
  actor?: ActivityActor | null,
): Promise<void> {
  const prevAssignee = assignment.assignedTo;
  await updateDoc(doc(db, "work_assignments", assignment.id), {
    assignedTo: newMember.uid,
    status: "assigned",
    sessions: [],
    totalDurationSeconds: 0,
    completedAt: deleteField(),
    completedDate: deleteField(),
    reassignedFrom: prevAssignee,
    reassignedBy: by.uid,
    reassignedAt: serverTimestamp(),
  });

  /**
   * The order keeps its own copy of who is doing the work, and it used to be left behind here.
   *
   * Anything that reads the order rather than the assignment then addressed the wrong person —
   * most visibly the delivery-deadline sweep, which sent "your delivery is overdue" to a member
   * who had not held that job since it moved. Writing both keeps the two in step at the moment
   * they diverge, rather than teaching every reader to distrust the order.
   */
  if (assignment.orderId) {
    try {
      await updateDoc(doc(db, "orders", assignment.orderId), {
        assignedTo: newMember.uid,
        assignedToName: newMember.name,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      // A missing or deleted order must never block the reassignment itself.
      console.error("[reassign] could not move the order to the new member:", err);
    }
  }

  /**
   * The client chat moves with the work.
   *
   * Re-opened even if it had been closed by a completion, because work coming back to a new member
   * means the client has something more to say — and calls follow `memberUid`, so this is also what
   * stops the customer ringing the person who no longer holds the job.
   */
  await reopenOrderChat(orderChatIdOf(assignment), { uid: newMember.uid, name: newMember.name });

  const title = assignment.businessName || assignment.clientName || assignment.displayTitle || "work";

  await sendNotification({
    userId: newMember.uid,
    type: "work_assigned",
    title: "New Work Assigned",
    message: `"${title}" has been assigned to you by ${by.name}.${assignment.accessCode ? ` Access code: ${assignment.accessCode}` : ""}`,
    link: "/tech/my-work",
  });

  if (prevAssignee && prevAssignee !== newMember.uid) {
    await sendNotification({
      userId: prevAssignee,
      type: "work_editing",
      title: "Work Reassigned",
      message: `"${title}" has been moved to ${newMember.name} by ${by.name}. It is no longer in your list.`,
      link: "/tech/my-work",
    });
  }

  await logTechActivity({
    actor: actor ?? { uid: by.uid, name: by.name },
    action: "reassigned_work",
    details: {
      assignmentId: assignment.id,
      uniqueId: assignment.uniqueId,
      businessName: title,
      category: assignment.category,
      fromUid: prevAssignee ?? null,
      memberUid: newMember.uid,
      memberName: newMember.name,
      orderId: assignment.orderId ?? null,
    },
  });
}

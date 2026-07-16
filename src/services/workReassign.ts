import { deleteField, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
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
}

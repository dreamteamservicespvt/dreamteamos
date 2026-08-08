/**
 * The sales member's way into a client chat.
 *
 * Everything about the conversation itself is `StaffOrderChat` — there is deliberately no second
 * chat implementation for sales, because the whole value of putting the seller in the room is that
 * everyone is looking at the same thread. This is only the missing step in front of it: the sales
 * side reaches a chat through an *order*, which carries `workAssignmentId`, while the room is
 * addressed by the assignment itself. One document read turns one into the other.
 *
 * The read is done here rather than on the pages that launch it so neither My Leads nor the chats
 * list has to know that a chat id is an assignment id.
 */
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { Loader2, Lock } from "lucide-react";
import { db } from "@/services/firebase";
import StaffOrderChat from "@/components/order-chat/StaffOrderChat";
import type { WorkAssignment } from "@/types";

export interface SalesOrderChatProps {
  /** The work assignment behind the sale — `order.workAssignmentId`. Also the chat's id. */
  assignmentId: string;
  /** The seller, so a room created before sales joined these conversations learns who sold it. */
  soldBy?: { uid: string; name?: string } | null;
  onClose: () => void;
}

export default function SalesOrderChat({ assignmentId, soldBy, onClose }: SalesOrderChatProps) {
  const [assignment, setAssignment] = useState<WorkAssignment | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let alive = true;
    setAssignment(null);
    setGone(false);
    getDoc(doc(db, "work_assignments", assignmentId))
      .then((snap) => {
        if (!alive) return;
        if (snap.exists()) setAssignment({ id: snap.id, ...snap.data() } as WorkAssignment);
        else setGone(true);
      })
      .catch(() => { if (alive) setGone(true); });
    return () => { alive = false; };
  }, [assignmentId]);

  if (gone) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-background px-8 text-center">
        <Lock className="h-7 w-7 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">This chat is no longer available</p>
        {/* The honest reason, because it is the one the member can act on: work taken back off a
            member is deleted outright, and the job gets a new room when it is assigned again. */}
        <p className="max-w-xs text-xs text-muted-foreground">
          The job behind it was unassigned or removed. It will have a new chat once the tech team
          picks it up again.
        </p>
        <button onClick={onClose}
          className="mt-2 rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent">
          Back
        </button>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <StaffOrderChat
      assignment={assignment}
      // The seller is one of the two people who can sensibly hand the client their link — they are
      // the one already in a WhatsApp conversation with them.
      canShare
      soldBy={soldBy}
      onClose={onClose}
    />
  );
}

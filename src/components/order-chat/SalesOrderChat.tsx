/**
 * The sales member's way into a client chat.
 *
 * Everything about the conversation itself is `StaffOrderChat` — there is deliberately no second
 * chat implementation for sales, because the whole value of putting the seller in the room is that
 * everyone is looking at the same thread.
 *
 * ── Why it takes an order, not an assignment ──────────────────────────────────────────────────
 * Because the seller gets here first. The room opens with the SALE so the client's brief, photos
 * and voice notes have somewhere to go days before anyone is given the job, and at that point
 * there is no assignment to look up at all. `StaffOrderChat` still wants a `WorkAssignment` — it
 * reads the business name, the job id and the spec off it — so when the job has been assigned we
 * fetch the real record, and when it has not we hand over a stand-in built from the order.
 */
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { Loader2 } from "lucide-react";
import { db } from "@/services/firebase";
import StaffOrderChat from "@/components/order-chat/StaffOrderChat";
import type { Order, WorkAssignment } from "@/types";

export interface SalesOrderChatProps {
  /** The order behind the sale. Its id is the room's id — see utils/orderChatId. */
  order: Pick<Order, "id" | "businessName" | "clientName" | "clientPhone" | "category"> & {
    workAssignmentId?: string | null;
  };
  /** The seller, so a room that started before sales joined these conversations learns who sold it. */
  soldBy?: { uid: string; name?: string } | null;
  onClose: () => void;
}

/**
 * A sale with nobody on it yet, in the shape the chat expects.
 *
 * `chatId` is the load-bearing field: it is what points every read and write at the order's room
 * rather than at a work assignment that does not exist. The rest is what the header renders.
 */
function placeholderAssignment(order: SalesOrderChatProps["order"]): WorkAssignment {
  return {
    id: order.id,
    chatId: order.id,
    orderId: order.id,
    assignedTo: "",
    assignedBy: "",
    businessName: order.businessName,
    clientName: order.clientName,
    businessWhatsapp: order.clientPhone,
    category: order.category,
    uniqueId: "",
    accessCode: "",
    displayTitle: order.businessName || "Client chat",
    status: "assigned",
    sessions: [],
    totalDurationSeconds: 0,
    clipCount: 0,
    includesEndCredits: false,
    duration: "",
    pricePerUnit: 0,
    totalPrice: 0,
    date: "",
    assignedAt: null,
    createdAt: null,
  } as unknown as WorkAssignment;
}

export default function SalesOrderChat({ order, soldBy, onClose }: SalesOrderChatProps) {
  const [assignment, setAssignment] = useState<WorkAssignment | null>(null);

  useEffect(() => {
    let alive = true;
    setAssignment(null);

    // Nobody is on it yet — the room still exists, opened by the sale.
    if (!order.workAssignmentId) {
      setAssignment(placeholderAssignment(order));
      return () => { alive = false; };
    }

    getDoc(doc(db, "work_assignments", order.workAssignmentId))
      .then((snap) => {
        if (!alive) return;
        // A job taken back off a member leaves the order — and its conversation — behind, so a
        // missing assignment is the not-assigned case again rather than a dead end.
        setAssignment(snap.exists()
          ? ({ id: snap.id, ...snap.data() } as WorkAssignment)
          : placeholderAssignment(order));
      })
      .catch(() => { if (alive) setAssignment(placeholderAssignment(order)); });

    return () => { alive = false; };
  }, [order.id, order.workAssignmentId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // already in a WhatsApp conversation with them. The button itself still waits until somebody
      // has been given the job; see `assignable` in StaffOrderChat.
      canShare
      soldBy={soldBy}
      onClose={onClose}
    />
  );
}

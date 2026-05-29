import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase";

export type ActivityAction =
  | "verified_sale"
  | "rejected_sale"
  | "revoked_sale"
  | "deleted_sale"
  | "bulk_verified_sales"
  | "bulk_rejected_sales"
  | "submitted_sale"
  | "deleted_sale_item"
  | "deleted_lead";

export interface ActivityLogEntry {
  actorId: string;
  actorName: string;
  actorRole: "sales_admin" | "sales_member";
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

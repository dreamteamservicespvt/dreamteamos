import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/services/firebase";

export type EmploymentType = "full_time" | "part_time";

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  full_time: "Full-Time",
  part_time: "Part-Time",
};

/** Set / update a member's employment type (Tech Admin or Tech Team Lead). */
export async function setEmploymentType(uid: string, type: EmploymentType): Promise<void> {
  await updateDoc(doc(db, "users", uid), { employmentType: type, updatedAt: serverTimestamp() });
}

/** Normalises a possibly-undefined value to a concrete type (defaults to full_time). */
export const employmentOf = (v?: string): EmploymentType => (v === "part_time" ? "part_time" : "full_time");

/**
 * Set a member's company employee ID (Tech Admin).
 *
 * Free-form on purpose — every company numbers its people differently, and forcing a scheme
 * here would just mean fighting it later. Stored trimmed and upper-cased so the same ID typed
 * two ways doesn't read as two people on a payslip.
 */
export async function setEmployeeId(uid: string, employeeId: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    employeeId: employeeId.trim().toUpperCase(),
    updatedAt: serverTimestamp(),
  });
}

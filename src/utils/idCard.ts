/**
 * What goes on an employee ID card.
 *
 * Every member gets one, which is the whole difficulty: the card has to be complete for someone
 * whose HR record was filled in on joining day AND for someone who has only ever had a login. So
 * this reads the employment profile where there is one and falls back to the user record where
 * there isn't, and it never renders the word "undefined" onto something a person carries.
 *
 * Pure and separate from the card's markup so the fallbacks — the ones that only bite for members
 * with no HR record — can be tested without rendering anything.
 */
import { format, parse } from "date-fns";
import { getRoleLabel } from "@/utils/roleHelpers";
import type { AppUser } from "@/types";
import type { EmployeeProfile } from "@/types/hr";

/**
 * The card's geometry, here rather than beside its markup so the PDF exporter can read it without
 * importing a React component.
 *
 * CR80 portrait — the size of a real badge — at 2×, so the PDF prints straight into a holder.
 */
export const CARD_WIDTH = 336;
export const CARD_HEIGHT = 533;
export const CARD_MM = { width: 53.98, height: 85.6 };

export interface IdCardData {
  name: string;
  /** The company's own number where one has been set — otherwise a stable stand-in. See below. */
  employeeId: string;
  /** True when `employeeId` was derived rather than assigned, so the admin can be told. */
  employeeIdIsProvisional: boolean;
  designation: string;
  department: string;
  photoUrl: string | null;
  phone: string | null;
  email: string | null;
  bloodGroup: string | null;
  joinedOn: string | null;
  emergencyContact: string | null;
  /** Set only for someone serving notice — a card that outlives the job is the point of an expiry. */
  validUntil: string | null;
}

const DEPARTMENT_LABELS: Record<string, string> = {
  tech: "Technology",
  sales: "Sales",
};

/** "2024-03-14" → "14 Mar 2024". Anything unparseable is dropped rather than printed raw. */
export function prettyDate(iso: string | null | undefined): string | null {
  const v = (iso || "").trim();
  if (v.length < 10) return null;
  try {
    return format(parse(v.slice(0, 10), "yyyy-MM-dd", new Date()), "dd MMM yyyy");
  } catch {
    return null;
  }
}

/**
 * A stand-in number for someone the admin has not numbered yet.
 *
 * Derived from the uid, so it is stable — the same person gets the same card number today and
 * next year, and two people can never collide. It is flagged provisional wherever it is shown, so
 * nobody mistakes it for the payroll employee ID.
 */
export function provisionalEmployeeId(uid: string): string {
  const tail = (uid || "").replace(/[^a-zA-Z0-9]/g, "").slice(-5).toUpperCase();
  return `DTS-${tail.padStart(5, "0")}`;
}

export function buildIdCard(member: AppUser, profile?: EmployeeProfile | null): IdCardData {
  const assigned = (member.employeeId || "").trim();
  const emergency = profile?.emergencyContact;

  return {
    name: (member.name || "").trim() || "—",
    employeeId: assigned || provisionalEmployeeId(member.uid),
    employeeIdIsProvisional: !assigned,
    // A designation is what a card is read for, so the role is a better fallback than a blank.
    designation: (profile?.designation || "").trim() || getRoleLabel(member.role),
    department: DEPARTMENT_LABELS[profile?.department || ""] || (member.role?.startsWith("sales") ? "Sales" : "Technology"),
    // The HR photograph is the formal one; the avatar is whatever they uploaded. Either beats none.
    photoUrl: profile?.photoUrl || member.avatar || null,
    phone: (member.phone || "").trim() || null,
    email: (member.email || "").trim() || null,
    bloodGroup: (profile?.bloodGroup || "").trim() || null,
    joinedOn: prettyDate(profile?.joiningDate),
    emergencyContact: emergency?.name && emergency?.phone
      ? `${emergency.name}${emergency.relation ? ` (${emergency.relation})` : ""} · ${emergency.phone}`
      : null,
    validUntil: prettyDate(profile?.separation?.lastWorkingDay),
  };
}

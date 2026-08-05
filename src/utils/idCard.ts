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

/**
 * The photograph's box, and the aspect the photo is cropped to before it is ever rendered.
 *
 * 4:5 portrait, the shape of a real ID photograph, and big — a badge is identified across a room by
 * the face on it, and this was a 100px circle competing with everything else on the card.
 *
 * Cropping to the box's own aspect BEFORE render is not a nicety. html2canvas — which produces the
 * PNG and the PDF — does not implement `object-fit`, so a photo that CSS was cropping to `cover` on
 * screen came out of the exporter stretched to fill the box. Cropping the pixels means the two
 * agree by construction, whatever the export path does. See `fitBox` for the same problem on the
 * logo and the signatures.
 */
export const PHOTO_BOX = { width: 148, height: 185 };

/**
 * The box an image should be given so it fills it without distortion — `object-fit: contain`, done
 * in arithmetic instead of in CSS.
 *
 * Same reason as the crop above: the exporter draws an `<img>` stretched to whatever box the layout
 * gave it. Sizing the box to the picture's own aspect ratio makes `contain` a no-op, so the logo
 * and the signatures are identical on screen and in the download.
 *
 * Returns the max box for an image whose size we could not read, which is the pre-existing
 * behaviour and never worse than a blank.
 */
export function fitBox(
  natural: { width: number; height: number } | null,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  if (!natural || !(natural.width > 0) || !(natural.height > 0)) {
    return { width: maxWidth, height: maxHeight };
  }
  const scale = Math.min(maxWidth / natural.width, maxHeight / natural.height);
  return {
    width: Math.max(1, Math.round(natural.width * scale)),
    height: Math.max(1, Math.round(natural.height * scale)),
  };
}

export interface IdCardData {
  name: string;
  /** Who this card belongs to — what the verification QR resolves to. */
  uid: string;
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
  /** The holder's own signature, photographed off paper. Printed where they would have signed. */
  signatureUrl: string | null;
}

/**
 * Where the card's QR points.
 *
 * A printed badge proves nothing on its own — anyone can laminate a rectangle. The QR resolves to
 * a page served by the company that says whether this person is currently employed here, which is
 * the question somebody scanning a badge is actually asking.
 *
 * Always the production origin: a card is printed once and carried for years, and a QR baked
 * against `localhost` on the day it was generated is a dead square of ink forever.
 */
export const ID_VERIFY_ORIGIN = "https://dreamteamos.vercel.app";

export function idCardVerifyUrl(uid: string): string {
  return `${ID_VERIFY_ORIGIN}/verify/${uid}`;
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
    uid: member.uid,
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
    signatureUrl: profile?.signatureUrl || null,
  };
}

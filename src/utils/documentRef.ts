/**
 * The company's reference for a letter — `DTS/OFR/2026/0007`.
 *
 * A document with no reference cannot be pointed at. "The offer letter we sent in March" is not a
 * thing anyone can look up; `DTS/OFR/2026/0007` is. It is what goes in an email subject, what an
 * employee quotes when they query something, and what makes a stack of letters a register rather
 * than a pile.
 *
 * Four parts, in the order a reader scans them: who issued it, what kind of letter it is, when, and
 * which one in the series.
 *
 * The year is the **calendar** year printed on the letter, not the Indian financial year. A
 * reference whose year disagrees with the date directly beneath it invites exactly one question,
 * and answering "that's the FY" every time is worse than the small loss of convention.
 *
 * Pure — the counter itself is allocated in `services/hrDocuments`.
 */
import type { HrDocumentType } from "@/types/hr";

/**
 * The short code for each document type.
 *
 * Fixed strings rather than anything derived from the label: these end up printed on paper that
 * outlives the code, so renaming "Increment Letter" in the UI must never change what `INC` means.
 */
export const DOCUMENT_REF_CODE: Record<HrDocumentType, string> = {
  offer_letter: "OFR",
  appointment_letter: "APT",
  nda: "NDA",
  policy_acknowledgement: "POL",
  confirmation_letter: "CNF",
  probation_extension: "PRB",
  increment_letter: "INC",
  promotion_letter: "PRM",
  show_cause_notice: "SCN",
  warning_letter: "WRN",
  resignation_acceptance: "RSA",
  relieving_letter: "REL",
  experience_letter: "EXP",
  full_final_settlement: "FNF",
};

/**
 * `Dream Team Services` → `DTS`. The company's own initials, so the prefix follows a rename.
 *
 * Capped at four letters and floored at the full name's first letters, because a two-word company
 * gives two and that is still a usable prefix. Falls back to `DTS` for a name with no letters in
 * it at all, which should be impossible but must not produce `//OFR/`.
 */
export function companyInitials(name: string): string {
  const words = (name || "").split(/[^A-Za-z]+/).filter(Boolean);
  const initials = words.map((w) => w[0].toUpperCase()).join("").slice(0, 4);
  return initials || "DTS";
}

/** The counter document holding every series for one year. One read, one write, per issue. */
export const refCounterDocId = (year: number): string => `${year}`;

/** Assemble the printed reference. `seq` is 1-based; it is padded so the series sorts as text. */
export function formatDocumentRef(
  companyName: string,
  type: HrDocumentType,
  year: number,
  seq: number,
): string {
  return `${companyInitials(companyName)}/${DOCUMENT_REF_CODE[type]}/${year}/${String(seq).padStart(4, "0")}`;
}

/** The calendar year a letter dated `iso` belongs to, falling back to today for an unusable date. */
export function refYear(iso?: string | null): number {
  const parsed = iso ? Number((iso || "").slice(0, 4)) : NaN;
  return Number.isInteger(parsed) && parsed > 1970 ? parsed : new Date().getFullYear();
}

/**
 * GST facts the Invoice Builder needs: the state codes, GSTIN checking, and which tax applies.
 *
 * ── CGST + SGST or IGST ───────────────────────────────────────────────────────────────────────
 * Decided by the PLACE OF SUPPLY, not by where the client says they are: a supply inside the
 * seller's own state is split CGST + SGST at half the rate each; a supply to any other state is
 * IGST at the full rate. A registered client's GSTIN starts with their state code, which is why
 * typing it fills the place of supply — the one thing a salesperson would otherwise get wrong.
 *
 * Pure — no React, no Firestore.
 */

export interface GstState {
  /** Two-digit GST state code, as the GSTIN starts with. */
  code: string;
  name: string;
}

/**
 * The GST state codes in use. Codes that were retired (25 Daman & Diu, merged into 26 in 2020;
 * 28 the undivided Andhra Pradesh) are left out so nobody can pick them for a new invoice.
 */
export const GST_STATES: readonly GstState[] = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
];

/** Where the company itself is registered when its GSTIN cannot tell us (Kakinada, AP). */
export const HOME_STATE_CODE = "37";

/** The rates GST actually uses, offered first in every rate picker. */
export const GST_RATES: readonly number[] = [0, 5, 12, 18, 28];

export function stateName(code: string | null | undefined): string {
  return GST_STATES.find((s) => s.code === code)?.name || "";
}

/** Upper-case with every space removed — how a GSTIN is compared and stored. */
export function normalizeGstin(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, "").toUpperCase();
}

/** 2 digits (state) · 5 letters + 4 digits + 1 letter (PAN) · entity number · "Z" · check character. */
const GSTIN_SHAPE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * The GSTIN's 15th character, computed from the first fourteen (the published mod-36 scheme).
 *
 * Worth checking because the shape alone lets through the commonest mistake there is — two digits
 * typed the wrong way round — and a tax invoice with the client's GSTIN wrong is one they cannot
 * claim input credit on.
 */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = GSTIN_CHARS.indexOf(first14[i]);
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

export type GstinProblem = "shape" | "check" | "state";

/**
 * What is wrong with a GSTIN, or null when it is fine. An empty value is fine — an unregistered
 * client simply has none.
 */
export function gstinProblem(value: string | null | undefined): GstinProblem | null {
  const g = normalizeGstin(value);
  if (!g) return null;
  if (!GSTIN_SHAPE.test(g)) return "shape";
  if (!stateName(g.slice(0, 2))) return "state";
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return "check";
  return null;
}

export const GSTIN_PROBLEM_TEXT: Record<GstinProblem, string> = {
  shape: "A GSTIN is 15 characters, like 37ABCDE1234F1Z5.",
  state: "The first two digits are not a GST state code.",
  check: "This GSTIN has a typing mistake (its last character doesn't match).",
};

/** The state code a valid GSTIN starts with, or "" when it cannot tell. */
export function stateCodeOfGstin(value: string | null | undefined): string {
  const g = normalizeGstin(value);
  if (!/^\d{2}/.test(g)) return "";
  const code = g.slice(0, 2);
  return stateName(code) ? code : "";
}

export type SupplyType = "intra" | "inter";

/**
 * Inside the seller's state → CGST + SGST; any other state → IGST. An unknown place of supply is
 * treated as the seller's own state, which is right for almost every client this company has.
 */
export function supplyTypeOf(sellerState: string, placeOfSupply: string): SupplyType {
  if (!placeOfSupply || !sellerState) return "intra";
  return placeOfSupply === sellerState ? "intra" : "inter";
}

/** IFSC: 4 letters (bank), a zero, 6 letters or digits (branch). */
export function isValidIfsc(value: string | null | undefined): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test((value || "").trim().toUpperCase());
}

/** A UPI ID: `name@handle`. Loose on purpose — banks invent new handles. */
export function isValidUpiId(value: string | null | undefined): boolean {
  return /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$/.test((value || "").trim());
}

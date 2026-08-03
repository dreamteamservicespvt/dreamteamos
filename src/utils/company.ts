/**
 * Company identity — the built-in defaults.
 *
 * These are the fallbacks, not the truth. The live values are edited in Settings → Company
 * Documents and stored in `company_settings/main`; anything left blank there falls back to what is
 * written here. Read the merged result through `resolveCompany()` below, or the `useCompany()`
 * hook — reaching for this constant directly prints the default even after somebody has changed it
 * in Settings.
 *
 * They stay in code so a brand-new deployment, or a letterhead rendered before the settings
 * document has loaded, still prints a real company rather than blanks.
 *
 * This module stays free of Firestore: the shapes and the merge rule are pure, so the policy that
 * decides who signs what can be tested without standing up a database. `services/companyAssets`
 * is the thin IO layer over the same shapes.
 */
export const COMPANY_DEFAULTS = {
  name: "Dream Team Services",
  website: "thedreamteamservices.com",
  email: "thedreamteamservicespvt@gmail.com",
  gstin: "37FWQPR6939Q1ZY",
  /** Udyam / MSME registration number. Blank until someone enters it in Settings. */
  msme: "",
  /**
   * The registered address, as it should read on a letter.
   *
   * Everything that prints it leaves a missing line out entirely rather than showing a placeholder
   * — a letterhead carrying an invented address is worse than a letterhead carrying none, because
   * only one of the two is a lie a bank might act on.
   *
   * Lines are printed in order; keep it to building, street, area, city, district, state, PIN.
   */
  address: [
    "DREAM TEAM, 50-6-23, Vishnalayam Street",
    "Jagannaickpur, Kakinada",
    "Andhra Pradesh 533002",
  ] as readonly string[],
  /** Printed beside the email on letters and on the back of an ID card. Blank hides it. */
  phone: "",
} as const;

/**
 * @deprecated Prints the defaults, ignoring anything set in Settings → Company Documents.
 * Use `useCompany()` in components or thread a `ResolvedCompany` through pure functions.
 * Kept so the few places that legitimately need a synchronous, pre-load value still compile.
 */
export const COMPANY = COMPANY_DEFAULTS;

// ─── The stored company record ──────────────────────────────────────────────

/** One person who signs on the company's behalf. */
export interface CompanyOfficer {
  name?: string | null;
  designation?: string | null;
  /** Photographed off paper, background stripped at upload time. */
  signatureUrl?: string | null;
}

/**
 * What is actually stored in `company_settings/main`.
 *
 * Every field is optional: the document starts empty and is filled in over time, and anything
 * missing falls back to {@link COMPANY_DEFAULTS} rather than printing a gap.
 */
export interface CompanyAssets {
  // ── Identity ──
  name?: string | null;
  /** One entry per line of the postal address, printed in order. */
  address?: string[] | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  gstin?: string | null;
  msme?: string | null;
  /** Uploaded logo. Falls back to the bundled `/dts-logo-full.png` when unset. */
  logoUrl?: string | null;

  // ── Marks ──
  /** The CEO signs almost everything the company issues. */
  ceoName?: string | null;
  ceoDesignation?: string | null;
  ceoSignatureUrl?: string | null;
  /** The CTO countersigns what turns on technical confidentiality — the NDA and IP terms. */
  ctoName?: string | null;
  ctoDesignation?: string | null;
  ctoSignatureUrl?: string | null;
  /** The company seal, laid over the signature block of issued letters. */
  stampUrl?: string | null;

  updatedAt?: unknown;
  updatedByName?: string | null;
}

export const EMPTY_COMPANY_ASSETS: CompanyAssets = {};

/** The company as it should be printed — no optional fields, safe to render without null checks. */
export interface ResolvedCompany {
  name: string;
  address: string[];
  website: string;
  email: string;
  phone: string;
  gstin: string;
  msme: string;
  logoUrl: string | null;
}

const text = (stored?: string | null, fallback = ""): string => {
  const v = (stored ?? "").trim();
  return v || fallback;
};

/**
 * Stored settings over built-in defaults, field by field.
 *
 * Field by field rather than an object spread, because a half-filled settings document must not
 * blank out the fields nobody has got to yet — an admin who saves an MSME number should not
 * thereby erase the address from every letterhead in the app.
 */
export function resolveCompany(assets?: CompanyAssets | null): ResolvedCompany {
  const a = assets || {};
  const storedAddress = (a.address || []).map((l) => (l || "").trim()).filter(Boolean);
  return {
    name: text(a.name, COMPANY_DEFAULTS.name),
    address: storedAddress.length > 0 ? storedAddress : [...COMPANY_DEFAULTS.address],
    website: text(a.website, COMPANY_DEFAULTS.website),
    email: text(a.email, COMPANY_DEFAULTS.email),
    phone: text(a.phone, COMPANY_DEFAULTS.phone),
    gstin: text(a.gstin, COMPANY_DEFAULTS.gstin),
    msme: text(a.msme, COMPANY_DEFAULTS.msme),
    logoUrl: (a.logoUrl || "").trim() || null,
  };
}

/** The two offices that can sign on the company's behalf. */
export type OfficerKey = "ceo" | "cto";

export const OFFICER_FALLBACK_TITLE: Record<OfficerKey, string> = {
  ceo: "Chief Executive Officer",
  cto: "Chief Technology Officer",
};

export const OFFICER_LABEL: Record<OfficerKey, string> = {
  ceo: "CEO",
  cto: "CTO",
};

/** Pull one officer out of the settings document, with a sensible title when none was typed. */
export function officerOf(assets: CompanyAssets | null | undefined, key: OfficerKey): CompanyOfficer {
  const a = assets || {};
  const [name, designation, signatureUrl] = key === "ceo"
    ? [a.ceoName, a.ceoDesignation, a.ceoSignatureUrl]
    : [a.ctoName, a.ctoDesignation, a.ctoSignatureUrl];
  return {
    name: (name || "").trim() || null,
    designation: (designation || "").trim() || OFFICER_FALLBACK_TITLE[key],
    signatureUrl: signatureUrl || null,
  };
}

/** An office can actually sign only once both a name and a signature image exist for it. */
export const officerCanSign = (o: CompanyOfficer | null | undefined): boolean =>
  !!(o && o.name && o.signatureUrl);

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const ones = ONES[n % 10];
  return ones ? `${tens} ${ones}` : tens;
}

/**
 * Rupee amount in words, Indian numbering (lakh / crore) — required on a payslip so the figure
 * can't be altered after printing.
 */
export function amountInWords(amount: number): string {
  const rupees = Math.floor(Math.abs(amount));
  if (rupees === 0) return "Zero Rupees Only";

  const parts: string[] = [];
  const crore = Math.floor(rupees / 10_000_000);
  const lakh = Math.floor((rupees % 10_000_000) / 100_000);
  const thousand = Math.floor((rupees % 100_000) / 1_000);
  const hundred = Math.floor((rupees % 1_000) / 100);
  const rest = rupees % 100;

  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigits(rest));

  return `${parts.join(" ")} Rupees Only`;
}

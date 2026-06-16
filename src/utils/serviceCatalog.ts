/**
 * Canonical DREAM TEAM SERVICES (DTS) service & price list.
 *
 * Single source of truth for:
 *  - the sales member's "Add Sale" dropdown (replaces the old inline SALE_CATEGORIES / PACKAGES),
 *  - the Client "Our Works" breakdown,
 *  - (later) the upsell gap checklist.
 *
 * `fromAd` marks categories that flow through the tech AI-video pipeline (wishes/promotional/
 * cinematic). `billing: "monthly"` marks recurring subscriptions (Social Media Management).
 */

export type Billing = "one_time" | "monthly";

export interface ServicePackage {
  label: string;
  amount: number; // INR; 0 means "enter a custom amount"
}

export interface ServiceCategory {
  key: string;
  label: string; // display name
  billing: Billing;
  fromAd: boolean;
  packages: ServicePackage[];
}

export const SERVICE_CATALOG: ServiceCategory[] = [
  {
    key: "promotional",
    label: "Promotional Ad",
    billing: "one_time",
    fromAd: true,
    packages: [
      { label: "15 Seconds + Poster", amount: 499 },
      { label: "30 Seconds + Poster", amount: 999 },
      { label: "45 Seconds + Poster", amount: 1499 },
      { label: "1 Minute + Poster", amount: 1999 },
    ],
  },
  {
    key: "cinematic",
    label: "Cinematic Ad",
    billing: "one_time",
    fromAd: true,
    packages: [
      { label: "15 Seconds + Poster", amount: 999 },
      { label: "30 Seconds + Poster", amount: 1999 },
      { label: "45 Seconds + Poster", amount: 2999 },
      { label: "1 Minute + Poster", amount: 3999 },
    ],
  },
  {
    key: "wishes",
    label: "Wishes",
    billing: "one_time",
    fromAd: true,
    packages: [
      { label: "20 Seconds", amount: 499 },
      { label: "40 Seconds", amount: 999 },
    ],
  },
  {
    key: "digital_marketing",
    label: "Digital Marketing (Single Campaign)",
    billing: "one_time",
    fromAd: false,
    packages: [
      { label: "Social Media Setup", amount: 999 },
      { label: "Campaign Management", amount: 999 },
      { label: "Single Campaign Package", amount: 2000 },
    ],
  },
  {
    key: "social_media_management",
    label: "Social Media Management (Monthly)",
    billing: "monthly",
    fromAd: false,
    packages: [
      { label: "Starter Package", amount: 10000 },
      { label: "Plus Package", amount: 15000 },
      { label: "Pro Package", amount: 20000 },
      { label: "Ultra Pro Package", amount: 30000 },
    ],
  },
  {
    key: "website",
    label: "Website Development",
    billing: "one_time",
    fromAd: false,
    packages: [
      { label: "Website (Starting From)", amount: 4999 },
      { label: "Custom quote", amount: 0 },
    ],
  },
  {
    key: "poster",
    label: "Poster Development",
    billing: "one_time",
    fromAd: false,
    packages: [
      { label: "Basic", amount: 99 },
      { label: "Standard", amount: 199 },
      { label: "Premium", amount: 249 },
    ],
  },
  {
    key: "logo",
    label: "Logo Design",
    billing: "one_time",
    fromAd: false,
    packages: [
      { label: "Basic", amount: 499 },
      { label: "Standard", amount: 999 },
      { label: "Premium", amount: 1499 },
    ],
  },
  {
    key: "google_listing",
    label: "Google Business Profile",
    billing: "one_time",
    fromAd: false,
    packages: [
      { label: "Basic", amount: 499 },
      { label: "Standard", amount: 999 },
      { label: "Premium", amount: 1499 },
    ],
  },
  {
    key: "visiting_card",
    label: "Visiting Card Design",
    billing: "one_time",
    fromAd: false,
    packages: [
      { label: "Basic", amount: 499 },
      { label: "Standard", amount: 999 },
      { label: "Premium", amount: 1499 },
    ],
  },
  { key: "software", label: "Software", billing: "one_time", fromAd: false, packages: [] },
  { key: "custom", label: "Custom", billing: "one_time", fromAd: false, packages: [] },
];

const CATEGORY_BY_KEY: Record<string, ServiceCategory> = Object.fromEntries(
  SERVICE_CATALOG.map((c) => [c.key, c]),
);

/** Ordered category keys — drop-in replacement for the old inline `SALE_CATEGORIES`. */
export const SALE_CATEGORIES: string[] = SERVICE_CATALOG.map((c) => c.key);

/** Category → packages — drop-in replacement for the old inline `PACKAGES`. */
export const PACKAGES: Record<string, ServicePackage[]> = Object.fromEntries(
  SERVICE_CATALOG.map((c) => [c.key, c.packages]),
);

export function getCategoryMeta(key: string): ServiceCategory | undefined {
  return CATEGORY_BY_KEY[key];
}

export function categoryLabel(key: string): string {
  return (
    CATEGORY_BY_KEY[key]?.label ||
    key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
  );
}

/** Single source for the "is this an ad deliverable" rule used across orders/clients. */
export function isAdCategory(key: string): boolean {
  return CATEGORY_BY_KEY[key]?.fromAd ?? false;
}

export function categoryBilling(key: string): Billing {
  return CATEGORY_BY_KEY[key]?.billing ?? "one_time";
}

/**
 * Foundational "has it or not" services that drive the upsell gap checklist. Repeatable services
 * (ads, single campaigns) are excluded — a client can always buy more of those, so they aren't "gaps".
 */
export const GAP_ELIGIBLE_CATEGORIES = [
  "website", "logo", "google_listing", "visiting_card", "social_media_management",
];

/** Catalog entries a client doesn't yet own — the upsell opportunities. */
export function gapCategories(ownedKeys: string[]): ServiceCategory[] {
  const owned = new Set(ownedKeys);
  return GAP_ELIGIBLE_CATEGORIES
    .filter((k) => !owned.has(k))
    .map((k) => CATEGORY_BY_KEY[k])
    .filter(Boolean);
}

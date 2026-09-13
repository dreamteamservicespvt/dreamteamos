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

/**
 * What a Social Media Monthly package owes the client that month: N ads, N posters, N of those
 * posted, and N run as campaigns. Every ad in these packages is 30 seconds + poster.
 *
 * Spelled out on the package rather than left in a sales script because it is the only thing that
 * tells the tech team what "done" means for a month — an order for a Pro package is not finished
 * when one ad is made, it is finished after eight of everything.
 */
export interface PackageDeliverables {
  ads: number;
  posters: number;
  posted: number;
  /** Stories put up. Twice the video count on every package — see `smmQuota`. */
  stories: number;
  /** Ads actually run as digital-marketing campaigns. Counted in VIDEOS: only a video is ever run. */
  campaigns: number;
}

export interface ServicePackage {
  label: string;
  amount: number; // INR; 0 means "enter a custom amount"
  /** Monthly quota, for packages that owe a countable amount of work (Social Media Monthly). */
  deliverables?: PackageDeliverables;
  /**
   * The networks this package covers, biggest package widest.
   *
   * On the package rather than in a sales script because it is the second question every client
   * asks after the price, and because it is the difference between two packages that otherwise
   * look like "the same thing, more of it". It is read back to the client in their confirmation,
   * so nobody can be told later that YouTube was included when they bought Starter.
   */
  platforms?: string[];
}

export interface ServiceCategory {
  key: string;
  label: string; // display name
  billing: Billing;
  fromAd: boolean;
  packages: ServicePackage[];
  /**
   * Sold by quantity — the sale form asks "how many?" and applies the volume-discount ladder.
   * See utils/bulkDiscount.
   */
  bulk?: boolean;
  /**
   * A bulk category sells several of ANOTHER category's videos at once, so it has no price list of
   * its own — the member picks which kind first and the packages come from there. Listing the keys
   * here rather than hard-coding one kind is what lets bulk wishes and bulk cinematic exist.
   */
  bulkTypes?: string[];
  /** Free-text describing what was sold, because there is no package list to say it. */
  needsDescription?: boolean;
}

/** Every ad in a Social Media Monthly package is the same length. */
export const SMM_AD_LENGTH = "30 Seconds + Poster";

/**
 * What a social-media month owes, from its video count.
 *
 * ── Why posts and stories are twice the videos ────────────────────────────────────────────────
 * A month's feed is not one post per video. Every package runs two posts and two stories for each
 * video made — the video itself, and a still or a cut from it — which is how a four-video Starter
 * month still fills eight slots. The quota used to read N of everything, so a Starter month showed
 * as finished after four posts when eight had been sold.
 *
 * Campaigns stay at N: only a VIDEO is ever run as a paid campaign, never a post or a story.
 */
const smmQuota = (videos: number): PackageDeliverables => ({
  ads: videos, posters: videos, posted: videos * 2, stories: videos * 2, campaigns: videos,
});

/** Networks, by package tier — each tier adds to the one below it. */
const SMM_PLATFORMS = {
  starter: ["Instagram", "Facebook"],
  plus: ["Instagram", "Facebook", "YouTube"],
  pro: ["Instagram", "Facebook", "YouTube", "LinkedIn"],
} as const;

/**
 * The Promotional Ad price list, which Wishes sells too.
 *
 * Wishes used to carry its own two-entry list ("20 Seconds" ₹499, "40 Seconds" ₹999), so a member
 * selling a festival greeting could not offer the 45-second or one-minute video, or the poster, that
 * the same client could buy as a promotional ad. Both categories now read this one list, so a
 * package added here reaches Wishes without anyone having to remember to copy it.
 *
 * The two retired Wishes labels still resolve on sales saved before the change — see
 * LEGACY_PACKAGE_DURATIONS in utils/adRequirement.
 */
export const PROMOTIONAL_PACKAGES: readonly ServicePackage[] = [
  { label: "15 Seconds + Poster", amount: 499 },
  { label: "30 Seconds + Poster", amount: 999 },
  { label: "45 Seconds + Poster", amount: 1499 },
  { label: "1 Minute + Poster", amount: 1999 },
];

/**
 * Packages that have left the price list but still name sales already made.
 *
 * Never offered for a new sale. Read only when an existing sale is opened for editing and its label
 * is no longer listed — a bulk order is priced from its unit price, and without one the order reads
 * ₹0 and cannot be saved, so a member fixing a typo in the brief would first have to re-price it.
 */
export const RETIRED_PACKAGES: Record<string, readonly ServicePackage[]> = {
  wishes: [
    { label: "20 Seconds", amount: 499 },
    { label: "40 Seconds", amount: 999 },
  ],
};

/** True when this label is one of the category's retired packages. */
export function isRetiredPackage(category: string, label?: string | null): boolean {
  return !!label && !!RETIRED_PACKAGES[category]?.some((p) => p.label === label);
}

/** The list price a retired package was sold at, or 0 when the label was never on any list. */
export function retiredPackagePrice(category: string, label?: string | null): number {
  if (!label) return 0;
  return RETIRED_PACKAGES[category]?.find((p) => p.label === label)?.amount ?? 0;
}

export const SERVICE_CATALOG: ServiceCategory[] = [
  {
    key: "promotional",
    label: "Promotional Ad",
    billing: "one_time",
    fromAd: true,
    packages: PROMOTIONAL_PACKAGES.map((p) => ({ ...p })),
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
    // The same packages, at the same prices, as a Promotional Ad. See PROMOTIONAL_PACKAGES.
    packages: PROMOTIONAL_PACKAGES.map((p) => ({ ...p })),
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
    /**
     * Ad creation → social media uploading → digital marketing, for one month. Each package owes a
     * fixed count of each, which the tech side tracks to completion (see types/OrderProgress).
     */
    key: "social_media_management",
    label: "Social Media Management (Monthly)",
    billing: "monthly",
    fromAd: false,
    packages: [
      { label: "Starter Package", amount: 10000, deliverables: smmQuota(4), platforms: [...SMM_PLATFORMS.starter] },
      { label: "Plus Package", amount: 15000, deliverables: smmQuota(6), platforms: [...SMM_PLATFORMS.plus] },
      { label: "Pro Package", amount: 20000, deliverables: smmQuota(8), platforms: [...SMM_PLATFORMS.pro] },
      { label: "Business Package", amount: 25000, deliverables: smmQuota(10), platforms: [...SMM_PLATFORMS.pro] },
      { label: "Ultra Package", amount: 30000, deliverables: smmQuota(12), platforms: [...SMM_PLATFORMS.pro] },
    ],
  },
  {
    /**
     * Several videos of ONE kind bought at once, at a volume discount. The kind is chosen on the
     * sale form — wishes, promotional or cinematic — and the packages and prices are that kind's
     * own, unchanged. There is deliberately no separate bulk price list: a bulk cinematic ad is a
     * cinematic ad, and two price lists for the same thing is how they drift apart.
     */
    key: "bulk_ads",
    label: "Bulk Videos",
    billing: "one_time",
    fromAd: true,
    bulk: true,
    bulkTypes: ["wishes", "promotional", "cinematic"],
    packages: [],
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
  { key: "software", label: "Software", billing: "one_time", fromAd: false, packages: [], needsDescription: true },
  /**
   * Two services the team sells that had no catalogue entry, so they could be neither sold through
   * the form nor counted as a gap on a client's record.
   *
   * Priced per job rather than from a list — like Software above, the member types what was agreed
   * and says what it covers. Give them fixed packages here the day the prices settle; nothing else
   * has to change.
   */
  { key: "banner", label: "Banner Design", billing: "one_time", fromAd: false, packages: [], needsDescription: true },
  { key: "social_accounts", label: "Social Media Accounts", billing: "one_time", fromAd: false, packages: [], needsDescription: true },
  { key: "custom", label: "Custom", billing: "one_time", fromAd: false, packages: [], needsDescription: true },
];

const CATEGORY_BY_KEY: Record<string, ServiceCategory> = Object.fromEntries(
  SERVICE_CATALOG.map((c) => [c.key, c]),
);

/** Ordered category keys — drop-in replacement for the old inline `SALE_CATEGORIES`. */
export const SALE_CATEGORIES: string[] = SERVICE_CATALOG.map((c) => c.key);

/** Category → packages — drop-in replacement for the old inline `PACKAGES`. */
/**
 * The package a new promotional sale opens on.
 *
 * Promotional is what the team sells most and the ₹499 fifteen-second package is the bulk of it,
 * so it is what the form is pre-set to. Named here rather than typed into the sale form, so the
 * default and the catalogue it has to exist in cannot drift apart.
 */
export const DEFAULT_PROMOTIONAL_PACKAGE = "15 Seconds + Poster";

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

/** Sold by quantity, with a volume discount — currently only Bulk Videos. */
export function isBulkCategory(key: string): boolean {
  return CATEGORY_BY_KEY[key]?.bulk === true;
}

/**
 * The kind of video a bulk order is made of, when the category sells other categories in quantity.
 *
 * `"promotional"` is the fallback rather than an arbitrary first choice: every bulk sale recorded
 * before the picker existed WAS a promotional bulk order (the category was literally called "Bulk
 * Ads (Promotional)"), so an old sale with no `bulkAdType` reads correctly instead of needing a
 * migration.
 */
export const DEFAULT_BULK_AD_TYPE = "promotional";

/** The video kinds a bulk category can be made of. Empty for everything else. */
export function bulkTypesFor(key: string): string[] {
  return CATEGORY_BY_KEY[key]?.bulkTypes ?? [];
}

/**
 * The category that actually describes the work: a bulk order resolves to the kind of video it is
 * made of, everything else is itself.
 *
 * This is the single point that keeps `bulk_ads` from leaking into the production side, where
 * durations, prices, penalty rates and delivery promises are all keyed by the three real ad
 * categories and a fourth key silently produces an empty duration and a ₹0 price.
 */
export function effectiveAdCategory(category: string, bulkAdType?: string | null): string {
  if (!isBulkCategory(category)) return category;
  const type = bulkAdType?.trim();
  return type && CATEGORY_BY_KEY[type] ? type : DEFAULT_BULK_AD_TYPE;
}

/** "Bulk Videos — Cinematic Ad", for a queue card that must say both. */
export function bulkCategoryLabel(category: string, bulkAdType?: string | null): string {
  if (!isBulkCategory(category)) return categoryLabel(category);
  return `${categoryLabel(category)} — ${categoryLabel(effectiveAdCategory(category, bulkAdType))}`;
}

/** What a sale is, as far as anything downstream of the sale is concerned. */
export interface SaleShape {
  category: string;
  /** Which kind of video a bulk order is made of. */
  bulkAdType?: string | null;
  /** The real service a Custom sale is a variation of — see `productionCategory`. */
  customBaseCategory?: string | null;
}

/**
 * The catalogue key the production side should actually work from.
 *
 * Two categories exist for the sales member's convenience rather than to describe work:
 *
 *  - **Bulk Videos** is N of one of the three ad kinds, and resolves to that kind.
 *  - **Custom** is "the client asked for something not on the list", which in practice is almost
 *    always a listed service at a length the list does not carry — a two-minute promotional ad,
 *    a wishes video of an unusual length. Before this, that sale went through as the literal
 *    category `custom` with the details in a free-text note, and the tech team got an order with
 *    no duration, no clip count, no price per clip and no delivery deadline. Somebody read the
 *    note and re-typed all of it by hand.
 *
 * Naming the base service on the sale is what lets every rule keyed on a category — clip counts,
 * per-clip pricing, delivery presets, penalties, the ad brief — apply to it unchanged.
 *
 * A Custom sale with no base named stays `custom`, exactly as it behaves today.
 */
export function productionCategory(sale: SaleShape): string {
  if (isBulkCategory(sale.category)) return effectiveAdCategory(sale.category, sale.bulkAdType);
  if (sale.category === "custom") {
    const base = sale.customBaseCategory?.trim();
    return base && CATEGORY_BY_KEY[base] ? base : sale.category;
  }
  return sale.category;
}

/**
 * Which services a Custom sale can be built on.
 *
 * The three ad kinds, because those are the ones with a length to vary. Everything else on the
 * list is bought as a thing rather than as a duration, so offering "Custom → Logo Design, 2
 * minutes" would be nonsense; a non-standard logo is a Custom sale with a description and a price,
 * which is what Custom already did well.
 */
export const CUSTOM_BASE_CATEGORIES = ["promotional", "cinematic", "wishes"];

/** "Custom — Promotional Ad · 2:00", for a queue card that has to say what it really is. */
export function customSaleLabel(sale: SaleShape & { customDurationSeconds?: number | null }): string {
  if (sale.category !== "custom") return bulkCategoryLabel(sale.category, sale.bulkAdType);
  const base = productionCategory(sale);
  if (base === "custom") return categoryLabel("custom");
  const secs = sale.customDurationSeconds;
  const length = secs ? ` · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : "";
  return `${categoryLabel("custom")} — ${categoryLabel(base)}${length}`;
}

/** Has no package list, so the member has to type what was actually sold (Custom, Software). */
export function needsDescription(key: string): boolean {
  return CATEGORY_BY_KEY[key]?.needsDescription === true;
}

export function findPackage(categoryKey: string, packageLabel: string): ServicePackage | undefined {
  return CATEGORY_BY_KEY[categoryKey]?.packages.find((p) => p.label === packageLabel);
}

/** The monthly quota a package owes, when it owes one. */
export function packageDeliverables(
  categoryKey: string,
  packageLabel: string,
): PackageDeliverables | undefined {
  return findPackage(categoryKey, packageLabel)?.deliverables;
}

/** The networks a package covers. Empty for everything that is not a social-media month. */
export function packagePlatforms(categoryKey: string, packageLabel?: string | null): string[] {
  if (!packageLabel) return [];
  return findPackage(categoryKey, packageLabel)?.platforms || [];
}

/**
 * "Pro Package — ₹20,000 (8 videos · 8 posters · 16 posts · 16 stories · 8 run) · Instagram + Facebook + YouTube + LinkedIn".
 *
 * The quota AND the networks are in the option text because the sales member is quoting both on a
 * live call — having to remember that Pro means sixteen posts but only eight videos, and that it
 * is the first tier with LinkedIn, is how a client gets promised the wrong month.
 */
export function packageOptionLabel(pkg: ServicePackage): string {
  const price = pkg.amount > 0 ? ` — ₹${pkg.amount.toLocaleString("en-IN")}` : "";
  const quota = pkg.deliverables ? ` (${deliverablesSummary(pkg.deliverables)})` : "";
  const where = pkg.platforms?.length ? ` · ${pkg.platforms.join(" + ")}` : "";
  return `${pkg.label}${price}${quota}${where}`;
}

/**
 * "8 videos · 8 posters · 16 posts · 16 stories · 8 run" — one line for a quota.
 *
 * A zero is dropped rather than printed: a bulk order owes no stories, and "0 stories" on its card
 * reads as work that is outstanding rather than work nobody bought.
 */
export function deliverablesSummary(d: PackageDeliverables): string {
  return [
    [d.ads, "videos"], [d.posters, "posters"], [d.posted, "posts"],
    [d.stories, "stories"], [d.campaigns, "run"],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, word]) => `${n} ${word}`)
    .join(" · ");
}

/**
 * Foundational "has it or not" services that drive the upsell gap checklist. Repeatable services
 * (ads, single campaigns) are excluded — a client can always buy more of those, so they aren't "gaps".
 */
/**
 * What the business actually sets out to sell a business customer, in the order it pitches them.
 *
 * This is the checklist a seller works down on an upsell call — not the whole catalogue, which
 * also contains the ad formats and the bulk/custom wrappers that are not a "thing a shop needs".
 */
export const GAP_ELIGIBLE_CATEGORIES = [
  "logo", "visiting_card", "banner", "poster", "google_listing",
  "social_accounts", "social_media_management", "website", "software",
];

/**
 * Services a customer only ever needs once.
 *
 * A shop has one logo and one website; having sold them, suggesting them again is noise that makes
 * the whole checklist less trusted. Everything NOT listed here — banners, posters, the monthly
 * social package — is bought over and over, so owning one is no reason to stop offering the next.
 *
 * Note the difference between "not a gap" and "not sellable": a client who dislikes their logo can
 * absolutely buy another, and the form will always let them. This list only decides what the
 * checklist nags about.
 */
export const ONE_TIME_SERVICES = new Set([
  "logo", "visiting_card", "google_listing", "social_accounts", "website", "software",
]);

/** Is this something worth offering again once they have bought it? */
export function isRepeatableService(key: string): boolean {
  return !ONE_TIME_SERVICES.has(key);
}

/** Catalog entries a client doesn't yet own — the upsell opportunities. */
export function gapCategories(ownedKeys: string[]): ServiceCategory[] {
  const owned = new Set(ownedKeys);
  return GAP_ELIGIBLE_CATEGORIES
    .filter((k) => !owned.has(k))
    .map((k) => CATEGORY_BY_KEY[k])
    .filter(Boolean);
}

/** What a client already has, from the offering — the other half of the same picture. */
export function ownedServices(ownedKeys: string[]): ServiceCategory[] {
  const owned = new Set(ownedKeys);
  return GAP_ELIGIBLE_CATEGORIES
    .filter((k) => owned.has(k))
    .map((k) => CATEGORY_BY_KEY[k])
    .filter(Boolean);
}

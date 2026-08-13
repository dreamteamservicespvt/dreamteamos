import type { DiscountApproval, EarnedDiscount } from "@/utils/saleDiscount";
import type { ClientReview } from "@/types/orderChat";

export type UserRole =
  | "main_admin"
  | "tech_admin"
  | "sales_admin"
  | "accounts_admin"
  | "tech_member"
  | "sales_member"
  | "tech_team_leader";

export interface AppUser {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  createdBy: string;
  isActive: boolean;
  /**
   * Gross monthly salary. Mirrored from the assigned salary package so every existing screen
   * that reads `user.salary` keeps working — see services/payroll.assignSalaryPackage.
   */
  salary: number;
  /** Salary package this employee is on (`salary_packages/{id}`). Absent for unassigned staff. */
  salaryPackageId?: string;
  /**
   * The sales target, and the only one that is set. Everything else is derived from it — the
   * monthly figure is this across the pay cycle. See utils/salesTargets.
   */
  dailyTarget?: number;
  /**
   * @deprecated Derived now, not stored. Read through `monthlyTargetOf` instead.
   *
   * Still typed because live records written before the form was simplified carry it, and
   * `dailyTargetOf` reads it once to recover the daily figure it implied. Nothing writes it.
   */
  monthlyTarget?: number;
  /**
   * @deprecated Never read. Do not reintroduce.
   *
   * The original single target field, and the reason this needed cleaning up: the sales-admin
   * dashboard read it as a DAILY figure while the member's own dashboard read the very same field
   * as a MONTHLY one, so one record showed a member two different targets depending on who opened
   * it. There is no safe reading of it, so it has none.
   */
  target?: number;
  googleDriveBaseUrl?: string;
  phone: string;
  /**
   * The WhatsApp Business number a sales member actually sells on — not `phone`, which is their
   * personal one and belongs to HR.
   *
   * It exists because of what happens at the end of a delivered ad: the client is offered a button
   * to ask about another one, and that enquiry has to land with the person who sold them the first
   * one, on the number they already know. Sellers work different numbers, so a single company line
   * would hand every warm follow-up to whoever happens to be watching it.
   *
   * Settable by the member (My Profile) and by their sales admin (My Team) — they own the number,
   * the admin needs to be able to fix it the day it changes and they are on a call.
   */
  businessWhatsapp?: string | null;
  /**
   * Profile photo (a Cloudinary URL). Shown wherever this person appears — chat, calls, team lists,
   * the leaderboard, workload cards and their own topbar — so one upload changes all of them.
   */
  avatar?: string;
  /**
   * `yyyy-MM-dd`, mirrored from the HR record's KYC section (services/hr.saveEmployeeProfile).
   *
   * The HR record itself holds PAN, Aadhaar and addresses and is readable only by its owner and
   * their admin. The birthday is the one field the whole team needs, so it — and nothing else —
   * is copied here, where every screen already has it.
   */
  dob?: string | null;
  earningsOption?: "stipend_plus_5" | "incentive_10";
  /** Employment type — set/updated by Tech Admin or Tech Team Lead. Defaults to full_time when unset. */
  employmentType?: "full_time" | "part_time";
  /**
   * An "external creator" is not a team member — an outside person given access to the platform
   * only to generate their own business ads. They have no salary, no attendance, and appear in no
   * team list, report, dashboard or workload; they live only in My Team (so the admin can manage
   * their access) and see only the ad-creation tool. Their created ads are visible to the tech
   * admin as history. A tech_member with this flag is excluded everywhere a "team member" is meant.
   */
  externalCreator?: boolean;
  /**
   * Company employee ID (e.g. DTS-014), assigned by the Tech Admin from the Payroll page.
   * Purely a human-facing identifier for payslips and records — the uid remains the real key.
   */
  employeeId?: string;
  /**
   * The signatory's own signature, uploaded once from their settings and reused on every HR
   * document their department issues (tech admin signs technical papers, sales head signs sales
   * ones — see utils/hrPolicy.SIGNATORY_ROLE).
   *
   * Deliberately on the user doc rather than in its own collection: half the app already
   * subscribes to `users`, so the image a generated letter needs is in memory the moment it is
   * needed, with no extra read and no loading state on a document preview. It is a signature
   * image, not a secret — unlike a password, which is exactly why that lives elsewhere.
   */
  signatureUrl?: string | null;
  signatureUpdatedAt?: any;
  /** Printed under the signature on issued documents, e.g. "Technical Head". */
  designation?: string;
  createdAt: any;
  updatedAt: any;
}

// Work Assignment System
export type WorkAssignmentStatus = "assigned" | "in_progress" | "completed" | "verified" | "editing";

export interface WorkAssignmentSession {
  openedAt: any;
  closedAt?: any | null;
  durationSeconds?: number | null;
}

export interface WorkAssignment {
  id: string;
  assignedTo: string;
  assignedBy: string;
  assignedAt: any;
  assignedAtIso?: string;
  /**
   * The catalog key of what is being made. Was the three ad types only; social-media months and
   * bulk ads are now assigned the same way, so they appear here too.
   */
  category: "wishes" | "promotional" | "cinematic" | "bulk_ads" | "social_media_management";
  clipCount: number;
  includesEndCredits: boolean;
  duration: string;
  pricePerUnit: number;
  totalPrice: number;
  uniqueId: string;
  accessCode: string;
  businessName?: string;
  businessWhatsapp?: string;
  displayTitle: string;
  status: WorkAssignmentStatus;
  sessions: WorkAssignmentSession[];
  totalDurationSeconds: number;
  completedAt?: any;
  verifiedAt?: any;
  verifiedBy?: string;
  date: string;
  completedDate?: string;
  clientName?: string;
  savedGenerationId?: string;
  // Delivery promise / turnaround SLA, carried from the originating sale → order
  promise?: PromiseDeadline;
  // Link back to the originating Order (set when assigned from the Orders queue)
  orderId?: string;
  /**
   * The client chat this job belongs to — the ORDER's id for work that came from a sale.
   *
   * Written at assignment time so the job attaches to the room the sales member has already been
   * using since the sale, instead of opening an empty second one. Absent on direct Work Assign
   * jobs and on every assignment made before this existed, both of which keep using their own id.
   * Always read it through `utils/orderChatId.orderChatIdOf`, never directly.
   */
  chatId?: string | null;
  /**
   * Which parts of a multi-deliverable order this member owns (social media month / bulk ads).
   * A member holding two tracks gets ONE assignment listing both, not two cards to keep straight.
   * Absent on ordinary single-ad work, which has no tracks to divide.
   */
  tracks?: OrderTrack[];
  // Ad specification set by the admin/team leader at assignment time — pre-fills and locks
  // the matching field in the assigned member's AI Platform tool (see AIPlatformApp.tsx).
  modelGender?: "male" | "female";
  attireType?: "professional" | "traditional" | "shirt_pant" | "custom";
  customAttire?: string;
  aspectRatio?: "9:16" | "16:9";
  language?: string;
  /**
   * The occasion a wishes video is for, carried from the sale. Pre-fills and locks the AI
   * Platform's festival picker, which themes the entire ad from it — the member never has to
   * guess, and can never quietly build a Diwali ad for a Ugadi sale.
   */
  festival?: string;
  /** Free-text brief from the client, carried through from the sale. */
  requirementNotes?: string;
  /**
   * Special-category cartoon duo (a services/characterPacks id) sold for this job. Carried from the
   * sale so the member's AI Platform opens on the right treatment instead of them having to know.
   */
  characterPack?: string;
  /** Whether the client supplied real photos of their premises for that special-category ad. */
  realLocationProvided?: boolean;
  /**
   * The sales member deleted the sale behind this work after it was already assigned. The work
   * itself is left alone — the tech team must be told, not silently have a job vanish mid-flight.
   */
  saleDeleted?: boolean;
  saleDeletedByName?: string | null;
  saleDeletedAt?: any;
}

export type LeadStatus = "not_called" | "answered" | "not_answered" | "call_later" | "not_interested";

export interface Lead {
  id: string;
  assignedTo: string;
  assignedBy: string;
  phone: string;
  displayName: string;
  realName?: string | null;
  status: LeadStatus;
  notes: string;
  saleDone: boolean;
  saleDetails?: SaleDetail | null;
  saleItems?: SaleDetail[];
  isCustomEntry?: boolean;
  // Number-lock: set when this number is taken over by another member after the 24h window
  frozen?: boolean;
  frozenAt?: any;
  frozenReason?: string;   // "taken_over"
  takenOverBy?: string;    // display name of the new owner
  // Sale-freeze mirror (canonical lock lives in numberLocks; mirrored here so the member's
  // own list and the admin's Frozen Numbers tab can render without extra cross-collection reads)
  saleFrozen?: boolean;
  saleFrozenAt?: any;          // when the freeze was (re)applied
  saleFrozenUntil?: any;       // freeze end time
  saleFrozenDays?: number;     // chosen freeze length (1–7)
  saleFrozenByName?: string;   // who froze it (member or admin name)
  // Admin marked this number's competing sales as legitimate SEPARATE sales (not a dispute).
  // Excludes the lead from duplicate detection on both the member and admin sides.
  duplicateCleared?: boolean;
  lastUpdated: any;
  createdAt: any;
}

// ─── Number Lock / Reservation System ───
// One doc per real phone number in the `numberLocks` collection (doc id = digits-only phone).
// Reserves a number to whoever added it for 24h, allows takeover after, and freezes sold clients.
export type NumberLockAction = "claimed" | "taken_over" | "sold" | "admin_override";

export interface NumberLockTimelineEntry {
  action: NumberLockAction;
  byId: string;
  byName: string;
  at: any;                 // Timestamp.now() — serverTimestamp() is not allowed inside arrays
  note?: string;
  freezeDays?: number;     // for "sold" entries
}

export interface NumberLock {
  phone: string;           // normalized "+91..."
  ownerId: string;         // current owner uid
  ownerName: string;
  ownerLeadId: string;     // current owner's lead doc id (so takeover can freeze it)
  claimedAt: any;
  reserveExpiresAt: any;   // claimedAt + 24h
  saleFrozen: boolean;
  saleFrozenUntil: any | null;  // sale time + N days
  saleById: string | null;
  saleByName: string | null;
  timeline: NumberLockTimelineEntry[];
  updatedAt: any;
}

/** One payment actually received against a sale — the advance, then whatever settles it. */
export interface SalePayment {
  /** Stable within the sale, so a row can be keyed and a duplicate collection spotted. */
  id: string;
  amount: number;
  /** When the money was taken. The day this falls on is the day it counts as revenue. */
  collectedAt: any;
  /** "Advance at sale" / "Balance on delivery" / whatever the member typed. */
  note?: string | null;
  /** Proof of this instalment, kept per payment rather than per sale. */
  screenshotUrl?: string | null;
  byId?: string;
  byName?: string;
}

export interface SaleDetail {
  category: string;
  packageKey: string;
  /**
   * What was actually sold, in the member's own words. Only meaningful for categories with no
   * fixed package list (Custom, Software) — for everything else the packageKey already says it.
   */
  customDescription?: string | null;
  /**
   * Final money for this sale line — what the client AGREED to pay. For a bulk order this is
   * already the discounted total. NEVER includes penalties — see `penaltyTotal`.
   *
   * This is the contract value, not the cash received. When only part of it has been collected,
   * `payments` says how much is actually in hand — see utils/salePayments.
   */
  amount: number;
  // ── Money actually received ────────────────────────────────────────────────
  /**
   * The client paid only part of the price up front.
   *
   * Standard on a social-media month: half at the sale, the rest once the first post is made,
   * posted and the campaign is running. It also happens on ordinary ads, which the form used to
   * refuse to record — so a member who took ₹500 of a ₹999 ad had to either log the full amount
   * (inflating their revenue and their commission on money nobody had) or not log the sale at all.
   */
  partialPayment?: boolean;
  /**
   * Every payment received against this sale, in the order collected.
   *
   * ── Why a list rather than a "collected so far" number ────────────────────────────────────────
   * A running total cannot say WHEN the money arrived, and the day it arrived is the whole point:
   * the member's revenue and their commission belong to the day they collected, not to the day the
   * sale was first written down. A member who takes ₹500 today and ₹499 next month has earned on
   * two different days, in two different pay cycles, and a single field flattens that into one.
   *
   * Absent means the sale was paid in full when it was made — which is every sale recorded before
   * this existed, and most sales since. Nothing has to be backfilled: `utils/salePayments` reads a
   * missing list as one payment of the full amount on the sale date.
   */
  payments?: SalePayment[] | null;
  // ── Bulk videos (quantity × package, with a volume discount) ───────────────
  /** How many videos were sold on this line. Absent (or 1) for an ordinary single-ad sale. */
  quantity?: number;
  /**
   * Which kind of video a bulk order is made of — wishes, promotional or cinematic. Only set on a
   * bulk sale; absent on one recorded before the picker existed, which always meant promotional
   * (see utils/serviceCatalog.effectiveAdCategory).
   */
  bulkAdType?: string;
  /** Per-video price before any discount — kept so the discount stays auditable after the fact. */
  unitAmount?: number;
  /** What the volume ladder offered at this quantity. */
  suggestedDiscountPercent?: number;
  /** Whether the member gave the discount as a percentage or as a flat rupee figure. */
  discountMode?: "percent" | "amount";
  /** The discount in rupees. Always stored, whichever unit was typed. */
  discountAmount?: number;
  /** What was actually applied. May be 0 — the discount is the member's to give or withhold. */
  discountPercent?: number;
  /**
   * The member overrode the suggested discount. Surfaced to the tech admin and the sales admin,
   * who are the two people entitled to ask why the price moved.
   */
  discountEdited?: boolean;
  // ── Earned discount (a Google review, a referral, or both) ─────────────────
  /**
   * What the client did to earn a discount, with the screenshot proving each claim. Worth 10% for
   * either or both — see utils/saleDiscount for why it does not stack to 20%.
   */
  earnedDiscount?: EarnedDiscount | null;
  /** Rupees taken off for the earned discount, kept separate from the negotiated one. */
  earnedDiscountAmount?: number;
  // ── Over the member's own authority ────────────────────────────────────────
  /**
   * Everything off this line came to more than a member may give alone (10%), so the sales admin
   * has to agree the price before the tech team ever sees it.
   */
  discountNeedsApproval?: boolean;
  discountApproval?: DiscountApproval | null;
  discountApprovedBy?: string | null;
  discountApprovedAt?: any;
  discountRejectionReason?: string | null;
  // ── Custom: a listed service at a length the price list does not carry ─────
  /**
   * The real service a Custom sale is a variation of — a two-minute promotional ad is
   * `category: "custom"` with `customBaseCategory: "promotional"`. Without it the tech team gets
   * an order with no duration, no clip count and no deadline. See utils/serviceCatalog.
   */
  customBaseCategory?: string | null;
  /** How long that custom video is, in seconds. Drives clips, poster, price and the SLA. */
  customDurationSeconds?: number | null;
  // ── Penalty (changes beyond what was committed) ────────────────────────────
  /**
   * Mirror of the order's penalty total, so the sales member's own screens can show it without a
   * second read. Deliberately NOT added into `amount`: a penalty is not the member's revenue and
   * must never reach their commission. The canonical list lives on the order.
   */
  penaltyTotal?: number;
  penaltyClips?: number;
  verificationStatus: "pending" | "verified" | "rejected";
  paymentScreenshotUrl?: string | null;
  submittedAt?: any;        // when the member recorded the sale
  verifiedAt?: any;         // when the admin approved it
  /**
   * When the admin rejected it. Kept separate from `verifiedAt` — which is cleared on rejection —
   * because the approvals queue filters "what did I decide yesterday" on the decision's own stamp,
   * and a rejection with no stamp of its own could only be dated by the lead's last edit.
   */
  rejectedAt?: any;
  // Duplicate-sale dispute proof — required when another member already sold this number
  disputed?: boolean;       // recorded on a number already sold by another member
  proofImageUrl?: string | null;  // call-record / proof screenshot
  proofNote?: string | null;      // text-note proof
  // Delivery promise / turnaround SLA chosen by the sales member at sale time
  promise?: PromiseDeadline;
  // The client's ad brief, captured by the sales member at sale time (ad categories only).
  requirement?: AdRequirement | null;
  // Edit trail — set the first time the sales member changes a sale after adding it.
  editedAt?: any;
  editLog?: SaleEditEntry[];
}

/** One recorded edit of a sale, so a change is visible and accountable rather than silent. */
export interface SaleEditEntry {
  at: any;
  byName: string;
  /** Human-readable field changes, e.g. "Package: 30 Seconds → 45 Seconds". */
  changes: string[];
}

// ─── Ad requirement (the client's brief, captured once at sale time) ───
// The sales member is the only person who ever speaks to the client, so the spec is captured
// there and travels sale → order → work assignment untouched. Category and duration are NOT
// part of it: both are derived from what was actually sold.
export interface AdRequirement {
  businessName?: string;
  businessWhatsapp?: string;
  language?: string;                 // free text — the dropdown remembers custom entries
  modelGender?: "male" | "female";
  attireType?: "professional" | "traditional" | "shirt_pant" | "custom";
  customAttire?: string;
  aspectRatio?: "9:16" | "16:9";
  notes?: string;                    // anything else the client asked for
  /**
   * Which occasion a WISHES video is for — "Diwali", "Ganesh Chaturthi", or anything the client
   * named that isn't on the list. Meaningless for the other categories, so it is only collected
   * and only shown for wishes.
   *
   * It is the single most important fact about a greeting video: the generator themes the whole
   * ad from it (services/prompts.getFestivalTheme). Captured on the call, where the client says
   * it, rather than guessed by the tech member days later.
   */
  festival?: string;
  /**
   * Special-category treatment: the id of a cartoon duo from services/characterPacks (e.g.
   * "motu_patlu"). Absent means a normal ad fronted by a human model. When it IS set the model and
   * attire above are moot — the cast is the duo — so the sales form stops asking for them.
   */
  specialCategory?: string;
  /**
   * Special-category ads only. True when the client is sending photographs of their own premises
   * (the tech member must upload them), false when the tech team builds the location from the
   * business profile. Meaningless without `specialCategory`, so it is only stored alongside it.
   */
  realLocationProvided?: boolean;
}

// ─── Delivery Promise / Turnaround SLA ───
// The sales member promises the client a delivery time at sale time (e.g. promotional 24h,
// website 5 days). The countdown starts at sale; the tech team sees it and is alerted near/overdue.
export type PromiseDeadlineSource = "preset" | "custom";

export interface PromiseDeadline {
  presetKey: string;   // e.g. "promotional_24h" | "custom"
  label: string;       // human label, e.g. "24 hours"
  hours: number;       // turnaround length in hours
  source: PromiseDeadlineSource;
  startAt: any;        // Timestamp at SALE time — the countdown anchor
  dueAt: any;          // startAt + hours, precomputed for cheap compares/queries
}

// ─── Multi-deliverable progress (Social Media Monthly & Bulk Ads) ───
// Most orders are one ad: assigned, made, done. These two are not — a Pro social-media month is 8
// ads, 8 posters, 8 uploads and 8 campaigns, and a bulk order is N ads. "Assigned" says nothing
// useful about either, so the order carries what is still outstanding.
//
// It lives on the ORDER rather than in its own collection because the tech admin, the team leader
// and every assigned member already subscribe to orders. A separate collection would mean a second
// read on every one of those screens.

/** The three jobs a social-media month splits into. Bulk orders only ever use `ad_creation`. */
export type OrderTrack = "ad_creation" | "social_upload" | "digital_marketing";

export const ORDER_TRACKS: { key: OrderTrack; label: string }[] = [
  { key: "ad_creation", label: "Ad creation" },
  { key: "social_upload", label: "Social media uploading" },
  { key: "digital_marketing", label: "Digital marketing" },
];

/** The four things counted. `campaigns` is "ads run" — the digital-marketing side. */
export interface OrderProgressCounts {
  ads: number;
  posters: number;
  posted: number;
  campaigns: number;
}

export type OrderProgressField = keyof OrderProgressCounts;

export interface OrderTrackAssignee {
  uid: string;
  name: string;
}

/** One recorded change, so a counter that jumped is answerable to a person. */
export interface OrderProgressEntry {
  at: any;
  byName: string;
  /** A counter change, or a track being marked done. */
  field: OrderProgressField | OrderTrack;
  from: number | null;
  to: number | null;
}

/** Where one video of a bulk order has got to. */
export type BulkVideoStatus = "pending" | "assigned" | "completed";

/**
 * One video inside a bulk order.
 *
 * Deliberately small: it is the video's NUMBER, who is making it, and whether it is done. Anything
 * else about the job — the brief, the language, the client — belongs to the order and is the same
 * for all ten, so copying it onto every slot would be ten places for it to disagree.
 */
export interface BulkVideoSlot {
  /**
   * 1-based position in the order — "Video 3 of 10". Assigned once and never renumbered, so a
   * member told "you have 3, 4 and 7" still has 3, 4 and 7 tomorrow.
   */
  n: number;
  status: BulkVideoStatus;
  assignedTo?: string | null;
  assignedToName?: string | null;
  assignedAt?: any;
  completedAt?: any;
  completedByName?: string | null;
  /** What this particular video is, when the client named them — "Diwali offer", "Shop tour". */
  title?: string | null;
}

export interface OrderProgress {
  kind: "smm" | "bulk";
  targets: OrderProgressCounts;
  done: OrderProgressCounts;
  /**
   * Who owns each job. One member can hold all three, or three members can hold one each —
   * whichever the team leader chooses at assignment time.
   */
  tracks: Partial<Record<OrderTrack, OrderTrackAssignee>>;
  /** Tracks someone has marked finished. Visible to everyone on the order, not just its owner. */
  completedTracks: OrderTrack[];
  log: OrderProgressEntry[];
  completedAt?: any | null;
}

// ─── Penalty (changes beyond what was committed) ───
// Charged when the client asks for changes past the agreed brief, or after the ad is already made.
// Recorded on the order by either the sales member or the tech admin.
export type PenaltyClipType = "promotional" | "wishes" | "cinematic";

export interface PenaltyEntry {
  id: string;
  clips: number;
  /** Editable — the standard rate is a default, not a rule. */
  ratePerClip: number;
  /** clips × ratePerClip, stored so a later rate change never rewrites history. */
  amount: number;
  clipType: PenaltyClipType;
  reason?: string | null;
  byId: string;
  byName: string;
  byRole: UserRole;
  at: any;
}

// ─── Orders (sales → tech delivery queue) ───
// Created when a sales admin VERIFIES a sale. Replaces the manual WhatsApp "sale" label:
// the tech team picks orders from this queue and assigns them as work_assignments.
// "deleted" is a permanent tombstone — an admin purged the order from the queue and it must never
// be recreated by a later re-verify of the same sale (unlike "cancelled", which reactivates).
export type OrderStatus = "unassigned" | "assigned" | "completed" | "verified" | "cancelled" | "deleted";

export interface Order {
  id: string;
  // Client identity (normalized phone is the join key end-to-end)
  clientPhone: string;          // "+91..."
  clientPhoneId: string;        // digits-only (phoneLockId) — also the Client doc id
  businessName: string;         // the business this ad is FOR (from the sale's requirement)
  clientName?: string;          // the client who bought it — one client can have many businesses
  category: string;             // original sales category (richer than WorkAssignment.category)
  packageKey: string;
  /** What was sold, when the category has no fixed package list. Carried from the sale. */
  customDescription?: string | null;
  amount: number;               // sale amount (already discounted; never includes penalties)
  // Bulk videos — carried from the sale so the tech side knows it is N videos, not one, and
  // which kind of video they are (the category alone only says "bulk").
  quantity?: number;
  bulkAdType?: string | null;
  unitAmount?: number;
  suggestedDiscountPercent?: number;
  discountMode?: "percent" | "amount" | null;
  discountAmount?: number | null;
  discountPercent?: number;
  discountEdited?: boolean;
  /** What the client earned, and the rupee value of it. Mirrored from the sale for the tech card. */
  earnedDiscount?: EarnedDiscount | null;
  earnedDiscountAmount?: number | null;
  /**
   * The real service a Custom order is a longer version of, and how long. `productionCategory`
   * and `durationForSale` read these, which is what makes a two-minute promotional ad arrive as
   * fifteen clips with a price and a deadline instead of a free-text note.
   */
  customBaseCategory?: string | null;
  customDurationSeconds?: number | null;
  /**
   * What is still outstanding on a multi-deliverable order (social media month / bulk ads).
   * Absent on ordinary single-ad orders, which are done when their one assignment is done.
   */
  progress?: OrderProgress | null;
  /**
   * A bulk order's videos, one entry each, each with its own owner and its own status.
   *
   * ── Why a list and not just a count ───────────────────────────────────────────────────────────
   * `progress` answers "how many of the ten are done" — enough for a social-media month, where the
   * eight ads are interchangeable. A bulk order is not like that: ten videos get shared out across
   * the team, and the questions that actually get asked are "who has video 6", "which three are
   * left" and "has Kiran finished hers". A single counter cannot answer any of them, so the team
   * kept that list on paper, and a video with nobody on it was only discovered at the deadline.
   *
   * Absent on orders created before this existed — `utils/bulkVideos` builds the list on demand
   * from the quantity, so every bulk order already in the queue shows up with no migration.
   */
  bulkVideos?: BulkVideoSlot[] | null;
  /**
   * Penalties charged on this order. Canonical here — the sale carries only a mirrored total,
   * because either side can add one and the order is the doc both sides can write.
   */
  penalties?: PenaltyEntry[];
  penaltyTotal?: number;
  penaltyClips?: number;
  // Link back to the originating sale
  leadId: string;
  saleItemIndex: number;
  saleItemKey: string;          // `${leadId}__${index}` — idempotency key
  saleSubmittedAtMs: number;    // stable reconciliation key (survives saleItems splice)
  // Attribution
  soldBy: string;               // sales member uid
  soldByName: string;
  fromAd: boolean;              // ad categories (wishes/promotional/cinematic)
  salesAdminId: string;         // verifying sales admin
  // SLA
  promise: PromiseDeadline | null;
  // The client's ad brief from the sale — pre-fills New Assignment so tech never re-types it.
  requirement?: AdRequirement | null;
  // Whether the source sale has been approved by a sales admin yet. Orders now reach the tech
  // queue at sale time (approval is not a gate), so the tech team can see which are still pending.
  saleVerified?: boolean;
  // Post-assignment update notes from the sales member — the only way to change an order once
  // work has started (editing/deleting is locked). Surfaced to the assigned member and tech admin.
  updateNotes?: OrderUpdateNote[];
  // Set when the cleanup sweep retired this order because matching work was already done manually.
  reconciledManually?: boolean;
  retiredAt?: any | null;
  retiredBy?: string | null;
  retiredByName?: string | null;
  // Permanently deleted by an admin — a tombstone that blocks the sale from recreating the order.
  // An order can leave the queue in one click, so WHO decided that is part of the record: the sale
  // survives its order, and a paid-for job with nothing to deliver has to be answerable to someone.
  deleted?: boolean;
  deletedAt?: any | null;
  deletedBy?: string | null;
  deletedByName?: string | null;
  // Put back in the queue after a delete or a cleanup sweep. Also stops the sweep re-claiming it:
  // a human has said this order is real, so "already done by hand" must not overrule them again.
  restoredAt?: any | null;
  restoredBy?: string | null;
  restoredByName?: string | null;
  /**
   * What the customer said about the delivered ad, mirrored from their chat.
   *
   * Mirrored rather than joined because the Delivered tab is a bounded, on-demand history page —
   * fetching a chat document per row to read two numbers would cost more reads than the history
   * itself. The canonical copy is on `order_chats/{assignmentId}`, which is where the customer
   * writes and edits it; see api/order-chat.ts.
   */
  clientReview?: ClientReview | null;
  // Lifecycle
  status: OrderStatus;
  workAssignmentId?: string | null;
  assignedTo?: string | null;
  assignedToName?: string | null;
  techAdminId?: string | null;
  lastDeadlineNotifiedAt?: any | null;
  createdAt: any;
  updatedAt: any;
  completedAt?: any | null;
  verifiedAt?: any | null;
  deliveredAmount?: number | null;
}

/** A note the sales member sends the tech team after an order is assigned (work already started). */
export interface OrderUpdateNote {
  at: any;
  byName: string;
  text: string;
}

// ─── Clients (single customer view) ───
// Upserted when tech VERIFIES delivered work. Doc id = phoneLockId (one client per phone number).
export interface ClientWorkItem {
  orderId: string;
  workAssignmentId?: string | null;
  category: string;
  packageKey?: string;
  title: string;
  billing?: "one_time" | "monthly";
  // Attribution
  soldBy: string;
  soldByName: string;
  saleAmount: number;
  fromAd: boolean;
  deliveredBy?: string | null;
  deliveredByName?: string | null;
  deliveredAmount?: number | null;
  deliveredAt: any;
}

export interface ClientSocialLink {
  platform: string;
  url: string;
}

/** One delivered ad, as the customer rated it from their own chat. */
export interface ClientWorkReview {
  /** The work assignment — also the chat's id, and what makes an edit an edit. */
  assignmentId: string;
  orderId?: string | null;
  uniqueId?: string | null;
  /** The ad itself, 1–5. */
  work: number;
  /** Being dealt with, 1–5. */
  service: number;
  comment?: string | null;
  soldBy?: string | null;
  soldByName?: string | null;
  deliveredBy?: string | null;
  deliveredByName?: string | null;
  at: any;
}

export interface Client {
  phone: string;                // "+91..."
  phoneId: string;              // doc id (phoneLockId)
  name: string;
  businessCategory?: string;
  email?: string | null;
  // Profile assets (admins fill these — the gap checklist drives the later upsell phase)
  logoUrl?: string | null;
  visitingCardUrl?: string | null;
  googleBusinessUrl?: string | null;
  websiteUrl?: string | null;
  socialMedia?: ClientSocialLink[] | null;
  // What we sold & delivered
  works: ClientWorkItem[];
  totalSaleAmount: number;
  totalDeliveredAmount: number;
  workCount: number;
  /**
   * What this customer said about each ad they were delivered, newest last.
   *
   * Written by the server when they submit or edit a review in their chat (api/order-chat.ts), one
   * entry per assignment — an edit replaces its entry rather than appending another opinion.
   *
   * It lives here because this is the page somebody opens before ringing a client about their next
   * ad, and "they gave us two stars in June" is the single most useful thing to know first.
   */
  reviews?: ClientWorkReview[];
  // Scoping / attribution
  salesAdminIds: string[];      // admins whose teams sold to this client (for scoped reads)
  /**
   * Every sales member who has sold to this client.
   *
   * The field a sales member's own Clients list is queried on (`array-contains`), so it has to be
   * an array rather than a single owner: two members selling to the same business at different
   * times both keep the customer, and both see anything either of them learns about them.
   *
   * Written from the ORDER's `soldBy`, never from the assignment — see `upsertClientOnWorkComplete`
   * for the bug that distinction fixes.
   */
  soldByIds?: string[];
  firstSoldBy: string;
  // DTS-US review / loyalty workflow (mirrored summary; the working copy is in review_tasks)
  reviewTaskId?: string | null;
  reviewStatus?: ReviewTaskStatus | null;
  reviewAssignedTo?: string | null;
  reviewAssignedToName?: string | null;
  loyaltyDiscountPercent?: number;   // 10 once a 5★ review is verified
  feedbackVideoUrl?: string | null;
  createdAt: any;
  updatedAt: any;
}

// ─── DTS-US review / feedback workflow ───
// A sales member is assigned to collect a 5★ Google review (→ 10% loyalty discount, screenshot
// proof) and, once the 5★ is verified, a feedback video for our social media.
export type ReviewTaskStatus = "requested" | "review_uploaded" | "verified" | "completed";

export interface ReviewTask {
  id: string;
  clientPhoneId: string;
  clientPhone: string;
  clientName: string;
  businessName?: string;
  assignedTo: string;        // sales member uid
  assignedToName: string;
  assignedBy: string;        // sales admin uid
  salesAdminId: string;
  status: ReviewTaskStatus;
  reviewScreenshotUrl?: string | null;  // proof of the 5★ review
  fiveStar: boolean;                     // verified by the admin
  loyaltyDiscountPercent: number;        // 10 once verified
  feedbackVideoUrl?: string | null;      // uploaded after 5★ verified
  createdAt: any;
  updatedAt: any;
}

// ─── Commission Settlements (sales admin ↔ sales member payouts) ───
// A settlement records a commission payment for a sequential date range, so the admin always knows
// how much is paid vs still owed, and the member sees the same.
export interface CommissionSettlement {
  id: string;
  memberId: string;
  memberName: string;
  adminId: string;
  fromDate: string;        // "yyyy-MM-dd" inclusive
  toDate: string;          // "yyyy-MM-dd" inclusive
  commissionRate: number;  // 5 | 10 (snapshot of the member's rate at payment time)
  salesBase: number;       // total verified sales in the range (snapshot)
  amount: number;          // commission paid = round(salesBase * rate / 100)
  saleCount: number;
  note?: string | null;
  paidAt: any;
  createdAt: any;
}

// Schedule Numbers Pool System
export interface SchedulePool {
  id: string;
  poolName: string;
  createdBy: string;           // sales admin uid
  assignedTo: string;          // sales member uid
  numbers: string[];           // all phone numbers in the pool (normalized +91...)
  releasedCount: number;       // how many have been released so far
  dailyLimit: number;          // how many numbers to release per day
  minCompletionPercent: number; // min % of yesterday's work to unlock new batch (0-100)
  isActive: boolean;
  createdAt: any;
  lastReleasedAt?: any;        // last time numbers were auto-released
  lastReleasedDate?: string;   // "yyyy-MM-dd" of last release
}

// Daily Check-in / Check-out System
export type CheckinStatus = "checked_in" | "pending_approval" | "approved" | "rejected";

export interface DailyCheckin {
  id: string;
  memberId: string;
  memberName?: string;
  date: string;
  checkedInAt: any;
  checkedOutAt?: any;
  status: CheckinStatus;
  summary?: string;
  totalVideos?: number;
  driveFolderUrl?: string;
  screenshotUrl?: string;
  aiVideoCount?: number;
  aiConfidence?: "high" | "medium" | "low";
  aiNotes?: string;
  aiVerificationResult?: "pass" | "fail" | "pending";
  approvedBy?: string;
  approvedAt?: any;
  rejectionNote?: string;
  // Auto-computed work snapshot at check-in time
  checkinPendingTasks?: number;
  checkinInProgressTasks?: number;
  // Auto-computed work snapshot at check-out time
  completedTodayAuto?: number;
  pendingTasks?: number;
  inProgressTasks?: number;
  /**
   * The member declared, at check-out, that the day's work is in the Drive.
   *
   * A declaration rather than a verified upload — the app cannot see inside somebody's Drive, and
   * people legitimately upload from another device. Recording it means an admin reviewing the day
   * can see the claim was made, and which folder it was made about, without having to ask.
   */
  workUploadedConfirmed?: boolean;
  workUploadedAt?: any;
  /** The folder trail shown at the time, e.g. `["Hemawathi", "August", "Day 3"]`. */
  workUploadedPath?: string[];
}

// Chat System
export interface ChatRoom {
  id: string;
  participants: string[];
  participantNames: Record<string, string>;
  participantAvatars?: Record<string, string>;
  activeUsers: string[];
  lastMessage: string;
  lastMessageAt: any;
  lastMessageBy: string;
  unreadCounts: Record<string, number>;
  createdAt: any;
}

export type ChatMessageType = "text" | "image" | "video" | "file" | "voice" | "emoji";

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  type?: ChatMessageType;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  duration?: number; // voice message duration in seconds
  replyToId?: string;
  replyToText?: string;
  replyToSenderId?: string;
  editedAt?: any;
  editHistory?: string[];
  deletedAt?: any;
  createdAt: any;
}

// Video Call System
export type CallStatus = "ringing" | "active" | "ended" | "declined";

export interface VideoCallDoc {
  id: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  receiverId: string;
  receiverName: string;
  receiverAvatar?: string;
  callType: "video" | "voice";
  status: CallStatus;
  offer?: { type: string; sdp: string };
  answer?: { type: string; sdp: string };
  createdAt: any;
  endedAt?: any;
}

// Meeting System
export interface MeetingDoc {
  id: string;
  code: string;
  title: string;
  createdBy: string;
  createdByName: string;
  status: "active" | "ended";
  participantUids: string[];
  createdAt: any;
  endedAt?: any;
}

export interface MeetingParticipant {
  uid: string;
  name: string;
  avatar?: string;
  joinedAt: any;
}

export interface MeetingSignal {
  id: string;
  from: string;
  to: string;
  type: "offer" | "answer" | "candidate";
  sdp?: string;
  candidate?: any;
  createdAt: any;
}

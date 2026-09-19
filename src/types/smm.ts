/**
 * Social Media Management — a sold month, as the people delivering it actually see it.
 *
 * ── Why this is not more counters on the order ────────────────────────────────────────────────
 * The order already carries `progress` for a social-media month: 8 ads, 8 posters, 16 posts, 8
 * campaigns. Those four numbers are the whole of what the app knew about a ₹20,000 retainer, and
 * they cannot answer a single question anybody actually asks — what are the eight posts, when do
 * they go up, on which account, has the client approved them, what did the ads cost, what were
 * they told, and why did a week go by.
 *
 * A retainer is not an order. An order is made once and handed over; a retainer is a promise kept
 * for thirty days in front of a client who is watching, and the renewal depends on being able to
 * show it. So a month gets a document of its own, holding the plan, the approvals, the ads, the
 * money and the trail — and the order's four counters are DERIVED from it (see
 * services/smm.syncOrderProgress), so every screen that already reads them keeps working.
 *
 * ── Why its own collection ────────────────────────────────────────────────────────────────────
 * The order document is streamed by the whole tech department on the Orders queue. A month's plan
 * is thirty content items, a day report per campaign, a budget ledger and an approval trail —
 * kilobytes that change several times a day. On the order, ticking one post would re-push the
 * entire orders snapshot to every screen in the company. This runs on the Firebase free tier; that
 * is a quota decision, not a taste one.
 */

/** The accounts a month can be sold for. Values are stable — they are written to Firestore. */
export type SmmPlatform = "instagram" | "facebook" | "youtube" | "linkedin" | "x";

export const SMM_PLATFORMS: { key: SmmPlatform; label: string; short: string }[] = [
  { key: "instagram", label: "Instagram", short: "IG" },
  { key: "facebook", label: "Facebook", short: "FB" },
  { key: "youtube", label: "YouTube", short: "YT" },
  { key: "linkedin", label: "LinkedIn", short: "IN" },
  { key: "x", label: "X", short: "X" },
];

/**
 * The three things a month is made of.
 *
 * `real_video` is the client's own footage, edited and posted — the add-on the sales member sells
 * at a per-video rate on top of the package. It is a content kind rather than a separate product
 * because once the month starts it is planned, approved, scheduled and reported exactly like the
 * other two, and splitting it out would mean two of everything.
 */
export type SmmContentKind = "poster" | "ai_ad" | "real_video";

export const SMM_CONTENT_KINDS: { key: SmmContentKind; label: string; singular: string }[] = [
  { key: "poster", label: "Posters", singular: "Poster" },
  { key: "ai_ad", label: "AI Ads", singular: "AI Ad" },
  { key: "real_video", label: "Real videos", singular: "Real video" },
];

/**
 * Where one piece of content has got to.
 *
 * `approved` sits between "made" and "up" on purpose: nothing may be scheduled or posted without
 * it, and that is enforced in services/smm rather than left as a habit — see `POSTABLE_STATUSES`.
 */
export type SmmItemStatus =
  | "planned"
  | "in_progress"
  | "awaiting_approval"
  | "changes_requested"
  | "approved"
  | "scheduled"
  | "posted";

export const SMM_ITEM_STATUSES: { key: SmmItemStatus; label: string; tone: "idle" | "work" | "wait" | "ready" | "done" }[] = [
  { key: "planned", label: "Planned", tone: "idle" },
  { key: "in_progress", label: "Being made", tone: "work" },
  { key: "awaiting_approval", label: "Waiting on client", tone: "wait" },
  { key: "changes_requested", label: "Changes asked", tone: "wait" },
  { key: "approved", label: "Approved", tone: "ready" },
  { key: "scheduled", label: "Scheduled", tone: "ready" },
  { key: "posted", label: "Posted", tone: "done" },
];

/** The two states an item may not reach without a recorded approval. */
export const POSTABLE_STATUSES: SmmItemStatus[] = ["scheduled", "posted"];

/** A member on a campaign, stored by value so a card needs no second read to show a name. */
export interface SmmAssignee {
  uid: string;
  name: string;
}

export type SmmApprovalState = "not_sent" | "waiting" | "approved" | "changes";

/** One follow-up on a client who has not answered. Each one is a day the month did not move. */
export interface SmmApprovalChase {
  at: any;
  byName: string;
  /** How we chased — a call, a WhatsApp, a visit. Free text. */
  via?: string | null;
}

/**
 * What the client has said about one piece of content.
 *
 * ── Why the asking is stamped and not just the answer ─────────────────────────────────────────
 * "You didn't do the work" arrives a fortnight after the week the client spent not answering their
 * phone. The only defence is a record made at the time, by the person waiting, of when they asked
 * and how often they followed up. `askedAt` → `respondedAt` is that record, and the gap between
 * them is what `smmPlan.clientWaitDays` adds up for the monthly report.
 */
export interface SmmApproval {
  state: SmmApprovalState;
  askedAt?: any | null;
  respondedAt?: any | null;
  /** What they said when they finally answered — the change they wanted, or their blessing. */
  note?: string | null;
  /** Who recorded the answer. A client's approval is hearsay unless somebody signs for it. */
  byName?: string | null;
  chases?: SmmApprovalChase[];
}

export function blankApproval(): SmmApproval {
  return { state: "not_sent", askedAt: null, respondedAt: null, note: null, byName: null, chases: [] };
}

/** Whether extra work has been settled with the client, and how. */
export type SmmExtraCharge = "unbilled" | "billed" | "free";

/** One piece of content in the month's plan. */
export interface SmmContentItem {
  id: string;
  kind: SmmContentKind;
  /** What it is, in the client's words — "Dussehra offer", "Founder story". Blank until planned. */
  title: string;
  /** yyyy-MM-dd. Null while the month is still only a quota. */
  uploadDate: string | null;
  /** HH:mm, 24-hour. Null means "that day, time not fixed". */
  uploadTime: string | null;
  /** Which of the committed accounts this one goes on. */
  platforms: SmmPlatform[];
  /**
   * @deprecated No longer asked for, and nothing reads it.
   *
   * Both of these were tick boxes in the item dialog and both were noise: the team schedules in
   * whatever way suits the account on the day, and a story is not a thing anybody was counting
   * separately. Kept on the type only because items written while they existed still carry them —
   * a new item leaves them alone. See `targetsFromCommitments` for the counter that came off with
   * `story`.
   */
  scheduled?: boolean;
  /** @deprecated See `scheduled`. */
  story?: boolean;
  status: SmmItemStatus;
  approval: SmmApproval;
  /** Who makes it. Defaults to whoever holds ad creation on the order. */
  makerUid?: string | null;
  makerName?: string | null;
  /** Who puts it up. Defaults to whoever holds social uploading. */
  publisherUid?: string | null;
  publisherName?: string | null;
  /**
   * Beyond what was sold. The seller is told the day one of these is created, so they can collect
   * for it or decide out loud to give it away — which is a far better sentence at renewal than
   * silence.
   */
  extra: boolean;
  extraCharge?: SmmExtraCharge | null;
  extraAmount?: number | null;
  postedAt?: any | null;
  /**
   * Where it went live, one link per account.
   *
   * ── Why a link per account rather than one ────────────────────────────────────────────────────
   * A single post goes up on Instagram AND Facebook, and those are two different URLs. One field
   * meant the second one was pasted after a comma, or lost. They are also the whole point of the
   * update we send the group once something is live — "it's up, here it is" is only useful if the
   * "here" covers every account the client is paying for.
   */
  postUrls?: Partial<Record<SmmPlatform, string>> | null;
  /**
   * The single link items carried before `postUrls` existed.
   *
   * Still read, never written: `smmPlan.postLinks` folds it in so an older item keeps showing the
   * link somebody pasted, without a migration.
   */
  postUrl?: string | null;
  notes?: string | null;
  createdAt?: any;
  updatedAt?: any;
}

/** One day of a Meta campaign, as read off the dashboard. */
export interface SmmAdDayReport {
  /** yyyy-MM-dd — one report per day per run, so re-entering a day corrects it. */
  date: string;
  leads: number;
  spend: number;
  /** Cost per result, as Meta reports it. Stored rather than divided, because Meta's own figure
   *  is what the client is shown and the two do not always agree to the rupee. */
  costPerResult: number;
  reach?: number | null;
  /** The dashboard screenshot this was read from — the proof behind the numbers. */
  screenshotUrl?: string | null;
  byName: string;
  at: any;
}

export type SmmAdRunStatus = "planned" | "running" | "paused" | "ended";

/**
 * One Meta campaign, run against some of the month's content.
 *
 * `scope` is either a whole kind ("run all the posters") or named items, because both are things
 * the team actually agrees with a client and picking only one of them would mean typing eight ids
 * to say "all of them".
 */
export interface SmmAdRun {
  id: string;
  name: string;
  scope: { kind: SmmContentKind | "all"; itemIds: string[] };
  /** yyyy-MM-dd */
  startDate: string;
  days: number;
  /**
   * What the client agreed to spend a day, settled once at the sale.
   *
   * Kept whole even when a single day is moved — "what did we agree" and "what did we actually
   * spend on the 12th" are different questions and a client asks both.
   */
  dailyBudget: number;
  /** yyyy-MM-dd → that day's budget, only for the days it moved. */
  budgetByDay?: Record<string, number>;
  status: SmmAdRunStatus;
  reports: SmmAdDayReport[];
  createdAt?: any;
  updatedAt?: any;
}

/** Money the client put in to fund the ad spend. Some pay weekly, some top up daily. */
/**
 * How the client's ad money reached Meta.
 *
 * `direct` is the ordinary case and the default: the client puts their own card on the ad account
 * and Meta bills them. Nothing passes through us, so there is one payment and one proof.
 *
 * `via_us` is the case that needs watching. The client pays US, and we are then holding their money
 * until somebody actually funds the ad account — so it needs TWO proofs, one for each leg, and the
 * gap between them is money of the client's sitting in our account. That gap is what
 * `budgetLedger.heldByUs` counts, and it is the number worth chasing.
 */
export type SmmPaymentRoute = "direct" | "via_us";

export interface SmmBudgetPayment {
  id: string;
  amount: number;
  /** When the money actually moved — typed in, not assumed to be now. Clients pay on a Sunday. */
  at: any;
  /** "GPay", "cash", "bank" — whatever they said. */
  method?: string | null;
  note?: string | null;
  /** Absent on payments recorded before the route was asked for; those all read as `direct`. */
  route?: SmmPaymentRoute;
  /**
   * The client's own payment — to Meta on a `direct` payment, to us on a `via_us` one.
   *
   * `screenshotUrl` is what this was called before there were two legs. `paymentProofs` reads both,
   * so nothing recorded earlier loses its evidence.
   */
  clientProofUrl?: string | null;
  /** Us funding the ad account. Only ever on a `via_us` payment, and absent until we have done it. */
  metaProofUrl?: string | null;
  /** @deprecated The single proof this carried before the two legs existed. Read, never written. */
  screenshotUrl?: string | null;
  byName: string;
}

export type SmmCampaignStatus = "active" | "completed" | "renewed" | "lapsed";
export type SmmRenewalState = "none" | "pitched" | "won" | "lost";

export interface SmmRenewal {
  state: SmmRenewalState;
  at?: any | null;
  byName?: string | null;
  note?: string | null;
}

/** The service month this campaign covers. */
export interface SmmCycle {
  /** yyyy-MM — what the month is called in a report. */
  month: string;
  /** yyyy-MM-dd, inclusive. */
  startDate: string;
  /** yyyy-MM-dd, inclusive. */
  endDate: string;
}

/**
 * Who is on the month.
 *
 * The three named seats mirror the order's own tracks (`OrderTrack`), so assignment stays a single
 * flow on the Orders queue rather than a second one here that could disagree with it. `assistants`
 * is the part the tracks cannot express: a big month gets a junior alongside the main member, and
 * they need to see the plan and be reminded about it like anybody else doing the work.
 */
export interface SmmTeam {
  creator?: SmmAssignee | null;
  publisher?: SmmAssignee | null;
  marketer?: SmmAssignee | null;
  assistants: SmmAssignee[];
}

/**
 * Where a month came from.
 *
 * ── Why a directly-added month is a first-class thing ─────────────────────────────────────────
 * Most retainers arrive through a sales member and carry an order, a lead and a client chat. Some
 * do not: a client walks in, rings the tech admin, or is handed over by somebody who already knows
 * them, and the SMM leader simply starts running their accounts on Monday. Before this, that month
 * could only be tracked by inventing a fake sale — so it either got a wrong commission attached to
 * it or it lived on paper, which is exactly the state this whole section exists to end.
 *
 * A direct month behaves identically everywhere that matters: the same plan, the same approvals,
 * the same ads, the same reports. What it lacks is an order to write counters back to and a
 * client chat to post into, and both of those are simply absent rather than broken.
 */
export type SmmOrigin = "sale" | "direct";

export interface SmmCampaign {
  /** The order's id for a sold month — see the header of utils/orderChatId for why that is the
   *  right key. A directly-added month has an id of its own and no order behind it. */
  id: string;
  /** Empty on a direct month: there is no order, so there are no counters to write back to. */
  orderId: string;
  leadId: string;
  saleItemKey: string;
  /** Absent on months recorded before direct entry existed, every one of which came from a sale. */
  origin?: SmmOrigin;
  /** Who added a direct month, for the record. The seller fields carry who OWNS the client. */
  createdBy?: string;
  createdByName?: string;
  clientPhone: string;
  clientPhoneId: string;
  clientName: string;
  businessName: string;
  packageKey: string;
  packageLabel: string;
  /** What the client is paying for the month, after everything came off. */
  amount: number;
  cycle: SmmCycle;
  /** The accounts committed on the call. */
  platforms: SmmPlatform[];
  /** What was promised, per kind. The denominator of every "x of y" on every screen. */
  commitments: Record<SmmContentKind, number>;
  items: SmmContentItem[];
  ads: SmmAdRun[];
  budgetPayments: SmmBudgetPayment[];
  team: SmmTeam;
  /**
   * Who owns the client conversation — approvals chased, ad money asked for, renewal pitched.
   *
   * The sales member who sold it, or, on a direct month, whoever added it. It is never blank,
   * because every one of those jobs has to belong to a person: a month nobody owns is a month
   * where the client stops answering and nobody notices.
   */
  soldBy: string;
  soldByName: string;
  salesAdminId?: string | null;
  /**
   * Every uid allowed to read this campaign, for a one-index `array-contains` query.
   *
   * Recomputed on every team change (`smmWatchers`). Admins, team leaders and SMM leaders do not
   * appear in it — they read the active set instead, which is a handful of documents rather than
   * a name that has to be added to every campaign the day somebody is promoted.
   */
  watchers: string[];
  status: SmmCampaignStatus;
  renewal: SmmRenewal;
  createdAt?: any;
  updatedAt?: any;
}

/** What a saved message template is for. Drives which placeholders it is offered. */
export type SmmTemplateKind =
  | "approval_request"
  | "daily_report"
  | "monthly_report"
  | "renewal"
  | "extra_work"
  | "reminder"
  | "posting_update"
  | "custom";

export const SMM_TEMPLATE_KINDS: { key: SmmTemplateKind; label: string }[] = [
  { key: "approval_request", label: "Approval request" },
  { key: "daily_report", label: "Daily ad report" },
  { key: "monthly_report", label: "Monthly report" },
  { key: "renewal", label: "Renewal" },
  { key: "extra_work", label: "Extra work" },
  { key: "reminder", label: "Reminder" },
  { key: "posting_update", label: "Posted — update" },
  { key: "custom", label: "Other" },
];

/** A message the team wrote once and wants to keep. Company-wide by design. */
export interface SmmTemplate {
  id: string;
  kind: SmmTemplateKind;
  title: string;
  body: string;
  createdBy: string;
  createdByName: string;
  createdAt?: any;
  updatedAt?: any;
}

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
  target: number;
  dailyTarget?: number;
  monthlyTarget?: number;
  googleDriveBaseUrl?: string;
  phone: string;
  avatar?: string;
  earningsOption?: "stipend_plus_5" | "incentive_10";
  /** Employment type — set/updated by Tech Admin or Tech Team Lead. Defaults to full_time when unset. */
  employmentType?: "full_time" | "part_time";
  /**
   * Company employee ID (e.g. DTS-014), assigned by the Tech Admin from the Payroll page.
   * Purely a human-facing identifier for payslips and records — the uid remains the real key.
   */
  employeeId?: string;
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
  category: "wishes" | "promotional" | "cinematic";
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
  // Ad specification set by the admin/team leader at assignment time — pre-fills and locks
  // the matching field in the assigned member's AI Platform tool (see AIPlatformApp.tsx).
  modelGender?: "male" | "female";
  attireType?: "professional" | "traditional" | "shirt_pant" | "custom";
  customAttire?: string;
  aspectRatio?: "9:16" | "16:9";
  language?: string;
  /** Free-text brief from the client, carried through from the sale. */
  requirementNotes?: string;
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

export interface SaleDetail {
  category: string;
  packageKey: string;
  customDescription?: string | null;
  amount: number;
  verificationStatus: "pending" | "verified" | "rejected";
  paymentScreenshotUrl?: string | null;
  submittedAt?: any;        // when the member recorded the sale
  verifiedAt?: any;         // when the admin approved it
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

// ─── Orders (sales → tech delivery queue) ───
// Created when a sales admin VERIFIES a sale. Replaces the manual WhatsApp "sale" label:
// the tech team picks orders from this queue and assigns them as work_assignments.
export type OrderStatus = "unassigned" | "assigned" | "completed" | "verified" | "cancelled";

export interface Order {
  id: string;
  // Client identity (normalized phone is the join key end-to-end)
  clientPhone: string;          // "+91..."
  clientPhoneId: string;        // digits-only (phoneLockId) — also the Client doc id
  businessName: string;         // carried from the lead so tech never re-types it
  category: string;             // original sales category (richer than WorkAssignment.category)
  packageKey: string;
  amount: number;               // sale amount
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
  // Scoping / attribution
  salesAdminIds: string[];      // admins whose teams sold to this client (for scoped reads)
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

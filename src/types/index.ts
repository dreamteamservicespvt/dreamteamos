export type UserRole =
  | "main_admin"
  | "tech_admin"
  | "sales_admin"
  | "accounts_admin"
  | "tech_member"
  | "sales_member";

export interface AppUser {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  createdBy: string;
  isActive: boolean;
  salary: number;
  target: number;
  dailyTarget?: number;
  monthlyTarget?: number;
  googleDriveBaseUrl?: string;
  phone: string;
  avatar?: string;
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
  lastUpdated: any;
  createdAt: any;
}

export interface SaleDetail {
  category: string;
  packageKey: string;
  customDescription?: string | null;
  amount: number;
  verificationStatus: "pending" | "verified" | "rejected";
  paymentScreenshotUrl?: string | null;
}

// Daily Check-in / Check-out System
export type CheckinStatus = "checked_in" | "pending_approval" | "approved" | "rejected";

export interface DailyCheckin {
  id: string;
  memberId: string;
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

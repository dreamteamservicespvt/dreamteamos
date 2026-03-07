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

export interface WorkItem {
  type: "wishes" | "promotional" | "cinematic";
  duration: string;
  customDuration?: number | null;
  quantity: number;
  pricePerUnit: number;
  adminApprovedPrice?: number | null;
}

export interface WorkSubmission {
  id: string;
  techMemberId: string;
  submittedAt: any;
  date: string;
  status: "pending" | "approved" | "rejected";
  approvedBy?: string;
  approvedAt?: any;
  totalVideos: number;
  aiVerificationResult: "pass" | "fail" | "pending";
  driveFolderUrl: string;
  screenshotUrl: string;
  items: WorkItem[];
  calculatedRevenue: number;
  source?: "manual" | "work_assignment";
  workAssignmentId?: string;
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
  category: "wishes" | "promotional" | "cinematic";
  clipCount: number;
  includesEndCredits: boolean;
  duration: string;
  pricePerUnit: number;
  totalPrice: number;
  uniqueId: string;
  accessCode: string;
  businessName?: string;
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

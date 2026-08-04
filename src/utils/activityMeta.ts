/**
 * How an activity-log entry reads on screen — one table, both feeds.
 *
 * The sales feed grew its own label/icon/description switch inline. When the tech side started
 * recording actions too, copying that switch would have guaranteed the two drift: a new action
 * added to the type shows up as "Unknown action" on whichever page nobody remembered to update.
 * So the mapping lives here, keyed by the action type, and a missing entry is a type error rather
 * than a mystery row.
 */
import {
  CheckCircle, XCircle, RotateCcw, Trash2, Layers, ShoppingBag, Pencil, UserPlus, UserMinus,
  Shuffle, BadgeCheck, Sparkle, AlertTriangle, Undo2,
} from "lucide-react";
import { formatCurrency } from "@/utils/formatters";
import type { ActivityAction, ActivityActorRole } from "@/services/activityLog";

export interface ActivityMeta {
  label: string;
  icon: any;
  color: string;
  bgColor: string;
}

const OK = { color: "text-success", bgColor: "bg-success/10 border-success/20" };
const BAD = { color: "text-destructive", bgColor: "bg-destructive/10 border-destructive/20" };
const WARN = { color: "text-warning", bgColor: "bg-warning/10 border-warning/20" };
const INFO = { color: "text-info", bgColor: "bg-info/10 border-info/20" };
const PRIMARY = { color: "text-primary", bgColor: "bg-primary/10 border-primary/20" };

export const ACTIVITY_META: Record<ActivityAction, ActivityMeta> = {
  // ── sales ──
  verified_sale: { label: "Verified Sale", icon: CheckCircle, ...OK },
  rejected_sale: { label: "Rejected Sale", icon: XCircle, ...BAD },
  revoked_sale: { label: "Revoked Sale", icon: RotateCcw, ...WARN },
  deleted_sale: { label: "Deleted Sale", icon: Trash2, ...BAD },
  bulk_verified_sales: { label: "Bulk Verified", icon: Layers, ...OK },
  bulk_rejected_sales: { label: "Bulk Rejected", icon: Layers, ...BAD },
  submitted_sale: { label: "Submitted Sale", icon: ShoppingBag, ...PRIMARY },
  edited_sale_item: { label: "Edited Sale", icon: Pencil, ...INFO },
  deleted_sale_item: { label: "Deleted Sale Item", icon: Trash2, ...BAD },
  deleted_lead: { label: "Deleted Lead", icon: Trash2, ...BAD },
  resolved_duplicate_sale: { label: "Resolved Duplicate", icon: CheckCircle, ...OK },
  // ── tech ──
  assigned_work: { label: "Assigned Work", icon: UserPlus, ...PRIMARY },
  unassigned_work: { label: "Unassigned Work", icon: UserMinus, ...WARN },
  reassigned_work: { label: "Reassigned Work", icon: Shuffle, ...INFO },
  verified_work: { label: "Verified Delivery", icon: BadgeCheck, ...OK },
  deleted_orders: { label: "Deleted Orders", icon: Trash2, ...BAD },
  restored_orders: { label: "Restored Orders", icon: Undo2, ...OK },
  cleaned_up_orders: { label: "Cleared Already-Done", icon: Sparkle, ...WARN },
  added_penalty: { label: "Charged for Changes", icon: AlertTriangle, ...BAD },
  removed_penalty: { label: "Removed Charge", icon: Undo2, ...INFO },
};

export const ROLE_LABEL: Record<ActivityActorRole, string> = {
  sales_admin: "Sales Admin",
  sales_member: "Sales Member",
  tech_admin: "Tech Admin",
  tech_team_leader: "Team Leader",
};

interface DescribableLog {
  action: ActivityAction;
  details: Record<string, any>;
}

const spaced = (v?: string | null) => (v || "").replace(/_/g, " ");

/** A list of business names for a bulk action, trimmed to something a person will actually read. */
function namesOf(details: Record<string, any>, max = 3): string {
  const rows: { businessName?: string }[] = Array.isArray(details.orders) ? details.orders : [];
  const names = rows.map((r) => r.businessName).filter(Boolean) as string[];
  if (names.length === 0) return "";
  const head = names.slice(0, max).join(", ");
  return names.length > max ? `${head} + ${names.length - max} more` : head;
}

/** One sentence saying what happened, in the words the team would use for it. */
export function describeActivity(log: DescribableLog): string {
  const d = log.details || {};
  switch (log.action) {
    // ── sales ──
    case "verified_sale":
      return `Verified ${spaced(d.category)} sale of ${formatCurrency(d.amount || 0)} for "${d.leadName}" (sold by ${d.memberName})`;
    case "rejected_sale":
      return `Rejected ${spaced(d.category)} sale of ${formatCurrency(d.amount || 0)} for "${d.leadName}" (sold by ${d.memberName})`;
    case "revoked_sale":
      return `Revoked verification of ${spaced(d.category)} sale (${formatCurrency(d.amount || 0)}) for "${d.leadName}" — moved back to pending`;
    case "deleted_sale":
      return `Deleted ${spaced(d.category)} sale of ${formatCurrency(d.amount || 0)} for "${d.leadName}" (sold by ${d.memberName})`;
    case "bulk_verified_sales":
      return `Bulk verified ${d.count} sale(s) in one action`;
    case "bulk_rejected_sales":
      return `Bulk rejected ${d.count} sale(s) in one action`;
    case "submitted_sale":
      return `Submitted ${spaced(d.category)} sale of ${formatCurrency(d.amount || 0)} for "${d.leadName}"`;
    case "deleted_sale_item":
      return `Deleted their own ${spaced(d.category)} sale of ${formatCurrency(d.amount || 0)} for "${d.leadName}"`;
    case "edited_sale_item":
      return `Edited ${spaced(d.category)} sale for "${d.leadName}"${Array.isArray(d.changes) && d.changes.length ? ` — ${d.changes.join("; ")}` : ""}`;
    case "deleted_lead":
      return `Deleted custom lead "${d.leadName}"`;
    case "resolved_duplicate_sale":
      return `Resolved duplicate on ${d.phone || d.leadName} — approved ${d.winnerMember}'s sale${d.rejectedMembers?.length ? ` and rejected ${d.rejectedMembers.join(", ")}` : ""}`;
    // ── tech ──
    case "assigned_work":
      return `Assigned ${spaced(d.category)} work${d.businessName ? ` for "${d.businessName}"` : ""} to ${d.memberName || "a member"}`
        + `${Array.isArray(d.tracks) && d.tracks.length ? ` (${d.tracks.map(spaced).join(" + ")})` : ""}`
        + `${d.fromOrder ? "" : " — no sale behind it"}`;
    case "unassigned_work":
      return `Took "${d.businessName || "a job"}" back off ${d.memberName || "a member"}`
        + (d.returnedToQueue ? " — returned to the Orders queue" : " — it had no order behind it");
    case "reassigned_work":
      return `Moved "${d.businessName || "a job"}" to ${d.memberName}`;
    case "verified_work":
      return `Verified ${spaced(d.category)} delivery${d.businessName ? ` for "${d.businessName}"` : ""} by ${d.memberName || "a member"}`;
    case "deleted_orders": {
      const names = namesOf(d);
      return `Deleted ${d.count} order${d.count === 1 ? "" : "s"} from the queue${names ? ` — ${names}` : ""}`;
    }
    case "restored_orders": {
      const names = namesOf(d);
      return `Put ${d.count} order${d.count === 1 ? "" : "s"} back in the queue${names ? ` — ${names}` : ""}`;
    }
    case "cleaned_up_orders":
      return `Cleared ${d.count} order${d.count === 1 ? "" : "s"} as already done by hand`;
    case "added_penalty":
      return `Charged ${d.clips} ${spaced(d.clipType)} clip${d.clips === 1 ? "" : "s"} (${formatCurrency(d.amount || 0)}) on "${d.businessName || "an order"}"`
        + `${d.reason ? ` — ${d.reason}` : ""}`;
    case "removed_penalty":
      return `Removed a charge of ${formatCurrency(d.amount || 0)} from "${d.businessName || "an order"}"`;
    default:
      return "Unknown action";
  }
}

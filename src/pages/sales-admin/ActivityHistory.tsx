import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency } from "@/utils/formatters";
import { format } from "date-fns";
import type { ActivityAction } from "@/services/activityLog";
import { History, CheckCircle, XCircle, RotateCcw, Trash2, Layers, ShoppingBag, Lock } from "lucide-react";
import DashboardDayPicker from "@/components/dashboard/DayPicker";

interface ActivityLog {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: "sales_admin" | "sales_member";
  adminId: string;
  action: ActivityAction;
  details: Record<string, any>;
  createdAt: any;
}

const ACTION_META: Record<ActivityAction, { label: string; icon: any; color: string; bgColor: string }> = {
  verified_sale: { label: "Verified Sale", icon: CheckCircle, color: "text-success", bgColor: "bg-success/10 border-success/20" },
  rejected_sale: { label: "Rejected Sale", icon: XCircle, color: "text-destructive", bgColor: "bg-destructive/10 border-destructive/20" },
  revoked_sale: { label: "Revoked Sale", icon: RotateCcw, color: "text-warning", bgColor: "bg-warning/10 border-warning/20" },
  deleted_sale: { label: "Deleted Sale", icon: Trash2, color: "text-destructive", bgColor: "bg-destructive/10 border-destructive/20" },
  bulk_verified_sales: { label: "Bulk Verified", icon: Layers, color: "text-success", bgColor: "bg-success/10 border-success/20" },
  bulk_rejected_sales: { label: "Bulk Rejected", icon: Layers, color: "text-destructive", bgColor: "bg-destructive/10 border-destructive/20" },
  submitted_sale: { label: "Submitted Sale", icon: ShoppingBag, color: "text-primary", bgColor: "bg-primary/10 border-primary/20" },
  deleted_sale_item: { label: "Deleted Sale Item", icon: Trash2, color: "text-destructive", bgColor: "bg-destructive/10 border-destructive/20" },
  deleted_lead: { label: "Deleted Lead", icon: Trash2, color: "text-destructive", bgColor: "bg-destructive/10 border-destructive/20" },
  resolved_duplicate_sale: { label: "Resolved Duplicate", icon: CheckCircle, color: "text-success", bgColor: "bg-success/10 border-success/20" },
};

function getActionDescription(log: ActivityLog): string {
  const d = log.details;
  switch (log.action) {
    case "verified_sale":
      return `Verified ${d.category?.replace(/_/g, " ")} sale of ${formatCurrency(d.amount || 0)} for "${d.leadName}" (sold by ${d.memberName})`;
    case "rejected_sale":
      return `Rejected ${d.category?.replace(/_/g, " ")} sale of ${formatCurrency(d.amount || 0)} for "${d.leadName}" (sold by ${d.memberName})`;
    case "revoked_sale":
      return `Revoked verification of ${d.category?.replace(/_/g, " ")} sale (${formatCurrency(d.amount || 0)}) for "${d.leadName}" — moved back to pending`;
    case "deleted_sale":
      return `Deleted ${d.category?.replace(/_/g, " ")} sale of ${formatCurrency(d.amount || 0)} for "${d.leadName}" (sold by ${d.memberName})`;
    case "bulk_verified_sales":
      return `Bulk verified ${d.count} sale(s) in one action`;
    case "bulk_rejected_sales":
      return `Bulk rejected ${d.count} sale(s) in one action`;
    case "submitted_sale":
      return `Submitted ${d.category?.replace(/_/g, " ")} sale of ${formatCurrency(d.amount || 0)} for "${d.leadName}"`;
    case "deleted_sale_item":
      return `Deleted their own ${d.category?.replace(/_/g, " ")} sale of ${formatCurrency(d.amount || 0)} for "${d.leadName}"`;
    case "deleted_lead":
      return `Deleted custom lead "${d.leadName}"`;
    case "resolved_duplicate_sale":
      return `Resolved duplicate on ${d.phone || d.leadName} — approved ${d.winnerMember}'s sale${d.rejectedMembers?.length ? ` and rejected ${d.rejectedMembers.join(", ")}` : ""}`;
    default:
      return "Unknown action";
  }
}

type FilterType = "all" | "admin_actions" | "member_actions";

export default function ActivityHistory() {
  const currentUser = useAuthStore((s) => s.user);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, "activityLogs"),
      where("adminId", "==", currentUser.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ActivityLog));
      entries.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setLogs(entries);
      setLoading(false);
    });
    return unsub;
  }, [currentUser]);

  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;

  const filtered = logs.filter((log) => {
    if (dateStr) {
      const ts = log.createdAt?.seconds;
      if (!ts) return false;
      if (format(new Date(ts * 1000), "yyyy-MM-dd") !== dateStr) return false;
    }
    if (filterType === "admin_actions") return log.actorRole === "sales_admin";
    if (filterType === "member_actions") return log.actorRole === "sales_member";
    return true;
  });

  const adminLogs = logs.filter((l) => l.actorRole === "sales_admin");
  const memberLogs = logs.filter((l) => l.actorRole === "sales_member");

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <History size={18} className="text-primary" />
            <h1 className="font-display text-lg md:text-2xl font-bold text-foreground">Activity History</h1>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <Lock size={11} className="text-muted-foreground" />
            <p className="text-muted-foreground text-xs">Uneditable audit log — all team actions are recorded permanently</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DashboardDayPicker selectedDate={selectedDate} onSelect={setSelectedDate} />
          {selectedDate && (
            <button onClick={() => setSelectedDate(undefined)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Clear</button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-3 md:p-4 text-center">
          <p className="font-display font-bold text-xl md:text-2xl text-foreground">{logs.length}</p>
          <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">Total Actions</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 md:p-4 text-center">
          <p className="font-display font-bold text-xl md:text-2xl text-primary">{adminLogs.length}</p>
          <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">Admin Actions</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 md:p-4 text-center">
          <p className="font-display font-bold text-xl md:text-2xl text-info">{memberLogs.length}</p>
          <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">Member Actions</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1.5 overflow-x-auto">
        {([
          { key: "all", label: `All (${logs.length})` },
          { key: "admin_actions", label: `My Actions (${adminLogs.length})` },
          { key: "member_actions", label: `Team Actions (${memberLogs.length})` },
        ] as { key: FilterType; label: string }[]).map((opt) => (
          <button
            key={opt.key}
            onClick={() => setFilterType(opt.key)}
            className={`h-8 md:h-9 px-3 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${
              filterType === opt.key
                ? "bg-primary/15 text-primary border border-primary/30"
                : "bg-card border border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Log List */}
      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <History size={32} className="mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-muted-foreground text-sm">No activity logs yet</p>
          <p className="text-muted-foreground text-xs mt-1">Actions will appear here as they happen</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((log) => {
            const meta = ACTION_META[log.action] || ACTION_META.verified_sale;
            const Icon = meta.icon;
            const ts = log.createdAt?.seconds;
            const dateFormatted = ts ? format(new Date(ts * 1000), "dd MMM yyyy, hh:mm a") : "—";
            const isBulk = log.action === "bulk_verified_sales" || log.action === "bulk_rejected_sales";
            return (
              <div
                key={log.id}
                className={`bg-card border rounded-xl p-4 flex gap-3 ${meta.bgColor}`}
              >
                <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${meta.bgColor}`}>
                  <Icon size={15} className={meta.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${meta.bgColor} ${meta.color}`}>
                        {meta.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground px-2 py-0.5 rounded-full bg-muted/40">
                        by {log.actorName} ({log.actorRole === "sales_admin" ? "Admin" : "Member"})
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0 font-mono">{dateFormatted}</span>
                  </div>
                  <p className="text-sm text-foreground mt-1.5">{getActionDescription(log)}</p>
                  {/* Bulk item details */}
                  {isBulk && log.details.items && (
                    <div className="mt-2 space-y-1">
                      {(log.details.items as any[]).slice(0, 5).map((item: any, i: number) => (
                        <p key={i} className="text-[11px] text-muted-foreground pl-2 border-l border-border">
                          {item.category?.replace(/_/g, " ")} — {formatCurrency(item.amount || 0)} for "{item.leadName}" ({item.memberName})
                        </p>
                      ))}
                      {log.details.items.length > 5 && (
                        <p className="text-[11px] text-muted-foreground pl-2">+ {log.details.items.length - 5} more items</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

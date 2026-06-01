import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency } from "@/utils/formatters";
import { format } from "date-fns";
import type { ActivityAction } from "@/services/activityLog";
import { History, ShoppingBag, Trash2, Lock } from "lucide-react";
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

const ACTION_META: Partial<Record<ActivityAction, { label: string; icon: any; color: string; bgColor: string }>> = {
  submitted_sale: { label: "Submitted Sale", icon: ShoppingBag, color: "text-primary", bgColor: "bg-primary/10 border-primary/20" },
  deleted_sale_item: { label: "Deleted Sale", icon: Trash2, color: "text-destructive", bgColor: "bg-destructive/10 border-destructive/20" },
  deleted_lead: { label: "Deleted Lead", icon: Trash2, color: "text-destructive", bgColor: "bg-destructive/10 border-destructive/20" },
};

function getActionDescription(log: ActivityLog): string {
  const d = log.details;
  switch (log.action) {
    case "submitted_sale":
      return `Submitted ${d.category?.replace(/_/g, " ")} sale of ${formatCurrency(d.amount || 0)} for "${d.leadName}" — awaiting admin verification`;
    case "deleted_sale_item":
      return `Deleted ${d.category?.replace(/_/g, " ")} sale item (${formatCurrency(d.amount || 0)}) for "${d.leadName}"`;
    case "deleted_lead":
      return `Deleted custom lead "${d.leadName}"`;
    default:
      return "Action performed";
  }
}

const MEMBER_ACTIONS: ActivityAction[] = ["submitted_sale", "deleted_sale_item", "deleted_lead"];

export default function ActivityHistory() {
  const currentUser = useAuthStore((s) => s.user);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, "activityLogs"),
      where("actorId", "==", currentUser.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const entries = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as ActivityLog))
        .filter((l) => MEMBER_ACTIONS.includes(l.action));
      entries.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setLogs(entries);
      setLoading(false);
    });
    return unsub;
  }, [currentUser]);

  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const filtered = logs.filter((log) => {
    if (!dateStr) return true;
    const ts = log.createdAt?.seconds;
    if (!ts) return false;
    return format(new Date(ts * 1000), "yyyy-MM-dd") === dateStr;
  });

  const submittedCount = logs.filter((l) => l.action === "submitted_sale").length;
  const deletedCount = logs.filter((l) => l.action === "deleted_sale_item" || l.action === "deleted_lead").length;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
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
            <h1 className="font-display text-lg md:text-2xl font-bold text-foreground">My Activity History</h1>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <Lock size={11} className="text-muted-foreground" />
            <p className="text-muted-foreground text-xs">Permanent record of your actions — read only</p>
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
          <p className="font-display font-bold text-xl md:text-2xl text-primary">{submittedCount}</p>
          <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">Sales Submitted</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 md:p-4 text-center">
          <p className="font-display font-bold text-xl md:text-2xl text-destructive">{deletedCount}</p>
          <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">Items Deleted</p>
        </div>
      </div>

      {/* Log List */}
      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <History size={32} className="mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-muted-foreground text-sm">
            {selectedDate ? "No activity on this date" : "No activity recorded yet"}
          </p>
          <p className="text-muted-foreground text-xs mt-1">
            Actions like submitting or deleting sales will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((log) => {
            const meta = ACTION_META[log.action] || { label: log.action, icon: History, color: "text-muted-foreground", bgColor: "bg-muted/10 border-muted/20" };
            const Icon = meta.icon;
            const ts = log.createdAt?.seconds;
            const dateFormatted = ts ? format(new Date(ts * 1000), "dd MMM yyyy, hh:mm a") : "—";
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
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${meta.bgColor} ${meta.color}`}>
                      {meta.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0 font-mono">{dateFormatted}</span>
                  </div>
                  <p className="text-sm text-foreground mt-1.5">{getActionDescription(log)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

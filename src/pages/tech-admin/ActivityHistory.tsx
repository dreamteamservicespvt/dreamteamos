import { useState, useEffect, useMemo } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { format } from "date-fns";
import { History, Lock, ShieldAlert } from "lucide-react";
import DashboardDayPicker from "@/components/dashboard/DayPicker";
import { ACTIVITY_META, ROLE_LABEL, describeActivity } from "@/utils/activityMeta";
import { TECH_ACTIVITY_ACTIONS, type ActivityAction, type ActivityActorRole } from "@/services/activityLog";

/**
 * What the tech side has done — the record that did not exist.
 *
 * The sales department has had an activity log since early on. The tech department had none, and
 * the gap was not academic: an order can leave the delivery queue on one click (deleted, or swept
 * by "clean up already-done") while the SALE behind it stays verified and counted. Two of Gova's
 * three Fmcg orders left that way on 2 Aug 2026 and nothing anywhere recorded who did it or why —
 * the client had paid for three ads and the pipeline only knew about one.
 *
 * So this feed is deliberately weighted to the actions that move work between people or take it
 * out of the pipeline, rather than to everything that writes a document.
 *
 * Scoped by `adminId`, which a team leader's entries inherit from their tech admin — one feed for
 * the department, not one per role.
 */

interface TechActivityLog {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: ActivityActorRole;
  adminId: string;
  action: ActivityAction;
  details: Record<string, any>;
  createdAt: any;
}

type FilterType = "all" | "mine" | "team_leader" | "removals";

/** The subset that takes work out of the pipeline — the reason this page exists. */
const REMOVAL_ACTIONS: ActivityAction[] = ["deleted_orders", "cleaned_up_orders", "unassigned_work"];

export default function TechActivityHistory() {
  const currentUser = useAuthStore((s) => s.user);
  const [logs, setLogs] = useState<TechActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  /**
   * A team leader reads their own admin's feed — that is where their entries were filed, and it is
   * the department's record rather than a private one.
   */
  const feedAdminId = currentUser?.role === "tech_team_leader"
    ? currentUser.createdBy || currentUser.uid
    : currentUser?.uid;

  useEffect(() => {
    if (!feedAdminId) return;
    const q = query(collection(db, "activityLogs"), where("adminId", "==", feedAdminId));
    const unsub = onSnapshot(q, (snap) => {
      const entries = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as TechActivityLog))
        // The sales feed lives in the same collection under a different admin, but a tech admin who
        // also manages sellers would otherwise see both mixed together with no way to tell them
        // apart. This page is the tech record; the sales one has its own page.
        .filter((e) => TECH_ACTIVITY_ACTIONS.includes(e.action));
      entries.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setLogs(entries);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [feedAdminId]);

  const adminLogs = useMemo(() => logs.filter((l) => l.actorRole === "tech_admin"), [logs]);
  const leaderLogs = useMemo(() => logs.filter((l) => l.actorRole === "tech_team_leader"), [logs]);
  const removalLogs = useMemo(() => logs.filter((l) => REMOVAL_ACTIONS.includes(l.action)), [logs]);

  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;

  const filtered = useMemo(() => logs.filter((log) => {
    if (dateStr) {
      const ts = log.createdAt?.seconds;
      if (!ts) return false;
      if (format(new Date(ts * 1000), "yyyy-MM-dd") !== dateStr) return false;
    }
    if (filterType === "mine") return log.actorRole === "tech_admin";
    if (filterType === "team_leader") return log.actorRole === "tech_team_leader";
    if (filterType === "removals") return REMOVAL_ACTIONS.includes(log.action);
    return true;
  }), [logs, dateStr, filterType]);

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
            <h1 className="font-display text-lg md:text-2xl font-bold text-foreground">Tech Activity History</h1>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <Lock size={11} className="text-muted-foreground" />
            <p className="text-muted-foreground text-xs">
              Uneditable audit log — every job assigned, moved, verified or taken out of the queue, by you and your team leaders
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DashboardDayPicker selectedDate={selectedDate} onSelect={setSelectedDate} />
          {selectedDate && (
            <button onClick={() => setSelectedDate(undefined)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Clear</button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-3 md:p-4 text-center">
          <p className="font-display font-bold text-xl md:text-2xl text-foreground">{logs.length}</p>
          <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">Total Actions</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 md:p-4 text-center">
          <p className="font-display font-bold text-xl md:text-2xl text-primary">{adminLogs.length}</p>
          <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">Tech Admin</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 md:p-4 text-center">
          <p className="font-display font-bold text-xl md:text-2xl text-purple-500">{leaderLogs.length}</p>
          <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">Team Leader</p>
        </div>
        {/* Broken out because it is the number worth noticing: work that stopped being delivered. */}
        <div className="bg-card border border-destructive/30 rounded-xl p-3 md:p-4 text-center">
          <p className="font-display font-bold text-xl md:text-2xl text-destructive">{removalLogs.length}</p>
          <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">Taken out of the queue</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 overflow-x-auto">
        {([
          { key: "all", label: `All (${logs.length})` },
          { key: "mine", label: `My Actions (${adminLogs.length})` },
          { key: "team_leader", label: `Team Leader (${leaderLogs.length})` },
          { key: "removals", label: `Removals (${removalLogs.length})` },
        ] as { key: FilterType; label: string }[]).map((opt) => (
          <button
            key={opt.key}
            data-test={`tech-activity-filter-${opt.key}`}
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

      {/* Feed */}
      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <History size={32} className="mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-muted-foreground text-sm">No tech activity recorded yet</p>
          <p className="text-muted-foreground text-xs mt-1">
            Assignments, reassignments, verifications and anything removed from the Orders queue will appear here as they happen.
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-test="tech-activity-feed">
          {filtered.map((log) => {
            const meta = ACTIVITY_META[log.action];
            if (!meta) return null;
            const Icon = meta.icon;
            const ts = log.createdAt?.seconds;
            const dateFormatted = ts ? format(new Date(ts * 1000), "dd MMM yyyy, hh:mm a") : "—";
            const isRemoval = REMOVAL_ACTIONS.includes(log.action);
            return (
              <div key={log.id} data-test="tech-activity-row" className={`bg-card border rounded-xl p-4 flex gap-3 ${meta.bgColor}`}>
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
                        by {log.actorName} ({ROLE_LABEL[log.actorRole] || log.actorRole})
                      </span>
                      {isRemoval && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive">
                          <ShieldAlert size={10} /> left the delivery queue
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0 font-mono">{dateFormatted}</span>
                  </div>
                  <p className="text-sm text-foreground mt-1.5">{describeActivity(log)}</p>
                  {/* A bulk removal names what went, so the log answers "which orders?" on its own. */}
                  {Array.isArray(log.details?.orders) && log.details.orders.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {(log.details.orders as any[]).slice(0, 5).map((o: any, i: number) => (
                        <p key={i} className="text-[11px] text-muted-foreground pl-2 border-l border-border">
                          {o.businessName || "Unnamed"} — {(o.category || "").replace(/_/g, " ")}
                        </p>
                      ))}
                      {log.details.orders.length > 5 && (
                        <p className="text-[11px] text-muted-foreground pl-2">+ {log.details.orders.length - 5} more</p>
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

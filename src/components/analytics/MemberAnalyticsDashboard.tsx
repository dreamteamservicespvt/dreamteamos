import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import type { AppUser, DailyCheckin, WorkAssignment } from "@/types";
import type { DateRange } from "react-day-picker";
import {
  format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths,
} from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import DashboardDayPicker from "@/components/dashboard/DayPicker";
import DashboardDateRangePicker from "@/components/dashboard/DateRangePicker";
import { normalizeDateRange } from "@/utils/dateRange";
import { formatCurrency } from "@/utils/formatters";
import { cn } from "@/lib/utils";
import {
  TrendingUp, Video, CalendarDays, Clock, IndianRupee, CheckCircle2, ListChecks, CalendarRange, Loader2,
} from "lucide-react";

type PresetKey = "today" | "yesterday" | "this_week" | "last_week" | "last_2_weeks" | "this_month" | "last_month" | "last_3_months" | "all";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "this_week", label: "This Week" },
  { key: "last_week", label: "Last Week" },
  { key: "last_2_weeks", label: "Last 2 Weeks" },
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "last_3_months", label: "Last 3 Months" },
  { key: "all", label: "All Time" },
];

function presetToRange(key: PresetKey): { from: string; to: string } | null {
  const now = new Date();
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  switch (key) {
    case "today": return { from: fmt(now), to: fmt(now) };
    case "yesterday": { const y = subDays(now, 1); return { from: fmt(y), to: fmt(y) }; }
    case "this_week": return { from: fmt(startOfWeek(now, { weekStartsOn: 1 })), to: fmt(now) };
    case "last_week": { const lw = subWeeks(now, 1); return { from: fmt(startOfWeek(lw, { weekStartsOn: 1 })), to: fmt(endOfWeek(lw, { weekStartsOn: 1 })) }; }
    case "last_2_weeks": return { from: fmt(subWeeks(now, 2)), to: fmt(now) };
    case "this_month": return { from: fmt(startOfMonth(now)), to: fmt(now) };
    case "last_month": { const lm = subMonths(now, 1); return { from: fmt(startOfMonth(lm)), to: fmt(endOfMonth(lm)) }; }
    case "last_3_months": return { from: fmt(subMonths(now, 3)), to: fmt(now) };
    case "all": return null;
  }
}

interface MemberAnalyticsDashboardProps {
  member: AppUser;
  /** When false, all pricing/revenue is hidden (member's own view). */
  showRevenue?: boolean;
}

/**
 * Individual member analytics: revenue + videos day-wise with flexible
 * filters (presets, single day, custom range, multiple selected dates),
 * KPI cards, charts and a day-by-day breakdown including attendance.
 */
export default function MemberAnalyticsDashboard({ member, showRevenue = true }: MemberAnalyticsDashboardProps) {
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [loading, setLoading] = useState(true);

  const [preset, setPreset] = useState<PresetKey>("this_month");
  const [singleDay, setSingleDay] = useState<Date | undefined>(undefined);
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [multiDates, setMultiDates] = useState<Date[]>([]);
  const [multiOpen, setMultiOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"verified" | "completed_verified" | "all">("completed_verified");

  useEffect(() => {
    if (!member.uid) return;
    const unsubs: (() => void)[] = [];
    unsubs.push(onSnapshot(
      query(collection(db, "work_assignments"), where("assignedTo", "==", member.uid)),
      (snap) => {
        setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkAssignment)));
        setLoading(false);
      }
    ));
    unsubs.push(onSnapshot(
      query(collection(db, "daily_checkins"), where("memberId", "==", member.uid)),
      (snap) => setCheckins(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DailyCheckin)))
    ));
    return () => unsubs.forEach((u) => u());
  }, [member.uid]);

  // ── Active scope: exactly one of preset / single day / range / multi-dates ──
  const scope = useMemo(() => {
    if (multiDates.length > 0) {
      return { kind: "dates" as const, dates: new Set(multiDates.map((d) => format(d, "yyyy-MM-dd"))) };
    }
    if (singleDay) {
      return { kind: "dates" as const, dates: new Set([format(singleDay, "yyyy-MM-dd")]) };
    }
    if (range?.from) {
      return {
        kind: "range" as const,
        from: format(range.from, "yyyy-MM-dd"),
        to: format(range.to ?? range.from, "yyyy-MM-dd"),
      };
    }
    const r = presetToRange(preset);
    return r ? { kind: "range" as const, ...r } : { kind: "all" as const };
  }, [preset, singleDay, range, multiDates]);

  const inScope = (dateStr: string | undefined): boolean => {
    if (!dateStr) return false;
    if (scope.kind === "all") return true;
    if (scope.kind === "dates") return scope.dates.has(dateStr);
    return dateStr >= scope.from && dateStr <= scope.to;
  };

  const scopeLabel = useMemo(() => {
    if (multiDates.length > 0) return `${multiDates.length} selected date${multiDates.length === 1 ? "" : "s"}`;
    if (singleDay) return format(singleDay, "dd/MM/yyyy");
    if (range?.from) return `${format(range.from, "dd/MM/yyyy")} – ${format(range.to ?? range.from, "dd/MM/yyyy")}`;
    return PRESETS.find((p) => p.key === preset)?.label || "All Time";
  }, [preset, singleDay, range, multiDates]);

  const clearPickers = () => { setSingleDay(undefined); setRange(undefined); setMultiDates([]); };

  // Attribute work to its assignment date (`a.date`) — the same bucketing the
  // admin's MyTeam, Dashboard and Member History screens use, so the numbers match.
  const doneDate = (a: WorkAssignment) => a.date;

  const matchesStatus = (a: WorkAssignment) =>
    statusFilter === "verified" ? a.status === "verified"
    : statusFilter === "completed_verified" ? a.status === "verified" || a.status === "completed"
    : true;

  const scopedWork = useMemo(
    () => assignments.filter((a) => matchesStatus(a) && inScope(doneDate(a))),
    [assignments, scope, statusFilter] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const scopedCheckins = useMemo(
    () => checkins.filter((c) => inScope(c.date)),
    [checkins, scope] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const stats = useMemo(() => {
    const revenue = scopedWork.reduce((s, a) => s + (a.totalPrice || 0), 0);
    const videos = scopedWork.length;
    const daysPresent = scopedCheckins.length;
    const hours = scopedCheckins.reduce((sum, c) => {
      const inMs = c.checkedInAt?.toDate?.()?.getTime?.() || 0;
      const outMs = c.checkedOutAt?.toDate?.()?.getTime?.() || 0;
      return sum + (outMs > inMs ? (outMs - inMs) / 3600000 : 0);
    }, 0);
    const workDays = new Set(scopedWork.map(doneDate)).size;
    const divisor = daysPresent || workDays || 1;
    return {
      revenue,
      videos,
      daysPresent,
      hours,
      avgVideos: videos / divisor,
      avgRevenue: revenue / divisor,
    };
  }, [scopedWork, scopedCheckins]);

  // Live (unscoped) workload snapshot
  const liveActive = useMemo(() => ({
    pending: assignments.filter((a) => a.status === "assigned").length,
    inProgress: assignments.filter((a) => a.status === "in_progress" || a.status === "editing").length,
  }), [assignments]);

  // ── Day-wise rows: union of work days and attendance days in scope ──
  const dayRows = useMemo(() => {
    const map = new Map<string, { date: string; videos: number; revenue: number; checkin?: DailyCheckin }>();
    scopedWork.forEach((a) => {
      const d = doneDate(a);
      const row = map.get(d) || { date: d, videos: 0, revenue: 0 };
      row.videos += 1;
      row.revenue += a.totalPrice || 0;
      map.set(d, row);
    });
    scopedCheckins.forEach((c) => {
      const row = map.get(c.date) || { date: c.date, videos: 0, revenue: 0 };
      row.checkin = c;
      map.set(c.date, row);
    });
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [scopedWork, scopedCheckins]);

  const chartData = useMemo(
    () => [...dayRows].reverse().map((r) => ({ name: format(new Date(`${r.date}T00:00:00`), "dd/MM"), videos: r.videos, revenue: r.revenue })),
    [dayRows]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    );
  }

  const kpis = [
    showRevenue ? { label: "Revenue", value: formatCurrency(stats.revenue), icon: TrendingUp, color: "text-primary" } : null,
    { label: "Videos Done", value: String(stats.videos), icon: Video, color: "text-info" },
    { label: "Days Present", value: String(stats.daysPresent), icon: CalendarDays, color: "text-success" },
    { label: "Hours Worked", value: `${stats.hours.toFixed(1)}h`, icon: Clock, color: "text-warning" },
    { label: "Avg Videos/Day", value: stats.avgVideos.toFixed(1), icon: CheckCircle2, color: "text-info" },
    showRevenue ? { label: "Avg Revenue/Day", value: formatCurrency(Math.round(stats.avgRevenue)), icon: IndianRupee, color: "text-primary" } : null,
  ].filter((k): k is { label: string; value: string; icon: typeof Video; color: string } => k !== null);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Filters */}
      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-accent/20 p-3 md:p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => { setPreset(p.key); clearPickers(); }}
              className={cn(
                "h-8 px-3 rounded-full text-[11px] md:text-xs font-medium border transition-colors",
                preset === p.key && !singleDay && !range?.from && multiDates.length === 0
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background/80 text-muted-foreground border-border/70 hover:text-foreground hover:border-primary/40"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DashboardDayPicker selectedDate={singleDay} onSelect={(d) => { setSingleDay(d); setRange(undefined); setMultiDates([]); }} />
          <DashboardDateRangePicker value={range} onSelect={(r) => { setRange(normalizeDateRange(r)); setSingleDay(undefined); setMultiDates([]); }} />
          <Popover open={multiOpen} onOpenChange={setMultiOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("h-9 px-3 gap-2 text-xs font-medium", multiDates.length === 0 && "text-muted-foreground")}>
                <CalendarRange size={14} />
                {multiDates.length > 0 ? `${multiDates.length} dates selected` : "Select dates"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="multiple"
                selected={multiDates}
                onSelect={(dates) => { setMultiDates(dates || []); setSingleDay(undefined); setRange(undefined); }}
                className={cn("p-3 pointer-events-auto")}
              />
              <div className="flex items-center justify-end gap-2 px-3 pb-3">
                <button onClick={() => setMultiDates([])} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
                <button onClick={() => setMultiOpen(false)} className="text-xs text-primary font-medium hover:underline">Done</button>
              </div>
            </PopoverContent>
          </Popover>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="h-9 rounded-lg border border-border/70 bg-background/80 px-3 text-xs text-foreground shadow-sm outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="completed_verified">Completed + Verified</option>
            <option value="verified">Verified Only</option>
            <option value="all">All Status</option>
          </select>
          {(singleDay || range?.from || multiDates.length > 0) && (
            <button onClick={clearPickers} className="h-9 px-3 rounded-lg border border-border/70 text-xs font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors">
              Clear
            </button>
          )}
          <span className="ml-auto text-[11px] md:text-xs text-muted-foreground">
            Showing: <span className="font-medium text-foreground">{scopeLabel}</span>
          </span>
        </div>
      </div>

      {/* KPI cards */}
      <div className={cn("grid grid-cols-2 sm:grid-cols-3 gap-2 md:gap-3", showRevenue ? "lg:grid-cols-6" : "lg:grid-cols-4")}>
        {kpis.map((k) => (
          <div key={k.label} className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <k.icon size={13} className={k.color} />
              <span className="text-[10px] md:text-xs text-muted-foreground">{k.label}</span>
            </div>
            <p className="font-display font-bold text-base md:text-xl text-foreground truncate">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Live workload */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-warning/10 text-warning font-medium">
          <ListChecks size={12} /> {liveActive.inProgress} in progress now
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-info/10 text-info font-medium">
          <Clock size={12} /> {liveActive.pending} pending now
        </span>
      </div>

      {/* Charts */}
      <div className={cn("grid grid-cols-1 gap-3 md:gap-4", showRevenue && "lg:grid-cols-2")}>
        {showRevenue && (
        <div className="bg-card border border-border rounded-xl p-3 md:p-4">
          <h3 className="font-display font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
            <TrendingUp size={14} className="text-primary" /> Revenue per Day
          </h3>
          {chartData.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-12">No data for this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ left: -4, right: 4, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 3.8% 16.1%)" />
                <XAxis dataKey="name" stroke="hsl(240 3.7% 65.9%)" fontSize={10} tick={{ fontSize: 10 }} />
                <YAxis stroke="hsl(240 3.7% 65.9%)" fontSize={10} tick={{ fontSize: 10 }} width={45} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(240 5.3% 7.1%)", border: "1px solid hsl(240 3.8% 16.1%)", borderRadius: "8px", fontSize: "11px" }}
                  formatter={(value: number) => [formatCurrency(value), "Revenue"]}
                />
                <Bar dataKey="revenue" name="Revenue" fill="hsl(24.6 95% 53.1%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        )}
        <div className="bg-card border border-border rounded-xl p-3 md:p-4">
          <h3 className="font-display font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
            <Video size={14} className="text-info" /> Videos per Day
          </h3>
          {chartData.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-12">No data for this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ left: -10, right: 4, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 3.8% 16.1%)" />
                <XAxis dataKey="name" stroke="hsl(240 3.7% 65.9%)" fontSize={10} tick={{ fontSize: 10 }} />
                <YAxis stroke="hsl(240 3.7% 65.9%)" fontSize={10} tick={{ fontSize: 10 }} width={35} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(240 5.3% 7.1%)", border: "1px solid hsl(240 3.8% 16.1%)", borderRadius: "8px", fontSize: "11px" }} />
                <Bar dataKey="videos" name="Videos" fill="hsl(217.2 91.2% 59.8%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Day-wise breakdown */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-3 md:p-4 border-b border-border">
          <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
            <CalendarDays size={16} className="text-primary" /> Day-wise Breakdown
            <span className="text-xs font-normal text-muted-foreground">({dayRows.length} days)</span>
          </h3>
        </div>
        <div className="p-3 md:p-4 space-y-2">
          {dayRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No activity in this period.</p>
          ) : (
            dayRows.map((row) => {
              const ci = row.checkin;
              const inTime = ci?.checkedInAt?.toDate?.() ? format(ci.checkedInAt.toDate(), "hh:mm a") : null;
              const outTime = ci?.checkedOutAt?.toDate?.() ? format(ci.checkedOutAt.toDate(), "hh:mm a") : null;
              const inMs = ci?.checkedInAt?.toDate?.()?.getTime?.() || 0;
              const outMs = ci?.checkedOutAt?.toDate?.()?.getTime?.() || 0;
              const hours = outMs > inMs ? ((outMs - inMs) / 3600000).toFixed(1) : null;
              return (
                <div key={row.date} className="bg-background border border-border rounded-lg p-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-medium text-foreground">{format(new Date(`${row.date}T00:00:00`), "EEE, dd MMM yyyy")}</span>
                      {ci ? (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${
                          ci.status === "approved" ? "bg-success/15 text-success"
                          : ci.status === "rejected" ? "bg-destructive/15 text-destructive"
                          : ci.status === "pending_approval" ? "bg-warning/15 text-warning"
                          : "bg-info/15 text-info"
                        }`}>{ci.status === "pending_approval" ? "Pending" : ci.status === "checked_in" ? "Working" : ci.status}</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">No check-in</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground"><Video size={10} className="inline mr-1" /><span className="text-foreground font-medium">{row.videos}</span> videos</span>
                      {showRevenue && <span className="text-primary font-bold">{formatCurrency(row.revenue)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground mt-1.5">
                    {inTime && <span>In: <span className="text-foreground">{inTime}</span></span>}
                    {outTime && <span>Out: <span className="text-foreground">{outTime}</span></span>}
                    {hours && <span><Clock size={10} className="inline" /> <span className="text-foreground">{hours}h</span></span>}
                    {ci?.totalVideos != null && <span>Reported: <span className="text-foreground">{ci.totalVideos} videos</span></span>}
                    {ci?.pendingTasks != null && <span>Pending at checkout: <span className="text-foreground">{ci.pendingTasks}</span></span>}
                  </div>
                  {ci?.summary && <p className="text-xs text-foreground mt-1.5">{ci.summary}</p>}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

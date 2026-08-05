import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { format, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock, Video, ClipboardList,
  ExternalLink, PartyPopper, LogIn, LogOut, CheckCircle2,
} from "lucide-react";
import type { DailyCheckin, WorkAssignment } from "@/types";
import {
  ATTENDANCE_META, AttendanceStatus, attendanceKey, daysBetween, isSunday,
  resolveStatus, summarize, todayDate, watchHolidayRecordsInRange, watchOverridesInRange, Holiday,
} from "@/services/techAttendance";
import { currentPayMonth, payPeriodForMonth } from "@/utils/payrollEngine";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const shiftMonth = (month: string, delta: number): string => {
  const [y, m] = month.split("-").map(Number);
  return format(new Date(y, m - 1 + delta, 1), "yyyy-MM");
};

const fmtTs = (ts?: { toDate?: () => Date }): string => (ts?.toDate ? format(ts.toDate(), "hh:mm a") : "—");

/**
 * One combined "My Days" calendar for a member: every day shows the attendance status
 * (P/H/A/L/holiday) merged with check-in data; clicking a day opens the full story of
 * that day — attendance, check-in/out times, videos, and every work item assigned or
 * completed that day.
 */
export default function MyDayCalendar({ memberId }: { memberId: string }) {
  /**
   * The month label is a PAY month, not a calendar one — the cycle runs 10th → 9th, so "Jul 2026"
   * here means 10 Jul → 09 Aug. `currentPayMonth` is what decides which one today belongs to; on
   * the 5th of August that is still July, and a calendar-derived default would have shown an empty
   * August grid while the member was working through July's cycle.
   */
  const [month, setMonth] = useState<string>(currentPayMonth());
  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [overrides, setOverrides] = useState<Map<string, AttendanceStatus>>(new Map());
  const [holidays, setHolidays] = useState<Map<string, Holiday>>(new Map());
  const [selected, setSelected] = useState<string>(todayDate());

  const todayStr = todayDate();

  useEffect(() => {
    if (!memberId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "daily_checkins"), where("memberId", "==", memberId)), (snap) =>
        setCheckins(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DailyCheckin)))),
      onSnapshot(query(collection(db, "work_assignments"), where("assignedTo", "==", memberId)), (snap) =>
        setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkAssignment)))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [memberId]);

  /** The cycle this label covers: 10th of `month` → 9th of the month after. */
  const period = useMemo(() => payPeriodForMonth(month), [month]);

  useEffect(() => {
    // Range-scoped, because the cycle straddles two calendar months and the month-scoped
    // listeners would drop everything after the 1st.
    const unsubs = [
      watchOverridesInRange(period.start, period.end, setOverrides),
      watchHolidayRecordsInRange(period.start, period.end, setHolidays),
    ];
    return () => unsubs.forEach((u) => u());
  }, [period.start, period.end]);

  const checkinByDate = useMemo(() => new Map(checkins.map((c) => [c.date, c])), [checkins]);

  const days = useMemo(() => daysBetween(period.start, period.end), [period.start, period.end]);

  const statusFor = (dateStr: string): AttendanceStatus | null =>
    resolveStatus({
      override: overrides.get(attendanceKey(memberId, dateStr)),
      checkedIn: checkinByDate.has(dateStr),
      dateStr,
      hasFestivalHoliday: holidays.has(dateStr),
      todayStr,
    });

  const summary = useMemo(() => summarize(days.map((d) => statusFor(d))), [days, overrides, holidays, checkinByDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Selected-day story ──
  const selCheckin = checkinByDate.get(selected);
  const selStatus = selected >= period.start && selected <= period.end ? statusFor(selected) : null;
  const selHoliday = holidays.get(selected);
  // Both keyed by the ASSIGNED date, not when the work was marked complete/submitted — a
  // video assigned on this day still belongs here even if it was finished days later.
  const assignedThatDay = assignments.filter((a) => a.date === selected);
  const completedThatDay = assignedThatDay.filter((a) => a.status === "completed" || a.status === "verified");

  // The grid pads to the weekday the CYCLE opens on, not the 1st of the month.
  const startPad = new Date(`${period.start}T00:00:00`).getDay();

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
          <CalendarDays size={16} className="text-primary" /> My Days — Attendance & Work
        </h2>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-background px-1">
          <button onClick={() => setMonth((mo) => shiftMonth(mo, -1))} className="p-1.5 hover:bg-accent rounded-md"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-semibold text-foreground px-1 min-w-[92px] text-center">{format(new Date(`${month}-01`), "MMM yyyy")}</span>
          <button onClick={() => setMonth((mo) => shiftMonth(mo, 1))} disabled={month >= currentPayMonth()}
            className="p-1.5 hover:bg-accent rounded-md disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {/* The span this grid actually covers, said out loud — "Jul 2026" above means 10 Jul → 09 Aug,
          and a reader who assumes a calendar month will miscount their own attendance. */}
      <p className="-mt-2 mb-3 text-[11px] text-muted-foreground">
        Cycle {format(new Date(`${period.start}T00:00:00`), "dd MMM")} – {format(new Date(`${period.end}T00:00:00`), "dd MMM yyyy")} · attendance and salary run 10th to 9th
      </p>

      {/* Cycle summary chips */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
        {([
          ["Present", summary.full, "text-emerald-500 bg-emerald-500/10"],
          ["Half Day", summary.half, "text-amber-500 bg-amber-500/10"],
          ["Absent", summary.absent, "text-rose-500 bg-rose-500/10"],
          ["Leave", summary.leave, "text-sky-500 bg-sky-500/10"],
          [`Leaves left`, summary.leavesLeft, "text-foreground bg-accent"],
        ] as const).map(([label, val, tone]) => (
          <div key={label} className={cn("rounded-lg px-2 py-2 text-center", tone)}>
            <div className="font-display font-bold text-lg leading-none">{val}</div>
            <div className="text-[10px] mt-1 opacity-80">{label}</div>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground mb-1">
        {WEEKDAYS.map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}
        {days.map((dateStr) => {
          const st = statusFor(dateStr);
          const ci = checkinByDate.get(dateStr);
          const didWork = assignments.some(
            (a) => a.date === dateStr && (a.status === "completed" || a.status === "verified"),
          );
          const isSel = selected === dateStr;
          return (
            <button key={dateStr} onClick={() => setSelected(dateStr)}
              title={`${format(new Date(dateStr), "EEE dd MMM")}${st ? " · " + ATTENDANCE_META[st].label : ""}`}
              className={cn(
                "aspect-square rounded-lg flex flex-col items-center justify-center text-xs font-mono transition-all relative border",
                st ? ATTENDANCE_META[st].tone : "text-muted-foreground border-transparent hover:bg-accent",
                isToday(new Date(dateStr)) && "font-bold",
                isSel ? "ring-2 ring-primary scale-105 z-10" : "hover:scale-105",
              )}>
              <span>{Number(dateStr.slice(-2))}</span>
              {st && <span className="text-[8px] font-bold leading-none">{ATTENDANCE_META[st].short}</span>}
              {didWork && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />}
              {ci && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-current opacity-60" />}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" /> work done</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground/60" /> checked in</span>
        {[...holidays.values()].map((h) => (
          <span key={h.date} className="inline-flex items-center gap-1 text-amber-500"><PartyPopper className="w-3 h-3" /> {h.label} · {format(new Date(h.date), "dd MMM")}</span>
        ))}
      </div>

      {/* ── Day story ── */}
      <div className="mt-4 rounded-xl border border-border bg-background p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <div className="font-display font-semibold text-foreground">
            {format(new Date(selected), "EEEE, dd MMMM yyyy")}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {selStatus && (
              <span className={cn("text-[11px] px-2 py-0.5 rounded-full border font-medium", ATTENDANCE_META[selStatus].tone)}>
                {ATTENDANCE_META[selStatus].label}
              </span>
            )}
            {selHoliday && (
              <span className="text-[11px] px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-600 border-amber-500/30 inline-flex items-center gap-1">
                <PartyPopper className="w-3 h-3" /> {selHoliday.label}
              </span>
            )}
            {isSunday(selected) && !selHoliday && (
              <span className="text-[11px] px-2 py-0.5 rounded-full border bg-slate-400/10 text-slate-500 border-slate-400/30">Sunday</span>
            )}
          </div>
        </div>

        {/* Check-in strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <div className="rounded-lg bg-card border border-border p-2.5">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1"><LogIn size={10} /> Check-in</div>
            <div className="text-sm font-mono font-semibold text-foreground mt-0.5">{fmtTs(selCheckin?.checkedInAt)}</div>
          </div>
          <div className="rounded-lg bg-card border border-border p-2.5">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1"><LogOut size={10} /> Check-out</div>
            <div className="text-sm font-mono font-semibold text-foreground mt-0.5">{fmtTs(selCheckin?.checkedOutAt)}</div>
          </div>
          <div className="rounded-lg bg-card border border-border p-2.5">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1"><Video size={10} /> Videos done</div>
            <div className="text-sm font-mono font-semibold text-foreground mt-0.5">{completedThatDay.length || selCheckin?.totalVideos || 0}</div>
          </div>
          <div className="rounded-lg bg-card border border-border p-2.5">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1"><ClipboardList size={10} /> Assigned</div>
            <div className="text-sm font-mono font-semibold text-foreground mt-0.5">{assignedThatDay.length}</div>
          </div>
        </div>

        {/* Work list */}
        {(assignedThatDay.length > 0 || completedThatDay.length > 0) ? (
          <div className="space-y-1.5">
            {[...new Map([...assignedThatDay, ...completedThatDay].map((a) => [a.id, a])).values()].map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{a.businessName || a.clientName || a.displayTitle}</div>
                  <div className="text-[10px] text-muted-foreground">{a.category}{a.clipCount ? ` · ${a.clipCount} clips` : ""}{a.duration ? ` · ${a.duration}` : ""}</div>
                </div>
                <span className={cn("shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium capitalize inline-flex items-center gap-1",
                  a.status === "verified" ? "bg-emerald-500/15 text-emerald-600"
                    : a.status === "completed" ? "bg-teal-500/15 text-teal-600"
                    : a.status === "editing" ? "bg-amber-500/15 text-amber-600"
                    : a.status === "in_progress" ? "bg-blue-500/15 text-blue-600"
                    : "bg-slate-500/15 text-slate-500")}>
                  {(a.status === "verified" || a.status === "completed") && <CheckCircle2 className="w-3 h-3" />}
                  {a.status.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-2">No work recorded on this day.</p>
        )}

        {/* Check-in extras */}
        {(selCheckin?.summary || selCheckin?.driveFolderUrl || selCheckin?.status) && (
          <div className="mt-3 pt-3 border-t border-border space-y-1.5">
            {selCheckin?.status && (
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Clock size={10} /> Day report:{" "}
                <span className={cn("px-1.5 py-0.5 rounded-full font-medium capitalize",
                  selCheckin.status === "approved" ? "bg-emerald-500/15 text-emerald-600"
                    : selCheckin.status === "rejected" ? "bg-rose-500/15 text-rose-600"
                    : selCheckin.status === "pending_approval" ? "bg-amber-500/15 text-amber-600"
                    : "bg-blue-500/15 text-blue-600")}>
                  {selCheckin.status === "pending_approval" ? "Pending approval" : selCheckin.status.replace("_", " ")}
                </span>
              </div>
            )}
            {selCheckin?.summary && <p className="text-xs text-foreground">{selCheckin.summary}</p>}
            {selCheckin?.driveFolderUrl && (
              <a href={selCheckin.driveFolderUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                <ExternalLink size={10} /> Drive folder
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

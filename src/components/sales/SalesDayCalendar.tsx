/**
 * A sales member's own attendance calendar — the same grid the tech team has, on their own data.
 *
 * Sales had a list of check-in rows instead, which answers "when did I check in on the 14th?" and
 * not the question anybody actually asks a calendar: how many days am I being paid for, and which
 * ones am I marked absent on. Since salary is deducted from exactly this count, the member needs to
 * be able to see it and dispute it before payroll runs, not after.
 *
 * A day a member checked in is Present. That is `resolveStatus`, shared with tech and with the
 * salary engine, so this grid and the payslip cannot drift apart — an override by an admin wins,
 * Sundays and festivals are holidays, a past working day with no check-in is Absent, and today is
 * left blank until they check in rather than pre-marked.
 *
 * ── What it costs ────────────────────────────────────────────────────────────────────────────
 * One member-scoped listener on `salesCheckins` plus the two shared range listeners for overrides
 * and holidays. Nothing here scans the company.
 */
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { format, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { CalendarDays, ChevronLeft, ChevronRight, LogIn, LogOut, PartyPopper, IndianRupee } from "lucide-react";
import type { SalesCheckin } from "@/services/salesCheckin";
import {
  ATTENDANCE_META, AttendanceStatus, attendanceKey, daysBetween, resolveStatus, summarize,
  todayDate, watchHolidayRecordsInRange, watchOverridesInRange, Holiday,
} from "@/services/techAttendance";
import { currentPayMonth, payPeriodForMonth } from "@/utils/payrollEngine";
import { formatCurrency } from "@/utils/formatters";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const shiftMonth = (month: string, delta: number): string => {
  const [y, m] = month.split("-").map(Number);
  return format(new Date(y, m - 1 + delta, 1), "yyyy-MM");
};

const fmtTs = (ts: unknown): string => {
  const s = (ts as { seconds?: number } | null)?.seconds;
  return s ? format(new Date(s * 1000), "hh:mm a") : "—";
};

export default function SalesDayCalendar({ memberId }: { memberId: string }) {
  /** A PAY month: "Jul 2026" here means 10 Jul → 09 Aug, which is what salary is counted over. */
  const [month, setMonth] = useState<string>(currentPayMonth());
  const [checkins, setCheckins] = useState<SalesCheckin[]>([]);
  const [overrides, setOverrides] = useState<Map<string, AttendanceStatus>>(new Map());
  const [holidays, setHolidays] = useState<Map<string, Holiday>>(new Map());
  const [selected, setSelected] = useState<string>(todayDate());

  const todayStr = todayDate();
  const period = useMemo(() => payPeriodForMonth(month), [month]);

  useEffect(() => {
    if (!memberId) return;
    return onSnapshot(
      query(collection(db, "salesCheckins"), where("memberId", "==", memberId)),
      (snap) => setCheckins(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SalesCheckin))),
      () => setCheckins([]),
    );
  }, [memberId]);

  useEffect(() => {
    // Range-scoped: the cycle straddles two calendar months, so a month listener would drop
    // everything after the 1st.
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

  const selCheckin = checkinByDate.get(selected);
  const selStatus = selected >= period.start && selected <= period.end ? statusFor(selected) : null;
  const selHoliday = holidays.get(selected);

  /** The grid pads to the weekday the CYCLE opens on, not the 1st of the month. */
  const startPad = new Date(`${period.start}T00:00:00`).getDay();

  return (
    <div className="bg-card border border-border rounded-xl p-5" data-test="sales-day-calendar">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
          <CalendarDays size={16} className="text-primary" /> My Attendance
        </h2>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-background px-1">
          <button onClick={() => setMonth((mo) => shiftMonth(mo, -1))} className="p-1.5 hover:bg-accent rounded-md" aria-label="Previous cycle">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-foreground px-1 min-w-[92px] text-center">
            {format(new Date(`${month}-01`), "MMM yyyy")}
          </span>
          <button onClick={() => setMonth((mo) => shiftMonth(mo, 1))} disabled={month >= currentPayMonth()}
            className="p-1.5 hover:bg-accent rounded-md disabled:opacity-30" aria-label="Next cycle">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <p className="-mt-2 mb-3 text-[11px] text-muted-foreground">
        Cycle {format(new Date(`${period.start}T00:00:00`), "dd MMM")} – {format(new Date(`${period.end}T00:00:00`), "dd MMM yyyy")} · attendance and salary run 10th to 9th
      </p>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
        {([
          ["Present", summary.full, "text-emerald-500 bg-emerald-500/10"],
          ["Half Day", summary.half, "text-amber-500 bg-amber-500/10"],
          ["Absent", summary.absent, "text-rose-500 bg-rose-500/10"],
          ["Leave", summary.leave, "text-sky-500 bg-sky-500/10"],
          ["Leaves left", summary.leavesLeft, "text-foreground bg-accent"],
        ] as const).map(([label, val, tone]) => (
          <div key={label} className={cn("rounded-lg px-2 py-2 text-center", tone)}>
            <div className="font-display font-bold text-lg leading-none" data-test={`sales-attendance-${label.toLowerCase().replace(/ /g, "-")}`}>{val}</div>
            <div className="text-[10px] mt-1 opacity-80">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground mb-1">
        {WEEKDAYS.map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}
        {days.map((dateStr) => {
          const st = statusFor(dateStr);
          const ci = checkinByDate.get(dateStr);
          const sold = (ci?.totalSalesAmount || 0) > 0;
          const isSel = selected === dateStr;
          return (
            <button key={dateStr} onClick={() => setSelected(dateStr)}
              data-test="sales-attendance-day"
              title={`${format(new Date(dateStr), "EEE dd MMM")}${st ? " · " + ATTENDANCE_META[st].label : ""}`}
              className={cn(
                "aspect-square rounded-lg flex flex-col items-center justify-center text-xs font-mono transition-all relative border",
                st ? ATTENDANCE_META[st].tone : "text-muted-foreground border-transparent hover:bg-accent",
                isToday(new Date(dateStr)) && "font-bold",
                isSel ? "ring-2 ring-primary scale-105 z-10" : "hover:scale-105",
              )}>
              <span>{Number(dateStr.slice(-2))}</span>
              {st && <span className="text-[8px] font-bold leading-none">{ATTENDANCE_META[st].short}</span>}
              {sold && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />}
              {ci && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-current opacity-60" />}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" /> sold that day</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground/60" /> checked in</span>
        {[...holidays.values()].map((h) => (
          <span key={h.date} className="inline-flex items-center gap-1 text-amber-500">
            <PartyPopper className="w-3 h-3" /> {h.label} · {format(new Date(h.date), "dd MMM")}
          </span>
        ))}
      </div>

      {/* ── The selected day ── */}
      <div className="mt-4 rounded-xl border border-border bg-background p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <div className="font-display font-semibold text-foreground">
            {format(new Date(selected), "EEEE, dd MMMM yyyy")}
          </div>
          {selStatus && (
            <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border", ATTENDANCE_META[selStatus].tone)}>
              {ATTENDANCE_META[selStatus].label}
            </span>
          )}
        </div>

        {selHoliday && (
          <p className="mb-2 inline-flex items-center gap-1 text-xs text-amber-500">
            <PartyPopper className="w-3 h-3" /> {selHoliday.label}
          </p>
        )}

        {selCheckin ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-border px-3 py-2">
              <p className="text-[10px] text-muted-foreground flex items-center gap-1"><LogIn className="w-3 h-3" /> Checked in</p>
              <p className="text-sm font-mono text-foreground">{fmtTs(selCheckin.checkInAt)}</p>
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <p className="text-[10px] text-muted-foreground flex items-center gap-1"><LogOut className="w-3 h-3" /> Checked out</p>
              <p className="text-sm font-mono text-foreground">{fmtTs(selCheckin.checkOutAt)}</p>
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <p className="text-[10px] text-muted-foreground flex items-center gap-1"><IndianRupee className="w-3 h-3" /> Sold</p>
              {/* Written by the check-out report, so before check-out there is no figure — not a
                  figure of zero. Printing ₹0 next to a morning's selling reads as a contradiction
                  of the dashboard, and it is the calendar that would be wrong. */}
              {selCheckin.checkOutAt ? (
                <p className="text-sm font-mono text-success">
                  {formatCurrency(selCheckin.totalSalesAmount || 0)}
                  {selCheckin.salesCount ? <span className="ml-1 text-[10px] text-muted-foreground">· {selCheckin.salesCount}</span> : null}
                </p>
              ) : (
                <p className="text-sm font-mono text-muted-foreground">— <span className="text-[10px]">at check-out</span></p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {selected > todayStr
              ? "Not here yet."
              : selStatus === "holiday"
                ? "No work scheduled."
                : selected === todayStr
                  ? "Not checked in yet — check in from the Dashboard to mark today present."
                  : "No check-in recorded for this day."}
          </p>
        )}
      </div>
    </div>
  );
}

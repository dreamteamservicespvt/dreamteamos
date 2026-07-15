import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import {
  ATTENDANCE_META,
  AttendanceStatus,
  attendanceKey,
  daysInMonth,
  resolveStatus,
  summarize,
  todayDate,
  todayMonth,
  watchCheckedInDays,
  watchHolidays,
  watchOverrides,
  Holiday,
  MONTHLY_LEAVE_QUOTA,
} from "@/services/techAttendance";

/** Read-only monthly attendance for a single member (shown in their own profile). */
export default function MemberAttendanceCard({ memberId }: { memberId: string }) {
  const [month] = useState<string>(todayMonth());
  const [overrides, setOverrides] = useState<Map<string, AttendanceStatus>>(new Map());
  const [holidays, setHolidays] = useState<Map<string, Holiday>>(new Map());
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set());
  const todayStr = todayDate();

  useEffect(() => {
    const unsubs = [
      watchOverrides(month, setOverrides),
      watchHolidays(month, setHolidays),
      watchCheckedInDays(month, setCheckedIn),
    ];
    return () => unsubs.forEach((u) => u());
  }, [month]);

  const days = useMemo(() => daysInMonth(month), [month]);

  const statuses = days.map((d) =>
    resolveStatus({
      override: overrides.get(attendanceKey(memberId, d)),
      checkedIn: checkedIn.has(attendanceKey(memberId, d)),
      dateStr: d,
      hasFestivalHoliday: holidays.has(d),
      todayStr,
    }),
  );
  const sum = summarize(statuses);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" /> Attendance
        </h3>
        <span className="text-xs text-muted-foreground">{format(new Date(`${month}-01`), "MMMM yyyy")}</span>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        <Stat label="Full" value={sum.full} tone="text-emerald-600" />
        <Stat label="Half" value={sum.half} tone="text-amber-600" />
        <Stat label="Absent" value={sum.absent} tone="text-rose-600" />
        <Stat label="Leave" value={`${sum.leave}/${MONTHLY_LEAVE_QUOTA}`} tone="text-sky-600" />
      </div>

      <div className="grid grid-cols-7 gap-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-center text-[10px] text-muted-foreground font-medium">{d}</div>
        ))}
        {/* pad to the first weekday */}
        {Array.from({ length: new Date(`${month}-01`).getDay() }).map((_, i) => <div key={`pad-${i}`} />)}
        {days.map((d, i) => {
          const st = statuses[i];
          const isToday = d === todayStr;
          return (
            <div key={d}
              className={cn("aspect-square rounded-md border flex flex-col items-center justify-center text-[10px]",
                st ? ATTENDANCE_META[st].tone : "bg-transparent border-dashed border-border text-muted-foreground/40",
                isToday && "ring-2 ring-primary")}
              title={`${format(new Date(d), "EEE dd MMM")}${st ? " · " + ATTENDANCE_META[st].label : ""}`}>
              <span className="font-semibold">{d.slice(-2)}</span>
              {st && <span className="text-[8px] leading-none">{ATTENDANCE_META[st].short}</span>}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Present days: <span className="font-semibold text-foreground">{sum.presentDays}</span> · Leaves left:{" "}
        <span className="font-semibold text-foreground">{sum.leavesLeft}</span>
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2 text-center">
      <div className={cn("text-lg font-bold", tone)}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

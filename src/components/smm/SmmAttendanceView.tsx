/**
 * Social Media → Attendance — the Social Media Team Lead's view of their team's days (2026-10-08).
 *
 * The owner asked for an attendance view for the Social Media team leader and chose, when asked: the people
 * holding a seat on a Social Media month RUNNING NOW (utils/smmAttendance — the lead is a flag on a tech
 * member, so the months' seats are the only "Social Media team" there is); VIEW ONLY; the PAY-CYCLE GRID
 * the admins read on Team Attendance (10th → 9th); and here, a view beside Cards / Insights / Calendar /
 * Money. So this is that grid (components/attendance/AttendanceGrid), read-only, for those people — the
 * days are worked out exactly as everywhere else (techAttendance.resolveStatus: a manual mark, else a
 * Sunday or holiday, else checked in = present, a past day without = absent), and marking stays with the
 * admins on Team Attendance, because a mark changes the salary.
 *
 * Reads: the seat holders' user records once by id (useUsersByIds), and the cycle's marks, holidays and
 * check-ins while the view is open — the same range readers Team Attendance uses.
 */
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarCheck, ChevronLeft, ChevronRight, Loader2, PartyPopper, Search, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import AttendanceGrid from "@/components/attendance/AttendanceGrid";
import {
  ATTENDANCE_META, attendanceKey, daysBetween, resolveStatus, todayDate,
  watchCheckedInDaysInRange, watchHolidayRecordsInRange, watchOverridesInRange,
  type AttendanceStatus, type Holiday,
} from "@/services/techAttendance";
import { currentPayMonth, payPeriodForMonth } from "@/utils/payrollEngine";
import { useUsersByIds } from "@/hooks/useUsersByIds";
import { seatLine, smmTeamPeople, type SmmTeamPerson } from "@/utils/smmAttendance";
import { getRoleLabel } from "@/utils/roleHelpers";
import type { SmmCampaign } from "@/types/smm";
import type { AppUser } from "@/types";

const STATUS_ORDER: AttendanceStatus[] = ["full", "half", "absent", "leave", "holiday"];

const shiftMonth = (month: string, delta: number): string => {
  const [y, m] = month.split("-").map(Number);
  return format(new Date(y, m - 1 + delta, 1), "yyyy-MM");
};

/** A person on the grid: their seats and clients, and their user record. */
type Row = SmmTeamPerson & { user: AppUser };

export default function SmmAttendanceView({ campaigns, today }: { campaigns: SmmCampaign[]; today: string }) {
  const people = useMemo(() => smmTeamPeople(campaigns, today), [campaigns, today]);
  const uids = useMemo(() => people.map((p) => p.uid), [people]);
  const { users, loading } = useUsersByIds(uids);

  /** A PAY month — the 10th → 9th cycle the salary and the leave quota are settled over (as Team Attendance). */
  const [month, setMonth] = useState<string>(currentPayMonth());
  const period = useMemo(() => payPeriodForMonth(month), [month]);
  const [overrides, setOverrides] = useState<Map<string, AttendanceStatus>>(new Map());
  const [holidays, setHolidays] = useState<Map<string, Holiday>>(new Map());
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    const unsubs = [
      watchOverridesInRange(period.start, period.end, setOverrides),
      watchHolidayRecordsInRange(period.start, period.end, setHolidays),
      watchCheckedInDaysInRange(period.start, period.end, setCheckedIn),
    ];
    return () => unsubs.forEach((u) => u());
  }, [period.start, period.end]);

  /*
    Who is on the grid: the tech members, still active, who check in every working day. Anybody else on a
    month's seat — a tech team leader, an external creator — never checks in, so a grid of their days would
    read Absent all month; they are named under the grid instead of being shown wrong.
  */
  const { rows, notListed } = useMemo(() => {
    const onGrid: Row[] = [];
    const off: { name: string; why: string }[] = [];
    for (const p of people) {
      const u = users.get(p.uid);
      if (!u) {
        if (!loading) off.push({ name: p.name, why: "no account found" });
        continue;
      }
      if (u.isActive === false) off.push({ name: u.name || p.name, why: "no longer active" });
      else if (u.role !== "tech_member" || u.externalCreator) off.push({ name: u.name || p.name, why: `${u.externalCreator ? "External creator" : getRoleLabel(u.role)} — does not check in` });
      else onGrid.push({ ...p, name: u.name || p.name, user: u });
    }
    return { rows: onGrid, notListed: off };
  }, [people, users, loading]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.clients.some((c) => c.toLowerCase().includes(q)));
  }, [rows, search]);

  const todayStr = todayDate();
  const days = useMemo(() => daysBetween(period.start, period.end), [period.start, period.end]);
  const cycleHolidays = useMemo(() => [...holidays.values()].sort((a, b) => a.date.localeCompare(b.date)), [holidays]);
  const statusFor = (row: Row, date: string): AttendanceStatus | null =>
    resolveStatus({
      override: overrides.get(attendanceKey(row.uid, date)),
      checkedIn: checkedIn.has(attendanceKey(row.uid, date)),
      dateStr: date,
      hasFestivalHoliday: holidays.has(date),
      todayStr,
    });

  return (
    <section data-test="smm-attendance" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <CalendarCheck size={18} className="text-primary" /> Attendance — Social Media team
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            The tech members working on the Social Media months running today. View only — days are marked from their
            check-ins, and the admins correct them in Team Attendance.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-1" data-test="smm-attendance-cycle">
          <button type="button" aria-label="Previous cycle" onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="rounded-md p-1.5 hover:bg-accent"><ChevronLeft className="h-4 w-4" /></button>
          <span className="flex min-w-[104px] flex-col px-1 text-center leading-tight">
            <span className="text-sm font-semibold text-foreground">{format(new Date(`${month}-01T00:00:00`), "MMM yyyy")}</span>
            <span className="text-[10px] text-muted-foreground">
              {format(new Date(`${period.start}T00:00:00`), "dd MMM")} – {format(new Date(`${period.end}T00:00:00`), "dd MMM")}
            </span>
          </span>
          <button type="button" aria-label="Next cycle" onClick={() => setMonth((m) => shiftMonth(m, 1))} disabled={month >= currentPayMonth()}
            className="rounded-md p-1.5 hover:bg-accent disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {/* What each mark means, and the cycle's announced holidays. */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_ORDER.map((s) => (
          <span key={s} className={cn("rounded-full border px-2 py-0.5 text-[11px]", ATTENDANCE_META[s].tone)}>
            {ATTENDANCE_META[s].short} · {ATTENDANCE_META[s].label}
          </span>
        ))}
        {cycleHolidays.map((h) => (
          <span key={h.date} className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600">
            <PartyPopper className="h-3 w-3" /> {h.label} · {format(new Date(h.date), "dd MMM")}
          </span>
        ))}
      </div>

      {rows.length > 1 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={search} data-test="smm-attendance-search" onChange={(e) => setSearch(e.target.value)}
            placeholder="Search a person or a client…"
            className="h-9 w-full rounded-xl border border-border/70 bg-background pl-9 pr-8 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20" />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {people.length === 0 ? (
        <p data-test="smm-attendance-empty" className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No Social Media month is running today, so there is nobody to show. People appear here once a running month has a team.
        </p>
      ) : loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={26} /></div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          <Users className="h-8 w-8 opacity-40" /> Nobody on the running months checks in — see the note below.
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          <Search className="h-8 w-8 opacity-40" /> Nobody matches “{search.trim()}”.
        </div>
      ) : (
        <AttendanceGrid
          members={shown}
          days={days}
          todayStr={todayStr}
          isHoliday={(d) => holidays.has(d)}
          statusFor={statusFor}
          isOverride={(r, d) => overrides.has(attendanceKey(r.uid, d))}
          renderBadge={(r) => (
            <div className="mt-1 truncate text-[10px] text-muted-foreground" title={r.clients.join(", ")} data-test="smm-attendance-seats">
              {seatLine(r)}
            </div>
          )}
        />
      )}

      {notListed.length > 0 && (
        <p data-test="smm-attendance-not-listed" className="text-xs text-muted-foreground">
          Also on the running months, not on the grid: {notListed.map((n) => `${n.name} (${n.why})`).join(", ")}.
        </p>
      )}
    </section>
  );
}

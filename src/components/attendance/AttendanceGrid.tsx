/**
 * The attendance grid — one row (or, on a phone, one month card) per member, one cell per day of the
 * pay cycle, P / H / A / L / holiday in the shared colours, and each member's totals.
 *
 * Lifted out of Team Attendance on 2026-10-08 so Social Media → Attendance (the Social Media Team Lead's
 * view-only grid) draws the SAME grid rather than a second copy of it. With `onCellClick` a cell opens the
 * override editor (Team Attendance); without it the grid is read-only — the cells are plain marks.
 */
import type { ReactNode } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ATTENDANCE_META, isSunday, summarize, type AttendanceStatus } from "@/services/techAttendance";

export interface AttendanceGridMember {
  uid: string;
  name?: string;
}

interface Props<M extends AttendanceGridMember> {
  members: M[];
  /** The days of the cycle, in order (techAttendance.daysBetween). */
  days: string[];
  todayStr: string;
  /** An announced holiday — its column header is tinted like a Sunday's. */
  isHoliday: (date: string) => boolean;
  statusFor: (member: M, date: string) => AttendanceStatus | null;
  /** A day an admin marked by hand — ringed, and said so in its tooltip. */
  isOverride: (member: M, date: string) => boolean;
  /** Opens the editor for a cell. Absent → the grid is view-only. */
  onCellClick?: (member: M, date: string, current: AttendanceStatus | null) => void;
  /** What sits under a member's name — the Full-Time / Part-Time switch, or their Social Media seats. */
  renderBadge?: (member: M, layout: "card" | "table") => ReactNode;
}

const cellTitle = (date: string, status: AttendanceStatus | null, manual: boolean) =>
  `${format(new Date(date), "EEE dd MMM")}${status ? " · " + ATTENDANCE_META[status].label : ""}${manual ? " (manual)" : ""}`;

/** The P / H / A / L counts and the leaves left — the same words on the card and in the table. */
function Totals({ statuses, size }: { statuses: (AttendanceStatus | null)[]; size: "card" | "table" }) {
  const sum = summarize(statuses);
  return (
    <>
      <div className={size === "card" ? "text-[11px] whitespace-nowrap" : "text-[10px] text-muted-foreground whitespace-nowrap"}>
        <span className="text-emerald-600 font-semibold">{sum.full}P</span>{" "}
        <span className="text-amber-600 font-semibold">{sum.half}H</span>{" "}
        <span className="text-rose-600 font-semibold">{sum.absent}A</span>{" "}
        <span className="text-sky-600 font-semibold">{sum.leave}L</span>
      </div>
      <div className="text-[9px] text-muted-foreground mt-0.5">Leaves left: {sum.leavesLeft}</div>
    </>
  );
}

export default function AttendanceGrid<M extends AttendanceGridMember>({
  members, days, todayStr, isHoliday, statusFor, isOverride, onCellClick, renderBadge,
}: Props<M>) {
  const readOnly = !onCellClick;
  return (
    <>
      {/* Mobile: one card per member with a real month calendar (a 30-column table is unusable
          on a phone). Same colour language and the same cells as desktop. */}
      <div className="md:hidden space-y-3" data-test="attendance-cards">
        {members.map((m) => {
          const statuses = days.map((d) => statusFor(m, d));
          const firstDow = new Date(`${days[0]}T00:00:00`).getDay();
          return (
            <div key={m.uid} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className="min-w-0">
                  <div className="font-medium text-foreground truncate">{m.name}</div>
                  {renderBadge?.(m, "card")}
                </div>
                <div className="text-right shrink-0">
                  <Totals statuses={statuses} size="card" />
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => (
                  <div key={i} className="text-center text-[9px] font-medium text-muted-foreground pb-0.5">{w}</div>
                ))}
                {Array.from({ length: firstDow }).map((_, i) => <div key={`blank-${i}`} />)}
                {days.map((d, i) => {
                  const st = statuses[i];
                  const manual = isOverride(m, d);
                  const tone = cn(
                    "aspect-square rounded-md flex flex-col items-center justify-center gap-0.5 border text-[11px] font-bold",
                    !readOnly && "active:scale-95 transition-transform",
                    st ? ATTENDANCE_META[st].tone : "bg-transparent text-muted-foreground/40 border-dashed border-border",
                    manual && "ring-1 ring-primary/50",
                    d === todayStr && "outline outline-1 outline-primary outline-offset-1",
                  );
                  const body = (
                    <>
                      <span className="text-[9px] font-medium leading-none opacity-70">{d.slice(-2)}</span>
                      <span className="leading-none">{st ? ATTENDANCE_META[st].short : "·"}</span>
                    </>
                  );
                  return readOnly ? (
                    <span key={d} title={cellTitle(d, st, manual)} className={tone}>{body}</span>
                  ) : (
                    <button key={d} onClick={() => onCellClick!(m, d, st)} title={cellTitle(d, st, manual)} className={tone}>{body}</button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: the full month-grid table. */}
      <div className="hidden md:block rounded-xl border border-border bg-card overflow-hidden" data-test="attendance-table">
        {/* table-fixed + colgroup: the WHOLE month always fits the available width on desktop.
            The wrapper is capped and scrolls in BOTH axes so the date header can stick to its
            top — with the page as the scrollport the header scrolled away, which made marking
            attendance for a member far down the list guesswork. */}
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[860px] table-fixed text-sm border-collapse">
            <colgroup>
              <col style={{ width: 150 }} />
              <col style={{ width: 86 }} />
              {days.map((d) => <col key={d} />)}
            </colgroup>
            <thead>
              <tr className="bg-muted/50">
                {/* z-30 on the corner cell so it stays above both the sticky row and column. */}
                <th className="sticky left-0 top-0 z-30 bg-muted text-left px-3 py-2 font-semibold text-foreground">Member</th>
                <th className="sticky top-0 z-20 bg-muted px-1 py-2 font-semibold text-foreground text-center">Summary</th>
                {days.map((d) => {
                  const sun = isSunday(d);
                  const fest = isHoliday(d);
                  return (
                    <th key={d} className={cn("sticky top-0 z-20 bg-muted px-0 py-1.5 font-medium text-center",
                      d === todayStr ? "text-primary" : sun || fest ? "text-amber-500/80" : "text-muted-foreground")}>
                      <div className="text-[9px] leading-tight">{format(new Date(d), "EEE")[0]}</div>
                      <div className="text-[11px]">{d.slice(-2)}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const statuses = days.map((d) => statusFor(m, d));
                return (
                  <tr key={m.uid} className="border-t border-border">
                    <td className="sticky left-0 z-10 bg-card px-3 py-2 align-top">
                      <div className="font-medium text-foreground truncate">{m.name}</div>
                      {renderBadge?.(m, "table")}
                    </td>
                    <td className="px-1 py-2 text-center align-top">
                      <Totals statuses={statuses} size="table" />
                    </td>
                    {days.map((d, i) => {
                      const st = statuses[i];
                      const manual = isOverride(m, d);
                      const tone = cn(
                        "w-full max-w-[30px] h-6 rounded text-[10px] font-bold border mx-auto block",
                        readOnly ? "leading-[22px] text-center" : "transition-all hover:scale-110",
                        st ? ATTENDANCE_META[st].tone : "bg-transparent text-muted-foreground/40 border-dashed border-border",
                        manual && "ring-1 ring-primary/50",
                      );
                      return (
                        <td key={d} className="px-[1px] py-1 text-center">
                          {readOnly ? (
                            <span className={tone} title={cellTitle(d, st, manual)}>{st ? ATTENDANCE_META[st].short : "·"}</span>
                          ) : (
                            <button onClick={() => onCellClick!(m, d, st)} className={tone} title={cellTitle(d, st, manual)}>
                              {st ? ATTENDANCE_META[st].short : "·"}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

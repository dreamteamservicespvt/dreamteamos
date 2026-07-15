import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, PartyPopper, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AppUser } from "@/types";
import {
  ATTENDANCE_META,
  AttendanceStatus,
  announceHoliday,
  clearAttendanceOverride,
  daysInMonth,
  resolveStatus,
  setAttendanceOverride,
  summarize,
  todayDate,
  todayMonth,
  watchCheckedInDays,
  watchHolidays,
  watchOverrides,
  attendanceKey,
  Holiday,
} from "@/services/techAttendance";
import { EMPLOYMENT_LABELS, employmentOf, setEmploymentType } from "@/services/employment";

const shiftMonth = (month: string, delta: number): string => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return format(d, "yyyy-MM");
};

const STATUS_ORDER: AttendanceStatus[] = ["full", "half", "absent", "leave", "holiday"];

export default function TeamAttendance() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [month, setMonth] = useState<string>(todayMonth());
  const [overrides, setOverrides] = useState<Map<string, AttendanceStatus>>(new Map());
  const [holidays, setHolidays] = useState<Map<string, Holiday>>(new Map());
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ member: AppUser; date: string; current: AttendanceStatus | null } | null>(null);

  const todayStr = todayDate();

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      setAllUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsubs = [
      watchOverrides(month, setOverrides),
      watchHolidays(month, setHolidays),
      watchCheckedInDays(month, setCheckedIn),
    ];
    return () => unsubs.forEach((u) => u());
  }, [month]);

  // Members whose attendance this admin / lead manages: tech members on their team.
  const members = useMemo(() => {
    if (!user) return [];
    const teamAdminUid = user.role === "tech_team_leader" ? user.createdBy : user.uid;
    return allUsers
      .filter((u) => u.role === "tech_member" && u.createdBy === teamAdminUid)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [allUsers, user]);

  const days = useMemo(() => daysInMonth(month).filter((d) => d <= todayStr || d.slice(0, 7) === todayStr.slice(0, 7)), [month, todayStr]);

  const statusFor = (member: AppUser, date: string): AttendanceStatus | null =>
    resolveStatus({
      override: overrides.get(attendanceKey(member.uid, date)),
      checkedIn: checkedIn.has(attendanceKey(member.uid, date)),
      dateStr: date,
      hasFestivalHoliday: holidays.has(date),
      todayStr,
    });

  const applyStatus = async (member: AppUser, date: string, status: AttendanceStatus | "auto") => {
    if (!user) return;
    try {
      if (status === "auto") await clearAttendanceOverride(member.uid, date);
      else await setAttendanceOverride(member, date, status, { uid: user.uid, name: user.name });
      setEditing(null);
    } catch {
      toast({ title: "Error", description: "Could not update attendance.", variant: "destructive" });
    }
  };

  const toggleEmployment = async (member: AppUser) => {
    const next = employmentOf(member.employmentType) === "full_time" ? "part_time" : "full_time";
    try {
      await setEmploymentType(member.uid, next);
      toast({ title: "Updated", description: `${member.name} → ${EMPLOYMENT_LABELS[next]}.` });
    } catch {
      toast({ title: "Error", description: "Could not update employment type.", variant: "destructive" });
    }
  };

  const handleAnnounceHoliday = async () => {
    if (!user) return;
    const date = window.prompt("Holiday date (YYYY-MM-DD):", todayStr);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const label = window.prompt("Holiday name (e.g. Diwali):", "Festival Holiday") || "Holiday";
    try {
      await announceHoliday(date, label, { uid: user.uid });
      setMonth(date.slice(0, 7));
      toast({ title: "Holiday announced", description: `${label} on ${date}.` });
    } catch {
      toast({ title: "Error", description: "Could not announce holiday.", variant: "destructive" });
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display font-bold text-xl md:text-2xl text-foreground flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" /> Team Attendance
          </h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-1">
            Auto-marked from daily check-ins — Full Day on check-in, Absent otherwise. Click any cell to override.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleAnnounceHoliday}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-card hover:bg-accent text-foreground">
            <PartyPopper className="w-4 h-4 text-amber-500" /> Announce Holiday
          </button>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-1">
            <button onClick={() => setMonth((m) => shiftMonth(m, -1))} className="p-1.5 hover:bg-accent rounded-md"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-semibold text-foreground px-1 min-w-[92px] text-center">{format(new Date(`${month}-01`), "MMM yyyy")}</span>
            <button onClick={() => setMonth((m) => shiftMonth(m, 1))} disabled={month >= todayMonth()}
              className="p-1.5 hover:bg-accent rounded-md disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_ORDER.map((s) => (
          <span key={s} className={cn("text-[11px] px-2 py-0.5 rounded-full border", ATTENDANCE_META[s].tone)}>
            {ATTENDANCE_META[s].short} · {ATTENDANCE_META[s].label}
          </span>
        ))}
      </div>

      {members.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
          <Users className="w-8 h-8 opacity-40" /> No team members yet.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted/50">
                  <th className="sticky left-0 z-10 bg-muted/50 text-left px-3 py-2 font-semibold text-foreground min-w-[190px]">Member</th>
                  <th className="px-2 py-2 font-semibold text-foreground text-center min-w-[120px]">Summary</th>
                  {days.map((d) => (
                    <th key={d} className={cn("px-1 py-2 font-medium text-center min-w-[34px]", d === todayStr ? "text-primary" : "text-muted-foreground")}>
                      <div className="text-[10px] leading-tight">{format(new Date(d), "EEE")[0]}</div>
                      <div className="text-xs">{d.slice(-2)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const statuses = days.map((d) => statusFor(m, d));
                  const sum = summarize(statuses);
                  const emp = employmentOf(m.employmentType);
                  return (
                    <tr key={m.uid} className="border-t border-border">
                      <td className="sticky left-0 z-10 bg-card px-3 py-2 align-top">
                        <div className="font-medium text-foreground truncate max-w-[170px]">{m.name}</div>
                        <button onClick={() => toggleEmployment(m)}
                          title="Click to switch Full-Time / Part-Time"
                          className={cn("mt-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                            emp === "full_time"
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20"
                              : "bg-violet-500/10 text-violet-600 border-violet-500/30 hover:bg-violet-500/20")}>
                          {EMPLOYMENT_LABELS[emp]} ⇄
                        </button>
                      </td>
                      <td className="px-2 py-2 text-center align-top">
                        <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                          <span className="text-emerald-600 font-semibold">{sum.full}F</span> ·{" "}
                          <span className="text-amber-600 font-semibold">{sum.half}H</span> ·{" "}
                          <span className="text-rose-600 font-semibold">{sum.absent}A</span> ·{" "}
                          <span className="text-sky-600 font-semibold">{sum.leave}L</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">Leaves left: {sum.leavesLeft}</div>
                      </td>
                      {days.map((d, i) => {
                        const st = statuses[i];
                        const isOverride = overrides.has(attendanceKey(m.uid, d));
                        return (
                          <td key={d} className="px-0.5 py-1 text-center">
                            <button
                              onClick={() => setEditing({ member: m, date: d, current: st })}
                              className={cn(
                                "w-7 h-7 rounded-md text-[11px] font-bold border transition-all hover:scale-105",
                                st ? ATTENDANCE_META[st].tone : "bg-transparent text-muted-foreground/40 border-dashed border-border",
                                isOverride && "ring-1 ring-primary/50",
                              )}
                              title={`${format(new Date(d), "EEE dd MMM")}${st ? " · " + ATTENDANCE_META[st].label : ""}${isOverride ? " (manual)" : ""}`}
                            >
                              {st ? ATTENDANCE_META[st].short : "·"}
                            </button>
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
      )}

      {/* Cell override editor */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-xs rounded-xl border border-border bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 font-semibold text-foreground">{editing.member.name}</div>
            <div className="mb-3 text-xs text-muted-foreground">{format(new Date(editing.date), "EEEE, dd MMM yyyy")}</div>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_ORDER.map((s) => (
                <button key={s} onClick={() => applyStatus(editing.member, editing.date, s)}
                  className={cn("px-3 py-2 rounded-lg text-xs font-medium border text-left", ATTENDANCE_META[s].tone,
                    editing.current === s && "ring-2 ring-primary")}>
                  {ATTENDANCE_META[s].label}
                </button>
              ))}
              <button onClick={() => applyStatus(editing.member, editing.date, "auto")}
                className="px-3 py-2 rounded-lg text-xs font-medium border border-border bg-card hover:bg-accent text-foreground text-left">
                Auto (from check-in)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

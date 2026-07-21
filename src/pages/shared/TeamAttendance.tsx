import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, ChevronLeft, ChevronRight, PartyPopper, Trash2, Users, X, CheckCircle2, User, CalendarClock, Clock3, UserCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AppUser } from "@/types";
import {
  ATTENDANCE_META,
  AttendanceStatus,
  announceHoliday,
  clearAttendanceOverride,
  daysInMonth,
  deleteHoliday,
  isSunday,
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
import { sendNotification } from "@/services/notifications";
import { getWhatsAppUrl } from "@/utils/phone";
import { MessageCircle } from "lucide-react";

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
  /** Confirmation popup shown immediately after a manual status is applied: the individual
   *  member's date, time-marked, and attendance detail — before offering the WhatsApp step. */
  const [confirmStep, setConfirmStep] = useState<{ member: AppUser; date: string; status: AttendanceStatus; markedAt: Date } | null>(null);
  /** WhatsApp step shown after a manual status is applied: prefilled, fully editable message. */
  const [waStep, setWaStep] = useState<{ member: AppUser; date: string; status: AttendanceStatus; message: string } | null>(null);
  const [holidayModal, setHolidayModal] = useState(false);
  const [holidayDate, setHolidayDate] = useState<string>(todayDate());
  const [holidayLabel, setHolidayLabel] = useState<string>("");
  const [savingHoliday, setSavingHoliday] = useState(false);

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
      .filter((u) => u.role === "tech_member" && u.createdBy === teamAdminUid && u.isActive !== false)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [allUsers, user]);

  // The COMPLETE month, day 1 → last day, always.
  const days = useMemo(() => daysInMonth(month), [month]);
  const monthHolidays = useMemo(
    () => [...holidays.values()].sort((a, b) => a.date.localeCompare(b.date)),
    [holidays],
  );

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
      if (status === "auto") {
        await clearAttendanceOverride(member.uid, date);
        setEditing(null);
        return;
      }
      await setAttendanceOverride(member, date, status, { uid: user.uid, name: user.name });
      // In-app popup/notification to the member about the update.
      sendNotification({
        userId: member.uid,
        type: "attendance_update",
        title: "Attendance Updated",
        message: `${format(new Date(date), "dd MMM yyyy")}: marked ${ATTENDANCE_META[status].label} by ${user.name}.`,
        link: member.role === "sales_member" ? "/sales/profile" : "/tech/profile",
      }).catch(() => {});
      setEditing(null);
      // Show the confirmation popup first — the individual member's date, time-marked, and
      // attendance detail — before offering to share it on WhatsApp.
      setConfirmStep({ member, date, status, markedAt: new Date() });
    } catch {
      toast({ title: "Error", description: "Could not update attendance.", variant: "destructive" });
    }
  };

  /** Build the prefilled WhatsApp message and move from the confirmation popup into the WhatsApp step. */
  const proceedToWhatsApp = (member: AppUser, date: string, status: AttendanceStatus) => {
    const needsReason = status === "half" || status === "absent" || status === "leave";
    setConfirmStep(null);
    setWaStep({
      member,
      date,
      status,
      message: [
        `Attendance Update — ${format(new Date(date), "dd MMM yyyy")}`,
        `Name: ${member.name}`,
        `Status: ${ATTENDANCE_META[status].label}`,
        ...(needsReason ? ["Reason: "] : []),
      ].join("\n"),
    });
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
    if (!user || !holidayDate) return;
    setSavingHoliday(true);
    try {
      await announceHoliday(holidayDate, holidayLabel || "Holiday", { uid: user.uid });
      setMonth(holidayDate.slice(0, 7));
      setHolidayLabel("");
      toast({ title: "Holiday announced", description: `${holidayLabel || "Holiday"} on ${format(new Date(holidayDate), "dd MMM yyyy")}.` });
    } catch {
      toast({ title: "Error", description: "Could not announce holiday.", variant: "destructive" });
    } finally {
      setSavingHoliday(false);
    }
  };

  const handleDeleteHoliday = async (dateStr: string) => {
    try {
      await deleteHoliday(dateStr);
      toast({ title: "Holiday removed", description: format(new Date(dateStr), "dd MMM yyyy") });
    } catch {
      toast({ title: "Error", description: "Could not remove holiday.", variant: "destructive" });
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
          <button onClick={() => setHolidayModal(true)}
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

      {/* Legend + announced holidays */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {STATUS_ORDER.map((s) => (
          <span key={s} className={cn("text-[11px] px-2 py-0.5 rounded-full border", ATTENDANCE_META[s].tone)}>
            {ATTENDANCE_META[s].short} · {ATTENDANCE_META[s].label}
          </span>
        ))}
        {monthHolidays.map((h) => (
          <span key={h.date} className="text-[11px] px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-600 border-amber-500/30 inline-flex items-center gap-1">
            <PartyPopper className="w-3 h-3" /> {h.label} · {format(new Date(h.date), "dd MMM")}
          </span>
        ))}
      </div>

      {members.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
          <Users className="w-8 h-8 opacity-40" /> No team members yet.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* table-fixed + colgroup: the WHOLE month always fits the available width on desktop;
              min-w keeps cells usable on small screens (horizontal scroll only there). */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] table-fixed text-sm border-collapse">
              <colgroup>
                <col style={{ width: 150 }} />
                <col style={{ width: 86 }} />
                {days.map((d) => <col key={d} />)}
              </colgroup>
              <thead>
                <tr className="bg-muted/50">
                  <th className="sticky left-0 z-10 bg-muted/50 text-left px-3 py-2 font-semibold text-foreground">Member</th>
                  <th className="px-1 py-2 font-semibold text-foreground text-center">Summary</th>
                  {days.map((d) => {
                    const sun = isSunday(d);
                    const fest = holidays.has(d);
                    return (
                      <th key={d} className={cn("px-0 py-1.5 font-medium text-center",
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
                  const sum = summarize(statuses);
                  const emp = employmentOf(m.employmentType);
                  return (
                    <tr key={m.uid} className="border-t border-border">
                      <td className="sticky left-0 z-10 bg-card px-3 py-2 align-top">
                        <div className="font-medium text-foreground truncate">{m.name}</div>
                        <button onClick={() => toggleEmployment(m)}
                          title="Click to switch Full-Time / Part-Time"
                          className={cn("mt-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                            emp === "full_time"
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20"
                              : "bg-violet-500/10 text-violet-600 border-violet-500/30 hover:bg-violet-500/20")}>
                          {EMPLOYMENT_LABELS[emp]} ⇄
                        </button>
                      </td>
                      <td className="px-1 py-2 text-center align-top">
                        <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                          <span className="text-emerald-600 font-semibold">{sum.full}P</span>{" "}
                          <span className="text-amber-600 font-semibold">{sum.half}H</span>{" "}
                          <span className="text-rose-600 font-semibold">{sum.absent}A</span>{" "}
                          <span className="text-sky-600 font-semibold">{sum.leave}L</span>
                        </div>
                        <div className="text-[9px] text-muted-foreground mt-0.5">Leaves left: {sum.leavesLeft}</div>
                      </td>
                      {days.map((d, i) => {
                        const st = statuses[i];
                        const isOverride = overrides.has(attendanceKey(m.uid, d));
                        return (
                          <td key={d} className="px-[1px] py-1 text-center">
                            <button
                              onClick={() => setEditing({ member: m, date: d, current: st })}
                              className={cn(
                                "w-full max-w-[30px] h-6 rounded text-[10px] font-bold border transition-all hover:scale-110 mx-auto block",
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

      {/* Attendance recorded — individual member/date/time/status confirmation */}
      <AnimatePresence>
        {confirmStep && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setConfirmStep(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: "spring", stiffness: 340, damping: 28 }}
              className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className={cn("px-5 pt-6 pb-5 text-center bg-gradient-to-b", ATTENDANCE_META[confirmStep.status].tone.includes("emerald") ? "from-emerald-500/15 to-transparent" : ATTENDANCE_META[confirmStep.status].tone.includes("amber") ? "from-amber-500/15 to-transparent" : ATTENDANCE_META[confirmStep.status].tone.includes("rose") ? "from-rose-500/15 to-transparent" : ATTENDANCE_META[confirmStep.status].tone.includes("sky") ? "from-sky-500/15 to-transparent" : "from-slate-400/15 to-transparent")}>
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 18, delay: 0.1 }}
                  className={cn("mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-3 border", ATTENDANCE_META[confirmStep.status].tone)}
                >
                  <CheckCircle2 className="w-7 h-7" />
                </motion.div>
                <h3 className="font-display font-semibold text-foreground text-base">Attendance Recorded</h3>
                <p className="text-xs text-muted-foreground mt-0.5">The update has been saved successfully.</p>
              </div>

              <div className="p-5 space-y-2.5">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
                  <User className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] text-muted-foreground">Member</div>
                    <div className="text-sm font-medium text-foreground truncate">{confirmStep.member.name}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
                  <CalendarClock className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] text-muted-foreground">Date</div>
                    <div className="text-sm font-medium text-foreground">{format(new Date(confirmStep.date), "EEEE, dd MMMM yyyy")}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5">
                    <Clock3 className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] text-muted-foreground">Time marked</div>
                      <div className="text-sm font-medium text-foreground">{format(confirmStep.markedAt, "hh:mm a")}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5">
                    <UserCheck className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] text-muted-foreground">Marked by</div>
                      <div className="text-sm font-medium text-foreground truncate">{user?.name || "You"}</div>
                    </div>
                  </div>
                </div>
                <div className={cn("flex items-center justify-between rounded-lg border px-3 py-2.5", ATTENDANCE_META[confirmStep.status].tone)}>
                  <span className="text-xs font-medium">Status</span>
                  <span className="text-sm font-bold">{ATTENDANCE_META[confirmStep.status].label}</span>
                </div>

                <div className="flex gap-2 pt-1">
                  <button onClick={() => setConfirmStep(null)}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-border bg-background hover:bg-accent text-foreground transition-colors">
                    Done
                  </button>
                  <button
                    onClick={() => proceedToWhatsApp(confirmStep.member, confirmStep.date, confirmStep.status)}
                    className="flex-[2] py-2.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 inline-flex items-center justify-center gap-1.5 transition-colors">
                    <MessageCircle className="w-4 h-4" /> Send WhatsApp Update
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* WhatsApp update step — after a manual status was applied */}
      {waStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setWaStep(null)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <MessageCircle className="w-4 h-4 text-emerald-500" />
              <span className="font-semibold text-foreground">Send WhatsApp update</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {waStep.member.name} · {format(new Date(waStep.date), "dd MMM yyyy")} · marked <b>{ATTENDANCE_META[waStep.status].label}</b>. Edit the message (add the reason) and send.
            </p>
            <textarea
              value={waStep.message}
              onChange={(e) => setWaStep({ ...waStep, message: e.target.value })}
              rows={5}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground font-mono leading-relaxed resize-y mb-3"
            />
            {!waStep.member.phone && (
              <p className="text-[11px] rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 px-3 py-2 mb-3">
                This member has no phone number saved — add it in My Team to enable WhatsApp.
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={() => setWaStep(null)}
                className="flex-1 py-2 rounded-lg text-sm font-medium border border-border bg-background hover:bg-accent text-foreground">
                Done
              </button>
              <button
                disabled={!waStep.member.phone}
                onClick={() => { window.open(getWhatsAppUrl(waStep.member.phone, waStep.message), "_blank"); setWaStep(null); }}
                className="flex-[2] py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 inline-flex items-center justify-center gap-1.5">
                <MessageCircle className="w-4 h-4" /> Send on WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Announce Holiday modal */}
      {holidayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setHolidayModal(false)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
                <PartyPopper className="w-4 h-4 text-amber-500" /> Announce Holiday
              </h3>
              <button onClick={() => setHolidayModal(false)} className="p-1 rounded-md hover:bg-accent"><X className="w-4 h-4" /></button>
            </div>

            <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
            <input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)}
              className="w-full mb-3 border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground" />

            <label className="block text-xs font-medium text-muted-foreground mb-1">Holiday name</label>
            <input value={holidayLabel} onChange={(e) => setHolidayLabel(e.target.value)} placeholder="e.g. Diwali"
              className="w-full mb-4 border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground" />

            <button onClick={handleAnnounceHoliday} disabled={savingHoliday || !holidayDate}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-primary hover:opacity-90 disabled:opacity-40">
              {savingHoliday ? "Announcing…" : "Announce Holiday"}
            </button>

            {monthHolidays.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border">
                <div className="text-xs font-medium text-muted-foreground mb-2">Announced this month</div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {monthHolidays.map((h) => (
                    <div key={h.date} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-1.5">
                      <span className="text-xs text-foreground truncate">{h.label} · {format(new Date(h.date), "EEE dd MMM")}</span>
                      <button onClick={() => handleDeleteHoliday(h.date)} title="Remove holiday"
                        className="p-1 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

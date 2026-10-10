/**
 * Social Media → Attendance — the TODAY board the Social Media Team Lead reads before her daily meeting.
 *
 * The owner (2026-10-08, after the pay-cycle grid went live): "only today — she holds a meeting every day, people
 * don't join, she calls them and they say they are absent; she needs to know who is absent BEFORE the meeting."
 * Asked, the owner chose a board grouped with the call list first, the team filled in by itself and editable by
 * the lead, and Call / WhatsApp beside everybody she may have to chase. So, top to bottom: the day; four big
 * numbers (present, not checked in, on leave, absent); then the people — NOT CHECKED IN YET (call them), NOT
 * COMING TODAY (leave, a leave request, marked absent — no need to call), PRESENT ("In at 9:42 AM"), and the team
 * leaders, who never check in. Words, an icon and a colour on every status, so nobody has to know a code.
 *
 * Who: utils/smmAttendance — everybody on a month on the board (seats and posts), minus/plus the lead's corrections
 * (`app_settings/smm_team`, services/smmTeam). What their day says: `todayStatusOf` — an admin's mark (an approved
 * leave is one), else the check-in, else Sunday / a holiday, else a pending leave request, else "not checked in".
 * View only: marks stay with the admins in Team Attendance (a mark changes the salary).
 *
 * Live: today's check-ins, marks, holidays, pending leave and the corrections are listeners, so a person who checks
 * in moves to Present while she watches; at midnight the board turns to the new day. Reads: the team's user
 * records once by id; today's check-ins (one equality on `date`); today's marks and holiday; pending leave
 * requests (the few awaiting a decision); one settings document.
 */
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CalendarCheck, CheckCircle2, Clock, HelpCircle, Loader2, MessageCircle, PartyPopper, Phone, Plane,
  Megaphone, UserCog, Users, XCircle, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  attendanceKey, isSunday, watchCheckinsOnDay, watchHolidayRecordsInRange, watchOverridesInRange,
  type AttendanceStatus, type DayCheckin, type Holiday,
} from "@/services/techAttendance";
import { watchPendingLeaveRequests } from "@/services/leave";
import { watchSmmTeamEdits } from "@/services/smmTeam";
import { useUsersByIds } from "@/hooks/useUsersByIds";
import { useToday } from "@/hooks/useToday";
import {
  NO_TEAM_EDITS, TODAY_GROUP_OF, TODAY_GROUP_ORDER, applyTeamEdits, callable, canEditSmmTeam, leaveAskedOn,
  handlesHeading, smmTeamFromMonths, todayCounts, todayStatusOf,
  type SmmTeamEdits, type SmmTeamPerson, type TodayGroup, type TodayKind, type TodayStatus,
} from "@/utils/smmAttendance";
import { getCallUrl, getWhatsAppUrl } from "@/utils/phone";
import { getRoleLabel } from "@/utils/roleHelpers";
import SmmTeamEditor from "@/components/smm/SmmTeamEditor";
import type { SmmCampaign } from "@/types/smm";
import type { AppUser } from "@/types";

/** Colour, icon and words for each kind of day — the same three on the numbers, the headings and the cards. */
const KIND: Record<TodayKind, { icon: LucideIcon; tone: string; ring: string }> = {
  present: { icon: CheckCircle2, tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", ring: "ring-emerald-500/60" },
  half: { icon: CheckCircle2, tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300", ring: "ring-amber-500/60" },
  not_in: { icon: Clock, tone: "border-orange-500/40 bg-orange-500/10 text-orange-800 dark:text-orange-300", ring: "ring-orange-500/70" },
  leave: { icon: Plane, tone: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300", ring: "ring-sky-500/60" },
  leave_asked: { icon: Plane, tone: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300", ring: "ring-sky-500/60" },
  absent: { icon: XCircle, tone: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300", ring: "ring-rose-500/60" },
  holiday: { icon: PartyPopper, tone: "border-border bg-muted/50 text-slate-700 dark:text-slate-300", ring: "ring-border" },
  no_checkin: { icon: HelpCircle, tone: "border-border bg-muted/50 text-slate-700 dark:text-slate-300", ring: "ring-border" },
};

const time = (d: Date) => format(d, "h:mm a");

/** The status in words: "In at 9:42 AM · left 6:05 PM", "Not checked in", "On leave"… */
function statusWords(s: TodayStatus, role?: string): string {
  switch (s.kind) {
    case "present":
      if (!s.inAt) return s.marked ? "Present (marked by admin)" : "Checked in";
      return `In at ${time(s.inAt)}${s.outAt ? ` · left ${time(s.outAt)}` : ""}`;
    case "half": return `Half day${s.inAt ? ` · in at ${time(s.inAt)}` : ""}`;
    case "not_in": return "Not checked in";
    case "leave": return "On leave";
    case "leave_asked": return "Asked for leave — not approved yet";
    case "absent": return "Absent";
    case "holiday": return "Day off";
    case "no_checkin": return `${role ? getRoleLabel(role as AppUser["role"]) : "This role"} — doesn't check in`;
  }
}

const GROUP_TEXT: Record<TodayGroup, { title: string; hint: string; kind: TodayKind }> = {
  call: { title: "Not checked in yet — call them", hint: "No check-in today. Tap Call or WhatsApp to ask if they are coming.", kind: "not_in" },
  away: { title: "Not coming today — no need to call", hint: "On leave, asked for leave, or marked absent.", kind: "absent" },
  present: { title: "Present", hint: "Checked in today.", kind: "present" },
  unknown: { title: "No check-in record", hint: "Team leaders don't check in, so the app cannot tell if they are here.", kind: "no_checkin" },
  off: { title: "Day off", hint: "Today is a holiday.", kind: "holiday" },
};

interface Row extends SmmTeamPerson {
  user: AppUser;
  status: TodayStatus;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function PersonCard({ row }: { row: Row }) {
  const meta = KIND[row.status.kind];
  const Icon = meta.icon;
  const phone = (row.user.phone || "").trim();
  const showContact = callable(row.status.kind);
  return (
    <div data-test="smm-today-person" data-kind={row.status.kind}
      className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        {row.user.avatar ? (
          <img src={row.user.avatar} alt="" className={cn("h-11 w-11 shrink-0 rounded-full object-cover ring-2", meta.ring)} />
        ) : (
          <span aria-hidden className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground ring-2", meta.ring)}>
            {initials(row.name)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p data-test="smm-today-name" className="truncate text-[15px] font-semibold text-foreground">{row.name}</p>
          {/* Wraps rather than cuts: "Tech Team Leader — doesn't check in" ran 5px past a 360px phone's card. */}
          <span data-test="smm-today-status" className={cn("mt-1 inline-flex max-w-full items-start gap-1 rounded-2xl border px-2 py-0.5 text-xs font-semibold leading-snug", meta.tone)}>
            <Icon className="mt-px h-3.5 w-3.5 shrink-0" /><span className="min-w-0">{statusWords(row.status, row.user.role)}</span>
          </span>
        </div>
      </div>
      {/* What Social Media work they handle — each client by name and what they do for it (owner, 2026-10-08). */}
      <div data-test="smm-today-handles" className="mt-2.5 border-t border-border/60 pt-2">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{handlesHeading(row)}</p>
        {row.handles.length > 0 && (
          <ul className="space-y-1">
            {row.handles.map((h) => (
              <li key={h.client} data-test="smm-today-handle" className="flex min-w-0 items-start gap-1.5 text-[13px] leading-snug">
                <Megaphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="min-w-0 break-words">
                  <span className="font-semibold text-foreground">{h.client}</span>
                  <span className="text-muted-foreground"> — {h.seats.join(", ")}</span>
                  {h.state !== "running" && (
                    <span className="ml-1.5 inline-block rounded-full bg-muted px-1.5 text-[11px] font-semibold text-foreground">
                      {h.state === "upcoming" && h.startDate ? `starts ${format(new Date(`${h.startDate}T00:00:00`), "d MMM")}` : "month ended"}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {showContact && (
        phone ? (
          <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
            {/* Dark enough for white text (≥ 5.5:1): white on the brand orange measured 2.8:1, on emerald-600 3.8:1. */}
            <a href={getCallUrl(phone)} data-test="smm-today-call" aria-label={`Call ${row.name}`}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-sky-700 text-sm font-semibold text-white transition-colors hover:bg-sky-800">
              <Phone className="h-4 w-4" /> Call
            </a>
            <a href={getWhatsAppUrl(phone)} target="_blank" rel="noopener noreferrer" data-test="smm-today-whatsapp" aria-label={`WhatsApp ${row.name}`}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 text-sm font-semibold text-white transition-colors hover:bg-emerald-800">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          </div>
        ) : (
          <p className="mt-auto pt-2 text-xs text-muted-foreground">No phone number on their profile.</p>
        )
      )}
    </div>
  );
}

function CountTile({ kind, label, n, testId }: { kind: TodayKind; label: string; n: number; testId: string }) {
  const meta = KIND[kind];
  const Icon = meta.icon;
  return (
    <div data-test={testId} className={cn("flex min-w-0 items-center gap-3 rounded-xl border p-3 sm:p-4", n > 0 ? meta.tone : "border-border bg-card text-muted-foreground")}>
      <Icon className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" />
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none sm:text-3xl">{n}</p>
        <p className="mt-1 truncate text-xs font-semibold sm:text-sm">{label}</p>
      </div>
    </div>
  );
}

export default function SmmAttendanceView({ campaigns, user }: {
  campaigns: SmmCampaign[];
  user: Pick<AppUser, "uid" | "name" | "role" | "smmLeader">;
}) {
  const today = useToday();
  const [edits, setEdits] = useState<SmmTeamEdits>(NO_TEAM_EDITS);
  const [checkins, setCheckins] = useState<Map<string, DayCheckin>>(new Map());
  const [marks, setMarks] = useState<Map<string, AttendanceStatus>>(new Map());
  const [holidays, setHolidays] = useState<Map<string, Holiday>>(new Map());
  const [leaveAsked, setLeaveAsked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);

  useEffect(() => watchSmmTeamEdits(setEdits), []);
  useEffect(() => {
    const unsubs = [
      watchCheckinsOnDay(today, setCheckins),
      watchOverridesInRange(today, today, setMarks),
      watchHolidayRecordsInRange(today, today, setHolidays),
      watchPendingLeaveRequests((requests) => setLeaveAsked(leaveAskedOn(requests, today))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [today]);

  const fromMonths = useMemo(() => smmTeamFromMonths(campaigns, today), [campaigns, today]);
  // The user records of everybody who could be on the board — the months' people and the hand-added ones.
  const uids = useMemo(() => [...new Set([...fromMonths.map((p) => p.uid), ...edits.added])], [fromMonths, edits.added]);
  const { users, loading } = useUsersByIds(uids);
  const team = useMemo(
    () => applyTeamEdits(fromMonths, edits, (uid) => users.get(uid)?.name || ""),
    [fromMonths, edits, users],
  );

  const holiday = holidays.get(today);
  const dayOff = isSunday(today) || !!holiday;

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const p of team) {
      const u = users.get(p.uid);
      // No account, a left employee or an outside creator is nobody she meets.
      if (!u || u.isActive === false || u.externalCreator) continue;
      const status = todayStatusOf({
        checksIn: u.role === "tech_member",
        mark: marks.get(attendanceKey(p.uid, today)),
        checkin: checkins.get(p.uid),
        dayOff,
        leaveAsked: leaveAsked.has(p.uid),
      });
      out.push({ ...p, name: u.name || p.name, user: u, status });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [team, users, marks, checkins, leaveAsked, today, dayOff]);

  const counts = todayCounts(rows.map((r) => r.status.kind));
  const byGroup = (g: TodayGroup) => rows.filter((r) => TODAY_GROUP_OF[r.status.kind] === g);
  const canEdit = canEditSmmTeam(user);

  return (
    <section data-test="smm-attendance" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <CalendarCheck size={20} className="text-primary" /> Today's attendance — Social Media team
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span data-test="smm-attendance-date" className="font-semibold text-foreground">{format(new Date(`${today}T00:00:00`), "EEEE, d MMMM yyyy")}</span>
            <span className="inline-flex items-center gap-1.5 text-xs">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Updates by itself as people check in
            </span>
          </p>
        </div>
        {canEdit && (
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)} data-test="smm-team-edit" className="gap-1.5">
            <UserCog className="h-4 w-4" /> Edit team
          </Button>
        )}
      </div>

      {dayOff && (
        <div data-test="smm-attendance-dayoff" className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
          <PartyPopper className="h-5 w-5 shrink-0" />
          {holiday ? `Today is a holiday — ${holiday.label}. Nobody needs to check in.` : "Today is Sunday — the office is closed. Nobody needs to check in."}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4" data-test="smm-attendance-counts">
        <CountTile kind="present" label="Present" n={counts.present} testId="smm-count-present" />
        <CountTile kind="not_in" label="Not checked in" n={counts.notIn} testId="smm-count-notin" />
        <CountTile kind="leave" label="On leave" n={counts.leave} testId="smm-count-leave" />
        <CountTile kind="absent" label="Absent" n={counts.absent} testId="smm-count-absent" />
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={26} /></div>
      ) : rows.length === 0 ? (
        <div data-test="smm-attendance-empty" className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          <Users className="h-8 w-8 opacity-40" />
          Nobody is on the Social Media team yet. People appear here once they work on a Social Media month
          {canEdit ? ", or when you add them with Edit team." : "."}
        </div>
      ) : (
        <>
          {!dayOff && counts.notIn === 0 && (
            <div data-test="smm-attendance-allin" className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="h-5 w-5 shrink-0" /> Everyone who checks in has checked in or is on leave — nobody to chase.
            </div>
          )}
          {TODAY_GROUP_ORDER.map((g) => {
            const people = byGroup(g);
            if (people.length === 0) return null;
            const text = GROUP_TEXT[g];
            const HeadIcon = KIND[text.kind].icon;
            return (
              <section key={g} data-test={`smm-group-${g}`} className="space-y-2">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                    <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-full border", KIND[text.kind].tone)}>
                      <HeadIcon className="h-4 w-4" />
                    </span>
                    {text.title}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">{people.length}</span>
                  </h3>
                  <p className="mt-0.5 pl-9 text-xs text-muted-foreground">{text.hint}</p>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {people.map((r) => <PersonCard key={r.uid} row={r} />)}
                </div>
              </section>
            );
          })}
        </>
      )}

      <p className="text-xs text-muted-foreground">
        View only — each person's day comes from their check-in, an approved leave or an admin's mark. To correct a day,
        the tech admin uses Team Attendance.
      </p>

      {canEdit && (
        <SmmTeamEditor open={editing} onOpenChange={setEditing} fromMonths={fromMonths} edits={edits}
          team={team} nameOf={(uid) => users.get(uid)?.name || ""} actor={{ uid: user.uid, name: user.name }} />
      )}
    </section>
  );
}

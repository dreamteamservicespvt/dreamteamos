/**
 * Everything SMM Delivery Control reads, in one hook (2026-10-15, phases 2 and 4) — for the Delivery Control page
 * and the app-wide alert host.
 *
 * ── Reads, kept small (the free-tier quota) ─────────────────────────────────────────────────────
 *   • the settings — one document;
 *   • the months — the SAME query as the classic board (`active` for the overseers, `watchers` for everybody
 *     else), so the SDK shares one watch when both are open; with metadata, for "fresh data only";
 *   • company holidays — one range query around the months' days;
 *   • answers on alerts (`smm_alert_state`) — everybody's for the overseers (a handful of small documents),
 *     only their own for everyone else;
 *   • the people (names, roles, who is deactivated, phone) — read once by id (`useUsersByIds`), only when asked
 *     (`withPeople`) — and today's presence (check-ins, marks, pending leave) only with `withPresence`.
 * Keyed on `user.uid` and primitives, never on the `user` object (a new object arrives on every snapshot).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { watchAlertAnswers, watchDeliveryMonths, watchMyAlertAnswers, type SmmAlertAnswers, type SmmMonthsMeta } from "@/services/smmDelivery";
import {
  attendanceKey, isSunday, watchCheckinsOnDay, watchHolidayRecordsInRange, watchOverridesInRange, type AttendanceStatus, type DayCheckin,
} from "@/services/techAttendance";
import { watchPendingLeaveRequests } from "@/services/leave";
import { watchSmmTeamLeads } from "@/services/smm";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useUsersByIds } from "@/hooks/useUsersByIds";
import { useToday } from "@/hooks/useToday";
import { isSmmOverseer } from "@/utils/smmPlan";
import { halfDayLeaveAskedOn, leaveAskedOn, todayStatusOf } from "@/utils/smmAttendance";
import { presenceFromToday, type SmmMonitorPerson } from "@/utils/smmMonitor";
import { holidayWindow, liveSinceOf } from "@/utils/smmDeliveryView";
import type { SmmDeliveryMonth } from "@/utils/smmCadence";
import type { SmmDeliverySettings } from "@/types/smmDelivery";
import type { AppUser } from "@/types";

export interface SmmDeliveryData {
  settings: SmmDeliverySettings;
  settingsLoaded: boolean;
  /** The settings document exists (absent = Preview with the defaults). */
  settingsSaved: boolean;
  months: SmmDeliveryMonth[];
  monthsLoaded: boolean;
  meta: SmmMonthsMeta;
  holidays: ReadonlySet<string>;
  holidaysLoaded: boolean;
  answers: SmmAlertAnswers;
  people: SmmMonitorPerson[];
  users: Map<string, AppUser>;
  liveSince: number | null;
  /** ms, ticking every minute. */
  now: number;
  today: string;
}

type Viewer = Pick<AppUser, "uid" | "role"> & { smmLeader?: boolean; name?: string };

/** The clock, once a minute (the Today cards' "2 days left", the alerts' timing). */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") setNow(Date.now()); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return now;
}

export { useSmmDeliverySettings } from "./useSmmDeliverySettings";
import { useSmmDeliverySettings } from "./useSmmDeliverySettings";

export function useDeliveryData(
  user: Viewer | null | undefined,
  opts: { withPeople?: boolean; withPresence?: boolean; enabled?: boolean } = {},
): SmmDeliveryData {
  const enabled = opts.enabled !== false;
  const uid = user?.uid || "";
  const overseer = isSmmOverseer(user);
  const { settings, loaded: settingsLoaded, saved: settingsSaved } = useSmmDeliverySettings();
  const now = useMinuteClock();
  const today = useToday();

  const [months, setMonths] = useState<SmmDeliveryMonth[]>([]);
  const [monthsLoaded, setMonthsLoaded] = useState(false);
  const [meta, setMeta] = useState<SmmMonthsMeta>({ fromCache: true, serverAt: null });
  useEffect(() => {
    if (!uid || !enabled) {
      setMonths([]);
      setMonthsLoaded(!uid);
      return;
    }
    setMonthsLoaded(false);
    return watchDeliveryMonths({ uid, overseer }, (list, m) => {
      setMonths(list);
      setMeta(m);
      setMonthsLoaded(true);
    });
  }, [uid, overseer, enabled]);

  // Holidays across the months' days (the planner steps deadlines back over them).
  const window = useMemo(() => holidayWindow(months, today), [months, today]);
  const [holidays, setHolidays] = useState<ReadonlySet<string>>(new Set());
  const [holidaysLoaded, setHolidaysLoaded] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    return watchHolidayRecordsInRange(window.from, window.to, (byDate) => {
      setHolidays(new Set(byDate.keys()));
      setHolidaysLoaded(true);
    });
  }, [window.from, window.to, enabled]);

  const [answers, setAnswers] = useState<SmmAlertAnswers>({});
  useEffect(() => {
    if (!uid || !enabled) return;
    return overseer ? watchAlertAnswers(setAnswers) : watchMyAlertAnswers(uid, setAnswers);
  }, [uid, overseer, enabled]);

  // The leads (the Social Media Team Lead and the tech team leaders) — the supervisor needs them on an overseer's
  // screen: a lead's "I'm on it" holds the admins back, her "Escalate" brings them in at once. Two small reads.
  const [leadUids, setLeadUids] = useState<string[]>([]);
  useEffect(() => {
    if (!opts.withPeople || !overseer || !enabled) return;
    let alive = true;
    let flagged: string[] = [];
    let leaders: string[] = [];
    const merge = () => { if (alive) setLeadUids([...new Set([...flagged, ...leaders])]); };
    const stop = watchSmmTeamLeads((list) => { flagged = list.map((l) => l.uid); merge(); });
    getDocs(query(collection(db, "users"), where("role", "==", "tech_team_leader")))
      .then((snap) => { leaders = snap.docs.map((d) => d.id); merge(); })
      .catch(() => undefined);
    return () => { alive = false; stop(); };
  }, [opts.withPeople, overseer, enabled]);

  // The people on the months (seats, owners, salespeople) — names, roles, deactivated.
  const uids = useMemo(() => {
    if (!opts.withPeople) return uid ? [uid] : [];
    const set = new Set<string>([...(uid ? [uid] : []), ...leadUids]);
    for (const m of months) {
      const t = m.team;
      for (const s of [t?.creator, t?.publisher, t?.marketer, ...(t?.assistants || [])]) if (s?.uid) set.add(s.uid);
      if (m.soldBy) set.add(m.soldBy);
      if (m.salesAdminId) set.add(m.salesAdminId);
      for (const i of m.items || []) {
        if (i.makerUid) set.add(i.makerUid);
        if (i.publisherUid) set.add(i.publisherUid);
      }
    }
    return [...set];
  }, [opts.withPeople, months, uid, leadUids]);
  const { users } = useUsersByIds(enabled ? uids : []);

  // Today's presence (the Attendance board's sources) — only where it changes what is shown.
  const [checkins, setCheckins] = useState<Map<string, DayCheckin>>(new Map());
  const [marks, setMarks] = useState<Map<string, AttendanceStatus>>(new Map());
  const [leaveAsked, setLeaveAsked] = useState<Set<string>>(new Set());
  const [halfAsked, setHalfAsked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!opts.withPresence || !enabled) return;
    const unsubs = [
      watchCheckinsOnDay(today, setCheckins),
      watchOverridesInRange(today, today, setMarks),
      watchPendingLeaveRequests((requests) => {
        setLeaveAsked(leaveAskedOn(requests, today));
        setHalfAsked(halfDayLeaveAskedOn(requests, today));
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [opts.withPresence, today, enabled]);

  const people: SmmMonitorPerson[] = useMemo(() => {
    const dayOff = isSunday(today) || holidays.has(today);
    const list: SmmMonitorPerson[] = [];
    const ids = new Set([...uids, ...users.keys()]);
    for (const id of ids) {
      const u = users.get(id) || (id === uid && user ? (user as AppUser) : undefined);
      if (!u) continue;
      let presence: SmmMonitorPerson["presence"] = "unknown";
      if (opts.withPresence) {
        const status = todayStatusOf({
          checksIn: u.role === "tech_member",
          mark: marks.get(attendanceKey(id, today)),
          checkin: checkins.get(id),
          dayOff,
          leaveAsked: leaveAsked.has(id),
          leaveAskedHalf: halfAsked.has(id),
        });
        const c = checkins.get(id);
        presence = presenceFromToday(status.kind, { checkedIn: !!c?.inAt, checkedOut: !!c?.outAt });
      }
      list.push({ uid: id, name: u.name || "", role: u.role, smmLeader: !!u.smmLeader, isActive: u.isActive !== false, presence });
    }
    return list;
  }, [uids, users, uid, user, opts.withPresence, marks, checkins, leaveAsked, halfAsked, today, holidays]);

  return {
    settings, settingsLoaded, settingsSaved, months, monthsLoaded, meta, holidays, holidaysLoaded, answers, people, users,
    liveSince: liveSinceOf(settings, now), now, today,
  };
}

/** Remember the last value of something between renders (the alert host's "new since last time"). */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => { ref.current = value; }, [value]);
  return ref.current;
}

import { useEffect, useState } from "react";
import { todayDate } from "@/services/techAttendance";

/**
 * Today's date (`yyyy-MM-dd`), turning over at midnight — and checked again whenever the tab comes
 * back, since a phone that slept through midnight never fires the timer.
 *
 * ── Why the salary and attendance screens need it ─────────────────────────────────────────────
 * "Today" decides what a day IS: before the check-in today is pending, the day after it is a past
 * working day and an un-checked one is Absent. Screens that read the clock once per render froze
 * that answer on a page left open overnight — Payroll still showed yesterday as "in progress" (not
 * deducted) and the remaining-days projection a day out, until some unrelated data change happened
 * to re-render it. The Social Media TODAY board had this hook first (2026-10-08); it lives here now
 * so every screen that prices or marks a day turns over together.
 */
export function useToday(): string {
  const [day, setDay] = useState(todayDate);
  useEffect(() => {
    const check = () => setDay((d) => (d === todayDate() ? d : todayDate()));
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    const timer = setTimeout(check, nextMidnight.getTime() - now.getTime());
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [day]);
  return day;
}

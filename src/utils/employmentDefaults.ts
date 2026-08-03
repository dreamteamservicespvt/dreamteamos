/**
 * What a new employee's terms start out as, and the choices offered for them.
 *
 * Almost everybody hired here works the same hours from the same place under the same manager with
 * the same title. Making an admin type all five of those every time is how a record ends up with
 * "10-7", "10:00-7:00" and "10 AM to 7 PM" scattered across three employees' letters — and a
 * letter is exactly where that inconsistency shows.
 *
 * Defaults are applied only to an **empty** field. They are a starting point for the common case,
 * never a correction of something an admin has already decided: a part-timer whose hours were set
 * deliberately must not have them quietly reset to the standard shift.
 *
 * Pure — no React, no Firestore, so the fill rule is testable on its own.
 */
import type { EmployeeProfile, EngagementType } from "@/types/hr";

/** The standing arrangement for a full-time hire. */
export const EMPLOYMENT_DEFAULTS = {
  designation: "AI Software Engineer",
  workLocation: "Kakinada, Andhra Pradesh",
  reportingToName: "Senior AI Software Engineer",
  startTime: "10:00 AM",
  endTime: "7:00 PM",
  fromDay: "Monday",
  toDay: "Saturday",
} as const;

// ─── Working hours ──────────────────────────────────────────────────────────

/**
 * Every half hour of the day, as a label.
 *
 * A free-text box invited "10-7" and "10:00AM"; a picker means every letter in the company prints
 * the same shape of time. Half-hourly rather than hourly because shifts here really do start at
 * 9:30.
 */
export const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const suffix = h < 12 ? "AM" : "PM";
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      out.push(`${hour12}:${m === 0 ? "00" : "30"} ${suffix}`);
    }
  }
  return out;
})();

export const DAY_OPTIONS = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
] as const;

export type DayName = (typeof DAY_OPTIONS)[number];

/** `"10:00 AM"`, `"7:00 PM"` → `"10:00 AM – 7:00 PM"`. An en dash, because it is a range. */
export const formatHours = (start?: string | null, end?: string | null): string | null => {
  const s = (start || "").trim();
  const e = (end || "").trim();
  if (!s || !e) return null;
  return `${s} – ${e}`;
};

/** `"Monday"`, `"Saturday"` → `"Monday – Saturday"`; the same day twice reads as just that day. */
export const formatDays = (from?: string | null, to?: string | null): string | null => {
  const f = (from || "").trim();
  const t = (to || "").trim();
  if (!f || !t) return null;
  return f === t ? f : `${f} – ${t}`;
};

/**
 * Split a stored range back into its two halves so the pickers can show it.
 *
 * Tolerant of the shapes already sitting in the database — en dash, hyphen, "to" — because these
 * fields were free text before this existed and those records must still open in the form rather
 * than appearing blank and being silently overwritten on the next save.
 */
export function splitRange(value?: string | null): { from: string; to: string } {
  const raw = (value || "").trim();
  if (!raw) return { from: "", to: "" };
  const parts = raw.split(/\s*(?:–|—|-|\bto\b)\s*/i).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { from: parts[0], to: parts[parts.length - 1] };
  return { from: parts[0] || "", to: parts[0] || "" };
}

/** Match a stored time against the picker's options, so "10:00AM" still selects "10:00 AM". */
export function matchTimeOption(value?: string | null): string {
  const raw = (value || "").trim();
  if (!raw) return "";
  const norm = (s: string) => s.toUpperCase().replace(/[\s.]/g, "");
  const target = norm(raw);
  return TIME_OPTIONS.find((o) => norm(o) === target)
    // "10 AM" has no minutes; try it as "10:00 AM" before giving up.
    || TIME_OPTIONS.find((o) => norm(o) === target.replace(/^(\d{1,2})(AM|PM)$/, "$1:00$2"))
    || "";
}

/** Match a stored day name case-insensitively, and accept the common three-letter short forms. */
export function matchDayOption(value?: string | null): string {
  const raw = (value || "").trim().toLowerCase();
  if (!raw) return "";
  return DAY_OPTIONS.find((d) => d.toLowerCase() === raw)
    || DAY_OPTIONS.find((d) => d.toLowerCase().startsWith(raw.slice(0, 3)))
    || "";
}

// ─── Applying the defaults ──────────────────────────────────────────────────

/**
 * Fill the blanks on a terms form, and only the blanks.
 *
 * A part-timer works their own allocated hours, so the standard shift is not assumed for them —
 * their hours and days are left empty for the admin to set deliberately. Everything else (title,
 * place, manager) is the same whoever they are, so it is filled either way.
 */
export function applyEmploymentDefaults(
  form: Partial<EmployeeProfile>,
  engagement?: EngagementType,
): Partial<EmployeeProfile> {
  const filled: Partial<EmployeeProfile> = { ...form };
  const isBlank = (v?: string | null) => !((v || "").trim());

  if (isBlank(filled.designation)) filled.designation = EMPLOYMENT_DEFAULTS.designation;
  if (isBlank(filled.workLocation)) filled.workLocation = EMPLOYMENT_DEFAULTS.workLocation;
  if (isBlank(filled.reportingToName)) filled.reportingToName = EMPLOYMENT_DEFAULTS.reportingToName;

  // Part-time is the case where "the standard shift" is precisely wrong.
  if (engagement !== "part_time") {
    if (isBlank(filled.workingHours)) {
      filled.workingHours = formatHours(EMPLOYMENT_DEFAULTS.startTime, EMPLOYMENT_DEFAULTS.endTime);
    }
    if (isBlank(filled.workingDays)) {
      filled.workingDays = formatDays(EMPLOYMENT_DEFAULTS.fromDay, EMPLOYMENT_DEFAULTS.toDay);
    }
  }
  return filled;
}

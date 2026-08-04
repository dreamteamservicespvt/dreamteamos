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
import type { Department, EmployeeProfile, EngagementType } from "@/types/hr";

/**
 * The evaluation window a permanent hire starts on.
 *
 * Three months is the standing policy, and leaving it blank was quietly costing something: an
 * employment record with no probation prints "Full-Time (Permanent)" on the offer letter, which
 * says the job is confirmed from day one — the opposite of what was agreed. Seventeen of twenty
 * records were in exactly that state. It is a default, not a rule: an admin can set 0 (no
 * probation), or any other number, and nothing here overrules them.
 */
export const DEFAULT_PROBATION_MONTHS = 3;

/** The standing arrangement for a full-time hire. */
export const EMPLOYMENT_DEFAULTS = {
  designation: "AI Software Engineer",
  /**
   * The full postal address, not a city.
   *
   * This is printed as the place of work on every letter, and "Kakinada, Andhra Pradesh" is where
   * the office roughly is rather than where it is. A landlord, a bank or a college checking the
   * letter needs an address they could post to.
   */
  workLocation: "Dream Team Services, 50-6-23, Vishnalayam Street, Jagannaickpur, Kakinada, Andhra Pradesh – 533002",
  reportingToName: "Senior AI Software Engineer",
  startTime: "10:00 AM",
  endTime: "7:00 PM",
  fromDay: "Monday",
  toDay: "Saturday",
  /** The two internship clauses a college expects to see, and the notice they usually carry. */
  internshipNoticeDays: 7,
  internshipExtendable: true,
} as const;

/**
 * The parts of the standing arrangement that differ by department.
 *
 * Everything else — the address, the hours, the working days — is the same building and the same
 * shift for everybody. The title and the manager are not: a sales hire reporting to the "Senior AI
 * Software Engineer" is nonsense on a letter, and it is exactly what the single global default
 * produced for every sales employee.
 */
export const DEPARTMENT_DEFAULTS: Record<Department, { designation: string; reportingToName: string }> = {
  tech: {
    designation: EMPLOYMENT_DEFAULTS.designation,
    reportingToName: EMPLOYMENT_DEFAULTS.reportingToName,
  },
  sales: {
    designation: "Business Development Associate",
    reportingToName: "Chief Business Officer (CBO)",
  },
};

/** The department defaults, falling back to tech's for a record that has no department yet. */
export function defaultsForDepartment(department?: Department | null) {
  return DEPARTMENT_DEFAULTS[department as Department] || DEPARTMENT_DEFAULTS.tech;
}

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
 * Work locations that were themselves an old default, and should give way to the new one.
 *
 * "Only fill blanks" is the right rule for a field somebody chose. It is the wrong rule for a
 * value nobody chose — every record created before the address existed carries the city that used
 * to be the default, and under a strict blanks-only rule those letters would keep printing a city
 * forever while new hires got a postal address.
 *
 * Deliberately an exact list rather than "anything without a PIN code". An admin who typed
 * "Visakhapatnam" for a second office made a decision, and guessing that any short location is
 * stale would move that person to the wrong address.
 */
const SUPERSEDED_WORK_LOCATIONS = [
  "Kakinada, Andhra Pradesh",
  "Kakinada, AP",
];

/** Compare loosely: these were typed by hand, so spacing around the comma varies. */
const normalizeLocation = (v: string): string =>
  v.toLowerCase().replace(/\s*,\s*/g, ",").replace(/\s+/g, " ").trim();

export function isSupersededWorkLocation(value?: string | null): boolean {
  const raw = (value || "").trim();
  if (!raw) return false;
  return SUPERSEDED_WORK_LOCATIONS.some((old) => normalizeLocation(old) === normalizeLocation(raw));
}

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
  /** Which department's title and manager to fall back on. Tech's, for a record without one. */
  department?: Department | null,
): Partial<EmployeeProfile> {
  const filled: Partial<EmployeeProfile> = { ...form };
  const isBlank = (v?: string | null) => !((v || "").trim());
  const byDept = defaultsForDepartment(department ?? form.department);

  if (isBlank(filled.designation)) filled.designation = byDept.designation;
  // Blank, or still carrying the old city-only default — see `isSupersededWorkLocation`.
  if (isBlank(filled.workLocation) || isSupersededWorkLocation(filled.workLocation)) {
    filled.workLocation = EMPLOYMENT_DEFAULTS.workLocation;
  }
  if (isBlank(filled.reportingToName)) filled.reportingToName = byDept.reportingToName;

  /**
   * Probation, for the engagements that have one. An intern or a contractor is on a fixed term and
   * is not being evaluated for confirmation, so they stay at zero and their letters say so.
   */
  if (filled.probationMonths === undefined || filled.probationMonths === null) {
    filled.probationMonths = engagement === "intern" || engagement === "contract"
      ? 0
      : DEFAULT_PROBATION_MONTHS;
  }

  // Part-time is the case where "the standard shift" is precisely wrong.
  if (engagement !== "part_time") {
    if (isBlank(filled.workingHours)) {
      filled.workingHours = formatHours(EMPLOYMENT_DEFAULTS.startTime, EMPLOYMENT_DEFAULTS.endTime);
    }
    if (isBlank(filled.workingDays)) {
      filled.workingDays = formatDays(EMPLOYMENT_DEFAULTS.fromDay, EMPLOYMENT_DEFAULTS.toDay);
    }
  }

  // The two clauses a college looks for. Offered by default because an internship letter without
  // them prompts a question; the admin can still turn either off.
  if (engagement === "intern") {
    if (filled.internshipExtendable === undefined) {
      filled.internshipExtendable = EMPLOYMENT_DEFAULTS.internshipExtendable;
    }
    if (filled.internshipNoticeDays === undefined || filled.internshipNoticeDays === null) {
      filled.internshipNoticeDays = EMPLOYMENT_DEFAULTS.internshipNoticeDays;
    }
  }
  return filled;
}

/**
 * SMM Delivery Control's settings — the defaults, the reading of `app_settings/smm_delivery`, and the checks
 * a change must pass (2026-10-15; types and the why in `types/smmDelivery`).
 *
 * Pure, and written WITHOUT the `@/` alias on purpose: the server checker (`api/smm-monitor.ts`, phase 6)
 * reads the same document with the same rules, and `api/` cannot resolve the alias (a test asserts it).
 */
import type {
  SmmDeliveryCheckpoints, SmmDeliveryLadder, SmmDeliveryMode, SmmDeliveryQuietHours, SmmDeliverySettings,
  SmmDeliveryRunSummary, SmmDeliverySwitch, SmmDeliveryTunables,
} from "../types/smmDelivery.js";

export const SMM_DELIVERY_MODES: { key: SmmDeliveryMode; label: string; detail: string }[] = [
  { key: "off", label: "Off", detail: "Nothing runs. The classic Social Media works exactly as before." },
  { key: "preview", label: "Preview", detail: "The new screens show what would happen. Nothing is saved and nobody is alerted." },
  { key: "live", label: "Live", detail: "Weekly plans are saved and the alerts run." },
];

/** The plan's defaults (approved by the owner 2026-10-15, `smm.md` §9.9). */
export const DEFAULT_SMM_DELIVERY_CHECKPOINTS: SmmDeliveryCheckpoints = {
  sendVideo: 3,
  longVideoExtraDays: 1,
  longVideoClips: 6,
  sendPoster: 2,
  sendRealVideo: 2,
  footage: 4,
  approved: 1,
};

export const DEFAULT_SMM_DELIVERY_QUIET_HOURS: SmmDeliveryQuietHours = { fromHour: 20, toHour: 9, sundays: true, holidays: true };

export const DEFAULT_SMM_DELIVERY_LADDER: SmmDeliveryLadder = {
  deadlineDayHour: 10,
  repeatHours: 2,
  leadAfterWorkingDays: 1,
  adminAfterWorkingDays: 2,
  approvalSalespersonDays: 2,
  approvalSalesAdminDays: 4,
  footageSalesAdminDays: 1,
  adReportHour: 12,
  adCampaignStartDays: 2,
  extraUnbilledDays: 3,
  focusMinutes: 45,
  onItHours: 4,
  blockHours: 24,
  moreTimePerTask: 2,
  reassignsBeforeAdmin: 2,
  revisionsBeforeWarning: 2,
  clientChaseDays: [2, 4, 7],
  maxFullScreenPerDay: 3,
  freshMinutes: 5,
  weeklyLoadLimit: 12,
};

/**
 * What a missing document reads as. `preview`, not `off`: Preview saves nothing and alerts nobody, and it is
 * the state the rollout starts in (phase 2) — the admins reach Settings through it to go Live, or to turn it
 * off with a reason.
 */
export const DEFAULT_SMM_DELIVERY: SmmDeliverySettings = {
  mode: "preview",
  pilotUids: [],
  deadlineHour: 19,
  checkpoints: DEFAULT_SMM_DELIVERY_CHECKPOINTS,
  quietHours: DEFAULT_SMM_DELIVERY_QUIET_HOURS,
  ladder: DEFAULT_SMM_DELIVERY_LADDER,
  offReason: null,
  history: [],
};

/** The switch's history kept on the document. */
export const SMM_DELIVERY_HISTORY_LIMIT = 20;

/** Turning it off needs a reason at least this long — "." or "x" is not a reason the owner can act on. */
export const SMM_DELIVERY_OFF_REASON_MIN = 5;

/** The range each number may take: [min, max]. A value outside it (or not a whole number) reads as the default. */
const CHECKPOINT_RANGE: Record<keyof SmmDeliveryCheckpoints, [number, number]> = {
  sendVideo: [0, 6],
  longVideoExtraDays: [0, 3],
  longVideoClips: [2, 15],
  sendPoster: [0, 6],
  sendRealVideo: [0, 6],
  footage: [0, 6],
  approved: [0, 5],
};

const LADDER_RANGE: Record<Exclude<keyof SmmDeliveryLadder, "clientChaseDays">, [number, number]> = {
  deadlineDayHour: [6, 19],
  repeatHours: [1, 8],
  leadAfterWorkingDays: [0, 5],
  adminAfterWorkingDays: [1, 10],
  approvalSalespersonDays: [1, 7],
  approvalSalesAdminDays: [1, 14],
  footageSalesAdminDays: [0, 5],
  adReportHour: [9, 20],
  adCampaignStartDays: [1, 7],
  extraUnbilledDays: [1, 14],
  focusMinutes: [10, 120],
  onItHours: [1, 12],
  blockHours: [1, 72],
  moreTimePerTask: [0, 5],
  reassignsBeforeAdmin: [1, 5],
  revisionsBeforeWarning: [1, 5],
  maxFullScreenPerDay: [1, 10],
  freshMinutes: [1, 30],
  weeklyLoadLimit: [3, 40],
};

function wholeIn(value: unknown, [min, max]: [number, number], fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

const isMode = (v: unknown): v is SmmDeliveryMode => v === "off" || v === "preview" || v === "live";

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

const textOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** The chase days: whole days 1–30, each once, in order, at most five. */
export function cleanChaseDays(value: unknown): number[] {
  if (!Array.isArray(value)) return [...DEFAULT_SMM_DELIVERY_LADDER.clientChaseDays];
  const days = Array.from(new Set(value.map((d) => wholeIn(d, [1, 30], -1)).filter((d) => d > 0))).sort((a, b) => a - b).slice(0, 5);
  return days.length ? days : [...DEFAULT_SMM_DELIVERY_LADDER.clientChaseDays];
}

/** The pilot group: user ids, each once. */
export function cleanPilotUids(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((u): u is string => typeof u === "string").map((u) => u.trim()).filter(Boolean)));
}

function cleanHistory(value: unknown): SmmDeliverySwitch[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(asRecord)
    .filter((h) => isMode(h.mode) && typeof h.at === "number")
    .map((h) => ({
      mode: h.mode as SmmDeliveryMode,
      at: h.at as number,
      byUid: typeof h.byUid === "string" ? h.byUid : "",
      byName: typeof h.byName === "string" ? h.byName : "",
      reason: textOrNull(h.reason),
    }))
    .slice(-SMM_DELIVERY_HISTORY_LIMIT);
}

export function normaliseCheckpoints(value: unknown): SmmDeliveryCheckpoints {
  const raw = asRecord(value);
  const out = { ...DEFAULT_SMM_DELIVERY_CHECKPOINTS };
  for (const key of Object.keys(CHECKPOINT_RANGE) as (keyof SmmDeliveryCheckpoints)[]) {
    out[key] = wholeIn(raw[key], CHECKPOINT_RANGE[key], DEFAULT_SMM_DELIVERY_CHECKPOINTS[key]);
  }
  return out;
}

export function normaliseQuietHours(value: unknown): SmmDeliveryQuietHours {
  const raw = asRecord(value);
  const d = DEFAULT_SMM_DELIVERY_QUIET_HOURS;
  return {
    fromHour: wholeIn(raw.fromHour, [0, 23], d.fromHour),
    toHour: wholeIn(raw.toHour, [0, 23], d.toHour),
    sundays: typeof raw.sundays === "boolean" ? raw.sundays : d.sundays,
    holidays: typeof raw.holidays === "boolean" ? raw.holidays : d.holidays,
  };
}

export function normaliseLadder(value: unknown): SmmDeliveryLadder {
  const raw = asRecord(value);
  const out: SmmDeliveryLadder = { ...DEFAULT_SMM_DELIVERY_LADDER, clientChaseDays: cleanChaseDays(raw.clientChaseDays) };
  for (const key of Object.keys(LADDER_RANGE) as (keyof typeof LADDER_RANGE)[]) {
    out[key] = wholeIn(raw[key], LADDER_RANGE[key], DEFAULT_SMM_DELIVERY_LADDER[key]);
  }
  return out;
}

/**
 * The document as the app uses it. Anything missing, mistyped or out of range reads as its default, so a
 * hand-edited or half-written document can never stop the board (or, later, the alerts) — the worst it
 * does is fall back to the plan's numbers.
 */
export function parseSmmDeliverySettings(raw: unknown): SmmDeliverySettings {
  const d = asRecord(raw);
  const mode = isMode(d.mode) ? d.mode : DEFAULT_SMM_DELIVERY.mode;
  return {
    mode,
    pilotUids: cleanPilotUids(d.pilotUids),
    deadlineHour: wholeIn(d.deadlineHour, [9, 23], DEFAULT_SMM_DELIVERY.deadlineHour),
    checkpoints: normaliseCheckpoints(d.checkpoints),
    quietHours: normaliseQuietHours(d.quietHours),
    ladder: normaliseLadder(d.ladder),
    offReason: mode === "off" ? textOrNull(d.offReason) : null,
    offAt: mode === "off" ? d.offAt ?? null : null,
    offByUid: mode === "off" ? textOrNull(d.offByUid) : null,
    offByName: mode === "off" ? textOrNull(d.offByName) : null,
    history: cleanHistory(d.history),
    updatedAt: d.updatedAt ?? null,
    updatedByUid: textOrNull(d.updatedByUid),
    updatedByName: textOrNull(d.updatedByName),
    lastRunAt: d.lastRunAt ?? null,
    lastRunSummary: cleanRunSummary(d.lastRunSummary),
  };
}

/**
 * The server checker's last-run summary (phase 6), read leniently: no `at` (ms) → null; every count a whole
 * number ≥ 0 (anything else reads 0); an unknown mode reads as the document's default. Only the server writes it.
 */
export function cleanRunSummary(value: unknown): SmmDeliveryRunSummary | null {
  const raw = asRecord(value);
  if (typeof raw.at !== "number" || !Number.isFinite(raw.at)) return null;
  const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const out: SmmDeliveryRunSummary = {
    at: raw.at,
    mode: isMode(raw.mode) ? raw.mode : DEFAULT_SMM_DELIVERY.mode,
    months: count(raw.months),
    alerts: count(raw.alerts),
    delivered: count(raw.delivered),
    errors: count(raw.errors),
    ms: count(raw.ms),
  };
  if (raw.deferred !== undefined) out.deferred = count(raw.deferred);
  if (raw.pushed !== undefined) out.pushed = count(raw.pushed);
  return out;
}

/* ── Who may change it ─────────────────────────────────────────────────────────────────────── */

/** The switch and the numbers belong to the tech admin and the main admin (owner's decision 14). */
export function canManageSmmDelivery(user: { role?: string } | null | undefined): boolean {
  return user?.role === "tech_admin" || user?.role === "main_admin";
}

/** The team leaders see Settings, read-only. */
export function canViewSmmDeliverySettings(user: { role?: string } | null | undefined): boolean {
  return canManageSmmDelivery(user) || user?.role === "tech_team_leader";
}

export const SMM_DELIVERY_ADMIN_ONLY = "Only the tech admin or the main admin can change SMM Delivery Control.";

/**
 * Why this change of the switch is refused, or "" when it may go ahead. Turning it OFF needs a reason —
 * the owner (the main admin) is told who turned it off and why.
 */
export function modeChangeProblem(
  to: SmmDeliveryMode,
  reason: string | null | undefined,
  user: { role?: string } | null | undefined,
): string {
  if (!canManageSmmDelivery(user)) return SMM_DELIVERY_ADMIN_ONLY;
  if (!isMode(to)) return "Choose Off, Preview or Live.";
  if (to === "off" && (reason || "").trim().length < SMM_DELIVERY_OFF_REASON_MIN) {
    return "Say why it is being turned off — the owner is told.";
  }
  return "";
}

/**
 * Why these numbers cannot be saved, or "" when they can. Each step of a week must come before the next
 * (footage before sending, sending before approval), and each rung of the ladder after the one below it,
 * so a setting can never make an alert fire before the thing it chases was due.
 */
export function tunablesProblem(t: SmmDeliveryTunables): string {
  const c = t.checkpoints;
  const q = t.quietHours;
  const l = t.ladder;
  if (c.approved >= Math.min(c.sendVideo, c.sendPoster, c.sendRealVideo)) {
    return "The approval checkpoint must come after every \"sent to the client\" checkpoint (fewer days before the deadline).";
  }
  if (c.footage <= c.sendRealVideo) {
    return "The real video's footage must be due before it is sent to the client (more days before the deadline).";
  }
  if (q.fromHour === q.toHour) return "Quiet hours must start and end at different hours.";
  if (l.adminAfterWorkingDays <= l.leadAfterWorkingDays) {
    return "The admins must be alerted after the team leads (more working days after the deadline).";
  }
  if (l.approvalSalesAdminDays <= l.approvalSalespersonDays) {
    return "The sales admin must be alerted about a waiting approval after the salesperson.";
  }
  if (l.deadlineDayHour >= t.deadlineHour) return "The deadline-day alert must come before the deadline hour.";
  return "";
}

/**
 * A number in a change that is not a whole number inside its range — refused rather than silently read as
 * the default, so an admin never saves one value and finds another. "" when every given number fits.
 */
export function tunablesInputProblem(patch: Partial<SmmDeliveryTunables>): string {
  const bad = (value: unknown, range: [number, number]) => wholeIn(value, range, Number.NaN) !== value;
  if (patch.deadlineHour !== undefined && bad(patch.deadlineHour, [9, 23])) return "The deadline hour must be a whole hour from 9 to 23.";
  for (const [key, range] of Object.entries(CHECKPOINT_RANGE) as [keyof SmmDeliveryCheckpoints, [number, number]][]) {
    const v = patch.checkpoints?.[key];
    if (v !== undefined && bad(v, range)) return `Checkpoint "${key}" must be a whole number from ${range[0]} to ${range[1]}.`;
  }
  for (const key of ["fromHour", "toHour"] as const) {
    const v = patch.quietHours?.[key];
    if (v !== undefined && bad(v, [0, 23])) return "Quiet hours must be whole hours from 0 to 23.";
  }
  for (const [key, range] of Object.entries(LADDER_RANGE) as [keyof typeof LADDER_RANGE, [number, number]][]) {
    const v = patch.ladder?.[key];
    if (v !== undefined && bad(v, range)) return `"${key}" must be a whole number from ${range[0]} to ${range[1]}.`;
  }
  const chase = patch.ladder?.clientChaseDays;
  if (chase !== undefined && (!Array.isArray(chase) || chase.length === 0 || chase.some((d) => bad(d, [1, 30])))) {
    return "Client chase days must be whole days from 1 to 30.";
  }
  return "";
}

/** The tunables after a partial change, cleaned like a read. */
export function mergeTunables(current: SmmDeliverySettings, patch: Partial<SmmDeliveryTunables>): SmmDeliveryTunables {
  return {
    pilotUids: patch.pilotUids !== undefined ? cleanPilotUids(patch.pilotUids) : current.pilotUids,
    deadlineHour: patch.deadlineHour !== undefined ? wholeIn(patch.deadlineHour, [9, 23], current.deadlineHour) : current.deadlineHour,
    checkpoints: patch.checkpoints ? normaliseCheckpoints({ ...current.checkpoints, ...patch.checkpoints }) : current.checkpoints,
    quietHours: patch.quietHours ? normaliseQuietHours({ ...current.quietHours, ...patch.quietHours }) : current.quietHours,
    ladder: patch.ladder ? normaliseLadder({ ...current.ladder, ...patch.ladder }) : current.ladder,
  };
}

/** The switch's history with one more change (newest last, at most 20). */
export function withSwitch(history: readonly SmmDeliverySwitch[] | null | undefined, entry: SmmDeliverySwitch): SmmDeliverySwitch[] {
  return [...(history || []), entry].slice(-SMM_DELIVERY_HISTORY_LIMIT);
}

export function smmDeliveryModeLabel(mode: SmmDeliveryMode): string {
  return SMM_DELIVERY_MODES.find((m) => m.key === mode)?.label || mode;
}

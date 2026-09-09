/**
 * Delivery promise / turnaround SLA helpers.
 *
 * The sales member promises a delivery time at sale time (e.g. promotional 24h, website 5 days).
 * The countdown starts at sale; the tech team sees a live chip and is alerted near/overdue.
 * Single source of truth for promise presets + countdown math — imported by the sale form,
 * the Orders queue, and the WorkAssign/MyWork deadline chips.
 */
import { Timestamp } from "firebase/firestore";
import type { PromiseDeadline, PromiseDeadlineSource, PromiseExtension, UserRole } from "@/types";

export interface SlaPreset {
  key: string;
  label: string;
  hours: number;
  categories: string[]; // sales categories this preset is offered for
}

// Presets the user described: promotional 24h, cinematic 3–5 days, website 5/10/15 days.
// Everything else falls back to "custom".
export const SLA_PRESETS: SlaPreset[] = [
  { key: "promotional_24h", label: "24 hours", hours: 24, categories: ["promotional", "wishes"] },
  { key: "cinematic_3d", label: "3 days", hours: 72, categories: ["cinematic"] },
  { key: "cinematic_5d", label: "5 days", hours: 120, categories: ["cinematic"] },
  { key: "website_5d", label: "5 days", hours: 120, categories: ["website"] },
  { key: "website_10d", label: "10 days", hours: 240, categories: ["website"] },
  { key: "website_15d", label: "15 days", hours: 360, categories: ["website"] },
];

export const CUSTOM_PRESET_KEY = "custom";

/** Presets offered for a given category (the sale form appends a "custom" choice itself). */
export function presetsForCategory(category: string): SlaPreset[] {
  return SLA_PRESETS.filter((p) => p.categories.includes(category));
}

export function formatHoursLabel(hours: number): string {
  if (hours > 0 && hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days !== 1 ? "s" : ""}`;
  }
  return `${hours} hour${hours !== 1 ? "s" : ""}`;
}

/** Build a PromiseDeadline. `startMs` defaults to now (the countdown anchor at sale time). */
export function buildPromise(opts: { presetKey: string; customHours?: number; startMs?: number }): PromiseDeadline {
  const startMs = opts.startMs ?? Date.now();
  let hours: number;
  let label: string;
  let source: PromiseDeadlineSource;

  if (opts.presetKey === CUSTOM_PRESET_KEY) {
    hours = Math.max(1, Math.round(opts.customHours || 0));
    label = formatHoursLabel(hours);
    source = "custom";
  } else {
    const preset = SLA_PRESETS.find((p) => p.key === opts.presetKey);
    hours = preset?.hours ?? 24;
    label = preset?.label ?? formatHoursLabel(hours);
    source = "preset";
  }

  const dueMs = startMs + hours * 3_600_000;
  return {
    presetKey: opts.presetKey,
    label,
    hours,
    source,
    startAt: Timestamp.fromMillis(startMs),
    dueAt: Timestamp.fromMillis(dueMs),
  };
}

/** Pull the due time (ms) from a PromiseDeadline, tolerating Timestamp / {seconds} shapes. */
export function promiseDueMs(promise: PromiseDeadline | null | undefined): number {
  return tsMs(promise?.dueAt);
}

/** Epoch ms from any of the timestamp shapes this data has carried over time. */
function tsMs(value: unknown): number {
  const d = value as { toMillis?: () => number; seconds?: number } | null | undefined;
  if (!d) return 0;
  if (typeof d.toMillis === "function") return d.toMillis();
  if (typeof d.seconds === "number") return d.seconds * 1000;
  return 0;
}

/**
 * The deadline this promise was FIRST given — what "on time" originally meant.
 *
 * Falls back to the current `dueAt` for a promise nobody has extended, so a caller can print
 * "promised by X" without first asking whether an extension happened.
 */
export function promiseOriginalDueMs(promise: PromiseDeadline | null | undefined): number {
  return tsMs(promise?.originalDueAt) || promiseDueMs(promise);
}

// ─── The one extension a promise may be given ────────────────────────────────────────────────

/**
 * Who may move a delivery deadline, and when.
 *
 * The promise we send the client is conditional — 24 hours holds only while they confirm their
 * details and answer the script quickly. When they don't, the clock runs on work nobody could
 * start, and the tech member is marked late for a delay they had no part in. So the deadline can
 * be moved, ONCE, by any of the three people who might be first to learn the client has stalled:
 *
 *   • the tech member holding the work — they are the one watching an unanswered script
 *   • the tech team leader — who reviews it
 *   • the sales member who sold it — who is the one actually talking to the client
 *
 * A second extension is refused deliberately. Two moves make the promise mean nothing, and "it
 * keeps getting extended" is the exact failure the countdown exists to make visible.
 */
export function canExtendPromise(params: {
  promise: PromiseDeadline | null | undefined;
  role: UserRole | undefined;
  uid: string | undefined;
  /** The member currently holding the work, if any. */
  assigneeUid?: string | null;
  /** The sales member who sold it. */
  soldBy?: string | null;
}): { allowed: boolean; reason: string } {
  const { promise, role, uid, assigneeUid, soldBy } = params;
  if (!promise) return { allowed: false, reason: "This job has no promised delivery time." };
  if (promise.extension) {
    return {
      allowed: false,
      reason: `Already extended once by ${promise.extension.byName || "someone"} — a promise only moves once.`,
    };
  }
  if (!uid) return { allowed: false, reason: "Sign in to change a delivery time." };

  // Team leaders and the two admins may extend anything they can see; the member and the seller
  // may extend only their own job, which is the one they actually know the story of.
  if (role === "tech_team_leader" || role === "tech_admin" || role === "main_admin") {
    return { allowed: true, reason: "" };
  }
  if (uid === assigneeUid) return { allowed: true, reason: "" };
  if (uid === soldBy) return { allowed: true, reason: "" };
  return { allowed: false, reason: "Only the team leader, whoever is making it, or whoever sold it can move this." };
}

/**
 * The promise with its one extension applied.
 *
 * `hours` defaults to the promise's own length again — a 24-hour promise becomes 48 — because that
 * is the answer in almost every case, and a field pre-filled with the right number is the
 * difference between an extension recorded now and one recorded tomorrow. It stays editable: a
 * five-day website that stalled for an afternoon does not need another five days.
 *
 * The extension is measured from the ORIGINAL deadline, not from now. Measuring from now would
 * quietly reward leaving it late — a job extended six hours after it was already overdue would get
 * thirty hours rather than twenty-four.
 */
export function extendPromise(
  promise: PromiseDeadline,
  by: { hours?: number; uid: string; name: string; role: UserRole; reason?: string | null },
): PromiseDeadline {
  const hours = Math.max(1, Math.round(by.hours || promise.hours || 24));
  const fromMs = promiseDueMs(promise);
  const extension: PromiseExtension = {
    hours,
    at: Timestamp.now(),
    by: by.uid,
    byName: by.name,
    byRole: by.role,
    reason: by.reason?.trim() || null,
  };
  return {
    ...promise,
    // The label now describes the whole turnaround, because that is what everybody reads off a
    // card: "24 hours" on a job that is actually due in 48 is worse than no label.
    label: `${formatHoursLabel(promise.hours + hours)} (extended)`,
    hours: promise.hours + hours,
    originalDueAt: promise.originalDueAt ?? promise.dueAt,
    dueAt: Timestamp.fromMillis(fromMs + hours * 3_600_000),
    extension,
  };
}

export const NEAR_THRESHOLD_MS = 6 * 60 * 60 * 1000; // alert window: 6 hours before due

export type DeadlineState = "ok" | "near" | "overdue";

export function deadlineState(dueMs: number, now: number): DeadlineState {
  if (!dueMs) return "ok";
  if (now >= dueMs) return "overdue";
  if (dueMs - now <= NEAR_THRESHOLD_MS) return "near";
  return "ok";
}

/** Compact countdown text, e.g. "2d 4h left", "5h 12m left", "3h overdue". */
export function formatRemaining(dueMs: number, now: number): string {
  if (!dueMs) return "—";
  const overdue = now >= dueMs;
  const diff = Math.abs(dueMs - now);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  let core: string;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    core = rh > 0 ? `${d}d ${rh}h` : `${d}d`;
  } else if (h > 0) {
    core = `${h}h ${m}m`;
  } else {
    core = `${m}m`;
  }
  return overdue ? `${core} overdue` : `${core} left`;
}

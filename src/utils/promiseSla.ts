/**
 * Delivery promise / turnaround SLA helpers.
 *
 * The sales member promises a delivery time at sale time (e.g. promotional 24h, website 5 days).
 * The countdown starts at sale; the tech team sees a live chip and is alerted near/overdue.
 * Single source of truth for promise presets + countdown math — imported by the sale form,
 * the Orders queue, and the WorkAssign/MyWork deadline chips.
 */
import { Timestamp } from "firebase/firestore";
import type { PromiseDeadline, PromiseDeadlineSource } from "@/types";

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
  const d: any = promise?.dueAt;
  if (!d) return 0;
  if (typeof d.toMillis === "function") return d.toMillis();
  if (typeof d.seconds === "number") return d.seconds * 1000;
  return 0;
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

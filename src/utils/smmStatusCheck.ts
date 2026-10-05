/**
 * The twice-a-day "update your posts" check for the social-media team (2026-10-05, owner).
 *
 * The owner: "send a popup window to all the social media people who do the work — to update the status
 * of all the social media they are working on — two times per day". Chosen from the options offered:
 * at **11 AM and 5 PM** (the first moment the app is open after each), for **anyone holding a seat on a
 * month's team** (content, posting, marketing or helper), each seeing only their own months.
 *
 * Rules here, pure; `components/smm/SmmStatusCheckPopup` shows it. A slot is answered with "All
 * updated" (done for that slot on this device) or put off with "Later" (back in 30 minutes, same slot).
 * Opening the app after 5 PM without having answered 11 AM shows it once, for 5 PM.
 */
import { cyclePhase } from "@/utils/smmPackage";
import { isOverdue, isPosted } from "@/utils/smmPlan";
import { monthGlance } from "@/utils/smmGlance";
import type { SmmCampaign, SmmContentItem } from "@/types/smm";

export interface StatusCheckSlot {
  key: "am" | "pm";
  /** Local hour it opens at. */
  hour: number;
  label: string;
}

export const SMM_STATUS_CHECK_SLOTS: StatusCheckSlot[] = [
  { key: "am", hour: 11, label: "11 AM" },
  { key: "pm", hour: 17, label: "5 PM" },
];

/** "Later" puts it off this long. */
export const SMM_STATUS_CHECK_SNOOZE_MS = 30 * 60 * 1000;

/** The latest slot whose time has come today, or null before the first. */
export function dueSlot(now: Date): StatusCheckSlot | null {
  const hour = now.getHours();
  let found: StatusCheckSlot | null = null;
  for (const s of SMM_STATUS_CHECK_SLOTS) if (hour >= s.hour) found = s;
  return found;
}

/** What this device remembers: the day, the slots answered that day, and a "Later" until when. */
export interface StatusCheckMemory {
  day: string;
  done: StatusCheckSlot["key"][];
  snoozeUntil: number;
}

export function statusCheckStorageKey(uid: string): string {
  return `dts_smm_status_check_${uid}`;
}

/** Read back what was stored — anything unreadable, or another day's, is a fresh day. */
export function parseStatusCheckMemory(raw: string | null, day: string): StatusCheckMemory {
  try {
    const m = raw ? JSON.parse(raw) as Partial<StatusCheckMemory> : null;
    if (m && m.day === day) {
      return { day, done: Array.isArray(m.done) ? m.done.filter((k) => k === "am" || k === "pm") : [], snoozeUntil: Number(m.snoozeUntil) || 0 };
    }
  } catch { /* a fresh day */ }
  return { day, done: [], snoozeUntil: 0 };
}

/** Is a slot waiting to be shown now? */
export function slotToShow(now: Date, memory: StatusCheckMemory): StatusCheckSlot | null {
  const slot = dueSlot(now);
  if (!slot || memory.done.includes(slot.key)) return null;
  if (memory.snoozeUntil > now.getTime()) return null;
  return slot;
}

/** "All updated": this slot and any earlier one today are answered. */
export function answerSlot(memory: StatusCheckMemory, slot: StatusCheckSlot): StatusCheckMemory {
  const upTo = SMM_STATUS_CHECK_SLOTS.filter((s) => s.hour <= slot.hour).map((s) => s.key);
  return { ...memory, done: Array.from(new Set([...memory.done, ...upTo])), snoozeUntil: 0 };
}

export function snoozeSlot(memory: StatusCheckMemory, now: Date): StatusCheckMemory {
  return { ...memory, snoozeUntil: now.getTime() + SMM_STATUS_CHECK_SNOOZE_MS };
}

/* ── What to ask about ─────────────────────────────────────────────────────────────────────── */

/** Does this person hold a seat on the month's team? (Being its salesperson is not working on it.) */
export function holdsSeat(c: Pick<SmmCampaign, "team">, uid: string): boolean {
  const t = c.team;
  if (!t || !uid) return false;
  return [t.creator?.uid, t.publisher?.uid, t.marketer?.uid, ...(t.assistants || []).map((a) => a?.uid)].includes(uid);
}

/** Is this piece theirs — made or published by them? */
export function isMine(item: SmmContentItem, uid: string): boolean {
  return item.makerUid === uid || item.publisherUid === uid;
}

export interface StatusCheckMonth {
  campaign: SmmCampaign;
  /** Pieces not posted yet: theirs first, then late ones, then by upload date. */
  open: SmmContentItem[];
  posted: number;
  promised: number;
}

/**
 * The months running today that this person works on, each with the pieces still to post. Months with
 * nothing left are left out; worst first (most late pieces, then most open).
 */
export function statusCheckMonths(campaigns: SmmCampaign[], uid: string, today: string): StatusCheckMonth[] {
  const out: StatusCheckMonth[] = [];
  for (const c of campaigns) {
    if (c.status !== "active" || c.history || !c.cycle || cyclePhase(c.cycle, today) !== "running" || !holdsSeat(c, uid)) continue;
    const pieces = (c.items || []);
    const open = pieces.filter((i) => !isPosted(i)).sort((a, b) => {
      const mine = Number(isMine(b, uid)) - Number(isMine(a, uid));
      if (mine !== 0) return mine;
      const late = Number(isOverdue(b, today)) - Number(isOverdue(a, today));
      if (late !== 0) return late;
      return (a.uploadDate || "9999").localeCompare(b.uploadDate || "9999") || (a.title || "").localeCompare(b.title || "");
    });
    if (open.length === 0) continue;
    // "6/16 posted" exactly as the month's card and page say it (what was promised, not the rows).
    const glance = monthGlance(c, today);
    out.push({ campaign: c, open, posted: glance.posted, promised: glance.total });
  }
  const late = (m: StatusCheckMonth) => m.open.filter((i) => isOverdue(i, today)).length;
  return out.sort((a, b) => late(b) - late(a) || b.open.length - a.open.length
    || (a.campaign.businessName || "").localeCompare(b.campaign.businessName || ""));
}

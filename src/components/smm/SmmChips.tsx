/**
 * The small repeated marks of this section — a status, the accounts, a due date.
 *
 * Kept together because they appear in five places each (the table, the phone cards, the item
 * dialog, the campaign card, the report) and a status that is amber in one of them and grey in
 * another is a status nobody trusts.
 */
import type { LucideIcon } from "lucide-react";
import { Instagram, Facebook, Youtube, Linkedin, Hash, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { SMM_ITEM_STATUSES, SMM_PLATFORMS, type SmmItemStatus, type SmmPlatform } from "@/types/smm";
import { daysUntilDue, isPosted } from "@/utils/smmPlan";

/** Epoch ms from whichever timestamp shape a stored `postedAt` happens to carry. */
function tsToMs(ts: unknown): number {
  if (ts === null || ts === undefined) return 0;
  if (typeof ts === "number") return ts;
  const t = ts as { toMillis?: () => number; seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  return typeof t.seconds === "number" ? t.seconds * 1000 : 0;
}
import type { SmmContentItem } from "@/types/smm";

/*
  The section's stage colours (2026-10-04, index.css --viz-*): a dot in the stage's colour and the
  words in the text colour — the old orange "Approved" read like a warning, and amber words on a light
  card could not be read.
*/
const TONE_CLASS: Record<string, { chip: string; dot: string }> = {
  idle: { chip: "bg-muted text-muted-foreground", dot: "bg-viz-axis" },
  work: { chip: "bg-viz-work/15 text-foreground", dot: "bg-viz-work" },
  wait: { chip: "bg-viz-wait/20 text-foreground", dot: "bg-viz-wait" },
  ready: { chip: "bg-viz-ready/15 text-foreground", dot: "bg-viz-ready" },
  done: { chip: "bg-viz-done/15 text-foreground", dot: "bg-viz-done" },
};

export function StatusChip({ status, className = "" }: { status: SmmItemStatus; className?: string }) {
  const meta = SMM_ITEM_STATUSES.find((s) => s.key === status);
  const tone = TONE_CLASS[meta?.tone || "idle"];
  return (
    <span
      data-test={`smm-status-${status}`}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${tone.chip} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {meta?.label || status}
    </span>
  );
}

const PLATFORM_ICON: Record<SmmPlatform, LucideIcon> = {
  instagram: Instagram, facebook: Facebook, youtube: Youtube, linkedin: Linkedin, x: Hash,
};

/** Which accounts a post goes on. Icons, because five names do not fit in a table cell. */
export function PlatformChips({ platforms, size = 12 }: { platforms: SmmPlatform[]; size?: number }) {
  if (!platforms?.length) return <span className="text-[10px] text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1" data-test="smm-platforms">
      {SMM_PLATFORMS.filter((p) => platforms.includes(p.key)).map(({ key, label }) => {
        const Icon = PLATFORM_ICON[key];
        return <Icon key={key} size={size} className="text-muted-foreground" aria-label={label} />;
      })}
    </span>
  );
}

/**
 * When a post is due, and how worried to be about it.
 *
 * Late is red, today and tomorrow are amber, posted is green and everything else is plain. The
 * three-day window is the one the reminders use, so a member seeing amber here is seeing exactly
 * what will greet them at check-in.
 */
export function DueChip({ item, today }: { item: SmmContentItem; today: string }) {
  /*
    A posted piece already carries a green "Posted" chip beside it in every place this appears, so
    repeating the word here would waste the one line a phone card has. What is actually useful once
    something is up is WHEN it went up — and whether that was the day it was promised.
  */
  if (isPosted(item)) {
    const ms = tsToMs(item.postedAt);
    const ago = ms ? Math.max(0, Math.round((Date.parse(`${today}T00:00:00`) - ms) / 86_400_000)) : null;
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-success">
        <CheckCircle2 size={11} />
        {ago === null ? "Up" : ago === 0 ? "Up today" : ago === 1 ? "Up yesterday" : `Up ${ago}d ago`}
      </span>
    );
  }
  const days = daysUntilDue(item, today);
  if (days === null) return <span className="text-[11px] text-muted-foreground">No date</span>;

  if (days < 0) {
    return (
      <span data-test="smm-due-late" className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive">
        <AlertTriangle size={11} /> {Math.abs(days)}d late
      </span>
    );
  }
  const tone = days <= 1 ? "text-warning font-medium" : days <= 3 ? "text-warning" : "text-muted-foreground";
  const label = days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days}d`;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${tone}`}>
      <Clock size={11} /> {label}
    </span>
  );
}

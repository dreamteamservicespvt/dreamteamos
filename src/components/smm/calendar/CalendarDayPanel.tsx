/**
 * One day of a client's calendar, in full (2026-10-05) — always UNDER the calendar, the day's posts side
 * by side as the width allows.
 *
 * Beside the calendar (the second version, from 1280px) the list made a column as long as the day's
 * posts: nine posts left the calendar at the top of a field of empty space (the owner's screenshot). Under
 * it, the cards share the full width — four or five across on a laptop, one on a phone.
 *
 * Every post is one card a person can read aloud: the big mark (✔ posted, ✖ not posted, ◷ coming up), what
 * it is, one sentence on what happened ("Posted on 15 Aug, 6:00 AM", "Not posted — it was due on 25 Aug"),
 * what it is waiting for, a button to see it live on each account, and — for the month whose page this is —
 * Open, beside its name so the buttons stay on one line.
 */
import { AlertTriangle, ArrowUpRight, ExternalLink, Gift, MoveRight } from "lucide-react";
import { postLinks } from "@/utils/smmPlan";
import { clockLabel } from "@/utils/smmGlance";
import {
  entryNote, entryTitle, longDayLabel, rangeLabel, waitingNote, type CalendarClientMonth, type CalendarEntry,
} from "@/utils/smmCalendar";
import { KIND_ICON } from "@/components/smm/calendar/kindIcons";
import { MarkIcon } from "@/components/smm/calendar/marks";
import { SMM_CONTENT_KINDS, type SmmContentItem } from "@/types/smm";

const kindWord = (item: SmmContentItem) => SMM_CONTENT_KINDS.find((k) => k.key === item.kind)?.singular || "Post";

/** The cards share the width: as many 17rem columns as fit, one on a phone. */
export const POST_GRID = "grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))]";

/** One post, in plain words. */
export function PostRow({ entry, today, canOpen, onOpenItem, monthLabel, outside }: {
  entry: CalendarEntry;
  today: string;
  /** This post is in the month whose page this is — it opens for editing. */
  canOpen: boolean;
  onOpenItem?: (item: SmmContentItem) => void;
  /** "Month 1" — said when the page shows more than one of the client's months. */
  monthLabel?: string;
  /** Its month, when its date lies outside it (a date typed a month early). */
  outside?: CalendarClientMonth | null;
}) {
  const { item } = entry;
  const KindIcon = KIND_ICON[item.kind];
  const links = postLinks(item);
  const waiting = waitingNote(item);
  // The upload time goes with the upload date the sentence names.
  const time = entry.plannedDay ? clockLabel(item.uploadTime) : null;
  const open = canOpen && onOpenItem;
  return (
    <article data-test="smm-cal-entry" data-mark={entry.mark} data-key={entry.key}
      className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-background/60 p-3">
      <div className="flex items-start gap-2.5">
        <MarkIcon mark={entry.mark} size="md" />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold leading-snug text-foreground">{entryTitle(item)}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[11px] text-muted-foreground">
            {KindIcon && <KindIcon size={11} aria-hidden />} {kindWord(item)}
            {monthLabel && <span>· {monthLabel}</span>}
            {item.extra && <span className="inline-flex items-center gap-0.5">· <Gift size={10} aria-hidden /> extra work</span>}
            {item.carriedFrom && <span className="inline-flex items-center gap-0.5">· <MoveRight size={10} aria-hidden /> from {item.carriedFrom.label}</span>}
          </p>
        </div>
        {open && (
          <button type="button" data-test="smm-cal-entry-open" onClick={() => onOpenItem(item)}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-primary/10 px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20">
            Open <ArrowUpRight size={12} />
          </button>
        )}
      </div>
      <div>
        <p data-test="smm-cal-entry-note" className={`text-sm leading-snug ${entry.mark === "notPosted" ? "font-semibold text-foreground" : "text-foreground/90"}`}>
          {entryNote(entry, today)}{time ? `, ${time}` : ""}
        </p>
        {waiting && <p data-test="smm-cal-entry-waiting" className="mt-0.5 text-xs text-muted-foreground">{waiting}</p>}
        {outside && (
          <p data-test="smm-cal-entry-outside" className="mt-1 flex items-start gap-1 text-xs text-foreground/80">
            <AlertTriangle size={12} className="mt-px shrink-0 text-warning" aria-hidden />
            Its date is outside {outside.name} ({rangeLabel(outside.startDate, outside.endDate)})
          </p>
        )}
      </div>
      {links.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {links.map((l) => (
            <a key={l.platform} href={l.url} target="_blank" rel="noreferrer" data-test="smm-cal-entry-link"
              aria-label={`See on ${l.label}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent">
              {l.label} <ExternalLink size={12} className="text-muted-foreground" />
            </a>
          ))}
        </div>
      )}
    </article>
  );
}

export default function CalendarDayPanel({ day, today, entries, partOfRun, count, renderEntry }: {
  day: string;
  today: string;
  entries: CalendarEntry[];
  /** The day is in one of the client's months (or has posts) — else nothing could be on it. */
  partOfRun: boolean;
  /** How many posts the day has — said beside its name. */
  count: number;
  /** Draws one post (the calendar knows which ones open and which months to name). */
  renderEntry: (entry: CalendarEntry) => JSX.Element;
}) {
  const isToday = day === today;
  return (
    <section data-test="smm-cal-panel" aria-live="polite" aria-label={`Posts on ${longDayLabel(day)}`} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 data-test="smm-cal-panel-day" className="text-base font-bold text-foreground">{longDayLabel(day)}</h3>
        {isToday && <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">Today</span>}
        {count > 0 && <span className="text-sm text-muted-foreground">· {count} post{count === 1 ? "" : "s"}</span>}
      </div>
      {entries.length === 0 ? (
        <p data-test="smm-cal-panel-empty" className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          {!partOfRun ? "This day is not part of any of this client's months." : day < today ? "Nothing was planned for this day." : isToday ? "Nothing is planned for today." : "Nothing is planned for this day yet."}
        </p>
      ) : (
        <div className={POST_GRID}>{entries.map(renderEntry)}</div>
      )}
    </section>
  );
}

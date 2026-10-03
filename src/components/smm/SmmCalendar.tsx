/**
 * The month's content as a calendar (2026-10-03).
 *
 * The table answers "what is the next thing to do"; this answers "what does the client's feed look
 * like this month" — the gaps of a week with nothing going up, the three posts piled onto one
 * Saturday. Every piece sits on its upload day, coloured by how far it has got; tapping one opens
 * it. On a phone the grid would be seven columns of unreadable text, so it becomes an agenda: only
 * the days that have something on them, in order.
 */
import { addDays, daysBetween, isoDay } from "@/utils/smmPlan";
import { shortDayLabel, toneOf } from "@/utils/smmPackage";
import { TONE_CHIP } from "@/components/smm/SmmVisuals";
import type { SmmCampaign, SmmContentItem } from "@/types/smm";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Monday = 0 … Sunday = 6, for a `yyyy-MM-dd`. */
function weekdayIndex(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

function Chip({ item, today, onOpen }: { item: SmmContentItem; today: string; onOpen: (i: SmmContentItem) => void }) {
  return (
    <button
      type="button"
      data-test="smm-cal-item"
      data-tone={toneOf(item, today)}
      onClick={() => onOpen(item)}
      title={item.title?.trim() || "Untitled"}
      className={`block w-full truncate rounded border px-1 py-0.5 text-left text-[10px] font-medium leading-tight ${TONE_CHIP[toneOf(item, today)]}`}
    >
      {item.uploadTime ? `${item.uploadTime} ` : ""}{item.title?.trim() || (item.kind === "poster" ? "Poster" : "Video")}
    </button>
  );
}

export default function SmmCalendar({ campaign, onOpen }: {
  campaign: SmmCampaign;
  onOpen: (item: SmmContentItem) => void;
}) {
  const today = isoDay(new Date());
  const { startDate, endDate } = campaign.cycle;
  const total = Math.max(1, daysBetween(startDate, endDate) + 1);
  const days = Array.from({ length: total }, (_, i) => addDays(startDate, i));

  const byDay = new Map<string, SmmContentItem[]>();
  const unscheduled: SmmContentItem[] = [];
  for (const item of campaign.items) {
    if (!item.uploadDate || item.uploadDate < startDate || item.uploadDate > endDate) {
      unscheduled.push(item);
      continue;
    }
    const list = byDay.get(item.uploadDate) || [];
    list.push(item);
    byDay.set(item.uploadDate, list.sort((a, b) => (a.uploadTime || "").localeCompare(b.uploadTime || "")));
  }
  const lead = weekdayIndex(startDate);

  return (
    <div data-test="smm-calendar">
      {/* Tablet and up: the month as a grid. */}
      <div className="hidden overflow-hidden rounded-lg border border-border sm:block">
        <div className="grid grid-cols-7 border-b border-border bg-muted/50 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {WEEKDAYS.map((d) => <div key={d} className="px-1.5 py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: lead }, (_, i) => <div key={`pad-${i}`} className="min-h-[76px] border-b border-r border-border bg-muted/20" />)}
          {days.map((day, i) => {
            const items = byDay.get(day) || [];
            const isToday = day === today;
            const first = i === 0 || day.endsWith("-01");
            return (
              <div key={day} data-test="smm-cal-day"
                className={`min-h-[76px] min-w-0 border-b border-r border-border p-1 ${isToday ? "bg-primary/5 ring-1 ring-inset ring-primary" : ""}`}>
                <div className={`mb-0.5 text-[10px] font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                  {first ? shortDayLabel(day) : Number(day.slice(8))}
                </div>
                <div className="space-y-0.5">
                  {items.slice(0, 3).map((it) => <Chip key={it.id} item={it} today={today} onOpen={onOpen} />)}
                  {items.length > 3 && <p className="text-[9px] text-muted-foreground">+{items.length - 3} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Phone: only the days with something on them. */}
      <div className="space-y-2 sm:hidden">
        {days.filter((d) => byDay.has(d) || d === today).map((day) => (
          <div key={day} className={`rounded-lg border p-2 ${day === today ? "border-primary" : "border-border"}`}>
            <p className={`mb-1 text-[11px] font-semibold ${day === today ? "text-primary" : "text-foreground"}`}>
              {shortDayLabel(day)} · {WEEKDAYS[weekdayIndex(day)]}{day === today ? " · today" : ""}
            </p>
            <div className="space-y-1">
              {(byDay.get(day) || []).map((it) => <Chip key={it.id} item={it} today={today} onOpen={onOpen} />)}
              {!byDay.has(day) && <p className="text-[10px] text-muted-foreground">Nothing going up today.</p>}
            </div>
          </div>
        ))}
        {byDay.size === 0 && <p className="text-center text-xs text-muted-foreground">No piece has a date in this month yet.</p>}
      </div>

      {unscheduled.length > 0 && (
        <div data-test="smm-cal-unscheduled" className="mt-3 rounded-lg border border-dashed border-border p-2">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">
            No date in this month yet ({unscheduled.length}) — give them a day so they show on the calendar:
          </p>
          <div className="grid gap-1 sm:grid-cols-3 lg:grid-cols-4">
            {unscheduled.map((it) => <Chip key={it.id} item={it} today={today} onOpen={onOpen} />)}
          </div>
        </div>
      )}
    </div>
  );
}

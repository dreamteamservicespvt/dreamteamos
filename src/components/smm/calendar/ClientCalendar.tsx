/**
 * A client's social media as a normal calendar — one calendar month per page, across all their months
 * (2026-10-05, redrawn twice that day; the rules are in utils/smmCalendar).
 *
 * ── Built to be read by anybody ───────────────────────────────────────────────────────────────
 * Top to bottom:
 *   1. WHICH MONTH — "‹ Sep · October 2026 ▾ · Nov ›" and Today, always there (the second version paged
 *      by the client's months, so a client with one month had nothing to switch to — the owner found "no
 *      option to change the month"). The title opens a list of every month. The arrows stop at the
 *      client's first and last months and say so. Under it, the client's months on this page — "Month 2 ·
 *      6 Sep – 6 Oct · Running now" — each a link to its own page.
 *   2. HOW IT WENT — three counts with their marks, for the days on screen: ✔ Posted · ✖ Not posted ·
 *      ◷ Coming up. They are the legend too.
 *   3. WHEN — the month, Monday first. A day lists its posts by name (mark first), or only its marks with a
 *      number when there is no room; where a client's month starts or ends is written on the day. Tap a
 *      day and its posts are listed under the calendar in sentences.
 *
 * ── Sized by the room it has, not the screen ──────────────────────────────────────────────────
 * It sits beside the app's sidebar, beside the client list on the board and inside the Report tab, so the
 * screen's width says little about its own. It measures itself (`useWidth`): from 600px a day lists its
 * posts by name (two, or three from 960px, the last line "+7 more" when there are more); narrower, a day
 * shows only its marks. The picked day's posts are always UNDER the calendar, side by side as the width
 * allows — beside it (the second version, from 1280px) they made a column as long as the day's list, and
 * nine posts left the calendar at the top of a field of empty space (the owner's screenshot).
 *
 * Keyboard: arrows move a day (over the month's edge into the next), Page Up / Page Down change month.
 * Touch: swipe left or right on the grid to change month.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type TouchEvent } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Flag, Hand, Loader2, RotateCcw } from "lucide-react";
import { addDays } from "@/utils/smmPlan";
import {
  CAL_WEEKDAYS, DAY_MARKS, buildClientRun, calendarPage, clientMonthOn, dayMarks, entryTitle, longDayLabel, monthBounds,
  monthOf, monthShort, monthTitle, openingDay, openingMonth, outsideItsMonth, phaseLabel, rangeLabel, shiftMonth,
  type CalendarEntry, type CalendarKind, type CalendarPage, type ClientRun, type DayMark, type MonthMarker,
} from "@/utils/smmCalendar";
import CalendarDayPanel, { POST_GRID, PostRow } from "@/components/smm/calendar/CalendarDayPanel";
import { MarkIcon } from "@/components/smm/calendar/marks";
import { useWidth } from "@/components/smm/dashboard/chartKit";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SmmCampaign, SmmContentItem } from "@/types/smm";

/** From this width (the calendar's own) a day lists its posts by name; below it, only its marks. */
const NAMES_FROM = 600;
/** From this width a day lists three posts by name, else two. */
const THREE_FROM = 960;

const PHASE_STYLE: Record<string, string> = {
  "Running now": "bg-viz-done/15 text-foreground",
  Finished: "bg-muted text-muted-foreground",
};

/** A post's name inside a day, tinted by its mark (the mark itself leads it). */
const CHIP_BG: Record<DayMark, string> = {
  posted: "bg-viz-done/10",
  notPosted: "bg-viz-late/10",
  coming: "bg-muted",
};

const markerWords = (m: MonthMarker) => `${m.month.name} ${m.kind === "start" ? "starts" : "ends"}`;

/** ‹ / › — says which month it goes to; greyed, and says so, at the client's first or last month. */
function StepButton({ dir, to, enabled, showName, onGo }: {
  dir: "prev" | "next";
  to: string;
  enabled: boolean;
  showName: boolean;
  onGo: (ym: string) => void;
}) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  const label = enabled
    ? `${dir === "prev" ? "Previous" : "Next"} month: ${monthTitle(to)}`
    : dir === "prev" ? "No earlier month for this client" : "No later month for this client";
  return (
    <button type="button" data-test={`smm-cal-${dir}`} disabled={!enabled} onClick={() => onGo(to)} aria-label={label} title={label}
      className={`inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded-xl border border-border bg-background text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background ${
        showName ? "px-2.5" : "w-10"
      } ${dir === "next" ? "flex-row-reverse" : ""}`}>
      <Icon size={18} className="shrink-0 text-primary" />
      {showName && <span aria-hidden>{monthShort(to)}</span>}
    </button>
  );
}

/** The month's name — tap it for a list of every month the client has, newest first, with their marks. */
function MonthPicker({ run, ym, onGo, big }: { run: ClientRun; ym: string; onGo: (ym: string) => void; big: boolean }) {
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => {
    const counts = new Map<string, Record<DayMark, number>>();
    const owners = new Map<string, Set<string>>();
    for (const e of run.entries) {
      if (!e.day) continue;
      const m = monthOf(e.day);
      const c = counts.get(m) || { posted: 0, notPosted: 0, coming: 0 };
      c[e.mark] += 1;
      counts.set(m, c);
      owners.set(m, (owners.get(m) || new Set<string>()).add(e.monthId));
    }
    const out: { ym: string; names: string; counts?: Record<DayMark, number> }[] = [];
    for (let m = run.last; m >= run.first && out.length < 240; m = shiftMonth(m, -1)) {
      const { first, last } = monthBounds(m);
      // The same months the page names: those running in it, and those with a post dated in it.
      const names = run.months
        .filter((c) => (c.startDate <= last && c.endDate >= first) || owners.get(m)?.has(c.id))
        .map((c) => c.name).join(", ");
      out.push({ ym: m, names, counts: counts.get(m) });
    }
    return out;
  }, [run]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <h2 className="min-w-0">
        <PopoverTrigger asChild>
          <button type="button" data-test="smm-cal-pick-month" aria-label={`${monthTitle(ym)} — choose another month`}
            className="inline-flex max-w-full items-center gap-1 rounded-xl px-2 py-1 transition-colors hover:bg-accent">
            {/* The body face on a phone: the heading face (Syne) is wide — "October 2026" needed 195px where a
                360px phone leaves 166, and was cut to "Octob…" (browser check, 2026-10-05). */}
            <span data-test="smm-cal-title" aria-live="polite"
              className={`truncate font-extrabold tracking-tight text-foreground ${big ? "text-2xl" : "font-body text-xl"}`}>
              {monthTitle(ym)}
            </span>
            <ChevronDown size={18} className="shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </PopoverTrigger>
      </h2>
      <PopoverContent align="center" className="w-72 p-1.5">
        <p className="px-2 pb-1.5 pt-1 text-xs font-semibold text-muted-foreground">Go to a month</p>
        <nav aria-label="Months" data-test="smm-cal-months" className="max-h-72 overflow-y-auto">
          {rows.map((r) => {
            const on = r.ym === ym;
            return (
              <button key={r.ym} type="button" data-test="smm-cal-month-option" data-ym={r.ym} aria-current={on ? "true" : undefined}
                onClick={() => { onGo(r.ym); setOpen(false); }}
                className={`flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${on ? "bg-primary/10" : "hover:bg-accent"}`}>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${on ? "font-bold text-primary" : "font-semibold text-foreground"}`}>{monthTitle(r.ym)}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{r.names || "No month of this client"}</span>
                </span>
                {r.counts && (
                  <span className="flex shrink-0 items-center gap-1.5">
                    {DAY_MARKS.filter(({ key }) => r.counts![key] > 0).map(({ key }) => (
                      <span key={key} className="inline-flex items-center gap-0.5 text-xs font-bold text-foreground">
                        <MarkIcon mark={key} size="xs" /> {r.counts![key]}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </PopoverContent>
    </Popover>
  );
}

/** The three counts — the posts on this page's days — which are also the legend. */
function Counts({ page, row }: { page: CalendarPage; row: boolean }) {
  return (
    <div data-test="smm-cal-counts" role="group" aria-label={`Posts in ${page.title}`}
      className={row ? "flex flex-wrap items-stretch gap-2" : "grid grid-cols-3 gap-2"}>
      {DAY_MARKS.map(({ key, label }) => (
        <div key={key} data-test={`smm-cal-count-${key}`}
          className={`flex rounded-xl border border-border bg-background/60 ${
            row ? "items-center gap-2.5 px-3 py-2" : "flex-col items-center gap-1 px-1 py-2 text-center"
          }`}>
          <MarkIcon mark={key} size="md" />
          <span className="min-w-0">
            <span className="block text-xl font-extrabold leading-none text-foreground">{page.counts[key]}</span>
            <span className="mt-0.5 block text-xs font-semibold text-foreground/80">{label}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** The client's months on this page, each a link to its own page (the page's own month is not). */
function ClientMonths({ page, today, focusId }: { page: CalendarPage; today: string; focusId?: string }) {
  if (page.months.length === 0) {
    return <p data-test="smm-cal-no-month" className="text-xs text-muted-foreground">None of this client's months runs in {page.title}.</p>;
  }
  return (
    <>
      {page.months.map((m) => {
        const phase = phaseLabel(m, today);
        const body = (
          <>
            <span className="font-bold">{m.name}</span>
            <span className="text-foreground/80">· {rangeLabel(m.startDate, m.endDate)}</span>
            <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${PHASE_STYLE[phase] || "bg-viz-ready/15 text-foreground"}`}>{phase}</span>
          </>
        );
        const cls = "inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg border px-2.5 py-1 text-xs text-foreground";
        return m.id === focusId ? (
          <span key={m.id} data-test="smm-cal-client-month" data-id={m.id} className={`${cls} border-primary/50 bg-primary/5`}>{body}</span>
        ) : (
          <Link key={m.id} to={`/smm/${m.id}`} data-test="smm-cal-client-month" data-id={m.id}
            className={`${cls} border-border transition-colors hover:bg-accent`}>
            {body}
            <span className="sr-only">— open its page</span>
            <ArrowUpRight size={12} className="text-primary" aria-hidden />
          </Link>
        );
      })}
    </>
  );
}

export default function ClientCalendar({
  months, today, kind = "all", focusId, onOpenItem, loading = false, error = false, onRetry,
}: {
  /** The client's months this viewer may see (see useSmmClientMonths). */
  months: SmmCampaign[];
  today: string;
  kind?: CalendarKind;
  /** The month whose page this is: the calendar opens on it, and its posts open for editing. */
  focusId?: string;
  onOpenItem?: (item: SmmContentItem) => void;
  /** The client's other months are still being read. */
  loading?: boolean;
  /** They could not be read. */
  error?: boolean;
  onRetry?: () => void;
}) {
  const run = useMemo(() => buildClientRun(months, today, kind), [months, today, kind]);
  const [rootRef, width] = useWidth<HTMLDivElement>(1024);
  const names = width >= NAMES_FROM;
  const maxNames = width >= THREE_FROM ? 3 : 2;

  // The month on screen follows the opening month until somebody changes it.
  const [wanted, setWanted] = useState<string | null>(null);
  const opening = run ? openingMonth(run, today, focusId) : monthOf(today);
  const ym = run && wanted && wanted >= run.first && wanted <= run.last ? wanted : opening;
  const page = useMemo(() => (run ? calendarPage(run, ym) : null), [run, ym]);

  const [picked, setPicked] = useState<{ ym: string; day: string } | null>(null);
  const day = run && page ? (picked && picked.ym === ym ? picked.day : openingDay(run, page, today)) : today;
  const [dir, setDir] = useState<"next" | "prev" | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const byKeyboard = useRef(false);
  const [reveal, setReveal] = useState(0);

  const goMonth = (to: string, pickDay?: string) => {
    if (!run || to < run.first || to > run.last) return;
    if (to !== ym) setDir(to > ym ? "next" : "prev");
    setWanted(to);
    setPicked(pickDay ? { ym: to, day: pickDay } : null);
  };
  const pick = (d: string) => setPicked({ ym, day: d });

  // A keyboard move takes the focus with it — never stealing it from a button somebody clicked.
  useEffect(() => {
    if (!byKeyboard.current) return;
    byKeyboard.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${day}"]`)?.focus();
  }, [day, ym]);

  // A day tapped while its posts are out of sight below: bring them up (a phone's usual case).
  useEffect(() => {
    if (!reveal) return;
    const el = panelRef.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight - 120) el.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [reveal]);

  if (!run || !page) {
    // The same root element as the calendar (a div in the same place), so `useWidth` keeps measuring it.
    return (
      <div ref={rootRef} data-test="smm-calendar" className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        {loading ? "Loading this client's months…" : "There is no month to show."}
      </div>
    );
  }

  const prevYm = shiftMonth(ym, -1);
  const nextYm = shiftMonth(ym, 1);
  const todayYm = monthOf(today);
  const showToday = todayYm >= run.first && todayYm <= run.last;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "PageUp" || e.key === "PageDown") {
      const to = e.key === "PageUp" ? prevYm : nextYm;
      if (to < run.first || to > run.last) return;
      e.preventDefault();
      byKeyboard.current = true;
      goMonth(to);
      return;
    }
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(e.key in moves)) return;
    const target = addDays(day, moves[e.key]);
    const to = monthOf(target);
    if (to < run.first || to > run.last) return;
    e.preventDefault();
    byKeyboard.current = true;
    if (to === ym) pick(target);
    else goMonth(to, target);
  };
  const onTouchStart = (e: TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    goMonth(dx < 0 ? nextYm : prevYm);
  };

  const weeks = Array.from({ length: page.days.length / 7 }, (_, w) => page.days.slice(w * 7, w * 7 + 7));
  const several = page.months.length > 1;
  const renderEntry = (e: CalendarEntry) => (
    <PostRow key={e.key} entry={e} today={today} canOpen={!!focusId && e.monthId === focusId} onOpenItem={onOpenItem}
      monthLabel={several ? run.months.find((m) => m.id === e.monthId)?.name : undefined} outside={outsideItsMonth(run, e)} />
  );
  const dayEntries = page.byDay.get(day) || [];
  const cellHeight = names ? (maxNames === 3 ? "min-h-[7.25rem]" : "min-h-[6rem]") : "min-h-[4.25rem]";

  const todayButton = showToday && (
    <button type="button" data-test="smm-cal-today" onClick={() => goMonth(todayYm, today)} disabled={ym === todayYm && day === today}
      className="inline-flex h-10 shrink-0 items-center rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-50 disabled:hover:bg-background">
      Today
    </button>
  );

  return (
    <div ref={rootRef} data-test="smm-calendar" className="overflow-hidden rounded-2xl border border-border bg-card">
      {/* ── 1. Which month ─────────────────────────────────────────────────────────────────── */}
      <div className="space-y-3 border-b border-border p-3 sm:p-4">
        <div className={names ? "flex flex-wrap items-center justify-between gap-3" : "space-y-3"}>
          <div className="flex min-w-0 items-center gap-1.5">
            <StepButton dir="prev" to={prevYm} enabled={prevYm >= run.first} showName={names} onGo={(m) => goMonth(m)} />
            <div className={`flex min-w-0 justify-center ${names ? "" : "flex-1"}`}>
              <MonthPicker run={run} ym={ym} onGo={(m) => goMonth(m)} big={names} />
            </div>
            <StepButton dir="next" to={nextYm} enabled={nextYm <= run.last} showName={names} onGo={(m) => goMonth(m)} />
            {names && todayButton}
          </div>
          {names && <Counts page={page} row />}
        </div>

        <div className="flex flex-wrap items-center gap-1.5" data-test="smm-cal-client-months">
          <ClientMonths page={page} today={today} focusId={focusId} />
          {!names && todayButton && <span className="ml-auto">{todayButton}</span>}
        </div>
        {!names && <Counts page={page} row={false} />}

        {page.months.filter((m) => m.history).map((m) => (
          <p key={m.id} className="rounded-lg bg-info/10 px-3 py-1.5 text-xs text-foreground">
            {/* Since 2026-10-05 a past month's work can be filled in (posted, with the day it went up). */}
            {m.name} was added after it ended — it shows the posts filled in since, each on the day it went up.
          </p>
        ))}
        {loading && (
          <p data-test="smm-cal-loading" className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" /> Loading the client's other months…
          </p>
        )}
        {error && (
          <div data-test="smm-cal-error" role="alert" className="flex flex-wrap items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-foreground">
            <AlertCircle size={14} className="text-destructive" />
            The client's other months could not be loaded — only this one is shown.
            {onRetry && (
              <button type="button" onClick={onRetry} className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 font-semibold hover:bg-accent">
                <RotateCcw size={12} /> Try again
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── 2. When ────────────────────────────────────────────────────────────────────────── */}
      <p className="flex items-center gap-1.5 px-3 pb-1.5 pt-2.5 text-xs text-muted-foreground sm:px-4">
        <Hand size={13} aria-hidden /> Tap any day to see its posts.
      </p>
      {/* Every day's own label names its weekday, so the header is for the eye only. */}
      <div aria-hidden className="grid grid-cols-7 border-y border-border bg-muted/40 text-center text-[11px] font-bold uppercase text-muted-foreground">
        {CAL_WEEKDAYS.map((d) => <div key={d.long} className="py-1.5">{names ? d.short : d.letter}</div>)}
      </div>
      <div
        key={ym}
        ref={gridRef}
        role="grid"
        aria-label={`${page.title} — arrow keys move between days, Page Up and Page Down change month`}
        data-test="smm-cal-grid"
        onKeyDown={onKey}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        /* touch-pan-y: a sideways swipe here changes the month — without it the browser takes a right-swipe
           as Back and leaves the page (seen in the browser check, 2026-10-05). Up and down still scroll. */
        className={`grid touch-pan-y grid-cols-7 overscroll-x-contain motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200 ${
          dir === "next" ? "motion-safe:slide-in-from-right-3" : dir === "prev" ? "motion-safe:slide-in-from-left-3" : ""
        }`}
      >
        {weeks.map((week) => (
          <div key={week[0]} role="row" className="contents">
            {week.map((d) => {
              const num = Number(d.slice(8));
              if (monthOf(d) !== ym) {
                // A day of the month before or after: its number, faded, and nothing else.
                return (
                  <div key={d} role="gridcell" tabIndex={-1} aria-disabled aria-label={`${longDayLabel(d)} — in ${monthTitle(monthOf(d))}`}
                    data-test="smm-cal-day" data-day={d} data-in-month="false"
                    className={`min-w-0 border-b border-r border-border bg-muted/25 p-1.5 [&:nth-child(7n)]:border-r-0 ${cellHeight} ${names ? "" : "text-center"}`}>
                    <span className="text-xs font-medium text-muted-foreground/40">{num}</span>
                  </div>
                );
              }
              const entries = page.byDay.get(d) || [];
              const usable = !!clientMonthOn(run.months, d) || entries.length > 0;
              const marks = dayMarks(entries);
              const markers = page.markers.get(d) || [];
              const isToday = d === today;
              const isPicked = d === day;
              const label = `${longDayLabel(d)}${isToday ? ", today" : ""}. ${
                marks.length ? marks.map((m) => `${m.count} ${DAY_MARKS.find((x) => x.key === m.mark)!.label.toLowerCase()}`).join(", ") : "No posts"
              }${markers.length ? `. ${markers.map(markerWords).join(", ")}` : ""}${usable ? "" : ". Not part of any of this client's months"}.`;
              const shown = entries.length > maxNames ? maxNames - 1 : entries.length;
              return (
                <div
                  key={d}
                  role="gridcell"
                  tabIndex={isPicked ? 0 : -1}
                  aria-selected={isPicked}
                  aria-disabled={!usable}
                  aria-label={label}
                  data-test="smm-cal-day"
                  data-day={d}
                  data-in-month="true"
                  onClick={() => { if (!usable) return; pick(d); setReveal((n) => n + 1); }}
                  className={`relative flex min-w-0 flex-col gap-1 border-b border-r border-border outline-none transition-colors [&:nth-child(7n)]:border-r-0 ${cellHeight} ${
                    names ? "p-1.5" : "items-center p-1"
                  } ${
                    !usable ? "bg-muted/25" : isPicked ? "cursor-pointer bg-primary/10 ring-2 ring-inset ring-primary" : "cursor-pointer hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-sm font-bold ${
                      isToday ? "bg-primary text-primary-foreground" : usable ? "text-foreground" : "text-muted-foreground/60"
                    }`}>
                      {num}
                    </span>
                    {names && isToday && <span className="text-[10px] font-bold uppercase text-primary">Today</span>}
                  </div>

                  {markers.length > 0 && (names ? (
                    markers.map((m) => (
                      <span key={`${m.kind}:${m.month.id}`} data-test="smm-cal-marker" data-kind={m.kind}
                        className="flex min-w-0 items-center gap-1 text-[10px] font-semibold leading-tight text-foreground/75">
                        <Flag size={10} className="shrink-0 text-primary" aria-hidden />
                        <span className="truncate">{markerWords(m)}</span>
                      </span>
                    ))
                  ) : (
                    // No room for "Month 2 starts": the word is enough here — the day's label and list say which.
                    <span data-test="smm-cal-marker" data-kind={markers.some((m) => m.kind === "start") ? "start" : "end"}
                      className="text-[9px] font-bold uppercase leading-none text-primary">
                      {markers.some((m) => m.kind === "start") ? "Start" : "End"}
                    </span>
                  ))}

                  {names ? (
                    entries.length > 0 && (
                      <ul className="flex min-w-0 flex-col gap-0.5">
                        {entries.slice(0, shown).map((e) => (
                          <li key={e.key} data-test="smm-cal-day-entry" data-mark={e.mark}
                            className={`flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium leading-tight text-foreground ${CHIP_BG[e.mark]}`}>
                            <MarkIcon mark={e.mark} size="xs" />
                            <span className="truncate">{entryTitle(e.item)}</span>
                          </li>
                        ))}
                        {entries.length > shown && (
                          <li data-test="smm-cal-day-more" className="px-1 text-[11px] font-semibold text-muted-foreground">+{entries.length - shown} more</li>
                        )}
                      </ul>
                    )
                  ) : (
                    marks.length > 0 && (
                      <div className="flex flex-col items-center gap-0.5">
                        {marks.map((m) => (
                          <span key={m.mark} data-test="smm-cal-day-mark" data-mark={m.mark} className="inline-flex items-center gap-0.5">
                            <MarkIcon mark={m.mark} size="day" />
                            <span className="text-xs font-bold leading-none text-foreground">{m.count}</span>
                          </span>
                        ))}
                      </div>
                    )
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── 3. The picked day, in full ─────────────────────────────────────────────────────── */}
      <div ref={panelRef} className="scroll-mt-4 p-3 sm:p-4">
        <CalendarDayPanel day={day} today={today} entries={dayEntries} count={dayEntries.length}
          partOfRun={!!clientMonthOn(run.months, day) || dayEntries.length > 0} renderEntry={renderEntry} />
      </div>

      {/* Posts the calendar cannot place: never given a day. */}
      {page.undated.length > 0 && (
        <div data-test="smm-cal-unscheduled" className="border-t border-border p-3 sm:p-4">
          <p className="mb-2 text-sm font-bold text-foreground">Posts with no date ({page.undated.length})</p>
          <div className={POST_GRID}>{page.undated.map(renderEntry)}</div>
        </div>
      )}
    </div>
  );
}

/**
 * Social Media → Calendar (2026-10-05): pick a client, see their whole run month by month.
 *
 * The cards say how each client is doing NOW; this is for the question that comes after — "what did we
 * actually post for them, and when?" — asked on a renewal call, after a complaint, or before taking a
 * client over. The clients are the ones the viewer already sees on the board (the member / salesperson
 * filters narrow them too), A to Z with search. From 1280px they sit in a list beside the calendar;
 * narrower, the client is a button that opens the list as a sheet, so the calendar keeps the width.
 *
 * Which months: an overseer's board holds only running months live, so the picked client's other months
 * are read once (useSmmClientMonths); clients with only finished months join the list when the overseer
 * asks for them (the same on-demand read as the Finished tab). A member's or salesperson's board already
 * holds every month they can see, so for them nothing more is read. The picked client is in the address
 * (`?client=`), so a link or Back returns to it.
 */
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight, ChevronDown, Loader2, Phone, Search } from "lucide-react";
import { useSmmClientMonths } from "@/hooks/useSmmClientMonths";
import { calendarClients, type CalendarClient, type CalendarViewer } from "@/utils/smmCalendar";
import { monthGlance } from "@/utils/smmGlance";
import { dayLabel } from "@/utils/smmPackage";
import ClientCalendar from "@/components/smm/calendar/ClientCalendar";
import { StatusPill, TONE_STYLE } from "@/components/smm/SmmGlance";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { SmmCampaign } from "@/types/smm";

const initialOf = (name: string) => (name.trim()[0] || "?").toUpperCase();

/** The picked client — their initial, name, number and how many months they have had with us. */
function headOf(c: CalendarClient, seen: number, changeable: boolean) {
  const n = seen || c.months;
  return (
    <>
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {initialOf(c.name)}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-base font-bold text-foreground">
          <span data-test={changeable ? "smm-calboard-pick-name" : "smm-calboard-name"} className="truncate">{c.name}</span>
          {changeable && <ChevronDown size={16} className="shrink-0 text-muted-foreground" aria-label="Change client" />}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {c.clientName && c.clientName !== c.name && <span className="truncate">{c.clientName}</span>}
          {c.phone && <span className="inline-flex items-center gap-1"><Phone size={11} /> {c.phone}</span>}
          <span>{n} month{n === 1 ? "" : "s"} with us</span>
        </span>
      </span>
    </>
  );
}

function ClientList({ clients, selectedKey, onPick, today, finishedState, onLoadFinished }: {
  clients: CalendarClient[];
  selectedKey: string;
  onPick: (key: string) => void;
  today: string;
  /** Overseers only: whether clients with only finished months are in the list yet. */
  finishedState?: "not_loaded" | "loading" | "loaded";
  onLoadFinished?: () => void;
}) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, "");
    return clients.filter((c) => !needle
      || `${c.name} ${c.clientName}`.toLowerCase().includes(needle)
      || (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits)));
  }, [clients, q]);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} data-test="smm-calboard-search"
          placeholder="Search client or number" aria-label="Search clients"
          className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-2 text-sm text-foreground outline-none focus:border-primary" />
      </div>
      <ul data-test="smm-calboard-clients" className="-mx-1 flex min-h-0 flex-col gap-0.5 overflow-y-auto px-1">
        {shown.map((c) => {
          const on = c.key === selectedKey;
          const glance = c.running ? monthGlance(c.current, today) : null;
          return (
            <li key={c.key}>
              <button type="button" data-test="smm-calboard-client" data-key={c.key} aria-current={on ? "true" : undefined}
                onClick={() => onPick(c.key)}
                className={`flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
                  on ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-accent"
                }`}>
                <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                }`}>
                  {initialOf(c.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
                  <span className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                    {glance && <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_STYLE[glance.tone].stripe}`} />}
                    {glance ? glance.label : `Ended ${dayLabel(c.current.cycle.endDate)}`}
                    {c.current.monthNumber && c.current.monthNumber > 1 ? ` · Month ${c.current.monthNumber}` : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="px-2 py-6 text-center text-xs text-muted-foreground">{q.trim() ? "No client matches that search." : "No clients to show."}</li>
        )}
      </ul>
      {finishedState && finishedState !== "loaded" && onLoadFinished && (
        <button type="button" onClick={onLoadFinished} disabled={finishedState === "loading"} data-test="smm-calboard-finished"
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60">
          {finishedState === "loading" && <Loader2 size={12} className="animate-spin" />}
          Show clients whose months have all ended
        </button>
      )}
    </div>
  );
}

export default function SmmCalendarBoard({ campaigns, scope, viewer, overseer, today, finishedState, onLoadFinished }: {
  /** Every month in memory — the board's live list, plus the finished months once read. */
  campaigns: SmmCampaign[];
  /** The board's member / salesperson filters. */
  scope: (c: SmmCampaign) => boolean;
  viewer: CalendarViewer;
  overseer: boolean;
  today: string;
  finishedState?: "not_loaded" | "loading" | "loaded";
  onLoadFinished?: () => void;
}) {
  const clients = useMemo(() => calendarClients(campaigns.filter(scope)), [campaigns, scope]);
  const [params, setParams] = useSearchParams();
  const asked = params.get("client") || "";
  const selected = clients.find((c) => c.key === asked) || clients[0] || null;
  const [picking, setPicking] = useState(false);

  const pick = (key: string) => {
    const next = new URLSearchParams(params);
    next.set("client", key);
    setParams(next, { replace: true });
    setPicking(false);
  };

  const { months, loading, error, retry } = useSmmClientMonths({
    clientKey: selected?.key,
    live: campaigns,
    viewer,
    fetchHistory: overseer,
  });

  if (clients.length === 0) {
    return (
      <div className="space-y-3">
        <p data-test="smm-calboard-empty" className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No clients to show{finishedState === "not_loaded" ? " — none is running right now." : "."}
        </p>
        {finishedState && finishedState !== "loaded" && onLoadFinished && (
          <div className="flex justify-center">
            <button type="button" onClick={onLoadFinished} disabled={finishedState === "loading"} data-test="smm-calboard-finished"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-60">
              {finishedState === "loading" && <Loader2 size={12} className="animate-spin" />} Show clients whose months have all ended
            </button>
          </div>
        )}
      </div>
    );
  }

  const list = (
    <ClientList clients={clients} selectedKey={selected?.key || ""} onPick={pick} today={today}
      finishedState={finishedState} onLoadFinished={onLoadFinished} />
  );
  const current = selected?.current;
  const glance = current && selected?.running ? monthGlance(current, today) : null;

  return (
    /* xl, not lg: beside the app's sidebar a 1024px laptop left the calendar ~440px — too narrow for the
       post names in its days. Below 1280px the client is a button that opens the list as a sheet. */
    <div data-test="smm-calboard" className="grid gap-4 xl:grid-cols-[16.5rem_minmax(0,1fr)]">
      {/* Wide screens: the clients beside the calendar. */}
      <aside className="hidden xl:block">
        <div className="sticky top-4 flex max-h-[calc(100vh-7rem)] flex-col rounded-2xl border border-border bg-card p-2.5">
          <p className="mb-2 px-1 text-xs font-semibold text-foreground">Clients <span className="font-normal text-muted-foreground">({clients.length})</span></p>
          {list}
        </div>
      </aside>

      <div className="min-w-0 space-y-3">
        {selected && current && (
          <div data-test="smm-calboard-head" className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3 sm:p-4">
            {/* Phones and tablets: the client is a button that opens the list. Wide screens have the list. */}
            <button type="button" onClick={() => setPicking(true)} data-test="smm-calboard-pick"
              className="flex min-w-0 flex-1 basis-64 items-center gap-2.5 rounded-xl text-left xl:hidden">
              {headOf(selected, months.length, true)}
            </button>
            {/* basis-64: when the status and the link do not fit beside the name, they go under it — never squeeze it. */}
            <div className="hidden min-w-0 flex-1 basis-64 items-center gap-2.5 xl:flex">{headOf(selected, months.length, false)}</div>
            <div className="flex flex-wrap items-center gap-2">
              {glance && <StatusPill glance={glance} />}
              <Link to={`/smm/${current.id}`} data-test="smm-calboard-open"
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent">
                {selected.running ? "Open this month" : "Open last month"} <ArrowUpRight size={12} />
              </Link>
            </div>
          </div>
        )}
        {selected && (
          <ClientCalendar key={selected.key} months={months} today={today} loading={loading} error={error} onRetry={retry} />
        )}
      </div>

      <Sheet open={picking} onOpenChange={setPicking}>
        <SheetContent side="bottom" className="flex max-h-[85vh] flex-col rounded-t-2xl p-4">
          <SheetHeader className="text-left">
            <SheetTitle>Choose a client</SheetTitle>
          </SheetHeader>
          <div className="mt-3 flex min-h-0 flex-1 flex-col">{list}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

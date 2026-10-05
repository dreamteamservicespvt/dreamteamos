/**
 * Social Media → Money — the company's social-media renewals and their rupees (2026-10-05, owner).
 *
 * For the tech admin, the sales admin and the main admin (`smmPlan.canSeeSmmMoney`): "a very clear and
 * 100% user-friendly UI of the SMM calculation". The layout is the one the owner picked from mockups:
 *
 *   1. three totals — clients running now, what they pay a month, the month's renewal rate;
 *   2. the month's renewals — ✔ renewed / ◷ waiting / ✖ not renewing, each a count and its rupees, on one bar;
 *   3. one row per salesperson — running, ✔ ◷ ✖, the money kept, their rate;
 *   4. the clients still waiting for a decision, oldest first, with Remind and Open.
 *
 * A month is counted in the calendar month its last day falls in (‹ › change it). Running clients come
 * from the live listener the page already has; the month's renewals add ONE on-demand read of the months
 * ending in it (`fetchMonthsEndingBetween`, kept per month for the visit) because months already filed
 * as renewed or lapsed are not live. Numbers in `utils/smmRenewalMoney`.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BellRing, CalendarClock, ExternalLink, IndianRupee, Loader2, TrendingUp, Users } from "lucide-react";
import { fetchMonthsEndingBetween, healRenewalLinksOnOpen, remindSellerToRenew, type SmmActor } from "@/services/smm";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/utils/formatters";
import {
  monthKeyOf, monthKeyTitle, openRenewalsBefore, renewalTotals, renewalWhen, renewalsBySeller, renewalsInMonth, runningClients,
} from "@/utils/smmRenewalMoney";
import { MarkIcon } from "@/components/smm/calendar/marks";
import MonthStepper from "@/components/smm/money/MonthStepper";
import { MONEY_TEXT } from "@/components/smm/money/tone";
import type { SmmCampaign } from "@/types/smm";

export default function SmmMoneyView({ campaigns, scope, today, user }: {
  /** The overseer's live months (active). */
  campaigns: SmmCampaign[];
  /** The page's salesperson / member filter. */
  scope: (c: SmmCampaign) => boolean;
  today: string;
  user: SmmActor;
}) {
  const current = monthKeyOf(today);
  const [ym, setYm] = useState(current);
  const cache = useRef(new Map<string, SmmCampaign[]>());
  const [ending, setEnding] = useState<{ ym: string; list: SmmCampaign[] } | null>(null);
  const [error, setError] = useState("");
  const [reminding, setReminding] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    setError("");
    const held = cache.current.get(ym);
    if (held) { setEnding({ ym, list: held }); return; }
    setEnding(null);
    fetchMonthsEndingBetween(`${ym}-01`, `${ym}-31`)
      .then(async (list) => {
        // A month still marked renewed by a month that is gone is repaired first, then read again.
        const healed = await healRenewalLinksOnOpen(list).catch(() => 0);
        const fresh = healed > 0 ? await fetchMonthsEndingBetween(`${ym}-01`, `${ym}-31`) : list;
        cache.current.set(ym, fresh);
        if (!cancelled) setEnding({ ym, list: fresh });
      })
      .catch(() => { if (!cancelled) setError("Could not load this month's renewals. Check the connection and try again."); });
    return () => { cancelled = true; };
  }, [ym]);

  const view = useMemo(() => {
    if (!ending || ending.ym !== ym) return null;
    // The live months win over the read ones — they are fresher.
    const live = new Map(campaigns.map((c) => [c.id, c]));
    const pool = [...ending.list.filter((c) => !live.has(c.id)), ...campaigns].filter(scope);
    const rows = renewalsInMonth(pool, ym, today);
    const earlier = ym === current ? openRenewalsBefore(pool, ym, today) : [];
    return {
      running: runningClients(campaigns.filter(scope), today),
      totals: renewalTotals(rows),
      sellers: renewalsBySeller(pool, ym, today),
      waiting: [...earlier, ...rows.filter((r) => r.outcome === "waiting")],
      earlier: earlier.length,
    };
  }, [ending, ym, campaigns, scope, today, current]);

  const remind = async (c: SmmCampaign) => {
    setReminding(c.id);
    try {
      await remindSellerToRenew(c, user);
      toast({ title: `${c.soldByName || "The salesperson"} has been reminded`, description: c.businessName || c.clientName });
    } catch {
      toast({ title: "Not sent", description: "Try again.", variant: "destructive" });
    } finally {
      setReminding("");
    }
  };

  const month = monthKeyTitle(ym).split(" ")[0];

  return (
    <div data-test="smm-money" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-base font-semibold text-foreground">
          <IndianRupee size={17} className="text-primary" /> Social media money
        </h2>
        <MonthStepper value={ym} current={current} onChange={setYm} />
      </div>

      {error ? (
        <p data-test="smm-money-error" className="rounded-2xl border border-dashed border-destructive/40 p-8 text-center text-sm text-destructive">{error}</p>
      ) : !view ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={26} /></div>
      ) : (
        <>
          {/* ── 1. Three totals ─────────────────────────────────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Total testId="smm-money-running" icon={<Users size={18} />} big={String(view.running.count)}
              label={view.running.count === 1 ? "client running now" : "clients running now"} />
            <Total testId="smm-money-monthly" icon={<IndianRupee size={18} />} big={formatCurrency(view.running.value)}
              label="a month, from the clients running now" />
            <Total testId="smm-money-rate" icon={<TrendingUp size={18} />}
              big={view.totals.due > 0 ? `${Math.round(view.totals.rate * 100)}%` : "—"}
              label={view.totals.due > 0 ? `renewed in ${month} — ${view.totals.renewed} of ${view.totals.due}` : `no month ends in ${month}`} />
          </div>

          {/* ── 2. The month's renewals ─────────────────────────────────────────────────────── */}
          <section className="rounded-2xl border border-border bg-card p-4" data-test="smm-money-renewals">
            <h3 className="text-sm font-semibold text-foreground">
              Renewals — {view.totals.due} month{view.totals.due === 1 ? " ends" : "s end"} in {month}
            </h3>
            {view.totals.due > 0 && (
              <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
                <div className="bg-viz-done" style={{ width: `${(view.totals.renewed / view.totals.due) * 100}%` }} />
                <div className="bg-muted-foreground/30" style={{ width: `${(view.totals.waiting / view.totals.due) * 100}%` }} />
                <div className="bg-viz-late" style={{ width: `${(view.totals.lost / view.totals.due) * 100}%` }} />
              </div>
            )}
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Outcome testId="smm-money-renewed" mark="posted" label="Renewed" n={view.totals.renewed}
                money={formatCurrency(view.totals.renewedValue)} moneyWord="kept" tone={MONEY_TEXT} />
              <Outcome testId="smm-money-waiting" mark="coming" label="Waiting" n={view.totals.waiting}
                money={formatCurrency(view.totals.waitingValue)} moneyWord="still to win" tone="text-foreground"
                note={view.earlier > 0 ? `+${view.earlier} from earlier months` : undefined} />
              <Outcome testId="smm-money-lost" mark="notPosted" label="Not renewing" n={view.totals.lost}
                money={formatCurrency(view.totals.lostValue)} moneyWord="gone" tone="text-viz-late" />
            </div>
          </section>

          {/* ── 3. By salesperson ───────────────────────────────────────────────────────────── */}
          {view.sellers.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-4" data-test="smm-money-sellers">
              <h3 className="text-sm font-semibold text-foreground">By salesperson</h3>
              <div className="mt-2 hidden grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,0.6fr))_minmax(0,1fr)_minmax(0,1.3fr)] gap-2 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:grid">
                <span>Name</span><span>Running</span><span>Renewed</span><span>Waiting</span><span>Lost</span><span>Kept</span><span>Rate</span>
              </div>
              <ul className="mt-1 divide-y divide-border">
                {view.sellers.map((s) => {
                  const pct = s.due > 0 ? Math.round(s.rate * 100) : 0;
                  return (
                    <li key={s.sellerId} data-test="smm-money-seller"
                      className="grid grid-cols-2 items-center gap-x-3 gap-y-1.5 px-2 py-2.5 text-sm md:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,0.6fr))_minmax(0,1fr)_minmax(0,1.3fr)] md:gap-2">
                      <span className="col-span-2 truncate font-semibold text-foreground md:col-span-1">{s.sellerName}</span>
                      <Cell label="Running">{s.running}</Cell>
                      <Cell label="Renewed"><span className={MONEY_TEXT}>✔ {s.renewed}</span></Cell>
                      <Cell label="Waiting"><span className="text-foreground">◷ {s.waiting}</span></Cell>
                      <Cell label="Lost"><span className={s.lost > 0 ? "text-viz-late" : ""}>✖ {s.lost}</span></Cell>
                      <Cell label="Kept"><b className="text-foreground">{formatCurrency(s.renewedValue)}</b></Cell>
                      <span className="col-span-2 flex min-w-0 items-center gap-2 md:col-span-1">
                        <span className="h-2 min-w-[2.5rem] flex-1 overflow-hidden rounded-full bg-foreground/10">
                          <span className="block h-full rounded-full bg-viz-done" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground">
                          {s.due > 0 ? `${pct}% · ${s.renewed}/${s.due}` : "none due"}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* ── 4. Still waiting for a decision ─────────────────────────────────────────────── */}
          <section className="rounded-2xl border border-border bg-card p-4" data-test="smm-money-waiting-list">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <CalendarClock size={15} className="text-viz-wait" /> Waiting for a decision
            </h3>
            {view.waiting.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nobody is waiting — every month ending in {month} has a decision.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {view.waiting.map((r) => {
                  const c = r.month;
                  const ended = r.daysLeft < 0;
                  return (
                    <li key={c.id} data-test="smm-money-waiting-row" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border p-2.5">
                      <MarkIcon mark="coming" size="md" />
                      <div className="min-w-[9.5rem] flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{c.businessName || c.clientName}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className={ended ? "font-medium text-viz-late" : r.daysLeft <= 3 ? "font-semibold text-foreground" : ""}>{renewalWhen(r.daysLeft)}</span>
                          {" · "}{c.soldByName || "No salesperson"} · {formatCurrency(r.value)}
                        </p>
                      </div>
                      <div className="ml-auto flex items-center gap-1.5">
                      {c.soldBy && c.soldBy !== user.uid && (
                        <button onClick={() => remind(c)} disabled={reminding === c.id} data-test="smm-money-remind"
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50">
                          {reminding === c.id ? <Loader2 size={13} className="animate-spin" /> : <BellRing size={13} />} Remind
                        </button>
                      )}
                      <Link to={`/smm/${c.id}`}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-primary hover:bg-primary/10">
                        <ExternalLink size={13} /> Open
                      </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            A month counts in the month its last day falls in. A renewal's money is what the next month is worth (the next
            month's price, else this month's, else its package's list price). Months filled in after they ended are left out.
          </p>
        </>
      )}
    </div>
  );
}

function Total({ testId, icon, big, label }: { testId: string; icon: ReactNode; big: string; label: string }) {
  return (
    <div data-test={testId} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">{icon}</span>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none tracking-tight text-foreground">{big}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function Outcome({ testId, mark, label, n, money, moneyWord, tone, note }: {
  testId: string;
  mark: "posted" | "coming" | "notPosted";
  label: string;
  n: number;
  money: string;
  moneyWord: string;
  tone: string;
  note?: string;
}) {
  return (
    <div data-test={testId} className="flex items-center gap-3 rounded-xl border border-border p-3">
      <MarkIcon mark={mark} size="lg" />
      <div className="min-w-0">
        <p className="text-sm text-foreground"><b className="text-xl leading-none">{n}</b> {label}</p>
        <p className="text-xs"><b className={tone}>{money}</b> <span className="text-muted-foreground">{moneyWord}</span></p>
        {note && <p className="text-[10px] font-medium text-muted-foreground">{note}</p>}
      </div>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex items-baseline gap-1.5 text-sm">
      <span className="text-[11px] text-muted-foreground md:hidden">{label}</span>
      {children}
    </span>
  );
}

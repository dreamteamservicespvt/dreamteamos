/**
 * "My Social Media" — the salesperson's renewals and the money in them (2026-10-05, owner).
 *
 * Was "Renewals due" (2026-10-03): a list of months ending in the next five days with a Renew button.
 * The owner asked for "a clear calculation of the social media — how many existing, how many renewed,
 * how many pending, how much money they will get for the renewals — a UI that 100% motivates the
 * salesperson to convert their clients to the next month". The layout is the one the owner picked
 * from mockups ("Money first"):
 *
 *   1. the money — what this month's renewals brought them, and what is still waiting for them;
 *   2. one bar — "3 of 7 renewed";
 *   3. four counts — Running now · ✔ Renewed · ◷ Waiting · ✖ Not renewing (the calendar's marks);
 *   4. "Renew these now" — every client still to renew, with what it pays them and the Renew button,
 *      then who renewed and who did not.
 *
 * A month is counted in the calendar month its last day falls in; ‹ › change the month. Numbers in
 * `utils/smmRenewalMoney`. Reads nothing new: the salesperson's own months are already live
 * (`useSmmCampaigns` → `watchers`). The renewal bell still rings from here, once a day per month.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { IndianRupee, Loader2, RefreshCcw, Users } from "lucide-react";
import { useSmmCampaigns, type SmmViewer } from "@/hooks/useSmmCampaigns";
import { notifyRenewalsDueOnOpen } from "@/services/smm";
import { isoDay } from "@/utils/smmPlan";
import { canRenewSmm } from "@/utils/smmPackage";
import { commissionRate } from "@/utils/salesIncentive";
import { formatCurrency } from "@/utils/formatters";
import {
  commissionOn, monthKeyOf, monthKeyTitle, openRenewalsBefore, renewalTotals, renewalWhen, renewalsInMonth, runningClients,
  type RenewalRow,
} from "@/utils/smmRenewalMoney";
import { useSmmRenewal } from "@/components/smm/useSmmRenewal";
import { MarkIcon } from "@/components/smm/calendar/marks";
import MonthStepper from "@/components/smm/money/MonthStepper";
import { MONEY_TEXT } from "@/components/smm/money/tone";

export default function SmmRenewalsCard({ user, ring = true }: {
  user: SmmViewer & { earningsOption?: string };
  /** Ring the "renewal due" bells. Off where the page already rings them (Social Media). */
  ring?: boolean;
}) {
  const { campaigns, loading } = useSmmCampaigns(user);
  const today = isoDay(new Date());
  const current = monthKeyOf(today);
  const [ym, setYm] = useState(current);
  const { renew, renewingId } = useSmmRenewal(user);
  const rate = commissionRate(user.earningsOption);

  const mine = useMemo(() => campaigns.filter((c) => c.soldBy === user.uid), [campaigns, user.uid]);

  const rang = useRef(false);
  useEffect(() => {
    if (!ring || loading || rang.current) return;
    rang.current = true;
    const live = mine.filter((c) => c.status === "active" && !c.history && !c.renewal?.nextCampaignId);
    notifyRenewalsDueOnOpen(live, user, today).catch(() => undefined);
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const view = useMemo(() => {
    const rows = renewalsInMonth(mine, ym, today, user.uid);
    const totals = renewalTotals(rows);
    // Months that ended before this one with no decision can still be saved — listed with today's month.
    const earlier = ym === current ? openRenewalsBefore(mine, ym, today, user.uid) : [];
    const toRenew = [...earlier, ...rows.filter((r) => r.outcome === "waiting")];
    const sum = (list: RenewalRow[]) => list.reduce((s, r) => s + commissionOn(r.value, rate), 0);
    return {
      totals,
      earlier,
      toRenew,
      renewed: rows.filter((r) => r.outcome === "renewed"),
      lost: rows.filter((r) => r.outcome === "lost"),
      earned: sum(rows.filter((r) => r.outcome === "renewed")),
      waiting: sum(toRenew),
      missed: sum(rows.filter((r) => r.outcome === "lost")),
      running: runningClients(mine, today, user.uid).count,
    };
  }, [mine, ym, today, current, user.uid, rate]);

  if (loading || mine.length === 0) return null;

  const tense = ym === current ? "this month" : `in ${monthKeyTitle(ym).split(" ")[0]}`;
  const future = ym > current;
  const { totals } = view;
  const pct = totals.due > 0 ? Math.round(totals.rate * 100) : 0;

  return (
    <section data-test="smm-renewals-card" aria-label="My social media renewals"
      className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <RefreshCcw size={15} className="text-primary" /> My Social Media
        </h2>
        <MonthStepper value={ym} current={current} onChange={setYm} testId="smm-my-month" />
      </div>

      <div className="space-y-4 p-4">
        {/* ── 1. The money ─────────────────────────────────────────────────────────────────── */}
        <div className="rounded-xl bg-muted/40 p-3.5">
          <p className="flex flex-wrap items-baseline gap-x-2 text-foreground">
            <span data-test="smm-my-earned" className={`text-3xl font-bold tracking-tight ${MONEY_TEXT}`}>{formatCurrency(view.earned)}</span>
            <span className="text-sm font-medium">from your renewals {tense}</span>
          </p>
          {view.toRenew.length > 0 ? (
            <p data-test="smm-my-waiting" className="mt-1 text-sm font-semibold text-foreground">
              <span className="underline decoration-viz-wait decoration-[3px] underline-offset-4">{formatCurrency(view.waiting)} more {future ? "to win" : "waiting"}</span>
              {" "}— renew {view.toRenew.length} client{view.toRenew.length === 1 ? "" : "s"}
            </p>
          ) : view.missed > 0 ? (
            <p data-test="smm-my-missed" className="mt-1 text-sm text-muted-foreground">
              {formatCurrency(view.missed)} missed — {view.lost.length} client{view.lost.length === 1 ? "" : "s"} did not renew.
            </p>
          ) : totals.due > 0 ? (
            <p className={`mt-1 text-sm font-medium ${MONEY_TEXT}`}>Every client {ym === current ? "so far " : ""}renewed. Well done!</p>
          ) : null}

          {/* ── 2. One bar ─────────────────────────────────────────────────────────────────── */}
          <div className="mt-3">
            <div className="h-2.5 overflow-hidden rounded-full bg-foreground/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
              aria-label={`${totals.renewed} of ${totals.due} renewed`}>
              <div className="h-full rounded-full bg-viz-done transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p data-test="smm-my-rate" className="mt-1.5 text-xs text-muted-foreground">
              {totals.due > 0
                ? <><b className="text-foreground">{totals.renewed} of {totals.due}</b> renewed {tense}</>
                : `No client's month ends ${tense}.`}
            </p>
          </div>
        </div>

        {/* ── 3. Four counts ───────────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Count testId="smm-my-running" icon={<span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary"><Users size={16} /></span>}
            n={view.running} label="Running now" />
          <Count testId="smm-my-renewed" icon={<MarkIcon mark="posted" size="md" />} n={totals.renewed} label="Renewed" />
          <Count testId="smm-my-pending" icon={<MarkIcon mark="coming" size="md" />} n={totals.waiting} label="Waiting"
            note={view.earlier.length > 0 ? `+${view.earlier.length} from earlier` : undefined} />
          <Count testId="smm-my-lost" icon={<MarkIcon mark="notPosted" size="md" />} n={totals.lost} label="Not renewing" />
        </div>

        {/* ── 4. Who to renew, then who did ────────────────────────────────────────────────── */}
        {view.toRenew.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {future ? "Coming up to renew" : "Renew these now"}
            </h3>
            <ul className="mt-2 space-y-2">
              {view.toRenew.map((r) => {
                const c = r.month;
                const can = canRenewSmm(c, user);
                const ended = r.daysLeft < 0;
                return (
                  <li key={c.id} data-test="smm-renewal-row" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border p-2.5">
                    <MarkIcon mark="coming" size="md" />
                    <div className="min-w-[9.5rem] flex-1">
                      <Link to={`/smm/${c.id}`} className="block truncate text-sm font-semibold text-foreground hover:underline">
                        {c.businessName || c.clientName}
                      </Link>
                      <p className={`text-xs ${ended ? "font-medium text-viz-late" : r.daysLeft <= 3 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                        {renewalWhen(r.daysLeft)}{ended ? " — no decision yet" : ""}
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-2.5">
                    <span data-test="smm-renewal-row-money" className={`whitespace-nowrap text-sm font-bold ${MONEY_TEXT}`}>
                      +{formatCurrency(commissionOn(r.value, rate))}
                    </span>
                    {can && (
                      <button onClick={() => renew(c)} disabled={renewingId === c.id} data-test="smm-renewal-row-renew"
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                        {renewingId === c.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCcw size={13} />} Renew
                      </button>
                    )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {view.renewed.length > 0 && (
          <NameList testId="smm-my-renewed-list" mark="posted" title="Renewed"
            rows={view.renewed.map((r) => ({ id: r.nextId || r.month.id, name: r.month.businessName || r.month.clientName, money: `+${formatCurrency(commissionOn(r.value, rate))}` }))} />
        )}
        {view.lost.length > 0 && (
          <NameList testId="smm-my-lost-list" mark="notPosted" title="Not renewing"
            rows={view.lost.map((r) => ({ id: r.month.id, name: r.month.businessName || r.month.clientName, money: "" }))} />
        )}

        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <IndianRupee size={12} className="mt-0.5 shrink-0" />
          <span>{rate}% of each renewal sale is yours — paid once your sales admin verifies it and the client pays.</span>
        </p>
      </div>
    </section>
  );
}

function Count({ testId, icon, n, label, note }: { testId: string; icon: ReactNode; n: number; label: string; note?: string }) {
  return (
    <div data-test={testId} className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5">
      {icon}
      <div className="min-w-0">
        <p className="text-xl font-bold leading-none text-foreground">{n}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
        {note && <p className="truncate text-[10px] font-medium text-muted-foreground">{note}</p>}
      </div>
    </div>
  );
}

function NameList({ testId, mark, title, rows }: {
  testId: string;
  mark: "posted" | "notPosted";
  title: string;
  rows: { id: string; name: string; money: string }[];
}) {
  return (
    <div data-test={testId}>
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <MarkIcon mark={mark} size="xs" /> {title}
      </h3>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {rows.map((r) => (
          <Link key={r.id} to={`/smm/${r.id}`}
            className="inline-flex min-h-[28px] max-w-full items-center gap-1.5 rounded-full border border-border px-2.5 text-xs text-foreground hover:bg-accent">
            <span className="truncate">{r.name}</span>
            {r.money && <b className={MONEY_TEXT}>{r.money}</b>}
          </Link>
        ))}
      </div>
    </div>
  );
}

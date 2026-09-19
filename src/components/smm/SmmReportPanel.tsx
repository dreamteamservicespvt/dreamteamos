/**
 * What was promised, what was delivered, and the message that says so.
 *
 * ── Why the client-delay line is on every report ──────────────────────────────────────────────
 * The complaint that costs renewals — "you people didn't do the work" — arrives weeks after the
 * fortnight the client spent not answering their phone, and there is no winning that argument from
 * memory. The days spent waiting are counted from stamps made at the time, and they go on every
 * month's report as a matter of course. A number that only appears during an argument reads as an
 * excuse; the same number sent cheerfully every month is simply the record.
 *
 * ── Why the renewal ask is here rather than on a reminder screen ──────────────────────────────
 * A renewal is won by showing what was delivered. Putting the ask next to the figures means the
 * seller makes it holding the evidence, instead of ringing to say "shall we continue?"
 */
import { useState } from "react";
import { Send, Trophy, Clock, TrendingUp, CheckCircle2, XCircle } from "lucide-react";
import { formatCurrency } from "@/utils/formatters";
import {
  adTotals, allAdReports, clientWaitSummary, daysLeftInCycle, extraWork, fulfilment, isoDay,
  postsByPlatform,
} from "@/utils/smmPlan";
import { monthlyReportMessage, renewalMessage } from "@/utils/smmMessages";
import { setRenewal } from "@/services/smm";
import { useToast } from "@/hooks/use-toast";
import { SMM_CONTENT_KINDS, type SmmCampaign } from "@/types/smm";
import { ProgressBar } from "@/components/smm/SmmChips";
import type { AppUser } from "@/types";

export default function SmmReportPanel({ campaign, user, onMessage }: {
  campaign: SmmCampaign;
  user: Pick<AppUser, "uid" | "name" | "role">;
  onMessage: (text: string, kind: "monthly_report" | "renewal") => void;
}) {
  const { toast } = useToast();
  const today = isoDay(new Date());
  const f = fulfilment(campaign);
  const ads = adTotals(allAdReports(campaign));
  const wait = clientWaitSummary(campaign.items);
  const extras = extraWork(campaign.items);
  const platforms = postsByPlatform(campaign.items);
  const daysLeft = daysLeftInCycle(campaign.cycle, today);
  const isSeller = campaign.soldBy === user.uid;
  const [busy, setBusy] = useState(false);

  const mark = async (state: "won" | "lost" | "pitched") => {
    setBusy(true);
    try {
      await setRenewal(campaign.id, state, user);
      toast({ title: state === "won" ? "Renewed" : state === "lost" ? "Marked not renewing" : "Pitch recorded" });
    } catch {
      toast({ title: "Not saved", description: "Try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-test="smm-report-panel" className="max-w-3xl space-y-4">
      {/* ── The promise, kept ────────────────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Promise tracker</h3>
          <span data-test="smm-fulfilment-percent" className="font-mono text-sm font-bold text-primary">{f.percent}%</span>
        </div>
        <div className="mt-2"><ProgressBar percent={f.percent} tone={f.complete ? "success" : "primary"} /></div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {f.posted} of {f.committed} committed post{f.committed === 1 ? "" : "s"} {f.posted === 1 ? "is" : "are"} live
          {f.extra > 0 ? ` · ${f.extra} extra delivered` : ""}
          {daysLeft > 0 ? ` · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left in the month` : daysLeft === 0 ? " · last day" : " · month has ended"}
        </p>

        <div className="mt-3 space-y-2">
          {f.byKind.filter((k) => k.committed > 0).map((k) => {
            const pct = k.committed > 0 ? Math.min(100, Math.round((k.posted / k.committed) * 100)) : 0;
            return (
              <div key={k.kind} data-test={`smm-kind-${k.kind}`}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">{SMM_CONTENT_KINDS.find((c) => c.key === k.kind)?.label}</span>
                  <span className="font-mono text-foreground">{k.posted} / {k.committed} posted · {k.made} made</span>
                </div>
                <div className="mt-1"><ProgressBar percent={pct} tone={pct >= 100 ? "success" : "primary"} /></div>
              </div>
            );
          })}
        </div>

        {platforms.length > 0 && (
          <p className="mt-2.5 text-[11px] text-muted-foreground">
            Where they went: {platforms.map((p) => `${p.label} (${p.count})`).join(" · ")}
          </p>
        )}
      </section>

      {/* ── The numbers ──────────────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Leads", value: String(ads.leads), Icon: TrendingUp },
          { label: "Ad spend", value: formatCurrency(ads.spend), Icon: TrendingUp },
          { label: "Per result", value: ads.leads > 0 ? formatCurrency(ads.costPerResult) : "—", Icon: TrendingUp },
          { label: "Days waiting on client", value: String(wait.totalDays), Icon: Clock },
        ].map(({ label, value, Icon }) => (
          <div key={label} className="rounded-lg border border-border bg-card p-2.5">
            <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Icon size={10} /> {label}
            </p>
            <p data-test={`smm-stat-${label.toLowerCase().replace(/\s/g, "-")}`} className="mt-0.5 font-mono text-sm font-semibold text-foreground">
              {value}
            </p>
          </div>
        ))}
      </section>

      {/* ── Where the month actually went ────────────────────────────────────────────────── */}
      {(wait.totalDays > 0 || extras.items.length > 0) && (
        <section className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
          {wait.totalDays > 0 && (
            <p data-test="smm-wait-line">
              <strong className="text-foreground">{wait.totalDays} day{wait.totalDays === 1 ? "" : "s"}</strong> of this month
              {wait.totalDays === 1 ? " was " : " were "}spent waiting for the client to approve content
              {wait.worstDays > 0 ? `, the longest single wait being ${wait.worstDays} day${wait.worstDays === 1 ? "" : "s"}` : ""}
              {wait.chases > 0 ? `, after ${wait.chases} follow-up${wait.chases === 1 ? "" : "s"} from us` : ""}.
              {wait.openCount > 0 ? ` ${wait.openCount} ${wait.openCount === 1 ? "piece is" : "pieces are"} still with them.` : ""}
            </p>
          )}
          {extras.items.length > 0 && (
            <p className="mt-1.5">
              <strong className="text-foreground">{extras.items.length} extra piece{extras.items.length === 1 ? "" : "s"}</strong>
              {extras.items.length === 1 ? " was " : " were "}delivered beyond the package
              {extras.freeCount > 0 ? `, ${extras.freeCount} of them at no charge` : ""}
              {extras.billedAmount > 0 ? `, ${formatCurrency(extras.billedAmount)} charged` : ""}
              {extras.unbilled > 0 ? `. ${extras.unbilled} still to settle.` : "."}
            </p>
          )}
        </section>
      )}

      <button
        data-test="smm-send-monthly"
        onClick={() => onMessage(monthlyReportMessage(campaign), "monthly_report")}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Send size={15} /> Send the monthly report
      </button>

      {/* ── Renewal ──────────────────────────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-border bg-card p-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Trophy size={14} className="text-warning" /> Next month
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {campaign.renewal?.state === "won" ? `Renewed${campaign.renewal.byName ? ` — ${campaign.renewal.byName}` : ""}.`
            : campaign.renewal?.state === "lost" ? "Not renewing."
            : campaign.renewal?.state === "pitched" ? "Pitched, waiting on the client."
            : daysLeft <= 5 ? "The month is nearly up — this is the moment to ask, with the figures in hand."
            : `Ends in ${daysLeft} days.`}
        </p>

        {isSeller && campaign.renewal?.state !== "won" && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              data-test="smm-send-renewal"
              onClick={() => { onMessage(renewalMessage(campaign), "renewal"); mark("pitched"); }}
              className="inline-flex items-center gap-1.5 rounded-md bg-warning px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-warning/90"
            >
              <Send size={11} /> Send the renewal ask
            </button>
            <button
              data-test="smm-renewal-won"
              disabled={busy}
              onClick={() => mark("won")}
              className="inline-flex items-center gap-1.5 rounded-md border border-success/50 bg-success/10 px-2.5 py-1.5 text-[11px] font-medium text-success hover:bg-success/20 disabled:opacity-50"
            >
              <CheckCircle2 size={11} /> They renewed
            </button>
            <button
              data-test="smm-renewal-lost"
              disabled={busy}
              onClick={() => mark("lost")}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
            >
              <XCircle size={11} /> Not this time
            </button>
          </div>
        )}
        {campaign.renewal?.state === "won" && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Record next month as a new sale on this client — it gets its own plan, its own ads and its own report.
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * The renewal countdown popup — for the salesperson who sold the month (2026-10-03).
 *
 * ── What it is for ───────────────────────────────────────────────────────────────────────────
 * A renewal is won by ringing the client with the month's work in hand. So in the last three days
 * before a month's renewal date — 3 days, 2 days, 1 day, and the day itself — the salesperson who
 * sold it gets this popup the first time they open the app each day: a countdown they cannot miss,
 * and the month's work report drawn rather than written (the timeline with every post on its day,
 * how many pieces are at each stage, each kind as one block per piece, the ad figures and the days
 * lost waiting on the client). Renew opens their sale form on the client, as everywhere else.
 *
 * ── Once a day per month, per device ─────────────────────────────────────────────────────────
 * Remembered in localStorage (`renewalPopupSeenKey`), like the birthday greeting: a popup on every
 * page change would be shouted down, and the dashboard card (SmmRenewalsCard) and the bell carry the
 * same months for the rest of the day. A private window simply shows it again — no harm.
 *
 * Sits at z-[42]: above the work-update popup (z-40), below the profile prompt (z-45), the check-in
 * gate (z-50) and the unsigned-agreement gate (z-55), which must be dealt with first.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  CalendarClock, Check, ChevronLeft, ChevronRight, Clock, FileBarChart, Image as ImageIcon, IndianRupee, Loader2,
  RefreshCcw, Sparkles, TrendingUp, Users, Video, X,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useSmmCampaigns } from "@/hooks/useSmmCampaigns";
import { useSmmRenewal } from "@/components/smm/useSmmRenewal";
import { KindBar, MonthTimeline, PaceChip, TONE_BG, ToneLegend } from "@/components/smm/SmmVisuals";
import { formatCurrency } from "@/utils/formatters";
import {
  adTotals, allAdReports, clientWaitSummary, extraWork, fulfilment, isoDay, postsByPlatform, teamMembers,
} from "@/utils/smmPlan";
import {
  SMM_TONE_LEGEND, cycleRangeLabel, daysToRenewal, kindSegments, monthCycle, paceOf,
  renewalCountdownLabel, renewalCountdownSteps, renewalPopupMonths, renewalPopupSeenKey, renewalStartDate,
  shortDayLabel, toneCounts,
} from "@/utils/smmPackage";
import type { SmmCampaign, SmmContentKind } from "@/types/smm";

const KIND_ROWS: { kind: SmmContentKind; label: string; icon: LucideIcon }[] = [
  { kind: "ai_ad", label: "Videos", icon: Sparkles },
  { kind: "poster", label: "Posters", icon: ImageIcon },
  { kind: "real_video", label: "Real videos", icon: Video },
];

function seenToday(key: string): boolean {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}
function markSeen(key: string) {
  try { localStorage.setItem(key, "1"); } catch { /* private mode — it pops again, no harm */ }
}

/** The colour of the countdown: calm at three days, amber at two, red on the last day and the day itself. */
function urgency(days: number) {
  if (days >= 3) return { ring: "border-primary text-primary", band: "from-primary/20", fill: "bg-primary", text: "text-primary" };
  if (days === 2) return { ring: "border-warning text-warning", band: "from-warning/20", fill: "bg-warning", text: "text-warning" };
  return { ring: "border-destructive text-destructive", band: "from-destructive/20", fill: "bg-destructive", text: "text-destructive" };
}

export default function SmmRenewalPopup() {
  const user = useAuthStore((s) => s.user);
  const seller = user?.role === "sales_member" ? user : null;
  const { campaigns, loading } = useSmmCampaigns(seller);
  const today = isoDay(new Date());
  // Bumped when something is marked seen, so the queue is read again from storage.
  const [seenTick, setSeenTick] = useState(0);
  const [index, setIndex] = useState(0);

  const queue = useMemo(() => {
    void seenTick;
    if (!seller) return [];
    return renewalPopupMonths(campaigns, seller.uid, today)
      .filter((c) => !seenToday(renewalPopupSeenKey(seller.uid, c.id, today)));
  }, [campaigns, seller?.uid, today, seenTick]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!seller || loading || queue.length === 0) return null;
  const at = Math.min(index, queue.length - 1);
  const campaign = queue[at];

  const dismiss = (ids: string[]) => {
    for (const id of ids) markSeen(renewalPopupSeenKey(seller.uid, id, today));
    setSeenTick((t) => t + 1);
  };

  return (
    <div className="fixed inset-0 z-[42] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-4">
      <RenewalReport
        key={campaign.id}
        campaign={campaign}
        today={today}
        user={seller}
        position={{ at, of: queue.length }}
        onPrev={() => setIndex(Math.max(0, at - 1))}
        onNext={() => setIndex(Math.min(queue.length - 1, at + 1))}
        onLater={() => dismiss([campaign.id])}
        onClose={() => dismiss(queue.map((c) => c.id))}
      />
    </div>
  );
}

function RenewalReport({ campaign, today, user, position, onPrev, onNext, onLater, onClose }: {
  campaign: SmmCampaign;
  today: string;
  user: { uid: string; name: string };
  position: { at: number; of: number };
  onPrev: () => void;
  onNext: () => void;
  onLater: () => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { renew, renewingId } = useSmmRenewal(user);
  const days = daysToRenewal(campaign.cycle, today);
  const u = urgency(days);
  const steps = renewalCountdownSteps(days);
  const f = fulfilment(campaign);
  const pace = paceOf(campaign, today);
  const counts = toneCounts(campaign, today);
  const ads = adTotals(allAdReports(campaign));
  const wait = clientWaitSummary(campaign.items);
  const extras = extraWork(campaign.items);
  const platforms = postsByPlatform(campaign.items);
  const team = teamMembers(campaign.team);
  const next = monthCycle(renewalStartDate(campaign.cycle, today));
  const name = campaign.businessName || campaign.clientName;
  const monthNo = campaign.monthNumber || 1;

  const stages = [
    ...SMM_TONE_LEGEND.map(({ tone, label }) => ({ key: tone, label, count: counts[tone], fill: TONE_BG[tone] })),
    // Outlined grey rather than the track's own colour, so "not planned" is a stage you can see.
    { key: "unplanned", label: "Not planned yet", count: counts.unplanned, fill: "bg-muted-foreground/15 ring-1 ring-inset ring-muted-foreground/40" },
  ].filter((s) => s.count > 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Renewal due — ${name}`}
      data-test="smm-renewal-popup"
      data-days={days}
      className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* ── The countdown ─────────────────────────────────────────────────────────────── */}
        <div className={`bg-gradient-to-b ${u.band} to-transparent px-4 pb-4 pt-3 sm:px-5`}>
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarClock size={13} /> Social media renewal
            </span>
            <div className="flex items-center gap-1">
              {position.of > 1 && (
                <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground" data-test="smm-renewal-popup-pager">
                  <button onClick={onPrev} disabled={position.at === 0} aria-label="Previous client"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent disabled:opacity-30">
                    <ChevronLeft size={14} />
                  </button>
                  {position.at + 1} of {position.of}
                  <button onClick={onNext} disabled={position.at === position.of - 1} aria-label="Next client"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent disabled:opacity-30">
                    <ChevronRight size={14} />
                  </button>
                </span>
              )}
              <button onClick={onClose} aria-label="Close for today" data-test="smm-renewal-popup-close"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-3.5">
            <div data-test="smm-renewal-popup-days"
              className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-4 bg-card ${u.ring}`}>
              {days > 0 ? (
                <>
                  <span className="font-display text-2xl font-bold leading-none">{days}</span>
                  <span className="text-[9px] font-semibold uppercase">day{days === 1 ? "" : "s"}</span>
                </>
              ) : (
                <span className="text-xs font-bold uppercase">Today</span>
              )}
            </div>
            <div className="min-w-0">
              <p data-test="smm-renewal-popup-label" className={`text-base font-bold leading-tight ${u.text}`}>
                {renewalCountdownLabel(days)}
              </p>
              <h2 data-test="smm-renewal-popup-business" className="truncate font-display text-lg font-bold leading-tight text-foreground">
                {name}
              </h2>
              <p className="truncate text-[11px] text-muted-foreground">
                {campaign.clientName && campaign.clientName !== campaign.businessName ? `${campaign.clientName} · ` : ""}
                {campaign.packageLabel}{monthNo > 1 ? ` · Month ${monthNo}` : ""}
              </p>
            </div>
          </div>

          {/* 3 days → 2 days → 1 day → renewal day, with where today is. */}
          <ol data-test="smm-renewal-countdown" className="mt-4 flex items-start">
            {steps.map((s, i) => (
              <li key={s.days} data-test="smm-renewal-step" data-state={s.state} className="flex flex-1 flex-col items-center">
                <div className="flex w-full items-center">
                  <span className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : s.state === "next" ? "bg-muted-foreground/25" : u.fill}`} />
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    s.state === "now" ? `${u.fill} text-white ring-4 ring-card shadow`
                      : s.state === "past" ? `${u.fill} text-white opacity-60`
                      : "border-2 border-muted-foreground/30 bg-card text-muted-foreground"
                  }`}>
                    {s.state === "past" ? <Check size={13} /> : s.days === 0 ? <RefreshCcw size={12} /> : s.days}
                  </span>
                  <span className={`h-0.5 flex-1 ${i === steps.length - 1 ? "opacity-0" : steps[i + 1].state === "next" ? "bg-muted-foreground/25" : u.fill}`} />
                </div>
                <span className={`mt-1 text-[10px] ${s.state === "now" ? `font-bold ${u.text}` : "text-muted-foreground"}`}>
                  {s.state === "now" ? (s.days === 0 ? "Today" : `${s.label} · today`) : s.label}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-3 px-4 pb-4 sm:px-5">
          {/* ── The month's timeline ──────────────────────────────────────────────────────── */}
          <section className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-foreground">This month's timeline</h3>
              <span className="text-[11px] text-muted-foreground">{cycleRangeLabel(campaign.cycle)}</span>
            </div>
            {/* Its own labels: the timeline's "3 days left" counts today, and under a "2 days to
                renewal" countdown that read as two different answers to one question. */}
            <div className="mt-2.5"><MonthTimeline cycle={campaign.cycle} today={today} items={campaign.items} size="lg" showLabels={false} /></div>
            <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
              <span>{shortDayLabel(campaign.cycle.startDate)}</span>
              <span className={`font-semibold ${u.text}`}>Renews {shortDayLabel(campaign.cycle.endDate)}</span>
            </div>
          </section>

          {/* ── Where the work stands ─────────────────────────────────────────────────────── */}
          <section className="rounded-xl border border-border p-3" data-test="smm-renewal-work">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-foreground">Work status</h3>
              <PaceChip pace={pace} />
            </div>
            <div className="mt-2 flex items-end gap-2">
              <span data-test="smm-renewal-percent" className="font-display text-3xl font-bold leading-none text-foreground">{f.percent}%</span>
              <span className="pb-0.5 text-xs text-muted-foreground">
                {f.posted} of {f.committed} promised post{f.committed === 1 ? "" : "s"} live
              </span>
            </div>
            {counts.total > 0 && (
              <>
                <div className="mt-2.5 flex h-3 overflow-hidden rounded-full bg-muted" role="img"
                  aria-label={stages.map((s) => `${s.count} ${s.label}`).join(", ")}>
                  {stages.map((s) => (
                    <span key={s.key} data-test={`smm-renewal-stage-${s.key}`} title={`${s.count} ${s.label}`}
                      className={`h-full ${s.fill}`} style={{ width: `${(s.count / counts.total) * 100}%` }} />
                  ))}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                  {stages.map((s) => (
                    <span key={s.key} className="inline-flex items-center gap-1">
                      <span className={`h-2 w-2 rounded-full ${s.fill}`} />
                      <b className="text-foreground">{s.count}</b> {s.label}
                    </span>
                  ))}
                </div>
              </>
            )}
            <div className="mt-3 grid gap-2">
              {KIND_ROWS.map(({ kind, label, icon }) => {
                const committed = campaign.commitments?.[kind] || 0;
                if (committed <= 0) return null;
                const segments = kindSegments(campaign.items, kind, today);
                const posted = segments.filter((s) => s.tone === "done").length;
                return (
                  <KindBar key={kind} testId={`smm-renewal-bar-${kind}`} label={label} icon={icon}
                    segments={segments} committed={committed} posted={posted} />
                );
              })}
            </div>
            <ToneLegend className="mt-2" />
          </section>

          {/* ── The report: what to say on the call ───────────────────────────────────────── */}
          <section data-test="smm-renewal-report">
            <h3 className="mb-1.5 text-xs font-semibold text-foreground">Report for the call</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Posts live", value: `${f.posted}/${f.committed}`, Icon: Check },
                { label: "Leads from ads", value: String(ads.leads), Icon: TrendingUp },
                { label: "Ad spend", value: formatCurrency(ads.spend), Icon: IndianRupee },
                { label: "Days waiting on client", value: String(wait.totalDays), Icon: Clock },
              ].map(({ label, value, Icon }) => (
                <div key={label} className="rounded-lg border border-border bg-muted/30 p-2.5">
                  <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <Icon size={10} /> {label}
                  </p>
                  <p className="mt-0.5 font-mono text-sm font-semibold text-foreground">{value}</p>
                </div>
              ))}
            </div>
            <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              {platforms.length > 0 && (
                <li>Posted on: {platforms.map((p) => `${p.label} (${p.count})`).join(" · ")}</li>
              )}
              {extras.items.length > 0 && (
                <li><b className="text-foreground">{extras.items.length}</b> extra piece{extras.items.length === 1 ? "" : "s"} delivered beyond the package</li>
              )}
              {wait.openCount > 0 && (
                <li className="text-warning">{wait.openCount} piece{wait.openCount === 1 ? " is" : "s are"} still waiting for the client's approval</li>
              )}
              {ads.leads > 0 && <li>Cost per lead: {formatCurrency(ads.costPerResult)}</li>}
              <li className="flex items-start gap-1">
                <Users size={11} className="mt-0.5 shrink-0" />
                <span>{team.length > 0 ? team.map((m) => `${m.name} (${m.roles.join("/")})`).join(" · ") : "Nobody on the team yet"}</span>
              </li>
              {campaign.renewal?.state === "pitched" && (
                <li className="font-medium text-foreground">You have pitched the renewal — waiting on the client's answer.</li>
              )}
            </ul>
            <p data-test="smm-renewal-next" className="mt-2 rounded-lg bg-primary/10 px-2.5 py-2 text-[11px] text-foreground">
              If they renew, the next month runs <b>{cycleRangeLabel(next)}</b> with the same team.
            </p>
          </section>
        </div>
      </div>

      {/* ── Actions — always in view, however long the report ──────────────────────────────── */}
      <div className="flex gap-2 border-t border-border bg-card px-4 py-3 sm:px-5">
        <button onClick={onLater} data-test="smm-renewal-popup-later"
          className="h-10 flex-1 rounded-lg border border-border bg-accent text-sm font-medium text-foreground">
          Later
        </button>
        <button
          data-test="smm-renewal-popup-report"
          onClick={() => { onLater(); navigate(`/smm/${campaign.id}?tab=report`); }}
          className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-primary/40 text-sm font-medium text-primary hover:bg-primary/10"
        >
          <FileBarChart size={14} /> Full report
        </button>
        <button
          data-test="smm-renewal-popup-renew"
          disabled={renewingId === campaign.id}
          onClick={async () => { await renew(campaign); onLater(); }}
          className="inline-flex h-10 flex-[1.4] items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {renewingId === campaign.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />} Renew
        </button>
      </div>
    </div>
  );
}

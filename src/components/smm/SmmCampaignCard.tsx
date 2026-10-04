/**
 * One client's month, on one card (redrawn 2026-10-04).
 *
 * ── What it has to answer without being opened ────────────────────────────────────────────────
 * The owner asked for each social-media month to be clear in a single card. So the card reads top to
 * bottom like a sentence: who the client is; whether the month is fine — a status in everyday words
 * with its reason ("Off track — 3 posts are late"); how much is done — one ring of every promised post
 * with "6/16 posted" in the middle and each part named with its count; each kind's own count; the days
 * left; the next post. Underneath, small: who is on it and who sold it, and where the renewal stands.
 * The coloured stripe along the top is the status, so a red card stands out in a grid of twenty.
 *
 * The actions (Set up, Renew) sit below the link rather than inside it — a button inside a link is
 * a click that does two things.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCcw, Settings2 } from "lucide-react";
import { isoDay, teamMembers } from "@/utils/smmPlan";
import { NO_SALE_NOTE, clipsPerVideoOf, isNoSaleMonth, needsSetup, renewalDue, sellerLineOf, videoSeconds } from "@/utils/smmPackage";
import { monthGlance, type SmmGlance } from "@/utils/smmGlance";
import { overdueItemsFor } from "@/utils/smmReminders";
import { MonthGlance, StatusPill, TONE_STYLE } from "@/components/smm/SmmGlance";
import { PlatformChips } from "@/components/smm/SmmChips";
import type { SmmCampaign } from "@/types/smm";

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("") || "?";

const RENEWAL_STYLE: Record<string, string> = {
  due: "bg-viz-ready/15 text-foreground",
  overdue: "bg-viz-late/15 text-foreground",
  renewed: "bg-viz-done/15 text-foreground",
  lost: "bg-muted text-muted-foreground",
};

export default function SmmCampaignCard({ campaign, viewerUid, onSetUp, onRenew, renewing, glance: given }: {
  campaign: SmmCampaign;
  /** Used only to say how much of the late work is the viewer's own — everyone sees the same facts. */
  viewerUid?: string;
  /** Offered to the tech side on a month nobody is on yet. */
  onSetUp?: (c: SmmCampaign) => void;
  /** Offered to the month's own salesperson when its renewal is due. */
  onRenew?: (c: SmmCampaign) => void;
  renewing?: boolean;
  /** Already worked out by the board (it sorts by it); computed here when not given. */
  glance?: SmmGlance;
}) {
  const today = isoDay(new Date());
  const glance = useMemo(() => given || monthGlance(campaign, today), [given, campaign, today]);
  const team = teamMembers(campaign.team);
  const mineLate = viewerUid ? overdueItemsFor([campaign], viewerUid, today).length : 0;
  const setupDue = needsSetup(campaign, today);
  const renewDue = renewalDue(campaign, today);
  const monthNo = campaign.monthNumber || 1;
  const hasVideos = (campaign.commitments?.ai_ad || 0) > 0;
  const name = campaign.businessName || campaign.clientName;
  const meta = [
    campaign.clientName && campaign.clientName !== campaign.businessName ? campaign.clientName : "",
    campaign.packageLabel,
    monthNo > 1 ? `Month ${monthNo}` : "",
    hasVideos ? `${videoSeconds(clipsPerVideoOf(campaign))}s videos` : "",
  ].filter(Boolean).join(" · ");

  return (
    <div data-test="smm-campaign-card" data-status={glance.status} data-setup={setupDue ? "due" : "done"}
      /* `min-w-0`: a grid item will not shrink below its content without it, and a long business
         name dragged the whole card off a phone screen even though the heading truncated. */
      className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-lg">
      <div className={`h-1 w-full shrink-0 ${TONE_STYLE[glance.tone].stripe}`} />

      <Link to={`/smm/${campaign.id}`} className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-5">
        <header className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 data-test="smm-card-business" className="truncate text-base font-semibold leading-tight text-foreground sm:text-[17px]">
                {name}
              </h3>
              <p data-test="smm-card-meta" className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <PlatformChips platforms={campaign.platforms} />
              {/* In nobody's revenue — said on the card, so nobody reads its package as money made. */}
              {isNoSaleMonth(campaign) && (
                <span data-test="smm-card-no-sale" title={NO_SALE_NOTE}
                  className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  No sale
                </span>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <StatusPill glance={glance} />
            <span data-test="smm-card-reason" className="min-w-0 text-[13px] text-foreground/80">
              {glance.reason}
              {mineLate > 0 && <span className="font-medium text-foreground"> · {mineLate} of them yours</span>}
            </span>
          </div>
        </header>

        <MonthGlance glance={glance} />
      </Link>

      {/*
        Small, underneath — the people, not the headline. The team names may run out of room; the
        seller's may not: truncating them together left "sold by Anita" reading as "sold".
      */}
      <div data-test="smm-card-team" className="flex items-center gap-2.5 border-t border-border px-4 py-3 text-[11px] text-muted-foreground sm:px-5">
        {team.length > 0 ? (
          <span className="flex shrink-0 -space-x-1.5">
            {team.slice(0, 3).map((m) => (
              <span key={m.uid} title={`${m.name} (${m.roles.join(", ")})`}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground/10 text-[10px] font-semibold text-foreground ring-2 ring-card">
                {initials(m.name)}
              </span>
            ))}
            {team.length > 3 && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground/10 text-[10px] font-semibold text-muted-foreground ring-2 ring-card">
                +{team.length - 3}
              </span>
            )}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate">
          {team.length > 0
            ? team.map((m) => m.name.split(" ")[0]).join(", ")
            : campaign.history ? "Recorded after it ended" : "Nobody on it yet"}
        </span>
        <span className="shrink-0 whitespace-nowrap">{sellerLineOf(campaign)}</span>
      </div>

      {(glance.renewal.state !== "none" || (setupDue && onSetUp) || (renewDue && onRenew)) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5 sm:px-5">
          {glance.renewal.state !== "none" && (
            <span data-test={renewDue ? "smm-card-renewal-due" : "smm-card-renewal"}
              className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium ${RENEWAL_STYLE[glance.renewal.state]}`}>
              <RefreshCcw size={12} /> {glance.renewal.label}
            </span>
          )}
          <span className="flex-1" />
          {setupDue && onSetUp && (
            <button onClick={() => onSetUp(campaign)} data-test="smm-card-setup"
              /* Dark words on amber — white on amber cannot be read. */
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-viz-wait px-3 text-xs font-semibold text-zinc-950 hover:bg-viz-wait/90">
              <Settings2 size={13} /> Set up & assign
            </button>
          )}
          {renewDue && onRenew && (
            <button onClick={() => onRenew(campaign)} disabled={renewing} data-test="smm-card-renew"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {renewing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCcw size={13} />} Renew
            </button>
          )}
        </div>
      )}
    </div>
  );
}

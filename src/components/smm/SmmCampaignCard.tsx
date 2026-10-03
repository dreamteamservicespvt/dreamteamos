/**
 * One month, on the board (redrawn 2026-10-03).
 *
 * ── What it has to answer without being opened ────────────────────────────────────────────────
 * The board is read by people with a dozen clients in front of them, scanning for trouble. So each
 * card answers, at a glance and in this order: which client and which package; how far through its
 * dates the month is, with every post as a dot on its day; how much of each kind has been posted,
 * one block per piece; whether it is keeping pace; what is late or waiting on the client; who is on
 * it and who sold it. The business is set large and the people small underneath, because what they
 * are looking for is a client.
 *
 * The actions (Set up, Renew) sit below the link rather than inside it — a button inside a link is
 * a click that does two things.
 */
import { Link } from "react-router-dom";
import { AlertTriangle, Clock, Image as ImageIcon, Loader2, RefreshCcw, Settings2, Sparkles, Users, Video } from "lucide-react";
import { clientWaitSummary, isOverdue, isoDay, teamMembers } from "@/utils/smmPlan";
import {
  clipsPerVideoOf, cyclePhase, kindSegments, needsSetup, paceOf, renewalDue, videoLengthLabel,
} from "@/utils/smmPackage";
import { overdueItemsFor } from "@/utils/smmReminders";
import { KindBar, MonthTimeline, PaceChip } from "@/components/smm/SmmVisuals";
import { PlatformChips } from "@/components/smm/SmmChips";
import type { SmmCampaign, SmmContentKind } from "@/types/smm";
import type { LucideIcon } from "lucide-react";

const KIND_ROWS: { kind: SmmContentKind; label: string; icon: LucideIcon }[] = [
  { kind: "ai_ad", label: "Videos", icon: Sparkles },
  { kind: "poster", label: "Posters", icon: ImageIcon },
  { kind: "real_video", label: "Real videos", icon: Video },
];

export default function SmmCampaignCard({ campaign, viewerUid, onSetUp, onRenew, renewing }: {
  campaign: SmmCampaign;
  /** Used only to colour "my own late work" — everyone sees the same facts. */
  viewerUid?: string;
  /** Offered to the tech side on a month nobody is on yet. */
  onSetUp?: (c: SmmCampaign) => void;
  /** Offered to the month's own salesperson when its renewal is due. */
  onRenew?: (c: SmmCampaign) => void;
  renewing?: boolean;
}) {
  const today = isoDay(new Date());
  const pace = paceOf(campaign, today);
  const wait = clientWaitSummary(campaign.items);
  const team = teamMembers(campaign.team);
  const late = campaign.items.filter((i) => isOverdue(i, today)).length;
  const mineLate = viewerUid ? overdueItemsFor([campaign], viewerUid, today).length : 0;
  const setupDue = needsSetup(campaign, today);
  const renewDue = renewalDue(campaign, today);
  const ended = cyclePhase(campaign.cycle, today) === "ended";
  const clips = clipsPerVideoOf(campaign);
  const monthNo = campaign.monthNumber || 1;
  const sellerLine = campaign.origin === "direct" ? `added by ${campaign.soldByName}` : `sold by ${campaign.soldByName}`;
  const carriedIn = campaign.items.filter((i) => i.carriedFrom).length;

  return (
    <div data-test="smm-campaign-card" data-setup={setupDue ? "due" : "done"}
      /* `min-w-0`: a grid item will not shrink below its content without it, and a long business
         name dragged the whole card off a phone screen even though the heading truncated. */
      className={`flex min-w-0 flex-col rounded-xl border bg-card transition-colors hover:border-primary/40 ${
        setupDue ? "border-warning/50" : late > 0 ? "border-destructive/30" : "border-border"
      }`}>
      <Link to={`/smm/${campaign.id}`} className="block min-w-0 flex-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 data-test="smm-card-business" className="truncate text-base font-semibold leading-tight text-foreground sm:text-lg">
              {campaign.businessName || campaign.clientName}
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              {campaign.clientName && campaign.clientName !== campaign.businessName ? `${campaign.clientName} · ` : ""}
              {campaign.packageLabel}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {monthNo > 1 && (
              <span data-test="smm-card-month-no" className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Month {monthNo}
              </span>
            )}
            {campaign.history && (
              <span className="rounded-full bg-info/15 px-2 py-0.5 text-[10px] font-semibold text-info">History</span>
            )}
            <PlatformChips platforms={campaign.platforms} />
          </div>
        </div>

        {(campaign.commitments?.ai_ad || 0) > 0 && (
          <p data-test="smm-card-length" className="mt-1 text-[11px] text-muted-foreground">
            Each video {videoLengthLabel(clips)}
          </p>
        )}

        <div className="mt-3"><MonthTimeline cycle={campaign.cycle} today={today} items={campaign.items} /></div>

        <div className="mt-3 grid gap-2">
          {KIND_ROWS.map(({ kind, label, icon }) => {
            const committed = campaign.commitments?.[kind] || 0;
            if (committed <= 0) return null;
            const segments = kindSegments(campaign.items, kind, today);
            const posted = segments.filter((s) => s.tone === "done").length;
            return (
              <KindBar key={kind} testId={`smm-card-bar-${kind}`} label={label} icon={icon}
                segments={segments} committed={committed} posted={posted} />
            );
          })}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
          {!campaign.history && <PaceChip pace={pace} />}
          {late > 0 && (
            <span data-test="smm-card-late" className={`inline-flex items-center gap-1 font-medium ${mineLate > 0 ? "text-destructive" : "text-warning"}`}>
              <AlertTriangle size={11} /> {late} late{mineLate > 0 ? ` · ${mineLate} yours` : ""}
            </span>
          )}
          {wait.openCount > 0 && (
            <span className="inline-flex items-center gap-1 text-warning">
              <Clock size={11} /> {wait.openCount} with the client
            </span>
          )}
          {carriedIn > 0 && (
            <span className="text-muted-foreground">{carriedIn} carried over</span>
          )}
          {renewDue && (
            <span data-test="smm-card-renewal-due" className="inline-flex items-center gap-1 font-medium text-primary">
              <RefreshCcw size={11} /> {ended ? "Renewal overdue" : "Renewal due"}
            </span>
          )}
          {campaign.renewal?.nextCampaignId && (
            <span className="font-medium text-success">Renewed</span>
          )}
        </div>

        {/*
          Small, underneath — the people, not the headline. The team names may run out of room; the
          seller's may not: truncating them together left "sold by Anita" reading as "sold".
        */}
        <div data-test="smm-card-team" className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Users size={11} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {team.length > 0
              ? team.map((m) => `${m.name} (${m.roles.join("/")})`).join(" · ")
              : campaign.history ? "Recorded after it ended" : "Nobody on it yet"}
          </span>
          <span className="shrink-0 whitespace-nowrap pl-2">{sellerLine}</span>
        </div>
      </Link>

      {((setupDue && onSetUp) || (renewDue && onRenew)) && (
        <div className="flex flex-wrap gap-1.5 border-t border-border px-4 py-2.5">
          {setupDue && onSetUp && (
            <button onClick={() => onSetUp(campaign)} data-test="smm-card-setup"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-warning px-3 text-xs font-semibold text-white hover:bg-warning/90">
              <Settings2 size={13} /> Set up & assign
            </button>
          )}
          {renewDue && onRenew && (
            <button onClick={() => onRenew(campaign)} disabled={renewing} data-test="smm-card-renew"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {renewing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCcw size={13} />} Renew for next month
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One month, on the overview.
 *
 * ── Why the client is the headline and the member is the footnote ─────────────────────────────
 * This list is read by people with a dozen months in front of them, and what they are looking for is
 * a client — "how is Sri Lakshmi Jewellers doing this month". So the business is set large and the
 * people on it small underneath, exactly as asked for. The bar and the one-line state sit between
 * them, because the second question is always "are we behind", and it should be answerable without
 * opening anything.
 */
import { Link } from "react-router-dom";
import { AlertTriangle, Clock, Users } from "lucide-react";
import { clientWaitSummary, daysLeftInCycle, fulfilment, isoDay, teamMembers } from "@/utils/smmPlan";
import { overdueItemsFor } from "@/utils/smmReminders";
import { ProgressBar } from "@/components/smm/SmmChips";
import type { SmmCampaign } from "@/types/smm";

export default function SmmCampaignCard({ campaign, viewerUid }: {
  campaign: SmmCampaign;
  /** Used only to colour "my own late work" — everyone sees the same facts. */
  viewerUid?: string;
}) {
  const today = isoDay(new Date());
  const f = fulfilment(campaign);
  const wait = clientWaitSummary(campaign.items);
  const daysLeft = daysLeftInCycle(campaign.cycle, today);
  const team = teamMembers(campaign.team);
  const late = campaign.items.filter((i) => i.uploadDate && i.status !== "posted" && i.uploadDate < today).length;
  const mineLate = viewerUid ? overdueItemsFor([campaign], viewerUid, today).length : 0;

  return (
    <Link
      to={`/smm/${campaign.id}`}
      data-test="smm-campaign-card"
      /* `min-w-0`: this is a grid item, and a grid item will not shrink below its own content
         unless told to — a long business name dragged the whole card off a phone screen even
         though the heading inside it was already truncating. */
      className="block min-w-0 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* The two names people actually scan for, at the size they scan at. */}
          <h3 data-test="smm-card-business" className="truncate text-base font-semibold leading-tight text-foreground sm:text-lg">
            {campaign.businessName || campaign.clientName}
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            {campaign.clientName && campaign.clientName !== campaign.businessName ? `${campaign.clientName} · ` : ""}
            {campaign.packageLabel}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p data-test="smm-card-percent" className="font-mono text-lg font-bold text-primary">{f.percent}%</p>
          <p className="text-[10px] text-muted-foreground">{f.posted}/{f.committed} posted</p>
        </div>
      </div>

      <div className="mt-2.5"><ProgressBar percent={f.percent} tone={f.complete ? "success" : "primary"} /></div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        {late > 0 && (
          <span data-test="smm-card-late" className={`inline-flex items-center gap-1 font-medium ${mineLate > 0 ? "text-destructive" : "text-warning"}`}>
            <AlertTriangle size={11} /> {late} late{mineLate > 0 ? ` · ${mineLate} yours` : ""}
          </span>
        )}
        {wait.openCount > 0 && (
          <span className="inline-flex items-center gap-1 text-warning">
            <Clock size={11} /> {wait.openCount} waiting on client
          </span>
        )}
        <span className="text-muted-foreground">
          {daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? "Last day" : `Ended ${Math.abs(daysLeft)}d ago`}
        </span>
      </div>

      {/*
        Small, underneath — the people, not the headline.

        The team names are the part allowed to run out of room; the seller's name is not. Truncating
        the whole line together left "sold by Anita" reading as "sold", which looks like a status.
      */}
      <div data-test="smm-card-team" className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
        <Users size={11} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {team.length > 0
            ? team.map((m) => `${m.name} (${m.roles.join("/")})`).join(" · ")
            : "Nobody assigned yet"}
        </span>
        {/* A month that came to us directly was not sold by anybody — saying it was would put a
            commission conversation where there is none. */}
        <span className="shrink-0 whitespace-nowrap pl-2">
          {campaign.origin === "direct" ? "added by" : "sold by"} {campaign.soldByName}
        </span>
      </div>
    </Link>
  );
}

/**
 * The Social Media dashboard — the Overview of /smm (2026-10-04).
 *
 * ── What it answers, top to bottom ────────────────────────────────────────────────────────────
 *   1. Are we delivering?            — the hero: posted against promised, against today's target.
 *   2. Where are the piles?          — the tiles: due this week, late, with the client, renewals.
 *   3. Who is behind?                — the pace matrix: every client, time gone against work out.
 *   4. Where is all the work?        — the pipeline: every promised piece by stage.
 *   5. Is the coming work ready?     — the posting calendar, stacked by stage, today marked.
 *   6. Which clients, in order?      — the list, worst first, each a bullet against its calendar.
 *   7. What renews, and for how much — the runway.
 *   8. Who holds what?               — team load (people who run the side only).
 *   9. Are the ads working?          — leads, spend, cost per lead (when there are ads).
 *
 * Everything is drawn from the months the viewer can already see (useSmmCampaigns), filtered by the
 * same member / salesperson filters as the board, so the dashboard costs no extra read and can never
 * show a client the board would not. Money appears only for the people who sell and run the side.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Megaphone, Plus } from "lucide-react";
import { DeliveryHero, KpiTiles, type SmmBoardFilter } from "@/components/smm/dashboard/Headline";
import { ClientPaceList, PaceMatrix } from "@/components/smm/dashboard/PaceViews";
import { PostingCalendar, StagePipeline } from "@/components/smm/dashboard/WorkViews";
import { RenewalRunway } from "@/components/smm/dashboard/RenewalRunway";
import { AdsPerformance, TeamWorkload } from "@/components/smm/dashboard/TeamAndAds";
import {
  adsSummary, byUrgency, dashboardKpis, dashboardMonths, deliverySummary, pacePoints, renewalRunway, scheduleDays,
  stageBreakdown, teamWorkload,
} from "@/utils/smmDashboard";
import type { SmmCampaign } from "@/types/smm";

export type { SmmBoardFilter };

export default function SmmDashboard({ campaigns, today, showMoney, showTeam, onPick, onAddSale }: {
  campaigns: SmmCampaign[];
  today: string;
  showMoney: boolean;
  /** Team load is for the people who run the side, not for a member looking at their own months. */
  showTeam: boolean;
  onPick: (filter: SmmBoardFilter) => void;
  onAddSale?: () => void;
}) {
  const navigate = useNavigate();
  const months = useMemo(() => dashboardMonths(campaigns), [campaigns]);
  const kpis = useMemo(() => dashboardKpis(months, today), [months, today]);
  const delivery = useMemo(() => deliverySummary(months, today), [months, today]);
  const stages = useMemo(() => stageBreakdown(months, today), [months, today]);
  const days = useMemo(() => scheduleDays(months, today), [months, today]);
  const points = useMemo(() => byUrgency(pacePoints(months, today)), [months, today]);
  const runway = useMemo(() => renewalRunway(months, today), [months, today]);
  const team = useMemo(() => (showTeam ? teamWorkload(months, today) : []), [showTeam, months, today]);
  const ads = useMemo(() => adsSummary(months, today), [months, today]);

  if (months.length === 0) {
    return (
      <div data-test="smm-dashboard-empty" className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted"><Megaphone size={22} className="text-muted-foreground" /></span>
        <p className="mt-4 text-sm font-semibold text-foreground">No social media months running</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          A month appears here the moment it is sold, and the dashboard fills in as its pieces are planned and posted.
        </p>
        {onAddSale && (
          <button type="button" onClick={onAddSale}
            className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus size={15} /> Add SMM sale
          </button>
        )}
      </div>
    );
  }

  const showTeamCard = showTeam && team.length > 0;
  const showAds = ads.hasAds;

  return (
    <div data-test="smm-dashboard" className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-12">
        <DeliveryHero delivery={delivery} className="lg:col-span-5" />
        <KpiTiles kpis={kpis} showMoney={showMoney} onPick={onPick} className="lg:col-span-7" />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <PaceMatrix points={points} onOpen={(id) => navigate(`/smm/${id}`)} className="lg:col-span-7" />
        <StagePipeline breakdown={stages} className="lg:col-span-5" />
      </div>

      <PostingCalendar days={days} />

      <div className="grid gap-4 lg:grid-cols-12">
        <ClientPaceList points={points} className="lg:col-span-7" />
        <RenewalRunway runway={runway} today={today} showMoney={showMoney} className="lg:col-span-5" />
      </div>

      {(showTeamCard || showAds) && (
        <div className="grid gap-4 lg:grid-cols-12">
          {showTeamCard && <TeamWorkload rows={team} className={showAds ? "lg:col-span-7" : "lg:col-span-12"} />}
          {showAds && <AdsPerformance ads={ads} className={showTeamCard ? "lg:col-span-5" : "lg:col-span-12"} />}
        </div>
      )}
    </div>
  );
}

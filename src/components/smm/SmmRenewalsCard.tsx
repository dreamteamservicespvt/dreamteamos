/**
 * "Renewals due" — on the salesperson's dashboard (2026-10-03).
 *
 * Renewing is the salesperson's job, and the dashboard is the one screen they open every day, so
 * a month ending in the next five days (or already ended with no decision) is put in front of them
 * there, with the Renew button beside it. The reminders existed as a calculation
 * (`smmReminders.renewalsDueFor`) and were shown nowhere until now. The bell rings once a day.
 */
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCcw } from "lucide-react";
import { useSmmCampaigns, type SmmViewer } from "@/hooks/useSmmCampaigns";
import { notifyRenewalsDueOnOpen } from "@/services/smm";
import { isoDay } from "@/utils/smmPlan";
import { renewalsDueFor } from "@/utils/smmReminders";
import { useSmmRenewal } from "@/components/smm/useSmmRenewal";

export default function SmmRenewalsCard({ user }: { user: SmmViewer }) {
  const { campaigns, loading } = useSmmCampaigns(user);
  const today = isoDay(new Date());
  const { renew, renewingId } = useSmmRenewal(user);
  const live = campaigns.filter((c) => c.status === "active" && !c.history && !c.renewal?.nextCampaignId);
  const due = renewalsDueFor(live, user.uid, today);

  const rang = useRef(false);
  useEffect(() => {
    if (loading || rang.current) return;
    rang.current = true;
    notifyRenewalsDueOnOpen(live, user, today).catch(() => undefined);
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || due.length === 0) return null;
  return (
    <div data-test="smm-renewals-card" className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <RefreshCcw size={15} className="text-primary" /> Social media renewals due
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Renew before the month ends and the next one starts on the same date, with the same team.
      </p>
      <div className="mt-3 space-y-2">
        {due.map((r) => {
          const campaign = live.find((c) => c.id === r.campaignId);
          return (
            <div key={r.campaignId} data-test="smm-renewal-row" className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2.5">
              <div className="min-w-0 flex-1">
                <Link to={`/smm/${r.campaignId}`} className="block truncate text-sm font-medium text-foreground hover:underline">
                  {r.businessName || r.clientName}
                </Link>
                <p className="text-[11px] text-muted-foreground">
                  {r.daysLeft > 1 ? `${r.daysLeft} days left` : r.daysLeft === 1 ? "Last day" : "Ended — no decision yet"} · {r.postedOfCommitted} posted
                </p>
              </div>
              {campaign && (
                <button onClick={() => renew(campaign)} disabled={renewingId === campaign.id} data-test="smm-renewal-row-renew"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {renewingId === campaign.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />} Renew
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

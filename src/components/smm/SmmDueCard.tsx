/**
 * "Here is what your social media clients need this week."
 *
 * ── Why this appears at check-in and check-out ────────────────────────────────────────────────
 * There is no scheduler on this stack, so a reminder has to be attached to something a person
 * already does. A tech member opens exactly two things every working day without fail: the check-in
 * prompt, which they cannot dismiss, and the check-out modal. Those are the two moments a post due
 * on Thursday can be put in front of the person who owes it while there is still time to make it —
 * at check-in to plan the day, and at check-out as the last chance to notice.
 *
 * Three days of notice, which is the same window the push notification and the table's amber chip
 * use, so the three never disagree about what "due soon" means.
 */
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, AlertTriangle } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useSmmCampaigns } from "@/hooks/useSmmCampaigns";
import { notifySmmDueOnOpen } from "@/services/smm";
import { isoDay } from "@/utils/smmPlan";
import { dueItemsFor, dueLabel } from "@/utils/smmReminders";

export default function SmmDueCard({ onNavigate }: { onNavigate?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const { campaigns, loading } = useSmmCampaigns(user);
  const today = isoDay(new Date());
  const swept = useRef(false);

  const due = user ? dueItemsFor(campaigns, user.uid, today) : [];

  /**
   * The push, sent once. `notifySmmDueOnOpen` is itself keyed per item per day, so a second sweep
   * would be harmless — the ref simply stops it costing a round trip on every re-render.
   */
  useEffect(() => {
    if (loading || swept.current || !user || due.length === 0) return;
    swept.current = true;
    notifySmmDueOnOpen(campaigns, user, today).catch(() => { /* a missed bell is not a blocker */ });
  }, [loading, user?.uid, due.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || due.length === 0) return null;

  const late = due.filter((d) => d.overdue).length;

  return (
    <div data-test="smm-due-card" className="rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-left">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
        {late > 0 ? <AlertTriangle size={13} /> : <CalendarClock size={13} />}
        Social media — {late > 0 ? `${late} late, ` : ""}{due.length} due in the next 3 days
      </p>
      <ul className="mt-1.5 space-y-1">
        {due.slice(0, 4).map((d) => (
          <li key={d.item.id}>
            <Link
              to={`/smm/${d.campaignId}`}
              onClick={onNavigate}
              data-test="smm-due-row"
              /* A late row is the one that has to be picked out of four at a glance. */
              className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[11px] transition-colors hover:bg-card ${
                d.overdue ? "bg-destructive/15 ring-1 ring-destructive/30" : "bg-card/70"
              }`}
            >
              <span className={`min-w-0 truncate ${d.overdue ? "text-destructive" : "text-foreground"}`}>
                <strong className="font-medium">{d.businessName}</strong> — {dueLabel(d)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {due.length > 4 && (
        <Link to="/smm" onClick={onNavigate} className="mt-1 block text-[11px] text-warning underline">
          and {due.length - 4} more
        </Link>
      )}
    </div>
  );
}

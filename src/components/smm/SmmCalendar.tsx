/**
 * The month page's calendar — the CLIENT's calendar, opened on this month (2026-10-05). Used by the
 * Content tab's Calendar and the Report tab.
 *
 * It used to draw only this month's thirty days, so checking what went up for the client before
 * meant opening each earlier month in turn. Now it is the client's whole run (components/smm/calendar):
 * a normal calendar, one calendar month per page, opened on this month (today's page while it runs),
 * with ‹ › and Today to reach every earlier and later month of the client. This
 * month is live (the page's own listener), so a post ticked off moves at once; the other months are read
 * once when the calendar opens (useSmmClientMonths), and only those this person may already open are
 * shown. This month's posts open for editing, as before; another month's page is one link away.
 */
import { useMemo } from "react";
import { useAuthStore } from "@/store/authStore";
import { useSmmClientMonths } from "@/hooks/useSmmClientMonths";
import { isoDay } from "@/utils/smmPlan";
import { clientKeyOf, type CalendarKind } from "@/utils/smmCalendar";
import ClientCalendar from "@/components/smm/calendar/ClientCalendar";
import type { SmmCampaign, SmmContentItem } from "@/types/smm";

export default function SmmCalendar({ campaign, kind = "all", onOpen }: {
  campaign: SmmCampaign;
  /** The content table's kind filter — posters, AI videos or real videos — applied to every month. */
  kind?: CalendarKind;
  /** Opens one of this month's posts for editing (absent: the calendar only shows). */
  onOpen?: (item: SmmContentItem) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const today = isoDay(new Date());
  const live = useMemo(() => [campaign], [campaign]);
  const { months, loading, error, retry } = useSmmClientMonths({
    clientKey: clientKeyOf(campaign),
    live,
    viewer: user ? { uid: user.uid, role: user.role, smmLeader: (user as { smmLeader?: boolean }).smmLeader } : null,
    fetchHistory: true,
    keepId: campaign.id,
  });
  return (
    <ClientCalendar months={months} today={today} kind={kind} focusId={campaign.id} onOpenItem={onOpen}
      loading={loading} error={error} onRetry={retry} />
  );
}

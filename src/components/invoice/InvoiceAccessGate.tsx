/**
 * The door to `/invoices` for the one role whose access depends on a switch: the Tech Team Leader.
 *
 * `AppLayout` already turns away every role that can never use invoices (a tech member is sent off by
 * the route guard). This adds the switch: a team leader gets in only while `invoice_settings/access`
 * says so — and is shown why not, rather than bounced, when it is off. The Firestore rules make the
 * same check on the server (`canUseInvoices`), so typing the URL is no way round it.
 */
import { Link, Outlet } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useInvoiceAccess } from "@/hooks/useInvoiceSettings";
import { canUseInvoiceBuilder } from "@/utils/invoiceAccess";
import { defaultRouteForUser } from "@/utils/roleHelpers";

export default function InvoiceAccessGate() {
  const user = useAuthStore((s) => s.user);
  const isLeader = user?.role === "tech_team_leader";
  const { teamLeadersEnabled, loaded } = useInvoiceAccess(isLeader);

  if (!user) return null;
  if (isLeader && !loaded) {
    return (
      <div className="h-full min-h-[40vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={24} />
      </div>
    );
  }
  if (!canUseInvoiceBuilder(user.role, teamLeadersEnabled)) {
    return (
      <div className="h-full min-h-[50vh] flex flex-col items-center justify-center text-center gap-3 px-6" data-test="invoice-access-off">
        <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center"><Lock size={19} className="text-muted-foreground" /></div>
        <h2 className="text-base font-semibold text-foreground">Invoice Builder isn't turned on for you</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Your Tech Admin can allow team leaders to make invoices in Settings → Invoice Builder.
        </p>
        <Link to={defaultRouteForUser(user)} className="mt-1 h-9 px-3.5 inline-flex items-center rounded-lg border border-border text-sm font-medium hover:bg-accent">
          Back to work
        </Link>
      </div>
    );
  }
  return <Outlet />;
}

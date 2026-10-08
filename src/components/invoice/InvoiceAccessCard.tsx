/**
 * Settings → Invoice Builder: the one switch that lets Tech Team Leaders make invoices.
 *
 * Mounted on the Tech Admin's and the Main Admin's Settings pages — the people the owner named to
 * control it (2026-10-08). Flipping it shows or hides "Invoices" in every team leader's menu at once
 * (the sidebar listens to `invoice_settings/access`), and the Firestore rules read the same document.
 */
import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import { useInvoiceAccess } from "@/hooks/useInvoiceSettings";
import { setTeamLeadersEnabled } from "@/services/invoiceSettings";
import { canManageInvoiceAccess } from "@/utils/invoiceAccess";
import { Switch } from "@/components/ui/switch";

export default function InvoiceAccessCard() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const { teamLeadersEnabled, loaded } = useInvoiceAccess(true);
  const [busy, setBusy] = useState(false);

  if (!user || !canManageInvoiceAccess(user.role)) return null;

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      await setTeamLeadersEnabled(next, { uid: user.uid, name: user.name || "", role: user.role });
      toast({ title: next ? "Team leaders can now make invoices" : "Team leaders can no longer make invoices" });
    } catch {
      toast({ title: "Couldn't change the setting", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 md:p-6" data-test="invoice-access-card">
      <div className="flex items-center gap-2 text-xs md:text-sm font-medium text-muted-foreground mb-4"><FileText size={14} /> Invoice Builder</div>
      <label className="flex items-center justify-between gap-4 cursor-pointer">
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">Tech Team Leaders can make invoices</span>
          <span className="block text-xs text-muted-foreground mt-0.5">
            Salespeople, the Sales Admin, the Tech Admin, the Main Admin and the Accounts Admin always can. Tech members never can.
          </span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {(busy || !loaded) && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
          <Switch checked={teamLeadersEnabled} onCheckedChange={toggle} disabled={busy || !loaded} aria-label="Tech Team Leaders can make invoices" data-test="leader-invoice-switch" />
        </span>
      </label>
      <Link to="/invoices" className="mt-4 inline-flex text-xs font-medium text-primary hover:underline">Open Invoices →</Link>
    </div>
  );
}

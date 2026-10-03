/**
 * Renew, as the salesperson presses it (2026-10-03).
 *
 * A renewal is a sale like any other — the same form, the same approval, the same commission — so the
 * button does the one thing the month page cannot: it makes sure the client's number is the
 * salesperson's own lead (exactly as an upsell does, services/upsell), then opens My Leads on that
 * lead with the sale form open on the month being renewed. The rest happens when the sale is saved
 * (services/smm.ensureCampaignForOrder).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { startUpsell } from "@/services/upsell";
import { renewalLeadUrl } from "@/utils/smmPackage";
import type { SmmCampaign } from "@/types/smm";

export function useSmmRenewal(user: { uid: string; name: string } | null | undefined) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [renewingId, setRenewingId] = useState<string | null>(null);

  const renew = async (campaign: Pick<SmmCampaign, "id" | "clientPhone" | "businessName" | "clientName">) => {
    if (!user) return;
    setRenewingId(campaign.id);
    try {
      const target = await startUpsell({
        user,
        phone: campaign.clientPhone,
        displayName: campaign.businessName || campaign.clientName,
      });
      if (!target.ok || !target.leadId) {
        toast({ title: "Could not open the client's lead", description: target.message, variant: "destructive" });
        return;
      }
      navigate(renewalLeadUrl(target.leadId, campaign.id));
    } finally {
      setRenewingId(null);
    }
  };

  return { renew, renewingId };
}

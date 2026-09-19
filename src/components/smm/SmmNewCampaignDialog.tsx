/**
 * Starting a month for a client who never came through a sale.
 *
 * ── Why the same fields as the sale form ─────────────────────────────────────────────────────
 * A month is a month. Whether it arrived through a sales member or through the tech admin's own
 * phone, the same three things have to be agreed before anybody can work on it: which accounts,
 * how much of each kind of content, and what the client is paying. So this reuses
 * `SmmSaleFields` outright rather than growing a second, slightly different set of boxes that
 * would drift from it the first time either is corrected.
 *
 * What it adds is the client themselves — a name, a business and a number — which a sale would
 * have carried in from the lead.
 */
import { useState } from "react";
import { X, Loader2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { createDirectCampaign } from "@/services/smm";
import { PACKAGES, packageOptionLabel } from "@/utils/serviceCatalog";
import { isoDay } from "@/utils/smmPlan";
import {
  NO_ADDONS, commitmentsForPackage, platformsForPackage, quoteSmm,
} from "@/utils/smmPricing";
import SmmSaleFields, { type SmmSaleValue } from "@/components/sales/SmmSaleFields";
import type { AppUser } from "@/types";

const PACKAGE_LIST = PACKAGES.social_media_management || [];

export default function SmmNewCampaignDialog({ user, onClose, onCreated }: {
  user: Pick<AppUser, "uid" | "name">;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const [clientName, setClientName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [packageKey, setPackageKey] = useState("");
  const [startDate, setStartDate] = useState(isoDay(new Date()));
  const [saving, setSaving] = useState(false);
  const [smm, setSmm] = useState<SmmSaleValue>({
    platforms: [],
    commitments: { poster: 0, ai_ad: 0, real_video: 0 },
    addOns: { ...NO_ADDONS },
    priceMode: "final",
    priceValue: 0,
  });
  /** Once the counts have been set by hand, a package change must not quietly take them back. */
  const [touched, setTouched] = useState(false);

  const pkg = PACKAGE_LIST.find((p) => p.label === packageKey);
  const quote = quoteSmm({
    packageAmount: pkg?.amount || 0,
    addOns: smm.addOns,
    mode: smm.priceMode,
    value: smm.priceValue,
  });

  const choosePackage = (label: string) => {
    setPackageKey(label);
    if (touched) return;
    setSmm((v) => ({
      ...v,
      platforms: platformsForPackage(label),
      commitments: commitmentsForPackage(label, v.addOns),
    }));
  };

  const blockReason =
    !clientName.trim() ? "Who is the client?"
    : !phone.trim() ? "Add their number"
    : quote.finalAmount <= 0 ? "What are they paying?"
    : smm.platforms.length === 0 ? "Pick at least one account"
    : null;

  const save = async () => {
    if (blockReason) { toast({ title: blockReason, variant: "destructive" }); return; }
    setSaving(true);
    try {
      const id = await createDirectCampaign({
        clientName,
        businessName,
        clientPhone: phone,
        packageKey,
        packageLabel: packageKey || "Custom month",
        amount: quote.finalAmount,
        platforms: smm.platforms,
        commitments: smm.commitments,
        startDate,
      }, user);
      toast({ title: "Month started", description: `${businessName.trim() || clientName} is now on the board.` });
      onCreated(id);
    } catch {
      toast({ title: "Not created", description: "Try again.", variant: "destructive" });
      setSaving(false);
    }
  };

  const field = (label: string, value: string, set: (v: string) => void, test: string, placeholder: string, type = "text") => (
    <div>
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        data-test={test}
        placeholder={placeholder}
        onChange={(e) => set(e.target.value)}
        className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => !saving && onClose()}>
      <div
        data-test="smm-new-campaign"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-4 shadow-2xl sm:max-w-lg sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-foreground">Start a month</h3>
            <p className="text-xs text-muted-foreground">
              For a client who came to us directly, with no sale behind them.
            </p>
          </div>
          <button onClick={onClose} data-test="smm-new-close" aria-label="Close"
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2.5">
          {field("Client's name", clientName, setClientName, "smm-new-client", "Who we deal with")}
          {field("Business", businessName, setBusinessName, "smm-new-business", "The business we are running (defaults to their name)")}
          {field("WhatsApp number", phone, setPhone, "smm-new-phone", "10-digit number", "tel")}

          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Package</label>
            <select
              value={packageKey}
              data-test="smm-new-package"
              onChange={(e) => choosePackage(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="">Custom — set it below</option>
              {PACKAGE_LIST.map((p) => <option key={p.label} value={p.label}>{packageOptionLabel(p)}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Month runs from</label>
            <input
              type="date"
              value={startDate}
              data-test="smm-new-start"
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="mt-3 border-t border-border pt-3">
          {/* The same accounts / content / price boxes a sales member fills in. One implementation. */}
          <SmmSaleFields
            packageAmount={pkg?.amount || 0}
            value={smm}
            onChange={(next) => { setTouched(true); setSmm(next); }}
          />
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={onClose} disabled={saving}
            className="flex-1 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !!blockReason}
            data-test="smm-new-save"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {saving ? "Starting…" : blockReason || "Start the month"}
          </button>
        </div>
      </div>
    </div>
  );
}

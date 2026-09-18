/**
 * What a social-media month is actually being sold as — asked on the call, where it is agreed.
 *
 * ── Why the sale form is the right place for all of this ──────────────────────────────────────
 * Which accounts we handle, how many posters and ads a month owes, and how many of the client's own
 * videos we agreed to edit: every one of those is settled in the same two-minute conversation as
 * the price, and every one of them is what the client will hold us to four weeks later. Captured
 * anywhere else, it is the tech team guessing days afterwards — and a guess about what was promised
 * is the single most expensive kind of guess in this business.
 *
 * ── Why the price is entered from either end ──────────────────────────────────────────────────
 * The quote is ₹22,000, the client says ₹18,000, and ₹18,000 is what gets written down. Nobody
 * negotiated "₹4,000 off"; that is arithmetic done after the fact, and asking a member to do it on
 * a call with a client waiting is asking for a wrong price. So both boxes are offered and they are
 * the same number from two ends — see utils/smmPricing.
 */
import type { LucideIcon } from "lucide-react";
import { Instagram, Facebook, Youtube, Linkedin, Video, Image as ImageIcon, Sparkles, Hash } from "lucide-react";
import { formatCurrency } from "@/utils/formatters";
import {
  SMM_REAL_VIDEO_RATE, quoteSmm, valueForMode, type SmmAddOns, type SmmPriceMode,
} from "@/utils/smmPricing";
import { SMM_CONTENT_KINDS, SMM_PLATFORMS, type SmmContentKind, type SmmPlatform } from "@/types/smm";
import FieldHint from "@/components/common/FieldHint";

const PLATFORM_ICON: Record<SmmPlatform, LucideIcon> = {
  instagram: Instagram,
  facebook: Facebook,
  youtube: Youtube,
  linkedin: Linkedin,
  x: Hash,
};

const KIND_ICON: Record<SmmContentKind, LucideIcon> = {
  poster: ImageIcon,
  ai_ad: Sparkles,
  real_video: Video,
};

export interface SmmSaleValue {
  platforms: SmmPlatform[];
  commitments: Record<SmmContentKind, number>;
  addOns: SmmAddOns;
  priceMode: SmmPriceMode;
  priceValue: number;
}

export default function SmmSaleFields({ packageAmount, value, onChange }: {
  /** The package's own price. The add-ons are added to it here. */
  packageAmount: number;
  value: SmmSaleValue;
  onChange: (next: SmmSaleValue) => void;
}) {
  const quote = quoteSmm({
    packageAmount,
    addOns: value.addOns,
    mode: value.priceMode,
    value: value.priceValue,
  });

  const set = (patch: Partial<SmmSaleValue>) => onChange({ ...value, ...patch });

  const togglePlatform = (p: SmmPlatform) => {
    const has = value.platforms.includes(p);
    set({ platforms: has ? value.platforms.filter((x) => x !== p) : [...value.platforms, p] });
  };

  const setCommitment = (kind: SmmContentKind, n: number) =>
    set({ commitments: { ...value.commitments, [kind]: Math.max(0, Math.floor(n) || 0) } });

  /**
   * Switching units re-reads the SAME price in the new one, instead of reinterpreting the old
   * digits. Without it, "₹4,000 off" becomes "4,000% off" the moment somebody taps Percent.
   */
  const switchMode = (mode: SmmPriceMode) => set({ priceMode: mode, priceValue: valueForMode(quote, mode) });

  const realVideos = value.addOns.realVideos || 0;

  return (
    <div className="space-y-3" data-test="smm-sale-fields">
      {/* ── Accounts ─────────────────────────────────────────────────────────────────────── */}
      <div>
        <label className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          Accounts we will handle
          <FieldHint text="Tick every account the client is paying us to run. It is read back to them in their confirmation, so nobody can be told later that YouTube was included when it was not." />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {SMM_PLATFORMS.map(({ key, label }) => {
            const Icon = PLATFORM_ICON[key];
            const on = value.platforms.includes(key);
            return (
              <button
                key={key}
                type="button"
                data-test={`smm-platform-${key}`}
                aria-pressed={on}
                onClick={() => togglePlatform(key)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  on
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── What the month owes ──────────────────────────────────────────────────────────── */}
      <div>
        <label className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          Committed content
          <FieldHint text="How many of each the month owes. Pre-filled from the package — change it if you agreed something different on the call, because this is what the tech team will be held to." />
        </label>
        <div className="space-y-1.5">
          {SMM_CONTENT_KINDS.map(({ key, label }) => {
            const Icon = KIND_ICON[key];
            const addOnLine = key === "real_video";
            return (
              <div key={key} className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5">
                <Icon size={14} className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 text-xs text-foreground">
                  {label}
                  {addOnLine && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      editing + posting · {formatCurrency(SMM_REAL_VIDEO_RATE)} each
                    </span>
                  )}
                </span>
                <input
                  type="number"
                  min={0}
                  data-test={`smm-count-${key}`}
                  value={addOnLine ? realVideos : value.commitments[key] || 0}
                  onChange={(e) => {
                    const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                    // Real videos are an add-on: the count IS the quantity sold, so it drives the
                    // price as well as the plan. Keeping them as one number means the two can never
                    // disagree about how many were promised.
                    if (addOnLine) {
                      onChange({
                        ...value,
                        addOns: { ...value.addOns, realVideos: n },
                        commitments: { ...value.commitments, real_video: n },
                      });
                    } else {
                      setCommitment(key, n);
                    }
                  }}
                  className="h-7 w-16 rounded-md border border-border bg-card px-2 text-right font-mono text-xs text-foreground outline-none focus:border-primary"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Price ────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-background p-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Package</span>
          <span className="font-mono text-foreground">{formatCurrency(quote.packageAmount)}</span>
        </div>
        {quote.addOnAmount > 0 && (
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {realVideos} real video{realVideos === 1 ? "" : "s"} × {formatCurrency(SMM_REAL_VIDEO_RATE)}
            </span>
            <span className="font-mono text-foreground">{formatCurrency(quote.addOnAmount)}</span>
          </div>
        )}
        <div className="mt-1 flex items-center justify-between border-t border-border/60 pt-1 text-xs">
          <span className="font-medium text-foreground">Quoted</span>
          <span data-test="smm-gross" className="font-mono font-semibold text-foreground">
            {formatCurrency(quote.grossAmount)}
          </span>
        </div>

        <div className="mt-2.5">
          <label className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            After bargaining
            <FieldHint text="Type whichever one the client actually said. If they agreed a price, type the price — the discount works itself out. If you agreed an amount off, type that instead." />
          </label>
          <div className="flex gap-1.5">
            {([
              { key: "final" as const, label: "They pay" },
              { key: "amount" as const, label: "₹ off" },
              { key: "percent" as const, label: "% off" },
            ]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                data-test={`smm-price-mode-${key}`}
                aria-pressed={value.priceMode === key}
                onClick={() => switchMode(key)}
                className={`flex-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                  value.priceMode === key
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="number"
            min={0}
            data-test="smm-price-input"
            value={value.priceValue || ""}
            placeholder={value.priceMode === "final" ? "Price the client committed to" : value.priceMode === "percent" ? "Percent off" : "Rupees off"}
            onChange={(e) => set({ priceValue: Number(e.target.value) || 0 })}
            className="mt-1.5 h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>

        <div className="mt-2 flex items-center justify-between rounded-md bg-primary/10 px-2.5 py-1.5">
          <span className="text-xs font-medium text-primary">Client pays</span>
          <span data-test="smm-final" className="font-mono text-sm font-bold text-primary">
            {formatCurrency(quote.finalAmount)}
          </span>
        </div>
        {quote.discountAmount > 0 && (
          <p data-test="smm-discount-line" className="mt-1 text-[11px] text-muted-foreground">
            {formatCurrency(quote.discountAmount)} off — {quote.discountPercent}% of the quoted price
          </p>
        )}
      </div>
    </div>
  );
}

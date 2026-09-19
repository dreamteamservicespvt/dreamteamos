/**
 * The two pots of money on a month that are not the retainer itself.
 *
 * ── The ad budget ────────────────────────────────────────────────────────────────────────────
 * The client funds the advertising, and they fund it the way suits them — a week at a time, or
 * ₹500 on the day an ad is running. Either way the campaign stops dead when it runs out, and the
 * person who usually discovers that is the client. So what they have put in and what the ads have
 * spent are kept side by side, and the app says out loud when tomorrow is not covered.
 *
 * ── Extra work ───────────────────────────────────────────────────────────────────────────────
 * Work beyond the package used to be done, delivered, and forgotten by the time anybody could bill
 * for it. Here it is a list with two buttons: charged, or given. "Given" is a real answer and gets
 * its own button, because deciding out loud to do something for free is worth far more at renewal
 * than an invoice nobody sent.
 */
import { useState } from "react";
import {
  Loader2, Plus, Trash2, AlertTriangle, Gift, Receipt, Send, Upload, Image as ImageIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { attachMetaProof, removeBudgetPayment, setExtraCharge } from "@/services/smm";
import { uploadToCloudinary } from "@/services/cloudinary";
import SmmBudgetPaymentForm from "@/components/smm/SmmBudgetPaymentForm";
import { formatCurrency } from "@/utils/formatters";
import { budgetLedger, extraWork, isoDay, paymentProofs } from "@/utils/smmPlan";
import { budgetTopUpMessage, extraWorkMessage } from "@/utils/smmMessages";
import { SMM_CONTENT_KINDS, type SmmCampaign } from "@/types/smm";

export default function SmmMoneyPanel({ campaign, canEdit, actorName, actorUid, onMessage }: {
  campaign: SmmCampaign;
  canEdit: boolean;
  actorName: string;
  actorUid: string;
  onMessage: (text: string) => void;
}) {
  const { toast } = useToast();
  const today = isoDay(new Date());
  const ledger = budgetLedger(campaign, today);
  const extras = extraWork(campaign.items);
  const [adding, setAdding] = useState(false);
  /** The payment whose "us to Meta" screenshot is uploading right now. */
  const [forwarding, setForwarding] = useState<string | null>(null);
  /** The seller owns the money conversation — see the note on the extra-work notification. */
  const isSeller = campaign.soldBy === actorUid;

  /** Epoch ms from whichever timestamp shape a payment happens to carry. */
  const paymentMs = (at: unknown): number => {
    const t = at as { toMillis?: () => number; seconds?: number } | null;
    if (!t) return 0;
    if (typeof t.toMillis === "function") return t.toMillis();
    return typeof t.seconds === "number" ? t.seconds * 1000 : 0;
  };

  /** "19 Sept 2026, 6:05 pm" — the day and the time the money moved. */
  const stampLabel = (at: unknown): string => {
    const ms = paymentMs(at);
    if (!ms) return "date not recorded";
    return new Date(ms).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <div data-test="smm-money-panel" className="max-w-3xl space-y-4">
      {/* ── Ad budget ────────────────────────────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Client's ad budget</h3>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Put in", value: ledger.funded },
            { label: "Spent", value: ledger.spent },
            { label: "Left", value: ledger.balance },
            { label: "With us", value: ledger.heldByUs },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-border bg-card p-2.5 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
              <p
                data-test={`smm-budget-${label.toLowerCase().replace(/\s/g, "-")}`}
                className={`mt-0.5 font-mono text-sm font-semibold ${
                  label === "Left" && ledger.balance < 0 ? "text-destructive"
                  : label === "With us" && ledger.heldByUs > 0 ? "text-warning"
                  : "text-foreground"
                }`}
              >
                {formatCurrency(value)}
              </p>
            </div>
          ))}
        </div>

        {ledger.short && (
          <div data-test="smm-budget-short" className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
            <AlertTriangle size={14} className="shrink-0" />
            <span className="flex-1">
              Tomorrow's campaigns need {formatCurrency(ledger.nextDayNeed)} and only {formatCurrency(Math.max(0, ledger.balance))} is left.
            </span>
            <button
              data-test="smm-budget-ask"
              onClick={() => onMessage(budgetTopUpMessage(campaign, today))}
              className="inline-flex items-center gap-1 rounded-md bg-destructive px-2 py-1 text-[11px] font-medium text-white hover:bg-destructive/90"
            >
              <Send size={10} /> Ask for a top-up
            </button>
          </div>
        )}

        {/* Paid to us but not yet proved as forwarded — their money, in our account, doing nothing. */}
        {ledger.heldByUs > 0 && (
          <div data-test="smm-budget-held" className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning">
            <AlertTriangle size={14} className="shrink-0" />
            <span className="flex-1">
              <strong>{formatCurrency(ledger.heldByUs)}</strong> was paid to us and has no proof of
              reaching the ad account yet
              {ledger.awaitingForward.length > 1 ? ` (${ledger.awaitingForward.length} payments)` : ""}.
            </span>
          </div>
        )}

        {canEdit && (
          adding
            ? <SmmBudgetPaymentForm campaignId={campaign.id} actor={{ uid: actorUid, name: actorName }} onDone={() => setAdding(false)} />
            : (
              <button
                data-test="smm-budget-open"
                onClick={() => setAdding(true)}
                className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Plus size={13} /> Record a payment
              </button>
            )
        )}

        {campaign.budgetPayments.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {/* Newest money first. Insertion order is not date order once anybody back-dates a
                payment, and a ledger that jumps about is one nobody can reconcile against a bank
                statement. */}
            {[...campaign.budgetPayments]
              .sort((a, b) => paymentMs(b.at) - paymentMs(a.at))
              .map((p) => {
              const proofs = paymentProofs(p);
              const viaUs = p.route === "via_us";
              const toForward = viaUs && !p.metaProofUrl;
              return (
                <li
                  key={p.id}
                  data-test="smm-payment-row"
                  className={`rounded-md border px-2.5 py-2 text-xs ${toForward ? "border-warning/40 bg-warning/5" : "border-border bg-card"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold text-foreground">{formatCurrency(p.amount)}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {stampLabel(p.at)}
                        {p.method ? ` · ${p.method}` : ""}
                        {` · ${p.byName}`}
                      </p>
                      {p.note && <p className="mt-0.5 text-[11px] italic text-muted-foreground">{p.note}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${viaUs ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}`}>
                        {viaUs ? "Paid to us" : "Paid Meta directly"}
                      </span>
                      {canEdit && (
                        <button
                          onClick={() => removeBudgetPayment(campaign.id, p.id)}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Remove this payment"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {proofs.map((pr) => (
                      <a
                        key={pr.label}
                        href={pr.url}
                        target="_blank"
                        rel="noreferrer"
                        data-test="smm-payment-proof"
                        className="inline-flex h-6 items-center gap-1 rounded border border-border px-2 text-[10px] text-foreground transition-colors hover:bg-accent"
                      >
                        <ImageIcon size={10} /> {pr.label}
                      </a>
                    ))}
                    {/* The second leg, added whenever it actually happens — which is rarely the
                        same moment the client paid. */}
                    {toForward && canEdit && (
                      <label
                        data-test={`smm-forward-proof-${p.id}`}
                        className="inline-flex h-6 cursor-pointer items-center gap-1 rounded border border-warning/50 bg-warning/10 px-2 text-[10px] font-medium text-warning transition-colors hover:bg-warning/20"
                      >
                        {forwarding === p.id ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />}
                        {forwarding === p.id ? "Uploading…" : "Add us → Meta proof"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            setForwarding(p.id);
                            try {
                              await attachMetaProof(campaign.id, p.id, await uploadToCloudinary(f));
                              toast({ title: "Forwarded", description: "Marked as paid on to Meta." });
                            } catch {
                              toast({ title: "Upload failed", description: "Try again.", variant: "destructive" });
                            } finally {
                              setForwarding(null);
                            }
                          }}
                        />
                      </label>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

      </section>

      {/* ── Extra work ───────────────────────────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">
          Extra work <span className="font-normal text-muted-foreground">beyond the package</span>
        </h3>

        {extras.items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            None this month.
          </p>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap gap-3 text-xs">
              <span className="text-muted-foreground">To settle: <strong className="text-warning">{extras.unbilled}</strong></span>
              <span className="text-muted-foreground">Charged: <strong className="text-foreground">{formatCurrency(extras.billedAmount)}</strong></span>
              <span className="text-muted-foreground">Given free: <strong className="text-foreground">{extras.freeCount}</strong></span>
            </div>
            <ul className="space-y-1.5">
              {extras.items.map((item) => {
                const kind = SMM_CONTENT_KINDS.find((k) => k.key === item.kind)?.singular || item.kind;
                const settled = item.extraCharge === "billed" || item.extraCharge === "free";
                return (
                  <li key={item.id} data-test="smm-extra-row" className="rounded-lg border border-border bg-card p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">{item.title || "Untitled"}</p>
                        <p className="text-[11px] text-muted-foreground">{kind}{item.uploadDate ? ` · ${item.uploadDate}` : ""}</p>
                      </div>
                      {settled && (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${item.extraCharge === "free" ? "bg-info/15 text-info" : "bg-success/15 text-success"}`}>
                          {item.extraCharge === "free" ? "Free" : formatCurrency(item.extraAmount || 0)}
                        </span>
                      )}
                    </div>

                    {/* Only the seller settles it: it is their client, their conversation, and their
                        commission. Everyone else can see where it stands. */}
                    {isSeller && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          data-test={`smm-extra-amount-${item.id}`}
                          defaultValue={item.extraAmount || ""}
                          placeholder="₹"
                          onBlur={(e) => {
                            const v = Number(e.target.value) || 0;
                            if (v > 0) setExtraCharge(campaign.id, item.id, "billed", v);
                          }}
                          className="h-7 w-20 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
                        />
                        <button
                          data-test={`smm-extra-billed-${item.id}`}
                          onClick={() => setExtraCharge(campaign.id, item.id, "billed", item.extraAmount || 0)}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent"
                        >
                          <Receipt size={10} /> Charged
                        </button>
                        <button
                          data-test={`smm-extra-free-${item.id}`}
                          onClick={() => setExtraCharge(campaign.id, item.id, "free")}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent"
                        >
                          <Gift size={10} /> Given free
                        </button>
                        <button
                          data-test={`smm-extra-tell-${item.id}`}
                          onClick={() => onMessage(extraWorkMessage(campaign, item))}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent"
                        >
                          <Send size={10} /> Tell the client
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

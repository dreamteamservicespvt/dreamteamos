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
import { IndianRupee, Loader2, Plus, Trash2, AlertTriangle, Gift, Receipt, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { addBudgetPayment, removeBudgetPayment, setExtraCharge } from "@/services/smm";
import { formatCurrency } from "@/utils/formatters";
import { budgetLedger, extraWork, isoDay } from "@/utils/smmPlan";
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
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  /** The seller owns the money conversation — see the note on the extra-work notification. */
  const isSeller = campaign.soldBy === actorUid;

  const addPayment = async () => {
    const n = Math.round(Number(amount) || 0);
    if (n <= 0) { toast({ title: "How much?", description: "Enter the amount the client put in.", variant: "destructive" }); return; }
    setBusy("pay");
    try {
      await addBudgetPayment(campaign.id, { amount: n, method: method.trim() || null }, { uid: actorUid, name: actorName });
      setAmount(""); setMethod("");
      toast({ title: "Recorded" });
    } catch {
      toast({ title: "Not saved", description: "Try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div data-test="smm-money-panel" className="max-w-3xl space-y-4">
      {/* ── Ad budget ────────────────────────────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Client's ad budget</h3>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Put in", value: ledger.funded },
            { label: "Spent", value: ledger.spent },
            { label: "Left", value: ledger.balance },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-border bg-card p-2.5 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
              <p
                data-test={`smm-budget-${label.toLowerCase().replace(/\s/g, "-")}`}
                className={`mt-0.5 font-mono text-sm font-semibold ${label === "Left" && ledger.balance < 0 ? "text-destructive" : "text-foreground"}`}
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

        {canEdit && (
          <div className="mt-2 flex gap-2">
            <div className="relative flex-1">
              <IndianRupee size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="number"
                min={0}
                value={amount}
                data-test="smm-budget-amount"
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount the client added"
                className="h-9 w-full rounded-md border border-border bg-background pl-7 pr-2 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
            <input
              value={method}
              data-test="smm-budget-method"
              onChange={(e) => setMethod(e.target.value)}
              placeholder="How"
              className="h-9 w-24 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
            />
            <button
              onClick={addPayment}
              disabled={busy === "pay"}
              data-test="smm-budget-add"
              className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy === "pay" ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add
            </button>
          </div>
        )}

        {campaign.budgetPayments.length > 0 && (
          <ul className="mt-2 space-y-1">
            {[...campaign.budgetPayments].reverse().map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
                <span className="text-foreground">
                  {formatCurrency(p.amount)}
                  {p.method ? <span className="text-muted-foreground"> · {p.method}</span> : null}
                  <span className="text-muted-foreground"> · {p.byName}</span>
                </span>
                {canEdit && (
                  <button
                    onClick={() => removeBudgetPayment(campaign.id, p.id)}
                    /* Same as the ad table's pencil: the glyph is 12px, the target is 28px. */
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Remove this payment"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </li>
            ))}
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

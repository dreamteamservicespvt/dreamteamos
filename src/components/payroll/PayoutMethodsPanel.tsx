import { useEffect, useState } from "react";
import { Banknote, Check, Loader2, Plus, ShieldCheck, Smartphone, Star, Trash2 } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import {
  accountSummary, isAccountComplete, removePayoutAccount, setPrimaryPayoutAccount, watchEmployeeBank,
} from "@/services/payroll";
import BankDetailsModal from "./BankDetailsModal";
import { PAYOUT_METHOD_LABELS, type EmployeeBank, type PayoutAccount } from "@/types/payroll";

/**
 * Payout methods, managed from the employee's own profile.
 *
 * An employee can keep several ways to be paid — a UPI id, a wallet, a bank account — and mark
 * one as primary; that's the one payroll uses. Details stay editable by the employee — they own
 * them — and editing a verified account simply sends it back for re-verification.
 */
export default function PayoutMethodsPanel() {
  const user = useAuthStore(s => s.user);
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const [bank, setBank] = useState<EmployeeBank | null>(null);
  const [editing, setEditing] = useState<PayoutAccount | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    return watchEmployeeBank(user.uid, setBank);
  }, [user?.uid]);

  const accounts = bank?.accounts ?? [];

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (account: PayoutAccount) => { setEditing(account); setModalOpen(true); };

  const handleSetPrimary = async (account: PayoutAccount) => {
    if (!user || !bank) return;
    setBusyId(account.id);
    try {
      await setPrimaryPayoutAccount(user.uid, bank, account.id, { uid: user.uid, name: user.name });
      toast({ title: "Primary updated", description: `Salary will go to ${accountSummary(account)}.` });
    } catch {
      toast({ title: "Could not update", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (account: PayoutAccount) => {
    if (!user || !bank) return;
    const { confirmed } = await confirm({
      title: "Remove this payout method?",
      description: `${accountSummary(account)} will be deleted.${
        account.isPrimary && accounts.length > 1 ? " Another account will become primary." : ""
      }`,
      confirmText: "Remove",
      variant: "destructive",
    });
    if (!confirmed) return;

    setBusyId(account.id);
    try {
      await removePayoutAccount(user.uid, bank, account.id, { uid: user.uid, name: user.name });
      toast({ title: "Payout method removed" });
    } catch {
      toast({ title: "Could not remove", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      {ConfirmDialog}

      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-display flex items-center gap-2 font-semibold text-foreground">
            <Banknote size={16} /> Payment Methods
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Where your salary is sent. Add as many as you like and pick one as primary.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" /> Add method
        </button>
      </header>

      {accounts.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <Banknote size={28} className="mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">No payment methods yet</p>
          <p className="mt-0.5 text-xs text-muted-foreground/70">
            Add one so your salary can be transferred on payday.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {accounts.map(account => {
            const busy = busyId === account.id;
            const incomplete = !isAccountComplete(account);
            const Icon = account.method === "bank_transfer" ? Banknote : Smartphone;

            return (
              <div key={account.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  account.isPrimary ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`}>
                  <Icon className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">
                      {PAYOUT_METHOD_LABELS[account.method]}
                    </span>
                    {account.isPrimary && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        <Star className="h-2.5 w-2.5" /> Primary
                      </span>
                    )}
                    {account.verified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                        <ShieldCheck className="h-2.5 w-2.5" /> Verified
                      </span>
                    )}
                    {incomplete && (
                      <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                        Incomplete
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{accountSummary(account)}</p>
                  <p className="text-[11px] text-muted-foreground/70">{account.accountHolderName}</p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {!account.isPrimary && (
                    <button
                      onClick={() => handleSetPrimary(account)} disabled={busy}
                      title="Send salary here"
                      className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Make primary"}
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(account)}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleRemove(account)} disabled={busy}
                    aria-label="Remove payment method"
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {accounts.some(a => a.verified) && (
        <p className="border-t border-border bg-accent/20 px-5 py-3 text-[11px] leading-relaxed text-muted-foreground">
          <Check className="mr-1 inline h-3 w-3 text-success" />
          Verified means your admin has checked these details. You can still edit them any time —
          changes just get re-verified before your next payout.
        </p>
      )}

      <BankDetailsModal
        open={modalOpen}
        bank={bank}
        account={editing}
        onClose={() => { setModalOpen(false); setEditing(null); }}
      />
    </section>
  );
}

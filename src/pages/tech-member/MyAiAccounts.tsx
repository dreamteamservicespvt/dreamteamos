import { useMemo, useState } from "react";
import { KeyRound, Loader2, Plus, Zap } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useFlowAccounts, useFlowSettings, useFlowUsage, usePaidAccounts } from "@/hooks/useAiAccounts";
import FlowAccountsList, { type FlowAccountAction } from "@/components/ai-accounts/FlowAccountsList";
import FlowAccountDialog from "@/components/ai-accounts/FlowAccountDialog";
import CreditUsageDialog from "@/components/ai-accounts/CreditUsageDialog";
import CreditCalculator from "@/components/ai-accounts/CreditCalculator";
import TargetCard from "@/components/ai-accounts/TargetCard";
import UsageList from "@/components/ai-accounts/UsageList";
import PaidAccountsPanel from "@/components/ai-accounts/PaidAccountsPanel";
import { buttonClass, fieldClass } from "@/components/ai-accounts/AiModal";
import { deleteFlowUsage, setActiveFlowAccount } from "@/services/aiAccounts";
import type { FlowAccount, FlowUsageEntry } from "@/types/aiAccounts";
import { accountState, targetProgress, todayStr } from "@/utils/flowCredits";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";

/**
 * My AI Accounts — a tech member's Flow accounts and paid logins.
 *
 * They add each Google Pro (Jio) account they open — email, password, the phone it logs in with and the
 * day it was made — and see how far they are toward the target. They mark the account they are using
 * now; every ad's credits are charged to it when the ad is marked complete, and when it runs out they
 * pick the next. Accounts an admin or leader assigned to them appear here too, saying so.
 */
export default function MyAiAccounts() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const settings = useFlowSettings();
  const { accounts, loading } = useFlowAccounts(user);
  const { accounts: paid } = usePaidAccounts(user);
  const today = todayStr();
  const [month, setMonth] = useState(today.slice(0, 7));
  const { entries } = useFlowUsage(user, month);
  const [dialog, setDialog] = useState<{ kind: "add" } | { kind: "edit"; account: FlowAccount } | { kind: "usage"; entry?: FlowUsageEntry } | null>(null);

  const uid = user?.uid || "";
  const held = useMemo(() => accounts.filter((a) => a.holderId === uid), [accounts, uid]);
  const owned = accounts.filter((a) => a.ownerId === uid).length;
  const progress = targetProgress(owned, settings, today);
  const states = held.map((a) => accountState(a, today));
  const left = states.filter((s) => s.usable).reduce((sum, s) => sum + s.remaining, 0);
  const used = states.reduce((sum, s) => sum + s.used, 0);
  const active = held.find((a) => a.id === user?.activeFlowAccountId);
  const activeState = active ? accountState(active, today) : null;

  if (!user) return null;

  const onAction = async (action: FlowAccountAction, account: FlowAccount) => {
    if (action === "use") {
      try { await setActiveFlowAccount(user.uid, account.id); toast({ title: "Using this account now", description: account.email }); }
      catch { toast({ title: "Could not switch accounts", variant: "destructive" }); }
    }
    if (action === "edit") setDialog({ kind: "edit", account });
  };

  const removeEntry = async (entry: FlowUsageEntry) => {
    const { confirmed } = await confirm({ title: "Delete this credit entry?", description: `${entry.credits} credits go back to ${entry.accountEmail}.`, confirmText: "Delete", variant: "destructive" });
    if (!confirmed) return;
    try { await deleteFlowUsage(entry); toast({ title: "Entry deleted" }); } catch { toast({ title: "Could not delete it", variant: "destructive" }); }
  };

  return (
    <div className="space-y-5 min-w-0">
      {ConfirmDialog}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-lg md:text-2xl font-bold text-foreground flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /> My AI Accounts</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-1">Your Flow accounts and their credits, and the paid accounts assigned to you.</p>
        </div>
        <button className={buttonClass.primary} onClick={() => setDialog({ kind: "add" })} data-test="flow-add"><Plus className="h-4 w-4" /> Add Flow account</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-3">
            <TargetCard progress={progress} deadline={settings.deadline} dailyTarget={settings.dailyTarget} />
            <div className="bg-card border border-border rounded-xl p-4 min-w-0" data-test="using-now">
              <div className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /><h3 className="font-display text-sm font-semibold text-foreground">Using now</h3></div>
              {active && activeState ? (
                <>
                  <p className="mt-2 font-mono text-sm font-semibold text-foreground truncate" title={active.email}>{active.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground"><b className={activeState.remaining > 0 ? "text-success" : "text-destructive"}>{activeState.remaining}</b> of {activeState.monthly} credits left this cycle</p>
                  {!activeState.usable ? <p className="mt-2 text-xs text-destructive">This account is {activeState.expired ? "expired" : "out of credits"} — choose your next one below.</p>
                    : activeState.remaining < settings.clipCredits[8]
                      ? <p className="mt-2 text-xs text-warning" data-test="using-now-low">Not enough left for an 8-second clip — switch to your next account.</p> : null}
                </>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">No account chosen. Tap <b>I'm using this now</b> on the account you are generating with.</p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[{ label: "Accounts", value: held.length }, { label: "Credits left", value: left, test: "my-left" }, { label: "Used", value: used }].map((c) => (
                <div key={c.label} className="bg-card border border-border rounded-xl p-3 min-w-0 flex flex-col justify-center">
                  <p className="text-[11px] text-muted-foreground truncate">{c.label}</p>
                  <p className="font-display text-xl font-bold text-foreground" data-test={c.test}>{c.value}</p>
                </div>
              ))}
            </div>
          </div>

          <section className="space-y-3">
            <h2 className="font-display text-base font-semibold text-foreground">My Flow accounts</h2>
            <FlowAccountsList accounts={accounts} viewerId={user.uid} activeId={user.activeFlowAccountId} manager={false} onAction={onAction}
              emptyText="No accounts yet — add each Google Pro account as you create it." />
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-foreground">Credits I recorded</h2>
              <div className="flex gap-2">
                <input type="month" className={`${fieldClass} w-40`} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
                <button className={buttonClass.ghost} onClick={() => setDialog({ kind: "usage" })} data-test="usage-record"><Plus className="h-4 w-4" /> Record credits</button>
              </div>
            </div>
            <UsageList entries={entries} viewerId={user.uid} manager={false} showUser={false} onEdit={(entry) => setDialog({ kind: "usage", entry })} onDelete={removeEntry} />
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-base font-semibold text-foreground">Paid accounts assigned to me</h2>
            <PaidAccountsPanel accounts={paid} manager={false} actor={user} people={[]} />
          </section>

          <CreditCalculator settings={settings} initialCredits={left} />
        </>
      )}

      <FlowAccountDialog open={dialog?.kind === "add" || dialog?.kind === "edit"} onClose={() => setDialog(null)} actor={user} settings={settings}
        account={dialog?.kind === "edit" ? dialog.account : null} />
      <CreditUsageDialog
        open={dialog?.kind === "usage"}
        onClose={() => setDialog(null)}
        actor={user}
        settings={settings}
        accounts={dialog?.kind === "usage" && dialog.entry ? accounts : held}
        activeId={user.activeFlowAccountId}
        mode={dialog?.kind === "usage" && dialog.entry ? "edit" : "manual"}
        entry={dialog?.kind === "usage" ? dialog.entry : null}
        onDone={({ credits }) => { setDialog(null); toast({ title: "Credits saved", description: `${credits} credits` }); }}
      />
    </div>
  );
}

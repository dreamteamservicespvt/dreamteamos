import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, ClipboardPaste, KeyRound, Loader2, Plus, Settings2, X } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useFlowAccounts, useFlowSettings, useFlowUsage, useGeminiApiKeys, usePaidAccounts, useTechTeam } from "@/hooks/useAiAccounts";
import FlowAccountsList, { type FlowAccountAction } from "@/components/ai-accounts/FlowAccountsList";
import FlowAccountDialog, { prettyDate } from "@/components/ai-accounts/FlowAccountDialog";
import PasteAccountsDialog from "@/components/ai-accounts/PasteAccountsDialog";
import AssignDialog from "@/components/ai-accounts/AssignDialog";
import CreditUsageDialog from "@/components/ai-accounts/CreditUsageDialog";
import CreditCalculator from "@/components/ai-accounts/CreditCalculator";
import UsageList from "@/components/ai-accounts/UsageList";
import PaidAccountsPanel from "@/components/ai-accounts/PaidAccountsPanel";
import ApiKeyDialog from "@/components/ai-accounts/ApiKeyDialog";
import ApiKeysPanel from "@/components/ai-accounts/ApiKeysPanel";
import ProProofDialog from "@/components/ai-accounts/ProProofDialog";
import ProProofPanel, { ProProofReviewDialog } from "@/components/ai-accounts/ProProofPanel";
import AiModal, { buttonClass, fieldClass } from "@/components/ai-accounts/AiModal";
import {
  assignFlowAccount, deleteFlowAccount, deleteFlowUsage, moveFlowAccounts, saveFlowSettings, setActiveFlowAccount, updateFlowAccount, type Person,
} from "@/services/aiAccounts";
import { FLOW_CLIP_SECONDS, type FlowAccount, type FlowSettings, type FlowUsageEntry } from "@/types/aiAccounts";
import { isDate, memberSummaries, teamAdminIdOf, teamTotals, todayStr } from "@/utils/flowCredits";
import { canSeeAllApiKeys } from "@/utils/geminiKeys";
import { memberProProofRows, proProofCounts } from "@/utils/proProof";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { cn } from "@/lib/utils";

type Tab = "overview" | "flow" | "proof" | "usage" | "paid" | "keys";

const STATUS_TONE: Record<string, string> = {
  done: "bg-success/15 text-success", ahead: "bg-success/15 text-success", on_track: "bg-info/15 text-info",
  behind: "bg-warning/20 text-foreground", missed: "bg-destructive/15 text-destructive",
};
const STATUS_LABEL: Record<string, string> = { done: "Done", ahead: "Ahead", on_track: "On track", behind: "Behind", missed: "Missed" };

/**
 * AI Accounts — for the tech admin and team leaders: every Flow account the team has (who opened it,
 * who uses it, what is left this month), each member against the account target, the credits every ad
 * used, the paid ChatGPT / Grok logins and who has them, and the numbers behind all of it. The tech admin
 * alone also has "API keys" (2026-10-10): every Gemini key the team made in its Flow accounts, by person,
 * to copy, download as a .env for Vercel, check, and mark in use.
 */
export default function AiAccounts() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const settings = useFlowSettings();
  const { accounts, loading } = useFlowAccounts(user);
  const { accounts: paid } = usePaidAccounts(user);
  const { people } = useTechTeam(teamAdminIdOf(user));
  const today = todayStr();
  const [tab, setTab] = useState<Tab>("overview");
  const [month, setMonth] = useState(today.slice(0, 7));
  const { entries } = useFlowUsage(user, month);
  const [memberFilter, setMemberFilter] = useState("");
  // The tech admin's "Move to" (2026-10-23): ticked accounts, the person they go to, one click.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [moveTo, setMoveTo] = useState("");
  const [moving, setMoving] = useState(false);
  const [dialog, setDialog] = useState<{ kind: "add" } | { kind: "paste" } |{ kind: "edit" | "assign"; account: FlowAccount } | { kind: "usage"; entry?: FlowUsageEntry } | { kind: "settings" } | { kind: "apiKey"; accountId: string } | { kind: "proof"; accountId: string } | { kind: "proofReview"; accountId: string } | null>(null);
  const keyAdmin = canSeeAllApiKeys(user);
  // The keys themselves are read only while their tab is open (one read per key).
  const { keys, loading: keysLoading } = useGeminiApiKeys(teamAdminIdOf(user), keyAdmin && tab === "keys");

  const persons: Person[] = useMemo(() => people.map((p) => ({ uid: p.uid, name: p.name, role: p.role })), [people]);
  const members = useMemo(() => people.filter((p) => p.role === "tech_member"), [people]);
  const summaries = useMemo(() => memberSummaries(accounts, members, settings, today), [accounts, members, settings, today]);
  const totals = useMemo(() => teamTotals(accounts, today), [accounts, today]);
  const backups = accounts.filter((a) => !members.some((m) => m.uid === a.ownerId)).length;
  const shownAccounts = memberFilter ? accounts.filter((a) => a.ownerId === memberFilter || a.holderId === memberFilter) : accounts;
  const keyAccount = dialog?.kind === "apiKey" ? accounts.find((a) => a.id === dialog.accountId) || null : null;
  const keyCount = accounts.filter((a) => a.apiKey).length;
  // Pro proof (2026-10-23): the tab's count is what waits for a check; Overview shows each member's confirmed.
  const proofCounts = useMemo(() => proProofCounts(accounts), [accounts]);
  const proofByOwner = useMemo(() => new Map(memberProProofRows(accounts).map((r) => [r.uid, r])), [accounts]);
  const proofAccount = dialog?.kind === "proof" ? accounts.find((a) => a.id === dialog.accountId) || null : null;
  // Only accounts still in the list (one deleted elsewhere drops out of the selection).
  const selectedAccounts = accounts.filter((a) => selectedIds.includes(a.id));

  if (!user) return null;

  const onAction = async (action: FlowAccountAction, account: FlowAccount) => {
    try {
      if (action === "use") { await setActiveFlowAccount(user.uid, account.id); toast({ title: "Using this account now", description: account.email }); }
      if (action === "edit") setDialog({ kind: "edit", account });
      if (action === "assign") setDialog({ kind: "assign", account });
      if (action === "apiKey") setDialog({ kind: "apiKey", accountId: account.id });
      if (action === "proof") setDialog({ kind: "proof", accountId: account.id });
      if (action === "proofReview") setDialog({ kind: "proofReview", accountId: account.id });
      if (action === "toggle") {
        await updateFlowAccount(account, { status: account.status === "disabled" ? "active" : "disabled" }, user, settings);
        toast({ title: account.status === "disabled" ? "Account enabled" : "Account disabled" });
      }
      if (action === "delete") {
        const { confirmed } = await confirm({ title: "Delete this Flow account?", description: `${account.email}, its password and its API key are removed. Its credit entries stay as history.`, confirmText: "Delete", variant: "destructive" });
        if (confirmed) { await deleteFlowAccount(account); toast({ title: "Account deleted" }); }
      }
    } catch (err) {
      toast({ title: "That did not work", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    }
  };

  const moveSelected = async () => {
    const to = persons.find((p) => p.uid === moveTo);
    if (!to || !selectedAccounts.length || moving) return;
    setMoving(true);
    try {
      const n = await moveFlowAccounts(selectedAccounts, to, user);
      toast({ title: n ? `Moved ${n} account${n === 1 ? "" : "s"} to ${to.name}` : `Already ${to.name}'s`, description: n ? "They count toward their target now." : undefined });
      setSelectedIds([]);
      setMoveTo("");
    } catch (err) {
      toast({ title: "Could not move them", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    } finally {
      setMoving(false);
    }
  };

  const removeEntry = async (entry: FlowUsageEntry) => {
    const { confirmed } = await confirm({ title: "Delete this credit entry?", description: `${entry.credits} credits go back to ${entry.accountEmail}.`, confirmText: "Delete", variant: "destructive" });
    if (!confirmed) return;
    try { await deleteFlowUsage(entry); toast({ title: "Entry deleted" }); } catch { toast({ title: "Could not delete it", variant: "destructive" }); }
  };

  // Short labels and tighter padding on a phone, so all of them (six for the tech admin since Pro proof) fit without the row scrolling.
  const TABS: { id: Tab; label: string; short: string }[] = [
    { id: "overview", label: "Overview", short: "Overview" },
    // The tech admin's five tabs drop the counts on a phone (the team's hundreds of accounts would not fit).
    { id: "flow", label: `Flow accounts (${accounts.length})`, short: keyAdmin ? "Flow" : `Flow (${accounts.length})` },
    { id: "proof", label: proofCounts.submitted ? `Pro proof (${proofCounts.submitted} to check)` : "Pro proof", short: proofCounts.submitted ? `Pro (${proofCounts.submitted})` : "Pro" },
    { id: "usage", label: "Credit usage", short: "Usage" },
    { id: "paid", label: `Paid accounts (${paid.length})`, short: keyAdmin ? "Paid" : `Paid (${paid.length})` },
    ...(keyAdmin ? [{ id: "keys" as Tab, label: `API keys (${keyCount})`, short: "Keys" }] : []),
  ];

  return (
    <div className="space-y-5 min-w-0">
      {ConfirmDialog}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-lg md:text-2xl font-bold text-foreground flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /> AI Accounts</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-1">Flow accounts and their credits, the team's account target, and the paid ChatGPT / Grok logins.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={buttonClass.ghost} onClick={() => setDialog({ kind: "settings" })} data-test="flow-settings"><Settings2 className="h-4 w-4" /> Settings</button>
          {keyAdmin ? (
            <button className={buttonClass.ghost} onClick={() => setDialog({ kind: "paste" })} data-test="flow-paste"><ClipboardPaste className="h-4 w-4" /> Paste accounts</button>
          ) : null}
          <button className={buttonClass.primary} onClick={() => setDialog({ kind: "add" })} data-test="flow-add"><Plus className="h-4 w-4" /> Add Flow account</button>
        </div>
      </div>

      {/* overflow-y-hidden: the tabs' -mb-px made the row scroll 1 px down and show a thin scrollbar. */}
      <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-test={`tab-${t.id}`}
            className={cn("shrink-0 px-1.5 sm:px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <span className="sm:hidden">{t.short}</span><span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : tab === "overview" ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: "Flow accounts", value: totals.accounts, sub: `${totals.live} usable${totals.undated ? ` · ${totals.undated} opening day not set` : ""}` },
              // ── Why "cycle", not "month" (2026-10-15) ──
              // These add up each account's CURRENT CYCLE — it runs from the day that account was opened to
              // the day before, every month, so no two accounts' cycles line up. "This month" read as the
              // calendar month, which is what the Credit usage tab lists.
              { label: "Credits per cycle", value: totals.capacity.toLocaleString("en-IN"), sub: `${settings.monthlyCredits} per account, from its opening day` },
              { label: "Used", value: totals.used.toLocaleString("en-IN"), sub: "in each account's current cycle" },
              { label: "Left", value: totals.remaining.toLocaleString("en-IN"), sub: "in each account's current cycle", test: "total-left" },
              { label: "Expiring in 30 days", value: totals.expiringSoon, sub: "renew or replace" },
            ].map((c) => (
              <div key={c.label} className="bg-card border border-border rounded-xl p-3 min-w-0">
                <p className="text-[11px] text-muted-foreground truncate">{c.label}</p>
                <p className="font-display text-xl font-bold text-foreground" data-test={c.test}>{c.value}</p>
                <p className="text-[10px] text-muted-foreground truncate">{c.sub}</p>
              </div>
            ))}
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="font-display text-sm font-semibold text-foreground">Accounts by member</h2>
              <p className="text-[11px] text-muted-foreground">
                Target {settings.targetPerMember} each by {prettyDate(settings.deadline)} ({settings.dailyTarget} a day) · Backup accounts (admin & leaders): <b className="text-foreground">{backups}</b>
              </p>
            </div>
            {summaries.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No tech members in this team yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-test="member-table">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-left font-medium px-4 py-2">Member</th>
                      <th className="text-right font-medium px-2 py-2">Added</th>
                      <th className="text-left font-medium px-2 py-2">Pace</th>
                      <th className="text-right font-medium px-2 py-2">Holding</th>
                      <th className="text-right font-medium px-2 py-2">Used</th>
                      <th className="text-right font-medium px-2 py-2" title="Accounts they opened that carry a working Gemini API key">API keys</th>
                      <th className="text-right font-medium px-2 py-2" title="Accounts they opened that are confirmed Google AI Pro (Pro proof tab)">Pro ✓</th>
                      <th className="text-right font-medium px-4 py-2">Left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.map((s) => (
                      <tr key={s.uid} className="border-t border-border" data-test="member-row">
                        <td className="px-4 py-2 text-foreground truncate max-w-[10rem]">{s.name}</td>
                        <td className="px-2 py-2 text-right tabular-nums"><b>{s.added}</b><span className="text-muted-foreground">/{s.progress.target}</span></td>
                        <td className="px-2 py-2">
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap", STATUS_TONE[s.progress.status])}>{STATUS_LABEL[s.progress.status]}</span>
                          {s.progress.remaining > 0 && s.progress.daysLeft > 0 ? <span className="ml-1 text-[10px] text-muted-foreground whitespace-nowrap">{s.progress.perDayNeeded}/day</span> : null}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{s.holding}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{s.used}</td>
                        <td className="px-2 py-2 text-right tabular-nums" data-test="member-keys">
                          <b className={s.added > 0 && s.apiKeys >= s.added ? "text-success" : "text-foreground"}>{s.apiKeys}</b><span className="text-muted-foreground">/{s.added}</span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums" data-test="member-pro">
                          {(() => { const p = proofByOwner.get(s.uid); const confirmed = p?.confirmed || 0; const total = p?.total || 0;
                            return <><b className={total > 0 && confirmed >= total ? "text-success" : "text-foreground"}>{confirmed}</b><span className="text-muted-foreground">/{total}</span></>; })()}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold text-foreground">{s.remaining}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <CreditCalculator settings={settings} initialCredits={totals.remaining} />
        </div>
      ) : tab === "flow" ? (
        <div className="space-y-3">
          <select className={`${fieldClass} sm:w-64`} value={memberFilter} onChange={(e) => { setMemberFilter(e.target.value); setSelectedIds([]); }} data-test="flow-member-filter">
            <option value="">Everyone's accounts</option>
            {persons.map((p) => <option key={p.uid} value={p.uid}>{p.name}</option>)}
          </select>
          {keyAdmin && selectedAccounts.length ? (
            <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-card p-2 shadow-md" data-test="flow-move-bar">
              <span className="text-sm font-semibold text-foreground">{selectedAccounts.length} selected</span>
              <select className={`${fieldClass} min-w-0 flex-1 sm:flex-none sm:w-56`} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}
                aria-label="Move to" data-test="flow-move-to">
                <option value="">Move to…</option>
                {persons.map((p) => <option key={p.uid} value={p.uid}>{p.name}</option>)}
              </select>
              <button className={buttonClass.primary} onClick={moveSelected} disabled={!moveTo || moving} data-test="flow-move">
                {moving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />} Move
              </button>
              <button className={buttonClass.ghost} onClick={() => setSelectedIds([])} disabled={moving} aria-label="Clear the selection"><X className="h-4 w-4" /></button>
              <p className="basis-full text-[11px] text-muted-foreground">They become the chosen person's accounts — in their target and theirs to use. Credit entries stay as they are.</p>
            </div>
          ) : null}
          <FlowAccountsList accounts={shownAccounts} viewerId={user.uid} activeId={user.activeFlowAccountId} manager keyAdmin={keyAdmin} onAction={onAction}
            selection={keyAdmin ? { ids: selectedIds, onChange: setSelectedIds } : undefined}
            emptyText="No Flow accounts yet. Members add theirs from My AI Accounts; add backups with “Add Flow account”." />
        </div>
      ) : tab === "proof" ? (
        <ProProofPanel accounts={accounts} actor={user} onSend={(a) => setDialog({ kind: "proof", accountId: a.id })} />
      ) : tab === "usage" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input type="month" className={`${fieldClass} w-44`} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} data-test="usage-month"
              aria-label="Calendar month" />
            <button className={buttonClass.ghost} onClick={() => setDialog({ kind: "usage" })} data-test="usage-record"><Plus className="h-4 w-4" /> Record credits</button>
            <p className="basis-full text-[11px] text-muted-foreground" data-test="usage-month-note">
              Entries by the calendar month the clips were made in. An account's own cycle runs from its opening day — each entry says which.
            </p>
          </div>
          <UsageList entries={entries} viewerId={user.uid} manager showUser onEdit={(entry) => setDialog({ kind: "usage", entry })} onDelete={removeEntry} />
        </div>
      ) : tab === "keys" && keyAdmin ? (
        <ApiKeysPanel keys={keys} loading={keysLoading} accounts={accounts} people={persons} actor={user} />
      ) : (
        <PaidAccountsPanel accounts={paid} manager actor={user} people={persons} />
      )}

      <FlowAccountDialog open={dialog?.kind === "add" || dialog?.kind === "edit"} onClose={() => setDialog(null)} actor={user} settings={settings}
        // The LIVE account, not the copy from when Edit was clicked (2026-10-15): credits recorded while the
        // dialog is open lock its creation date at once. The service re-checks it in a transaction.
        account={dialog?.kind === "edit" ? accounts.find((a) => a.id === dialog.account.id) || dialog.account : null}
        owners={persons} accounts={accounts} />
      {keyAdmin ? (
        <PasteAccountsDialog open={dialog?.kind === "paste"} onClose={() => setDialog(null)} actor={user} settings={settings} accounts={accounts} />
      ) : null}
      <ApiKeyDialog open={!!keyAccount} onClose={() => setDialog(null)} account={keyAccount} accounts={accounts} actor={user}
        onSaved={() => setDialog(null)} />
      <ProProofDialog open={!!proofAccount} onClose={() => setDialog(null)} account={proofAccount} accounts={accounts} actor={user}
        onSent={() => setDialog(null)} />
      <ProProofReviewDialog open={dialog?.kind === "proofReview"} ids={dialog?.kind === "proofReview" ? [dialog.accountId] : []} index={0}
        onIndex={(i) => { if (i > 0) setDialog(null); }} accounts={accounts} actor={user} onClose={() => setDialog(null)} />
      <AssignDialog
        open={dialog?.kind === "assign"}
        onClose={() => setDialog(null)}
        title="Assign this Flow account"
        subtitle={dialog?.kind === "assign" ? `${dialog.account.email} — opened by ${dialog.account.ownerName}. It stays in their count.` : ""}
        people={persons}
        selected={dialog?.kind === "assign" ? [dialog.account.holderId] : []}
        onSave={async ([person]) => {
          if (dialog?.kind !== "assign" || !person) return;
          try { await assignFlowAccount(dialog.account, person, user); toast({ title: `Assigned to ${person.name}` }); }
          catch (err) { toast({ title: "Could not assign it", description: err instanceof Error ? err.message : "", variant: "destructive" }); throw err; }
        }}
      />
      <CreditUsageDialog
        open={dialog?.kind === "usage"}
        onClose={() => setDialog(null)}
        actor={user}
        settings={settings}
        accounts={dialog?.kind === "usage" && dialog.entry ? accounts : accounts.filter((a) => a.holderId === user.uid)}
        activeId={user.activeFlowAccountId}
        mode={dialog?.kind === "usage" && dialog.entry ? "edit" : "manual"}
        entry={dialog?.kind === "usage" ? dialog.entry : null}
        onDone={({ credits }) => { setDialog(null); toast({ title: "Credits saved", description: `${credits} credits` }); }}
      />
      <SettingsDialog open={dialog?.kind === "settings"} settings={settings} onClose={() => setDialog(null)} />
    </div>
  );
}

/** The numbers behind every screen: credits per clip, monthly credits, validity and the target. */
function SettingsDialog({ open, settings, onClose }: { open: boolean; settings: FlowSettings; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState<FlowSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setForm(settings); setError(""); } }, [open, settings]);
  const num = (v: string) => Math.max(0, Number(v) || 0);
  const save = async () => {
    // A 0 would be read back as "not set" and quietly replaced by the default (withFlowDefaults).
    const counts = [...FLOW_CLIP_SECONDS.map((sec) => form.clipCredits[sec]), form.monthlyCredits, form.validityMonths, form.targetPerMember, form.dailyTarget];
    if (counts.some((n) => !(n >= 1))) return setError("Every number must be 1 or more.");
    if (!isDate(form.campaignStart) || !isDate(form.deadline) || form.deadline < form.campaignStart) return setError("The deadline must be a date on or after the start.");
    setError("");
    setSaving(true);
    try { await saveFlowSettings(form); toast({ title: "Settings saved" }); onClose(); }
    catch { toast({ title: "Could not save the settings", variant: "destructive" }); }
    finally { setSaving(false); }
  };
  return (
    <AiModal open={open} onClose={onClose} title="Flow settings" subtitle="Changing a rate affects new entries; past entries keep the credits they were saved with." testId="settings-dialog"
      footer={<><button className={buttonClass.ghost} onClick={onClose} disabled={saving}>Cancel</button>
        <button className={buttonClass.primary} onClick={save} disabled={saving} data-test="settings-save">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save</button></>}>
      <div className="grid gap-4">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Credits per clip</p>
          <div className="grid grid-cols-4 gap-2">
            {FLOW_CLIP_SECONDS.map((sec) => (
              <label key={sec} className="block min-w-0">
                <span className="mb-1 block text-[11px] text-muted-foreground">{sec} sec</span>
                <input className={fieldClass} type="number" min={1} value={form.clipCredits[sec]}
                  onChange={(e) => setForm((f) => ({ ...f, clipCredits: { ...f.clipCredits, [sec]: num(e.target.value) } }))} data-test={`settings-rate-${sec}`} />
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="mb-1 block text-[11px] text-muted-foreground">Credits per account per month</span>
            <input className={fieldClass} type="number" min={1} value={form.monthlyCredits} onChange={(e) => setForm((f) => ({ ...f, monthlyCredits: num(e.target.value) }))} /></label>
          <label className="block"><span className="mb-1 block text-[11px] text-muted-foreground">Account validity (months)</span>
            <input className={fieldClass} type="number" min={1} value={form.validityMonths} onChange={(e) => setForm((f) => ({ ...f, validityMonths: num(e.target.value) }))} /></label>
          <label className="block"><span className="mb-1 block text-[11px] text-muted-foreground">Accounts per member (target)</span>
            <input className={fieldClass} type="number" min={1} value={form.targetPerMember} onChange={(e) => setForm((f) => ({ ...f, targetPerMember: num(e.target.value) }))} /></label>
          <label className="block"><span className="mb-1 block text-[11px] text-muted-foreground">Accounts a day (pace)</span>
            <input className={fieldClass} type="number" min={1} value={form.dailyTarget} onChange={(e) => setForm((f) => ({ ...f, dailyTarget: num(e.target.value) }))} /></label>
          <label className="block"><span className="mb-1 block text-[11px] text-muted-foreground">Target starts</span>
            <input className={fieldClass} type="date" value={form.campaignStart} onChange={(e) => setForm((f) => ({ ...f, campaignStart: e.target.value }))} /></label>
          <label className="block"><span className="mb-1 block text-[11px] text-muted-foreground">Deadline</span>
            <input className={fieldClass} type="date" value={form.deadline} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} /></label>
        </div>
        {error ? <p className="text-xs text-destructive" data-test="settings-error">{error}</p> : null}
      </div>
    </AiModal>
  );
}

/**
 * Flow Accounts — the Google AI Pro accounts the team makes videos with, their monthly credits, the
 * 30-account drive, and the shared paid accounts (ChatGPT, Grok).
 *
 * ── One page, two views ─────────────────────────────────────────────────────────────────────────
 * A tech member sees their own: the drive (how many of their 30 they have added, today's two, the
 * deadline), the account they are using now and what it can still make, every account they added or
 * were given, their credit spend, and the paid accounts shared with them. The tech admin and the team
 * leaders manage the whole team's: totals, a credit calculator, each member's progress, every
 * account with who added it and who holds it, assigning and reassigning, the spend log, the paid
 * accounts and the drive's settings. The same components show an account the same way to both.
 */
import { useMemo, useState } from "react";
import {
  KeyRound, Loader2, Plus, Search, Users, Wallet, Zap, AlertTriangle, ShieldCheck, Settings as SettingsIcon, ListChecks,
  BadgeIndianRupee, Pencil, Trash2,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import {
  useFlowAccountList, useFlowCreditLogs, useFlowSettings, useNameOf, usePaidAccounts, useTechTeam,
} from "@/hooks/useFlowAccounts";
import {
  assignFlowAccount, deleteFlowAccount, deletePaidAccount, platformName, saveFlowSettings, setFlowAccountInUse,
  updateFlowAccount, type FlowActor,
} from "@/services/flowAccounts";
import type { FlowAccount, FlowCreditLog, FlowSettings, PaidAccount } from "@/types/flowAccounts";
import {
  CLIP_LENGTHS, accountBalance, clipsSummary, driveProgress, holderOf, isoToday, nextAccountToUse, totalCredits,
} from "@/utils/flowAccounts";
import FlowAccountCard from "@/components/flow/FlowAccountCard";
import FlowAccountDialog from "@/components/flow/FlowAccountDialog";
import FlowCreditsDialog from "@/components/flow/FlowCreditsDialog";
import PaidAccountDialog from "@/components/flow/PaidAccountDialog";
import {
  Chip, CreditBar, CreditCalculator, DriveChip, DriveProgressCard, Field, SecretField, StatCard, buttonCls, formatDay,
  formatMonth, inputCls,
} from "@/components/flow/FlowParts";

type Tab = "mine" | "overview" | "accounts" | "usage" | "paid" | "settings";

const monthOf = (iso: string) => iso.slice(0, 7);
const previousMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

export default function FlowAccounts() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const today = isoToday();
  const settings = useFlowSettings();
  const { accounts, loading, error, manager, teamAdminId } = useFlowAccountList(user);
  const members = useTechTeam(teamAdminId, manager);
  const nameOf = useNameOf(members, accounts);
  const paid = usePaidAccounts(user);
  const [tab, setTab] = useState<Tab>(manager ? "overview" : "mine");
  const [month, setMonth] = useState(monthOf(today));
  const logs = useFlowCreditLogs(user, month);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FlowAccount | null>(null);
  const [logging, setLogging] = useState(false);
  const [editingLog, setEditingLog] = useState<FlowCreditLog | null>(null);
  const [paidEditing, setPaidEditing] = useState<PaidAccount | "new" | null>(null);

  if (!user) return null;
  const actor: FlowActor = { uid: user.uid, name: user.name, role: user.role, createdBy: user.createdBy };
  /** The accounts this person holds — the ones they can make videos on. */
  const held = accounts.filter((a) => holderOf(a) === user.uid);

  const useAccount = async (account: FlowAccount) => {
    try {
      await setFlowAccountInUse({ uid: user.uid, name: user.name }, account.id, held);
      toast({ title: "Using this account now", description: account.email });
    } catch {
      toast({ title: "Couldn't switch", description: "Check your connection and try again.", variant: "destructive" });
    }
  };
  const assign = async (account: FlowAccount, to: { uid: string; name: string; role?: string } | null) => {
    try {
      await assignFlowAccount(account, to, actor);
      toast({ title: to ? `Assigned to ${to.name}` : "Taken back", description: account.email });
    } catch {
      toast({ title: "Couldn't assign", description: "Check your connection and try again.", variant: "destructive" });
    }
  };
  const toggleBlock = async (account: FlowAccount) => {
    const blocking = account.status !== "blocked";
    const { confirmed } = await confirm({
      title: blocking ? "Mark this account blocked?" : "Unblock this account?",
      description: blocking
        ? `${account.email} will be taken out of use — use this when Google has locked or suspended it.`
        : `${account.email} can be used again.`,
      confirmText: blocking ? "Mark blocked" : "Unblock",
      variant: blocking ? "destructive" : "default",
    });
    if (!confirmed) return;
    await updateFlowAccount(account, { status: blocking ? "blocked" : "active" }, actor, settings);
  };
  const remove = async (account: FlowAccount) => {
    const { confirmed } = await confirm({
      title: "Delete this account?",
      description: `${account.email} will be removed from Flow Accounts. Its usage records stay.`,
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      await deleteFlowAccount(account.id);
      toast({ title: "Account deleted", description: account.email });
    } catch {
      toast({ title: "Couldn't delete", variant: "destructive" });
    }
  };

  const tabs: { key: Tab; label: string; icon: JSX.Element }[] = manager
    ? [
        { key: "overview", label: "Overview", icon: <Users size={14} /> },
        { key: "accounts", label: "All accounts", icon: <KeyRound size={14} /> },
        { key: "usage", label: "Credit usage", icon: <ListChecks size={14} /> },
        { key: "paid", label: "Paid accounts", icon: <Wallet size={14} /> },
        { key: "settings", label: "Settings", icon: <SettingsIcon size={14} /> },
      ]
    : [
        { key: "mine", label: "My accounts", icon: <KeyRound size={14} /> },
        { key: "usage", label: "Credit usage", icon: <ListChecks size={14} /> },
        { key: "paid", label: "Paid accounts", icon: <Wallet size={14} /> },
      ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground sm:text-2xl">
            <Zap className="text-primary" size={22} /> Flow Accounts
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {manager
              ? "Every Google AI Pro account the team makes videos with — who added it, who has it, and the credits left this month."
              : "Your Google AI Pro accounts for Flow — add them, use them, and record the credits each ad uses."}
          </p>
        </div>
        <button data-test="add-account" onClick={() => setAdding(true)} className={buttonCls.primary}>
          <Plus size={15} /> {manager ? "Add backup account" : "Add account"}
        </button>
      </div>

      <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
        {tabs.map((t) => (
          <button key={t.key} data-test={`flow-tab-${t.key}`} onClick={() => setTab(t.key)}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors ${
              tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          Couldn't load the accounts: {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={26} /></div>
      ) : (
        <>
          {tab === "mine" && (
            <MemberHome
              user={user} accounts={accounts} held={held} settings={settings} today={today} nameOf={nameOf}
              onAdd={() => setAdding(true)} onUse={useAccount} onEdit={setEditing} onDelete={remove} onLog={() => setLogging(true)}
            />
          )}
          {tab === "overview" && manager && (
            <ManagerOverview accounts={accounts} members={members} settings={settings} today={today} logs={logs} month={month} />
          )}
          {tab === "accounts" && manager && (
            <AllAccounts
              accounts={accounts} members={members} viewerUid={user.uid} settings={settings} today={today} nameOf={nameOf}
              onEdit={setEditing} onAssign={assign} onToggleBlock={toggleBlock} onDelete={remove} onUse={useAccount}
            />
          )}
          {tab === "usage" && (
            <UsagePanel
              logs={logs} month={month} setMonth={setMonth} today={today} manager={manager} viewerUid={user.uid}
              onLog={() => setLogging(true)} onEdit={setEditingLog}
            />
          )}
          {tab === "paid" && (
            <PaidPanel accounts={paid} manager={manager} onAdd={() => setPaidEditing("new")} onEdit={setPaidEditing}
              onDelete={async (p) => {
                const { confirmed } = await confirm({ title: "Delete this paid account?", description: `${p.label} will be removed for everyone it is shared with.`, confirmText: "Delete", variant: "destructive" });
                if (confirmed) await deletePaidAccount(p.id);
              }} />
          )}
          {tab === "settings" && manager && <SettingsPanel settings={settings} actor={actor} />}
        </>
      )}

      {adding && <FlowAccountDialog actor={actor} settings={settings} onClose={() => setAdding(false)} />}
      {editing && <FlowAccountDialog actor={actor} settings={settings} account={editing} onClose={() => setEditing(null)} />}
      {logging && (
        <FlowCreditsDialog mode="log" actor={actor} settings={settings} accounts={accounts} onClose={() => setLogging(false)} />
      )}
      {editingLog && (
        <FlowCreditsDialog mode="edit" actor={actor} settings={settings} accounts={accounts} log={editingLog} onClose={() => setEditingLog(null)} />
      )}
      {paidEditing && (
        <PaidAccountDialog actor={actor} account={paidEditing === "new" ? null : paidEditing} members={members} onClose={() => setPaidEditing(null)} />
      )}
      {ConfirmDialog}
    </div>
  );
}

// ── A member's own view ─────────────────────────────────────────────────────────────────────

function MemberHome({ user, accounts, held, settings, today, nameOf, onAdd, onUse, onEdit, onDelete, onLog }: {
  user: { uid: string; role: string };
  accounts: FlowAccount[];
  held: FlowAccount[];
  settings: FlowSettings;
  today: string;
  nameOf: (uid?: string | null) => string;
  onAdd: () => void;
  onUse: (a: FlowAccount) => void;
  onEdit: (a: FlowAccount) => void;
  onDelete: (a: FlowAccount) => void;
  onLog: () => void;
}) {
  const added = accounts.filter((a) => a.addedBy === user.uid);
  const progress = driveProgress(added.map((a) => a.createdOn), settings, today);
  const inUse = held.find((a) => a.inUseBy === user.uid) || null;
  const suggestion = nextAccountToUse(accounts, user.uid, today, { exclude: inUse?.id, costs: settings.clipCosts });
  const heldElsewhere = added.filter((a) => holderOf(a) !== user.uid);
  const totalLeft = held.reduce((sum, a) => sum + accountBalance(a, today, settings.clipCosts).remaining, 0);
  const sorted = [...held].sort((a, b) => Number(b.inUseBy === user.uid) - Number(a.inUseBy === user.uid)
    || accountBalance(b, today).remaining - accountBalance(a, today).remaining);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {user.role === "tech_member" && <DriveProgressCard progress={progress} deadline={settings.driveDeadline} onAdd={onAdd} />}
        <div data-test="using-now" className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Zap size={13} className="text-primary" /> Using now
          </div>
          {inUse ? (() => {
            const b = accountBalance(inUse, today, settings.clipCosts);
            return (
              <>
                <div className="mt-1 truncate text-sm font-semibold text-foreground">{inUse.email}</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span data-test="using-now-left" className="text-3xl font-bold text-foreground">{b.remaining.toLocaleString("en-IN")}</span>
                  <span className="text-sm text-muted-foreground">credits left this month</span>
                </div>
                <CreditBar used={b.used} total={inUse.monthlyCredits} className="mt-2" />
                <p className="mt-1 text-[11px] text-muted-foreground">Refills {formatDay(b.refillsOn)} · expires {formatDay(inUse.expiresOn)}</p>
                {b.state === "empty" && suggestion && (
                  <button data-test="switch-suggested" onClick={() => onUse(suggestion)} className={`${buttonCls.primary} mt-3`}>
                    Out of credits — switch to {suggestion.email}
                  </button>
                )}
              </>
            );
          })() : (
            <div className="mt-2">
              <p className="text-sm text-muted-foreground">
                {held.length === 0 ? "Add your first account to start." : "Choose the account you are making videos on — your ads' credits are charged to it."}
              </p>
              {suggestion && (
                <button data-test="use-suggested" onClick={() => onUse(suggestion)} className={`${buttonCls.primary} mt-3`}>
                  Use {suggestion.email}
                </button>
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
            <span><b className="text-foreground">{held.length}</b> account{held.length === 1 ? "" : "s"} with you</span>
            <span>·</span>
            <span><b className="text-foreground">{totalLeft.toLocaleString("en-IN")}</b> credits left across them</span>
            <button data-test="record-usage" onClick={onLog} className="ml-auto text-primary hover:underline">Record usage</button>
          </div>
        </div>
      </div>

      <CreditCalculator credits={inUse ? accountBalance(inUse, today, settings.clipCosts).remaining : totalLeft} costs={settings.clipCosts}
        title={inUse ? "What the account in use can still make" : "What your accounts can still make"} />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Your accounts ({held.length})</h2>
        {held.length === 0 ? (
          <p data-test="no-accounts" className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No accounts yet. Make the Google AI Pro account with the Jio offer, then press <b>Add account</b>.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {sorted.map((a) => (
              <FlowAccountCard key={a.id} account={a} viewerUid={user.uid} manager={false} today={today} settings={settings}
                nameOf={nameOf} onUse={() => onUse(a)} onEdit={() => onEdit(a)} onDelete={() => onDelete(a)} />
            ))}
          </div>
        )}
      </section>

      {heldElsewhere.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">Added by you, now with someone else ({heldElsewhere.length})</h2>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {heldElsewhere.map((a) => (
              <FlowAccountCard key={a.id} account={a} viewerUid={user.uid} manager={false} today={today} settings={settings} nameOf={nameOf} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── The managers' overview ───────────────────────────────────────────────────────────────────

function ManagerOverview({ accounts, members, settings, today, logs, month }: {
  accounts: FlowAccount[];
  members: { uid: string; name: string; role: string }[];
  settings: FlowSettings;
  today: string;
  logs: FlowCreditLog[];
  month: string;
}) {
  const balances = accounts.map((a) => ({ a, b: accountBalance(a, today, settings.clipCosts) }));
  const live = balances.filter(({ b }) => b.state !== "expired" && b.state !== "blocked");
  const monthlyTotal = live.reduce((sum, { a }) => sum + a.monthlyCredits, 0);
  const left = live.reduce((sum, { b }) => sum + b.remaining, 0);
  const usedThisCycle = live.reduce((sum, { b }) => sum + b.used, 0);
  const expiringSoon = live.filter(({ b }) => b.daysToExpiry <= 60).length;
  const outOfService = balances.length - live.length;
  const backups = accounts.filter((a) => a.addedByRole === "tech_admin" || a.addedByRole === "tech_team_leader");

  const rows = members.filter((m) => m.role === "tech_member").map((m) => {
    const added = accounts.filter((a) => a.addedBy === m.uid);
    const holding = balances.filter(({ a }) => holderOf(a) === m.uid);
    return {
      m,
      progress: driveProgress(added.map((a) => a.createdOn), settings, today),
      holding: holding.length,
      left: holding.reduce((sum, { b }) => sum + (b.state === "expired" || b.state === "blocked" ? 0 : b.remaining), 0),
      inUse: accounts.find((a) => a.inUseBy === m.uid)?.email || "",
      spent: totalCredits(logs.filter((l) => l.userId === m.uid)),
    };
  }).sort((x, y) => y.progress.done - x.progress.done);
  const teamTarget = rows.length * settings.targetPerMember;
  const teamDone = rows.reduce((sum, r) => sum + r.progress.done, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard testId="stat-accounts" icon={<KeyRound size={13} />} label="Accounts" value={accounts.length}
          hint={`${live.length} usable · ${backups.length} backup`} />
        <StatCard testId="stat-total-credits" icon={<BadgeIndianRupee size={13} />} label="Credits a month" value={monthlyTotal.toLocaleString("en-IN")}
          hint={`${settings.monthlyCredits.toLocaleString("en-IN")} per usable account`} />
        <StatCard testId="stat-left" icon={<Zap size={13} />} label="Credits left this month" value={left.toLocaleString("en-IN")}
          hint={`${usedThisCycle.toLocaleString("en-IN")} used`} />
        <StatCard testId="stat-drive" icon={<Users size={13} />} label="Team drive" value={`${teamDone}/${teamTarget || 0}`}
          hint={`${settings.targetPerMember} each by ${formatDay(settings.driveDeadline)}`} />
        <StatCard testId="stat-attention" icon={<AlertTriangle size={13} />} label="Need attention" value={expiringSoon + outOfService}
          hint={`${expiringSoon} expiring ≤ 60 days · ${outOfService} expired/blocked`} />
      </div>

      <CreditCalculator credits={left} costs={settings.clipCosts} title="What the team's credits can still make this month" />

      <section className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h2 className="text-sm font-semibold text-foreground">Each member's drive</h2>
          <span className="text-[11px] text-muted-foreground">{settings.dailyGoal} a day · {settings.targetPerMember} by {formatDay(settings.driveDeadline)} · spend is {formatMonth(month)}</span>
        </div>
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No tech members in this team yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table data-test="drive-table" className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Member</th>
                  <th className="px-3 py-2 font-medium">Added</th>
                  <th className="px-3 py-2 font-medium">Today</th>
                  <th className="px-3 py-2 font-medium">Pace</th>
                  <th className="px-3 py-2 font-medium">Holding</th>
                  <th className="px-3 py-2 font-medium">Credits left</th>
                  <th className="px-3 py-2 font-medium">Spent</th>
                  <th className="px-3 py-2 font-medium">Using now</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ m, progress, holding, left: memberLeft, inUse, spent }) => (
                  <tr key={m.uid} data-test={`drive-row-${m.uid}`} className="border-t border-border">
                    <td className="px-3 py-2 font-medium text-foreground">{m.name}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{progress.done}</span>
                        <span className="text-muted-foreground">/ {progress.target}</span>
                        <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (progress.done / Math.max(1, progress.target)) * 100)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-foreground">{progress.addedToday}/{progress.dailyGoal}</td>
                    <td className="px-3 py-2"><DriveChip progress={progress} /></td>
                    <td className="px-3 py-2 text-foreground">{holding}</td>
                    <td className="px-3 py-2 text-foreground">{memberLeft.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2 text-foreground">{spent.toLocaleString("en-IN")}</td>
                    <td className="max-w-[180px] truncate px-3 py-2 text-xs text-muted-foreground">{inUse || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Every account of the team ────────────────────────────────────────────────────────────────

function AllAccounts({ accounts, members, viewerUid, settings, today, nameOf, onEdit, onAssign, onToggleBlock, onDelete, onUse }: {
  accounts: FlowAccount[];
  members: { uid: string; name: string; role: FlowAccount["addedByRole"] }[];
  viewerUid: string;
  settings: FlowSettings;
  today: string;
  nameOf: (uid?: string | null) => string;
  onEdit: (a: FlowAccount) => void;
  onAssign: (a: FlowAccount, to: { uid: string; name: string; role?: string } | null) => void;
  onToggleBlock: (a: FlowAccount) => void;
  onDelete: (a: FlowAccount) => void;
  onUse: (a: FlowAccount) => void;
}) {
  const [search, setSearch] = useState("");
  const [holder, setHolder] = useState("all");
  const [state, setState] = useState("all");
  const holders = useMemo(() => {
    const ids = [...new Set(accounts.map(holderOf))];
    return ids.map((id) => ({ id, name: nameOf(id) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [accounts, nameOf]);

  const shown = accounts
    .map((a) => ({ a, b: accountBalance(a, today, settings.clipCosts) }))
    .filter(({ a, b }) => {
      const q = search.trim().toLowerCase();
      if (q && !`${a.email} ${a.authPhone} ${a.addedByName} ${a.assignedToName || ""} ${a.notes || ""}`.toLowerCase().includes(q)) return false;
      if (holder !== "all" && holderOf(a) !== holder) return false;
      if (state !== "all" && b.state !== state) return false;
      return true;
    })
    .sort((x, y) => x.a.email.localeCompare(y.a.email));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input data-test="accounts-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Email, phone, member or note"
            className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-sm text-foreground outline-none focus:border-primary" />
        </div>
        <select data-test="accounts-holder" value={holder} onChange={(e) => setHolder(e.target.value)} className={cn(inputCls, "w-auto")}>
          <option value="all">Everyone</option>
          {holders.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        <select data-test="accounts-state" value={state} onChange={(e) => setState(e.target.value)} className={cn(inputCls, "w-auto")}>
          <option value="all">Any state</option>
          <option value="active">Active</option>
          <option value="low">Low credits</option>
          <option value="empty">No credits left</option>
          <option value="expired">Expired</option>
          <option value="blocked">Blocked</option>
        </select>
        <span className="text-xs text-muted-foreground">{shown.length} of {accounts.length}</span>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No accounts match.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {shown.map(({ a }) => (
            <FlowAccountCard key={a.id} account={a} viewerUid={viewerUid} manager today={today} settings={settings} nameOf={nameOf}
              members={members.map((m) => ({ uid: m.uid, name: m.name, role: m.role }))}
              onEdit={() => onEdit(a)} onAssign={(to) => onAssign(a, to)} onToggleBlock={() => onToggleBlock(a)} onDelete={() => onDelete(a)}
              onUse={() => onUse(a)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── The spend log ───────────────────────────────────────────────────────────────────────────

function UsagePanel({ logs, month, setMonth, today, manager, viewerUid, onLog, onEdit }: {
  logs: FlowCreditLog[];
  month: string;
  setMonth: (m: string) => void;
  today: string;
  manager: boolean;
  viewerUid: string;
  onLog: () => void;
  onEdit: (log: FlowCreditLog) => void;
}) {
  const [who, setWho] = useState("all");
  const people = [...new Map(logs.map((l) => [l.userId, l.userName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const shown = logs.filter((l) => who === "all" || l.userId === who);
  const thisMonth = monthOf(today);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-border bg-card p-0.5">
          {[thisMonth, previousMonth(thisMonth)].map((m) => (
            <button key={m} data-test={`usage-month-${m}`} onClick={() => setMonth(m)}
              className={`h-8 rounded-lg px-3 text-xs font-medium ${month === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>
              {formatMonth(m)}
            </button>
          ))}
        </div>
        {manager && people.length > 0 && (
          <select data-test="usage-who" value={who} onChange={(e) => setWho(e.target.value)} className={cn(inputCls, "w-auto")}>
            <option value="all">Everyone</option>
            {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
        <span data-test="usage-total" className="text-sm text-muted-foreground">
          <b className="text-foreground">{totalCredits(shown).toLocaleString("en-IN")}</b> credits · {shown.length} entr{shown.length === 1 ? "y" : "ies"}
        </span>
        <button data-test="usage-record" onClick={onLog} className={`${buttonCls.small} ml-auto`}><Plus size={13} /> Record usage</button>
      </div>
      {shown.length === 0 ? (
        <p data-test="usage-empty" className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No credits recorded in {formatMonth(month)} yet. They are recorded when an ad is marked complete.
        </p>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {shown.map((l) => (
            <div key={l.id} data-test={`usage-${l.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
                  <span className="truncate font-medium text-foreground">{l.businessName || "Manual entry"}</span>
                  {l.uniqueId && <span className="text-[11px] text-muted-foreground">{l.uniqueId}</span>}
                  {l.manual && <Chip className="bg-amber-500/15 text-amber-700 dark:text-amber-300">edited figure</Chip>}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {formatDay(l.date)} · {manager ? `${l.userName} · ` : ""}{l.accountEmail} · {clipsSummary(l.clips)}{l.note ? ` · ${l.note}` : ""}
                </div>
              </div>
              <div className="text-right text-sm font-bold text-foreground">{l.credits.toLocaleString("en-IN")}<span className="ml-0.5 text-[10px] font-normal text-muted-foreground">credits</span></div>
              {(manager || l.userId === viewerUid) && (
                <button data-test={`usage-edit-${l.id}`} aria-label="Edit this usage" className={buttonCls.small} onClick={() => onEdit(l)}><Pencil size={13} /></button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Paid accounts ───────────────────────────────────────────────────────────────────────────

function PaidPanel({ accounts, manager, onAdd, onEdit, onDelete }: {
  accounts: PaidAccount[];
  manager: boolean;
  onAdd: () => void;
  onEdit: (p: PaidAccount) => void;
  onDelete: (p: PaidAccount) => void;
}) {
  const groups = (["chatgpt", "grok", "other"] as const)
    .map((platform) => ({ platform, list: accounts.filter((a) => a.platform === platform).sort((a, b) => a.label.localeCompare(b.label)) }))
    .filter((g) => g.list.length > 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {manager
            ? "Shared subscriptions — ChatGPT for frames, footers and posters; Grok for animation clips. Logins in one place, given to the members who use them."
            : "The paid accounts shared with you."}
        </p>
        {manager && <button data-test="paid-add" onClick={onAdd} className={buttonCls.primary}><Plus size={15} /> Add paid account</button>}
      </div>
      {groups.length === 0 ? (
        <p data-test="paid-empty" className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {manager ? "No paid accounts yet." : "No paid accounts have been shared with you."}
        </p>
      ) : groups.map(({ platform, list }) => (
        <section key={platform}>
          <h2 className="mb-2 text-sm font-semibold text-foreground">{platformName(platform)} ({list.length})</h2>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {list.map((p) => (
              <div key={p.id} data-test={`paid-${p.id}`} className="min-w-0 rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-foreground">{p.label}</span>
                      <Chip className="bg-primary/12 text-primary">{platformName(p.platform)}{p.plan ? ` · ${p.plan}` : ""}</Chip>
                    </div>
                    {p.renewsOn && <p className="mt-0.5 text-[11px] text-muted-foreground">Renews {formatDay(p.renewsOn)}</p>}
                  </div>
                  <span data-test="paid-shared-count" className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">
                    <Users size={11} /> {p.assigneeIds.length} member{p.assigneeIds.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-2 space-y-0.5 rounded-lg bg-muted/40 px-2 py-1">
                  <SecretField label="Login" value={p.email} />
                  <SecretField label="Password" value={p.password} secret />
                </div>
                {p.notes && <p className="mt-1.5 text-[11px] text-muted-foreground">📝 {p.notes}</p>}
                {manager && (
                  <>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {p.assignees.length === 0
                        ? <span className="text-[11px] text-muted-foreground">Not shared with anyone yet.</span>
                        : p.assignees.map((a) => <Chip key={a.uid} className="bg-muted text-foreground">{a.name}</Chip>)}
                    </div>
                    <div className="mt-2.5 flex gap-1.5">
                      <button data-test="paid-edit" className={buttonCls.small} onClick={() => onEdit(p)}><Pencil size={13} /> Edit & share</button>
                      <button data-test="paid-delete" className={`${buttonCls.danger} ml-auto`} onClick={() => onDelete(p)}><Trash2 size={13} /> Delete</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── The drive's settings ────────────────────────────────────────────────────────────────────

function SettingsPanel({ settings, actor }: { settings: FlowSettings; actor: FlowActor }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<FlowSettings>(settings);
  const [saving, setSaving] = useState(false);
  const num = (v: string) => Math.max(0, Number(v.replace(/[^\d]/g, "")) || 0);
  const save = async () => {
    setSaving(true);
    try {
      await saveFlowSettings(draft, actor);
      toast({ title: "Settings saved" });
    } catch {
      toast({ title: "Couldn't save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="max-w-2xl space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><ShieldCheck size={15} className="text-primary" /> The account drive</h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Accounts per member"><input data-test="set-target" inputMode="numeric" value={draft.targetPerMember} onChange={(e) => setDraft({ ...draft, targetPerMember: num(e.target.value) })} className={inputCls} /></Field>
          <Field label="Accounts a day"><input data-test="set-daily" inputMode="numeric" value={draft.dailyGoal} onChange={(e) => setDraft({ ...draft, dailyGoal: num(e.target.value) })} className={inputCls} /></Field>
          <Field label="Drive started"><input data-test="set-start" type="date" value={draft.driveStart} onChange={(e) => setDraft({ ...draft, driveStart: e.target.value })} className={inputCls} /></Field>
          <Field label="Deadline"><input data-test="set-deadline" type="date" value={draft.driveDeadline} onChange={(e) => setDraft({ ...draft, driveDeadline: e.target.value })} className={inputCls} /></Field>
        </div>
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">Google AI Pro</h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Credits a month"><input data-test="set-credits" inputMode="numeric" value={draft.monthlyCredits} onChange={(e) => setDraft({ ...draft, monthlyCredits: num(e.target.value) })} className={inputCls} /></Field>
          <Field label="Offer lasts (months)"><input data-test="set-validity" inputMode="numeric" value={draft.validityMonths} onChange={(e) => setDraft({ ...draft, validityMonths: num(e.target.value) })} className={inputCls} /></Field>
        </div>
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">Credits per clip</h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CLIP_LENGTHS.map(({ key, seconds }) => (
            <Field key={key} label={`${seconds}-second clip`}>
              <input data-test={`set-cost-${key}`} inputMode="numeric" value={draft.clipCosts[key]}
                onChange={(e) => setDraft({ ...draft, clipCosts: { ...draft.clipCosts, [key]: num(e.target.value) } })} className={inputCls} />
            </Field>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Changing a price changes the calculation for new entries only — credits already recorded stay as they were.
          A changed validity applies to accounts added or edited from now on.
        </p>
      </div>
      <div className="flex justify-end">
        <button data-test="settings-save" onClick={save} disabled={saving} className={buttonCls.primary}>
          {saving && <Loader2 size={15} className="animate-spin" />} Save settings
        </button>
      </div>
    </div>
  );
}

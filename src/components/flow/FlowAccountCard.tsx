/**
 * One Flow account, as a member or a manager sees it: its login, its credits this month, its dates,
 * and — the part the team asked for — where it came from and who has it now: "Added by you",
 * "Added by Admin · assigned to you by Admin", "Added by Ravi · now with Suresh (assigned by Admin)".
 */
import { useState } from "react";
import { ArrowRightLeft, Ban, CheckCircle2, History, Pencil, Trash2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlowAccount, FlowSettings } from "@/types/flowAccounts";
import { accountBalance, holderOf } from "@/utils/flowAccounts";
import type { TechTeamMember } from "@/hooks/useFlowAccounts";
import { formatPhoneDisplay } from "@/utils/phone";
import { Chip, CreditBar, SecretField, StateChip, buttonCls, formatDay } from "./FlowParts";

export interface FlowAccountCardProps {
  account: FlowAccount;
  viewerUid: string;
  manager: boolean;
  today: string;
  settings: FlowSettings;
  nameOf: (uid?: string | null) => string;
  members?: TechTeamMember[];
  onUse?: () => void;
  onEdit?: () => void;
  onAssign?: (to: { uid: string; name: string; role?: string } | null) => void;
  onToggleBlock?: () => void;
  onDelete?: () => void;
}

export default function FlowAccountCard({
  account, viewerUid, manager, today, settings, nameOf, members = [], onUse, onEdit, onAssign, onToggleBlock, onDelete,
}: FlowAccountCardProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const balance = accountBalance(account, today, settings.clipCosts);
  const holder = holderOf(account);
  const mine = holder === viewerUid;
  const inUseByMe = account.inUseBy === viewerUid;
  const addedByMe = account.addedBy === viewerUid;
  const addedBy = addedByMe ? "you" : account.addedByName || nameOf(account.addedBy);
  const usable = balance.state !== "expired" && balance.state !== "blocked";

  /** The provenance line — who added it, and who holds it now and who moved it there. */
  const provenance = account.assignedTo
    ? account.assignedTo === viewerUid
      ? `Added by ${addedBy} · assigned to you by ${account.assignedBy === viewerUid ? "you" : account.assignedByName || "the admin"}`
      : `Added by ${addedBy} · now with ${account.assignedToName || nameOf(account.assignedTo)} (assigned by ${account.assignedBy === viewerUid ? "you" : account.assignedByName || "the admin"})`
    : `Added by ${addedBy}${account.addedByRole === "tech_admin" || account.addedByRole === "tech_team_leader" ? " · backup account" : ""}`;

  return (
    <div data-test={`flow-account-${account.id}`}
      className={cn("min-w-0 rounded-xl border bg-card p-3", inUseByMe ? "border-primary ring-1 ring-primary/40" : "border-border")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="min-w-0 truncate text-sm font-semibold text-foreground">{account.email}</span>
            <StateChip state={balance.state} />
            {account.inUseBy && (
              <Chip testId="in-use-chip" className="bg-primary/12 text-primary">
                <Zap size={11} /> {inUseByMe ? "Using now" : `In use by ${account.inUseByName || nameOf(account.inUseBy)}`}
              </Chip>
            )}
          </div>
          <p data-test="provenance" className="mt-0.5 text-[11.5px] text-muted-foreground">{provenance}</p>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold leading-none text-foreground" data-test="credits-left">{balance.remaining.toLocaleString("en-IN")}</div>
          <div className="text-[10.5px] text-muted-foreground">of {account.monthlyCredits.toLocaleString("en-IN")} left</div>
        </div>
      </div>

      <CreditBar used={balance.used} total={account.monthlyCredits} className="mt-2" />
      <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-[11px] text-muted-foreground">
        <span>Refills {formatDay(balance.refillsOn)}</span>
        <span>Created {formatDay(account.createdOn)}</span>
        <span className={balance.daysToExpiry <= 30 && !balance.expired ? "font-semibold text-amber-600 dark:text-amber-400" : ""}>
          {balance.expired ? `Expired ${formatDay(account.expiresOn)}` : `Expires ${formatDay(account.expiresOn)}`}
        </span>
      </div>

      {(mine || manager || addedByMe) && (
        <div className="mt-2 space-y-0.5 rounded-lg bg-muted/40 px-2 py-1">
          <SecretField label="Email" value={account.email} testId="acct-email" />
          <SecretField label="Password" value={account.password} secret testId="acct-password" />
          <SecretField label="Login phone" value={formatPhoneDisplay(account.authPhone)} testId="acct-phone" />
        </div>
      )}
      {account.notes && <p className="mt-1.5 text-[11px] text-muted-foreground">📝 {account.notes}</p>}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {mine && usable && !inUseByMe && onUse && (
          <button data-test="use-account" className={cn(buttonCls.small, "border-primary/40 text-primary")} onClick={onUse}>
            <CheckCircle2 size={13} /> I'm using this account now
          </button>
        )}
        {manager && onAssign && (
          assigning ? (
            <select
              autoFocus
              data-test="assign-select"
              defaultValue=""
              onBlur={() => setAssigning(false)}
              onChange={(e) => {
                const value = e.target.value;
                setAssigning(false);
                if (value === "__back") onAssign(null);
                else if (value) {
                  const member = members.find((m) => m.uid === value);
                  onAssign({ uid: value, name: member?.name || "", role: member?.role });
                }
              }}
              className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
            >
              <option value="" disabled>Give it to…</option>
              {account.assignedTo && <option value="__back">↩ Back to {addedBy === "you" ? "you" : addedBy}</option>}
              {members.filter((m) => m.uid !== holder).map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
            </select>
          ) : (
            <button data-test="assign-account" className={buttonCls.small} onClick={() => setAssigning(true)}>
              <ArrowRightLeft size={13} /> {account.assignedTo ? "Reassign" : "Assign"}
            </button>
          )
        )}
        {(manager || (addedByMe && !account.assignedTo)) && onEdit && (
          <button data-test="edit-account" className={buttonCls.small} onClick={onEdit}><Pencil size={13} /> Edit</button>
        )}
        {manager && onToggleBlock && (
          <button data-test="block-account" className={buttonCls.small} onClick={onToggleBlock}>
            <Ban size={13} /> {account.status === "blocked" ? "Unblock" : "Mark blocked"}
          </button>
        )}
        <button className={buttonCls.small} onClick={() => setShowHistory((s) => !s)} data-test="account-history">
          <History size={13} /> History
        </button>
        {(manager || (addedByMe && !account.assignedTo)) && onDelete && (
          <button data-test="delete-account" className={cn(buttonCls.danger, "ml-auto")} onClick={onDelete}><Trash2 size={13} /> Delete</button>
        )}
      </div>

      {showHistory && (
        <ul data-test="history-list" className="mt-2 space-y-0.5 border-t border-border pt-2 text-[11px] text-muted-foreground">
          {[...(account.history || [])].reverse().map((e, i) => (
            <li key={i}>
              {new Date(e.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} ·{" "}
              {e.kind === "added" ? `added by ${e.byName}`
                : e.kind === "assigned" ? `assigned to ${e.toName} by ${e.byName}`
                  : e.kind === "unassigned" ? `taken back by ${e.byName}`
                    : e.kind === "blocked" ? `marked blocked by ${e.byName}`
                      : e.kind === "unblocked" ? `unblocked by ${e.byName}`
                        : `edited by ${e.byName}`}
            </li>
          ))}
          {(account.history || []).length === 0 && <li>No history yet.</li>}
        </ul>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { History, KeyRound, Pencil, Plus, Power, RefreshCw, Search, Trash2, UserCheck, Zap } from "lucide-react";
import { buttonClass, fieldClass } from "./AiModal";
import SecretField from "./SecretField";
import { prettyDate } from "./FlowAccountDialog";
import type { FlowAccount } from "@/types/aiAccounts";
import { accountState, todayStr } from "@/utils/flowCredits";
import { API_KEY_STATUS } from "@/utils/geminiKeys";
import { cn } from "@/lib/utils";

export type FlowAccountAction = "use" | "edit" | "assign" | "toggle" | "delete" | "apiKey";

/** Who moved this account last, read from its history — "assigned to Ravi by Kiran". */
export function lastAssignment(account: FlowAccount) {
  return [...(account.history || [])].reverse().find((e) => e.action === "assigned");
}

/**
 * The Flow accounts as cards — for a member, theirs; for a manager, the team's with a search and filters.
 * Each card says where it stands this cycle (used / left, when it refreshes), when it expires, who opened
 * it and who uses it now, and offers what this viewer may do with it.
 */
export default function FlowAccountsList({
  accounts, viewerId, activeId, manager, keyAdmin = false, onAction, emptyText,
}: {
  accounts: FlowAccount[];
  viewerId: string;
  activeId?: string | null;
  manager: boolean;
  /** The tech admin: sees, adds and replaces every account's Gemini API key (utils/geminiKeys). */
  keyAdmin?: boolean;
  onAction: (action: FlowAccountAction, account: FlowAccount) => void;
  emptyText: string;
}) {
  const today = todayStr();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "usable" | "empty" | "expired" | "disabled" | "nokey">("all");
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return accounts.filter((a) => {
      const s = accountState(a, today);
      const matches = !term || [a.email, a.phone, a.ownerName, a.holderName].some((v) => (v || "").toLowerCase().includes(term));
      const inFilter = filter === "all"
        || (filter === "usable" && s.usable)
        || (filter === "empty" && !s.expired && a.status !== "disabled" && s.remaining === 0)
        || (filter === "expired" && s.expired)
        || (filter === "disabled" && a.status === "disabled")
        || (filter === "nokey" && (!a.apiKey || a.apiKey.status === "failed"));
      return matches && inFilter;
    });
  }, [accounts, search, filter, today]);

  return (
    <div className="space-y-3">
      {accounts.length > 3 ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input className={`${fieldClass} pl-8`} value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={manager ? "Search email, phone or member" : "Search email or phone"} data-test="flow-search" />
          </div>
          <select className={`${fieldClass} sm:w-48`} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} data-test="flow-filter">
            <option value="all">All accounts</option>
            <option value="usable">Has credits</option>
            <option value="empty">Out of credits</option>
            <option value="expired">Expired</option>
            <option value="disabled">Disabled</option>
            <option value="nokey">No API key</option>
          </select>
        </div>
      ) : null}

      {shown.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">{accounts.length ? "No account matches." : emptyText}</div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {shown.map((a) => {
            const s = accountState(a, today);
            const pct = Math.min(100, Math.round((s.used / Math.max(1, s.monthly)) * 100));
            const mine = a.holderId === viewerId;
            const active = mine && a.id === activeId;
            const moved = lastAssignment(a);
            const canEdit = manager || a.addedBy === viewerId || a.ownerId === viewerId;
            // The key itself: the tech admin's, and the account's own people's (the Firestore rule says the same).
            const canKey = keyAdmin || (a.visibleTo || []).includes(viewerId);
            const keyStatus = a.apiKey ? API_KEY_STATUS[a.apiKey.status] || API_KEY_STATUS.unchecked : null;
            return (
              <div key={a.id} data-test="flow-account-card" className={cn("bg-card border rounded-xl p-3 md:p-4 min-w-0", active ? "border-primary/60 ring-1 ring-primary/30" : "border-border")}>
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-foreground truncate" title={a.email}>{a.email}</p>
                    <p className="text-[11px] text-muted-foreground">
                      📱 {a.phone || "—"} · created {prettyDate(a.createdOn)} · <span className="whitespace-nowrap">expires {prettyDate(a.expiresOn)}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1 shrink-0">
                    {active ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary" data-test="flow-using-now">Using now</span> : null}
                    {a.status === "disabled" ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Disabled</span> : null}
                    {s.expired ? <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">Expired</span>
                      : s.daysToExpiry <= 30 ? <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-semibold text-foreground">Expires in {s.daysToExpiry}d</span> : null}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">This cycle <span className="text-foreground font-semibold" data-test="flow-used">{s.used}</span> / {s.monthly} used</span>
                    <span className={cn("font-semibold", s.remaining === 0 || pct >= 90 ? "text-destructive" : pct >= 60 ? "text-warning" : "text-success")} data-test="flow-left">{s.remaining} left</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className={cn("h-full rounded-full", pct >= 90 ? "bg-destructive" : pct >= 60 ? "bg-warning" : "bg-success")} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">Refreshes on {prettyDate(s.nextReset)}{a.lastUsedByName ? ` · last used by ${a.lastUsedByName}` : ""}</p>
                </div>

                <div className="mt-3 grid gap-1 text-xs">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="text-muted-foreground shrink-0">Password</span>
                    <SecretField kind="flow" id={a.id} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 min-w-0" data-test="flow-api-key">
                    <span className="text-muted-foreground shrink-0 inline-flex items-center gap-1"><KeyRound className="h-3 w-3" /> Gemini API key</span>
                    {a.apiKey && keyStatus ? (
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap", keyStatus.tone)} data-test="flow-api-key-status">{keyStatus.label}</span>
                        {canKey ? <SecretField kind="apiKey" id={a.id} /> : null}
                      </span>
                    ) : canKey ? (
                      <button className={`${buttonClass.small} border-primary/50 bg-primary/10 text-primary`} onClick={() => onAction("apiKey", a)} data-test="flow-api-key-add">
                        <Plus className="h-3.5 w-3.5" /> Add API key
                      </button>
                    ) : <span className="text-muted-foreground">Not added yet</span>}
                  </div>
                  {a.apiKey?.status === "failed" ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive" data-test="flow-api-key-failed">
                      <span className="min-w-0">{a.apiKey.message || "Google refused this key."}</span>
                      {canKey ? <button className="font-semibold underline underline-offset-2 shrink-0" onClick={() => onAction("apiKey", a)}>Replace key</button> : null}
                    </div>
                  ) : null}
                  <div className="text-muted-foreground min-w-0" data-test="flow-ownership">
                    Opened by <span className="text-foreground font-medium">{a.ownerId === viewerId ? "you" : a.ownerName}</span>
                    {a.addedBy !== a.ownerId ? <> · added by {a.addedBy === viewerId ? "you" : a.addedByName}</> : null}
                    {a.holderId !== a.ownerId ? (
                      <> · <span className="text-foreground font-medium">assigned to {a.holderId === viewerId ? "you" : a.holderName}</span>
                        {moved?.byName ? <> by {moved.byId === viewerId ? "you" : moved.byName}</> : null}</>
                    ) : null}
                  </div>
                  {a.notes ? <div className="text-muted-foreground truncate" title={a.notes}>📝 {a.notes}</div> : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {mine && !active && s.usable ? (
                    <button className={`${buttonClass.small} border-primary/40 text-primary`} onClick={() => onAction("use", a)} data-test="flow-use-now">
                      <Zap className="h-3.5 w-3.5" /> I'm using this now
                    </button>
                  ) : null}
                  {canEdit ? <button className={buttonClass.small} onClick={() => onAction("edit", a)}><Pencil className="h-3.5 w-3.5" /> Edit</button> : null}
                  {canKey && a.apiKey && a.apiKey.status !== "failed" ? (
                    <button className={buttonClass.small} onClick={() => onAction("apiKey", a)} data-test="flow-api-key-replace"><RefreshCw className="h-3.5 w-3.5" /> Replace key</button>
                  ) : null}
                  {manager ? <button className={buttonClass.small} onClick={() => onAction("assign", a)} data-test="flow-assign"><UserCheck className="h-3.5 w-3.5" /> Assign</button> : null}
                  {manager ? (
                    <button className={buttonClass.small} onClick={() => onAction("toggle", a)}>
                      <Power className="h-3.5 w-3.5" /> {a.status === "disabled" ? "Enable" : "Disable"}
                    </button>
                  ) : null}
                  {(a.history?.length || 0) > 0 ? (
                    <button className={buttonClass.small} onClick={() => setOpenHistory(openHistory === a.id ? null : a.id)}>
                      <History className="h-3.5 w-3.5" /> History
                    </button>
                  ) : null}
                  {manager ? <button className={buttonClass.danger} onClick={() => onAction("delete", a)}><Trash2 className="h-3.5 w-3.5" /> Delete</button> : null}
                </div>

                {openHistory === a.id ? (
                  <ul className="mt-2 space-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground" data-test="flow-history">
                    {[...(a.history || [])].reverse().map((e, i) => (
                      <li key={i}>
                        {new Date(e.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} —{" "}
                        {e.action === "assigned"
                          ? <>{e.byName} assigned it {e.fromName ? `from ${e.fromName} ` : ""}to <b className="text-foreground">{e.toName}</b></>
                          : e.action === "added" ? <>{e.byName} added it{e.toName ? ` for ${e.toName}` : ""}</>
                            : e.action === "password_changed" ? <>{e.byName} changed the password</>
                              : e.action === "api_key_added" ? <>{e.byName} added its Gemini API key</>
                                : e.action === "api_key_replaced" ? <>{e.byName} replaced its Gemini API key</>
                                  : e.action === "api_key_removed" ? <>{e.byName} removed its Gemini API key</>
                                    : <>{e.byName} {e.action} it</>}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

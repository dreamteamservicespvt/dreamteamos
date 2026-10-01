import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2, Users } from "lucide-react";
import AiModal, { buttonClass, fieldClass } from "./AiModal";
import AssignDialog from "./AssignDialog";
import SecretField from "./SecretField";
import { prettyDate } from "./FlowAccountDialog";
import {
  addPaidAccount, assignPaidAccount, deletePaidAccount, providerLabel, updatePaidAccount, type Actor, type PaidAccountInput, type Person,
} from "@/services/aiAccounts";
import type { PaidAccount, PaidProvider } from "@/types/aiAccounts";
import { isValidEmail } from "@/utils/flowCredits";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";

const PROVIDERS: { id: PaidProvider; label: string; use: string }[] = [
  { id: "chatgpt", label: "ChatGPT", use: "Frames, footers and posters" },
  { id: "grok", label: "Grok", use: "Animations and clips Flow does not make" },
  { id: "other", label: "Other", use: "Any other paid tool" },
];

/**
 * The paid accounts (ChatGPT, Grok…) — their logins in one place, and who each one is assigned to. No
 * credit maths: a manager adds, edits and assigns them; a member sees the ones assigned to them, with
 * the password a tap away.
 */
export default function PaidAccountsPanel({
  accounts, manager, actor, people,
}: {
  accounts: PaidAccount[];
  manager: boolean;
  actor: Actor;
  people: Person[];
}) {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [editing, setEditing] = useState<PaidAccount | "new" | null>(null);
  const [assigning, setAssigning] = useState<PaidAccount | null>(null);

  const remove = async (a: PaidAccount) => {
    const { confirmed } = await confirm({ title: "Delete this account?", description: `${a.label} and its password will be removed for everyone.`, confirmText: "Delete", variant: "destructive" });
    if (!confirmed) return;
    try { await deletePaidAccount(a); toast({ title: "Account deleted" }); } catch { toast({ title: "Could not delete it", variant: "destructive" }); }
  };

  return (
    <div className="space-y-4" data-test="paid-accounts">
      {ConfirmDialog}
      {manager ? (
        <div className="flex justify-end">
          <button className={buttonClass.primary} onClick={() => setEditing("new")} data-test="paid-add"><Plus className="h-4 w-4" /> Add paid account</button>
        </div>
      ) : null}
      {PROVIDERS.map((p) => {
        const list = accounts.filter((a) => a.provider === p.id);
        if (list.length === 0 && (p.id === "other" || !manager)) return null;
        return (
          <section key={p.id}>
            <h3 className="mb-2 text-sm font-semibold text-foreground">{p.label} <span className="font-normal text-muted-foreground">— {p.use}</span></h3>
            {list.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">No {p.label} account yet.</p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {list.map((a) => (
                  <div key={a.id} className="bg-card border border-border rounded-xl p-3 md:p-4 min-w-0" data-test="paid-card">
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{a.label}</p>
                        <p className="font-mono text-xs text-muted-foreground truncate">{a.email}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary inline-flex items-center gap-1" data-test="paid-count">
                        <Users className="h-3 w-3" /> {a.assignedTo.length} member{a.assignedTo.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs min-w-0">
                      <span className="text-muted-foreground shrink-0">Password</span>
                      <SecretField kind="paid" id={a.id} />
                    </div>
                    {a.plan || a.renewsOn ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">{a.plan}{a.plan && a.renewsOn ? " · " : ""}{a.renewsOn ? `renews ${prettyDate(a.renewsOn)}` : ""}</p>
                    ) : null}
                    {manager ? (
                      <p className="mt-1 text-[11px] text-muted-foreground truncate">
                        {a.assignedTo.length ? <>Assigned to {a.assignedTo.map((uid) => a.assignedNames?.[uid] || "a member").join(", ")}</> : "Not assigned yet"}
                      </p>
                    ) : null}
                    {a.notes ? <p className="mt-1 text-[11px] text-muted-foreground truncate" title={a.notes}>📝 {a.notes}</p> : null}
                    {manager ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <button className={buttonClass.small} onClick={() => setAssigning(a)} data-test="paid-assign"><Users className="h-3.5 w-3.5" /> Assign</button>
                        <button className={buttonClass.small} onClick={() => setEditing(a)}><Pencil className="h-3.5 w-3.5" /> Edit</button>
                        <button className={buttonClass.danger} onClick={() => remove(a)}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
      {!manager && accounts.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">No paid account is assigned to you yet.</div>
      ) : null}

      <PaidAccountDialog open={!!editing} account={editing === "new" ? null : editing} actor={actor} onClose={() => setEditing(null)} />
      <AssignDialog
        open={!!assigning}
        onClose={() => setAssigning(null)}
        title={`Assign ${assigning?.label || ""}`}
        subtitle="Everyone ticked can see this login and its password."
        people={people}
        selected={assigning?.assignedTo || []}
        multiple
        onSave={async (picked) => {
          if (!assigning) return;
          try { await assignPaidAccount(assigning, picked, actor); toast({ title: "Assignment saved" }); }
          catch { toast({ title: "Could not save the assignment", variant: "destructive" }); throw new Error("assign failed"); }
        }}
      />
    </div>
  );
}

function PaidAccountDialog({ open, account, actor, onClose }: { open: boolean; account: PaidAccount | null; actor: Actor; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState<PaidAccountInput>({ provider: "chatgpt", label: "", email: "", password: "", plan: "", notes: "", renewsOn: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(account
      ? { provider: account.provider, label: account.label, email: account.email, password: "", plan: account.plan || "", notes: account.notes || "", renewsOn: account.renewsOn || "" }
      : { provider: "chatgpt", label: "", email: "", password: "", plan: "", notes: "", renewsOn: "" });
  }, [open, account]);
  const set = (patch: Partial<PaidAccountInput>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    if (!isValidEmail(form.email)) return setError("Enter the account's login email.");
    if (!account && !form.password.trim()) return setError("Enter the account's password.");
    setSaving(true);
    try {
      if (account) await updatePaidAccount(account, form, actor);
      else await addPaidAccount(form, actor);
      toast({ title: account ? "Account updated" : "Account added" });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save it.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AiModal open={open} onClose={onClose} title={account ? `Edit ${providerLabel(account.provider)} account` : "Add a paid account"} testId="paid-dialog"
      footer={<>
        <button className={buttonClass.ghost} onClick={onClose} disabled={saving}>Cancel</button>
        <button className={buttonClass.primary} onClick={save} disabled={saving} data-test="paid-save">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save</button>
      </>}
    >
      <div className="grid gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Tool</span>
          <select className={fieldClass} value={form.provider} onChange={(e) => set({ provider: e.target.value as PaidProvider })} data-test="paid-provider">
            {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label} — {p.use}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Name (what the team calls it)</span>
          <input className={fieldClass} value={form.label} onChange={(e) => set({ label: e.target.value })} placeholder="ChatGPT Plus #1" data-test="paid-label" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Login email</span>
          <input className={fieldClass} type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} data-test="paid-email" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{account ? "New password (leave empty to keep it)" : "Password"}</span>
          <input className={fieldClass} type="text" autoComplete="off" value={form.password} onChange={(e) => set({ password: e.target.value })} data-test="paid-password" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Plan</span>
            <input className={fieldClass} value={form.plan} onChange={(e) => set({ plan: e.target.value })} placeholder="Plus / SuperGrok" />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Renews on</span>
            <input className={fieldClass} type="date" value={form.renewsOn} onChange={(e) => set({ renewsOn: e.target.value })} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Notes</span>
          <input className={fieldClass} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="2-step verification on the admin's phone" />
        </label>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </AiModal>
  );
}

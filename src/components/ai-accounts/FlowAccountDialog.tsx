import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import AiModal, { buttonClass, fieldClass } from "./AiModal";
import { addFlowAccount, updateFlowAccount, type Actor, type Person } from "@/services/aiAccounts";
import type { FlowAccount, FlowSettings } from "@/types/aiAccounts";
import { expiryOf, hasRecordedCredits, isDate, todayStr, validateFlowAccountInput, type FlowAccountInput } from "@/utils/flowCredits";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

/** "2028-04-01" → "1 Apr 2028". */
export const prettyDate = (date?: string) => (date && isDate(date) ? format(new Date(`${date}T00:00:00`), "d MMM yyyy") : "—");

/**
 * Adding or editing a Flow account. The member types the email, the password, the phone number it logs
 * in with and the day it was created; the expiry (creation + validity) is worked out and shown, never
 * typed. A manager adding one chooses whose account it is — their own backup, or a member's.
 */
export default function FlowAccountDialog({
  open, onClose, actor, settings, account, owners,
}: {
  open: boolean;
  onClose: () => void;
  actor: Actor;
  settings: FlowSettings;
  /** Present when editing. */
  account?: FlowAccount | null;
  /** For a manager adding an account: who it can belong to. */
  owners?: Person[];
}) {
  const { toast } = useToast();
  const editing = !!account;
  const today = todayStr();
  const [form, setForm] = useState<FlowAccountInput & { notes: string; ownerId: string }>({
    email: "", password: "", phone: "", createdOn: today, notes: "", ownerId: actor.uid,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FlowAccountInput, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(account
      ? { email: account.email, password: "", phone: account.phone, createdOn: account.createdOn, notes: account.notes || "", ownerId: account.ownerId }
      : { email: "", password: "", phone: "", createdOn: today, notes: "", ownerId: actor.uid });
  }, [open, account, actor.uid, today]);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    const found = validateFlowAccountInput(form, today, { passwordRequired: !editing });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      if (editing && account) {
        await updateFlowAccount(account, {
          phone: form.phone, createdOn: form.createdOn, notes: form.notes, ...(form.password.trim() ? { password: form.password } : {}),
        }, actor, settings);
        toast({ title: "Account updated", description: account.email });
      } else {
        const owner = owners?.find((o) => o.uid === form.ownerId);
        await addFlowAccount({ ...form, owner: owner || { uid: actor.uid, name: actor.name, role: actor.role } }, actor, settings);
        toast({ title: "Flow account added", description: `${form.email.trim().toLowerCase()} — ${settings.monthlyCredits} credits a month.` });
      }
      onClose();
    } catch (err) {
      toast({ title: editing ? "Could not update the account" : "Could not add the account", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const expiry = isDate(form.createdOn) ? expiryOf(form.createdOn, settings.validityMonths) : "";
  /** Its cycles start on this day, and credits are already recorded in them (see hasRecordedCredits). */
  const dateLocked = editing && hasRecordedCredits(account);
  const label = (text: string, error?: string) => (
    <span className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
      {text}{error ? <span className="text-destructive font-normal">{error}</span> : null}
    </span>
  );

  return (
    <AiModal
      open={open}
      onClose={onClose}
      testId="flow-account-dialog"
      title={editing ? "Edit Flow account" : "Add a Flow account"}
      subtitle={editing ? account?.email : `Google AI Pro (Jio offer) — ${settings.monthlyCredits} Flow credits a month for ${settings.validityMonths} months.`}
      footer={<>
        <button className={buttonClass.ghost} onClick={onClose} disabled={saving}>Cancel</button>
        <button className={buttonClass.primary} onClick={save} disabled={saving} data-test="flow-account-save">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{editing ? "Save changes" : "Add account"}
        </button>
      </>}
    >
      <div className="grid gap-3">
        <label className="block">
          {label("Account email", errors.email)}
          <input className={fieldClass} type="email" autoComplete="off" value={form.email} disabled={editing}
            onChange={(e) => set({ email: e.target.value })} placeholder="name.flow01@gmail.com" data-test="flow-email" />
        </label>
        <label className="block">
          {label(editing ? "New password (leave empty to keep it)" : "Password", errors.password)}
          <input className={fieldClass} type="text" autoComplete="off" value={form.password}
            onChange={(e) => set({ password: e.target.value })} placeholder={editing ? "••••••••" : "Account password"} data-test="flow-password" />
        </label>
        <label className="block">
          {label("Login phone number (authentication)", errors.phone)}
          <input className={fieldClass} type="tel" inputMode="numeric" value={form.phone}
            onChange={(e) => set({ phone: e.target.value })} placeholder="10-digit Jio number" data-test="flow-phone" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0">
            {label("Account created on", errors.createdOn)}
            <input className={fieldClass} type="date" max={today} value={form.createdOn} disabled={dateLocked}
              onChange={(e) => set({ createdOn: e.target.value })} data-test="flow-created" />
            {dateLocked ? <span className="mt-1 block text-[10px] text-muted-foreground">Fixed — credits are already recorded on it.</span> : null}
          </label>
          <div className="min-w-0">
            {label("Expires on (automatic)")}
            <div className="h-9 px-3 rounded-lg border border-dashed border-border bg-muted/40 text-sm flex items-center" data-test="flow-expiry">
              {expiry ? prettyDate(expiry) : "—"}
            </div>
          </div>
        </div>
        {!editing && owners && owners.length > 1 ? (
          <label className="block">
            {label("Whose account is this?")}
            <select className={fieldClass} value={form.ownerId} onChange={(e) => set({ ownerId: e.target.value })} data-test="flow-owner">
              {owners.map((o) => <option key={o.uid} value={o.uid}>{o.uid === actor.uid ? `${o.name} (my backup)` : o.name}</option>)}
            </select>
          </label>
        ) : null}
        <label className="block">
          {label("Notes (optional)")}
          <input className={fieldClass} value={form.notes} onChange={(e) => set({ notes: e.target.value })}
            placeholder="e.g. Jio number belongs to a cousin" />
        </label>
      </div>
    </AiModal>
  );
}

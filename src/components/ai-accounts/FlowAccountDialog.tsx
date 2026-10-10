import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import AiModal, { buttonClass, fieldClass } from "./AiModal";
import { ApiKeySteps } from "./ApiKeyField";
import { addFlowAccount, updateFlowAccount, type Actor, type Person } from "@/services/aiAccounts";
import type { FlowAccount, FlowSettings } from "@/types/aiAccounts";
import {
  expiryOf, hasRecordedCredits, isDate, isValidEmail, normaliseEmail, todayStr, validateFlowAccountInput, type FlowAccountInput,
} from "@/utils/flowCredits";
import type { KeyCheck } from "@/utils/geminiKeys";
import { useApiKeyEntry } from "@/hooks/useApiKeyEntry";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

/** "2028-04-01" → "1 Apr 2028". */
export const prettyDate = (date?: string) => (date && isDate(date) ? format(new Date(`${date}T00:00:00`), "d MMM yyyy") : "—");

/**
 * Adding or editing a Flow account. The member types the email, the password, the phone number it logs
 * in with and the day it was created; the expiry (creation + validity) is worked out and shown, never
 * typed. A manager adding one chooses whose account it is — their own backup, or a member's.
 *
 * A new account is also asked for the Gemini API key made in it (owner, 2026-10-10): the same steps and
 * Google check as the card's key dialog, saved in the same transaction as the account. Someone without the
 * key yet ticks "Add the key later" — it is asked every time, never silently skipped — and the card's
 * "Add API key" and the "Add next key" card ask for it after.
 */
export default function FlowAccountDialog({
  open, onClose, actor, settings, account, owners, accounts = [],
}: {
  open: boolean;
  onClose: () => void;
  actor: Actor;
  settings: FlowSettings;
  /** Present when editing. */
  account?: FlowAccount | null;
  /** For a manager adding an account: who it can belong to. */
  owners?: Person[];
  /** The accounts this person can see — a new account's key already saved on one of them is refused. */
  accounts?: FlowAccount[];
}) {
  const { toast } = useToast();
  const editing = !!account;
  const today = todayStr();
  const [form, setForm] = useState<FlowAccountInput & { notes: string; ownerId: string }>({
    email: "", password: "", phone: "", createdOn: today, notes: "", ownerId: actor.uid,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FlowAccountInput, string>>>({});
  const [saving, setSaving] = useState(false);
  const [keyLater, setKeyLater] = useState(false);
  // Folded for someone who has given a key before — they know the steps; AI Studio stays one tap away.
  const [keySteps, setKeySteps] = useState(true);
  const keyEmail = normaliseEmail(form.email);
  const keyEntry = useApiKeyEntry({
    active: open && !editing && !keyLater,
    resetKey: String(open),
    email: isValidEmail(keyEmail) ? keyEmail : "",
    accounts,
  });

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setKeyLater(false);
    setForm(account
      ? { email: account.email, password: "", phone: account.phone, createdOn: account.createdOn, notes: account.notes || "", ownerId: account.ownerId }
      : { email: "", password: "", phone: "", createdOn: today, notes: "", ownerId: actor.uid });
  }, [open, account, actor.uid, today]);

  useEffect(() => {
    if (open) setKeySteps(!accounts.some((a) => a.apiKey && a.addedBy === actor.uid));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- decided when the form opens, not on every list snapshot
  }, [open]);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    const found = validateFlowAccountInput(form, today, { passwordRequired: !editing });
    setErrors(found);
    // The key is asked with the account: pasted, or consciously left for later.
    const keyProblem = editing || keyLater ? null
      : !keyEntry.value.trim() ? "Paste this account's API key — or tick “Add the key later”."
        : keyEntry.blocker;
    if (keyProblem) keyEntry.setError(keyProblem);
    if (Object.keys(found).length > 0 || keyProblem) return;
    setSaving(true);
    try {
      if (editing && account) {
        await updateFlowAccount(account, {
          phone: form.phone, createdOn: form.createdOn, notes: form.notes, ...(form.password.trim() ? { password: form.password } : {}),
        }, actor, settings);
        toast({ title: "Account updated", description: account.email });
      } else {
        let apiKey: { key: string; check: KeyCheck } | undefined;
        if (!keyLater) {
          const check = await keyEntry.resolve();
          if (check.status === "failed") { keyEntry.setError(check.message || "Google refused this key."); return; }
          apiKey = { key: keyEntry.key, check };
        }
        const owner = owners?.find((o) => o.uid === form.ownerId);
        await addFlowAccount({ ...form, owner: owner || { uid: actor.uid, name: actor.name, role: actor.role }, ...(apiKey ? { apiKey } : {}) }, actor, settings);
        toast({
          title: "Flow account added",
          description: `${form.email.trim().toLowerCase()} — ${settings.monthlyCredits} credits a month${
            apiKey ? (apiKey.check.status === "working" ? ", with its API key." : ", with its API key (Google could not be reached to check it yet).") : ". Add its API key on the card."}`,
        });
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
        {!editing ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 min-w-0" data-test="flow-key-section">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground"><KeyRound className="h-3.5 w-3.5 text-primary" /> Gemini API key</span>
              <label className="inline-flex min-h-[24px] cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={keyLater}
                  onChange={(e) => { setKeyLater(e.target.checked); keyEntry.setError(""); }} data-test="flow-key-later" />
                Add the key later
              </label>
            </div>
            {keyLater ? (
              <p className="mt-2 text-[11px] text-muted-foreground" data-test="flow-key-later-note">The account's card will ask for it (“Add API key”).</p>
            ) : (
              <div className="mt-3">
                <p className="mb-3 text-[11px] text-muted-foreground">Make the free Gemini key in this account — DTS AdGen writes its prompts with these keys.</p>
                <ApiKeySteps entry={keyEntry} email={isValidEmail(keyEmail) ? keyEmail : ""} stepsOpen={keySteps} onShowSteps={() => setKeySteps(true)} />
              </div>
            )}
          </div>
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

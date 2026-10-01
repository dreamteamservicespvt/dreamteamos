/**
 * Adding a Flow account — or correcting one.
 *
 * Four things identify an account: the email, its password, the phone number its sign-in code goes
 * to, and the day it was made (the offer's 18 months — and its monthly credits — count from that day).
 * The expiry is worked out here, never typed. An email already recorded by anyone is refused: the
 * email is the account's id (services/flowAccounts addFlowAccount).
 */
import { useMemo, useState } from "react";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { addFlowAccount, updateFlowAccount, type FlowActor } from "@/services/flowAccounts";
import type { FlowAccount, FlowSettings } from "@/types/flowAccounts";
import { expiryFor, isIsoDay, isoToday, validateFlowAccountInput } from "@/utils/flowAccounts";
import { Field, Modal, buttonCls, formatDay, inputCls } from "./FlowParts";

export default function FlowAccountDialog({ actor, settings, account, onClose, z }: {
  actor: FlowActor;
  settings: FlowSettings;
  /** Present when correcting an existing account. */
  account?: FlowAccount | null;
  onClose: () => void;
  z?: string;
}) {
  const { toast } = useToast();
  const today = isoToday();
  const [email, setEmail] = useState(account?.email || "");
  const [password, setPassword] = useState(account?.password || "");
  const [showPassword, setShowPassword] = useState(!account);
  const [authPhone, setAuthPhone] = useState(account?.authPhone?.replace(/^\+91/, "") || "");
  const [createdOn, setCreatedOn] = useState(account?.createdOn || today);
  const [notes, setNotes] = useState(account?.notes || "");
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);

  const errors = useMemo(
    () => validateFlowAccountInput({ email: account ? account.email : email, password, authPhone, createdOn }, today),
    [account, email, password, authPhone, createdOn, today],
  );
  const shown = tried ? errors : {};
  const expiry = isIsoDay(createdOn) ? expiryFor(createdOn, settings.validityMonths) : "";

  const save = async () => {
    setTried(true);
    if (Object.keys(errors).length > 0 || saving) return;
    setSaving(true);
    try {
      if (account) {
        await updateFlowAccount(account, { password, authPhone, createdOn, notes }, actor, settings);
        toast({ title: "Account updated", description: account.email });
      } else {
        await addFlowAccount({ email, password, authPhone, createdOn, notes }, actor, settings);
        toast({ title: "Flow account added", description: `${email.trim().toLowerCase()} — ${settings.monthlyCredits.toLocaleString("en-IN")} credits a month until ${formatDay(expiry)}.` });
      }
      onClose();
    } catch (err) {
      const duplicate = err instanceof Error && err.message === "DUPLICATE";
      toast({
        title: duplicate ? "Already recorded" : "Couldn't save",
        description: duplicate
          ? "This email is already in Flow Accounts — every Google account can be recorded only once."
          : "Check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      z={z}
      testId="flow-account-dialog"
      title={account ? "Edit Flow account" : "Add a Flow account"}
      subtitle={account ? account.email : "The Google AI Pro account you made with the Jio offer."}
      onClose={() => !saving && onClose()}
      footer={(
        <>
          <button className={buttonCls.secondary} onClick={onClose} disabled={saving}>Cancel</button>
          <button data-test="flow-account-save" className={buttonCls.primary} onClick={save} disabled={saving}>
            {saving && <Loader2 size={15} className="animate-spin" />}{account ? "Save changes" : "Add account"}
          </button>
        </>
      )}
    >
      <div className="space-y-3">
        <Field label="Account email" error={shown.email} hint={account ? "The email is the account itself — to change it, delete this one and add the new one." : undefined}>
          <input data-test="flow-email" type="email" autoComplete="off" value={account ? account.email : email} disabled={!!account}
            onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" className={inputCls} />
        </Field>
        <Field label="Password" error={shown.password}>
          <div className="relative">
            <input data-test="flow-password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} className={`${inputCls} pr-9`} />
            <button type="button" onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:text-foreground">
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>
        <Field label="Login phone number (the Jio number the code goes to)" error={shown.authPhone}>
          <div className="flex">
            <span className="inline-flex h-9 items-center rounded-l-md border border-r-0 border-border bg-muted px-2.5 text-sm text-muted-foreground">+91</span>
            <input data-test="flow-phone" inputMode="numeric" value={authPhone} onChange={(e) => setAuthPhone(e.target.value.replace(/[^\d\s]/g, ""))}
              placeholder="98765 43210" className={`${inputCls} rounded-l-none`} />
          </div>
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Account created on" error={shown.createdOn}>
            <input data-test="flow-created" type="date" value={createdOn} max={today} onChange={(e) => setCreatedOn(e.target.value)} className={inputCls} />
          </Field>
          <Field label={`Expires on (${settings.validityMonths} months, automatic)`}>
            <div data-test="flow-expiry" className="flex h-9 items-center rounded-md border border-dashed border-border bg-muted/50 px-2.5 text-sm font-medium text-foreground">
              {expiry ? formatDay(expiry) : "—"}
            </div>
          </Field>
        </div>
        <Field label="Notes (optional)" hint="Whose Jio number it is, anything the team should know.">
          <input data-test="flow-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
        </Field>
        <p className="rounded-lg bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
          Each account gets <b className="text-foreground">{settings.monthlyCredits.toLocaleString("en-IN")} credits every month</b>, refilled on the
          day of the month it was created. Only whoever holds it, the tech admin and the team leaders can see the password.
        </p>
      </div>
    </Modal>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Banknote, Check, Loader2, Lock, ShieldCheck, Smartphone, X } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import { missingBankFields, savePayoutAccount, primaryAccount, PAYOUT_METHODS } from "@/services/payroll";
import { PAYOUT_METHOD_LABELS, type EmployeeBank, type PayoutAccount, type PayoutMethod } from "@/types/payroll";

/**
 * Payout details capture.
 *
 * Shown as a blocking prompt when an employee has no usable payout target — they cannot be paid
 * without one, so dismissing it permanently would quietly cost them their salary. It can be
 * deferred for the session ("Remind me later") but returns on the next login until complete.
 *
 * These are the employee's own details, so they can always edit them. Verification is a signal
 * to the admin, not a lock on the employee — saving simply clears the verified flag so the admin
 * re-checks before the next transfer.
 */

type FieldKey = "accountHolderName" | "upiId" | "phoneNumber" | "bankName" | "accountNumber" | "ifsc";

const METHOD_ICON: Record<PayoutMethod, typeof Smartphone> = {
  upi: Smartphone,
  phonepe: Smartphone,
  google_pay: Smartphone,
  paytm: Smartphone,
  bank_transfer: Banknote,
};

/** Field definitions per method, in the order they should be filled. */
const METHOD_FIELDS: Record<PayoutMethod, { key: FieldKey; label: string; placeholder: string; inputMode?: "tel" | "text" }[]> = {
  upi: [
    { key: "accountHolderName", label: "Account Holder Name", placeholder: "As it appears on your bank account" },
    { key: "upiId", label: "UPI ID", placeholder: "yourname@okaxis" },
    { key: "phoneNumber", label: "Phone Number (optional)", placeholder: "9876543210", inputMode: "tel" },
  ],
  phonepe: [
    { key: "accountHolderName", label: "Account Holder Name", placeholder: "Name registered on PhonePe" },
    { key: "phoneNumber", label: "PhonePe Number", placeholder: "9876543210", inputMode: "tel" },
  ],
  google_pay: [
    { key: "accountHolderName", label: "Account Holder Name", placeholder: "Name registered on Google Pay" },
    { key: "phoneNumber", label: "Google Pay Number", placeholder: "9876543210", inputMode: "tel" },
  ],
  paytm: [
    { key: "accountHolderName", label: "Account Holder Name", placeholder: "Name registered on Paytm" },
    { key: "phoneNumber", label: "Paytm Number", placeholder: "9876543210", inputMode: "tel" },
  ],
  bank_transfer: [
    { key: "accountHolderName", label: "Account Holder Name", placeholder: "As it appears on your bank account" },
    { key: "bankName", label: "Bank Name", placeholder: "HDFC Bank" },
    { key: "accountNumber", label: "Account Number", placeholder: "50100123456789", inputMode: "tel" },
    { key: "ifsc", label: "IFSC Code", placeholder: "HDFC0001234" },
  ],
};

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_PATTERN = /^[\w.-]{2,}@[a-zA-Z]{2,}$/;

interface BankDetailsModalProps {
  open: boolean;
  /** The employee's full payout record, if any. */
  bank: EmployeeBank | null;
  /** The account being edited. Omit to add a new one. */
  account?: PayoutAccount | null;
  /** Blocking mode hides the close button and shows why this is required. */
  required?: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function BankDetailsModal({
  open, bank, account, required = false, onClose, onSaved,
}: BankDetailsModalProps) {
  const user = useAuthStore(s => s.user);
  const { toast } = useToast();

  // Editing a specific account, or the primary one, or starting fresh.
  const editing = account ?? (required ? null : primaryAccount(bank));

  const [method, setMethod] = useState<PayoutMethod>(editing?.method ?? "upi");
  const [values, setValues] = useState<Record<FieldKey, string>>({
    accountHolderName: "", upiId: "", phoneNumber: "", bankName: "", accountNumber: "", ifsc: "",
  });
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [saving, setSaving] = useState(false);

  const wasVerified = !!editing?.verified;

  // Re-seed from the saved record whenever the modal opens or the record changes.
  useEffect(() => {
    if (!open) return;
    setMethod(editing?.method ?? "upi");
    setValues({
      accountHolderName: editing?.accountHolderName ?? user?.name ?? "",
      upiId: editing?.upiId ?? "",
      phoneNumber: editing?.phoneNumber ?? user?.phone ?? "",
      bankName: editing?.bankName ?? "",
      accountNumber: editing?.accountNumber ?? "",
      ifsc: editing?.ifsc ?? "",
    });
    setTouched({});
  }, [open, editing, user?.name, user?.phone]);

  const fields = METHOD_FIELDS[method];

  /** Per-field validation, surfaced only after the field has been touched or a save attempted. */
  const errors = useMemo(() => {
    const out: Partial<Record<FieldKey, string>> = {};
    const required = new Set(missingBankFields({ ...values, method } as Partial<PayoutAccount>));

    for (const field of fields) {
      const value = values[field.key].trim();
      const isOptional = field.label.includes("(optional)");

      if (!value) {
        if (!isOptional && required.has(field.key)) out[field.key] = "Required";
        continue;
      }
      if (field.key === "phoneNumber" && value.replace(/\D/g, "").length < 10) {
        out[field.key] = "Enter a valid 10-digit number";
      }
      if (field.key === "ifsc" && !IFSC_PATTERN.test(value.toUpperCase())) {
        out[field.key] = "Format: ABCD0123456";
      }
      if (field.key === "upiId" && !UPI_PATTERN.test(value)) {
        out[field.key] = "Format: yourname@bank";
      }
      if (field.key === "accountNumber" && value.replace(/\D/g, "").length < 6) {
        out[field.key] = "Enter a valid account number";
      }
    }
    return out;
  }, [values, method, fields]);

  const isValid = Object.keys(errors).length === 0
    && missingBankFields({ ...values, method } as Partial<PayoutAccount>).length === 0;

  const setField = (key: FieldKey, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setTouched(prev => ({ ...prev, [key]: true }));
  };

  const handleSave = async () => {
    if (!user || !isValid) return;
    setSaving(true);
    try {
      await savePayoutAccount(
        user.uid,
        bank,
        {
          id: editing?.id ?? `pa_${Date.now()}`,
          isPrimary: editing?.isPrimary ?? true,
          method,
          accountHolderName: values.accountHolderName.trim(),
          ...(values.upiId.trim() ? { upiId: values.upiId.trim() } : {}),
          ...(values.phoneNumber.trim() ? { phoneNumber: values.phoneNumber.trim() } : {}),
          ...(values.bankName.trim() ? { bankName: values.bankName.trim() } : {}),
          ...(values.accountNumber.trim() ? { accountNumber: values.accountNumber.trim() } : {}),
          ...(values.ifsc.trim() ? { ifsc: values.ifsc.trim().toUpperCase() } : {}),
        },
        { uid: user.uid, name: user.name },
      );
      toast({ title: "Payout details saved", description: "Your admin will verify them before the next payout." });
      onSaved?.();
      onClose();
    } catch (error) {
      console.error("Failed to save payout details:", error);
      toast({ title: "Could not save", description: "Please check your connection and try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => !required && !saving && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bank-modal-title"
    >
      <div
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card shadow-2xl sm:max-w-lg sm:rounded-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Banknote className="h-5 w-5" />
            </div>
            <div>
              <h2 id="bank-modal-title" className="font-display text-base font-bold text-foreground">
                {editing ? "Your payout details" : "Where should we send your salary?"}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                We need this to transfer your salary on payday.
              </p>
            </div>
          </div>
          {!required && (
            <button
              onClick={onClose}
              disabled={saving}
              aria-label="Close"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="space-y-5 px-5 py-5">
          {required && (
            <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-xs leading-relaxed text-foreground">
                Your salary is being calculated, but we can't transfer it until these details are complete.
                It only takes a minute.
              </p>
            </div>
          )}

          {/* Verified details stay editable — they're the employee's own. Changing them just
              sends the account back for re-verification before the next transfer. */}
          {wasVerified && (
            <div className="flex items-start gap-2.5 rounded-xl border border-info/30 bg-info/10 px-3.5 py-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-info" />
              <p className="text-xs leading-relaxed text-foreground">
                These details are verified. If you change them, your admin will simply verify the
                new details before your next salary is transferred.
              </p>
            </div>
          )}

          {/* Method picker */}
          <fieldset disabled={saving}>
            <legend className="mb-2 text-xs font-semibold text-muted-foreground">Payment Method</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PAYOUT_METHODS.map(m => {
                const Icon = METHOD_ICON[m];
                const active = method === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    aria-pressed={active}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition-all ${
                      active
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:bg-accent disabled:hover:border-border"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{PAYOUT_METHOD_LABELS[m]}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Fields */}
          <fieldset disabled={saving} className="space-y-3.5">
            {fields.map(field => {
              const error = errors[field.key];
              const showError = error && touched[field.key];
              return (
                <div key={field.key}>
                  <label htmlFor={`bank-${field.key}`} className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    {field.label}
                  </label>
                  <input
                    id={`bank-${field.key}`}
                    type="text"
                    inputMode={field.inputMode}
                    value={values[field.key]}
                    placeholder={field.placeholder}
                    onChange={e => setField(field.key, e.target.value)}
                    onBlur={() => setTouched(prev => ({ ...prev, [field.key]: true }))}
                    aria-invalid={!!showError}
                    aria-describedby={showError ? `bank-${field.key}-error` : undefined}
                    className={`w-full rounded-xl border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:ring-2 disabled:opacity-60 ${
                      showError
                        ? "border-destructive focus:ring-destructive/20"
                        : "border-border focus:border-primary/50 focus:ring-primary/20"
                    }`}
                  />
                  {showError && (
                    <p id={`bank-${field.key}-error`} className="mt-1 text-[11px] font-medium text-destructive">
                      {error}
                    </p>
                  )}
                </div>
              );
            })}
          </fieldset>
        </div>

        {/* Footer */}
        {(
          <div className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-card px-5 py-4">
            {required ? (
              <button
                onClick={onClose}
                disabled={saving}
                className="rounded-xl border border-border px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                Remind me later
              </button>
            ) : (
              <button
                onClick={onClose}
                disabled={saving}
                className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!isValid || saving}
              onMouseDown={() => setTouched({
                accountHolderName: true, upiId: true, phoneNumber: true,
                bankName: true, accountNumber: true, ifsc: true,
              })}
              className="ml-auto flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              <span>{saving ? "Saving..." : "Save details"}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

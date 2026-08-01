import { useState } from "react";
import { format } from "date-fns";
import { Check, Loader2, PenTool, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { uploadToCloudinary } from "@/services/cloudinary";
import { clearCompanySignature, saveCompanySignature, saveSignatoryDesignation } from "@/services/hr";
import { departmentOfRole, DEPARTMENT_LABELS, SIGNATORY_TITLE } from "@/utils/hrPolicy";
import SignaturePad from "@/components/agreement/SignaturePad";

/**
 * The signatory's signature, uploaded once and reused on every document they issue.
 *
 * This is the whole point of the feature: a tech admin signs the technical team's papers and a
 * sales head signs the sales team's, and neither should have to sign each letter by hand. They
 * store it here — drawn or photographed — and every offer letter, appointment letter, NDA,
 * confirmation and relieving letter their department issues carries it automatically.
 *
 * Lives in Settings because that is where an admin's own profile lives; members use the same pad
 * inside a document to sign their own copy.
 */
export default function CompanySignatureCard() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const department = departmentOfRole(user?.role);
  const [designation, setDesignation] = useState(
    user?.designation || (department ? SIGNATORY_TITLE[department] : ""),
  );
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingDesignation, setSavingDesignation] = useState(false);

  if (!user) return null;

  const signatureUrl = user.signatureUrl || "";
  const updatedAt = (user.signatureUpdatedAt as { seconds?: number } | null)?.seconds;

  const handleSave = async (file: File) => {
    setSaving(true);
    try {
      const url = await uploadToCloudinary(file);
      await saveCompanySignature(user.uid, url, designation.trim() || undefined);
      setUser({
        ...user,
        signatureUrl: url,
        designation: designation.trim() || user.designation,
        signatureUpdatedAt: { seconds: Math.floor(Date.now() / 1000) },
      });
      setEditing(false);
      toast({
        title: "Signature saved",
        description: "It will now be applied automatically to every document you issue.",
      });
    } catch {
      toast({ title: "Error", description: "Could not save your signature. Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDesignation = async () => {
    setSavingDesignation(true);
    try {
      await saveSignatoryDesignation(user.uid, designation.trim());
      setUser({ ...user, designation: designation.trim() });
      toast({ title: "Saved", description: "Designation updated." });
    } catch {
      toast({ title: "Error", description: "Could not save the designation.", variant: "destructive" });
    } finally {
      setSavingDesignation(false);
    }
  };

  const handleRemove = async () => {
    const { confirmed } = await confirm({
      title: "Remove your signature?",
      description:
        "Documents you already issued keep the signature they were issued with. New documents will have no signature until you add one again.",
      confirmText: "Remove",
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      await clearCompanySignature(user.uid);
      setUser({ ...user, signatureUrl: null });
      toast({ title: "Signature removed" });
    } catch {
      toast({ title: "Error", description: "Could not remove the signature.", variant: "destructive" });
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 md:p-6" data-test="company-signature-card">
      {ConfirmDialog}

      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
            <PenTool size={16} /> My Signature
          </h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            Sign once here and it is applied automatically to every HR document you issue
            {department ? ` to the ${DEPARTMENT_LABELS[department].toLowerCase()} team` : ""} — offer
            letters, appointment letters, NDAs, confirmation and relieving letters.
          </p>
        </div>
        {signatureUrl && !editing && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success shrink-0">
            <ShieldCheck className="h-3 w-3" /> On file
          </span>
        )}
      </div>

      <div className="mb-4">
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Designation printed under your signature
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            placeholder={department ? SIGNATORY_TITLE[department] : "e.g. Technical Head"}
            data-test="signatory-designation"
            className="h-10 flex-1 min-w-[200px] px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary"
          />
          <button
            onClick={handleSaveDesignation}
            disabled={savingDesignation || !designation.trim() || designation.trim() === user.designation}
            className="h-10 px-4 rounded-lg border border-border bg-background text-foreground text-sm font-medium hover:bg-accent disabled:opacity-40 flex items-center gap-2"
          >
            {savingDesignation ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
          </button>
        </div>
      </div>

      {signatureUrl && !editing ? (
        <div>
          <div
            className="rounded-lg border border-dashed border-border bg-white p-4 flex items-center justify-center"
            style={{ colorScheme: "light" }}
          >
            <img
              src={signatureUrl}
              alt="Your signature"
              data-test="signature-preview"
              className="h-20 object-contain mix-blend-multiply"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setEditing(true)}
              className="h-9 px-4 rounded-lg border border-border bg-background text-foreground text-xs font-semibold hover:bg-accent flex items-center gap-2"
            >
              <RefreshCw size={13} /> Replace signature
            </button>
            <button
              onClick={handleRemove}
              className="h-9 px-4 rounded-lg text-xs font-semibold text-destructive hover:bg-destructive/10 flex items-center gap-2"
            >
              <Trash2 size={13} /> Remove
            </button>
            {updatedAt && (
              <span className="text-[11px] text-muted-foreground">
                Updated {format(new Date(updatedAt * 1000), "dd MMM yyyy")}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div>
          <SignaturePad onSave={handleSave} saving={saving} saveLabel="Save my signature" />
          {signatureUrl && (
            <button
              onClick={() => setEditing(false)}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel — keep the signature I already have
            </button>
          )}
          {!signatureUrl && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Until a signature is on file, documents you issue will print an empty signature line.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

import { useRef, useState } from "react";
import {
  Check, Eye, EyeOff, FileUp, IdCard, Loader2, Paperclip, Pencil, Trash2, Upload, X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { uploadToCloudinary } from "@/services/cloudinary";
import { addKycDocument, removeKycDocument, saveEmployeeProfile } from "@/services/hr";
import type { Actor } from "@/services/hr";
import { cleanId, formatAadhaar, isValidAadhaar, isValidPan, kycCompletion, maskIdentifier } from "@/utils/hrPolicy";
import { KYC_DOC_LABELS } from "@/types/hr";
import type { EmployeeProfile, KycDocKind } from "@/types/hr";
import { EmptyState, Field, Input, SectionCard, Select, Textarea } from "./ui";

/**
 * The joining-day information pack.
 *
 * Only what a company actually needs to employ and pay someone — identity, contact, an emergency
 * number, tax identifiers and the certificates that back them up. PAN and Aadhaar are masked by
 * default and revealed on an explicit click, because a page that shows them by default gets
 * screenshotted, shoulder-read and shared without anyone deciding to.
 */
export default function KycPanel({ profile, actor, readOnly }: {
  profile: EmployeeProfile;
  actor: Actor;
  readOnly?: boolean;
}) {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(profile);
  const [revealed, setRevealed] = useState(false);
  const [uploading, setUploading] = useState<"photo" | "document" | null>(null);
  const [docKind, setDocKind] = useState<KycDocKind>("aadhaar");
  const photoInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);

  const kyc = kycCompletion(profile);

  const set = <K extends keyof EmployeeProfile>(key: K, v: EmployeeProfile[K]) =>
    setForm((prev) => ({ ...prev, [key]: v }));

  // A blank identifier is fine — not everyone's papers arrive on day one. A wrong one is not:
  // it is discovered when payroll or a statutory filing needs it, which is far too late.
  const panError = form.pan?.trim() && !isValidPan(form.pan) ? "PAN should look like ABCDE1234F." : "";
  const aadhaarError = form.aadhaar?.trim() && !isValidAadhaar(form.aadhaar)
    ? "That is not a valid Aadhaar number — check the 12 digits."
    : "";

  const handleSave = async () => {
    if (panError || aadhaarError) {
      toast({ title: "Check the ID numbers", description: panError || aadhaarError, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await saveEmployeeProfile(profile.uid, {
        dob: form.dob || null,
        personalEmail: form.personalEmail?.trim() || null,
        altPhone: form.altPhone?.trim() || null,
        bloodGroup: form.bloodGroup?.trim() || null,
        currentAddress: form.currentAddress?.trim() || null,
        permanentAddress: form.permanentAddress?.trim() || null,
        pan: cleanId(form.pan) || null,
        aadhaar: cleanId(form.aadhaar) || null,
        emergencyContact: form.emergencyContact?.phone
          ? {
            name: form.emergencyContact.name?.trim() || "",
            relation: form.emergencyContact.relation?.trim() || "",
            phone: form.emergencyContact.phone.trim(),
          }
          : null,
      }, actor);
      toast({ title: "Saved", description: "Employee information updated." });
      setEditing(false);
    } catch {
      toast({ title: "Error", description: "Could not save the information.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Clear the input's value after handling it. Without this, re-picking the SAME file — which is
   * exactly what someone does after a failed upload — fires no change event at all and the button
   * looks dead.
   */
  const consume = (e: React.ChangeEvent<HTMLInputElement>): File | undefined => {
    const file = e.target.files?.[0];
    e.target.value = "";
    return file;
  };

  const handlePhoto = async (file?: File) => {
    if (!file) return;
    setUploading("photo");
    try {
      const url = await uploadToCloudinary(file);
      await saveEmployeeProfile(profile.uid, { photoUrl: url }, actor);
      toast({ title: "Photo updated" });
    } catch {
      toast({ title: "Error", description: "Could not upload the photo.", variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  const handleDocument = async (file?: File) => {
    if (!file) return;
    setUploading("document");
    try {
      const url = await uploadToCloudinary(file);
      await addKycDocument(profile, {
        id: `${Date.now()}`,
        kind: docKind,
        label: file.name,
        url,
        uploadedByName: actor.name,
      }, actor);
      toast({ title: "Uploaded", description: `${KYC_DOC_LABELS[docKind]} added.` });
    } catch {
      toast({ title: "Error", description: "Could not upload the file.", variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  const handleRemoveDocument = async (id: string, label: string) => {
    const { confirmed } = await confirm({
      title: "Remove this file?",
      description: `${label} will be removed from the employee's record.`,
      confirmText: "Remove",
      variant: "destructive",
    });
    if (!confirmed) return;
    await removeKycDocument(profile, id, actor);
  };

  const emergency = profile.emergencyContact;

  return (
    <div className="space-y-4">
      {ConfirmDialog}

      <SectionCard
        title="Employee information & KYC"
        icon={<IdCard size={15} className="text-primary" />}
        action={readOnly ? null : editing ? (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent">
              <X size={13} /> Cancel
            </button>
            <button onClick={handleSave} disabled={saving} data-test="save-kyc"
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
            </button>
          </div>
        ) : (
          <button onClick={() => { setForm(profile); setEditing(true); }} data-test="edit-kyc"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent">
            <Pencil size={13} /> Edit
          </button>
        )}
      >
        {/* Completeness — what is still missing, not a bare percentage */}
        <div className="mb-4 rounded-lg border border-border bg-background px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-foreground">
              {kyc.complete ? "All required information on file" : `${kyc.done} of ${kyc.total} on file`}
            </span>
            <span className={`text-xs font-semibold ${kyc.complete ? "text-success" : "text-warning"}`}>{kyc.percent}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className={`h-full rounded-full ${kyc.complete ? "bg-success" : "bg-warning"}`} style={{ width: `${kyc.percent}%` }} />
          </div>
          {!kyc.complete && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">Still needed: {kyc.missing.join(", ")}</p>
          )}
        </div>

        <div className="flex flex-wrap items-start gap-4">
          {/* Photograph */}
          <div className="shrink-0">
            <div className="h-24 w-20 overflow-hidden rounded-lg border border-border bg-muted">
              {profile.photoUrl
                ? <img src={profile.photoUrl} alt="Employee" className="h-full w-full object-cover" />
                : <div className="flex h-full w-full items-center justify-center text-muted-foreground/30"><IdCard size={24} /></div>}
            </div>
            {!readOnly && (
              <>
                <input ref={photoInput} type="file" accept="image/*" className="hidden"
                  data-test="photo-input"
                  onChange={(e) => handlePhoto(consume(e))} />
                <button onClick={() => photoInput.current?.click()} disabled={uploading === "photo"}
                  className="mt-1.5 inline-flex h-7 w-20 items-center justify-center gap-1 rounded-lg border border-border text-[10px] font-medium text-muted-foreground hover:bg-accent disabled:opacity-50">
                  {uploading === "photo" ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />} Photo
                </button>
              </>
            )}
          </div>

          <div className="min-w-[240px] flex-1">
            {editing ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Date of birth" type="date" value={form.dob || ""} onChange={(e) => set("dob", e.target.value)} data-test="kyc-dob" />
                <Input label="Blood group" value={form.bloodGroup || ""} placeholder="O+" onChange={(e) => set("bloodGroup", e.target.value)} />
                <Input label="Personal email" type="email" value={form.personalEmail || ""} onChange={(e) => set("personalEmail", e.target.value)} />
                <Input label="Alternate phone" value={form.altPhone || ""} onChange={(e) => set("altPhone", e.target.value)} />
                <div>
                  <Input label="PAN" value={form.pan || ""} placeholder="ABCDE1234F"
                    onChange={(e) => set("pan", e.target.value.toUpperCase())} data-test="kyc-pan" />
                  {panError && <p className="mt-1 text-[11px] text-destructive" data-test="pan-error">{panError}</p>}
                </div>
                <div>
                  <Input label="Aadhaar" value={form.aadhaar || ""} placeholder="1111 2222 3333"
                    inputMode="numeric" onChange={(e) => set("aadhaar", e.target.value)} data-test="kyc-aadhaar" />
                  {aadhaarError && <p className="mt-1 text-[11px] text-destructive" data-test="aadhaar-error">{aadhaarError}</p>}
                </div>
                <Textarea label="Current address" rows={2} value={form.currentAddress || ""} onChange={(e) => set("currentAddress", e.target.value)} className="sm:col-span-2" />
                <Textarea label="Permanent address" rows={2} value={form.permanentAddress || ""} onChange={(e) => set("permanentAddress", e.target.value)} className="sm:col-span-2" />
                <Input label="Emergency contact name" value={form.emergencyContact?.name || ""}
                  onChange={(e) => set("emergencyContact", { name: e.target.value, relation: form.emergencyContact?.relation || "", phone: form.emergencyContact?.phone || "" })} />
                <Input label="Relationship" value={form.emergencyContact?.relation || ""} placeholder="Father"
                  onChange={(e) => set("emergencyContact", { name: form.emergencyContact?.name || "", relation: e.target.value, phone: form.emergencyContact?.phone || "" })} />
                <Input label="Emergency contact number" value={form.emergencyContact?.phone || ""}
                  onChange={(e) => set("emergencyContact", { name: form.emergencyContact?.name || "", relation: form.emergencyContact?.relation || "", phone: e.target.value })}
                  className="sm:col-span-2" data-test="kyc-emergency-phone" />
              </div>
            ) : (
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Date of birth" value={profile.dob} />
                <Field label="Blood group" value={profile.bloodGroup} />
                <Field label="Personal email" value={profile.personalEmail} />
                <Field label="Alternate phone" value={profile.altPhone} mono />
                <Field
                  label="PAN"
                  value={profile.pan ? (
                    <span className="inline-flex items-center gap-1.5 font-mono">
                      {revealed ? profile.pan : maskIdentifier(profile.pan)}
                    </span>
                  ) : null}
                />
                <Field
                  label="Aadhaar"
                  value={profile.aadhaar ? (
                    <span className="inline-flex items-center gap-1.5 font-mono">
                      {revealed ? formatAadhaar(profile.aadhaar) : maskIdentifier(profile.aadhaar)}
                    </span>
                  ) : null}
                />
                <Field label="Current address" value={profile.currentAddress} className="sm:col-span-2" />
                <Field label="Permanent address" value={profile.permanentAddress} className="sm:col-span-2" />
                <Field
                  label="Emergency contact"
                  value={emergency?.phone ? `${emergency.name || "—"}${emergency.relation ? ` (${emergency.relation})` : ""} · ${emergency.phone}` : null}
                  className="sm:col-span-2"
                />
                {(profile.pan || profile.aadhaar) && (
                  <button onClick={() => setRevealed((v) => !v)} data-test="reveal-ids"
                    className="inline-flex h-7 w-fit items-center gap-1.5 self-end rounded-lg border border-border px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-accent">
                    {revealed ? <EyeOff size={11} /> : <Eye size={11} />} {revealed ? "Hide IDs" : "Reveal IDs"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Uploaded documents"
        icon={<Paperclip size={15} className="text-primary" />}
        action={readOnly ? null : (
          <div className="flex items-center gap-2">
            <select value={docKind} onChange={(e) => setDocKind(e.target.value as KycDocKind)}
              className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none">
              {(Object.keys(KYC_DOC_LABELS) as KycDocKind[]).map((k) => (
                <option key={k} value={k}>{KYC_DOC_LABELS[k]}</option>
              ))}
            </select>
            <input ref={docInput} type="file" accept="image/*,application/pdf" className="hidden"
              data-test="kyc-doc-input"
              onChange={(e) => handleDocument(consume(e))} />
            <button onClick={() => docInput.current?.click()} disabled={uploading === "document"}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {uploading === "document" ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />} Upload
            </button>
          </div>
        )}
      >
        {(profile.kycDocuments || []).length === 0 ? (
          <EmptyState icon={<Paperclip size={24} />} title="No files uploaded"
            hint="Aadhaar, PAN, education and experience certificates." />
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {(profile.kycDocuments || []).map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {KYC_DOC_LABELS[d.kind]}
                </span>
                <a href={d.url} target="_blank" rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-sm text-foreground hover:underline">
                  {d.label}
                </a>
                <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">by {d.uploadedByName}</span>
                {!readOnly && (
                  <button onClick={() => handleRemoveDocument(d.id, d.label)} title="Remove"
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

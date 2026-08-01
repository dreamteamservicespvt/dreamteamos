import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, FileSignature, Loader2, PenTool, Send, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { HR_DOCUMENT_LABELS } from "@/types/hr";
import type { AppUser } from "@/types";
import type { EmployeeProfile, HrDocumentType } from "@/types/hr";
import { issueDocument } from "@/services/hrDocuments";
import { documentTypesForStage, requiresEmployeeSignature, todayIso, SIGNATORY_TITLE } from "@/utils/hrPolicy";
import {
  EXTRA_FIELDS, EXTRA_FIELD_KIND, EXTRA_FIELD_LABELS, EXTRA_FIELD_REQUIRED, buildDocument,
} from "@/utils/hrTemplates";
import type { HrDocumentExtras } from "@/utils/hrTemplates";
import AgreementView from "@/components/agreement/AgreementView";
import { Input, Select, Textarea } from "./ui";

/**
 * Issue a document to an employee.
 *
 * The letter is generated from the employee's own record — designation, engagement, joining date,
 * salary, working hours — so the admin fills in only what the profile cannot know (a warning's
 * facts, an increment's new figure, an exit's last working day). What they preview is exactly
 * what is stored and exactly what the employee will see.
 *
 * The company's signature is applied here, automatically, from whatever the signatory saved in
 * their settings. Without one the letter would go out with an empty signature line, so issuing is
 * held until they have added it — once, ever.
 */
export default function IssueDocumentDialog({ member, profile, signatory, settingsPath, defaultType, memberLink, onClose, onIssued }: {
  member: AppUser;
  profile: EmployeeProfile;
  /** The admin issuing it — their stored signature signs the document. */
  signatory: AppUser;
  /** Where they go to add a signature if they have none yet. */
  settingsPath: string;
  defaultType?: HrDocumentType;
  memberLink?: string;
  onClose: () => void;
  onIssued?: (id: string) => void;
}) {
  const { toast } = useToast();
  const available = useMemo(() => {
    const forStage = documentTypesForStage(profile.stage);
    const all = Object.keys(HR_DOCUMENT_LABELS) as HrDocumentType[];
    // Stage-appropriate types first, then the rest — never hide a document an admin needs.
    return [...forStage, ...all.filter((t) => !forStage.includes(t))];
  }, [profile.stage]);

  const [type, setType] = useState<HrDocumentType>(defaultType || available[0]);
  const [extras, setExtras] = useState<HrDocumentExtras>({});
  const [issuedOn, setIssuedOn] = useState(todayIso());
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);

  const designation = signatory.designation
    || SIGNATORY_TITLE[profile.department]
    || "Authorised Signatory";

  const fields = EXTRA_FIELDS[type];
  const required = EXTRA_FIELD_REQUIRED[type] || [];
  const missing = required.filter((f) => {
    const v = extras[f];
    return v === undefined || v === null || `${v}`.trim() === "";
  });

  const built = useMemo(
    () => buildDocument({
      type,
      subject: {
        name: member.name,
        phone: member.phone,
        email: member.email,
        employeeId: member.employeeId,
      },
      profile,
      signatory: { name: signatory.name, designation },
      issuedOn,
      extras,
    }),
    [type, member, profile, signatory.name, designation, issuedOn, extras],
  );

  const hasSignature = !!signatory.signatureUrl;

  const setExtra = (key: keyof HrDocumentExtras, value: string) =>
    setExtras((prev) => ({
      ...prev,
      [key]: EXTRA_FIELD_KIND[key] === "number" ? (value === "" ? null : Number(value)) : value,
    }));

  const handleIssue = async () => {
    if (!hasSignature) return;
    if (missing.length > 0) {
      toast({
        title: "Missing information",
        description: `${missing.map((m) => EXTRA_FIELD_LABELS[m]).join(", ")} — this letter cannot be written without it.`,
        variant: "destructive",
      });
      return;
    }
    setSending(true);
    try {
      const id = await issueDocument({
        document: {
          memberId: member.uid,
          memberName: member.name,
          memberPhone: member.phone || "",
          memberRole: member.role,
          department: profile.department,
          type,
          title: built.title,
          bodyText: built.bodyText,
          issuedById: signatory.uid,
          issuedByName: signatory.name,
          issuedByDesignation: designation,
          companySignatureUrl: signatory.signatureUrl || null,
          issuedOn,
          requiresEmployeeSignature: requiresEmployeeSignature(type),
        },
        memberLink,
      });
      toast({
        title: "Document issued",
        description: requiresEmployeeSignature(type)
          ? `${member.name} has been asked to sign their ${HR_DOCUMENT_LABELS[type].toLowerCase()}.`
          : `${member.name} can now view and download it from their profile.`,
      });
      onIssued?.(id);
      onClose();
    } catch {
      toast({ title: "Error", description: "Could not issue the document.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-2 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div
        className="mx-auto my-4 w-full max-w-3xl rounded-xl border border-border bg-card p-4 md:p-5"
        onClick={(e) => e.stopPropagation()}
        data-test="issue-document-dialog"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display flex items-center gap-2 text-lg font-bold text-foreground">
              <FileSignature size={18} className="text-primary" /> Issue a document
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              To {member.name} · generated from their employment record and signed by you.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        {!hasSignature && (
          <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5" data-test="no-signature-warning">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
              <PenTool size={13} /> You have not added your signature yet
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Every document you issue carries your signature automatically. Add it once in Settings
              and you will never have to sign a letter by hand again.
            </p>
            <Link
              to={settingsPath}
              className="mt-2 inline-flex h-8 items-center rounded-lg bg-warning px-3 text-[11px] font-semibold text-warning-foreground hover:opacity-90"
            >
              Add my signature →
            </Link>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Document" value={type} onChange={(e) => { setType(e.target.value as HrDocumentType); setExtras({}); setShowPreview(false); }} data-test="document-type">
            {available.map((t) => (
              <option key={t} value={t}>{HR_DOCUMENT_LABELS[t]}</option>
            ))}
          </Select>
          <Input label="Dated" type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
        </div>

        {fields.length > 0 && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {fields.map((field) => {
              const kind = EXTRA_FIELD_KIND[field];
              const label = EXTRA_FIELD_LABELS[field] + (required.includes(field) ? " *" : "");
              const raw = extras[field];
              const value = raw === null || raw === undefined ? "" : String(raw);
              if (kind === "textarea") {
                return (
                  <Textarea
                    key={field} label={label} rows={3} value={value}
                    onChange={(e) => setExtra(field, e.target.value)}
                    className="sm:col-span-2"
                    data-test={`extra-${field}`}
                  />
                );
              }
              return (
                <Input
                  key={field} label={label} type={kind === "number" ? "number" : kind === "date" ? "date" : "text"}
                  value={value} onChange={(e) => setExtra(field, e.target.value)}
                  data-test={`extra-${field}`}
                />
              );
            })}
          </div>
        )}

        <Textarea
          label="Anything else this letter must say (optional)"
          rows={2}
          value={extras.additionalTerms || ""}
          onChange={(e) => setExtra("additionalTerms", e.target.value)}
          className="mt-3"
        />

        <p className="mt-3 rounded-lg bg-accent/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          These templates are a professional baseline for an Indian employer, not legal advice.
          Have them reviewed once by an employment/labour-law professional for your state — the
          labour-code framework has had significant implementation updates recently.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowPreview((v) => !v)}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-accent"
          >
            <Eye size={15} /> {showPreview ? "Hide preview" : "Preview"}
          </button>
          <button
            onClick={handleIssue}
            disabled={sending || !hasSignature}
            data-test="issue-document-submit"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {sending ? "Issuing…" : requiresEmployeeSignature(type) ? "Issue for signature" : "Issue document"}
          </button>
          {hasSignature && (
            <span className="text-[11px] text-muted-foreground">
              Signed as {signatory.name} · {designation}
            </span>
          )}
        </div>

        {showPreview && (
          <div className="mt-4 overflow-x-auto rounded-lg bg-slate-200 p-2 md:p-4">
            <AgreementView
              bodyText={built.bodyText}
              memberName={member.name}
              memberPhone={member.phone}
              companySignatureUrl={signatory.signatureUrl}
              companySignedName={signatory.name}
              companyDesignation={designation}
              companySignedDate={issuedOn}
            />
          </div>
        )}
      </div>
    </div>
  );
}

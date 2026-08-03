import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Download, Eye, FileSignature, Loader2, PenTool, Printer, Send, ShieldQuestion, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompany";
import { useCompanyLogo } from "@/hooks/useCompanyLogo";
import { downloadAgreementPdf } from "@/utils/agreementPdf";
import { printAgreementElement } from "@/utils/agreementPrint";
import { awaitRendered } from "@/utils/awaitRendered";
import { HR_DOCUMENT_GROUPS, HR_DOCUMENT_LABELS } from "@/types/hr";
import { nextRole } from "@/utils/roleLadder";
import type { AppUser } from "@/types";
import type { EmployeeProfile, HrDocumentType } from "@/types/hr";
import { allocateReference, issueDocument } from "@/services/hrDocuments";
import {
  DOCUMENT_SIGNATORIES, canIssue, documentTypesForStage, requiresEmployeeSignature, resolveSignatories,
  todayIso, SIGNATORY_TITLE,
} from "@/utils/hrPolicy";
import {
  EXTRA_FIELDS, EXTRA_FIELD_KIND, EXTRA_FIELD_LABELS, EXTRA_FIELD_REQUIRED, buildDocument,
} from "@/utils/hrTemplates";
import type { HrDocumentExtras } from "@/utils/hrTemplates";
import AgreementView from "@/components/agreement/AgreementView";
import { Input, Textarea } from "./ui";

/**
 * Issue a document to an employee.
 *
 * The letter is generated from the employee's own record — designation, engagement, joining date,
 * salary, working hours — so the admin fills in only what the profile cannot know (a warning's
 * facts, an increment's new figure, an exit's last working day). What they preview is exactly
 * what is stored and exactly what the employee will see.
 *
 * The company's signature is applied here automatically, and it is the *company's* — the CEO's, or
 * on an NDA the CEO's and the CTO's, from Settings → Company Documents. It is not whoever happened
 * to open this dialog: the same offer letter must look the same whichever admin generated it.
 * Where the company has not set an office up yet, the issuing admin signs instead, which is what
 * happened before officers existed. Without any signature at all the letter would go out with an
 * empty line, so issuing is held until there is one.
 */
export default function IssueDocumentDialog({
  member, profile, signatory, settingsPath, defaultType, memberLink, issuedTypes, onClose, onIssued,
}: {
  member: AppUser;
  profile: EmployeeProfile;
  /** What this member already holds, so the same letter is never issued to them twice by mistake. */
  issuedTypes?: HrDocumentType[];
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
  /** Stage-appropriate types first, then everything else — never hide a document an admin needs. */
  const suggested = useMemo(() => documentTypesForStage(profile.stage), [profile.stage]);

  const [type, setType] = useState<HrDocumentType>(defaultType || suggested[0]);
  const [extras, setExtras] = useState<HrDocumentExtras>({});
  /** The rung above this employee's current one, where they are on the ladder at all. */
  const promotion = useMemo(
    () => nextRole(profile.designation, profile.department),
    [profile.designation, profile.department],
  );
  const [issuedOn, setIssuedOn] = useState(todayIso());
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  /**
   * Whether a taken-away copy carries the marks.
   *
   * Unticked prints ruled lines instead, for a letter that is going to be signed and stamped by
   * hand. It changes only what is downloaded or printed — the document that gets ISSUED always
   * carries the company's signature, because an unsigned letter in somebody's account is not a
   * letter.
   */
  const [includeMarks, setIncludeMarks] = useState(true);
  const paperRef = useRef<HTMLDivElement>(null);
  const logo = useCompanyLogo();
  const { company, assets: marks, officer } = useCompany();
  const already = new Set(issuedTypes || []);

  const designation = signatory.designation
    || SIGNATORY_TITLE[profile.department]
    || "Authorised Signatory";

  /**
   * Who will sign this, resolved now so the preview shows exactly what will be stored.
   *
   * Recomputed per document type because the answer genuinely differs: an NDA needs the CTO as
   * well, and the policy acknowledgement needs nobody at all.
   */
  const signatories = useMemo(
    () => resolveSignatories(
      type,
      { ceo: officer("ceo"), cto: officer("cto") },
      { name: signatory.name, designation, signatureUrl: signatory.signatureUrl },
    ),
    // Keyed on `marks` — the settings document itself — rather than on `officer`, which is a fresh
    // closure on every render and would rebuild this (and the letter below it) continuously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [type, marks, signatory.name, signatory.signatureUrl, designation],
  );

  /** True when the company's own offices signed; false when it fell back to the issuing admin. */
  const signedByOffice = signatories.length > 0 && signatories[0].key !== "issuer";
  /** Offices this document needs that have no signature on file yet. */
  const missingOffices = DOCUMENT_SIGNATORIES[type].filter(
    (k) => !signatories.some((s) => s.key === k),
  );

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
      signatory: signatories,
      issuedOn,
      extras,
      company,
      // The real reference is allocated at issue; the preview shows the shape without burning a
      // number every time somebody opens the dialog to look.
      referenceNo: null,
    }),
    [type, member, profile, signatories, issuedOn, extras, company],
  );

  const hasSignature = canIssue(signatories, type);

  const setExtra = (key: keyof HrDocumentExtras, value: string) =>
    setExtras((prev) => ({
      ...prev,
      [key]: EXTRA_FIELD_KIND[key] === "number" ? (value === "" ? null : Number(value)) : value,
    }));

  /**
   * Take the letter away before anyone commits to it.
   *
   * An admin sending an offer wants to read it properly, or show it to whoever approves salaries,
   * and "issue it and then download it" is the wrong order for a document that lands in somebody's
   * account the moment it exists. The preview has to be open, because the PDF is captured from the
   * rendered paper — so opening it is part of downloading it.
   */
  const handleDownload = async () => {
    if (downloading) return;
    setShowPreview(true);
    setDownloading(true);
    try {
      // Wait for the preview to be painted, rather than guessing at a delay.
      const paper = await awaitRendered(paperRef);
      await downloadAgreementPdf(paper, `${built.title.replace(/[^\w]+/g, "_")}_${member.name.replace(/[^\w]+/g, "_")}.pdf`);
    } catch {
      toast({ title: "Error", description: "Could not generate the PDF.", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  /**
   * The same trick as the download: open the preview first, because the paper only exists once it
   * is on screen. Printing straight to paper is what an admin does when the letter is going into a
   * file or being carried to somebody for a wet signature.
   */
  const handlePrint = async () => {
    if (printing) return;
    setShowPreview(true);
    setPrinting(true);
    try {
      await printAgreementElement(await awaitRendered(paperRef));
    } catch {
      toast({ title: "Error", description: "Could not open the print dialog.", variant: "destructive" });
    } finally {
      setPrinting(false);
    }
  };

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
      // The number is taken first, then baked into the text, so the reference printed on the page
      // is the reference in the register — not one added to the record afterwards.
      const referenceNo = await allocateReference(company.name, type, issuedOn);
      const final = referenceNo
        ? buildDocument({
          type,
          subject: {
            name: member.name, phone: member.phone, email: member.email, employeeId: member.employeeId,
          },
          profile,
          signatory: signatories,
          issuedOn,
          extras,
          company,
          referenceNo,
        })
        : built;

      const id = await issueDocument({
        document: {
          memberId: member.uid,
          memberName: member.name,
          memberPhone: member.phone || "",
          memberRole: member.role,
          department: profile.department,
          type,
          title: final.title,
          bodyText: final.bodyText,
          issuedById: signatory.uid,
          issuedByName: signatory.name,
          issuedByDesignation: designation,
          signatories,
          referenceNo,
          companyStampUrl: marks.stampUrl || null,
          // Kept in step with the first signatory so anything still reading the old single-signature
          // field — an older cached client, a report — sees the same signature the page shows.
          companySignatureUrl: signatories[0]?.signatureUrl || null,
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

        {already.has(type) && (
          <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5" data-test="already-issued-warning">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
              <Check size={13} /> {member.name} already has a {HR_DOCUMENT_LABELS[type].toLowerCase()}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Issuing another one does not replace it — they will hold two, and both count as issued
              by you. Do it only if the first was wrong.
            </p>
          </div>
        )}

        {profile.termsSelfDeclared && (
          <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5" data-test="unconfirmed-terms-warning">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
              <ShieldQuestion size={13} /> These terms were entered by {member.name}, not confirmed by you
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              The salary, designation and joining date below came from the employee's own profile.
              This letter prints them under your signature — check them on the Employment tab and
              press Confirm there first if they are right.
            </p>
          </div>
        )}

        {!hasSignature && (
          <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5" data-test="no-signature-warning">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
              <PenTool size={13} /> Nobody can sign this yet
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              This letter is signed by the company — upload the CEO's signature under Company
              Documents in Settings and every letter after it signs itself. Until then it would go
              out with an empty signature line, so it cannot be issued.
            </p>
            <Link
              to={settingsPath}
              className="mt-2 inline-flex h-8 items-center rounded-lg bg-warning px-3 text-[11px] font-semibold text-warning-foreground hover:opacity-90"
            >
              Open Company Documents →
            </Link>
          </div>
        )}

        {hasSignature && missingOffices.length > 0 && (
          <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5" data-test="missing-officer-warning">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
              <PenTool size={13} /> {missingOffices.map((k) => k.toUpperCase()).join(" and ")} signature not on file
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {HR_DOCUMENT_LABELS[type]} is normally signed by{" "}
              {DOCUMENT_SIGNATORIES[type].map((k) => k.toUpperCase()).join(" and ")}.
              {signedByOffice
                ? " It will go out signed by whoever is on file."
                : " It will go out under your own signature instead."}{" "}
              Add the missing one under Company Documents in Settings.
            </p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Document</label>
            {/*
              Grouped and in lifecycle order — hire, employ, discipline, part — because an admin
              reaching for the next letter scans down from the last one they sent. The documents
              that fit this employee's current stage are lifted to the top for the same reason.
            */}
            <select
              value={type}
              onChange={(e) => {
                const next = e.target.value as HrDocumentType;
                setType(next);
                /*
                  A promotion letter opens on the rung above the one they are on.
                  The ladder already knows what follows what and what it pays; making the admin
                  remember both is how somebody gets promoted into the right title on the wrong
                  money. Both fields stay editable.
                */
                setExtras(next === "promotion_letter" && promotion
                  ? { newDesignation: promotion.title, newCtcMonthly: promotion.monthlySalary }
                  : {});
                setShowPreview(false);
              }}
              data-test="document-type"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
            >
              {suggested.length > 0 && (
                <optgroup label={`Suggested at this stage — ${profile.stage.replace(/_/g, " ")}`}>
                  {suggested.map((t) => (
                    <option key={`s-${t}`} value={t}>
                      {HR_DOCUMENT_LABELS[t]}{already.has(t) ? " — already issued" : ""}
                    </option>
                  ))}
                </optgroup>
              )}
              {HR_DOCUMENT_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.types.map((t) => (
                    <option key={t} value={t}>
                      {HR_DOCUMENT_LABELS[t]}{already.has(t) ? " — already issued" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <Input label="Dated" type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
        </div>

        {type === "promotion_letter" && (
          <p className="mt-3 rounded-lg bg-accent/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground" data-test="promotion-step">
            {promotion
              ? <>Promoting <b className="text-foreground">{member.name}</b> from{" "}
                <b className="text-foreground">{profile.designation}</b> to{" "}
                <b className="text-foreground">{promotion.title}</b>. The new figures below are the
                ladder's — change them if this promotion was agreed on different terms.</>
              : <>{profile.designation || "This employee"} is not on the technical ladder, or is
                already at the top of it. Type the new designation and salary below.</>}
          </p>
        )}

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
            onClick={handlePrint}
            disabled={printing}
            data-test="print-before-issue"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            {printing ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
            {printing ? "Preparing…" : "Print"}
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            data-test="download-before-issue"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {downloading ? "Preparing…" : "Download PDF"}
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
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={includeMarks}
              onChange={(e) => setIncludeMarks(e.target.checked)}
              data-test="include-marks"
              className="rounded border-border"
            />
            Include signature &amp; stamp when printing
          </label>
          {hasSignature && (
            <span className="text-[11px] text-muted-foreground" data-test="signing-as">
              Signed by {signatories.map((s) => `${s.name} · ${s.designation}`).join("  +  ")}
            </span>
          )}
        </div>

        {showPreview && (
          <div className="mt-4 overflow-x-auto rounded-lg bg-slate-200 p-2 md:p-4">
            <AgreementView
              ref={paperRef}
              letterhead
              logoUrl={logo}
              bodyText={built.bodyText}
              memberName={member.name}
              memberPhone={member.phone}
              companySignatories={signatories}
              companySignedDate={issuedOn}
              companyStampUrl={marks.stampUrl}
              blankForSigning={!includeMarks}
            />
          </div>
        )}
      </div>
    </div>
  );
}

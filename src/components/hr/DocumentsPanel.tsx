import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, FileSignature, FileText, Loader2, Mail, Plus, Trash2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import {
  deleteDocument, documentsNeedingEmailRefresh, refreshDocumentEmails, signedDocumentsWithStaleEmail,
} from "@/services/hrDocuments";
import { letterEmail } from "@/utils/documentSubject";
import { CORE_EMPLOYMENT_DOCS } from "@/utils/hrPolicy";
import { HR_DOCUMENT_LABELS } from "@/types/hr";
import type { AppUser } from "@/types";
import type { EmployeeProfile, HrDocument, HrDocumentType } from "@/types/hr";
import HrDocumentModal from "./HrDocumentModal";
import IssueDocumentDialog from "./IssueDocumentDialog";
import { EmptyState, SectionCard } from "./ui";

const STATUS_CHIP: Record<HrDocument["status"], { label: string; className: string; Icon: typeof Clock }> = {
  issued: { label: "Awaiting signature", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400", Icon: Clock },
  signed: { label: "Signed", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", Icon: CheckCircle2 },
  declined: { label: "Not signed", className: "bg-rose-500/15 text-rose-600 dark:text-rose-400", Icon: XCircle },
};

/**
 * Every document this employee has been issued, and the three the company owes them.
 *
 * The checklist at the top is deliberate: an employee who has joined but never signed an NDA is
 * a fact worth seeing on the page, not one to be discovered a year later when it matters.
 */
export default function DocumentsPanel({ member, profile, documents, signatory, settingsPath, memberLink, readOnly, canSign }: {
  member: AppUser;
  profile: EmployeeProfile;
  documents: HrDocument[];
  /** The admin who would issue and sign. Absent for a read-only viewer. */
  signatory?: AppUser | null;
  settingsPath?: string;
  memberLink?: string;
  /** The viewer cannot issue or delete — i.e. the employee looking at their own record. */
  readOnly?: boolean;
  /** The viewer IS the employee, so an unsigned document opens with a signature pad. */
  canSign?: boolean;
}) {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [open, setOpen] = useState<HrDocument | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [issueType, setIssueType] = useState<HrDocumentType | undefined>(undefined);

  const signedTypes = new Set(documents.filter((d) => d.status === "signed").map((d) => d.type));
  const pending = documents.filter((d) => d.requiresEmployeeSignature && d.status === "issued").length;

  const handleDelete = async (doc: HrDocument) => {
    const { confirmed } = await confirm({
      title: "Delete this document?",
      description: doc.status === "signed"
        ? `"${doc.title}" is SIGNED. Deleting it destroys the signed record permanently — download the PDF first if you need a copy.`
        : `"${doc.title}" will be removed for both of you.`,
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!confirmed || !doc.id) return;
    try {
      await deleteDocument(doc);
      toast({ title: "Deleted", description: `${doc.title} was removed.` });
    } catch {
      toast({ title: "Error", description: "Could not delete the document.", variant: "destructive" });
    }
  };

  const openIssue = (type?: HrDocumentType) => { setIssueType(type); setIssuing(true); };

  /**
   * Letters still printing the wrong email.
   *
   * Every document this team holds was written before a personal email was collected, so they all
   * carry the login — an account the person loses the day they leave, which is one of the two days
   * the letter matters most. Unsigned ones can be corrected in place; signed ones are a record of
   * what was actually signed, so they are named here and left alone.
   */
  const letterTo = letterEmail(member, profile);
  const staleUnsigned = useMemo(
    () => (letterTo.isPersonal ? documentsNeedingEmailRefresh(documents, letterTo.email || "") : []),
    [documents, letterTo.isPersonal, letterTo.email],
  );
  const staleSigned = useMemo(
    () => (letterTo.isPersonal ? signedDocumentsWithStaleEmail(documents, letterTo.email || "") : []),
    [documents, letterTo.isPersonal, letterTo.email],
  );
  const [refreshing, setRefreshing] = useState(false);
  const handleRefreshEmails = async () => {
    setRefreshing(true);
    try {
      const n = await refreshDocumentEmails(documents, letterTo.email || "");
      toast({
        title: "Contact details updated",
        description: `${n} unsigned document${n === 1 ? "" : "s"} now show ${letterTo.email}.`,
      });
    } catch {
      toast({ title: "Error", description: "Could not update the documents.", variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SectionCard
      title="Documents"
      icon={<FileSignature size={15} className="text-primary" />}
      action={!readOnly && signatory ? (
        <button
          onClick={() => openIssue()}
          data-test="issue-document-btn"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={13} /> Issue document
        </button>
      ) : pending > 0 ? (
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
          {pending} to sign
        </span>
      ) : null}
    >
      {ConfirmDialog}

      {/* The address on the paperwork — flagged when it is not the one the employee keeps. */}
      {!readOnly && !letterTo.isPersonal && (
        <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5" data-test="no-personal-email">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
            <Mail size={13} /> No personal email on record
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Letters for {member.name} will print their login address, which stops working the day they
            leave — exactly when a relieving letter or an employment verification needs to reach them.
            Add a personal email under <b className="text-foreground">Personal &amp; KYC</b> first.
          </p>
        </div>
      )}

      {!readOnly && (staleUnsigned.length > 0 || staleSigned.length > 0) && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5" data-test="stale-email-notice">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Mail size={13} /> {staleUnsigned.length + staleSigned.length} document
            {staleUnsigned.length + staleSigned.length === 1 ? "" : "s"} print a different email
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {member.name}'s personal email is <b className="text-foreground">{letterTo.email}</b>.
            {staleUnsigned.length > 0 && ` ${staleUnsigned.length} unsigned document${staleUnsigned.length === 1 ? "" : "s"} can be corrected in place.`}
            {staleSigned.length > 0 && ` ${staleSigned.length} signed document${staleSigned.length === 1 ? "" : "s"} will not be touched — a signed letter has to keep saying what was signed. Re-issue ${staleSigned.length === 1 ? "it" : "them"} if the address matters.`}
          </p>
          {staleUnsigned.length > 0 && (
            <button
              onClick={handleRefreshEmails}
              disabled={refreshing}
              data-test="refresh-document-emails"
              className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {refreshing ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
              {refreshing ? "Updating…" : `Update ${staleUnsigned.length} unsigned document${staleUnsigned.length === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      )}

      {/* What every employee must have signed */}
      <div className="mb-4 grid gap-1.5 sm:grid-cols-3">
        {CORE_EMPLOYMENT_DOCS.map((type) => {
          const done = signedTypes.has(type);
          return (
            <div
              key={type}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[11px] ${
                done ? "border-emerald-500/30 bg-emerald-500/5" : "border-dashed border-border"
              }`}
            >
              {done
                ? <CheckCircle2 size={13} className="shrink-0 text-emerald-500" />
                : <AlertTriangle size={13} className="shrink-0 text-amber-500" />}
              <span className={`truncate ${done ? "text-foreground" : "text-muted-foreground"}`}>
                {HR_DOCUMENT_LABELS[type]}
              </span>
              {!done && !readOnly && signatory && (
                <button
                  onClick={() => openIssue(type)}
                  className="ml-auto shrink-0 text-[10px] font-semibold text-primary hover:underline"
                >
                  Issue
                </button>
              )}
            </div>
          );
        })}
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon={<FileText size={26} />}
          title="No documents issued yet"
          hint={readOnly ? "Your documents will appear here as they are issued." : "Start with the offer letter or the appointment letter."}
        />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {documents.map((doc) => {
            const chip = STATUS_CHIP[doc.status];
            return (
              <div key={doc.id} className="flex items-center gap-3 px-3 py-2.5">
                <button onClick={() => setOpen(doc)} className="group min-w-0 flex-1 text-left" data-test="hr-document-row">
                  <p className="truncate text-sm font-medium text-foreground underline-offset-2 group-hover:underline">
                    {HR_DOCUMENT_LABELS[doc.type]}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Issued {doc.issuedOn} by {doc.issuedByName}
                    {doc.signedDate ? ` · signed ${doc.signedDate}` : ""}
                  </p>
                </button>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${chip.className}`}>
                  <chip.Icon size={10} /> {doc.requiresEmployeeSignature ? chip.label : "Issued"}
                </span>
                {!readOnly && (
                  <button
                    onClick={() => handleDelete(doc)}
                    title="Delete"
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <HrDocumentModal
          document={open}
          canSign={canSign}
          signerName={member.name}
          onClose={() => setOpen(null)}
        />
      )}

      {issuing && signatory && (
        <IssueDocumentDialog
          issuedTypes={documents.map((d) => d.type)}
          member={member}
          profile={profile}
          signatory={signatory}
          settingsPath={settingsPath || "/"}
          defaultType={issueType}
          memberLink={memberLink}
          onClose={() => setIssuing(false)}
        />
      )}
    </SectionCard>
  );
}

/**
 * The people who never got their papers.
 *
 * This company hired most of its team before it had a system that issued letters, so almost
 * everyone is working without an offer letter or an appointment letter on file — which is fine
 * right up until somebody needs one for a bank loan, a visa, or a landlord, and there is nothing
 * to give them.
 *
 * Issuing them one at a time from twenty different profile pages is the sort of task that never
 * gets finished. This lists exactly who is missing what and issues the lot under the admin's own
 * signature, which is the only thing that makes a letter worth anything.
 *
 * Deliberately conservative:
 *  • Nobody is issued a letter they already hold — the check is per person, per type.
 *  • Anyone whose employment terms are blank is listed but NOT issued to, because their letter
 *    would print an empty salary and joining date under the admin's signature.
 *  • The admin sees the whole list, and what will happen, before anything is sent.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Check, FileSignature, Loader2, PenTool, Send } from "lucide-react";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { allocateReference, issueDocument } from "@/services/hrDocuments";
import { useCompany } from "@/hooks/useCompany";
import { buildDocument } from "@/utils/hrTemplates";
import { canIssue, requiresEmployeeSignature, resolveSignatories, todayIso, SIGNATORY_TITLE } from "@/utils/hrPolicy";
import { HR_DOCUMENT_LABELS } from "@/types/hr";
import type { AppUser } from "@/types";
import type { HrDocumentType } from "@/types/hr";
import { findMissingLetters, type MissingLettersRow } from "@/utils/missingLetters";

export { findMissingLetters };
export type { MissingLettersRow };

export default function MissingLettersPanel({ rows, signatory, settingsPath, memberLink, onDone }: {
  rows: MissingLettersRow[];
  /** The admin issuing — their stored signature signs every letter. */
  signatory: AppUser;
  settingsPath: string;
  /** Where a member is sent when they tap the notification. */
  memberLink?: (member: AppUser) => string;
  onDone?: () => void;
}) {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const { company, assets: marks, officer } = useCompany();

  const ready = useMemo(() => rows.filter((r) => r.blockers.length === 0), [rows]);
  const blocked = useMemo(() => rows.filter((r) => r.blockers.length > 0), [rows]);
  const letterCount = ready.reduce((n, r) => n + r.missing.length, 0);

  const departmentDesignation = signatory.designation
    || SIGNATORY_TITLE[ready[0]?.profile.department || "tech"]
    || "Authorised Signatory";

  /* Both backfilled letters are CEO-signed, so one resolution covers the whole run. It still
     falls back to the issuing admin when no office has a signature on file. */
  const signatories = useMemo(
    () => resolveSignatories(
      "offer_letter",
      { ceo: officer("ceo"), cto: officer("cto") },
      { name: signatory.name, designation: departmentDesignation, signatureUrl: signatory.signatureUrl },
    ),
    // Keyed on the settings document rather than on `officer`, which is a new closure each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [marks, signatory.name, signatory.signatureUrl, departmentDesignation],
  );
  const hasSignature = canIssue(signatories, "offer_letter");

  const issueAll = async () => {
    if (!hasSignature || running || letterCount === 0) return;
    setRunning(true);
    setDone(0);
    setFailed([]);
    const issuedOn = todayIso();
    const designation = departmentDesignation;

    for (const row of ready) {
      for (const type of row.missing) {
        try {
          const referenceNo = await allocateReference(company.name, type, issuedOn);
          const built = buildDocument({
            type,
            subject: {
              name: row.member.name,
              phone: row.member.phone,
              email: row.member.email,
              employeeId: row.member.employeeId,
            },
            profile: row.profile,
            signatory: signatories,
            issuedOn,
            extras: {},
            company,
            referenceNo,
          });
          await issueDocument({
            document: {
              memberId: row.member.uid,
              memberName: row.member.name,
              memberPhone: row.member.phone || "",
              memberRole: row.member.role,
              department: row.profile.department,
              type,
              title: built.title,
              bodyText: built.bodyText,
              issuedById: signatory.uid,
              issuedByName: signatory.name,
              issuedByDesignation: designation,
              signatories,
              referenceNo,
              companySignatureUrl: signatories[0]?.signatureUrl || null,
              companyStampUrl: marks.stampUrl || null,
              issuedOn,
              requiresEmployeeSignature: requiresEmployeeSignature(type),
            },
            memberLink: memberLink?.(row.member),
          });
          setDone((n) => n + 1);
        } catch {
          setFailed((f) => [...f, `${row.member.name} — ${HR_DOCUMENT_LABELS[type]}`]);
        }
      }
    }

    setRunning(false);
    toast({
      title: "Letters issued",
      description: `${ready.length} ${ready.length === 1 ? "person" : "people"} now have their papers.`,
    });
    onDone?.();
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5" data-test="missing-letters-none">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Check size={16} className="text-success" /> Everyone has their offer and appointment letters
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Nothing to backfill — every active member holds both.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 md:p-5" data-test="missing-letters-panel">
      <div className="mb-3 flex items-start gap-2.5">
        <FileSignature size={18} className="mt-0.5 shrink-0 text-primary" />
        <div>
          <h3 className="font-display text-base font-bold text-foreground">Letters never issued</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Most of this team was hired before the app issued letters. These are the people with no
            offer or appointment letter on file — the documents they will be asked for by a bank or
            a landlord.
          </p>
        </div>
      </div>

      {!hasSignature && (
        <div className="mb-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
            <PenTool size={13} /> Nobody can sign these yet
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            These letters are signed by the company. Upload the CEO's signature under Company
            Documents in Settings and this whole list can go out in one press.
          </p>
          <Link to={settingsPath} className="mt-2 inline-flex h-8 items-center rounded-lg bg-warning px-3 text-[11px] font-semibold text-warning-foreground hover:opacity-90">
            Open Company Documents →
          </Link>
        </div>
      )}

      <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-muted/60 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">Member</th>
              <th className="px-3 py-2 font-semibold">Missing</th>
              <th className="px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.member.uid} data-test="missing-letter-row">
                <td className="px-3 py-2">
                  <span className="font-medium text-foreground">{row.member.name}</span>
                  {row.member.employeeId && (
                    <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{row.member.employeeId}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {row.missing.map((t) => HR_DOCUMENT_LABELS[t]).join(", ")}
                </td>
                <td className="px-3 py-2">
                  {row.blockers.length === 0 ? (
                    <span className="text-success">Ready</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-warning">
                      <AlertTriangle size={11} /> {row.blockers.join(", ")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {blocked.length > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          <b className="text-warning">{blocked.length}</b>{" "}
          {blocked.length === 1 ? "person is" : "people are"} skipped: a letter built from an empty
          record would print a blank salary and joining date under your signature. Fill in their
          Employment tab and they join the list.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={issueAll}
          disabled={!hasSignature || running || letterCount === 0}
          data-test="issue-all-letters"
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          {running ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          {running
            ? `Issuing… ${done}/${letterCount}`
            : `Issue ${letterCount} letter${letterCount === 1 ? "" : "s"} to ${ready.length} ${ready.length === 1 ? "person" : "people"}`}
        </button>
        {hasSignature && !running && (
          <span className="text-[11px] text-muted-foreground">
            Signed as {signatory.name}. Each person is notified once.
          </span>
        )}
      </div>

      {failed.length > 0 && (
        <p className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          Could not issue: {failed.join("; ")}
        </p>
      )}
    </div>
  );
}

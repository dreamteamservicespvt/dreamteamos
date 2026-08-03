import { forwardRef } from "react";
import { format } from "date-fns";
import { LetterheadFoot, LetterheadTop } from "@/components/agreement/Letterhead";

export interface AgreementViewData {
  bodyText: string;
  /**
   * Print the company letterhead around the text.
   *
   * Off for the pasted-in bulk agreements, which are somebody else's document reproduced verbatim;
   * on for everything this company issues itself, where the header is part of what makes it a
   * document rather than a note.
   */
  letterhead?: boolean;
  /** The logo, already inlined as a data URL when this is heading for a PDF. */
  logoUrl?: string | null;
  memberName: string;
  memberPhone?: string;
  signatureUrl?: string;
  signedName?: string;
  signedDate?: string;
  /**
   * The company side of the document.
   *
   * An HR letter is signed by the company the moment it is issued — the signatory's stored
   * signature is applied automatically — and by the employee when they accept it. So a document
   * can carry two signatures, and each signature line in the text says which side it belongs to.
   * Agreements that pass none of these are unaffected: they render exactly as before.
   */
  companySignatureUrl?: string | null;
  companySignedName?: string;
  companyDesignation?: string;
  companySignedDate?: string;
  /** The company seal, printed across the company's signature block. */
  companyStampUrl?: string | null;
  /**
   * Every office signing for the company, in the order their blocks appear in the text.
   *
   * The NDA carries two — the CEO and the CTO — so a single signature URL is no longer enough to
   * say who signed what. Company-side signature lines are paired with this list positionally: the
   * first such line in the document gets the first signatory, and so on. Positional rather than
   * matched on the text, because the line is prose the template controls and a renderer that tried
   * to parse a job title out of it would break the first time somebody reworded a heading.
   *
   * Omit it and the single `companySignatureUrl` above is used, exactly as before.
   */
  companySignatories?: CompanySignatory[];
}

export interface CompanySignatory {
  name?: string | null;
  designation?: string | null;
  signatureUrl?: string | null;
}

/** Fill the common "____" placeholders from the member's details + sign date. */
export function fillAgreementText(text: string, d: { memberName: string; memberPhone?: string; signedDate?: string }): string {
  const date = d.signedDate ? format(new Date(d.signedDate), "dd MMM yyyy") : format(new Date(), "dd MMM yyyy");
  return text
    .replace(/(Employee Name\s*:?)[ \t]*_{2,}/gi, `$1 ${d.memberName}`)
    .replace(/(Name\s*:?)[ \t]*_{2,}/gi, `$1 ${d.memberName}`)
    .replace(/(Mobile Number\s*:?)[ \t]*_{2,}/gi, `$1 ${d.memberPhone || "—"}`)
    .replace(/(Contact\s*:?)[ \t]*_{2,}/gi, `$1 ${d.memberPhone || "—"}`)
    .replace(/(Date\s*:?)[ \t]*_{2,}/gi, `$1 ${date}`);
}

const isSignatureLine = (l: string) => /signature\s*:/i.test(l);
const isSectionHeading = (l: string) => /^\s*\d+\.\s+\S/.test(l);
const isAllCaps = (l: string) => l.length > 2 && l === l.toUpperCase() && /[A-Z]/.test(l);

/**
 * Which side a signature line belongs to.
 *
 * "Employee Signature:" — or a bare "Signature:" — is the employee's. A line that names the
 * company as signer ("For Dream Team Services — Chief Executive Officer Signature:", "Employer
 * Signature:", "HR Signature:") is the company's. Anything else — a witness line, say — gets a
 * blank ruled box, which is exactly what it got before two-sided signing existed.
 *
 * The leading `For …` test matters more than it looks: every letter this company generates opens
 * its company block that way, and the words after the dash are now the signing office ("Chief
 * Executive Officer", "CTO (Tech Admin)") rather than the fixed phrase "Authorised Signatory".
 * Matching only on that old phrase silently demoted the company's own signature to a blank ruled
 * box — the letter rendered, and the signature simply was not on it.
 */
const signatureSide = (l: string): "employee" | "company" | "other" => {
  if (/employee/i.test(l)) return "employee";
  if (/^for\s+\S/i.test(l.trim())) return "company";
  if (/authoris|authoriz|\bcompany\b|employer|signatory|\bhr\b/i.test(l)) return "company";
  return /^signature\s*:/i.test(l.trim()) ? "employee" : "other";
};

/** The `Name:` / `Designation:` / `Date:` lines that belong to the signature block above them. */
const META_LINE = /^(Name|Designation|Date)\s*:\s*(.*)$/i;

/** Employee-detail labels whose filled values get the highlight treatment. */
const HIGHLIGHT_LABEL = /^(Employee Name|Employee ID|Mobile Number|Date)\s*:/i;

/**
 * Renders pasted agreement text as a clean, print-ready A4-ish document.
 * A plain white "paper" look (theme-independent) so the on-screen preview matches the PDF.
 * The member's auto-filled details (name, mobile, date) and the signature blocks are highlighted.
 */
const AgreementView = forwardRef<HTMLDivElement, AgreementViewData>(function AgreementView(data, ref) {
  const filled = fillAgreementText(data.bodyText, data);
  const lines = filled.replace(/\r/g, "").split("\n");

  // Title = leading run of ALL-CAPS lines.
  const titleLines: string[] = [];
  let i = 0;
  while (i < lines.length && (lines[i].trim() === "" || isAllCaps(lines[i].trim()))) {
    if (lines[i].trim() !== "") titleLines.push(lines[i].trim());
    else if (titleLines.length > 0) break;
    i++;
  }
  const body = lines.slice(i);

  // Pull the Name/Designation/Date lines that follow a signature line INTO that signature block,
  // so a signature reads as one boxed unit instead of a box followed by three stray labels.
  const signatureMeta = new Map<number, Record<string, string>>();
  const absorbed = new Set<number>();
  body.forEach((raw, idx) => {
    if (!isSignatureLine(raw.trim())) return;
    const meta: Record<string, string> = {};
    for (let j = idx + 1; j < body.length; j++) {
      const match = body[j].trim().match(META_LINE);
      if (!match) break;
      meta[match[1].toLowerCase()] = match[2].trim();
      absorbed.add(j);
    }
    signatureMeta.set(idx, meta);
  });

  const signedDateLabel = data.signedDate ? format(new Date(data.signedDate), "dd MMM yyyy") : "";
  const companyDateLabel = data.companySignedDate ? format(new Date(data.companySignedDate), "dd MMM yyyy") : "";

  /**
   * The company's signatories, and which body line each one signs on.
   *
   * Falling back to the single-signature props keeps every existing caller — agreements, the
   * onboarding letters, documents issued before officers existed — rendering exactly as before.
   */
  const signatories: CompanySignatory[] = data.companySignatories?.length
    ? data.companySignatories
    : [{
      name: data.companySignedName,
      designation: data.companyDesignation,
      signatureUrl: data.companySignatureUrl,
    }];

  const companyLineOrder = new Map<number, number>();
  body.forEach((raw, idx) => {
    const l = raw.trim();
    if (isSignatureLine(l) && signatureSide(l) === "company") {
      companyLineOrder.set(idx, companyLineOrder.size);
    }
  });

  return (
    <div
      ref={ref}
      style={{ colorScheme: "light" }}
      className="mx-auto w-full max-w-[820px] bg-white text-slate-800 px-7 py-8 md:px-12 md:py-12 shadow-sm"
    >
      {data.letterhead && <LetterheadTop logoUrl={data.logoUrl} />}

      {titleLines.length > 0 && (
        <div data-pdf="title" className="text-center mb-6 pb-4 border-b-2 border-slate-200">
          {titleLines.map((t, idx) => (
            <div key={idx} className={idx === 0 ? "text-xl md:text-2xl font-extrabold tracking-tight text-slate-900" : "text-sm md:text-base font-semibold text-slate-600 mt-0.5"}>
              {t}
            </div>
          ))}
        </div>
      )}

      <div data-pdf="body" className="space-y-2.5 text-[13px] md:text-[14px] leading-relaxed">
        {body.map((raw, idx) => {
          if (absorbed.has(idx)) return null;
          const l = raw.trim();
          if (l === "") return <div key={idx} className="h-1.5" />;

          if (isSignatureLine(l)) {
            const label = l.split(":")[0];
            const side = signatureSide(l);
            const meta = signatureMeta.get(idx) || {};
            const isCompany = side === "company";
            // Which of the company's signatories this particular line belongs to.
            const officer = isCompany ? signatories[companyLineOrder.get(idx) ?? 0] : undefined;
            const imageUrl = isCompany ? (officer?.signatureUrl ?? null)
              : side === "employee" ? data.signatureUrl
              : null;
            const name = isCompany
              ? (officer?.name || meta.name || "")
              : side === "employee" ? (data.signedName || meta.name || data.memberName)
              : meta.name || "";
            const dateLabel = isCompany
              ? (companyDateLabel || meta.date || "")
              : (signedDateLabel || meta.date || "");
            const designation = isCompany ? (officer?.designation || meta.designation || "") : "";

            // The seal is pressed once, on the first company signature — a letter stamped twice
            // looks like two letters glued together, not one document signed by two officers.
            const stamp = isCompany && (companyLineOrder.get(idx) ?? 0) === 0 ? data.companyStampUrl : null;

            return (
              <div key={idx} className="mt-5">
                <div className={`relative inline-block rounded-lg border px-4 pt-2 pb-1.5 ${isCompany ? "border-sky-300 bg-sky-50" : "border-amber-300 bg-amber-50"}`}>
                  {/* The seal sits across the signature, as it would on paper — semi-transparent so
                      it never hides the name underneath it.

                      Anchored below the label rather than over it: the line now names the signing
                      office in full ("Chief Executive Officer" rather than "Authorised Signatory"),
                      and a seal pinned to the top of the box landed squarely on the last word of it.
                      Over the signature is also simply where a stamp goes on paper. */}
                  {stamp && (
                    <img
                      data-stamp="true"
                      src={stamp}
                      alt=""
                      crossOrigin="anonymous"
                      className="pointer-events-none absolute -right-6 top-6 h-[86px] w-[86px] object-contain opacity-80 mix-blend-multiply"
                    />
                  )}
                  <div className={`text-[11px] font-semibold uppercase tracking-wide mb-1 ${isCompany ? "text-sky-700" : "text-amber-700"}`}>
                    {label}
                  </div>
                  {imageUrl ? (
                    <div>
                      <div className="flex items-end min-h-[72px]">
                        {/* mix-blend-multiply drops whitish photo backgrounds into the white paper,
                            so uploaded photo signatures print as cleanly as drawn ones. */}
                        <img
                          data-signature="true"
                          src={imageUrl}
                          alt="signature"
                          crossOrigin="anonymous"
                          className="h-[68px] object-contain object-left-bottom mix-blend-multiply"
                          style={{ maxWidth: 260 }}
                        />
                      </div>
                      <div className="border-t border-slate-500 mt-1 pt-1 min-w-[220px]">
                        <span className="text-[11px] font-semibold text-slate-700">{name}</span>
                        {designation && <span className="text-[11px] text-slate-500"> · {designation}</span>}
                        {dateLabel && <span className="text-[11px] text-slate-500"> · {dateLabel}</span>}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="h-14 min-w-[220px] border-b border-slate-500 flex items-end pb-1">
                        <span className="text-[10px] text-slate-400 italic">Awaiting signature</span>
                      </div>
                      {(name || designation) && (
                        <div className="pt-1 min-w-[220px]">
                          <span className="text-[11px] font-semibold text-slate-700">{name}</span>
                          {designation && <span className="text-[11px] text-slate-500"> · {designation}</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          // Highlight the auto-filled employee details (Name / Employee ID / Mobile / Date).
          const hl = l.match(HIGHLIGHT_LABEL);
          if (hl) {
            const label = hl[1];
            const value = l.slice(hl[0].length).trim();
            return (
              <div key={idx} className="flex items-baseline gap-2 flex-wrap">
                <span className="font-semibold text-slate-700">{label}:</span>
                <span className="rounded-md bg-amber-100 border border-amber-300 px-2 py-0.5 font-bold text-slate-900">{value || "—"}</span>
              </div>
            );
          }

          if (isSectionHeading(l)) {
            return <div key={idx} className="mt-4 mb-0.5 font-bold text-slate-900 text-[14px] md:text-[15px]">{l}</div>;
          }
          if (isAllCaps(l)) {
            return <div key={idx} className="mt-3 font-semibold text-slate-800">{l}</div>;
          }
          return <p key={idx} className="text-slate-700">{l}</p>;
        })}
      </div>

      {(data.signedName || data.signedDate) && (
        <div data-pdf="footer" className="mt-8 pt-4 border-t border-slate-200 text-[12px] text-slate-500">
          Signed by <span className="font-semibold text-slate-700">{data.signedName || data.memberName}</span>
          {signedDateLabel ? ` on ${signedDateLabel}` : ""}.
        </div>
      )}

      {data.letterhead && <LetterheadFoot />}
    </div>
  );
});

export default AgreementView;

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
 * company as signer ("For Dream Team Services — Authorised Signatory Signature:", "Employer
 * Signature:", "HR Signature:") is the company's. Anything else — a witness line, say — gets a
 * blank ruled box, which is exactly what it got before two-sided signing existed.
 */
const signatureSide = (l: string): "employee" | "company" | "other" => {
  if (/employee/i.test(l)) return "employee";
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
            const imageUrl = side === "company" ? data.companySignatureUrl
              : side === "employee" ? data.signatureUrl
              : null;
            const name = isCompany
              ? (data.companySignedName || meta.name || "")
              : side === "employee" ? (data.signedName || meta.name || data.memberName)
              : meta.name || "";
            const dateLabel = isCompany
              ? (companyDateLabel || meta.date || "")
              : (signedDateLabel || meta.date || "");
            const designation = isCompany ? (data.companyDesignation || meta.designation || "") : "";

            return (
              <div key={idx} className="mt-5">
                <div className={`inline-block rounded-lg border px-4 pt-2 pb-1.5 ${isCompany ? "border-sky-300 bg-sky-50" : "border-amber-300 bg-amber-50"}`}>
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

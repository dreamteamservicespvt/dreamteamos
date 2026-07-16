import { forwardRef } from "react";
import { format } from "date-fns";

export interface AgreementViewData {
  bodyText: string;
  memberName: string;
  memberPhone?: string;
  signatureUrl?: string;
  signedName?: string;
  signedDate?: string;
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

/** Employee-detail labels whose filled values get the highlight treatment. */
const HIGHLIGHT_LABEL = /^(Employee Name|Mobile Number|Date)\s*:/i;

/**
 * Renders pasted agreement text as a clean, print-ready A4-ish document.
 * A plain white "paper" look (theme-independent) so the on-screen preview matches the PDF.
 * The member's auto-filled details (name, mobile, date) and the signature block are highlighted.
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

  const signedDateLabel = data.signedDate ? format(new Date(data.signedDate), "dd MMM yyyy") : "";

  return (
    <div
      ref={ref}
      style={{ colorScheme: "light" }}
      className="mx-auto w-full max-w-[820px] bg-white text-slate-800 px-7 py-8 md:px-12 md:py-12 shadow-sm"
    >
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
          const l = raw.trim();
          if (l === "") return <div key={idx} className="h-1.5" />;

          if (isSignatureLine(l)) {
            const label = l.split(":")[0];
            const isEmployee = /employee/i.test(l);
            return (
              <div key={idx} className="mt-5">
                <div className="inline-block rounded-lg border border-amber-300 bg-amber-50 px-4 pt-2 pb-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 mb-1">{label}</div>
                  {isEmployee && data.signatureUrl ? (
                    <div>
                      <div className="flex items-end min-h-[72px]">
                        {/* mix-blend-multiply drops whitish photo backgrounds into the white paper,
                            so uploaded photo signatures print as cleanly as drawn ones. */}
                        <img
                          data-signature="true"
                          src={data.signatureUrl}
                          alt="signature"
                          crossOrigin="anonymous"
                          className="h-[68px] object-contain object-left-bottom mix-blend-multiply"
                          style={{ maxWidth: 260 }}
                        />
                      </div>
                      <div className="border-t border-slate-500 mt-1 pt-1 min-w-[220px]">
                        <span className="text-[11px] font-semibold text-slate-700">{data.signedName || data.memberName}</span>
                        {signedDateLabel && <span className="text-[11px] text-slate-500"> · {signedDateLabel}</span>}
                      </div>
                    </div>
                  ) : (
                    <div className="h-14 min-w-[220px] border-b border-slate-500 flex items-end pb-1">
                      <span className="text-[10px] text-slate-400 italic">{isEmployee ? "Awaiting signature" : ""}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          }

          // Highlight the auto-filled employee details (Name / Mobile / Date).
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
    </div>
  );
});

export default AgreementView;

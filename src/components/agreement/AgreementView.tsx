import { forwardRef } from "react";
import { format } from "date-fns";
import { LetterheadFoot, LetterheadTop } from "@/components/agreement/Letterhead";

/**
 * A document, rendered the way a document is supposed to look.
 *
 * The governing constraint: an offer letter gets shown to a bank, a landlord, a college admissions
 * office and the next employer. It has to survive being looked at by someone who deals with real
 * company paperwork every day. That rules out anything that reads as a web interface — tinted
 * cards, rounded chips, coloured labels — however useful those are on screen. Everything here is
 * ink on paper: rules, weight and spacing, no fills.
 *
 * The header block (Ref / Date / Employee Name / ID) is laid out as an aligned label-value table
 * rather than sentences, because that is how a formal Indian business letter opens and because it
 * is the part a reader scans first.
 *
 * Fixed hex colours, no theme tokens and no dark-mode variants: this is captured to PDF by
 * html2canvas, which resolves computed styles at capture time, so a document built from theme
 * tokens comes out dark grey for anyone browsing in dark mode.
 */

const INK = "#1e293b";
const HEADING = "#0f172a";
const MUTED = "#64748b";
const RULE = "#cbd5e1";

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
  /**
   * Render a copy meant to be signed by hand: no signature images, no seal, and no
   * "Awaiting signature" note where they would have been — just ruled lines.
   *
   * The note is right on screen, where it tells an employee the document is still open. It is
   * wrong on a sheet of paper being carried to somebody for a wet signature, where it reads as
   * part of the letter.
   */
  blankForSigning?: boolean;
}

export interface CompanySignatory {
  name?: string | null;
  designation?: string | null;
  signatureUrl?: string | null;
}

/** The company side of a stored agreement, as it was frozen at send time. */
export interface CompanySignedRecord {
  letterhead?: boolean;
  companySignatories?: CompanySignatory[];
  companyStampUrl?: string | null;
  companySignedDate?: string;
}

/**
 * Spread a stored agreement's company side onto this view.
 *
 * One helper rather than four props repeated at five call sites, because the failure mode of
 * forgetting one of them is a letter that renders with an empty signature box and no error —
 * the same silent failure the signature-side detection had.
 */
export const companySideOf = (a: CompanySignedRecord) => ({
  letterhead: !!a.letterhead,
  companySignatories: a.companySignatories,
  companyStampUrl: a.companyStampUrl,
  companySignedDate: a.companySignedDate,
});

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
 * blank ruled line, which is exactly what it got before two-sided signing existed.
 *
 * The leading `For …` test matters more than it looks: every letter this company generates opens
 * its company block that way, and the words after the dash are now the signing office ("Chief
 * Executive Officer", "CTO (Tech Admin)") rather than the fixed phrase "Authorised Signatory".
 * Matching only on that old phrase silently demoted the company's own signature to a blank ruled
 * line — the letter rendered, and the signature simply was not on it.
 */
const signatureSide = (l: string): "employee" | "company" | "other" => {
  if (/employee/i.test(l)) return "employee";
  if (/^for\s+\S/i.test(l.trim())) return "company";
  if (/authoris|authoriz|\bcompany\b|employer|signatory|\bhr\b/i.test(l)) return "company";
  return /^signature\s*:/i.test(l.trim()) ? "employee" : "other";
};

/**
 * The lines that belong to the signature block above them, rather than to the letter.
 *
 * Absorption stops at the first line that does not match, which is correct — but it means every
 * label a template puts in a signature block has to be listed here. `Employee ID` was not, so an
 * employee block reading Name / Employee ID / Date absorbed only the name, broke, and left a bare
 * "Date:" to flow on as body text — far enough down a long letter to be pushed onto a page of its
 * own. A whole extra sheet, carrying one word.
 */
const META_LINE = /^(Name|Designation|Date|Employee ID)\s*:\s*(.*)$/i;

/**
 * The reference block a formal letter opens with.
 *
 * Only the *leading* run of these counts — "Date:" also appears inside a signature block, and
 * pulling that one into the header would move the company's signing date to the top of the page.
 */
const HEADER_FIELD = /^(Ref|Date|Employee Name|Employee ID|Mobile Number|Email|Address)\s*:\s*(.*)$/i;

interface SignatureBlockData {
  side: "employee" | "company" | "other";
  label: string;
  imageUrl: string | null;
  name: string;
  designation: string;
  employeeId: string;
  dateLabel: string;
  blankForSigning: boolean;
}

/** One ruled signature: the caption, the mark, the line, and who signed on it. */
function SignatureBlock({ block }: { block: SignatureBlockData }) {
  return (
    <div style={{ breakInside: "avoid" }}>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 2 }}>{block.label}</div>
      <div style={{ display: "flex", alignItems: "flex-end", height: 56 }}>
        {block.imageUrl ? (
          /* mix-blend-multiply drops whitish photo backgrounds into the white paper, so uploaded
             photo signatures print as cleanly as drawn ones. */
          <img
            data-signature="true"
            src={block.imageUrl}
            alt="signature"
            crossOrigin="anonymous"
            style={{ height: 52, maxWidth: "100%", objectFit: "contain", objectPosition: "left bottom", mixBlendMode: "multiply" }}
          />
        ) : (
          <span style={{ fontSize: 10.5, color: "#94a3b8", fontStyle: "italic", paddingBottom: 4 }}>
            {block.blankForSigning ? "" : "Awaiting signature"}
          </span>
        )}
      </div>
      {/* The rule IS the signature line. Nothing is boxed, tinted or rounded — this is the single
          place a document most obviously stops looking like a document. */}
      <div style={{ borderTop: `1px solid ${INK}`, paddingTop: 5 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: HEADING }}>{block.name || " "}</div>
        {block.designation && <div style={{ fontSize: 11.5, color: MUTED }}>{block.designation}</div>}
        {block.employeeId && (
          <div style={{ fontSize: 11.5, color: MUTED }}>Employee ID: {block.employeeId}</div>
        )}
        {/* The label prints even unsigned, so there is somewhere to date it by hand if the letter
            is printed and signed on paper. */}
        <div style={{ fontSize: 11.5, color: MUTED }}>Date:{block.dateLabel ? ` ${block.dateLabel}` : ""}</div>
      </div>
    </div>
  );
}

/**
 * The signed foot of the document, laid out the way a signed page is actually arranged.
 *
 * The person accepting on the left; the company's offices stacked on the right in seniority, CEO
 * above CTO; the seal centred beneath them, where a stamp goes once both officers have signed.
 * Two columns rather than a single run, because a column of four signature blocks reads as a
 * queue and takes most of a page — and because a reader looking for "who signed for the company"
 * should find them together in one place.
 */
function SignaturePanel({ blocks, stampUrl }: { blocks: SignatureBlockData[]; stampUrl?: string | null }) {
  const left = blocks.filter((b) => b.side !== "company");
  const right = blocks.filter((b) => b.side === "company");

  return (
    <div data-pdf="signature" style={{ marginTop: 30, breakInside: "avoid" }}>
      <div style={{ display: "flex", gap: 36, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 26 }}>
          {left.map((b, i) => <SignatureBlock key={`l${i}`} block={b} />)}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            {right.map((b, i) => <SignatureBlock key={`r${i}`} block={b} />)}
          </div>
          {stampUrl && right.length > 0 && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
              <img
                data-stamp="true"
                src={stampUrl}
                alt=""
                crossOrigin="anonymous"
                /* Centred under the offices that signed, at roughly the size a real 40 mm rubber
                   stamp is against 13.5pt text. Beneath rather than across them: a seal laid over
                   a signature obscured the name under it, and a photographed stamp carries its own
                   paper, which sat as a pale rectangle on top of the ink. */
                style={{
                  height: 118, width: 118, objectFit: "contain",
                  opacity: 0.9, mixBlendMode: "multiply", pointerEvents: "none",
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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
  const rest = lines.slice(i);

  // The reference block: everything from the top that is a `Label: value` header field. Stops at
  // the first real line of the letter, which is normally the salutation.
  const header: { label: string; value: string }[] = [];
  let j = 0;
  while (j < rest.length) {
    const l = rest[j].trim();
    if (l === "") { j++; continue; }
    const m = l.match(HEADER_FIELD);
    if (!m) break;
    header.push({ label: m[1], value: m[2].trim() });
    j++;
  }
  const body = rest.slice(j);

  // Pull the Name/Designation/Date lines that follow a signature line INTO that signature block,
  // so a signature reads as one unit instead of a rule followed by three stray labels.
  const signatureMeta = new Map<number, Record<string, string>>();
  const absorbed = new Set<number>();
  body.forEach((raw, idx) => {
    if (!isSignatureLine(raw.trim())) return;
    const meta: Record<string, string> = {};
    for (let k = idx + 1; k < body.length; k++) {
      const match = body[k].trim().match(META_LINE);
      if (!match) break;
      meta[match[1].toLowerCase()] = match[2].trim();
      absorbed.add(k);
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

  /**
   * Every signature the document asks for, gathered up before anything is drawn.
   *
   * They used to render one under another wherever their line happened to fall, which put the
   * company's signatures in the middle of the page and the employee's at the bottom with the
   * acceptance wording stranded between them. Gathering them lets the whole lot be laid out as one
   * panel — the employee on the left, the company's offices stacked on the right, the seal beneath
   * them — which is how a signed page is actually arranged.
   */
  let companySeen = 0;
  const signatureBlocks: SignatureBlockData[] = [];
  let panelIdx = -1;
  body.forEach((raw, idx) => {
    const l = raw.trim();
    if (!isSignatureLine(l)) return;
    panelIdx = idx;
    const side = signatureSide(l);
    const meta = signatureMeta.get(idx) || {};
    const isCompany = side === "company";
    const officer = isCompany ? signatories[companySeen] : undefined;
    if (isCompany) companySeen += 1;

    signatureBlocks.push({
      side,
      label: l.split(":")[0],
      // A blank-for-signing copy carries no marks at all, on either side.
      imageUrl: data.blankForSigning ? null
        : isCompany ? (officer?.signatureUrl ?? null)
        : side === "employee" ? (data.signatureUrl ?? null)
        : null,
      name: isCompany
        ? (officer?.name || meta.name || "")
        : side === "employee" ? (data.signedName || meta.name || data.memberName)
        : meta.name || "",
      designation: isCompany ? (officer?.designation || meta.designation || "") : "",
      employeeId: meta["employee id"] || "",
      dateLabel: isCompany ? (companyDateLabel || meta.date || "") : (signedDateLabel || meta.date || ""),
      blankForSigning: !!data.blankForSigning,
    });
  });

  return (
    <div
      ref={ref}
      data-pdf="paper"
      style={{ colorScheme: "light", color: INK }}
      className="mx-auto w-full max-w-[820px] bg-white px-8 py-9 md:px-14 md:py-12 shadow-sm"
    >
      {data.letterhead && <LetterheadTop logoUrl={data.logoUrl} />}

      {titleLines.length > 0 && (
        <div data-pdf="title" style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 0.4, color: HEADING, lineHeight: 1.25 }}>
            {titleLines[0]}
          </div>
          {titleLines.slice(1).map((t, idx) => (
            <div key={idx} style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 1.4, color: MUTED, marginTop: 4 }}>
              {t}
            </div>
          ))}
          {/* A short centred rule under the title, rather than a full-width border: it reads as a
              typographic flourish on a letter, where a full rule reads as a table edge. */}
          <div style={{ width: 64, height: 2, background: HEADING, margin: "12px auto 0", borderRadius: 1 }} />
        </div>
      )}

      {header.length > 0 && (
        <div data-pdf="header-block" style={{ marginBottom: 20 }}>
          <table style={{ borderCollapse: "collapse" }}>
            <tbody>
              {header.map((f, idx) => (
                <tr key={idx}>
                  <td style={{ padding: "2px 14px 2px 0", fontSize: 12.5, color: MUTED, whiteSpace: "nowrap", verticalAlign: "top" }}>
                    {f.label}
                  </td>
                  <td style={{ padding: "2px 0", fontSize: 12.5, fontWeight: 600, color: HEADING }}>
                    {f.value || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div data-pdf="body" style={{ fontSize: 13.5, lineHeight: 1.75 }}>
        {body.map((raw, idx) => {
          if (absorbed.has(idx)) return null;
          const l = raw.trim();
          if (l === "") return <div key={idx} style={{ height: 8 }} />;

          if (isSignatureLine(l)) {
            // Every signature is rendered once, together, at the position of the LAST signature
            // line — see `SignaturePanel`. The earlier ones render nothing so the prose between
            // them (the acceptance wording, say) still reads in its own place.
            if (idx !== panelIdx) return null;
            return (
              <SignaturePanel
                key={idx}
                blocks={signatureBlocks}
                stampUrl={data.blankForSigning ? null : data.companyStampUrl}
              />
            );
          }

          // An indented numbered line is an item in a list inside a section — the training list in
          // an internship letter — not a new section. Both look like "1. Something" once the line
          // is trimmed, so the indentation on the raw line is the only thing that tells them apart,
          // and without this check every skill in that list rendered as a bold heading.
          if (/^\s{2,}/.test(raw) && /^\d+[.)]\s/.test(l)) {
            return (
              <p key={idx} style={{ margin: "1px 0 1px 22px", textIndent: -14 }}>{l}</p>
            );
          }

          if (isSectionHeading(l)) {
            return (
              <div key={idx} data-pdf="heading" style={{ marginTop: 18, marginBottom: 2, fontSize: 13.5, fontWeight: 700, color: HEADING }}>
                {l}
              </div>
            );
          }
          if (isAllCaps(l)) {
            return (
              <div key={idx} data-pdf="heading" style={{ marginTop: 16, marginBottom: 2, fontSize: 12.5, fontWeight: 700, letterSpacing: 0.8, color: HEADING }}>
                {l}
              </div>
            );
          }
          // A remaining `Label: value` line inside the body — printed plainly, label muted.
          const inline = l.match(/^([A-Z][A-Za-z /&'()-]{2,34})\s*:\s*(.+)$/);
          if (inline) {
            return (
              <p key={idx} style={{ margin: "3px 0", textAlign: "justify" }}>
                <span style={{ color: MUTED }}>{inline[1]}: </span>
                <span style={{ fontWeight: 600, color: HEADING }}>{inline[2]}</span>
              </p>
            );
          }
          return <p key={idx} style={{ margin: "3px 0", textAlign: "justify" }}>{l}</p>;
        })}
      </div>

      {(data.signedName || data.signedDate) && (
        <div data-pdf="footer" style={{ marginTop: 26, paddingTop: 10, borderTop: `1px solid ${RULE}`, fontSize: 11.5, color: MUTED }}>
          Signed by <span style={{ fontWeight: 700, color: HEADING }}>{data.signedName || data.memberName}</span>
          {signedDateLabel ? ` on ${signedDateLabel}` : ""}.
        </div>
      )}

      {data.letterhead && <LetterheadFoot />}
    </div>
  );
});

export default AgreementView;

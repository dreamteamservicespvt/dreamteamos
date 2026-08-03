/**
 * The company's letterhead, printed at the top and foot of every page it issues.
 *
 * A letter on blank paper is a note; a letter on a letterhead is a document. Offer letters,
 * appointment letters, confirmations and relieving letters all get shown to somebody outside this
 * company — a bank, a landlord, a college admissions office, the next employer — and the first
 * thing any of them looks for is who issued it and how to reach them.
 *
 * Laid out as a flex row with the logo given a fixed box: the name and address column then wraps
 * against a known edge instead of against whatever width the logo file happened to have, which is
 * what previously let a wide logo squash the address into three ragged lines.
 *
 * Fixed hex colours rather than theme variables, and no dark-mode variants: this is captured to
 * PDF by html2canvas, which resolves computed styles at capture time, so a letterhead built from
 * theme tokens comes out dark grey for anyone browsing in dark mode.
 *
 * Anything the company record does not have is left out rather than printed as a placeholder. A
 * letterhead carrying an invented address is worse than one carrying none.
 *
 * The details come from Settings → Company Documents, falling back to the built-in defaults, so
 * moving office changes every letter in the app without a deploy.
 */
import { useCompany } from "@/hooks/useCompany";

const NAVY = "#0b1f5c";
const BRAND = "#1d4ed8";
const MUTED = "#64748b";
const INK = "#334155";

export function LetterheadTop({ logoUrl }: { logoUrl?: string | null }) {
  const { company: COMPANY } = useCompany();
  const contact = [COMPANY.phone, COMPANY.email, COMPANY.website].filter(Boolean);

  /* GSTIN and MSME share a line: both are registration numbers a reader scans for in the same
     glance, and two near-identical lines under an address read as clutter. */
  const registrations = [
    COMPANY.gstin ? `GSTIN: ${COMPANY.gstin}` : "",
    COMPANY.msme ? `MSME/Udyam: ${COMPANY.msme}` : "",
  ].filter(Boolean);

  return (
    <div data-pdf="letterhead" style={{ marginBottom: 26 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        {/*
          Sized by HEIGHT, with width free up to a generous cap.
          A square box squashed the real logo — a wide lockup of the mark plus the company name
          set beneath it — down to whatever fitted in 62px of width, which made it a thumbnail
          beside 21px type. Constraining the dimension a letterhead actually cares about, and
          letting the other one follow the artwork, prints a square mark and a wide lockup at the
          same visual weight.
        */}
        <div
          style={{
            flex: "0 0 auto", height: 76, maxWidth: 210, display: "flex",
            alignItems: "center", justifyContent: "flex-start",
          }}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              crossOrigin="anonymous"
              style={{ height: 76, width: "auto", maxWidth: 210, objectFit: "contain", display: "block" }}
            />
          ) : (
            <div
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                height: 66, width: 66, borderRadius: 12, backgroundColor: NAVY,
                color: "#ffffff", fontWeight: 800, fontSize: 21, letterSpacing: 1,
              }}
            >
              DTS
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 21, fontWeight: 800, color: NAVY, letterSpacing: 0.2, lineHeight: 1.15 }}>
            {COMPANY.name}
          </p>
          {COMPANY.address.length > 0 && (
            <p style={{ margin: "4px 0 0", fontSize: 10.5, color: MUTED, lineHeight: 1.55 }}>
              {COMPANY.address.join(", ")}
            </p>
          )}
          {contact.length > 0 && (
            <p style={{ margin: "1px 0 0", fontSize: 10.5, color: MUTED, lineHeight: 1.55 }}>
              {contact.join("  ·  ")}
            </p>
          )}
          {registrations.length > 0 && (
            <p style={{ margin: "2px 0 0", fontSize: 9.5, color: INK, fontWeight: 600, letterSpacing: 0.2 }}>
              {registrations.join("  ·  ")}
            </p>
          )}
        </div>
      </div>

      {/* The rule under a letterhead is what makes the rest of the page read as the letter. */}
      <div style={{ marginTop: 12, height: 2.5, background: `linear-gradient(90deg, ${NAVY} 0%, ${BRAND} 55%, #bfdbfe 100%)`, borderRadius: 2 }} />
    </div>
  );
}

export function LetterheadFoot() {
  const { company: COMPANY } = useCompany();
  const line = [COMPANY.website, COMPANY.email, COMPANY.phone].filter(Boolean).join("  ·  ");
  return (
    <div
      data-pdf="letterfoot"
      style={{ marginTop: 30, paddingTop: 9, borderTop: "1px solid #e2e8f0", textAlign: "center" }}
    >
      <p style={{ margin: 0, fontSize: 9, color: MUTED, lineHeight: 1.55 }}>
        {COMPANY.name}
        {COMPANY.address.length > 0 ? ` · ${COMPANY.address.join(", ")}` : ""}
      </p>
      {line && <p style={{ margin: "1px 0 0", fontSize: 9, color: MUTED }}>{line}</p>}
      <p style={{ margin: "3px 0 0", fontSize: 8, color: "#94a3b8" }}>
        This is a computer-generated document issued by {COMPANY.name}.
      </p>
    </div>
  );
}

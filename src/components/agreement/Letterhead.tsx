/**
 * The company's letterhead, printed at the top and foot of every document it issues.
 *
 * A letter on blank paper is a note; a letter on a letterhead is a document. Offer letters,
 * appointment letters, confirmations and relieving letters all get shown to somebody outside this
 * company — a bank, a landlord, the next employer — and the first thing any of them looks for is
 * who issued it and how to reach them.
 *
 * Fixed hex colours rather than theme variables, and no dark-mode variants: this is captured to
 * PDF by html2canvas, which resolves computed styles at capture time, so a letterhead built from
 * theme tokens comes out dark grey for anyone browsing in dark mode.
 *
 * Anything the company record does not have is left out rather than printed as a placeholder. A
 * letterhead carrying an invented address is worse than one carrying none.
 */
import { COMPANY } from "@/utils/company";

const NAVY = "#0b1f5c";
const BRAND = "#1d4ed8";
const MUTED = "#64748b";

export function LetterheadTop({ logoUrl }: { logoUrl?: string | null }) {
  const contact = [
    COMPANY.phone,
    COMPANY.email,
    COMPANY.website,
  ].filter(Boolean);

  return (
    <div data-pdf="letterhead" style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ flexShrink: 0 }}>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              crossOrigin="anonymous"
              style={{ height: 44, width: "auto", display: "block" }}
            />
          ) : (
            <div
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                height: 44, width: 44, borderRadius: 8, backgroundColor: NAVY,
                color: "#ffffff", fontWeight: 800, fontSize: 16, letterSpacing: 1,
              }}
            >
              DTS
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 19, fontWeight: 800, color: NAVY, letterSpacing: 0.2, lineHeight: 1.2 }}>
            {COMPANY.name}
          </p>
          {COMPANY.address.length > 0 && (
            <p style={{ margin: "3px 0 0", fontSize: 10.5, color: MUTED, lineHeight: 1.5 }}>
              {COMPANY.address.join(", ")}
            </p>
          )}
          {contact.length > 0 && (
            <p style={{ margin: "2px 0 0", fontSize: 10.5, color: MUTED, lineHeight: 1.5 }}>
              {contact.join("  ·  ")}
            </p>
          )}
          {COMPANY.gstin && (
            <p style={{ margin: "2px 0 0", fontSize: 10, color: MUTED, letterSpacing: 0.3 }}>
              GSTIN: <span style={{ fontWeight: 600, color: "#334155" }}>{COMPANY.gstin}</span>
            </p>
          )}
        </div>
      </div>

      {/* The rule under a letterhead is what makes the rest of the page read as the letter. */}
      <div style={{ marginTop: 12, height: 3, background: `linear-gradient(90deg, ${NAVY} 0%, ${BRAND} 60%, #93c5fd 100%)`, borderRadius: 2 }} />
    </div>
  );
}

export function LetterheadFoot() {
  const line = [COMPANY.website, COMPANY.email, COMPANY.phone].filter(Boolean).join("  ·  ");
  return (
    <div
      data-pdf="letterfoot"
      style={{ marginTop: 28, paddingTop: 10, borderTop: "1px solid #e2e8f0", textAlign: "center" }}
    >
      <p style={{ margin: 0, fontSize: 9.5, color: MUTED, lineHeight: 1.6 }}>
        {COMPANY.name}
        {COMPANY.address.length > 0 ? ` · ${COMPANY.address.join(", ")}` : ""}
      </p>
      {line && (
        <p style={{ margin: "1px 0 0", fontSize: 9.5, color: MUTED }}>{line}</p>
      )}
      <p style={{ margin: "4px 0 0", fontSize: 8.5, color: "#94a3b8" }}>
        This is a computer-generated document issued by {COMPANY.name}.
      </p>
    </div>
  );
}

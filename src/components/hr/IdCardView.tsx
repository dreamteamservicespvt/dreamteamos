/**
 * The employee ID card, front and back.
 *
 * ── Why this ignores the design system ────────────────────────────────────────────────────────
 * Every other surface in this app is Tailwind classes over CSS custom properties, and follows the
 * reader's light/dark theme. This one must not. The card is exported to PNG and PDF through
 * html2canvas, which resolves computed styles at capture time — so a card built out of theme
 * variables comes out dark for anybody browsing in dark mode, and an ID card printed on dark grey
 * is not an ID card. Fixed hex colours and inline geometry make the exported file byte-identical
 * for every viewer, which is the whole point of a card the company issues.
 *
 * Dimensions are CR80 portrait (53.98 × 85.6 mm) at 2×, so the exported PDF prints to the exact
 * size of a real badge holder without rescaling.
 *
 * ── What makes it read as a corporate badge ───────────────────────────────────────────────────
 * Three things, and none of them is decoration. A deep navy header with the company mark, so the
 * issuer is identifiable across a room. A QR that resolves to the company's own verification page,
 * because a badge that cannot be checked proves nothing. And the holder's real signature, printed
 * where a signature belongs — the detail that separates an issued credential from a printout.
 */
import { forwardRef } from "react";
import { CARD_HEIGHT, CARD_WIDTH } from "@/utils/idCard";
import type { IdCardData } from "@/utils/idCard";
import { COMPANY } from "@/utils/company";

const INK = "#0f172a";
const MUTED = "#64748b";
const RULE = "#e2e8f0";
const BRAND = "#1d4ed8";
const BRAND_DEEP = "#0b1f5c";
const NAVY = "#081736";

/**
 * The band starts black because the company logo is white artwork on an opaque black background —
 * on a blue band it reads as a black box someone forgot to cut out. Running the gradient from
 * black lets the logo sit on its own colour and look deliberate.
 */
const BAND = `linear-gradient(125deg, #000000 0%, ${NAVY} 45%, ${BRAND_DEEP} 78%, ${BRAND} 100%)`;
/** The thin accent rules. Kept off BAND — a wide 8px strip of that reads as a black bar. */
const RULE_BAR = `linear-gradient(90deg, ${BRAND_DEEP} 0%, ${BRAND} 55%, #60a5fa 100%)`;

const shell: React.CSSProperties = {
  width: CARD_WIDTH,
  height: CARD_HEIGHT,
  backgroundColor: "#ffffff",
  color: INK,
  borderRadius: 16,
  overflow: "hidden",
  position: "relative",
  fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
  boxSizing: "border-box",
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
};

/** Initials, for a member who has never uploaded a photo. A blank square looks like a fault. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: `1px solid ${RULE}` }}>
      <span style={{ width: 88, flexShrink: 0, fontSize: 8.5, letterSpacing: 0.5, textTransform: "uppercase", color: MUTED }}>
        {label}
      </span>
      <span style={{ flex: 1, fontSize: 10.5, fontWeight: 600, color: INK, wordBreak: "break-word", lineHeight: 1.35 }}>
        {value}
      </span>
    </div>
  );
}

export const IdCardFront = forwardRef<
  HTMLDivElement,
  {
    data: IdCardData;
    logoUrl?: string | null;
    qrUrl?: string | null;
    /** The CEO's signature, inlined. What makes the card issued rather than printed. */
    ceoSignatureUrl?: string | null;
    ceoName?: string | null;
  }
>(function IdCardFront({ data, logoUrl, qrUrl, ceoSignatureUrl, ceoName }, ref) {
  return (
    <div ref={ref} style={shell} data-test="id-card-front">
      {/* Header band */}
      <div
        style={{
          height: 104,
          background: BAND,
          padding: "13px 16px",
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          flexShrink: 0,
          position: "relative",
        }}
      >
        {logoUrl ? (
          <img src={logoUrl} alt="" crossOrigin="anonymous" style={{ height: 28, width: "auto", display: "block" }} />
        ) : (
          <span style={{ fontSize: 15, fontWeight: 800, color: "#ffffff", letterSpacing: 1 }}>DTS</span>
        )}
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <p style={{ margin: 0, fontSize: 9.5, fontWeight: 700, color: "#ffffff", letterSpacing: 0.4 }}>
            {COMPANY.name}
          </p>
          <p style={{ margin: 0, fontSize: 7.5, color: "rgba(255,255,255,0.7)", letterSpacing: 0.3 }}>
            {COMPANY.website}
          </p>
        </div>

        {/* The word that tells anyone glancing at it what they are looking at. */}
        <span
          style={{
            position: "absolute",
            left: 16,
            bottom: 8,
            fontSize: 6.5,
            letterSpacing: 1.6,
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.55)",
            fontWeight: 600,
          }}
        >
          Identity Card
        </span>
      </div>

      {/* Photo, straddling the band.
          `position: relative` is load-bearing, not decoration: the band above is positioned so it
          can carry its caption, which puts it in front of anything that is not — and a photo pulled
          up by a negative margin was rendering with its top half behind the header. */}
      <div style={{ marginTop: -50, display: "flex", justifyContent: "center", flexShrink: 0, position: "relative", zIndex: 1 }}>
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: "50%",
            overflow: "hidden",
            backgroundColor: "#e0e7ff",
            border: "4px solid #ffffff",
            boxShadow: "0 4px 14px rgba(15,23,42,0.20)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {data.photoUrl ? (
            <img
              src={data.photoUrl}
              alt={data.name}
              crossOrigin="anonymous"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <span style={{ fontSize: 34, fontWeight: 800, color: BRAND }}>{initials(data.name)}</span>
          )}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-evenly",
          padding: "10px 18px 10px",
          textAlign: "center",
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: INK, lineHeight: 1.2 }}>{data.name}</p>
          <p style={{ margin: "3px 0 0", fontSize: 11, fontWeight: 600, color: BRAND }}>{data.designation}</p>
          <span
            style={{
              display: "inline-block",
              marginTop: 6,
              padding: "3px 10px",
              borderRadius: 999,
              backgroundColor: "#eef2ff",
              color: BRAND_DEEP,
              fontSize: 8.5,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            {data.department} Department
          </span>
        </div>

        {/* ID and QR side by side: the number a human reads, the code a phone reads. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", marginTop: 2 }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 7.5, letterSpacing: 1.2, textTransform: "uppercase", color: MUTED }}>
              Employee ID
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 16, fontWeight: 800, letterSpacing: 1, color: INK, fontFamily: "'Courier New', monospace" }}>
              {data.employeeId}
            </p>
            {data.joinedOn && (
              <p style={{ margin: "5px 0 0", fontSize: 8.5, color: MUTED }}>Joined {data.joinedOn}</p>
            )}
            {data.validUntil && (
              <p style={{ margin: "3px 0 0", fontSize: 8.5, fontWeight: 700, color: "#b91c1c" }}>
                Valid until {data.validUntil}
              </p>
            )}
          </div>

          {qrUrl && (
            <div style={{ textAlign: "center", flexShrink: 0 }}>
              <img
                src={qrUrl}
                alt="Verify"
                crossOrigin="anonymous"
                style={{ width: 58, height: 58, display: "block", borderRadius: 4 }}
              />
              <p style={{ margin: "3px 0 0", fontSize: 6.5, letterSpacing: 0.4, textTransform: "uppercase", color: MUTED }}>
                Scan to verify
              </p>
            </div>
          )}
        </div>

        {/* The company signs the front. A card is issued BY someone — that is what separates a
            credential from a laminated printout, and it is the signature a person checking the
            badge is looking for. The holder's own signature is on the back, where they sign it. */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div style={{ minWidth: 160, textAlign: "center" }}>
            {ceoSignatureUrl && (
              <img
                src={ceoSignatureUrl}
                alt=""
                crossOrigin="anonymous"
                style={{ height: 30, maxWidth: 150, objectFit: "contain", display: "block", margin: "0 auto 2px" }}
              />
            )}
            <div style={{ borderTop: `1px solid ${RULE}`, paddingTop: 3 }}>
              {ceoName && (
                <p style={{ margin: "0 0 1px", fontSize: 8, fontWeight: 700, color: INK }}>{ceoName}</p>
              )}
              <span style={{ fontSize: 7, letterSpacing: 0.5, textTransform: "uppercase", color: MUTED }}>
                Authorised Signatory
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ height: 8, background: RULE_BAR, flexShrink: 0 }} />
    </div>
  );
});

export const IdCardBack = forwardRef<HTMLDivElement, { data: IdCardData; qrUrl?: string | null }>(
  function IdCardBack({ data, qrUrl }, ref) {
    // Only what is actually known. An empty "Blood group: —" row on a card is worse than no row.
    const rows: { label: string; value: string }[] = [
      { label: "Employee ID", value: data.employeeId },
      { label: "Department", value: data.department },
      ...(data.joinedOn ? [{ label: "Joined", value: data.joinedOn }] : []),
      ...(data.bloodGroup ? [{ label: "Blood group", value: data.bloodGroup }] : []),
      ...(data.phone ? [{ label: "Phone", value: data.phone }] : []),
      ...(data.email ? [{ label: "Email", value: data.email }] : []),
      ...(data.emergencyContact ? [{ label: "In emergency", value: data.emergencyContact }] : []),
    ];

    return (
      <div ref={ref} style={shell} data-test="id-card-back">
        <div style={{ height: 8, background: RULE_BAR, flexShrink: 0 }} />

        <div style={{ padding: "13px 18px 0", flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 9.5, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: BRAND_DEEP }}>
            {data.name}
          </p>
          <p style={{ margin: "2px 0 9px", fontSize: 8.5, color: MUTED }}>{data.designation}</p>

          <div>
            {rows.map((r) => <Row key={r.label} label={r.label} value={r.value} />)}
          </div>
        </div>

        {/* The holder's own signature, where they would otherwise have signed by hand. */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 18px 0" }}>
          <div style={{ textAlign: "center", minWidth: 150 }}>
            {data.signatureUrl ? (
              <img
                src={data.signatureUrl}
                alt=""
                crossOrigin="anonymous"
                style={{ height: 34, maxWidth: 150, objectFit: "contain", display: "block", margin: "0 auto 2px" }}
              />
            ) : (
              <div style={{ height: 34 }} />
            )}
            <div style={{ borderTop: `1px solid ${RULE}`, paddingTop: 3 }}>
              <span style={{ fontSize: 7, letterSpacing: 0.5, textTransform: "uppercase", color: MUTED }}>
                Signature of holder
              </span>
            </div>
          </div>
        </div>

        <div style={{ padding: "0 18px 12px", flexShrink: 0, display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 7.5, lineHeight: 1.5, color: MUTED }}>
              Property of {COMPANY.name}. Non-transferable; surrender on separation. If found,
              please return to:
            </p>
            <p style={{ margin: "3px 0 0", fontSize: 8, fontWeight: 700, color: INK, lineHeight: 1.5 }}>
              {COMPANY.email}
              {COMPANY.phone ? <><br />{COMPANY.phone}</> : null}
              <br />
              {COMPANY.website} · GSTIN {COMPANY.gstin}
            </p>
          </div>
          {qrUrl && (
            <img
              src={qrUrl}
              alt="Verify"
              crossOrigin="anonymous"
              style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 3 }}
            />
          )}
        </div>
      </div>
    );
  },
);

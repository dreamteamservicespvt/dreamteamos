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

/**
 * The band starts black because the company logo is white artwork on an opaque black background —
 * on a blue band it reads as a black box someone forgot to cut out. Running the gradient from
 * black lets the logo sit on its own colour and look deliberate.
 */
const BAND = `linear-gradient(120deg, #000000 0%, ${BRAND_DEEP} 58%, ${BRAND} 100%)`;
/** The thin accent rules. Kept off BAND — a wide 8px strip of that reads as a black bar. */
const RULE_BAR = `linear-gradient(90deg, ${BRAND_DEEP} 0%, ${BRAND} 100%)`;

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
  // A column, so the content spreads down the card instead of piling up at the top and leaving
  // the bottom third empty — which is what a badge printed from a screenshot always looks like.
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
    <div style={{ display: "flex", gap: 8, padding: "7px 0", borderBottom: `1px solid ${RULE}` }}>
      <span style={{ width: 92, flexShrink: 0, fontSize: 9, letterSpacing: 0.4, textTransform: "uppercase", color: MUTED }}>
        {label}
      </span>
      <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: INK, wordBreak: "break-word", lineHeight: 1.35 }}>
        {value}
      </span>
    </div>
  );
}

export const IdCardFront = forwardRef<HTMLDivElement, { data: IdCardData; logoUrl?: string | null }>(
  function IdCardFront({ data, logoUrl }, ref) {
    return (
      <div ref={ref} style={shell} data-test="id-card-front">
        {/* Header band */}
        <div
          style={{
            height: 116,
            background: BAND,
            padding: "14px 16px",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            flexShrink: 0,
          }}
        >
          {logoUrl ? (
            <img src={logoUrl} alt="" crossOrigin="anonymous" style={{ height: 30, width: "auto", display: "block" }} />
          ) : (
            <span style={{ fontSize: 15, fontWeight: 800, color: "#ffffff", letterSpacing: 1 }}>DTS</span>
          )}
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "#ffffff", letterSpacing: 0.3 }}>
              {COMPANY.name}
            </p>
            <p style={{ margin: 0, fontSize: 8, color: "rgba(255,255,255,0.75)", letterSpacing: 0.3 }}>
              {COMPANY.website}
            </p>
          </div>
        </div>

        {/* Photo, straddling the band */}
        <div style={{ marginTop: -56, display: "flex", justifyContent: "center", flexShrink: 0 }}>
          <div
            style={{
              width: 108,
              height: 108,
              borderRadius: "50%",
              overflow: "hidden",
              backgroundColor: "#e0e7ff",
              border: "4px solid #ffffff",
              boxShadow: "0 4px 14px rgba(15,23,42,0.18)",
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
              <span style={{ fontSize: 36, fontWeight: 800, color: BRAND }}>{initials(data.name)}</span>
            )}
          </div>
        </div>

        {/* Everything between the photo and the foot, spread evenly down the card. */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-evenly",
            padding: "14px 18px 10px",
            textAlign: "center",
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: 19, fontWeight: 800, color: INK, lineHeight: 1.2 }}>{data.name}</p>
            <p style={{ margin: "4px 0 0", fontSize: 11.5, fontWeight: 600, color: BRAND }}>{data.designation}</p>
            <span
              style={{
                display: "inline-block",
                marginTop: 8,
                padding: "3px 10px",
                borderRadius: 999,
                backgroundColor: "#eef2ff",
                color: BRAND_DEEP,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              {data.department} Department
            </span>
          </div>

          <div>
            <p style={{ margin: 0, fontSize: 8, letterSpacing: 1.2, textTransform: "uppercase", color: MUTED }}>
              Employee ID
            </p>
            <p style={{ margin: "3px 0 0", fontSize: 17, fontWeight: 800, letterSpacing: 1, color: INK, fontFamily: "'Courier New', monospace" }}>
              {data.employeeId}
            </p>
          </div>

          <div>
            {data.joinedOn && (
              <p style={{ margin: 0, fontSize: 9.5, color: MUTED }}>Date of joining · {data.joinedOn}</p>
            )}
            {data.validUntil && (
              <p style={{ margin: "4px 0 0", fontSize: 9, fontWeight: 700, color: "#b91c1c" }}>
                Valid until {data.validUntil}
              </p>
            )}
          </div>

          {/* Signed on the front, where anyone checking the card is already looking. */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ borderTop: `1px solid ${RULE}`, paddingTop: 3, minWidth: 140 }}>
              <span style={{ fontSize: 7.5, letterSpacing: 0.5, textTransform: "uppercase", color: MUTED }}>
                Authorised Signatory
              </span>
            </div>
          </div>
        </div>

        <div style={{ height: 8, background: RULE_BAR, flexShrink: 0 }} />
      </div>
    );
  },
);

export const IdCardBack = forwardRef<HTMLDivElement, { data: IdCardData }>(
  function IdCardBack({ data }, ref) {
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

        <div style={{ padding: "14px 18px 0", flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: BRAND_DEEP }}>
            {data.name}
          </p>
          <p style={{ margin: "2px 0 10px", fontSize: 9, color: MUTED }}>{data.designation}</p>

          <div>
            {rows.map((r) => <Row key={r.label} label={r.label} value={r.value} />)}
          </div>
        </div>

        {/* The holder signs their own card; the space between the details and the small print is
            exactly where that belongs, and it stops the back looking half-printed. */}
        <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "30px 18px 0" }}>
          <div style={{ borderTop: `1px solid ${RULE}`, paddingTop: 4, minWidth: 150, textAlign: "center" }}>
            <span style={{ fontSize: 7.5, letterSpacing: 0.5, textTransform: "uppercase", color: MUTED }}>
              Signature of holder
            </span>
          </div>
        </div>

        <div style={{ padding: "0 18px 14px", flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 8, lineHeight: 1.5, color: MUTED }}>
            This card is the property of {COMPANY.name}. It is non-transferable and must be
            surrendered on separation. If found, please return to:
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 8.5, fontWeight: 700, color: INK, lineHeight: 1.5 }}>
            {COMPANY.email}
            <br />
            {COMPANY.website} · GSTIN {COMPANY.gstin}
          </p>
        </div>
      </div>
    );
  },
);

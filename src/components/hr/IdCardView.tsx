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
 * ── Only what the exporter can actually draw ──────────────────────────────────────────────────
 * The download used not to match the card on screen, and every cause was a CSS feature html2canvas
 * does not implement. None of them appear here any more:
 *
 *   • `object-fit` — ignored by the exporter, which stretches an image to its box. Every image on
 *     this card is given a box of its own aspect ratio instead (`fitBox`), and the photograph is
 *     cropped in pixels before it arrives (`PHOTO_BOX`, `cropToAspect`).
 *   • `box-shadow` — not painted at all, so a card designed around soft shadows exports flat.
 *     Depth here is rules, plinths and colour, all of which do export.
 *   • `text-transform` and `text-overflow: ellipsis` — applied in JavaScript (`caps`, `clamp`)
 *     rather than asked of the renderer.
 *
 * ── What makes it read as a corporate badge ───────────────────────────────────────────────────
 * A deep navy header carrying the company mark, so the issuer is identifiable across a room. A
 * large portrait on a white plinth straddling that header — the face is what a badge is checked
 * against, and it should dominate. A QR that resolves to the company's own verification page,
 * because a badge that cannot be checked proves nothing. And both signatures on the front, where
 * whoever is checking the card is already looking.
 */
import { forwardRef } from "react";
import { CARD_HEIGHT, CARD_WIDTH, PHOTO_BOX, fitBox } from "@/utils/idCard";
import type { IdCardData } from "@/utils/idCard";
import { COMPANY } from "@/utils/company";

const INK = "#0f172a";
const MUTED = "#64748b";
const FAINT = "#94a3b8";
const RULE = "#e2e8f0";
const PANEL = "#f8fafc";
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

const HEADER_HEIGHT = 96;
/**
 * How far the portrait's plinth rises into the band.
 *
 * Kept clear of the header's own text rather than pushed as high as it will go: the plinth paints
 * above the band (it has to, or the photograph's top half disappears behind it), so at a deeper
 * overlap it cut the corner off the website line — invisible on screen against a dark band, plain
 * as day in the exported PNG.
 */
const PHOTO_OVERLAP = 46;
const PLINTH = 5;

const shell: React.CSSProperties = {
  width: CARD_WIDTH,
  height: CARD_HEIGHT,
  backgroundColor: "#ffffff",
  color: INK,
  borderRadius: 14,
  overflow: "hidden",
  position: "relative",
  fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
  boxSizing: "border-box",
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
};

/** Uppercase here rather than in CSS — see the note about `text-transform` at the top. */
const caps = (s: string) => (s || "").toUpperCase();

/** And truncation here rather than `text-overflow: ellipsis`, for the same reason. */
const clamp = (s: string, max: number) => {
  const v = (s || "").trim();
  return v.length > max ? `${v.slice(0, max - 1).trimEnd()}…` : v;
};

/** Initials, for a member who has never uploaded a photo. A blank square looks like a fault. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** A small uppercase label — the type that turns a list of values into a form somebody can read. */
function Label({ children, color = MUTED, size = 7 }: { children: string; color?: string; size?: number }) {
  return (
    <span style={{ fontSize: size, fontWeight: 700, letterSpacing: 1.1, color, display: "block" }}>
      {caps(children)}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "5.5px 0", borderBottom: `1px solid ${RULE}`, alignItems: "baseline" }}>
      <span style={{ width: 84, flexShrink: 0, fontSize: 7, fontWeight: 700, letterSpacing: 1, color: FAINT }}>
        {caps(label)}
      </span>
      <span style={{ flex: 1, fontSize: 10, fontWeight: 600, color: INK, wordBreak: "break-word", lineHeight: "12px" }}>
        {value}
      </span>
    </div>
  );
}

/** An image drawn at its own aspect ratio, so screen and export cannot disagree. See `fitBox`. */
function FittedImage({ src, size, maxWidth, maxHeight, align }: {
  src: string;
  size?: { width: number; height: number } | null;
  maxWidth: number;
  maxHeight: number;
  align: "left" | "right" | "center";
}) {
  const box = fitBox(size ?? null, maxWidth, maxHeight);
  return (
    <img
      src={src}
      alt=""
      crossOrigin="anonymous"
      style={{
        width: box.width,
        height: box.height,
        display: "block",
        margin: align === "right" ? "0 0 0 auto" : align === "center" ? "0 auto" : "0 auto 0 0",
      }}
    />
  );
}

/** Everything the card needs about the marks it carries, resolved and measured by the panel. */
export interface CardMarks {
  logoUrl?: string | null;
  logoSize?: { width: number; height: number } | null;
  qrUrl?: string | null;
  ceoSignatureUrl?: string | null;
  ceoSignatureSize?: { width: number; height: number } | null;
  ceoName?: string | null;
  holderSignatureSize?: { width: number; height: number } | null;
}

/**
 * The two signatures a card carries, side by side: the holder on the left, the company on the
 * right. Printed on both faces, because a card can be checked either way up and whoever is
 * checking wants both — the company's to know the badge is genuine, the holder's to compare
 * against what the person in front of them writes.
 *
 * The company's side is labelled by the office that signs it rather than the generic "Authorised
 * Signatory": the name under a signature means much more when the reader can see it is the CEO's.
 */
function SignaturePair({ data, marks, padding = 18 }: {
  data: IdCardData;
  marks: CardMarks;
  padding?: number;
}) {
  const cell = (
    url: string | null | undefined,
    size: { width: number; height: number } | null | undefined,
    name: string | null | undefined,
    caption: string,
    align: "left" | "right",
  ) => (
    <div style={{ flex: 1, minWidth: 0, textAlign: align }}>
      <div style={{ height: 26, display: "flex", alignItems: "flex-end", justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
        {url ? <FittedImage src={url} size={size} maxWidth={120} maxHeight={26} align={align} /> : null}
      </div>
      <div style={{ borderTop: `1px solid ${RULE}`, paddingTop: 3 }}>
        {name && (
          <p style={{ margin: "0 0 1px", fontSize: 7.5, fontWeight: 700, color: INK, lineHeight: "8px" }}>
            {clamp(name, 24)}
          </p>
        )}
        <Label size={6}>{caption}</Label>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-end", padding: `0 ${padding}px`, width: "100%" }}>
      {cell(data.signatureUrl, marks.holderSignatureSize, data.name, "Signature of holder", "left")}
      {cell(marks.ceoSignatureUrl, marks.ceoSignatureSize, marks.ceoName, "CEO · Authorised signatory", "right")}
    </div>
  );
}

/** The header band, identical on both faces so the two read as one object. */
function HeaderBand({ marks, caption }: { marks: CardMarks; caption: string }) {
  return (
    <div
      style={{
        height: HEADER_HEIGHT,
        background: BAND,
        padding: "13px 18px",
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        flexShrink: 0,
        position: "relative",
      }}
    >
      {marks.logoUrl ? (
        <FittedImage src={marks.logoUrl} size={marks.logoSize} maxWidth={132} maxHeight={40} align="left" />
      ) : (
        <span style={{ fontSize: 15, fontWeight: 800, color: "#ffffff", letterSpacing: 1 }}>DTS</span>
      )}
      {/* Above the plinth, whatever the overlap: the issuer's name is not the thing that gives way. */}
      <div style={{ marginLeft: "auto", textAlign: "right", position: "relative", zIndex: 2 }}>
        <p style={{ margin: 0, fontSize: 9.5, fontWeight: 700, color: "#ffffff", letterSpacing: 0.3, lineHeight: "10px" }}>
          {COMPANY.name}
        </p>
        <p style={{ margin: "1px 0 0", fontSize: 7, color: "rgba(255,255,255,0.72)", letterSpacing: 0.3 }}>
          {COMPANY.website}
        </p>
      </div>

      {/* The word that tells anyone glancing at it what they are looking at. Tracked tightly
          enough to finish before the portrait's plinth starts — the plinth is opaque white and
          paints over the band, so a wider caption loses its last letters in the exported file. */}
      <span
        style={{
          position: "absolute",
          left: 18,
          bottom: 9,
          fontSize: 6.2,
          letterSpacing: 1.1,
          color: "rgba(255,255,255,0.6)",
          fontWeight: 600,
        }}
      >
        {caps(caption)}
      </span>
    </div>
  );
}

export const IdCardFront = forwardRef<HTMLDivElement, { data: IdCardData; marks: CardMarks }>(
  function IdCardFront({ data, marks }, ref) {
    return (
      <div ref={ref} style={shell} data-test="id-card-front">
        <HeaderBand marks={marks} caption="Identity Card" />

        {/* The portrait, straddling the band on a white plinth.
            `position: relative` is load-bearing, not decoration: the band above is positioned so it
            can carry its caption, which puts it in front of anything that is not — and a photo
            pulled up by a negative margin was rendering with its top half behind the header. */}
        <div
          style={{
            marginTop: -PHOTO_OVERLAP,
            display: "flex",
            justifyContent: "center",
            flexShrink: 0,
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            style={{
              width: PHOTO_BOX.width + PLINTH * 2,
              height: PHOTO_BOX.height + PLINTH * 2,
              borderRadius: 10,
              backgroundColor: "#ffffff",
              padding: PLINTH,
              boxSizing: "border-box",
              // A hairline ring instead of a drop shadow: the exporter paints borders and does not
              // paint box-shadow, so this is the version of "lifted" that survives a download.
              border: `1px solid ${RULE}`,
            }}
          >
            <div
              style={{
                width: PHOTO_BOX.width,
                height: PHOTO_BOX.height,
                borderRadius: 6,
                overflow: "hidden",
                backgroundColor: "#eef2ff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {data.photoUrl ? (
                /* Already cropped to this exact box's aspect — see PHOTO_BOX. */
                <img
                  src={data.photoUrl}
                  alt={data.name}
                  crossOrigin="anonymous"
                  style={{ width: PHOTO_BOX.width, height: PHOTO_BOX.height, display: "block" }}
                />
              ) : (
                <span style={{ fontSize: 44, fontWeight: 800, color: BRAND }}>{initials(data.name)}</span>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "12px 18px 12px",
            minHeight: 0,
          }}
        >
          {/* The job title wraps to a second line rather than being cut. A designation is what a
              badge is read for, and "Senior Business Development Execu…" tells a reader nothing the
              full line would not have told them in the space already sitting empty below it. */}
          <div style={{ textAlign: "center", paddingBottom: 10, borderBottom: `1px solid ${RULE}` }}>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: INK, lineHeight: "19px", letterSpacing: -0.2 }}>
              {clamp(data.name, 36)}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 10, fontWeight: 600, color: BRAND, lineHeight: "12px" }}>
              {clamp(data.designation, 58)}
            </p>
            <span
              style={{
                display: "inline-block",
                marginTop: 8,
                padding: "3px 10px",
                borderRadius: 4,
                backgroundColor: "#eef2ff",
                color: BRAND_DEEP,
                fontSize: 7.5,
                fontWeight: 700,
                letterSpacing: 0.9,
              }}
            >
              {caps(`${data.department} Department`)}
            </span>
          </div>

          {/* ID and QR side by side: the number a human reads, the code a phone reads. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "9px 11px",
              backgroundColor: PANEL,
              border: `1px solid ${RULE}`,
              borderRadius: 8,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Label>Employee ID</Label>
              <p style={{ margin: "2px 0 0", fontSize: 16, fontWeight: 800, letterSpacing: 1.2, color: INK, fontFamily: "'Courier New', monospace" }}>
                {data.employeeId}
              </p>
              {data.joinedOn && (
                <p style={{ margin: "5px 0 0", fontSize: 8, color: MUTED }}>Joined {data.joinedOn}</p>
              )}
              {data.validUntil && (
                <p style={{ margin: "3px 0 0", fontSize: 8, fontWeight: 700, color: "#b91c1c" }}>
                  Valid until {data.validUntil}
                </p>
              )}
            </div>

            {marks.qrUrl && (
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <img
                  src={marks.qrUrl}
                  alt="Verify"
                  crossOrigin="anonymous"
                  style={{ width: 56, height: 56, display: "block", borderRadius: 3, backgroundColor: "#ffffff" }}
                />
                <p style={{ margin: "3px 0 0", fontSize: 6, fontWeight: 700, letterSpacing: 0.6, color: FAINT }}>
                  {caps("Scan to verify")}
                </p>
              </div>
            )}
          </div>

          {/* Both signatures, on the front, where anyone checking the card is already looking:
              the company's to know the badge is genuine, the holder's to compare against what the
              person in front of them writes. */}
          <SignaturePair data={data} marks={marks} padding={0} />
        </div>

        <div style={{ height: 7, background: RULE_BAR, flexShrink: 0 }} />
      </div>
    );
  },
);

export const IdCardBack = forwardRef<HTMLDivElement, { data: IdCardData; marks: CardMarks }>(
  function IdCardBack({ data, marks }, ref) {
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
        <HeaderBand marks={marks} caption="Card Holder Details" />

        <div style={{ padding: "12px 18px 0", flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: INK, lineHeight: "13px" }}>
            {clamp(data.name, 30)}
          </p>
          <p style={{ margin: "2px 0 9px", fontSize: 8.5, color: MUTED }}>{clamp(data.designation, 40)}</p>

          <div>
            {rows.map((r) => <Row key={r.label} label={r.label} value={r.value} />)}
          </div>
        </div>

        {/* The same pair as the front, so whichever way up the card is read it can be checked.
            The bottom padding keeps it clear of the property notice underneath — without it the
            captions and the small print ran together into one grey band. */}
        <div style={{ flex: 1, display: "flex", alignItems: "flex-end", padding: "10px 0 14px", minHeight: 0 }}>
          <SignaturePair data={data} marks={marks} />
        </div>

        <div style={{ padding: "0 18px 12px", flexShrink: 0, display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 7, lineHeight: "9px", color: MUTED }}>
              Property of {COMPANY.name}. Non-transferable; surrender on separation. If found,
              please return to:
            </p>
            <p style={{ margin: "3px 0 0", fontSize: 7.5, fontWeight: 700, color: INK, lineHeight: "10px" }}>
              {COMPANY.email}
              {COMPANY.phone ? <><br />{COMPANY.phone}</> : null}
              <br />
              {COMPANY.website} · GSTIN {COMPANY.gstin}
            </p>
          </div>
          {marks.qrUrl && (
            <img
              src={marks.qrUrl}
              alt="Verify"
              crossOrigin="anonymous"
              style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 3, backgroundColor: "#ffffff" }}
            />
          )}
        </div>

        <div style={{ height: 7, background: RULE_BAR, flexShrink: 0 }} />
      </div>
    );
  },
);

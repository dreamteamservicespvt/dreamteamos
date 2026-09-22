/**
 * The VIDEO BOTTOM LABEL (formerly "Brand Label (Lower Third)") — a label that sits over the bottom
 * of a finished video.
 *
 * ── Designed from the video, not only the trade ──────────────────────────────────────────────────
 * The label used to be themed by business type alone, so a temple annadanam video and a festival
 * wish got the same accents as that business's everyday promotion. It now also reads the festival's
 * own palette and symbols, what the video is about (the scene plan's motive) and the core message,
 * so its colour and mood belong to THIS video. Its content rule does not move: it still carries only
 * the logo, the name, the numbers and the address.
 *
 * ── What it replaced, and why ────────────────────────────────────────────────────────────────────
 * This section used to produce a HEADER: a full-bleed strip across the top 7% of a 9:16 frame. The
 * team's ads are finished elsewhere and carry a fixed watermark in the bottom-right corner, so what
 * they actually need is the opposite — a tightly cropped, transparent label laid along the BOTTOM,
 * whose right-hand contact module is tall enough to cover that watermark on its way past.
 *
 * ── What is guaranteed here ──────────────────────────────────────────────────────────────────────
 * The whole prompt is assembled in code, with no model call (as the header was), so nothing about it
 * is left to chance: the geometry that hides the watermark, the five zones, the category's own
 * accents, the festival's accents, and above all the content rule — a label carries the logo, the
 * business name, the numbers and one address line, and nothing else. Every slogan, feature icon and
 * "admissions open" flag that crept into the team's hand-made labels is excluded by name.
 */

/** The canvas the team's own labels use: a wide 3:1 strip. */
export const LABEL_WIDTH = 2172;
export const LABEL_HEIGHT = 724;

/**
 * Where the watermark sits on a finished 9:16 video, as a share of the frame.
 *
 * Measured off a rendered ad: bottom-right, about a fifth of the width and an eighth of the height.
 * The label is laid full width along the bottom, so it stands a third of the video's width tall —
 * about 19% of a 9:16 frame — and the watermark needs the right module to reach roughly two thirds
 * of the way up it. The module is built to the FULL height of the label instead, so small
 * differences between one export and the next cannot uncover the mark.
 */
export const WATERMARK = { widthPercent: 20, heightPercent: 12 };

/** The label's own height as a share of a 9:16 frame, when laid across the full width. */
export const LABEL_FRAME_HEIGHT_PERCENT =
  Math.round((100 / (LABEL_WIDTH / LABEL_HEIGHT)) * (9 / 16) * 10) / 10;

export interface LabelTheme {
  /** Decorative motifs for this trade — accents only, never behind the text. */
  motifs: string;
  /** Where the label's colour goes once the brand's own colours are placed. */
  palette: string;
}

/**
 * A label's accents, by the same business categories the rest of the platform detects
 * (detectBusinessType), so the label belongs to the same ad as the frames and the poster.
 */
export const LABEL_THEMES: Record<string, LabelTheme> = {
  education: { motifs: "a graduation cap, an open book, a slim laurel or knowledge line-art", palette: "academic navy and gold" },
  medical: { motifs: "a clean medical cross, a fine heartbeat line", palette: "clinical white glass and medical blue" },
  realestate: { motifs: "a building silhouette, a skyline edge, an architectural line", palette: "deep blue and metallic gold" },
  construction: { motifs: "a blueprint grid, a hard hat, a steel edge", palette: "steel grey with safety orange" },
  fashion: { motifs: "a fabric fold, a fine hanger or couture line", palette: "wine or royal purple with gold" },
  food: { motifs: "a culinary flourish, a leaf sprig, a soft steam curl", palette: "warm maroon and golden orange" },
  tech: { motifs: "fine circuit lines, a subtle grid", palette: "charcoal with silver and cyan" },
  solar: { motifs: "sun rays, a panel grid", palette: "deep green and solar blue" },
  laundry: { motifs: "a water drop, a crisp folded edge", palette: "ivory and fresh blue" },
  mattress: { motifs: "a soft comfort curve", palette: "cream and calm lavender" },
  electrical: { motifs: "a power bolt, a fine tool silhouette", palette: "steel blue and graphite" },
  tea: { motifs: "a tea leaf, a soft steam curl", palette: "leaf green and warm gold" },
  jewellery: { motifs: "a facet sparkle, an ornamental curve", palette: "rich gold luxury" },
  security: { motifs: "a shield, a fine patrol line", palette: "dark navy and steel" },
  automobile: { motifs: "a wheel arc, a speed line", palette: "metallic graphite with a red accent" },
  pharma: { motifs: "a capsule, a mortar silhouette", palette: "clean green and white" },
  transport: { motifs: "a route line, a forward arrow", palette: "blue with an orange accent" },
  fitness: { motifs: "dynamic motion lines, an energy arc", palette: "black with a bright energy accent" },
  beauty: { motifs: "a petal, a soft mirror gloss", palette: "rose gold and blush" },
  default: { motifs: "clean abstract geometry", palette: "the brand's own colours" },
};

/** The label's accents for a business, falling back to plain geometry for an unknown trade. */
export const labelThemeFor = (businessType: string): LabelTheme =>
  LABEL_THEMES[businessType] ?? LABEL_THEMES.default;

/**
 * A festival's accents — VISUAL ONLY.
 *
 * The video carries the greeting; the label carries the brand. A "Happy Diwali" on the label is the
 * one thing that would stop it being reusable, and it would break the content rule below.
 */
export function festivalAccentFor(festivalName: string): string {
  const name = (festivalName || "").toLowerCase().trim();
  if (!name) return "";
  const table: [string[], string][] = [
    [["diwali", "deepavali"], "a warm diya glow and fine rangoli sparkle"],
    [["sankranti", "pongal"], "a kite line and a sugarcane or harvest motif"],
    [["ugadi", "gudi"], "fresh mango leaves and a neem sprig"],
    [["dasara", "dussehra", "navratri"], "a marigold garland edge"],
    [["ganesh", "vinayaka"], "a modak and soft festive garland accents"],
    [["christmas", "xmas"], "a pine sprig and a soft star glint"],
    [["ramzan", "ramadan", "eid"], "a fine crescent and a lantern glow"],
    [["new year"], "soft golden firework sparkle"],
    [["independence", "republic"], "a restrained tricolour ribbon accent"],
  ];
  const hit = table.find(([keys]) => keys.some((k) => name.includes(k)));
  return hit ? hit[1] : "a warm festive glow and fine celebratory sparkle";
}

export interface LowerThirdInput {
  /** From detectBusinessType — decides the accents. */
  businessType: string;
  adType: string;
  festivalName?: string;
  /** No logo file: the label carries no brand circle at all, and the name leads. */
  noLogo?: boolean;
  /** How many numbers will be placed: 0, 1, 2 or 3. */
  contactCount: number;
  hasAddress: boolean;
  /** True when one of the numbers is a WhatsApp number. */
  hasWhatsApp?: boolean;
  /** True when the client sent photographs of the premises, which may sit at the right edge. */
  hasPremisesPhoto?: boolean;
  /** A festival ad: that festival's own palette and symbols (prompts.getFestivalTheme) — visual only. */
  festivalTheme?: { colors: string; patterns: string; elements: string };
  /** What this video is about and says, so the label's mood matches it — never written on the label. */
  context?: { motive?: string; mood?: string; coreMessage?: string };
}

/** How the contacts are arranged, for the count this business actually has. */
function contactBlock(count: number, hasWhatsApp: boolean): string {
  if (count <= 0) {
    return "  - NO NUMBER was provided, so the raised right module carries no pill. Keep the module itself — it still has to cover "
      + "the watermark — and fill it with the brand's own glass, glow and a themed accent instead. Never invent a number.";
  }
  const shape = count === 1
    ? "ONE premium pill, comfortably sized and centred in the module"
    : count === 2
      ? "TWO evenly stacked pills of equal width"
      : "THREE compact stacked pills, tightened so all three stay legible";
  const eachWith = count === 1 ? "with" : "each with";
  return `  - ${shape}, ${eachWith} a small phone icon, a glass or gradient face, a metallic edge and a soft shadow.`
    + (hasWhatsApp
      ? "\n  - One of the numbers is a WhatsApp number: give it a WhatsApp pill of its own, in WhatsApp green, beside the call pill(s)."
      : "");
}

/**
 * The finished label prompt, minus the values.
 *
 * The caller appends the real logo / name / numbers / address underneath, exactly as the header did,
 * so the truth rules and the values the member copies sit next to each other.
 */
export function LOWER_THIRD_SYSTEM_PROMPT(input: LowerThirdInput): string {
  const { businessType, adType, festivalName = "", noLogo = false, contactCount, hasAddress } = input;
  const theme = labelThemeFor(businessType);
  const festive = adType === "festival" ? festivalAccentFor(festivalName) : "";
  const festivalTheme = adType === "festival" ? input.festivalTheme : undefined;
  const context = input.context;
  const videoMood = [
    context?.motive ? `this video is about ${context.motive}` : "",
    context?.coreMessage ? `its message is ${context.coreMessage}` : "",
    context?.mood ? `its mood is ${context.mood}` : "",
  ].filter(Boolean).join("; ");
  const ratio = Math.round((LABEL_WIDTH / LABEL_HEIGHT) * 10) / 10;
  const brandSlot = noLogo
    ? "- LEFT: NO brand circle and no brand container of any kind. THIS BUSINESS HAS NO BRAND IMAGE FILE, and none will be "
      + "supplied. The BUSINESS NAME starts at the left edge of the label and runs wider, and it is the only branding. Never draw "
      + "an empty circle, and never invent an emblem, icon, monogram or symbol to fill the space — and never repeat the name in a "
      + "second panel."
    : "- LEFT: the attached logo, used EXACTLY as provided and never redrawn, recoloured or cropped, inside a premium circular (or "
      + "softly rounded) glass container with a metallic rim and a gentle inner shadow.";

  return `VIDEO BOTTOM LABEL — design a PREMIUM label: a transparent PNG strip laid over the BOTTOM of a finished ${adType === "festival" ? "festival " : ""}advertisement video.

This is NOT a poster, NOT a 9:16 image, NOT a top header and NOT a full video frame. It is one wide label, cut out, with nothing around it.

===== OUTPUT (NON-NEGOTIABLE) =====

- A TRANSPARENT PNG with a real alpha channel. Everything outside the label's own shape is fully transparent — no background colour, no white card, no black box, and never a checkerboard drawn as pixels.
- If a true alpha channel is impossible, render the label on a FLAT PURE MAGENTA (#FF00FF) background and nothing else, so it keys out cleanly. Never a gradient, a scene or a photo behind it.
- TIGHT CROP: the canvas ends where the design ends. No empty margin, no padding, no letterboxing, no safe area.
- Canvas ${LABEL_WIDTH} x ${LABEL_HEIGHT} px — a wide ${ratio}:1 strip — ultra sharp, high resolution, premium 3D finish.

===== WHERE IT IS USED — THE RULE THIS DESIGN EXISTS FOR =====

The finished video carries a FIXED WATERMARK in its BOTTOM-RIGHT corner, about ${WATERMARK.widthPercent}% of the frame's width and ${WATERMARK.heightPercent}% of its height. This label is laid across the full width of that video, flush with the bottom edge, where it stands about ${LABEL_FRAME_HEIGHT_PERCENT}% of the frame tall.

- The RIGHT-HAND CONTACT MODULE is therefore the TALLEST part of the label: it rises to the FULL height of the label and occupies roughly the right 22% of its width, so that once the label is placed, that module sits over the watermark and hides it completely.
- The raised module is part of the design — a taller rounded glass block the rest of the label flows into — never a patch, a sticker or a plain rectangle pasted on top.
- Everything else (brand circle, name, address strip) sits LOWER than that module. The silhouette is deliberately asymmetric: low on the left, rising on the right.

===== LAYOUT — FIVE ZONES, IN THIS ORDER =====

${brandSlot}
- CENTRE: the BUSINESS NAME and nothing else — the hero of the label, in elegant premium typography with strong hierarchy, on one line, or two when the name is long. Never repeat the name anywhere else${noLogo ? "" : ", and never re-type words that are already inside the logo"}.
- RIGHT (RAISED): the contact module described above.
${contactBlock(contactCount, !!input.hasWhatsApp)}
- BOTTOM: ${hasAddress
    ? "a slim address strip running under the brand circle and the name, carrying the address on ONE single line with a small location pin. Shrink the address text as much as needed to keep it on that one line — never wrap it and never break it onto a second line."
    : "NO address strip at all. No address was provided, so that strip does not exist — close the space cleanly and let the label sit shorter. Never draw an empty bar."}
- The zones overlap and interlock with soft curves and layered depth — a floating, asymmetric composition, never a row of equal boxes.

===== THEME — ${businessType.toUpperCase()} =====

- Accents for this trade: ${theme.motifs}. Keep them small and sparing — at the edges, behind the raised module, or along the label's curve. Never behind the text, never as a pattern across the whole label.
- Colour: the brand's OWN colours, taken from the logo, always lead. ${theme.palette} is the supporting direction, not a replacement.
${input.hasPremisesPhoto
    ? "- The client's own premises photograph may sit as a soft, cleanly masked cut-out at the far right edge, blending into the raised module. It stays behind the contact pills and never covers any text."
    : "- NO photographs: this label is graphic only. Never invent a building, a shopfront, an office or people."}
${festivalTheme
    ? `- FESTIVAL THEME (VISUAL ONLY) — this label belongs to a ${festivalName} video, so its colour and accents follow that festival exactly: colours ${festivalTheme.colors}; patterns ${festivalTheme.patterns}; symbols ${festivalTheme.elements} (one or two, small, at the edges). Do NOT write the festival's name, a greeting, wishes or a date anywhere on the label — the video says those; the label only brands the business.\n`
    : festive ? `- FESTIVAL ACCENT (VISUAL ONLY): ${festive}, with a slightly warmer glow. Do NOT write the festival's name, a greeting, wishes or a date anywhere on the label — the video says those; the label only brands the business.\n` : ""}${videoMood
    ? `- THIS VIDEO: ${videoMood}. Let the label's colour temperature, glow and accents suit it — calm and sacred for a devotional video, warm and generous for a food or community video, bolder for an offer. Never write any of it on the label.\n`
    : ""}
===== DESIGN LANGUAGE =====

Luxury cinematic UI — glassmorphism, metallic borders, soft outer glow, layered depth, rich gradients, premium shadows, elegant curves. It must read as one dimensional object, lit from a single direction.

NEVER: flat rectangles, a Canva or printed-banner look, equal-sized boxes in a row, hard outlines, clip-art, heavy text, or a busy background.

===== CONTENT — THE STRICTEST RULE HERE =====

The label carries FOUR things and nothing else:
1. ${noLogo ? "(no logo — this business has none)" : "the attached logo"}
2. the business name
3. the contact number(s)
4. ${hasAddress ? "the address, on one line" : "(no address — this business gave none, so there is no address strip)"}

NEVER place: a slogan, a tagline, a promise, feature icons or feature words (privacy, peace, community, safety and the like), a service list, an offer, a price, a discount, a date, an academic year, "admissions open", social handles, a website, an email, a QR code, a call to action, or any sentence at all. The video is the advertisement; the label is only the brand.

- Use ONLY the values supplied below, exactly as written, digit for digit.
- NEVER invent, guess or complete a value. A field that was not given does not exist: draw no pill, no bar and no placeholder for it, and never write "N/A" or "not provided".
- Every character must be crisp, correctly spelled and clearly readable at video size.

===== FINAL CHECK BEFORE YOU RENDER =====

1. Is the background truly transparent (or flat magenta), with the canvas cropped tight to the design?
2. Is the RIGHT contact module the tallest part, at full label height across the right ~22%?
3. Is the silhouette asymmetric — lower on the left, raised on the right — rather than one even bar?
4. ${noLogo ? "Is the business name written exactly once, with no invented emblem, circle or monogram anywhere?" : "Is the logo untouched, and the business name written exactly once?"}
5. Is there any slogan, feature word, service, offer or extra sentence anywhere? If so, delete it and redraw.
6. Is the address on ONE line${hasAddress ? "" : " — or, as here, absent entirely, with no empty bar"}?`;
}

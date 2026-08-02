import { describe, expect, it } from "vitest";
import {
  HEADER_SYSTEM_PROMPT, POSTER_SYSTEM_PROMPT, MAIN_FRAME_SYSTEM_PROMPT, getBrandMark,
  buildBrandMarkDirective,
} from "@/services/prompts";

/**
 * "No logo" has to mean no logo everywhere.
 *
 * The main frame handled it, but the header and the poster hard-coded "the attached logo" in their
 * own bodies. A prefixed note told the model to substitute a name board wherever it saw the word
 * "logo" — which is not the same as removing it: the generated prompt still carried instructions to
 * attach and preserve a logo file the member had explicitly said did not exist.
 *
 * These pin the words themselves, because the words are the deliverable — the member copies the
 * prompt straight into an image generator.
 */

const NAME = "SHARMA ELECTRONICS";

/** Any surviving instruction to use a logo file. Case-insensitive: prompts mix casing freely. */
const ASKS_FOR_A_LOGO = /attached logo|attach (the |a )?logo|logo (image|file)|upload (the |a )?logo/i;

describe("getBrandMark", () => {
  it("keeps the attached logo when there is one", () => {
    expect(getBrandMark(false, NAME)).toMatchObject({ isNameBoard: false, ref: "the attached logo" });
  });

  it("asks for a physical wall board inside a photographed scene", () => {
    const mark = getBrandMark(true, NAME, "scene");
    expect(mark.isNameBoard).toBe(true);
    expect(mark.ref).toMatch(/wall sign|board|fascia/i);
    expect(mark.ref).toContain(NAME);
  });

  it("asks for a typographic wordmark inside a designed layout", () => {
    const mark = getBrandMark(true, NAME, "layout");
    // A header band has no wall — asking for signage there produced nonsense.
    expect(mark.ref).toMatch(/WORDMARK/);
    expect(mark.ref).not.toMatch(/wall sign|fascia/i);
    expect(mark.ref).toContain(NAME);
  });

  it("still works when no business name was typed", () => {
    expect(getBrandMark(true, "", "layout").ref).toMatch(/business's exact name/i);
  });
});

describe("HEADER_SYSTEM_PROMPT", () => {
  const withLogo = HEADER_SYSTEM_PROMPT("commercial", "", false, "");
  const noLogo = HEADER_SYSTEM_PROMPT("commercial", "", true, NAME);

  it("asks for the attached logo when one exists", () => {
    expect(withLogo).toMatch(ASKS_FOR_A_LOGO);
  });

  it("never asks for a logo in no-logo mode", () => {
    expect(noLogo).not.toMatch(ASKS_FOR_A_LOGO);
  });

  /**
   * The header already has the business name as its hero element. Filling the empty logo slot
   * with a "name wordmark" therefore printed the same name twice, in two boxes side by side —
   * which is what members saw and reported. A header with no logo has one box FEWER.
   */
  it("drops the brand box entirely rather than filling it with the name again", () => {
    expect(noLogo).not.toMatch(/BRAND container|LOGO container/);
    expect(noLogo).not.toMatch(/NAME WORDMARK/);
    expect(noLogo).toMatch(/NO brand box/);
  });

  it("says the name goes in exactly one place", () => {
    expect(noLogo).toMatch(/must appear EXACTLY ONCE/);
  });

  it("gives the freed space to the business name instead of leaving a gap", () => {
    expect(noLogo).toMatch(/LEFT \+ CENTRE/);
    expect(noLogo).toMatch(/flush against the left inner edge/);
    // Nothing is left aligning against a box that no longer exists.
    expect(noLogo).not.toMatch(/The (LOGO|BRAND) box, the NAME container/);
  });

  it("still forbids inventing an emblem to fill the space", () => {
    expect(noLogo).toMatch(/THIS BUSINESS HAS NO BRAND IMAGE FILE/);
    expect(noLogo).toMatch(/never invent an emblem, icon, monogram or symbol/i);
  });

  it("keeps the logo box, and its alignment, when a logo does exist", () => {
    expect(withLogo).toMatch(/LOGO container/);
    expect(withLogo).toMatch(/- LEFT: a square \/ rounded-square LOGO container/);
    expect(withLogo).toMatch(/The LOGO box, the NAME container, and the CONTACT pills/);
    expect(withLogo).toMatch(/- CENTRE: a large rounded-rectangle container/);
  });

  it("keeps the layout, the adaptive rules and the no-fabrication rules intact", () => {
    for (const prompt of [withLogo, noLogo]) {
      expect(prompt).toMatch(/EXACT LAYOUT/);
      expect(prompt).toMatch(/ADAPTIVE RULES/);
      expect(prompt).toMatch(/NEVER invent, guess, autocomplete, or fabricate/);
      expect(prompt).toMatch(/BUSINESS NAME: the visual hero/);
    }
  });
});

describe("POSTER_SYSTEM_PROMPT", () => {
  const withLogo = POSTER_SYSTEM_PROMPT("commercial", "", false, "");
  const noLogo = POSTER_SYSTEM_PROMPT("commercial", "", true, NAME);

  it("asks for the attached logo when one exists", () => {
    expect(withLogo).toMatch(ASKS_FOR_A_LOGO);
    expect(withLogo).toMatch(/top centre/);
  });

  it("never asks for a logo in no-logo mode", () => {
    expect(noLogo).not.toMatch(ASKS_FOR_A_LOGO);
  });

  it("puts the business-name wordmark at the top centre instead", () => {
    expect(noLogo).toMatch(/WORDMARK/);
    expect(noLogo).toMatch(/top centre/);
    expect(noLogo).toContain(NAME);
  });

  it("draws its colours from the brand palette rather than a logo that does not exist", () => {
    expect(withLogo).toMatch(/derived from the logo \/ brand/);
    expect(noLogo).toMatch(/derived from the business's own brand palette/);
  });

  it("forbids inventing a stand-in emblem", () => {
    expect(noLogo).toMatch(/never invent an emblem, icon, monogram, or symbol/i);
    expect(noLogo).toMatch(/THIS BUSINESS HAS NO BRAND IMAGE FILE/);
  });

  it("keeps the festival theming and the design-quality rules", () => {
    const festival = POSTER_SYSTEM_PROMPT("festival", "Diwali", true, NAME);
    expect(festival).toMatch(/Diwali/);
    expect(festival).toMatch(/GRAPHIC-DESIGN QUALITY/);
    expect(festival).not.toMatch(ASKS_FOR_A_LOGO);
  });
});

describe("buildBrandMarkDirective", () => {
  it("says nothing at all when there is a logo", () => {
    expect(buildBrandMarkDirective(false, NAME, "layout")).toBe("");
  });

  it("never names the thing it is ruling out", () => {
    // Negations are the weakest instruction there is: leaving "the attached logo" in the text is
    // how a generator ends up reaching for one anyway.
    expect(buildBrandMarkDirective(true, NAME, "layout")).not.toMatch(ASKS_FOR_A_LOGO);
    expect(buildBrandMarkDirective(true, NAME, "scene")).not.toMatch(ASKS_FOR_A_LOGO);
  });

  it("asks a designed layout for a wordmark and a photographed scene for a wall board", () => {
    expect(buildBrandMarkDirective(true, NAME, "layout")).toMatch(/WORDMARK MODE/);
    expect(buildBrandMarkDirective(true, NAME, "scene")).toMatch(/NAME-BOARD MODE/);
  });

  it("gives the header no substitute mark at all — it already shows the name", () => {
    const header = buildBrandMarkDirective(true, NAME, "header");
    expect(header).toMatch(/NO brand box at all/);
    expect(header).toMatch(/EXACTLY ONCE/);
    // A wordmark here is what produced the duplicate, so this surface must never ask for one.
    expect(header).not.toMatch(/WORDMARK MODE/);
    expect(header).not.toMatch(ASKS_FOR_A_LOGO);
  });

  it("says nothing for a header that does have a logo", () => {
    expect(buildBrandMarkDirective(false, NAME, "header")).toBe("");
  });

  it("carries the exact business name through", () => {
    expect(buildBrandMarkDirective(true, NAME, "layout")).toContain(NAME);
  });
});

/**
 * The header prompt is assembled locally and copied whole into the image generator, so what the
 * member actually pastes is the directive AND the system prompt together. Both halves have to be
 * clean, which is the composition this checks.
 */
describe("the assembled header prompt", () => {
  /** Directive + design rules + the content block, exactly as geminiService joins them. */
  const assembled = (noLogo: boolean) =>
    buildBrandMarkDirective(noLogo, NAME, "header")
    + HEADER_SYSTEM_PROMPT("commercial", "", noLogo, NAME)
    + "\n\nREAL CONTENT TO PLACE:\n"
    + (noLogo
      ? "NO BRAND IMAGE — this header has no logo box and no brand tile; the NAME below is the only branding, and it appears exactly once"
      : "LOGO = use the attached logo image exactly as provided, unchanged")
    + `\nNAME = ${NAME}`;

  it("carries no request for a logo anywhere in no-logo mode", () => {
    expect(assembled(true)).not.toMatch(ASKS_FOR_A_LOGO);
  });

  it("still asks for one normally", () => {
    expect(assembled(false)).toMatch(ASKS_FOR_A_LOGO);
  });

  /**
   * The bug, in one assertion. The member copies this whole string into an image generator, and
   * it used to hand over the business name twice — once as "BRAND MARK = <name>" and again as
   * "NAME = <name>" — which is why the finished header showed it in two boxes.
   */
  it("hands the business name to the generator exactly once", () => {
    expect((assembled(true).match(new RegExp(NAME, "g")) || []).length).toBe(1);
  });

  it("does not describe a brand mark at all when there is no logo", () => {
    expect(assembled(true)).not.toMatch(/BRAND MARK =/);
    expect(assembled(true)).toMatch(/NO BRAND IMAGE/);
  });
});

describe("MAIN_FRAME_SYSTEM_PROMPT — unchanged behaviour", () => {
  it("still swaps in a wall name board, not a wordmark", () => {
    const prompt = MAIN_FRAME_SYSTEM_PROMPT("professional", "commercial", "", "9:16", "", "female", "", true, NAME);
    expect(prompt).toContain(NAME);
    expect(prompt).toMatch(/NAME BOARD/);
  });
});

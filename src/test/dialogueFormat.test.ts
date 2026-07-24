import { describe, it, expect } from "vitest";
import {
  formatCanonicalDialogue, formatDialogueScript, parseDialogueClips,
  validateDialogueClips, countSpokenWords, applyNameSpellings,
  WORDS_PER_CLIP, MIN_WORDS_PER_LINE, MAX_WORDS_PER_LINE,
  type DialogueClip,
} from "@/utils/dialogueFormat";
import { getCharacterPack, packSpeakers, packSpeakerAliases, packNameSpellings } from "@/services/characterPacks";
import { isClipHeaderLine, parseLabeledClips } from "@/utils/voiceOverFormat";

/**
 * A character-pack clip is an exchange, not a line: both characters must speak inside the same
 * 8 seconds, in a fixed order, hitting an exact word budget. These lock that contract — it is
 * what every downstream prompt and repair pass depends on.
 */

const pack = getCharacterPack("motu_patlu")!;
const speakers = packSpeakers(pack);
const aliases = packSpeakerAliases(pack);

/** Exactly `n` spoken words, so tests state their intent rather than counting by hand. */
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i + 1}`).join(" ");

/**
 * A clip with the given word split. `tag` makes a clip's text unique without changing its count,
 * so duplicate-detection tests can be written honestly.
 */
const clipOf = (motuWords: number, patluWords: number, tag = ""): DialogueClip => [
  { speaker: "motu", text: `${tag}${tag ? " " : ""}${words(motuWords - (tag ? 1 : 0))}?` },
  { speaker: "patlu", text: `${words(patluWords)}.` },
];

describe("countSpokenWords", () => {
  it("counts words a listener actually hears, ignoring punctuation", () => {
    expect(countSpokenWords("Hello there, friend!")).toBe(3);
    expect(countSpokenWords("  spaced   out　words ")).toBeGreaterThanOrEqual(2);
  });

  it("counts non-Latin scripts the same way", () => {
    expect(countSpokenWords("మీ బిజినెస్ కోసం బెస్ట్ ఆఫర్!")).toBe(5);
  });
});

describe("formatting", () => {
  it("writes the canonical form the model is asked to produce", () => {
    const clips = [clipOf(8, 8), clipOf(8, 8)];
    const out = formatCanonicalDialogue(clips);
    const lines = out.split("\n");
    expect(lines[0].startsWith("0-8|motu: ")).toBe(true);
    expect(lines[1].startsWith("0-8|patlu: ")).toBe(true);
    expect(lines[2].startsWith("8-16|motu: ")).toBe(true);
    expect(lines[3].startsWith("8-16|patlu: ")).toBe(true);
  });

  it("writes the labelled display form a member copies", () => {
    const out = formatDialogueScript([clipOf(8, 8)], speakers);
    expect(out).toContain("clip-1[0-8sec]");
    expect(out).toContain("[Motu]:");
    expect(out).toContain("[Patlu]:");
  });

  it("round-trips: format → parse gives back the same clips", () => {
    const clips = [clipOf(8, 8, "alpha"), clipOf(8, 8, "beta")];
    const parsed = parseDialogueClips(formatCanonicalDialogue(clips), aliases);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].map(l => l.speaker)).toEqual(["motu", "patlu"]);
    expect(parsed[1][0].text).toBe(clips[1][0].text);
  });

  it("round-trips the display form too", () => {
    const clips = [clipOf(8, 8, "alpha"), clipOf(8, 8, "beta")];
    const parsed = parseDialogueClips(formatDialogueScript(clips, speakers), aliases);
    expect(parsed).toHaveLength(2);
    expect(parsed[1][1].text).toBe(clips[1][1].text);
  });

  /**
   * The bug this pins shipped: the header was written without its colon, the AI Platform's clip
   * splitter requires a separator to recognise a header, so the whole script fell through to the
   * "unlabelled" fallback and every clip appeared crammed inside clip-1's card.
   */
  it("writes a header the AI Platform's clip splitter can actually see", () => {
    const script = formatDialogueScript([clipOf(8, 8), clipOf(8, 8)], speakers);
    expect(script).toContain("clip-1[0-8sec]:");
    expect(script).toContain("clip-2[8-16sec]:");
    for (const line of script.split("\n")) {
      if (line.includes("clip-")) expect(isClipHeaderLine(line)).toBe(true);
    }
  });

  it("splits into one card per clip, each keeping both speakers on their own line", () => {
    const script = formatDialogueScript([clipOf(8, 8, "alpha"), clipOf(8, 8, "beta")], speakers);
    const cards = parseLabeledClips(script);
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      const lines = card.split("\n");
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain("[Motu]:");
      expect(lines[1]).toContain("[Patlu]:");
    }
    // Clip 2's words must not have leaked into clip 1's card — that was the visible symptom.
    expect(cards[0]).not.toContain("beta");
  });
});

describe("parsing tolerates what the model actually emits", () => {
  it("reads the canonical ranged form", () => {
    const parsed = parseDialogueClips("0-8|motu: Line one?\n0-8|patlu: Line two.", aliases);
    expect(parsed).toEqual([[
      { speaker: "motu", text: "Line one?" },
      { speaker: "patlu", text: "Line two." },
    ]]);
  });

  it("reads plain speaker lines under a clip header", () => {
    const parsed = parseDialogueClips("clip-1[0-8sec]\n[Motu]: A?\n[Patlu]: B.\nclip-2[8-16sec]\nMotu: C?\nPatlu: D.", aliases);
    expect(parsed).toHaveLength(2);
    expect(parsed[1].map(l => l.text)).toEqual(["C?", "D."]);
  });

  it("accepts a bare second-range header", () => {
    const parsed = parseDialogueClips("0-8:\nMotu: A?\nPatlu: B.", aliases);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toHaveLength(2);
  });

  it("is case-insensitive about character names", () => {
    const parsed = parseDialogueClips("0-8|MOTU: A?\n0-8|Patlu: B.", aliases);
    expect(parsed[0].map(l => l.speaker)).toEqual(["motu", "patlu"]);
  });

  it("treats a wrapped continuation as part of the line above, not a new turn", () => {
    const parsed = parseDialogueClips("[Motu]: this line\ncontinues here?\n[Patlu]: B.", aliases);
    expect(parsed[0]).toHaveLength(2);
    expect(parsed[0][0].text).toBe("this line continues here?");
  });

  it("places clips by their stated range, even when emitted out of order", () => {
    const parsed = parseDialogueClips("8-16|motu: second?\n8-16|patlu: second b.\n0-8|motu: first?\n0-8|patlu: first b.", aliases);
    expect(parsed).toHaveLength(2);
    expect(parsed[0][0].text).toBe("first?");
    expect(parsed[1][0].text).toBe("second?");
  });

  it("stops at a trailing FULL SCRIPT block", () => {
    const parsed = parseDialogueClips("0-8|motu: A?\n0-8|patlu: B.\nFULL SCRIPT:\nsomething else", aliases);
    expect(parsed[0]).toHaveLength(2);
  });

  it("returns nothing for unparseable text so callers can fall back", () => {
    expect(parseDialogueClips("", aliases)).toEqual([]);
    expect(parseDialogueClips("just some prose with no speakers", aliases)).toEqual([]);
  });
});

describe("validation — the 8-second two-hander contract", () => {
  const ok = [clipOf(8, 8, "one"), clipOf(8, 8, "two")];

  it("passes a well-formed script", () => {
    expect(validateDialogueClips(ok, 2, speakers)).toEqual([]);
  });

  it("flags the wrong number of clips", () => {
    const issues = validateDialogueClips(ok, 4, speakers);
    expect(issues.some(i => i.includes("Expected exactly 4 clips"))).toBe(true);
  });

  it("requires BOTH characters in every clip", () => {
    const solo: DialogueClip[] = [[{ speaker: "motu", text: `${words(16)}?` }]];
    const issues = validateDialogueClips(solo, 1, speakers);
    expect(issues.some(i => i.includes("missing Patlu's line"))).toBe(true);
    expect(issues.some(i => i.includes("exactly 2 spoken lines"))).toBe(true);
  });

  it("requires Motu to speak first", () => {
    const reversed: DialogueClip[] = [[
      { speaker: "patlu", text: `${words(8)}.` },
      { speaker: "motu", text: `${words(8)}?` },
    ]];
    const issues = validateDialogueClips(reversed, 1, speakers);
    expect(issues.some(i => i.includes("Motu must speak in position 1"))).toBe(true);
  });

  it("rejects one character speaking twice", () => {
    const twice: DialogueClip[] = [[
      { speaker: "motu", text: `${words(8)}?` },
      { speaker: "motu", text: `${words(8)}.` },
    ]];
    const issues = validateDialogueClips(twice, 1, speakers);
    expect(issues.some(i => i.includes("Motu speaks 2 times"))).toBe(true);
  });

  it("enforces the exact clip word budget", () => {
    const tooLong = [clipOf(9, 9)]; // 18 words — a single-speaker budget, too long for a two-hander
    const issues = validateDialogueClips(tooLong, 1, speakers);
    expect(issues.some(i => i.includes(`exactly ${WORDS_PER_CLIP} spoken words`))).toBe(true);
  });

  it("allows an uneven but in-range split that still totals the budget", () => {
    expect(validateDialogueClips([clipOf(7, 9)], 1, speakers)).toEqual([]);
    expect(validateDialogueClips([clipOf(9, 7)], 1, speakers)).toEqual([]);
  });

  it("rejects a line outside the per-character range even when the total is right", () => {
    const lopsided = [clipOf(MIN_WORDS_PER_LINE - 1, MAX_WORDS_PER_LINE + 1)];
    const issues = validateDialogueClips(lopsided, 1, speakers);
    expect(issues.some(i => i.includes(`${MIN_WORDS_PER_LINE}-${MAX_WORDS_PER_LINE} words`))).toBe(true);
  });

  it("requires spoken punctuation on each line", () => {
    const noPunct: DialogueClip[] = [[
      { speaker: "motu", text: words(8) },
      { speaker: "patlu", text: `${words(8)}.` },
    ]];
    const issues = validateDialogueClips(noPunct, 1, speakers);
    expect(issues.some(i => i.includes("must end with spoken punctuation"))).toBe(true);
  });

  it("catches both characters saying the same thing", () => {
    const same: DialogueClip[] = [[
      { speaker: "motu", text: `${words(8)}.` },
      { speaker: "patlu", text: `${words(8)}.` },
    ]];
    const issues = validateDialogueClips(same, 1, speakers);
    expect(issues.some(i => i.includes("both characters say the same line"))).toBe(true);
  });

  it("catches a duplicated clip", () => {
    const dupe = [clipOf(8, 8, "same"), clipOf(8, 8, "same")];
    const issues = validateDialogueClips(dupe, 2, speakers);
    expect(issues.some(i => i.includes("duplicates clip 1"))).toBe(true);
  });

  it("reports an empty line rather than silently accepting it", () => {
    const empty: DialogueClip[] = [[
      { speaker: "motu", text: "" },
      { speaker: "patlu", text: `${words(8)}.` },
    ]];
    const issues = validateDialogueClips(empty, 1, speakers);
    expect(issues.some(i => i.includes("line is empty"))).toBe(true);
  });
});

describe("character pack registry", () => {
  it("defines Motu and Patlu in speaking order", () => {
    expect(pack.characters.map(c => c.key)).toEqual(["motu", "patlu"]);
    expect(speakers.map(s => s.name)).toEqual(["Motu", "Patlu"]);
  });

  it("carries what writing and voicing a character needs, and nothing about how they look", () => {
    for (const c of pack.characters) {
      expect(c.scriptRole.length).toBeGreaterThan(40);
      expect(c.persona).toBeTruthy();
      expect(c.voice).toBeTruthy();
      // Appearance is deliberately absent: the models know these characters, and describing them
      // produced a generic look-alike. Name them and stop — see services/characterPacks.
      expect(c).not.toHaveProperty("visualCanon");
    }
  });

  it("keeps the location photoreal and the characters consistent, as hard negatives", () => {
    const negatives = pack.negatives.join(" ").toLowerCase();
    expect(negatives).toContain("photoreal");
    expect(negatives).toContain("proportions");
    expect(negatives).toContain("on-screen text");
  });

  it("returns null for a normal ad and for an unknown pack", () => {
    expect(getCharacterPack(undefined)).toBeNull();
    expect(getCharacterPack("")).toBeNull();
    expect(getCharacterPack("nope")).toBeNull();
  });

  it("exposes aliases so a parser accepts keys and names alike", () => {
    expect(aliases).toContain("motu");
    expect(aliases).toContain("patlu");
  });
});

/**
 * The spoken names are fixed, not transliterated per run. A model writing Telugu spells "Patlu"
 * a different way almost every time, so the same character ends up called two different things
 * inside one ad. These pin the two spellings and the rewrite that enforces them.
 */
describe("fixed spoken name spellings", () => {
  const telugu = packNameSpellings(pack, "Telugu");
  const motu = telugu.find(s => s.name === "Motu")!;
  const patlu = telugu.find(s => s.name === "Patlu")!;

  it("fixes Motu as మోటూ and Patlu as పతలూ in Telugu", () => {
    expect(motu.spelling).toBe("మోటూ");
    expect(patlu.spelling).toBe("పతలూ");
  });

  it("is case- and space-insensitive about the language name", () => {
    expect(packNameSpellings(pack, "  telugu ")).toHaveLength(2);
  });

  it("leaves languages with no fixed spelling free", () => {
    expect(packNameSpellings(pack, "Hindi")).toEqual([]);
    expect(packNameSpellings(pack, "")).toEqual([]);
  });

  it("rewrites the spelling the model actually produced", () => {
    const clips: DialogueClip[] = [[
      { speaker: "motu", text: "పట్లూ, మన వ్యాపారానికి మంచి ప్రమోషన్ ఎలా చేయగలము?" },
      { speaker: "patlu", text: "ప్రచారం చాలా సులువు కదా, మోటు." },
    ]];
    const out = applyNameSpellings(clips, telugu);
    expect(out[0][0].text).toContain("పతలూ");
    expect(out[0][0].text).not.toContain("పట్లూ");
    expect(out[0][1].text).toContain("మోటూ");
  });

  it("keeps the rest of the line untouched", () => {
    const clips: DialogueClip[] = [[{ speaker: "motu", text: "పట్లూ, ఎలా చేయగలము?" }]];
    expect(applyNameSpellings(clips, telugu)[0][0].text).toBe("పతలూ, ఎలా చేయగలము?");
  });

  it("leaves a line with no name in it alone", () => {
    const clips: DialogueClip[] = [[{ speaker: "motu", text: "ఇప్పుడే మమ్మల్ని సంప్రదించు!" }]];
    const out = applyNameSpellings(clips, telugu);
    expect(out[0][0].text).toBe("ఇప్పుడే మమ్మల్ని సంప్రదించు!");
  });

  it("is idempotent — the correct spelling survives a second pass", () => {
    const clips: DialogueClip[] = [[{ speaker: "motu", text: "పతలూ మరియు మోటూ." }]];
    expect(applyNameSpellings(applyNameSpellings(clips, telugu), telugu)[0][0].text).toBe("పతలూ మరియు మోటూ.");
  });

  // The two-speaker contract is keyed on the Latin labels; rewriting them would break parsing.
  it("never touches the [Motu]/[Patlu] labels", () => {
    const clips: DialogueClip[] = [[{ speaker: "motu", text: "పట్లూ, ఎలా?" }]];
    const script = formatDialogueScript(applyNameSpellings(clips, telugu), speakers);
    expect(script).toContain("[Motu]:");
  });

  it("does nothing when the language has no fixed spellings", () => {
    const clips: DialogueClip[] = [[{ speaker: "motu", text: "పట్లూ, ఎలా?" }]];
    expect(applyNameSpellings(clips, [])[0][0].text).toBe("పట్లూ, ఎలా?");
  });
});

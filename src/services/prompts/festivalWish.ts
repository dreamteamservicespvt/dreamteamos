/**
 * Who a festival wish is addressed to.
 *
 * The team's own wording, on every card and poster they have ever sent: the business wishes its
 * MITHRULU (friends), SHREYOBHILASHULU (well-wishers) and CUSTOMERS. Scripts were opening with a
 * generic "to you and your family" instead, which reads like anyone's greeting rather than this
 * business greeting the people it actually knows.
 *
 * Kept here so the writer, the repair pass, the character-ad prompts and the check that the clip
 * really says it all use one list: the groups are spoken as a plain comma list, the way people
 * say them out loud.
 *
 * ── Shortened for an 8-second clip (owner, 2026-10-22) ──
 * The Telugu greeting was "{business} తరఫున మా మిత్రులు, శ్రేయోభిలాషులు, కస్టమర్లందరికీ {festival} హృదయపూర్వక
 * శుభాకాంక్షలు" — 12 words and ~43 syllables, ~6.5 s in Flow before the 17–20-word contract added its five more.
 * The live check's greeting (19 words, 58 syllables) ran out of time: Flow said 53 syllables in 7.98 s and cut
 * the wish word itself, శుభాకాంక్షలు, so the namaskaram had no wish to land on. The owner chose to keep the word
 * contract and drop శ్రేయోభిలాషులు and హృదయపూర్వక from the greeting (both long, both formal); the greeting
 * is now "{business} తరఫున మా మిత్రులు, కస్టమర్లందరికీ {festival} శుభాకాంక్షలు". Other languages are unchanged.
 */
import { festivalNameIn, festivalSpellingRule } from "@/utils/festivalNames";

/** The groups, as the Telugu greeting says them. Matching uses the stem, so case endings are fine. */
export const WISH_AUDIENCE_TELUGU = [
  { stem: "మిత్రుల", spoken: "మిత్రులు", english: "friends" },
  { stem: "కస్టమర్", spoken: "కస్టమర్లందరికీ", english: "customers" },
];

/** "మిత్రులు, కస్టమర్లందరికీ" — the address, spoken as a plain list. */
export const WISH_AUDIENCE_LINE = WISH_AUDIENCE_TELUGU.map((a) => a.spoken).join(", ");

/** Long, formal words the Telugu greeting no longer says (2026-10-22, above) — the writer is told, and code checks. */
export const WISH_DROPPED_TELUGU = [
  { stem: "శ్రేయోభిలాష", word: "శ్రేయోభిలాషులు" },
  { stem: "హృదయపూర్వ", word: "హృదయపూర్వక" },
];

/** The same address in English, for every other language. */
export const WISH_AUDIENCE_ENGLISH = "friends, well-wishers and customers";

const isTeluguLanguage = (language?: string) =>
  ((language || "Telugu").trim() || "Telugu").toLowerCase() === "telugu";

/**
 * The shape of the greeting the wish clip must follow, for a prompt. In Telugu the festival is named in
 * its Telugu spelling where it has one — దసరా, not the list's "Dussehra" dropped into a Telugu sentence
 * for the writer to transliterate its own way (utils/festivalNames, 2026-10-08).
 */
export function wishOpeningLine(festivalName: string, language?: string): string {
  const occasion = festivalNameIn((festivalName || "").trim(), language) || "the festival";
  return isTeluguLanguage(language)
    ? `"{Business Name} తరఫున మా ${WISH_AUDIENCE_LINE} ${occasion} శుభాకాంక్షలు"`
    : `warm ${occasion} wishes from {Business Name} to all its ${WISH_AUDIENCE_ENGLISH}`;
}

/**
 * The rule as the prompts state it — one sentence, used wherever a wish clip is described (the writer,
 * the repair, the refine and the character dialogue prompts). In Telugu it also fixes the festival's
 * spelling where it has one (festivalSpellingRule — దసరా).
 */
export function wishAudienceRule(festivalName: string, language?: string): string {
  const named = (festivalName || "").trim();
  const occasion = festivalNameIn(named, language) || "the festival";
  const spelling = named ? festivalSpellingRule(named, language) : "";
  return isTeluguLanguage(language)
    ? `The wish is addressed to the business's own people, in these exact words and this order: `
      + `"${WISH_AUDIENCE_LINE}" — మిత్రులు (friends) and కస్టమర్లు (customers). Both are named, as a plain `
      + `comma list, and the business is the one sending the ${occasion} wish. Never add `
      + `${WISH_DROPPED_TELUGU.map((d) => d.word).join(" or ")}: the wish must be said in full inside its 8 seconds, `
      + `so the greeting clip uses short, everyday words.${spelling ? ` ${spelling}` : ""}`
    : `The wish is addressed to the business's own people — its ${WISH_AUDIENCE_ENGLISH} — all three `
      + `named, with the business as the one sending the ${occasion} wish.`;
}

/**
 * What the wish clip still gets wrong, for the clip-level repair: a group it does not greet, or a word the
 * greeting no longer says (WISH_DROPPED_TELUGU — it would push the wish past the clip's 8 seconds). [] when right.
 *
 * Telugu only: the address is pinned word for word there. Every other language gets the rule in its
 * prompt but no mechanical check, since the wording is the model's to translate.
 */
export function wishAudienceIssues(clipText: string, clipNumber: number, language?: string): string[] {
  if (!isTeluguLanguage(language) || !clipText?.trim()) return [];
  const issues: string[] = [];
  const missing = WISH_AUDIENCE_TELUGU.filter((group) => !clipText.includes(group.stem));
  if (missing.length) {
    issues.push(
      `Clip ${clipNumber} is the festival wish and must greet both — ${WISH_AUDIENCE_LINE} — but does not say `
      + `${missing.map((m) => `"${m.spoken}" (${m.english})`).join(", ")}. Rewrite the greeting as `
      + `"{business} తరఫున మా ${WISH_AUDIENCE_LINE} … శుభాకాంక్షలు", keeping the clip inside its word count.`,
    );
  }
  const dropped = WISH_DROPPED_TELUGU.filter((d) => clipText.includes(d.stem));
  if (dropped.length) {
    issues.push(
      `Clip ${clipNumber}'s greeting says ${dropped.map((d) => `"${d.word}"`).join(" and ")} — leave ${dropped.length > 1 ? "them" : "it"} `
      + `out: the wish is "{business} తరఫున మా ${WISH_AUDIENCE_LINE} … శుభాకాంక్షలు" and must be said in full inside 8 seconds. `
      + `Use short, everyday words and keep the clip inside its word count.`,
    );
  }
  return issues;
}

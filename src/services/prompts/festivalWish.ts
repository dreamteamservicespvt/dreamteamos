/**
 * Who a festival wish is addressed to.
 *
 * The team's own wording, on every card and poster they have ever sent: the business wishes its
 * MITHRULU (friends), SHREYOBHILASHULU (well-wishers) and CUSTOMERS. Scripts were opening with a
 * generic "to you and your family" instead, which reads like anyone's greeting rather than this
 * business greeting the people it actually knows.
 *
 * Kept here so the writer, the repair pass, the character-ad prompts and the check that the clip
 * really says it all use one list, and "మరియు" never creeps back in: the three groups are spoken as
 * a plain comma list, the way people say them out loud (see prompts/everydaySpeech).
 */

/** The three groups, as the greeting says them. Matching uses the stem, so case endings are fine. */
export const WISH_AUDIENCE_TELUGU = [
  { stem: "మిత్రుల", spoken: "మిత్రులు", english: "friends" },
  { stem: "శ్రేయోభిలాష", spoken: "శ్రేయోభిలాషులు", english: "well-wishers" },
  { stem: "కస్టమర్", spoken: "కస్టమర్లందరికీ", english: "customers" },
];

/** "మిత్రులు, శ్రేయోభిలాషులు, కస్టమర్లందరికీ" — the address, spoken as a list, with no "మరియు". */
export const WISH_AUDIENCE_LINE = WISH_AUDIENCE_TELUGU.map((a) => a.spoken).join(", ");

/** The same address in English, for every other language. */
export const WISH_AUDIENCE_ENGLISH = "friends, well-wishers and customers";

const isTeluguLanguage = (language?: string) =>
  ((language || "Telugu").trim() || "Telugu").toLowerCase() === "telugu";

/** The shape of the greeting the wish clip must follow, for a prompt. */
export function wishOpeningLine(festivalName: string, language?: string): string {
  const occasion = (festivalName || "").trim() || "the festival";
  return isTeluguLanguage(language)
    ? `"{Business Name} తరఫున మా ${WISH_AUDIENCE_LINE} ${occasion} హృదయపూర్వక శుభాకాంక్షలు"`
    : `warm ${occasion} wishes from {Business Name} to all its ${WISH_AUDIENCE_ENGLISH}`;
}

/** The rule as the prompts state it — one sentence, used wherever a wish clip is described. */
export function wishAudienceRule(festivalName: string, language?: string): string {
  const occasion = (festivalName || "").trim() || "the festival";
  return isTeluguLanguage(language)
    ? `The wish is addressed to the business's own people, in these exact words and this order: `
      + `"${WISH_AUDIENCE_LINE}" — మిత్రులు (friends), శ్రేయోభిలాషులు (well-wishers) and కస్టమర్లు `
      + `(customers). All three are named, as a plain comma list with no "మరియు", and the business is `
      + `the one sending the ${occasion} wish.`
    : `The wish is addressed to the business's own people — its ${WISH_AUDIENCE_ENGLISH} — all three `
      + `named, with the business as the one sending the ${occasion} wish.`;
}

/**
 * What the wish clip is still missing, for the clip-level repair. [] when it greets all three.
 *
 * Telugu only: the address is pinned word for word there. Every other language gets the rule in its
 * prompt but no mechanical check, since the wording is the model's to translate.
 */
export function wishAudienceIssues(clipText: string, clipNumber: number, language?: string): string[] {
  if (!isTeluguLanguage(language) || !clipText?.trim()) return [];
  const missing = WISH_AUDIENCE_TELUGU.filter((group) => !clipText.includes(group.stem));
  if (missing.length === 0) return [];
  return [
    `Clip ${clipNumber} is the festival wish and must greet all three — ${WISH_AUDIENCE_LINE} — but does not say `
    + `${missing.map((m) => `"${m.spoken}" (${m.english})`).join(", ")}. Rewrite the greeting as `
    + `"{business} తరఫున మా ${WISH_AUDIENCE_LINE} … శుభాకాంక్షలు", keeping the clip inside its word count.`,
  ];
}

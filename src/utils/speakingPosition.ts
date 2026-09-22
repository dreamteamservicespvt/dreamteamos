/**
 * Where the speaker IS — and the lines that forget it.
 *
 * Every frame of an ad shows the presenter (or the characters) standing inside the client's business.
 * Scripts kept being written as if the business were somewhere else — "go to Sharma Electronics",
 * "let's go there", "వెళ్ళండి" — which contradicts the picture on screen: the speaker is standing in
 * the shop they are telling the viewer to go to. The prompts say so; this is the check that notices
 * when a script does it anyway, so the clip-level repair can fix that one clip.
 *
 * Pure — no React, no Firestore. Deliberately narrow: it matches the phrases that send someone
 * ELSEWHERE, not every verb of motion, because "come to us" and "visit us" are exactly right.
 */

/** Phrases that send the viewer (or the speakers) somewhere other than where they are standing. */
const ELSEWHERE_PATTERNS: RegExp[] = [
  // English
  /\blet'?s go\b/i,
  /\blet us go\b/i,
  // "go to our website" is fine; "go to Sharma Electronics" is the speaker pointing away from themselves.
  /\bgo to\b(?!\s+(?:us|our)\b)/i,
  /\bgo there\b/i,
  /\bhead (?:over )?to\b/i,
  /\bvisit (?:that|those) (?:shop|store|place|showroom|outlet)\b/i,
  /\btheir (?:shop|store|showroom|outlet)\b/i,
  // Telugu — "let's go", "go (plural/polite)", "having gone", "to there", "their shop"
  /వెళ్దాం/,
  /వెళ్ళండి|వెళ్లండి/,
  /వెళ్ళి|వెళ్లి/,
  /అక్కడికి/,
  /(?:వాళ్ళ|వాళ్ల)\s*(?:షాప్|షాపు|దుకాణ)/,
  // Hindi — "let's go", "go there", "go (polite)"
  /चलो\s*चलते/,
  /वहाँ\s*जा/,
  /जाइए/,
];

/** The phrase that sends the listener elsewhere, or null when the line speaks from here. */
export function elsewherePhrase(text: string): string | null {
  if (!text) return null;
  for (const pattern of ELSEWHERE_PATTERNS) {
    const m = text.match(pattern);
    if (m) return m[0];
  }
  return null;
}

/**
 * The issue a validator reports for one clip, phrased as the instruction the repair pass acts on.
 * Starts with "Clip N" so the clip-level repair picks out which clip to edit.
 */
export function elsewhereIssue(clipNumber: number, text: string, who = "the presenter"): string | null {
  const phrase = elsewherePhrase(text);
  if (!phrase) return null;
  return `Clip ${clipNumber} sends the viewer somewhere else ("${phrase}") — ${who} is already standing INSIDE `
    + `the business in this clip. Say it from here instead: "here at <business>", "come to us", "visit us", "we", "our".`;
}

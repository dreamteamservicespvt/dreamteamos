/**
 * The address rule every script writer and repairer is given — said in the last clip when the client
 * gave one, and never invented when they did not (utils/spokenAddress, 2026-10-01).
 *
 * One block, appended to the writer, the repair passes, the clip-level edits and the native-speaker
 * review, so no pass can talk another out of it. Before this the presenter prompt made the address
 * "optional" and the character prompt forbade it, and either could win.
 */
export interface AddressRuleInput {
  /** True when the client's data carries a verified address (utils/businessFacts). */
  given: boolean;
  /** The spoken form in the script's own language and spelling — what the last clip must say. */
  spoken: string;
  /** The same address in Latin letters, when the native spelling could not be fixed. */
  latin?: string;
  /** The ad's language, so the rule names it. */
  language?: string;
  /** The last clip's number. */
  finalClip: number;
}

export function addressRuleBlock({ given, spoken, latin = "", language = "Telugu", finalClip }: AddressRuleInput): string {
  if (!given) {
    return `

===== NO ADDRESS WAS GIVEN — NEVER INVENT ONE (STRICT) =====

The client's data has no address. Do not speak an address anywhere: no road, street, colony, layout,
landmark, "opposite …", "near …", area or pincode — not even a plausible one. An invented address sends
customers to a place that does not exist. Close clip ${finalClip} on the call to action and one true
reason to come, and nothing about where it is beyond what the business information really says.`;
  }
  const said = spoken.trim() || latin.trim();
  return `

===== THE ADDRESS — MANDATORY IN THE LAST CLIP (STRICT) =====

The client gave this business's address. Clip ${finalClip} — the closing clip — says it out loud, once,
as part of the call to action ("come to us at …", "visit us at …"), in exactly these words${spoken.trim() ? "" : `, written in ${language} the way a local person says it`}:

    ${said}

• Only in clip ${finalClip}, and only once. Never a door number, pincode, district or state — those are
  printed on screen, not spoken.
• Spell it exactly as above, word for word. Do not shorten, translate, expand or "correct" it.
• Keep clip ${finalClip} inside its word count: the address takes a few words, so the call to action
  around it is short and direct.
• A closing clip without this address has FAILED, however good the rest of it is.`;
}

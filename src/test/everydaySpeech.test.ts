import { describe, it, expect } from "vitest";
import {
  HARD_TELUGU_WORDS, dialogueHardWordIssues, everydaySpeechRules, findHardWords, hardWordIssue, hardWordIssues,
  isHardWordIssue, toSpokenEndings,
} from "@/services/prompts/everydaySpeech";
import {
  SCRIPT_TO_VOICEOVER_SYSTEM_PROMPT, VOICEOVER_QUALITY_REVIEW_SYSTEM_PROMPT, VOICEOVER_REPAIR_SYSTEM_PROMPT,
  VOICEOVER_SYSTEM_PROMPT,
} from "@/services/prompts";
import { CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT, CHARACTER_VOICEOVER_SYSTEM_PROMPT } from "@/services/prompts/characterAd";
import { VOICEOVER_REFINE_EDIT_SYSTEM_PROMPT } from "@/services/prompts/refine";
import { getCharacterPack } from "@/services/characterPacks";
import { clipIndexesFromIssues, repairDirection } from "@/utils/voiceOverRefine";

/**
 * The team's rule: the script is in the Telugu people use every day, so everyone understands it on
 * the first listen. Every line below is from a live script that broke it.
 */
const found = (text: string, names: string[] = []) => findHardWords(text, "Telugu", names).map((h) => h.found);

describe("catching the hard words live scripts used", () => {
  it("catches ప్రసిద్ధి and స్వచ్ఛమైన", () => {
    expect(found("మోటూ, ఇది బోధన్ లక్ష్మీ స్వీట్స్. 40 ఏళ్లుగా స్వచ్ఛమైన నెయ్యి స్వీట్లకు ప్రసిద్ధి."))
      .toEqual(["స్వచ్ఛమైన", "ప్రసిద్ధి"]);
  });

  it("catches మా వద్ద, ఉపయోగించి and అత్యుత్తమ", () => {
    expect(found("మా వద్ద అనుభవం ఉన్న మెకానిక్స్‌తో, ఒరిజినల్ స్పేర్ పార్ట్స్ మాత్రమే ఉపయోగించి అత్యుత్తమ సర్వీస్ అందిస్తాము."))
      .toEqual(["వద్ద", "ఉపయోగించి", "అత్యుత్తమ"]);
  });

  it("catches నిబద్ధత, విభిన్న and సందర్శించండి", () => {
    expect(found("ఇంత తాజాగా ఉంచాలంటే చాలా అనుభవం, నిబద్ధత ఉండాలి కదా?")).toEqual(["నిబద్ధత"]);
    expect(found("వారి స్వీట్లు ఏమైనా విభిన్న రకాలు ఉన్నాయా?")).toEqual(["విభిన్న"]);
    expect(found("పుట్టినరోజు కేకులకు ఉచిత డెలివరీ ఉంది, ఈరోజే సందర్శించండి!")).toEqual(["సందర్శించండి"]);
  });

  it("catches the passive", () => {
    expect(found("ఇక్కడ అన్ని బైకులకు సర్వీస్ చేయబడును.")).toEqual(["చేయబడును"]);
    expect(found("కేకులు రోజూ తాజాగా తయారుచేయబడతాయి.")).toEqual(["తయారుచేయబడతాయి"]);
    expect(found("కేక్ ఇప్పుడే తయారుచేయబడింది.")).toEqual(["తయారుచేయబడింది"]);
    // Investment, not the passive.
    expect(found("మీ పెట్టుబడి, పెట్టుబడులు, పెట్టుబడిని కాపాడతాం.")).toEqual([]);
  });

  it("says what to use instead", () => {
    expect(findHardWords("నాణ్యమైన సర్వీస్", "Telugu")).toEqual([{ found: "నాణ్యమైన", say: "క్వాలిటీ" }]);
  });
});

describe("leaving everyday Telugu alone", () => {
  it("passes clean live lines and the on-screen call line", () => {
    expect(found("పట్లు! ఈ స్వీట్లు అన్నీ ఎంత బాగున్నాయి, ఎక్కడ దొరుకుతాయి ఇవి?")).toEqual([]);
    expect(found("మరిన్ని వివరాల కోసం స్క్రీన్‌పై ఉన్న నంబర్‌కు ఇప్పుడే కాల్ చేయండి.")).toEqual([]);
  });

  // Each of these starts like, or contains, a word on the list.
  it("does not mistake look-alikes", () => {
    expect(found("ఆలస్యం వద్దు, తప్పకుండా రండి.")).toEqual([]);
    expect(found("మీ పెట్టుబడిని సకాలంలో పెంచుకోండి.")).toEqual([]);
    expect(found("ఉత్తరం వైపు ప్రత్యేకంగా ఉచిత పార్కింగ్ ఉంది.")).toEqual([]);
    expect(found("కబడ్డీ ఆడే పిల్లలకు బడి దగ్గరే షాప్.")).toEqual([]);
  });

  it("never flags the business's own name", () => {
    expect(found("శ్రీ ప్రసిద్ధి ట్రేడర్స్ లో అన్నీ దొరుకుతాయి.", ["Sri Prasiddhi Traders"])).toEqual([]);
    expect(found("స్వచ్ఛ ఆయుర్వేద షాప్ కి రండి.", ["స్వచ్ఛ ఆయుర్వేద"])).toEqual([]);
    // Only the name's own word is spared.
    expect(found("సుందర్ టెక్స్‌టైల్స్ లో నాణ్యమైన బట్టలు.", ["Sundar Textiles"])).toEqual(["నాణ్యమైన"]);
  });

  it("leaves other languages to their own prompt rules", () => {
    expect(findHardWords("प्रसिद्ध दुकान", "Hindi")).toEqual([]);
    expect(findHardWords("world famous", "English")).toEqual([]);
  });
});

describe("the list itself", () => {
  it("catches every word it names", () => {
    for (const entry of HARD_TELUGU_WORDS) {
      expect(findHardWords(entry.word, "Telugu"), entry.word).toHaveLength(1);
    }
  });

  it("never offers a hard word as the replacement", () => {
    for (const entry of HARD_TELUGU_WORDS) {
      expect(findHardWords(entry.say, "Telugu"), entry.say).toEqual([]);
    }
  });
});

describe("repairing a clip with hard words", () => {
  const hits = findHardWords("40 ఏళ్లుగా స్వచ్ఛమైన నెయ్యి స్వీట్లకు ప్రసిద్ధి.", "Telugu");

  it("names the clip, the words and their swaps", () => {
    const issue = hardWordIssue(2, hits);
    expect(issue).toBe('Clip 2 uses words people do not say in everyday Telugu — "స్వచ్ఛమైన" → say "అసలైన", "ప్రసిద్ధి" → say "ఫేమస్". Swap each for the everyday word, keep the meaning, and keep the clip inside its word count.');
    expect(isHardWordIssue(issue)).toBe(true);
  });

  // The clip-level repair picks up any issue that names its clip.
  it("is picked up by the clip-level repair, and handed over as it is", () => {
    const issues = hardWordIssues(["పట్లు! ఎంత బాగున్నాయి?", "40 ఏళ్లుగా స్వచ్ఛమైన నెయ్యి."], "Telugu");
    expect(clipIndexesFromIssues(issues, 2)).toEqual([1]);
    expect(repairDirection(issues, 18, 20)).toBe(issues[0]);
  });

  it("names whose line it is in a dialogue", () => {
    const issues = dialogueHardWordIssues(
      [[{ speaker: "motu", text: "ఎంత బాగున్నాయి!" }, { speaker: "patlu", text: "ఇవి నలభై ఏళ్లుగా ప్రసిద్ధి." }]],
      "Telugu", [], (k) => (k === "patlu" ? "Patlu" : "Motu"),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/^Clip 1: Patlu's line uses words people do not say in everyday Telugu — "ప్రసిద్ధి" → say "ఫేమస్"/);
    expect(clipIndexesFromIssues(issues, 4)).toEqual([0]);
  });
});

describe("spoken verb endings, fixed in code", () => {
  it("turns written endings into spoken ones", () => {
    expect(toSpokenEndings("అత్యుత్తమ సర్వీస్ అందిస్తాము.", "Telugu")).toBe("అత్యుత్తమ సర్వీస్ అందిస్తాం.");
    expect(toSpokenEndings("మేము ఉన్నాము, చేశాము, చేసాము, ఇచ్చాము, చెప్పాము.", "Telugu"))
      .toBe("మేము ఉన్నాం, చేశాం, చేసాం, ఇచ్చాం, చెప్పాం.");
    expect(toSpokenEndings("రండి, కలిసి వెళ్దాము, చేద్దాము!", "Telugu")).toBe("రండి, కలిసి వెళ్దాం, చేద్దాం!");
  });

  it("leaves nouns and names that end the same way", () => {
    const text = "పాము, గ్రాము, బాదాము, తాము, మేము, రాముడు.";
    expect(toSpokenEndings(text, "Telugu")).toBe(text);
  });

  it("never changes the word count", () => {
    const text = "మా దగ్గర ఒరిజినల్ పార్ట్స్ మాత్రమే వేస్తాము, బైక్ సాయంత్రానికే ఇస్తాము.";
    expect(toSpokenEndings(text, "Telugu").split(/\s+/)).toHaveLength(text.split(/\s+/).length);
  });

  it("touches only Telugu", () => {
    expect(toSpokenEndings("हम करते हैं", "Hindi")).toBe("हम करते हैं");
  });
});

describe("the everyday-speech rules in every script prompt", () => {
  it("gives Telugu the first-listen test, the endings and the swap list", () => {
    const rules = everydaySpeechRules("Telugu");
    expect(rules).toContain("EVERYDAY SPOKEN TELUGU — EVERY WORD (MANDATORY)");
    expect(rules).toContain("THE FIRST-LISTEN TEST");
    expect(rules).toContain('"Premium" is the confidence and warmth of the delivery; it is NEVER fancy or formal words.');
    expect(rules).toContain("ప్రసిద్ధి → ఫేమస్");
    expect(rules).toContain("never చేస్తాము");
    expect(rules).toContain("never swap a simple Telugu word for English");
  });

  it("gives other languages the same test without Telugu's list", () => {
    expect(everydaySpeechRules("Hindi")).toContain("EVERYDAY SPOKEN HINDI");
    expect(everydaySpeechRules("Hindi")).not.toContain("ప్రసిద్ధి");
    expect(everydaySpeechRules("English")).toContain("PLAIN EVERYDAY ENGLISH");
  });

  it("is in the writer, repair, review, refine, Tools and character prompts", () => {
    const pack = getCharacterPack("duo_motu_patlu")!;
    const prompts = {
      writer: VOICEOVER_SYSTEM_PROMPT(32, 4, "commercial", "", "Telugu"),
      repair: VOICEOVER_REPAIR_SYSTEM_PROMPT(32, 4, "commercial", "", "Telugu"),
      review: VOICEOVER_QUALITY_REVIEW_SYSTEM_PROMPT("Telugu"),
      refine: VOICEOVER_REFINE_EDIT_SYSTEM_PROMPT({ language: "Telugu", clipCount: 4, adType: "commercial" }),
      tools: SCRIPT_TO_VOICEOVER_SYSTEM_PROMPT(4, "Telugu"),
      character: CHARACTER_VOICEOVER_SYSTEM_PROMPT(pack, 32, 4, "commercial", "", "Telugu", "బోధన్"),
      characterRepair: CHARACTER_VOICEOVER_REPAIR_SYSTEM_PROMPT(pack, 32, 4, "Telugu", "బోధన్"),
    };
    for (const [name, prompt] of Object.entries(prompts)) {
      expect(prompt, name).toContain("EVERYDAY SPOKEN TELUGU — EVERY WORD (MANDATORY)");
    }
  });

  // "Polished" and city English were pulling the writer toward formal Telugu.
  it("no longer asks the writer for polished copy or city English", () => {
    const writer = VOICEOVER_SYSTEM_PROMPT(32, 4, "commercial", "", "Telugu");
    expect(writer).not.toContain("polished");
    expect(writer).not.toContain("బ్రైట్ ఫ్యూచర్");
    expect(writer).not.toContain("ఫ్రీ బ్రేక్‌ఫాస్ట్");
    expect(writer).toContain('"ఫ్రీ టిఫిన్" not "ఉచిత అల్పాహారం"');
    expect(writer).toContain("the ordinary people of the town");
  });
});

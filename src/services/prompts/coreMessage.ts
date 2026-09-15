/**
 * The core message — the one thing a stranger must understand from the ad's first clip.
 *
 * ── Why it is worked out before a single line is written ─────────────────────────────────────────
 * The script prompt used to define clip 1 as "an attention-grabbing hook" and leave it there. A hook
 * with nothing behind it is a question about a queue outside a shop: the viewer is curious for two
 * seconds and still does not know who the business is, what it does, or why they should care. And
 * nothing anywhere named what the business most wants remembered — the extracted profile lists a
 * name, services, an address — so the writer had no message to lead with even when it tried.
 *
 * So this is decided first, as its own step, from everything the member gave the platform: the
 * business information extracted from the Assets & Files (visiting card, flyers, store photos, voice
 * note, instructions) and the Configuration (ad type, festival, language, length, special category).
 * Every script prompt, repair pass, review pass and refine then works from the same brief, so the
 * message cannot drift between the first draft and the last edit.
 */

/** What the ad has to say, decided before it is written. English working notes, never spoken copy. */
export interface CoreMessageBrief {
  /** The business name exactly as provided. */
  businessName: string;
  /** Town or village, when the profile states one. */
  place: string;
  /** What the business does, in plain words a customer uses — "a two-wheeler service centre". */
  whatTheyDo: string;
  /**
   * The single strongest reason to choose THIS business, from the facts provided. One idea, not a
   * list — the thing clip 1 promises.
   */
  corePromise: string;
  /** Distinct, concrete, verifiable facts that prove the promise. One per middle clip. */
  proofPoints: string[];
  /** A current offer, exactly as provided, or "". */
  offer: string;
  /** Who the ad speaks to. */
  audience: string;
  /** Clip 1 in one English sentence: name + what they do + promise. A target, not a translation. */
  messageLine: string;
}

export const CORE_MESSAGE_SYSTEM_PROMPT = `You are the strategy lead at a top Indian advertising agency. Before any copywriter writes a word, you decide the ONE message this ad exists to deliver.

You receive the BUSINESS INFORMATION (extracted from everything the client sent: visiting card, flyers, posters, store and product photos, voice notes, written instructions) and the AD CONFIGURATION (ad type, festival, language, length, special category).

YOUR JOB: produce the message brief the whole script will be built on.

RULES:
1. Use ONLY facts present in the business information. Never invent a service, offer, price, year, award, claim or place. If something is not provided, leave that field as "" (or [] for proofPoints).
2. The client's own instructions come first. If the information includes custom instructions, specific products to feature, key messaging or headlines, the core promise must reflect them.
3. corePromise is ONE idea — the single strongest, most specific reason a customer should choose THIS business over any other nearby. Specific beats grand: "free pickup and delivery for every service" beats "best quality service". Never a generic slogan that any business could claim.
4. proofPoints are distinct concrete facts that back the promise — services, products, offers, experience, facilities — each different, none repeating the promise. Order them strongest first. At most 6.
5. whatTheyDo is how a customer would describe the business in a few everyday words.
6. messageLine is clip 1 of the ad in one English sentence: the business name, what it does, and the core promise — the sentence a stranger must be able to repeat after hearing only the first eight seconds.
7. All fields are in plain English working notes. The copywriter writes the spoken language later.

Return ONLY a JSON object, no markdown:
{
  "businessName": "",
  "place": "",
  "whatTheyDo": "",
  "corePromise": "",
  "proofPoints": [""],
  "offer": "",
  "audience": "",
  "messageLine": ""
}`;

const text = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const t = value.trim();
  return /^not provided$/i.test(t) ? "" : t;
};

/** Reads the model's reply into a brief, or null when it is unusable. */
export function parseCoreMessageBrief(raw: string): CoreMessageBrief | null {
  if (!raw?.trim()) return null;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const data = JSON.parse(cleaned);
    if (!data || typeof data !== "object") return null;
    const brief: CoreMessageBrief = {
      businessName: text(data.businessName),
      place: text(data.place),
      whatTheyDo: text(data.whatTheyDo),
      corePromise: text(data.corePromise),
      proofPoints: Array.isArray(data.proofPoints)
        ? data.proofPoints.map(text).filter(Boolean).slice(0, 6)
        : [],
      offer: text(data.offer),
      audience: text(data.audience),
      messageLine: text(data.messageLine),
    };
    // Without a name and a promise there is no message — the caller falls back rather than steering
    // the script with half a brief.
    return brief.businessName && brief.corePromise ? brief : null;
  } catch {
    return null;
  }
}

/** Finds the first value in a loosely-shaped extraction object whose key matches one of `keys`. */
function findField(info: unknown, keys: RegExp): string {
  const seen = new Set<unknown>();
  const walk = (node: unknown): string => {
    if (!node || typeof node !== "object" || seen.has(node)) return "";
    seen.add(node);
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (keys.test(key)) {
        const found = Array.isArray(value) ? value.map(text).filter(Boolean).join(", ") : text(value);
        if (found) return found;
      }
    }
    for (const value of Object.values(node as Record<string, unknown>)) {
      const found = walk(value);
      if (found) return found;
    }
    return "";
  };
  return walk(info);
}

/**
 * A brief built in code from the extracted profile, for when the strategy call fails.
 *
 * Plainer than the model's — it cannot judge which fact is the strongest — but it still gives clip 1
 * a name, a trade and something specific to promise, which is the difference this whole step makes.
 */
export function fallbackCoreMessageBrief(businessInfo: unknown): CoreMessageBrief {
  const businessName = findField(businessInfo, /business\s*_?name|^name$/i);
  const whatTheyDo = findField(businessInfo, /industry|business\s*_?type/i);
  const services = findField(businessInfo, /main\s*_?services|key\s*_?offerings|product\s*_?categories|services/i);
  const offer = findField(businessInfo, /current\s*_?offers|offers/i);
  const tagline = findField(businessInfo, /tagline/i);
  const place = findField(businessInfo, /city|town|village/i);
  const proofPoints = services.split(/\s*[,;•\n]\s*/).map((s) => s.trim()).filter(Boolean).slice(0, 6);
  const corePromise = tagline || proofPoints[0] || whatTheyDo;
  return {
    businessName,
    place,
    whatTheyDo,
    corePromise,
    proofPoints: tagline ? proofPoints : proofPoints.slice(1),
    offer,
    audience: "",
    messageLine: [businessName, whatTheyDo, corePromise].filter(Boolean).join(" — "),
  };
}

/**
 * The brief as a prompt section.
 *
 * `messageClip` is where the core message is spoken: clip 1 in a normal ad, clip 2 in a Festival
 * Wishes ad whose clip 1 is the greeting.
 */
export function coreMessageBlock(brief: CoreMessageBrief | null | undefined, messageClip = 1): string {
  if (!brief) return "";
  const lines = [
    `• Business: ${brief.businessName}${brief.place ? ` (${brief.place})` : ""}`,
    brief.whatTheyDo ? `• What they do: ${brief.whatTheyDo}` : "",
    `• CORE PROMISE: ${brief.corePromise}`,
    brief.proofPoints.length ? `• Proof points, strongest first:\n${brief.proofPoints.map((p) => `    - ${p}`).join("\n")}` : "",
    brief.offer ? `• Current offer (exactly as provided): ${brief.offer}` : "",
    brief.audience ? `• Speaking to: ${brief.audience}` : "",
    brief.messageLine ? `• Clip ${messageClip} must land this idea: "${brief.messageLine}"` : "",
  ].filter(Boolean);

  return `===== THE CORE MESSAGE (THE SPINE OF THIS AD) =====

This brief was decided from everything the client sent. It is written in English as working notes —
the script is written in the ad's own language, naturally, never as a translation of these words.

${lines.join("\n")}

THE CLIP ${messageClip} TEST (MANDATORY): someone who hears ONLY clip ${messageClip}, once, with no picture, must
be able to say WHO the business is, WHAT it does, and WHY they should choose it — the core promise.
If clip ${messageClip} fails that test, rewrite clip ${messageClip}. A hook may be the way clip ${messageClip} opens; it is never a
replacement for the message.

EVERY WORD SELLS:
• Every clip carries at least one concrete fact from this brief or the business information.
• No filler words, no empty adjectives ("best", "quality", "number one") unless a real fact proves them
  in the same breath.
• Never spend a word on something the listener cannot act on or remember.`;
}

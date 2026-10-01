/**
 * The cast sheet — one fixed description of every INVENTED person in an ad, written once, in code.
 *
 * ── Why this exists (2026-10-01) ─────────────────────────────────────────────────────────────
 * The special-category pipeline was built for famous characters: the frame prompt says "name them,
 * never describe them", because "Motu" already carries his face, build and clothes. For the human
 * duos the same rule handed the image generator two ROLE LABELS — "Friend" and "Host" — and nothing
 * else, so every frame invented two new people: a different face, age, hair and outfit in every
 * clip, and the video prompts could only "lock the faces in the attached frame" that already
 * disagreed. A person nobody has seen before needs a description, and the same description in every
 * frame, word for word.
 *
 * So each invented person (Normal Ad presenters, the human duos, the Kids) gets ONE line here —
 * age, face, skin, hair, the ordered outfit in one exact colour — chosen deterministically from the
 * business, so a regenerated kit casts the same people and a different client gets different ones.
 * Code stamps it into every frame prompt (withCastSheet), and the video prompt names each speaker by
 * how they look ("the woman in the teal saree") instead of by a label the video model cannot see.
 *
 * Pure — no React, no Firestore, no model call — so it is unit-tested.
 */
import type { CharacterPack } from "@/services/characterPacks";

export type CastPosition = "LEFT" | "RIGHT" | "CENTRE";

export interface CastSheetMember {
  /** The pack character's key ("friend", "girl", "presenter"). */
  key: string;
  /** Where they stand in every frame — characters[0] LEFT, characters[1] RIGHT, a lone presenter CENTRE. */
  position: CastPosition;
  /** How the video prompt names them: "the woman in the teal saree". */
  short: string;
  /** The full line every frame carries. */
  description: string;
}

/** The heading stamped onto every frame prompt — see withCastSheet. */
export const CAST_SHEET_HEADING = "CAST SHEET";

type Kind = "woman" | "man" | "girl" | "boy";

const LOOKS: Record<Kind, string[]> = {
  woman: [
    "a soft oval face, warm wheatish skin, large dark-brown eyes and long natural black hair in a loose low side braid",
    "a heart-shaped face, fair-wheatish skin, expressive dark eyes and long straight black hair worn open past the shoulders",
    "a round face with high cheekbones, medium-brown skin, bright dark eyes and wavy black hair tied in a neat low bun",
    "a long oval face, dusky skin, almond-shaped dark eyes and shoulder-length black hair with soft waves",
    "a gently squared face with a warm smile, golden-wheatish skin, dark eyes and long black hair in a sleek high ponytail",
  ],
  man: [
    "a strong jawline, medium-brown skin, a neatly trimmed short black beard and short side-parted black hair",
    "an oval face, wheatish skin, clean-shaven, with short neatly combed black hair and a warm smile",
    "a square face, dusky skin, a groomed thin moustache and short textured black hair",
    "a long face with defined cheekbones, fair-wheatish skin, light stubble and short black hair swept back",
    "a round friendly face, medium-brown skin, a short boxed beard and close-cropped black hair",
  ],
  girl: [
    "a round cheerful face, wheatish skin, big bright eyes and two neat black plaits tied with small ribbons",
    "an oval face, medium-brown skin, sparkling dark eyes and shoulder-length black hair held back with a clip",
    "a heart-shaped face, fair-wheatish skin, a bright gap-toothed smile and a short black bob with a fringe",
    "a round face, dusky skin, bright curious eyes and a single long black braid",
  ],
  boy: [
    "a round face, wheatish skin, big curious eyes and short neatly combed black hair",
    "an oval face, medium-brown skin, a wide grin and short spiky black hair",
    "a square face, dusky skin, bright eyes and a short side-parted black haircut",
    "a round face, fair-wheatish skin, dimples and slightly wavy short black hair",
  ],
};

/** Two colours that read as clearly different on screen, so a viewer never confuses the pair. */
const COLOUR_PAIRS: [string, string][] = [
  ["deep maroon", "teal"],
  ["royal blue", "mustard yellow"],
  ["emerald green", "peach"],
  ["deep purple", "cream"],
  ["navy blue", "coral"],
  ["bottle green", "rose pink"],
  ["burnt orange", "sky blue"],
];

/** The outfit for the ordered attire, with its garment noun for the short name. */
function outfitFor(kind: Kind, attireType: string | undefined, customAttire: string | undefined, colour: string): { outfit: string; garment: string } {
  const custom = (customAttire || "").trim();
  if (attireType === "custom") {
    return { outfit: custom ? `exactly this outfit: ${custom}` : "the outfit described in the client's brief", garment: "" };
  }
  switch (kind) {
    case "woman":
      if (attireType === "traditional") return { outfit: `a designer silk saree in ${colour} with a modest elbow-length blouse and tasteful gold jewellery`, garment: "saree" };
      if (attireType === "shirt_pant") return { outfit: `a crisp ${colour} formal shirt tucked into dark tailored trousers`, garment: "shirt" };
      return { outfit: `a tailored ${colour} formal suit — structured blazer, crisp white inner shirt and slim trousers`, garment: "suit" };
    case "man":
      if (attireType === "traditional") return { outfit: `a ${colour} silk kurta with a cream Nehru jacket and churidar`, garment: "kurta" };
      if (attireType === "shirt_pant") return { outfit: `a crisp ${colour} formal shirt tucked into dark trousers with a leather belt`, garment: "shirt" };
      return { outfit: `a tailored ${colour} formal suit with a crisp white shirt`, garment: "suit" };
    case "girl":
      if (attireType === "traditional") return { outfit: `a ${colour} silk pattu langa — a long skirt with a matching blouse — and small gold earrings`, garment: "pattu langa" };
      return { outfit: `a neat knee-length ${colour} dress with a white collar and clean sandals`, garment: "dress" };
    case "boy":
      if (attireType === "traditional") return { outfit: `a ${colour} kurta with a white pyjama`, garment: "kurta" };
      return { outfit: `a neat ${colour} half-sleeve shirt tucked into navy trousers, with clean shoes`, garment: "shirt" };
  }
}

/** A stable, well-spread number for a string (FNV-1a). */
function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Who each character of an invented-person pack is: woman / man / girl / boy, and their age. */
function kindsOf(pack: CharacterPack): { kind: Kind; age: number }[] | null {
  const n = pack.characters.length;
  const id = pack.id;
  if (pack.family === "kids") {
    if (/girls/.test(id)) return [{ kind: "girl", age: 10 }, { kind: "girl", age: 9 }];
    if (/boys/.test(id)) return [{ kind: "boy", age: 10 }, { kind: "boy", age: 9 }];
    return [{ kind: "girl", age: 9 }, { kind: "boy", age: 10 }];
  }
  if (pack.family === "human_duo") {
    if (/female/.test(id)) return [{ kind: "woman", age: 24 }, { kind: "woman", age: 27 }];
    if (/_male$/.test(id)) return [{ kind: "man", age: 28 }, { kind: "man", age: 32 }];
    return [{ kind: "woman", age: 25 }, { kind: "man", age: 30 }];
  }
  if (pack.family === "human" && !pack.usesClientFace && n === 1) {
    return [/(^|_)male$/.test(id) ? { kind: "man", age: 29 } : { kind: "woman", age: 23 }];
  }
  return null;
}

const NOUN: Record<Kind, string> = { woman: "Indian woman", man: "Indian man", girl: "Indian girl", boy: "Indian boy" };

/**
 * The cast sheet for a pack whose people are invented — or [] for every pack whose identity comes
 * from elsewhere (a famous character, a deity, the owner's photograph, a custom description).
 *
 * `seed` is what makes the casting stable for one client and different for the next: the business's
 * name, falling back to anything that identifies the job.
 */
export function castSheetFor(
  pack: CharacterPack | null | undefined,
  options: { attireType?: string; customAttire?: string; seed?: string } = {},
): CastSheetMember[] {
  if (!pack) return [];
  const kinds = kindsOf(pack);
  if (!kinds) return [];
  const seed = (options.seed || "").trim().toLowerCase() || pack.id;
  const h = hashOf(`${pack.id}|${seed}`);
  const [colourA, colourB] = COLOUR_PAIRS[h % COLOUR_PAIRS.length];
  const used = new Map<Kind, number>();

  return kinds.map(({ kind, age }, i) => {
    const looks = LOOKS[kind];
    // Two people of the same kind never share a look: the second skips past the first's.
    const first = used.get(kind);
    const index = first === undefined
      ? hashOf(`${seed}|${kind}|${i}`) % looks.length
      : (first + 1 + (hashOf(`${seed}|${kind}|again`) % (looks.length - 1))) % looks.length;
    used.set(kind, index);
    const colour = i === 0 ? colourA : colourB;
    const { outfit, garment } = outfitFor(kind, options.attireType, options.customAttire, colour);
    const position: CastPosition = kinds.length === 1 ? "CENTRE" : i === 0 ? "LEFT" : "RIGHT";
    const short = garment
      ? `the ${kind} in the ${colour} ${garment}`
      : position === "CENTRE" ? `the ${kind}` : `the ${kind} on the ${position.toLowerCase()}`;
    const child = kind === "girl" || kind === "boy";
    return {
      key: pack.characters[i]?.key ?? String(i),
      position,
      short,
      description: `${child ? "a real" : "an"} ${NOUN[kind]} of about ${age}${child ? ", child-sized," : ""} with ${looks[index]}, wearing ${outfit}`,
    };
  });
}

/** The block every frame of the ad carries, word for word. */
export function castSheetBlock(members: CastSheetMember[]): string {
  if (members.length === 0) return "";
  const who = members.length === 1
    ? members[0].short.replace(/^the (\w+).*$/, "$1").toUpperCase()
    : members.every((m) => /^the (girl|boy)\b/.test(m.short)) ? "TWO CHILDREN" : "TWO PEOPLE";
  const lines = members.map((m) => `• ${m.position} — ${m.short}: ${m.description}`).join("\n");
  return `${CAST_SHEET_HEADING} — THE SAME ${who} IN EVERY CLIP, EXACTLY AS WRITTEN HERE:
${lines}
Never change a face, an age, a hairstyle, an outfit or a colour between clips${members.length > 1 ? ", and never swap their places" : ""}.`;
}

/** A finished frame prompt, guaranteed to carry the cast sheet. Idempotent. */
export function withCastSheet(prompt: string, block: string): string {
  if (!block || !prompt.trim() || prompt.includes(CAST_SHEET_HEADING)) return prompt;
  return `${prompt.trimEnd()}\n\n${block}`;
}

/**
 * The short names read back off a stamped frame prompt, in position order (LEFT, RIGHT, CENTRE) —
 * so a video prompt rebuilt later (a refine, a regenerate) names the SAME people the frames were made
 * with, whatever the form says now. [] when the prompt carries no cast sheet.
 */
export function castNamesFromFrames(framePrompts: string[] = []): string[] {
  const stamped = framePrompts.find((p) => p?.includes(CAST_SHEET_HEADING));
  if (!stamped) return [];
  const rows = [...stamped.matchAll(/^• (LEFT|RIGHT|CENTRE) — ([^:\n]+):/gm)];
  const order: Record<string, number> = { LEFT: 0, CENTRE: 0, RIGHT: 1 };
  return rows.sort((a, b) => order[a[1]] - order[b[1]]).map((r) => r[2].trim());
}

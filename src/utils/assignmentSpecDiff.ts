/**
 * What changed in an assignment's specification, in the words the member thinks in.
 *
 * When an admin edits a job that is already out — the attire was wrong, the client asked for 16:9,
 * the duration was sold short — the member holding it has no idea. They carry on to the generator
 * with the spec they were given at the start and produce the wrong ad, and nobody finds out until
 * it is delivered.
 *
 * So the change has to be shown, and shown as a change: "Attire: Traditional → Professional" tells
 * a member instantly what to do differently. A silent field swap under their cursor would not.
 *
 * Kept pure so the comparison can be tested exhaustively — this is the thing that decides whether
 * someone is interrupted mid-work, so it must never fire on a field nobody cares about.
 */
import { attireLabel } from "./adRequirement";
import { getCharacterPack, isHumanPack } from "@/services/characterPacks";
import { posterStyleLabel } from "@/services/posterStyles";
import { posterSizeLabel } from "./posterSpec";
import type { WorkAssignment } from "@/types";

export interface SpecChange {
  /** What the member sees this field called on their own screen. */
  label: string;
  from: string;
  to: string;
}

/** The subset of an assignment that changes what the member has to produce. */
export interface AssignmentSpec {
  category?: string;
  duration?: string;
  clipCount?: number;
  businessName?: string;
  modelGender?: string;
  attireType?: string;
  customAttire?: string;
  aspectRatio?: string;
  language?: string;
  /** The occasion a wishes video is for — changing it changes the entire ad. */
  festival?: string;
  requirementNotes?: string;
  characterPack?: string;
  /** Custom Character only: who the character is — changing it changes the whole cast. */
  customCharacter?: string;
  realLocationProvided?: boolean;
  /** Poster jobs: the canvas, the style and how many — each changes what has to be produced. */
  posterSize?: string;
  posterStyle?: string;
  posterCount?: number;
  /** The client's brief. Changing what the business does or where it is changes what the ad says. */
  businessInfo?: string;
  businessAddress?: string;
}

/** Everything that matters, pulled off an assignment. */
export function specOf(a: WorkAssignment | null | undefined): AssignmentSpec {
  if (!a) return {};
  return {
    category: a.category,
    duration: a.duration,
    clipCount: a.clipCount,
    businessName: a.businessName || a.clientName,
    modelGender: a.modelGender,
    attireType: a.attireType,
    customAttire: a.customAttire,
    aspectRatio: a.aspectRatio,
    language: a.language,
    festival: a.festival,
    requirementNotes: a.requirementNotes,
    characterPack: a.characterPack,
    customCharacter: a.customCharacter,
    realLocationProvided: a.realLocationProvided,
    posterSize: a.posterSize,
    posterStyle: a.posterStyle,
    posterCount: a.posterCount,
    businessInfo: a.businessInfo,
    businessAddress: a.businessAddress,
  };
}

/**
 * A stable string for "is this the same spec?".
 *
 * Compared rather than deep-diffed on every render because the assignment object is replaced by
 * every Firestore snapshot — including ones where only a session timer or a status moved, which
 * must never interrupt anyone.
 */
export function specSignature(spec: AssignmentSpec): string {
  return JSON.stringify([
    spec.category ?? "", spec.duration ?? "", spec.clipCount ?? 0, spec.businessName ?? "",
    spec.modelGender ?? "", spec.attireType ?? "", spec.customAttire ?? "",
    spec.aspectRatio ?? "", spec.language ?? "", spec.festival ?? "", spec.requirementNotes ?? "",
    spec.characterPack ?? "", spec.realLocationProvided === true,
    // Appended, never interleaved: a job with no poster fields signs exactly as it did before, so
    // this change cannot interrupt anyone holding an ordinary ad.
    ...(spec.posterSize || spec.posterStyle || spec.posterCount
      ? [spec.posterSize ?? "", spec.posterStyle ?? "", spec.posterCount ?? 1]
      : []),
    // Appended the same way: a job with no custom character signs exactly as before.
    ...(spec.customCharacter?.trim() ? [spec.customCharacter.trim()] : []),
    // And the brief, the same way: a job without one signs exactly as before.
    ...(spec.businessInfo?.trim() || spec.businessAddress?.trim()
      ? ["brief", spec.businessInfo?.trim() ?? "", spec.businessAddress?.trim() ?? ""]
      : []),
  ]);
}

const genderText = (v?: string) => (v === "male" ? "Male" : v === "female" ? "Female" : "—");
const packText = (v?: string) => getCharacterPack(v)?.label || "Normal ad (with a model)";
const locationText = (v?: boolean) => (v ? "Client's own business background" : "AI-created background");
const plain = (v?: string) => (v?.trim() ? v.trim() : "—");
/** A long text as one short line — the member reads the whole thing in BUSINESS CONTENT. */
const preview = (v?: string) => {
  const t = (v || "").replace(/\s+/g, " ").trim();
  return !t ? "—" : t.length > 70 ? `${t.slice(0, 67)}…` : t;
};

/** Duration reads as the member sees it: the length AND the number of clips it buys. */
function durationText(spec: AssignmentSpec): string {
  if (!spec.duration && !spec.clipCount) return "—";
  const clips = spec.clipCount ? ` (${spec.clipCount} clip${spec.clipCount === 1 ? "" : "s"})` : "";
  return `${spec.duration || "—"}${clips}`;
}

/**
 * The changes between two specs, ready to show. Empty when nothing the member cares about moved.
 *
 * Attire is compared by its resolved label so switching between two custom descriptions still
 * reads as a change, and a pack ad never reports a model or attire change — there is no model in
 * one, so saying "Attire: Saree → Suit" would describe a person who does not appear.
 */
export function describeSpecChanges(prev: AssignmentSpec, next: AssignmentSpec): SpecChange[] {
  const changes: SpecChange[] = [];
  const add = (label: string, from: string, to: string) => {
    if (from !== to) changes.push({ label, from, to });
  };

  add("Business", plain(prev.businessName), plain(next.businessName));
  add("Category", plain(prev.category), plain(next.category));
  add("Duration", durationText(prev), durationText(next));

  const nextPack = getCharacterPack(next.characterPack);
  add("Special category", packText(prev.characterPack), packText(next.characterPack));
  if (prev.customCharacter?.trim() || next.customCharacter?.trim()) {
    add("Character", plain(prev.customCharacter), plain(next.customCharacter));
  }

  /*
    The background, on every ad.

    It was gated behind "both specs are pack ads", from when that was the only kind of ad that had
    a background at all. It is now asked of every ad — and it is one of the few changes that can
    strand a member completely: a job flipped to the client's own premises cannot be started until
    their photographs arrive, and a job flipped away from it means half-attached photos should stop
    being used. Both are worth interrupting for.
  */
  add("Background", locationText(prev.realLocationProvided), locationText(next.realLocationProvided));

  // A pack ad has no human model, so these two would describe someone who never appears — except
  // a human-model entry ("Normal Ad (Female)"…), whose gender comes with the entry but whose
  // clothes are still chosen, so a change of attire on one is worth stopping for.
  if (!nextPack) {
    add("Model", genderText(prev.modelGender), genderText(next.modelGender));
  }
  if (!nextPack || isHumanPack(nextPack)) {
    add(
      "Attire",
      prev.attireType ? attireLabel(prev.attireType, prev.customAttire) : "—",
      next.attireType ? attireLabel(next.attireType, next.customAttire) : "—",
    );
  }

  add("Aspect ratio", plain(prev.aspectRatio), plain(next.aspectRatio));
  add("Language", plain(prev.language), plain(next.language));
  // Worth interrupting for above almost anything else: a member half-way through a Diwali ad whose
  // job has become a Ugadi one has to start the look again, not find out on delivery.
  add("Occasion", plain(prev.festival), plain(next.festival));
  add("Client notes", plain(prev.requirementNotes), plain(next.requirementNotes));
  // The brief is re-written into BUSINESS CONTENT when it changes; this is how the member hears of it.
  add("Business info", preview(prev.businessInfo), preview(next.businessInfo));
  add("Address", preview(prev.businessAddress), preview(next.businessAddress));

  // Poster jobs. Compared only when either side IS a poster, so an ad never reports "Poster size".
  if (prev.category === "poster" || next.category === "poster") {
    add("Poster size", prev.posterSize ? posterSizeLabel(prev.posterSize) : "—", next.posterSize ? posterSizeLabel(next.posterSize) : "—");
    add("Poster style", prev.posterStyle ? posterStyleLabel(prev.posterStyle) : "—", next.posterStyle ? posterStyleLabel(next.posterStyle) : "—");
    add("Posters", String(prev.posterCount || 1), String(next.posterCount || 1));
  }

  return changes;
}

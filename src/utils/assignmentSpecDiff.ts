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
import { getCharacterPack } from "@/services/characterPacks";
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
  requirementNotes?: string;
  characterPack?: string;
  realLocationProvided?: boolean;
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
    requirementNotes: a.requirementNotes,
    characterPack: a.characterPack,
    realLocationProvided: a.realLocationProvided,
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
    spec.aspectRatio ?? "", spec.language ?? "", spec.requirementNotes ?? "",
    spec.characterPack ?? "", spec.realLocationProvided === true,
  ]);
}

const genderText = (v?: string) => (v === "male" ? "Male" : v === "female" ? "Female" : "—");
const packText = (v?: string) => getCharacterPack(v)?.label || "Normal ad (with a model)";
const locationText = (v?: boolean) => (v ? "Client's own business background" : "AI-created background");
const plain = (v?: string) => (v?.trim() ? v.trim() : "—");

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

  const prevPack = getCharacterPack(prev.characterPack);
  const nextPack = getCharacterPack(next.characterPack);
  add("Special category", packText(prev.characterPack), packText(next.characterPack));

  // Only meaningful for a pack ad, and only worth mentioning while it stays one.
  if (prevPack && nextPack) {
    add("Background", locationText(prev.realLocationProvided), locationText(next.realLocationProvided));
  }

  // A pack ad has no human model, so these two would describe someone who never appears.
  if (!nextPack) {
    add("Model", genderText(prev.modelGender), genderText(next.modelGender));
    add(
      "Attire",
      prev.attireType ? attireLabel(prev.attireType, prev.customAttire) : "—",
      next.attireType ? attireLabel(next.attireType, next.customAttire) : "—",
    );
  }

  add("Aspect ratio", plain(prev.aspectRatio), plain(next.aspectRatio));
  add("Language", plain(prev.language), plain(next.language));
  add("Client notes", plain(prev.requirementNotes), plain(next.requirementNotes));

  return changes;
}

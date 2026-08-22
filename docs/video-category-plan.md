# Video Requirement Categories

**Shipped.** 32 entries across 5 families, wired end to end.

## Where things live

| File | Role |
|---|---|
| `docs/video-category-catalogue.json` | The authored source content — edit here. |
| `src/services/characterCatalogue.ts` | Generated from the JSON. The registry reads this. |
| `src/services/characterPacks.ts` | The `CharacterPack` type, the registry, the lookups, the legacy alias. |
| `src/services/prompts/characterAd.ts` | Turns an entry into script / image / video prompts. |

Regenerating after a JSON edit is a plain transform — see the generator invocation in the session
history, or hand-edit the TS directly if the change is small.

## Decisions worth keeping

**The old `motu_patlu` id resolves for ever.** Every sale, order and assignment made before the
catalogue exists stores that exact string; the catalogue calls the same pack `duo_motu_patlu`.
`LEGACY_PACK_ALIASES` maps one to the other. A data migration over live orders to rename a key
nobody outside that file ever sees is risk with no benefit, and it can half-succeed.

**The direction fields are all optional.** That is what makes `CharacterPack` a strict superset:
a pack written before they existed still satisfies the type and still emits exactly the prompt it
always did. `characterDirectionBlock` returns `""` when an entry carries none.

**The image prompt gets less direction than the video prompt.** Body language is written in terms
of stance, weight and scale against the room; on a still frame that reads as a description of the
character's *build*, and describing a famous character's build is what makes a generator redraw
them instead of using the real one. So `BODY LANGUAGE` is video-only, and camera positions are
written "chest level" rather than "chest height" for the same reason.

**The script prompt reads the cast, not a fixed pair.** It was written for a two-hander and 23 of
the 32 entries have one speaker. The clip contract is now built from `pack.characters`, and the
two-hander prose is branched on `solo` — a model obeys the contract far more literally than any
prose above it, so a hard-coded two-line format made it invent a second speaker for Lord Shiva.

## Still open

- `SaleForm.tsx` renders its own copy of the picker rather than reusing
  `SpecialCategoryFields.tsx`. Both are now grouped and family-accurate, but they are still two
  copies and will drift again.
- **Custom Character** takes its identity from free text, and there is no field to type that text
  into yet. The entry's directives are written to derive everything from a description; the
  requirement needs one new string field to carry it.
- Real Owner Face relies on the existing photo-upload flow. Both pickers now say the owner's face
  photo is required, but nothing enforces it.

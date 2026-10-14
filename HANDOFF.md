# HANDOFF — Real Owner Duo (Real Owner Face for two owners), started 2026-10-14

Temporary note for an UNFINISHED task (CLAUDE.md §34). Delete it when the task is done and the context is updated.

## Goal (owner's request, 2026-10-14)
Real Owner Face gets three DUO configurations — Male + Male, Female + Female, Male + Female. Sales picks the
configuration (Special Category); the two owners' photos are uploaded on the Tech side (studio), two clearly labelled
slots, both required. The configuration (`characterPack`) is the one source of truth sale → order → job → kit `spec` →
frames → script → Veo. Both owners in every clip, never swapped / duplicated / invented / lost. Single Real Owner Face,
Human Duo and every other category unchanged. Test all three.

## Owner's answers (AskUserQuestion, 2026-10-14)
1. Veo prompt = **the owner's real-person template, for two**: both stand side by side the whole clip (no walking, no
   camera move), each line voiced by its owner named by side + gender in the template's words ("With a very sweet voice
   the man on the LEFT needs to say :-"), "Then, with a very sweet voice the woman on the RIGHT needs to say :-", "with
   appropriate gestures — only the one speaking moves their lips; the other listens and reacts.", "Negative prompt :-" /
   "No text on the screen, no third person, the two never swap places or voices".
2. Male + Female: **the man on the LEFT speaks first** (Owner 1 = man, Owner 2 = woman).

## Design
- New family `owner_duo` ("Real Owner Face — Duo", after "human"); ids `owner_duo_male` / `owner_duo_female` /
  `owner_duo_mixed`; characters `owner1` "Owner 1" (LEFT, speaks first) and `owner2` "Owner 2" (RIGHT), new optional
  `PackCharacter.gender`; `usesClientFace: true`. castSheet/stylist skip it automatically (kindsOf → null).
- `ownerPhotoSlots(pack)` in characterPacks (index, name, gender, kind man/woman, side LEFT/RIGHT, ref "owner photo N").
- FileStore: `ownerImage` = Owner 1 (also the single), new `secondOwnerImage` = Owner 2 (in memory only, no DB field).
- frameBrand: duo attach line + duo FACE LOCK (each side ↔ its photo, never blended/swapped/same face).
- motion: `assembleRealPersonDuoVeoPrompt`; `withRealPersonComposition` pair option.
- characterAd: identity block maps photos to sides; owner wardrobe for two; script prompt owners branch (they ARE the
  business, "we / our"); roleLabels / wardrobe / packVeoSubject include owner_duo; frame STAGING in place for owners.
- geminiService: both photos to the frame writer (refuse a duo run missing one), stamps, refine re-stamp, Veo branch.
- UI: two slots (AIPlatformApp), validation, notes in SaleForm / SpecialCategoryFields / salesMessage, mission guide.

## Status
- [ ] all of the above (nothing done yet at the time of writing)

## Gotchas
- Another session has uncommitted notification work in this tree (Topbar, toast, notifications…). Never revert or
  commit those files. CLAUDE.md / DEVELOPMENT-HISTORY / data-model.md are also modified by it — Edit with exact anchors.
- Catalogue: edit BOTH `src/services/characterCatalogue.ts` and `docs/video-category-catalogue.json`.
- `characterCatalogue.test.ts` requires unique voiceDirection / cameraDirection per entry, and pins owner-face ids.

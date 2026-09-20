# Cinematic Ad Platform — Design

Date: 2026-09-19
Status: Approved for implementation

## Goal

Turn the existing 7-step cinematic ads pipeline into a production tool that reliably
produces commercial-grade cinematic promotion ads. The app is a **prompt factory**: it
writes image prompts, animation prompts and voice-over scripts. Frames and clips are
generated outside the app (Nano Banana / Veo / Grok) and uploaded back. No in-app image
or video generation is added.

## The operator's flow

```
0  Brief        ad format + business info + client requirement + our note + uploads
1  Story + VO   5 variations -> confirm            (emotion + camera enforced)
2  Storyboard   one board, whole ad at a glance    (NEW approval gate)
3  Cast         face references (skippable)
4  Clips        one card per clip                  (old steps 3+4 merged)
5  Edit Guide   unchanged
6  Deliver      unchanged
```

## Step 0 — Brief

### Ad Format (the deciding field)

A single required selection. Default is **AI decides**, which picks a format from the
brief and states its reason so the operator can override.

Families and formats:

**A. Dialogue-led** — characters speak on camera. Lip-sync required.

| Format | Sub-options |
| --- | --- |
| Two-person conversation | pairing: Female+Female / Male+Female / Male+Male |
| One person to camera | Owner-Founder or Customer testimonial; gender |
| Multi-character mini-film | 3+ speaking characters; count + genders |
| Interview / vox pop | several people answering one question |

**B. Voice-over led** — no lip-sync. Safest and most cinematic.

| Format | Notes |
| --- | --- |
| One person doing actions + background VO | strongest quality per rupee |
| Multiple characters in action + background VO | ensemble, narration ties it |
| Pure cinematic, no people | product / place / food / craft b-roll + VO |
| Slice-of-life | follow one person through a day + VO |

**C. Structure-led** — the shape drives the ad; VO or dialogue rides on top.

| Format | Notes |
| --- | --- |
| Problem -> Solution | two contrasting halves |
| Transformation / Before -> After | salon, dental, fitness, interiors, construction |
| Offer / Launch / Festival | urgency-driven, short, text-heavy |
| Fast-cut montage | music-led, text punches, minimal VO |

Each format carries a preset that drives the rest of the pipeline:

| Preset field | Effect |
| --- | --- |
| `castingRequirement` | `required` / `optional` / `none` — `none` auto-skips Step 3 |
| `defaultClipType` | `single` / `start_end` / `storyboard` per new clip |
| `voForm` | `dialogue` (speaker-labelled) or `narration` (single voice) |
| `animationPlatform` | `veo_only` when lip-sync is needed, else `either` |
| `clipCountHint` | how many clips the chosen duration should be cut into |

Presets live in one table in `src/types/cinematicAds.ts` so the rules are visible in
one place rather than scattered through prompt strings.

### Typed brief inputs

Three textareas added above the existing uploads:

- **Client: Business Information** — what they do, scale, location, differentiator
- **Client Requirement** — how the client expects the output, in the client's words
- **Our Note** — internal creative direction, injected into story generation as a hard
  directive, not merely summarised into the brief

Existing controls (uploads, platforms, duration, language, dialect) are unchanged.
`generateClientBrief` treats typed text as the source of truth and files as supporting
evidence.

## Step 1 — Story + voice-over script

Keeps 5 variations, refine-by-feedback, and select-one. Changes:

1. The generation prompt demands a felt emotional turn — each beat states what the
   viewer feels and why. The ad format is passed in and constrains the story shape.
2. **Voice-over becomes first-class**: each story carries `voScript`, a clean copyable
   script for the whole ad in the chosen language, plus per-scene lines with delivery
   tone. For `voForm: dialogue` the script is speaker-labelled.
3. Every scene must carry an explicit camera direction; missing values are flagged on
   arrival rather than silently accepted.

## Step 2 — Storyboard gate (new)

One image prompt that renders the whole ad as a panel grid in a single image.

- Panel count equals scene count, **hard-capped at 9**. Beyond 9 the model stops
  following the board, so the ad splits into a second board (1-9, then 10+).
- The operator generates the board externally, uploads it, and views it beside the full
  VO script.
- Two exits: **Approve** -> Cast, or **Story needs changes** -> back to Step 1 carrying
  the operator's note.

## Step 4 — Clips (merges old Steps 3 and 4)

One card per clip. The operator chooses the type; the AI only suggests one.

| Clip type | Produces | Used when |
| --- | --- | --- |
| Single frame | 1 image prompt + 1 animation prompt | conversational / dialogue |
| Start -> End | 2 image prompts + 1 animation prompt | scene travels from A to B |
| Storyboard panels | 1 image prompt for 3-9 panels + 1 animation prompt | multi-beat clip |

Rules:

- Changing a clip's type regenerates **only that clip**.
- Storyboard panel count is an input, minimum 3, **hard-capped at 9**.
- Each card exposes, individually copyable: image prompt(s) with attach instructions,
  animation prompt, VO script for that clip with tone, duration, aspect ratio, negative
  prompt. Plus one **Copy whole clip packet** button.
- Frame uploads per image slot, clip upload, QC checklist, approved flag.
- **Camera movement is enforced.** Every animation prompt carries a visible `Camera:`
  line naming a real move (dolly, crane, push, orbit, handheld). A clip whose animation
  prompt has no detectable camera move shows a warning chip.

## Persistence

- Collection `cinematic_projects`, one document per project, debounced autosave (2s).
- A project list is the landing screen: create, resume, hand over to a teammate.
- Uploads go to Cloudinary via the existing `uploadToCloudinary`; documents store URLs.
  `File` objects are never written to Firestore.
- A Firestore rule for `cinematic_projects` is added to `docs/firestore-rules.md`. It
  must be pasted in the Firebase console, like the other collections in that file.
- Read cost is one document per project open, which is negligible against the Spark
  plan quota.

## Reliability fix

`src/services/cinematicAdsService.ts` hardcodes `gemini-2.5-flash` with API-key rotation
but no model fallback. `src/services/geminiService.ts` documents that newer API keys
cannot access that model, so on a fresh key every cinematic step fails. The cinematic
service adopts the same model-fallback list as `geminiService`.

## Out of scope

- Step 5 Edit Guide and Step 6 Deliver keep their current behaviour.
- The API-key rotation scheme is unchanged apart from adding model fallback.
- No in-app image or video generation.

## Testing

- Unit tests for the format preset table, the 9-panel cap, clip-type regeneration, and
  the camera-move detector.
- Browser test of the whole flow with Firebase aliased to an in-memory fake and Gemini
  stubbed, per the project's established harness approach.

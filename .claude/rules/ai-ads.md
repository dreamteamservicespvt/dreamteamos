---
paths:
  - "src/components/ai-platform/**"
  - "src/components/cinematic-ads/**"
  - "src/services/prompts/**"
  - "src/services/{geminiService,gemini,prompts,characterPacks,characterCatalogue,posterStyles,adLanguages,cinematicAdsService,cinematicProjects}.ts"
  - "src/store/cinematicAdsStore.ts"
  - "src/types/{aiPlatform,cinematicAds}.ts"
  - "src/pages/tech-admin/CinematicAds.tsx"
  - "src/pages/tech-member/CreateAd.tsx"
  - "src/pages/shared/Tools.tsx"
  - "docs/video-category-*"
  - "src/utils/{adPipeline,adRequirement,assignmentFormSpec,businessFacts,businessPlace,castSheet,cinematicAds,clipPlacement,collectReadiness,customScript,dialogueFormat,festivals,fileHelpers,finalScript,frameBrand,generationEta,generationHistory,locationAssignment,overlayImage,posterConcepts,posterOccasions,posterSpec,promptAttachments,scenePlan,scriptQa,speakingPosition,spokenAddress,spokenNumbers,veoRefine,voiceBrief,voiceOverFormat,voiceOverRefine,wordTiming}.ts"
---

# AI ad generation (AI Ads Platform video + poster, Cinematic Ads, Gemini pipeline) — DTS-OS module context

> Part of the project context (CLAUDE.md → Context map). Claude Code loads this file automatically when a
> file matching the `paths:` above is read or edited. Section numbers are CLAUDE.md's originals, so a
> reference such as "§17.2" still points here. Keep it current per CLAUDE.md §30 step 8; the source code wins.

## 9. APPLICATION MODULES (the entries for this module)

**9.7 AI Ads Platform (ad generation)** ✅. `components/ai-platform/*`, `services/geminiService.ts`,
`services/prompts.ts`, `services/prompts/*`, `services/characterPacks.ts` +
`characterCatalogue.ts` (35 special-category entries incl. three human duos), `services/posterStyles.ts`,
`services/adLanguages.ts`, `components/ai-platform/adgen.css` (the studio's design system, §11),
`utils/businessFacts.ts` (verified contact numbers and address), `utils/scriptQa.ts` +
`services/prompts/scriptQa.ts` (the voice-over quality gate), `utils/finalScript.ts` (a pasted final
script), `utils/assignmentFormSpec.ts` (what a job decides on the form).
Collection `ai_generations`. See §17.

**9.8 Cinematic Ads pipeline** ✅ (rebuilt 2026-09-19). `pages/tech-admin/CinematicAds.tsx`,
`components/cinematic-ads/*` (Step0–Step6, ProjectList, AdFormatPicker, PipelineStepper,
ProjectAssetsPanel), `store/cinematicAdsStore.ts`, `services/cinematicAdsService.ts`,
`services/cinematicProjects.ts`, `utils/cinematicAds.ts`, `types/cinematicAds.ts`. Collection
`cinematic_projects`. tech_admin only. See §17.4.

## 17. ADVERTISEMENT GENERATION

### 17.1 Overview
Three generation surfaces, all **prompt factories**. The app writes scripts and image/video
prompts with Gemini; **no image or video is generated inside the app**. Members copy prompts
into external tools (links in `generation/mission.ts`: ChatGPT, Gemini, Google Flow/Veo), then
upload or deliver the results.

| Surface | Where | Who |
|---|---|---|
| AI Ads Platform: **Video Ad** | `AIPlatformApp` via My Work / Recent Ads (with an assignment), Tools, `/tech/create` | tech member (job), tech admin / leader (Tools), external creator |
| AI Ads Platform: **Poster Creation** | same component, `creationMode: 'poster'` (locked for poster jobs) | same |
| **Cinematic Ads** 7-step pipeline | `/tech-admin/cinematic-ads` | tech admin |

Also: Tools → **Script Duration Checker** (`extractScriptFromImage`, `convertToVoiceOverScript`,
`suggestClipCount`), `formatAgreementWithAI` (HR), `readMetaAdsReport` (SMM ad-report
screenshot → leads/spend/cost-per-result/reach).

### 17.2 Video Ad flow (`AIPlatformApp` → `geminiService.generateAdAssets` → prompts)
**Inputs** (`AdFormData` in `types/aiPlatform.ts` + `FileStore`):
- ad type `commercial` / `festival` (+ festival name);
- model gender (female default) and attire (`traditional` saree, `professional` suit,
  `shirt_pant`, `custom` text). Attire options come from `utils/adRequirement.attireOptionsFor`
  (by pack cast; the male & female duo gets `MIXED_DUO_ATTIRE`, each person dressed for themselves);
- duration (16 / 32 / 48 / 64 s or custom; 8-second clips);
- aspect ratio `9:16` / `16:9`;
- language (Telugu default);
- no-logo name board (also used automatically when no logo FILE is attached, see below);
- special category `characterPack` (38 entries: human "Normal Ad", owner face, **human duos**
  (`human_duo_female` / `human_duo_male` / `human_duo_mixed`, family `human_duo`, speakers
  speakers "Girl"/"Boy" on the mixed duo and "Friend"/"Host" on the same-gender ones — role labels
  that are never spoken, now ENFORCED by `validateDialogueClips` `forbiddenNames` against each
  character's `labelSpellings`), **Kids** (`kids_duo_girls` / `kids_duo_boys` / `kids_duo_mixed`,
  family `kids`, 2026-10-01: photoreal children with child voices, kid attire options and labels,
  family-safe negatives), deities, cartoon duos/solos, custom);
- `customCharacter` — the Custom Character's description (required for that pack; written into
  the pack by `characterPacks.withCustomCharacter`, one resolver `packFor` in geminiService);
- `locationMode` (`real_provided` uses the client's store photos, `ai_generated`);
- **BUSINESS CONTENT** box (`textInstructions`, the authoritative facts) and **FRAME /
  BACKGROUND INSTRUCTIONS** box (`frameInstructions`, highest priority for backgrounds); when empty,
  the visiting card and other files fill in;
- optional custom script;
- files: logo, **owner image** (`ownerImage`, own slot, required for Real Owner Face), visiting
  card, store images, product images, flyers, voice recording. There is **no document upload**:
  `FileUpload` refuses PDF, documents, text files, video, non-images on image slots and images over
  10 MB, and the platform shows a highlighted "extract it in Gemini, paste into BUSINESS CONTENT"
  box with a copyable extraction prompt. Drag & drop works on every slot.

An assignment **pre-fills and locks** spec fields it carries (gender, attire, ratio, language,
festival, pack, custom character, background, duration, poster size/style/occasion). Live spec
changes raise `SpecUpdateDialog`.

**Speed (2026-09-29, measured live):** a 4-clip Telugu ad took 129 s plus the B-roll/overlay tail;
it now takes ~70–90 s with B-roll and overlays INCLUDED (a Motu & Patlu ad 161 s → 108 s). What
overlaps: the poster starts right after extraction; the client-photo scout runs while the script is
written; a scene plan starts on every draft the quality gate considers (`planScenesEarly`, keyed by
the draft's lines) so the shipped draft is already planned; B-roll and overlays run inside the run
alongside frames and Veo (`GenerationOptions.extras`, the studio passes its stock theme and only
re-asks for one the run could not write). The native-speaker review now runs only when the gate asks
for a polish or could not run. Every pipeline call states an effort (§17.3). Images are downscaled
once per file before upload (`utils/fileHelpers.fileToBase64`: longest edge 2048 px, same format,
cached; small images and anything the browser cannot redraw go as they are).

**Pipeline (progress messages in order):**
0. Voice note (if any) heard on its own first: `understandVoiceInstructions` (`prompts/voiceNote.ts`,
   `utils/voiceBrief.ts`) → transcript, summary, requirements, conflicts with the typed content.
   Its text goes into extraction and is merged into the profile as `clientVoiceInstructions`.
1. Extract business intelligence from all files (`EXTRACTION_SYSTEM_PROMPT`), then **verify it**
   (`verifyExtraction` → `utils/businessFacts`): numbers the member typed (BUSINESS CONTENT, text files,
   the voice note's transcript) are ground truth; a number the model "read" is kept only when a
   visiting card, flyer or premises photo is attached, it is well-formed, not a placeholder, and not a
   one-digit misreading of a typed one; a typed `Address:` line (or the job's address) is used word for
   word, a read address only with a document behind it or ≥60% of its words in the typed text. The
   profile every later prompt reads is rewritten (`sanitizeBusinessProfile`) to carry only
   `contactNumbers` / `whatsappNumber` / `address` that passed, with every "Not provided" and every
   unverified town, email or website removed. The BUSINESS CONTENT brief a job opens with now also
   carries the business name and the client's notes, and a corrected brief is merged into a box the
   member already edited (`mergeBriefIntoInstructions`).
2. Decide the core message (`prompts/coreMessage.ts`).
3. Write the voice-over (`VOICEOVER_SYSTEM_PROMPT`, language-aware, 18–20 words per clip; a
   two-speaker clip is **15–17**, 7–9 per line, `dialogueFormat.wordBudgetFor`). Mechanical repair
   (≤2 passes), native-speaker quality review (AI scripts only), second repair. Checks include
   everyday speech, festival wish, and `utils/speakingPosition` (a line that sends the viewer
   "elsewhere" while the speaker stands inside the business). **Address (2026-10-01):** when the
   verified facts carry an address, the LAST clip says it in spoken form
   (`utils/spokenAddress.spokenAddressOf`: landmark + area / town, never a door number or pincode,
   ≤ 6 words, transliterated into the script's language); no clip may invent one (`addressIssues` →
   repair; `prompts/address.addressRuleBlock` on every writer, repair, edit and review prompt). Character packs use
   `prompts/characterAd.ts` dialogue prompts. **A custom script is used word for word**
   (`utils/customScript.ts`): labelled clips verbatim (only emoji/decoration stripped); unlabelled
   text is split at sentence ends (a model split is kept only if `sameWords` holds); no repair or
   review; a two-speaker pack needs `[Speaker]:` lines or the run stops with a format message.
   `voiceOverFormat.parseLabeledClips` accepts many header shapes (round brackets, bold, no colon,
   `Scene N`, full-width colon). A pack script is stored in the DISPLAY form (`[Motu]: …` under a
   clip header) and re-read by the Veo step and the refine editor, so
   `dialogueFormat.parseDialogueClips` must resolve a speaker LABEL — including a multi-word name
   like `[Chhota Bheem]` — back to the pack's single-word key; pass it `packSpeakers(pack)`, not
   bare aliases (2026-09-23).
   **Quality gate (every generated script, single voice or a cast; never a member's own):** a separate
   judge (`prompts/scriptQa.ts`) never rewrites — it checks every claim against the business facts and
   scores facts, language (educated, well-spoken, natural register), persuasion, clarity, relevance and
   speakability; `utils/scriptQa` decides in code: pass (overall ≥ 8, each ≥ 7, facts ≥ 9, no
   unsupported claim) ships; `polish` sends the judge's exact problems to the native-speaker editor;
   `rewrite` writes a NEW draft told what failed. Every draft is judged again; the best of up to three
   ships (`isBetterDraft`: no invented facts first, then score). Extra drafts are written AT THE SAME
   TIME and judged together (one for a polish, every remaining draft for a rewrite), with a 60 s
   deadline (`SCRIPT_GATE_DEADLINE_MS`) after which the best so far ships. The result is `scriptQa` on the kit
   ("Script QA 8.6/10" on row 4). A judge that cannot run never blocks the ad.
4. For real locations: review the client's photos and assign them to clips round-robin (a photo is
   reused, never replaced by an invented zone); each is the clip's **background plate**
   (`utils/locationAssignment.backgroundPlateRule` / `withBackgroundPlate`, `prompts/realLocation`):
   kept exactly as photographed, only enhanced to 8K, the cast placed into it, and attached to the
   frame writer's call. Otherwise the **scene
   plan** (`prompts/scenePlan.ts`, `utils/scenePlan.ts`): the video's motive (annadanam, temple,
   birthday, invitation, promotion…), its world, and one DIFFERENT background per clip from that
   clip's line; retried once if `repeatedBackgrounds` finds a repeat.
5. Main-frame prompts per clip (`MAIN_FRAME_SYSTEM_PROMPT` / `MULTI_FRAME_SYSTEM_PROMPT` with the
   scene plan; `CHARACTER_MULTI_FRAME_SYSTEM_PROMPT` with `sceneBackgrounds` / `nameBoard`). Stamped
   in code: motion composition, `withSceneBackground`, `frameBrand.nameBoardInPlaceOfLogo` when there
   is no logo file, `withOwnerImageDirective` for Real Owner Face, the photo attach line, a **cast sheet** for invented
   people (`utils/castSheet`: Normal Ad, human duos, Kids — one fixed face and outfit per person,
   seeded by the business name; the Veo prompt names each speaker by how they look) and a pack's
   **scale anchor** (`withScaleAnchor`: e.g. Motu and Patlu's height against a real counter). VIDEO
   BOTTOM LABEL (`buildVideoBottomLabel`, code-assembled from `prompts/lowerThird.ts`, fed the festival
   theme and the video's motive / core message) and the poster prompt (`writeVideoPosterPrompt`,
   `POSTER_SYSTEM_PROMPT`) — both from the VERIFIED facts: exactly as many contact pills / numbers as the
   business has (1–3, laid out for the count), no address strip or line when there is none, and
   `stripUnverifiedNumbers` on every model-written poster, concept, overlay and refine. A poster that
   fails twice leaves one Missing row instead of failing the run. Frames the model skipped are written
   for exactly those clips (never a copy of the last frame), and the retry carries the images.
6. Direct performance and camera per clip (`prompts/motion.ts`) → **Veo 3 prompts**. **Motion
   policy (2026-10-01): the video animates its own frame and nothing beyond it.** Each Veo prompt
   opens with THE ATTACHED FRAME — a summary of that clip's own main-frame prompt (`frameSummaryOf`) —
   and a FRAME BOUNDARY rule: nothing the frame does not show may appear. A different place in the
   shop (the entrance, a counter, a rack) comes from a different FRAME, never from the camera. Stagings
   are all in place: `stand_present`, `show_product`, `present_space`, `welcome_invite` (always the
   last clip; an invitation, **never a goodbye wave**); a saved plan's old `walk_and_talk` reads as
   `present_space`. The plan (`planClipMotion`) takes the scene plan's per-clip `staging` / `camera` /
   `angle` / `focus` choices, else reads each line (`stagingForLine`: product words → show, place
   words → present the space, trust words → stand), and never repeats a neighbour's staging or move.
   Camera moves are only those that stay inside the frame — `CAMERA_MOVES`: Slow Push In (a few
   percent over 8 s), Rack Focus, Gentle Float, Static Locked; `SHOT_ANGLES`: eye level, slightly low,
   slightly high; `LENS_COMBOS` / `SPEED_KEYWORDS` give Veo's terms. Walk-and-talk, pull back, dolly
   out, crane, pedestal, orbit, arc, pan, tilt, truck and follow tracking are gone: they made the
   model invent the rest of the room — people walked over tables and cupboards or out onto the road,
   and shops grew. **Two-handers are filmed from a fixed distance** (`DUO_SAFE_MOVES`: static, rack
   focus, gentle float; a drawn pair only static or rack focus, `CARTOON_PAIR_MOVES`; always eye
   level); every lean or step toward the lens is stripped from a pair's direction (`withoutApproach`)
   and a pack's scale anchor opens the scale lock (`scaleLock`) — what kept growing Motu and Patlu.
   They keep fixed LEFT/RIGHT positions, a strict WHO SPEAKS block and, on a rack-focus clip, SPEAKER
   FOCUS (the focus moves to whoever talks; the camera does not). Every Veo prompt
   carries the `COLOUR_LOCK` near the top (the frame's exact grade, contrast and exposure; never pale,
   washed, hazy or brightened) with matching negatives, and scene life that changes the light is
   refused (`LIGHT_CHANGE`). **An English ad is spoken in Indian English with an Andhra Pradesh accent**
   (`speechAccentFor`): named in the opening line, in a `VOICE AND ACCENT — INDIAN ENGLISH ONLY` block
   above SPEECH, on every spoken line and in the negatives (never British, American or any foreign
   accent) — the prompt used to say only "speaking English", so Veo used its default foreign voice.
   Other languages are spoken natively and get no block. Locked always: the people (height/build/outfit relative to the room — a
   single presenter's camera may push in slightly), the WORLD (no object vanishes or moves, nobody
   steps onto or climbs furniture) and the PLACE (nobody leaves the shop or goes through a door).
   `resolveDirection` discards director text that walks, climbs, reveals what the frame does not show,
   leaves, freezes, cuts, crash-zooms or uses slow motion / hyperlapse during speech; the director's
   JSON also returns `frame`. The frames are composed for the plan first (`framingForMotion`,
   `withMotionComposition`), then the Veo prompts use the SAME plan (`writeVeoPrompts` receives all
   lines + `sceneContext` + each clip's `framePrompt`; `regenerateVeoForClips` too).
7. Finalize (returns `sceneContext` and `voiceBrief` too).

**Spoken-word rules, in code (`utils/spokenNumbers.ts`):** every final script line — generated,
repaired, refined or pasted — goes through `speakableLine`: numbers become words (Telugu words in a
Telugu script, English words in an English one, Indian lakh/crore grouping, ₹ / % / decimals / times /
phone numbers digit by digit; other languages rely on the prompt and validator), and the Telugu word
for "and" — with every misspelling of it — is written **`mariyu`, in Latin letters**, inside the
Telugu line (2026-09-25: the team reads the script aloud and wants one fixed spelling on the page).
Nothing explains it anywhere: the written word IS the spelling to say, so the Veo prompt no longer
carries a PRONUNCIATION line. `withoutFixedWords` exempts it from the validator's "no Latin letters
in spoken content" rule. (`everydaySpeech` no longer swaps it for ఇంకా.) An **English** script is
written and judged as **Indian English** (the writer rules, the language directive and the quality gate):
how an educated person from Andhra Pradesh speaks English — Indian expressions, rupees and lakhs,
Indian places and festivals, never American or British slang, idioms, spellings or culture.

Directives are prepended for ratio, name board, language, casting and wardrobe. `onPartialResult`
streams sections as they arrive. **B-roll and overlay images run automatically at the end of a video
run** (`handleGenerate` → `handleGenerateStockImages`/`handleGenerateOverlayTexts` with the run's own
result; their buttons remain for a regenerate, 2026-09-25). The two extras: the **Overlay Text Image Generator**
(`generateOverlayTexts` + `utils/overlayImage.ts`: each overlay gets a model-written `design` and a
code-assembled `imagePrompt` for a premium 3D transparent PNG — exact text, real alpha channel,
tightly cropped; festival palette for festival ads; `refineOverlayImagePrompt` changes only the
look; UI shows text, CapCut SFX and From → To words, no timecodes), B-roll stock prompts
(`generateStockImagePrompts`: the subject of each line, never a presenter or text; festival
imagery for festival ads; reads the scene plan and core message), regenerate Veo for chosen clips.

**Outputs** (`GeneratedOutputs`): 1. Main Frame Prompts (per clip), 2. **VIDEO BOTTOM LABEL**,
3. Poster Design (JSON), 4. Voice Over Script, 5. Veo 3 Video Prompts, plus B-roll, overlay
images, the core message, `sceneContext`, `voiceBrief` (shown in a "what we understood /
background plan" panel above the sections) and `scriptQa`. **Every row is always drawn** with its own
state (Writing… / Missing / Failed / Updated from final script / Script QA n/10) and, when missing, its
own Generate — label (instant), poster, the missing Veo clips — instead of vanishing while the status
says Completed.

**Input Final Script (on row 4, Voice Over Script → `FinalScriptPanel.tsx`, `utils/finalScript`):** a
highlighted strip (`ag-callout`, `data-test="final-script-callout"`) sits inside row 4 and is visible
with the row shut, saying when to use it — a script given by the client, or corrected in ChatGPT or
Gemini. It opens into three steps: 1 copy the format (for this ad's cast and the kit's clip count),
with "Copy instruction for ChatGPT / Gemini" (`finalScriptAiInstruction`: returns the script in this
format without changing a word); 2 paste — or "Load current script" (`finalScriptFromKit`) for a small
correction — with a live reading; 3 "Use this script · update 5 · 6 · 7". After it, the strip says the
final script is in use and offers "Change final script". The paste format is per category
(plain clips / one `[Name]:` line / both characters' lines, over the kit's own clip count). It is read
with the generator's parsers, used word for word (numbers and `mariyu` made speakable), refused with a
reason when a label or the clip count is wrong, and becomes 4. Voice Over; 5 Veo (every clip, from the
existing frames), 6 B-roll and 7 overlays are rewritten from it in parallel, each with its own
Regenerating… / Updated / Failed-Retry state. Frames, label and poster are untouched.

**Editing / refine:** per-section refine (`refineSection`, "change only what was asked"),
`refineVoiceOver` (plan → clip edits → validation; `RefineRevisionBanner` offers undo),
`refineVeoPrompts` (plan → JSON edit → check: `VEO_REFINE_PLAN_SYSTEM_PROMPT` understands the request
and compares it with each prompt; `utils/veoRefine` refuses an edit that changes the spoken line or
loses a section; one retry; the UI alert says what was understood). Copy buttons strip code fences.

**Save / storage:** `persistGeneration` writes `ai_generations`. **Generate** creates a new doc (a
version); **Save** and a 1-second debounced **auto-save** update the same doc; the assignment gets
`savedGenerationId`. Reopening a job restores it — ONLY on opening: the auto-load no longer re-fires
when a finished run points the job at its new save (that read-back used to wipe B-roll and overlays
still arriving — the "completed but deliverables missing" glitch). `SavedItems` lists the user's own generations.
Tools → Ad Generation History groups versions per job (`utils/generationHistory.ts`). Submitting
the job is `useCompleteWork` (§16).

**Poster Creation:** size (`utils/posterSpec.ts`: 4:5 default, ratios or pixels), style
(`services/posterStyles.ts`, 8 styles + auto), occasion (`utils/posterOccasions.ts`), concept
count 1–6 (default 3), text language (English default) → `generatePosterConcepts` → concepts
(title, idea, headline, **image prompt**, negative prompt) → `refinePosterConcept`.
`PosterConceptsPanel` links to Gemini for image generation.

### 17.3 AI provider, reliability, errors
- **Provider:** Google Gemini through `@google/genai`, called **from the browser**. Every call
  goes through `callWithFallback` (exported as `callGeminiWithFallback`).
- **Keys:** a pool of up to 30 keys (`VITE_API_KEY_n` / `API_KEY_n`, single-key fallbacks),
  rotated on quota, rate-limit or invalid errors.
- **Models:** `MODEL_LIST` (`gemini-2.5-flash` → `2.0-flash` → `2.5-flash-lite` → … →
  `gemini-3.1-flash-lite-preview`), rotated on overload or 5xx. A 404 "not available to new users"
  retires a model **for that key only**; any other 404 retires it for all keys.
- **Thinking budget per call (2026-09-29):** `callWithFallback(apiCall, { effort })` — `fast` 0 tokens
  (extraction, voice note, poster, splits, location scout, B-roll, overlays), `standard` 768 (core
  message, repairs, scene plan, frames, Veo director, poster concepts), `deep` 1536 (script writer,
  review, quality judge). Applied only on `gemini-2.5-flash` (the lite models do not think by
  default; 2.0 rejects the setting); a call with no effort keeps the model default. Measured: thinking
  was ~75% of generated tokens and 10–16 s per call before.
- **Key handling (2026-09-29):** each call starts on the NEXT usable key (round-robin — the free tier
  allows ~5 requests/minute and ~20/day per key per model on 2.5-flash); invalid, expired and
  "reported as leaked" keys are dead for the session with no wait before the next; a 429 rests that key
  for Google's retry delay (30 min for a per-DAY limit); keys lacking a model ("new users" 404) are
  skipped for it. Dead keys and per-model gaps are kept in localStorage for a day under a fingerprint
  of the key set (never the keys), and the last good key index is where a new session starts.
- **Errors:** after exhausting keys and models the call throws; the UI shows an error modal
  (`status.error`). Many parsers are defensive (JSON repair, clip-number coercion). No
  server-side proxy, no retry queue.
- **Live testing:** run `generateAdAssets` with vite-node and text-only `formData`, timing each request
  by wrapping `globalThis.fetch` (model, ms, status, `usageMetadata.thoughtsTokenCount`). On 2026-09-29,
  of the 30 keys: several invalid (incl. 1, 12, 18), several "reported as leaked" (16, 23–28), key 2 has
  no gemini-2.5-flash, and working keys hit the free-tier daily limit of 20 requests per model.

### 17.4 Cinematic Ads pipeline (`/tech-admin/cinematic-ads`)
Project list (create, open, delete; **scoped to the creator**, `listProjects(createdBy)` ordered
by `updatedAt`) → steps with `PipelineStepper`:
- **0 Brief:** ad format picker (12 formats in families dialogue / voice-over / structure, plus
  "AI decides"; presets drive casting, clip type, VO form, animation platform), business info,
  client requirement, our note, uploads, platforms, duration, language → `generateClientBrief`.
- **1 Story + VO:** 5 variations, refine by feedback, select → `generateStories` / `refineStory`.
- **2 Storyboard:** one grid prompt per ≤9 scenes (`splitScenesIntoBoards`); upload the rendered
  board; approve or send back.
- **3 Casting:** `extractCharacters`, face references; auto-skipped when the format needs no cast.
- **4 Clips:** one card per clip, type `single` / `start_end` / `storyboard` (3–9 panels);
  per-clip regeneration; camera-move enforcement (`hasCameraMove`); frame and clip uploads; QC;
  "copy whole clip packet".
- **5 Editing guide:** `generateEditingGuide`.
- **6 Review & delivery:** final video, feedback rounds, deliverables, mark delivered.

Persistence: `cinematic_projects` with debounced autosave; files go to Cloudinary (URLs only).
Gemini calls use the shared fallback.

### 17.5 Relationships
- Ads link to **work assignments** (`savedGenerationId`) and so to orders and clients.
- Cinematic projects are **not** linked to orders or assignments.
- There are no campaign objects for ads other than SMM campaigns.
- Ownership: `ai_generations.userId`, `cinematic_projects.createdBy`.
- Publishing to social platforms is **not implemented**. SMM "posting" is recorded by pasting
  live links.

## 24. BUSINESS RULES (IMPLEMENTED; verified in code)

- **AI ads — English (2026-09-25):** an English ad is Indian English throughout — written for Indian
  customers and voiced with an Andhra Pradesh accent in every Veo prompt; never a foreign accent.
- **AI ads (2026-09-25, integrity):** no contact number or address reaches a deliverable unless the
  member typed it or a card / flyer / premises photo could show it (and it is not a placeholder);
  missing fields are absent — no empty label, pill or line — and the layouts follow the count (1–3).
  The job's spec wins over a reopened kit. Every generated script passes a separate quality gate or is
  polished / rewritten automatically (best of three). A pair of characters is never filmed with a
  move that changes their distance or height, and every video keeps the frame's colour. A final
  script pasted into the Deliverables rewrites 5 · 6 · 7 only, and only with the kit's clip count.
- **AI ads (2026-09-25):** a run is refused while the client's brief is still loading and when
  nothing describes the business (no BUSINESS CONTENT and no card / store / product / flyer / voice
  file) — a model with nothing to read invents a business, which is what made first runs come back
  about the wrong one. A two-hander never walks toward the camera (that is when the video model
  re-proportions the pair) and every duo video prompt opens with the scale lock. B-roll and overlay
  images are part of every video run, not a button pressed afterwards.
- **AI ads (2026-09-22):** a custom script is used word for word (only emoji/decoration stripped;
  numbers become words); a two-speaker category needs `[Speaker]:` lines; a two-speaker clip is
  15–17 words (7–9 a line); human casts' role labels (Friend/Host) are never spoken; the Custom
  Character needs a description (sale, Work Assign and platform) and Real Owner Face needs the
  owner image; no PDF/document uploads anywhere in the generator; every spoken number is words,
  never digits; the word for "and" is written `mariyu` in Latin letters and explained nowhere; a human
  cast never says its own role label out loud (Girl / Boy / Friend / Host — checked, not just asked);
  no frame or video ever ends on a goodbye
  wave; (a walk was allowed here until 2026-10-01 — nobody walks now, see below); no frame asks for a logo file that
  was not attached (the name board is used instead).
- **AI ads (2026-10-01):** every video animates its own frame and nothing beyond it — performed in
  place (no walking), the camera only pushes in slightly, racks focus, floats or holds; nobody climbs
  on furniture or leaves the place, and the shop is never extended. A pair is filmed from a fixed
  frame with its height anchored to a real counter. A client's store/office photo is the clip's
  background, unchanged apart from an 8K enhancement. Invented people keep one face and outfit in
  every clip. When the client's address is known the last clip says it (landmark + town), and no clip
  ever invents one.

## 25. CURRENT IMPLEMENTATION STATUS

**PARTIALLY IMPLEMENTED 🟡:**
- Number spelling (`utils/spokenNumbers`) covers Telugu and English only; Hindi, Tamil, Kannada and
  Malayalam scripts rely on the prompt rule and the digit validator.
- Motion staging comes from the scene plan's choices or a keyword reading of each line; when the
  client's own photos are used the scene plan is skipped, so only the keyword reading applies.
- The script quality gate's thresholds (pass ≥ 8, each ≥ 7, facts ≥ 9) are set from the rubric, not
  measured against live Gemini scores; a final script with a different clip count than the kit is
  refused rather than re-framed (it has to go through Configuration → custom script and a new run).
- Character catalogue regeneration from JSON has no committed generator script.
- Header/poster prompts in no-logo mode may still reference a logo container (noted 2026-07,
  [NOT CONFIRMED] current).

**NOT IMPLEMENTED ❌** (referenced or planned, absent in code):
- Hand-over of a cinematic project to a teammate (in the 2026-09-19 spec; the list is per-creator
  only).
- In-app image or video generation; publishing to social platforms.

## 27. POTENTIAL RISKS (need verification)

- `cinematic_projects` list query (`where createdBy` + `orderBy updatedAt`) needs a composite
  index; no index file is in the repo [NOT CONFIRMED in console].
- `MODEL_LIST` still lists `gemini-2.0-flash`, reported retired in live tests; it costs an
  attempt before removal.
- Every AI video run now makes up to three more Gemini calls: the voice note (when one is
  attached), the scene plan (up to 2 attempts, skipped with client photos) and the Veo refine's plan
  step. More quota and latency per run; not measured live. Since 2026-10-01 a run whose facts carry an
  address and whose script is not English adds one `fast` call that writes the address in the
  script's language (`nativeAddressPromise`: runs alongside the core-message call and is awaited before
  the script is written, so it rarely adds time).
- The motion policy (in-place staging; push-in, rack focus, float or locked; speaker focus) and the in-code prompt rules were
  unit-tested only — **no live Gemini, image or Veo run** has confirmed how the generated frames and
  videos behave (e.g. whether Veo keeps to the attached frame).
- `AIPlatformApp` reloads saved generations in `useEffect(..., [user])`; a new `user` object on
  every profile snapshot re-reads `ai_generations` (read-quota; a test mock with an unstable user
  made it loop).
- A frame run with no logo FILE now uses the name board even when "No logo" is not ticked.
- The script quality gate adds a judge call per draft and up to two more drafts: 1 extra call on a
  script that passes, up to ~6 on one that is rewritten twice (more quota and latency; not measured).
- Verified facts drop a number the extraction put under a non-contact key or read from a product
  photo, and any number when only a logo was attached — by design, but a real number can be lost that
  way; the member types it into BUSINESS CONTENT to keep it.
- Speed work (2026-09-29): a rewrite now spends every extra draft at once (more calls than stopping at a
  passing second draft), and B-roll/overlays run concurrently — both use the small free-tier quota
  (~20 requests/day/key/model) faster. The thinking budgets were chosen from one live comparison
  (quality gate 9.8 → 8.9–9.0 on the same brief), not a broad study.
- The fixed-distance duo camera, the colour lock and the Indian-English accent are prompt rules checked
  by unit tests only — no live Veo run has confirmed the heights hold, the colour stays or the accent
  is Indian. Cinematic Ads has its own `dialect` field and was not changed.
- The 2026-10-01 frame-bounded motion, scale anchor, background plates, cast sheet, Kids packs and
  spoken address are prompt rules checked by unit tests and one full-pipeline test on a faked Gemini —
  **no live Gemini, image or Veo run** has confirmed that Veo stops walking people over furniture or
  onto roads, keeps Motu & Patlu's height, leaves a client photo unchanged, or how the children look.

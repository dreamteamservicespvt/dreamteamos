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
  - "src/utils/{adPipeline,adRequirement,adSpec,assignmentFormSpec,businessFacts,businessName,businessPlace,castSheet,castWardrobe,cinematicAds,clipPlacement,collectReadiness,customScript,dialogueFormat,englishWords,festivalDressing,festivalNames,festivals,fileHelpers,finalScript,frameBrand,generationEta,generationHistory,locationAssignment,overlayImage,posterConcepts,posterOccasions,posterSpec,promptAttachments,scenePlan,scriptContract,scriptQa,speakingPosition,spokenAddress,spokenNumbers,unspokenNumbers,veoRefine,voiceBrief,voiceOverFormat,voiceOverRefine,wishGesture,wordTiming}.ts"
---

# AI ad generation (AI Ads Platform video + poster, Cinematic Ads, Gemini pipeline) — DTS-OS module context

> Part of the project context (CLAUDE.md → Context map). Claude Code loads this file automatically when a
> file matching the `paths:` above is read or edited. Section numbers are CLAUDE.md's originals, so a
> reference such as "§17.2" still points here. Keep it current per CLAUDE.md §30 step 8; the source code wins.

## 9. APPLICATION MODULES (the entries for this module)

**9.7 AI Ads Platform (ad generation)** ✅. `components/ai-platform/*`, `services/geminiService.ts`,
`services/prompts.ts`, `services/prompts/*`, `services/characterPacks.ts` +
`characterCatalogue.ts` (41 special-category entries incl. three human duos and the three Real Owner Duos), `services/posterStyles.ts`,
`utils/posterAdType.ts` + `services/prompts/posterConcept.ts` (both poster systems: one ad type, the owner's structure),
`services/adLanguages.ts`, `components/ai-platform/adgen.css` (the studio's design system, §11),
`utils/businessFacts.ts` (verified contact numbers and address), `utils/castSheet.ts` +
`utils/castWardrobe.ts` + `services/prompts/castWardrobe.ts` (the invented cast and its wardrobe stylist), `utils/scriptQa.ts` +
`services/prompts/scriptQa.ts` (the voice-over quality gate), `utils/scriptContract.ts` + `services/prompts/wordContract.ts`
(THE word contract: 17–20 spoken words a clip, the one counter, the one prompt block — 2026-10-15), `utils/finalScript.ts` (a pasted final
script), `utils/assignmentFormSpec.ts` (what a job decides on the form). 2026-10-22: `utils/englishWords.ts` (English words a
Telugu script writes in English letters), `utils/wishGesture.ts` (the namaskaram's moment), `utils/festivalDressing.ts` (every
festival frame dressed for its festival), `utils/businessName.ts` (the business's final name from its own material).
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
`suggestClipCount` — since 2026-10-15 on the one word contract: clips made speakable before they are counted, a
whole-script repair kept only when better, then the same clip-by-clip repair as the generator, `repairClipsByEdit`), `formatAgreementWithAI` (HR), `readMetaAdsReport` (SMM ad-report
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
- special category `characterPack` (41 entries: human "Normal Ad", owner face, the **Real Owner Duo** (`owner_duo_male` /
  `owner_duo_female` / `owner_duo_mixed`, family `owner_duo`, 2026-10-14 — the business's two real owners, see step 6),
  **human duos**
  (`human_duo_female` / `human_duo_male` / `human_duo_mixed`, family `human_duo`, speakers
  speakers "Girl"/"Boy" on the mixed duo and "Friend"/"Host" on the same-gender ones — role labels
  that are never spoken, now ENFORCED by `validateDialogueClips` `forbiddenNames` against each
  character's `labelSpellings`), **Kids** (`kids_duo_girls` / `kids_duo_boys` / `kids_duo_mixed`,
  family `kids`, 2026-10-01: photoreal children with child voices, kid attire options and labels,
  family-safe negatives; **dressed for the ad since 2026-10-05** — the owner: "the girl and boy always get the
  same type of dress". Their code outfit (`utils/castSheet.dressKids`, used when the stylist below gives
  none) follows the theme the video's motive / setting, the core message's "what they do" or the business
  name mentions FIRST, else the typed BUSINESS CONTENT, else the extracted details (`kidsThemeOf`,
  `themeTextOf` — never an address or contact line, never the palette): a school → its uniform in its
  colours, sports → jersey or track kit, birthday / cake / toys → party wear, a festival, temple, jeweller,
  silk house or sweets → silk pattu langa / lehenga / anarkali and kurta / dhoti WHATEVER the attire, kids'
  wear → trendy, a clinic → soft cotton, tech → hoodie, villas / travel → outing wear, food → cheerful
  casual, else everyday — two or three garments each, picked by the business (same client, same clothes).
  Colours are the palette's wearable colours (`brandColoursIn`; white / black / grey / cream / beige only as
  trims), else the seeded pair; a uniform or kit is one set of colours, otherwise each child their own; two
  children of one kind never wear the same garment (in one uniform their hair tells them apart in the
  video). The Kids' "Smart casual" reads **"Matches the ad"** (`KIDS_ATTIRE_LABELS`); Custom is verbatim;
  "an orange", never "a orange" (`an()`)), deities, cartoon duos/solos, custom);
- `customCharacter` — the Custom Character's description (required for that pack; written into
  the pack by `characterPacks.withCustomCharacter`, one resolver `packFor` in geminiService);
- `locationMode` (`real_provided` uses the client's store photos, `ai_generated`);
- **BUSINESS CONTENT** box (`textInstructions`, the authoritative facts) and **FRAME /
  BACKGROUND INSTRUCTIONS** box (`frameInstructions`, highest priority for backgrounds); when empty,
  the visiting card and other files fill in;
- optional custom script;
- files: logo, **owner image** (`ownerImage`, own slot, required for Real Owner Face; a Real Owner Duo has TWO labelled
  slots — `ownerImage` = Owner 1, `secondOwnerImage` = Owner 2, both required, read through
  `characterPacks.ownerPhotoFile`, in memory only), visiting
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
   **The business's FINAL name comes from its own material (2026-10-22 — the owner: "the sales person adds the
   business name just for reference — it is not the final name … from the user's attached assets we need to take the
   final business name").** The brief writes the sale's name as a reference (`utils/businessName.saleNameLine`:
   "Business name from the sale (a reference only — the name printed on the logo, visiting card, flyer or shop board
   is the real one): X"; `saleBusinessNameIn` also reads the old "Business name: X" line). The extraction is told
   where the name comes from (`EXTRACTION_SYSTEM_PROMPT` "THE BUSINESS NAME — WHERE IT COMES FROM": the logo's
   wordmark, the card, a flyer, the shop's name board in a store photo, letter for letter; the sale's name only when
   no file shows one) and may now read the logo's NAME (still never its colours or graphics); it answers
   `businessName` + `businessNameSource` first. `businessContentPart` no longer calls the sale's name authoritative,
   and the logo / card / store-photo parts ask for the printed name. **Code decides** in `verifyExtraction`
   (`finalBusinessName`): the extracted name when its source is a file of that kind that WAS attached (logo, card,
   flyer, store photo, voice note), the extracted name when the reply gave no source but material was attached, else
   the sale's reference, else whatever was found — and `withFinalBusinessName` writes that one name FIRST into the
   profile (top-level `businessName`, every nested "Business Name" replaced, the reply's `businessNameSource` dropped;
   `nameSource` and `saleReference` kept), so the script, the wish line, the label, the poster, the name board, the
   cast seed and the stylist all read it. The core message gets "THE BUSINESS'S NAME (final …)", never the sale line
   (`withoutSaleNameLine`), and its `businessName` is forced to the profile's; the poster analysis's brief drops the
   sale line too. The member's own studio name (`logoNameText`, No logo) still wins for the name board / wordmark.
   **One contact list (2026-10-13 — the owner: "fake, missing or duplicate numbers" on posters and footers).** A
   TYPED number counts only when it is shaped like a phone number (a mobile, a landline with its STD code, toll-free,
   abroad with "+") or labelled as one ("Ph. No. 27654321", "Contact:" on the line above) — never when the words right
   before it make it something else (`OTHER_LABEL`: account / A/c, IFSC, GST, PAN, Aadhaar, registration, licence,
   order / invoice / bill / ref / txn / id, door / plot / pin, Rs / ₹ / price / amount…: "Order ID 4521789632" was
   printed as a phone number), and never when glued to "@" (an email or UPI id); a number the member gave as
   something else is refused from the model's profile too. The label nearest a number is the one that describes it
   (`labelZone`: since the number before, its own line or a "Label:" line above; "(WhatsApp)" right after a number is
   that number's) — "WhatsApp: X, Call: Y" used to mark Y WhatsApp, and "Call: X, WhatsApp: X" lost it (a number
   written twice is one number, WhatsApp if either copy says so). The member's spelling is kept ("(+91) 98480 12345"
   came out "+91) …"; a split run turned "0884-2345678" into "0884 2345678"). The list is cut to
   `MAX_CONTACT_NUMBERS` = 3 inside `verifyBusinessFacts` (a fourth is reported in `rejected`) and
   **`contactNumbersOf(profile)` is the one list** the label, both posters, the overlays, the frames and every refine
   print. `contactNumberProblems(text, list)` is the check (every number of the list exactly once, no other number).
   The voice note writes a spoken phone number in digits, only the digits said (`prompts/voiceNote`).
   `stripUnverifiedNumbers` now marks each removed number (a private-use character, `GONE`) and takes its surroundings
   with it: a sentence that was only about removed numbers goes whole ("Call X or Y, WhatsApp Z." — the poster showed
   "Call or." after the scrub, found by the browser check), the "or" / "," / "/" / "·" joining a removed number to a kept
   one or ending a sentence goes, and a text left with only a label ("Call", "📞 WhatsApp:") becomes "" (an overlay
   that was only an unverified number is dropped). Pincodes, prices and years are never touched.
2. Decide the core message (`prompts/coreMessage.ts`).
3. Write the voice-over (`VOICEOVER_SYSTEM_PROMPT`, language-aware). **THE WORD CONTRACT (owner, 2026-10-15 —
   "EVERY GENERATED CLIP MUST CONTAIN 17–20 SPOKEN WORDS, WITH A HARD MAXIMUM OF 20"):** `utils/scriptContract` is the
   only place a band is defined or a word counted — `MIN/MAX_WORDS_PER_CLIP` 17 / 20, `PREFERRED_WORDS_PER_CLIP` 18–19,
   `TARGET_WORDS_PER_CLIP` 18.5 (estimates), a two-person clip's two lines TOGETHER (`MIN/MAX_WORDS_PER_LINE` 7 / 12 each,
   8–10 preferred), the same for one presenter, the Real Owner Face / Duo, the human duos, the Kids, cartoon solos and
   duos, deities and the Custom Character, for commercial and festival ads, in every language (`wordBudgetFor` returns
   the same clip band for every cast; `validateDialogueClips` ignores a caller's clip band and `finalClipSlack` moves only
   the line split). The old bands are gone: 18–20 (one voice), 15–17 (a pair, 2026-09-22) and the unused 13–15 (Kids);
   `dialogueFormat` re-exports the contract. **One counter** (`spokenWordsOf` / `countSpokenWords`): punctuation, symbols,
   emoji, dashes, ellipses and the danda never make a word, an apostrophe inside a word keeps it one ("don't"), "&" is the
   spoken "and", Telugu vowel signs / virama / ZWNJ stay inside their word, labels and clip headers are stripped
   (`spokenTextOf`). geminiService's own tokenizer (it counted "—" as a word) and the dialogue counter (it split "don't")
   are gone. **What is counted is what ships:** every line is made speakable (`speakableLine`: "₹999" = five spoken words)
   BEFORE it is checked (`normalizeVoiceOverSegments(…, language)`, the cast's `DialogueTools.finish`) — it used to run
   after the checks and change the count. **One prompt block** (`prompts/wordContract.wordContractBlock`): the writer, the
   whole-script repair, the native-speaker review, the refine / clip editor and the character writer and repair all state
   the budget in the same words, the closing sentence counted in code (the Telugu call line `TELUGU_SCREEN_CTA` is 9 words,
   so the rest of the final clip has 8–11, the address among them), a per-cast register note (children, deity, cartoon) and
   "never pad, never cut a sentence in half". The worked examples in `prompts/characterAd` print counts COMPUTED by the
   counter (three solo lines labelled "(18 words)" were 14–16 words, every duo clip 15–17). The six deity catalogue entries
   that set their own sentence length ("six to nine spoken words" …) no longer do (TS + JSON). **Repairs:** a failing clip
   is repaired clip by clip (`repairClipsByEdit`, shared with the Script Duration Checker) with the exact direction
   (`voiceOverRefine.repairDirection`: "It has 23 spoken words — 3 words over the 20-word ceiling. REMOVE at least 3 words
   (removing 4 to 5 lands it at the preferred 18–19) …"; a cast: "Its two lines together have …") and its words numbered by
   the counter; a whole-script repair runs only for a problem no clip owns (a lost clip, a name said twice) and — like every
   repair — is kept only when `isBetterRepair` (never further from 17–20 words, THEN fewer problems; "fewer problems" alone
   used to keep a language fix that pushed a clip to 22). The cast's checks and spelling passes are built once per run
   (`dialogueTools`; the town's spelling used to be asked again on every draft). Other checks include
   everyday speech, festival wish, and `utils/speakingPosition` (a line that sends the viewer
   "elsewhere" while the speaker stands inside the business). **Address (2026-10-01):** when the
   verified facts carry an address, the LAST clip says it in spoken form
   (`utils/spokenAddress.spokenAddressOf`: landmark + area / town, never a door number or pincode — since
   2026-10-22 each part also goes through `withoutUnspokenNumbers`, so "5-87/1 Main Road" and "Kakinada-533 001"
   / "Pin: 533 001" lose their numbers too,
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
   **The cast is the configuration's, end to end (2026-10-08 — the owner: a Male & Female Duo's frames showed both
   people while the voice-over and the Veo prompts were for ONE speaker, intermittently).** Four causes, all fixed at
   the root: (1) the reader (`dialogueFormat.readDialogueScript`, `parseDialogueClips` is its wrapper) used to fold a
   turn whose label it did not know (`0-8|Man:`, `[అబ్బాయి]:`, the man's line on the woman's line) INTO the previous
   speaker's line — now a canonical `range|label:` line or a bracketed `[Label]:` is always a turn of its own, turns
   inside one physical line are cut out, a label is matched against `Speaker.aliases` (`packSpeakers` adds the role
   label's `labelSpellings`, the spoken `nativeNames`, and woman/lady/female · man/gentleman/male for the two mixed
   entries), an unknown label goes to the first speaker not yet in that clip (`unknownLabels` / `unattributed` say so),
   a range that is not one clip long stays in the clip being written (a live reply wrote `24-24|boy:` for clip 3),
   and a header with words after it (`clip-1[0-8sec]: …`, `Scene 1:`, `[8-16sec]: …`) is read — a one-character script
   in plain clip lines used to come back EMPTY. Only an UNBRACKETED unknown label ("Offer: …") still continues the line
   above. (2) **`castIntegrityIssues`** names what may never ship — a clip without one of the cast's lines, an empty
   line, a line from somebody the ad does not have, the wrong clip count; the quality gate never judges such a draft,
   always prefers one without (`scriptQa.isBetterDraft` ranks `broken` FIRST — a collapsed duo draft used to win by
   scoring higher), writes new drafts for it even when the judge passes or cannot run (`castFeedback` tells them what
   went wrong), and **a run whose script still breaks the cast STOPS** with "came back without every speaker's own
   lines … Press Generate" before any frame is made (it used to ship with a console warning). (3) **Everything after
   the run reads the kit's own configuration** (`utils/adSpec`, see Save / storage and Editing / refine). (4) Custom
   scripts: one strict reader for Configuration and Input Final Script (`castScriptProblems`: a label nobody in the ad
   has, a line with no speaker in a two-person ad, or one of the two never speaking is refused with the format to use —
   the Configuration check now runs BEFORE any Gemini call; one clip given to one of the two stays allowed), and a
   dialogue pasted into a one-presenter ad is refused (`dialogueLabelsIn`). The writer, its repairs and the refine
   share one name rule (`dialogueNameRules`: role labels never spoken, a named character once — a solo one "at most
   once", `CharacterNameTokens.optional`), and the repair prompt states the real cast (it told human pairs to SAY
   "Girl"/"Boy", called every entry a cartoon and asked solos for two lines); the unused pack refine prompt was removed.
   **Quality gate — generate → validate → repair → judge → improve → judge again (every generated script, single voice
   or a cast; never a member's own; rebuilt 2026-10-15).** A separate judge (`prompts/scriptQa.ts`) never rewrites: it
   scores EIGHT rubric dimensions with written anchors (10 = nothing would make it better; a problem listed against a
   dimension means it is not a 10; "award a 10 when it is true and only then") — facts, language, persuasion, clarity,
   relevance, speakability & timing, **cast** (the right people, in their own voice, a real exchange, the category's tone)
   and **originality & flow** — and ties each problem to its clip, dimension and fix. It is told the cast's identity
   (`characterAd.castNoteFor`: the entry, its family, each speaker's role, its script style), the word counts CODE measured
   (it no longer counts), the fixed closing sentence, and the verified address (it was never passed, so a correct last
   clip was marked as inventing one). A reply that is not JSON or misses a score is asked once more, then counts as no
   report (never a 10). In code (`utils/scriptQa`): the overall is computed from the dimensions (the judge sends none); the
   judge's own problems cap their dimension at 9 and an unsupported claim facts at 4; code's mechanical findings on the
   exact text cap theirs (`withMechanicalChecks` / `mechanicalCaps`: a clip outside 17–20 → speakability ≤ 5, a lost
   speaker or role label said → cast ≤ 5, Latin letters / digits → language ≤ 6, a hard word → language ≤ 8, a call to
   action leaked or missing → persuasion ≤ 8, the address → clarity ≤ 7, a duplicate → originality ≤ 5 …); **10/10
   (`isPerfect`) only when every dimension is 10, no claim is unsupported, no problem is listed and code found nothing.**
   The loop (`runQualityLoop` in `generateAdAssets`, steps decided by the pure `nextImprovement`) improves the BEST
   draft: a broken cast or a script weak at its core (`QA_REWRITE_BELOW`, cast < 5 included) is written again — two drafts
   side by side on the first round — with what failed (cast, word budget, the judge's report); anything else is POLISHED —
   the clips the problems name are edited one by one (`repairFailingClips` / `repairDialogueClips` with the judge's
   "Clip N: …" findings), a problem about the whole script goes to the native-speaker editor (single voice) or a new
   draft (a cast). Every candidate is checked and judged again and replaces the best only when `isBetterDraft`: the cast
   first, then the word contract (fewer violations, then nearer the band — a polished draft with a 23-word clip used to
   beat a valid one on score), then judged at all, no invented facts, the computed score, fewer mechanical problems. An
   edit that changed nothing is not judged. It stops at a genuine 10/10 (`perfect`), at a **READY** draft (`ready`,
   2026-10-16 — `isReady`: cast kept, every clip 17–20, no unsupported claim, nothing mechanical, overall ≥
   `SCRIPT_READY_SCORE` 9 and every dimension ≥ `SCRIPT_READY_DIMENSION` 8.5; listed problems do not block it), after
   `SCRIPT_IMPROVEMENT_PASSES` = 3 (`passes`), after `SCRIPT_IMPROVEMENT_STALLS` = 1 round with nothing better
   (`stalled`), at `SCRIPT_GATE_DEADLINE_MS` = 45 s (`deadline`), or when the judge cannot run and code finds nothing to fix
   (`unscored` — the native-speaker review then still polishes it, kept only inside the contract). When even the best draft
   breaks the contract, ONE contract-only fit is tried, judged like any draft. **THE FINAL ACCEPTANCE GATE:** after every
   rewrite, repair, review, speakable pass and formatting step, the EXACT shipped text is counted again
   (`contractViolations`: a clip outside 17–20, empty or repeated, or the wrong clip count) and a generated script that
   fails STOPS the run before any frame — "The voice-over could not be fitted to 17–20 spoken words in every clip … Press
   Generate" (like the cast guardrail); a member's own script is never held to it. The kit's `scriptQa` carries the real
   score, `passed` (= a genuine 10/10 since 2026-10-15; ≥ 8 before), the eight scores, `drafts`, `passes`, `stopReason`,
   `clipWords` (spoken words per clip) and `checkedScript` (the exact text judged and shipped); `unscored` when no judge
   could score it. Row 4 shows "Quality check 10/10" / "best draft" / "not scored", the passes, the eight scores, and a
   **Words per clip** row counted live from the script as it stands (green 17–20, amber outside); when the script was
   changed after the check (a refine, a final script) it says so ("these scores are for the generated version").
   **Said in eight seconds — syllables (2026-10-22, night, from the live Flow check: 18 words / 54 syllables said in
   7.86 s, 19 words / 58 syllables cut at 8 s).** `utils/scriptContract.spokenSyllables` counts Telugu aksharas (a
   consonant joined by a virama is not its own; Latin words by vowel groups) on the same words as the counter;
   `measuresSyllables` = Telugu only. `MAX_SYLLABLES_PER_CLIP` 50 / `MAX_SYLLABLES_PER_PAIR_CLIP` 47 (both lines
   together) is the aim: `clipSyllableIssue` ("Clip N is too long to say in 8 seconds: S syllables, at most M fit. Keep
   17–20 words, but … shorter everyday words …" — never "has N", which the word-count repair parses) is raised by the
   single-voice validator and both cast checks (writer and refine, `clipSyllableIssues`), repaired clip by clip like any
   clip issue, caps the judge's speakability at 6 (`MECHANICAL_CAPS`), and counts against a refine's edited clips
   (`editProblems`). `SYLLABLE_CEILING_PER_CLIP` 54 / `_PAIR_CLIP` 51 is in the FINAL GATE: `contractViolations(…,
   language)` (the run passes `contractLanguage`) — a Telugu clip over it stops the run like a word-count violation.
   `wordContractBlock({ language })` tells every Telugu writer, repair, review, refine and character prompt the aim
   ("a long compound … costs as much as three short words"). **The judge knows the final clip's room** (`prompts/scriptQa`
   `finalClipRoomRule`: the closing line + address words, the rest ≤ 20 − them; in a ≤ 2-clip wishes ad no clip has room
   for a list of offers) — run 5 shipped at 7.9 after three passes spent asking clip 2 for 12 more words of offers.
   **The message clip that is also the final clip** (a 2-clip festival ad, a 1-clip ad) gets the SHORT core-message test
   (`prompts/coreMessage.finalMessageClipTest`, `coreMessageBlock(brief, messageClip, clipCount)` from the writer, repair,
   review, refine, judge and character prompts): the name and what it offers in one short phrase — no promise, proof or
   offer — because the full who / what / why test there made two of six live Diwali runs stop on a 22-word final clip.
   **The name in the script's letters** (`utils/businessName.withNativeName`, geminiService `nativeNamePromise`, one
   `fast` call beside the address one): a final name in English letters ("SRI SAI KRISHNA INFRA", from the logo) is
   written once in the script's letters, told to every writer / repair / review (with the address rule: "SAY THE BUSINESS
   NAME AS …") and swapped in code on every generated line (single voice `spoken`, a cast's `finish`) — a live promo run
   shipped the capitals inside the Telugu line. A member's own script is never changed. **No five words twice**
   (`utils/scriptContract.repeatedPhraseIssues`, `REPEATED_PHRASE_WORDS` 5): a later clip that repeats five words in a row
   of an earlier one is a clip issue (repaired; caps originality at 6) — the name, the town and the closing line may come
   back; generated scripts only. **A loose case ending** ("కాకినాడ లో", "flats లో") is joined to its word in every Telugu
   line (`spokenNumbers.withJoinedEndings`, last step of `speakableLine`; నుండి / నుంచి stay apart). The address call
   writes English address words as said ("మెయిన్ రోడ్", never "ప్రధాన రహదారి"); an **English** ad says an all-capitals name
   in title case (`sayName`, "SAY THE BUSINESS NAME AS: Sri Sai Krishna Infra").
   **English words in English letters, and no formal words (2026-10-22 — the owner: "ఫ్లాట్స్ — flats, ఫ్లాట్ — flat,
   స్లాట్స్ — slots … write this English words"; "don't add complex words like ఏర్పాట్లు — add Arrangements"; scope "your
   words + similar ones").** `utils/englishWords.ENGLISH_WORDS`: flat(s), slot(s), plot(s), villa(s), apartment(s),
   booking(s), arrangement(s) (+ "arrange చేశాం" for ఏర్పాటు చేశాం) and facilities (for సౌకర్యాలు / సదుపాయాలు / వసతులు — only
   the plurals: సౌకర్యం alone means comfort). A Telugu script writes them in English letters INSIDE the Telugu line, like
   `mariyu`, a case ending kept joined ("flatsలో", "arrangementsతో" — the word count never changes). Asked in the prompts
   (`englishWordsRule` through `prompts/everydaySpeech`; it starts "ONLY these words are written in ENGLISH letters" and
   names what STAYS in Telugu letters — ఓపెన్, బ్యాంక్ లోన్, పార్కింగ్, సెక్యూరిటీ, ఆఫర్, షాప్, టూ బీహెచ్‌కే (never 2BHK) —
   because live run 1 took the list as licence for every English word: 2BHK, open, bank loan came back in Latin, the
   validator refused each and the run stopped on the contract) and every exception to "no Latin letters"
   (`latinLettersException`: "except mariyu and ONLY these English words … every other English word stays in Telugu
   letters" — `prompts.ts`, `prompts/refine`, `prompts/characterAd`, `prompts/scriptQa`); corrected in code on every
   final line (`withEnglishWords`, run by `speakableLine`), and skipped by the validator and the judge like `mariyu`
   (`withoutFixedWords`). **The words that stay in Telugu letters are enforced in code too** (`withTeluguLetters`, one
   list `TELUGU_LETTER_WORDS` that also writes the prompt's list): open, bank, loan(s), parking, car, security, offer(s),
   free, service(s), shop and BHK written in Latin go back to Telugu letters, "2BHK" / "3 BHK" → "టూ / త్రీ బీహెచ్‌కే", a
   glued "రెండుBHK" gets its space, a Telugu ending stays joined — run by `speakableLine` BEFORE numbers become words
   (live full run 2 shipped "రెండుBHK, మూడుBHK … open plots" at 7/10 with the prompt rule alone). Telugu only. `prompts/everydaySpeech` also gained 13 formal words with what people say
   (అత్యాధునిక → లేటెస్ట్, సరసమైన → తక్కువ, విశాలమైన → పెద్ద, సౌకర్యవంతమైన, ఆహ్లాదకరమైన, పరిష్కారం → సొల్యూషన్, సౌలభ్యం → ఈజీ,
   సమగ్ర → పూర్తి, నైపుణ్యం → అనుభవం, కల్పిస్తున్నాం → ఇస్తున్నాం, సమీపంలో → దగ్గర్లో …).
4. For real locations: review the client's photos and assign them to clips round-robin (a photo is
   reused, never replaced by an invented zone); each is the clip's **background plate**
   (`utils/locationAssignment.backgroundPlateRule` / `withBackgroundPlate`, `prompts/realLocation`):
   kept exactly as photographed, only enhanced to 8K, the cast placed into it, and attached to the
   frame writer's call — in a festival ad the festival's decorations are ADDED onto its real walls, counters and floor,
   nothing removed or moved (the plate rule's festival option, 2026-10-22). Otherwise the **scene
   plan** (`prompts/scenePlan.ts`, `utils/scenePlan.ts`): the video's motive (annadanam, temple,
   birthday, invitation, promotion…), its world, and one DIFFERENT background per clip from that
   clip's line; retried once if `repeatedBackgrounds` finds a repeat.
5. Main-frame prompts per clip (`MAIN_FRAME_SYSTEM_PROMPT` / `MULTI_FRAME_SYSTEM_PROMPT` with the
   scene plan; `CHARACTER_MULTI_FRAME_SYSTEM_PROMPT` with `sceneBackgrounds` / `nameBoard`). Stamped
   in code: motion composition, `withSceneBackground`, `frameBrand.nameBoardInPlaceOfLogo` when there
   is no logo file, `withOwnerImageDirective` for Real Owner Face, the photo attach line. **Real Owner Face
   keeps the client's face as photographed (2026-10-08 — the owner: the frames "were adding a bindi to the face",
   "check male and female both"):** every frame's BODY carries `FACE LOCK:` (`frameBrand.withOwnerFaceLock`,
   by gender — the same face, features, skin tone, hairline, hair (beard) and forehead as the photograph: a bare
   forehead stays bare, a mark the photograph shows stays; nothing added — no bindi, tilak, kumkum, sindoor,
   vibhuti, nose ring, face jewellery, make-up or new beard; only the clothes follow the outfit), because the
   📎 attach line is stripped by Copy and the system prompt's rules never reach the image tool; a main-frame
   refine re-stamps it. The writer's identity block says the same (`characterCastBlock`), the male entry's
   negatives now name the forehead mark (catalogue TS + JSON), and the owner's WARDROBE line is
   `ownerWardrobeDirective` — the ordered outfit without "tasteful traditional jewellery", "the clothes only: her
   face, forehead, hair and any jewellery stay exactly as in the owner's photograph". The attire is read as the
   form shows it (`resolveModelSpec` in `packWardrobe`; the studio's pack picker now sets the entry's gender and a
   suitable attire too — "Real Owner Face (Male)" kept the default Traditional, so the picker showed Professional
   while the frames dressed him in a kurta). And a **cast sheet** for invented
   people (`utils/castSheet`: Normal Ad, human duos, Kids — one fixed face and outfit per person,
   faces seeded by the business name; the Veo prompt names each speaker by how they look, "the woman in the
   deep teal saree"). **The outfits come from the wardrobe stylist (2026-10-05)**: `styleCastWardrobe` — one
   `fast` call at temperature 0 that SEES the logo (unless "No logo"), started right after the core message
   so it answers while the script is written, awaited before `castSheetFor` (20 s cap) — given each person's
   ORDERED style (`utils/castWardrobe.styleRuleFor`: Traditional → a saree / Indian ethnic wear, Professional →
   formal suit or blazer, In-shirt & Pant → shirt and trousers, a child's ethnic wear or "Matches the ad"),
   the business and core message, the brand palette, the festival's look, BUSINESS CONTENT, the FRAME
   instructions and the voice note's requests (`prompts/castWardrobe.ts`). It chooses garment, weave,
   colours (from the logo) and accents; `checkStyledCast` accepts it only whole: inside the ordered style, a
   plain colour and garment the outfit names, no writing / logo / profession's uniform / bridal / revealing
   clothes, no saree / suit / heels / make-up on a child, the two never one name and two adults never one
   main colour. A rejected answer goes back once with its problems; then the sheet's own outfits are used
   (`castSheetFor` without `styled`: the Kids via `dressKids` — theme + brand colours, see the Kids entry —
   and grown-ups in the ordered attire in the brand palette's first two wearable colours, else the seeded
   pair). Custom is never styled. The frame writer's WARDROBE line repeats the sheet word for word
   (`castWardrobeLine`; a refine keeps the ordered `wardrobeDirective`). Also stamped: a pack's
   **scale anchor** (`withScaleAnchor`: e.g. Motu and Patlu's height against a real counter). VIDEO
   BOTTOM LABEL (`buildVideoBottomLabel`, code-assembled from `prompts/lowerThird.ts`, fed the festival
   theme and the video's motive / core message) and the poster prompt (`writeVideoPosterPrompt` — since 2026-10-12 the
   same ONE-ad-type system as Poster Creation, below: the festival's name as the campaign purpose, always 9:16 vertical,
   English, the logo or the name as the wordmark) — both from the VERIFIED facts: exactly as many contact pills / numbers
   as the business has (1–3), no address strip or line when there is none, and `stripUnverifiedNumbers` on every
   model-written overlay, frame (2026-10-13: signage) and refine (the poster's numbers are put in by code). **The label's
   WhatsApp number is ONE of its N pills** (green, WhatsApp icon in place of the phone icon — `whatsappSentence`); until
   2026-10-13 it asked for "a WhatsApp pill of its own … beside the call pill(s)" under "EXACTLY 1 NUMBER", so the image
   tool drew the number twice. Its contact lines come from `prompts/lowerThird.labelContactLines` (each number once, then
   "EXACTLY N NUMBERS — … each number written once") and its final check asks for exactly N pills and no other number
   (or no number at all). A label REFINE is re-stamped from the list (`withLabelContacts`: a repeated, invented, dropped
   or renumbered CONTACT line is replaced, and a saved label's old WhatsApp sentence is updated). The poster cannot fail on the model
   any more (its fallback is code); a Missing row and its Generate stay for an unexpected error. Frames the model skipped are written
   for exactly those clips (never a copy of the last frame), and the retry carries the images.
   **The festival's theme on every frame, the label and the poster (2026-10-22 — the owner: "for the festival videos the
   bottom label, frame background and the poster are not getting the related festival theme").** Before, the decorations
   reached one frame variant (the single model's first frame): the scene planner had only the festival's name, a pack got
   one line, a client photo was told to change nothing, and the label and poster read a short theme. Now ONE look per
   festival, built from the catalogue (`prompts.festivalThemeFor` / `festivalLook` → `FestivalLook {name, known, decorations
   (the bold items of environmentDecorations, unread before), colours, symbols, floor, light, mood}`, `festivalLookLine`;
   new themes Janmashtami, Sri Rama Navami, Karthika Pournami, Akshaya Tritiya; Bakrid reads Eid's; an occasion with no
   look of its own is named with its own traditions (`FestivalTheme.generic`) — never another festival's mango leaves and
   brass lamps; the fixed Sankranthi example in the frame prompt is gone; "no decorative wall content" allows the
   festival's). **Frames:** every finished frame is stamped in code `FESTIVAL DRESSING — <FESTIVAL>`
   (`utils/festivalDressing.withFestivalDressing`, after the name board, before the 📎 line; idempotent): the decorations,
   floor, light and colours, the greeting clip the most festive, the business recognisable in the others, a plate's
   decorations added and nothing moved. The scene plan and the pack prompt get `festivalLook` too, and the attire rules
   follow the festival only in a festival ad. **Label:** `prompts/lowerThird` leads with a FESTIVAL THEME section (its
   accents and mood from `labelDesignInputs`) and FINAL CHECK 8 asks for it. **Poster:** a festival poster carries one
   "Festival:" line right after the owner's three sentences (`utils/posterAdType.posterFestivalLine`: the festival's own
   look worked into the one concept, its usual greeting allowed as the headline; `conceptPosterPrompt`, `PROMPT_SHAPE`,
   `readConceptPosterPrompt`, `posterPromptProblems` know it; a refine keeps it; geminiService `posterFestivalFor`). The
   three sentences never change.
6. Direct each clip's action and camera (`prompts/motion.ts`) → **Veo 3 prompts**. **Motion policy
   (2026-10-22, history 8 in `motion.ts` — the owner: "the video output is getting the characters unwanted, irrelevant
   movements and turning or rotating"; the owner chose "move only when the words need it", for EVERY cast): every clip
   is still a filmed shot — ONE camera move and a performance, never a frozen portrait — but nothing moves unless the
   line calls for it. The cast faces the camera and acts the line out WHERE THEY STAND, every gesture on the words it
   belongs to (an open palm on the name, the product on the words about it, a hand on the chest on the promise, open
   palms on the invitation, a namaskaram exactly on the festival wish), the hands settling between; they WALK only in a
   clip whose own words take them somewhere; nobody turns round, spins, rotates or turns away; the arc is retired; the
   camera NEVER moves backward** (the owner, 2026-10-05: "no walk-back, never do it" — no walk-back tracking shot, no
   pull-out or dolly out). This replaces the 2026-10-05 dynamic pass (every clip "a physical action that travels or
   turns", most clips walking, the arc), whose walking, "turn and present", "turns to the lens on the key words",
   gestures "toward what they pass" and "natural body movement throughout" were what asked for the unwanted movement.
   The prompt directs MOTION and never describes the frame (the attached frame is the first frame and the
   only picture of the place). History in `motion.ts`: on 2026-10-01 nobody walked (a 1,568-word prompt whose
   "No street / road / door" lines named the forbidden places 15–18 times); the morning of 2026-10-05 gave one
   bounded walk ("two or three steps, then stops") on one middle clip — Veo obeyed and the owner's clips were
   still static: clip 1 and the last clip never walked, drawn pairs never walked, a focus pull / locked frame /
   float was the move, the keep sentence asked for the place "exactly as in the attached frame for the whole
   clip" and a pair "in the same positions", and the frames were posed with clasped hands.
   **The prompt is five short parts** (`assembleVeoPrompt`): `<ratio> video, one continuous 8-second shot
   that starts from the attached frame.` · `<camera + shot>: <action>.` + (a pair) "Both stay in full view through the hand-over — no
   cut, never closer." (one speaker: "Both stay in full view, <name> leading — …"; until 2026-10-23 "The framing drifts a
   little toward whoever is speaking", which Veo played as a hard cut at the hand-over in a Motu & Patlu clip — Patlu
   lost his height — and a slide that cropped the logo in a duo clip; the retry with the new line had no cut, but Motu
   walked a few steps to close the GAP the frame left between them, so every pair frame now starts "both standing close
   together side by side, about an arm's length apart, at the same distance from the camera") + the life line
   (`movementNote`, 2026-10-22: "Calm, purposeful movement: each gesture lands on the words it belongs to, then the
   hands settle; the body stays facing the camera, with eye contact on the key words — clothes and hair move naturally
   (with every step, on a walk); anyone already in the background stays in place with only small, natural movements"; a
   pair "both keep facing the camera"; a cartoon: its signature gestures, each on its words; a deity: slow, majestic
   blessings) + on a line that wishes, the namaskaram cue (`wishCue`, below) · the voice (`With a very sweet, warm, confident female voice, she says in
   Telugu:` + the line in quotes; a pair: `0–4s — <name> (on the LEFT of the frame), with <voice>, says in …:`
   per line + "Only the one speaking moves their lips…"; a one-line pair clip: "Only <name> speaks; the other
   keeps the mouth closed and reacts"; a catalogue voice loses its trailing role text, `withVoice`) · ONE keep
   sentence that lets them move (`Keep <identityLock>, and the same place, logo, colours and light as the
   attached frame; she moves within that place, and nothing new is added to it.` on a walking clip; in place (most
   clips since 2026-10-22) "she performs where she stands, facing the camera" (a pair "they perform side by side where
   they stand", a named single performer "Ganesha performs in place, facing the camera") — `VEO_FRAME_LOCK` "as the
   attached frame"; a client photo: "this real place exactly as the attached frame shows it — the same layout,
   fixtures, products, signage, logo, colours and light"; a pair adds its sides, "— Motu on the left and Patlu
   on the right —" (`packVeoSubject.sides`), and `Heights never change: <scaleAnchor>`) · `Negative prompt: No
   text or subtitles on screen, no background music or echo, no cuts, no camera shake, no frozen or static
   pose, no change of location or background, no unnatural movement, no turning around or rotating, no turning away
   from the camera, no random or repeated gestures, no morphing, no extra people, no goodbye wave` (the four after
   "unnatural movement" since 2026-10-22, "no morphing" for every cast; + "no narrator or new voices" for drawn
   characters, "no two voices at once" for a pair, "no foreign accent" for English; a clip performed in place says "no
   frozen pose"). About 204–252 words for one presenter in the unit pipeline and 248–261 in the live run of 2026-10-22
   (a Telugu festival greeting clip with its namaskaram cue is the longest); ~372–387 for Motu & Patlu (unit
   pipeline). It never re-describes the frame, never names a place
   or object it must not show, and never lists forbidden camera moves. `identityLock` is a short phrase ("her
   exact face, hair, outfit and height"; `modelVeoSubject`, `packVeoSubject`).
   **Actions** (`STAGINGS`, each a BEAT with a walking form, an in-place form for one performer (`inPlace`, 2026-10-22)
   and for a pair (`pairInPlace`), a deity template, a frame `start` / `pairStart` and `walks`): `walk_toward` (Walk toward
   the camera — in place: Speak to the camera), `walk_across` (Walk along the display — in place: Present the display),
   `approach_show` (Approach and show — in place: Show it where they stand), `walk_stop_present` (Walk, stop and explain —
   the promise, hand on the chest; in place: Explain to the camera / Explain where they stand), `turn_present` (now
   "Present where they stand", `walks: false`; the body no longer turns — a saved plan's key still reads), `walk_invite`
   (Walk in and invite — the last clip; in place: Invite where they stand; **never a goodbye wave**). Role actions
   (`ROLE_ACTION`): the festival greeting ("Greet the viewer": facing the camera with a festive smile, the hands relaxed
   until the wish — never a walk) and the one-clip ad. A deity performs each of its actions in place under a blessing
   name (`deityName`: Bless the place / Bless what it offers / Bless and welcome), so no 🎬 note asks it to walk.
   **The namaskaram on the wish words (2026-10-22 — the owner: "when she is saying the wishes, the cast need to do the
   namaskaram … exactly when she is saying").** It used to open the greeting clip, five seconds before a Telugu greeting
   reaches its శుభాకాంక్షలు. Now `wishCue` (`utils/wishGesture.wishMoment`: the wish words — శుభాకాంక్షలు, "wishes", "Happy
   Diwali", शुभकामनाएं … — and the two words before them, placed on the speaker's window by their position among the
   spoken words, `speakingWindow`: [0, 8] or a pair speaker's half) writes "Exactly as she says the festival wish (about
   6–8s), she joins both palms together at the chest in a namaskaram with a slight, respectful bow of the head and holds
   it through those words, then lowers her hands with a warm smile — the hands stay relaxed until then." A pair joins
   palms together on the line of whoever says the wish; a deity raises the blessing palm instead; the greeting clip
   always gets it (untimed when no wish words are found), any other clip only when its line wishes. The greeting's frame
   is facing the camera with the hands relaxed and NOT yet joined (`WISH_START`). The director may never write a
   namaste, folded hands or a bow itself (`NAMASTE`, refused by `actionUsable`). The real-person templates carry it too:
   "with appropriate gestures — and exactly as she says the wishes (about …), a namaskaram: both palms joined at the
   chest with a slight bow" (`assembleRealPersonVeoPrompt`), and for two owners "Exactly as <the man on the LEFT> says
   the wishes, both join their palms at the chest in a namaskaram with a slight bow."
   A plan saved before this pass is read with today's keys (`stagingKeyOf`: stand_present → walk_stop_present,
   show_product → approach_show, present_space → walk_across, walk_and_talk → walk_toward, welcome_invite →
   walk_invite; the retired cameras are dropped).
   **Camera** (`CAMERA_MOVES`; the sentence is written in code by `cameraShot` — the director never writes
   the camera): `push_in` (Push In — "as she comes closer, ending in a medium shot / medium close-up", or "to a
   close-up of the product, the focus settling on her face"), `side_track` (Side Tracking Shot — travels
   sideways WITH a walk, the background sliding past with parallax; only on a walk), `lateral_dolly` (Lateral
   Dolly — glides a short way sideways at one distance, the cast seen from ONE angle the whole clip), `static_locked`
   (Still Camera — ONLY in a client's photo: while the cast walks, or a pair standing in it). Retired: the walk-back
   `tracking`, `rack_focus`, the `handheld` float and, 2026-10-22, the `arc` (curving round the presenter reads as the
   PERSON rotating; kept only so a saved plan reads, no table offers it). In place (`IN_PLACE_CAMERAS`): one presenter
   or a deity a slow push-in or the short glide; a pair only the glide; in a client's photo a push-in for one performer,
   a still camera for a pair. Never: walk-back, pull-out / dolly
   out, crane, pedestal, orbit, pan, tilt, reveal, POV, over-the-shoulder, follow-from-behind. `SHOT_ANGLES`:
   eye level, slightly low, slightly high for one presenter; a pair always eye level, two children "at the
   children's eye level" (`packVeoSubject.eyeLevel`).
   **Who may do what** (`castKindOf`; the tables `CAMERAS` / `PHOTO_CAMERAS` — an action a cast may not do has
   no camera there): one presenter or one cartoon — every action; push-in, side track (on a walk), lateral dolly. A
   human pair, Kids and every drawn pair — walk (when their words need it) only TOGETHER, side by side, along or across
   the floor, NEVER toward the camera (no `walk_toward`), filmed only sideways at one distance (`PAIR_MOVES`: side
   track, lateral dolly) so neither one grows. A deity never walks (push-in, lateral dolly). A client's photo (a plate) is never shown beyond its edges: a presenter gets a push-in, or a still
   camera while walking; a pair only walks across it on a still camera.
   **Every cast walks only where a clip's words need it (Motu & Patlu since 2026-10-10 — the owner: "in all the clips
   they are walking, because of it the AI sometimes changes their heights and their attire"; EVERY cast since
   2026-10-22, history 8, no cap).** `planClipMotion` decides it for every plan; its `walksWhenNeeded` option and
   `CharacterPack.walksOnlyWhenNeeded` (still on the Motu & Patlu entry) are kept for older callers and no longer change
   anything (geminiService no longer passes it; `@deprecated`). Each clip's BEAT is chosen as before, but it walks only
   when its words take them somewhere: the scene plan's per-clip `walk` judgment where there is a scene plan (it read the
   line and planned the background — `SCENE_PLAN_SYSTEM_PROMPT` asks it for every cast (`WALK_RULE`), offers the
   stagings by their in-place names and stands them "beside what that clip's line is about"), else `lineNeedsWalk`
   (always in the client-photo path): English "let's go / walk / look around",
   "follow me", "come with me", "come this way"; Telugu వెళ్దాం / పోదాం / పదండి / పద (a word of its own) / చలో / నాతో రా /
   చుట్టూ చూద్దాం and "వెళ్లి … -దాం" (వెళ్లి చూద్దాం — never "వెళ్లి చూడండి", said to the viewer); Hindi चलो / चलिए; Tamil
   போலாம்; Kannada ಹೋಗೋಣ; Malayalam പോകാം. An invitation to the VIEWER (ఈరోజే రండి, "come inside our showroom") never walks,
   nor does the festival greeting; there is no "most clips walk" rule. A beat planned in place that needs a walk walks
   along the floor (`walk_across`). Every other clip is the same beat performed where they stand (`Staging.inPlace` for
   one performer, `pairInPlace` for a pair; `ROLE_ACTION` in-place forms for the greeting and the one-clip ad), filmed
   with `IN_PLACE_CAMERAS` (above; a glide PAST a pair turns a drawn body, and it is redrawn). Their frames are composed
   STANDING facing the camera, mid-gesture, beside what the line is about (`inPlace.start` / `pairInPlace.pairStart`;
   the plate stamp "standing on the real floor right beside what the line is about"); every pack's frame prompt says
   each clip is performed IN PLACE (one performer: "performs each clip IN PLACE, standing beside what its line is about,
   facing the camera"; a pair "WHERE they stand, side by side") and walks only in a clip whose 🎬 note walks; the
   director is told "THEY WALK ONLY WHERE THE PLANNED ACTION WALKS" and why (`actionUsable` refuses a walk in a no-steps
   clip). Motu & Patlu's identity lock still names their OUTFITS ("the same designs, outfits, colours, builds and
   heights"); their catalogue lines now have both face the camera together and look to the camera only in the final clip
   (TS + JSON).
   **Choice** (`planClipMotion`, deterministic): clip 1's beat is `walk_toward` (in place: Speak to the camera; a pair
   `walk_across`; a deity `turn_present`); the last clip `walk_invite`; a festival's clip 1 the greeting; in between the
   scene plan's choice where this cast may take it, else the line (`stagingForLine`: product → show; place → present the
   display; trust → explain; a deity → present), else a rotation that never repeats the neighbour; then each clip walks
   only when its words need it (above — the old "at least half the clips walk" step is gone). Each clip's camera is the first of its preference list (the scene plan's first where it fits)
   that differs from the neighbour's — with a backward pass (`open[i]`) so a pair's one-move turn in place never
   forces a repeat. The frame side (`generateAdAssets` → `motionPlan`) and the video side (`writeVeoPrompts`)
   build the SAME plan from the same SPOKEN words — never the speakers' names (a cast-sheet name like "the woman
   in the teal saree" once read as a product) — the same scene-plan choices and the same plate clips (`plates`:
   from `clipPhotoPlan` on the frame side, from each frame's `BACKGROUND PLATE` stamp on the video side;
   `regenerateVeoForClips` too). **The video prompts voice the run's OWN structured dialogue** (2026-10-08,
   `veoClipsFor`) — never its display text read back; a rebuild after the run (`regenerateVeoForClips`, the Input
   Final Script rewrite) reads the stored script through `readKitScript`, which refuses — "This kit is a Male & Female
   Duo ad (Girl and Boy), but its voice-over script does not read as that cast …" — instead of handing a cast's lines
   to one presenter (`modelVeoSubject`), and a one-presenter kit holding a dialogue is refused the same way.
   **A real person — Real Owner Face (`usesClientFace`: `owner_face_male` / `owner_face_female`) — is the
   exception (2026-10-08, the owner: "for all the real person videos we need only this prompt based on gender"):**
   its Veo prompt is ONLY the owner's template, by the entry's gender (`assembleRealPersonVeoPrompt`):
   `With a very sweet voice she needs to say :-` · blank line · the clip's spoken line · blank line ·
   `with appropriate gestures` · blank line · `Negative prompt :-` / `No text on the screen` ("he" for a man). No
   motion plan, no director call, no camera, keep sentence or other negatives (`writeVeoPrompts` returns early, so
   the first run, a per-clip regenerate and the Input Final Script rewrite all give it); `spokenLinesIn` reads its
   line, so a Veo refine still cannot change the words. Its frames get no walking plan and no 🎬 notes: the frame
   writer is told the owner says each line to the camera with natural gestures, and each frame is stamped
   `COMPOSITION FOR THE VIDEO` (`withRealPersonComposition`: standing in place, mid-gesture, never mid-step; a
   client photo keeps its framing).
   **The Real Owner Duo — Real Owner Face for TWO owners (2026-10-14, the owner: Male + Male, Female + Female, Male +
   Female; sales picks the configuration, the tech side uploads the two photos).** Family `owner_duo` (picker group
   "Real Owner Face — Duo", after Human Model; catalogue TS + JSON), `usesClientFace: true`, speakers `owner1` "Owner 1"
   and `owner2` "Owner 2" with `PackCharacter.gender`; role labels, never spoken (`labelSpellings`). **One map, everywhere —
   `characterPacks.ownerPhotoSlots(pack)`:** Owner 1 = owner photo 1 = `FileStore.ownerImage`, stands on the LEFT and
   speaks first; Owner 2 = owner photo 2 = `secondOwnerImage`, on the RIGHT; on Male + Female the MAN is Owner 1 (the
   owner's answer). The slot, the studio check, the frame writer's request, the 📎 line, the face lock, the wardrobe and
   the Veo prompt all read it, so no step can pair one photo with the other side. The configuration (`characterPack`) is
   the only source: sale → order → job → kit `spec`. No cast sheet and no wardrobe stylist (`castSheet.kindsOf` → null);
   no motion plan, no director call. **Studio:** two slots in Assets & Files (`data-test="owner-photo-1"` / `-2`,
   labelled `ownerSlotLabel` — "Owner 1 photo — Man · LEFT", "Owner 2 photo — Woman · RIGHT"), a note under the picker,
   and Start refuses a run missing either photo, naming it ("Owner 2 photo missing … Owner 2 (the woman who stands on the
   RIGHT)"); `generateAdAssets` refuses the same run itself before any call. The AI Guide says attach both photos in
   every tab, in order (`RunFacts.ownerPhotos`). **Script:** the two owners ARE the business — "we", "our shop", "come to
   us", never visitors ("the business's two real owners stand in their own business"; its own worked example
   `ownersWorkedExample`; the repair contract keeps the first person plural). **Frames:** both photos go to the frame
   writer, each with a sentence tying it to one side ("This is OWNER PHOTO 1 — a photograph of Owner 1, the man who stands
   on the LEFT…"); the frame prompt names each owner ONLY by photograph ("the man from owner photo 1") — POSITION LOCK,
   the shot plan's POSITIONS and the continuation line ("the same two owners … and their own photographs") — never by
   the labels the image tool cannot see; they stand in place side by side. Each finished frame is stamped with the
   two-shot composition (`withRealPersonComposition(…, { pair })`), the duo `FACE LOCK` (`frameBrand.withOwnerDuoFaceLock`:
   each side is the person in its own photograph — never blended, swapped or one face — forehead as photographed,
   nothing added) and the 📎 line "ATTACH OWNER PHOTO 1 (the man, LEFT) and OWNER PHOTO 2 (the woman, RIGHT), in that
   order" (`withOwnerImageDirective(prompt, slots)`); a main-frame refine re-stamps both. The entry's scale anchor is
   stamped as on any pair. WARDROBE: `ownerDuoWardrobeDirective` — each owner dressed for themselves by side from one
   attire choice (Male + Female takes the mixed-duo attires), never the same main colour, the clothes only.
   **Video:** the owner's template, for two (`assembleRealPersonDuoVeoPrompt`): "Two people stand side by side: the man
   on the LEFT and the woman on the RIGHT. Both stay in frame, in their places, for the whole clip." (two men / two women:
   "one on the LEFT and one on the RIGHT") · "With a very sweet voice the man on the LEFT needs to say :-" + the line ·
   "Then, with a very sweet voice the woman on the RIGHT needs to say :-" + the line · "with appropriate gestures — only
   the one speaking moves their lips; the other listens and reacts." · "Negative prompt :-" / "No text on the screen, no
   third person, the two never swap places or voices". Each line's side is its SPEAKER's (`packVeoSubject` position), so a
   clip a member's script gives to one owner says "only the woman on the RIGHT speaks; the man on the LEFT keeps his mouth
   closed". `spokenLinesIn` reads both lines, so a Veo refine cannot change them.
   **The studio's attach line knows the owners (2026-10-15, found by the browser check):** `utils/promptAttachments` read
   only "IMAGE #n", so EVERY Real Owner Face frame — the single owner's too — showed "Nothing to attach" and "no photo"
   while its prompt asked for the face(s). `PromptAttachment.ownerPhotos` now carries them (read from the 📎 line
   `frameBrand` writes): `AttachmentBanner` says "📎 Attach both owner photos, in this order — 1. Owner photo 1 — the man,
   LEFT · 2. Owner photo 2 — the woman, RIGHT" (single: "📎 Attach the owner's photo"), under the store photo's banner on
   location; the tab chips show "👤 1·2" / "👤" (and "+👤" beside a store thumbnail); the copy toast and tooltip say
   "then attach owner photo 1, then owner photo 2". A store photo's zone stops at the "  +  " join (it used to swallow
   the owner text).
   **One framing, one jewellery rule (2026-10-22, night — frame 1 of the real ad said both):** the model frame prompt's
   POSE & FRAMING says a three-quarter shot (head to knees, ~70% of the frame height — never a small head-to-feet shot,
   never a tight crop), the same as the attire rules and the push-in's framing (`CAMERA_MOVES.push_in.framing`, was "a
   full or three-quarter shot"; the frame line was "close mid-shot only, head to upper waist", and the Flow clip started
   full-length); the hero-pose line no longer says "For professional suit outputs" in a saree ad. A festival saree frame
   carries "JEWELLERY (SEMI-JEWELLERY)" only — the festival theme's "CELEBRITY-LEVEL … heavy … worth lakhs" line
   (`FestivalTheme.jewellery`, now `@deprecated`, unprinted) sat right above "never heavy". **The only writing in the
   picture (2026-10-23):** every frame, every cast, is stamped `TEXT IN THE IMAGE:` (`frameBrand.withOnlyLogoText`, before
   the 📎 line, re-stamped on a frame refine): the logo (or the name board) is the only new readable writing — charts,
   layout plans, brochures, screens, boards and banners show pictures only, never words, prices or claims; a client
   photo keeps its own writing. A Motu & Patlu frame from ChatGPT had invented "DTCP Approved", "Clear Title", "LUXURY
   VILLAS" — the rule was only in the writer's system prompt, which never reaches the image tool.
   **Frames are composed for the move, caught mid-movement** (`withMotionComposition`, `compositionFor`): a clip
   performed in place (most, since 2026-10-22) is caught standing facing the camera MID-GESTURE beside what its line is
   about; a walking clip's still is caught MID-STEP (one foot forward, arms in a natural swing, clear floor in the
   direction of the walk; a pair both mid-step side by side at one distance); a deity mid-blessing in place; the
   greeting facing the camera, hands relaxed and not yet joined; every note ends "never a stiff, posed stance" — Veo
   continues the pose a frame starts from. The model frame prompt says so ("READY FOR ITS CLIP: follow each clip's 🎬
   note exactly — caught MID-GESTURE … standing facing the camera with a hand mid-gesture toward what the line is about
   (mid-step only where the note walks)", "THE THING TO SHOW IN VIEW"), every pack's frame prompt too (in place, above),
   and the clip-1 hero frame is `prompts.HERO_FRAME_POSE` ("a natural, open welcoming pose facing the camera — the weight
   relaxed, one hand opening in a small welcoming gesture at waist height and the other relaxed at the side …"; until
   2026-10-22 "caught as if about to step forward"), every hero-pose rule (`MAIN_FRAME_SYSTEM_PROMPT`,
   `MULTI_FRAME_SYSTEM_PROMPT`, the attire directives in `geminiService`). A client's photo keeps its own framing.
   **Director** (one `standard` Gemini call per run, `VEO_DIRECTION_SYSTEM_PROMPT`; per clip the PLANNED ACTION
   with where it walks (`walkHint`), the fixed CAMERA and the gesture intent): returns `[{ clip, action }]` —
   the walk path, what they pass and gesture at, specific to the frame (an object named only when the frame
   prompt puts it in view); a pair's two halves, led by whoever speaks (`pairNamesOf`). `resolveDirection` keeps
   it only if `actionUsable`: ≤60 words (a pair 80); no leaving, door / entrance / outside, a tour of the WHOLE
   place or seven+ steps, climbing, a frozen person, running, walking or stepping backward, a cut or slow
   motion, a named camera move or pull-back, a wave, a light change, and since 2026-10-22 a body turn (`TURNS`: turn
   round / away, spin, rotate, pivot, swivel, twirl, sway — a head, face, gaze, palm or hand turning is allowed) or a
   namaste / folded hands / bow (`NAMASTE` — code places the namaskaram); the walk hint a walking pair's last clip gives
   ends "then both stop, facing the camera" (`walkHint`, never "turn to the camera"); a walking clip must walk (a pair:
   "both / together / side by side") and an in-place clip must not; a pair never leans in, rises (a HAND, arm, palm or brow rising is a gesture — since 2026-10-10), jumps, stretches or
   walks toward the camera (`PAIR_TOWARD`). The word lists match a PERSON, not things in the frame (a
   mannequin, a temple statue, a saree's full length, "runs her hand along the silk" are allowed). Quoted
   words are removed, and "the model" becomes she / he — a possessive her / his ("the presenter's hands" → "her hands",
2026-10-22 night; it was "she's hands"), and a model flat / house / villa stays a thing. Otherwise the plan's own action (`stagingPath`). The
   catalogue's planted-feet lines ("his feet stay exactly where they are", "holds her ground", "never chased")
   are filtered out of what the director reads (`withoutStillness`; a face's "crow's feet stay exactly as the
   reference shows" is kept). **An English ad is spoken in Indian English with an Andhra Pradesh accent**
   (`speechAccentFor`: on every spoken line and "no foreign accent" in the negative). Members use Flow's
   **Frames to Video** with each finished frame as the START frame — never Ingredients to Video, which builds a
   new scene around the picture (`generation/mission.ts`, `AIGuideSheet`).
7. Finalize (returns `sceneContext` and `voiceBrief` too).

**Spoken-word rules, in code (`utils/spokenNumbers.ts`):** every final script line — generated,
repaired, refined or pasted — goes through `speakableLine`. **First, no phone number, pincode or door number
is ever spoken (2026-10-22 — the owner: "PIN code, door numbers and phone numbers were coming in the voice-over
… no need of any of these numbers"):** `utils/unspokenNumbers.withoutUnspokenNumbers` removes them BEFORE the
rest become words — a mobile / landline with STD code / toll-free / 10–12 digits, a "Ph: 2345678" landline, a
pincode (6 digits or 3 + 3, labelled or bare — never after ₹ / Rs or before rupees / lakh / %), a door number
(labelled D.No / Door No / H.No / Plot No / ఇంటి నంబర్ …, or shaped "12-3-45" / "5-87/1"; never a bare "No.1"
or "#1"), and a number already read out as five or more digit words — together with its label ("Ph:", "Call
us on", "ఫోన్ నంబర్", "పిన్ కోడ్"), a phone number's Telugu case ending ("…కి") and the "or" / comma / dash that
joined it. Prices, offers, %, years, times, ranges, "24/7", ordinals and road names ("100 Feet Road", "3rd
Cross") are kept; a line with none is returned unchanged. **A removed number never leaves a broken sentence (2026-10-22,
night):** a Telugu "నంబర్" label whose number carried the case ending keeps the label and takes the ending ("మా ఫోన్ నంబర్
98480 12345కి కాల్ చేయండి" → "మా ఫోన్ నంబర్‌కి కాల్ చేయండి", was "మా కాల్ చేయండి"); "our / my / the … number (is)" and
"మా / మన" go with the label when the number was all the sentence said ("Our phone number is X." and "మా నంబర్: X." go
whole — they left "Our phone number is." / "మా."); a town keeps its removed pincode's case ending ("కాకినాడ 533005 లో" →
"కాకినాడలో", a joiner after a final virama). It applies to a member's own pasted script too. A
generated clip that loses words falls short of the contract and is repaired like any short clip. Until then
`spellOutNumbers` read a phone number digit by digit and a pincode as lakhs, and the presenter prompt's
BUSINESS ANALYSIS still said "contact number only if actually provided and only in the final clip" (removed;
every writer / repair / refine prompt now names pincodes and door numbers beside phone numbers). Then numbers
become words (since 2026-10-22, night: a price with its scale first — `SCALED_PRICE`: "₹25 లక్షల" → "ఇరవై ఐదు
లక్షల", "₹1.5 కోట్లు" → "ఒకటిన్నర కోట్లు", "Rs 30L" → "ముప్పై లక్షలు", "₹1 లక్ష" → "ఒక లక్ష", a Telugu scale's ending kept,
"లక్షలు కే" joined to "లక్షలకే"; single letters L / K / Cr only after ₹ / Rs; it used to read "ఇరవై ఐదు రూపాయలు లక్షల" and
drop the decimals) (Telugu words in a
Telugu script, English words in an English one, Indian lakh/crore grouping, ₹ / % / decimals / times;
other languages rely on the prompt and validator), and the Telugu word
for "and" — with every misspelling of it — is written **`mariyu`, in Latin letters**, inside the
Telugu line (2026-09-25: the team reads the script aloud and wants one fixed spelling on the page).
Nothing explains it anywhere: the written word IS the spelling to say, so the Veo prompt no longer
carries a PRONUNCIATION line. `withoutFixedWords` exempts it from the validator's "no Latin letters
in spoken content" rule. (`everydaySpeech` no longer swaps it for ఇంకా.) **The festival దసరా (2026-10-08,
owner: "the correct spelling is దసరా"):** in a Telugu script Dussehra is always written దసరా —
`utils/festivalNames.withFestivalSpellings`, run by `speakableLine` (Telugu only), rewrites every
transliteration the writer produced (దుస్సెహ్రా, దుస్సేరా, దసెరా, దస్సరా, దశరా, దసరాా, a bare దసర, the Latin
Dussehra / Dasara…, keeping a case ending: దుస్సెహ్రాకు → దసరాకు; never దశరథ or విజయదశమి), and the prompts give the
writer the Telugu name: `prompts/festivalWish` puts దసరా in the Telugu greeting and `wishAudienceRule` (writer,
repair, refine, character dialogue) adds "Write the festival's name in Telugu exactly as దసరా" (`festivalNameIn`,
`festivalSpellingRule`); the character prompt's worked example uses it too. Only దసరా has a fixed Telugu
spelling so far; other festivals keep their Latin name in the prompt. An **English** script is
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
3. Poster Design (plain text since 2026-10-12; Tools history says "Poster Design"), 4. Voice Over Script, 5. Veo 3 Video Prompts, plus B-roll, overlay
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

**Every step on a finished kit uses the kit's configuration (2026-10-08):** `AIPlatformApp.kitForm()` =
`formForKit(formData, outputs.spec)` for the voice-over refine and its Veo rewrite, the section refines, Input Final
Script (its speakers, language and the Veo rewrite), the missing Veo clips, B-roll, overlays, label and poster, and
the row title's language; the form stays for the NEXT run (the Configuration custom-script format reads the form).
A job changed after its kit still shows the "made for … / the job now says …" banner; Generate makes the new kit.

**Editing / refine:** per-section refine (`refineSection`, "change only what was asked"),
`refineVoiceOver` (plan → clip edits → validation; `RefineRevisionBanner` offers undo; since 2026-10-15 a clip the editor
rewrote must land in 17–20 spoken words even when it was outside before — `voiceOverRefine.editProblems` — or nothing is
applied and the member is told the count),
`refineVeoPrompts` (plan → JSON edit → check: `VEO_REFINE_PLAN_SYSTEM_PROMPT` understands the request
and compares it with each prompt — it knows both the 2026-10-05 five-part prompt and the older headed one a
saved kit may hold, and the dynamic-pass rules: one move, never backward, a pair only sideways, walks on the
frame's own floor; since 2026-10-22 also: the cast faces the camera and never turns, spins or rotates (the arc is
retired), every gesture belongs to its words, a walk only where the clip's words need it, the namaskaram on the wish
words; `utils/veoRefine` refuses an edit that changes the spoken line, loses a section or drops the
keep sentence (`VEO_FRAME_LOCK` "as the attached frame", or an earlier prompt's `LEGACY_VEO_FRAME_LOCK`
"exactly as in the attached frame"); `spokenLinesIn` reads both the new
`… says in Telugu:` and the old `… lip-synced:` lines; one retry; the UI alert says what was understood). Copy
buttons strip code fences.

**The kit's spec (2026-10-08, `utils/adSpec`):** `generateAdAssets` writes the configuration it ran with onto the kit
(`GeneratedOutputs.spec`: ad type, festival, language, ratio, gender, attire, special category, custom character,
background, logo, clip count), saved as `ai_generations.spec`; the settings stored beside a kit are the KIT's
(`savedSettingsOf`) — every auto-save used to write the form's over them. A reopened kit gets `item.spec` or, saved
before, its stored settings (`adSpecFromSaved`).

**A run that does not finish saves nothing (2026-10-08, found by the browser check of the duo fix):** a new run lets
go of the document the screen was showing (`generationDocIdRef` cleared at Start), so a run that fails — the cast
guardrail, any error — or is stopped can no longer have its partial sections auto-saved over the previous kit (they
were, a second after the error, into the document the job reopens). Its status card says "This run did not finish —
nothing was saved, and your last saved kit is unchanged" with a "Not finished" chip (it said "successfully
generated", Completed), and Save is off for it (`kitUnfinished`); restoring a saved kit clears it. **Stop says so the
moment it is pressed** (`handleStopGeneration` sets the error: the call in flight cannot be cancelled, and until it
returned — 5–20 s live — the card read "successfully generated" with Save on), and **Save is off while a run is
going** (the run saves itself when it finishes; a Save in the middle wrote its half-made sections as a new kit and
pointed the job at it). The card's sentence for an unfinished run wraps (one line, it ended mid-word on a 390px phone);
the running step stays one line. Also fixed with it,
all from `.ag-chip` / `.ag-row` winning over Tailwind (adgen.css loads later): the error message is a box that grows
with its text (it was a 28px chip over the Start button), the header status chip is hidden on phones again
(`!hidden sm:!inline-flex` — it pushed Home off a 390px screen), and an open row's body is full width
(`!items-stretch`). And the single-voice script reader reads every clip-header shape (`parseVoiceOverSegments` →
`parseLabeledClips` first): a reply in `clip-1[0-8sec]:` form had its headers SPOKEN.

**Save / storage:** `persistGeneration` writes `ai_generations`. **Generate** creates a new doc (a
version); **Save** and a 1-second debounced **auto-save** update the same doc; the assignment gets
`savedGenerationId`. Reopening a job restores it — ONLY on opening: the auto-load no longer re-fires
when a finished run points the job at its new save (that read-back used to wipe B-roll and overlays
still arriving — the "completed but deliverables missing" glitch). `SavedItems` lists the user's own generations.
Tools → Ad Generation History groups versions per job (`utils/generationHistory.ts`). Submitting
the job is `useCompleteWork` (§16).

**Poster Creation — ONE prompt in ONE conceptual ad type (owner, 2026-10-12).** The owner: "First analyze all available
business information, product/service, ad type, campaign purpose, and requirements, then intelligently select the ONE most
suitable conceptual ad style … a very short, clean, creative prompt in this exact structure … Do not randomly select the
type, do not use multiple types, do not generate long technical prompts, and do not lose important business context"; then
"poster ratio 9:16". Inputs: size (`utils/posterSpec.ts`: **9:16 default** since that day — `DEFAULT_POSTER_SIZE`, used by
the studio, a poster sale's job and Work Assign; ratios or pixels), style (`services/posterStyles.ts`, 8 + "✨ Best fit"),
occasion (`utils/posterOccasions.ts`), text language (English default) — the "Concepts to write" 1–6 count is gone
(`posterConceptCount` @deprecated). `generatePosterConcepts`: extraction as before → ONE analysis call
(`services/prompts/posterConcept` `POSTER_ANALYSIS_SYSTEM_PROMPT` / `_USER_PROMPT`: who the business is, what it sells, the
main benefit, the kind of ad and its purpose (`posterPurposeLine`), the brief's must-haves → JSON `{adType, reason, benefit,
businessInformation (≤ 60 words, no numbers / address / invented offers)}`; `standard` effort, temperature 0.2, asked twice
at most) → the type: a fixed style (job `posterStyle` or the member's pick) as it is, else the analysis's one id
(`resolvePosterAdTypeId` reads an id or a name), else the code's keyword rubric (`fallbackPosterAdType`, deterministic, ties
to the owner's order, nothing → `product_benefit`) → assembled IN CODE (`utils/posterAdType.assembleConceptPoster`): "Create
a minimalist and creative ad in <name>. Business Information: <info>. Create one strong visual concept/metaphor that
communicates the main product/service benefit." + blank line + "Format: 9:16 vertical poster. Use the attached logo exactly
as given. Words on the poster in English." (no logo file or "No logo" → "Show the business name "X" as a clean wordmark,
exactly as spelled." — never the word logo) + since 2026-10-13 the phone rule (`posterPhoneRule`, counted from the
Contact line): "Print only the one contact number given above, once, digit for digit." / "… the two (three) contact
numbers given above, each once, digit for digit." / with none, "No phone number on the poster." — a prompt silent about
phones is where an image tool adds a "Call: 98765 43210" strip of its own. The names: material_metaphor "Material-based Metaphor Ads", shadow_metaphor
"Shadow Metaphor Ads", contrast_concept "Contrast-based Conceptual Ads", proportion_concept "Proportion-based Conceptual Ads",
visual_exaggeration "Visual Exaggeration Ads", product_benefit "Product Benefit Conceptual Ads", shape_concept "Shape-based
Conceptual Ads", animal_metaphor "Animal-based Visual Metaphor Ads" (ids unchanged — stored on jobs). Business Information
= the analysis's summary cleaned (`cleanPosterSummary`: every number, labelled contact, email, website and ad-type name
out, ≤ 60 words; the name put in front when missing; the occasion added when missing) + "Contact: …" (1–3 VERIFIED numbers,
"(WhatsApp)", each once — `uniquePosterContacts`) + "Address: …" only when there is one; with no summary, the profile's own
(`fallbackPosterSummary`). `assembleConceptPoster` scrubs its Business Information and Format line of any number not in the
list (a number in the business name, the occasion or the wordmark) — Poster Creation had no final scrub before 2026-10-13.
`posterPromptProblems` / `isConceptPosterPrompt` check the exact shape (one type named once, no "..", ≤ 200 words).
Stored as `posterConcepts: [one]` (`conceptFromPoster`: `adTypeName`, `reason`, `benefit`, `businessInformation`,
`format`, `chosenBy` fixed / analysis / kept / rule, `changes` (2026-10-13), and the old fields filled from them).
**Refine (rebuilt 2026-10-13 — the owner: "poster refine prompt is not working").** Until then a refine could change only
the type and the business summary, which may not describe a picture, and code put everything else back (the verified
contacts and address, the form's language) — so a design request, "leave out the address" (the Refine box's own example)
and "words in Telugu" came back as the same prompt, silently in Poster Creation and as "…without breaking the script's
format" in the video row. Now `refinePosterConcept` → `{ concept, notApplied }` and the video row's `refineVideoPoster`
→ `{ prompt, notApplied }` (`refineSection('poster')` returns its `.prompt`) share one core (`geminiService.refinePoster`):
the refine analysis (`POSTER_REFINE_ANALYSIS_*`, shown the prompt, its Changes line, each verified number / the address
marked "printed now" or "left out", and the language now) answers JSON with `adType`, `reason`, `benefit`,
`businessInformation`, `changes`, `numbers`, `address`, `textLanguage`, `notApplied` (`parsePosterRefineAnswer`;
`usablePosterRefine`), decided and assembled in code by `utils/posterAdType.refineConceptPoster`: the type only when asked
(`refineAnalysis`), never a fixed one; **the design requests in ONE "Changes:" line** between the three sentences and the
Format line (the owner's choice; `conceptPosterPrompt({ …, changes })`, read back by `readConceptPosterPrompt`; the model
returns the WHOLE line — earlier changes kept unless undone; `cleanPosterChanges`: no phone number at all (the Contact
segment is the only place one is printed), no labelled contact / email / website / address / type name, ≤ 50 words
(`MAX_CHANGES_WORDS`), a capital first letter, and without a logo file "the logo" → "the business name"; a sentence that only
repeats the Format line is dropped, `withoutFormatRepeats` — seen live); **the contacts** as the prompt prints them now
(`printedPosterContacts`), changed only when the request is about them (`instructionTouchesContacts`) and only within the
verified list (`refinedPosterContacts`; a typed number that is not verified, or an address the business has none of, gives
a note — the owner: removing allowed, adding never); the Format line's count follows; **the language** of the words is the
request's when it names one, else the prompt's own (`refinedTextLanguage`, `formatLanguageOf`) — a later refine keeps it;
the size stays the form's (Poster Creation) or 9:16 (video row). The logo on a Poster Creation refine: the prompt's own
Format line OR a logo attached now, unless "No logo" is ticked — a kit reopened from Saved has no files, and the old
`!!files.logo` flipped it to the wordmark. The studio says what happened (`posterRefineUnchangedAlert` "Nothing changed" with
the notes, or `posterRefinePartlyAlert` "Refined — one part was not applied"), with the Refine button already reset; an
answer that is only a note (`{"notApplied": …}`) counts — the prompt stays and the member reads why; what the answer leaves
out (reason, main benefit) is the card's as it was (`currentBenefit`); an unusable answer throws "unchanged". The
prompt-length guard allows the Changes line on top of its 200 words. `PosterConceptsPanel`: "Poster
prompt", the ad type, how it was chosen, why + main benefit, Copy prompt, Refine, Open image generator; a generation saved
before shows its old concepts as it did. The mission guide opens ONE Gemini tab; `generationEta` plans one analysis
(`poster.concepts`, 8 s, no fill-in pass). Removed: the old concept prompt and its readers (`utils/posterConcepts` keeps only
`posterConceptAsText`), `POSTER_SYSTEM_PROMPT`, the dead `generatePosterPrompt`.

### 17.3 AI provider, reliability, errors
- **Provider:** Google Gemini through `@google/genai`, called **from the browser**. Every call
  goes through `callWithFallback` (exported as `callGeminiWithFallback`).
- **Keys:** a pool of up to 30 keys (`VITE_API_KEY_n` / `API_KEY_n`, single-key fallbacks). Live on
  2026-10-10: 19 work; 1, 12, 18 invalid; 13, 16, 23–28 "reported as leaked"; keys 2 and 20 are not
  offered gemini-2.5-flash ("new users").
- **Models (2026-10-10, `utils/geminiModels.GEMINI_MODELS`, each answered live that day):**
  `gemini-2.5-flash` (the tuned primary; Google has deprecated it and serves it only to projects that used
  it before) → `gemini-3.8-flash` → `gemini-3.6-flash` → `gemini-3.5-flash-lite` → `gemini-2.5-flash-lite` →
  `gemini-3.1-flash-lite` (shuts down 2027-05-07) → `gemini-flash-latest` → `gemini-flash-lite-latest` (Google's
  never-retired aliases; 3.8-flash and 3.5-flash-lite that day). No previews, no names Google routes elsewhere.
  `gemini-2.0-flash` / `-lite` (shut down 2026-06-01) were still listed and asked on every page load — the
  owner saw their raw 404 on screen ("sometimes prompts are not generating").
- **Call layer (`services/geminiService.callWithFallback`, rewritten 2026-10-10):** the shared state holds only
  facts — retired models (localStorage, a week), dead keys, keys lacking a model, a rest per KEY × MODEL (Google's
  delay, or until the daily reset at midnight Pacific = 12:30 PM IST in summer; daily rests kept in localStorage), a
  model "used up for the day" after 3 daily 429s in a row (asked last, once per call, until the reset; kept in
  localStorage), a 30 s busy spell per model after a 503. Each request picks its route from the TOP of the list on
  the next key (round-robin); nothing moves a shared "current model" (the old pointer let one call's failures move
  every call, and let a call give up with live models untried: 8 of 320 calls / 7 of 40 page loads in the busy-day
  stress test; now 0). Google's errors are read by status and its own words (`readGeminiError`): a 404 retires a
  model only when it names it; a 429 whose delay contains "404" is a rate limit; a 400 is thrown at once
  ("Gemini could not process this request: …"), never sent round every key; a refused thinking setting is retried
  without it; a caller's own error passes through. A call waits (≤ 75 s in all) for a soon-freed route, always asks
  Google at least once, and otherwise throws `GeminiUnavailableError` — a sentence (`geminiUnavailable`: the daily
  limit and when it resets, keys to replace, Google busy, offline), never JSON; `generateWithRetry` stops on it.
- **Thinking per call (2026-09-29; per model 2026-10-10):** `callWithFallback(apiCall, { effort })` — `fast`
  (extraction, voice note, splits, location scout, B-roll, overlays, wardrobe stylist), `standard` (core
  message, repairs, scene plan, frames, Veo director, the poster analysis and its refine — both poster systems, 2026-10-12), `deep` (script writer, review, quality
  judge). `utils/geminiModels.thinkingFor`: gemini-2.5-flash a budget 0 / 768 / 1536; the Gemini 3 Flash models a
  level MINIMAL / LOW / MEDIUM (3.8-flash and flash-latest refuse MINIMAL → LOW); lite models none; a call with no
  effort keeps the model default. 2.5 refuses a level and 3.x defaults to medium thinking (both measured live).
  SMM Delivery Control (2026-10-15, `services/smmAi`, `smm.md` §9.9 phase 5) goes through the same call layer: the titles /
  ideas / captions call is `standard`; the week brief, morning brief, reasons summary and client-update lines are `fast`;
  each has a screen time limit (75 s titles, 40 s the others) and a plain fallback, and is loaded only on first use.
- **Errors:** the UI shows `status.error` (the error modal) — now always a plain sentence from the call layer.
  Many parsers are defensive (JSON repair, clip-number coercion). No server-side proxy, no retry queue.
- **Live testing:** run `generateAdAssets` with vite-node and text-only `formData`, timing each request by
  wrapping `globalThis.fetch` (model, ms, status, `usageMetadata.thoughtsTokenCount`); a wrapped fetch can also
  answer one model with Google's own 429 body to rehearse a busy day. 2026-10-10: a 2-clip Telugu ad ran in 106 s
  on gemini-2.5-flash (21 answers) and in 97 s with 2.5 Flash forced out for the day — all on gemini-3.8-flash, all
  deliverables, script QA 8.6. A real-browser harness (Vite page + CDP, scratchpad) checked the localStorage memory
  across reloads with real Google.

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

**The cast it was set up with (2026-10-08, audited with the AI Ads duo fix):** the AI's format for "Let AI decide" is
read by id or label (`types/cinematicAds.resolveAdFormatId`; an unreadable answer is no choice and the operator is
told to pick one — it used to fall back to "Let AI decide" itself, narration with one voice, for an ad the AI chose
as a conversation); the choice carries its cast details (`withCastDefaults`: who is talking / the speaker / how
many), shown in the picker, which now follows the format in force (`effectiveAdFormatPreset`); the brief records the
choice on the selection as it stands when the brief returns (a format picked meanwhile wins); and `saveProject`
writes the project whole (`setDoc` without merge — a merge kept a cleared `pairing` in the stored map, and it came
back on the next open). **Open (owner to decide):** a format changed after stories / cast / clips exist only
changes later prompts (nothing is reset or warned); and a clip's animation prompt carries no line-by-line speaker
attribution (`Clip.voScript` is one string).

### 17.5 Relationships
- Ads link to **work assignments** (`savedGenerationId`) and so to orders and clients.
- Cinematic projects are **not** linked to orders or assignments.
- There are no campaign objects for ads other than SMM campaigns.
- Ownership: `ai_generations.userId`, `cinematic_projects.createdBy`.
- Publishing to social platforms is **not implemented**. SMM "posting" is recorded by pasting
  live links.

## 24. BUSINESS RULES (IMPLEMENTED; verified in code)

- **AI ads — English words in a Telugu voice-over (owner, 2026-10-22):** flat(s), slot(s), plot(s), villa(s),
  apartment(s), booking(s), arrangement(s) ("arrange చేశాం") and facilities are written in ENGLISH letters inside the
  Telugu line, like `mariyu`, a Telugu ending kept joined ("flatsలో"); every other English word stays in Telugu letters
  (ఓపెన్, బ్యాంక్ లోన్, పార్కింగ్, టూ బీహెచ్‌కే …). Both are corrected in code on every final line, a member's pasted script
  included. Formal Telugu words nobody says to a customer (ఏర్పాట్లు, సౌకర్యాలు, అత్యాధునిక, సరసమైన, విశాలమైన …) are
  replaced by what people say.
- **AI ads — the Telugu greeting fits its clip (owner, 2026-10-22, night):** a Telugu festival wish is "{business}
  తరఫున మా మిత్రులు, కస్టమర్లందరికీ {festival} శుభాకాంక్షలు" — never శ్రేయోభిలాషులు or హృదయపూర్వక (Flow cut the wish
  word itself when the greeting carried them at 17–20 words). Checked in code (`festivalWish.wishAudienceIssues`); the
  17–20-word contract is unchanged. Other languages keep "friends, well-wishers and customers".
- **AI ads — every clip can be SAID in 8 seconds (owner, 2026-10-22, night: "correct promotional voice over script words
  per the clip … check the duo characters also"):** besides its 17–20 words, a Telugu clip carries at most 50 syllables
  (aksharas) for one voice and 47 for a two-person clip (both lines together) — the repairs aim under that — and a
  clip over 54 (one voice) / 51 (a pair) never ships (the run stops: Press Generate). Measured on Flow: 54 syllables
  were said in 7.86 s, 58 were cut at 8 s. Short everyday words meet both rules. Other languages are not measured.
- **AI ads — the closing call line stays in every Telugu ad (owner, 2026-10-22, night):** "మరిన్ని వివరాల కోసం
  స్క్రీన్‌పై ఉన్న నంబర్‌కు ఇప్పుడే కాల్ చేయండి" ends every Telugu single-voice ad, also when the business gave no number
  (the owner chose it over a "come to us" line).
- **AI ads — prices with lakhs and crores are said as the amount (2026-10-22, night):** "₹25 లక్షల నుండి" is spoken
  "ఇరవై ఐదు లక్షల నుండి" (never "… రూపాయలు లక్షల"), "₹1.5 కోట్లు" "ఒకటిన్నర కోట్లు", "₹30L కే" "ముప్పై లక్షలకే",
  "₹1 లక్ష" "ఒక లక్ష"; English "₹25 lakhs" → "twenty-five lakhs".
- **AI ads — the festival's theme (owner, 2026-10-22):** a festival video's every frame, its bottom label and its
  poster carry THAT festival's own decorations, colours, floor and light (the greeting frame the most festive, the
  business still recognisable in the others); a client's own photo gets the decorations added onto its real walls and
  floor, nothing in it removed or moved; an occasion with no look of its own is dressed in its own traditions, never
  another festival's. A poster's three sentences never change — the festival goes in one "Festival:" line.
- **AI ads — the business's name (owner, 2026-10-22):** the name the salesperson typed is a reference only; the final
  name is the one printed on the attached logo, visiting card, flyer or shop board (or said in the voice note), letter
  for letter, and the script, label, poster, name board and cast all use that one name. With no such file, the sale's
  name is used. The member's own studio name ("No logo" name) still wins for the name board / wordmark.
- **AI ads — 17–20 spoken words in every clip (owner, 2026-10-15):** every clip of every voice-over the platform WRITES
  holds 17–20 spoken words — 18–19 preferred, exactly 20 allowed, 21 never — for every cast (one presenter, the real
  owner or two owners, a human pair, two children, a cartoon solo or pair, a deity, a custom character), for commercial
  and festival ads, in every language. In a two-person clip the two lines together make the 17–20 (about 8–10 each).
  Only spoken words count — never labels, timestamps or punctuation — and the fixed closing call line and the address
  count inside their clip. A clip is fitted by writing (one idea, said simply), never by padding or cutting a sentence;
  a secondary detail that does not fit is left out, never squeezed in. The text that ships is counted again after every
  change; a generated script that still breaks the rule stops the run with a message (Press Generate) instead of
  shipping. A script that meets every hard rule and scores at least 9/10 (no area below 8.5) ships at once; a weaker one
  is improved within a fixed budget (3 passes, 1 empty round, 45 seconds — owner, 2026-10-16: "ad deliverables taking
  lot of time") and the kit shows its REAL score — never a 10/10 it did not earn. A member's own script is used word for word and is
  only counted. A refine never returns an edited clip outside 17–20.
- **AI ads — contact numbers (owner, 2026-10-13):** the poster and the footer (Video Bottom Label) print exactly the
  unique contact numbers the business gave — the ones typed in the brief, the voice note's, or ones a card / flyer /
  premises photo shows — each once, as written, never invented, changed or added: none given → no number at all (the
  poster prompt says "No phone number on the poster"); one → that one; two → those two; three → those three; a
  fourth is left out (the layouts carry three). A number written several ways is one number. An order id, account,
  registration number, price or UPI id is never a phone number. The label's WhatsApp number is one of its pills, never
  an extra one. The label, both posters, the overlays, the frames and every refine print the SAME list.
- **AI ads — poster prompts (owner, 2026-10-12):** every poster prompt — Poster Creation and the video kit's poster —
  is ONE conceptual ad type out of the eight (Material-based Metaphor, Shadow Metaphor, Contrast-based Conceptual,
  Proportion-based Conceptual, Visual Exaggeration, Product Benefit Conceptual, Shape-based Conceptual, Animal-based Visual
  Metaphor Ads), chosen by analysing the business — never at random, never two — unless the job or the member fixed a
  style, which is kept. The prompt is the owner's three sentences word for word plus one Format line (size, logo, text
  language); its business information keeps the business's real facts and only its verified contact numbers and
  address. A poster run writes one prompt. Posters are 9:16 unless a size is chosen; the video kit's poster is always 9:16.
- **AI ads — poster refine (owner, 2026-10-13):** a refine applies what the member asks. Design requests (colours,
  background, what to show, a headline, the logo's size or place) go in one short "Changes:" line after the owner's three
  sentences, which never change, and stay there through later refines until undone. A refine may leave out — or bring
  back — a verified number or the address, and change the language of the words; it never adds a number or an address the
  business did not give, and never changes the poster's size (that is the Poster Size setting). When nothing, or not all,
  of a request could be applied, the member is told what and where to change it.
- **AI ads — Gemini availability (owner, 2026-10-10: "sometimes prompts are not generating"):** a generation never
  fails because Google retired a model, because one model is busy or used up for the day while another can answer,
  or because some keys are dead; it uses the best model that can answer at that moment and goes back to the
  primary model as soon as it can. When nothing can answer, the member is told in plain words why and what to do
  (the daily limit and the time it resets, keys to replace, Google busy, offline) — never Google's raw error.

- **AI ads — the cast is the configuration (owner, 2026-10-08):** an ad ordered with two people (a Male & Female
  Duo, two women, two men, two children, a cartoon pair) gets a script in which BOTH speak in every clip, each
  line in its own speaker's mouth, and video prompts that voice each one from their side of the frame while the
  other listens; a single presenter's ad is never voiced as a dialogue. A generated script that cannot keep the
  cast is written again, and a run that still cannot stops with a message instead of making an ad for a
  different cast. Everything done to a kit afterwards (refines, a final script, missing video prompts) is done
  for the cast the kit was made for, whatever the form says now. A member's own script must say who speaks each
  line, and both people must speak somewhere in it.

- **AI ads — move only when the words need it (owner, 2026-10-22; Motu & Patlu since 2026-10-10):** in every video,
  for every cast, the cast faces the camera and acts each line out where they stand, beside what it is about, each
  gesture on the words it belongs to; they walk only in a clip whose own words take them somewhere ("let's go inside
  and see", "follow me") — never in the greeting, never a deity — with no limit on how many clips may walk when the
  words need it. Nobody turns round, spins, rotates or turns away from the camera, and no gesture comes without its
  words. The camera still makes one move (a push-in or a short sideways glide at one distance; a side track with a
  walk), never backward; the arc shot is retired.
- **AI ads — the namaskaram on the wish (owner, 2026-10-22):** when the festival wish is said, the cast joins both
  palms in a namaskaram exactly on those words (the prompt names the moment by meaning and by time, e.g. "about
  6–8s"), the hands relaxed before it; a pair together, on the line of whoever says the wish; a deity raises the
  blessing palm; the Real Owner Face and Duo templates say it too. Any clip whose line wishes gets it, the greeting
  clip always.
- **AI ads — a real person's face (owner, 2026-10-08):** a Real Owner Face ad shows the client exactly as their
  photograph does — face, skin, hair, beard and forehead — for a man and a woman: nothing is added to the face
  (no bindi, tilak, kumkum, sindoor, nose ring or make-up the photograph does not show; a mark the photograph
  shows stays), and the ordered outfit changes the clothes only. Its video prompt is only the owner's template —
  "With a very sweet voice she (he) needs to say :- <the line> with appropriate gestures · Negative prompt :- No
  text on the screen" — by the video's gender; its frames show the owner standing, mid-gesture, ready to speak.
- **AI ads — two real owners (owner, 2026-10-14):** a Real Owner Duo ad (Male + Male, Female + Female, Male + Female)
  shows the business's two owners, each exactly as in their own photograph, in every clip: Owner 1 always on the LEFT
  and speaking first (on Male + Female the man), Owner 2 on the RIGHT — never swapped, blended, given one face,
  duplicated, replaced by an invented person or left out, and nothing added to either face. Sales picks the
  configuration; the tech side uploads one clear photo of EACH owner, and no run starts without both. They speak as
  the owners ("we", "our shop"), stand side by side and speak with gestures (no walking), and the video prompt is the
  owner's real-person template for two, each line voiced by its own owner named by side. The single Real Owner Face,
  the Human Duos and every other category are unchanged.
- **AI ads — దసరా (owner, 2026-10-08):** a Telugu script always spells the festival దసరా.

- **AI ads — what the invented cast wears (2026-10-05, the owner's answers):** the ordered attire is the
  STYLE and is never overruled (Traditional stays ethnic, Professional formal, In-shirt & Pant a shirt and
  trousers, Custom the team's own words); inside it every invented person — both duos, the Kids, the Normal Ad
  presenter — is dressed for THIS business, THIS video and THIS logo (colours from the logo), and two people
  never wear the same outfit (adults never one main colour). Nobody wears writing or a logo on clothes, a
  profession's uniform, bridal, costume or revealing clothes; children never a saree, a suit, heels or
  make-up. For the Kids, "Matches the ad" (the old Smart casual) lets the ad choose — a school's uniform, a
  sports kit, party wear — and a festival, temple, jeweller or silk house dresses them in silk.
- **AI ads — video motion (2026-10-05, the dynamic pass; its walking and turning replaced on 2026-10-22 by "move only
  when the words need it", above):** no clip is a frozen portrait — every clip is a performance and one camera move,
  inside what its frame shows, in a short prompt (camera + action + life, voice, keep sentence, one-line negative) that
  never describes the frame. **The camera never moves backward** — no walk-back tracking shot, no pull-out (the owner:
  "no walk-back, never do it") — and never cranes, orbits, pans, tilts or reveals. A human pair, two children and drawn
  pairs walk (when their words need it) only together, side by side, along or across the floor — never toward the
  camera — filmed only sideways at one distance, the framing following whoever speaks; deities never walk; in the
  client's own photo the camera only pushes in (one performer) or holds (a pair, or while the cast walks). Frames are
  composed caught mid-gesture (mid-step only in a walking clip), and the clip-1 hero frame is an open welcoming pose
  facing the camera (no front-clasp). Members use Flow's Frames to Video with the frame as the start frame, never
  Ingredients to Video.
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
  about the wrong one. A two-hander never comes nearer the camera (that is when the video model
  re-proportions the pair): since the 2026-10-05 dynamic pass every pair walks only together, side by side,
  along or across the floor, filmed sideways at one distance, and every duo video prompt carries the pair's
  sides and scale anchor. B-roll and overlay
  images are part of every video run, not a button pressed afterwards.
- **AI ads (2026-09-22):** a custom script is used word for word (only emoji/decoration stripped;
  numbers become words); a two-speaker category needs `[Speaker]:` lines; a two-speaker clip was
  15–17 words (7–9 a line) — replaced on 2026-10-15 by the one 17–20 rule above; human casts' role labels (Friend/Host) are never spoken; the Custom
  Character needs a description (sale, Work Assign and platform) and Real Owner Face needs the
  owner image; no PDF/document uploads anywhere in the generator; every spoken number is words,
  never digits; the word for "and" is written `mariyu` in Latin letters and explained nowhere; a human
  cast never says its own role label out loud (Girl / Boy / Friend / Host — checked, not just asked);
  no frame or video ever ends on a goodbye
  wave; (walking was removed on 2026-10-01, came back bounded on the morning of 2026-10-05 and became the
  norm in that day's dynamic pass — see the first rule);
  no frame asks for a logo file that was not attached (the name board is used instead).
- **AI ads (2026-10-01):** every video animates its own frame and nothing beyond it — nobody climbs
  on furniture or leaves the place, and the shop is never extended (the "in place, no walking, the camera
  only pushes in slightly" part was replaced on 2026-10-05, first rule). A pair is filmed from one camera
  distance with its height anchored to a real counter. A client's store/office photo is the clip's
  background, unchanged apart from an 8K enhancement. Invented people keep one face and outfit in
  every clip. When the client's address is known the last clip says it (landmark + town), and no clip
  ever invents one.

## 25. CURRENT IMPLEMENTATION STATUS

**PARTIALLY IMPLEMENTED 🟡:**
- Real Owner Duo (2026-10-14): the two photos live only in the studio's memory, like every upload — a kit reopened
  from Saved keeps its prompts (and a frame refine re-stamps the duo lock and the two-photo line without them), but a
  new Generate needs both photos uploaded again. Who is who is fixed by order (photo 1 = LEFT = speaks first); there is
  no "swap owners" control — the member uploads the photos into the matching slots. A member's script may give a clip to
  one owner (allowed, as on every duo); the generated script always gives both owners a line in every clip.
- Contact numbers (2026-10-13): what labels a typed number is read from word lists (`CONTACT_LABEL`, `OTHER_LABEL` in
  `utils/businessFacts`) — English plus a few Telugu / Hindi words. An unlabelled number that is not phone-shaped (an
  8-digit landline without its STD code, a 10-digit number starting 1–5 without "+") is left out; the member labels it
  ("Ph: 27654321") to keep it. Shorthand ("98480 12345/46") gives only the number written in full. A fourth number is
  dropped by design. The code cannot see the finished image: the poster and label prompts name the exact count, and
  whether ChatGPT / Gemini obey it has not been seen on a generated image yet.
- Cast consistency (2026-10-08): a kit saved before 2026-10-08 has no `spec`; its stored settings stand in, and
  those were written from the form at each save — a kit whose script is not that cast's is refused (not
  rebuilt) and has to be generated again or given a final script. An unknown speaker label in a MODEL's script is
  placed by its position (reported, not refused); a member's is refused. (The Kids' unused 13–15-word
  budget was removed on 2026-10-15 — every cast has the one 17–20 contract, `utils/scriptContract`.)
- Number spelling (`utils/spokenNumbers`) covers Telugu and English only; Hindi, Tamil, Kannada and
  Malayalam scripts rely on the prompt rule and the digit validator.
- Motion staging comes from the scene plan's choices or a keyword reading of each line; when the
  client's own photos are used the scene plan is skipped, so only the keyword reading applies.
- The wardrobe stylist (2026-10-05) is checked by word lists (`checkStyledCast`): an odd but harmless
  outfit can be refused (the sheet's code outfits are used), and a clash phrased in words the lists do not
  know can pass. It is asked before the scene plan exists, so "the video" it dresses for is the ad type, the
  festival, the core message and the team's brief — not the scene plan's motive. Temperature 0 keeps a
  regenerate mostly, not exactly, in the same outfits. The extraction still does not read the logo's colours,
  so without the stylist the grown-ups follow only a palette written in text.
- The Kids' code outfit (`dressKids`, 2026-10-05) reads the theme from word lists (`KIDS_THEME_WORDS`): a
  business described in words the lists do not know is dressed in everyday wear, and only colour WORDS in the
  palette count (a hex code names nothing). It sees the scene plan's motive, so a client-photo ad (no scene
  plan) is dressed by its business alone. No image run has shown the new outfits yet.
- The director's action is checked by word lists (`actionUsable`, 2026-10-05): an unusual but harmless
  phrasing can be refused (the clip falls back to the plan's generic action), and a risky one phrased in
  words the lists do not know can pass. In a live run (2026-10-05, the dynamic pass) all eight actions for the
  owner's three hospital frames passed. A one-line pair clip is led by its speaker (`pairNamesOf`); the other
  only reacts.
- A pair in the client's own photos has no camera move at all (only a still camera while they walk across
  it): with no move toward them allowed and nothing beyond the photo shown, the walk is its only movement.
  Motu & Patlu standing in their photo (2026-10-10) are filmed the same way — their performance is the movement.
- The walk decision (Motu & Patlu 2026-10-10, every cast 2026-10-22) in the client-photo path is a word list
  (`lineNeedsWalk`; no scene plan runs there): a way of saying "let's go" the list does not know leaves that clip
  standing (the safe side), and an unusual phrase on it walks one clip. With AI backgrounds the scene planner's `walk`
  decides (it handles any language); a plan without it falls back to the list. A kit made before 2026-10-22 keeps its
  mid-step frames — a Veo regenerate or Input Final Script on it now plans those clips standing; Generate makes
  matching frames.
- The namaskaram's moment (2026-10-22) is an ESTIMATE from the wish words' position among the line's spoken words
  (Veo is assumed to spread a line evenly over 8 s, or a pair speaker's half); a wish said in words `utils/wishGesture`
  does not know gets the cue untimed on the greeting clip and none elsewhere.
- English words in a Telugu script (2026-10-22): both directions are fixed lists (`ENGLISH_WORDS`, `TELUGU_LETTER_WORDS`).
  Another English word the writer puts in Latin (not on either list) is still only caught by the validator, which caps
  the judge's language score and asks a repair; it can ship in a script that stops "stalled". Telugu only.
- The festival look (2026-10-22) is the catalogue's for 20 named occasions (`getFestivalTheme`); any other occasion is named with "its own
  traditions" and left to the image model.
- The business's final name (2026-10-22) is the extraction model's reading of the attached files plus where it says it
  read it; code checks only that a file of that kind WAS attached. A misread wordmark becomes the name everywhere — the
  member corrects it in BUSINESS CONTENT or with the No-logo name.
- The script quality gate (2026-10-15): 10/10 is a genuine, rare result — in the first live runs (gemini-2.5-flash /
  3.6-flash judges) scripts shipped at 9.4–9.8 after 3–4 passes, stopped "stalled", reported as "best draft". The
  rubric's anchors, the mechanical caps (`MECHANICAL_CAPS`, matched on the validators' wording) and the rewrite
  thresholds (`QA_REWRITE_BELOW`) are set from the rubric, not measured over many live runs; two judges (2.5 vs 3.x)
  score the same script differently, so a pass can "improve" on judge noise. A deity whose catalogue name is part of
  the business's name (Ganesha / Sri Ganesh Sweets) is counted as a second name mention (a mechanical issue that
  caps cast at 5). A final script with a different clip count than the kit is refused rather than re-framed (it has
  to go through Configuration → custom script and a new run).
- The word contract (2026-10-15) counts what is written: a long Telugu compound or an English abbreviation counts as
  one word however long it takes to say (the prompts ask for everyday words and easy rhythm; the judge scores
  speakability). Numbers are counted as spoken only in Telugu and English (`spokenNumbers`); in Hindi, Tamil, Kannada
  and Malayalam a digit is a validation issue the repair removes. `utils/wordTiming` (the overlays' word timing) still
  has its own word splitter — it times words, it does not enforce the contract.
- Character catalogue regeneration from JSON has no committed generator script.
- Header prompts in no-logo mode may still reference a logo container (noted 2026-07, [NOT CONFIRMED] current). The
  poster's no longer can: its Format line never names a logo without one (2026-10-12).
- Poster prompts (2026-10-12): the type is the model's judgment (or the keyword rubric when it does not answer); a
  business the rubric's word lists do not know gets Product Benefit. A refine cannot change the size (the Poster Size
  setting; the member is told). Since 2026-10-13 a refine reads the text language from the prompt, so changing the form's
  text language after Generate no longer reaches a refine — Generate again, or ask for it in the refine. Old saved kits keep their long poster prompts until regenerated.
- Poster refine (2026-10-13): what goes where (design → Changes line, facts → business information, contacts, language) is
  the model's reading of the request, checked by code only where it can be (numbers, address, type, logo word, Format
  repeats). A contact change needs a contact word in the request (`CONTACT_CHANGE_WORDS`: English plus a few Telugu /
  Hindi words) — "drop the second one" without one is not applied. Live on gemini-2.5-flash (a 9-refine chain + the video
  row) every step landed in the right field, kept the earlier changes and printed each number once; no image has been made
  from a prompt with a Changes line yet. Checked by unit tests and the pipeline on a
  faked Gemini (`posterAdTypeOct12`, `adPipelineEndToEnd`) and the panel / studio in a real browser (1440 / 390 px) — no
  live Gemini analysis was run and no poster image has been made from the new prompts yet.

**NOT IMPLEMENTED ❌** (referenced or planned, absent in code):
- Hand-over of a cinematic project to a teammate (in the 2026-09-19 spec; the list is per-creator
  only).
- In-app image or video generation; publishing to social platforms.

## 27. POTENTIAL RISKS (need verification)

- **Cast consistency (2026-10-08)** is checked by unit tests (every catalogue entry × commercial / festival through
  the full pipeline on a faked Gemini; the six shapes the duo script came back in, five runs each; the gate; the
  stop; the kit spec; custom scripts), a real-browser run of the studio, and live Gemini: 8 duo scripts from
  gemini-2.5-flash were all well-formed, 1 of 6 from gemini-3.1-flash-lite-preview (where the free tier rotates
  under rate limits) had broken the cast (`24-24|boy:`, now read right), and a full live Telugu duo run (101 s, 17
  calls, polished by the gate) shipped Girl + Boy in all 4 clips with two-speaker Veo prompts. Not yet seen: a Flow
  video from these prompts. A run that stops on the cast costs the member a Generate; a broken FIRST draft adds up
  to two drafts (quota).

- **The Real Owner Face fix (2026-10-08) has not been seen on a generated image or video.** It is checked by unit
  tests and a full run on a faked Gemini (both genders: the template on every clip, no director call, the face
  lock and the in-place composition on every frame body, no jewellery line, the male attire) — but no frame was
  made in ChatGPT / Gemini from the new prompts and no clip in Flow. Watch: whether the image model still adds a
  mark (then move the FACE LOCK to the top of the body, or ask for the owner's photo to be the edit base); and
  whether Veo, given only the template, keeps the frame's face and moves naturally (the template has no keep
  sentence and no camera, by the owner's choice). A Veo refine of these prompts keeps the line (spokenLinesIn) but
  the refine planner was written for the five-part prompt.
- **The Real Owner Duo (2026-10-14) has not been seen on a generated image or video.** It is checked by unit tests
  (`realOwnerDuoOct14`: all three configurations — slots, stamps, the template, the script prompt, the sales notes, the
  full pipeline on a faked Gemini, the missing-photo refusal, the refine re-stamp, a one-owner clip; `castConsistencyOct08`
  over every entry; the studio's two slots and check in `aiPlatformInputs`) and a real-browser run of the studio — but no
  frame was made in ChatGPT / Gemini from two owner photos and no clip in Flow. Watch: an image tool given two reference
  photos can blend the faces, swap them or use one face twice (the duo FACE LOCK names each side's photo, and the 📎 line
  asks for photo 1 FIRST — attached in the other order, the sides swap); and whether Veo, given only the template, keeps
  both faces and moves only the speaker's lips. The face lock's mark list is the single lock's, for both people at once.
- దసరా (2026-10-08) is fixed by a list of misspellings: a transliteration not on it stays as written (the prompt
  now names దసరా, so the writer should not produce one). Other festivals' Telugu spellings are not fixed.

- `cinematic_projects` list query (`where createdBy` + `orderBy updatedAt`) needs a composite
  index; no index file is in the repo [NOT CONFIRMED in console].
- **The model list is kept by hand (2026-10-10).** Google retires models every few months (2.0 Flash went on
  2026-06-01; 2.5 Flash is deprecated, "limited to users who have actively used them in the past", with a
  2026-10-20 shutdown on Google Cloud's Agent Platform and none announced yet for the Gemini API). The call layer
  survives it — a retired model costs one request per browser per week and the two `-latest` aliases never
  retire — but the list should be checked against Google's deprecations page when a model's shutdown nears.
  The fallback models' WRITING has been judged on two live runs only (3.8 Flash's Telugu script scored 8.6 vs
  2.5 Flash's 7.4 on the same brief); the prompts were tuned on 2.5 Flash. Google advises temperature 1.0 for
  Gemini 3 — the wardrobe stylist (0), one call at 0.2 and one at 0.95 set their own; not seen to cause trouble.
- A model is marked "used up for the day" after three daily 429s in a row on different keys; keys of that model
  with requests left are then asked only when nothing else can answer (once per call). Requests are spread
  evenly over the keys, so their limits run out together — but a key the owner upgrades mid-day waits for that.
- Every AI video run now makes up to three more Gemini calls: the voice note (when one is
  attached), the scene plan (up to 2 attempts, skipped with client photos) and the Veo refine's plan
  step. More quota and latency per run; not measured live. Since 2026-10-01 a run whose facts carry an
  address and whose script is not English adds one `fast` call that writes the address in the
  script's language (`nativeAddressPromise`: runs alongside the core-message call and is awaited before
  the script is written, so it rarely adds time).
- **The 2026-10-05 dynamic pass has not been seen on a real Veo video.** It is unit-tested (the anti-static
  rule over every cast × 1–8 clips × ad type × photo mix, the five-part prompt, the director checks,
  frame/video plan agreement through the faked-Gemini pipeline) and the director ran live on the owner's three
  hospital frames (all eight actions specific and accepted) — but no clip has been generated in Flow from the
  new prompts. Walking is now the norm after two failed attempts (history 2 and 4 in `motion.ts`: presenters
  walked out onto the road, into furniture, shops grew). What should hold it this time — walks only on the
  frame's own floor, never toward a door or away from the camera, frames composed mid-step with that floor in
  view, no move backward or beyond the frame, a client's photo never tracked — is the reason, not proof. Watch
  in Flow: a walk-toward clip whose camera pushes in can end too close; a sideways move shows a
  little of the room beside the frame (Veo extends it); Motu & Patlu walking in nearly every clip DID drift (the
  owner, 2026-10-10: heights and attire), and on 2026-10-22 the owner saw unwanted movement and turning in every cast —
  so every cast now walks only where a clip's words need it and the arc is retired (§17.2 step 6, history 8). The
  clip-1 hero pose is `HERO_FRAME_POSE`; if hands come out badly in hero frames, that one constant is the place to
  change it.
- **"Move only when the words need it" (2026-10-22) has not been seen on a real Veo video.** It is unit-tested (every
  cast × clip counts × ad type × photo mix, the in-place forms, no turn in a walk hint, `TURNS` / `NAMASTE` refused, the
  frame and video plans agreeing through the faked-Gemini pipeline) and ran live three times (gemini-2.5-flash /
  3.8-flash: no clip walked, no arc, the greeting clip's cue "Exactly as she says the festival wish (about 6–8s) … namaskaram"),
  but no clip has been made in Flow from the new prompts. Watch: whether a clip performed in place on a short glide
  reads as too static (the 2026-10-05 problem — then a stronger gesture line, not a walk, is the lever); whether the
  namaskaram lands on the words (the time is an estimate); the deity scene plan still offers "open floor to walk on"
  (harmless — a deity never walks — but untidy). A live director action once said "her hands remain settled after the
  wish" beside the code's cue — harmless, the cue wins in the prompt's order.
- **The festival dressing and the name rule (2026-10-22) have not been seen on a generated image.** Live, every frame
  carried `FESTIVAL DRESSING — DIWALI`, the label led with its FESTIVAL THEME, the poster had its Festival line; whether
  ChatGPT / Gemini decorate a client's photo WITHOUT changing it is untested, and the name rule ran live only without
  files (the sale's name, correctly). Frame prompts grew: the clip-1 hero frame is ~2,100–2,200 words live (ChatGPT
  reads it; long frame prompts predate this change).
- **The geminiService chunk passed Vite's 900 KB warning (2026-10-22: 913 KB, 281 KB gzip; ~890 KB on 2026-10-18).** It
  loads only in the studio; the warning is not an error. Splitting the prompts out would be a separate task.
- Veo's text limit: third-party summaries put Veo 3 at about 1,024 input tokens [NOT CONFIRMED — Google's
  table did not load]. Since 2026-10-22 the prompts are ~204–252 words for one presenter (248–264 live, a Telugu festival
  greeting with its namaskaram cue the longest) and ~372–387 for Motu & Patlu (was ~170–190 / ~350–380): the new
  negatives, the gesture line and the wish cue added ~15–25 words; a Telugu line costs more tokens per word than English.
- Flow's Frames to Video also takes an END frame (Google, Veo 3.1 with audio since 2025-10): a second frame
  per moving clip would pin the walk's end, the place and the heights. Not built — a suggestion to the owner.
- Which Flow mode the team actually used before 2026-10-05 is [NOT CONFIRMED]; the checklist and AI Guide
  now say Frames to Video.
- `AIPlatformApp` reloads saved generations in `useEffect(..., [user])`; a new `user` object on
  every profile snapshot re-reads `ai_generations` (read-quota; a test mock with an unstable user
  made it loop).
- A frame run with no logo FILE now uses the name board even when "No logo" is not ticked.
- **The quality loop's time (2026-10-15 → fixed 2026-10-16).** The 2026-10-15 loop chased a genuine 10/10 (5 passes,
  120 s, 2 empty rounds); live, no script reached it, so nearly every run spent the full budget: a 2-clip Telugu duo
  239 s, a 2-clip Ganesha ad 147 s (~100 s before), with per-minute 429 bursts. The owner found deliverables too slow
  (2026-10-16), so a READY draft (`isReady`, ≥ 9/10, every hard rule met) now ships at once and the budget is 3 passes /
  45 s / 1 empty round. A script that ships at 9.x shows "best draft" with its real score. **Not yet measured live** —
  time one real run (the progress bar's "Checking the script" step should now take ~10–25 s on a ≥ 9 first draft). To
  trade speed for polish, change `SCRIPT_READY_SCORE` / the budget in `utils/scriptQa`; the contract and the final gate
  do not depend on them.
- **A two-person clip now carries 17–20 words (2026-10-15), not 15–17.** 15–17 was chosen on 2026-09-22 because at
  18–20 the second speaker ran out of time and Veo finished the line in the wrong mouth. The owner set one rule for
  every cast; the prompts now split it evenly (8–10 a line, each 7–12) and every duo Veo prompt still gives each
  speaker their own half. Not yet seen in Flow: watch the second line of a duo clip for clipping or a voice swap.
- **A run can now stop on the word contract** (the final acceptance gate) after every repair and draft failed — it
  costs the member a Generate. Before the 2026-10-15 fix of the repair direction one live Telugu ad did (its final
  clip had to keep a 9-word call line and a 5-word address and the editor was told to keep "every fact"); the re-run
  after the fix is recorded in docs/DEVELOPMENT-HISTORY.md.
- Contact numbers (2026-10-13): checked by `contactNumbersOct13.test.ts` (18 scenarios × the label, the video poster,
  Poster Creation end to end, the label refine, the overlays and a frame refine on a fake Gemini that keeps adding,
  repeating and dropping numbers) and in a real browser on the studio itself (Poster Creation with 0–3 numbers,
  duplicates and ids; a saved kit's label and poster rows). An earlier saved kit keeps its label and poster text until it is regenerated (a
  label refine updates the old WhatsApp sentence); a profile saved before 2026-09-25 (no `contactNumbers`) now gives
  only its well-formed numbers.
- Verified facts drop a number the extraction put under a non-contact key or read from a product
  photo, and any number when only a logo was attached — by design, but a real number can be lost that
  way; the member types it into BUSINESS CONTENT to keep it.
- Speed work (2026-09-29): a rewrite now spends every extra draft at once (more calls than stopping at a
  passing second draft), and B-roll/overlays run concurrently — both use the small free-tier quota
  (~20 requests/day/key/model) faster. The thinking budgets were chosen from one live comparison
  (quality gate 9.8 → 8.9–9.0 on the same brief), not a broad study.
- The fixed-distance duo camera, the frame's colours (now one clause of the keep sentence) and the
  Indian-English accent are prompt rules checked by unit tests only — no live Veo run has confirmed the
  heights hold, the colour stays or the accent is Indian. Cinematic Ads has its own `dialect` field and its
  own clip prompts, and was not changed by the 2026-10-05 motion work.
- The 2026-10-01 scale anchor, background plates, cast sheet, Kids packs and spoken address are prompt
  rules checked by unit tests and the full-pipeline test on a faked Gemini — **no image or Veo run** has
  confirmed that Veo keeps Motu & Patlu's height, leaves a client photo unchanged, or how the children look
  (the 2026-10-05 motion policy: see the first bullet of this list).
- The wardrobe stylist (2026-10-05) adds one `fast` Gemini call per run with an invented cast (two when its
  first answer is refused), with the logo image attached — more quota on the free tier (~20 requests / day /
  model / key). It ran live on five briefs and one full duo run (24 s, in parallel with the script), but **no
  frame image or Veo clip** has been made from a styled cast sheet yet: watch that the image model keeps the
  longer outfit line identical in every clip, and that a brand colour close to the premises' walls does not
  make the cast disappear into the background.

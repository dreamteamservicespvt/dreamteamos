# HANDOFF — AI ads: audit + test ALL ad types (2026-10-23, overnight, autonomous)

## Goal (the owner's words, 2026-10-22 night)
"Find all the mistakes like them and solve all them and test all"; then "correct promotional voice over script words
per the clip and test all, also check the duo characters"; then (going to sleep): "don't ask me anything, don't stop …
test all the types of ads voice over scripts, video quality — camera angles, dynamic video quality and frame quality
… find the issue and solve all of them". Full rights: Chrome — ChatGPT = thedreamteamservicespvt@gmail.com (browser
"SRINU-dts"), Flow = dreamteamservicesjpn@gmail.com (browser "dts jp", picked with `switch_browser`). Never type
passwords. Flow budget (CLAUDE.md): x1 per clip, ≤ 1 retry, ~100 credits per ad (12 credits a clip).
Owner decision: the Telugu call line "మరిన్ని వివరాల కోసం స్క్రీన్‌పై ఉన్న నంబర్‌కు ఇప్పుడే కాల్ చేయండి" stays in EVERY ad,
also with no phone number (asked; answered "Keep the call line always" and "this needed").

## Done (uncommitted, in the working tree)
- Greeting re-test in Flow (12 credits): PASS — whole line said 0–7.86 s, wish at 3.9–4.7 s, namaskaram 3.25–4.5 s.
  Files: `<work>/real-ad/flow/clip1b.mp4`, `clip1b-te.json`, `strip1b.jpg`.
- Fixes + tests (`src/test/auditOct22.test.ts`, 36 tests): syllable limit per clip (`utils/scriptContract`
  spokenSyllables / clipSyllableIssue / contract gate; prompts told via wordContractBlock({language})); prices with
  lakh/crore (`spokenNumbers` SCALED_PRICE); removed numbers leave no broken sentence (`unspokenNumbers`
  OWNED_LABEL_BEFORE, TOWN_ENDING_AFTER_GONE); "the presenter's" → her/his (`motion.asSpokenOf`); judge told the final
  clip's room (`prompts/scriptQa` finalClipRoomRule); core-message short test when the message clip is the final clip
  (`prompts/coreMessage` finalMessageClipTest); one framing (three-quarter) + semi-jewellery only in frame prompts;
  business name said in the script's letters (`utils/businessName` withNativeName + geminiService nativeNamePromise);
  five words repeated in two clips flagged (`repeatedPhraseIssues`). Old tests updated: `unspokenNumbers.test.ts` line 40.
- Context partly updated: `.claude/rules/ai-ads.md` (§17.2 step 3, spoken-word rules, director, frames, §24).
  NOT yet: the native name, repeated phrase, core-message short test in ai-ads.md; history entry; CLAUDE.md §32.

## In progress / next
1. Read the 4 live runs: `<work>/real-ad/audit-{festival,promo,duo,motu}.json` (runner `run-audit.ts`, args name adType
   pack seconds). Check words 17–20, syllables (`scratchpad syl.cjs` or spokenSyllables), score, Latin letters, repeats.
2. Images + video for each ad type: frames in ChatGPT (pvt), clips in Flow (JPN) — single presenter promo, Male &
   Female duo, Motu & Patlu; frame-check strips (ffmpeg fps=4 tile) + Whisper (`flow/transcribe_wav.py`, needs
   `PYTHONIOENCODING=utf-8`). Fix what is found.
3. Context (ai-ads.md rest, DEVELOPMENT-HISTORY entry at top, CLAUDE.md §32), build + full vitest + tsc, commit
   locally, delete this file.

## Where things are
- `<work>` = `C:\Users\chala\.claude\projects\c--Users-chala-Desktop-DTS-OS\work\2026-10-22-ai-ads`
- Progress page: https://claude.ai/artifact/1FsgdNWSjz7nd5gj8ympVr (source `<work>/festival-ad-check.html`).
- Flow project "Oct 22 - 22:37" holds frame1.png. Download a clip: open it → download icon → 720p; lands in Downloads.

## Gotchas
- Chrome device ids (select_browser, no question needed): Flow / dts jp = 05ff8459-fb1d-4775-a69d-0a64efe1840c,
  ChatGPT / SRINU-dts = 372ab4c1-6feb-4832-92af-4f9b7052d3ad.
- A hidden Chrome window freezes: raise it via PowerShell EnumWindows/SetForegroundWindow by title.
- Heredocs / node -e mangle backslashes and quotes — use the Edit tool for regex code.
- The full vitest run has a flaky SMM UI timeout (`smmDeliveryControlUiOct15`) — passes alone.

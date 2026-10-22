# HANDOFF — AI ads: real-ad check → audit for the same kind of mistakes (2026-10-22, night)

## Goal (the owner's words)
"Find all the mistakes like them and solve all them and test all" — after the real Telugu festival ad check found
lines that cannot be said in time, code word-swaps that broke grammar or meaning, and a phone kept inside an address.
Test = live Gemini runs + real images (ChatGPT, pvt account) + Flow clips (JPN account) checked frame by frame and with
Whisper. The owner said "don't ask me, do it yourself" (but never type passwords; ask only for business-rule changes).

## Done (local commits on `main`, not pushed)
- The six 2026-10-22 fixes held on a real ad (logo name, Diwali dressing, faces camera, no walk/turn, namaskaram cue).
- Five more fixes + tests (`src/test/realAdOct22.test.ts`): bare "Phone" label; "<place>ను … రండి" → కి; "the model
  flat" kept; phone cut from the typed address; Telugu greeting shortened (owner: drop శ్రేయోభిలాషులు + హృదయపూర్వక).
  Details: `docs/DEVELOPMENT-HISTORY.md` (2026-10-22 night), `.claude/rules/ai-ads.md` §24.

## Next steps, in order
1. **Re-test the greeting live:** `npx vite-node <work>/real-ad/run-real-ad.ts` (writes `kit.json`), then one Flow clip of
   clip 1 (frame 1 is ready: `<work>/real-ad/images/frame1.png`). Whisper must hear the WHOLE line ending in
   శుభాకాంక్షలు and the palms must join on it. Budget: 12 credits a clip, at most 1 retry.
2. **The audit** (the owner's request). Candidates already seen:
   - Final clip = the fixed call line `TELUGU_SCREEN_CTA` (9 words, ~22 syllables) + the spoken address (≤ 6 words) —
     measure syllables over real addresses; Flow says ~53 syllables in 8 s (6.6/s), ~46 is comfortable.
   - The call line says "call the number on the screen" even when NO number is verified (runs 1–2) → owner decision.
   - Frame prompt contradictions (frame 1 of `kit.json`): "Close mid-shot only … never full-body" vs the motion stamp
     "a full or three-quarter shot"; JEWELLERY "heavy kundan … worth lakhs" vs "semi-jewellery only, never heavy";
     "For professional suit outputs, Clip 1 …" inside a saree ad.
   - The quality gate shipped scripts at 6.2 / 6.4 / 6.9 "stalled" (formal "వ్యాపార సంస్థ", weak clip 2).
   - Every code text-substitution on shipped lines (`speakableLine` chain: unspokenNumbers, englishWords /
     withTeluguLetters, spokenNumbers, festivalNames; `motion.asSpokenOf`; `everydaySpeech`) — look for the same
     class as "ను … రండి" and "she flat": a swap that breaks grammar or meaning.
   - Label and poster images not made yet (prompts: `<work>/real-ad/kit.json` `label`, `poster`).
3. Update the context (§30 step 8), run build + full vitest + typecheck, commit locally, delete this file.

## Where things are
- `<work>` = `C:\Users\chala\.claude\projects\c--Users-chala-Desktop-DTS-OS\work\2026-10-22-ai-ads`
  - `real-ad/run-real-ad.ts` (live run with `logo.png`; Node FileReader stand-in), `kit.json` (run 4, before the greeting
    fix), `kit-run1/2/3*.json`, `images/frame1.png`, `frame2.png`, `flow/clip1.mp4`, `flow/clip1-te.json`,
    `flow/strip4fps.jpg`, `flow/transcribe_wav.py`.
- Progress page: https://claude.ai/artifact/1FsgdNWSjz7nd5gj8ympVr (scratchpad copy in `<work>/festival-ad-check.html`).

## Gotchas
- **Chrome:** ChatGPT (pvt) = browser "SRINU-dts" (deviceId 372ab4c1-6feb-4832-92af-4f9b7052d3ad); Flow (JPN) = "dts
  jp" — connect with `switch_browser` (the owner clicks Connect). A Chrome window that is hidden or minimised freezes
  (screenshots / JS time out): raise it with PowerShell `SetForegroundWindow` on the Chrome process whose title matches.
- Upload files only from the session scratchpad (copy them there first). Long text: load it via a temporary
  `<input type=file>` + `file_upload`, then paste with a ClipboardEvent (ChatGPT) or `execCommand('insertText')` (Flow).
  Flow takes media by a dispatched `drop` event; the Start slot then picks it.
- `~/.claude/video/tools/transcribe.py` fails (PyAV no longer takes `metadata_errors`) — use
  `<work>/real-ad/flow/transcribe_wav.py <16k mono wav> <out.json> te`.
- 9876543210 is on the placeholder list — use 98480 12345 in test briefs.

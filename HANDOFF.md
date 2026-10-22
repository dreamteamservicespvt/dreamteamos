# HANDOFF — AI ads: audit + test ALL ad types (2026-10-23, overnight, autonomous)

## Goal (the owner's words, 2026-10-22 night)
"Find all the mistakes like them and solve all them and test all"; "correct promotional voice over script words per the
clip … check the duo characters"; then (going to sleep): "don't ask me anything, don't stop … test all the types of ads
voice over scripts, video quality — camera angles, dynamic video quality and frame quality … find the issue and solve all
of them". Full rights: Chrome — ChatGPT = thedreamteamservicespvt@gmail.com, Flow = dreamteamservicesjpn@gmail.com.
Never type passwords. Flow budget (CLAUDE.md): x1 per clip, ≤ 1 retry per clip, ~100 credits per ad (12 a clip).
Owner decision: the Telugu call line stays in EVERY ad, also with no phone number.

## Done (local commits on `main`, not pushed — see `docs/DEVELOPMENT-HISTORY.md` 2026-10-23)
- 14 fixes + `src/test/auditOct22.test.ts` (42 tests); context updated (`ai-ads.md`, history, CLAUDE.md §32).
- Tested live: Diwali 2-clip (8.1 after fixes), promotional 4-clip (8.7), Male & Female duo (9.4), Motu & Patlu (9.2).
  Frames (ChatGPT): promo + duo pass; Motu frame invented claims → fixed by the TEXT IN THE IMAGE stamp.
  Flow (60 credits): greeting pass, promo pass, duo pass except a logo-cropping slide, Motu cut → fixed; Motu retry no cut
  but camera crept closer + Motu walked to close a frame gap → "never closer" + "an arm's length apart" (not re-tested:
  Motu used its one retry).
- Full vitest: 4705/4706 — the one failure (`smmDeliveryControlUiOct15`, view-only lead) is PRE-EXISTING (fails on 19763d6).

## Also done (later the same night)
- Kids duo 9.5, English promotional 9.5 (ready), Ganesha Diwali 7.9 (live scripts); fixed: loose Telugu case endings
  joined, the address call no longer translates "Main Road", an English ad says an all-caps name in title case.
- Open for the owner: the greeting rule makes a DEITY say "{business} తరఫున … శుభాకాంక్షలు" (speaks as the business).

## Next steps, in order
1. Test the types still not covered (frames + Flow): Kids, deity, English (live script + one ChatGPT frame; a Flow clip only where the frame passes):
   Kids duo (`kids_duo_mixed`), a deity (`god_ganesha`), an English promotional ad, the VIDEO BOTTOM LABEL + poster images
   from a kit (`audit-promo.json` → `all` has `headerPrompt` / `posterPrompt` if re-run with run-real-ad.ts), and a
   client-photo (real location) ad. Real Owner Face needs a real owner photo — leave for the owner.
2. Re-test a pair in Flow with the new pair lines (fresh frame from a new run) when budget allows.
3. Investigate the pre-existing SMM test failure (separate task).
4. Delete this file when the audit is closed; update §32.

## Where things are
- `<work>` = `C:\Users\chala\.claude\projects\c--Users-chala-Desktop-DTS-OS\work\2026-10-22-ai-ads`
  - `real-ad/run-audit.ts` (args: name adType pack seconds → `audit-<name>.json`), `real-ad/show.cjs <names>` (summary),
    `real-ad/images/audit-*-frame1.png`, `real-ad/flow/{promo1,duo1,motu1,motu2}.mp4` + `strip-*.jpg` + `*-te.json`.
- Progress page: https://claude.ai/artifact/1FsgdNWSjz7nd5gj8ympVr (source `<work>/festival-ad-check.html`).
- Flow project "Oct 22 - 22:37" holds all frames.

## Gotchas
- Chrome device ids (select_browser): Flow / dts jp = 05ff8459-fb1d-4775-a69d-0a64efe1840c,
  ChatGPT / SRINU-dts = 372ab4c1-6feb-4832-92af-4f9b7052d3ad. A background window freezes: raise it via PowerShell
  EnumWindows + SetForegroundWindow by title. ChatGPT: a background tab may not send — send from the visible tab.
- Long text into a page: a temporary `<input type=file>` + file_upload, then `execCommand('insertText')`.
- Flow upload: patch `HTMLInputElement.prototype.click` to catch the input "Upload media" creates, set its files, fire
  `change`. Check the Start thumbnail before generating (the picker's order changes).
- Whisper: `PYTHONIOENCODING=utf-8 python <work>/real-ad/flow/transcribe_wav.py <16k wav> <out.json> te`.
- **Leftover:** `C:\Users\chala\Desktop\dts-wt-check` (a git worktree with a JUNCTION to DTS-OS\node_modules). Remove the
  link FIRST: `cmd /c rmdir C:\Users\chala\Desktop\dts-wt-check\node_modules`, then
  `git worktree remove --force ../dts-wt-check`. Never delete the folder recursively before that.

# AI Memory — DTS-OS

Read this first at the start of every session so past work is never repeated or undone.

## Project shape (AI ads flow)
- Live app is `src/` (Vite + React + TS + shadcn, Google Gemini via `@google/genai`).
- `aiadsdts/` is an **unreferenced standalone copy** — do NOT edit it; changes there have no effect on the live app.
- Ad-generation flow: `src/components/ai-platform/AIPlatformApp.tsx` → `src/services/geminiService.ts` → `src/services/prompts.ts`.
  - `prompts.ts` holds all system prompts (frame, multi-frame/continuation, voice-over, VEO, overlay, poster, header).
  - `geminiService.ts` orchestrates generation and prepends config directives (ratio, name-board, language) + casting rules.
  - Config model: `src/types/aiPlatform.ts` (`AdFormData`, `AttireType`, `ModelGender`, `ATTIRE_OPTIONS_BY_GENDER`).
- The `cinematic-ads/` Step0–6 pipeline is a **separate** flow — untouched.
- Tests: `src/test/prompts.test.ts` (run `npx vitest run`). Note `tsconfig.app.json` has `ignoreDeprecations: "6.0"` which the installed tsc rejects — use `npm run build` (vite) as the build-truth, not `tsc -p`.

## Session — 2026-07-15 (10-item fix batch)
Requirements were about the AI ad generator. Female output is preserved by using **female defaults** on every new param.

1. **Male models (task 1).** Added `ModelGender` + `getModelProfile(gender)` (pronouns/nouns/jewellery/casting tier) + `getMaleGroomingBlock()` in `prompts.ts`. Threaded `gender` through `MAIN_FRAME_SYSTEM_PROMPT`, `MULTI_FRAME_SYSTEM_PROMPT`, `VOICEOVER_SYSTEM_PROMPT`, `VEO_SEGMENT_SYSTEM_PROMPT`, and the casting rules in `geminiService.ts` (male override at top of the user prompt + gender-aware CAMPAIGN/PROFESSIONAL rules). VEO line "sweet voice she needs to say" → "he needs to say" for male.
2. **No-logo still said "attached logo" (task 2).** Added `getBrandMark(noLogo, logoName)` → brand-mark abstraction (`the attached logo` vs a NAME BOARD). Threaded `noLogo`/`logoName` into MAIN_FRAME + MULTI_FRAME and replaced the frame "attached logo" references with `brand.ref`.
3. **Name board not rendering (task 3).** `buildNameBoardDirective(formData, businessInfo)` now fires whenever `noLogo` is set and **falls back to the business name** (`resolveNameBoardText`) when the user typed no name. Variant A renders a dedicated NAME BOARD PLACEMENT block.
4. **Saree said suit (task 4).** In `geminiService.ts` the TRADITIONAL and PROFESSIONAL attire rules are now **gated by the selected attire** (only one appears). Custom uses its own rule. `ATTIRE:` field is human-readable.
5. **Continuous suit colour drifting (task 5).** The multi-frame reference line now LOCKS attire/colour to the attached Frame-1 image ("EXACT SAME attire in the EXACT SAME colour … keep it perfectly identical to the attached image"). Removed the "may shift the suit tone" permissions.
6. **Custom attire (task 6).** New `AttireType.CUSTOM` + `customAttire` free-text. `getAttireMode(..., gender, customAttire)` returns the exact custom wardrobe; UI shows a textarea when Custom is selected.
7. **Templated scripts / languages (task 7).** `VOICEOVER_SYSTEM_PROMPT` is now language-aware (native script per `language`, language-aware CTA — the hardcoded Telugu CTA no longer leaks into other languages), applies the "simple English word in local script" rule to every language, and adds a BUSINESS-SPECIFIC SCRIPT RULE (no templates, pull real details from assets).
8. **2-clip 2nd frame (task 8).** Added a TWO-CLIP CONTINUATION FRAME block in `MULTI_FRAME_SYSTEM_PROMPT` (segmentCount===2) demanding a new natural pose + a different real, business-specific background.
9. **Overlays in Telugu → English (task 9).** `OVERLAY_TEXT_SYSTEM_PROMPT` now forces overlay text to ENGLISH regardless of voice-over language.
10. **Tech team lead notifications (task 10).** Team leaders are managers (assign/verify; no "do work" page), so their own assign→complete flow already notified them via `assignedBy`. Gap: they were out of the loop on admin-assigned work. Added `notifyTechTeamLeaders({ teamAdminUid, excludeUserId, … })` in `notifications.ts` (fans out to `tech_team_leader` users sharing the member's `createdBy`). Wired into `tech-member/MyWork.tsx` (on completion) and `tech-admin/WorkAssign.tsx` (on new assignment). FCM/`initFCM` and the notification bell are role-agnostic and already worked.

### Files touched
`src/types/aiPlatform.ts`, `src/services/prompts.ts`, `src/services/geminiService.ts`, `src/services/notifications.ts`, `src/components/ai-platform/AIPlatformApp.tsx`, `src/components/ai-platform/SavedItems.tsx`, `src/pages/tech-member/MyWork.tsx`, `src/pages/tech-admin/WorkAssign.tsx`, `src/test/prompts.test.ts`.

### How it was tested
- `npm run build` (vite) — clean.
- `npx vitest run` — 72/72 pass (added tests for gender/custom/name-board/overlay/multi-language; a "female == default" test guards the female path).
- Dev server boots (HTTP 200); scratch check confirmed no female-wardrobe leakage in male output and name-board renders.
- NOT end-to-end tested through the live Gemini generation (needs Firebase login + `VITE_API_KEY_*`), which this environment lacks.

### Follow-up — voice-over meta prompt refresh (same session)
Integrated the user's copywriting spec into `VOICEOVER_SYSTEM_PROMPT`: added OBJECTIVE / TARGET AUDIENCE / TONE / VOICE-OVER STYLE / WRITING RULES sections, a "15+ years TV/radio/Meta ads" role line, a real TV-commercial story arc (hook → problem/desire → solution → benefit → CTA) in commercial mode, richer CTA action vocabulary (call now / WhatsApp / book now / limited-time offer), and an expanded "avoid" list (Sanskrit-heavy/bookish words, long sentences, unnecessary English, AI-technical explanations, clichés). Kept it **language- and gender-parameterized** and preserved every contract the app depends on: exact clip/timestamp output format, 18-words-per-clip, no-spoken-number → on-screen call CTA, final-clip-only CTA, business-specific rule. Telugu-only cues (AP/Telangana, exact Telugu CTA line) are gated behind `isTelugu`.

### Follow-up — male model age 30–35 (same session)
Added gender-aware `ageYears` ("30–35" male / "20–25" female) and `ageYearsWords` to `getModelProfile`, and changed male `personYoung` from "young man" → "man". Replaced every hardcoded "20 to 25 / 20–25 / young" age cue in the frame prompts (MAIN_FRAME both variants, MULTI_FRAME clip-1 example, geminiService male override + PROFESSIONAL rule) with the profile values. Female stays 20–25; male renders age 30–35. Locked with a test.

## Session — Tech attendance, employment type & agreements
Three features (all built on existing check-in infra; new Firestore collections: `attendance`, `holidays`, `agreements`).

**A. Employment type (full/part-time).** Added `employmentType?: "full_time" | "part_time"` to `AppUser` ([types/index.ts]). Helper `src/services/employment.ts`. Per-member Full↔Part toggle badge lives on the **Team Attendance** page (both Tech Admin `/tech-admin/attendance` and Tech Team Lead `/team-leader/attendance`) and a read-only badge on the tech-member profile.

**B. Tech attendance.** `src/services/techAttendance.ts` — statuses `full|half|absent|leave|holiday`. Auto rule (in `resolveStatus`): manual override wins → Sunday/announced-festival = Holiday → future working day = null → checked-in = Full → today-not-checked-in = null (pending) → past-no-checkin = Absent. Videos are informational only (user's choice). Manual override + `announceHoliday` + leave quota (`MONTHLY_LEAVE_QUOTA = 2`). Only overrides (`attendance/{memberId}_{date}`) and holidays (`holidays/{date}`) are persisted; Full/Absent derived from existing `daily_checkins`. Admin/Lead grid = `src/pages/shared/TeamAttendance.tsx` (click any cell to override); member view = `src/components/attendance/MemberAttendanceCard.tsx` (in tech-member profile). Logic unit-tested in `src/test/attendance.test.ts`.

**C. Agreements (paste → beautify → sign → store).** Deps added: `jspdf` + `html2canvas`. `src/services/agreements.ts` (`agreements` collection, `sendAgreement`/`signAgreement` + notifications). Admin page `src/pages/shared/SendAgreement.tsx` (Tech Admin, Sales Admin, Tech Team Lead) — paste text, auto-fill Name/Mobile/Date from profile (`fillAgreementText` in `AgreementView.tsx`), preview, send. Member signs in their profile via `src/components/agreement/MemberAgreements.tsx` → `SignaturePad.tsx` (draw on canvas OR upload/photo → Cloudinary) → signature embedded in `AgreementView` → locked → PDF via `src/utils/agreementPdf.ts` (html2canvas+jspdf, multi-page A4). "Load DREAM TEAM template" button prefills the standard agreement.

Routes added in `App.tsx`; nav in `roleHelpers.ts` (Attendance + Agreements for tech_admin & tech_team_leader; Agreements for sales_admin).

### Follow-up refinements (same feature set)
- **Full-month grid:** `TeamAttendance.tsx` now uses `table-fixed` + `<colgroup>` so the WHOLE month (1→last day) fits the width on desktop; Sundays/holidays tinted in the header; small screens scroll. `daysInMonth(month)` is used unfiltered.
- **Holiday announce:** replaced the `prompt()` with a proper modal (date picker + name), a live list of this month's holidays, and remove (`deleteHoliday`).
- **Bulk agreements:** `SendAgreement.tsx` has Individual / Bulk modes. Bulk → pick Full-Time/Part-Time category → pre-ticked recipient checklist (already-signed/sent flagged) → sends each member their OWN personalized copy (auto-filled name/number). Per-category template remembered in `agreement_templates/{adminUid}_{category}` (`saveAgreementTemplate`/`loadAgreementTemplate`).
- **PDF/signature UX:** `AgreementView.tsx` highlights auto-filled Employee Name / Mobile / Date (amber chips) and renders a proper signature block (framed, signature image on a line with signed name + date beneath).
- **Admin views member agreement:** new read-only `src/components/agreement/AgreementListForMember.tsx` (view + download signed PDF) embedded in the member detail pages: tech-admin `MemberHistory.tsx`, tech-team-leader `MemberAssignments.tsx`, sales-admin `MemberSalesHistory.tsx`. New collection: `agreement_templates`.

**IMPORTANT follow-ups:** (1) **Firestore security rules** must allow read/write on the new `attendance`, `holidays`, `agreements`, `agreement_templates` collections or the features silently fail in production. (2) Native Android "take photo" uses the web file-input `capture` attr; a true native camera needs `@capacitor/camera` (not installed) + `capacitor.config.ts` — draw + upload work everywhere meanwhile.

### Follow-up — deactivate blocks login
Both Tech Admin & Sales Admin "My Team" pages already had the Active/Inactive badge + activate/deactivate toggle (`toggleActive` flips `users.isActive`). The gap was enforcement. Fixed: `src/pages/auth/Login.tsx` blocks sign-in when `isActive === false` (signs out + shows "account deactivated"); `src/hooks/useAuth.ts` upgraded from `getDoc` to a live `onSnapshot` on the user's own doc — a deactivation now signs the user out **immediately** (and role/profile changes reflect live). Strict `=== false` check so legacy users without the field stay active.

### Known pre-existing (NOT introduced here)
- `tsconfig.app.json` `ignoreDeprecations: "6.0"` breaks `tsc -p` (use vite build).
- Repo has ~57 pre-existing eslint `no-explicit-any` errors; lint is not part of the build. This batch added zero new lint errors.
- Header/poster prompts still reference a logo container in no-logo mode (frames are handled; header/poster left as a follow-up).

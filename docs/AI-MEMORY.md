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

### Follow-up — 10-item attendance/agreements polish batch
1. **AI formatting:** `formatAgreementWithAI(raw)` in `geminiService.ts` (uses callWithFallback); "Format with AI" button in `SendAgreement.tsx`.
2. **Delete sent agreements:** `deleteAgreement()` + confirm modal (signed ones show a stronger warning) in SendAgreement.
3. **"Load DREAM TEAM template" button removed** (template constant deleted; per-category bulk template memory still exists).
4. **MandatoryAgreementGate** (`components/agreement/MandatoryAgreementGate.tsx`, mounted in AppLayout, z-[55]): members/team-leads with unsigned agreements get a NO-CLOSE full-screen popup with AgreementView + SignaturePad embedded; queue advances until all signed; success screen offers PDF + Continue.
5. **DailyCheckinPrompt is mandatory** — X and "Later" removed; only Check In closes it.
6. **Attendance WhatsApp step:** after a manual status in TeamAttendance, a modal shows a prefilled editable message (Reason line for half/absent/leave) → wa.me to the member's own number; member also gets an `attendance_update` in-app notification.
7. **"P" (Present)** replaces "F" in attendance (ATTENDANCE_META.full.short + summary row).
8. **Deactivated members hidden** (`isActive !== false` filter) in TeamAttendance, SendAgreement, main-admin Sales/Tech Department, sales ScheduleNumbers/SessionHistory, Leaderboard, tech Dashboard/DriveManagement/SessionHistory/Tools — My Team pages still show them.
9. **UpdatePopup** (`components/layout/UpdatePopup.tsx`, AppLayout, z-40): centered popup for members on unread work_assigned / work_editing / attendance_update (last 24h), Open (marks read + navigates) / Later (session-dismissed, bell stays unread).
10. **Reassign work:** `services/workReassign.ts` + `components/work/ReassignWork.tsx` button/modal in tech-admin & team-leader MemberAssignments — moves assignment to another member (status→assigned, sessions/completion reset, `reassignedFrom/By/At` stamped), notifies both members.
11. **Tech member profile:** `components/attendance/MyDayCalendar.tsx` replaces MemberAttendanceCard (deleted) + the old Check-In History section — one calendar merging attendance status (P/H/A/L/holiday), check-in dots, work-done dots; month summary chips; clicking a day shows the full day story (check-in/out, videos, assigned/completed work list, day-report status, drive link).

### Follow-up — agreement Print replaces PDF download
Removed the html2canvas→jsPDF download pipeline entirely (`src/utils/agreementPdf.ts` deleted, `jspdf` + `html2canvas` uninstalled). New `src/utils/agreementPrint.ts` `printAgreementElement(el)`: clones the agreement paper into a body-level `.agreement-print-root`, waits for images (signatures) to load, and calls native `window.print()`; print CSS in `index.css` hides everything else (`body.printing-agreement`) and forces `print-color-adjust: exact` so highlight chips keep their colour. Native print = crisp vector text + reliable signature images (the old rasterized pipeline could drop remote Cloudinary images), and the dialog's "Save as PDF" still yields a PDF. All three views (MemberAgreements, AgreementListForMember, MandatoryAgreementGate success bar) now show "Print" instead of "PDF". Signature img in `AgreementView` upgraded: 68px, seated on the line (`object-left-bottom`), `mix-blend-multiply` so whitish photo backgrounds vanish into the paper.

### Follow-up — lead visibility + popup link audit
- **Agreements:** `watchTeamSentAgreements(senderUids[])` (chunked `in` queries) in agreements.ts; SendAgreement's sent list for a **tech_admin** now merges their own + all their team leaders' agreements, with a violet "· by <leader>" label on rows they didn't send (delete still available on all rows).
- **Attendance:** verified shared by design — `watchOverrides` filters by month only (no markedBy/team filter) and admin + lead resolve identical member rows, so lead-marked attendance already shows live for the admin. No change needed.
- **Popup audit:** all `work_assigned` / `work_editing` notifications now carry a `link` so UpdatePopup's "Open" navigates (6 page sites + orders.ts → `/tech/my-work`; admin's team-lead fan-out → `/team-leader/work-assign/<member>`). Targets confirmed: each notification goes only to the individually assigned person (assignee / assigner / that member's team leads with the assignee excluded).

### Follow-up — print clipped to 1 page (fixed)
Root cause: the app shell sets `html, body, #root { height: 100%; overflow: hidden; }` (keyboard handling), which at print time clips output to a single page. Fix in the `@media print` block of index.css: `height: auto !important; overflow: visible !important` on html/body/#root while printing, `.agreement-print-root` forced static full-width, and `img { break-inside: avoid }` so the signature never splits across pages. Remember this if any future print/PDF feature shows only one page.

### Follow-up — admin agreements safety net + deployment note
User screenshots from dreamteamos.vercel.app showed lead-sent agreements missing on admin + no Reassign for lead — both features exist locally; the DEPLOYED build was stale (remind user to push/redeploy to Vercel when testing). Hardened anyway: new `watchAgreementsForMembers(memberUids[])` in agreements.ts; SendAgreement (tech_admin) now merges sender-based + team-member-based watchers (deduped `allSent`), so every agreement addressed to the admin's team shows regardless of sender. Reassign for the team lead lives on Work Assign → click member → assignment card (`tech-team-leader/MemberAssignments.tsx`).

### Follow-up — permanent PDF download + shared agreements (replaces the print approach)
- **Shared list:** the team-member-based agreements watcher now runs for BOTH tech_admin and tech_team_leader (lead resolves team via `user.createdBy`), so both roles see the identical team-wide "Sent agreements" list, "· by <sender>" labeled.
- **Print removed → Download PDF restored, done right:** new `src/utils/agreementPdf.ts` `downloadAgreementPdf(el, name)` does REAL DOM pagination — AgreementView marks structure with `data-pdf="title|body|footer"`; blocks are distributed into true A4 page shells (794×1123 @96dpi), any block that would cross a boundary moves whole to the next page (no mid-line cuts), each page html2canvas'd individually into jsPDF. `agreementPrint.ts` + print CSS deleted; jspdf/html2canvas reinstalled.
- **Signatures perfect, permanently:** new `src/utils/signatureImage.ts` — `normalizeSignatureFile` runs at SIGN time in SignaturePad (upload path): whitish photo background → transparent, trimmed, ≤900px PNG. `normalizeSignatureUrl` runs at EXPORT time on `img[data-signature]` (CORS re-fetch → same pixel pass) so even legacy raw-photo signatures render clean in PDFs. Drawn signatures unaffected (alpha<20 guard).

### Known pre-existing (NOT introduced here)
- `tsconfig.app.json` `ignoreDeprecations: "6.0"` breaks `tsc -p` (use vite build).
- Repo has ~57 pre-existing eslint `no-explicit-any` errors; lint is not part of the build. This batch added zero new lint errors.
- Header/poster prompts still reference a logo container in no-logo mode (frames are handled; header/poster left as a follow-up).

## Session — 2026-07-21 (10-item cross-cutting fix batch: tech + sales)

**1. Attendance confirmation popup.** `TeamAttendance.tsx` (`src/pages/shared/`) now shows a rich "Attendance Recorded" popup (member/date/time-marked/marked-by/status) immediately after a manual status is applied, **before** the existing WhatsApp step — "Send WhatsApp Update" advances into the prior flow; "Done" just closes. Used by both tech_admin and tech_team_leader (shared page).

**2. Tech member Dashboard rebuilt as an attendance-only hub.** `src/pages/tech-member/Dashboard.tsx` no longer shows work-assignment stats/Active Work (that's `My Work`'s job) — it's now a hero check-in/out card (live elapsed-time ticker, phase-based gradient: pre/in/out), today's official attendance status chip, and the full `MyDayCalendar`. Still fetches `work_assignments` internally (unrendered) so `performCheckIn`/`CheckoutModal` keep reporting accurate pending/in-progress/video counts — don't remove that fetch, it's not dead code.

**3. Overlay-text sequencing bug (root-caused).** `outputs.voiceOverScript` is always formatted as time-range lines ("0-8: text", "8-16: text" — see `formatVoiceOverScript`), but `generateOverlayTexts` was handing that straight to the model and trusting its returned `"clip"` field. The model sometimes echoed the time range itself instead of a plain integer, and the UI's `.sort((a,b)=>a-b)` on non-numeric values silently misordered/mislabeled the "Clip N" groups. Fixed in `geminiService.ts`: a new `toNumberedClipScript()` re-labels the script into unambiguous "Clip 1:", "Clip 2:", ... before it ever reaches the model; `OVERLAY_TEXT_SYSTEM_PROMPT` (prompts.ts) now says to only ever COPY that number; and a self-healing pass in `generateOverlayTexts` coerces/clamps every returned `clip` to a real integer (inheriting the previous valid item's number if not) before sorting. `AIPlatformApp.tsx`'s render also does defensive `Number(o.clip)` coercion.

**4. Per-individual agreement view.** `SendAgreement.tsx` (shared by tech_admin/tech_team_leader/sales_admin) — the "Sent agreements" list now has a "View agreement of — [member]" filter dropdown (derived from the sent list itself, so it covers ex-members too) and an Eye/click-to-view action per row that opens the full `AgreementView` (signature + Download PDF if signed), reusing `downloadAgreementPdf`.

**5. Voice-over quality — native-speaker QA/self-refine pass (the permanent fix, not a prompt patch).** Root issue: `VOICEOVER_SYSTEM_PROMPT`/`VOICEOVER_REPAIR_SYSTEM_PROMPT` only ever enforced MECHANICAL rules (18-words/clip, CTA placement, no digits) — nothing checked whether the script actually sounded native vs. translated/literary. Added `VOICEOVER_QUALITY_REVIEW_SYSTEM_PROMPT(language)` in `prompts.ts`: a second model call acting as a strict native-speaker creative-director/copy-editor judge, checking for literal-translation artifacts, old/literary/Sanskrit-heavy vocabulary, unnatural flow, inconsistent tone, weak commercial copywriting, and generic/templated writing — returns `{ pass, score, issues, correctedScript }` and is instructed to always hand back its best polished version. Wired into `generateAdAssets` (geminiService.ts) as: draft → mechanical repair (existing) → this quality review → mechanical repair again on the corrected script (in case the rewrite drifted from the word-count contract) → final. Runs once (`MAX_QUALITY_REVIEW_PASSES = 1`), **only on AI-generated scripts** — never on a user's pasted custom script (which must keep the user's own wording). Also fixed a real latent bug found along the way: `VOICEOVER_REPAIR_SYSTEM_PROMPT` never received a `language` param and was hardcoded to Telugu (including the exact Telugu CTA sentence) regardless of `formData.language` — any repair pass on a non-Telugu ad could have silently forced Telugu phrasing back in. It's now fully language-parameterized like the main prompt. Both are covered by new tests in `prompts.test.ts`.

**6. Assignment ad-spec fields (model/attire/ratio/language) + WhatsApp requirements copy.** `WorkAssignment` type (`src/types/index.ts`) gained `modelGender`, `attireType`, `customAttire`, `aspectRatio`, `language`. Both `tech-admin/WorkAssign.tsx` and `tech-team-leader/WorkAssign.tsx` (near-duplicate files — no shared component, edited both) — Create New Assignment now has Model (Female/Male), Attire (gender-filtered, + custom text), Aspect Ratio (9:16/16:9), Language (Telugu/English/Hindi/Kannada/Custom, + custom text) reusing the *same* `AttireType`/`ModelGender`/`ATTIRE_OPTIONS_BY_GENDER` enums as `AIPlatformApp`. On Create, a WhatsApp-ready requirements message (business/category/duration/price + the ad spec + access code) pops up to copy or send directly to the assigned member's phone (team-leader version omits price — that page has no pricing UI by design, "leads don't see pricing"). `AIPlatformApp.tsx` now prefills **and locks** `gender`/`attireType`/`customAttire`/`aspectRatio`/`language` from the assignment (mirrors the existing duration-lock pattern) — each field locks *independently* only when the assignment actually specifies it, so pre-existing assignments (created before this feature) stay fully editable.

**7. Sales Approvals — totals + quick date filter.** `SalesApprovals.tsx` — added the same Today/Yesterday/N-days-ago/All-Days quick dropdown pattern already used in Work Assign (defaults to **Today**), alongside (not replacing) the existing exact-calendar `DashboardDayPicker`. Extended date filtering to the **Pending** tab too (previously unfiltered) — "Today" there also surfaces any older still-pending item so nothing awaiting verification is ever hidden, mirroring Work Assign's "today + incoming past" convention; Yesterday/N-days-ago/an exact date filter strictly. A total (₹) for the current tab+filter is always visible near the tabs (no selection needed); ticking pending items also shows the selected-subset's total in the bulk-action bar.

**8. Leaderboard — Career/Month toggle + monthly navigation + member restriction.** `src/pages/shared/Leaderboard.tsx` (shared by sales_admin/sales_member) — added a Career/Month segmented toggle (admin-only; sales_member is hard-locked to Month, can never see true all-time career totals — "career sales" formerly shown to everyone is the exact company-revenue leak the request called out) defaulting to **Month**, plus a month prev/next navigator (either role can browse past months) when in Month mode. The "Career Sales"/"Career Commission" columns, summary cards, and sort now dynamically read as "{Month} Sales"/"{Month} Commission" or true "Career" depending on the toggle — the existing Day/date-picker controls and all other columns are untouched, purely additive.

**9. Sales nav consolidated into dropdown groups.** `NavItem` (`utils/roleHelpers.ts`) gained an optional `children?: NavItem[]` — a group instead of a direct link. `sales_admin`: Analytics+Activity History+Session History → "Reports & History"; Team Chat+Meetings+Chat Monitor → "Communication"; Training Modules+Sales Scripts → "Training & Scripts". `sales_member`: Team Chat+Meetings → "Communication"; Training+Sales Scripts → "Training & Scripts" (no Analytics/Chat Monitor there to group — those items don't exist for members). `Sidebar.tsx` renders groups as an expand/collapse dropdown (auto-opens if it contains the active route; user's explicit toggle otherwise wins) in both the full desktop sidebar and the mobile drawer; the **collapsed** icon-only desktop rail flattens groups back into individual icons (no room for a label there, so nothing becomes unreachable — the grouping is a full-sidebar polish only).

**10. Sales member Settlements (new page).** New `src/pages/sales-member/Settlements.tsx` (route `/sales/settlements`, nav item added) — shows the member's last settlement, current unpaid sales/commission since it (reusing the exact same `computeCommissionInRange`/`paidThrough`/`earliestVerifiedSaleDate` helpers the admin side already uses), full payment history, and a "Request settlement" button. New collection `settlement_requests` + `services/settlements.ts` additions: `requestSettlement()` (writes the request + notifies the admin with a deep link to `/sales-admin/settlements?member=<uid>`), `memberPendingRequestsQuery`/`adminPendingRequestsQuery`, `resolvePendingRequests()`. Admin's `Settlements.tsx` reads the `?member=` deep link to auto-open that member, shows a "Settlement requested" badge on member cards with a pending request (sorted to the top), and auto-resolves the request when the admin pays.

**IMPORTANT follow-up:** the new `settlement_requests` collection needs Firestore security rules (read/write scoped like `commission_settlements`) added in the Firebase console, or the request feature will silently fail in production — same class of gap called out for `attendance`/`agreements` in the earlier session above.

### How this batch was verified
- `npm run build` (vite) — clean.
- `npx tsc -p` directly errors on the pre-existing `ignoreDeprecations` config issue (unrelated to this batch); ran `tsc --noEmit` against a scratch copy of `tsconfig.app.json` with only that one line removed — **zero new type errors**, the one error surfaced (`VideoCallManager.tsx` Capacitor `.Plugins` typing) is pre-existing and in a file untouched by this batch.
- `npx vitest run` — 86/86 pass (8 new: repair-prompt language-parameterization + quality-review-prompt content checks).
- NOT end-to-end tested through live Firebase/Gemini (needs real credentials this environment lacks) — logic verified via build/typecheck/unit tests and by reading the exact data flow end to end.

---

## Session — 2026-08-03 (The Hiring Link: offer → joining letter → login)

**What changed conceptually.** Becoming an employee used to mean an admin typed a password into a form and the person was instantly inside; paperwork happened afterwards, from inside the app, if at all. That is now inverted — **the paperwork is the door**. One candidate, one link (`/join/:inviteId`), three steps: read and sign the offer letter → read and sign the joining letter → receive the login. The Firebase Auth account does not exist until the joining letter is signed.

**Data model.** New collection `onboarding_invites/{id}` (`src/types/onboarding.ts`) — one self-contained document holding the terms the admin typed, **both letters rendered and frozen at creation**, the company signature, and the candidate's two signatures as they arrive. Nothing about the person exists anywhere else until they finish. `id` is 10 chars from a 32-symbol alphabet (crypto random, no look-alike characters); `accessCode` is 4 crypto-random digits.

**The candidate never touches Firestore.** Everything goes through `api/onboarding.ts` (serverless, service account) — actions `open` / `accept-offer` / `accept-joining` / `decline`, each re-checking the 4 digits, with the same 5-tries/15-minute lockout as the order chat. Because of this **no Firestore rule is opened to the public**, and the generated password is returned in an HTTP response rather than left in a document the browser can re-read. `publicView()` builds the projection by naming what goes out, never by deleting secrets; a test in `src/test/onboarding.test.ts` reads that function's source and fails if `accessCode`/`generatedPassword`/`failedAttempts` ever appear in it.

**Signing the joining letter is what creates the employee.** `provision()` writes, in one batch: `users/{uid}` (role, salary=ctcMonthly, `createdBy`=the inviting admin so existing team filters pick them up, `employmentType` only for full/part-time), `employee_profiles/{uid}` (all terms, stage derived from the joining date, **their uploaded signature stored so they are never asked again**, `termsSelfDeclared:false` + confirmed by the admin who typed them), **two `hr_documents` rows with `status:"signed"`** (so both letters land in the normal Documents tab), and `member_credentials/{uid}` (so the admin's existing 🔑 / Share-Credentials buttons work immediately). Idempotent: a transaction claims the invite, a second concurrent call waits for `createdUid` and returns the *same* credentials rather than making a second account; provisioning failure rolls the invite back to `offer_accepted` so the admin can fix it (e.g. `email_taken`) and the candidate can retry.

**Letters.** `utils/onboardingLetters.ts` shapes an invite into the `EmployeeProfile` the existing templates read, so an offer letter from a hiring link and one from the Issue Document dialog are byte-identical for the same facts — there is exactly one place an offer letter is worded. `hrTemplates.ts` extended to cover the full HR checklist: offer gained ref number/address/leave/confidentiality; the appointment letter gained bank-account + statutory deductions + pay day, shift, remote work, employee responsibilities, attendance/punctuality, conflict of interest, non-solicitation, background verification, amendment clause, governing law (India), Place, and its *own* notice figure alongside the ladder. New profile fields `salaryPayDay`/`shiftDetails` (NOT extras — `EXTRA_FIELDS.appointment_letter` is pinned to `[]` by an existing test, and these are standing facts anyway).

**Signatory titles changed** (`hrPolicy.SIGNATORY_TITLE`): `tech: "CTO (Tech Admin)"`, `sales: "CEO (Sales Admin)"` — was Technical Head / Sales Head. An admin's own `designation` in Settings still overrides it. `hrSignature.test.tsx` updated accordingly.

**UI.** `Add Member` on both `tech-admin/MyTeam.tsx` and `sales-admin/MyTeam.tsx` is now a two-option menu: *Onboard new employee* (the letters flow) and *Quick add, no paperwork* (the old form, kept **because external ad creators are not employees and must never be sent an offer letter**). `PendingInvites` sits above the team grid — deliberately outside it, so no count/payroll figure ever includes someone who has not accepted. `AccessCodeGate` was extracted from `ClientChat` and is now shared by both public pages.

**IMPORTANT follow-up:** `onboarding_invites` needs an admin-only Firestore rule set in the Firebase console — see `docs/firestore-rules-onboarding.md`. Same class of gap as `member_credentials`/`settlement_requests`. It holds a salary, and after completion a readable password.

### How this was verified
- `npx vitest run` — **1202/1202 pass** (49 new across `onboarding.test.ts` and `onboardInviteModal.test.tsx`).
- `npx tsc -p tsconfig.check.json --noEmit` — only the pre-existing `VideoCallManager.tsx` Capacitor error (confirmed pre-existing by stashing).
- `npx vite build` — clean.
- **Real browser (Playwright, 412px phone + desktop), API and Cloudinary stubbed at the network layer so nothing was written to the live project:** full journey — code gate → wrong code counts down and clears → offer letter renders → photograph-signature upload → signed state → **real 400 KB PDF downloads** → joining letter → sign → credentials screen with working reveal/copy → navigate back to a signed letter → reopen the link and not be asked to sign again → no horizontal scroll at either width. Edge paths: 5 wrong codes → lockout, expired offer, decline-with-reason, revoked link, unknown link. One real bug found and fixed: `AccessCodeGate` submitted from inside a `setDigits` updater (render-phase `setState` warning, double-submit risk in strict mode) — now computed outside. Console errors after the fix: **0**.
- NOT verified against the deployed serverless function (needs Vercel + the real service account); `services/onboardingGuest.ts` carries a `import.meta.env.DEV`-only fallback that performs the same steps in the browser so the flow can be walked locally.

## Session — 2026-08-03 (The company signs its own letters)

**What changed conceptually.** Two things that were never really the company's became the company's. First, its **identity** was a hardcoded TypeScript constant (`utils/company.COMPANY`) — moving office or adding an MSME number needed a developer and a deploy. Second, its **signature** was whichever admin happened to click Issue, so the same offer letter reached two candidates looking like it came from two different places. Both now live in `company_settings/main`, edited in **Settings → Company Documents**.

**Company record.** `utils/company.ts` stays pure (shapes + `resolveCompany()` merge rule + `officerOf`), `services/companyAssets.ts` is the thin Firestore layer over it and re-exports the pure names. The split exists so `hrPolicy` can decide who signs what without importing Firebase. `COMPANY_DEFAULTS` is the fallback, applied **field by field** — an admin who saves only an MSME number must not blank the address off every letterhead. `hooks/useCompany()` is the one subscription; `Letterhead` and `useCompanyLogo` read it, so a change of address updates every letter, ID card and payslip with no deploy. `COMPANY` remains exported as a deprecated alias (prints defaults, ignores Settings) so the few synchronous callers still compile.

**Who signs.** `hrPolicy.DOCUMENT_SIGNATORIES` maps type → offices: CEO on everything, **CEO + CTO on the NDA** (the CTO is affirming what counts as confidential technical material), **nobody on the policy acknowledgement** (it is the employee's own statement). `resolveSignatories()` falls back to the issuing admin when an office has no signature on file, which is what makes this shippable before Settings is filled in. Signatures are frozen onto the document as `HrDocument.signatories[]`; the old single `companySignatureUrl` is still written and still read, so documents issued before offices existed render unchanged.

**Real bug this created and fixed.** The company block used to read `For <company> — Authorised Signatory Signature:` and `AgreementView.signatureSide()` decided a line was company-side by matching the word "signatory". Naming the real office broke that match, and the failure is **silent** — the letter renders perfectly with an empty ruled box where the signature should be. `signatureSide` now also treats a leading `For …` as company-side. Pinned in `companySignatories.test.tsx`; the template tests assert the `^For .+ — .+ Signature:$` shape rather than the old wording.

**Documents.** 10 → 14 types. Added **promotion_letter** (split from increment: a role change is not a bigger number), **show_cause_notice** (asks before it concludes — sits *above* the warning letter, which is the due-process order), **resignation_acceptance** (fixes the last working day and records early release/waived notice), **full_final_settlement** (all figures already on `SeparationRecord`). `HR_DOCUMENT_GROUPS`/`HR_DOCUMENT_ORDER` in `types/hr.ts` are the single source of ordering — lifecycle order (hire → employ → discipline → part), used by the grouped dropdown, `documentTypesForStage`, and the register filter. **The ordering is load-bearing; do not sort these alphabetically.** `hrTemplates.test.ts` now iterates `HR_DOCUMENT_ORDER` rather than a hand-written list, so a new type is covered the day it is added.

**References.** `utils/documentRef.ts` (pure) + `allocateReference()` in `services/hrDocuments.ts` — `DTS/OFR/2026/0007`, allocated in a transaction against `hr_counters/{year}` (one doc per year, a field per type), **raced against a 6s timeout** because a Firestore transaction on an offline client retries rather than failing and would hang the Issue button. Baked into `bodyText` before storing, so the printed reference is the one in the register. A hand-typed offer-letter number still wins. New collection `hr_counters` — needs its rule.

**PDF.** `stampPageNumber()` writes "Page X of Y" as jsPDF vector text after each page image (skipped for single-page letters). Not rendered into the HTML because the count is not knowable until blocks are distributed.

**UI.** New `pages/shared/HrCenter.tsx` at `/{tech-admin,sales-admin,team-leader}/hr` (old `/agreements` paths still resolve to it; nav renamed "Agreements" → "HR & Documents"). Three tabs: **All documents** (new `AllDocumentsPanel` — search by person/type/reference/issuer, status filters, 12-per-page), **Missing paperwork**, **Agreements** (the old page, now `<SendAgreement embedded />` — kept whole because pasting somebody else's document verbatim is a genuinely different job). `CompanyMarksCard` slimmed to just badge republishing; its signature/stamp moved into the new `CompanyDocumentsCard`.

**Also fixed:** the CEO signature and company stamp were uploaded **raw** while employees' signatures got background-stripped — the company's own stamp was the one with a grey photo box around it. Both now run through `normalizeSignatureFile`. New `optimizeLogoFile` resizes a logo **without** background-stripping (that pass assumes ink on paper and would eat a logo's light areas). `HrDocument` gained `firstViewedAt`/`lastDownloadedAt`/`downloadCount`, written only when the *employee* opens it — an admin reviewing a warning letter must not leave a trace that reads as the employee having seen it.

**Deliberately NOT done** (proposed and declined/judged not worth it): template editor with versions (the user said not required); splitting Employment Agreement from Appointment and IP from NDA (merged versions already carry the clauses — splitting chases two more signatures for no legal gain); Transfer Letter (no transfer process exists); rewriting the PDF to selectable vector text (real improvement, large rewrite of a working pipeline).

### How this was verified
- `npx vitest run` — **1261/1261 pass** (59 new across `companySignatories.test.tsx`, `companySettings.test.tsx`, `documentRef.test.ts`).
- `npx tsc -p tsconfig.check.json --noEmit` — only the pre-existing `VideoCallManager.tsx` Capacitor error. `npm run build` clean.
- **Real browser (Playwright, Chromium, 1280px + 412px)** via a throwaway harness mounting the real components (the app is behind a Firebase login), deleted afterwards. **25/25 checks, 0 console errors:** NDA renders two distinct signature images in template order and presses the seal exactly once; offer letter one; policy acknowledgement none but still asks the employee; all 14 types render with no `undefined`/`NaN`/`Invalid Date`; **a real 5-page 2 MB PDF downloads carrying "Page X of Y"**; register search by person and by reference, status filters, pagination, and no stranding when filtering from a later page; no horizontal scroll at 412px. Separately **15/15** on the Company Documents card (every field present, live letterhead preview follows typing, no sideways scroll). One visual bug found and fixed: the seal was anchored to the top of the signature box and, with the longer office label, landed on the last word of it — moved down over the signature, which is where a stamp goes on paper anyway.
- **NOT verified against live Firestore** (no credentials): `allocateReference` writing `hr_counters`, and the Cloudinary upload path in `CompanyDocumentsCard`. Both are covered by unit tests and fail safe — a letter issues without a reference rather than not at all.

**IMPORTANT follow-up:** `docs/firestore-rules.md` is complete and now covers `hr_counters` — still **not published**. Re-verified 2026-08-03: `employee_profiles`, `hr_documents`, `company_settings`, `hr_counters` and `member_credentials` all return **HTTP 200 to unauthenticated reads**.

## Session — 2026-08-03b (Write the letter, then change it)

**What changed conceptually.** The document generator and the agreement sender were two halves of one job that could not talk to each other: the generator wrote a proper letter you could not touch a word of, and the agreement box let you write anything but started from nothing. **HR & Documents → Send a document** now joins them — pick any of the 14 document types and it is written from the employee's record straight into the editable box.

**Recipients.** `SendMode` is now `individual | multiple | everyone` (was `individual | bulk`). "Everyone" is its own mode rather than a Select-all inside "Choose people" — sending to the whole company is a different decision and should take a different click. The full-time/part-time chips remain as a quick way to pick people, but are **hidden in "Everyone"**, where a category filter would be a contradiction.

**The hazard, and how it is handled.** A letter generated from Asha's record and sent to eight people tells all eight of them Asha's salary. So `utils/agreementTokens.ts` (pure): sending to more than one person **tokenizes** the reference employee's own values out (`{{employee_name}}`, `{{salary}}`, `{{designation}}`, `{{joining_date}}`, …) before the admin ever sees the text, and `fillTokens()` puts each recipient's own values back at send time. Individual mode skips this — the letter is fully written and edited freely.

Tokenizing is **exact string replacement of values already known**, longest-first (so "Senior AI Ad Creator" is not matched as "AI Ad Creator" leaving a stray "Senior "). Values under 3 characters are refused — a designation of "QA" would match inside ordinary words and shred the letter. Anything that could not be tokenized is **reported** by `untokenizedPersonalValues()` and shown as an amber warning naming the values and the recipient count, because silence there is the dangerous choice. Round-trip is exact: `fillTokens(tokenizeForBulk(x, a), a) === x`, pinned by test.

**Agreements can now carry a company signature.** `Agreement` gained `letterhead`, `companySignatories[]`, `companyStampUrl`, `companySignedDate`, `templateType` — set **only** when generated from a template, absent on a pasted one, and frozen at send time like `hr_documents`. Without this a generated letter reached the employee with an empty ruled box under "For <company> — Chief Executive Officer Signature:" — a letter the company appears not to have signed. `companySideOf(agreement)` in `AgreementView.tsx` spreads the four props; it exists as one helper because forgetting one of them at a call site fails silently. Applied at all five render sites (`SendAgreement` preview + sent-view, `MemberAgreements`, `AgreementListForMember`, `MandatoryAgreementGate`), each of which also gained `useCompanyLogo()` so the letterhead survives PDF export.

**Do not** re-key the remembered bulk template (`agreement_templates/{adminUid}_{category}`) onto document type — it only auto-loads into an *empty* box, so it no longer fights the template dropdown, and re-keying would orphan what admins have already saved.

### How this was verified
- `npx vitest run` — **1274/1274** (13 new in `agreementTokens.test.ts`, including the round trip, the fragment case, the too-short-to-swap refusal, and "Ravi's copy leaks nothing of Asha's").
- `npx tsc -p tsconfig.check.json --noEmit` — only the pre-existing `VideoCallManager.tsx` error. `npm run build` clean. No new lint errors.
- **Real browser (Playwright, Chromium, 1280px + 412px)** via a throwaway harness, deleted afterwards. **22/22, 0 console errors:** selecting a document fills the editable box (8075 chars) and it stays editable; the bulk copy carries `{{employee_name}}`/`{{salary}}` and none of Asha's own values; switching recipient re-resolves to Ravi's ₹32,000 / Sales Executive with no trace of Asha's ₹25,000; **no raw `{{token}}` survives into a rendered letter**; an admin's typed clause reaches the recipient's copy; typing a personal name back in is flagged as shared; individual mode is fully written with no tokens; the generated agreement renders on the letterhead with the company signature and downloads as a real 712 KB PDF; no sideways scroll at 412px.

## Session — 2026-08-03c (Make it look like a document)

**The headline bug.** The downloaded PDF had **no letterhead at all** — not on page 2, not on page 1. `agreementPdf.ts` collected `[data-pdf="title"]`, the body children and `[data-pdf="footer"]` into its page shells and never collected `[data-pdf="letterhead"]` or `[data-pdf="letterfoot"]`, so a letter that looked properly headed on screen arrived as bare text with no company name, address or GSTIN. Page shells are now `display:flex; flex-direction:column` with the letterhead cloned in at the top and the foot rule at the bottom of **every** page, and the overflow test is `inner.scrollHeight > inner.clientHeight` (the content box) rather than the whole sheet.

**The document stopped looking like a web app.** `AgreementView` was rewritten to inline styles throughout: the amber "auto-filled" chips on Employee Name / ID / Mobile / Date are gone (a UI affordance leaking onto a legal document), the tinted rounded signature cards are gone, and the opening Ref/Date/Name/ID block renders as an **aligned label-value table** — how a formal Indian business letter opens. A signature is now an image sitting on a ruled line with the name, office and date beneath it. Nothing is boxed, tinted or rounded.

**Three real rendering bugs found by looking at the exported PDF, not the screen:**
1. **An orphan page carrying one word.** `META_LINE` (the labels absorbed into a signature block) did not list `Employee ID`, which *this session* had added to `EMPLOYEE_SIGNATURE_BLOCK`. Absorption broke at that line, leaving a bare `Date:` to flow on as body text and land on a sheet of its own. `Employee ID` added to the pattern and rendered inside the block.
2. **The internship training list rendered as eight bold section headings.** `isSectionHeading` runs on the *trimmed* line, so `  1. AI-assisted…` is indistinguishable from `1. Position and Engagement`. The raw line's indentation is now tested first: indented + numbered → a hanging-indent list item.
3. **The seal sat on top of the office label.** Fine when the line read "Authorised Signatory"; not once it reads "Chief Executive Officer". Moved down over the signature, where a stamp goes on paper.

Also added **keep-with-next** in the exporter: a `data-pdf="heading"` block (or trailing blank) is dragged onto the next page with the block it introduces, so a heading is never stranded at the foot of a sheet.

**Section numbers now number themselves.** `numbered(Section[])` in `hrTemplates` — `null` entries vanish and the rest renumber. The offer letter and appointment letter were converted. This exists because the internship section only appears for interns and hand-numbered headings would have read "5. Probation … 7. Leave". `internshipLetters.test.ts` asserts the numbers run 1..n for both an employee and an intern, and that an intern's letter has exactly one more section.

**Internships are written for the college, not the employee.** A student needs institutional permission before attending, and the person granting it wants evidence of structured training, not a stipend. `INTERNSHIP_SKILLS` (per department) + `internshipSkillsFor()` in `hrPolicy`; `internshipBlock()` in `hrTemplates` states that it is structured and supervised, the dates, the named mentor, the numbered training list, a completion certificate, and — explicitly — that the letter may be forwarded to the institution. Intern letters say **stipend**, never "salary", and the appointment letter's termination clause becomes "Completion and Early Termination". Two new profile fields: `internshipEndDate`, `internshipFocus` (NOT extras — `EXTRA_FIELDS.appointment_letter` is pinned to `[]` by a test, and these are standing facts).

**Employment terms fill themselves in.** `utils/employmentDefaults.ts` (pure): designation `AI Software Engineer`, location `Kakinada, Andhra Pradesh`, reporting to `Senior AI Software Engineer`, hours `10:00 AM – 7:00 PM`, days `Monday – Saturday`. Applied **on entering edit**, not on save, so the admin sees what will be stored. **Only blanks are filled** — and a **part-timer gets no hours/days**, because theirs are allocated. Working hours and days are now half-hourly / day-name **dropdowns**; `splitRange`/`matchTimeOption`/`matchDayOption` parse what free text already put in the database ("Mon-Sat", "10:00AM-7:00PM", "10 AM") so old records still open in the form instead of appearing blank and being overwritten.

**Check-out now gates on the upload.** The Drive reminder used to come *after* check-out and was dismissible with "I'll upload it" — the day was closed before anyone knew the work was missing, which taught the opposite of the rule. Order inverted: upload step → report → done. `utils/driveUpload.driveFolderPath()` shows the member's **actual folder for today** (`Rekha › August › Day 3 › Ad type`) rather than a generic example, states that unuploaded work is not counted, and Continue stays disabled until the declaration is ticked. Recorded on the check-in as `workUploadedConfirmed` / `workUploadedAt` / `workUploadedPath`. It is a declaration, not verification — the app cannot see inside a Drive.

**Delete from the register.** `AllDocumentsPanel` gained `canDelete` (tech/sales/main admin only — a team leader must not withdraw an admin's letter), with a harder warning for a signed document. Issuing is instant and lands in someone's account, so the wrong letter needed an undo.

### How this was verified
- `npx vitest run` — **1321/1321** (47 new across `internshipLetters.test.ts` and `employmentDefaults.test.ts`). Clean typecheck, clean build, no new lint errors.
- **Real browser (Playwright, Chromium, 1280px + 412px) — 36/36, 0 console errors**, plus the exported PDF was **decoded page by page and looked at** (a small script pulls the embedded JPEGs out of the file): letterhead + foot rule on all four pages, aligned reference table, no chips, no tinted cards, signature on a ruled line with the seal across it, page numbers, section numbers 1–10 unbroken with the internship block inserted, and the training list as list items. All 14 types render with no `undefined`/`NaN`. Terms form: defaults present, 49-option time dropdown, intern fields appearing only for an internship. Check-out: opens on upload, Continue disabled until ticked, today's real folder path shown.
- **Looking at the rendered PDF is now the only way to review this area.** All three rendering bugs above passed every on-screen check and every unit test.

## Session — 2026-08-03d (The internship curriculum)

**What the company actually trains interns on**, and therefore what the letters must say: generative AI, website design and development, AI chatbots, AI SaaS, AI agents, AI model development. The previous list described the ad business (scripts, voice-overs, video editing) and was wrong for the audience that matters.

`hrPolicy.CORE_TRAINING` holds the six, each written as a syllabus entry — subject, em dash, what is covered — because a college maps the second half to a course outcome and "Generative AI" alone gives them nothing. `INTERNSHIP_SKILLS.tech` and `.sales` both **open with CORE_TRAINING** and then continue into their own practical work: the same curriculum is taught whatever role someone joins in, but a sales intern's letter should not read as though they spend the placement training models. A test asserts `INTERNSHIP_SKILLS[dept].slice(0, CORE_TRAINING.length) === CORE_TRAINING` for both departments, and each subject is asserted **by name** — rewording the list while dropping one would otherwise still pass.

`internshipBlock` also gained two lines colleges specifically ask for: **how** the training is delivered (guided sessions per subject, then supervised live-project work), and an offer of the **periodic progress report / attendance record** institutions require *during* a placement — a student who has to request one after the fact often cannot get it in time.

**Change the curriculum in `CORE_TRAINING` only.** There is no second copy; every intern offer and joining letter renders from it.

### How this was verified
- `npx vitest run` — **1340/1340** (19 new). Clean typecheck and build.
- **Real browser, 12/12, 0 console errors**, with the PDF decoded and read: all six subjects present in both the offer letter and the appointment letter, for **both** tech and sales; the curriculum renders as a proper numbered list (not as bold section headings — see the previous session's bug); section numbers still run 1–10 unbroken; no sideways scroll at 412px.

## Session — 2026-08-03e (Print, and the logo size)

**The logo was sized by a 62px square box.** The real mark is a wide lockup (badge + company name beside it), so squaring it scaled the whole artwork down until it fitted 62px of *width* — a thumbnail next to 21px type. `LetterheadTop` now sizes by **height** (76px) with `width: auto` and `maxWidth: 210`, which is the dimension a letterhead cares about; a square mark and a wide lockup then carry the same visual weight. The `DTS` fallback tile grew to 66px to match.

**Printing added, alongside the PDF download and not instead of it.** The download photographs each sheet into a JPEG — identical everywhere, ~1 MB, text not selectable. Print hands the browser real text: crisper on paper, far smaller saved as a PDF from the dialog, copyable. Both are offered wherever a document can be opened.

- `utils/agreementPrint.ts` — `printAgreementElement(el)`. Clones the paper into a body-level `.agreement-print-root`, **lifts the letterhead and foot rule out into `.print-running-head` / `.print-running-foot`** so they can be pinned and repeat on every printed sheet (matching the exported PDF), normalizes signature backgrounds as the PDF path does, then `window.print()`; cleans up on `afterprint` with a 1s Safari fallback.
- `hooks/usePrintDocument.ts` — busy flag, unmounted-ref guard, toast on failure. Used at six sites; `IssueDocumentDialog` has its own handler because it must **open the preview first** (the paper does not exist until it is on screen), exactly like its download path.
- Print CSS lives at the end of `src/index.css`.

**Why the clone exists (do not "simplify" this):** the app shell is `html, body, #root { height: 100%; overflow: hidden }` for keyboard handling. Printed in place that clips output to exactly one sheet however long the letter is. The `@media print` block releases it with `height: auto !important; overflow: visible !important` — this is the same trap a previous session hit and documented.

**Bug found in the browser:** the running head/foot heights are measured to set the flow's padding, and `.agreement-print-root` is `display: none` on screen — so the measurement returned **0px** and the first paragraph would have printed underneath the letterhead. The root is now laid out off-screen (`position: fixed; left: -20000px`, inline styles beating the class rule) for the measurement, then cleared so the print stylesheet's `!important` rules take over. Measured at a deliberately **narrow** 640px so the header wraps sooner — erring towards extra space rather than an overlap — plus a 10px gap.

### How this was verified
- `npx vitest run` — 1340/1340. Clean typecheck and build, no new lint errors.
- **Real browser, 19/19, 0 console errors:** logo 76px tall / 207px wide and taller than the company name, fallback tile readable; print builds the root, marks the body, pins exactly one running head and one running foot, measures both heights non-zero, carries the whole letter and the signature, restores the page afterwards and leaves no second root behind; and the print stylesheet is asserted to release the fixed shell, hide the app, keep colours, avoid splitting a signature, and set A4.
- `window.print()` blocks headless Chromium, so it is stubbed with a probe that captures what the stylesheet is about to apply to — the DOM the browser would print is checked, not the paper.

## Session — 2026-08-04 (Corporate letter conventions)

**Asked whether numbered/point-wise sections are what an MNC actually does.** They are, for the *terms* — corporate offer and appointment letters are drafted as numbered clauses precisely so a term can be cited later ("as per clause 9"). Do **not** convert the clauses to prose. What was missing was the correspondence *around* them, which is where a generated document gives itself away.

Added to `letterHead()` in `hrTemplates`, so every one of the 14 types gets them:
- **`PRIVATE & CONFIDENTIAL`** — ALL-CAPS so `AgreementView` sets it as a marking. It must sit **after** the `Label: value` reference fields: the header block ends at the first non-matching line, so putting the marking above it would cut Ref/Date/Name out of the table the renderer builds.
- **A subject line** naming the role — `Subject: Offer of Employment — Associate AI Software Engineer`, via `subjectWithRole()`. Degrades to the base text when no designation is on record (never `— ` trailing).
- **`Yours sincerely,`** before the signature, emitted **once** in `COMPANY_SIGNATURE_BLOCKS` however many offices sign below it.

`letterConventions.test.ts` pins all three across `HR_DOCUMENT_ORDER`, plus the ordering (reference → marking → subject → salutation) and the single sign-off on a two-signatory NDA.

**Download + Print in the composer.** `SendAgreement` gained `composerRef` on the preview and a shared `withComposerPaper("download" | "print")` — the preview is forced open first, because the paper does not exist until it is rendered (the same trick `IssueDocumentDialog` uses). One `composerBusy` flag for both.

**A bug I introduced and caught in the PDF.** To keep the last line clear of the foot rule I relaxed the break test to `scrollHeight > clientHeight - SAFETY`. `scrollHeight` is defined as *at least* `clientHeight`, so that is true for an empty column — every block broke onto its own page and a 3-page letter exported as **37**. The clearance is taken off the column by giving the cloned footer `margin-top: BOTTOM_SAFETY` instead; the test stays a strict `>`. **Never relax that comparison.**

### How this was verified
- `npx vitest run` — **1349/1349** (9 new). Clean typecheck and build, no new lint errors.
- **Real browser, 8/8, 0 console errors**, and the PDF decoded page by page: marking rendered bold, subject naming the role, `Yours sincerely,` above the signature, the reference block still a table, correct ordering, all 14 types carrying the conventions with no `undefined`/`NaN`, and the page count back to 3 with section 4 moved whole to page 2 rather than crammed onto the foot rule.

**Still not done, deliberately:** a **CTC breakup annexure** (Basic / HRA / allowances / PF / gratuity → gross → CTC), which is the one remaining thing every MNC offer letter has and this one does not. `EmployeeProfile` stores a single `ctcMonthly` and nothing else, so any breakup would be invented figures printed under the company's signature. It needs the salary-structure percentages from the user before it can be built honestly.

## Session — 2026-08-04b (Ghosted exports, training periods, blank-signature copies)

**THE bug of this session, and the one most likely to come back.** Downloaded and printed letters rendered every heading solid and every ordinary sentence faded almost to the paper. Cause: `AgreementView` sets the document's ink colour as an **inline style on the paper element**, and plain paragraphs *inherit* it rather than declaring their own. `agreementPdf.newPage()` built each page shell as a fresh `div` carrying the paper's **className only** — so those paragraphs fell back to inheriting from `<body>`, which in the app's dark theme computes to `rgb(250,250,250)`. Headings survived because they carry explicit inline colours.

- **Fix in `agreementPdf`:** page shells prepend `src.style.cssText` before their own layout styles.
- **Fix in `agreementPrint`:** the print root pins `color` read off `getComputedStyle(paperEl)` (not a hardcoded constant), because the letterhead and foot are *lifted out of* the paper and stop inheriting from it.
- **It looks perfect on screen either way.** Verifying this area means exporting from the **dark** theme and measuring the rendered pixels — `final_test.py` decodes the PDF's embedded JPEGs and asserts that marked pixels (<240) average below 190. Ghosted pages average 200+; healthy ones came out at 97–115. **Do not use ink *density* as the metric** — a signature page is mostly white space and fails a density floor while being perfectly printed.

**Training period.** New profile fields `trainingMonths` + `trainingSalaryMonthly`; `hrPolicy.trainingTermsFor()` is the single place the rule lives. **The annual CTC is `ctcMonthly × 12` — the post-training salary alone, never a blend.** `remunerationLines()` in `hrTemplates` states the period, both salaries separately, the annual CTC, and then says explicitly that the training pay does not form part of it. Both fields are required for it to apply — a length with no rate is not a training period. Deliberately **separate from `probationMonths`**, which is an evaluation window driving reviews/stage/notice: someone can be past training and still on probation.

**Blank-for-signing copies.** `AgreementView` gained `blankForSigning` — suppresses signature images, the seal, and the "Awaiting signature" note (right on screen, wrong on paper someone is about to sign). Exposed as an "Include signature & stamp" checkbox beside Download/Print in `IssueDocumentDialog` and the `SendAgreement` composer. **It only affects what is taken away — an ISSUED document always carries the marks.**

**Internships.** `Duration: 3 Month(s) (Effective from 02/08/2026 to 02/11/2026)` via `monthsBetween()` + `shortDate()`; optional extension and early-termination clauses from `internshipExtendable` / `internshipNoticeDays` (defaulted to true / 7 by `applyEmploymentDefaults`); and the offer letter is titled **INTERNSHIP OFFER LETTER** rather than "Offer of Employment".

**Also:** Download + Print buttons added beside Send for signature in the composer (`composerRef` + `withComposerPaper`).

### How this was verified
- `npx vitest run` — **1375/1375** (26 new across `trainingPeriod.test.ts` and `internshipLetters.test.ts`). Clean typecheck and build, no new lint errors.
- **Real browser in the dark theme, 18/18, 0 console errors**, with the exported PDF decoded and its pixels measured: all three pages carry real ink; training period and both salaries stated; annual CTC is the post-training figure; marks toggle on and off; internship title, duration line and both clauses present.

**Still not done:** the CTC *breakup* annexure (Basic / HRA / allowances / PF / gratuity). Needs the company's salary-structure percentages — inventing them would print fabricated figures under the company's signature.

## Session — 2026-08-04c (Print rebuilt on the paginator; both officers sign)

**Print was fundamentally broken and the approach had to go.** It laid the document out as one long flow with the letterhead `position: fixed` so it would repeat, padding the flow by the measured band heights. CSS can reserve space for a fixed band at the **start of a flow and nowhere else** — so the title printed underneath the letterhead and the last line of *every* sheet printed underneath the footer. No amount of tuning fixes that.

Pagination moved into **`utils/documentPages.ts`** (`paginateDocument(paperEl) → { pages, stage }`), now shared:
- `agreementPdf` rasterizes each sheet into jsPDF.
- `agreementPrint` moves the sheets into the print root, sets `break-after: page` on all but the last, and prints them as real text.

A printed copy and a downloaded one therefore break in identical places, because they are the same pages. `@page { margin: 0 }` — the sheets carry their own margins, as they do in the PDF; a second margin insets them again.

**Do not reintroduce a fixed running header.** The `.print-running-head` / `.print-running-foot` machinery and the `--print-head-h` measurement are gone deliberately.

**Both officers sign everything.** `DOCUMENT_SIGNATORIES` is `BOTH_OFFICERS` (`["ceo","cto"]`) for all 14 types, by the company's instruction — including the policy acknowledgement, now countersigned as received. `resolveSignatories` still degrades to whichever office has a signature on file, then to the issuing admin.

**The seal** was 82px squeezed over the signature — unreadable *and* sitting on the name. It now has its own column (`paddingRight: 150`, `minWidth: 430` when a stamp is present) at 132px, roughly a real 40 mm stamp against 13.5pt text. A browser check asserts zero pixel overlap with the name/date.

**Full-time offers gained a Performance Review and Salary Revision section** — reviews at 3, 6 and 12 months and annually, with the explicit caveat that a review is not an automatic increase. **Full-time only**: promising a year of reviews to an intern on a fixed three-month term states a term the engagement cannot outlive. This is why `internshipLetters.test.ts` no longer asserts "intern gains exactly one section" — the intern gains the internship block and loses this one.

**ID card:** `/white_logo.png` (the band is black; the full-colour logo carried its own dark box), logo 28 → 46px, and a shared `SignaturePair` on **both faces** — holder left, company right, captioned `CEO · Authorised signatory`.

**`utils/awaitRendered.ts`** replaces the fixed `setTimeout(250)` before capturing a forced-open preview: polls animation frames until the ref has laid out. Used by the composer and the Issue dialog.

### Could not reproduce
The report that the composer preview and download ignore edits. A faithful replica of its state loop (load template → open preview → type → download) was built in the harness and **the edit propagated to both**. The fixed-delay race above was the one real defect in that path and is fixed; if it recurs after a redeploy, it needs a fresh reproduction.

### How this was verified
- `npx vitest run` — **1375/1375**. Clean typecheck and build, no new lint errors.
- **Browser, dark theme, 21/21 + 11/11, 0 console errors.** Documents: both signatures on all three sampled types, seal 132px with zero overlap, review clause present, composer edit reaching preview *and* download, exported pages all carrying real ink. Print: **4 sheets, each with its own letterhead and foot rule**, no stray fixed bands, `break-after` page/page/page/auto, `overflow: visible`, ink colour `rgb(30,41,59)`, content on every sheet, page restored afterwards.

## Session — 2026-08-04d (Signature panel, stamp ink, A4 print sheets, offer-letter clauses)

**Signatures are one panel, not a run.** `AgreementView` gathers every signature line up front into `signatureBlocks` and renders them **once, at the position of the LAST signature line** (`panelIdx`) — so prose between them (the ACCEPTANCE wording) still reads in its own place. `SignaturePanel`: employee/other on the left, company offices stacked on the right (CEO above CTO), **seal centred beneath the officer column**. Do not go back to rendering each block where its line falls.

**The seal was arriving in the PDF as a pale grey square.** `mix-blend-multiply` drops a photographed stamp's paper into the page on screen; **html2canvas ignores blend modes entirely**. `documentPages.normalizeMarkImgs` now runs the background-stripping pass over `img[data-stamp]` as well as `img[data-signature]` (it was signatures-only) and sets `mixBlendMode: normal` on the cleaned result.

**Printed sheets are `210mm × 297mm`, not `height: auto`.** Auto made the last page a short strip with the paper cut away beneath it. mm rather than px because 1123px = 297.05mm and that fifth of a millimetre pushes every page onto a blank one after it. `@page { margin: 0 }` — the sheets carry their own margins.

**The composer "not updating in real time" was `loadTemplate` calling `setShowPreview(false)`.** Pick a template → wall of text, nothing beside it → edit → nothing changes. The preview was always live; it was simply not on screen. It now opens on load and stays open. (A faithful replica of the state loop was built twice and the binding itself was never at fault.)

**Offer letter gained ten clauses**, all from the company's own list: employment type spelled out (`employmentTypeLine` — "Full-Time (Permanent, subject to successful completion of a 3-month probation)"), the office as a full address (`officeAddressLines`, from company settings), reporting time, **weekly off derived from the working-days range** (`weeklyOffLine`), notice period with salary in lieu, company property, intellectual property written out in full (it only referenced it before), background verification, offer validity, policy compliance.

**Work arrangement** — new `WorkArrangement` type (`onsite | hybrid | remote`) with `WORK_ARRANGEMENT_LABELS` and `WORK_ARRANGEMENT_TERMS` in `types/hr`. Dropdown in `EmploymentTermsCard`, printed by `officeAddressLines` into **both** the offer letter's Work Location and the appointment letter's Place of Work, each with the terms that follow from it. Blank on older records prints the location and nothing more.

### How this was verified
- `npx vitest run` — **1375/1375**. Clean typecheck and build, no new lint errors.
- **Browser, dark theme, 30/30, 0 console errors**, plus the exported PDF read page by page. Panel geometry asserted numerically: employee x=346 vs CEO x=718 (left/right), CEO y=2931 above CTO y=3102, same column to within 2px, seal below the CTO's block and centred on the column to within 90px, overlapping neither signature. All ten offer clauses present. All three work arrangements print their terms, on both letters. Print: 5 sheets, every one `210mm × 297mm`, `overflow: hidden`, each with its own letterhead.

### Still open
The user's offer-letter list started at an item **"1. … This should appear at the top"** whose description did not survive the message — never clarified, so nothing was done for it.

## Session — 2026-08-04e (Role ladder, work arrangement on the form, stamp aspect)

**A silent no-op worth remembering.** The work-arrangement `<Select>` "added" the session before never reached the form: the `.replace()` targeted a pattern that did not match (I assumed a placeholder had already been changed) and the script printed "ok" without asserting. The save path had landed, so the field was stored and unsettable. **Every scripted edit to a source file must `assert old in s` before replacing.**

**`utils/roleLadder.ts` — the technical career ladder.** `TECH_ROLE_LADDER`: Associate AI Software Engineer ₹5,000 / 15 days, AI Software Engineer ₹10,000 / 30 days, Senior AI Software Engineer ₹15,000 / 45 days (senior). Order is load-bearing — it is what `nextRole()` means. `termsForRole()` returns designation + `ctcMonthly` + `noticeDaysOverride` + `seniorRole` to merge into the form; the notice is written as this person's **override** because on this ladder the role *is* the reason. Everything is a starting point an admin can edit. `ladderFor()` returns `[]` for sales, which keeps its free-text designation.

- `EmploymentTermsCard`: designation becomes a `<Select>` of rungs (priced in the option label) plus **"Other / custom…"**, which reveals the free-text input and clears only the title — not the salary already agreed.
- `IssueDocumentDialog`: choosing **promotion_letter** seeds `newDesignation`/`newCtcMonthly` from `nextRole()`, and a `data-test="promotion-step"` note says which rung → which rung, or says plainly the person is off-ladder / at the top.

**Work arrangement + location.** The location field is asked for under **every** arrangement; only `WORK_LOCATION_LABEL` / `WORK_LOCATION_HINT` change (`Work location` → `Base office (for the days on site)` → `Base office (on record)`). A remote employee still has a base office: it is the address the letter is governed from and where they may be called in.

**`EMPLOYMENT_DEFAULTS.workLocation` is now the full postal address**, not "Kakinada, Andhra Pradesh". `officeAddressLines` gained a `looksComplete` test (a 6-digit PIN, or ≥3 comma-separated parts) — a complete address prints **alone**, otherwise the registered address is appended. Without it the letter printed the street twice.

**The stamp is sized by WIDTH (200px) with `height: auto, maxHeight: 150`.** It was `118 × 118`; the company's real stamp is a wide block of text, and a square box letterboxed it into an unreadable smudge. Round seals stay round, rectangular ones stay rectangular.

**Live annual CTC** in the terms form (`draftCtcHint`), from the post-training salary where a training period applies — the same rule `remunerationLines` states on the letter.

### How this was verified
- `npx vitest run` — **1387/1387** (12 new in `roleLadder.test.ts`). Clean typecheck and build, no new lint errors.
- **Browser, dark theme, 21/21, 0 console errors:** stamp 200×110 (wide, not square); the office address appears **once** in the letter body; the arrangement select offers all three and re-labels the location field each time; the three rungs are priced in the dropdown; picking Senior sets 15000/45 and Associate sets 5000/15; the annual figure reads ₹60,000 then follows an edit to ₹1,20,000; the salary stays editable after a role is picked.

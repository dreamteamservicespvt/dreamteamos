# DTS-OS — development history (newest first)

> Part of the project context (CLAUDE.md → Context map). Not loaded automatically: read it when you need
> the reason behind earlier work. Every finished task adds a dated entry at the TOP of the list below
> (CLAUDE.md §30 step 8). Detailed notes up to 2026-09-19 are in `docs/AI-MEMORY.md` (historical, read-only).

## 31. DEVELOPMENT HISTORY (concise; newest first)

- **2026-10-22 (night): the six fixes checked on a real ad, five more fixes** (`ai-ads.md` §17.2 steps 1, 3, 6, §24).
  The owner's §32 follow-up, done by Claude with the app's real engine (vite-node, live Gemini, 4 runs; the app's login
  needs a password Claude may not type), a logo whose name ("SRI SAI KRISHNA INFRA") differs from the sale's ("Sri Sai
  Constructions"), ChatGPT (pvt account) for frames 1–2 and one Flow clip (JPN account, Omni 1.1 Flash, 8 s, 12 credits),
  checked frame by frame and with Whisper. Held: the logo's name everywhere, the Diwali dressing on both frames / label /
  poster, faces the camera, no walk or turn, the namaskaram at its estimated time, flats / plots in English letters.
  Found and fixed: (1) a typed "… Kakinada-533005. Phone 98480 12345." lost the number but kept "Phone" — the spoken
  address said "కాకినాడ ఫోన్" (`unspokenNumbers` LABEL_BEFORE takes a bare Phone / Mobile / Cell / Tel / Ph. label; a
  doubled full stop collapses before spaces are tidied); (2) the hard-word swap సందర్శించండి → రండి left "ఇన్‌ఫ్రాను …
  రండి" (`everydaySpeech.findHardWords` flags "<place>ను [adverb] రండి" → "<place>కి", and the message says which case
  the place takes); (3) the director's "the model flat" became "she flat" (`motion.asSpokenOf` keeps "model" before
  flat / house / villa / plan …); (4) a phone written on the `Address:` line stayed inside the verified address and was
  printed in the label's address strip (`businessFacts.withoutContactTail`, also on the job's typed address); (5) **the
  Telugu greeting** — Whisper: Flow said 53 syllables in 7.98 s and cut the wish word శుభాకాంక్షలు (the greeting alone
  12 words / ~43 syllables, padded to 19 / 58 by the 17–20 contract). The owner kept the contract and dropped
  శ్రేయోభిలాషులు and హృదయపూర్వక: "{business} తరఫున మా మిత్రులు, కస్టమర్లందరికీ {festival} శుభాకాంక్షలు"
  (`prompts/festivalWish` WISH_AUDIENCE_TELUGU, WISH_DROPPED_TELUGU, checked in `wishAudienceIssues`). Files:
  `utils/unspokenNumbers.ts`, `utils/businessFacts.ts`, `services/prompts/everydaySpeech.ts`, `services/prompts/motion.ts`,
  `services/prompts/festivalWish.ts`, `services/geminiService.ts`; tests `realAdOct22.test.ts` (new, 11),
  `festivalWishAudience`, `festivalNames`. Tested: the related suites, typecheck 0, build ✅, full vitest (see §32). Not
  re-run live after (5): the next Flow clip must show the whole wish. Open (HANDOFF.md): the audit for the same kind of
  mistake elsewhere.

- **2026-10-22: AI ads, six fixes from the owner** (`ai-ads.md` §17.2 steps 1, 3, 4, 5, 6, §24, §25, §27). (1–2) A Telugu
  voice-over writes flat(s), slot(s), plot(s), villa(s), apartment(s), booking(s), arrangement(s) and facilities in
  ENGLISH letters ("your words + similar ones") and drops formal words (ఏర్పాట్లు, సౌకర్యాలు + 13 more with what people
  say). Root cause: an English word in Telugu letters is read with Telugu sounds, and the prompts asked for formal
  nouns. Fix in code on every final line (`utils/englishWords.withEnglishWords` in `speakableLine`), plus the prompt
  rule; live runs then showed the writer putting OTHER English words in Latin (2BHK, open, bank loan — run 1 stopped on
  the word contract, run 2 shipped "రెండుBHK … open plots" at 7/10), so the words that stay Telugu are enforced in code
  too (`withTeluguLetters`, one list that also writes the prompt's "stays in Telugu letters" line; "2BHK" → "టూ
  బీహెచ్‌కే", before numbers become words). (3) "Move only when the words need it", the owner's choice for EVERY cast
  (history 8 in `prompts/motion.ts`): the cast faces the camera and performs in place, gestures on their words, walks
  only when a line takes them somewhere (scene plan `walk` or `lineNeedsWalk`), never turns or rotates; the arc is
  retired, `Staging.inPlace`, `IN_PLACE_CAMERAS`, new negatives, `TURNS` refused in director actions, the walk hint ends
  "both stop, facing the camera", every pack's frame text, HERO_FRAME_POSE and READY FOR ITS CLIP, the Motu & Patlu
  catalogue lines (TS + JSON). Root cause: the 2026-10-05 dynamic pass asked for walking in most clips, turns, the arc and
  "natural body movement throughout". (4) The namaskaram exactly on the wish words (`utils/wishGesture` + `wishCue`,
  named by meaning and time; real-person templates too; `NAMASTE` refused from the director). It used to open the
  greeting clip, seconds before a Telugu greeting reaches its wish. (5) The festival's theme on every frame
  (`utils/festivalDressing`, stamped in code), the label (FESTIVAL THEME leads) and the poster (one "Festival:" line):
  one `festivalLook` per festival from the catalogue, 4 new festivals, client photos decorated without changes. Root
  cause: the decorations reached one frame variant only. (6) The final business name comes from the attached logo /
  card / flyer / board (`utils/businessName`, decided in `verifyExtraction`); the sale's name is a reference used only
  when no file shows one. Root cause: the brief called the sale's name authoritative and the extraction could not read
  the logo's text. Files: new `utils/englishWords.ts`, `wishGesture.ts`, `festivalDressing.ts`, `businessName.ts`;
  `utils/spokenNumbers.ts`, `adRequirement.ts`, `locationAssignment.ts`, `posterAdType.ts`; `services/geminiService.ts`,
  `prompts.ts`, `characterCatalogue.ts`, `characterPacks.ts`, `prompts/{characterAd,everydaySpeech,lowerThird,motion,
  posterConcept,realLocation,refine,scenePlan,scriptQa}.ts`; `types/aiPlatform.ts`; `docs/video-category-catalogue.json`;
  tests `adGenOct22.test.ts` (new, 27), `festivalAndNameOct22.test.ts` (new, 23, full pipeline on a fake Gemini), and
  updated `motionAndVeo`, `characterAdPrompts`, `adPipelineEndToEnd`, `spokenNumbers`, `posterRefineOct13`,
  `assignmentSpecPropagation`. Tested: typecheck 0 errors; full vitest 281 files / 4653 tests (one SMM UI load timeout
  in the parallel run passes alone); build ✅. Live Gemini (Telugu Diwali, a flats builder, no files): a voice-over-only
  run shipped in 52 s (17 / 20 words, Latin only flats / plots / arrangements / mariyu); full run 2 (139 s) found the
  BHK / open leak; full run 3 after the fix (205 s, 2.5-flash + 3.8-flash): Latin only flats / plots / arrangements /
  mariyu, 18 / 20 words, no clip walks, no arc, the greeting's "Exactly as she says the festival wish (about 6–8s) …
  namaskaram", both frames `FESTIVAL DRESSING — DIWALI`, the label's FESTIVAL THEME, the poster's Festival line, the
  sale's name used (no files). Not seen: any image or Flow video from the new prompts.

- **2026-10-22: no pincode, door number or phone number in the voice-over** (`ai-ads.md` §17.2 step 3 and the
  Spoken-word rules). The owner: the voice-over scripts carried PIN codes, door numbers and phone numbers, which they
  had said are never needed. Root causes: the prompts forbade phone numbers but nothing in code held it, and
  `spellOutNumbers` (run on every shipped line) read a phone number aloud digit by digit, a pincode as lakhs and a
  door number as numbers. The presenter prompt's BUSINESS ANALYSIS also still said "contact number only if actually
  provided and only in the final clip", and `spokenAddressOf` missed an unlabelled door number ("5-87/1 Main Road")
  and a spaced pincode ("Kakinada-533 001", "Pin: 533 001"). Fix: new pure `utils/unspokenNumbers`
  (`withoutUnspokenNumbers`, `hasUnspokenNumbers`) run first inside `speakableLine`, so every generated, repaired,
  refined, final or pasted line loses them with their label, Telugu case ending and joiners. It keeps prices, offers,
  years, times, "24/7", rankings and road names. `spokenAddressOf` runs each part through it and cuts a hyphen- or
  slash-shaped leading door number. The writer, repair, review, character and refine prompts name pincodes and
  door numbers, and the conflicting line was removed. Files: `utils/unspokenNumbers.ts` (new), `utils/spokenNumbers.ts`,
  `utils/spokenAddress.ts`, `services/prompts.ts`, `services/prompts/characterAd.ts`, `services/prompts/refine.ts`,
  tests `unspokenNumbers.test.ts` (new), `prompts.test.ts`. Tested: unit tests in Telugu and English (phones, pincodes,
  door numbers, digit-word runs, what is kept, idempotence, through `speakableLine` and `spokenAddressOf`). Full vitest
  279 files / 4601 tests: 4 failed in the parallel run; the 2 prompt tests asserting the old wording were updated, the
  other 2 are load timeouts that pass alone. Typecheck 0 errors, build ✅. No live Gemini run.

- **2026-10-22: Paste Flow accounts + "Opening day not set"** (`ai-accounts.md` §9.21, §24; `data-model.md`). The owner
  had ~87 Flow accounts in a sheet (logins without "@gmail.com", rows without a password, a password wrapped onto the
  next line, the block pasted twice, no opening days) to add as the tech admin, skipping ones already there. Claude may
  not type passwords, so the tech admin's **Paste accounts** box takes the list once: new accounts are added as the
  paster's with no phone and no opening day; existing ones are untouched except that a missing password is filled.
  Accounts may now have no opening day: no expiry, no cycle, not usable, credits refused until it is set on Edit, counted
  apart on the Overview. Files: `utils/flowCredits.ts` (`hasOpeningDay`, `parseFlowAccountPaste`, guards in `expiryOf` /
  `nextResetOf` / `cycleFiguresOn` / `accountState` / `usageDateProblem` / `teamTotals`, `validateFlowAccountInput`
  options), `services/aiAccounts.ts` (`importFlowAccount`, shared `newFlowAccount`), `components/ai-accounts/
  PasteAccountsDialog.tsx` (new), `FlowAccountsList.tsx`, `FlowAccountDialog.tsx`, `CreditUsageDialog.tsx`,
  `pages/shared/AiAccounts.tsx`, `pages/tech-member/MyAiAccounts.tsx`; test `flowPasteOct22.test.tsx` (11). Tested: the
  AI Accounts tests on the in-memory Firestore; the real page in Chrome on a throwaway harness (paste preview, add,
  re-paste fills only a missing password, a member's account untouched, Edit dates an undated account with no phone).

- **2026-10-19 (late night, 3): departed members hold no numbers; requests reach the requester's admin** (`sales.md`
  §9.3, `data-model.md`). Live, after the owner pushed number requests: 9885719740 showed "Now with another member" and
  the sales admin had nothing to approve. Read-only in Kusuma's page: the holder (lead "C39") has NO `users` document —
  a deleted member — so no name and `salesAdminId: null`; the same gap had let the duplicate resolver freeze her own
  lead in that member's favour. `findNumberHolding` (active holder + `leftLeadIds`; deleted or switched-off = left),
  `requestNumber` gives a number held only by departed members at once (closes their leads `member_left`, closes her
  waiting request), the button reads Take it back / Take this number; `resolveNonSaleDuplicates` closes a departed
  member's unsold lead instead; `requesterAdminId` + the merged admin listener. Tests in `numberRequestsOct19` (+4).

- **2026-10-19 (late night, 2): number requests — who holds a number, and asking for it** (`sales.md` §9.3,
  `data-model.md`, `roles-routes.md` §8.2, `backend-security.md` §18, `docs/firestore-rules.md`). The owner, after the
  live check of 9885719740: the screen said "another member" without a name, and she could do nothing. Decided with
  the owner: request everywhere a colleague blocks a number; a SOLD number only the sales admin gives (the holder's
  sales stay on their closed lead); on approval her old hidden lead comes back. New `number_requests` collection,
  `utils/numberRequest` (id, `mayDecideNumberRequest`, `leadHasSale`), `services/numberRequests` (`findNumberHolder`,
  `requestNumber`, `decideNumberRequest` — one transaction moves leads + lock; listeners), `components/sales/
  NumberRequests` (`NumberRequestAction`, `NumberRequestsPanel`), wired into My Leads (hidden-number line, Add Custom
  Lead's blocked answers now in the box, the holder's panel) and Leads Management (the sales admin's panel); lock
  timeline action `transferred`; `numberLock.buildLeadData` exported. Test `numberRequestsOct19` (8); full suite,
  build, typecheck 0; the flow driven at 390px in the local harness.

- **2026-10-19 (late night): My Leads fast for a big list; search on any day; "already yours" that showed nothing;
  deadline alerts once** (`sales.md` §9.3, `orders-work.md` §16, `backend-security.md` §18). The owner, from Kusuma's
  phone (2,173 leads, 1,739 sales): slow to open, "Creating…" hangs, a tiny search that only searches the chosen day,
  +919885719740 "already in your leads" but not in the list, deadline alerts all day. Measured live (read-only, her
  session): 6.2 s to the list; the duplicate scan — ~218 `in` queries at once on EVERY visit — finished after 51 s and
  held the connection; the number's lead was frozen `duplicate_resolved` while its lock still named her. Fixes: the scan
  once per session (`salesLeadsStore.duplicateScan`), 1.5 s after open, 6 queries at a time; search skips the day window
  (Leads and Sales) with "Searching all days"; one filter layout on Leads, Sales and the new Duplicates filters
  (`FilterBar`: the search on its own full row on a phone, dropdowns half-and-half below; one row from `sm`); Sales 20 at a time, Duplicates 10; deferred + memoized filtering, each lead's day computed once; Add
  Custom Lead checks her own leads first and opens the one it finds; `claimNumber` own-lock branch → `held_elsewhere` /
  re-add when the lead is gone; a searched hidden number is explained; upsell to a frozen lead explained;
  `work_deadline_*` sent with `once` on the existing key (`_ext` after an extension). Files: `MyLeads.tsx`,
  `numberLock.ts`, `duplicateLeads.ts`, `upsell.ts`, `orders.ts`, `salesLeadsStore.ts`. Tests `myLeadsClaimOct19` (4),
  `deadlineOnceOct19` (2); full suite, build, typecheck 0; the phone-width UI in a local harness on fake data.

- **2026-10-19 (night): the Leaderboard's incentives back to plan rate × verified money, no target check**
  (`sales.md` §9.4, `people.md` §9.14). The owner, after the entry below: the board must show, as before 15 Oct, Day
  Incentives / the month's / Career commission = 5% or 10% × the verified money collected in the window, with no 75% target
  check, and the "so far" line and the Sales Payroll note removed. `Leaderboard.calcCommission` now passes `dailyTarget: 0`
  to `commissionInWindow` (no gate; the rate of each period's plan). The evening's `todayStr` / `accruing` in
  `utils/salesPay`, the `SoFarNote`, the Payroll note and `leaderboardSoFarOct19` were reverted. Payroll, Settlements,
  My Salary and the Dashboard keep the 75% gate. Test `leaderboardNoTargetOct19` (3: Kusuma ₹8,551 at 5%, Pavani 10% of
  verified only, Govardhan ₹2,370); full suite, build, typecheck 0.

- **2026-10-19 (evening, superseded the same night): the Leaderboard's incentive while the period runs** (`sales.md` §9.4, `people.md` §9.14). The
  owner's screenshot (19 Oct): "Oct 2026 Comm." ₹0 for Kusuma (₹1,71,018 collected) and Pavani (₹52,736), ₹2,370 for
  Govardhan (₹47,400). Cause: `commissionInWindow` judged the 75% gate on the RUNNING period's money so far against the
  whole period's target; the two with a daily target were under it nine days in, Govardhan has no target (nothing
  withheld). The gate is decided when a period ends, and every other sales screen (My Salary, Dashboard, Settlements' list)
  already showed the incentive "so far". Fix: `commissionInWindow({ todayStr })` returns a running period's under-gate
  incentive as `accruing`; the Leaderboard adds it to the Day / Month / Career cells with "so far · at 75% target"
  (`SoFarNote`) and says so in its footer; an ended period under 75% stays ₹0. Similar: Sales Payroll's row showed a
  withheld ₹0 with no reason — now "₹X at 75% of target" under it (what is paid is unchanged). P&L unchanged (no
  `todayStr`). Files: `utils/salesPay.ts`, `pages/shared/Leaderboard.tsx`, `pages/sales-admin/Payroll.tsx`, new test
  `leaderboardSoFarOct19` (4). Full suite, build, typecheck 0; real-browser harness at 390 / 1280 px.

- **2026-10-19 (afternoon): Development OS — the owner's screenshots** (`devos.md` §9.23, `roles-routes.md` §10,
  `data-model.md`). (1) **"Being graded" stuck for hours**: a written answer was graded inside its own `answer` request; a
  baseline answer needs two judges, so on a slow day the request hit Vercel's 60 s and the answer waited for the next cron —
  holding the baseline, the plan and Career behind it. Now `answer` / `submit` take `defer` (saved + queued at once) and the
  browser asks a new `grade` action (`learner.gradeMine`: own answers / practicals only, one per request, a one-minute
  claim `gradeClaimAt`) from any screen showing one waiting (`components/devos/useAutoGrade`; the shell while
  `stats.pending > 0`). Label "Grading…"; Home says "Baseline done — grading…"; a grading task card opens its answers.
  (2) **No result between questions**: "Submit and next"; the summary reveals every answer ("Your answers": worked
  solution, coach, appeal), plus XP / badges / "Fresh try now". (3) **Career told a Basic person "You hold the top rank —
  Ultra Pro Max"** while their baseline was open (a null evaluation fell to the else) — now "Finish your baseline first"; the
  top card only at rank 6. (4) Ranks as a **timeline** with **badge pictures** (`kit.RankEmblem`: Bronze → Elite), gates as
  a numbered flow, History as a day-by-day timeline. (5) **Profile** (`/dev-os/profile`): the onboarding answers (stored,
  never shown) and the track, editable (`profile.update`, effective-dated, audited `self_set_track`; shared controls
  `PreferenceFields`). (6) **Back buttons go back** (`kit.BackButton`; Play's Leave). Tests: `devosRevealAtEnd` (5), full
  suite 273 files green, build, typecheck 0, `api/devos.ts` parsed; real-browser harness on `memoryFirestore`.

- **2026-10-18 (evening): the audit work is live; the Firestore rules PUBLISHED; public sign-up off**
  (`backend-security.md` §14 / §25 / §27, `roles-routes.md` §8.1, `docs/firestore-rules.md` Status, CLAUDE.md §32 / §33).
  The owner pushed `802f09a` (with a88759a, 0ae2c2b, 4037758, 49d224c); Vercel build `1792320604656`. Checked live:
  `/api/send-notification` and `/api/staff-account` → 401 without a token, `/api/devos` GET → 200 (a tick, 0 errors).
  Then, at the owner's request, in the owner's Chrome (the `dts-manager` console): the live rules were
  `allow read, write: if true` — **anyone could read, write and delete the whole database**. Replaced with the block in
  `docs/firestore-rules.md` (put into the editor from `main` on GitHub, verified identical, 29,102 chars) and
  published; Authentication → Settings → User actions → "Enable create (sign-up)" unticked (Email/Password is the only
  provider; no Anonymous). **Tested from outside:** anonymous list on 12 sensitive collections → 403, an anonymous write
  → 403, `public_badges` → 200 (by design, G8). **Not tested:** the ten in-app checks with real logins (no production
  test logins). HANDOFF.md closed. Note: the repo is public and the owner's commit `802f09a` added HANDOFF.md, which
  described the open database — it is deleted from the tree, still in history.

- **2026-10-19: whole-app audit — defects fixed and checked in a real browser** (`people.md` §9.16 / §24,
  `roles-routes.md` §8.1 / §10, `orders-work.md` §16). From a full-app harness (the REAL `App.tsx`, login, guards and pages
  on `memoryFirestore`; 11 seeded accounts) swept per role × route, then driven by hand in Chrome. **D-01** main admin
  StatCards stuck at 0 (`useAnimatedCounter` animated once, from the first — empty — value; now re-animates on every new
  target, reduced motion respected). **D-02** the Dashboard's "Today" figures were all-time. **D-03** Accounts' net profit ≠
  P&L (both now `profitAnalytics`). **D-04** external creators counted as staff (`roleHelpers.isStaffMember`). **D-05**
  "revenue" meant four different things — now ONE rule: approved sales on their own India day, pending shown beside it
  ("Awaiting approval: ₹X (n sales)"), rejected nowhere, tech value never inside it; Revenue Overview + Revenue Summary
  rebuilt on `utils/revenueReport`, 7 / 30 days = calendar days (owner-delegated decision 2026-10-18). **D-06** Work Assign
  called every delivered SOLD ad "created with no sale behind it" (`adPipeline.orderOffQueue`). **D-07** HR's document-type
  select overflowed a 390px phone (`AllDocumentsPanel`: full width on phones). **D-08** another role's URL landed a signed-in
  person on the sign-in form (`AppLayout` → `defaultRouteForUser`). **D-09** breadcrumbs showed slugs ("Hr", "Dev Os") —
  `roleHelpers.breadcrumbLabel` uses the menu name. Found by hand in Chrome: the four revenue charts repeated axis labels
  ("₹0k ₹1k ₹1k ₹2k ₹2k" — `formatters.formatRupeeAxis`), and **My Leads listed a sold lead twice** (and counted it twice)
  when it was still "Not Called" — it was both "worked today" and "uncalled from an earlier day" (`applyDayWindow` dedupes).
  Two test suites still expected a push with nobody signed in (`notificationDedupe`, `notificationInboxOct13` — since
  `4037758` a push needs the member's ID token); their firebase mock now has a signed-in user. **Tested:** new
  `auditFixesOct19` (12) + updated `commissionRuleOct15`; full `npx vitest run` 272 files — only the pre-existing
  `smmDeliveryControlUiOct15` failure; `tsc` 0 errors; `npm run build` ✅. In Chrome (the harness): the full sale → Sales
  Approvals → Orders → assign → My Work (code, studio, Flow-credit step, Drive step) → Review & Verify flow, Revenue
  Overview 7D / 30D / All, Accounts = P&L, the dashboards' figures after the sale, breadcrumbs, a tech member opening
  `/tech-admin/dashboard`; a headless sweep of every role × route at 1920 / 375 and 1366 / 360 (no overflow or clipping,
  every forbidden route → the person's home). Not checked: live Firebase, Gemini, push.

- **2026-10-18 (later): the Firestore rules audited against the app; staff logins made on the server**
  (`backend-security.md` §12; `docs/firestore-rules.md`). A static audit compared every rule in `docs/firestore-rules.md`
  with all 664 Firestore accesses in `src/` (no emulator: no Java on this machine). Publishing the rules closes the
  anonymous exposure (everything 403 except `public_badges`). **Fixed before publication:** B1 a tech member could not
  add a Flow account (the transaction reads the new id; rule now `resource == null ||`); B2 logout removed the device's
  push rows AFTER signing out (refused, so a shared Android phone kept the last person's pushes) — now before
  (`Sidebar.tsx`); B3 the client's presence heartbeat writes `activeAt`, which the guest rule did not allow. **G1
  (critical, after publishing):** any self-registered Firebase account passes `isStaff()`; browser account creation
  needed public sign-up on — staff logins are now created by the new `api/staff-account` (Admin SDK, admin-only,
  `CAN_CREATE`), so the owner can switch public sign-up OFF. Still open (owner + a tested rules change): G2 any staff
  member can rewrite their own `users.role`; G3 the HR collections' own rules are shadowed by the catch-all; G4 pay,
  attendance, notifications, fcmTokens open to all staff; G5–G11 guest calls / chat history / badges / settings (the
  full list is in the handoff and the report). **Files.** `api/staff-account.ts` (new), `src/services/secondaryAuth.ts`,
  the three add-member pages + `onboardingGuest.ts` (role passed), `src/components/layout/Sidebar.tsx`,
  `docs/firestore-rules.md`; test `staffAccountOct18` (14). **Tested.** tests pass, tsc 0, the API parsed.

- **2026-10-18 (later): security — the push endpoint, key leaks, and the open database** (`backend-security.md` §12, §26;
  CLAUDE.md §32 / §33). Part of the owner's whole-site audit ("YOUR MISSION … security engineer …"). **Found.**
  (1) `api/send-notification` pushed to any `userId` for any caller — anybody on the internet could ring a staff
  member's phone with any text or a fake incoming call. (2) `services/geminiService.ts` printed every Gemini key's first
  6 and last 4 characters to every user's browser console ("DEBUG … remove after verification"). (3) `services/gemini.ts`
  — dead code (no callers) holding a hard-coded Gemini key. (4) **Production Firestore answers UNAUTHENTICATED list
  requests on every collection probed** (`employee_profiles`, `member_credentials`, `users`, `leads`, `payroll_lines`,
  `orders`, `flow_account_secrets`, `devos_users`, `notifications`; checked with a field mask so only document names came
  back) — the rules in `docs/firestore-rules.md` were never published. **Fixed.** (1) The endpoint takes only an active
  staff member's Firebase ID token (401 / 403 otherwise; `Authorization` allowed in the preflight) and
  `sendNotification` sends it (nobody signed in → no push; the bell row is still written). (2) The key logging is gone
  (a plain warning only when no key is configured). (3) The file is deleted — the key stays in git history and must be
  revoked. (4) Needs the owner: publish the rules (an audit of the rules against every app access was run first — see
  the next entry / the report). **Files.** `api/send-notification.ts`, `src/services/notifications.ts`,
  `src/services/geminiService.ts`, `src/services/gemini.ts` (deleted); test `sendNotificationAuthOct18` (7: no token,
  bad token, guest, switched-off, staff ok, preflight; the app sends its token / none when signed out). **Tested.**
  The test + `pushNotifications` pass; tsc 0; the API parsed.

- **2026-10-18 (later): the Development OS runs with nobody involved** (`devos.md` §9.23 the tick, §25; `backend-security.md`
  §12, §21; `data-model.md`). **Ask.** The owner: "the platform … needed to be run 0% of human involvement … if there is
  time for us then only we will involve." **Where it still waited for a person:** the tick needed `CRON_SECRET` set in
  Vercel plus a cron-job.org job (neither set — so nothing ran unless someone opened the app); an appeal the graders
  could not answer was "sent to an admin to review" and nothing ever picked it up; tampering was found only when an admin
  pressed Integrity (and its rebuild still counted a forged, unsigned XP row). **Fixed.** (1) The tick runs OPEN without
  `CRON_SECRET` — at most one run per 20-minute slot for the whole company (`tick.claimTickSlot`, a transaction on
  `devos_runs/open`; a repeat within a minute on a warm instance is answered before any read), woken by SEVEN daily Vercel
  crons on the hour (06:30 roll-over, 09:30 quest-ready, 11:30, 13:30, 15:30, 17:30 still-waiting, 20:30 Saturday league
  close); with the secret set it is required, as before. Each run records what woke it (`trigger`); the Automation tab
  says "Runs by itself — nothing to set up". (2) A pending appeal is queued (`kind: "appeal"`) and decided by the tick
  (`review.resumeAppeal`, bounded; after the tries the original stands), the person told; lost ones re-queued each
  morning. (3) Every morning every profile's signature is checked (no extra reads) and a tampered one rebuilt from its
  signed ledgers (`admin.checkPerson`, shared with the Integrity button, audited); ledger rows with a wrong or missing
  signature are left out of the totals. **Files.** `api/devos.ts`, `vercel.json`, `src/devos/engine/{tick,review,admin,queue}.ts`,
  `src/devos/core/types.ts`, `src/components/devos/admin/AdminView.tsx`, `play/ResultPanel.tsx`; tests `devosEngine`
  (+4: the slot, an appeal decided by the tick, an appeal given up after its tries, the morning repair with a forged row),
  `smmServerCheckerOct15` (the crons), timeouts on two long journey tests that timed out only under load. **Tested.** Dev
  OS + cron tests pass; tsc 0; the API parsed, its ESM chain checked, and its GET doors smoke-tested (secret set → 401;
  unset → past the door to the setup).

- **2026-10-18: DREAM TEAM AI Development OS — built inside DTS-OS** (`devos.md` §9.23, NEW module file; `data-model.md`,
  `roles-routes.md`, `architecture.md`, `backend-security.md`; `docs/firestore-rules.md`; CLAUDE.md Context map, §32, §33).
  **Ask.** The owner, with the MSRS PDF ("DREAM TEAM AI Development OS — MSRS v1.0") and a 20-section master prompt: "don't
  ask me anything … check, plan, research, develop it, test it … open all the roles … I want the world's best platform".
  **Audit.** No assessment, mastery, XP or rank existed (only the static `training_modules` library); `CRON_SECRET` is not
  set on Vercel (`GET /api/smm-monitor` → 500), so nothing runs with browsers closed; the Firestore rules' publication is
  unconfirmed; 11 of 30 Gemini keys dead. **Research → decisions** (primary sources): Pelánek, *Applications of the Elo
  Rating System in Adaptive Educational Systems* (Computers & Education) → the Elo-style mastery estimate and ~70 %
  success targeting; Settles & Meeder, *A Trainable Spaced Repetition Model* (Duolingo, ACL 2016) → retention checks on
  growing gaps; Zheng et al., *Judging LLM-as-a-Judge* (MT-Bench) → position / self bias → two independent judges from
  different models, a reference answer, quotes that must exist in the answer, an adjudicator; Dammu & Alonso,
  *Near-duplicate Question Detection* (UW / Amazon) → lexical + semantic + solution-signature dedupe; Duolingo's blog
  (streak freezes: two held raised daily learners; weekly leagues) → freezes, leagues, a "near you" view; Khanmigo
  ("never gives you the answer") → the coach explains only after the answer, hints never give it. **Architecture.** The
  one module that is not a thick client: every write is the server's (`api/devos.ts`, Admin SDK; POST actions with an ID
  token, GET = the tick behind `CRON_SECRET`), the engine is isomorphic (`src/devos/` core / content / engine over a
  store port and an AI port; the same router runs in DEV / tests in the browser on `memoryFirestore`). Answer keys AES-GCM
  sealed and ledgers HMAC-signed (keys derived from the service account) so the design does not depend on the rules.
  **Built.** Onboarding + consent + track; a ten-dimension baseline; the Director (priorities, daily quests, fresh retries,
  retention / transfer checks, weekly practicals, practice); 16 objective template families with computed keys + 6 open
  ones with rubrics, and an AI question pool (writer → code checks → independent solver → embedding dedupe → sealed);
  deterministic scoring, AI rubric grading with two judges + adjudication + an injection fence; XP (capped, anti-farming,
  idempotent ledger) ≠ mastery ≠ league rating; six evidence-gated ranks (assessments, floors, critical dimensions,
  practicals, transfer, retention, evidence, capstone), automatic promotion with a rank event; streaks that Sundays /
  holidays / leave never break; 4-week seasons, four boards, weekly leagues (Elo), team missions; the Control Center
  (overview, people, questions, automation, reports with fact-cited claims, audit, exceptions, a versioned policy,
  voids / regrades / quarantine / export / integrity); the tick (roll-over, notices, grading queue, leagues, missions, AI
  pool, boards) with a catch-up from any open app; `/dev-os/*` for all seven roles + `DEV_OS_NAV`; `vercel.json` cron
  `0 1 * * *`. **Found and fixed by the LIVE Gemini run** (the fake AI hid them): every judge verdict refused —
  gemini-2.5-flash answers `confidence: 5` (now read on any scale, `scoring.readConfidence`) — so no open answer could
  be graded and every AI open question was rejected; quotes shortened with "..." counted as invented (`quoteInAnswer`);
  the writer's notes ("The trap here is …") and a repeated question in scenarios (`prompts.cleanScenario`); an off-task
  answer took 4/4 on "Within the limit" (rubric v2 + a judge rule); one batch = one pattern copied four times (prompt);
  dead keys spending a request's 8-call budget (`geminiPort` `skip` + `devos_health.deadKeys`). Also fixed: an open
  answer / practical is queued IN its save's transaction (a request cut off at 60 s stranded it) + the roll-over
  re-queues lost ones; the router refuses a switched-off account for every action; the day before the first season is
  Season 1; invites only on working days (not Sundays, holidays or the person's leave); History reaches every task
  ("Show older tasks"); hints already taken come back on resume; an unsent written answer is kept as a draft in the
  browser; a teammate's mission part reads "done / not done yet", never a public "failed" (FR-047); the AI bank index
  is capped at 2,000 entries (measured 325 bytes each — 3,000 sat within 7% of Firestore's 1 MiB document limit); the
  server polyfills WebCrypto for an older Node; the frame no longer nests a `<main>` or doubles the padding. **FR-013
  completed:** an admin can withdraw a faulty question (every answer to it voided, originals kept) and patterns are
  calibrated automatically (`core/calibration` + `engine/calibration`: answers counted per pattern, flagged daily
  when < 15 % pass or > 97 % at level 3+, withdrawn 14 days, then measured afresh). **The production adapter**
  (`adminStore`) is now tested through the server's router on a fake as strict as Firestore (no `undefined`, no nested
  arrays, plain objects only, no composite-index query, documents < 1 MiB) — before, only the client adapter ran in tests.
  **Time limits and deadlines made honest** (found reviewing the time-up fix): an expired item was left OUT of a task's
  score, so letting the hardest questions of a rank assessment or a league run out raised the % — it now counts as 0
  (a platform fault still never counts); a quest settled at its deadline with one right answer of three counted as a
  done, "perfect" quest with its XP — such a task now ends `expired` (its in-time answers still count); questions kept
  being served after a session's deadline, only to be recorded expired — no longer (`closeAndSettle` wherever one is
  found); the baseline's session kept its first week's date, so after a week every answer was "expired" — the baseline
  has no deadline at any level now; a rank assessment walked away from left no record (no cooldown — fish for an easy
  draw the next day) — a started one counts as taken and only one is open at a time; a league session whose last
  question ran out never marked its entry done, and a walked-away entry never counted — the entry is written with the
  result in the settling transaction and the close settles started ones; the policy's `questDueHour` (23:00, what the
  docs promised) was ignored — quests closed at midnight. **Found in the browser** (a harness driving every role at 390
  px and desktop) **and fixed:** a spinner on finished baseline / league summaries; the next question opened scrolled
  down (the page scrolls inside the layout's `<main>`); a stale Overview; voids that left the gate counters unchanged;
  the sales admin could open Questions / Automation / Reports; a practical with no way back and lost typing; no way past
  a timed question at 0:00; raw ISO dates and a cut-off rank badge at 390 px; a 10-item Technical rank assessment missing
  three skills; duplicate skills in a gate to-do; a missing "quest done" line; unreadable orange / amber text in the light
  theme and sub-24 px links; then, on the re-check, a Sunday baseline that said "next working day" until reopened (the
  reason now comes with the last answer), status chips under 4.5:1 in the light theme (green 2.8:1 — every tone now one
  step darker on its tint), and unsent drafts keyed without the person (one weekly-challenge id per track: the next
  person on a shared browser saw them — now `devos_draft_<uid>_…` / `devos_practical_<uid>_…`, others' removed on
  opening, `components/devos/drafts.ts`). **Files.** `api/devos.ts`; `src/devos/**`;
  `src/services/devosApi.ts`, `devosLocal.ts`; `src/hooks/useDevOs.ts`; `src/components/devos/**`;
  `src/pages/shared/DevOs.tsx`; `src/App.tsx`; `src/utils/roleHelpers.ts`; `vercel.json`; tests `devosContent`,
  `devosEngine`, `devosScoring`, `devosAiOutput`, `devosAdminStore`, `devosDrafts` (+ `smmServerCheckerOct15` for the
  second cron).
  **Tested.** 89 Dev OS tests in 6 files pass (`devosContent` — every family × track × setting × form × difficulty;
  `devosEngine` 38 — the flows end to end on `memoryFirestore`; `devosScoring`; `devosAiOutput`; `devosAdminStore` — the
  production adapter; `devosDrafts`). Full suite 269 files / 4,516 tests: 4,515 pass; the one failure is
  pre-existing and outside this work (`smmDeliveryControlUiOct15` "Live, the view-only Social Media Team Lead…", which
  fails on a clean `88ee836` too). `tsc` 0 errors; `npm run build` ✅ (the question engine never ships to the browser);
  `api/devos.ts` parsed with esbuild and its whole runtime import chain checked for Node ESM (`.js`, no aliases). A
  live Gemini run of every prompt (generation → code checks → independent solver → embeddings / dedupe; the judge;
  coach; report; practical) found the five bugs above. In a real browser: a throwaway harness (Vite + the real pages on
  `memoryFirestore`, the DEV router, the fake AI and a clock shim, driven over CDP in headless Chrome; outside the repo,
  removed afterwards) drove every role — sales / tech members, team leader, sales / tech / accounts / main admin, an
  external creator, a switched-off account — at 390 px and desktop, light and dark: the first pass's findings (above)
  were all fixed; the re-check passed items 1–10 (68 + 9 checks); the focused pass on the time limits, the Sunday text,
  the chip contrast (every tone ≥ 5.3:1 on its tint) and the per-person drafts was 73 PASS / 0 FAIL, with no console
  errors and no 390 px overflow. Not driven: live Firebase, Vercel and FCM push (no login here), so the production
  rules, the cron and push are owner checks. **Deploy.** Committed as `1399a78` and pushed to `main`; Vercel did not
  deploy it (the live build stayed 2026-10-16 for 30+ minutes with Vercel healthy) — a Claude co-authored commit on
  the Hobby plan, as on 2026-10-08 (live only after the owner's one-line `0fb64c3`). At the owner's go-ahead a
  one-line commit without the trailer (`1c4e4bd`, a stray space removed from `index.html`) went live within minutes:
  build `1792295123286`. On production `GET /api/devos` answers 500 `CRON_SECRET not configured`, a POST without a
  token 401, the preflight 204, and the bundle carries the Development OS menu item and page.

- **2026-10-16: AdGen deliverables fast again — the script quality loop stops at a READY script** (`ai-ads.md` §17.2
  step 3, §24, §27). The owner: "ad deliverables taking lot of time … time is getting delayed". Root cause: the
  2026-10-15 loop only stopped early at a genuine 10/10, which live judges never gave (9.4–9.8), so almost every run
  spent its full 5 passes / 120 s improving an already-good script — and frames, label, Veo prompts, B-roll and
  overlays all wait for the final script (runs went from ~100 s to 147–239 s). Fix in `utils/scriptQa`: `isReady`
  (cast kept, every clip 17–20 words, no invented fact, nothing mechanical, overall ≥ 9, every dimension ≥ 8.5) → stop
  `ready`; budget 3 passes / 45 s / 1 empty round. The word contract, the cast guardrail and the final acceptance gate are
  unchanged; `passed` still means a genuine 10/10. Files: `src/utils/scriptQa.ts`, `src/services/geminiService.ts`
  (banner comment), tests `finalScriptAndQa`, `scriptQualityLoopOct15`, `castConsistencyOct08`. Tested: vitest 263 files /
  4427 tests pass, tsc 0 errors, build ✅. Not measured on live Gemini (the team's keys were in use during working hours).

- **2026-10-15: SMM Delivery Control — all phases (2–7) built on top of phases 0–1: the weekly-task screen, the writes,
  full-screen alerts, the AI layer, the server checker, and three extras** (`smm.md` §9.9 "Phases 2–4", "Phase 5", "Phase 6",
  "Phase 7", §24, §25, §27; `data-model.md`; `roles-routes.md`; `backend-security.md` §12 / §18 / §21 / §25; `people.md` §9.13 /
  §24; `chat.md` §9.10 / §24; `ai-ads.md` §17.3; `architecture.md` §5 / §6 / §11 / §22; `docs/firestore-rules.md`; CLAUDE.md §32
  / §33). **Ask.** The owner, continuing HANDOFF.md: "now complete everything, don't leave anything pending" — so phases 2–6 AND
  the optional phase 7. The approved plan (four messages, 2026-10-15): each client's month as WEEKLY tasks with a deadline at
  each week's end, an AI supervisor with escalating full-screen alerts naming the type, every kind of work covered, and a NEW
  UI behind a button with the classic page unchanged. **What was built.** (Phase 2) the button on the classic page (its only
  change) and `/smm/control` (+ `/:monthId`) for the six SMM roles — Today (one card per client-week, worst first, one main
  button per piece), Weeks, Client plan (health check, Switch on this month, the four weeks with checkpoints in words), Team,
  Starting line, Alerts log, Settings — per role (`utils/smmDeliveryView`, `utils/smmControlAccess`), the piece sheet, the
  remembered screen (`dts_smm_ui`). (Phase 3) `services/smmDelivery` on the now-exported `smm.mutateCampaign` (rules in
  `utils/smmDeliveryActions`): switch on / re-plan, Do it now / Need more time, Blocked (+ confirm / clear), Why late, check-out
  reasons, footage, approval with proof, posted links per account, moves (another week → the lead told; out of the month;
  a late piece only by a manager), reassigns (3rd → admin), the Starting line, accepted AI titles, `smm_alert_state` answers,
  Remind, the test alert; the classic stage calls now stamp `startedAt` / `madeAt` / `revisions`. (Phase 4) `SmmAlertHost` in
  AppLayout (a light gate → `LiveAlertHost`): the full screen (answered, never closed; answers by audience) through the popup
  coordinator (new `urgent` option = skip the 10-minute gap), a red bar in a slot under the Topbar while in the studio / for
  10 minutes after "Open it" / on stale data, sound once per device, a blinking title; the 11 AM / 5 PM check, the check-in /
  check-out due card step aside for covered people and check-out asks a reason per piece due, late or behind. (Phase 5, a
  helper agent) `services/smmAi` + `utils/smmAiRules` + `services/prompts/smmDelivery` + `control/ai/*`: titles / ideas /
  captions (checked in code — no invented numbers, prices, offers or towns, no repeats, festivals only in the piece's week),
  My week and morning briefs (numbers filled by code), the reasons summary, the client's WhatsApp update (English / Telugu);
  plain fallbacks; 2027 festival dates (`FESTIVALS_2027`, `FESTIVAL_CALENDAR`). (Phase 6, a helper agent) `api/smm-monitor.ts`
  (CRON_SECRET; cron-job.org every 30 min + the Vercel daily cron; writes only notifications, the heartbeat and dead tokens;
  `utils/smmDeliveryBaseline`, `smmServerPresence`, `smmServerDelivery`), the `smm_urgent` web / Android channel, and `.js` on the
  alias-free utils' runtime imports (Vercel runs `api/` as Node ESM — reproduced `ERR_MODULE_NOT_FOUND` without it). (Phase 7)
  Make it in the AI studio from a piece; the Flow-credit forecast (`utils/smmCreditForecast`); one-tap client approval in the
  client's own chat (`api/order-chat` `smm-approvals` / `smm-answer`, `utils/smmClientApproval`, `ClientSmmApprovals`).
  **Decisions made while building (said in `smm.md` §25):** "Switch on this month" is the one write Preview allows (a manager's
  act; alerts still wait for Live); in Live a month not switched on is supervised from when Live began; the Preview Alerts log
  judges months as if switched on from their first day ("would get"), the Starting line as if switched on now; the studio
  strip covers the whole studio visit; "Open it" gives 10 minutes as the bar. **Found by the real-browser check and fixed:**
  the Preview log was empty; the full screen never showed on Delivery Control (hidden there) — a person who works there never
  saw it; tile counts included On hold months and tiles filtered into week cards that hid what they counted (now a flat list);
  the bar covered the Topbar and the page title (now in an AppLayout slot); the title cut at 360 px; small tap targets; faint
  check-out chips; every missed checkpoint said "counts against" (only the first does); a Chrome vibrate intervention. Older
  test mocks updated (`checkinDayOff`, `driveUploadStep`, `clientChatEntry`); the health check reads `FESTIVAL_CALENDAR`.
  **Files.** New: `pages/shared/SmmDeliveryControl.tsx`; `components/smm/control/*` (incl. `ai/`), `components/smm/alerts/*`,
  `components/order-chat/ClientSmmApprovals.tsx`; `services/smmDelivery.ts`, `smmAi.ts`, `prompts/smmDelivery.ts`; `utils/smmDeliveryActions`,
  `smmDeliveryView`, `smmControlAccess`, `smmCreditForecast`, `smmClientApproval`, `smmAiRules`, `smmDeliveryBaseline`, `smmServerPresence`,
  `smmServerDelivery`; `api/smm-monitor.ts`. Changed: `App.tsx`, `SocialMedia.tsx` (button + remembered screen), `AppLayout.tsx` (host +
  slot + the check stepping aside), `CheckoutModal`, `DailyCheckinPrompt`, `ClientChat`, `services/smm.ts` (export + stamps),
  `orderChatGuest`, `fcm.ts`, `firebase-messaging-sw.js`, `vercel.json`, `api/order-chat.ts`, `utils/popupCoordinator` + `store/popupStore`
  (`urgent`), `smmCadence` (`movedOut`, `.js`), `smmMonitor` (Starting-line decisions, `.js`), `smmDeliveryHealth`, `festivals`,
  `posterOccasions`, `types/smmDelivery`, `smmDeliverySettings` (`lastRunSummary`), `test/memoryFirestore` (listener options).
  **Tested.** Vitest: `smmDeliveryServiceOct15` (21), `smmDeliveryViewOct15` (16), `smmDeliveryControlUiOct15` (10),
  `smmDeliveryPhase7Oct15` (7), `smmAiOct15` + `smmAiUiOct15` (58), `smmServerCheckerOct15` (44), phases 0–1's suites; the full suite,
  build and typecheck (CLAUDE.md §32). Live Gemini: two runs of every AI call. Real browser (headless Chrome on the in-memory
  Firestore, 360 / 390 / 412 / 1440 px, dark and light, as the tech admin, a member, the Social Media Team Lead and a
  salesperson): the button and remembered screen, every tab, Switch on, Settings (Off reason, Live, rehearsal, test alert), the
  full screen answered two ways, Start / Blocked / approval from the sheet, check-out reasons, no horizontal scroll, no app
  console errors; then a re-check of every fix. **Not tested:** live Firebase, real FCM / push, a Vercel deploy, cron-job.org, an
  Android phone, the published rules. **Owner to do:** `CRON_SECRET` + the cron-job.org job, publish the rules, a new APK, try
  it in Preview, then Live with a pilot group.
- **2026-10-15: dates and periods, platform-wide — a month's end date is its renewal day; one checked way to change a
  month's dates; payroll opens on the period due; one commission rule; the India day everywhere** (`smm.md` §9.9, §24,
  §25, §27; `sales.md` §9.4, §24, §25; `people.md` §9.13–9.16, §24, §25; `orders-work.md` §16, §24; `invoices.md` §9.22,
  §24, §25; `ai-accounts.md` §9.21, §24, §25; `backend-security.md` §12; `architecture.md` §9.17; `data-model.md`; the
  `invoice_numbers` rule in `docs/firestore-rules.md`; CLAUDE.md §28 / §32). **Problem.** The owner showed Social Media →
  Dhana lakshmi reading "6 Oct → 6 Nov 2026" though its month ran 6 Sep → 6 Oct (on 5 Oct the history recorded the 6 Sep
  start); its posts were dated 13 Aug – 9 Sep (five a month early — Gandhi Jayanthi on 2 Sep, Engineers' Day on 15 Aug)
  plus "Dussehra offers" on 9 Oct; the sale behind it was saved 5 Jul 2026 (month id
  `o_LQciB3pSGZEbscZipLBS_1783240453303`). **Diagnosis:** the header prints the saved `cycle`; only setup writes it; before
  2026-10-12 Edit setup could move an ended month into the next period, and the 2026-10-12 lock still had gaps (the last
  day, a first setup, Add SMM sale's set-up path); the SMM sale had no start date; the status ignored post dates; "Up 10d
  ago" read `postedAt`. A platform-wide audit then found the same family elsewhere: periods taken from the action day,
  periods edited in place, UTC days, two commission rules, payroll opening on the running period, receipts labelled with
  the running period, P&L charging today's salaries, a re-approval re-dating a settled sale. **Owner's decisions** ("solve
  all the problems"): (1) the SMM sale form asks "Month starts on" (renewal default = the old end date, new client = the
  sale day); (2) a month's END DATE is the RENEWAL DAY — labels stay "6 Sep → 6 Oct", its own days are 6 Sep – 5 Oct, On
  hold from 6 Oct; (3) commission: Payroll's rule everywhere (collected in the pay period, 75% gate) and Settlements never
  pays what Payroll paid, nor the reverse; (4) Payroll opens on the period due and warns before paying a period that has
  not ended. **What changed** (five parallel sessions, A1 / A2 / B / B2 / C):
  *Social Media (A1, A2).* Own days and one count of days left (`smmPlan.lastOwnDay` / `isOwnDay` / `ownDayCount`,
  `daysLeftInCycle` = `daysToRenewal`; `cyclePhase`, `isMonthLocked`, On hold, `monthPromise` "by 5 Oct", calendar, Insights'
  running clients once per client, `MonthTimeline`); `cycle.anchorDay` against month-end drift (`monthCycle`,
  `nextCycleAfter`); posts dated outside their month not counted and shown (`itemDatedOutside`, ring bucket, At risk line,
  Content list tag, dialog warning), ad reports on own days (`monthAdReports`), "Up …" from the upload date
  (`postedUpLabel`), "Completed (Locked)" only when finished (`lockedMonthLabel`); "Month starts on" on the sale
  (`SmmSaleSpec.startDate`), renewals always on the old end date (`renewalStartDate`, `ensureCampaignForOrder`,
  `createRenewalMonth`), no-sale month opens with no start; NEW `utils/smmMonthDates` — `monthDatesCheck` (locked /
  overlap / posts outside with "Keep the new dates anyway"), enforced in `saveMonthSetup`'s transaction
  (`assertMonthDates`, `SmmMonthDatesError`) and before every setup write; history filing withdraws untouched jobs
  (`smmAssign.withdrawMonthJobs`); `promiseSla.keepUsedExtension`, `defaultExtensionHours` (3 days for a month), every
  month job on the month's deadline (`createWorkAssignment` `promise` / `date`); `continuesInto`; `moveUnpostedToMonth`
  clears carried dates; NEW `smm.movePieceToMonth` ("Move to Month 2"); NEW `SmmMonthsToCheck` on the board.
  *Pay (B, B2).* Payroll / Sales Payroll open on `salaryMonthDue` with a period state and an early-pay confirmation
  (`earlyPayWarning`, `EarlyPaymentError`, `payroll_lines.earlyPay`); receipts placed by NEW `utils/receiptPeriod`; NEW
  `users.payHistory` + `utils/payTerms` + `payroll.savePayTerms` ("applies from pay period" in Edit Member and Salary
  Management) read by every pay, P&L, ratio and estimate screen (`termsPeriodOn` for Work Done / Member History / the
  renewals card); ONE commission rule in `utils/salesPay` (`collectionsOf`, `periodIncentive`, `settlementCoverage`,
  `commissionByPeriod`, `commissionInWindow`, `runningPlanEstimate`) for Sales Payroll, My Salary, Settlements (rewritten,
  NEW `components/sales/CommissionPeriodList`, `commission_settlements.periods/paidKeys/breakdown`, ended periods only),
  My Performance, Leaderboard and P&L — four superseded `services/settlements` functions removed; `firstVerifiedAt` kept
  by every decision (`keepFirstApproval`); My Leads "Collected on"; the sale form's advance = the first payment, payments
  locked on edit (`SaleWriteError("payments_locked")`); the leave panel on the live computation; Salary Management per
  period; P&L salary per pay period (paid = what was paid, unpaid = its terms, running = days so far — `shareToDate`); the
  Accounts Dashboard = one pay period that adds up (no double-counted tech value); revenue charts by each sale's own
  local day (`salesBookedByDay`); tech value by assignment day.
  *Days, invoices, AI accounts (C).* `api/onboarding` today in Asia/Kolkata; expense date and main-admin "today" from
  `useToday`; `workDates.localDayOfInstant` for old jobs; session CSV in local time (`formatLocalDateTime`); an issued
  invoice's date kept inside its number's year and series order (`issuedDateProblem`, `saveIssuedContent` transaction,
  `invoice_numbers.issueDate`, the Generate dialog with "Use today's date"); Flow credits dated by the day the clips were
  made (`meta.madeOn`, transactions reading the stored account), `updateFlowAccount` a transaction on the live account,
  "Day the Flow account was opened", "cycle" vs "calendar month" in every label.
  **Files** (main ones; full list in `git status`): `utils/{smmPlan,smmPackage,smmGlance,smmDashboard,smmCalendar,
  smmReminders,smmRenewalMoney,smmMonthDates (new),promiseSla,payrollEngine,receiptPeriod (new),payTerms (new),salesPay,
  salePayments,saleDecision,saleEdit,profitAnalytics,salesRevenue,techProductivity,workDates,performanceCycle,formatters,
  flowCredits,invoiceNumber,invoiceDraft}.ts`; `services/{smm,smmSetup,smmAssign,workAssign,orders,sales,payroll,payrollRun,
  salaryReceipts,settlements,invoices,aiAccounts,onboardingGuest}.ts`; `api/onboarding.ts`; `types/{index,smm,payroll}.ts`;
  hooks `useMonthPayroll`, `useSalesMemberPay`, `useSalaryMonth`, `useSalesEarnings`, `useSalaryPayments`;
  `components/smm/*` (SmmVisuals, SmmGlance, SmmChips, SmmContentTable, SmmItemDialog, SmmSetupForm, SmmAddSaleDialog,
  SmmAdsPanel, SmmReportPanel, SmmRenewalPopup, SmmRenewalsCard, SmmMonthsToCheck (new), calendar/*, dashboard/MonthViews,
  WorkViews), `components/sales/{SaleForm,CommissionPeriodList (new)}`, `EditMemberModal`, `payroll/LeavePanel`,
  `work/{ExtendPromiseButton,WorkDoneReport}`, `components/invoice/InvoiceEditor`, `components/ai-accounts/*`; pages
  `shared/{Payroll,Profit,Leaderboard,SmmCampaignPage,SocialMedia,InvoiceBuilder,AiAccounts}`, `sales-admin/{Payroll,
  Settlements,SalesApprovals}`, `sales-member/{MyLeads,MyPerformance,MySalary,Settlements,Dashboard}`,
  `accounts-admin/{Dashboard,RevenueSummary,SalaryManagement,DailyExpenses}`, `main-admin/{Dashboard,Accounts,
  RevenueOverview,TechDepartment,SessionHistory}`, `tech-admin/{MemberHistory,SessionHistory}`, `sales-admin/SessionHistory`,
  `tech-member/{MySalaryDashboard,MyAiAccounts}`. **Tests:** new `smmDatesOct15`, `smmDatesUiOct15`, `smmSetupChecksOct15`,
  `smmStartDatesOct15`, `smmSetupChecksUiOct15`, `payPeriodsOct15`, `commissionRuleOct15`, `collectedOnOct15`,
  `payLeftoversOct15`, `datesIstOct15`, `invoiceDateOct15`, `flowUsageDateOct15`; tests that encoded the old rules
  rewritten (`smmPlan`, `smmPackage`, `smmOnHoldOct05`, `smmGlance`, `smmRenewalOct05`, `smmDashboard(Ui)`,
  `smmCalendar(Ui)`, `smmMessages`, `smmAddSaleUi`, `smmSaleForm`, `settlements`, `salePayments`, `profitAnalytics`,
  `techProductivity`, `workDates`, `workDoneCycle` — the last two pinned to `TZ=Asia/Kolkata`). `npm run build`, `npx
  vitest run` and `npx tsc -p tsconfig.check.json --noEmit`: build ✅ (main chunk ≈485 KB), tsc 0 errors, vitest 260/262
  files, 4416/4418 tests — the 2 failures (`checkinDayOff`, `driveUploadStep`) come from the parallel SMM Delivery
  Control work in progress (its `useSmmDeliverySettings` listener inside screens whose older test mocks lack
  `onSnapshot` / `snap.exists`), reported to that session; `apiKeysOct10` can time out under load and passes alone.
  Real-browser harness (headless Chrome, the real components on `memoryFirestore`, clock 15 Oct 2026, dark, 1440 + 390
  px, no console errors, no page overflow), all PASS: (a) the owner's month reads "At risk — 9 posts are dated outside
  6 Oct – 5 Nov", rows tagged "Outside this month", "Up 63d ago" from the upload date, an On hold month reads "Ended —
  not renewed yet", Months to check lists it; (b) Edit setup 6 Sep → "6 Sep – 5 Oct · 30 days · renews 6 Oct", an
  overlap refused with Open that month, posts left outside need "Keep the new dates anyway"; (c) the post dialog's
  outside warning + Move to Month N; (d) the sale form's "Month starts on" (late renewal opens on the old end, earlier
  refused); (e) Payroll opens on the period due, early pay names the days not worked; (f) an issued invoice's date
  refused outside its FY; (g) "Day the clips were made". One fix from it: `SmmGlance` wide layout overflowed 8 px at
  390 px (the new legend label) — one shrinkable column + wrapping labels.
  **Not verified:** live Firebase (the owner's Dhana lakshmi document was not read or repaired — the admin does it with
  Months to check → Edit setup), real devices / phones, the published rules (the `invoice_numbers` `issueDate` branch is
  needed once published). **Behaviour the owner should confirm:** Settlements pays only ended periods; the Accounts
  Dashboard is one pay period with no tech delivered value; recording / editing Flow credits, editing a Flow account,
  changing an issued invoice's date and moving a post between months now need a connection.
- **2026-10-15: the voice-over word contract — 17–20 spoken words in every clip, for every cast — and the 10/10
  quality loop** (`ai-ads.md` §9.7, §17.2 step 3, §24, §25, §27; `data-model.md` `ai_generations.scriptQa`). The owner:
  "EVERY GENERATED CLIP MUST CONTAIN 17–20 SPOKEN WORDS … A HARD MAXIMUM OF 20", for every category, ad type and
  language, with a generate → validate → refine → revalidate loop, a strict 10/10 rubric and no bypass.
  **Root causes found:** (1) three bands at once — 18–20 (one voice), 15–17 (a pair, 2026-09-22), an unused 13–15 (Kids) —
  plus six deity catalogue entries setting their own sentence length ("six to nine spoken words"), and the catalogue
  test that should have caught them could not (it did not allow "spoken" before "words", and its pace exception had
  lost its backslashes); (2) two counters that disagreed (geminiService counted a dash or an ellipsis as a word, the
  dialogue counter split "don't"); (3) `speakableLine` ran AFTER validation, so the checked text was not the shipped text
  ("₹999" is one token, five spoken words); (4) nothing stopped an out-of-band clip from shipping — repairs ended with a
  console warning, the whole-script repair replaced the draft unconditionally, `isBetterRepair` kept "fewer problems"
  even when a clip went to 22 words, `isBetterDraft` let a higher-scoring draft with a 23-word clip beat a valid one, and
  `finalClipSlack` could raise the clip ceiling; (5) the character prompts' worked examples were miscounted (three solo
  lines marked "(18 words)" were 14–16; every duo clip 15–17); (6) the judge was never given the verified address (it
  marked the required last-clip address as invented), never given word counts, scored six dimensions and the code
  shipped at ≥ 8; (7) the spoken-phone-number check used `\b` around Telugu words and so never matched a Telugu script;
  (8) the name check looked for "Ben 10" in a line that is spoken (and written) "Ben ten"; (9) found LIVE after the first
  build: a Telugu final clip must keep the 9-word call line and the 5-word address, and the repair direction said "keep
  every fact", so the editor could never drop the offer the writer had put there and the run stopped at 22 words.
  **What changed:** new `utils/scriptContract.ts` — THE band (17 / 20, preferred 18–19, a pair's lines 7–12, 8–10
  preferred), the one tokenizer (`spokenWordsOf`, `countSpokenWords`, `spokenTextOf`), `clipWordCountIssue`,
  `contractViolations`, `bandDistance`, the estimators; `dialogueFormat` re-exports it (the duo / kids constants are
  gone, the clip band can no longer be widened by a caller, the final-clip slack moves only the line split). New
  `services/prompts/wordContract.ts` — one prompt block (`wordContractBlock`) in the writer, the whole-script repair, the
  native-speaker review, the refine / clip editor, the character writer and repair; the closing line's and the
  address's words counted in code, "a short invitation only — every offer in an earlier clip" when they leave ≤ 8 words,
  and the shared `TELUGU_SCREEN_CTA`. `geminiService`: clips made speakable before every check; the cast's checks built
  once (`dialogueTools`); repairs (`repairClipsByEdit`, shared with the Script Duration Checker, and
  `repairDialogueClips`) told the exact cut / addition and, for the final clip, the room its fixed words leave; every
  repair kept only when nearer the band; the clip repair no longer runs twice on the same text; the quality gate
  rebuilt as `runQualityLoop` (judge → targeted polish or new draft → judge again; bounded by 5 passes, 2 empty rounds,
  120 s; one last contract fit) and THE FINAL ACCEPTANCE GATE on the exact shipped text (a generated script outside the
  contract stops the run with a message); the phone-digit check and the spoken-name tokens fixed; `refineVoiceOver`
  holds every clip it edits to 17–20 (`editProblems`); `convertToVoiceOverScript` on the same contract and repairs.
  `utils/scriptQa`: eight dimensions (+ cast, originality & flow), scores held to the judge's own problems and code's
  mechanical findings (`withMechanicalChecks`, `mechanicalCaps`), 10/10 only by `isPerfect`, `isBetterDraft` ranks the
  cast, then the contract, then the score, the pure loop controller `nextImprovement`, `ScriptQaSummary` gains `passes`,
  `stopReason`, `clipWords`, `checkedScript`, `unscored`. `prompts/scriptQa`: the rubric with anchors, the cast's identity
  (`characterAd.castNoteFor`), code's word counts, the address, the closing line, and a festival override (clip 1 is the
  wish whatever the cast's own clip-1 direction says). `prompts/characterAd`: computed worked examples (every clip
  17–20), `contractRegisterFor` (children / deity / cartoon notes). `repairDirection`: exact sizes, both lines of a
  clip, and "keep what this clip must say; leave out a secondary offer rather than squeeze it in". Catalogue (TS + JSON):
  the six deity length rules removed. Studio (`AIPlatformApp`): the QA strip ("Quality check 10/10" / best draft / not
  scored, passes, eight scores, "changed after this check" when the script was refined), a live **Words per clip** row,
  the Voice Over status chip, and the custom-script box counted by the one counter with per-clip chips.
  **Tests:** new `scriptContractOct15` (the counter's edge cases — Telugu, English, mixed, punctuation, apostrophes,
  labels, a price spoken; 16 / 17 / 18 / 19 / 20 / 21; the block; and, generated from the catalogue, every entry's writer
  and repair contract plus its worked example counted, commercial and festival, Telugu and English) and
  `scriptQualityLoopOct15` (a fake Gemini: a genuine 10/10 stops at once; a 25-word and a 12-word first draft repaired; a
  failed repair retried; a language fix that breaks the limit rejected; a count fix that invents a fact beaten by a new
  draft; a malformed judge retried once then unscored; a 6-score report refused; the 5-pass budget spent and the REAL
  score shipped; a clip that cannot fit stops the run before any frame; a duplicate and a missing clip; a price counted
  as spoken; a member's 25-word clip untouched; commercial vs festival; Telugu: the 9-word call line counted and a spoken
  phone number caught; a pair counted across both lines and put back in order; ALL 41 entries × commercial / festival
  through the pipeline with an over-long clip 1 — writer, repair, judge and final text agree; refine refuses a 21-word
  edit and applies a 20-word one; the Script Duration Checker). Updated 13 older suites to the contract (fixtures of
  16-word duo clips → 17–20; assertions on the old bands → the new block) without removing an assertion. Results:
  `npx vitest run` 4370 tests — 4369 pass; the one failure is `smmDeliveryPhase0Oct15` (another session's SMM work in
  progress; an earlier full run's 7 load timeouts in 4 UI files pass alone, 58 / 58); `npm run build` ✅;
  `npx tsc -p tsconfig.check.json --noEmit` → 0 errors. Real browser (scratchpad harness, the real studio on fakes,
  1440 / 390 px): the strip and the words per clip after a run, a refine → the "changed" note and the live recount, the
  custom-script chips; no console error, no overflow. **Live Gemini** (`generateAdAssets` with vite-node, stopped once the
  voice-over was final): Telugu single presenter, 3 clips with an address — first build: STOPPED by the final gate (clip 3
  at 22) → cause (9) fixed → re-run: 18 · 19 · 20 words, **10/10** (gemini-2.5-flash judge) after 1 pass, 55 s; Telugu
  Male & Female Duo, 2 clips: 18 · 20, 9.8 after 3 passes, 239 s; Lord Ganesha, Vinayaka Chavithi, 2 clips: 19 · 20 (9.4,
  4 passes) and after the festival override 18 · 19 (8.3, stopped at the 120 s deadline). Every shipped text equalled the
  checked text.
- **2026-10-15: SMM Delivery Control, phase 1 — the rules** (`smm.md` §9.9 "SMM Delivery Control" (4)–(5), §24, §25;
  `data-model.md`; plan in `HANDOFF.md`). The weekly task model and the supervisor, as pure rules with no screen yet.
  **`utils/smmCadence`**: the client's four weeks (W4 = day 22 → the day before the renewal day, per session dts-os-47's
  app-wide date rule of the same day), each week's deadline (its last working day at 19:00, Mon–Sat minus company holidays),
  the ÷ 4 split (leftovers W1, W4, W2: 4 → 1,1,1,1; 6 → 2,1,1,2; 8 → 2,2,2,2) per kind, the checkpoints counted back in
  working days (the plan's worked week — sent by Sat 24, poster Mon 26, approved Tue 27, live Wed 28 — is a test), placement
  (a saved plan, the team's own date — kept —, carried pieces in W1, then the earliest week short), rows beyond / short of the
  promise, extra work and festival posts on their own dates, a first month from day 4 with no real video in W1, suggested post
  days, progress and blame (the first checkpoint missed: team / client / publisher), on-time % without client delays, and the
  move rule. **`utils/smmMonitor`**: every alert due at a moment — the owner's ladder (week start, watch, checkpoint missed,
  deadline day, deadline passed every 2 h), the leads +1 and the admins +2 working days (from 09:00), the client's side
  (approval chases on days 2-4-7, the sales admin, not responding, footage, keeps changing, extras unbilled), the marketer's
  ad report and ad start, setup / nobody owns / owner away / blocked / overloaded / crowded week — with the guards the plan
  requires (answers quiet them, the Starting line, leave, quiet hours, capacity, one alert per person per piece, the once key,
  pilot / preview / off, fresh data and a sane clock, one try/catch per month, never writing) and **the 30-day rehearsal**
  (`rehearseSmm`, replaying the months from their stamps). The item fields they read (`plan`, `moves`, `madeAt`, `blocker`,
  `eta`, `lateReasons`, `footage`, `revisions`, `reassigns` …) and the month's `delivery` are typed, optional, in
  `types/smmDelivery`; nothing writes them yet (phase 3). One setting added: `ladder.weeklyLoadLimit` (12, range 3–40).
  Both files are alias-free (the phase-6 server reuses them): a test asserts their imports, and
  `esbuild --bundle` resolves `smmMonitor.ts` without the alias. Files: `src/utils/smmCadence.ts`, `src/utils/smmMonitor.ts`
  (new), `src/types/smmDelivery.ts`, `src/utils/smmDeliverySettings.ts`, tests `src/test/smmCadenceOct15.test.ts`,
  `src/test/smmMonitorOct15.test.ts`, `src/test/smmDeliveryFixtures.ts`. Tested: 158 table-driven tests (incl. parity of the
  exclusion rule with `smmDeliveryHealth.excludedReason` and `smmPackage.isOnHold`); no UI, so no browser run.

- **2026-10-15: SMM Delivery Control, phase 0 — the groundwork** (`smm.md` §9.9 "SMM Delivery Control", §24, §25, §27;
  `data-model.md`; `backend-security.md` §14, §18; `architecture.md` §11, §22; `roles-routes.md` §8.2; plan in
  `HANDOFF.md`). The owner approved (same day, four messages) a plan to divide each client's SMM month into weekly tasks
  with week-end deadlines and escalating full-screen alerts, behind a button that keeps the classic Social Media as it
  is; phase 0 builds what every later phase stands on. Nothing new is on screen yet. (1) **The popup coordinator**
  (`utils/popupCoordinator` rules, `store/popupStore` registry, `hooks/usePopupClaim`): the 11 AM / 5 PM post-status check
  used to wait by looking at the page (`[role=dialog], .fixed.inset-0` with a box) — it could not see the incoming-call
  card (a floating `fixed top-4` panel), the check-in gate before it appeared (its reads can outlast the check's 8 s head
  start), or what had just closed. Now every popup the app opens by itself REPORTS itself (`usePopupClaim`: the check-in
  gate — "pending" while its reads come in, released once checked in —, the agreement gate, the profile prompt,
  `UpdatePopup`, the birthday greeting, the renewal countdown), as do a call (`VideoCallManager`, phase ≠ idle) and the AI
  studio (`AIPlatformApp`, one line beside its `holdUpdates()`), and they all show exactly as before. The status check
  opens through `tryOpenPopup` — never over a call, the studio, another popup or a window the person opened (the old look
  at the page, kept as the `busy` input), and not within ten minutes of a different popup closing (owner's rule); a
  pending claim stops counting after two minutes, so a refused read cannot block it all day. (2) **The settings
  document** `app_settings/smm_delivery` (`types/smmDelivery`, `utils/smmDeliverySettings` — written without the `@/`
  alias for the phase-6 server checker —, `services/smmDeliverySettings`): mode Off / Preview / Live (missing document =
  Preview), the pilot group, the deadline hour (19), the checkpoints (send −3 video / +1 for ≥ 6 clips, −2 poster, −2 real
  video, footage −4, approved −1), quiet hours (20:00–09:00, Sundays, holidays), the escalation ladder and its limits
  (the plan's numbers), the switch's history (20), `lastRunAt` for the server. Read leniently (junk → defaults); a change
  is checked (whole numbers in range, steps in order). Only the tech admin and the main admin change it
  (`canManageSmmDelivery`, in the service from the auth store and in a new `app_settings` rule); **turning it off needs a
  reason and every other active main admin gets `smm_delivery_off`** (owner's decision 14). (3) **The data health check**
  (`utils/smmDeliveryHealth`): a month's findings before switch-on, in sentences, worst first — excluded (deleted,
  removed, history, finished, ended, on hold), blocked (bad dates, under 22 days, nothing promised), setup (nobody on it),
  warnings (long week 4, empty Makes / Posts seat, a deactivated seat or owner, rows ≠ promised per kind, dates outside the
  month, already late → the Starting line, extra work without a date or owner, holidays unreadable) and information
  (upcoming, posted with no date / no link, undated rows, carried pieces, a first month's day-4 start, a Sunday / holiday
  start, festival dates missing for 2027). **Rules:** `docs/firestore-rules.md` — `app_settings/{docId}` has its own rule
  (staff as before; `smm_delivery` only main / tech admin) and is out of the catch-all. Tests: `smmDeliveryPhase0Oct15`
  (62: the verdict table, settings reading / checks / alias-free, the health check on every finding and edge),
  `smmDeliverySettingsOct15` (15, memoryFirestore: the switch, the off reason and who is told, refusals for the team
  leader / Social Media Team Lead / sales admin / nobody, merging, range and order), `popupCoordinatorOct15` (10: the
  registry; the real status check waiting for a call, the pending check-in, the studio and the gap; the real check-in gate
  and update popup reporting). Full suite 240 files / 3804 tests, typecheck 0, build ✅. Browser (scratchpad harness,
  real check-in gate, update popup, status check and the REAL AI studio on the in-memory Firestore, a shifted clock, 1440 and
  390 px): 37 of 37 checks — the gate holds the 11 AM check; after check-in it waits the ten minutes, then opens; Later /
  All updated; no gap after its own kind; it waits through a call claim and the open studio and opens when they end; the
  update popup shows as before and reports itself; no console errors, no horizontal overflow. Not covered: live Firebase,
  a real incoming call (the call was a claim), the birthday / renewal / profile / agreement popups in a browser.

- **2026-10-15: the Real Owner Duo — Real Owner Face for two owners (Male + Male, Female + Female, Male + Female)**
  (`ai-ads.md` §9.7, §17.2, §24, §25, §27; `sales.md` §9.4, §25). The owner asked (2026-10-14) for three duo
  configurations of Real Owner Face: sales picks the configuration, the tech side uploads the two owners' photos in two
  clearly labelled, required slots, and the configuration is the one source of truth sale → order → job → kit `spec` →
  frames → script → Veo, both owners in every clip, never swapped, duplicated, invented or lost; single Real Owner Face,
  Human Duo and every other category unchanged. The owner's answers: the video prompt is their real-person template for two, and on
  Male + Female the man stands on the LEFT and speaks first. Started 2026-10-14 (the catalogue entries, `ownerPhotoSlots`,
  the duo face lock and attach line, the two-person Veo template, the composition, the duo script / repair / frame
  prompts — committed half-finished by the owner in `74b0b8e`, so the three entries were already in the pickers on
  `main`); finished here. **Generator** (`services/geminiService.ts`): `packWardrobe` dresses each owner by side
  (`ownerDuoWardrobeDirective`); a duo run missing either photo is refused before any call, naming it; BOTH photos go to
  the frame writer, each with a sentence tying it to one side, and the request's configuration lists them; every frame is
  stamped with the two-shot composition, the duo FACE LOCK and "📎 ATTACH OWNER PHOTO 1 (the man, LEFT) and OWNER PHOTO 2
  (the woman, RIGHT), in that order"; a main-frame refine re-stamps both; `writeVeoPrompts` assembles
  `assembleRealPersonDuoVeoPrompt`, each line seated by its speaker's side (`seatsOf`), so a clip a member gives to one
  owner is voiced from that owner's side; the scene plan calls them "the business's two owners". **Prompts:**
  `packVeoSubject` treats them as people; `realLocation` places "the two owners" ("TWO REAL PEOPLE — the business's own
  two owners"); the frame prompt names each owner only by photograph in the shot plan (POSITIONS, continuation line) and
  has its own in-place paragraph ("Owner 1 and Owner 2 says…" before). **Shared helpers** (`services/characterPacks`):
  `ownerPhotoFile` (slot → `ownerImage` / new in-memory `FileStore.secondOwnerImage`) and `ownerSlotLabel`. **Studio**
  (`AIPlatformApp`): two slots ("Owner 1 photo — Man · LEFT", "Owner 2 photo — Woman · RIGHT"), a note under the picker,
  the check naming the missing photo, `RunFacts.ownerPhotos` → the AI Guide's "Attach BOTH owner photos in every tab"
  (`generation/run.ts`, `mission.ts`). **The attach line** (found by the browser check; `utils/promptAttachments`,
  `AttachmentBanner`, the tab chips and copy toast): it read only "IMAGE #n", so every Real Owner Face frame — single
  too — said "Nothing to attach" / "no photo"; it now shows the owner photo(s) in order, and a store zone no longer
  swallows the owner text. **Sales:** the sale form, the job's Special Category note and the client's WhatsApp ask for a
  clear photo of EACH owner; "Both owners speak in every clip"; the tech requirements message says who is who;
  `castLabelFor` "👨👩 man & woman" for the mixed owners. Also resolved the merge-conflict markers left in CLAUDE.md §32
  (both sides kept). Tests: new `realOwnerDuoOct14.test.ts` (all three configurations: slots, stamps, the template and
  its refine safety, the script prompt, the attach reader and banner, the sales messages, the full pipeline on a fake
  Gemini, the missing-photo refusal, a one-owner clip, the refine re-stamp, the guide); `characterCatalogue` and
  `castConsistencyOct08` updated for the family (every entry still runs end to end); the studio's slots and check in
  `aiPlatformInputs`. Real browser (throwaway harness on fake Firebase / Gemini, 1440 and 390 px): the slots for all three,
  the single slot unchanged, the alert, a full duo run's deliverables, the sale and job notes — no console errors, no
  horizontal scroll. `npm run build`, `npx vitest run` (237 files, 3717 tests), `npx tsc` 0 errors. Not seen yet: a frame made in
  ChatGPT / Gemini from two owner photos, or a Flow clip.

- **2026-10-14: remove the opt-in SMM Operations / Preview Glass UI** (`src/components/smm/SmmOperationsView.tsx`, `src/components/smm/smm-operations.css`, `src/pages/shared/SocialMedia.tsx`, feature-only tests/config/workflow). Removed the alternate screen and its entry point, deleted its dedicated styles, test, scoped TypeScript config and workflow, and restored the original Social Media page and SMM module guide. Existing SMM campaign logic, routes and Classic interface are retained.

- **2026-10-14: redesign SMM Operations as a premium glassmorphism studio** (`src/components/smm/SmmOperationsView.tsx`, `src/components/smm/smm-operations.css`, `src/pages/shared/SocialMedia.tsx`, `src/test/smmOperationsView.test.tsx`). Replaced the prior dashboard-style layout with a layered light-glass hero, 3D-depth KPI cards, package-fulfilment donut and per-kind progress, campaign-health distribution, priority queue, search/filters and responsive client glass cards. Classic SMM remains the default; the new view is opt-in and uses existing SMM records/routes only. Verification: SMM TypeScript check passed, focused SMM suites passed 25/25, and production build passed. Full suite: 3,688 passed / 3 failed in `src/test/characterCatalogue.test.ts`; the existing expectations omit the `owner_duo` catalogue entries. No AI Ads catalogue source/test was changed, and no manual authenticated pixel-by-pixel browser review is claimed.

- **2026-10-14: refine the opt-in SMM Operations view and verify its interactions** (`src/components/smm/SmmOperationsView.tsx`, `src/test/smmOperationsView.test.tsx`, `.github/workflows/smm-ui-checks.yml`, `tsconfig.smm-ui.json`). Replaced the crowded first pass with a compact delivery-pulse strip, a prioritized action queue, and a more legible client-progress panel; kept the classic UI as the default and reused existing SMM records, setup actions and routes. Dedicated SMM TypeScript check, 5 focused UI tests and production build passed. The full repository suite still has 3 unrelated failures in `src/test/characterCatalogue.test.ts` for existing `owner_duo` catalogue entries; those AI Ads files/tests were not changed. No authenticated manual browser/pixel review was available, so none is claimed.

- **2026-10-14: add an opt-in simplified SMM operations UI** (`src/components/smm/SmmOperationsView.tsx`, `src/pages/shared/SocialMedia.tsx`, `.claude/rules/smm.md`). Added a **Try New UI** control to the existing Social Media page and a query-param-selected modern view with a **Classic UI** return action. The new view derives the priority queue, overdue/due/approval indicators, campaign health, per-kind fulfilment and extra-work display from existing SMM records and helpers; it reuses the existing add-sale/setup dialogs and campaign routes. Default classic UI and SMM business logic remain unchanged. This change was made through repository APIs; a local build/browser run was not available, so automated/runtime verification is not claimed.

- **2026-10-14: consolidate repository-wide DTS-OS system navigation** (`.claude/rules/architecture.md`, `CLAUDE.md`). The owner asked for durable system knowledge to be retained for future work. Inspected the recursive `main` tree at `dc4313e67f6a93852df46d6941213a13e992c6e1` (1,019 tracked files; 858 under `src/`; 234 test/spec files), the core development protocol, module guides, app entry/routes, roles/access guide, data model, Firestore rules document, notifications, SMM, sales, payroll, invoice and AI-account entry points. Added a cross-module navigation section to the existing architecture context and linked it from the core context, following `CLAUDE.md` §29.21 rather than maintaining a separate parallel context document. No application code or production configuration changed; this was a source/documentation inspection, not a full runtime, deployed-rules, or pixel-by-pixel browser audit.

Detailed per-session notes up to 2026-09-19 live in `docs/AI-MEMORY.md` (historical, read-only).
Design intent lives in `docs/superpowers/specs/`.

- **2026-10-13 (late night): the bell, one row at a time — plus bottom toasts, a smaller badge, a 90-day clean-up and
  the index in the repo** (`backend-security.md` §18, §24, §25; `data-model.md` `notifications`,
  `app_settings/notification_cleanup`, composite indexes; `architecture.md` §4, §6; `docs/firestore-rules.md`). The owner
  approved five follow-ups from the night's report. (1) **Toasts at the bottom on phones** (`components/ui/toast.tsx`): the
  shadcn viewport sat at the top below 640px (z-100) for each toast's 5 s, over the menu, the bell and the bell's buttons.
  It is now at the bottom on every width, padded by `env(safe-area-inset-bottom)` (the page sets `viewport-fit=cover`),
  and toasts slide in from the bottom. Sonner was already at the bottom. (2) **The badge**: 16px at `top-1 right-1` covered
  most of the 16px bell. It is now 14px with 9px text, starts just right of the bell's centre at `top-0.5`, has a
  `ring-card` and is `aria-hidden` (the button's label carries the count). In the browser it covers 18.75% of the icon's box.
  (3) **One row** (`components/layout/NotificationRow.tsx`, new): the row is a container (open area + an envelope + an
  X), because a button cannot hold buttons. The X or a sideways swipe (framer-motion `drag="x"`, direction-locked; vertical
  stays a scroll) dismisses: `dismissed: true, dismissedAt, read: true` on the row. It is hidden on every device and not
  deleted, because the kept row is what stops a `once` reminder coming back. A 5 s toast offers Undo, which restores the
  row as it was. The swipe uncovers a red "Dismiss". A click after a drag is swallowed. `utils.isDismissSwipe` = past a third
  of the row (at most 96px) or a 24px+ flick at 300 px/s. It was 500 px/s until the browser run measured firm short flicks
  at 472–478 px/s: framer-motion samples velocity per frame. The envelope marks a read row unread
  (`read: false, markedUnreadAt`) or an unread row read without opening it. UpdatePopup skips `markedUnreadAt` rows (the
  person has seen it). Firestore cannot query "not dismissed" across older rows, so when dismissed rows fill the
  loaded window and the panel has fewer than 20, the listener asks for 50 more, up to 200 (`nextInboxWindow`).
  `freshArrivals` now treats an unseen id as an arrival only when it is newer than every row seen, so the older rows a
  grown window (or a cache→server fill-in) loads do not chime. The desktop panel is 24rem (was 20rem). (4) **The 90-day
  clean-up** (`services/notificationCleanup.ts`, new): there is no scheduler, so 30 s after the bell mounts, the first
  app of the day claims the day in a transaction on `app_settings/notification_cleanup` (`localStorage` stops a device
  asking twice). It deletes every `notifications` row older than 90 days, for everybody, oldest first, in batches of 400,
  at most 2,000 a day, and is never fatal. It is safe because every `once` key carries its day. It needs the catch-all's
  delete; `docs/firestore-rules.md` now names the rule a future `notifications` rule must keep. (5) **The index**:
  `firestore.indexes.json` (notifications userId ↑ createdAt ↓), `firebase.json` (indexes only; rules stay pasted by hand)
  and `.firebaserc` (dts-manager). Validated with firebase-tools' own spec validator. The live index could not be
  confirmed: the CLI on this machine is not signed in. Files: `components/ui/toast.tsx`, `components/layout/Topbar.tsx`,
  `NotificationRow.tsx`, `UpdatePopup.tsx`, `hooks/useNotifications.ts`, `services/notificationInbox.ts`,
  `services/notificationCleanup.ts`, `utils/notificationInbox.ts`, `firestore.indexes.json`, `firebase.json`,
  `.firebaserc`, `src/test/notificationRowsOct13.test.tsx` (new, 21 tests), the comment in `notificationInboxOct13`.
  Tested: unit + in-memory-Firestore + real Topbar / UpdatePopup in jsdom. The real browser at 360 / 390 / 1440 checked
  toast position, the badge, row fit (both buttons 28px, no overflow), X + Undo, the envelope, touch swipes (dismiss,
  spring back, vertical scroll, tap still opens), the desktop mouse drag and the clean-up after 30 s, with 0 console
  errors. Build, vitest (236 files, 3685 tests) and tsc (0) all pass.
- **2026-10-13 (night): the bell's "Mark all read" and "Clear all" work** (`backend-security.md` §18, §24, §25;
  `data-model.md` `notifications`, `notification_state`; `docs/firestore-rules.md`). The owner: "in the notification tab,
  Mark all read or Clear all is not working — they are not clearing or deleting." Causes: (1) both acted on the ≤50 rows
  the bell had loaded, and nothing had ever deleted a notification, so Clear all deleted 50 and the next 50 slid in. In
  the no-index fallback the badge counted every unread row while Mark all read touched 50. (2) The once-a-day reminders
  (birthdays, posts due, renewals due, the renewal nudge, the Drive-folder ask) were guarded only by the 10-minute
  collapse window. So every app open more than 10 minutes apart re-sent them: a new phone alert, and the row back as
  unread after Mark all read. On a birthday, every teammate's first open re-sent to the whole team. A cleared row was
  written again from nothing. (3) Failures went to the console only. (4) The fallback listener was returned from
  the error callback and never stopped. Fix: Clear all records ONE point per person (`notification_state/{uid}.clearedUpTo`
  = the newest row on screen's exact `createdAt`), hides every row at or before it on every device, and marks them read
  (UpdatePopup agrees), with Undo for 6 s. Mark all read marks every unread row up to the newest on screen: the rows on
  screen first in one batch, so the UI changes at once, then `userId == && read == false` for the rest. Both are chunked
  under 500 and survive a row deleted meanwhile. `sendNotification({ once: true })` writes a key at most once, ever,
  and the five daily senders use it. The rows listener and the fallback stop together. Only a real arrival chimes (not
  an Undo). The buttons get a spinner, a 28px tap target and a destructive toast on failure. Undo keeps the bell open:
  in the browser run, a real click on it counted as a click outside the bell and closed it. Undo also shows no
  "restored" toast: on a phone toasts sit at the top, and that one covered Mark all read for 5 s, so the next tap did
  nothing. The header keeps its height when the buttons go. Rows are hidden, not
  deleted: one write instead of thousands of deletes on the free-tier quota, and the kept row is what stops a daily
  reminder from coming back. New collection `notification_state` gets its own rule (only the person), excluded from
  the catch-all.
  Files: `utils/notificationInbox.ts` (new), `services/notificationInbox.ts` (new), `hooks/useNotifications.ts`,
  `components/layout/Topbar.tsx`, `services/notifications.ts`, `services/birthdays.ts`, `services/smm.ts`,
  `services/workDrive.ts`, `docs/firestore-rules.md`. Tests: `notificationInboxOct13` (rules; the service on the
  in-memory Firestore with 120 rows, a deleted row, the fallback; `once` against Mark all read and Clear all; the real
  Topbar: badge, dots, Clear all, Undo, a new arrival chiming, a refused write), `notificationDedupe` (+2 `once`).
  Browser harness: the real Topbar on the in-memory store, 1440 / 390 / 360 px, light and dark.

- **2026-10-13 (evening): poster refine works — a "Changes:" line, contacts and language, and it says what it could not
  do** (`ai-ads.md` §17.2 Poster Creation "Refine", §24, §25; `data-model.md` `posterConcepts.changes`). The owner: "poster
  refine prompt is not working." Cause: since the 2026-10-12 rebuild a refine could change only the ad type and the
  business summary — and the summary may not describe a picture — while code put everything else back (the verified
  numbers and address, the form's language). So "red and gold colours", a headline, "make the logo bigger", "leave out
  the address" (the Refine box's own example) and "words in Telugu" all came back as the same prompt: silently in Poster
  Creation, and in the video row as "could not be applied without breaking the script's format". Also: a Poster Creation
  kit reopened from Saved (no files) turned "Use the attached logo" into the wordmark on its first refine (`!!files.logo`).
  Asked (AskUserQuestion), the owner chose: design requests in ONE "Changes:" line between the three sentences and the
  Format line; removing a verified number / the address on request is allowed, adding one never. Fix: the refine
  analysis answers `changes` (the whole line, earlier changes kept), `numbers`, `address`, `textLanguage`, `notApplied`
  besides the four fields, shown the prompt's Changes line and each verified contact "printed now" / "left out";
  `utils/posterAdType.refineConceptPoster` decides and assembles it (`cleanPosterChanges`, `printedPosterContacts`,
  `refinedPosterContacts` — a contact change only on a contact word, only within the verified list — `refinedTextLanguage`,
  `withoutFormatRepeats`); one core `geminiService.refinePoster` for `refinePosterConcept` (→ `{ concept, notApplied }`)
  and the new `refineVideoPoster` (→ `{ prompt, notApplied }`; `refineSection('poster')` returns its prompt); the logo is
  the prompt's own Format line or a logo attached now, unless "No logo"; the studio shows "Nothing changed" (with the
  notes) or "Refined — one part was not applied". A poster nobody refined is byte-for-byte as before.
  Files: `utils/posterAdType.ts`, `services/prompts/posterConcept.ts`, `services/geminiService.ts`, `types/aiPlatform.ts`,
  `components/ai-platform/AIPlatformApp.tsx`, `PosterConceptsPanel.tsx` (placeholder); tests `posterRefineOct13.test.ts`
  (new: the line's shape and read-back, the scrub, contacts, language, the answer reader, the assembly, Poster Creation's
  three-refine chain, the reopened logo, a colour request that cannot drop a number, the video row),
  `posterAdTypeOct12.test.ts` (new return shape), the two studio tests' Gemini mocks. Live on gemini-2.5-flash: a
  9-refine chain (colours + headline → leave out the address → Telugu words → remove the WhatsApp number → square (not
  applied, said so) → white instead of red → shadow ad → an unverified number (not printed, said once) → address back)
  and the video row (design change + "landscape" not applied) — every step in the right field, earlier changes kept, each
  number once, the shape valid; it showed the model copying the Format line's wordmark sentence into the Changes line and
  repeating the app's number note, both fixed in code. The studio in a real browser (real `AIPlatformApp`, panel and
  `GeneratedCard` on memoryFirestore, a faked Gemini, 1440 / 390 px): the Changes line, "leave out the address", one
  number left out, Telugu words, a saved kit reopened without its logo file, the video row; it found that an answer with
  ONLY a note ("make it square") read as "Refinement failed" (`usablePosterRefine` now counts `notApplied`), that the
  card's main benefit vanished on a partial answer (now kept, `currentBenefit`) and that "Refining…" stayed behind the
  new messages (reset first) — all fixed and re-checked. Build, typecheck (0) and the full suite pass.

- **2026-10-13: "Create next renewal" only for the main admin and the tech admin** (`smm.md` §9.9 "Locked months and
  Create next renewal", §24, §25; `roles-routes.md` §8). The owner: "Create next renewal — don't show this to the team
  lead, show this only to the admin and the sales person." The button (added 2026-10-12 in `5ca75b0`, on the client
  card, the month page's renewal row and the locked month's setup banner) makes Month N+1 directly with no sale behind
  it, and `canAdminRenewSmm` gave it to the main admin, tech admin AND tech team leader. Asked (AskUserQuestion), the
  owner chose: the salesperson keeps their own Renew (the renewal sale, with approval and commission) rather than
  this button; "admin" = the main admin and the tech admin (not the sales admin). Fix: `canAdminRenewSmm` →
  `main_admin`, `tech_admin` (one rule, read by all three places), and `createRenewalMonth` refuses anybody else
  signed in (`assertMayCreateRenewalMonth`, `SMM_CREATE_RENEWAL_ADMIN_ONLY`, after the view-only lead's own check),
  so the rule does not depend on a hidden button. A team leader gets "Remind <salesperson>" on an undecided month
  again (the page already showed it to anyone with setup rights who lacked this button). The Social Media Team
  Lead never had it.
  Files: `utils/smmPackage.ts`, `services/smm.ts`; tests `smmCreateRenewalAdminOct13.test.tsx` (new: the service
  refuses the team leader, the salesperson and a member with nothing written and lets both admins make Month 2; the
  real month page and setup dialog for each role), `smmAddSaleUi.test.tsx` (the board card for tech admin, main
  admin, team leader with and without the flag, salesperson), `smmLockedRenewalOct12.test.ts` (team leader now
  false). Checked in a real browser on the in-memory Firestore harness (each role; the admin creating Month 2;
  1440 / 390 px). Build, typecheck (0) and the full suite pass.
- **2026-10-13: contact numbers on the poster and the footer — one verified list, each number once** (`ai-ads.md` §17.2
  step 1 / step 5 / Poster Creation, §24, §25, §27). The owner: "fake, missing, or duplicate numbers are appearing …
  1 unique number → exactly that 1, 2 → those 2, 3 → those 3; never duplicate, never invent; one validated list for
  Poster, Footer and every related prompt". The verification layer (`utils/businessFacts`, 2026-09-25) was sound at its
  centre; the audit ran edge inputs through it and every deliverable and found eight leaks. **Duplicates:** the label's
  contact block asked for "a WhatsApp pill of its own … beside the call pill(s)" under "EXACTLY 1 NUMBER — draw 1
  contact pill" → the image tool drew a WhatsApp number twice, and two numbers as three pills; a label refine (a model
  rewrite) could repeat, drop or renumber CONTACT lines and only an invented number was removed. **Fakes:** every typed
  8–15-digit run was a phone number ("Order ID 4521789632", a bank account, a price) and printed as one; a poster with
  no number said nothing about phones, so the image tool was free to add its own "Call" strip; Poster Creation had no
  final scrub (only the video poster did); the scrubber could not find a run re-spelt by `splitRun` (dashes → spaces,
  double spaces), so such an unverified number survived. **Wrong / altered:** "WhatsApp: X, Call: Y" marked Y WhatsApp,
  "Call: X, WhatsApp: X" lost it, and "mobile: X, whatsapp: X" in a card's profile lost it too; "(+91) 98480 12345" was
  printed "+91) 98480 12345" and "0884-2345678" in a run as "0884 2345678". **Missing:** a number spoken in the voice note
  could come back in words (never typed), and the label, posters and overlays each cut their own list.
  Fixes: a typed number counts only when phone-shaped or labelled as one, never when labelled an account / id /
  registration / price, never glued to "@" (`findPhoneNumbers` → `label`, `labelZone`, `OTHER_LABEL`, `CONTACT_LABEL`,
  `isWellFormedNumber(…, { allowShortLandline: false })`), and a number the member gave as something else is refused from
  the model's profile; WhatsApp read from the nearest label (and "(WhatsApp)" right after); duplicates merged; spelling
  kept (`balanceBrackets`, `splitRun` slices); the list capped at `MAX_CONTACT_NUMBERS` = 3 in `verifyBusinessFacts`;
  **`contactNumbersOf`** the one list (label, both posters, overlays, frames, refines — `contactKeysOf` in geminiService,
  `MAX_LABEL_CONTACTS` removed); `contactNumberProblems` the check. Label: `prompts/lowerThird` `whatsappSentence` (one of
  the N pills), `labelContactLines`, `NO_CONTACT_LINE`, a 7th final-check item, `withLabelContacts` re-stamps a refine.
  Poster: `posterPhoneRule` on the Format line (`contactCount`), `uniquePosterContacts`, the scrub inside
  `assembleConceptPoster`. Frames: `stripUnverifiedNumbers` on generated and refined frame prompts (signage). Voice note:
  a spoken phone number in digits. Legacy profiles (no `contactNumbers`) give only well-formed numbers.
  Files: `utils/businessFacts.ts`, `utils/posterAdType.ts`, `services/prompts/lowerThird.ts`, `services/prompts/voiceNote.ts`,
  `services/geminiService.ts`; tests `contactNumbersOct13.test.ts` (new: 18 scenarios — 0 / 1 / 2 / 3 numbers, WhatsApp
  either way, one number written three ways, six copies of three, a fourth, ids / accounts / prices / UPI, a card read,
  a card misread, the member's own format — each through the list, the label, the video poster, Poster Creation end to
  end, a label refine that repeats / invents / drops, the overlays and a frame refine on a fake Gemini), and
  `lowerThird`, `posterAdTypeOct12` updated for the new wording.
  **Real browser** (background agent; the REAL `AIPlatformApp` on the in-memory Firestore with a fake `@google/genai`,
  headless Chrome over CDP, 1440 and 390 px, harness in the scratchpad): Poster Creation for 0 / 1 / 2 / 3 numbers,
  six copies of three and ids / account / price — every prompt carried exactly the list, each once, with the matching
  phone rule (and the same with the fake extraction "reading" the order id and other spellings); a saved kit's VIDEO
  BOTTOM LABEL and Poster rows (Missing → Generate) printed "CONTACT 1 = 98480 12345", "CONTACT 2 = 91603 45678
  (WhatsApp)", "EXACTLY 2 NUMBERS …" and "one of the TWO pills, not an extra one"; no console errors, no overflow at
  390 px. It found two more, both fixed the same day: the poster's Business Information kept "Call or." after the scrub
  removed both numbers of the model's "Call X or Y" (older than this task — `stripUnverifiedNumbers` now takes a removed
  number's joiners and a sentence that was only about removed numbers with it, and a text left with only a label
  becomes ""), and the one-number label read "one of the ONE pill" (now "It is the ONE pill"; final check "Is there
  exactly ONE contact pill"; value line "the number written once"); a re-run of the browser check passed all of it.
  The first round went out in the owner's commit `66c4cea` (pushed, with a parallel session's SMM work); these
  follow-ups are in the working tree. No image was generated from the new prompts.

- **2026-10-12 → 13: three items — the Social Media Team Lead view-only, Half Day leave, the poster prompts** (sessions
  dts-os-d1, then dts-os-e1 from `HANDOFF.md`; `smm.md`, `roles-routes.md`, `backend-security.md` §14, `people.md`,
  `data-model.md`, `ai-ads.md`). The owner's answers (AskUserQuestion): the lead keeps Edit team on Attendance and loses
  "Add a month that had no sale"; a half day uses ½ of the 2 paid leaves — inside it a full day's pay, past it half a
  day's pay — for tech AND sales; BOTH poster systems switch, the prompt is the three sentences exactly + one Format line;
  then "poster ratio 9:16".
  **(1) SMM Team Lead, a hybrid role.** Root cause: `smmPlan.canEditCampaign` asked `isSmmOverseer` (sight), so the lead
  could edit every month; `5ca75b0` had moved setup / delete off her but left every other write, a guard on
  `setItemStatus` only, `canAddNoSaleMonth` true with its button hidden, write sweeps over everyone's months and copy
  telling her she "runs every month". Now one answer, `canEditCampaign` (an SMM admin by role, the month's salesperson,
  or somebody on the month) + `isViewOnlySmmLead`; `services/smm` `assertMayChangeMonth` inside `mutateCampaign`'s
  transaction and `assertMayManageMonths` first in every managing write (`smmSetup`, `smmAssign` too), `SmmViewOnlyError`;
  the on-open sweeps skip what she may not change; the month page says "View only." with every write control gone (post
  dialog, Ads, Money, Report send, "Their chat", setup, rename, delete); her own month is a member's page; the first
  `smm_campaigns` rule in `docs/firestore-rules.md` (unpublished). Test: `smmLeadViewOnlyOct12.test.tsx` (10) + 4 older
  SMM tests updated.
  **(2) Half Day leave.** `LeaveRequest.duration` (`full_day` / `half_day`, absent = full; `kind` deprecated); a half day
  is one working date; the allowance settles in half days (`splitLeaveDays` share / paid / unpaid / mark); approval writes
  the new mark **HL `half_leave`** (paid as a full day) or **H** past the allowance; a full day with ½ left is `leave` paid
  ½; `tallyAttendance` / `computeSalary` / `deductionsFor` / `netPayable` count halves (new lines and the
  `half_leave_unpaid` deduction; `paidHalfLeaveDays` / `unpaidHalfLeaveDays` optional on the computation;
  `formatDayCount` / `formatDays` / `paidLeaveUsed`); every screen that shows leave updated (LeavePanel Full day / Half day,
  LeaveApprovalsPanel chip, notifications and audit, grid + editor on both sides, calendars, AttendanceCard, UpdatePopup,
  My Salary ×2, Payroll + CSV, Sales Payroll, Salary Management, payslip, the SMM TODAY board — whose icon map was the one
  typecheck error the hand-off left). Whole-day results unchanged (every older payroll / attendance / leave suite green
  untouched). Test: `halfDayLeaveOct12.test.tsx` (30).
  **(3) Poster prompts.** Root cause: Poster Creation asked for 1–6 long art-directed concepts at temperature 0.95 with "at
  least two different styles", and the video kit's poster row was a second, separate 150–220-word prompt. Now one system
  for both (`utils/posterAdType` + `services/prompts/posterConcept`): one `standard` analysis call at temperature 0.2 →
  JSON (type id, reason, benefit, ≤ 60-word business information) → the type (fixed style as it is, else the analysis's
  one, else a deterministic keyword rubric) → the prompt assembled in code: the owner's three sentences + "Format: 9:16
  vertical poster. Use the attached logo exactly as given. Words on the poster in English." (no logo → the name as a
  wordmark, never the word logo); the model's numbers are stripped and the VERIFIED contacts / address added by code; one
  prompt per run (the count select removed); refines change the type only when asked. `DEFAULT_POSTER_SIZE` = "9:16"; the
  video kit's poster always 9:16. `PosterConceptsPanel` shows the new shape (old saves as before), the poster row is plain
  text, Tools history "Poster Design", one Gemini tab in the mission guide, the ETA plan has one analysis. Removed:
  `POSTER_SYSTEM_PROMPT`, the dead `generatePosterPrompt`, the old concept prompt builders and reply readers. Test:
  `posterAdTypeOct12.test.ts` (all 8 types in the exact structure, Format variants, business-info cleaning, fallback,
  Poster Creation / video row / both refines on a faked Gemini); posterConcepts, noLogoPrompts, generationEta,
  missionWorkspace, posterSpec, businessBriefAndPosterJobs updated.
  Also: the typecheck baseline is 0 errors since `5ca75b0` (CLAUDE.md §28 / §30 / §32 / §33, `backend-security.md` §26.6).
  Verified: build ✅, full vitest ✅ 231 files, 3564 tests, typecheck 0 errors; browser (a throwaway harness in the scratchpad driving the REAL pages on the in-memory Firestore, headless Chrome
  at 1440 and 390 px, no console errors, no overflow): the lead on someone else's month (View only, every write control
  gone, the post dialog read-only and its month byte-identical after opening it, light + dark), on her own month (member
  tools, a title autosaved), the board as lead, the tech admin unchanged; Half day on /tech/salary and /sales/salary
  (Sunday refused, preview, saved `half_day`, past-allowance wording, withdraw), Team Attendance approve → HL / "1HL" /
  "Leaves left: 1½" for the tech and the sales admin (sales editor without plain H), Payroll (paid HL no deduction; L L HL
  → "Half-day leave without pay (1 day)" −₹500), the SMM TODAY board; the poster panel (new shape light + dark, Copy prompt
  = exactly the prompt, Refine; an old saved generation unchanged) and the studio in Poster mode (no count select, 9:16
  selected, "Generate Poster Prompt"). Fixed from it: the "View only" labels' light-theme contrast (1.6:1 → 6.3:1,
  amber-800), read-only stage buttons no longer light on hover, the approval row on a phone (the buttons drop below the
  text), the poster Refine input on desktop (26 px wide), "never describes it", and the studio's old "at least two styles"
  explainer (`PosterSpecFields`). Not driven: live Firebase / the
  published rule, live Gemini, an image made from the new poster prompt.
- **2026-10-10 (later): a Copy link button beside "Open AI Studio"** in the Gemini API key steps (`ai-accounts.md`).
  The owner asked to copy the AI Studio link. `ApiKeySteps` (`components/ai-accounts/ApiKeyField.tsx`), shared by the
  key dialog and the Add a Flow account form, gets a `CopyLinkButton`. It copies the same `aiStudioUrlFor(email)` the
  Open button uses, keeping `?authuser=`, through `lib/clipboard.copyText` (which has the Android fallback). It shows
  "Copied" or "Could not copy" for 1.5 s. The use: an account that is signed in on another Chrome profile or device,
  where opening AI Studio from here would land in the wrong account. Tested: `apiKeysOct10.test.tsx` (the copy puts the
  account's link on the clipboard); a real headless Chrome at 1440 and 390 px (the button sits beside Open AI Studio
  on desktop and wraps under it on a phone, no overflow, Copied → Copy link after 1.5 s, no console errors); build,
  full vitest, typecheck (1 known error).
- **2026-10-10 (later): Motu & Patlu walk only where a clip's words need it** (`ai-ads.md` §17.2 step 6 / §24 / §25 /
  §27, `data-model.md` sceneContext). The owner: "in all the clips they are walking, because of it the AI sometimes
  changes their heights and their attire — make them walk only where it is necessary, based on the frame and the
  voice-over script". Root cause: the 2026-10-05 dynamic pass planned a drawn pair exactly like a real pair — clip 1
  a walk, the last a walk-in, the middle rotation 3 walks in 4, then "at least half the clips walk" — and in the
  client's own photos a pair had NO in-place action, so every clip walked; every frame was drawn "caught mid-step" and
  Veo continues the pose a frame starts in. A video model cannot keep a drawn body through a walk (it redraws both on
  every frame), so Patlu's height and their clothes drifted. Fix (scope and "no cap" chosen by the owner: Motu & Patlu
  only): `CharacterPack.walksOnlyWhenNeeded` on `duo_motu_patlu` (catalogue TS + JSON) → `planClipMotion({
  walksWhenNeeded })`, built identically on the frame side and the video side (`motionOptionsFor`). Each beat is chosen
  as before; a clip walks only when its words take them somewhere — the scene plan's new per-clip `walk` judgment
  (`SCENE_PLAN_SYSTEM_PROMPT walksWhenNeeded`, read by `parseScenePlan` / `motionChoicesOf`), else `lineNeedsWalk`
  (English, Telugu incl. "వెళ్లి … -దాం", Hindi, Tamil, Kannada, Malayalam; a viewer invitation never walks); never
  the festival greeting. Every other clip is the same beat performed where they stand (`Staging.pairInPlace`,
  `ROLE_ACTION.pairInPlace`), frames composed standing mid-gesture beside what the line is about, a short glide "both
  seen from the same angle throughout" or (their photo) a still camera; the pack frame prompt and the director
  (`VEO_DIRECTION_SYSTEM_PROMPT walksWhenNeeded`) say why; the keep sentence "they perform side by side where they
  stand", the identity lock names their outfits, the negative adds "no morphing". Found by the live run and fixed:
  `PAIR_SCALE` refused any "rise", so Motu's own catalogue gesture "both hands rise near his chest" threw away 2 of 8
  good director actions — a hand, arm, palm, finger or brow rising is now a gesture (the body rising is still refused,
  for every pair). Files: `prompts/motion.ts`, `prompts/characterAd.ts`, `prompts/scenePlan.ts`, `utils/scenePlan.ts`,
  `characterPacks.ts`, `characterCatalogue.ts`, `docs/video-category-catalogue.json`, `types/aiPlatform.ts`,
  `geminiService.ts`; tests `motionAndVeo` (new block: every length × ad type × photo mix stands when no line moves
  them; the walking clip alone walks; the word reader in six languages; the scene plan's judgment wins; frames; the
  prompt; the director; the scene plan), `characterAdPrompts`, `adPipelineEndToEnd` (standing run + a client-photo run
  where only the "let's go inside" clip walks). Full vitest 227 / 3497+, build, typecheck (1 known). Live on
  gemini-2.5-flash, two 4-clip Telugu Motu & Patlu runs (107 s / 42 calls and 32 s / 8 calls with a custom script):
  the AI-written script got `walk: false` on all four clips and four standing frames; the custom script's
  "లోపలికి వెళ్లి బ్రైడల్ కలెక్షన్ చూద్దాం" clip alone got `walk: true` and a walking frame and prompt; the director's
  standing actions were specific (pointing at the bridal case, a hand on the chest). Prompts ~350–380 words. Not seen
  yet: a Flow video from them.

- **2026-10-10 (later): the "Add a Flow account" form asks for the Gemini API key** (`ai-accounts.md`,
  `docs/firestore-rules.md`). The owner: when adding a new account, also ask the API key. The form now has a
  Gemini API key section — AI Studio opened in the email being typed, the steps (folded for someone who has given
  a key), paste, checked with Google as it is pasted, a key already on another account refused — and the account,
  its password and its key are written in ONE transaction (`addFlowAccount` takes `apiKey`; `apiKeyRecords` shared
  with `saveFlowApiKey`). Saving without a key needs "Add the key later" ticked; the card and "Add next key" ask
  after. The key popup that opened after adding an account is gone. The entry logic moved out of `ApiKeyDialog`
  into `hooks/useApiKeyEntry` + `ApiKeyField` (`ApiKeySteps`), used by both. Rule fix found on the way: a key
  created in the same transaction as its account must be checked with `getAfter` (as `flow_account_secrets` is)
  — `get` would have refused members once the rules are published. Tested: `apiKeysOct10` (14: the add form
  refusing no key / a used key / a leaked key and then saving all three documents together; "later" saving the
  account alone; the transaction refusing a duplicate email without touching the existing key); full vitest
  227 / 3486; typecheck (1 known). Real browser (16/16, no console errors, 390 px no sideways scroll), including a
  real call to Google from the form.

- **2026-10-10 (later): AdGen prompts no longer fail on a retired, busy or used-up Gemini model** (`ai-ads.md` §17.3 /
  §24 / §27, `backend-security.md` §24 / §26.3). The owner: "sometimes prompts are not generating", showing Google's
  raw `{"error":{"code":404,"message":"This model models/gemini-2.0-flash-lite is no longer available …"}}`. Found:
  (1) `MODEL_LIST` still held gemini-2.0-flash and -lite, which Google shut down on 2026-06-01 (asked again on every
  page load — retirement lived only in memory); (2) the root cause of the failures: the parallel calls of a run shared
  ONE "current model" pointer and ONE "current key", so a call counted keys and models while others moved both, gave up
  with live models untried and showed Google's last answer as raw JSON — on a busy free-tier day 8 of 320 calls (7 of 40
  page loads) failed in a stress test of the old code, 0 after; (3) one 503 moved the whole session off
  gemini-2.5-flash for good; (4) the error checks searched the text for "404" / "limit" / "invalid" — a 429 whose retry
  delay read "14.404553s" retired a healthy model, a 400 went round every key; (5) rests were per KEY though Google's
  quota is per key × model; (6) gemini-2.5-flash, the primary, is itself deprecated (2.5 models "limited to users who
  have actively used them in the past", 2026-09-18). Measured live first (models.list on all 30 keys + one request per
  candidate model and thinking setting): 19 keys work, 2.0 models 404, 3.8 / 3.6 Flash, 3.5 / 3.1 Flash-Lite and the
  `-latest` aliases (→ 3.8-flash, 3.5-flash-lite) answer; 2.5 refuses a thinking LEVEL, 3.8 refuses MINIMAL, 3.x thinks
  at medium by default. Built: `utils/geminiModels.ts` (pure, tested) — `GEMINI_MODELS` (2.5-flash → 3.8 → 3.6 → 3.5-lite
  → 2.5-lite → 3.1-lite → flash-latest → flash-lite-latest), `thinkingFor` (budget on 2.5, level on Gemini 3 Flash, none
  on lite), `readGeminiError` (by status and Google's own words; a 404 retires only the model it names),
  `nextQuotaReset` (midnight Pacific), `restAfter`, `geminiUnavailable` / `GeminiUnavailableError` (the sentence a member
  reads); `services/geminiService.callWithFallback` rewritten: shared state is facts only (retired models a week in
  localStorage, dead keys, key-lacks-model, a rest per key × model — daily ones kept until the reset, a model "used up
  for the day" after 3 daily 429s asked last and once per call, a 30 s busy spell), each request routes from the top of
  the list on the next key, a refused thinking setting is retried without it, a 400 is thrown at once in Google's words,
  the caller's own errors pass through, waits ≤ 75 s for a soon-free route, always asks Google once; `generateWithRetry`
  stops on `GeminiUnavailableError`. Not changed: the primary model (2.5 Flash, the one the prompts were tuned on), the
  call sites, Cinematic Ads (same layer). Tested: `geminiModels.test.ts` (25, Google's real error bodies),
  `geminiModelFallback.test.ts` (21, a fake Google on the 2026-10-10 key health with virtual time — 15–16 of them fail on
  the old code), `geminiCallSpeed` unchanged and passing; full vitest 225 files / 3457 tests; build; typecheck (1 known).
  Live (real keys, vite-node): the SDK's real 404 for 2.0-flash-lite reads as retired; a 2-clip Telugu ad in 106 s on
  2.5 Flash (21 answers, all deliverables, QA 7.4) and in 97 s with 2.5 Flash forced out for the day (every request on
  3.8 Flash with LOW / MEDIUM levels, all deliverables, QA 8.6). Real browser (headless Chrome over CDP, scratchpad
  harness, real Google): 6/6 — daily mark and retirement remembered across reloads (0 requests to them), a real 503
  "high demand" from 3.8 Flash handed to 3.6 Flash, the plain message with the reset time "12:30 PM".

- **2026-10-10 (afternoon): Gemini API keys on the Flow accounts** (`ai-accounts.md` §9.21 / §24 / §25 / §27,
  `data-model.md`, `roles-routes.md`, `docs/firestore-rules.md`). The owner: everyone adds the Gemini API key made
  in each Flow account they created (AI Studio → Create API key → "Gemini API Key" → Create project "aiads"), next to
  the account, with instructions; the admin gets a separate section of only the keys — person and key — to copy a
  set, and mark keys "using", for DTS AdGen's prompt generation. Asked (AskUserQuestion): AdGen stays as it is — the
  owner deploys keys by hand, wanting a `.env` download and a plain copy of a set; the section is the **tech admin's
  only**. Built: `gemini_api_keys/{account id}` (the key, apart like a password) + `flow_accounts.apiKey` (status
  and a one-way fingerprint only), written in one batch; `utils/geminiKeys` (pure: read a pasted key, why it can't
  be one, fingerprint, Google's answer → working / failed / unchecked, copy text, `.env` as `API_KEY_n` with a
  person · account comment each, coverage queue, groups, who sees); `services/aiAccounts` check (Google's free
  models.list, key in a header), save / remove / in-use / checks (owner told once when a key dies, asked for a new
  one when removed), and `deleteFlowAccount` deletes the key; `ApiKeyDialog` (AI Studio opened in that account with
  `?authuser=`, steps with copy chips, checked as it is pasted, duplicate refused, Save & next), `ApiKeyProgress`
  (members' "N / M have a key" + Add next key), the key row and "No API key" filter on every card, a new account
  going straight on to its key; `ApiKeysPanel` (tech admin: by person, filters, select any set → Copy keys /
  Download .env / Check / Mark in use; refused keys left out of copies; a dead key marked in use says to take it out
  of Vercel); the Overview's API keys column; `lib/clipboard` (`copyText` moved from DriveUploadSheet, `downloadText`).
  Measured live: models.list answers AdGen's own 30 keys exactly as generation does — keys 1, 12, 18 invalid (400),
  13, 16, 23–28 "reported as leaked" (403): 11 of 30 dead. Tested: `geminiKeys` (15) and `apiKeysOct10` (12: the
  service on the in-memory Firestore; the real My AI Accounts and AI Accounts pages — Save & next through three
  accounts, typo / invalid / leaked / duplicate refused, the admin's copy, .env, in use, check, remove, a team leader
  without the tab and without keys); full vitest 227 / 3484; build; typecheck (1 known). Real browser (32/32, no
  console errors): the same flows on the real pages, a real call to Google from the browser (CORS, header and
  parsing — "not valid"), 390 px with no sideways scroll, the tech admin's five tabs fitting a phone.

- **2026-10-10 (afternoon): comp-off for working on a holiday** (`people.md` §9.13 / §24, `data-model.md`). The owner:
  people who work on a holiday were rewarded at pay time by marking one of their absences as Leave — which used up
  the two paid leaves, so a member who had already taken two had the "reward" deducted (Anjali's and Aswinitha's
  third L in September may be exactly that, ₹385 each). They asked for a separate option that is a paid day. Asked
  (AskUserQuestion): the admin marks the holiday worked (not from check-ins); one-click Apply in Payroll + by hand on
  the grid; credits good in the same pay cycle only; any work on a holiday = one full credit. Built: marks
  `holiday_work` (W) and `comp_off` (C) (`AttendanceStatus`, `ATTENDANCE_META`); `tallyAttendance` / `computeSalary`
  count W on every day (Sundays too) as credits, pay C in date order out of them, an uncovered C is unpaid
  (`comp_off_unpaid`); `compOffToApply` (earliest absences only); `techAttendance.applyCompOff`; Team Attendance
  editor (W on holiday dates, "Comp Off — paid · N left" on working days), grid summary line, `CompOffPanel` + chip on
  Payroll and Sales Payroll, My Salary tile hint, payslip rows, SMM board mapping. Nothing else changes: the Sunday rule
  holds (W adds no pay), paid leaves untouched. Tested: `compOffOct10` (10: the rule, the old Leave workaround's
  deduction, same-cycle-only, uncovered C, Apply on the in-memory Firestore re-pricing the row, the real grid editor);
  full vitest 223 / 3411 (one AI-platform UI test timed out under load and passes alone 3/3); build; typecheck.
  Real browser (7/7, no console errors, 390px no sideways scroll): W marked on a Sunday through the editor; Comp Off
  offered with "1 left" and disabled at 0; Payroll Apply turned Asha's 15 Sep absence into C (₹24,500 → ₹25,500, chip
  gone, member notified); the grid read "1W 1C · 0 left"; My Salary showed it; Sales Payroll the same for Sita
  (₹26,500 → ₹27,500). Open question noted for the owner: a check-in on an announced holiday earns no credit — only
  the admin's W does, as chosen.
- **2026-10-10 (later): inactive people are shown only in My Team** (`roles-routes.md` Deactivate, `people.md`).
  Owner: "except in the My Team sections, in all the remaining sections don't show the inactive persons — only the
  active." Asked (AskUserQuestion): hide only the PERSON (their past sales still count in totals, their pending
  approvals stay); Main Admin → Team Management counts as a My Team section. One rule, `roleHelpers.isActiveUser`
  (`isActive !== false`). Newly filtered: Payroll and Sales Payroll (this reverses the same day's "leavers keep a
  Left row" — `uidsWithAttendance` and `left` removed), Salary Management, Accounts Dashboard (staff count, salaries,
  roles), main Accounts (salary total), Revenue Summary / Revenue Overview (per-person rows), main Session History
  (dropdown and sessions), Tech / Sales Department (admin lists), Clients (upsell / review salesperson picker),
  Feedback & Upsell, and the sales admin's Dashboard / Analytics / Leads Management / Member Leads (people listed =
  active; leads still loaded for the whole team, so totals keep a leaver's sales; the number lookup still names a
  holder who left; the Reassign pickers offer active people). Already active-only (checked): Team Attendance, HR,
  Send Agreement recipients, Settlements, Leaderboard, Work Assign ×2, Orders, Work Reports, Tools, Drive, Session
  History (tech/sales), AI Accounts, Social Media, chat / meetings / calls, birthdays, main Dashboard, Profit.
  Unchanged on purpose: Sales Approvals (a leaver's pending sale stays to be verified), Send Agreement's sent /
  received document lists (documents, not people), name lookups on records. Tested: `activePeopleOct10` (2) and the
  real Payroll page on the in-memory Firestore (an inactive member who checked in is not listed); full vitest
  222 / 3401; build; typecheck. Real browser (9/9 PASS, no console errors, 390px no sideways scroll): Payroll, Sales
  Payroll, Salary Management (8 staff = the 8 active users), Accounts Dashboard, Tech / Sales Department, Session
  History without the inactive people; the sales admin Dashboard lists 2 members but its period revenue ₹30,000
  still includes the leaver's ₹20,000; Leads Management's number lookup names the leaver as holder and its Reassign
  offers active people only; both My Team pages and Team Management still list the inactive people.
- **2026-10-10: Attendance → Pay Salary on one source of truth** (`people.md` §9.13 / §9.14 / §24 / §25,
  `data-model.md`). Owner: Pay Salary must come straight from live attendance; "fix all the other issues like them in
  the OS". Asked (AskUserQuestion): Sunday marks never change pay; a rejected check-in stays Present; link Accounts'
  Salary Management to Payroll; joiners unchanged.
  - **Root causes found (each confirmed in code):** (1) a paid row never froze — `useMonthPayroll` froze on a
    `payroll_runs` stage nothing writes, so a paid salary kept re-pricing (row, "Paid" total, re-downloaded payslip)
    after any correction; (2) loading was declared on the first check-in snapshot, and `watchCheckedInDaysInRange`
    reported after the first of its two collections — leave/holidays briefly Absent, every sales member Absent; every
    listener turned a read error into "no data"; (3) the grid / calendars counted their own way (Sunday marks counted,
    allowance hard-coded 2) while the salary skipped Sundays — and the salary's quota pass let a Sunday marked Leave
    use a paid-leave slot; (4) Sales Payroll priced the incentive differently from the member's My Salary (full price
    on the UTC submission day, no 75% gate); (5) leavers vanished from Payroll (`isActive` filter); (6) a sales check-out
    after midnight created the next day's record and that day counted Present; (7) Salary Management pre-filled the
    full salary and could not see Payroll payments, and the member's history showed receipts only; (8) "can't be paid"
    banner counted everyone and tech "Verify details" was a no-op (legacy bank fields never set); (9) leave approval
    counted requests not the record, used default policy, toasted its estimate; undo wiped hand-corrected days; salary
    and leave notifications linked `/tech/salary` for sales members; (10) payslip / sales salary card hard-coded the
    half-day 0.5 and the sales slip's ledger omitted the incentive (gross − deductions ≠ net); (11) Announce Holiday
    jumped to the wrong cycle; pages kept yesterday's "today" overnight; analytics "Days Present" counted raw records.
  - **Done:** `payrollEngine.tallyAttendance` + `netPayable`; `techAttendance.summarize(days, config)`,
    `isCheckInRecord`, `onError` on range listeners, both-collections rule; `payrollRun.isLinePaid`, `watchPayrollLine`,
    `priceMemberForPeriod`, `memberRole` / `incentive` on lines; `payroll.isBankVerified` / `payoutMethodOf`;
    `roleHelpers.getSalaryRoute`; new `utils/salesPay`, `services/salaryReceipts`, `hooks/useToday` (lifted from
    SmmAttendanceView), `usePayrollConfig`, `useSalaryPayments`; rewritten `useMonthPayroll`, `useSalesMemberPay`,
    `useSalaryMonth`, `useSalesEarnings`; pages Payroll, Sales Payroll, Team Attendance, both My Salary pages, Salary
    Management, MySalary (history), SalaryTimeline, AttendanceGrid, MyDayCalendar, SalesDayCalendar, AttendanceCard,
    MemberAnalyticsDashboard, sales Dashboard check-in card; `services/leave` + LeaveApprovalsPanel; `payslipPdf`.
  - **Tested:** `payrollSyncOct09` (14, pure) and `payrollLiveOct09` (14, real hooks/services/component on the
    in-memory Firestore — `memoryFirestore.__failReads` added for read errors); `attendance` and `salesAttendance`
    updated to the new contracts (+6); `smmAttendanceOct08` had a pre-existing race (1 run in 8 on unchanged `main`) —
    its assertion now waits. Full vitest 221 files / 3399 pass; build; typecheck (1 known error); eslint on the
    touched files: only pre-existing `any`s. **Real browser** (throwaway harness in the scratchpad on the in-memory
    Firestore, real pages, 1440 / 390 px, dark once; 17 + 5 checks PASS, no console errors, no horizontal scroll):
    Payroll (Asha ₹24,500 = 26,000 − absent − half; Ben Paid ₹26,000 then "Now ₹25,000" after an Absent marked in
    Team Attendance; Ravi "Left" ₹3,000; "Old" absent; banner "1 employee can't be paid yet"; Verify writes);
    the grid "24P 1H 1A 0L" with the Sunday mark "not counted in salary"; leave approval toast "counts as absence";
    Sales Payroll = Sita's My Salary ₹26,500 (check-out-only day Absent, 5% of 30,000), Gopi withheld; Asha's My
    Salary = Payroll; Salary Management pre-fill "From attendance: ₹24,500 …", "Payroll already recorded" + confirm
    on top, receipt listed on Payroll, Ben's history both records. Fixed from it: Salary Management defaulted to
    and checked the RUNNING cycle (a cycle is paid after it ends — `payrollEngine.salaryMonthDue`); a paid
    month's attendance tiles showed the paid counts beside a corrected calendar (tiles are live now) and the
    pay-day card said "being processed" for a paid period. Not driven: live Firebase / Cloudinary, the PDF download.
- **2026-10-08 (23:10): the TODAY board's cards say what Social Media work each person handles** (`smm.md`
  §9.9). The owner, on the live board: "in the cards, for each member, write what social media handling they are
  doing" — a card said only "Creator · Publisher · Marketer — 2 clients" (the names in a tooltip). Now under the
  status: "Handles 2 clients" and one line per client with what they do for it ("Lakshmi Jewellers — Creator,
  Publisher, Marketer"), tagged "month ended" / "starts 20 Oct" for a month not running; running clients first.
  `utils/smmAttendance.smmTeamFromMonths(campaigns, today)` builds `handles` (a client's two months on the board =
  one line, the most current state), `handlesHeading`; `seatLine` removed. Cards are flex columns so a row's Call /
  WhatsApp buttons line up. Edit team shows the client names. Tested: `smmAttendanceOct08` (14 — each person's
  clients, roles and month state, two months of one client, the card's lines), full vitest (3365), build,
  typecheck. Real browser (1440 / 390 / 360 px, dark and light, no console errors): every card's clients, roles and
  "month ended" / "starts 20 Oct" tags right; a 70-character client name wraps, nothing overflows; a row's cards equal
  height with the Call / WhatsApp buttons on one line; contrast ≥ 4.5:1. Fixed from it: Edit team cut long client
  lists with "…" on a phone (the rest only in a tooltip) — they wrap now.
- **2026-10-08 (night): Social Media → Attendance becomes a TODAY board for the lead's daily meeting**
  (`smm.md` §9.9 / §24 / §25, `people.md` §9.13, `roles-routes.md` §8, `data-model.md` `app_settings/smm_team`,
  `docs/firestore-rules.md` note — no rule change).
  - **The owner, with the pay-cycle grid live:** "don't show all months — only today; some members are not showing,
    check that error; she holds a meeting every day, people don't join, she calls them and they say they are absent —
    she needs to know who is absent before the meeting; plain enough for anyone." Asked (AskUserQuestion, with
    mockups), the owner chose: grouped with the call list first; the team automatic + editable by the lead; Call +
    WhatsApp buttons.
  - **Why people were missing / blank (each confirmed in code):** today without a check-in was a blank cell
    (`techAttendance.resolveStatus` marks Absent only after the day — Bhanu's empty 08 Oct); only RUNNING months were
    read (five months on hold on the board that day, plus upcoming and set-up ones, dropped their people); only the
    month's seats were read, never a post's own `makerUid` / `publisherUid`; team leaders were only named in small
    print under the grid.
  - **Done:** `components/smm/SmmAttendanceView.tsx` rewritten — the day, "updates by itself", four big numbers
    (Present · Not checked in · On leave · Absent), then *Not checked in yet — call them* (Call `tel:` + WhatsApp
    `wa.me`, `utils/phone`), *Not coming today — no need to call* (leave, a pending leave request, absent), *Present*
    ("In at 9:42 AM · left 6:05 PM", half day), *No check-in record* (team leaders, Call / WhatsApp too), *Day off*;
    a Sunday / holiday banner; "nobody to chase" when the call list is empty; midnight rollover. Rules in
    `utils/smmAttendance` (`smmTeamFromMonths` — every `active` month, seats and posts; `applyTeamEdits`;
    `todayStatusOf` — mark → check-in → day off → pending leave → team leader → not checked in; `todayCounts`;
    `leaveAskedOn`; `canEditSmmTeam`). New: `services/smmTeam` (`app_settings/smm_team` added / removed,
    arrayUnion / arrayRemove), `components/smm/SmmTeamEditor` (Edit team: add from `fetchAssignableMembers`, Take off,
    Put back), `techAttendance.watchCheckinsOnDay` (today's check-ins with their times). The pay-cycle grid stays in
    Team Attendance (`AttendanceGrid`); `SocialMedia.tsx` passes the user.
  - **Tested:** `smmAttendanceOct08` rewritten (13: who is on the team — on hold, upcoming, a post's maker, off-board
    months, left employees; the corrections; the day's order of authority; counts; the real board on
    `memoryFirestore` — groups, Call / WhatsApp links, a check-in moving a person to Present live, Edit team writing
    `app_settings/smm_team` and the board following, Sunday, empty); typecheck (1 known error), lint clean, full
    vitest (219 files, 3364 tests), build. Real browser (throwaway harness, the real `SocialMedia` page on
    `memoryFirestore`, 1440 / 390 / 360 px, dark and light, no console errors): the counts, the four groups in order
    with the right words ("In at 9:05 AM · left 10:40 AM", "Asked for leave — not approved yet"), `tel:` / `wa.me`
    links, the on-hold / upcoming / post people listed and the taken-off one not; a check-in seeded with the board
    open moved the person to Present in 3 ms; Edit team add / take off / put back writing the right arrays at 390 and
    1440 px, the dialog scrolling inside at 360 × 640; the tech admin with Edit team, a team leader without the flag
    on Cards (stored view and `?view=`); a holiday banner. **Fixed from that check:** a team leader's status was cut
    5px at 360 px (pills now wrap); white on the orange Call / emerald WhatsApp buttons was 2.8 / 3.8:1 (now sky-700 /
    emerald-700); two light-theme labels under 4.5:1; the "saved" toast covered the dialog's title and 16px close
    button on a phone (no success toast now; a full-width Done button).
- **2026-10-08 (evening, replaced the same night — see above): Social Media → Attendance — the pay-cycle grid**
  (`smm.md` §9.9 / §24 / §25, `people.md` §9.13, `roles-routes.md` §8 table + the `smmLeader` flag).
  - **The owner's request:** "Add attendance view for the social media team leader." Asked (AskUserQuestion), the owner
    chose: the people in the seats of the Social Media months RUNNING NOW; VIEW ONLY; the PAY-CYCLE GRID Team
    Attendance shows; INSIDE Social Media beside Cards / Insights / Calendar / Money.
  - **Done:** view `attendance` in `pages/shared/SocialMedia.tsx` (`dts_smm_view`; the lead (`smmLeader`) and the
    tech / main admin — `utils/smmAttendance.canSeeSmmAttendance`; anybody else gets the cards);
    `components/smm/SmmAttendanceView.tsx`: `smmTeamPeople` (every creator / publisher / marketer / assistant on a
    month active, not history, start ≤ today ≤ end; once each, A–Z, seats + clients); only active tech members who
    check in are gridded, others named under it ("Ravi (Tech Team Leader — does not check in)"); the 10th → 9th grid
    with ‹ ›, legend and holidays, search by person or client; read-only. **The grid moved into
    `components/attendance/AttendanceGrid.tsx`** (desktop table + phone month cards; `onCellClick` makes it editable)
    and Team Attendance draws it too — the same markup, its editor and Full-Time ⇄ switch unchanged. Reads: the seat
    holders' `users` docs once by id (`hooks/useUsersByIds`, chunks of 30) + the existing range readers while open.
    On a phone the admins' five view tabs sit 3 + 2.
  - **Tested:** `smmAttendanceOct08` (who is listed, who may see it, the real view on `memoryFirestore`: P / L /
    holiday / A from check-ins, a manual mark and a holiday, no button in the grid, the team leader named; ‹ to the
    cycle before reads its own check-ins, › stops at today's cycle — also in a timezone behind UTC),
    `teamAttendanceGridOct08` (Team Attendance on the shared grid: the switch, a cell opens the editor); build,
    vitest, typecheck (1 known error), lint unchanged. Real browser (throwaway harness, the real pages on
    `memoryFirestore`, no console errors): the lead at 1440 px — Cards / Insights / Calendar / Attendance, the two seat
    holders with their seats, P from check-ins and a manual L, no button anywhere, the team leader named, a client
    not on a running month absent, the filters hidden on Attendance only; the tech admin — five tabs, 3 + 2 at 360 and
    390 px with no label cut and no sideways scroll, the phone month cards; a tech team leader without the flag forced
    to `attendance` (stored view or `?view=`) gets Cards; Team Attendance — the switch under each name, a cell opens
    the editor, Half Day saved and notified, Auto deleted it, Part-Time saved and back; the Cinematic format picker
    with the AI's choice and its cast details highlighted.
- **2026-10-08 (later): the ad's cast from the configuration to the last video prompt — a duo can no longer turn
  into a one-voice ad** (`ai-ads.md` §17.2 step 3 / 6, Save / storage, Editing / refine, §17.4, §24, §25, §27;
  `data-model.md` `ai_generations.spec`).
  - **The owner's report:** a Male & Female Duo ad came back, intermittently, with correct two-person frames but a
    single-person voice-over and single-speaker Veo prompts; audit the whole configuration → frame → voice-over →
    Veo flow for every cast and fix the root, not the case.
  - **Root causes, each reproduced on the real pipeline (fake Gemini) before fixing:** (1) `parseDialogueClips`
    folded a turn whose label it did not know (`0-8|Man:`, a Telugu label) — or the second line on the same physical
    line — into the previous speaker's line, and `generateCharacterDialogue` shipped what was left with a console
    warning; (2) the quality gate ranked drafts by the judge's score only (`mechanicalIssues` was the clip count for a
    cast), so a polished draft that lost the man WON by scoring higher; (3) every step after the run (voice-over refine,
    Input Final Script, the missing Veo clips, section refines) read the cast from the live FORM — a form without the
    special category handed the duo's script to one presenter, "[Girl]: … [Boy]: …" spoken in one voice — and every
    auto-save wrote the form's settings over the kit's; (4) the Veo step re-read the display text instead of the run's
    structured dialogue; (5) the repair prompt told human pairs to SAY "Girl"/"Boy" (the validator forbids it), called
    every entry a cartoon and asked solo casts for two lines; the refine's dialogue check differed from the writer's;
    (6) a member's custom script was read leniently (an unknown label merged; a header-only one-character script came
    back EMPTY) while Input Final Script was strict. **Live (real Gemini):** 8 duo scripts from gemini-2.5-flash were
    all well-formed; 1 of 6 from gemini-3.1-flash-lite-preview — the model the free tier rotates to under rate limits,
    which explains "intermittent" — broke the cast (`24-24|boy:` put clip 3's answer in clip 4).
  - **Fixed at the root:** `dialogueFormat.readDialogueScript` (a labelled line is always its own turn; embedded turns
    cut out; `Speaker.aliases` — `packSpeakers` adds `labelSpellings`, `nativeNames` and woman/man for the mixed
    entries; unknown labels placed by position and reported; a malformed range stays in the clip being written;
    headers with text read), `castIntegrityIssues` (what may never ship), `castScriptProblems` (a person's script),
    `dialogueLabelsIn`; `scriptQa.isBetterDraft` ranks `broken` first; `withScriptQa` never judges a cast-broken draft,
    writes new drafts for it with `castFeedback`, and **the run stops** if the cast is still broken (no frame made);
    custom scripts checked before any Gemini call; `dialogueNameRules` (one name rule; a solo character "at most once");
    the repair prompt cast-aware; the unused `CHARACTER_VOICEOVER_REFINE_SYSTEM_PROMPT` removed; Veo prompts from the
    run's structured dialogue (`veoClipsFor`); `readKitScript` refuses a stored script that is not the kit's cast;
    **`utils/adSpec`** — `GeneratedOutputs.spec` / `ai_generations.spec`, `formForKit` for every post-run step in
    `AIPlatformApp` (`kitForm()`), `savedSettingsOf` for what a save writes, `adSpecFromSaved` for older kits.
    **Cinematic Ads (same class, audited by an agent, each verified):** `resolveAdFormatId` (the AI's format by id or
    label — an unreadable one fell back to narration), `withCastDefaults` (its cast details recorded and shown in the
    picker, which follows `effectiveAdFormatPreset`), the brief records the choice on the latest selection, and
    `saveProject` writes the project whole (a merge resurrected a cleared pairing). Open for the owner: a format
    changed mid-project resets nothing; clip prompts carry no line-by-line speaker.
  - **Found by the browser check and fixed:** a run that failed (now routine — the guardrail) or was stopped had its
    partial sections AUTO-SAVED OVER THE PREVIOUS KIT (the job reopened empty): a run now lets go of the old document at
    Start, saves nothing unless it finishes, says "did not finish" (it said "successfully generated"), and Save is off
    for it; the re-check then found the seconds after Stop (until the call in flight returned, the card read
    "successfully generated" with Save on) — Stop now says so at once — and Save is off while a run is going (a Save
    mid-run made its half-made sections the job's kit), and its sentence wraps on a phone (cut mid-word at 390 px); the
    error message grows with its text (it was a 28px chip over Start); the header chip is hidden on phones
    again and an open row's body is full width (`.ag-chip` / `.ag-row` won over Tailwind — `!` utilities, as `!p-0`);
    the single-voice reader reads `clip-1[0-8sec]:` headers (they were spoken).
  - **Tested:** `castConsistencyOct08` (29: the reader on every shape incl. the live reply, cast integrity, the gate,
    the stop before any frame, every catalogue entry × commercial / festival through the full pipeline, the kit spec
    and the refusals, custom and final scripts), `cinematicCastOct08` (5), `aiPlatformKitIntegrity` (+2: a run that
    does not finish never saves over the last kit; Stop says so at once and no Save mid-run — each fails without its
    fix), updated `characterPromptSmoke` /
    `refinePreservesPack` to the refine prompt that really runs; full vitest, build, typecheck (1 known error), lint
    profile unchanged. Real browser (throwaway harness, the real `AIPlatformApp` on `memoryFirestore` + a faked
    Gemini): the mislabelled duo → two speakers per clip and per Veo prompt; the form switched to a normal ad →
    Input Final Script and its Veo rewrite still the duo, saved doc keeps `spec`; the guardrail's message with no frame
    call; a normal female ad; Motu & Patlu LEFT / RIGHT; 390 px without overflow. Re-checked after the fixes (all
    pass): the saved kit unchanged after the guardrail and after Stop (before and after the first sections), the
    status card, the error box and the phone header at 390 / 1440 px, row 4 full width after a final script,
    `clip-1[0-8sec]:` headers not spoken, the duo still two-speaker. Live Gemini: a full Telugu duo run
    (101 s, 17 calls, the gate polished it) → Girl + Boy in all 4 clips, every Veo prompt two-speaker.
- **2026-10-08: Invoices → Settings — one place for what every invoice starts with** (`invoices.md`
  §9.22 / §24, `data-model.md` invoice_settings/defaults, `roles-routes.md` §8.2 / §10).
  - **The owner's request:** "a settings option in the invoice section: upload the logo, QR code and details,
    prefilled with all the existing information; every invoice shows them by default; if I want to change one, I
    change it while creating the invoice."
  - **Done:** `/invoices/settings` (`pages/shared/InvoiceSettings.tsx`; "Settings" beside New invoice and ⋯ →
    "Invoice settings" in the builder, for the four admins; others see a lock): the business block with its own
    **logo**, bank details with the **QR image**, GST rate + on top / included, due days, terms, notes, and — for the
    tech / main admin — the team-leader switch; explicit Save with Discard and the leave guard; a live preview of a
    sample invoice on the real sheets. Prefilled by `resolveInvoiceDefaults(defaults, company)` (saved settings over
    Company Documents over the company's Inv. 4232 fallbacks, field by field; "" stays cleared). New field
    `InvoiceDefaults.seller` (kept apart from `company_settings` so the HR letters never change); a new invoice
    copies everything as its snapshot; one invoice's changes stay on that invoice. The builder's per-section
    "Save as default" buttons were removed (one place for defaults); a note under the sections says where the
    starting values come from. Shared `components/invoice/useInvoicePaper` (content → sheets with logo + QR) now
    drives both the builder and the settings preview.
  - **Bug found and fixed in the browser run:** the settings page re-rendered forever when it had no unsaved
    changes (~990 ms of script per second; "Maximum update depth exceeded" in the locked view) — `useCompany()`
    built a new `company` object every render, and the prefill effect depended on it. Root fix: `useCompany`
    memoises `company` on the stored document (every caller benefits — e.g. `IssueDocumentDialog`'s `useMemo` now
    actually memoises); the prefill effect is also keyed on the resolved values' fingerprint. After: 2–5 ms/s.
  - **Tested:** 4 new unit tests (prefill from Company Documents, field-by-field override with cleared fields, a new
    invoice carrying the settings' logo / QR / terms / due days / tax, merged saves); full vitest 215 files / 3314
    tests ✅; typecheck 1 known error; build ✅. Real headless Chrome (memoryFirestore): access (admin link, sales
    member locked, URL not taken as an invoice id), prefill, live sample, logo 600×200 → 132×44, QR padded square,
    leave guard, Save → `invoice_settings/defaults`, a salesperson's new invoice shows the saved business / logo / QR /
    terms / due date, a per-invoice change stays local, GSTIN check, Company details, Use the company logo, Discard,
    team-leader card only for tech/main admin, 390 px no horizontal scroll, dark theme, builder ₹118 + PDF with the
    settings' logo and QR unstretched, idle CPU 2–5 ms/s on every page, 0 console errors.
- **2026-10-08: Invoice Builder, round two — the owner's first real invoice** (`invoices.md` §9.22 /
  §24 / §25, `data-model.md` invoices + register + status, `roles-routes.md` §8.2, `docs/firestore-rules.md`
  invoices delete + register update).
  - **The owner's report** (a draft PDF "rebuild", ₹100): (1) no way to upload their own QR code; (2)+(3) the rate
    "was coming incl. GST" — it must be the subtotal, GST added after it; (4) the watermark was "cropping" over the
    invoice — no draft PDF at all, only the final one; (5) no Close; then "delete option is not there for the created
    invoice"; and "the world's best UI/UX".
  - **Done:** GST **on top by default** (`INVOICE_FALLBACK_DEFAULTS.pricesIncludeTax = false`; 100 → 100 + 9 + 9 =
    ₹118; "Rate includes GST" kept as the second option; the rate column just says "Rate"). **QR upload** in Payment
    details (`payment.qrImageUrl`, padded to a white square by `squareImageFile` before Cloudinary because html2canvas
    ignores `object-fit`; "Use the UPI ID instead"; saved with the payment defaults). **No watermark**; **no PDF or
    Print for a draft** (only Generate; a note on the preview says why); after Generate a "ready" window with
    Download PDF / Print / Done; a generated invoice's main button is Download PDF (+ Print, Edit, ⋯). A labelled
    **Close** top right (a link, so the leave guard covers it) replaces the back arrow. **Delete a generated
    invoice** (maker or admin, `deleteInvoice`): the number stays used — its `invoice_numbers` entry is marked
    `deleted` with who / when / customer / total in the same transaction, which the rules now require — so the
    series skips it and never reuses it; the confirmation suggests Cancelled when the client has the invoice
    (`deleteConfirmCopy`). The **logo** is drawn at an exact size from its natural proportions (`fitLogo`) so the PDF
    can never stretch or crop it. "Invoice details" folds for a draft, opens for a generated invoice.
  - **Tested:** unit tests updated and added (GST on top 100 → 118, delete keeps the number and the next is 0002, the
    uploaded-QR warning, `fitLogo`, the delete wording); full vitest 215 files / 3310 tests ✅; typecheck 1 known
    error; build ✅. Real headless Chrome on the real pages (memoryFirestore), 9 checks all PASS: the ₹118 sheet and
    PDF, no watermark on draft / paid / cancelled, draft has only Generate, the ready window downloads
    "Invoice DTS-26-27-0001 - Samas Sarees.pdf", Close (saves a draft, prompts for unsaved issued edits), a 300×500
    QR uploaded → printed square and unstretched (ink aspect 0.597 vs 0.6), logo 902×451 → 88×44, delete 0001 →
    register marked, next = 0002, 390 px no horizontal scroll, team-leader switch, 0 console errors.
  - **Owner's existing draft "rebuild"** keeps "Rate includes GST" (no migration) — flip it in Tax, or start a new one.
- **2026-10-08: the Invoice Builder — a new module** (session "invoice builder"; new
  `.claude/rules/invoices.md` §9.22; `roles-routes.md` flags / §8.1 / §8.2 / §10, `data-model.md` collections /
  relationships / statuses, `architecture.md` §11 Documents / §22, `people.md` §9.16, `docs/firestore-rules.md`;
  CLAUDE.md Context map / §32 / §33).
  - **The owner's request:** a world-class invoice workspace replacing the separate "Easy Invoice" app — editor +
    live A4 preview, GST (CGST / SGST / IGST, inclusive or on top), items with discounts and reordering, bank
    details and a UPI QR, terms, notes, drafts, generate, duplicate, delete, a PDF that matches the preview, no
    duplicate numbers, unsaved-change protection, phone to desktop; access: sales person, sales admin, tech admin
    yes, tech team leader by a switch, tech member never — enforced in the database too. Asked first and answered:
    Main Admin and Accounts Admin also get it; ONE switch for all team leaders (tech admin / main admin, in
    Settings); numbers `DTS/26-27/0001` per financial year; a generated invoice stays editable and keeps its number.
  - **Audit:** no invoice code or collection existed in DTS-OS. The old app lived in another Firebase project
    (`invoicegenerator-21b78`, collection `invoices`) with free-text numbers (`INV-<date>-<random>`, no uniqueness),
    tax always on top and computed in three places, and the QR fetched from api.qrserver.com — nothing to migrate.
    Reused: `company_settings` identity + logo (`useCompany`, `useCompanyLogo`), the HR counter's transaction
    pattern, the print CSS (`agreementPrint`, split into `printDocumentPages`), jsPDF + html2canvas + `qrcode`,
    Cloudinary, `useConfirm`, `holdUpdates`, a salesperson's in-memory orders.
  - **Built:** `utils/invoiceMath` (the ONE engine, integer paise, tax per rate group; inclusive prices keep the
    total exact and CGST = SGST — the owner's Inv. 4232 reproduces: 17,400 → 14,745.76 + 1,327.12 + 1,327.12),
    `utils/gst` (state codes, GSTIN check character, IGST by place of supply), `utils/invoiceNumber`,
    `utils/invoiceLayout` (pure page plan: rows never split, repeated table header, totals never alone, headings
    kept with text), `utils/invoiceDraft`, `utils/invoiceAccess`, `utils/invoicePdf`; `services/invoices` (one
    numbering transaction: FY counter + create-only `invoice_numbers` register + the invoice; Generate twice =
    same number) and `services/invoiceSettings`; `components/invoice/*`; pages `Invoices` and `InvoiceBuilder`;
    `hooks/useLeaveGuard`; routes `/invoices`, `/invoices/:id` (+ `InvoiceAccessGate`), one nav item per role
    (`requiresInvoiceSwitch` for team leaders, live in the Sidebar), `InvoiceAccessCard` on the tech / main admin
    Settings; rules for the four new collections, kept out of the catch-all. `company.numberInIndianWords` split
    out of `amountInWords` (payslip text unchanged).
  - **Found and fixed in the browser run:** the UPI QR printed as an empty square in the PDF (html2canvas paints an
    inline-block's background over its image → the frame is a plain block with no fill); every PDF line sat ~5 px
    low (html2canvas measures baselines with a probe `<img>` that Tailwind makes `display:block` → the probe is
    put back inline during capture, `withTrueBaselines`). Also, from review: an export double-click could hang,
    deleting a never-saved draft could bring it back via the leave-the-page save, an issued invoice's save waited
    on the network offline, and Status could not be changed without pressing Edit.
  - **Tested:** 70 new unit tests (`invoiceMath` incl. 300 random invoices, `invoiceRules`, `invoiceService` on
    memoryFirestore); real headless Chrome on the real pages over memoryFirestore, 15 checks A–O all passing after
    the two fixes — access for all 7 roles and the switch both ways, create / autosave, IGST / on-top / No GST /
    round-off, add / duplicate / reorder / delete items, discounts and mixed rates, QR, a 45-item 3-sheet invoice,
    numbering 0001→0002, double Generate, validation, edit after issue, Paid / Cancelled, PDF (light + dark ink,
    pages = sheets, QR present), print, 390 / 768 / 1440 with no horizontal scroll, refresh, the on-device copy and
    the leave prompt, duplicate / delete, Fill from a sale, zero console errors. Build ✅, typecheck 1 known error,
    full vitest ✅. Not driven: live Firebase (rules unpublished), two people generating in the same second
    (the fake store does not serialise transactions — the logic is Firestore's), a real printer.
- **2026-10-08: Sales → Tech on one permanent `saleId`; Real Owner Face keeps the client's face; దసరా**
  (session dts-os-db; `.claude/rules/sales.md` §9.4 / §24 / §25, `orders-work.md` §16 / §24 / §27, `data-model.md`
  leads / orders / work_assignments / notifications, `ai-ads.md` §17.2 / §24 / §27, `backend-security.md` §18,
  `roles-routes.md` §7 / §8.2, `architecture.md` §9.20 / §22 / §23, `docs/firestore-rules.md` note; CLAUDE.md §32 / §33).
  - **The owner's three items:** (1) "Fix the Sales → Tech workflow using a permanent saleId" — editing a sale
    created duplicate sales for Tech, deleted unassigned sales still appeared for Tech members, sales did not
    synchronise; the rules: one immutable saleId, create = one sale, edit = the same saleId (never a new sale),
    upsert on the tech side, UNASSIGNED + delete = gone everywhere, ASSIGNED + delete = blocked, ASSIGNED + edit =
    same saleId + assignment kept + a popup to the tech admin, team leader and member, no duplicate / stale /
    orphaned records, transactions; test CREATE → EDIT → ASSIGN → EDIT → DELETE UNASSIGNED → DELETE ASSIGNED.
    (2) Real-face ads sometimes changed the face — added a bindi — "check male and female both"; correct the frame
    and the video prompts; "for all the real person videos we need only this prompt based on gender": "With a
    very sweet voice she needs to say :- {Your Voice} with appropriate gestures · Negative prompt :- No text on the
    screen". (3) "Dusshera" was spelled wrongly in the voice-over script; the correct spelling is దసరా.
  - **Root causes (1):** a sale had no id — every writer found it by its POSITION in `leads.saleItems[]` and wrote
    the whole list back from its own copy (SaleForm's edit, My Leads' delete and payment, Sales Approvals,
    `mirrorPenaltyToSale` via `order.saleItemIndex`): an edit form open while an earlier sale was deleted saved over
    another sale (two rows of one sale), an approval could undo an edit or drop a just-added sale. The sale and its
    order were written separately and My Leads' `updateLead` swallowed its own error — an order with no sale, then a
    second sale + order on the retry; the save button had no in-flight guard (a double tap = two sales). An edit
    rebuilt the delivery promise from "now" (the deadline moved on every edit). Deleting removed the sale first and
    the order best-effort (a failure left it), never the chat or the "new order" bells; deleting a LEAD (custom lead,
    the sales admin's Leads pages, single and bulk) never touched its orders at all. `createWorkAssignment` wrote the
    job and then updated the order — a job for a sale deleted a moment earlier, or a second job for one ad (two
    people, or a double tap from a stale Assign form); the Work Assign pages failed silently. Revoking an approval
    deleted the pending sale's order. The "new order" bell had one dedupe key for every recipient, so each write
    replaced the last (only one tech admin / leader kept it). `timestampMs` lost the milliseconds of a JSON'd
    timestamp (a second order id for the same sale).
  - **Fix (1):** `utils/saleIdentity` (`saleId` = `<leadId>_<ms>`, order `o_<saleId>` — the id orders already
    had, no migration; `withSaleIds` stamps older sales; exact `timestampMs`; `leadHoldsSaleOf`), `utils/saleEdit`
    (`saleChangeList` — moved from SaleForm, money-tagged, now naming the advance, the screenshot, a Custom sale's
    service and length, a month's video length, a custom character; `mergeSaleEdit` three-way merge;
    `lockedServiceChange`; `saleHasWork`; `jobPatchForSaleEdit`; `saleEditNotice`), `services/sales` (`recordSale`,
    `updateSale`, `deleteSale`, `deleteLeadWithSales`, `mutateSaleItems`, `healOrphanOrdersOnOpen`,
    `notifySaleEdited` — all transactions), `orders.ts` (`orderSaleFields` / `newOrderForSale` /
    `orderUpdateForSale` / `afterOrderWrite` shared by the upsert and the transactions, per-recipient
    `order_new_<orderId>_<uid>` + role links, `removeOrderNotifications`, `markOrderSaleUnverified`, the penalty
    mirror by id), `workAssign.ts` (the job + the order in one transaction, `AssignmentRefusedError`), SaleForm
    (service + in-flight guard, promise kept, work-started banner, service locked), My Leads (rows / edit / log /
    note by `saleId`, Edit always, Delete with a confirm or "Can't delete — work started (Ravi)", payments and
    custom-lead delete through the service), Sales Approvals (every handler by id; delete through `deleteSale`;
    revoke keeps the order), MemberLeadsDetail / LeadsManagement (`deleteLeadWithSales`, bulk keeps and names the
    blocked leads), both Work Assign pages + `AssignTracksDialog` (toast on refusal; a gone order closes the form),
    Orders + Work Assign (orphan sweep on open), `UpdatePopup` + `notificationRouting` (`sale_edited` popup with its
    change list, `POPUP_ROLES` adds the tech admin), types (`saleId` on SaleDetail / Order / WorkAssignment).
  - **Root causes (2):** the owner-face frames' WARDROBE line (default female attire Traditional) was "a designer
    silk saree … with tasteful traditional jewellery" and overrode "keep what she wears in the photograph" — a
    "traditional look" the image model completed with a bindi; the male owner had no forehead-mark rule at all; the
    identity rules lived only in the frame writer's system prompt ("plain English, no negative list" output), and the
    one line the finished prompt carried about the face is the 📎 attach directive, which Copy strips; the studio's
    pack picker never set the entry's gender / attire, so "Real Owner Face (Male)" ran with the default Traditional
    (a kurta) while the picker showed Professional. Veo got the five-part motion prompt (walks, camera, keep sentence).
  - **Fix (2):** `frameBrand.withOwnerFaceLock` — `FACE LOCK:` in every owner-face frame BODY (survives Copy; re-stamped
    after a main-frame refine), by gender: the photograph's face, skin, hairline, hair / beard and forehead; a bare
    forehead stays bare, a mark the photo shows stays; nothing added (bindi, tilak, kumkum, sindoor, vibhuti, nose
    ring, face jewellery, make-up, new beard); only the clothes follow the outfit. `characterCastBlock` says the same;
    `ownerWardrobeDirective` (no jewellery, "the clothes only"); the male entry's negatives (catalogue TS + JSON);
    `resolveModelSpec` in `packWardrobe` and in the studio's pack picker. Video: `assembleRealPersonVeoPrompt` — ONLY
    the owner's template, "she"/"he" by the entry's gender; `writeVeoPrompts` returns it with no director call (first
    run, regenerate and the final-script rewrite); `spokenLinesIn` reads it (a refine still cannot change the words).
    Frames: no walking plan / 🎬 notes; `withRealPersonComposition` (standing, mid-gesture, never mid-step).
  - **Root cause / fix (3):** the occasion went into the Telugu prompts as the list's Latin "Dussehra" / "Dasara"
    (inside the Telugu greeting template too) and the writer transliterated it its own way. `utils/festivalNames`:
    the Telugu name in the greeting and the rule "Write the festival's name in Telugu exactly as దసరా" through
    `wishAudienceRule` (writer, repair, refine, character dialogue + its worked example), and
    `withFestivalSpellings` in `speakableLine` (Telugu only) rewriting every misspelling (దుస్సెహ్రా, దుస్సేరా,
    దసెరా, దస్సరా, దశరా, దసరాా, a bare దసర, the Latin forms; case endings kept; never దశరథ / విజయదశమి).
  - **Files:** new `src/services/sales.ts`, `src/utils/{saleIdentity,saleEdit,festivalNames}.ts`; changed
    `services/{orders,workAssign,geminiService,characterCatalogue}.ts`, `services/prompts/{motion,characterAd,festivalWish}.ts`,
    `utils/{frameBrand,spokenNumbers,notificationRouting}.ts`, `components/sales/SaleForm.tsx`,
    `components/layout/UpdatePopup.tsx`, `components/work/AssignTracksDialog.tsx`, `components/ai-platform/AIPlatformApp.tsx`,
    `pages/sales-member/MyLeads.tsx`, `pages/sales-admin/{SalesApprovals,MemberLeadsDetail,LeadsManagement}.tsx`,
    `pages/tech-admin/{Orders,WorkAssign}.tsx`, `pages/tech-team-leader/WorkAssign.tsx`, `types/index.ts`,
    `docs/video-category-catalogue.json`; tests new `saleIdentity`, `saleEdit`, `saleSyncOct08` (the owner's sequence +
    every duplicate / orphan path, real services on the in-memory Firestore), `saleRowsOct08` (UI), `realOwnerFaceOct08`
    (incl. a full run on a faked Gemini, both genders), `festivalNames`; updated `bulkSaleForm`, `wishesFestivalForm`,
    `smmAddSaleUi` (they now check what the form hands `services/sales`), `notificationRouting`, `aiPlatformInputs`.
  - **Tested:** build ✅ (main ≈457 KB, geminiService ≈833 KB), vitest ✅ — 212 files / 3235 tests passed but with 5
    unhandled errors from this batch (`.catch()` chained on `logActivity` / `sendNotification`, which a test stub returns
    `undefined` from — spotted by the parallel invoice session); fixed with try/await and `services/sales.quietly`, the
    full suite is now 215 files / 3305 tests (incl. the invoice session's), all pass, no unhandled errors; typecheck (1 known error),
    eslint on the changed files: no new findings beyond the tests' existing `any` style. **Browser** (a throwaway
    harness in the scratchpad driving the real My Leads, Orders, Work Assign, My Work and UpdatePopup on the
    in-memory Firestore, 390 and 1440 px — the owner's sequence, all 9 checks pass): CREATE (1 sale with its
    saleId, exactly 1 order `o_<saleId>`, its chat, a bell for the tech admin and the team leader, listed once);
    EDIT unassigned (same sale and order, the queue renamed, no popup); ASSIGN from the queue (1 job with orderId +
    saleId, the order assigned); EDIT assigned (Edit + "Can't delete — work started (Ravi)", the banner and the
    locked service, English → Hindi reached the job, 3 `sale_edited` rows); the POPUP for the member and the tech
    admin (changes listed, no ₹); DELETE UNASSIGNED (sale, order, chat and bells gone, the queue's Not assigned 0);
    DELETE ASSIGNED (no button; `deleteSale` refused, every document unchanged); a STALE Assign form after the sale
    was deleted ("Not assigned — This sale was deleted…", no job). No horizontal scroll; no console error but the
    refusal's own log. Not driven: live Firebase (transaction retries), push delivery, a team leader's popup on
    screen and the team leader's Work Assign copy; no Gemini run and no image or Flow generation — the owner-face
    frames / videos and దసరా are checked by unit tests and a full run on a faked Gemini.
- **2026-10-05 (evening): SMM "On hold", and the month the board could not show** (`.claude/rules/smm.md`
  §9.9 / §24 / §25 / §27, `data-model.md` smm_campaigns + app_settings, `docs/firestore-rules.md` note; CLAUDE.md §32).
  - **The owner's report:** adding an old client's earlier month (AIRAVATH, +13213899564, 24 Aug → 24 Sep) with
    "Add a month that had no sale" was refused — "AIRAVATH already has a month on these dates (25 Aug → 4 Oct 2026).
    Open it from the board instead" — but the board showed no such month. Mid-task: **"if the social is not renewal
    then keep it as hold"**; asked (AskUserQuestion): every ended month, history ones included (recommended), and
    "Not renewing" still files it under Finished (recommended).
  - **Root causes:** (1) `addNoSaleMonth` / `setupSaleMonth` saved every history month `completed` the moment it
    was added — overseers' Cards read only `status == "active"` and Finished is read on demand, so the month was
    nowhere in the default view; (2) Add SMM sale's lookup listed only SALES (`findSmmSalesForPhone`), so a number
    whose month had no sale read "No social media sale has been recorded" (and even offered "Record a new sale"
    against the rule that a client with months is renewed); (3) the clash check (`noSaleMonthClash`, every month
    on `clientPhoneId`) returned only a sentence, no link; (4) a removed history month restored by its order came
    back `active` + `history`, which neither Cards nor Finished showed. The live AIRAVATH document was not read (no
    Firebase access); every state it can be in is now visible.
  - **Fix:** `smmPackage.isOnHold` (active, ended, no renewal decision), `historyFiling`, `historyMonthsFollowed`;
    `renewalDue` / `closingStatus` / `renewalRelinkPatch` take history months, `renewalUnlinkPatch` returns a history
    month to `active`. `smmGlance` status `on_hold` ("Ended 4 Oct — not renewed yet · n posts not live", grey,
    after On track; it replaces "Off track — Month ended with n posts not live" for undecided months); board tile
    **On hold** (`SocialMedia` FILTERS `hold`, `Headline.SmmBoardFilter`), history months on hold in Cards, tiles
    fit by width from 1024px; month page renewal line "On hold — the month ended on … and has not been renewed".
    Setup paths save a history month `active` unless followed (next linked or any later month — `neighbourMonthsOf`
    now returns the client's `months`), file earlier on-hold history months a new month follows
    (`smm.fileFollowedHistoryMonths`, also in `closeEndedMonthsOnOpen`). One-time repair for months saved before:
    `smm.holdUnrenewedHistoryOnOpen` (first overseer board open; record `app_settings/smm_history_hold`).
    `SmmAddSaleDialog`: lists the number's months (`fetchClientMonths(phoneLockId)` — the clash check's query) with
    state, "No sale", salesperson and **Open month**; no new sale when months exist; the months shown above the
    no-sale form; a refusal shows **Open that month** (`noSaleMonthClashOf`, `SmmMonthClashError.monthId`).
  - **Files:** `utils/smmPackage.ts`, `utils/smmGlance.ts`, `utils/smmRenewalLink.ts`, `services/smm.ts`,
    `services/smmSetup.ts`, `components/smm/SmmAddSaleDialog.tsx`, `components/smm/SmmGlance.tsx`,
    `components/smm/dashboard/Headline.tsx`, `pages/shared/SocialMedia.tsx`, `pages/shared/SmmCampaignPage.tsx`;
    tests `smmOnHoldOct05.test.ts` (new, 15, real services on the in-memory Firestore), `smmAddSaleUi.test.tsx`
    (+3: the number's months, the clash link, the On hold tile), `smmGlance.test.ts`, and the history-status
    expectations in `smmHistoryOct05`, `smmNoSaleOct03`, `smmSetupOct03`, `smmRenewalOct05`.
  - **Tested:** build ✅, vitest 206 files / 3172 tests ✅, typecheck (1 known error). Browser (throwaway harness in
    the scratchpad, real SocialMedia + SmmCampaignPage on the in-memory Firestore, dark, 1440 and 390 px, two runs,
    no console errors): an AIRAVATH history month seeded as `completed` came back on hold by the one-time repair;
    On hold tile 2 (AIRAVATH, an ended sold month "· 8 posts not live"); Add SMM sale on +13213899564 listed the
    month with Open month; 24 Aug → 24 Sep refused with the inline Open that month (no month written, no toast);
    the month page said "On hold — the month ended on 4 Oct…"; the salesperson got Renew; no sideways scroll at
    390 px. Not driven: live Firebase — the owner's real AIRAVATH document was not read.
- **2026-10-05: a deleted renewal un-renews its month; over-discounted sales reach the tech side
  at once; the salesperson's renewal money card; the admins' Money tab; the 11 AM / 5 PM post-status
  popup** (session dts-os-ba; `.claude/rules/smm.md` §9.9 / §24 / §25 / §27, `sales.md` §24,
  `orders-work.md` §24, `architecture.md` §5 / §23, `roles-routes.md` §7 / §8, `backend-security.md` §18,
  `data-model.md` order statuses; CLAUDE.md §32 / §33).
  - **The owner's five items:** (1) a salesperson renewed an SMM package and then deleted that sale, and the
    tech side still read "Renewed by Govardhan — the next month is set. Next month"; (2) a sale with a
    discount over the member's 10% went to the sales admin and NOT to the tech side until approved — it must
    reach the tech side without the approval; (3) the salesperson needs a clear SMM calculation — running,
    renewed, pending, and the money they get for renewals — "a UI that 100% motivates them to convert their
    clients to the next month"; (4) the same, company-wide, for the tech admin and sales admin only; (5) a
    popup to everybody doing SMM work, twice a day, to update the status of all their posts. Layouts and
    times chosen by the owner from mockups (AskUserQuestion): "Money first" card, a "Money" tab in Social
    Media, 11 AM and 5 PM, anyone holding a seat on a month's team.
  - **(1) Root cause:** a renewal sale links Month N forward (`renewal: { state:"won", nextCampaignId }`,
    `linkRenewal`); deleting the sale removed Month N+1 (`cancelOrderForSale` → `setCampaignRemovedForOrders`
    when work was out, `deleteCampaignsForOrders` when not) but nothing ever touched Month N. **Fix — "renewed"
    follows the renewal sale:** `utils/smmRenewalLink` (pure: `renewalUnlinkPatch` — back to "no decision", a
    month already filed `renewed` back to `active` (history → `completed`); `renewalRelinkPatch` — only if it
    still points nowhere or here; `leadIdOfOrderId`) applied in a transaction by `smm.unlinkRenewal` when
    `cancelOrderForSale` (sale deleted / rejected / taken back) removes or erases the month (`saleWithdrawn`),
    and by `relinkRenewal` when the sale comes back (`ensureCampaignForOrder` revive, order restore). The tech
    admins / team leaders get `smm_renewal_cancelled`. **Deliberately not** for the tech side removing the
    renewal order from the queue (offered on delivered orders too), purging it, or deleting the month: the sale
    and its commission stand, and "no decision" on an old filed month would invite a duplicate renewal sale —
    the month page just drops the dead Next month link ("its next month was taken off the board"). **Existing
    broken links** are repaired by `healRenewalLinksOnOpen` (the board for every viewer — before the overseer's
    `closeEndedMonthsOnOpen` —, the month page when its next month is gone, the Money tab) only where the sale
    was withdrawn (`renewalSaleWithdrawn`: the next order `cancelled`, or no order and no such sale on the lead);
    once per link per session.
  - **(2)** `upsertOrderForSale` no longer returns early for an over-limit discount: the order is made at
    sale time like any sale (`saleVerified:false` → the Orders queue's existing "Pending approval" chip);
    approval still happens in Sales Approvals, a rejected sale is still cancelled. Removed with the gate:
    `releasedToTech` (now `discountAwaitingApproval`, a fact for screens), the `withheld` sale stage, the
    `held` SMM sale state / step, SaleForm's `heldForApproval` result, My Clients' held notice; SaleForm's
    banner, authority line and toast now say "Sent to the tech team right away — your admin must approve the
    N% discount". **Sales held under the old rule** get their order when a sales admin opens Sales Approvals
    (`orders.releaseHeldSales`: pending + discount awaiting approval + no order yet; one read each, once a
    visit).
  - **(3)** `SmmRenewalsCard` (sales Dashboard, and the top of their Social Media) rebuilt "Money first":
    ‹ month › stepper; "₹X from your renewals this month" + "₹Y more waiting — renew N clients"; one bar
    "3 of 7 renewed"; four counts (Running now · ✔ Renewed · ◷ Waiting (+n from earlier) · ✖ Not renewing,
    the calendar's marks); "Renew these now" rows with "+₹500" (their 5% / 10%, `commissionRate`) and Renew;
    Renewed / Not renewing chips; "N% of each renewal sale is yours — paid once verified and collected". It
    still rings the renewal bells (not on Social Media, which rings them itself). No new read.
  - **(4)** Social Media → **Money** (`components/smm/money/SmmMoneyView`, `canSeeSmmMoney`: main / tech /
    sales admin; anybody else asking for `?view=money` gets the cards): totals (running clients, ₹ a month,
    renewal rate), the month's renewals on one bar (✔ kept ₹ / ◷ still to win ₹ / ✖ gone ₹), one row per
    salesperson (running, ✔ ◷ ✖, kept, rate), and "Waiting for a decision" with Remind / Open. Numbers in
    `utils/smmRenewalMoney` (a month counts in the calendar month its last day falls in; value = next month's
    price, else its own, else the package's list price; history / removed / deleted left out). One on-demand
    read per month shown (`smm.fetchMonthsEndingBetween`, `cycle.endDate` range, single-field index).
  - **(5)** `components/smm/SmmStatusCheckPopup` (AppLayout, tech roles, not external creators; rules in
    `utils/smmStatusCheck`): from 11:00 and from 17:00, for a person holding a seat on a month running today,
    every post not live yet (theirs first, late next) with its status select (`setItemStatus`; Scheduled /
    Posted disabled until the client approved); "All updated" answers the slot on this device, "Later" = 30
    min; opened first after 17:00 it asks once; waits while any other popup or full-screen overlay is open. One scoped read when a
    slot comes due (`smm.fetchMyCampaigns`), live only while open.
  - **Files:** `services/smm.ts`, `services/orders.ts`, `services/smmSetup.ts`, `utils/{smmRenewalLink,
    smmRenewalMoney,smmStatusCheck}.ts` (new), `utils/{saleDiscount,saleStatus,smmPlan}.ts`,
    `components/smm/{SmmRenewalsCard,SmmStatusCheckPopup,SmmAddSaleDialog}.tsx`,
    `components/smm/money/{MonthStepper,SmmMoneyView}.tsx` (new), `components/sales/{SaleForm,SaleStatusChip}.tsx`,
    `components/layout/AppLayout.tsx`, `pages/shared/{SocialMedia,SmmCampaignPage}.tsx`,
    `pages/sales-admin/SalesApprovals.tsx`, `pages/sales-member/{MyClients,Dashboard}.tsx`.
  - Also: on a phone the Social Media view switcher is a full-width row of equal word tabs (icons from 640px)
    — the admins' fourth tab, Money, ran off a 360px screen.
  - **Tested:** new `smmRenewalOct05` (14), `smmUnrenewOct05` (15, in-memory Firestore: deleted after / before
    jobs, filed month back on the board, re-approve, a newer renewal kept, the tech side's queue removal /
    purge / Delete keep it renewed, the repair per case and once a session, the Money read),
    `smmStatusCheckOct05` (6); `discountHold`, `saleDiscount`, `saleStatus`, `saleOpensChat`, `smmSaleForm`
    rewritten to the new rule; `smmAddSaleUi` mock extended. **Browser** (throwaway harness on the in-memory
    Firestore, real pages, headless Chrome; 1440 / 1024 / 390 / 360 px, light + dark, zero console errors, no
    sideways scroll): the Govardhan case repaired on opening the month (strip → "Renewal due…", Renew back for
    the salesperson); the card's numbers checked by hand (5% and 10%), month arrows, Renew rows; the Money tab
    for tech admin and sales admin (absent for member / team leader, also via `?view=money`), Remind → toast +
    bell; the popup at 17:41 (5 PM slot) — worst first, own posts first, a status change saved, Posted disabled
    without approval and refused by the service, Later / All updated remembered, nothing for a salesperson.
    A second pass fixed what the first found: names squeezed by buttons on phones, the popup's clipped "You"
    chip, amber words on white (now text colour + amber marks; money in a darker green, 4.6:1), the 1024px rate
    bar, "1 month ends", the salesperson's own strip wording, the popup's count (now the card's), the tabs.
    Build ✅, typecheck (1 known).
- **2026-10-05: an old client's earlier SMM months — the Team Lead adds them, their people and
  work are kept, they join the client's run — and the Kids dressed for the ad** (session dts-os-d3;
  `.claude/rules/smm.md` §9.9 / §24 / §25 / §27, `roles-routes.md` §8 + `smmLeader`, `data-model.md`
  `smm_campaigns`, `ai-ads.md` §17.2 inputs (Kids) / §24 / §25; CLAUDE.md §32).
  - **The owner's four items (with screenshots):** (1) listing the previous months' work for a client —
    "assign to the person is not there", the work to be updated later; (2) the Social Media Team Lead's
    "Add SMM sale" showed "No social media sale has been recorded" and nothing else; (3) no way to check
    the previous month's work, "the calendar UI is worst" (the screenshot was the LIVE site — the old
    2026-10-03 calendar; today's redrawn calendar was uncommitted); (4) the Kids always in the same dress,
    whatever the concept, business or logo.
  - **Root causes (in code):** (1) `SmmSetupForm` hid the whole team section once the dates were over, and
    the month page hid Edit setup on a history month — so nobody could be put on a past month, see it or
    fill it in; and `setItemStatus` refused Posted without a recorded client approval, three presses per old
    post. (2) `canAddNoSaleMonth` was the three admins only, by a 2026-10-03 rule, while the lead had the
    button. (3) An earlier month was only ever linked BACKWARD (`previousMonthOf`), so August added after
    September stayed a separate "Month 1" with no "← August" link; the calendar opened a finished month on
    its middle page (often empty for a filled-in history month) and kept a client's months read for 5 minutes
    even after a month was added; the post dialog dropped what was typed in the 900 ms before it closed. (4)
    `castSheet.outfitFor` gave the children one outfit per attire choice, coloured from a fixed list.
  - **The owner's answers (asked first):** a past month's people by name, no job cards; Posted without the
    approval step on history months only; the Team Lead adds no-sale months but records no sale; the Kids'
    outfit follows the ad automatically.
  - **What changed:** `utils/smmPackage.canAddNoSaleMonth` (+ the lead); `SmmAddSaleDialog` (who records a
    new sale; history toast names the people; drops the client's kept months read); `SmmSetupForm` ("Who did
    the work" on history; `SmmSetupDialog` → `applyHistorySetup` on a history month); `services/smmSetup`
    (`historyTeam`, `historySetupProblem`, `applyHistorySetup`, `neighbourMonthsOf` replacing
    `previousMonthOf`, `linkInFront` — forward link + renumbering; history months built with their team);
    `smmPlan.canPublish(item, campaign)` + `smm.setItemStatus` (history: no approval, upload date required);
    `SmmItemDialog` (history note in place of the approval panel, date saved before Posted, unsaved edits
    written on close); `SmmCampaignPage` (Edit setup on history, no carry from a history month, fill-in
    note); `smmCalendar.openingMonth` (most posts, middle on a tie) and the history banner in
    `ClientCalendar`; `useSmmClientMonths` (`forgetClientMonths`, link-aware staleness); `smmAssign`
    (a tech-member assigner's tech admin joins the chat). Kids: `utils/castSheet` (`WardrobeTheme`,
    `kidsThemeOf` by first mention, `themeTextOf` — brief first, no address / contact / palette —,
    `brandColoursIn`, `dressKids`, `kidsWardrobeLine`, `an()`), `geminiService` (cast sheet built after the
    scene plan with the theme; `brandPaletteOf` lifted out of `overlayTheme`; the Kids' WARDROBE line repeats
    the sheet), `adRequirement` ("Smart casual" → "Matches the ad" for Kids). dts-os-83's stylist then took
    the WARDROBE line over for every cast (`castWardrobeLine`) and uses `dressKids` as the Kids' fallback.
  - **Tested:** new `smmHistoryOct05` (10, real services on the in-memory Firestore: history team without
    jobs, forward linking and renumbering through three months, posting rules, Edit setup on history, the
    lead's month puts the tech admin in the chat), `smmItemDialogOct05` (5), `kidsWardrobeOct05` (10), and
    updated `smmNoSaleOct03`, `smmAddSaleUi` (+1), `smmCalendar` (+1), `humanDuoKidsOct01`,
    `adPipelineEndToEnd` (+1, a school's Kids through the faked pipeline; the fake extraction is now per
    test). Browser (throwaway harness on the real pages, in-memory Firestore, headless Chrome): the lead's
    lookup, AIRAVATH 24 Aug – 24 Sep as history with Aswintha, a post filled in on 28 Aug, its calendar,
    Edit setup to Rekha, the owner's Javani month seeded as in the screenshot then August added in front
    (Month 1 → 2, "← August 2026", paged to on the calendar); 1440 / 390 / 360 px, no console errors. Full
    suite 202 files / 3122 tests, build, typecheck (the known VideoCallManager error only). Not checked:
    live Firebase, and no image yet from the Kids' new outfits.
- **2026-10-05: the wardrobe stylist — the invented cast is dressed for the business, the video
  and the logo** (`.claude/rules/ai-ads.md` §17.2 step 5 / §24 / §25 / §27; CLAUDE.md §32 / §33).
  - **The problem (owner):** "in the duo characters the girl and the boy always get the same outfit — we
    need them related to the video context, the business context and the logo, whatever is good."
  - **Root cause (in code):** the cast sheet (`utils/castSheet.outfitFor`) dressed every invented person by
    the ordered attire alone — Professional put both people in "a tailored formal suit with a crisp white
    shirt", Traditional was always a saree beside a kurta with a cream Nehru jacket — and the colours came
    from a fixed list of seven pairs picked by the business name. The frame prompt then called those colours
    "final", overruling the "brand palette" wording of the WARDROBE line and the duo's catalogue entry. The
    extraction is told not to describe the logo, so nothing in the run knew its colours.
  - **The owner's answers (asked first):** keep the ordered attire as the STYLE (Traditional ethnic,
    Professional formal, In-shirt & Pant, Custom verbatim) and choose everything inside it; apply it to every
    invented person (human duos, Kids, the Normal Ad presenter); decide it with an AI stylist that sees the
    logo, with a code fallback.
  - **What changed:** new `services/prompts/castWardrobe.ts` (`CAST_WARDROBE_SYSTEM_PROMPT`,
    `castWardrobeRequest`: the people with their ordered style, the business and core message, the brand
    palette, the festival's look, BUSINESS CONTENT, the FRAME instructions and the voice note's requests,
    the logo image) and `utils/castWardrobe.ts` (`styleRuleFor` per person and attire, `checkStyledCast`:
    inside the style, a nameable colour and garment that the outfit names, no writing / logo / profession's
    uniform / bridal / revealing clothes, children never a saree / suit / heels / make-up, two people never
    one name and two adults never one main colour; all or nothing). `geminiService.styleCastWardrobe` (one
    `fast` call, temperature 0, the logo attached unless "No logo"; a rejected answer goes back once with its
    problems) starts right after the core message and is awaited before `castSheetFor` (20 s cap).
    `castSheetFor` takes `styled` (wins over the Kids' `dressKids` and `outfitFor`; never for Custom),
    exports `castPeopleFor`, and without the stylist gives grown-ups the brand palette's colours
    (`brandColoursIn`). The WARDROBE line now repeats the sheet for every non-Custom cast in a run
    (`castWardrobeLine`; `kidsWardrobeLine` calls it); a refine keeps the ordered directive.
  - **Tested:** `castWardrobe.test.ts` (16) and `castWardrobePipeline.test.ts` (5, the run on a faked
    Gemini: the logo reaches the stylist, its answer is on every frame, in the WARDROBE line and in the Veo
    names, a retry, the fallback, Custom and Motu & Patlu never styled, the lone presenter); full suite,
    build, typecheck. Live (real Gemini): the prompt on five briefs — IconoIQ's black-and-copper logo gave an
    ivory Mangalagiri saree and a gold silk kurta, a children's hospital sky blue and forest green suits, a
    sweet shop's Sankranti a saffron and a maroon silk saree, the play school's first answer was correctly
    refused — and one full 2-clip duo run with the logo (stylist 24 s, in parallel; 52 requests, 154 s).
    No image or Veo clip has been made from a styled frame yet.
  - **Parallel work the same day:** dts-os-d3 dressed the Kids for the ad in code (`dressKids`), which is
    the Kids' fallback under the stylist (its own entry).
- **2026-10-05: the Veo dynamic pass — every clip a moving commercial shot, and the camera never
  moves backward** (`.claude/rules/ai-ads.md` §17.2 step 6 / §24 / §25 / §27; CLAUDE.md §32 / §33).
  - **The problem (owner's report, three Flow clips made from that morning's prompts):** still static. A
    woman in a maternity consultation room, a man and a woman at a hospital reception, and Motu & Patlu at
    the same reception all stood on one spot and talked. Measured from 9 frames per clip: the woman kept her
    hands clasped while the camera slowly pushed in; both pairs stood on an almost locked two-shot (the
    duo's sign board even redrew itself). Veo had done exactly what the prompts said.
  - **Audit (root causes, all in code):** the planner kept most clips standing (clip 1 and the last never
    walked, one walk per ad, drawn pairs and deities never walked); the one walk was "two or three steps,
    then stops"; three of the five moves did not move the camera (focus pull, locked, float), a pair never
    got a dolly in and a drawn pair only got locked / focus pull; the keep sentence asked for the place
    "exactly as in the attached frame for the whole clip" and a pair "side by side in the same positions"
    (contradicting the pair's own walk); the director was told "no steps" and any walking it wrote for other
    clips was thrown away; frames were posed (hands at rest, the hero frame's "formal front-clasp corporate
    pose"); catalogue lines like "his feet stay exactly where they are" reached the director; nothing asked
    for life around the cast. Running the real code for a 4-clip ad gave 1 walk for one woman, 1 for the
    man & woman, 0 for Motu & Patlu ("the camera fixed" in all four).
  - **Approved plan (shown in chat), with the owner's change:** "no walk-back, never do it" — read as "the
    camera never moves backward", so no pull-out either. The owner's keyword list became the planner's
    vocabulary, not prompt text; left out, with reasons given: pull-out, crane, orbit/360, pan, tilt,
    reveal, POV, over-the-shoulder, follow-from-behind, establishing shots, entering the store / opening
    doors (they invent rooms the frame does not have, hide the speaker's mouth, or lead outside).
  - **What changed:** `prompts/motion.ts` — six actions (`walk_toward`, `walk_across`, `approach_show`,
    `walk_stop_present`, `turn_present`, `walk_invite`) and five moves (`push_in`, `side_track`,
    `lateral_dolly`, `arc`, `static_locked` only for a walk in a client's photo); per-cast tables (`CAMERAS`,
    `PHOTO_CAMERAS`, `PAIR_MOVES`) — pairs incl. Motu & Patlu walk together side by side, sideways only;
    deities in place under blessing names; the planner opens on the move, walks at least half the clips and
    picks cameras with a backward pass so neighbours never repeat; new camera sentences, keep sentence
    (`VEO_FRAME_LOCK` "as the attached frame" + `LEGACY_VEO_FRAME_LOCK`), life line, speaker framing,
    one-line pair clips (`pairNamesOf`), negative additions; the director prompt and checks (`walkHint`,
    `RUNS`, `BACKWARD`, `PAIR_TOWARD`, relaxed tour limits), `stagingKeyOf` for saved plans, `withoutStillness`
    additions. `prompts.ts` — `HERO_FRAME_POSE` replaces the front-clasp in every hero-pose rule (also the
    attire directives in `geminiService`), "FRAMES BUILT FOR MOTION" asks for mid-movement stills.
    `prompts/characterAd.ts` — the pack frame text ("every clip MOVES"), the two-hander caught mid-step,
    `packVeoSubject` sides / pairNames / eyeLevel (kids at their own eye level). `prompts/scenePlan.ts` STEP 5
    per cast; `utils/scenePlan.ts` reads old keys; `prompts/refine.ts` and `utils/veoRefine.ts` know the new
    rules and both keep sentences; `types/aiPlatform.ts` comment.
  - **Tests:** `motionAndVeo` rewritten (64: the anti-static rule over every cast × 1–8 clips × ad type ×
    photo mix, never backward, pairs sideways, photos, director checks, saved kits); `adPipelineEndToEnd`
    (the frame and the video plan the same move through the faked-Gemini run), `characterAdPrompts`,
    `humanDuoKidsOct01`, `adGenSept22`, `spokenNumbers`, `prompts` updated (`soloCharacterAd` pins the
    "two-hander" staging, which was kept). Live Gemini:
    `regenerateVeoForClips` on prompts describing the owner's three frames — eight director actions, all
    specific and accepted (7 requests). `npx vitest run` 197 files / 3073 tests ✅, tsc = the known
    VideoCallManager error, build ✅.
  - **Not verified:** no Flow clip from the new prompts yet (the owner's A/B); no browser run — no UI changed,
    the prompts appear in the same Veo cards.
- **2026-10-05: the Veo 3 video-prompt engine rebuilt — short, motion-first prompts with bounded
  walking** (`.claude/rules/ai-ads.md` §17.2 step 6 / §24 / §25 / §27; CLAUDE.md §32 / §33).
  - **The problem (owner's brief):** videos were static (people stood still, no walking, almost no camera
    movement), duo videos did not follow the speaker, and Veo still invented new places and drifted
    identities. Wanted: short, simple prompts — camera + action + voice + gestures + frame/identity lock +
    negative — that direct motion and never re-describe the attached frame. The owner reviewed the audit and
    plan (shown in chat) and approved it with the recommended answers: a client's store/office photo walks
    only toward a still camera; Motu & Patlu and other drawn pairs never walk (the focus follows the
    speaker); human pairs and Kids walk only together; the Flow mode is written into the checklist.
  - **Audit (root causes):** the static videos WERE the 2026-10-01 spec, enforced in five layers (in-place
    stagings, a push-in of "a few percent", the director told "IN PLACE, ALWAYS", `resolveDirection` throwing
    away any walking or tracking text, and "No walking / no pan, tilt, tracking" negatives). Measured with
    the real assembler: 1,568 words for one presenter and 2,297 for Motu & Patlu, the spoken line after word
    1,000, the street / road / door named 15–18 times inside "No …" lines (Flow has one prompt box, so the
    negative is read as prompt), and the frame re-described from its PROMPT, not the generated image (two
    sources of truth). Google's Veo 3.1 guide: for frame-based video describe the motion, not the image. Also
    found: the video side planned from lines that carried the cast-sheet names, and "the woman in the teal
    saree" read as a product, so a duo clip's video could be planned differently from its frame.
  - **What changed:**
    - `prompts/motion.ts` (rewritten around the same exports): `walk_and_talk` is back, bounded (two or three
      steps on the open floor the frame shows); a `tracking` move (moves back with a walk at the same
      distance); `push_in` is now a visible slow dolly in; `castKindOf` decides who may walk and which moves
      (single / deity / pair / drawn pair) and `plates` keeps a client photo untracked; an ad with a middle clip
      that may walk always gets one walk (`TRUST_WALK` when only the promise clip can). `assembleVeoPrompt` is
      five short parts (opening, `cameraShot` + action, voice, the keep sentence `VEO_FRAME_LOCK`, a one-line
      negative). The director writes only `{ clip, action }`; `actionUsable` checks it (word lists that match a
      person, not things in the frame — a live run had refused a mannequin) and the plan's action is the
      fallback. Removed: `frameSummaryOf`, `COLOUR_LOCK`, `identityRules`, `worldRules`, `performanceRules`,
      `scaleLock`, the WHO SPEAKS / SPEAKER FOCUS blocks, the beats and scene life, `PRESENCE` /
      `HAND_GESTURES`, `LENS_COMBOS` / `SPEED_KEYWORDS`. `spokenLinesIn` reads the new and the old line form.
    - `geminiService`: the frame side and the video side plan from the same SPOKEN words and plate clips;
      the director is told the planned action and the fixed camera; a single presenter is "she / he".
    - `characterAd.packVeoSubject` / `prompts.modelVeoSubject`: short identity locks, no manner / gesture
      blocks; frame system prompts say what each clip does (and "A WALK NEEDS ITS FLOOR").
    - `prompts/scenePlan` STEP 5 offers each cast only what it may do; `prompts/refine` and `utils/veoRefine`
      know both prompt forms, and an edit may not drop the keep sentence.
    - `generation/mission.ts` and `AIGuideSheet`: use Flow's Frames to Video with the frame as the START
      frame, never Ingredients to Video.
  - **Tests:** `motionAndVeo` rewritten (60), plus `adPipelineEndToEnd` (a 3-clip run: the frame composed
    for a walk is the clip that walks; a store photo is never tracked; a duo plans the same move on both
    sides), `characterAdPrompts`, `humanDuoKidsOct01`, `adGenSept22` (refine on new and old prompts),
    `spokenNumbers` (scene-plan options per cast), `prompts`, `standardPathUnchanged`, `missionWorkspace`.
    Live Gemini (2026-10-05): one full 4-clip Telugu model ad (128 s; every frame composed for its move) and
    three director runs through `regenerateVeoForClips` (model ad, Motu & Patlu, a human duo) — the actions
    came back specific and passed the checks. Browser (real `MissionWorkspace`, `AIGuideSheet` and Veo
    `GeneratedCard` in the studio's dark theme, 1440 and 390 px): no overflow, no console errors, the copy
    button copies the prompt exactly. Build ✅, vitest ✅, tsc = the known VideoCallManager error.
  - **Not verified:** no Veo video has been generated from the new prompts — the owner should A/B a few clips
    in Flow (same frame, old vs new prompt).
- **2026-10-05: the client calendar becomes a normal calendar; every post on its upload date**
  (`.claude/rules/smm.md` §9.9 / §24 / §25 / §27; `roles-routes.md` §10).
  - **The problem (owner, with two screenshots of Dhana lakshmi's month):**
    - "No option to change the month": version 2 paged by the client's months, and this client has one.
    - "Not clear": a day showed only "✔ 9", never a post's name.
    - "Not responsive": from 1280px the day's posts sat beside the grid in a column as long as the list,
      leaving the calendar in empty space, and each card's buttons wrapped onto two or three rows. The
      layout switched on the screen width, not the room it had.
    - The same day, via session dts-os-a1, the owner said all nine posts sat on one date. `postedAt` is
      stamped when Posted is pressed, and the team marked the nine together on 5 Oct.
  - **Confirmed (AskUserQuestion with mockups):** normal calendar months, not client months.
  - **What changed:**
    - `utils/smmCalendar`: version 2's one-client-month model (`buildMonthCalendar`, `openingMonthId`,
      `isMonthDay`, the 14-day reach) is replaced. New: `buildClientRun`, `calendarPage`,
      `openingMonth` / `openingDay`, `clientMonthOn`, `outsideItsMonth`, `monthOf` / `monthTitle` /
      `monthShort` / `shiftMonth` / `monthBounds`.
    - An entry's `day` is now its `uploadDate`, falling back to the stamp only when there is no upload
      date. `wentLiveDay` is renamed `markedDay`.
    - Sentences: "Posted on 15 Aug" (+ the upload time); "Marked posted on 5 Oct — no upload date was
      given"; "Posted — no date was given".
    - `ClientCalendar` is rewritten: ‹ Sep · October 2026 ▾ · Nov ›, Today, a month list, the client's
      months as links, and start/end written on the day. It measures itself (`chartKit.useWidth`):
      post names from 600px, three per day from 960px, marks only below. The body font is used for the
      title when narrow. The day's posts sit under the grid.
    - `CalendarDayPanel`: cards side by side, Open beside the name, and "Its date is outside Month 1".
    - `marks`: fixed sizes, plus `xs`.
    - `SmmCalendarBoard`: the client list moves beside the calendar only from 1280px.
  - **Owner's data:** Dhana lakshmi's nine upload dates are each a month early (August, before the 6 Sep
    start). The calendar now shows them on August's page, flagged; the dates are to be corrected in the
    Content list. `smmDashboard.postedDay` (Insights) is unchanged.
  - **Files:** `src/utils/smmCalendar.ts`, `src/components/smm/calendar/{ClientCalendar,CalendarDayPanel,marks}.tsx`,
    `src/components/smm/{SmmCalendar,SmmCalendarBoard,SmmReportPanel}.tsx` (comments and breakpoints),
    `src/test/smmCalendar.test.ts` (19), `src/test/smmCalendarUi.test.tsx` (8).
  - **Tested:**
    - Unit and UI tests on the in-memory Firestore.
    - Browser harness (real `SmmCampaignPage` / `SocialMedia` on memoryFirestore, 240px sidebar shell):
      the owner's month at 1920; widths 1920 / 1280 / 1024 / 800; phones 412 / 390 / 360 (every month's
      name fits); dark and light; Report tab; board at 1440 / 390; the month list; keyboard across a
      month's edge; swipe; tap-to-reveal. No horizontal overflow and no console errors.

- **2026-10-05 (later): the client calendar redrawn so anybody can read it** (`.claude/rules/smm.md` §9.9 /
  §24 / §25; `roles-routes.md` §10; `architecture.md` §22).
  - **The problem.** The owner asked whether earlier months can be checked, and said the calendar was
    confusing — it had to be clear "even to an uneducated person".
    - The first calendar paged by calendar month, so one client month (5 Sep → 5 Oct) was split over two
      pages.
    - It used six stage colours, hatching and small icons.
    - Its prev/next were small chevrons and a strip.
    - The Report tab's "This month's calendar" was a stacked bar chart, with no way to an earlier month.
  - **Confirmed (with mockups):** one client month per page, and three marks only.
  - **The new page:**
    - **Which month:** "Month 2 · 5 Sep – 5 Oct 2026 · Running now", big "‹ Month 1 / Aug 2026" and
      "Month 3 ›" buttons, and a button per month.
    - **How it went:** three big counts — ✔ Posted, ✖ Not posted, ◷ Coming up — each a solid circle, a
      number and a word.
    - **The calendar:** each day shows only those marks with a number, today ringed, and the days around
      the month faded.
    - **The picked day:** its posts in sentences ("Posted on 12 Aug (it was planned for 10 Aug)", "Not
      posted — it was due on 25 Aug", "Waiting for the client's approval"), with "See on Instagram" and
      Open.
  - **Where:** the same calendar is now on Content → Calendar, the Report tab (replacing the bar chart)
    and Social Media → Calendar.
  - **Files:** `utils/smmCalendar.ts` rewritten around one month (`buildMonthCalendar`,
    `openingMonthId`, `openingDay`, `dayMarks`, `markOf`, `entryNote`, `waitingNote`, `phaseLabel`,
    `rangeLabel`, `weekGrid`); `calendar/ClientCalendar` and `CalendarDayPanel` rewritten; new
    `calendar/marks`; `SmmCalendar` takes `focusId`; `SmmReportPanel` (+ `onOpen`) and
    `SmmCampaignPage`.
  - **Fixed in the browser check:**
    - A right-swipe on the calendar was taken by the browser as Back and left the page; the grid is now
      `touch-pan-y`.
    - The phone's "Month 2 ›" button was cut to "Mo…"; the buttons now sit under the name on a phone.
    - Day marks grow on wider screens.
  - **Tested:**
    - `smmCalendar.test.ts` (15) and `smmCalendarUi.test.tsx` (6), both rewritten.
    - A browser harness at 1440 / 390 px, dark and light: the month page (Content and Report), the board,
      the step buttons, the month buttons, a swipe, the day panel and the links. No console errors, no
      sideways scroll.
    - `npm run build` ✅; `npx vitest run` ✅ 197 files, 3057 tests; tsc → only the VideoCallManager
      error; eslint clean on the changed files.
  - **Not covered:** live Firebase.

- **2026-10-05: the SMM client calendar, and "Accounts it covers" in setup** (`.claude/rules/smm.md`
  §9.9 / §24 / §25 / §27; `roles-routes.md` §10; `architecture.md` §22; `data-model.md` §13).
  - **Client calendar.** The owner asked for a world-class monthly calendar of each client's social
    media for checking the history. The month page's calendar showed only that month's thirty days.
    Confirmed answers: one calendar per client across all their months; on the month page AND as a new
    Calendar view on `/smm`; posts only; a person sees only the months they can already open.
    - **Rules:** `utils/smmCalendar.ts` (pure, tested) — grid, spans, entries (a posted piece on the day
      it went live, late vs missed), words ("Went live 2 days after its planned day"), month summary,
      strip, clients.
    - **Data:** `services/smm.fetchClientMonths` (one on-demand `where clientPhoneId ==`) and
      `hooks/useSmmClientMonths` (live month merged over the read, 5-minute cache, visibility filter;
      no read at all for a member's or salesperson's board).
    - **UI:** `components/smm/calendar/ClientCalendar` + `CalendarDayPanel` + `kindIcons` — toolbar,
      history strip, chips (dots on a phone), hatched non-running days, a "Month N" start marker, a
      day panel with links, keyboard, swipe, reduced-motion-safe transitions.
    - **Wiring:** `SmmCalendar` (now the month-page wrapper; the kind filter spans every month);
      `SmmCalendarBoard` (client list / phone sheet, `?client=`); `SocialMedia` (third view, `?view=`,
      the finished-clients read shared with the Finished tab via `loadFinished`).
  - **Accounts it covers** (owner, mid-task: Edit setup had no way to choose the accounts).
    - **Rules:** `smmPackage.cleanPlatforms` / `itemsForAccounts` / `linksForAccounts`.
    - **Write:** `smm.setMonthPlatforms` (transaction; posted pieces keep their accounts).
    - **Setup:** `MonthSetupInput.platforms` through `applyMonthSetup` / `setupSaleMonth` /
      `setupProblem`.
    - **Form:** `SmmSetupForm` (`SmmSetupValue.platforms`, shared `AccountPicker`); `SmmAddSaleDialog`
      (setting up a recorded sale asks too; the no-sale step's chips are the same control).
  - Tested:
    - New tests: `smmCalendar.test.ts` (17), `smmCalendarUi.test.tsx` (7, the real calendar on the
      in-memory Firestore), `smmAccountsOct05.test.tsx` (9, the real setup dialog and services); +2
      in `smmAddSaleUi.test.tsx` (Calendar view) and its setup-step test extended to the accounts.
    - Totals: `npm run build` ✅; `npx vitest run` ✅ 197 files, 3060 tests;
      `npx tsc -p tsconfig.check.json --noEmit` → only the known VideoCallManager error; eslint clean on the
      new and changed files.
    - Browser harness on fake data (in the scratchpad): overseer and member, 1440 / 1280 / 390 px,
      dark and light — history paging, strip, chips → panel, keyboard focus across months, a swipe,
      the phone client sheet, the finished clients, Edit setup → Instagram + YouTube saved with the
      unposted pieces moved and the posted ones kept. No console errors, no sideways scroll.
  - Fixed on the way: chip titles clamp to two lines; a full-width month band (heavy orange lines) was
      replaced by a start marker; the phone client header wraps instead of squeezing the name.
  - Not covered: live Firebase.

- **2026-10-04: CLAUDE.md split into a short core, module files that load by path, and this
  history** (CLAUDE.md Context map, §29.21, §30, §32–§34). The owner approved the recommended split
  ("take the world's best solution"). CLAUDE.md had grown to ~2,450 lines / ~208 KB, roughly 50k tokens
  in every session, and the owner's workflow rules sat ~1,900 lines down. The Claude Code docs
  recommend under 200 lines and say long files reduce how well the rules are followed.
  - **The new core** (~360 lines, ~28 KB): a header with the quick start, a Context map, §1, §28–§30,
    §32–§34.
  - **Eleven `.claude/rules/*.md` files** with `paths:` globs, loaded by Claude Code only when a
    matching file is read or edited: architecture, backend-security, data-model, roles-routes,
    sales, orders-work, smm, ai-ads, ai-accounts, chat, people.
  - **§31** moved here.
  - Section numbers are unchanged, so every "§17.2"-style reference still resolves through the map.
    Each module file carries its own §9 entries and its share of the §24 rules and §25 / §27 status
    and risk bullets.
  - §29.21 now defines the three-part context and caps the core. §30 steps 1 and 8 say which file
    to read and which to update; `/dev` was updated to match.

  Done by script, with no rewording: sections, §9 entries and bullets were moved verbatim. A second
  script confirmed that every non-blank line of the old file is in one of the new files; the only
  exceptions are the 16 lines of the old header, which was replaced. Every glob was checked against
  the repo's files. The other session working in this tree (SMM dashboard) had finished its CLAUDE.md
  edits first, and they were carried over.

- **2026-10-04 (later still): one clear card per client** (§9.9, §10, §22, §24). The owner's verdict on
  the Overview charts: not easy to understand the work progress and status — they wanted each SMM month
  clear in a single card. The cards are now the default view of `/smm`: each says a status in everyday
  words with its reason (Off track · At risk · On track · Completed · Not started · Needs setup —
  `utils/smmGlance.ts`), carries a status-coloured stripe, draws every promised post as one ring of five
  named buckets with "6/16 posted" in the middle, then each kind's bar, the days left and the next post;
  the board above is a row of status counts that filter the cards, worst first. The same glance heads the
  month's page; the content table's chips use the same colours. The charts stay as **Insights**, one
  switch away. Fixed on the way: the team initials and the next-post row vanished in dark mode (the dark
  "muted" colour equals the card), white words on amber buttons, and the month page's legend stretched
  across the page. Verified: build ✅, vitest 194 files / 3025 tests ✅ (new `smmGlance.test.ts`; the board
  tests now cover status words, worst-first order, status filters and the Insights switch), typecheck 1
  known error; a throwaway harness outside the repo (real `/smm` and month pages on `memoryFirestore`, 12
  seeded months; deleted after) ran 19 checks at 1440 and 390 px, dark and light — default cards, worst
  first, every status filter's count matches its cards, search, Insights and back, card → month, a
  salesperson's own months with Renew — no console errors, no horizontal scroll. Not run against live
  Firebase.

- **2026-10-04 (later): Social Media Overview dashboard** (§9.9, §11, §19, §22). The owner asked for
  "the world's best" visual dashboard for Social Media Management — clean, minimal, premium — after the
  2026-10-03 board (tiles + cards) still had to be read card by card. `/smm` now opens on **Overview**:
  a Delivered hero (meter with today's target), six tiles that open the pile they count, a **pace
  matrix** (every client by month gone × posted, against the even-pace diagonal), the stage pipeline, a
  posting calendar stacked by stage, clients worst first as bullet charts, a renewals runway with ₹, team
  load and ads — the board is the **Clients** view. All numbers in a new pure `utils/smmDashboard.ts`,
  drawn in hand-made SVG (`components/smm/dashboard/*`), following the dataviz method: stage colours
  validated (CVD + normal-vision separation for every neighbouring pair, both themes) as `--viz-*`
  tokens; text never in a data colour; legend or table behind every chart; hover and keyboard tooltips.
  Found and fixed on the way: "Approved" was the brand orange beside the amber of "with the client" and
  the red of "late" — the whole section (cards, timeline, popup, chips) now uses the validated scale, with
  late also a diamond; chip and pace texts were amber-on-white (unreadable) and are now in the text
  colour; the month's Report tab (orange progress bars) uses the dashboard's parts; `ProgressBar` and
  `SmmBoardStats` removed as unused. Verified: build ✅, vitest 193 files / 3014 tests ✅ (31 new in
  `smmDashboard.test.ts` and `smmDashboardUi.test.tsx`; the board test now opens the Clients view),
  typecheck 1 known error; a throwaway harness outside the repo (the real `/smm` and month pages on
  `memoryFirestore` with 12 seeded months; deleted after) ran 13 checks at 1440 and 390 px, dark and light
  — tooltips, tile → Clients tab, table view, member filter, a salesperson's own view, the month report —
  no console errors, no horizontal scroll. Not run against live Firebase.

- **2026-10-04: one source of instructions, read at start-up without being asked** (§6, §29, §30,
  §34). The owner kept two files — CLAUDE.md (loaded into every session) and `claude-agent-prompt.md`
  (an "investigate & fix" prompt pasted by hand) — and asked for an agent that reads them first on
  every task. The prompt file mixed two things: standing rules (root-cause fixes only, break nothing,
  100% with zero errors, restate the task first, test in a real browser, loop, list improvements
  without implementing them, a report with steps for the owner to verify), which applied only when
  pasted; and a per-task slot. It also told agents to log sessions in `docs/AI-MEMORY.md`, which §29.21
  forbids. The rules were merged into §30, which now opens with the three non-negotiables and steps
  0–9, and the quick start states them. The prompt file was deleted, and its task slot became
  `.claude/skills/dev/SKILL.md` (`/dev <task>`, user-invoked only, pointing back to §30).
  `.claude/settings.json` adds a SessionStart hook (startup, resume, /clear, compaction) that runs
  `.claude/hooks/session-start.cjs`. It prints the branch, the number of uncommitted files (a sign of
  a parallel session) and the commits behind origin/main, plus `HANDOFF.md` in full when it exists. Before
  this, §34's "read HANDOFF.md first" relied on the agent remembering to. All of it is committed in the
  repo, so cloud sessions get the same skill. Verified: the hook was pipe-tested under Git Bash with
  and without a `HANDOFF.md` and from another directory (exit 0, correct output); the settings
  parse. The hook goes live in the next session (or after `/hooks`). No app code changed.

- **2026-10-04 (later): the Drive card appears instantly, fits the screen, and is a solid card** (§9.6,
  §24). The owner saw the Drive step arrive a little late after Mark complete and asked for it at once,
  as a fitted, strong card. Cause: the card opened only after `useCompleteWork` returned — six writes in
  a row (job, assigner alert, team-leader alerts, order, chat lock, client record). Now
  `useDriveUploadStep.submit` opens it first and runs the completion behind it; `complete` gained
  `onSaved` (fired after the job's own write) so the card can say "Submitting…" → "Video submitted"
  truthfully, with "Not submitted yet" + Try again on failure, and a follow-up failure after the save no
  longer tells the member their work was not submitted. The session time is handed to `complete` and
  the studio's close no longer records it a second time. The card: centred on every width, max-width
  440 px, green top band, compact steps, no close on a backdrop tap. Verified: build ✅, vitest 191 files
  / 2983 tests ✅ (6 new in `driveStepInstant.test.tsx`, the job's write held open to prove the card is
  there first), typecheck 1 known error; a throwaway CDP harness outside the repo (the real card through
  the real hook, a fake 1.5 s save; deleted after) ran 19 checks — on screen 41 ms after the tap at 390 px
  and 6 ms at 1440 px, fits 360×640 / 375×667 / 390×844 / 412×915 / 1440×900 with no inner scroll, failure
  → Try again, backdrop tap keeps it, no console errors.

- **2026-10-04: social-media months out of My Work, into Social Media** (§9.6, §9.9, §24). The owner
  asked that a tech member's My Work stop showing social media, with all of it in the Social Media
  page, and that anything on My Work not needed be removed. The month's job card is the month's only
  way into the AI studio (code, credits, time, completion), so it was moved, not dropped: My Work and
  Recent Ads filter it out (`isSmmMonthJob`) — with it went the "each video" label and the "Month plan
  →" link — and the month page gained `SmmMyJobPanel`, whose buttons use My Work's existing `?open=`
  (new) / `?chat=` links with `back=`, so there is still one studio and one completion flow; closing
  any of it returns to the month (`useDriveUploadStep({ onClosed })` for the Drive step). Kept on My
  Work because bulk orders use them: the shared progress panel, pinning and the "who does what"
  labels. The month's assignment alert now opens the month, and a withdrawal opens `/smm`. Verified:
  build ✅, vitest 190 files / 2977 tests ✅ (13 new in `smmOutOfMyWork.test.tsx`, 2 link checks in
  `smmSetupOct03`), typecheck 1 known error; a throwaway CDP harness outside the repo (real My Work and
  month page on `memoryFirestore`, the real studio and code box; deleted after) ran 22 checks at 1440 /
  390 px — My Work without the month, the panel, Start → code → studio → Close back on the month as "In
  progress", chat there and back — no console errors, no horizontal scroll.

- **2026-10-03 (later): the Drive step after a job is handed in** (§9.6, §16, §24). The owner asked that
  the member's own Drive link appear the moment a video is marked complete. The real problem: uploading
  was one tick at check-out for the whole day, when several `VID_…mp4` files had to be matched to Day /
  clip-count folders from memory — files went missing or into the wrong folder, and work not in the
  Drive is not counted. Now `DriveUploadSheet` opens on every hand-in (My Work, Recent Ads) with three
  steps (open your folder · go to this folder · upload it with this name), one-tap copies, the next step
  always the loudest button, and "It's uploaded" stamped on the job (`driveUploadedAt/Path/FileName`,
  `services/workDrive`); "Upload later" leaves a strip at the top of both pages and a button on the job;
  check-out lists today's jobs in / not in the Drive; no Drive link → one tap asks the tech admin.
  `useCompleteWork` clears the mark on every hand-in. Verified: build ✅, vitest 189 files / 2964 tests
  (16 new in `driveUploadStep.test.tsx`, 1 in `recentAdsComplete`; one unrelated `aiPlatformInputs` test
  timed out once under the full run's load and passes alone), typecheck 1 known error; a throwaway CDP
  harness outside the repo (real sheet / strip / chips, faked auth and writes, deleted after) ran 31
  checks at 1440 / 1280 / 390 px, dark and light — no horizontal scroll, no console errors.
- **2026-10-03 (later): SMM — a month that had no sale** (§9.9, §24, §8.2). The owner had run SMM for
  some clients before the app recorded sales and wanted them in it — client number, salesperson, the
  rest set up by hand — shown in the salesperson's login with from/to dates, NOT in revenue or
  commission, and tracked normally from the next month. Built as `origin: "no_sale"` months (no order,
  amount 0, `soldBy` = the salesperson) added from Add SMM sale (`smmSetup.addNoSaleMonth`), with clash
  rules so one can never stand in for a recorded sale (overlap, a deleted sale's dates, any month after
  a sale) or a future month; the salesperson's Renew makes month 2 a sale. Orderless months now get job
  cards sharing one client chat on the month id (`orderChat.joinMonthRoom`, `createWorkAssignment`
  `roomId`/`soldBy`) and never adopt the client's waiting sale by phone (the test was mutation-checked).
  Found and fixed on the way: a renewed month's jobs read "23h 59m left" (the sale form's promise) —
  `linkRenewal` now sets the month's deadline first (`monthPromise` moved to `services/smm`); and every
  edit or approval of a sale wrote its promise back over an order's month deadline or a used extension
  — `upsertOrderForSale` keeps both. Verified: build ✅, vitest 189 files / 2964 tests ✅ (14 new in
  `smmNoSaleOct03`, 3 in `smmAddSaleUi`), typecheck 1 known error; a throwaway CDP harness (real board,
  month page, My Leads and My Work on `memoryFirestore`, deleted after) ran 37 checks at 1440 / 390 px —
  add, refusals, history, the salesperson's view, the renewal as a sale with the month's deadline, My
  Work — no console errors, no horizontal scroll. Built alongside a parallel session in the same tree
  (the renewal popup, then a Drive-upload step), files split by message.
- **2026-10-03 (later): SMM renewal countdown popup for the salesperson** (§9.9, §24). The owner asked
  that, from three days before a month's renewal date, the salesperson who made the sale gets a popup
  like a work report — the month's work status, report and timeline drawn clearly — counting down
  3 days, 2 days, 1 day to renewal. New `SmmRenewalPopup` (lazy, in `AppLayout`, sales members only;
  reuses the seller's scoped `useSmmCampaigns` query, which the dashboard card shares) and pure rules
  in `utils/smmPackage` (`daysToRenewal` counts to the end date — `daysLeftInCycle` counts today and
  read "3 days left" under a "2 days to renewal" countdown, so the popup draws its own timeline labels).
  The month page opens on `?tab=report`. Shown on the renewal day too; not after it. Verified: build ✅
  (popup chunk ≈12 KB), vitest 187 files / 2930 tests ✅ (13 new in `smmRenewalPopup.test.tsx`),
  typecheck 1 known error; a throwaway CDP harness (real popup, faked auth and months, outside the repo,
  deleted after) ran 25 checks at 1440 / 1280 / 412 / 390 px, dark and light — countdown at 3 / 1 / 0
  days, nothing at 4, paging, Later, Full report, Renew, no horizontal scroll, no console errors.
  Built alongside a parallel session's SMM "month with no sale" work in the same tree (files split).
- **2026-10-03: SMM — every month is a sale; setup, renewal by the salesperson, visual board** (§9.9,
  §24). The owner re-created old SMM months from the tech side and needed: a sale recorded for the
  salesperson who made it (counting in their login and commission), old deleted months set up again
  without a second sale, a month that ends on the same date next month, clips per video, assignment
  that reaches My Work, team-leader delete, renewal only by the salesperson, and a clear board.
  Found and fixed on the way: the Orders split dialog gave the AI studio the number of VIDEOS in the
  month as each video's clip count (a Pro month locked every video to 8 clips) and duplicated job cards
  on every re-split; assigning on the month page created no job and told nobody; "They renewed" linked
  nothing; overseers' Finished tab was always empty; seller renewal reminders were never shown; cards
  said "Last day" the day after a month ended; Renew/upsell links opened My Leads on a lead hidden by
  the "today" filter (now brought into view); a sale's chat room now opens before its month (a
  renewal's auto-assigned jobs join it). Verified: build ✅, vitest 186 files / 2910 tests ✅ (new:
  `smmPackage`, `smmSetupOct03` on memoryFirestore, `smmAddSaleUi`), typecheck 1 known error; a
  throwaway CDP harness (real SMM pages, My Leads and My Work on memoryFirestore, deleted after) ran 35
  checks at 1440 / 390 px across tech admin, team leader, salesperson and member — all passing, no
  console errors (43 after the same-day rename / counts / undo follow-up). Not run against live Firebase.
- **2026-10-02: this machine's `main` merged with origin/main; the parallel Flow module dropped** —
  a local session had built a second implementation of the same request on top of `eb2c3ff`
  (Flow Accounts: `components/flow/*`, `pages/shared/FlowAccounts.tsx`, `services|utils|types/
  flowAccounts`, `hooks/useFlowAccounts`, and a credit step inside `AIPlatformApp`; commit `346c7f0`).
  Following the owner's choice recorded in `b260745`, every overlapping file was resolved to
  origin/main's version and that module was removed — it stays in history at `346c7f0`. Git had
  auto-merged its credit step into `AIPlatformApp` WITHOUT a conflict, next to `useCreditGate` in My
  Work / Recent Ads: members would have been asked twice and the build would have broken. The merged
  tree equals origin/main apart from this file. Verified after the merge: build ✅, vitest 183 files /
  2873 tests ✅, typecheck 1 known error, `api/*` parse with esbuild.
- **2026-10-01 (later): Social Media Management — delete, the Social Media Team Lead, typed extra
  work** — (1) months can be deleted (main admin, tech admin, team lead): a direct month outright, a
  sold month as a `deleted` tombstone that `ensureCampaignForOrder` never revives. (2) The existing
  `smmLeader` flag (a hard-to-find icon in My Team's table) became the **Social Media Team Lead**: a
  panel at the top of `/smm` where the tech admin / main admin appoints or removes them
  (`SmmTeamLeadPanel`, `setSmmTeamLead`, `watchSmmTeamLeads`), notified on appointment and on every
  newly sold month (`smm_new_month`), with delete added to their powers. (3) The top bar no longer shows
  a month's order id (`o_Uwng…_1790…`) — it reads "Social Media / <business>" (`Topbar.looksLikeId`;
  any unresolved id segment is left out). (4) Extra work is chosen from a list (poster / promotional /
  wishes / cinematic video + duration); fixed on the way: it was added via `addItems`, which never told
  the seller although the toast said it had. Verified: build ✅, vitest 183 files / 2873 tests ✅ (8 new
  in `smmManageOct01`), typecheck 1 known error; a throwaway Playwright harness (real SMM pages + real
  Topbar on `memoryFirestore`, deleted after) ran 16 checks at 1440 / 390 px — appoint + notify,
  breadcrumb, extra work saved and shown, delete → tombstone → gone from the list, member / team-leader
  permissions — all passing, no console errors, no horizontal scroll.

- **2026-10-01: six AdGen faults fixed at their cause, and the AI Accounts module** —
  (1) *Unrealistic videos* (people walking over tables and cupboards, toward the camera onto the road,
  the shop extended): every Veo prompt now animates its own frame — it opens with THE ATTACHED FRAME
  (`frameSummaryOf` the clip's frame prompt) and a FRAME BOUNDARY rule; walk-and-talk and every move
  that shows space beyond the still (pull back, dolly out, crane, pedestal, orbit, arc, pan, tilt,
  truck, follow tracking) are retired, leaving push-in, rack focus, float and locked; director text
  that walks, climbs or reveals is discarded; the negatives name each fault. Different places in one
  shop come from different FRAMES. (2) *Motu & Patlu growing*: a drawn pair is filmed on a locked frame
  or a rack focus only, every approach is stripped (`withoutApproach`), and a scale anchor (their
  height against a 90 cm counter) is stamped on every frame and opens the scale lock. (3) *Client
  photos changed*: each store/office photo is a background plate — kept exactly, only enhanced to 8K,
  the cast placed into it; the photos are attached to the frame writer and reused round-robin instead
  of an invented zone. (4) *Human duos weaker than Motu & Patlu*: the writer, repair and frame requests
  no longer call every pack a cartoon (`packAdKind`), role-label casts are never asked to say their
  labels, and a deterministic cast sheet (`utils/castSheet`) fixes each invented person's face and
  outfit across clips; Veo names speakers by how they look. (5) *Kids*: three packs (two girls, two
  boys, girl & boy) in the sale form, Work Assign and the studio, with child voices, kid attire and
  family-safe negatives. (6) *Address*: the last clip says the verified address in spoken form; no
  clip may invent one. Then **AI Accounts** (§9.21): Flow accounts (email, password, login phone,
  creation date → expiry), the 30-by-29-October target, credits per clip length, the mandatory credit
  step before Mark Complete, "using now" and splitting an ad across accounts, assignment with
  who-moved-what history, live editable usage, the admin overview and calculator, and the paid
  ChatGPT / Grok logins — tech admin and team leaders manage everything. New collections and rules
  (§13, `docs/firestore-rules.md`, where the catch-all no longer covers them). Verified: build ✅,
  vitest 182 files / 2865 tests ✅ (new: `adPipelineEndToEnd`, `humanDuoKidsOct01`, `spokenAddress`,
  `flowCredits`, `aiAccountsFlow`; `recentAdsComplete` now goes through the credit step), typecheck 1
  known error; a throwaway Playwright harness (the real pages and the real studio's Mark Complete on
  `memoryFirestore`, deleted after) ran 92 checks at 1440 / 412 / 390 px and 1680 / 390 px — totals,
  add / duplicate / validation, assign + notifications, disable, history, edit and delete credits,
  paid assign + password, settings, using-now, the credit dialog over the studio — all passing with no
  console errors and no horizontal scroll. Found and fixed on the way: a credit dialog opened before
  the accounts loaded kept an empty account; the assign dialog could lose a pick on a live update;
  account history could drop a concurrent event (now `arrayUnion`); a job handed in again offered its
  whole clip count again; settings accepted 0; a creation date could move away from recorded credits;
  and five phone/desktop layout faults. Nothing was run against live Gemini, Veo or Flow. *Merged with `main` (PR #1):* `main` had meanwhile gained a parallel version of the same work
  (`eb2c3ff`: its own motion/duo/Kids/address prompts and an unrouted Flow-accounts module —
  `services/flowAccounts`, `components/flow`, `flow_credit_logs` — writing `flow_accounts` in a
  different shape). The owner chose this branch's version: the conflicted files, the catalogue and
  the Flow module are this branch's; kept from `main` are the optional `dialogueFormat` children's
  word budget and final-clip slack, the `scriptQa` address field and the sales-message attire line.
  `main`'s `api/send-notification.ts` had stray editor text before its first import (a broken
  function); this branch's copy replaced it.

- **2026-09-29: generation made ~2× faster, measured live** — a live 4-clip Telugu run took 129 s (plus
  the B-roll/overlay tail) in 13 strictly sequential calls, 20,693 thinking tokens against 6,736 of
  output. Now ~70–90 s with B-roll and overlays included; a Motu & Patlu ad 161 s → 108 s with a better
  script (5.4 → 7.4). (1) **Thinking budgets** per call (`effort`: fast 0 / standard 768 / deep 1536,
  26 pipeline call sites) — thinking tokens down ~60%. (2) **Overlaps**: poster after extraction, photo
  scout during the script, a scene plan per draft during the gate, B-roll and overlays inside the run
  (`extras`). (3) **Gate**: judge first — the review runs only for a polish; extra drafts written in
  parallel with a 60 s deadline. (4) **Keys**: round-robin across usable keys, dead (invalid/expired/
  leaked) keys skipped with no wait and remembered for a day, 429 keys rested (30 min for a daily limit),
  last good key kept. (5) **Images** downscaled to 2048 px once per file before upload (checked in
  Chrome: 11.7 MB → 1.6 MB, cached). Verified: vitest 177 files / 2796 tests ✅ (5 new, fake SDK),
  build ✅, typecheck 1 known error; three live runs. Found: nine of the thirty keys are invalid or
  "reported as leaked" (§26).

- **2026-09-25 (later): AdGen integrity batch — eight faults, each traced to its cause** —
  (1) *Spec edits not reaching the member*: reopening a job re-loaded its last kit and that restore
  wrote the kit's old attire, gender, ratio, language, pack, festival and background back over the
  job's spec, into fields locked as "Fixed by assignment". The job's spec is now one util
  (`utils/assignmentFormSpec`) applied on open, on change and on top of every restore; a stale kit
  says what changed. The three edit dialogs gained the occasion and the brief (`AssignmentBriefFields`;
  `categoryDependentPatch` now writes `festival` for ads), the brief carries the business name and
  client's notes, and a corrected brief reaches an edited BUSINESS CONTENT box. (2) *Fake contact
  details*: every number and address came from the extraction model's JSON unchecked — now
  `utils/businessFacts` verifies it against what was typed or could be read, rewrites the profile to
  only those facts, lays out 1–3 numbers, and scrubs unverified numbers from posters, concepts,
  overlays and refines; the old unverified readers were deleted. (3) *Motu & Patlu growing*: the pair
  was filmed with dolly/push/crane/pedestal/orbit/low-angle moves and speaker push-ins, and the
  negatives forbade a steady camera — a pair is now filmed from a fixed distance at eye level
  (`DUO_SAFE_MOVES`), speaker focus moves only the focus, scale-changing beats are refused. (4) *Final
  script*: `FinalScriptPanel` rewrites 5 · 6 · 7 from a pasted script with per-section progress. (5)
  *Completed but missing*: the post-run auto-load race (above) is gone, rows are always drawn with a
  state and their own Generate, missing frames are written not copied, and a failed poster no longer
  fails the run. (6) *Pale video*: `COLOUR_LOCK` + negatives + no light-changing scene life. (7) *Which
  ad*: the job strip. (8) *Script quality*: the separate quality gate with automatic polish / rewrite
  and the educated-speaker register in the writer rules. Also fixed two regexes an earlier edit had
  stripped of backslashes (`/whatss*app/`, the header initials split). New optional field only:
  `ai_generations.scriptQa`. Verified: build ✅, vitest 176 files / 2784 tests ✅ (56 new, 5 changed to
  the new behaviour), typecheck 1 known error, and a throwaway CDP harness (Gemini + Firestore faked,
  deleted after) walked idle → run → missing poster Generate → final script → phone width with no
  console errors and no horizontal scroll. Nothing run against live Gemini or Veo.
  *Follow-up, same day:* the final-script entry moved from the Deliverables header INTO row 4 as the
  highlighted "Input Final Script" strip (visible with the row shut; `OutputSection` gained a `footer`
  slot), with a three-step guide, "Load current script" and a copyable ChatGPT / Gemini instruction.
  Vitest 2787 ✅; a CDP harness checked 1680px and 390px (no overflow). The owner's commit `b781037`
  captured that throwaway harness (`verify.html`, `vite.verify.config.ts`, `src/__verify__/*`); it is
  deleted again and the deletion belongs in the next commit.
  *Follow-up: English ads in Indian English.* English ads were voiced by Veo in a British/American
  accent because the prompt said only "speaking English". `speechAccentFor` now puts "Indian English with
  a natural Andhra Pradesh accent" in the opening line, a VOICE AND ACCENT block, every spoken line and
  the negatives; the English writer rules, language directive and quality gate ask for Indian English
  (rupees, Indian places, no American/British slang). Telugu and other languages unchanged. Vitest
  176 files / 2791 tests ✅, build ✅, typecheck 1 known error. No live Veo run.

- **2026-09-23: a two-hander's video prompts lost one speaker** — `utils/dialogueFormat`'s speaker
  label was matched as a single WORD, so any character whose NAME contains a space was unreadable in
  the DISPLAY form (`[Chhota Bheem]: …`). Generation was unaffected (the model writes the canonical
  `0-8|bheem:` form, keyed on single-word keys), but `voiceOverScript` is stored in the display form
  and re-read to build the Veo prompts, so **Chhota Bheem & Chutki reached the video prompts with
  only Chutki's half of each clip, Ben 10 & Grandpa Max with no dialogue at all**, and the solo
  Business Owner / Custom Character / Chosen Deity / Mickey Mouse packs with no spoken line. The
  label now accepts multi-word names (`LABEL`, `labelKey`), and `parseDialogueClips` takes a
  `SpeakerVocabulary` — plain aliases as before, or the pack's `{key, name}` speakers — so
  `[Chhota Bheem]` resolves to the key `bheem` that validation, frames, Veo and name spellings all
  read. `geminiService` passes `packSpeakers(pack)` at all four call sites. Also fixes: refining such
  an ad's voice-over, and a member pasting a correctly labelled two-person script being told it
  needed speaker lines. Verified: build ✅, vitest 171 files / 2720 tests ✅ (8 new, incl. a
  round-trip over the whole catalogue and an end-to-end Veo assembly for Bheem & Chutki), typecheck
  1 known error. No live Gemini or Veo run.
- **2026-09-25 (later): the workspace band** — the four blocks above the deliverables were taking a
  third of the first screen for things a member reads once or never. Finished, **Generation Status is
  one 50px line** (title and sentence share it; the five milestone ticks are dropped, since they only
  repeat what "Completed" says — the full stepper stays while a run is going, where it is the useful
  thing on the screen). The **AI Guide strip, the ChatGPT/Gemini link, Open Video Generation Platform
  and "What we understood"** became one 46px `ag-bar` of small buttons, with the understanding panel
  opening under the band instead of being a card of its own. Same handlers, same links, same test
  hooks (`ai-guide-button`, `run-understanding-toggle`, `run-understanding`). Measured in the harness:
  Deliverables now start 255px down instead of ~535px, and all seven rows fit one 1680×1050 screen.
- **2026-09-25 (later): "mariyu" on the page, and a duo that stops saying its own labels** — two
  faults from a delivered ad. (1) The script still showed **మరియు** and the Veo prompt carried a
  `PRONUNCIATION` line; the team reads the script aloud and wants the one Latin spelling **on the
  page**. `FIXED_WORDS` now normalises the Telugu word and every misspelling TO `mariyu`,
  `pronunciationNotes` is gone from the Veo prompt (replaced by `fixedWordsIn`, test-only), the
  writer rule asks for the Latin form, and `withoutFixedWords` keeps the validator's "no Latin in
  spoken content" rule from reporting it. (2) A **Male & Female duo** was cast as "Friend"/"Host" —
  which says nothing about who is who — and, worse, the two people addressed each other by those
  labels out loud ("హోస్ట్, ఈ కిట్స్‌తో…"), which reads like a template nobody finished. The mixed duo is
  now **Girl & Boy** (keys `girl`/`boy`, its style and script directives updated), every human cast
  character carries `labelSpellings` (how its label would be written if spoken), and
  `validateDialogueClips` takes `forbiddenNames` so a spoken label is a per-clip issue the repair
  pass fixes — the prompt had forbidden it since the packs were written, but nothing checked it.
  Verified: build ✅, vitest 171 files / 2728 tests ✅ (4 new), typecheck 1 known error. No live
  Gemini or Veo run.
- **2026-09-25: AdGen.ai batch — density, the two extras, and five faults**
  *UI.* The header is one row that never wraps at any width (every block `whitespace-nowrap shrink-0`,
  only the business name truncates; the member chip and the job chip drop out below 2xl). Generation
  Status is ~40% shorter (one status line instead of two, 36px milestone nodes, the progress bar gone
  once it reads 100%) and the AI Guide ~35% (`ag-row--tight`, 56px strip), so both fit the first
  screen. Deliverables 6 and 7 became ordinary `OutputSection` rows through a new `actions` slot that
  carries their theme picker and Generate button, so all seven rows are one height and open only when
  asked. "What we understood" (voice brief + background plan) folded into its own 56px expander above
  the Deliverables card, and the Flow link is a normal button.
  *Behaviour.* **B-roll and overlay images are now generated with the kit** — `handleGenerate` runs
  both existing handlers against the run's own result (they take an optional `source` because state
  is not committed yet); the buttons remain as Regenerate. **The first run's "wrong business" output
  is stopped at the source**: a run is refused while `useAssignmentBrief` is still fetching the order
  (the Start button says "Loading the brief…"), and refused outright when nothing describes the
  business — no BUSINESS CONTENT and no card, store, product, flyer or voice file — which is what made
  the model invent one. The brief also now follows a job that is corrected later, replacing the text
  it previously wrote (never a member's own writing). **A two-hander never walks toward the lens**
  (`planClipMotion`, like a deity): a character arriving nearer the camera is what let the video model
  re-proportion the pair, and a new `scaleLock()` block opens every duo prompt naming both characters,
  with matching negatives — this is the height-drift fault. The pasted-script hint is now built per
  special category (two speakers / one named speaker / plain clips) with a Copy format button, since
  final scripts are written in ChatGPT or Gemini and pasted back. `FIXED_WORDS` catches more మరియు
  spellings, including spaced and half-transliterated forms. The client's chat message names the
  festival a wishes video is for (`buildClientChatMessage`, five call sites).
  Verified: build ✅, vitest 171 files / 2724 tests ✅ (4 new), typecheck 1 known error, and a
  throwaway CDP harness walked idle → generating → completed at 1680px and measured the header at
  1024/1280/1440/1590px (72px, one line, no overflow). Nothing run against live Gemini or Veo.
- **2026-09-24: AdGen.ai laid out as one screen** — the studio rebuilt to the owner's three-stage
  reference: a fixed 72px header, a 34% input panel and a 66% workspace, with nothing below the fold
  that matters. LEFT: Assets & Files and Configuration became two sections sharing one space — the
  one that opens takes the room the other gives back (`leftPanel` + the `.ag-morph` grid-row
  transition, 280ms) — so reaching the duration no longer means scrolling past every upload slot; shut,
  Assets is a six-tile summary of what has been given to the run and Configuration reads back the
  run's own settings. Start/Stop moved below both, and a run now shuts both panels. RIGHT: the
  "Generated Ad Kit" hero was dropped; Generation Status became a card with the five milestones
  (`MissionStepper`, exported from MissionWorkspace so the card and the guide can never disagree —
  both read `missionStages()`), the Mission Workspace became the **AI Guide** card the reference asks
  for (numbered rows, each with its own Tab/Open Flow button, countdown compact in the header), and
  once the first asset lands it folds into a 72px strip above the Deliverables card — seven numbered
  72px rows, each with an icon, a one-line subtitle and its existing controls. Project History moved
  into the header, main-frame quick-copy chips now say "Tab 1" like the guide does, and the two
  always-open panels (B-roll, overlay images) took the same row anatomy. New in adgen.css: `ag-sec`,
  `ag-morph`, `ag-ico`, `ag-tile-up`, `ag-steps`/`ag-stepnode`, `ag-row`, `ag-strip`; canvas retuned to
  #030B1A / #07152B. **No handler, prop, state, route or generated output changed** — one deliverable
  heading now renders its number as the row badge ("2. Video Bottom Label"), which is the only string
  that moved. Verified: build ✅, vitest 171 files / 2720 tests ✅, typecheck 1 known error, and a
  throwaway browser harness (headless Chrome over CDP, Gemini faked, deleted after) walked idle →
  configuration morph → generating → completed at 1680px and 390px, confirming all seven deliverables
  in order and no horizontal scroll.
- **2026-09-23: AdGen.ai studio UI, taken live** — the design (dark luxury SaaS: #020617 canvas,
  glass cards, violet→blue→cyan accent, Space Grotesk + Inter) implemented in the real platform, not
  a mock-up. New `src/components/ai-platform/adgen.css` holds the whole system (§11); `index.html`
  loads the two fonts. `AIPlatformApp` gained the 72px glass nav with the run-state chip, the
  "Generated Ad Kit" hero with History/Save, a `max-w-[1520px]` two-column grid whose welcome panel
  is sticky, a system status card with the shimmering progress track, and `ag-acc` accordions for
  every output section. `FileUpload` drop zones now carry rest/over/owner/refused states,
  `GeneratedCard` became a panel with a mono prompt body and a `ag-codebar` toolbar,
  `MissionWorkspace` got the stage rail, checklist steps and countdown in system type, and
  `SavedItems` / `PosterConceptsPanel` follow. A mechanical pass retuned 147 slate-700/800/900
  surfaces across the platform to the glass palette. The studio is dark in every app theme
  (`STUDIO_IS_DARK` + `color-scheme: dark`); `CodeVerificationModal`, which opens outside it, was
  left theme-aware. No handler, prop, data flow, prompt or Firestore shape changed. Verified: build
  ✅, vitest 171 files / 2712 tests ✅, typecheck 1 known error, and a throwaway browser harness
  (headless Chrome over CDP, deleted after) rendered the studio and the generated-asset cards at
  1600px and 390px — no horizontal scroll, tokens and fonts resolving.
- **2026-09-22: AdGen.ai batch (28 items)** — AI platform inputs: BUSINESS CONTENT and FRAME /
  BACKGROUND INSTRUCTIONS boxes, owner image slot, no document uploads (Gemini extraction guidance),
  working drag & drop, voice note understood first (`voiceNote`, `voiceBrief`), custom script word
  for word (`utils/customScript`, wider clip-header parser), human duos (female / male / mixed,
  family `human_duo`) and the Custom Character description in sales, Work Assign and the platform.
  Frames: scene plan (motive + a different background per clip), name board whenever there is no
  logo file, owner-image attach line. Scripts: 15–17 words for two speakers, fixed LEFT/RIGHT
  positions, "speak from inside the business" check, numbers as words and exact మరియు
  (`utils/spokenNumbers`; the ఇంకా swap removed). Motion rebuilt twice in the session — first to
  strictly in place, then (per the owner) to mixed stand / walk-a-few-steps / show-product staging with
  the standard camera vocabulary, speaker focus for duos and no goodbye wave; world and place locks
  kept. Veo refine = plan → JSON edit → check. B-roll shows each line's subject (no presenter, no
  text). Overlay Text Image Generator (`utils/overlayImage`). "VIDEO BOTTOM LABEL" rename with festival
  theme and video context. Check-in prompt skipped on Sundays and holidays. New optional fields only
  (no collections). Verified: build ✅, vitest 171 files / 2712 tests ✅, typecheck 1 known error;
  AI-platform inputs rendered in jsdom with Firebase/Gemini faked; nothing run against live
  Gemini or Veo.
- **2026-09-22: CLAUDE.md created** as the single authoritative context file from a full code
  audit. No application code changed. Baseline: build ✅, vitest 165 files / 2613 tests ✅,
  typecheck 1 known error, eslint 599 problems.
- **2026-09-20:** whitespace-only edit in `accounts-admin/DailyExpenses.tsx`.
- **2026-09-19: Cinematic Ads rebuilt** (`0eb4726`): project list plus `cinematic_projects`
  persistence with autosave, ad-format presets, typed brief inputs, storyboard gate (≤9 panels per
  board), merged Clips step with clip types and camera-move enforcement, cinematic service moved to
  the shared Gemini fallback. `tsconfig.app.json` lost its `ignoreDeprecations` line (so
  `tsc -p tsconfig.app.json` now runs). New rule in `docs/firestore-rules.md`.
- **2026-09-19:** suspense boundary moved inside `AppLayout` (shell stays on screen); deleting an
  order retires its SMM month (`setCampaignRemovedForOrders`); lower-third prompt extracted to
  `prompts/lowerThird.ts`; SMM money trail (`route` direct/via_us, two-leg proofs, `heldByUs`),
  item-dialog fold, inline ad figures; AI upload limits (no video/PDF, ≤10MB); **load time**:
  every page `lazy()`, only `vendor-react` / `vendor-firebase` named chunks.
- **2026-09-18: Social Media Management** section (`smm_campaigns`, `smm_templates`,
  `smmLeader` flag, `/smm` routes, approval gate, derived order progress, direct months,
  reminders in check-in/out, autosaving item dialog, per-platform links). Word-timed overlay cues.
- **2026-09-12: read-quota cut** (352K reads/day incident): team-scoped Leaderboard, session-long
  sales leads/orders stores in AppLayout, `user?.uid` effect keys.
- **2026-09-11: Poster Creation** (`category: "poster"`, poster spec/styles/occasions/concepts),
  business info reaches the assignment and brief, human-pack attire, one-row-per-job generation
  history, generation doc versioning.
- **2026-09-09: sales↔tech workflow batch:** full order capture on the sale (address, business
  info, WhatsApp required), real-vs-AI background on every ad, SMM 2 posts + 2 stories per video,
  sale status chip, upsell ladder, one promise extension, feedback-gated upsell
  (`FeedbackUpsell`), new-order alerts to the tech side, sales admin lands on the leaderboard.
- **2026-08-10 → 08-14:** client chat opens at sale; leave past allowance = absence;
  pay-vs-output; My Clients with upsell; commission shown before earned; incentives in totals.
- **2026-08-02 → 08-04: client order chat** (per-assignment rooms, guest tokens, calls,
  reviews); **hiring link** (`onboarding_invites`, `api/onboarding`); company settings and
  officer signatures; 14 HR document types, references, pagination-based PDF and print, letter
  conventions, internships, training period, role ladders, public badges.
- **2026-07-21 → 07-26:** attendance popup, member dashboard as attendance hub, overlay
  sequencing fix, voice-over quality review pass, assignment ad-spec fields plus locking, sales
  approvals totals, leaderboard month/career, grouped sales nav, sales settlements page,
  notification dedupe, unassign work, phantom-login fix, PWA self-update.
- **2026-07-15:** AI generator batch (male models, name board, attire gating, custom attire,
  language-aware VO, English overlays); tech attendance, employment type, agreements and signing
  gate, deactivation enforcement, reassign work.
- **2026-03 → 2026-06:** initial build of the multi-role app (≈134 commits, mostly unlabelled).

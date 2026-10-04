# DTS-OS — development history (newest first)

> Part of the project context (CLAUDE.md → Context map). Not loaded automatically: read it when you need
> the reason behind earlier work. Every finished task adds a dated entry at the TOP of the list below
> (CLAUDE.md §30 step 8). Detailed notes up to 2026-09-19 are in `docs/AI-MEMORY.md` (historical, read-only).

## 31. DEVELOPMENT HISTORY (concise; newest first)

Detailed per-session notes up to 2026-09-19 live in `docs/AI-MEMORY.md` (historical, read-only).
Design intent lives in `docs/superpowers/specs/`.

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

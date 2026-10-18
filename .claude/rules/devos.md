---
paths:
  - "src/devos/**"
  - "api/devos.ts"
  - "src/components/devos/**"
  - "src/pages/shared/DevOs.tsx"
  - "src/hooks/useDevOs.ts"
  - "src/services/devosApi.ts"
  - "src/services/devosLocal.ts"
  - "src/test/devos*.test.ts"
---

# DREAM TEAM AI Development OS — DTS-OS module context

> Part of the project context (CLAUDE.md → Context map). Claude Code loads this file automatically when a
> file matching the `paths:` above is read or edited. Keep it current per CLAUDE.md §30 step 8; the source
> code wins. Built 2026-10-18 from the owner's MSRS ("DREAM TEAM AI Development OS — MSRS v1.0", a PDF the owner
> keeps at the repo root, untracked). FR / AC numbers in the code comments are that document's.

## 9.23 DEVELOPMENT OS ✅ (2026-10-18)

**What it is.** A daily development platform inside DTS-OS for every role: ten thinking skills measured with fresh,
never-repeated challenges, a personal plan, six ranks earned only through evidence, and a Control Center for the
admins. One route, `/dev-os/*` (`pages/shared/DevOs.tsx`), for all seven roles; external creators and switched-off
accounts are refused. Sidebar: "Development OS" (`roleHelpers.DEV_OS_NAV`) right under each role's dashboard / main
work page — 2nd for the main, tech and accounts admin and the tech member, 3rd for the sales admin (after Leaderboard,
Dashboard), 4th for the team leader (after Orders, Social Media, Work Assign) and 7th for the sales member, after the
agreed first six (`salesNav.test`).

**The ten dimensions** (`core/dimensions.ts`, exactly these): Cognitive, Logical, Learning Agility, Critical Thinking,
Problem-Solving, Creativity & Innovation, Decision-Making, Communication, Emotional Intelligence, Execution &
Adaptability. **Tracks:** Sales, Technical (non-coding by default — no question needs code), Admin; each has a weight
column totalling 100 (MSRS Appendix A) and three critical dimensions (its heaviest). **Ranks** (`policy.rankLabels`):
BASIC → … → ULTRA PRO MAX (six); a rank never drops.

### Architecture — why a server, and the one engine
- **Every Dev OS write is the server's** (`api/devos.ts`, Admin SDK): answer keys must never reach a browser before
  the answer, scores / XP / ranks must come from code the learner cannot change, and the daily work must run with
  every browser closed. The browser only READS its own record live (`hooks/useDevOs.ts`) and calls actions through
  `services/devosApi.callDevOs(action, body)` (Bearer Firebase ID token).
- **One isomorphic engine, `src/devos/`** — alias-free, relative imports ending in `.js` (Node ESM on Vercel), no
  React, no Firebase SDK outside the two store adapters:
  - `core/` pure rules: `types`, `dimensions`, `policy` (every number, versioned), `days` (India day), `rng`,
    `similarity`, `crypto` (AES-GCM seal / HMAC sign, WebCrypto), `scoring`, `mastery`, `xp`, `ranks`, `director`,
    `season`, `badges`, `boards`, `tracks`, `progress`.
  - `content/` deterministic question families with computed keys, hints and worked solutions: 16 objective
    (`rule_application`, `data_table`, `claim_check`, `fact_or_assumption`, `prioritize_value`, `weighted_choice`,
    `schedule_adapt`, `requirement_check`, `learn_and_apply`, `order_puzzle`, `conditional_logic`, `sequence_rule`,
    `clear_message`, `response_choice`, `root_cause_table`, `bottleneck`) + 6 open (`ideas_open`, `explain_open`,
    `reply_open`, `plan_open`, `critique_open`, `decide_open`, each with a rubric and a model answer);
    `challenges.ts` (12 weekly practical challenges), `missions.ts` (6 team missions).
  - `engine/` operations over a `DevStore` port (`store.ts`: `adminStore` for the server, `clientStore` for DEV /
    tests on `memoryFirestore`) and an `AiPort` (`geminiPort.ts` REST, or `fakeAi.ts` deterministic): `bank`
    (serve), `grading`, `progress`, `learner`, `review` (practicals, appeals, voids, coach), `competition` (boards,
    seasons, leagues, missions), `aipool`, `reports`, `admin`, `queue`, `tick`, `router` (the ONE action switch).
- **Two doors in `api/devos.ts`** (`maxDuration` 60): `GET` = the tick — with `CRON_SECRET` set it needs it
  (`utils/smmServerDelivery.cronAuthProblem` — Bearer from Vercel Cron, `x-cron-secret` from cron-job.org); without it
  (2026-10-18, owner: "0% human involvement") it runs OPEN but at most once per 20-minute slot for the whole company
  (`tick.claimTickSlot`, a transaction on `devos_runs/open`; a repeat within a minute on a warm instance is answered 202
  before any read), so the worst any caller can do is make the normal, idempotent, budgeted work happen on time; `POST
  {action,…}` = `verifyIdToken` → `users/{uid}` → `Actor` → `router.dispatch`. Actions: `bootstrap onboard today
  start next hint answer submit practice rank appeal coach privacy league.join boards catchup` and `admin.overview
  admin.staff admin.person admin.track admin.enrol admin.policy admin.void admin.regrade admin.quarantine
  admin.questions admin.audit admin.exceptions admin.reports admin.report admin.export admin.integrity admin.tick
  admin.generate`. The router refuses a switched-off account and an external creator before anything is read.
- **Secrets:** derived from the service account's private key (no new env var); a fixed DEV value in `devosLocal`.
- **DEV / harness:** `VITE_DEVOS_LOCAL=1` in a DEV build runs the same router in the browser (`services/devosLocal`,
  client SDK); `window.__DEVOS_FAKE_AI` → the fake AI, `window.__DEVOS_NOW` → the clock. Production never loads it.

### The learner's flow
1. **Onboarding** (`StartView`): how it works + privacy + the measurement disclaimer (consent required), a few
   questions about the person's actual work → a suggested track they confirm → the **baseline** (one item per
   dimension; never "fails" for being slow — its deadline extends a week at a time).
2. **Home** (`HomeView`): today's **quest** (`quest_<yyyy-MM-dd>`, 3 items, working days only — Monday–Saturday,
   not company holidays or the person's approved leave, due at `cadence.questDueHour` = 23:00 IST; one made less than an
   hour before that keeps an hour, up to midnight; the 17:00 notice names the time), the **weekly practical challenge**
   (`challenge_<week>`, due 19:00 on the week's last working day, evidence fields + rubric), practice on request
   (XP only for the first 10 extra items a day), fresh retries after a miss, retention checks (3 / 7 / 21 / 45 days)
   and transfer checks (a skill in a new setting) chosen by the **Director** (`core/director.ts`, one plain reason
   per item).
3. **Play** (`PlayView`): one item at a time; progressive hints (each costs 15% of the item; ones already taken come
   back on resume); the answer is recorded before anything is shown; then the result (with the XP broken down by
   source), the worked solution, a coach (asks the AI with the item and the worked reason, never the key beforehand)
   and an appeal (one per answer; the answer then reads "Reviewed on …"). A timed item shows its own timer and the
   assessment's total ("mm:ss in all"); at 0:00 a panel says an answer sent within the grace is still scored and offers
   "Next question". The view's top is scrolled into view on every new item, result and summary; the summary says plainly
   when time ran out and how many items counted as 0. A practical has a Home link and keeps its typed entries as a
   per-task draft in the browser until submitted.
4. **Skills / My path / Career / Arena / History**: ten skill cards (score, confidence, trend), the plan, the rank
   gates with what is missing, the boards / league / mission, and every answer with its full record ("Show older
   tasks" reaches every task). Home shows "Today's quest is done" while other tasks are open and never a finished
   league; a task's due chip gives the clock time ("due 11 PM · in 12 h", "due Sat 24 Oct, 7 PM"). The Arena says the
   league's rules ABOVE Join, because Join opens the first timed question at once. Screen conventions: days read
   "19 Oct" (`days.dayLabel`, also in task titles), times "11 PM" (`days.timeLabel`, India time); in the light theme status text is one step darker than the tokens (the brand orange and the
   green / red / blue tokens are under 4.5:1 on white): `kit.ACCENT_TEXT` (orange-700), `GOOD_TEXT` (green-700),
   `BAD_TEXT` (red-700), chips on their own tint one more step (green-800, amber-800, orange-800, red-700, blue-700),
   gold positions amber-700; icons keep the tokens (3:1 is enough for them); every text link and toggle is at least
   24 px. The dark theme keeps the tokens. Home's "why no quest today" comes with the answer that ends the baseline, so
   a Sunday says "a day off" in the same visit.

### Measurement rules (the §24 of this module)
- **No repeat for a person, ever:** before an item is shown its exposure and seen-index entry are written in the
  same transaction (`bank.serveNext`); a candidate is refused when its exact hash, normalized hash (names, numbers and
  number words stripped), solution signature `family:form:setting`, MinHash Jaccard ≥ 0.62 or embedding SimHash
  Hamming ≤ 9 matches anything the person saw (`core/similarity.ts`; seen index in shards `devos_users/{uid}/seen/s{n}`).
  Options are shuffled per person (`exposure.optionOrder`).
- **Objective items are scored in code** from the sealed key — never by a model. **Open answers** are graded by AI
  judges against the stored, versioned rubric: every criterion 0–4 with a quote that must exist in the answer
  (`scoring.quoteInAnswer`, elided quotes checked part by part), an injection fence and detector, a second
  independent judge for high-impact purposes (baseline, rank, league, challenge, mission, capstone), low confidence
  or near the pass mark, an adjudicator when two disagree by more than 15 points, else `pending_validation`. A
  judge's confidence is read on any scale it answers in (`readConfidence`; a missing one is assumed 0.5, which asks
  for a second judge). An answer under 5 words scores 0 in code. Pending, disputed or system-error results never
  count toward a rank.
- **Faulty questions are withdrawn (FR-013).** Automatically: every scored answer counts toward its PATTERN
  (`core/calibration.patternKeyOf` — template family~form~d<level>, or ai~track.dim~d<level>; items are single-use, so
  one item never has enough answers) in `devos_calibration/{pattern}`; the daily roll-over flags a pattern with 20+
  answers that under 15 % pass, or a level-3+ one that over 97 % pass (`judgePattern`) — it is not served for 14 days
  (`devos_bank/calibration_flags`, skipped by `bank.findCandidate` / `catalogue.excludePatterns`), then returns with
  fresh counters; audited as `calibration_flag`. By an appeal: an AI item an independent solver now disagrees with is
  quarantined and the answer voided. By an admin: Void → "the question itself is faulty" (`admin.quarantine`) quarantines
  it and voids EVERY answer to it (people in `servedTo`; originals kept, dimensions re-settled). A void is idempotent
  and corrects the person's counters (`review.voidAttempt`: attempts and passed / failed −1, system faults +1, valid
  attempts −1 when it had counted, its transfer / retention pass removed), so the gates never keep a voided answer.
- **Time limits and deadlines** (2026-10-18; `core/progress.completeTask`, `bank.serveNext`, `progress.closeAndSettle`):
  - An item the person lets run out (`expired` — its own limit, an assessment's total time, or a task's deadline)
    **counts as 0** in the task's score and pass decision; a platform fault (`skipped_system`) never counts. Before, an
    expired item was left out, so waiting out the hardest questions raised a rank assessment's or a league's %.
  - A **timed assessment** (rank: `rankAssessment.minutes` = 30 in all; league: `leagueMinutes` = 20) ends with its
    clock and is judged as usual. **Any other task** (quest, practice, retry, check) whose deadline passed before every
    item was in ends **`expired`**: no quest XP, no "quest done", no streak, no "perfect"; the items answered in time
    already counted one by one.
  - **No question is served after a session's deadline**; the one on screen closes once its answer could no longer
    arrive within the grace (`scoring.timeGraceSec` 120). Wherever an unfinished session is found past its time — the
    next item, the tick's sweep (for an assessment: its own 30 / 20 minutes, not the task's date), a league closing, a
    new rank assessment — `closeAndSettle` closes the rest as expired and settles the task once.
  - **The baseline has no deadline at any level** (`answer`, `startTask`, `serveNext` skip it): its session kept the
    first week's date, so after a week every answer was "expired" and those skills went unmeasured.
  - **A started rank assessment counts as taken.** One at a time: asking again continues the open one; one whose time
    ran out is closed (the rest 0) and recorded as a valid assessment, so the 7-day cooldown applies — before, walking
    away and starting again the next day fished for an easier draw. Career says so before the start (`rank-rules`) and
    offers "Continue the rank assessment" while one is open.
  - **A league entry is written with the result, in the settling transaction** (`progress.writeOutput`), however the
    session ended — before, a session whose last question ran out never marked the entry done and the person fell out of
    the results. At the close, anyone who started and did not finish is settled first and ranked on what they answered
    (rage-quitting never protects a rating); joined but never started = not in the round.
- **The grading queue** (`engine/queue.ts`, `devos_queue/grading`): an open answer / a practical is queued IN the
  transaction that saves it and taken out when graded; the tick grades what is older than 2 minutes (3 a run, at most
  3 tries, then `system_error` — never counted against the person); the daily roll-over re-queues anything still
  waiting that the queue lost (`requeueStranded`; practicals carry `submissionPending`).
- **XP ≠ mastery ≠ rating.** XP rewards verified effort (daily item cap 250, ½ for items far below the person's
  level, a small capped amount for a failed answer, nothing for expiries / system errors / pending); an immutable,
  HMAC-signed ledger whose ids are idempotency keys. **Mastery** per dimension is an Elo-style estimate (difficulty
  points 25 / 40 / 55 / 70 / 85, K = 24 / (1 + 0.15 n), guessing-corrected); staleness lowers its confidence, never
  its score. The league **rating** is Elo per round, reset each season.
- **Ranks only through gates** (`core/ranks.evaluateRank`, policy `rankGates`): fresh rank-assessment % (70 → 90),
  every dimension above a floor, the critical dimensions at a minimum with enough confidence, verified practicals,
  transfer and retention passes, enough valid attempts (15 → 220), and a capstone for ULTRA PRO MAX. XP is never an
  input. Promotion is automatic and recorded as a rank event with the policy version and evidence ids. The rank
  assessment is the LAST step: it opens only once `minValidAttempts` are in AND every other gate is passed
  (`ranks.rankAssessmentOpen`, 2026-10-18 — taken earlier, even 100% could not promote and the 7-day cooldown would then
  block the attempt that could). Its items (`director.rankBlueprint`, 10 with 2 open): every one of the ten skills
  once, the critical ones first; only a longer assessment repeats the critical ones. The gate to-do names each missing
  skill once.
- **Streaks** count working days with the quest done; Sundays, holidays and approved leave never break one; a freeze
  covers a missed day (one per 7 streak days, at most 2).
- **Seasons** are 4 weeks from Monday 2026-10-19 (`cadence.seasonAnchor`; a day before it is Season 1). Boards reset
  each season (Mastery, Most Improved, Execution, Team); skills, ranks and badges never do. A person can hide from
  the boards (`privacy` — at once: the season score's `hidden` is set and the boards rebuilt); names show as the
  policy says (full / first / initials). A teammate's team-mission part reads only "done" / "not done yet" (FR-047).
- **Who:** every role is a learner except the main admin (opts in — `enrollRoles.main_admin=false`); external
  creators and switched-off people never are (they see a plain "for active team members" screen, no requests). The
  **Control Center** (`/dev-os/admin/*`): the main and tech admin see and manage everything (policy, voids, regrades,
  quarantine, the tick, AI generation, export, integrity); the sales admin sees the Sales track, read-only — EVERY
  number of their Overview is built from Sales people only (`adminOverview` builds a scoped snapshot, `scope`), their
  Exceptions list only Sales people's reviews / waiting grades; Questions, Automation, Reports and export are
  platform-admin only (the tabs are hidden, the routes send them back, the server answers 403). A platform admin's
  Overview is rebuilt when it is over 5 minutes old (Refresh forces it). A learning track
  never grants a permission. An action that returns nothing answers `{ ok: true }` (`router.dispatch`).
- **The policy save is strict, the reader lenient:** `parsePolicy` repairs an old or half-saved document so a run never
  breaks, but `adminSavePolicy` refuses any value it would have changed (`policyCoercions`: out of range, not a valid
  value, weights not totalling 100 — named in the error) and merges a partial change DEEPLY (one track's weights never
  reset the others).
- **Answers the server refuses:** an empty written answer (would burn the question), an order that is not a
  permutation of the options. A written answer or a practical's evidence in progress is kept as a draft in the browser
  until sent (`components/devos/drafts.ts`), keyed by the PERSON and the question / task — a weekly challenge has one
  id for a whole track, so on a shared browser the next person saw someone's unsent evidence — and opening the Dev OS
  removes every draft that is not the viewer's.
- **Profiles are always complete:** the roll-over's invite writes a full signed profile (`newProfile` + `invites`), and
  `ensureProfile` completes any partial one (a partial one crashed the first visit, 2026-10-18).
- **Daily quest counters:** `days[].assigned` = quests made that day, `days[].questDone` = quests finished — what the
  Overview's "Quests" compares (`done` counts every finished task). The first quest is made the moment the baseline
  ends (on a working day), not at the next page open.
- **AI never sees a name** (people in prompts are the fictional names of `content/kit.PEOPLE`), uses the app's ONE
  model list and error reader (`utils/geminiModels`), and is metered: a daily budget (policy `ai.dailyCallBudget`
  400, counted in `devos_health/current`), at most 8 Gemini requests per action (30 for a manual or catch-up tick,
  40 for the cron's), 25 s each.
- **The policy** (`devos_config/policy`, read leniently by `parsePolicy`) is saved only through `validatePolicy`
  (weights total 100, gates climb) with a new version (`v1`, `v2`…; the old one kept in `devos_policies/{v}`), and
  every attempt and rank event records the version it was judged under.

### The tick (`engine/tick.ts`) — the work with every browser closed
**It runs with nobody involved** (owner, 2026-10-18: "0% human involvement — if there is time for us then only we
will involve"). Woken by `GET /api/devos` from SEVEN daily Vercel crons (`vercel.json`; Hobby fires each anywhere in its
hour, so they sit on the hour): 01 UTC (06:30–07:29 IST — the roll-over), 04 (the 09:00 "quest ready" notice), 06, 08,
10, 12 (the 17:00 "still waiting" notice), 15 (Saturday's 20:00 league close) — no secret or outside cron needed (the
open slot above); `CRON_SECRET` + a cron-job.org job every 30 minutes remain OPTIONAL hardening / a faster cadence. As a
safety net a staff member's app asks the server to `catchup` when the last run is over 2 hours old (06:00–21:00 IST).
Each run's `trigger` (which cron, a catch-up, Run now) is kept with the heartbeat and shown on the Automation tab, which
says "Runs by itself — nothing to set up". Nothing waits for an admin: an **appeal** on a written answer that the graders
cannot answer is queued (`kind: "appeal"`, the correction `pending`) and decided by the tick (`review.resumeAppeal`; after
`gradeRetryLimit` tries the original stands), the person told (`devos_result`, "Your review is done") — it used to be
"sent to an admin to review", and nothing picked it up; the roll-over re-queues any pending appeal the queue lost;
every morning it checks every profile's signature (already read — no extra reads) and rebuilds one edited outside the
server from its signed ledgers (`admin.checkPerson`, audited `repair_profile`; a ledger row with a wrong or missing
signature is reported and left out of the totals — before, a forged XP row counted in the rebuilt total). Steps, each bounded and idempotent, leaving a heartbeat in
`devos_health/current`: the **daily roll-over** after 06:00 IST (claimed once in `devos_runs/roll_<day>`): invites
(working days only — never a Sunday, a company holiday or the person's approved leave; every 3 days, 5 at most; in the
bell, pushed only outside quiet hours), expiries (a platform fault is `system_error`), re-queues, today's quests and the week's
challenge, staleness, leagues and team missions, closing ended seasons, the admin snapshot and the daily report; the
**09:00 "quest ready"** and **17:00 "still waiting"** notices (claimed once a day, quiet hours 20:00–09:00); every run:
the grading queue, due leagues, missions, the AI question pool, the boards.

### Notifications
Written by the server only (`notifications/{key}` with `create()`, `meta.source "devos"`, data-only FCM push on the
`default` channel): `devos_invite`, `devos_quest`, `devos_due`, `devos_result`, `devos_badge`, `devos_rankup`,
`devos_league`, `devos_mission`, `devos_report` (main + tech admin). Links `/dev-os…`, which every role can open.

## 25. STATUS

**IMPLEMENTED ✅** (2026-10-18): everything above. Verified by `devosContent` (every family × track × setting × form
× difficulty), `devosEngine` (onboarding, no-repeat, idempotency, deadlines and time limits, hints, open answers with
the AI down, the queue, adjudication, rank gates, the tick, practicals, appeals, leagues, integrity, the AI pool, admin
scope, seasons, calibration, quarantine), `devosScoring` (live judge shapes), `devosAiOutput` (live writer / judge
output) and `devosAdminStore` (the production adapter through the router on a Firestore-strict fake); a live Gemini
run of every prompt (2026-10-18: generation → solver → embeddings / dedupe; the judge; coach; report; practical — it
found the confidence-scale bug and four others, fixed); and a browser harness on the in-memory Firestore driving every
role's screens at 390 px and desktop (each finding fixed and re-checked).

**Not verified / owner actions:**
- **Live since 2026-10-18** (build `1792295123286`): Vercel did not deploy the Claude co-authored commits `1399a78` /
  `02e8c82` by themselves (Hobby plan; the same on 2026-10-08), so a one-line commit without the trailer (`1c4e4bd`,
  at the owner's go-ahead) made it live. Checked on production: `GET /api/devos` → 500 `{"error":"CRON_SECRET not
  configured"}` (until the secret is set), a POST without a token → 401, the preflight → 204, and the bundle carries the
  "Development OS" menu item and its page.
- **No setup needed to run** (2026-10-18): without `CRON_SECRET` the seven Vercel crons run the tick through the open
  slot. Optional: set `CRON_SECRET` (then only callers holding it can wake the tick — Vercel's crons send it themselves)
  and a cron-job.org job every 30 minutes for a faster cadence. The Automation tab shows each run and what woke it.
- Live Firestore / Vercel / push were not exercised (no login here); the `devos_*` rules are in
  `docs/firestore-rules.md` (publication NOT CONFIRMED — the design does not depend on them: keys are sealed and
  ledgers signed).
- The free Gemini tier may use prompts for training (said on the Automation tab); no personal data is sent.

## 27. RISKS

- 11 of the 30 Gemini keys are dead (`backend-security.md` §26.3); the port skips them, but capacity is lower.
- The question template space is large but finite per person; the AI pool tops it up (by demand from the snapshot).
  A person who answers thousands of items in one dimension can exhaust it — they then get a plain "no fresh item"
  rather than a repeat (FR-011).
- One queue document (`devos_queue/grading`, ≤ 400 items) and one health document are shared hot spots — fine at
  this company's size.
- A Vercel function is cut off at 60 s: a slow Gemini day can end an `answer` request before its grading finishes —
  the answer is saved and queued first, so it is graded by the tick (the person sees "waiting for a grade").

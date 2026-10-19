# DTS-OS — PROJECT CONTEXT (CORE) & DEVELOPMENT RULES

> **This core is loaded into every session.** Module detail lives in `.claude/rules/*.md`, which Claude
> Code loads automatically when you read or edit a matching file. The history lives in
> `docs/DEVELOPMENT-HISTORY.md`. Together the three are the project context: in the rules below,
> "CLAUDE.md" or "this file" means all three. The section numbers §1–§34 never change, and the Context
> map below says where each section lives. For cross-module orientation, read the repository-wide
> system-navigation section in `.claude/rules/architecture.md`, then read the relevant module guide(s)
> and verify details against current code. The **source code wins** over the context; when they disagree,
> fix the context in the same task.
>
> **Quick start:** at start-up the hook `.claude/hooks/session-start.cjs` prints the repo state and
> **`HANDOFF.md`** (an unfinished task; continue it first). **Every development request follows §30
> Change Protocol and §29 Rules:** fix the root cause, break nothing else, done = 100% with no errors
> and verified in a real browser. The owner may start a task with **`/dev <task>`**. Then read §33
> (what the app is) and §34 (session & usage protocol).
>
> **Last full audit:** 2026-09-22 against `main` @ `a1623ac`. Split into core + module files on 2026-10-04.
> Legend: ✅ implemented · 🟡 partial · ❌ not implemented · **[NOT CONFIRMED]** = could not be
> verified from code (e.g. live console/deployment state).
> Secrets are never written here. Where code contains one, this file only says *where*.

---

## CONTEXT MAP (where each section lives)

| File | Sections (original numbers) | Loads automatically when you read or edit |
|---|---|---|
| `CLAUDE.md` (this core) | §1 identity, §28 conventions, §29 rules, §30 change protocol, §32 state, §33 AI context, §34 session protocol | every session, always |
| `.claude/rules/architecture.md` | §2–§6 (purpose, overview, stack, architecture, structure), §9 intro, §9.17, §9.20, §11 frontend, §19 search/filters/analytics, §22 components, §23 data flows, §25 status, repository-wide system navigation | app shell and layout, `App.tsx`, build/config files, UI kit, dashboards, PWA / Android |
| `.claude/rules/backend-security.md` | §9.1 auth, §9.19, §12 backend & API, §14 auth & security, §18 notifications, §20 integrations, §21 env vars, §26 confirmed issues, security risks | `api/**`, Firebase / notifications / FCM / upload services, login, `docs/firestore-rules*.md` |
| `.claude/rules/data-model.md` | §13 database (every collection, field, relationship, status) | `src/types/**`, `src/services/**`, `src/hooks/**`, `docs/firestore-rules*.md` |
| `.claude/rules/roles-routes.md` | §7 roles, §8 permissions, §9.2 team management module, §10 pages & routes, §15 team management | `App.tsx`, `roleHelpers`, layout, team / member pages, onboarding |
| `.claude/rules/sales.md` | §9.3 leads, §9.4 sales, §9.11 clients / feedback / upsell, §9.18 training & scripts | sales pages, `components/sales`, leads / clients / upsell services |
| `.claude/rules/orders-work.md` | §9.5 orders, §9.6 work assignment + Drive step, §16 task management | orders / work services, `components/work`, Orders, Work Assign, My Work, Recent Ads |
| `.claude/rules/smm.md` | §9.9 Social Media Management | any file named `*smm*` / `*Smm*`, `components/smm`, the Social Media pages |
| `.claude/rules/ai-ads.md` | §9.7 AI Ads Platform, §9.8 Cinematic Ads, §17 advertisement generation | `components/ai-platform`, `components/cinematic-ads`, Gemini / prompt services, ad utils |
| `.claude/rules/ai-accounts.md` | §9.21 AI Accounts (Flow credits, paid logins) | `components/ai-accounts`, AI Accounts pages, `aiAccounts` / `flowCredits` |
| `.claude/rules/invoices.md` | §9.22 Invoice Builder (GST invoices, `DTS/26-27/0001` numbers, live A4 preview, PDF) | `components/invoice`, Invoices pages, `invoice*` utils / services, `utils/gst`, `useLeaveGuard` |
| `.claude/rules/devos.md` | §9.23 DREAM TEAM AI Development OS (ten skills, daily quests, evidence-gated ranks, Control Center; `api/devos` + its cron) | `src/devos/**`, `api/devos.ts`, `components/devos`, `pages/shared/DevOs.tsx`, `useDevOs`, `devosApi` / `devosLocal`, `devos*` tests |
| `.claude/rules/chat.md` | §9.10 client order chat + calls, §9.12 team chat / calls / meetings | chat, order-chat and call files, `api/order-chat.ts` |
| `.claude/rules/people.md` | §9.13 attendance & leave, §9.14 payroll & commission, §9.15 HR & documents, §9.16 finance | HR, agreements, payroll, attendance, onboarding, accounts-admin, salary pages |
| `docs/DEVELOPMENT-HISTORY.md` | §31 development history (newest first) | never; read it on demand |

- Each module file also carries its own share of **§24 business rules**, **§25 status** and **§27 risks**.
  The full `paths:` globs are at the top of each file.
- A module file loads only through the Read, Edit and Write tools. If you are about to change a module
  and its file is not in your context yet (for example because you have only searched with Grep or
  Bash), **Read it first**. One task often loads several module files (an SMM job card: `smm.md` +
  `orders-work.md` + `data-model.md`).

---

## 1. PROJECT IDENTITY

| Item | Value |
|---|---|
| Repo / folder | `DTS-OS` (package.json `name` is still the template's `vite_react_shadcn_ts`) |
| Product name in UI | **DTS Manager — Dream Team Services** ("Command Center"); Android app name **Dream Team** (`com.dreamteam.app`) |
| Company | Dream Team Services (DTS), Kakinada, Andhra Pradesh, India (see `utils/employmentDefaults.ts`, `utils/company.ts`) |
| Production web | `https://dreamteamos.vercel.app` (from CORS allow-lists and `API_BASE` in `services/notifications.ts`) |
| Backend project | Firebase project `dts-manager` (Auth + Firestore + FCM) |
| Git remote | GitHub `dreamteamservicespvt/dreamteamos` (from a merge commit); default branch `main` |
| History | 276 commits, 2026-03-01 → 2026-09-20. Many commit messages are one or two letters ("af", "S"); `docs/AI-MEMORY.md` and §31 hold the meaningful history. |
| Ad language default | Telugu (ads also support English, Hindi, Kannada, Tamil, Malayalam, custom) |
| Currency / locale | INR (₹), India; dates stored as `yyyy-MM-dd` strings plus Firestore Timestamps |

---

## 28. DEVELOPMENT CONVENTIONS

- **Commands:** `npm run dev` (port 8080) · `npm run build` (Vite; the build-truth check) ·
  `npx vitest run` (full suite ≈2 min) · `npx tsc -p tsconfig.check.json --noEmit` (typecheck;
  expect 0 errors since `5ca75b0`) · `npm run lint`. `vite dev` does not run `/api`; use
  `vercel dev` or the DEV fallbacks.
- **Imports:** `@/` alias → `src/`. Types from `@/types` / `@/types/<domain>`.
- **Layering:** pure rules in `src/utils/` (no React, no Firestore, unit-tested) →
  Firestore-aware operations in `src/services/` → hooks → components/pages. Put new business rules
  in utils with tests.
- **Comment style:** long "why" comments (`── Why … ──` banners, JSDoc on fields explaining the
  business reason and past bugs). Match that density when editing nearby code; keep the reasons
  when refactoring.
- **Backward compatibility:** new fields are optional; absent means legacy behaviour (e.g.
  `payments` absent = paid in full; `origin` absent = sale). Deprecated fields stay typed with
  `@deprecated`. Avoid data migrations; read old shapes through helpers.
- **Idempotency:** deterministic doc ids (orders, campaigns, chats), `dedupeKey` on
  event notifications, in-flight refs for submit buttons, transactions for contended arrays
  (SMM, number locks).
- **Read quota:** scope every new query (`where` on team or owner), prefer one session-level
  listener, key effects on primitives (`user?.uid`) not the `user` object (a new object arrives
  on every snapshot), avoid cross-member scans, and prefer on-demand reads for history.
- **Routing:** add routes in `App.tsx` under the right `AppLayout allowedRoles` and nav items in
  `roleHelpers.NAV`. Notification links must be routes the recipient's role can open (or `/` +
  query).
- **UI:** shadcn + Tailwind; `useToast` for feedback; `useConfirm` for confirms; check phone widths
  (390/412px), 24px minimum tap targets, `min-w-0` on truncating grid/flex children.
- **Documents:** never reintroduce fixed running headers for print; keep the paginator
  comparison strict (`scrollHeight > clientHeight`); verify exported PDFs from the **dark** theme
  (ink-colour bug).
- **Gemini calls** in the ad pipeline state their effort (`callWithFallback(fn, { effort })`, §17.3); a new
  call that only reads, formats or splits is `fast`. Run independent steps together, not in turn.
- **Scripted edits** to source must assert the target text exists before replacing (a silent
  no-op happened once).
- **Unicode escapes in regexes:** write `\u{2000}` (braced, with the `u` flag) rather than a literal
  special space or a 4-digit escape typed through an AI tool — a U+2000 in `withoutQuotedSpeech` was
  silently turned into a plain space once, which disabled the check. ESLint's
  `no-misleading-character-class` false-positives on Indic ranges.
- **India day:** never derive a day with `toISOString().slice(0, 10)` (the UTC day — yesterday 00:00–05:30 IST). In the
  browser use the local-day helpers (`format(d, "yyyy-MM-dd")`, `useToday`, `workDates.localDayOfInstant`); on the server
  (Vercel runs in UTC) format in `Asia/Kolkata` (2026-10-15).
- **Testing:** Vitest + Testing Library in `src/test/`; mock Firestore modules or seed zustand
  stores. A test that needs Firestore to behave (writes land, listeners re-fire, batches and
  transactions are all-or-nothing, `increment` / `arrayUnion` / `FieldPath` applied) mocks
  `firebase/firestore` with `src/test/memoryFirestore.ts`; a browser harness can alias it too. Real-browser checks use a throwaway harness (a temporary root `.html` + `src/__verify__/`
  mounting real components with `firebase/*` aliased to an in-memory fake, driven over CDP or
  Playwright) because real pages need a Firebase login. Delete the harness afterwards.
- **Never edit** `aiadsdts/`, `dist/`, or generated `services/characterCatalogue.ts` by hand for
  large changes (edit the JSON source).
- **`api/` is outside the build and the typecheck** — a syntax error there ships unnoticed (it
  happened in `eb2c3ff`). Parse it after touching it:
  `npx esbuild api/<file>.ts --platform=node --log-level=error > /dev/null`. Vercel runs `api/` as **Node ESM**
  (`"type": "module"`): an import from `api/` into `src/` must reach only alias-free files, and every runtime relative
  import on that chain ends in `.js` (`../src/utils/x.js`) — extensionless fails only on Vercel (2026-10-15).
- **Shell-scripted edits** (Windows + Git Bash): `node -e '…'` and heredocs mangle backslashes,
  backticks and apostrophes (a `\b` once landed in source as a backspace character). Write the script
  to a `.cjs` file with the editor tool, use `String.raw` for text with backslashes, assert every
  anchor, and scan for control characters afterwards.
- **Before pulling, check for parallel work:** the owner runs local and cloud sessions on the same
  request. `git fetch` and read `git log HEAD..origin/main` first; git can auto-merge two
  implementations of one feature into a file without a conflict (see §31, 2026-10-02).

---

## 29. DEVELOPMENT RULES (permanent, for every future Claude session)

1. Read this CLAUDE.md before any significant change.
2. Inspect the relevant source code before editing; never rely on this file alone when code can
   verify it.
3. Understand the existing architecture before introducing new architecture.
4. Reuse existing services, utils and components (see §12 service list, §22).
5. Do not duplicate functionality (one sale form, one `createWorkAssignment`, one
   `callWithFallback`, one notification path).
6. Preserve existing behaviour unless the user explicitly asks to change it.
7. Never expose secrets: no keys, passwords, tokens or credentialed URLs in code comments, docs,
   commits or this file.
8. Never invent APIs.
9. Never invent database structures or relationships; new collections and fields must be
   documented here and in `docs/firestore-rules.md` when they need a rule.
10. Never assume a UI element works without reading its handler.
11. Never assume documentation (including this file, `docs/AI-MEMORY.md` and specs) is more
    accurate than the source.
12. Update CLAUDE.md after successful development (§30 step 8).
13. Remove outdated information from CLAUDE.md.
14. Keep CLAUDE.md synchronised with the actual project.
15. Clearly identify incomplete functionality (§25).
16. Avoid unnecessary large-scale refactoring.
17. Explain significant architectural changes (in the report and in §31).
18. Check for regressions after changes: build, vitest, typecheck, and the related flows.
19. Maintain existing coding conventions (§28).
20. Ask for clarification when requirements conflict with existing business logic and cannot
    safely be inferred.
21. The project context is exactly three things: this core, the module files in
    `.claude/rules/*.md` and `docs/DEVELOPMENT-HISTORY.md` (the Context map at the top lists them).
    Do not create any other project-context or documentation file (no ARCHITECTURE.md, API.md,
    etc.). Do not add new entries to `docs/AI-MEMORY.md`; history goes in
    `docs/DEVELOPMENT-HISTORY.md` (§31). **Keep this core short** (about 350 lines at most): new
    detail goes into the module file it belongs to. A new module gets its own rules file, with a
    `paths:` list and a row in the Context map. Never let one module file grow into a second copy of
    another. The one exception is **`HANDOFF.md`** at the repo root: a temporary note for an
    UNFINISHED task (§34), deleted when that task is done and the context has been updated. The rest
    of `.claude/` (the `/dev` command and the session-start hook) is tooling, not context: it points
    here and must not grow its own rules.
22. Treat TODOs, placeholders and specs as intent, not implementation.

---

## 30. CHANGE PROTOCOL (every development request)

This applies to every request that changes the project, whether it comes as `/dev <task>`
(`.claude/skills/dev/SKILL.md`, which only adds the task) or as plain text. It is the owner's
standing workflow, merged here on 2026-10-04 from the former `claude-agent-prompt.md`.

**Non-negotiable.** (a) **Permanent fixes only:** find and fix the root cause, with no patch work,
temporary hacks or workarounds. (b) **Break nothing else:** every other page, module, feature and UI
element keeps working exactly as before unless the task says otherwise. (c) **100% completion, zero
errors:** done means every listed item is fully resolved with no build, console or runtime errors.

0. **Confirm understanding.** Before touching code, restate each item in your own words (intention,
   goal, expected outcome). If anything is unclear or ambiguous, or conflicts with existing business
   logic, ask first (§29.20).
1. **Read context.** Read `HANDOFF.md` if it exists (the session-start hook prints it), then §33.
   Identify the affected modules and their module files from the Context map (module entries are in
   §9, routes in §10 and components in §22). A module file loads by itself once you Read or Edit a
   matching file; if it has not appeared, Read it before changing that module.
2. **Investigate.** Inspect the current implementation. Confirm that each reported issue really exists,
   and pin down the exact files, components and lines. Scan the whole codebase only when genuinely
   needed. Compare what you find with the context and correct it where it is outdated.
3. **Plan, then check the plan.** Write a concise plan, then check it: does it fix the root cause,
   could it cause side effects in other modules, does it handle the edge cases?
4. **Implement** in the project's existing style, patterns and structure (§28).
5. **Verify.** Unit tests for the rules. For UI, run it in a real browser (the throwaway harness, §28)
   and exercise every fix. If something fails or a new error appears, debug, fix and test again. State
   plainly what could not be driven (e.g. live Firebase or Gemini).
6. **Check for regressions:** `npm run build`, `npx vitest run`,
   `npx tsc -p tsconfig.check.json --noEmit` (0 errors).
7. **Loop** through steps 2–6 until every item is 100% resolved.
8. **Update the context** so it describes the new actual state:
   - **the module file** for each changed module: its sections plus its own §24 rules and §25 / §27
     status and risk bullets;
   - **`data-model.md`** for new collections or fields, and **`roles-routes.md`** for new routes or
     permissions;
   - **§32** in this core when the project state changes;
   - **a dated entry at the TOP of `docs/DEVELOPMENT-HISTORY.md`**: what changed and why, files
     touched, how it was tested.

   Nothing module-specific goes into this core (§29.21). Never write history to `docs/AI-MEMORY.md`.
9. **Report:** (1) each item, how it was fixed and the files changed; (2) what was tested in the
   browser and the results; (3) the exact steps the owner can follow to test and verify it
   themselves; (4) database/API and business-rule changes, known limitations, and which context
   files were updated; (5) suggested improvements, each with a short reason, **none implemented
   without the owner's approval**; (6) the §34 closing line (start a new chat, or continue here).

---

## 32. CURRENT PROJECT STATE (as of 2026-10-19)

- 2026-10-19 (night), **local, not pushed** — **Leaderboard incentives = plan rate × verified money, no 75% target check**
  (as before 15 Oct; the evening's "so far" version, pushed as `0e3df2b`, is replaced) (`sales.md`, `people.md`; history
  2026-10-19 night).

- 2026-10-19 (afternoon), **local, not pushed** — **Development OS fixes** from the owner's screenshots: answers revealed at
  the end; written answers and practicals graded in their own request (no more hours on "Being graded"); Career's false
  "top rank"; a rank timeline with badge pictures; an editable Profile (`/dev-os/profile`); back buttons that go back
  (`devos.md`; history 2026-10-19 afternoon).

- 2026-10-19, **on `main` and live** (with the 2026-10-18 security work and the Dev OS's open tick; pushed by the owner as
  `802f09a`, build `1792320604656`, checked 2026-10-18 10:52 UTC: both APIs 401 without a token, `/api/devos` 200;
  the **Firestore rules PUBLISHED** 10:58 UTC — anonymous reads / writes now 403 — and public sign-up switched off,
  `backend-security.md` §14) — **whole-app audit fixes**: revenue = approved sales everywhere (pending shown beside it, one
  util `salesRevenue` + `revenueReport`), dashboard counters, Accounts = P&L, external creators not staff, Work Assign's
  sold-ad label, HR filter on phones, another role's URL → own home, breadcrumbs in words, chart axes, My Leads' duplicate
  sold lead (`people.md`, `roles-routes.md`, `orders-work.md`; history 2026-10-19).

- 2026-10-18, **on `main` and live** (`1399a78`; live from the one-line `1c4e4bd`, build `1792295123286` — Vercel did
  not deploy the Claude co-authored commits by themselves) — **DREAM TEAM AI Development OS** (`devos.md` §9.23), from the
  owner's MSRS: `/dev-os/*` for all seven roles — ten skills, a baseline, daily quests, weekly practicals, retention /
  transfer checks, six evidence-gated ranks (XP never unlocks one), never the same question twice, AI rubric grading with
  two judges, seasons / leagues / boards / team missions, and the admins' Control Center; every write on the server
  (`api/devos.ts` + `src/devos/`). It **runs with nobody involved** (later that day): seven daily Vercel crons wake its
  tick with no secret needed (one run per 20-minute slot), appeals are decided by the tick, profiles self-repair each
  morning; an in-app catch-up as a safety net. Optional: `CRON_SECRET` (needed by the SMM checker), the `devos_*` rules.

- 2026-10-16, **on `main`** — **AdGen speed**: the script quality loop ships a READY script
  (≥ 9/10, every hard rule met) at once instead of chasing 10/10; budget 3 passes / 45 s (`ai-ads.md` §17.2, §27).

- 2026-10-15, **on `main`** — **dates and periods**: an SMM month's end date is its renewal day
  (own days end the day before), the sale asks "Month starts on", one checked way to change a month's dates, posts dated
  outside not counted, Months to check; Payroll opens on the period due and asks before paying early; pay terms apply
  from a chosen period (`users.payHistory`); ONE commission rule (collected in the period, 75% gate, Settlements and
  Payroll never pay the same money); P&L / Accounts Dashboard per pay period; invoice dates kept in their series; Flow
  credits dated by the day made; the India day everywhere (`smm.md`, `sales.md`, `people.md`, `orders-work.md`,
  `invoices.md`, `ai-accounts.md`, `data-model.md`; the `invoice_numbers` rule).
- 2026-10-15, **on `main`** — **the voice-over word contract**: every clip of every generated
  script holds 17–20 spoken words (18–19 preferred, 20 the hard ceiling), for every cast, ad type and language — a pair's
  two lines together — counted by ONE counter on the exact shipped text (`utils/scriptContract`, `prompts/wordContract`);
  a 10/10 quality loop (8-dimension rubric, the score computed in code, ≤ 5 passes / 120 s) and a final gate that stops a
  run whose script still breaks the contract (`ai-ads.md` §17.2 step 3, §24, §25, §27; `data-model.md`).
- 2026-10-15, **on `main`** — **SMM Delivery Control, all phases (0–7)**, starting in **Preview**:
  each client's month as WEEKLY tasks (`utils/smmCadence`), the supervisor (`utils/smmMonitor`), a new screen behind
  **✨ Delivery Control** on the classic Social Media page (`/smm/control`: Today, Weeks, Client plan, Team, Starting line,
  Alerts log, Settings — per role), the writes (`services/smmDelivery`: switch a month on, Do it now / Need more time,
  Blocked, Why late, moves, reassigns, approvals with proof, posted links, check-out reasons, `smm_alert_state`), full-screen
  alerts in the app (`components/smm/alerts`, through the popup coordinator; the 11 AM / 5 PM check and the due card step
  aside for covered people), the AI layer (`services/smmAi`: titles, briefs, reasons, the client's WhatsApp update; 2027
  festivals), the server checker `api/smm-monitor.ts` (cron, `CRON_SECRET`), and phase 7: Make it in the AI studio, the
  Flow-credit forecast, and one-tap client approval in the client chat (`api/order-chat` `smm-approvals` / `smm-answer`)
  (`smm.md` §9.9, `data-model.md`, `roles-routes.md`, `backend-security.md`, `people.md`, `chat.md`, `architecture.md`).
- 2026-10-15, **on `main`** — the **Real Owner Duo**: Real Owner Face for two owners (Male + Male,
  Female + Female, Male + Female). Two labelled owner-photo slots in the studio, both required (the run is refused
  without either); Owner 1 = photo 1 = LEFT, speaks first (the man on Male + Female), Owner 2 = RIGHT; the duo face lock
  and two-photo attach line on every frame, the owner's template for two on every Veo prompt; the sales notes ask for a
  photo of EACH owner. Its first half was already on `main` (`74b0b8e`), so the three entries show in the pickers there
  without this wiring (`ai-ads.md` §17.2, §24, §25, §27; `sales.md` §9.4).
- 2026-10-14, **documentation in `main`** — cross-module DTS-OS navigation consolidated into the repository-wide system-navigation section in `.claude/rules/architecture.md`; `CLAUDE.md` points to it. This indexes the existing module guides, key service/data flows, repository layout, verification steps and security caveats; it is not a claim of a full runtime or pixel-level audit.
- 2026-10-13 (late night), **on `main`**: the bell's follow-ups — **toasts at the bottom on
  phones**, a smaller badge, **dismiss one row** (X / swipe, Undo) and **mark as unread**, a **daily 90-day clean-up** of
  `notifications`, and the bell's index in **`firestore.indexes.json`** (+ `firebase.json`, `.firebaserc`)
  (`backend-security.md` §18, `data-model.md`).
- 2026-10-13 (night), **on `main`**: the **bell's Mark all read and Clear all work**. They act
  on every notification, not the 50 loaded. Clear all is one `notification_state/{uid}` point with Undo, and the
  once-a-day reminders are written once (`sendNotification({ once })`), so they never come back
  (`backend-security.md` §18, `data-model.md`; new rule in `docs/firestore-rules.md`).
- 2026-10-13 (evening), **on `main`** — **poster refine works**: design requests go in one
  "Changes:" line (the three sentences untouched), a refine can leave out / bring back a verified number or the address and
  change the words' language, and the studio says when nothing or not all was applied (`ai-ads.md` §17.2, §24).
- 2026-10-13, **on `main`** — SMM **"Create next renewal" only for the main admin and the tech
  admin** (not the team leaders; the salesperson keeps Renew, the sale), in the screens and in `createRenewalMonth`
  (`smm.md`, `roles-routes.md`).
- 2026-10-13 (later), **on `main`** — **contact numbers on the poster and the footer**: one
  verified list (`utils/businessFacts.contactNumbersOf`, at most 3, each once, as written) printed by the label, both
  posters, overlays, frames and refines; an order id / account / price is never a phone number; the label's WhatsApp
  number is one of its pills, not an extra; the poster's Format line names the count or "No phone number" (`ai-ads.md`).
- 2026-10-13, **on `main`** — the 3-item task of 2026-10-12: the **Social Media Team Lead is
  view-only** on months she is not on and works her own like a member (`smm.md`, `roles-routes.md`, the first
  `smm_campaigns` rule in `docs/firestore-rules.md`); **Half Day leave** — Full day / Half day, ½ of the allowance, the HL
  mark, counted in halves everywhere (`people.md`, `data-model.md`); **poster prompts** — ONE conceptual ad type, the
  owner's three sentences + a Format line, for Poster Creation AND the video kit's poster, 9:16 by default (`ai-ads.md`).
- 2026-10-10, **on `main`**: **Motu & Patlu walk only where a clip's words need it** — every
  other clip is acted out standing, so Veo keeps their heights and clothes (`ai-ads.md` §17.2 step 6, §24).

- 2026-10-10, **on `main` and live** (`7c36262`, pushed by the owner): **Attendance → Pay Salary on one source of truth** — one tally, paid =
  the payment record, Sales Payroll on the member's rule, Accounts linked to Payroll (`people.md` §9.13–9.14, `data-model.md`);
  then **inactive people shown only in My Team / Team Management** (`cbe33fc`, live; `roleHelpers.isActiveUser`,
  `roles-routes.md`); then, **on `main`**, **comp-off** — W "Worked on holiday" earns a credit,
  C "Comp Off" pays an absence, Apply in Payroll (`people.md` §9.13).
- 2026-10-10, **on `main`**: **Gemini API keys on the Flow accounts** (asked in the Add form too; the AI Studio link
  can be copied) + the tech admin's
  **API keys** tab (copy / `.env` / in use); AdGen still reads Vercel's `API_KEY_1…30` (`ai-accounts.md`).
- 2026-10-10, **on `main`**: **AdGen's Gemini calls no longer fail on a retired, busy or
  used-up model** — the model list made current (2.0 Flash, shut down 2026-06-01, was still asked; 3.8 / 3.6 Flash and
  Google's never-retired `-latest` aliases added), `callWithFallback` rewritten on shared facts only, a plain sentence
  when nothing can answer (`utils/geminiModels`; `ai-ads.md` §17.3).
- 2026-10-08 (later), **on `main` and live** (pushed first to branch `claude/cast-consistency-smm-attendance`, then
  fast-forwarded into `main` at the owner's go-ahead — a branch is not on dreamteamos.vercel.app, which is built
  from `main`): **the ad's cast from the configuration to the last video prompt** (a Male & Female Duo — or any
  pair — can no longer ship a one-voice script or one-speaker Veo prompts: the dialogue reader keeps every turn its
  own, the quality gate never prefers a draft that lost a speaker and a run that cannot keep the cast stops, every
  step after the run uses the kit's own `spec`; `ai-ads.md`), the same class fixed in **Cinematic Ads** (the AI's
  format read by id or label, its cast details recorded, projects saved whole), and **Social Media → Attendance**
  — rebuilt that night as the lead's TODAY board for her daily meeting: who to call (Call / WhatsApp), who is not
  coming, who is in; the team from every month on the board, editable (`app_settings/smm_team`; `smm.md`, `people.md`).
- Before it on `main` (`abeab79`, 2026-10-08 17:10, the owner's commits): everything through 2026-10-05 (§31),
  **Sales → Tech on one permanent `saleId`** (`sales.md`, `orders-work.md`), **Real Owner Face** and **దసరా**
  (`ai-ads.md`), and the **Invoice Builder** with Invoices → Settings (`invoices.md` §9.22).
- `npm run build` ✅ (2026-10-18: main chunk ≈497 KB, vendor-firebase ≈665 KB, geminiService chunk ≈890 KB; lazy pages for
  AI Accounts, Invoices, SMM Delivery Control and its AI / alert parts, and the Development OS — its question engine never
  ships to the browser).
- `npx vitest run` ✅ 273 files, 4557 tests all pass (2026-10-19 afternoon; `smmDeliveryControlUiOct15`, failing earlier
  that day, passed in this run). Under heavy parallel load a few UI tests can time out; they pass re-run alone.
- `npx tsc -p tsconfig.check.json --noEmit` → 0 errors (2026-10-18).
- `npx eslint .` → 599 problems (measured 2026-09-22, pre-existing).
- Most recent work (newest first; detail in §31): the DREAM TEAM AI Development OS (2026-10-18); dates and periods across SMM, pay, invoices and AI accounts (2026-10-15); the voice-over word contract + 10/10 loop (2026-10-15); SMM Delivery Control, all phases (2026-10-15); the Real Owner Duo (2026-10-15); bottom toasts, one-row dismiss / unread, the 90-day clean-up, the
  index file; the bell's Mark all read / Clear all; poster refine (a Changes line,
  contacts, language, what was not applied); one contact-number list for posters and the footer; SMM Team Lead
  view-only, Half Day leave, one-type poster prompts (2026-10-13); Motu & Patlu walk only where needed; AdGen's Gemini model list and call layer; Gemini API keys on the Flow accounts; attendance → pay salary on one source of truth (2026-10-10); the ad's cast kept from the configuration to the video prompts
  (AI Ads + Cinematic Ads) and Social Media → Attendance (2026-10-08, later); the Invoice Builder and Invoices →
  Settings; Sales → Tech on one `saleId`, Real Owner Face and దసరా (2026-10-08); SMM On hold, renewals and renewal
  money, the Veo 3 dynamic pass, the wardrobe stylist, the SMM client calendar (2026-10-05); earlier SMM, AdGen,
  AI Accounts and Cinematic Ads work.
- Open follow-ups the owner must act on: **SMM Delivery Control** — set `CRON_SECRET` in Vercel and redeploy, create the
  cron-job.org job (GET `https://dreamteamos.vercel.app/api/smm-monitor`, header `x-cron-secret`, every 30 min 09–20
  Asia/Kolkata), publish the `smm_alert_state` rule, build a new APK (the `smm_urgent` channel), try it in Preview (Client plan →
  Switch on a month; Settings → rehearsal, test alert), then go Live with a pilot group (Settings); repair Dhana lakshmi (Social Media → Months to check → Open → Edit setup back to
  6 Sep → 6 Oct, then fix its posts' dates); publish the `invoice_numbers` rule (`docs/firestore-rules.md`); check one
  Payroll month and one Settlement; confirm the behaviour changes — the Accounts Dashboard's revenue is now one pay period
  with no tech delivered value, Settlements pays only ended periods, and recording Flow credits, editing a Flow account,
  changing an issued invoice's date and moving a post between months need a connection; generate a few real ads (a Telugu duo, a Motu & Patlu, a deity festival ad) and
  listen to the voice-overs in Flow — does a duo clip's second line now fit its half at 17–20 words, and is the slower run
  (up to ~2–4 min while the script is improved) acceptable?; make one Real Owner Duo (Male + Female) ad from two real photos — attach owner
  photo 1 then 2 with each frame prompt in ChatGPT / Gemini, then one Flow clip: are both faces their own, on their own
  sides, and does only the speaker's mouth move?; deploy the bell's index (`firebase login`, then
  `firebase deploy --only firestore:indexes`, answering **No** to deleting other indexes) or check it in the console;
  on a phone dismiss one notification by swiping, mark one unread, and watch a toast appear at the bottom;
  in the live bell press Mark all read, then Clear all (and Undo), then reopen
  the app on another device. Does it stay read / empty?; refine one poster ("red and gold colours, headline …", "leave out the
  address") and make its image in Gemini — does the image follow the Changes line?; make one label and one poster image from new prompts with 1 and 2 numbers
  (one a WhatsApp) — is each number printed once, and none invented on a no-number poster?;
  make one poster in Gemini from a new poster prompt (does the one ad type read?);
  apply for, approve and pay one half-day leave; sign in as the Social Media Team Lead and check a month she is not on is
  View only; make one Motu & Patlu ad in Flow from the new prompts (standing clips: do
  heights and clothes hold?); check one real Payroll month against Team Attendance (any paid row now flagged "Now ₹X" was paid a different amount than attendance gives); make one Male & Female Duo ad in Flow from the new prompts; decide the
  two open Cinematic Ads questions (a format changed mid-project resets nothing; a clip's animation prompt has no
  line-by-line speaker — `ai-ads.md` §17.4); replace the 11 dead Gemini keys in Vercel (2026-10-10: `API_KEY_1`, 12,
  18 invalid; 13, 16, 23–28 leaked — §26.3) with working ones from AI Accounts → API keys → Download .env;
  run the ten checks in `docs/firestore-rules.md` with real logins (published 2026-10-18; G2–G11 still open); check the invoice defaults and make one real invoice + PDF;
  move secrets out of source; revoke the Gemini key that was hard-coded in the deleted `src/services/gemini.ts` (still in
  git history); generate a few clips in Flow (Frames to Video)
  from the dynamic-pass prompts — a single presenter, a human duo, Motu & Patlu (watch Patlu's height), a client
  photo — no Veo video has been made from them yet; check a duo ad's styled outfits stay identical in every clip;
  make a Real Owner Face frame (a man and a woman, Traditional attire) and check no bindi or tilak appears, then one
  Flow clip from the template.

---

## 33. AI DEVELOPMENT CONTEXT (read this first)

**What it is.** DTS-OS ("DTS Manager") is the internal operating system of Dream Team Services, an
Indian ad agency. Sales calls leads and sells ads, posters, SMM months and websites. Tech produces
the ads with Gemini-written prompts (visuals made in external tools). The app also runs HR,
attendance, payroll, commission and finance.

**Stack.** React 18 + TS (non-strict) + Vite 5 + Tailwind/shadcn + zustand; Firebase
Auth/Firestore/FCM called **directly from the browser**; 6 Vercel functions in `api/`
(`send-notification`, `order-chat`, `onboarding`, `smm-monitor`, `devos`, `staff-account`); Gemini via `@google/genai` from the browser
with key/model rotation; Cloudinary uploads; WebRTC; Capacitor Android; PWA with self-update.

**Architecture.** Thick client with no CRUD backend. Rules live in `src/utils` (pure, tested) and
`src/services` (Firestore ops with side-effects: notifications, activity logs, mirrors). Realtime
`onSnapshot` everywhere. Free-tier read quota shapes everything: scope queries, keep listeners
session-long, key effects on `uid`. Crons: `api/smm-monitor` (needs `CRON_SECRET`) and `api/devos` (seven a day, runs without it); other
sweeps run when pages open. The **Development OS** is the exception to the thick client: all its writes are the
server's (`api/devos` + the isomorphic engine `src/devos/`; `devos.md`).

**Roles.** `main_admin`, `tech_admin`, `sales_admin`, `accounts_admin`, `tech_team_leader`,
`tech_member`, `sales_member`, plus flags `externalCreator` (ad tool only) and `smmLeader`. Team =
users with the same `createdBy`. Guard is `AppLayout allowedRoles` in `App.tsx`; navigation is in
`utils/roleHelpers.ts`.

**Permissions.** Enforced in the UI plus a few server checks. Firestore rules are coarse; published
2026-10-18 (anonymous access refused; any staff member still writes most collections, G2–G4). Key rules: >10% discount needs sales admin approval (the sale still reaches tech at once); only
tech admin purges orders; members never assign; one promise extension; feedback before upsell;
SMM posting needs client approval; a sale the tech team started can be edited (not its service) but never deleted.

**Entities.** `users`, `leads` (sales embedded in `saleItems[]`, each with a `saleId`), `numberLocks`, `orders` (id
`o_<saleId>` = `o_<leadId>_<ms>`), `work_assignments`, `order_chats`, `clients` (id = phone digits),
`smm_campaigns` (id = order id), `ai_generations`, `cinematic_projects`, `notifications`, HR
(`employee_profiles`, `hr_documents`, `agreements`, `company_settings`, `onboarding_invites`,
`member_credentials`, `public_badges`), pay (`payroll_*`, `salary_*`, `commission_settlements`,
`leave_requests`, `daily_checkins`, `attendance`, `holidays`, `salesCheckins`), AI accounts
(`flow_accounts`, `flow_usage`, `paid_accounts`, and their `*_secrets`, `gemini_api_keys`), invoices (`invoices` with embedded
lines, `invoice_counters`, `invoice_numbers`, `invoice_settings` — §9.22; one engine, `utils/invoiceMath`), the
Development OS (`devos_users/{uid}` + subcollections, `devos_questions` (sealed keys), `devos_config/policy`, boards,
leagues, missions, queue, health — §9.23, server-written only).

**Core pipeline.** `SaleForm` → `services/sales.recordSale` (the sale with its permanent `saleId` + order
`o_<saleId>` in one transaction; then team-only chat + SMM campaign; edits / deletes by `saleId` too) →
`SalesApprovals` verify → `createWorkAssignment` → member `MyWork` → `AIPlatformApp` →
the credit step (`useCreditGate`: the Flow credits the ad used) → `useCompleteWork` (completed) →
`verifyAssignments` (verified → client record). Statuses: order
`unassigned` / `assigned` / `completed` / `verified` / `cancelled` / `deleted`; work `assigned` /
`in_progress` / `completed` / `editing` / `verified`.

**Ad generation.** `AIPlatformApp` → `geminiService.generateAdAssets` (voice note → extract →
verified contact facts (`utils/businessFacts`) → core message → voice-over with repair, quality review
and the scored quality gate (best of three drafts), or a custom script word for word → numbers
as words / `mariyu` in Latin → scene plan → motion plan → frames / VIDEO BOTTOM LABEL / poster → Veo prompts
from the same plan) → `ai_generations`. The cast is the configuration's (2026-10-08): a cast's script gives every
speaker their own line in every clip or the run stops (`dialogueFormat.castIntegrityIssues`), the Veo prompts voice
that structured dialogue, and every step after the run uses the kit's `spec` (`utils/adSpec`), never the live form.
Motion (2026-10-05, dynamic pass): every clip is a real commercial
shot — an action that travels or turns plus ONE camera move that follows it (push-in, side track, lateral
dolly, arc; **never backward** — no walk-back, no pull-out), inside what its frame shows, in a short
five-part Veo prompt that never describes the frame; most clips walk; every pair (Motu & Patlu included)
walks only together, side by side, filmed sideways at one distance; deities never walk; a client photo
gets only a push-in or a still camera; frames are caught mid-movement; never a goodbye wave. Client photos are background
plates, invented people get a cast sheet — dressed by a wardrobe stylist that sees the logo, inside the ordered
attire, never two alike — and the last clip says the verified address (§17.2). A Real Owner Face ad keeps the client's
photographed face (a FACE LOCK in every frame) and its video is only the owner's template, by gender. "Input Final Script" on row 4 rewrites 5 · 6 · 7 from a pasted script (`FinalScriptPanel`). Poster mode → `generatePosterConcepts`. Cinematic Ads (tech admin) is a separate
7-step, project-persisted pipeline. All prompts are in `services/prompts.ts` +
`services/prompts/*`. **`aiadsdts/` is dead; never edit it.**

**AI Accounts.** Flow accounts (1000 credits a month from the creation day, 18 months, 7 / 10 / 12 /
15 credits per 4 / 6 / 8 / 10-second clip, 30 per member by 29 October), the paid ChatGPT / Grok
logins, and the credit entry every video job needs before Mark Complete (§9.21). Members see their
own; the tech admin and team leaders manage all. Each Flow account also carries the Gemini API key made
in it (2026-10-10); only the tech admin sees every key (API keys tab: copy, `.env`, check, in use).

**Conventions.** The AI platform is styled with its own scoped system (`.adgen`,
`components/ai-platform/adgen.css`, dark-only) — use `ag-*` classes there, Tailwind/shadcn
everywhere else. `@/` alias; heavy "why" comments; optional fields for back-compat, no
migrations; deterministic ids + `dedupeKey`; transactions for shared arrays; edit both
duplicated WorkAssign/MemberAssignments pages; verify with `npm run build` + `npx vitest run` +
`npx tsc -p tsconfig.check.json --noEmit` (0 errors); browser checks via a throwaway
harness with a faked Firebase.

**Known limitations.** Secrets in source (TURN) and the Gemini keys in the bundle (the push API takes only staff
tokens since 2026-10-18); plaintext stored passwords; member delete keeps the Auth account; unscoped listeners on admin
pages; lint debt; no priority, comments or scheduler; accounts module basic.

**Rules.** Follow §29 and §30. The context is this core + `.claude/rules/*.md` +
`docs/DEVELOPMENT-HISTORY.md` (§29.21). Update it after every meaningful change (§30 step 8). The code
wins over it.

---

## 34. SESSION & USAGE PROTOCOL (owner's standing rules, 2026-10-03)

Why: on 2026-10-03 the usage panel showed **98% of usage was spent at >150k context** — one long
conversation re-sends everything on every step. The fix is short sessions that hand over in a file.
- **Start:** the SessionStart hook (`.claude/settings.json` → `.claude/hooks/session-start.cjs`) prints
  the repo state and, when it exists, `HANDOFF.md` into the session at startup, resume, `/clear` and
  after compaction. Continue that task first. Read only the files the next step needs (it lists them);
  do not re-read the whole module.
- **A new task:** the owner may type `/dev <numbered list>` (`.claude/skills/dev/SKILL.md`), which puts
  the task under §30. A task typed as plain text follows §30 just the same.
- **Long task:** at a clean stopping point (it builds), when the conversation is getting large or the
  task will clearly outlast it, write/update `HANDOFF.md` (goal + confirmed answers, done, remaining
  in order, gotchas) and tell the owner to start a new chat with: *"Continue the task in HANDOFF.md."*
- **End of every task**, say one of: **"Start a new chat for the next task"** (the default), or
  **"Continue in this chat"** — only when the next step is small and needs what is already loaded.
  When the task is finished: update this file per §30 and delete `HANDOFF.md`.
- **Effort level** (Opus 5.5 default is `medium`, which matches Opus 5 at `high` on coding — source:
  code.claude.com/docs/en/model-config). Use `medium` for small fixes and copy changes, `high` for
  normal features and debugging in this repo, `xhigh` for large cross-module features or a bug `high`
  could not crack, `max` only for the hardest design/debug problems. At the start of a task, say if it
  needs a level different from `high`; the owner switches with `/effort <level>`.
- **Ultracode** (`/effort ultracode`) makes Claude run multi-agent workflows on its own and costs much
  more. Only for big jobs that split into independent parts (whole-codebase audit, a migration across
  many modules). Claude **asks the owner to turn it on**, saying why — never assumes it.
- **Workflows:** the owner allows Claude to start one on its own when it is genuinely needed
  (independent parallel work) — say so in one line first, with a rough size; keep it small.
- `/compact` mid-task when the context grows; `/clear` between unrelated tasks; `/usage` to watch.
- This core is loaded into EVERY session, so keep it short (§29.21). Module detail loads only when
  the module's files are opened (`.claude/rules/`), and history only when it is read. That is why the
  2026-10-04 split cut the context every session starts with from ~50k tokens to ~7k.

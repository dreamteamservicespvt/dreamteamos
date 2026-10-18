# HANDOFF — whole-site audit, fix & verify (started 2026-10-18)

**The owner's request (2026-10-18, "YOUR MISSION … CTO … full autonomy"):**
- Audit the whole DTS-OS website for every real role, in Chrome:
  - desktop 1920 / 1440 / 1366;
  - mobile 390 / 375 / 360.
- Fix root causes, run the regression tests, and push.
- Verify the deploy.
- Write an evidence-based report:
  - A — initial audit;
  - B — changes;
  - C — testing actually done;
  - D — GitHub and deploy;
  - E — remaining issues, each labelled implemented-verified / partially verified / blocked / not implemented.

Earlier the same day the owner asked: "the Dev OS must run with 0% human involvement — if there is time for us then
only we will involve". That is DONE (commit 49d224c).

Follow CLAUDE.md §30. Preserve other sessions' work. Never revert files you did not change.

## UPDATE 2026-10-19 — D-01…D-09 + 2 more DONE, committed `a88759a` + trailer-less trigger `81fa689`

tsc 0, build ✅, full vitest only the pre-existing `smmDeliveryControlUiOct15` failure; checked by hand in Chrome and by the
headless sweep (1920/375 then 1366/360, logs `<S>/appharness/sweep-*.log`, results `audit-<key>-<w>-<w>.json`). Context
updated (people / roles-routes / orders-work, history 2026-10-19, §32). LEFT: the owner pushes (`git push origin main`,
signed in as a GitHub account with access — the stored one is `liveteckplyboards-creator`, 403), then verify the deploy
(below) and write the A–E report; G2/G3 rules remain an owner decision (emulator).

## Git state

Local `main` is AHEAD of origin by 5 commits; NOTHING of today's later work is pushed:

| Commit | What |
|---|---|
| `49d224c` | The Dev OS runs with nobody involved: open, slot-throttled tick; 7 daily Vercel crons; appeals decided by the tick; morning profile self-repair. |
| `31db84f` | Empty deploy trigger (no Claude trailer). |
| `4037758` | Staff-only `/api/send-notification`. Gemini key fragments no longer logged. Dead `services/gemini.ts` (hard-coded key) deleted. |
| `0ae2c2b` | New `api/staff-account` (staff logins created on the server). Rules fixes B1 / B3. Logout removes push rows before sign-out (B2). |

**PUSH IS BLOCKED.** GitHub answered 403, and then Git Credential Manager dropped the credential: Git now asks for a
username. The owner must run `git push origin main` in a terminal and sign in with an account that has access to
`dreamteamservicespvt/dreamteamos`. NEVER enter credentials yourself.

**Before the push, add a trailer-less trigger.** Make the head commit an empty commit WITHOUT the Claude co-author
trailer, e.g. `git commit --allow-empty -m "Deploy: security fixes"`. Vercel Hobby does not build Claude co-authored
heads; the owner approved this trailer-less trigger pattern earlier.

**After the push, verify:**
- `https://dreamteamos.vercel.app/version.json` shows a new `buildId`.
- `POST /api/send-notification` without a token returns 401.
- `POST /api/staff-account` without a token returns 401.
- `GET /api/devos` returns 200 / 202 JSON. It now runs open with no CRON_SECRET, so a GET RUNS A TICK — that's fine,
  it is the normal job.

**`npm run build` on `0ae2c2b` PASSED** (10 min 30 s; log in `<S>/build-0ae2c2b.log`). Full vitest on it: not run yet.

## IN PROGRESS — harness defects D-01…D-09 (UNCOMMITTED, NOT YET BUILT OR TESTED)

The harness sweep finished. Its results are in `<S>/appharness/results/`: `defects.md`, `coverage.md` and
`audit-*.json`.
- **Sweep:** 11 accounts and 234 route visits at 1440 and 390 px.
- **Forbidden routes:** 48 attempts, all refused.
- **Console and layout:** 0 console errors and no overflow, apart from D-07.

A continuation agent was fixing the defects when the chat ended. Its edits are in the working tree, but it has NOT run a
build, vitest or tsc on them, and has not re-checked anything in the harness. Review each diff first: read it, finish it,
test it.

| # | Defect | State |
|---|---|---|
| D-01 | Main admin Dashboard StatCards stuck at 0 (`useAnimatedCounter`) | edited: `components/dashboard/StatCard.tsx` |
| D-02 | Dashboard "Today" figures are all-time | edited: `main-admin/Dashboard.tsx` |
| D-03 | Main admin Accounts net profit differs from P&L | edited: `main-admin/Accounts.tsx`, `utils/profitAnalytics.ts` |
| D-04 | External creators counted as staff | edited: `utils/roleHelpers.ts`, `accounts-admin/SalaryManagement.tsx`, `accounts-admin/Dashboard.tsx` |
| D-05 | Inconsistent "revenue" — see the decision below | edited: `utils/salesRevenue.ts`, NEW `utils/revenueReport.ts`, and 6 pages (below) |
| D-06 | Work Assign mislabels sold ads as standalone | edited: `utils/adPipeline.ts`, `test/adPipeline.test.ts` |
| D-07 | HR document-type filter overflows at 390 px | NOT started (it was reading the filter row) |
| D-08 | A forbidden route lands on the login form while signed in | NOT started |
| D-09 | Breadcrumbs show URL slugs (`Topbar.tsx:195-201`) | NOT started |

The six D-05 pages are:
- `main-admin/RevenueOverview.tsx` and `accounts-admin/RevenueSummary.tsx`, both rewritten whole on the new util;
- `main-admin/SalesDepartment.tsx`;
- `sales-admin/Dashboard.tsx`;
- `main-admin/Dashboard.tsx`;
- `accounts-admin/Dashboard.tsx`.

**D-05 decision (owner-delegated, 2026-10-18).**
- "Revenue" everywhere means APPROVED (verified) sales only.
- The value is the sale's amount. The date is the sale's own date, as an India day.
- Use ONE shared util; never write a second formula.
- Pending sales are never added to a revenue total or chart. Show them separately as "Awaiting approval: ₹X (n sales)".
- Money actually collected stays its own figure where a screen already shows it.
- The Accounts Dashboard's 7-day chart covers the last 7 CALENDAR days, including days with 0 sales.
- Record the decision in `people.md` (§24 business rules and §9.16) and in the history entry.
- New unit tests are needed for `revenueReport.ts` and the `salesRevenue.ts` changes. None have been written yet.

## Owner actions (put them in the final report, in this order)

1. Push, as above.
2. **URGENT — publish the rules in `docs/firestore-rules.md`** in the Firebase console (Firestore → Rules). Production
   allows UNAUTHENTICATED reads of every collection. Probed with a field mask (names only) — all listed:
   - `employee_profiles`, `member_credentials` (plaintext passwords), `users`, `leads`;
   - `payroll_lines`, `orders`, `flow_account_secrets`, `devos_users`, `notifications`.
   The rules were audited, and B1 / B3 are already fixed in the doc.
3. After the deploy, switch OFF public sign-up: Firebase → Authentication → Settings → User actions → untick "Enable
   create (sign-up)". Admin account creation now goes through `api/staff-account`. Check that Anonymous sign-in is off.
4. Revoke the Gemini key that was hard-coded in the deleted `src/services/gemini.ts`. It is still in git history.
5. Optional: `CRON_SECRET` (the SMM checker needs it; the Dev OS does not).

## Rules audit — still open after publishing (needs a TESTED rules change)

These are not fixed. The full text is in the 2026-10-18 history entries.
- **G2 (critical):** any staff member can write `users/*`, including their own `role`. Every `role()` check trusts it.
  Fix: protect `role` / `isActive` / `createdBy` / `smmLeader` / `externalCreator` / salary fields — admin-only.
  Watch for the seed admin creation at `Login.tsx:64`.
- **G3:** `employee_profiles`, `member_credentials`, `hr_documents`, `company_settings`, `hr_counters`,
  `onboarding_invites` and `cinematic_projects` have their own rules, but the catch-all ALSO matches them, so any staff
  member can read and write them. Fix: add them to the catch-all exclusion. Test each HR screen first: team leaders
  send agreements, and `accounts_admin` reads profiles.
- **G4:** the catch-all leaves these open to all staff: `employee_bank`, `payroll_*`, `salary_receipts`,
  `commission_settlements`, `settlement_requests`, `attendance`, `daily_checkins`, `leave_requests`, `audit_logs`,
  `notifications`, `fcmTokens`, `leads`, `clients`, `orders`.
- **Guest rules:**
  - G5: `calls` — a guest can read every call, inject ICE candidates and ring anyone.
  - G6: a guest can forge message fields and edit old messages.
  - G7: guest room fields are not value-checked.
  - G9: guests can read `company_settings`, including the signatures and stamp.
- **G8:** `public_badges` can be listed by anyone and forged by any staff member. Fix:
  `get: true; list: isStaff; write: isAdmin || own`.
- **G10, G11:** loose rules on the AI accounts, SMM month deletes, `app_settings` and `invoice_numbers`.
- **B4 (low):** the candidate's letterhead can't read `company_settings` when signed out. Fix: return the letterhead
  fields from `api/onboarding` `open`.
- **B6 / B7 / B8 (depend on stored data or Firestore limits):** batches of up to 400 writes on `gemini_api_keys` with a
  `get()` in the rule; old chat rooms without `status`; old `watchers` lists.
- **Testing these needs the Firestore emulator:** Java + firebase-tools. Neither is installed, and installing them is a
  download, so ask the owner first. The audit's scanner is `<scratchpad>/rules-audit/inventory.cjs` and its output
  `inventory.txt` (664 accesses by file:line).

## Browser testing (the core of the mission — not finished)

- A background agent was building a FULL-APP harness in `<S>/appharness`, where
  `S = C:\Users\chala\AppData\Local\Temp\claude\c--Users-chala-Desktop-DTS-OS\3c543025-a8fd-4094-ab9b-02829b3bc0da\scratchpad`.
  - It mounts the REAL `src/App.tsx`: real login, guards and every page.
  - Fakes: `firebase/auth`, `app` and `messaging`; `memoryFirestore`; the Cloudinary uploader; `/api/*` stubs; Gemini
    blocked.
  - Seeded accounts: `<role>@dts.test` / `Test@1234`.
  - Vite runs on :8282 and Chrome CDP on :9444.
  - It is sweeping every role × route at 1440 and 390 px. Its results go to `<S>/appharness/results/defects.md` and
    `coverage.md`.
  - The agent reports to the OLD chat. In a new chat, read those files from disk. If they are missing, check whether the
    harness exists and re-run it: start Vite from the repo with `npx vite --config <S>/appharness/vite.config.mjs`,
    then run the drivers in `<S>/appharness/drivers`. Stop Vite and Chrome by port when done.
- The owner's Chrome (the claude-in-chrome extension) is NOT signed in to production. Production checks are limited to
  public pages (`/login`, `/verify/:uid`, `/c/:chatId`, `/join/:id`). Screenshots through the extension timed out
  under load.
- Live login page: DOMContentLoaded ~1.25 s, but the load event had not fired after 12 s. `index.html` has one
  render-blocking Google Fonts stylesheet with 5 families; Space Grotesk and Inter are used only by the AI studio.
  Measure before and after; do not guess.

## Machine

Very low on memory: other projects' sessions (School-OS) run several tsc/vitest processes, ~5 GB, with 1.5 GB free.
- Run heavy jobs ONE at a time: tsc ~5–10 min, build ~11 min.
- Never kill processes you did not start.
- Journey tests can time out at 5 s under load. The Dev OS engine file now has `testTimeout` 30 s.

## Next steps (in order)

1. Review and finish the D-01 to D-06 edits in the working tree (see IN PROGRESS above). Add unit tests. Then fix
   D-07, D-08 and D-09.
2. Run tsc, then `npm run build`, then the full `npx vitest run`, ONE at a time. The known pre-existing failure is
   `smmDeliveryControlUiOct15`.
3. Re-verify every D-fix in the harness, where `S` is the scratchpad path given above:
   - Start Vite from the repo: `npx vite --config <S>/appharness/vite.config.mjs`. It serves on :8282.
   - Drive it with Chrome over CDP on :9444, using the drivers in `<S>/appharness/drivers` (`counter.mjs` checks D-01).
   - Stop Vite and Chrome by port when you are done.
4. Commit the D-fixes, with the context updates, in a commit of their own. Stage only the files you changed. Never stage
   the MSRS PDF or HANDOFF.md.
5. Workflow passes per module, as far as the fakes allow:
   - sale → order → assign → work → verify;
   - SMM month;
   - HR / leave / payroll;
   - invoices;
   - chat;
   - Dev OS.
   Also mobile at 375 / 360 and desktop at 1920 / 1366.
6. G2 / G3 rules hardening: only with the emulator, or as a documented owner decision.
7. Lint baseline (599 problems, 2026-09-22). Full regression. Update the context (module files + history).
8. Push via the owner, verify the live deploy, then write the final report (A–E). Delete this file when the mission is
   done.

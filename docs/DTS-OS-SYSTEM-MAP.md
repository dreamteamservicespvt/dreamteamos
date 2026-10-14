# DTS-OS — Repository System Map

Last inspected: 2026-10-14
Repository: https://github.com/dreamteamservicespvt/dreamteamos
Default branch: `main`
Inspected tree commit: `dc4313e67f6a93852df46d6941213a13e992c6e1`
Purpose: Maintain a concise, reliable map of the live DTS-OS repository so future implementation tasks can begin with the correct files, data flow, role boundaries and verification requirements.

> This document is a navigation map, not a claim that every source line, runtime deployment, production database setting or UI pixel has been exhaustively verified. The checked-out code and deployed rules always outrank this document. On every task, confirm the current branch/commit and inspect the relevant module before editing.

## Product overview

DTS-OS (shown as “DTS Manager — Dream Team Services”; Android app name “Dream Team”) is a React SPA / PWA / Android Capacitor shell for a digital-marketing and ad-production agency. It connects lead distribution, sales, approvals, orders, work assignment, Gemini-assisted prompt generation, external media-generation workflows, delivery, customer chat/reviews, SMM monthly retainers, HR, attendance/leave/payroll, settlements, AI account/credit tracking, invoices, analytics and company oversight.

## Repository snapshot

The recursive Git tree at the inspected commit contained 1,019 files, including 858 files under `src/`, 234 test/spec files under `src/test/`, 12 module context files under `.claude/rules/`, 3 Vercel API functions under `api/`, an Android Capacitor project under `android/`, a separate `aiadsdts/` directory, and architecture/docs under `docs/`.

- **Live app:** `src/`.
- **`aiadsdts/`:** documented in existing `docs/AI-MEMORY.md` as an unreferenced standalone copy; do not change it when a live app change is intended unless a fresh import/reference audit proves otherwise.
- **Application entry:** `src/main.tsx` → `src/App.tsx`.
- **Routing:** `src/App.tsx`, route components lazy-loaded; shared shell in `src/components/layout/AppLayout.tsx`.
- **Main project guide:** `CLAUDE.md`; module context map links to `.claude/rules/*.md`.
- **Change workflow:** `.claude/skills/dev/SKILL.md` and CLAUDE.md §29–§30.
- **Development history:** `docs/DEVELOPMENT-HISTORY.md`. `docs/AI-MEMORY.md` is historical/read-only per the repo’s development rules; do not append new development history there.
- **Canonical package tooling:** npm / `package-lock.json`; scripts include `npm run build`, `npm run lint`, `npm test`; test config is `vitest.config.ts`; TS check target referenced by the project protocol is `npx tsc -p tsconfig.check.json --noEmit`.
- **Frontend:** React 18, TypeScript, Vite, React Router, Tailwind, shadcn/Radix, Lucide, Framer Motion, Zustand, Firebase JS SDK, Recharts, html2canvas/jsPDF/docx.
- **Data/auth:** Firebase Auth + Cloud Firestore, real-time listeners via `onSnapshot`, IndexedDB persistent cache with in-memory fallback.
- **Serverless API:** Vercel Node functions in `api/`, using Firebase Admin.
- **AI:** Gemini via `@google/genai`; the app generates scripts/prompts, while final image/video creation is generally performed in external tools.
- **Uploads:** Cloudinary.
- **Push/PWA/mobile:** Firebase Cloud Messaging, `public/firebase-messaging-sw.js`, PWA manifests, Capacitor Android plugins, self-update via `/version.json`.
- **CI/runtime caveat:** Vercel rewrites SPA routes to `/`; code presence does not prove production deployment settings or live Firestore rules are current.

## Module context files (read before touching a module)

- `.claude/rules/architecture.md` — app purpose, system architecture, component/UI structure, stack, general flows, testing and design conventions.
- `.claude/rules/backend-security.md` — API functions, auth/session, notification transport, integrations, environment/security risks.
- `.claude/rules/roles-routes.md` — role matrix, navigation, routes and permission helpers.
- `.claude/rules/data-model.md` — Firestore collections, fields, relationships and indexes/statuses.
- `.claude/rules/sales.md` — leads, phone-number ownership/locks, sales, verification, payment, sale edits/deletes, client/upsell workflows.
- `.claude/rules/orders-work.md` — orders queue, assignment lifecycle, member work, verification, Drive upload declaration.
- `.claude/rules/smm.md` — monthly Social Media Management campaigns, package/setup/renewal, content items, approvals, assignment, budget ledger, reminders, roles.
- `.claude/rules/ai-ads.md` — AI Ads Platform, poster/video prompts, character/cast logic, Gemini pipeline, Cinematic Ads.
- `.claude/rules/people.md` — attendance/check-in/out, leave, payroll/commission, HR, finance.
- `.claude/rules/ai-accounts.md` — Flow and paid accounts, credits/usage ledger, Gemini API key collection.
- `.claude/rules/invoices.md` — invoice builder, calculations, numbering, pagination/PDF/print, permissions.
- `.claude/rules/chat.md` — client chat/calls, team chat, meetings and monitoring.

## Architecture / data flow

### General sales-to-delivery path
`leads.saleItems[]` (sale entries carry stable `saleId`) → transactional `services/sales.ts` create/edit/delete handling → `orders/o_<saleId>` → `services/workAssign.ts` assignment → `work_assignments` → tech member My Work / AI prompt kit and external generation → hand-in/Drive declaration → tech verification → client record, chat/review and post-sale follow-up. Reuse service-layer functions rather than adding independent competing Firestore writes.

### Authentication / roles
Seven core roles in `src/types/index.ts`: `main_admin`, `tech_admin`, `sales_admin`, `accounts_admin`, `tech_team_leader`, `tech_member`, `sales_member`. Users stored in `users/{uid}`; team membership is generally inferred from `createdBy`. Additive flags include `externalCreator` and `smmLeader`; other module access may be governed by company settings (e.g. invoice team-leader switch). Inspect `App.tsx`, `utils/roleHelpers.ts`, `AppLayout.tsx`, module-specific access helpers, services and Firestore rules together. A UI/route guard is not a security boundary by itself.

### Database
Firestore; TypeScript interfaces under `src/types/` act as data shapes. There is no conventional schema/migration system. `docs/data-model.md` equivalent is `.claude/rules/data-model.md`. Existing docs indicate composite indexes may live in Firebase Console, not source control; production configuration needs verification. Read `docs/firestore-rules.md` and relevant module rules before security changes. Repo documentation marks production Firestore rule publication as NOT CONFIRMED, so never assert that committed rules equal deployed rules without checking.

### Notifications
Client service: `src/services/notifications.ts`; hooks: `src/hooks/useNotifications.ts`, `useNotificationTap.ts`; routing helper `src/utils/notificationRouting.ts`; popup `src/components/layout/UpdatePopup.tsx`; app shell / push registration `src/components/layout/AppLayout.tsx`; FCM service worker `public/firebase-messaging-sw.js`; serverless sender `api/send-notification.ts`. Notifications can have deterministic `dedupeKey`. Existing security notes in `.claude/rules/backend-security.md` say the notification endpoint previously lacked authentication: verify current source and harden before relying on it for trusted server-triggered escalation.

### SMM
Main screens: `src/pages/shared/SocialMedia.tsx`, `SmmCampaignPage.tsx`; sub-UI under `src/components/smm/`; hooks `useSmmCampaigns.ts`, `useSmmClientMonths.ts`; types `src/types/smm.ts`; service layer `src/services/smm.ts`, `smmSetup.ts`, `smmAssign.ts`, `smmTeam.ts`, `smmTemplates.ts`; pure rules `src/utils/smmPlan.ts`, `smmPricing.ts`, `smmPackage.ts`, `smmGlance.ts`, `smmReminders.ts`, `smmDashboard.ts`, `smmCalendar.ts`, `smmAttendance.ts`.
- A client month is a campaign document in `smm_campaigns`; sold campaigns generally key to an order id, no-sale historic months can use another id.
- Content items represent Posters, AI Ads, and Real videos. Item statuses include planned/in-progress/waiting for approval/changes requested/approved/scheduled/posted. Posting requires recorded approval except documented history-month treatment.
- `mutateCampaign` uses transaction-based item merging; order progress is derived/synced from campaign plan.
- Monthly setup uses `services/smmSetup.ts`; assignment path should be `services/smmAssign.assignSmmMonth`; renewal chains months without overwriting the previous month.
- `utils/smmReminders.ts` computes due/overdue items, approval follow-up, budget alerts and renewal nudges.
- Current documented reminder implementation includes on-open sweeps and check-in/check-out surfaces; this is not equivalent to an always-running server scheduler. To provide dependable proactive alerts, inspect hosting constraints, create an authenticated/server-owned scheduled evaluation, persist deduplicated alert events and deliver through the existing notification plumbing.
- `smmLeader` is a hybrid view/own-assignment permission. Check current `smm.md`, `roles-routes.md`, `services/smm.ts` and deployed Firestore rule status together before changes.
- Current repo has many targeted SMM tests: search `src/test/smm*.test.ts(x)`. Test renewal/history, setup, permissions, schedule status, alerts, realtime item mutations and regression paths.

### AI Ads / Cinematic Ads
Live UI `src/components/ai-platform/`, entry `src/pages/tech-member/CreateAd.tsx`, shared tools `src/pages/shared/Tools.tsx`. Main orchestrator `src/services/geminiService.ts`; prompt modules `src/services/prompts.ts` and `src/services/prompts/`; types `src/types/aiPlatform.ts`; configuration/pipeline helpers in `src/utils/adPipeline.ts`, `adSpec.ts`, `assignmentFormSpec.ts`, `businessFacts.ts`, `castSheet.ts`, `castWardrobe.ts`, `dialogueFormat.ts`, `scriptQa.ts`, `finalScript.ts`, `scenePlan.ts`, `spokenAddress.ts`, `spokenNumbers.ts`, `posterAdType.ts`, `posterConcepts.ts`, `veoRefine.ts`, `voiceOverFormat.ts`. Generated kits are stored in `ai_generations`. Prompt output is copy/paste payload for external generation services, not a hosted image/video rendering service. Inspect `.claude/rules/ai-ads.md` and the relevant tests before any character/prompt change. `aiadsdts/` is not assumed live.

### Cinematic Ads
Separate multi-step workflow: `src/pages/tech-admin/CinematicAds.tsx`, `src/components/cinematic-ads/`, `src/store/cinematicAdsStore.ts`, `src/services/cinematicAdsService.ts`, `src/services/cinematicProjects.ts`, `src/types/cinematicAds.ts`, `src/utils/cinematicAds.ts`. Do not conflate it with the normal AI Ads Platform.

### Attendance / leave / payroll / HR
- Attendance services `src/services/techAttendance.ts`, `salesCheckin.ts`; UI `src/components/attendance/`, `src/pages/shared/TeamAttendance.tsx`.
- Leave `src/services/leave.ts`, `src/components/payroll/LeavePanel.tsx`, `src/utils/leaveAllowance.ts`.
- Salary calculation engine `src/utils/payrollEngine.ts` (pure/deterministic); payroll services `src/services/payroll.ts`, `payrollRun.ts`; hooks `useMonthPayroll.ts`, `useSalaryMonth.ts`, `usePayrollConfig.ts`.
- HR documents/onboarding: `services/hr.ts`, `hrDocuments.ts`, `onboarding.ts`, `onboardingGuest.ts`; API `api/onboarding.ts`; shared definitions in `types/hr.ts`, `types/onboarding.ts`.
- Reconcile all figures against the source engine/attendance records; do not add a parallel calculation path.

### Invoice Builder
Shared routes/pages `/invoices`, `/invoices/:invoiceId`, `/invoices/settings` under `src/pages/shared/Invoice*.tsx`; components under `src/components/invoice/`; type `src/types/invoice.ts`; math engine `src/utils/invoiceMath.ts`; drafts/validation `invoiceDraft.ts`; page layout `invoiceLayout.ts`; number formatting `invoiceNumber.ts`; export `invoicePdf.ts`; service `src/services/invoices.ts`; access `src/utils/invoiceAccess.ts`. Invoice numbers use FY sequence registries; don't compute totals differently in UI vs PDF; inspect `.claude/rules/invoices.md`.

### AI account tracking
`src/pages/shared/AiAccounts.tsx`, `src/pages/tech-member/MyAiAccounts.tsx`, `src/services/aiAccounts.ts`, `src/hooks/useAiAccounts.ts`, `src/utils/flowCredits.ts`, `src/utils/geminiKeys.ts`, `src/types/aiAccounts.ts`. Collections include Flow accounts, usage ledger, paid accounts and separate account-secret collections. Avoid placing secrets in ordinary list docs/logs; inspect role permissions and Firestore rules before credential changes.

### Client and team communications
Client order chat: `src/pages/client/ClientChat.tsx`, `src/components/order-chat/`, `services/orderChat.ts`, `orderChatGuest.ts`, `api/order-chat.ts`; team chat/calls/meetings: `src/components/chat/`, `src/pages/shared/Chat.tsx`, `Meeting.tsx`, `AdminChatMonitor.tsx`, `services/webrtcConfig.ts`, `services/audio-route.ts`.

### Sales and work services
- Leads / number assignment: `src/services/numberLock.ts`, `scheduleRelease.ts`, `duplicateLeads.ts`; pages under `src/pages/sales-admin/`, `src/pages/sales-member/`; shared sale form `src/components/sales/SaleForm.tsx`.
- Sales writes: `src/services/sales.ts` and `utils/saleIdentity.ts`, transactional stable `saleId` design.
- Work assignment / verification: `src/services/workAssign.ts`, `workReassign.ts`, `workVerify.ts`, `orders.ts`, `workDrive.ts`; pages under tech-admin/team-leader/tech-member; similar Work Assign pages may need parallel edits where still duplicated.

## UI pixel-level work
No repository map can replace inspecting the real component and rendered page. For UI tasks:
1. Identify the route and its role-specific experience.
2. Read the relevant module guide, route guard, UI component, styles/tokens and nearby tests.
3. Check existing screenshots or reproduce at representative desktop/tablet/mobile sizes.
4. Trace UI fields into persisted shapes/services and back into realtime rendering.
5. Check empty/loading/error/offline/long-text/accessibility states, not only ideal state.
6. Use real browser verification when available; run test/build/typecheck. Don't claim pixel-perfect verification without rendered comparison.

## Permanent change protocol (from the repo)
1. Restate desired behavior and edge cases.
2. Read HANDOFF.md if present and the relevant module guide(s).
3. Trace actual data flow and confirm root cause; do not patch symptoms.
4. Plan concise root-cause fix and regression scope.
5. Implement using existing service/helper conventions.
6. Test focused cases, real browser for UI, then run `npm run build`, `npx vitest run`, `npx tsc -p tsconfig.check.json --noEmit`; explain anything that could not be tested (Firebase/Gemini/live deployment).
7. Update the affected module rules, data model / roles rules as applicable, CLAUDE.md project state, and prepend a dated entry in `docs/DEVELOPMENT-HISTORY.md`.
8. Report exact files, tests, browser steps, DB/API changes, known limitations and unimplemented suggestions.

## Known caution flags to verify rather than assume
- Production Firestore rules publication/current state is marked NOT CONFIRMED in repo context.
- The notification serverless endpoint had documented missing auth in the existing security guide; verify and address before server-driven alerts.
- No scheduler/background worker was documented in the architecture; on-open sweeps are not guaranteed continuous monitoring.
- Composite Firestore indexes may be console-managed and not versioned in the repository.
- Source comments and context docs can be stale; current code wins.
- Do not store credential values, secrets, customer PII, or full production data in this map.

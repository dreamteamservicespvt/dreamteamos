---
paths:
  - "src/App.tsx"
  - "src/utils/roleHelpers.ts"
  - "src/components/layout/**"
  - "src/components/team/**"
  - "src/components/onboarding/**"
  - "src/components/{EditMemberModal,MemberPasswordModal,MemberAvatar,ProfilePhotoUpload}.tsx"
  - "src/pages/*/MyTeam.tsx"
  - "src/pages/main-admin/TeamManagement.tsx"
  - "src/pages/shared/MemberProfileDetail.tsx"
  - "src/pages/tech-admin/MemberHistory.tsx"
  - "src/pages/sales-admin/MemberSalesHistory.tsx"
  - "src/pages/*/Settings.tsx"
  - "src/pages/Index.tsx"
  - "src/pages/PlaceholderPage.tsx"
  - "src/pages/NotFound.tsx"
  - "docs/firestore-rules*.md"
---

# Roles, permissions, pages & routes, team management — DTS-OS module context

> Part of the project context (CLAUDE.md → Context map). Claude Code loads this file automatically when a
> file matching the `paths:` above is read or edited. Section numbers are CLAUDE.md's originals, so a
> reference such as "§17.2" still points here. Keep it current per CLAUDE.md §30 step 8; the source code wins.

## 7. USER ROLES

`UserRole` (`src/types/index.ts`): `main_admin | tech_admin | sales_admin | accounts_admin |
tech_member | sales_member | tech_team_leader`. Stored as `users/{uid}.role`. The route guard
(`AppLayout`) and navigation (`roleHelpers.NAV`) are keyed on it.

**Teams are implicit.** There is no `teams` collection. A team is "all users whose `createdBy`
equals the admin's uid". A team leader finds their team through their own `createdBy` (their
tech admin). Filters like `u.createdBy === teamAdminUid` recur across pages.

| Role (label) | Purpose | Created by | Lands on | Can do (implemented) | Cannot / restricted |
|---|---|---|---|---|---|
| `main_admin` (Main Admin) | Company owner / overview | Seed account auto-created on first login (hard-coded email in `Login.tsx`) | `/main-admin/dashboard` | Create tech/sales/accounts **admins**; activate, deactivate, delete any user; reset password email; view stored credentials; company-wide dashboards (revenue, tech, sales, accounts, P&L, sessions); clients (manage profiles, import); SMM overseer | No access to `/tech-admin/*`, `/sales-admin/*`, etc. (route guard). Several helpers grant main_admin powers (feedback, bulk slots, promise extension) that are only reachable where main_admin has a route |
| `tech_admin` (Tech Admin, "CTO" signatory) | Runs the tech department | main_admin | `/tech-admin/dashboard` | Create tech_member / tech_team_leader (quick add or hiring invite); toggle `externalCreator`, `smmLeader`, employment type; Orders queue incl. **purge**; assign, unassign, reassign, verify work, send back for edits; work reports; attendance overrides, holidays, leave approvals; tech payroll; HR centre (issue/delete documents); Drive folder URLs; training; Tools (AI platform, script checker, generation history); **Cinematic Ads**; **AI Accounts** (every Flow and paid account, credits, settings); chat monitor; clients import; SMM overseer | Cannot record client feedback (read-only by design) |
| `sales_admin` (Sales Admin, "CEO" signatory) | Runs the sales department | main_admin | `/sales-admin/leaderboard` | Create sales_member; distribute numbers (Leads Management, per-member assign, schedule pools); **verify or reject sales and approve over-10% discounts**; resolve duplicate-sale disputes and frozen numbers; client lookup; settlements (commission payouts); sales payroll; attendance; analytics; training and scripts; HR centre; record client feedback; manage client profiles; assign review tasks; chat monitor; SMM overseer | No access to the tech Orders queue or Work Assign |
| `accounts_admin` (Accounts Admin) | Finance bookkeeping | main_admin | `/accounts/dashboard` | Accounts dashboard; revenue summary; daily expenses CRUD; salary management (edit `users.salary`, `salary_receipts`) | No `/smm`, no chat, no profile page (`getProfileRoute` → "") |
| `tech_team_leader` (Tech Team Leader) | Supervises a tech team under a tech admin | tech_admin | `/team-leader/work-assign` | Orders queue (remove/restore, **not purge**); Work Assign; unassign/reassign; verify / send back; work reports; attendance and leave; HR centre (send agreements, **cannot delete** documents); activity history; Tools; **AI Accounts** (same as the tech admin); own profile/HR docs; SMM overseer; extend promises | No pricing UI on their Work Assign page; no payroll route; no dashboard |
| `tech_member` (Tech Member) | Produces ads | tech_admin (or hiring link) | `/tech/dashboard` | Daily check-in/out (mandatory prompt); My Work (open job with access code, AI platform, submit, undo completion); Recent Ads; analytics; salary dashboard; SMM months they are on (worked from Social Media — their month job opens from the month's page, not My Work); bulk video slots assigned to them; extend promise on own job; team chat and meetings; profile, KYC, documents; **My AI Accounts** (own Flow accounts and credits; a video job asks for its Flow credits before it is marked complete) | Cannot assign work, including to themselves |
| `sales_member` (Sales Executive) | Calls leads and sells | sales_admin (or hiring link) | `/sales/dashboard` | My Leads (claim numbers, call statuses, record/edit/delete sales, freeze sold numbers 1–7 days, dispute proof); client chats for own orders; My Clients (feedback, upsell); review tasks; performance; salary and settlements (request payout); leaderboard (**month view only**); scripts, training; activity history; SMM months they sold, and their renewals and renewal money ("My Social Media" card) | Discounts over 10% need sales admin approval (the sale still reaches the tech side at once, since 2026-10-05); a sale the tech team has started can be edited (not its service; the job follows and the tech side gets a popup) but never deleted (2026-10-08) |

**Flags (additive, not roles):**
- `externalCreator: true` on a `tech_member`: navigation is only **Create Ad** + **My Profile**.
  `AppLayout` redirects any other path to `/tech/create`. Excluded from team lists, attendance,
  payroll and reports. Their `ai_generations` are visible to the tech admin (`AdsHistoryModal`).
  Set by tech admin in My Team.
- `smmLeader: true` — shown as **Social Media Team Lead** (2026-10-01): sees every SMM campaign, may
  set up, assign and **delete** months (`utils/smmPlan.isSmmOverseer`, `canDeleteSmmCampaign`), since
  2026-10-05 **add a month that had no sale** (`canAddNoSaleMonth` — but never record a sale,
  `canRecordSmmSaleForSeller`), is notified when a month is sold (`smm_new_month`), and since 2026-10-08 sees
  **Social Media → Attendance** — the days of the people on the months running now, view only
  (`utils/smmAttendance.canSeeSmmAttendance`; no new route). Keeps their normal role. Appointed by the tech admin
  or main admin in the Team Lead panel at the top of `/smm` (`SmmTeamLeadPanel`, `canAppointSmmLead`)
  or the megaphone toggle in My Team; both go through `services/smm.setSmmTeamLead` (notifies them).
- **Invoice Builder switch** (2026-10-08) — not a per-user flag: ONE company-wide setting,
  `invoice_settings/access.teamLeadersEnabled`, decides whether Tech Team Leaders may use `/invoices`. Set by
  the tech admin or main admin in Settings → Invoice Builder (`InvoiceAccessCard`). See `invoices.md` §9.22.

**Non-account actors:**
- **Client (guest)**: opens `/c/:chatId`. `api/order-chat` mints a custom token with an
  `orderChat` claim scoped to that one room, and only after the room is `clientReady`
  (i.e. assigned).
- **Candidate**: opens `/join/:inviteId`, enters a 4-digit code, signs the offer then the joining
  letter, and receives a login. All steps go through `api/onboarding`.
- **Public verifier**: opens `/verify/:uid` and reads `public_badges/{uid}` (card-face data only).

**Deactivation:** `users.isActive === false` blocks login (`Login.tsx`) and signs out a live
session (`useAuth` onSnapshot, confirmed against the server). A strict `=== false` check keeps
legacy users without the field active.

## 8. PERMISSIONS

### 8.1 Where permissions are enforced
1. **Route guard (frontend only).** `AppLayout allowedRoles` in `App.tsx`. A wrong role is
   `<Navigate to="/login">` (it does not sign out). External creators are confined to
   `EXTERNAL_CREATOR_ROUTES`.
2. **In-page and helper checks (frontend only).** For example `canPurgeOrders`,
   `canAssignBulkVideos`, `canCompleteBulkVideo`, `canEditProgress`, `canExtendPromise`,
   `canRecordFeedback`, `isSmmOverseer`/`canEditCampaign`, `Clients.canManage`/`canImport`,
   `Payroll.canManage`, `HrCenter.isAdmin → canDelete`, `Leaderboard.isAdmin` (career view).
3. **Server-side checks.** `api/order-chat.ts` (guest token claim, staff must be a room
   participant, CORS allow-list), `api/onboarding.ts` (4-digit code, 5 tries / 15 min lockout).
   `api/send-notification.ts` has **no authentication** (§26).
4. **Firestore rules**, documented in `docs/firestore-rules.md`: helpers `isStaff` (signed-in and
   no `orderChat` claim), `isAdmin` (main/tech/sales admin), `isManager` (+ team leader). Special
   rules cover `employee_profiles`, `public_badges`, `member_credentials`, `hr_documents`,
   `company_settings`, `hr_counters`, `onboarding_invites`, `cinematic_projects`, `order_chats`
   (+messages), `calls`, the AI-account collections, and (2026-10-08) `invoices`, `invoice_counters`,
   `invoice_numbers`, `invoice_settings` (`canUseInvoices`, `invoiceAdmin`; kept out of the catch-all).
   Everything else falls to a catch-all: **any staff may read and write**.
   Publication status: **[NOT CONFIRMED]**. It was verified as *not published* on 2026-08-03.

> Consequence: almost every "who can do what" below is a UI rule. A signed-in staff account can
> technically write most collections directly. Do not describe a UI rule as a security boundary.

### 8.2 Permission matrix (UI-enforced unless noted)

| Action | main | tech_admin | team_leader | tech_member | sales_admin | sales_member | accounts |
|---|---|---|---|---|---|---|---|
| Create admin accounts | ✅ | | | | | | |
| Create tech members / leaders | | ✅ | | | | | |
| Create sales members | | | | | ✅ | | |
| Send hiring invite (`OnboardInviteModal`) | | ✅ | | | ✅ | | |
| Deactivate / delete users | ✅ all | ✅ own team | | | ✅ own team | | |
| View stored passwords (`member_credentials`) | ✅ | ✅ | | | ✅ | | |
| Distribute numbers / schedule pools | | | | | ✅ | claim own | |
| Record / edit own sale (also after work starts, 2026-10-08 — not its service) | | | | | | ✅ | |
| Delete a sale — only while nobody on the tech side has started it (2026-10-08) | | | | | ✅ | ✅ own | |
| `sale_edited` popup when a started sale is edited | | ✅ | ✅ | ✅ job holder | | | |
| Verify / reject sale, approve >10% discount | | | | | ✅ | | |
| See Orders queue | | ✅ | ✅ | | | own sold orders | |
| Remove / restore orders | | ✅ | ✅ | | | | |
| Purge removed orders | | ✅ (`canPurgeOrders`) | | | | | |
| Assign / unassign / reassign work | | ✅ | ✅ | | | | |
| Open job + AI generator for a job | | | | ✅ assignee | | | |
| Use AI generator freely | | ✅ (Tools) | ✅ (Tools) | ext. creator only | | | |
| Complete (submit) work | | | | ✅ assignee | | | |
| Verify / send back for edits | | ✅ | ✅ | | | | |
| Extend delivery promise (once) | ✅ | ✅ | ✅ | own job | | own sale | |
| Record client feedback | ✅ | read-only | read-only | | ✅ | ✅ own sale | |
| Assign bulk video slots | ✅ | ✅ | ✅ | | | | |
| Tick bulk slot done | ✅ | ✅ | ✅ | own slot | | | |
| Edit order progress counters (non-derived) | ✅ | ✅ | ✅ | track holder | | | |
| See all SMM months | ✅ | ✅ | ✅ | smmLeader | ✅ | | |
| Add SMM sale for a salesperson (`canRecordSmmSaleForSeller`) | ✅ | ✅ | ✅ | | | | |
| Add an SMM month that had no sale — not counted (`canAddNoSaleMonth`) | ✅ | ✅ | ✅ | smmLeader (2026-10-05) | | sees it, renews it | |
| Set up / assign / edit an SMM month (`canSetUpSmm`) | ✅ | ✅ | ✅ | smmLeader | | | |
| Renew an SMM month — as a sale (`canRenewSmm`) | | | | | | ✅ own month | |
| Social Media → Money: company renewals in ₹ (`canSeeSmmMoney`, 2026-10-05) | ✅ | ✅ | | | ✅ | own card only | |
| Social Media → Attendance: the running months' team, view only (`canSeeSmmAttendance`, 2026-10-08) | ✅ | ✅ | smmLeader | smmLeader | | | |
| 11 AM / 5 PM "update your posts" popup (`SmmStatusCheckPopup`, 2026-10-05) | | if on a month's team | if on a month's team | if on a month's team | | | |
| Delete an SMM month | ✅ | ✅ | ✅ (2026-10-03) | smmLeader | | | |
| Appoint / remove the Social Media Team Lead | ✅ | ✅ | | | | | |
| Edit an SMM month | overseer | overseer | overseer | if watcher | overseer | if seller/watcher | |
| Manage client profiles | ✅ | | | | ✅ | | |
| Import/backfill clients | ✅ | ✅ | | | | | |
| Issue HR documents / delete from register | ✅ | ✅ | send agreements, no delete | | ✅ | | |
| Attendance overrides, holidays, leave approval | | ✅ | ✅ | | ✅ (sales side) | | |
| Manage tech payroll | ✅ (no route) | ✅ | | | | | |
| Sales payroll / settlements | | | | | ✅ | request | |
| Expenses | ✅ (Accounts page) | | | | | | ✅ |
| Cinematic Ads | | ✅ | | | | | |
| Manage AI Accounts (any Flow/paid account: add, assign, disable, delete; settings) | ✅ (no route) | ✅ | ✅ | | | | |
| Add own Flow accounts, "using now", record / correct own credits | | ✅ | ✅ | ✅ | | | |
| Chat monitor | | ✅ | | | ✅ | | |
| Invoice Builder: make, generate, edit, PDF (2026-10-08; also enforced in the rules) | ✅ | ✅ | only while the switch is on | | ✅ | ✅ | ✅ |
| See every invoice (others see their own) · Invoices → Settings (logo, business, bank, QR, tax, terms) | ✅ | ✅ | | | ✅ | | ✅ |
| Team-leader Invoice Builder switch | ✅ | ✅ | | | | | |
| Delete an invoice (draft or generated; the number stays used — 2026-10-08) | ✅ | ✅ | own, while the switch is on | | ✅ | ✅ own | ✅ |

## 9. APPLICATION MODULES (the entries for this module)

**9.2 Team / user management** ✅. Create accounts without signing the admin out
(`services/secondaryAuth.ts` uses a second Firebase app), edit, activate, delete, share
credentials, store readable passwords (`services/memberCredentials.ts`), flags. Pages
`main-admin/TeamManagement.tsx`, `tech-admin/MyTeam.tsx`, `sales-admin/MyTeam.tsx`,
`shared/MemberProfileDetail.tsx`; components `EditMemberModal`, `MemberPasswordModal`,
`onboarding/*`. Collections `users`, `member_credentials`. See §15.

## 10. PAGES & ROUTES

All routes are defined in `src/App.tsx`. The guard is `AppLayout allowedRoles`: no user →
`/login`; wrong role → `/login`; external creator on a non-allowed path → `/tech/create`. Every page
is lazy. Chunk loading shows `PageFallback` inside the shell (app pages) or `RouteFallback`
(standalone pages). Auth loading shows "Loading workspace...".

### Public / standalone
| Route | Page | Purpose |
|---|---|---|
| `/` | `RootRedirect` (App.tsx) | → `defaultRouteForUser(user)` **keeping the query string** (e.g. `?call=<id>` from a notification), else `/login` |
| `/login` | `auth/Login.tsx` | Email/password sign-in; cache-repair option when the profile fails to load |
| `/c/:chatId` | `client/ClientChat.tsx` | Client's order chat (no login, notification permission step, calls, review) |
| `/c`, `/c/` | `ClientChatResume` | Start URL of the installed chat PWA → last opened chat |
| `/verify/:uid` | `public/VerifyEmployee.tsx` | ID-card QR target, reads `public_badges` |
| `/join/:inviteId` | `onboarding/JoinOnboarding.tsx` | Hiring link: code gate → offer → joining letter → credentials |
| `*` | `NotFound.tsx` | 404 |

### Shared by six roles (all except `accounts_admin`)
| `/smm` | `shared/SocialMedia.tsx` | One card per client month the viewer can see (`useSmmCampaigns`): status in words, a ring of every post, worst first, status counts that filter; Insights (charts) one switch away; **Calendar** (2026-10-05) — pick a client, see every month we ran for them day by day (`?view=calendar&client=<phone digits>` deep-links it; `?view=` also takes `cards` / `insights`); Add SMM sale for the tech side |
|---|---|---|
| `/smm/:campaignId` | `shared/SmmCampaignPage.tsx` | One month: content table (List, or Calendar = the client's whole run as a normal calendar, ‹ month › + Today, opened on this month), item dialog, ads, money, reports (with the same calendar), messages; `?tab=report` (or `ads` / `money`) opens on that tab |

### Invoice Builder — main, tech, sales and accounts admin, sales member; team leader while the switch is on (2026-10-08)
| Route | Page | Purpose |
|---|---|---|
| `/invoices` | `shared/Invoices.tsx` | The register: search, status filters with counts, amount waiting to be paid, Open / Duplicate / Delete draft |
| `/invoices/settings` | `shared/InvoiceSettings.tsx` | What every new invoice starts with — logo, business, bank, QR, tax, terms, notes (+ live sample preview); the four admins, others see a lock |
| `/invoices/:invoiceId` | `shared/InvoiceBuilder.tsx` | The workspace (editor + live A4 preview); `/invoices/new` swaps itself for a fresh id |
Both sit under `AppLayout allowedRoles={INVOICE_ROUTE_ROLES}` → `InvoiceAccessGate` (the team-leader switch). A
tech member is sent to `/login` by the guard. Nav: one "Invoices" item per allowed role (`INVOICES_NAV`); see `invoices.md`.

### main_admin — `/main-admin/*`
`dashboard` (Dashboard) · `team` (TeamManagement: all users, create admins) · `revenue`
(RevenueOverview) · `tech` (TechDepartment) · `sales` (SalesDepartment) · `sessions`
(SessionHistory) · `accounts` (Accounts: finance plus add expense) · `profit` (shared/Profit) ·
`settings` (Settings) · `salary` (shared/MySalary) · `clients` (shared/Clients).

### tech_admin — `/tech-admin/*`
`dashboard` · `team` (MyTeam) · `team/:memberId/profile` (shared/MemberProfileDetail: account,
employment, KYC, documents, probation, assets, exit) · `team/:memberId` (MemberHistory) ·
`team/:memberId/analytics` (MemberAnalytics) · `attendance` (shared/TeamAttendance) · `hr` and
legacy `agreements` (shared/HrCenter) · `drive` (DriveManagement: member Drive folder URLs) ·
`training` (TrainingModules) · `sessions` · `activity` (ActivityHistory) · `settings` · `salary`
(shared/MySalary) · `work-assign` (WorkAssign) · `work-assign/:memberId` (MemberAssignments;
`?verify=<id>` deep link) · `work-reports` (shared/WorkReports) · `payroll` (shared/Payroll) ·
`profit` · `orders` (Orders) · `clients` · `feedback-upsell` (shared/FeedbackUpsell, read-only
ratings) · `tools` (shared/Tools: AI platform, script duration checker, generation history) ·
`ai-accounts` (shared/AiAccounts) · `cinematic-ads` (CinematicAds) · `chat` (shared/Chat) · `meeting` (shared/Meeting) ·
`chat-monitor` (shared/AdminChatMonitor).

### sales_admin — `/sales-admin/*`
`leaderboard` (**landing**, shared/Leaderboard) · `dashboard` (also runs schedule-pool release) ·
`team` (MyTeam) · `team/:memberId/profile` · `team/:memberId` (MemberSalesHistory) · `leads`
(LeadsManagement) · `leads/:memberId` (MemberLeadsDetail) · `schedule-numbers` · `approvals`
(SalesApprovals: pending/verified/rejected, date filters, disputes, frozen numbers) ·
`client-lookup` · `settlements` (`?member=<uid>` deep link) · `payroll` (sales-admin/Payroll) ·
`attendance` · `profit` · `analytics` · `training` · `scripts` (sales-member/SalesScripts) ·
`sessions` · `settings` · `hr` and `agreements` · `history` (ActivityHistory) · `clients` ·
`feedback-upsell` · `chat` · `meeting` · `chat-monitor` · `salary`.

### accounts_admin — `/accounts/*`
`dashboard` · `revenue` (RevenueSummary) · `expenses` (DailyExpenses) · `salary` (SalaryManagement).

### tech_member — `/tech/*`
`create` (CreateAd: standalone AIPlatformApp; the external-creator home, not in the normal
nav) · `dashboard` (check-in hero + MyDayCalendar; still fetches assignments for check-in counts,
not dead code) · `my-work` (MyWork; `?open=` / `?chat=<jobId>` with `back=/smm/<id>`; lists no social-media month) · `recent-ads` · `analytics` · `training` · `profile`
(MyProfile: account, HR/KYC, documents, agreements, leave, bank) · `chat` · `meeting` · `salary`
(MySalaryDashboard) · `salary/receipts` (shared/MySalary) · `ai-accounts` (MyAiAccounts).

### sales_member — `/sales/*`
`dashboard` · `leads` (MyLeads; `?lead=` / upsell deep links) · `client-chats` · `clients`
(MyClients) · `reviews` (MyReviews) · `performance` · `training` · `scripts` · `profile` ·
`leaderboard` · `settlements` · `history` · `chat` · `meeting` · `salary` (sales-member/MySalary) ·
`salary/receipts`.

### tech_team_leader — `/team-leader/*`
`work-assign` (**landing**) · `work-assign/:memberId` · `work-reports` · `orders`
(tech-admin/Orders) · `feedback-upsell` · `activity` (tech-admin/ActivityHistory) · `attendance` ·
`hr` and `agreements` · `profile` (tech-member/MyProfile) · `tools` · `ai-accounts` (shared/AiAccounts).

Unrouted leftovers: `pages/Index.tsx` (template "Blank App") and `pages/PlaceholderPage.tsx`
(lazy-declared in App.tsx, used by no route). `pages/sales-member/SalesScripts.tsx.bak` is a
stray committed backup.

Notification deep links must use `/` + query or a route the **recipient's** role can open. The
`/smm` routes are deliberately un-prefixed for this reason (see the App.tsx comments).

## 15. TEAM MANAGEMENT

There is no "team" entity: **team = users sharing `createdBy`** (§7).
- **Create member:** tech admin My Team → *Add Member* menu → **Onboard new employee** (hiring
  link, `OnboardInviteModal`, `PendingInvites` shown above the grid and excluded from counts) or
  **Quick add, no paperwork** (form → `createUserWithoutSignOut` → `users/{uid}` with
  `createdBy` = admin → `saveMemberPassword`). The tech admin chooses `tech_member` or
  `tech_team_leader`. Sales admin: the same, always `sales_member`, plus `dailyTarget`. Main admin:
  creates admins only.
- **Edit:** `EditMemberModal` (name, phone, salary/package, earnings option, Drive URL,
  `businessWhatsapp`, …), photo (`ProfilePhotoUpload`, Cloudinary, mirrored to the HR profile),
  employment type toggle (TeamAttendance), `externalCreator` / `smmLeader` toggles (tech admin).
- **Deactivate:** `isActive` toggle. Instantly signs the user out and hides them from most lists
  (My Team still shows them).
- **Delete:** deletes `users/{uid}` and `member_credentials/{uid}` only. The **Firebase Auth
  account remains** (no admin SDK on the client), so the email stays taken. Their leads,
  assignments and HR data are not cleaned up.
- **Team leader scope:** sees the tech team of `user.createdBy`; receives
  `notifyTechTeamLeaders` fan-outs (new assignment, completion, new order).
- **Member profile page:** `/tech-admin|sales-admin/team/:memberId/profile` covers account,
  employment terms (`EmploymentTermsCard`, role ladder in `utils/roleLadder.ts`), KYC, documents,
  probation reviews, assets, separation, ID card.
- **Team dashboards:** tech admin Dashboard / MyTeam (revenue by member, period filter, today's
  check-ins, HR stage chips), sales admin Dashboard / Leaderboard / Analytics, main admin
  department pages.

## 24. BUSINESS RULES (IMPLEMENTED; verified in code)

- **Accounts:** only main admin creates admins; tech admin creates tech members and leaders; sales
  admin creates sales members; hiring-link accounts get `createdBy` = the inviting admin.

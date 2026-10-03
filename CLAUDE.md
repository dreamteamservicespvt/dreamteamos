# DTS-OS — MASTER PROJECT CONTEXT & DEVELOPMENT RULES

> **The single authoritative project-context file for this repository.** Do not create any other
> context/architecture/history document. The **source code wins** over this file; when they
> disagree, fix this file in the same task.
>
> **Last full audit:** 2026-09-22 against `main` @ `a1623ac`; last updated 2026-10-01 for the
> frame-bounded video, Kids, spoken-address and AI Accounts work (§9.21, §13, §17.2, §24–§27, §31), and
> the SMM delete / Social Media Team Lead / typed extra work changes (§7, §9.9, §31); 2026-10-02 for
> the merge that dropped a parallel local Flow module (§28, §31, §32).
> **Quick start:** if **`HANDOFF.md`** exists, read it FIRST — it is an unfinished task. Then read
> **§34 Session & usage protocol**, **§33 AI Development Context**, **§29 Rules** and **§30 Change Protocol**.
>
> Legend: ✅ implemented · 🟡 partial · ❌ not implemented · **[NOT CONFIRMED]** = could not be
> verified from code (e.g. live console/deployment state).
> Secrets are never written here. Where code contains one, this file only says *where*.

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

## 2. PROJECT PURPOSE

**In business terms.** DTS is a small Indian digital-marketing and ad-production agency. A **sales
team** phones local businesses from lead lists and sells ad videos, posters, monthly social-media
management, websites, logos and similar services. A **tech team** produces the ads with AI tools
(Gemini writes the scripts and image/video prompts; frames and clips are generated in external
tools such as Google Flow/Veo, ChatGPT or Gemini, then edited). DTS-OS runs the whole company in one
app: leads → sale → approval → order → work assignment → AI-assisted production → delivery →
client chat and review → follow-up call → upsell. It also covers HR paperwork, attendance, leave,
payroll, sales commission and company finance.

**Problem it solves.** Code comments repeatedly describe replacing manual processes: WhatsApp
"sale" labels (the Orders queue), per-order WhatsApp groups (the client order chat), paper lists
of who owns which bulk video (bulk video slots), hand-typed offer letters (HR documents and the
hiring link), and hand-maintained social-media plans (SMM campaigns).

**Target users.**
- Internal staff in 7 roles (§7): main admin, tech admin, sales admin, accounts admin, tech team
  leader, tech member, sales member ("Sales Executive").
- Two additive flags on a user: **external creator** (an outsider allowed only the ad generator)
  and **SMM leader** (sees and assigns every social-media month).
- People without accounts: **clients** (public order-chat link), **job candidates** (public hiring
  link), and **anyone scanning an employee ID card** (public badge page).

---

## 3. PRODUCT OVERVIEW

### Main workflows (all implemented)
1. **Lead → sale.** Sales admin distributes phone numbers; sales members call them, log the call
   status, and record a sale with the client's brief (`SaleForm`).
2. **Sale → order.** Saving a sale creates an **Order** straight away (tech sees it before
   approval, flagged `saleVerified:false`). Discounts over 10% hold the order back until the sales
   admin approves. Sales admin verifies or rejects sales in **Sales Approvals**.
3. **Order → work assignment.** Tech admin or team leader assigns the order (or creates a direct
   job) to a tech member. The member gets a 4-digit access code and a notification.
4. **Production.** The member opens the job in **My Work** → the **AI Ads Platform** (Video Ad or
   Poster Creation) → Gemini writes prompts and scripts → the member generates visuals externally
   → submits (**completed**).
5. **Review.** Tech admin or team leader **verifies** the work or sends it back for **editing**.
   Verifying records the delivery on the **Client** record.
6. **Client side.** Each order has a **client chat** (`/c/:chatId`, no login) with messages, files
   and calls. After delivery the client can leave a 1–5 star review.
7. **After-sale.** The seller calls the client, records **feedback** (work plus service), and only
   then can **upsell** (ad → social → website → software ladder).
8. **Monthly SMM retainers.** A sold social-media month gets a campaign plan (`/smm/:id`): content
   items, a client-approval gate before posting, ad runs, budget ledger, reports.
9. **HR.** Hiring link (offer → joining letter → account created), employment terms, KYC, 14 HR
   document types with signatures and PDF/print, agreements, ID cards with a public verify QR,
   probation, assets, separation.
10. **Pay.** Tech attendance (daily check-in/out) and sales check-ins → payroll (salary packages,
    pay cycle, leave) → payslips. Sales commission (5% or 10%) → settlements.
11. **Oversight.** Dashboards, leaderboards, analytics, activity and session history, chat
    monitor, profit & loss.

### Module relationships
```
 Leads/NumberLocks ──sale──► leads.saleItems[] ──upsertOrderForSale──► orders ──createWorkAssignment──► work_assignments
        ▲                          │ (approve/reject: SalesApprovals)     │  │                                 │
        │ upsell (My Clients)      │                                      │  ├─► order_chats (client chat, opens at SALE)
        │                          ▼                                      │  ├─► smm_campaigns (social_media_management only)
  clients ◄──── verify ─── work_assignments.status=verified ◄── AI Ads Platform (ai_generations) ◄───┘
     │                                                                    │
     └─► Feedback & Upsell (orders.feedback)            notifications / FCM push fan-out everywhere
 users ──► employee_profiles / hr_documents / agreements / public_badges / payroll_* / attendance / leave_requests
```

---

## 4. TECHNOLOGY STACK

| Layer | Technology (versions from `package.json`) |
|---|---|
| Language | TypeScript 5.8, `strict: false` in app code |
| UI | React 18.3 (SPA), Vite 5.4 with `@vitejs/plugin-react-swc` |
| Routing | `react-router-dom` 6.30 (`BrowserRouter`), every page `lazy()`-loaded |
| Components | shadcn/ui (Radix primitives) in `src/components/ui/`, `lucide-react` icons, `framer-motion` |
| Styling | Tailwind CSS 3.4 + `tailwindcss-animate` + `@tailwindcss/typography`; HSL CSS variables in `src/index.css`; fonts Syne (display), DM Sans (body), JetBrains Mono. The AI Ads Platform adds its own scoped design system, `src/components/ai-platform/adgen.css` (`.adgen`, dark-only, Space Grotesk + Inter) |
| Theme | `next-themes` (`attribute="class"`, default **dark**, system allowed); `components/ThemeSelector.tsx` |
| Client state | `zustand` 5 stores in `src/store/` |
| Server state | Firestore realtime listeners (`onSnapshot`) and one-shot reads. `@tanstack/react-query` `QueryClientProvider` is mounted but **no `useQuery` exists** |
| Forms | Hand-rolled `useState` forms with inline validation. `react-hook-form`, `zod` and `@hookform/resolvers` are installed but unused outside `components/ui/form.tsx` |
| Toasts | shadcn `useToast` (≈100 files) and `sonner` (≈11 files) |
| Charts | `recharts` |
| Documents | `jspdf` + `html2canvas` (PDF export), native print, `docx` + `file-saver` (sales scripts .docx), `qrcode` (ID cards) |
| Backend DB/auth | Firebase JS SDK 12 (Auth email/password + custom tokens, Firestore with persistent IndexedDB cache, Messaging) |
| Serverless | Vercel Node functions in `api/` using `firebase-admin` 13 |
| AI | Google Gemini via `@google/genai` (text/vision); one legacy REST call in `services/gemini.ts` |
| Files | Cloudinary unsigned uploads (`services/cloudinary.ts`) |
| Realtime A/V | WebRTC with Google STUN and Metered.ca TURN (`services/webrtcConfig.ts`), signalling through Firestore |
| Mobile | Capacitor 8 Android shell (`android/`, `capacitor.config.ts`, `webDir: dist`) with push, local-notifications, keyboard, status-bar, splash, haptics, app, keep-awake plugins |
| PWA | `public/manifest.webmanifest`, `public/chat.webmanifest` (client chat), service worker `public/firebase-messaging-sw.js`, self-update via `/version.json` |
| Tests | Vitest 3 + jsdom + Testing Library (`src/test/`, 183 files); `src/test/memoryFirestore.ts` is an in-memory `firebase/firestore` for tests that need real writes and live listeners |
| Lint | ESLint 9 flat config (`eslint.config.js`); not part of the build |
| Package managers | `package-lock.json` (npm) is canonical; a stale `bun.lockb` is also committed |

---

## 5. SYSTEM ARCHITECTURE

```
┌──────────────────────────── Browser / Capacitor WebView (one React SPA) ────────────────────────────┐
│ pages/ ─► components/ ─► hooks/ + store/ (zustand) ─► services/ (Firestore, Gemini, Cloudinary, FCM) │
│                                    utils/ (pure business rules, heavily unit-tested)                │
└──────┬───────────────────────┬───────────────────┬─────────────────────┬───────────────────────────┘
       │ Firebase JS SDK       │ @google/genai     │ XHR upload          │ fetch /api/*
       ▼                       ▼                   ▼                     ▼
 Firestore + Auth + FCM    Gemini API         Cloudinary          Vercel serverless (firebase-admin)
 (rules pasted in console)  (keys in bundle)   (unsigned preset)    send-notification · order-chat · onboarding
```

Key architectural facts:
- **Thick client, no custom CRUD backend.** Pages and services read and write Firestore directly.
  Business rules live in `src/services/*` (Firestore-aware) and `src/utils/*` (pure). Only three
  jobs run on the server (§12): push sending, client-chat guest tokens and alerts, and hiring-link
  provisioning.
- **Authorization is mostly client-side.** Route guards and in-page checks decide what people see.
  The Firestore rules in `docs/firestore-rules.md` are coarse (any signed-in staff can read and
  write almost everything), and were **recorded as not yet published** (§14, §27).
- **Free-tier (Spark) read quota drives design.** Examples: one session-long "my leads" / "my
  orders" listener in `AppLayout`, team-scoped queries (`services/teamLeads.ts`), denormalized
  mirrors on orders, and on-demand history pages. The project exceeded the 50K reads/day quota in
  the past (352K in one day, fixed 2026-09-12).
- **No scheduler or cron.** Time-based behaviour runs when someone opens a page ("on-open sweeps"):
  deadline alerts in the Orders page, number-pool release in the Sales Admin Dashboard, SMM due
  reminders in check-in/check-out, birthday pushes from `BirthdayGreeting`.
- **Realtime everywhere.** Most screens subscribe with `onSnapshot`. Firestore uses a persistent
  multi-tab IndexedDB cache and falls back to memory (`services/firebase.ts`).
- **Code-splitting.** Every page is `lazy()` in `App.tsx`. The `AppLayout` overlays are lazy.
  `manualChunks` names only `vendor-react` and `vendor-firebase`: naming more pulls them into the
  entry chunk (see the comment in `vite.config.ts`).
- **Self-updating PWA.** Vite writes `version.json` with a build id (`__BUILD_ID__`).
  `services/appUpdate.ts` polls it, `AppUpdateBanner` offers or applies it, and `holdUpdates()`
  blocks auto-reload while the AI generator is open.

---

## 6. PROJECT STRUCTURE

```
DTS-OS/
├── CLAUDE.md                  ← this file (single source of project context)
├── README.md                  ← outdated Lovable-style template text ("Dream Team Command")
├── claude-agent-prompt.md     ← user's reusable "investigate & fix" task-prompt template
├── api/                       ← Vercel serverless functions (Node, firebase-admin)
│   ├── send-notification.ts   ← FCM multicast push to a user's tokens
│   ├── order-chat.ts          ← client-chat guest token, push registration, alerts, review mirror
│   └── onboarding.ts          ← hiring-link actions; creates the employee account
├── src/
│   ├── main.tsx               ← entry: Capacitor init, service-worker registration, PWA install prompt
│   ├── App.tsx                ← ALL routes + role guards (AppLayout allowedRoles)
│   ├── index.css              ← theme tokens (HSL vars), print CSS for documents
│   ├── pages/<role>/          ← main-admin, tech-admin, sales-admin, accounts-admin, tech-member,
│   │                            sales-member, tech-team-leader, shared/, client/, public/, onboarding/, auth/
│   ├── components/            ← feature folders: ai-platform/, ai-accounts/, cinematic-ads/, work/, sales/, smm/,
│   │                            order-chat/, chat/, hr/, agreement/, payroll/, attendance/, onboarding/,
│   │                            layout/, dashboard/, common/, analytics/, birthday/, team/, tech/, ui/ (shadcn)
│   ├── services/              ← Firestore/API/AI access + domain operations (≈63 files)
│   │   └── prompts/           ← Gemini prompt modules (character ads, motion/Veo, refine, poster, …)
│   ├── utils/                 ← PURE business logic, no React or Firestore (≈95 files, most unit-tested)
│   ├── hooks/                 ← data hooks (useAuth, useMyLeads, useOrderChat, useSalaryMonth, …)
│   ├── store/                 ← zustand: authStore, sidebarStore, callStore, salesLeadsStore,
│   │                            salesOrdersStore, cinematicAdsStore
│   ├── types/                 ← index.ts (core model), aiPlatform, cinematicAds, hr, payroll, smm,
│   │                            orderChat, onboarding
│   ├── lib/utils.ts           ← shadcn `cn()`
│   └── test/                  ← Vitest suites (186 files, 2917 tests at 2026-10-03) + setup.ts + memoryFirestore.ts
├── public/                    ← PWA manifests, FCM service worker, logos/icons
├── docs/
│   ├── AI-MEMORY.md           ← HISTORICAL session log up to 2026-09-19 (superseded by §31; do not extend)
│   ├── firestore-rules.md     ← the intended Firestore security rules (paste into Firebase console)
│   ├── firestore-rules-onboarding.md ← onboarding_invites rule notes
│   ├── video-category-plan.md + video-category-catalogue.json ← source for services/characterCatalogue.ts
│   └── superpowers/specs/*.md ← dated design specs (historical intent, not proof of implementation)
├── android/                   ← Capacitor Android project (versionName 1.0)
├── aiadsdts/                  ← DEAD standalone copy of an old AI-ads app. Not imported. Never edit.
├── vite.config.ts             ← envPrefix, build id plugin, manualChunks, `@` alias
├── vitest.config.ts · tsconfig*.json · tailwind.config.ts · components.json · eslint.config.js
├── vercel.json                ← SPA rewrite + cache headers (sw, manifest, version.json no-cache)
└── capacitor.config.ts
```

Files to know by heart:

| File | Why it matters |
|---|---|
| `src/App.tsx` | Route map and role guards |
| `src/components/layout/AppLayout.tsx` | Auth/role gate, session-long listeners, FCM init, global overlays |
| `src/utils/roleHelpers.ts` | Per-role navigation, landing routes, role labels, external-creator confinement |
| `src/types/index.ts` | Core data model: `AppUser`, `Lead`, `SaleDetail`, `Order`, `WorkAssignment`, `Client`, … |
| `src/services/orders.ts` | Sale→order pipeline, order lifecycle, deadline sweeps, penalties, progress |
| `src/services/workAssign.ts` | The single path for creating or unassigning work |
| `src/hooks/useCompleteWork.ts` · `src/services/workVerify.ts` | Complete and verify side-effects |
| `src/components/ai-platform/AIPlatformApp.tsx` | The AI ad generator UI (≈2.4k lines) |
| `src/services/geminiService.ts` | All Gemini calls, key/model rotation, generation pipeline (≈3.8k lines) |
| `src/services/prompts.ts` + `src/services/prompts/*` | Every system prompt |
| `src/services/smm.ts` | Social Media Management operations (transactional) |
| `src/services/notifications.ts` | In-app notification plus push fan-out |
| `docs/firestore-rules.md` | The intended security model |

---

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
| `sales_member` (Sales Executive) | Calls leads and sells | sales_admin (or hiring link) | `/sales/dashboard` | My Leads (claim numbers, call statuses, record/edit/delete sales, freeze sold numbers 1–7 days, dispute proof); client chats for own orders; My Clients (feedback, upsell); review tasks; performance; salary and settlements (request payout); leaderboard (**month view only**); scripts, training; activity history; SMM months they sold | Discounts over 10% need sales admin approval; sale edits locked once work is assigned (send update notes instead) |

**Flags (additive, not roles):**
- `externalCreator: true` on a `tech_member`: navigation is only **Create Ad** + **My Profile**.
  `AppLayout` redirects any other path to `/tech/create`. Excluded from team lists, attendance,
  payroll and reports. Their `ai_generations` are visible to the tech admin (`AdsHistoryModal`).
  Set by tech admin in My Team.
- `smmLeader: true` — shown as **Social Media Team Lead** (2026-10-01): sees every SMM campaign, may
  set up, assign and **delete** months (`utils/smmPlan.isSmmOverseer`, `canDeleteSmmCampaign`), and is
  notified when a month is sold (`smm_new_month`). Keeps their normal role. Appointed by the tech admin
  or main admin in the Team Lead panel at the top of `/smm` (`SmmTeamLeadPanel`, `canAppointSmmLead`)
  or the megaphone toggle in My Team; both go through `services/smm.setSmmTeamLead` (notifies them).

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

---

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
   (+messages), `calls`. Everything else falls to a catch-all: **any staff may read and write**.
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
| Record / edit own sale | | | | | | ✅ | |
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
| Add an SMM month that had no sale — not counted (`canAddNoSaleMonth`) | ✅ | ✅ | ✅ | | | sees it, renews it | |
| Set up / assign / edit an SMM month (`canSetUpSmm`) | ✅ | ✅ | ✅ | smmLeader | | | |
| Renew an SMM month — as a sale (`canRenewSmm`) | | | | | | ✅ own month | |
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

---

## 9. APPLICATION MODULES

Each entry lists: purpose · key files · collections · roles.

**9.1 Authentication & session** ✅. Email/password login, profile load, deactivation, session log,
cache recovery. `pages/auth/Login.tsx`, `hooks/useAuth.ts`, `store/authStore.ts`,
`services/localCacheRecovery.ts`, `components/layout/Sidebar.tsx` (logout). Collections `users`,
`sessions`. All roles. See §14.

**9.2 Team / user management** ✅. Create accounts without signing the admin out
(`services/secondaryAuth.ts` uses a second Firebase app), edit, activate, delete, share
credentials, store readable passwords (`services/memberCredentials.ts`), flags. Pages
`main-admin/TeamManagement.tsx`, `tech-admin/MyTeam.tsx`, `sales-admin/MyTeam.tsx`,
`shared/MemberProfileDetail.tsx`; components `EditMemberModal`, `MemberPasswordModal`,
`onboarding/*`. Collections `users`, `member_credentials`. See §15.

**9.3 Leads & number locking** ✅. `pages/sales-admin/LeadsManagement.tsx`, `MemberLeadsDetail.tsx`,
`ScheduleNumbers.tsx`, `pages/sales-member/MyLeads.tsx`; `services/numberLock.ts` (transactions),
`services/scheduleRelease.ts`, `services/duplicateLeads.ts`, `services/teamLeads.ts`. Collections
`leads`, `numberLocks`, `schedulePools`. Rules: a claimed number is reserved to its claimer for
**24h**, then another member may take it over (the previous lead is frozen). A sold number can be
**sale-frozen 1–7 days**. Admins can override or release. Pools release `dailyLimit` numbers per day
if yesterday's completion ≥ `minCompletionPercent`. The release runs only when the sales admin
opens their Dashboard.

**9.4 Sales recording & approvals** ✅. `components/sales/SaleForm.tsx` (the only sale form, also
used for upsells), `SmmSaleFields`, `SaleSection`, `SaleStatusChip`;
`pages/sales-admin/SalesApprovals.tsx`. Sales live **inside the lead document** as
`leads.saleItems[]` (`SaleDetail`; legacy single `saleDetails`). Includes packages from
`utils/serviceCatalog.ts`, bulk quantity and discount ladder (`utils/bulkDiscount.ts`), earned
discount (review/referral 10%, `utils/saleDiscount.ts`), the 10% member authority, partial
payments (`payments[]`, `utils/salePayments.ts`), delivery promise (`utils/promiseSla.ts`), the
client brief (`AdRequirement`, incl. `customCharacter` — required when the Custom Character
category is sold), edit log, dispute proof. `verificationStatus: pending | verified | rejected`.

**9.5 Orders (sales → tech queue)** ✅. `services/orders.ts`, `pages/tech-admin/Orders.tsx` (shared
with team leader), `components/work/*` (`OrderProgressPanel`, `BulkVideoBoard`, `PenaltyDialog`,
`ExtendPromiseButton`, `DeadlineChip`, `SaleDeletedBanner`). Collection `orders`. See §16.

**9.6 Work assignment (task management)** ✅. `services/workAssign.ts`, `workReassign.ts`,
`workVerify.ts`, `hooks/useCompleteWork.ts`; pages `tech-admin/WorkAssign.tsx` and
`tech-team-leader/WorkAssign.tsx` (**near-duplicates, edit both**), `tech-admin/MemberAssignments.tsx`
and `tech-team-leader/MemberAssignments.tsx` (**near-duplicates**), `tech-member/MyWork.tsx`,
`tech-member/RecentAds.tsx`, `shared/WorkReports.tsx`. Collection `work_assignments`. See §16.
**Drive step (2026-10-03):** the moment a job is handed in (My Work, Recent Ads — `useDriveUploadStep`),
`components/work/DriveUploadSheet` opens: this job's folder (`Name › Month › Day N › 4 Clips`, or `Posters`;
`utils/driveUpload.jobDrivePath`, the day it was finished), a file name (`W123 - Business`, `driveFileName`),
the member's own `users.googleDriveBaseUrl`, and "It's uploaded" (`services/workDrive.markDriveUploaded` →
`driveUploadedAt` / `driveUploadPath` / `driveFileName` on the job; every new hand-in clears them). Folder
names and the file name copy in one tap; the loudest button is always the next step. "Upload later" leaves
`DrivePendingStrip` at the top of both pages and a `DriveUploadChip` on the job; no link set → "Ask my
admin" (`askAdminForDriveFolder`, `drive_folder_missing`, once a day).
**Opens at once (2026-10-04):** `useDriveUploadStep.submit` closes the studio and puts the card on screen the
moment the member submits (after the Flow credit step) — not after `useCompleteWork`'s six writes. The
card says "Submitting your video…" until the JOB is saved (`complete(…, { onSaved })`, the first write),
then "Video submitted" while the follow-ups (alerts, order, chat, client) finish behind it; a failed save
shows "Not submitted yet" + Try again, and "It's uploaded" stays disabled until the job is saved. A
follow-up failing after the save is reported as "Submitted — one follow-up did not finish", never as
"not submitted". The card is centred on every screen, fits a 360×640 phone without scrolling, has a green
top band, and does not close on a tap outside it (X, Escape, Upload later or It's uploaded).
**Social-media months are not in My Work or Recent Ads (2026-10-04):** a month's job card
(`utils/smmPackage.isSmmMonthJob`: SMM category + `smmCampaignId` or `orderId`) is kept out of both
lists, their tiles and counts, and the Drive strip. It is still loaded: the month page's
`SmmMyJobPanel` opens it through My Work's `?open=<jobId>` (studio, behind the code) or `?chat=<jobId>`
links with `back=/smm/<id>` (`monthJobLink`), and closing the studio, the chat, the code box or the
Drive step returns there (`safeMonthReturn`: only a month page).

**9.7 AI Ads Platform (ad generation)** ✅. `components/ai-platform/*`, `services/geminiService.ts`,
`services/prompts.ts`, `services/prompts/*`, `services/characterPacks.ts` +
`characterCatalogue.ts` (35 special-category entries incl. three human duos), `services/posterStyles.ts`,
`services/adLanguages.ts`, `components/ai-platform/adgen.css` (the studio's design system, §11),
`utils/businessFacts.ts` (verified contact numbers and address), `utils/scriptQa.ts` +
`services/prompts/scriptQa.ts` (the voice-over quality gate), `utils/finalScript.ts` (a pasted final
script), `utils/assignmentFormSpec.ts` (what a job decides on the form).
Collection `ai_generations`. See §17.

**9.8 Cinematic Ads pipeline** ✅ (rebuilt 2026-09-19). `pages/tech-admin/CinematicAds.tsx`,
`components/cinematic-ads/*` (Step0–Step6, ProjectList, AdFormatPicker, PipelineStepper,
ProjectAssetsPanel), `store/cinematicAdsStore.ts`, `services/cinematicAdsService.ts`,
`services/cinematicProjects.ts`, `utils/cinematicAds.ts`, `types/cinematicAds.ts`. Collection
`cinematic_projects`. tech_admin only. See §17.4.

**9.9 Social Media Management (SMM)** ✅. `pages/shared/SocialMedia.tsx` (`/smm`),
`pages/shared/SmmCampaignPage.tsx` (`/smm/:campaignId`), `components/smm/*`, `services/smm.ts`,
`services/smmTemplates.ts`, `utils/smmPlan.ts`, `smmPricing.ts`, `smmMessages.ts`,
`smmReminders.ts`, `hooks/useSmmCampaigns.ts`, `types/smm.ts`. Collections `smm_campaigns` (doc id
= order id, or an auto id for a month with no order; `origin: "sale" | "direct" | "no_sale"`), `smm_templates`. Rules: items cannot go
`scheduled`/`posted` without a recorded client approval (`setItemStatus` throws). Every mutation
runs in a transaction (`mutateCampaign`). The order's progress counters are **derived** from the
plan (`syncOrderProgress`). Budget ledger with `direct`/`via_us` payment routes and two-leg proof.
Due reminders appear in the check-in/check-out screens. Removing an order retires its month.
**2026-10-01:** a month can be **deleted** (`deleteCampaign`, Delete button on the month's page): a
direct month's document is deleted; a sold month becomes a `status: "deleted"` tombstone
(`deletedAt`, `deletedByName`) that lists and the page treat as gone and that `ensureCampaignForOrder`
never revives (unlike `removed`). **Extra work** is added from a form — type Poster / Promotional
video / Wishes video / Cinematic video (`SMM_EXTRA_WORK_TYPES`) and, for a video, a duration
(16/32/48/64 s or other) — stored as `extraType` / `extraDuration` with the title "Promotional video ·
32 sec"; it now goes through `addItem`, which notifies the seller (the old button used `addItems`,
which notified nobody). The top bar's breadcrumb names a month by its business, never its order id.
**2026-10-03 — every month is a sale; setup, renewal, board.** No-sale "Start a month" removed
(`createDirectCampaign` gone; old `origin:"direct"` months still work — their team now gets job cards
too, see the no-sale paragraph below). **Add SMM sale**
(`SmmAddSaleDialog`, `services/smmSetup`): the client's number lists every SMM sale ever recorded on it
(`findSmmSalesForPhone`, any salesperson, legacy `saleDetails` too); a sale already there is **set up,
never sold again** (`setupSaleMonth`: restores a removed order / rebuilds a purged one under the same
id with `announce:false`, replaces a removed/deleted month, original sold date, chains to the
previous month if continuous); dates already over → **history** (status `completed`, order
`verified`, no jobs). Only a number with no SMM sale may get a new sale, recorded through the real
`SaleForm` in `onBehalfOf` mode on the salesperson's own lead (`leadForSeller` → `adminAssignNumber`,
refused while another salesperson holds the number) — their sale, Sales Approvals, existing
commission; `enteredBy` + an "Entered by" chip. **Setup** (`SmmSetupForm`/`SmmSetupDialog`,
`applyMonthSetup`): start → end auto = same date next month (`monthCycle`), `clipsPerVideo` (also on
the sale form; default 4 = 32 s), page links, team → **one assignment path** `services/smmAssign`
(`assignSmmMonth`: one job per person with their tracks, at the month's length, `smmCampaignId`,
idempotent, untouched cards withdrawn, started kept; also used by Orders → Assign jobs); order
deadline = month end (`monthPromise`). **Renewal = the salesperson's sale**: Renew (`useSmmRenewal` →
upsell path → My Leads `?renew=` → `SaleForm renewal`) → `ensureCampaignForOrder` links Month N+1
(start = old end or renewal day, team/clips/page links copied, jobs auto-created, tech side told);
the old month closes after its last day (`closeEndedMonthsOnOpen`, on board open). Unposted pieces
can be moved forward (`moveUnpostedToMonth`). **Board**: tiles (`SmmBoardStats`), tabs Needs setup /
Running / Needs attention / Renewals / Finished (on-demand), member/seller filters, cards and month
header drawn by `SmmVisuals` (timeline with post dots, one block per piece, `PaceChip`), Content
List/Calendar (`SmmCalendar`); salesperson dashboard `SmmRenewalsCard`; for a tech member, **"Your work on this month"** (`SmmMyJobPanel`, under the month's header, 2026-10-04): their seats, the video length, status, access code, Start / Continue in AI studio and Chat with client (My Work's links, back to the month), or "handed in" with the Drive chip — read once with `smmAssign.fetchMyMonthJobs` (their own card only). A month's jobs are no longer listed in My Work or Recent Ads, and their assignment alert opens the month (`memberLink: /smm/<id>`).
Rules in `utils/smmPackage.ts`. Same day, from the owner: the month's **name** is editable (setup's
Name field, or the pencil beside the title — `smmSetup.renameMonth`; renames the jobs too; sets
`businessNameEdited` so a sale edit never renames it back; the order keeps the sale's name); setup
sets the **number of videos / posters / real videos** (`setMonthCommitments`: adds rows, removes only
untouched ones, order counters follow); **Delete offers Undo for 5 s** (deleted at once,
`undoDeleteCampaign` puts the month back exactly as it was).
**Renewal countdown popup (2026-10-03, `components/smm/SmmRenewalPopup.tsx`, mounted in `AppLayout`
for sales members):** from 3 days before a month's renewal date (= its end date) through the day
itself — 3 days · 2 days · 1 day · renewal day — the salesperson who SOLD it gets a popup once a day
per month per device (localStorage `renewalPopupSeenKey`): the countdown strip, the month's timeline
with every post on its day, work status (% posted, `PaceChip`, a stacked stage bar from `toneCounts`,
one block per piece per kind), the call figures (posts live, leads, ad spend, cost per lead, days
waiting on the client, extra work, team) and the next month's dates; Renew (the usual
`useSmmRenewal` sale), Full report (`/smm/:id?tab=report` — the month page now opens on `?tab=`),
Later; several clients page 1 of N. Rules: `SMM_RENEWAL_POPUP_DAYS`, `daysToRenewal`,
`renewalCountdownLabel/Steps`, `renewalPopupMonths` in `utils/smmPackage.ts`.
**A month that had no sale (2026-10-03, later)** — for clients served before sales were recorded in the
app. Add SMM sale → number → **Add a month that had no sale** (tech admin, team leader, main admin;
`canAddNoSaleMonth`): salesperson, the package it ran on (fills counts + accounts) or Custom, then the
ordinary setup form → `smmSetup.addNoSaleMonth` → `origin: "no_sale"`, auto id, no order/lead/sale
item, **amount 0**, `soldBy` = the salesperson — so it is in their Social Media with its dates and they
get Renew, but nothing reaches revenue, leaderboards or commission. Refused (`noSaleMonthProblem`,
`noSaleMonthClash`): a start in the future (that is a sale), dates on any month the number has, dates a
recorded sale covers (even a deleted one → "Set up this sale"), any month after a recorded sale (that is
the salesperson's renewal). Over → history; running → `applyMonthSetup` → jobs. **Orderless months now
get job cards** (`assignSmmMonth`): one client chat per month keyed on the month id
(`createWorkAssignment` `roomId`/`soldBy`, `orderChat.joinMonthRoom`), never adopting the client's
waiting sale by phone, with the month's deadline. Shown as a "No sale" chip, "No sale — not counted in
revenue or commission" on the month, "salesperson X" (`sellerLineOf`). The salesperson's Renew makes
month 2 a real sale. Fixed with it: a renewal's order and jobs now get the month's deadline
(`monthPromise`, now in `services/smm`, set in `linkRenewal`), and a sale edit or approval no longer
writes the sale's promise over an order's `smm_month` deadline or a used extension (`upsertOrderForSale`).

**9.10 Client order chat + client calls** ✅. `pages/client/ClientChat.tsx` (public),
`components/order-chat/*` (`StaffOrderChat`, `SalesOrderChat`, `OrderChatPanel`, `ClientCall`,
`ClientReviewCard`, `ShareChatModal`), `services/orderChat.ts`, `services/orderChatGuest.ts`
(separate Firebase app instance for guests), `hooks/useOrderChat.ts`, `utils/orderChatId.ts`,
`api/order-chat.ts`. Collections `order_chats` (+`messages` subcollection), `calls`. The room opens
at **sale** time (team-only, `clientReady:false`), becomes client-accessible on assignment, locks on
completion (`delivered`), and reopens on undo or edits. Sales members read their rooms at
`/sales/client-chats`.

**9.11 Clients, feedback & upsell, reviews** ✅. `pages/shared/Clients.tsx`,
`pages/shared/FeedbackUpsell.tsx`, `pages/sales-admin/ClientLookup.tsx`,
`pages/sales-member/MyClients.tsx`, `MyReviews.tsx`; `services/clients.ts`, `saleFeedback.ts`,
`upsell.ts`, `reviews.ts`; `utils/upsellLadder.ts`, `salesClients.ts`, `clientValue.ts`.
Collections `clients` (doc id = digits-only phone), `review_tasks`, `app_settings/clients_backfill`.
Rules: the client record is upserted on work completion and on verification. Feedback lives on
`orders.feedback`; both work and service ratings are required before the upsell button appears
(`feedbackComplete`). Review task: sales admin assigns → member uploads a 5★ screenshot → admin
verifies (10% loyalty discount) → member uploads a feedback video.

**9.12 Team chat, video calls, meetings, chat monitor** ✅. `pages/shared/Chat.tsx`, `Meeting.tsx`,
`AdminChatMonitor.tsx`; `components/chat/*` (`ChatRoom`, `ChatSidebar`, `VideoCallManager`,
`MeetingRoom`); `hooks/useChat.ts`, `store/callStore.ts`, `utils/chatHelpers.ts`,
`services/webrtcConfig.ts`, `services/audio-route.ts`. Collections `chatRooms` (+messages),
`calls` (+ICE candidate subcollections), `meetings` (+participants/signals). Everyone can chat with
everyone (`CHATTABLE_ROLES`). Tech and sales admins can read their department members' chats.

**9.13 Attendance, check-in/out, leave** ✅. Tech: `components/attendance/*` (`DailyCheckinPrompt`,
mandatory for tech members on working days — **not shown on Sundays or on an announced
`holidays/{date}`**, so the platform opens directly; `CheckoutModal` with a Drive-upload declaration and, since 2026-10-03, today's finished jobs marked in the Drive or not (`todaysDriveUploads`, one-tap "Uploaded"); `MyDayCalendar`),
`services/techAttendance.ts` (statuses `full|half|absent|leave|holiday`; overrides and holidays
persisted, Full/Absent derived from check-ins). Sales: `services/salesCheckin.ts`,
`components/sales/AttendanceCard.tsx`. Shared grid `pages/shared/TeamAttendance.tsx` (with the
WhatsApp update step and `LeaveApprovalsPanel`). Leave: `services/leave.ts`,
`components/payroll/LeavePanel.tsx`, `utils/leaveAllowance.ts`. Collections `daily_checkins`,
`attendance` (`{memberId}_{date}`), `holidays` (`{date}`), `salesCheckins`, `leave_requests`.

**9.14 Payroll, salary, commission** ✅. Tech payroll `pages/shared/Payroll.tsx`,
`services/payroll.ts` (salary packages, config, bank/payout accounts), `services/payrollRun.ts`
(month runs and lines, mark paid/undo), `utils/payrollEngine.ts` (pay periods, day credit,
deductions), `hooks/useMonthPayroll.ts`, `utils/payslipPdf.ts`, `utils/techProductivity.ts`
(pay-to-work ratio; target 5%, limit 10%). Sales: `pages/sales-admin/Payroll.tsx`,
`hooks/useSalesMemberPay.ts`, `useSalesEarnings.ts`, `utils/salesIncentive.ts` (5% standard, 10% on
`incentive_10`), `utils/salesTargets.ts` (only `dailyTarget` stored), `utils/salesRevenue.ts`;
settlements `services/settlements.ts`, `pages/sales-admin/Settlements.tsx`,
`pages/sales-member/Settlements.tsx`. Member views: `tech-member/MySalaryDashboard.tsx`,
`sales-member/MySalary.tsx`, `shared/MySalary.tsx` (receipts). Collections `salary_packages`,
`payroll_config/default`, `employee_bank`, `payroll_runs`, `payroll_lines`, `salary_receipts`,
`commission_settlements`, `settlement_requests`, `audit_logs`. Cycles: the tech performance month is
**10th → 9th** (`utils/performanceCycle.ts`); the payroll cycle comes from
`PayrollConfig.payDayOfMonth`.

**9.15 HR & documents** ✅. `pages/shared/HrCenter.tsx` (tabs: All documents / Missing paperwork /
Agreements), `pages/shared/SendAgreement.tsx`, `components/hr/*`, `components/agreement/*`
(incl. `MandatoryAgreementGate`, non-closable), `services/hr.ts`, `hrDocuments.ts`,
`agreements.ts`, `companyAssets.ts`, `publicBadge.ts`, `onboarding.ts`, `onboardingGuest.ts`;
`utils/hrTemplates.ts`, `hrPolicy.ts`, `roleLadder.ts`, `documentPages.ts` (paginator shared by PDF
and print), `agreementPdf.ts`, `agreementPrint.ts`, `agreementTokens.ts`, `documentRef.ts`,
`idCard*.ts`; `pages/onboarding/JoinOnboarding.tsx`, `pages/public/VerifyEmployee.tsx`,
`api/onboarding.ts`. Collections `employee_profiles`, `hr_documents`, `hr_counters/{year}`
(references like `DTS/OFR/2026/0007`), `agreements`, `agreement_templates`,
`company_settings/main`, `public_badges`, `onboarding_invites`. 14 document types
(`HR_DOCUMENT_ORDER` is load-bearing; do not sort alphabetically). Both officers (CEO + CTO) sign
every type. Employment stages: `offer_issued → offer_accepted → probation → confirmed →
notice_period → exited`.

**9.16 Finance** ✅ (basic). `pages/accounts-admin/*`, `pages/main-admin/Accounts.tsx`,
`RevenueOverview.tsx`, `pages/shared/Profit.tsx`, `utils/profitAnalytics.ts`. Collections
`expenses` (CRUD), `other_income` (read only; **nothing in the code writes it**), `salary_receipts`.

**9.17 Analytics, leaderboards, reports, logs** ✅. Dashboards per role;
`pages/shared/Leaderboard.tsx` (team-scoped; sales members locked to Month view);
`pages/sales-admin/Analytics.tsx`; `components/analytics/MemberAnalyticsDashboard.tsx`;
`pages/shared/WorkReports.tsx`; activity feeds (`services/activityLog.ts` → `activityLogs`; sales
and tech ActivityHistory pages); session history (`sessions`); payroll audit (`services/auditLog.ts`
→ `audit_logs`).

**9.18 Training & sales scripts** ✅. `pages/*/TrainingModules.tsx` (admin CRUD),
`pages/*/Training.tsx` (members; filtered by department in `["tech"|"sales","all"]`),
`pages/sales-member/SalesScripts.tsx` (≈2.2k lines, .docx export, active festival from
`settings/salesConfig`). Collection `training_modules`.

**9.19 Notifications** ✅. See §18.

**9.20 Platform & engagement** ✅. PWA install button, update banner and popup (`components/layout/*`),
Capacitor plugins (`services/capacitor-plugins.ts`), Android back button, `BirthdayGreeting`
(`services/birthdays.ts`, `utils/birthdays.ts`), `ProfileCompletionPrompt`
(`utils/profileCompletion.ts`), `UpdatePopup` (work_assigned / work_editing / attendance_update
popups).

**9.21 AI Accounts (Flow credits, paid logins)** ✅ (2026-10-01). The team makes its videos in Google
Flow on Google AI Pro accounts from a Jio offer (1000 Flow credits a month each, for 18 months), and
every tech member opens 30 of them by 29 October at 2 a day. `pages/shared/AiAccounts.tsx` (tech admin
and team leader: Overview — totals, each member against the target, backups, credit calculator; Flow
accounts — search, filters, add for anyone, assign, disable, delete, history; Credit usage — the
month's ledger, edit/delete; Paid accounts; Settings — rates, monthly credits, validity, target),
`pages/tech-member/MyAiAccounts.tsx` (target card, "using now", own accounts, own credit entries, the
paid logins assigned to them, calculator), `components/ai-accounts/*`, `services/aiAccounts.ts`,
`hooks/useAiAccounts.ts`, `utils/flowCredits.ts` (pure rules), `types/aiAccounts.ts`. Collections
`flow_accounts` (id = lower-case email), `flow_account_secrets`, `flow_usage`, `paid_accounts`,
`paid_account_secrets`, `app_settings/flow_accounts`; `users.activeFlowAccountId`. Rules: credits per
clip 4 s = 7, 6 s = 10, 8 s = 12, 10 s = 15 (editable); an account's credits refresh on its creation
day each month (`cycleStartOf`, month-end clamped) and it expires 18 months after creation
(`expiryOf`); a member sees what they added, own or hold (`visibleTo`), a manager sees the team
(`teamAdminId`); an assigned account stays in its opener's target count and says "assigned to X by
Y"; passwords live in their own collections and are read only on Show/Copy; **every video job asks for
its Flow credits before it is marked complete** (My Work and Recent Ads through `useCreditGate`;
posters skip it; "No Flow credits" is allowed; a job handed in again shows what was already recorded
and starts at 0 clips); an ad can be split across accounts when one runs out; a ledger entry and the
account's cycle total move in one batch (`increment` on `usedByCycle.<cycleStart>`); a creation date
is fixed once credits are recorded. Paid ChatGPT (frames, footers, posters) and Grok (animations)
logins carry no credit maths: name, login, password, plan, renewal date, and who has them.

---

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
| `/smm` | `shared/SocialMedia.tsx` | SMM months list (scoped by `useSmmCampaigns`); "Start a month" for overseers |
|---|---|---|
| `/smm/:campaignId` | `shared/SmmCampaignPage.tsx` | One month: content table, item dialog, ads, money, reports, messages; `?tab=report` (or `ads` / `money`) opens on that tab |

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

---

## 11. FRONTEND ARCHITECTURE

- **Provider stack (`App.tsx`):** `QueryClientProvider` → `ThemeProvider` → `TooltipProvider` →
  `Toaster` + `Sonner` → `BrowserRouter` → `AppUpdateBanner` → `Suspense` → `Routes`.
- **Shell (`AppLayout`):** `Sidebar` (role navigation from `getNavItems`, collapsible groups,
  mobile drawer, logout) + `Topbar` (notification bell, profile) + `<Suspense><Outlet/></Suspense>`
  + lazy overlays: `VideoCallManager`, `DailyCheckinPrompt` (tech members only),
  `ProfileCompletionPrompt`, `MandatoryAgreementGate`, `UpdatePopup`, `BirthdayGreeting`, `SmmRenewalPopup` (sales members, z-[42]). It also
  mounts `useMyLeadsSync()` / `useMyOrdersSync()` (sales members) and `initFCM` once per user.
- **State:** zustand stores. `authStore` (user, loading), `sidebarStore` (collapsed),
  `callStore` (active call UI), `salesLeadsStore` / `salesOrdersStore` (session-long sales data;
  read with `useMyLeads()` / `useMyOrders()`, never open a second listener), `cinematicAdsStore`
  (the whole cinematic project plus debounced autosave). Everything else is page-local `useState`
  fed by `onSnapshot`.
- **Data access pattern:** a component or hook calls `onSnapshot(query(...))` or a service
  function; services wrap multi-step operations (assign, complete, verify, upsert order, SMM
  mutations) and fire notifications and activity logs. Pure calculations live in `utils/`.
- **Typical flow:** user action → handler in page → `services/*` (Firestore writes, often several
  in order, plus `sendNotification`) → Firestore → `onSnapshot` listeners on every open screen
  update state → UI. There is no optimistic cache layer; a few pages patch local state after a
  write.
- **Forms/validation:** manual; inline error strings and toasts; validation helpers in utils
  (e.g. `hrPolicy.isValidPan/isValidAadhaar`, `posterSpec.isValidPosterSize`, phone
  normalisation in `utils/phone.ts` which gives `+91…` plus a digits-only id).
- **Loading/error:** `Loader2` spinners, per-page `loading` flags, `try/catch` + destructive
  toast. Many services "never throw" by contract (log and continue) so a secondary write cannot
  break the primary action. `useConfirm()` provides promise-based confirm dialogs.
- **Styling:** Tailwind utility classes, shadcn components, role colours (`bg-role-*`), brand
  gradient for the AI platform (`components/ai-platform/brand.ts`). Mobile-first, with a 412px /
  390px phone width checked in past sessions. Watch the `min-w-0` trap on grid/flex items.
- **The AdGen studio (`.adgen`)** is the one place with its own design system:
  `components/ai-platform/adgen.css` defines tokens (`--ag-canvas #020617`, glass surfaces, the
  violet→blue→cyan `--ag-accent`) and component classes — `ag-card`, `ag-panel`, `ag-acc`
  (output sections), `ag-btn` (+`--primary/--secondary/--ok/--danger/--icon/--sm/--lg`), `ag-chip`
  with `ag-badge--ok/run/warn/bad/info`, `ag-drop` (upload states `--over/--done/--error/--owner`),
  `ag-progress`, `ag-track`, `ag-step`, `ag-tile`, `ag-code`/`ag-codebar`, `ag-bar` (the 46px utility
  band above the deliverables), and — for the one-screen
  layout (2026-09-24) — `ag-sec` (+`ag-sec__head`/`__body`), `ag-morph` (the one-at-a-time panel
  transition), `ag-ico`, `ag-tile-up`, `ag-steps`/`ag-stepnode`/`ag-stepline`, `ag-row` (72px numbered
  row) and `ag-strip`, plus the type classes
  `ag-display/ag-h2/ag-num/ag-eyebrow/ag-mono/ag-muted`. The `ag-*` classes and the tokens are
  global (the prefix keeps them out of the way) because Radix portals — the AI Guide sheet, the spec
  dialog — render outside the platform's root; `.adgen` itself carries the canvas, colour scheme,
  fonts, field styling and scrollbars, so no other page is affected. The studio is dark whatever the app theme is
  (`STUDIO_IS_DARK` in `brand.ts`, plus `color-scheme: dark`); components opened OUTSIDE it —
  `CodeVerificationModal`, on My Work / Recent Ads — still follow `next-themes`.
- **Documents:** `AgreementView` renders letters with inline styles. `utils/documentPages.ts`
  paginates into A4 sheets used by both `agreementPdf` (html2canvas → jsPDF) and `agreementPrint`
  (native print). Print CSS at the end of `index.css` releases the fixed-height shell.

---

## 12. BACKEND & API ARCHITECTURE

The backend is Firestore (accessed directly from the client) plus **three Vercel serverless
functions** in `api/`. Each initialises `firebase-admin` from `FIREBASE_SERVICE_ACCOUNT_KEY` and
accepts `POST` only (`OPTIONS` → 204). There is no Express server, no middleware stack, no
background worker. `vite dev` does **not** serve `/api/*`; use `vercel dev` or the DEV-only
fallbacks.

### `POST /api/send-notification` (`api/send-notification.ts`)
- **Purpose:** send an FCM push to all of a user's device tokens.
- **Body:** `{ userId, title, message, link?, type?, callDocId? }` (400 if the first three are
  missing).
- **Auth:** **none**. CORS header only for `https://localhost` (Capacitor) and the production
  origin. Server-to-server calls are not blocked.
- **DB:** reads `fcmTokens where userId==`; deletes invalid tokens.
- **Payload:** data-only (no `notification` key) so the service worker or native layer renders
  one notification. Channel `calls` / `messages` / `default`; call TTL 0.
- **Response:** `{ success, sent, failed, cleaned }` or `{ sent: 0, reason }`.
- **Callers:** `services/notifications.sendNotification` (fire-and-forget; native uses the
  absolute production URL).

### `POST /api/order-chat` (`api/order-chat.ts`), `{ action, chatId, ... }`
| action | Auth | Does |
|---|---|---|
| `open` | holding the link | 404 if the room is missing or `clientReady === false`; returns a **custom token** for `guest_<chatId>` with claim `orderChat=<chatId>` plus the room summary |
| `register-push` | guest token (Bearer) | stores the client's FCM token |
| `notify` | guest token | alerts the room's staff (skips anyone present by heartbeat `activeAt`, 120s) |
| `notify-client` | staff participant | pushes to the client (message or call) |
| `enquiry-target` | guest token | returns the seller's `businessWhatsapp` for "ask about another ad" |
| `submit-review` | guest token | validates 1–5 stars, mirrors the review to `orders` and `clients` |
CORS: production, `dreamteamos-*.vercel.app` previews, `https://localhost`, `http://localhost:*`.
Notification links per recipient come from `homeFor(role)`.

### `POST /api/onboarding` (`api/onboarding.ts`), `{ action, inviteId, code, ... }`
Actions `open` · `accept-offer` (signature URL) · `accept-joining` (creates the account) ·
`decline` (reason). Every call re-checks the 4-digit code (lockout after 5 tries for 15 minutes; 410
revoked or expired, 409 wrong state). `publicView()` names the fields that go out (a test forbids
`accessCode`, `generatedPassword`, `failedAttempts`). `provision()` writes in one batch:
`users/{uid}` (`createdBy` = inviting admin), `employee_profiles/{uid}`, two signed `hr_documents`,
`member_credentials/{uid}`. It is idempotent via a claim transaction and rolls back to
`offer_accepted` on failure (e.g. `email_taken`). DEV fallback: `services/onboardingGuest.ts`
performs the same steps in the browser when `import.meta.env.DEV`.

### Client-side "service layer" (the real API surface)
Treat these exported functions as the internal API. Reuse them instead of writing parallel
Firestore code:
`orders.upsertOrderForSale / cancelOrderForSale / markOrderCompleted / revertOrderToAssigned /
revertOrderToUnassigned / deleteOrders / restoreOrders / purgeOrders / reconcileManualOrders /
extendOrderPromise / updateOrderProgress / setOrderTracks / addOrderPenalty / notifyDueOrdersOnOpen`,
`workAssign.createWorkAssignment / unassignWork`, `workReassign.reassignWork`,
`workVerify.verifyAssignments`, `useCompleteWork().complete`, `numberLock.claimNumber /
adminAssignNumber / applySaleFreeze / …`, `clients.upsertClientOnWorkComplete /
upsertClientOnWorkVerify`, `orderChat.*`, `smm.*`, `notifications.sendNotification /
notifyTechTeamLeaders`, `activityLog.logTechActivity / logActivity`, `hr.*`, `hrDocuments.*`,
`payroll.*`, `payrollRun.*`, `leave.*`, `settlements.*`, `aiAccounts.*` (Flow and paid accounts,
`recordFlowUsage / editFlowUsage / deleteFlowUsage / usageForAssignment`), `smmAssign.assignSmmMonth`
(the ONLY way to put people on an SMM month), `smmSetup.findSmmSalesForPhone / leadForSeller /
setupSaleMonth / applyMonthSetup`, `smmAssign.fetchMyMonthJobs`, `workDrive.markDriveUploaded / askAdminForDriveFolder`.

---

## 13. DATABASE ARCHITECTURE (Cloud Firestore)

No schema files or migrations exist. Shapes are the TypeScript interfaces in `src/types/*`.
Timestamps are typed `any` (Firestore `Timestamp`/`serverTimestamp()`); `Timestamp.now()` is used
inside arrays. **Composite indexes are not in the repo** (no `firestore.indexes.json`). Any
index a query needs lives only in the console [NOT CONFIRMED].

### Core collections
| Collection (doc id) | Type | Key fields / notes |
|---|---|---|
| `users/{uid}` | `AppUser` | `role`, `name`, `email`, `phone`, `createdBy` (**team key**), `isActive`, `salary` (mirrors package), `salaryPackageId`, `dailyTarget`, `earningsOption` (`stipend_plus_5`/`incentive_10`), `employmentType`, `externalCreator`, `smmLeader`, `employeeId`, `avatar`, `dob`, `businessWhatsapp`, `signatureUrl`, `designation`, `googleDriveBaseUrl`, `activeFlowAccountId` (the Flow account in use). Deprecated: `target`, `monthlyTarget` |
| `leads/{auto}` | `Lead` | `assignedTo` (sales member), `assignedBy`, `phone` (+91…), `displayName`, `realName`, `status` (`not_called`/`answered`/`not_answered`/`call_later`/`not_interested`), `notes`, `saleDone`, **`saleItems: SaleDetail[]`** (legacy `saleDetails`), freeze mirrors (`frozen`, `saleFrozen*`), `duplicateCleared`, `isCustomEntry` |
| `numberLocks/{digitsPhone}` | `NumberLock` | `ownerId`, `ownerLeadId`, `reserveExpiresAt` (+24h), `saleFrozen`, `saleFrozenUntil`, `timeline[]` (`claimed`/`taken_over`/`sold`/`admin_override`) |
| `schedulePools/{auto}` | `SchedulePool` | `createdBy`, `assignedTo`, `numbers[]`, `releasedCount`, `dailyLimit`, `minCompletionPercent`, `isActive`, `lastReleasedDate` |
| `orders/{o_<leadId>_<submittedAtMs>}` (legacy `o_<leadId>__<idx>`) | `Order` | client (`clientPhone`, `clientPhoneId`, `businessName`, `clientName`), sale copy (`category`, `packageKey`, `amount`, bulk/discount fields, `requirement`, `promise`), link (`leadId`, `saleItemIndex`, `saleItemKey`, `saleSubmittedAtMs`), attribution (`soldBy`, `soldByName`, `salesAdminId`, `fromAd`), `saleVerified`, **`status`**, `workAssignmentId`, `assignedTo`, `progress` (SMM/bulk), `bulkVideos[]`, `penalties[]`/`penaltyTotal`, `updateNotes[]`, `feedback` (after-sale call), `clientReview` (mirror), tombstone/restore/retire fields |
| `work_assignments/{auto}` | `WorkAssignment` | `assignedTo`, `assignedBy`, `category` (`wishes`/`promotional`/`cinematic`/`bulk_ads`/`social_media_management`/`poster`), `clipCount`, `duration`, `pricePerUnit`, `uniqueId` (W/P/C/PS/O + number), **`accessCode`** (4 digits), `status`, `sessions[]`, `totalDurationSeconds`, `date`, ad spec (`modelGender`, `attireType`, `customAttire`, `aspectRatio`, `language`, `festival`, `characterPack`, `customCharacter` (Custom Character only), `realLocationProvided`, poster fields), brief (`requirementNotes`, `businessInfo`, `businessAddress`), `orderId`, `chatId`, `promise`, `tracks[]`, `savedGenerationId`, `saleDeleted*`, `reassignedFrom/By/At`, `driveUploadedAt` / `driveUploadPath` / `driveFileName` (the member's word that the file is in their Drive, 2026-10-03; cleared on each hand-in) |
| `clients/{digitsPhone}` | `Client` | profile assets, `works[]`, totals, `reviews[]` (server-written), `salesAdminIds[]`, `soldByIds[]` (array-contains scope), `firstSoldBy`, review/loyalty mirror |
| `order_chats/{chatId}` (+`messages`) | `OrderChatDoc` | `chatId` = order id for sold work, else assignment id (`utils/orderChatId.orderChatIdOf`). `participants[]`, `accessCode`, `status` (`open`/`locked`), `clientReady`, `activeAt` heartbeats, `unreadCounts`, `clientReview`, member/seller/assigner ids |
| `smm_campaigns/{orderId or auto}` | `SmmCampaign` | `origin` (`sale` / legacy `direct` / `no_sale` — no order, amount 0, `soldBy` = the salesperson), `orderId` ("" for direct and no-sale months), `watchers[]`, `soldBy`, `team`, `items[]` (content with approval, chases, per-platform `postUrls`, extra work's `extraType`/`extraDuration`, `carriedFrom`), `adRuns[]` (day reports, budgets), `budgetPayments[]`, `cycle` (start → same date next month), `commitments`, `renewal` (+`nextCampaignId`), `status` (`active`/`completed`/`renewed`/`lapsed`/`removed`/`deleted`), `deletedAt`/`deletedByName`; 2026-10-03: `clipsPerVideo`, `pageLinks`, `renewalOf`, `monthNumber`, `setupAt/ByName/ByUid`, `history`, `carriedOut[]`, `businessNameEdited`. Related: `SaleDetail.enteredBy`, `SmmSaleSpec.clipsPerVideo/renewalOf`, `WorkAssignment.smmCampaignId` |
| `smm_templates/{auto}` | `SmmTemplate` | saved client message wording (company-wide) |
| `ai_generations/{auto}` | `SavedGeneration` | `userId`, outputs (`mainFramePrompts[]`, `headerPrompt` (the VIDEO BOTTOM LABEL), `posterPrompt`, `voiceOverScript`, `veoPrompts[]`, `stockImagePrompts`, `overlayTexts` (each with `imagePrompt` / `imageDesign`), `posterConcepts`, `coreMessage`, `sceneContext` (motive + per-clip background and staging/camera/angle/focus), `voiceBrief`, `scriptQa` (the voice-over's quality-gate score, pass and drafts)), all form settings incl. `frameInstructions` and `customCharacter`, `creationMode`, `createdAt`/`updatedAt`. Generate = new doc (a version); Save and auto-save update it |
| `cinematic_projects/{auto}` | `CinematicAdsProject` | `createdBy`, `name`, `currentStep`, `stepsCompleted`, brief, stories, boards, cast, clips, editing guide, deliverables, `delivered`, `updatedAt` (ms). `File` objects stripped |
| `notifications/{auto or dedupeKey}` | — | `userId`, `type`, `title`, `message`, `read`, `link`, `meta`, `createdAt` |
| `fcmTokens/{token}` | — | `userId`, `token`, device id |
| `activityLogs/{auto}` | `ActivityLogEntry` | actor, `action`, `details`, `adminId` (sales + tech feeds) |
| `sessions/{auto}` | — | `userId`, `loginAt`, `logoutAt`, `duration` (minutes) |
| `flow_accounts/{lower-case email}` | `FlowAccount` | `email`, `phone` (login number), `createdOn`, `expiresOn` (+18 months), `monthlyCredits`, `addedBy*`, `ownerId/Name` (whose target it counts toward), `holderId/Name` (who uses it), `visibleTo[]` (adder, owner, holder), `teamAdminId`, `status` (`active`/`disabled`), `usedByCycle` (cycle start → credits used), `lastUsed*`, `notes`, `history[]` |
| `flow_account_secrets/{same id}`, `paid_account_secrets/{id}` | `AccountSecret` | `password` only — read on Show/Copy |
| `flow_usage/{auto}` | `FlowUsageEntry` | one ad (or manual entry) on one account: `accountId`, `userId`, `teamAdminId`, `assignmentId`/`uniqueId`/`businessName`, `rows[]` (seconds × count), `credits`, `cycleStart`, `date`, `month` (`yyyy-MM`), `source` (`completion`/`manual`), `editedBy*` |
| `paid_accounts/{auto}` | `PaidAccount` | `provider` (`chatgpt`/`grok`/`other`), `label`, `email`, `plan`, `renewsOn`, `assignedTo[]`, `assignedNames`, `teamAdminId`, `history[]` |

### HR / pay / other collections
`employee_profiles/{uid}` (`EmployeeProfile`: PAN, Aadhaar, addresses, CTC, stage, probation,
KYC docs, assets, separation; the most sensitive collection) · `hr_documents/{auto}` (`HrDocument`:
type, bodyText, `signatories[]`, status `issued`/`signed`/`declined`, view/download stats) ·
`hr_counters/{year}` · `agreements/{auto}` · `agreement_templates/{adminUid}_{category}` ·
`company_settings/main` (identity, logo, officer signatures, stamp) · `public_badges/{uid}`
(card-face only) · `onboarding_invites/{10-char id}` (terms, frozen letters, signatures, access
code, generated password after completion) · `member_credentials/{uid}` (**readable passwords**)
· `daily_checkins` · `attendance/{memberId}_{date}` · `holidays/{date}` · `salesCheckins` ·
`leave_requests` · `salary_packages` · `payroll_config/default` · `employee_bank/{uid}` ·
`payroll_runs/{month}` · `payroll_lines/{month}_{memberId}` · `salary_receipts` ·
`commission_settlements` · `settlement_requests` · `audit_logs` · `review_tasks` · `expenses` ·
`other_income` · `training_modules` · `chatRooms` (+messages) · `calls` (+candidates) · `meetings`
(+participants, signals) · `settings/salesConfig` (`activeFestival`) · `app_settings/ad_languages`,
`app_settings/clients_backfill`, `app_settings/flow_accounts` (credit rates, monthly credits, validity, target).

### Key relationships
```
users(admin) 1─* users(member)            via member.createdBy
users(sales_member) 1─* leads             via lead.assignedTo
leads 1─* saleItems (embedded)            1 saleItem ─1 orders (orderDocId; saleItemKey idempotency)
orders 1─0..1 work_assignments            order.workAssignmentId ⇄ assignment.orderId
orders 1─1 order_chats                    chat id = order id (sold work)
orders 1─0..1 smm_campaigns               campaign id = order id (social_media_management)
work_assignments *─1 users(tech_member)   assignment.assignedTo
work_assignments 0..1─1 ai_generations    assignment.savedGenerationId
clients(phone digits) 1─* works           built from orders/assignments on complete/verify
users 1─1 employee_profiles / employee_bank / public_badges / member_credentials (doc id = uid)
users(tech) 1─* flow_accounts             via ownerId (target count) and holderId (in use)
flow_accounts 1─* flow_usage              via accountId; usedByCycle mirrors the entries' credits
```

### Status fields
- **Order.status:** `unassigned` (in the queue) → `assigned` (work linked) → `completed` (member
  submitted; "Awaiting verify") → `verified` (leaves the active queue). `cancelled` (sale
  rejected, deleted or over-discounted; reactivates on re-verify). `deleted` (permanent tombstone;
  never recreated by the sale; can be restored; tech_admin can purge).
- **WorkAssignment.status:** see §16.
- **SaleDetail.verificationStatus:** `pending` → `verified` or `rejected`.
- **ReviewTask.status:** `requested` → `review_uploaded` → `verified` → `completed`.
- **SMM item:** `planned`, `in_progress`, `awaiting_approval`, `changes_requested`, `approved`,
  `scheduled`\*, `posted`\* (\*approval required).
- **Onboarding invite:** `sent`, `offer_accepted`, `completed`, `declined`, `revoked`.
- **Leave:** `pending`, `approved`, `rejected`, `cancelled`. **Check-in:** `checked_in`,
  `pending_approval`, `approved`, `rejected`.

---

## 14. AUTHENTICATION & SECURITY

- **Login:** `signInWithEmailAndPassword` → `getDocFromServer(users/{uid})` (falls back to
  cache offline). Missing profile → "Account not found", except a hard-coded seed email that
  auto-creates a `main_admin` doc. `isActive === false` → sign out plus message. A `sessions` row
  is added (fire-and-forget). Navigate to `defaultRouteForUser`.
- **Session:** Firebase Auth persistence (SDK default). `useAuth` subscribes to `users/{uid}` and
  **only ends a session on a server-confirmed answer**: a cache miss or listener error re-checks
  the server and never logs the user out while offline. It calls `reportCacheTrouble` for cache
  repair.
- **Logout (`Sidebar.handleLogout`):** closes open `sessions` rows → `signOut` →
  `deleteFCMToken` → `clearWorkUnlocks()` → `/login`.
- **Registration:** no self-signup UI. Accounts come from admins (`createUserWithoutSignOut` on a
  secondary Firebase app) or from the hiring link (`api/onboarding`, server-side
  `auth().createUser`).
- **Passwords:** Firebase Auth hashes them. The app **also stores the plaintext password** in
  `member_credentials/{uid}` so admins can re-share logins (by design). The main admin can send a
  Firebase reset email.
- **AI account passwords** (Flow, ChatGPT, Grok) are stored readable in `flow_account_secrets` /
  `paid_account_secrets` (the team shares these logins), never in the list documents, and fetched only
  on Show/Copy (`SecretField`). The rules in `docs/firestore-rules.md` limit them to the account's users
  and the tech managers — once published.
- **Guests:** client chat uses custom tokens with an `orderChat` claim on a **separate Firebase
  app instance** (`orderChatGuest.ts`, in-memory cache), so a guest never displaces a staff login
  on the same browser.
- **Work access code:** each assignment has a 4-digit code the member must enter once per job,
  per person, per device (`utils/workUnlock.ts`, localStorage). This is a speed bump, not a
  security control: the code sits on the same Firestore document.
- **Frontend protection:** route guard plus UI checks (§8). **API protection:** see §12.
- **Firestore rules:** the intended model is in `docs/firestore-rules.md`. It was recorded
  **not published** on 2026-08-03, with unauthenticated reads of `employee_profiles` (PAN, Aadhaar,
  salary) returning 200 at the time. Current live state is **[NOT CONFIRMED]**. The doc includes a
  curl check that should return 403 for each sensitive collection once published.
- **Secrets in source (values not reproduced here):** Firebase web config (public by design) in
  `services/firebase.ts` and duplicated in `services/secondaryAuth.ts`; a **Gemini API key** in
  `services/gemini.ts` (dead code); **Metered.ca TURN username/credential** in
  `services/webrtcConfig.ts`; Cloudinary cloud name plus unsigned preset in
  `services/cloudinary.ts`. `.env` and `android/app/google-services.json` are gitignored.

---

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

---

## 16. TASK MANAGEMENT (work assignments + orders)

"Tasks" in this app are **work assignments** (`work_assignments`), normally created from
**orders**.

**Creation (`createWorkAssignment`, the only path).** Callers are both Work Assign pages and the
Orders queue. Inputs: assignee, category, duration, clip count, price per unit, uniqueId
(`nextWorkUniqueId`: W/P/C/PS/O + sequence), brief and ad spec (pre-filled from the order via
`assignmentFormFromOrder`), optional tracks (SMM split: `ad_creation` / `social_upload` /
`digital_marketing`). Side effects, in order:
1. adopt an unassigned order for the same phone if none was given;
2. `addDoc` the assignment (4-digit access code);
3. attach to the order's chat (or create a chat on the assignment id);
4. order → `assigned`;
5. notify the assignee (dedupe key, includes the client note);
6. `logTechActivity`.

The page also shows a WhatsApp-ready requirements message (`RequirementsShareModal`). Tech admin
assignment also notifies team leaders.

**Statuses (`WorkAssignmentStatus`):**
| Status | Set by | Meaning / side effects |
|---|---|---|
| `assigned` | `createWorkAssignment`, `reassignWork` | Waiting for the member |
| `in_progress` | Member opens the job (My Work / Recent Ads) from `assigned` or `editing`; also **Undo completion** | Being worked. Sessions (open→close, >5s) accumulate `totalDurationSeconds`. Chat status synced |
| `completed` | Member submits (`useCompleteWork`) — a video job first asks for the Flow credits it used (`useCreditGate`, §9.21) | Notifies the assigner + team leaders (dedupe keys), order → `completed`, chat **locked as delivered** (invites the client review), client record upserted; the job's previous Drive mark cleared. The Drive step is already on screen from the moment of the submit (§9.6) |
| `editing` | Tech admin / team leader "send back" (MemberAssignments, WorkReports) | Order → `assigned`, chat reopened, member notified `work_editing` |
| `verified` | Tech admin / team leader (`verifyAssignments`, bulk or single) | Member notified, chat shows Delivered, `upsertClientOnWorkVerify` (order → `verified`, client works/totals), activity logged |

**Other operations:** `unassignWork` (deletes the assignment; order → `unassigned`; chat kept and
detached; member told) · `reassignWork` (move to another member; resets sessions and completion)
· spec edits (`utils/assignmentEdit.ts`, `assignmentSpecDiff.ts`; the member sees a
`SpecUpdateDialog`). All three edit dialogs (both MemberAssignments pages and Work Reports) also edit
the occasion of a wishes ad and the brief — business info, address, client's notes
(`components/work/AssignmentBriefFields`, `briefPatch`, written whole so a cleared field stays cleared;
`useAssignmentBrief` reads the order only for a field the job never carried). On the member's side the
job's spec is applied by one util (`utils/assignmentFormSpec`) when the job opens, when it changes, and
ON TOP of a reopened kit, so a restored kit can never put an old value back into a locked field; a kit
made for an older spec shows a "made for an earlier version of the job" banner with the differences · sale deleted after assignment → `saleDeleted` banner, work kept · sales
member **update notes** once assigned (`addOrderUpdateNote`).

**Priority:** there is **no priority field**. Queue order comes from `utils/orderSort.ts` /
`orderQueue.ts` (deadline and state) and `isPinnedOrder`.

**Deadlines:** `PromiseDeadline` chosen at sale (`presetKey`, `hours`, `startAt` = sale time,
`dueAt`). **One extension** allowed (`canExtendPromise`, `extendOrderPromise` writes the order and
mirrors it onto the assignment, never the sale). `notifyDueOrdersOnOpen` (Orders page open) alerts
the assignee, seller, tech admin and team leaders when a job is near or overdue.

**Multi-deliverable orders:** `OrderProgress` (targets/done counters `ads`, `posters`, `posted`,
`stories`, `campaigns`; tracks and owners; log). Derived from the SMM plan when
`progress.derived`. Bulk orders carry `bulkVideos[]` slots (`n`, owner, status `pending` /
`assigned` / `completed`).

**Penalties:** `addOrderPenalty` (clips × rate, by sales member or tech admin), kept out of
`amount` and commission.

**Comments / attachments:** no per-task comments. Communication goes through the **order chat**
(files, voice, images). Admins attach nothing to the task itself.

**Search / filters:** day filters (Today / Yesterday / N days / date picker), member cards,
category filters (`useOrderCategory`), period filters (`utils/periodFilter.ts`, cycle 10th→9th),
Orders tabs (active / delivered history paged by `ORDER_HISTORY_PAGE = 300` / removed).

**Task dashboards:** tech admin Dashboard, Work Assign (member workload cards,
`MemberWorkloadCard`), Work Done & Reports, member analytics, `AdsStatusBoard`.

---

## 17. ADVERTISEMENT GENERATION

### 17.1 Overview
Three generation surfaces, all **prompt factories**. The app writes scripts and image/video
prompts with Gemini; **no image or video is generated inside the app**. Members copy prompts
into external tools (links in `generation/mission.ts`: ChatGPT, Gemini, Google Flow/Veo), then
upload or deliver the results.

| Surface | Where | Who |
|---|---|---|
| AI Ads Platform: **Video Ad** | `AIPlatformApp` via My Work / Recent Ads (with an assignment), Tools, `/tech/create` | tech member (job), tech admin / leader (Tools), external creator |
| AI Ads Platform: **Poster Creation** | same component, `creationMode: 'poster'` (locked for poster jobs) | same |
| **Cinematic Ads** 7-step pipeline | `/tech-admin/cinematic-ads` | tech admin |

Also: Tools → **Script Duration Checker** (`extractScriptFromImage`, `convertToVoiceOverScript`,
`suggestClipCount`), `formatAgreementWithAI` (HR), `readMetaAdsReport` (SMM ad-report
screenshot → leads/spend/cost-per-result/reach).

### 17.2 Video Ad flow (`AIPlatformApp` → `geminiService.generateAdAssets` → prompts)
**Inputs** (`AdFormData` in `types/aiPlatform.ts` + `FileStore`):
- ad type `commercial` / `festival` (+ festival name);
- model gender (female default) and attire (`traditional` saree, `professional` suit,
  `shirt_pant`, `custom` text). Attire options come from `utils/adRequirement.attireOptionsFor`
  (by pack cast; the male & female duo gets `MIXED_DUO_ATTIRE`, each person dressed for themselves);
- duration (16 / 32 / 48 / 64 s or custom; 8-second clips);
- aspect ratio `9:16` / `16:9`;
- language (Telugu default);
- no-logo name board (also used automatically when no logo FILE is attached, see below);
- special category `characterPack` (38 entries: human "Normal Ad", owner face, **human duos**
  (`human_duo_female` / `human_duo_male` / `human_duo_mixed`, family `human_duo`, speakers
  speakers "Girl"/"Boy" on the mixed duo and "Friend"/"Host" on the same-gender ones — role labels
  that are never spoken, now ENFORCED by `validateDialogueClips` `forbiddenNames` against each
  character's `labelSpellings`), **Kids** (`kids_duo_girls` / `kids_duo_boys` / `kids_duo_mixed`,
  family `kids`, 2026-10-01: photoreal children with child voices, kid attire options and labels,
  family-safe negatives), deities, cartoon duos/solos, custom);
- `customCharacter` — the Custom Character's description (required for that pack; written into
  the pack by `characterPacks.withCustomCharacter`, one resolver `packFor` in geminiService);
- `locationMode` (`real_provided` uses the client's store photos, `ai_generated`);
- **BUSINESS CONTENT** box (`textInstructions`, the authoritative facts) and **FRAME /
  BACKGROUND INSTRUCTIONS** box (`frameInstructions`, highest priority for backgrounds); when empty,
  the visiting card and other files fill in;
- optional custom script;
- files: logo, **owner image** (`ownerImage`, own slot, required for Real Owner Face), visiting
  card, store images, product images, flyers, voice recording. There is **no document upload**:
  `FileUpload` refuses PDF, documents, text files, video, non-images on image slots and images over
  10 MB, and the platform shows a highlighted "extract it in Gemini, paste into BUSINESS CONTENT"
  box with a copyable extraction prompt. Drag & drop works on every slot.

An assignment **pre-fills and locks** spec fields it carries (gender, attire, ratio, language,
festival, pack, custom character, background, duration, poster size/style/occasion). Live spec
changes raise `SpecUpdateDialog`.

**Speed (2026-09-29, measured live):** a 4-clip Telugu ad took 129 s plus the B-roll/overlay tail;
it now takes ~70–90 s with B-roll and overlays INCLUDED (a Motu & Patlu ad 161 s → 108 s). What
overlaps: the poster starts right after extraction; the client-photo scout runs while the script is
written; a scene plan starts on every draft the quality gate considers (`planScenesEarly`, keyed by
the draft's lines) so the shipped draft is already planned; B-roll and overlays run inside the run
alongside frames and Veo (`GenerationOptions.extras`, the studio passes its stock theme and only
re-asks for one the run could not write). The native-speaker review now runs only when the gate asks
for a polish or could not run. Every pipeline call states an effort (§17.3). Images are downscaled
once per file before upload (`utils/fileHelpers.fileToBase64`: longest edge 2048 px, same format,
cached; small images and anything the browser cannot redraw go as they are).

**Pipeline (progress messages in order):**
0. Voice note (if any) heard on its own first: `understandVoiceInstructions` (`prompts/voiceNote.ts`,
   `utils/voiceBrief.ts`) → transcript, summary, requirements, conflicts with the typed content.
   Its text goes into extraction and is merged into the profile as `clientVoiceInstructions`.
1. Extract business intelligence from all files (`EXTRACTION_SYSTEM_PROMPT`), then **verify it**
   (`verifyExtraction` → `utils/businessFacts`): numbers the member typed (BUSINESS CONTENT, text files,
   the voice note's transcript) are ground truth; a number the model "read" is kept only when a
   visiting card, flyer or premises photo is attached, it is well-formed, not a placeholder, and not a
   one-digit misreading of a typed one; a typed `Address:` line (or the job's address) is used word for
   word, a read address only with a document behind it or ≥60% of its words in the typed text. The
   profile every later prompt reads is rewritten (`sanitizeBusinessProfile`) to carry only
   `contactNumbers` / `whatsappNumber` / `address` that passed, with every "Not provided" and every
   unverified town, email or website removed. The BUSINESS CONTENT brief a job opens with now also
   carries the business name and the client's notes, and a corrected brief is merged into a box the
   member already edited (`mergeBriefIntoInstructions`).
2. Decide the core message (`prompts/coreMessage.ts`).
3. Write the voice-over (`VOICEOVER_SYSTEM_PROMPT`, language-aware, 18–20 words per clip; a
   two-speaker clip is **15–17**, 7–9 per line, `dialogueFormat.wordBudgetFor`). Mechanical repair
   (≤2 passes), native-speaker quality review (AI scripts only), second repair. Checks include
   everyday speech, festival wish, and `utils/speakingPosition` (a line that sends the viewer
   "elsewhere" while the speaker stands inside the business). **Address (2026-10-01):** when the
   verified facts carry an address, the LAST clip says it in spoken form
   (`utils/spokenAddress.spokenAddressOf`: landmark + area / town, never a door number or pincode,
   ≤ 6 words, transliterated into the script's language); no clip may invent one (`addressIssues` →
   repair; `prompts/address.addressRuleBlock` on every writer, repair, edit and review prompt). Character packs use
   `prompts/characterAd.ts` dialogue prompts. **A custom script is used word for word**
   (`utils/customScript.ts`): labelled clips verbatim (only emoji/decoration stripped); unlabelled
   text is split at sentence ends (a model split is kept only if `sameWords` holds); no repair or
   review; a two-speaker pack needs `[Speaker]:` lines or the run stops with a format message.
   `voiceOverFormat.parseLabeledClips` accepts many header shapes (round brackets, bold, no colon,
   `Scene N`, full-width colon). A pack script is stored in the DISPLAY form (`[Motu]: …` under a
   clip header) and re-read by the Veo step and the refine editor, so
   `dialogueFormat.parseDialogueClips` must resolve a speaker LABEL — including a multi-word name
   like `[Chhota Bheem]` — back to the pack's single-word key; pass it `packSpeakers(pack)`, not
   bare aliases (2026-09-23).
   **Quality gate (every generated script, single voice or a cast; never a member's own):** a separate
   judge (`prompts/scriptQa.ts`) never rewrites — it checks every claim against the business facts and
   scores facts, language (educated, well-spoken, natural register), persuasion, clarity, relevance and
   speakability; `utils/scriptQa` decides in code: pass (overall ≥ 8, each ≥ 7, facts ≥ 9, no
   unsupported claim) ships; `polish` sends the judge's exact problems to the native-speaker editor;
   `rewrite` writes a NEW draft told what failed. Every draft is judged again; the best of up to three
   ships (`isBetterDraft`: no invented facts first, then score). Extra drafts are written AT THE SAME
   TIME and judged together (one for a polish, every remaining draft for a rewrite), with a 60 s
   deadline (`SCRIPT_GATE_DEADLINE_MS`) after which the best so far ships. The result is `scriptQa` on the kit
   ("Script QA 8.6/10" on row 4). A judge that cannot run never blocks the ad.
4. For real locations: review the client's photos and assign them to clips round-robin (a photo is
   reused, never replaced by an invented zone); each is the clip's **background plate**
   (`utils/locationAssignment.backgroundPlateRule` / `withBackgroundPlate`, `prompts/realLocation`):
   kept exactly as photographed, only enhanced to 8K, the cast placed into it, and attached to the
   frame writer's call. Otherwise the **scene
   plan** (`prompts/scenePlan.ts`, `utils/scenePlan.ts`): the video's motive (annadanam, temple,
   birthday, invitation, promotion…), its world, and one DIFFERENT background per clip from that
   clip's line; retried once if `repeatedBackgrounds` finds a repeat.
5. Main-frame prompts per clip (`MAIN_FRAME_SYSTEM_PROMPT` / `MULTI_FRAME_SYSTEM_PROMPT` with the
   scene plan; `CHARACTER_MULTI_FRAME_SYSTEM_PROMPT` with `sceneBackgrounds` / `nameBoard`). Stamped
   in code: motion composition, `withSceneBackground`, `frameBrand.nameBoardInPlaceOfLogo` when there
   is no logo file, `withOwnerImageDirective` for Real Owner Face, the photo attach line, a **cast sheet** for invented
   people (`utils/castSheet`: Normal Ad, human duos, Kids — one fixed face and outfit per person,
   seeded by the business name; the Veo prompt names each speaker by how they look) and a pack's
   **scale anchor** (`withScaleAnchor`: e.g. Motu and Patlu's height against a real counter). VIDEO
   BOTTOM LABEL (`buildVideoBottomLabel`, code-assembled from `prompts/lowerThird.ts`, fed the festival
   theme and the video's motive / core message) and the poster prompt (`writeVideoPosterPrompt`,
   `POSTER_SYSTEM_PROMPT`) — both from the VERIFIED facts: exactly as many contact pills / numbers as the
   business has (1–3, laid out for the count), no address strip or line when there is none, and
   `stripUnverifiedNumbers` on every model-written poster, concept, overlay and refine. A poster that
   fails twice leaves one Missing row instead of failing the run. Frames the model skipped are written
   for exactly those clips (never a copy of the last frame), and the retry carries the images.
6. Direct performance and camera per clip (`prompts/motion.ts`) → **Veo 3 prompts**. **Motion
   policy (2026-10-01): the video animates its own frame and nothing beyond it.** Each Veo prompt
   opens with THE ATTACHED FRAME — a summary of that clip's own main-frame prompt (`frameSummaryOf`) —
   and a FRAME BOUNDARY rule: nothing the frame does not show may appear. A different place in the
   shop (the entrance, a counter, a rack) comes from a different FRAME, never from the camera. Stagings
   are all in place: `stand_present`, `show_product`, `present_space`, `welcome_invite` (always the
   last clip; an invitation, **never a goodbye wave**); a saved plan's old `walk_and_talk` reads as
   `present_space`. The plan (`planClipMotion`) takes the scene plan's per-clip `staging` / `camera` /
   `angle` / `focus` choices, else reads each line (`stagingForLine`: product words → show, place
   words → present the space, trust words → stand), and never repeats a neighbour's staging or move.
   Camera moves are only those that stay inside the frame — `CAMERA_MOVES`: Slow Push In (a few
   percent over 8 s), Rack Focus, Gentle Float, Static Locked; `SHOT_ANGLES`: eye level, slightly low,
   slightly high; `LENS_COMBOS` / `SPEED_KEYWORDS` give Veo's terms. Walk-and-talk, pull back, dolly
   out, crane, pedestal, orbit, arc, pan, tilt, truck and follow tracking are gone: they made the
   model invent the rest of the room — people walked over tables and cupboards or out onto the road,
   and shops grew. **Two-handers are filmed from a fixed distance** (`DUO_SAFE_MOVES`: static, rack
   focus, gentle float; a drawn pair only static or rack focus, `CARTOON_PAIR_MOVES`; always eye
   level); every lean or step toward the lens is stripped from a pair's direction (`withoutApproach`)
   and a pack's scale anchor opens the scale lock (`scaleLock`) — what kept growing Motu and Patlu.
   They keep fixed LEFT/RIGHT positions, a strict WHO SPEAKS block and, on a rack-focus clip, SPEAKER
   FOCUS (the focus moves to whoever talks; the camera does not). Every Veo prompt
   carries the `COLOUR_LOCK` near the top (the frame's exact grade, contrast and exposure; never pale,
   washed, hazy or brightened) with matching negatives, and scene life that changes the light is
   refused (`LIGHT_CHANGE`). **An English ad is spoken in Indian English with an Andhra Pradesh accent**
   (`speechAccentFor`): named in the opening line, in a `VOICE AND ACCENT — INDIAN ENGLISH ONLY` block
   above SPEECH, on every spoken line and in the negatives (never British, American or any foreign
   accent) — the prompt used to say only "speaking English", so Veo used its default foreign voice.
   Other languages are spoken natively and get no block. Locked always: the people (height/build/outfit relative to the room — a
   single presenter's camera may push in slightly), the WORLD (no object vanishes or moves, nobody
   steps onto or climbs furniture) and the PLACE (nobody leaves the shop or goes through a door).
   `resolveDirection` discards director text that walks, climbs, reveals what the frame does not show,
   leaves, freezes, cuts, crash-zooms or uses slow motion / hyperlapse during speech; the director's
   JSON also returns `frame`. The frames are composed for the plan first (`framingForMotion`,
   `withMotionComposition`), then the Veo prompts use the SAME plan (`writeVeoPrompts` receives all
   lines + `sceneContext` + each clip's `framePrompt`; `regenerateVeoForClips` too).
7. Finalize (returns `sceneContext` and `voiceBrief` too).

**Spoken-word rules, in code (`utils/spokenNumbers.ts`):** every final script line — generated,
repaired, refined or pasted — goes through `speakableLine`: numbers become words (Telugu words in a
Telugu script, English words in an English one, Indian lakh/crore grouping, ₹ / % / decimals / times /
phone numbers digit by digit; other languages rely on the prompt and validator), and the Telugu word
for "and" — with every misspelling of it — is written **`mariyu`, in Latin letters**, inside the
Telugu line (2026-09-25: the team reads the script aloud and wants one fixed spelling on the page).
Nothing explains it anywhere: the written word IS the spelling to say, so the Veo prompt no longer
carries a PRONUNCIATION line. `withoutFixedWords` exempts it from the validator's "no Latin letters
in spoken content" rule. (`everydaySpeech` no longer swaps it for ఇంకా.) An **English** script is
written and judged as **Indian English** (the writer rules, the language directive and the quality gate):
how an educated person from Andhra Pradesh speaks English — Indian expressions, rupees and lakhs,
Indian places and festivals, never American or British slang, idioms, spellings or culture.

Directives are prepended for ratio, name board, language, casting and wardrobe. `onPartialResult`
streams sections as they arrive. **B-roll and overlay images run automatically at the end of a video
run** (`handleGenerate` → `handleGenerateStockImages`/`handleGenerateOverlayTexts` with the run's own
result; their buttons remain for a regenerate, 2026-09-25). The two extras: the **Overlay Text Image Generator**
(`generateOverlayTexts` + `utils/overlayImage.ts`: each overlay gets a model-written `design` and a
code-assembled `imagePrompt` for a premium 3D transparent PNG — exact text, real alpha channel,
tightly cropped; festival palette for festival ads; `refineOverlayImagePrompt` changes only the
look; UI shows text, CapCut SFX and From → To words, no timecodes), B-roll stock prompts
(`generateStockImagePrompts`: the subject of each line, never a presenter or text; festival
imagery for festival ads; reads the scene plan and core message), regenerate Veo for chosen clips.

**Outputs** (`GeneratedOutputs`): 1. Main Frame Prompts (per clip), 2. **VIDEO BOTTOM LABEL**,
3. Poster Design (JSON), 4. Voice Over Script, 5. Veo 3 Video Prompts, plus B-roll, overlay
images, the core message, `sceneContext`, `voiceBrief` (shown in a "what we understood /
background plan" panel above the sections) and `scriptQa`. **Every row is always drawn** with its own
state (Writing… / Missing / Failed / Updated from final script / Script QA n/10) and, when missing, its
own Generate — label (instant), poster, the missing Veo clips — instead of vanishing while the status
says Completed.

**Input Final Script (on row 4, Voice Over Script → `FinalScriptPanel.tsx`, `utils/finalScript`):** a
highlighted strip (`ag-callout`, `data-test="final-script-callout"`) sits inside row 4 and is visible
with the row shut, saying when to use it — a script given by the client, or corrected in ChatGPT or
Gemini. It opens into three steps: 1 copy the format (for this ad's cast and the kit's clip count),
with "Copy instruction for ChatGPT / Gemini" (`finalScriptAiInstruction`: returns the script in this
format without changing a word); 2 paste — or "Load current script" (`finalScriptFromKit`) for a small
correction — with a live reading; 3 "Use this script · update 5 · 6 · 7". After it, the strip says the
final script is in use and offers "Change final script". The paste format is per category
(plain clips / one `[Name]:` line / both characters' lines, over the kit's own clip count). It is read
with the generator's parsers, used word for word (numbers and `mariyu` made speakable), refused with a
reason when a label or the clip count is wrong, and becomes 4. Voice Over; 5 Veo (every clip, from the
existing frames), 6 B-roll and 7 overlays are rewritten from it in parallel, each with its own
Regenerating… / Updated / Failed-Retry state. Frames, label and poster are untouched.

**Editing / refine:** per-section refine (`refineSection`, "change only what was asked"),
`refineVoiceOver` (plan → clip edits → validation; `RefineRevisionBanner` offers undo),
`refineVeoPrompts` (plan → JSON edit → check: `VEO_REFINE_PLAN_SYSTEM_PROMPT` understands the request
and compares it with each prompt; `utils/veoRefine` refuses an edit that changes the spoken line or
loses a section; one retry; the UI alert says what was understood). Copy buttons strip code fences.

**Save / storage:** `persistGeneration` writes `ai_generations`. **Generate** creates a new doc (a
version); **Save** and a 1-second debounced **auto-save** update the same doc; the assignment gets
`savedGenerationId`. Reopening a job restores it — ONLY on opening: the auto-load no longer re-fires
when a finished run points the job at its new save (that read-back used to wipe B-roll and overlays
still arriving — the "completed but deliverables missing" glitch). `SavedItems` lists the user's own generations.
Tools → Ad Generation History groups versions per job (`utils/generationHistory.ts`). Submitting
the job is `useCompleteWork` (§16).

**Poster Creation:** size (`utils/posterSpec.ts`: 4:5 default, ratios or pixels), style
(`services/posterStyles.ts`, 8 styles + auto), occasion (`utils/posterOccasions.ts`), concept
count 1–6 (default 3), text language (English default) → `generatePosterConcepts` → concepts
(title, idea, headline, **image prompt**, negative prompt) → `refinePosterConcept`.
`PosterConceptsPanel` links to Gemini for image generation.

### 17.3 AI provider, reliability, errors
- **Provider:** Google Gemini through `@google/genai`, called **from the browser**. Every call
  goes through `callWithFallback` (exported as `callGeminiWithFallback`).
- **Keys:** a pool of up to 30 keys (`VITE_API_KEY_n` / `API_KEY_n`, single-key fallbacks),
  rotated on quota, rate-limit or invalid errors.
- **Models:** `MODEL_LIST` (`gemini-2.5-flash` → `2.0-flash` → `2.5-flash-lite` → … →
  `gemini-3.1-flash-lite-preview`), rotated on overload or 5xx. A 404 "not available to new users"
  retires a model **for that key only**; any other 404 retires it for all keys.
- **Thinking budget per call (2026-09-29):** `callWithFallback(apiCall, { effort })` — `fast` 0 tokens
  (extraction, voice note, poster, splits, location scout, B-roll, overlays), `standard` 768 (core
  message, repairs, scene plan, frames, Veo director, poster concepts), `deep` 1536 (script writer,
  review, quality judge). Applied only on `gemini-2.5-flash` (the lite models do not think by
  default; 2.0 rejects the setting); a call with no effort keeps the model default. Measured: thinking
  was ~75% of generated tokens and 10–16 s per call before.
- **Key handling (2026-09-29):** each call starts on the NEXT usable key (round-robin — the free tier
  allows ~5 requests/minute and ~20/day per key per model on 2.5-flash); invalid, expired and
  "reported as leaked" keys are dead for the session with no wait before the next; a 429 rests that key
  for Google's retry delay (30 min for a per-DAY limit); keys lacking a model ("new users" 404) are
  skipped for it. Dead keys and per-model gaps are kept in localStorage for a day under a fingerprint
  of the key set (never the keys), and the last good key index is where a new session starts.
- **Errors:** after exhausting keys and models the call throws; the UI shows an error modal
  (`status.error`). Many parsers are defensive (JSON repair, clip-number coercion). No
  server-side proxy, no retry queue.
- **Live testing:** run `generateAdAssets` with vite-node and text-only `formData`, timing each request
  by wrapping `globalThis.fetch` (model, ms, status, `usageMetadata.thoughtsTokenCount`). On 2026-09-29,
  of the 30 keys: several invalid (incl. 1, 12, 18), several "reported as leaked" (16, 23–28), key 2 has
  no gemini-2.5-flash, and working keys hit the free-tier daily limit of 20 requests per model.

### 17.4 Cinematic Ads pipeline (`/tech-admin/cinematic-ads`)
Project list (create, open, delete; **scoped to the creator**, `listProjects(createdBy)` ordered
by `updatedAt`) → steps with `PipelineStepper`:
- **0 Brief:** ad format picker (12 formats in families dialogue / voice-over / structure, plus
  "AI decides"; presets drive casting, clip type, VO form, animation platform), business info,
  client requirement, our note, uploads, platforms, duration, language → `generateClientBrief`.
- **1 Story + VO:** 5 variations, refine by feedback, select → `generateStories` / `refineStory`.
- **2 Storyboard:** one grid prompt per ≤9 scenes (`splitScenesIntoBoards`); upload the rendered
  board; approve or send back.
- **3 Casting:** `extractCharacters`, face references; auto-skipped when the format needs no cast.
- **4 Clips:** one card per clip, type `single` / `start_end` / `storyboard` (3–9 panels);
  per-clip regeneration; camera-move enforcement (`hasCameraMove`); frame and clip uploads; QC;
  "copy whole clip packet".
- **5 Editing guide:** `generateEditingGuide`.
- **6 Review & delivery:** final video, feedback rounds, deliverables, mark delivered.

Persistence: `cinematic_projects` with debounced autosave; files go to Cloudinary (URLs only).
Gemini calls use the shared fallback.

### 17.5 Relationships
- Ads link to **work assignments** (`savedGenerationId`) and so to orders and clients.
- Cinematic projects are **not** linked to orders or assignments.
- There are no campaign objects for ads other than SMM campaigns.
- Ownership: `ai_generations.userId`, `cinematic_projects.createdBy`.
- Publishing to social platforms is **not implemented**. SMM "posting" is recorded by pasting
  live links.

---

## 18. NOTIFICATIONS

- **In-app:** `sendNotification({userId,type,title,message,link?,meta?,dedupeKey?})` writes
  `notifications`. A `dedupeKey` makes the doc id deterministic, and repeats within 10 minutes
  (same text) are skipped entirely. `hooks/useNotifications.ts` powers the Topbar bell (mark
  read, clear). `UpdatePopup` shows popup types (`utils/notificationRouting.isPopupNotification`).
  `useNotificationTap` handles taps.
- **Push:** the same call fire-and-forgets `POST /api/send-notification` → FCM data message.
  Web: `public/firebase-messaging-sw.js` renders it (call actions, vibration, tags). Native:
  Capacitor PushNotifications + LocalNotifications (`services/fcm.ts`). Tokens live in
  `fcmTokens` and are registered in `initFCM` (AppLayout). The web token needs
  `VITE_FIREBASE_VAPID_KEY`.
- **Fan-outs:** `notifyTechTeamLeaders` (team leaders sharing `createdBy`),
  `notifyTechSideOfNewOrder` (all tech admins + team leaders on order **creation** only),
  deadline sweep, SMM due reminders (seller nudged for approvals and budget), birthdays, order-chat
  alerts via `api/order-chat`.
- **Common types:** `work_assigned`, `work_completed`, `work_verified`, `work_editing`,
  `work_unassigned`, `sale_approved`, `attendance_update`, `order_new_*`, `chat_message`,
  `voice_call` / `video_call`, SMM (incl. `smm_lead`, `smm_new_month`; 2026-10-03: `smm_sale_entered`,
  `smm_month_setup`, `smm_renewed`, `smm_renewal_due`, `smm_renewal_reminder`) and HR types, `ai_account`
  (an AI account assigned to or moved from someone), `drive_folder_missing` (a tech member with no Drive folder asks their tech admin; link `/tech-admin/drive`).

---

## 19. SEARCH / FILTERING / ANALYTICS

- **Search:** client lookup by any phone format (`utils/phone.ts`), lead search in My Leads /
  Leads Management, HR register search (person, type, reference, issuer) with 12-per-page
  pagination, member search on My Team, Tools history search.
- **Filters:** `components/dashboard/PeriodFilterBar`, `DateRangePicker`, `DayPicker`;
  `utils/periodFilter.ts` (cycle / month / custom), `utils/dateRange.ts`; status tabs on
  approvals, orders and HR; `ViewToggle` grid/table (`useViewMode`, localStorage).
- **Pagination:** mostly none (full lists). Exceptions: order history pages (300), HR register
  (12/page).
- **Analytics:** recharts dashboards (main, tech, sales, accounts), `MemberAnalyticsDashboard`,
  sales Analytics, Leaderboard (day / month / career; career is admin-only), tech productivity
  ratio, profit & loss (`utils/profitAnalytics.ts`), SMM monthly report (`SmmReportPanel`,
  client-wait summary).
- **No external analytics SDK** is wired (the Firebase `measurementId` exists in config, but
  Analytics is not initialised).

---

## 20. THIRD-PARTY INTEGRATIONS

| Service | Purpose | Code | Data sent / received | Auth | Errors |
|---|---|---|---|---|---|
| Firebase Auth | Staff login, guest custom tokens | `services/firebase.ts`, `secondaryAuth.ts`, `orderChatGuest.ts`, `api/*` | credentials / ID tokens | web config + service account | mapped `auth/*` codes |
| Cloud Firestore | All data | everywhere | documents | Auth + console rules | toasts, "never throw" services |
| Firebase Cloud Messaging | Push | `services/fcm.ts`, sw, `api/send-notification.ts`, `api/order-chat.ts` | tokens, data payloads | VAPID key; service account | invalid tokens deleted |
| Google Gemini | Scripts, prompts, extraction, vision reads | `services/geminiService.ts`, `cinematicAdsService.ts`, `gemini.ts` | business info, uploaded images/audio/text as base64, prompts | API keys in bundle | key/model rotation (§17.3) |
| Cloudinary | File/image uploads (avatars, signatures, chat files, proofs, frames) | `services/cloudinary.ts` | files → `secure_url` | unsigned upload preset | rejects on non-2xx |
| Vercel | Hosting + 3 functions | `vercel.json`, `api/` | — | env var for service account | — |
| Metered.ca TURN + Google STUN | WebRTC relay | `services/webrtcConfig.ts` | media | hard-coded TURN credentials | call UI states |
| WhatsApp | Deep links only (`wa.me`) for requirements, attendance updates, reports, client messages | ≈11 files | prefilled text | none | — |
| Google Flow / Gemini app / ChatGPT / Grok | External generation tools (links only); their logins and Flow credit use are kept in AI Accounts (§9.21), entered by hand — no API | `generation/mission.ts`, `PosterConceptsPanel.tsx`, `services/aiAccounts.ts` | none (user copies prompts) | stored logins | — |
| Google Drive | Member folder URLs, check-out upload declaration (no API) | `DriveManagement`, `utils/driveUpload.ts` | URLs | — | — |
| Meta Ads | Screenshot reading only (no API) | `geminiService.readMetaAdsReport` | image | — | best-effort |
| Google Fonts | Syne, DM Sans, JetBrains Mono | `index.html` | — | — | — |
| Capacitor plugins | Native push, notifications, keyboard, status bar, splash, haptics, back button, keep-awake | `services/capacitor-plugins.ts`, `fcm.ts` | — | — | no-ops on web |

---

## 21. ENVIRONMENT VARIABLES

`vite.config.ts` sets `envPrefix: ['VITE_', 'API_KEY_', 'GEMINI_']`, so **all of these are
bundled into client JavaScript**.

| Variable | Where | Purpose |
|---|---|---|
| `VITE_API_KEY_1` … `VITE_API_KEY_30` / `API_KEY_1` … `API_KEY_30` | `geminiService.ts` | Gemini key rotation pool (local `.env` defines `API_KEY_1..30`) |
| `VITE_API_KEY` / `API_KEY` / `GEMINI_API_KEY` | `geminiService.ts` | Single-key fallback when no numbered key exists |
| `VITE_FIREBASE_VAPID_KEY` | `services/fcm.ts` | Web Push VAPID key for FCM `getToken`. **Not in local `.env`**; Vercel value [NOT CONFIRMED] |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | `api/*.ts` (server only) | JSON service account for firebase-admin (Vercel project env) |
| `import.meta.env.DEV` | `onboardingGuest.ts`, `orderChatGuest.ts` | Enables in-browser fallbacks for `/api` flows during `vite dev` |
| `__BUILD_ID__` (define, not env) | `services/appUpdate.ts` | Build identity compared with `/version.json` |

Hard-coded configuration that is not in env: see §14 (Firebase config, Cloudinary, TURN, legacy
Gemini key), the production API base URL, and CORS allow-lists in `api/*`.

---

## 22. COMPONENT ARCHITECTURE

| Component | Location | Role / important behaviour |
|---|---|---|
| `AppLayout` | `components/layout/` | Guard + shell + global overlays + session listeners (§11). Props `allowedRoles` |
| `Sidebar` / `Topbar` | `components/layout/` | Role nav with groups (flattened when collapsed), logout; bell, avatar |
| `AppUpdateBanner`, `UpdatePopup`, `InstallAppButton` | `components/layout/` | Self-update, work popups, PWA install |
| `AIPlatformApp` | `components/ai-platform/` | Props `assignment?`, `assignmentId?`, `onClose`, `onComplete?`, `completing?`, `onBusinessNameExtracted?`. Full-screen (`fixed inset-0 z-50`); holds updates while open; restores saved generation; locks spec from assignment. Children: `FileUpload`, `GeneratedCard`, `SavedItems`, `PosterConceptsPanel`, `generation/MissionWorkspace` (waiting screen with ETA from `utils/generationEta`), `AIGuideSheet`, `SpecUpdateDialog`, `RefineRevisionBanner`, `CodeVerificationModal`. Renders the owner-image slot, BUSINESS CONTENT / FRAME / BACKGROUND INSTRUCTIONS boxes, the Gemini document-route box, the Custom Character field, the duo custom-script format, a "what we understood / background plan" panel (`voiceBrief`, `sceneContext`), the 2. VIDEO BOTTOM LABEL and 7. Overlay Text Image Generator sections. `FileUpload` refuses PDFs/documents/video and supports drag & drop. Chrome (2026-09-24): root `.adgen`; one screen — a 72px header (mark │ product name, Ready/Generating chip, Project History, Mark Complete, the signed-in member, Close project) over a 4/8 grid. LEFT: `1. Assets & Files` and `2. Configuration` as two `ag-sec` sections of which only one is open (`leftPanel`, morphed through `.ag-morph`); shut, Assets shows a six-tile summary of what has been uploaded and Configuration shows the run's settings; Start/Stop sits below both. RIGHT, by stage: welcome → Generation Status (progress, step, countdown, `MissionStepper`) + AI Guide card → Status + a 72px AI Guide strip + the Deliverables card of seven numbered `ag-row`s, every one always drawn with its state. A 36px **job strip** under the header (`data-test="job-strip"`: business, category / occasion, special category, clips + EC, ratio, language, job id) at every width; a stale-kit banner when the job changed after the kit was made; the Input Final Script strip on row 4 (`OutputSection` `footer`) |
| `SaleForm` | `components/sales/` | The one sale form (new, edit, upsell): packages, bulk, discounts, SMM fields, promise, requirement, payments; calls `upsertOrderForSale` |
| `FinalScriptPanel` (default export `FinalScriptInput`) | `components/ai-platform/` | "Input Final Script" on row 4 (`OutputSection` `footer` slot, visible with the row shut): the highlighted strip, then three steps — copy the format / the ChatGPT-Gemini instruction, paste or load the current script with a live reading, update 5 · 6 · 7 with per-section progress and Retry |
| `AssignmentBriefFields` | `components/work/` | Occasion (wishes) + business info + address + client's notes, in all three assignment edit dialogs |
| `SpecialCategoryFields`, `ModelAttireFields`, `PosterSpecFields`, `OccasionPicker`, `DurationPicker` | `components/work/` | Shared spec editors used by Work Assign ×2, assignment editors and the AI platform. **`SaleForm` still has its own copy of the special-category picker** |
| `OrderProgressPanel`, `BulkVideoBoard`, `AssignTracksDialog`, `PenaltyDialog`, `ExtendPromiseButton`, `DeadlineChip`, `ReassignWork`, `RequirementsShareModal`, `MemberWorkloadCard`, `WorkDoneReport` | `components/work/` | Order and work UI pieces |
| `StaffOrderChat`, `SalesOrderChat`, `OrderChatPanel`, `ClientCall`, `ShareChatModal`, `ClientReviewCard` | `components/order-chat/` | Client chat for staff and guest |
| `VideoCallManager`, `ChatRoom`, `ChatSidebar`, `MeetingRoom` | `components/chat/` | Team chat, WebRTC calls and meetings. VideoCallManager carries the one known TS error |
| `SmmItemDialog` (autosave ~900ms), `SmmContentTable` (+ `SmmCalendar`), `SmmStageBar`, `SmmAdsPanel`, `SmmMoneyPanel`, `SmmBudgetPaymentForm`, `SmmReportPanel`, `SmmMessageComposer`, `SmmDueCard`, `SmmAddSaleDialog`, `SmmSetupForm`/`SmmSetupDialog`, `SmmVisuals`, `SmmBoardStats`, `SmmCampaignCard`, `SmmRenewalsCard`, `SmmRenewalPopup`, `SmmMyJobPanel`, `useSmmRenewal` | `components/smm/` | SMM month UI (§9.9) |
| `AgreementView`, `SignaturePad`, `MandatoryAgreementGate`, `Letterhead` | `components/agreement/` | Document rendering, signing, forced signing gate |
| `IssueDocumentDialog`, `AllDocumentsPanel`, `EmploymentTermsCard`, `KycPanel`, `IdCardView`, `CompanyDocumentsCard`, `ProbationPanel`, `SeparationPanel`, `AssetsPanel` | `components/hr/` | HR centre and profile panels |
| `DailyCheckinPrompt` (mandatory), `CheckoutModal`, `MyDayCalendar` | `components/attendance/` | Tech attendance |
| `DriveUploadSheet` (+ `DrivePendingStrip`, `DriveUploadChip`), `useDriveUploadStep` | `components/work/` | The Drive step after a hand-in (§9.6): the job's folder, file name, the member's Drive link, "It's uploaded" / "Upload later" |
| `AccessCodeGate`, `FieldHint`, `ImageLightbox`, `ViewToggle`, `BrandLogo` | `components/common/` | Shared primitives (FieldHint has a 24px tap target) |
| `CreditUsageDialog`, `useCreditGate`, `FlowAccountDialog`, `FlowAccountsList`, `AssignDialog`, `PaidAccountsPanel`, `SecretField`, `CreditCalculator`, `TargetCard`, `UsageList`, `AiModal` | `components/ai-accounts/` | AI Accounts (§9.21). `useCreditGate` puts the credit step in front of Mark Complete on My Work and Recent Ads; `AiModal` is z-[70] so the credit dialog opens over the full-screen studio |
| `ui/*` | `components/ui/` | shadcn primitives. Do not hand-edit casually |

---

## 23. IMPORTANT DATA FLOWS

**Login:** `Login` → Firebase Auth → `getDocFromServer(users/uid)` → `isActive` check →
`authStore.setUser` → `sessions` row → `defaultRouteForUser` → `AppLayout` (guard, FCM,
listeners) → page.

**Sale → tech:** Sales member `MyLeads` → `SaleForm` save → `leads.saleItems[]` update →
`upsertOrderForSale` → (if discount within authority or approved) `orders` create
(`unassigned`, `saleVerified:false`) + `notifyTechSideOfNewOrder` + `ensureSaleOrderChat`
(team-only room) + (SMM) `ensureCampaignForOrder`. Sales admin `SalesApprovals` → verify →
`saleItems[i].verificationStatus = verified` → `upsertOrderForSale(saleVerified:true)` →
notify seller → `logActivity`.

**Assign → deliver:** Tech admin or leader `Orders` / `WorkAssign` → `createWorkAssignment` →
assignment + chat attach (`clientReady`) + order `assigned` + notify member → member `MyWork` →
access code (once per device) → `AIPlatformApp` (status `in_progress`) → `generateAdAssets` →
`ai_generations` → external generation → submit (`useCompleteWork`): `completed` + notify + order
`completed` + chat locked + client upsert → leader `verifyAssignments` → `verified` + notify +
client and order `verified` (or `editing` → member redoes).

**Client chat:** Staff shares `/c/<chatId>` → client opens → `api/order-chat open` → custom token
→ guest Firebase app → messages in `order_chats/{id}/messages` → `notify` → staff push. After
delivery the client submits a review → `submit-review` mirrors it to `orders` and `clients`.

**After-sale:** Seller `MyClients` / `FeedbackUpsell` → `saveSaleFeedback` (`orders.feedback`) →
both ratings in → upsell button → `startUpsell` (`claimNumber`) → My Leads with `SaleForm` open
→ new sale (same pipeline).

**Hiring:** Admin `OnboardInviteModal` → `onboarding_invites` → candidate `/join/:id` → code →
offer signed → joining signed → `api/onboarding provision` (users, profile, 2 signed HR docs,
credentials) → login shown once.

**SMM month:** sale of `social_media_management` → `smm_campaigns/{orderId}` seeded with
commitments → team plans items → request approval → client answers (recorded) → schedule / post
(links) → `syncOrderProgress` updates the order counters → ad runs and budget ledger → monthly
report message → renewal.

**Payroll (tech):** `daily_checkins` + `attendance` overrides + `holidays` + approved
`leave_requests` → `payrollRun.fetchMonthAttendance` / `resolveMemberDays` →
`payrollEngine.computeSalary` → `markSalaryPaid` → `payroll_lines` / `payroll_runs` +
`audit_logs` → member salary pages and payslip PDF.

---

## 24. BUSINESS RULES (IMPLEMENTED; verified in code)

- **Accounts:** only main admin creates admins; tech admin creates tech members and leaders; sales
  admin creates sales members; hiring-link accounts get `createdBy` = the inviting admin.
- **Deactivated users** cannot log in and are signed out live.
- **Numbers:** a claim reserves for 24h; takeover is allowed after that and freezes the old lead;
  a sale-freeze lasts 1–7 days; lock writes are transactions capped at 2 attempts.
- **Discount authority:** a member may give up to **10%** alone. Beyond that, no order exists
  until the sales admin approves (verifying the sale approves the discount). An earned discount
  (Google review and/or referral) is worth **10%** and does not stack to 20%.
- **Orders** are created at **sale time** (approval is not a gate except over-discount).
  Re-verifying never duplicates (idempotent id). A deleted order is never recreated by its sale.
  Progress is seeded once and never re-seeded.
- **Editing a sale** is locked once work is assigned; the seller sends update notes instead.
  Deleting the sale leaves assigned work in place with a `saleDeleted` banner.
- **Delivery promise:** the countdown starts at the sale; exactly **one extension**, by team
  leader / tech admin / main admin, the assignee or the seller; recorded on the order and
  assignment, never on the sale.
- **Work:** members cannot assign, including to themselves; a job needs its access code once
  per device; completing notifies the assigner and team leaders once per event; verifying
  records the client delivery.
- **Bulk videos:** only tech admin, main admin or team leader assign slots; the owner or those
  roles can tick them done; slot numbers are never renumbered.
- **SMM deletion and lead (2026-10-01, team leader added 2026-10-03):** the main admin, the tech
  admin, the tech team leader and the Social Media Team Lead delete a month; a deleted sold month never
  comes back with its sale; only the tech admin and main admin appoint the team lead; extra work always
  says what it is (and a video its length), and the seller is told.
- **SMM months (owner, 2026-10-03):** every month is a sale — recorded by the salesperson or, by the
  tech admin / team leader / main admin, on the salesperson's behalf (their sale, Sales Approvals,
  existing 5%/10% commission). A sale already recorded is set up, never recorded again (no double
  commission). A month runs from its start to the same date next month. Clips per video default 4
  (32 s); every job of the month is made at that length. Only the month's salesperson renews, as a
  sale; the next month starts on the old end date with the same team; the old month closes after its
  last day. A number held by another salesperson is refused. The tech side cannot record a new sale
  for a client who already has months (that is a renewal). The tech side may rename a month and change
  how many videos/posters it owes; a worked row is never removed. A deleted month can be undone for 5 s.
  The one exception — **a month that had no sale (owner, 2026-10-03):** a client served before sales
  were recorded in the app is added by the tech admin / team leader / main admin with the salesperson's
  name: amount 0, counted in nobody's revenue or commission, shown in the salesperson's login with its
  dates. It cannot start in the future, overlap any month of the client, cover a recorded sale's dates,
  or come after a recorded sale. Its next month is the salesperson's Renew — a sale. A month's deadline
  is its last day, on the order and every job, including a renewal's; a later edit or approval of the
  sale does not change it (nor a used extension).
- **SMM work lives in Social Media (owner, 2026-10-04):** a tech member's social-media month is never
  listed in My Work or Recent Ads; they open it from the month's page ("Your work on this month"), which
  uses the same studio, code, credits, completion and Drive step, and returns them to the month.
- **SMM renewal popup (2026-10-03):** from 3 days before a month's renewal date through the day itself,
  the salesperson who sold it gets the countdown + work-report popup once a day (per month, per device)
  until there is a decision (a renewal linked, won or lost — a pitch is not one). Once the date has
  passed it stops; the dashboard card (5 days, and ended months) and the board carry it from there.
- **SMM:** nothing is scheduled or posted without a recorded client approval (enforced in
  `setItemStatus`); month quotas are 2 posts + 2 stories per video (`smmQuota`; stories target
  now 0 for plan-derived months); campaigns run on the video count; the real-video add-on is
  `SMM_REAL_VIDEO_RATE = 500`.
- **Feedback gate:** upsell only after **both** work and service feedback; tech admin and leader
  can read but not enter feedback.
- **Upsell ladder:** ad → social → website → software, measured from the highest rung owned.
- **Commission:** 5% standard, 10% for `incentive_10`; penalties never count toward commission;
  partial payments count on the day collected. Settlements cover sequential date ranges.
- **Sales targets:** only `dailyTarget` is stored; monthly is derived across the pay cycle.
- **Tech performance month:** 10th → 9th; work counts on its **assignment** date.
- **Tech productivity:** pay/work-value ratio target 5%, watch up to 10%, over 10% flagged.
- **Tech attendance:** manual override wins → Sunday or announced holiday = holiday → checked in
  = full → past with no check-in = absent. The monthly leave quota constant is 2. Leave past the
  allowance counts as absence.
- **Drive upload per job (2026-10-03):** every job handed in opens the Drive step at once — the file goes
  in `Name › Month › Day N › <clips> Clips` (posters: `Posters`) of the day it was finished, named
  `<job id> - <business>`. "It's uploaded" is the member's word (the app cannot see a Drive). A job handed
  in again after edits must be uploaded again. Jobs finished before 2026-10-03 are never shown as missing.
  The Drive card appears the instant the job is handed in and only says "submitted" once the job is saved.
- **Check-out** requires the Drive-upload declaration first; the daily check-in prompt cannot be
  dismissed on a working day, and does not appear on a Sunday or an announced holiday.
- **AI ads — English (2026-09-25):** an English ad is Indian English throughout — written for Indian
  customers and voiced with an Andhra Pradesh accent in every Veo prompt; never a foreign accent.
- **AI ads (2026-09-25, integrity):** no contact number or address reaches a deliverable unless the
  member typed it or a card / flyer / premises photo could show it (and it is not a placeholder);
  missing fields are absent — no empty label, pill or line — and the layouts follow the count (1–3).
  The job's spec wins over a reopened kit. Every generated script passes a separate quality gate or is
  polished / rewritten automatically (best of three). A pair of characters is never filmed with a
  move that changes their distance or height, and every video keeps the frame's colour. A final
  script pasted into the Deliverables rewrites 5 · 6 · 7 only, and only with the kit's clip count.
- **AI ads (2026-09-25):** a run is refused while the client's brief is still loading and when
  nothing describes the business (no BUSINESS CONTENT and no card / store / product / flyer / voice
  file) — a model with nothing to read invents a business, which is what made first runs come back
  about the wrong one. A two-hander never walks toward the camera (that is when the video model
  re-proportions the pair) and every duo video prompt opens with the scale lock. B-roll and overlay
  images are part of every video run, not a button pressed afterwards.
- **AI ads (2026-09-22):** a custom script is used word for word (only emoji/decoration stripped;
  numbers become words); a two-speaker category needs `[Speaker]:` lines; a two-speaker clip is
  15–17 words (7–9 a line); human casts' role labels (Friend/Host) are never spoken; the Custom
  Character needs a description (sale, Work Assign and platform) and Real Owner Face needs the
  owner image; no PDF/document uploads anywhere in the generator; every spoken number is words,
  never digits; the word for "and" is written `mariyu` in Latin letters and explained nowhere; a human
  cast never says its own role label out loud (Girl / Boy / Friend / Host — checked, not just asked);
  no frame or video ever ends on a goodbye
  wave; (a walk was allowed here until 2026-10-01 — nobody walks now, see below); no frame asks for a logo file that
  was not attached (the name board is used instead).
- **AI ads (2026-10-01):** every video animates its own frame and nothing beyond it — performed in
  place (no walking), the camera only pushes in slightly, racks focus, floats or holds; nobody climbs
  on furniture or leaves the place, and the shop is never extended. A pair is filmed from a fixed
  frame with its height anchored to a real counter. A client's store/office photo is the clip's
  background, unchanged apart from an 8K enhancement. Invented people keep one face and outfit in
  every clip. When the client's address is known the last clip says it (landmark + town), and no clip
  ever invents one.
- **AI Accounts (2026-10-01):** a video job is marked complete only after its Flow credits are entered
  (or "No Flow credits" is ticked); credits are 7 / 10 / 12 / 15 per 4 / 6 / 8 / 10-second clip; an
  account has 1000 credits a month from its creation day and expires 18 months after it; each tech
  member's target is 30 accounts by 29 October, 2 a day; members see only the accounts they added, own
  or hold; the tech admin and team leaders manage every account; an account's creation date is fixed
  once credits are recorded on it.
- **HR:** 14 document types in lifecycle order; both officers sign all types (falls back to the
  issuing admin); references `DTS/<TYPE>/<year>/<seq>` are allocated in a transaction with a 6s
  timeout; unsigned agreements trigger a non-closable signing gate; bulk sends tokenise personal
  values so one person's salary never reaches another; intern letters say "stipend".
- **Client chat:** opens at sale (team-only), the client is admitted after assignment, locks on
  delivery, reopens on undo or edits; guests may only update presence, unread counts, last
  message and their review.
- **External APIs failing:** Gemini rotates keys and models, then errors to the UI; push and
  notification failures never block the main action; order, chat and campaign side-effects are
  "never fatal" to a sale.

---

## 25. CURRENT IMPLEMENTATION STATUS

**IMPLEMENTED ✅:** everything in §9 unless listed below. Including: role-based app for 7 roles;
lead distribution and number locks; sale recording, approvals and discounts; orders queue with
remove/restore/purge, penalties, promises, bulk slots, progress; work assignment lifecycle; AI Ads
Platform (video and poster) with save, refine and history; Cinematic Ads 7-step pipeline with
project persistence; SMM; client order chat with calls and reviews; team chat, calls, meetings;
tech and sales attendance, leave; tech and sales payroll, settlements; HR documents, agreements,
hiring link, ID cards and public badge; finance pages; leaderboards and analytics; notifications
and push; PWA self-update; Android shell.

**PARTIALLY IMPLEMENTED 🟡:**
- Firestore security: rules written but publication [NOT CONFIRMED]; authorization mostly
  client-side.
- Accounts admin module: basic CRUD and read-only summaries; `other_income` read but never
  written by the app.
- Special-category catalogue: `SaleForm` keeps its own copy of the picker instead of
  `SpecialCategoryFields` (both now carry the Custom Character description field). The Custom
  Character description and the Real Owner Face image are enforced (2026-09-22).
- Number spelling (`utils/spokenNumbers`) covers Telugu and English only; Hindi, Tamil, Kannada and
  Malayalam scripts rely on the prompt rule and the digit validator.
- Motion staging comes from the scene plan's choices or a keyword reading of each line; when the
  client's own photos are used the scene plan is skipped, so only the keyword reading applies.
- The script quality gate's thresholds (pass ≥ 8, each ≥ 7, facts ≥ 9) are set from the rubric, not
  measured against live Gemini scores; a final script with a different clip count than the kit is
  refused rather than re-framed (it has to go through Configuration → custom script and a new run).
- Character catalogue regeneration from JSON has no committed generator script.
- AI Accounts: credits are entered by the member (there is no Flow API), so the totals are only as
  good as the entries; nothing reconciles them with Flow's own balance. The rules for the new
  collections are written (`docs/firestore-rules.md`) but restrict nothing until they are published.
- Drive step (2026-10-04): the studio closes as soon as the member submits. If the job's save then
  fails and the member closes the card without Try again, the job stays in progress (they hand it in
  again from My Work) and that studio session's time is not recorded.
- SMM month jobs (2026-10-04): opened from the month page only. A member cannot undo a month job they
  handed in by mistake (My Work's Undo was on its Completed list) — the admin sends it back for edits.
  Only a `tech_member` gets the panel (the studio link is My Work's route); a team leader on a month's
  seat had no My Work before either. A month job linked by an order whose month was never created
  (sold before the section existed) is hidden from My Work with no month page to open it from.
  Deleting any month leaves its members' job cards in place (as it always did for sold months).
- Native Android camera capture uses the web file input (`@capacitor/camera` not installed).
- Error/loading handling is inconsistent across older pages (plain `console.error`).
- Header/poster prompts in no-logo mode may still reference a logo container (noted 2026-07,
  [NOT CONFIRMED] current).

**NOT IMPLEMENTED ❌** (referenced or planned, absent in code):
- Hand-over of a cinematic project to a teammate (in the 2026-09-19 spec; the list is per-creator
  only).
- CTC breakup annexure on offer letters (needs salary-structure percentages).
- Task priority field; per-task comments or attachments (chat is used instead).
- In-app image or video generation; publishing to social platforms.
- Server-side scheduler/cron; server-side authorization for most writes.
- Self-registration; Firebase Auth account deletion when a member is deleted.
- Firebase Analytics.
- Template editor with versions for HR letters (explicitly declined).

---

## 26. CONFIRMED ISSUES (evidence in code)

1. **Unauthenticated push endpoint.** `api/send-notification.ts` accepts any POST with a
   `userId` and pushes to that user. CORS only limits browsers.
2. **Secrets committed in source:** Gemini API key in `src/services/gemini.ts` (its only export
   `verifyScreenshot` has **no callers**, so it is dead code carrying a live-looking key); TURN
   credentials in `src/services/webrtcConfig.ts`.
3. **Gemini keys shipped to every browser — and Google now reports several as leaked** (403 "Your API
   key was reported as leaked" on keys 16 and 23–28, 2026-09-29), with more invalid. `envPrefix`
   includes `API_KEY_` and `GEMINI_`, so every key is in the public bundle, and `geminiService.ts` also
   logs each key's first 6 and last 4 characters to the console on load ("DEBUG … remove after
   verification"). The call layer skips dead keys, but each is capacity lost; they must be replaced, and
   the lasting fix is a server-side proxy so no key reaches a browser.
4. **Plaintext passwords stored** in `member_credentials` (by design, admin-readable) and in
   completed `onboarding_invites`.
5. **Deleting a member leaves their Firebase Auth account** (only Firestore docs are deleted), so
   the email cannot be reused and the auth record lingers.
6. **One TypeScript error:** `src/components/chat/VideoCallManager.tsx(823)` — `Plugins` does not
   exist on `CapacitorGlobal` (both `tsconfig.check.json` and `tsconfig.app.json`). Build is
   unaffected (Vite does not typecheck).
7. **Lint debt:** `npx eslint .` reports 599 problems (527 errors, 72 warnings; 498 are
   `no-explicit-any`). Lint is not part of the build.
8. **Unscoped whole-collection listeners** (read-quota risk) remain in main-admin,
   accounts-admin, several tech-admin pages, Session History (`sessions`), sales-admin My Team
   (`users`), Tools history (`ai_generations`), and `processScheduledPools` (reads all
   `schedulePools` and all `leads`).
9. **Dead or stray code:** `aiadsdts/` (standalone copy), `src/pages/Index.tsx`,
   `src/pages/PlaceholderPage.tsx` (unused), `src/pages/sales-member/SalesScripts.tsx.bak`
   (committed backup), `bun.lockb` alongside `package-lock.json`, outdated `README.md`.
10. **Duplicated pages** that drift: `tech-admin/WorkAssign.tsx` vs `tech-team-leader/WorkAssign.tsx`,
    and the two `MemberAssignments.tsx`.
11. **AI account passwords stored readable** in `flow_account_secrets` / `paid_account_secrets` (by
    design — they are shared team logins); restricted to their users only once the rules are
    published (§27).

---

## 27. POTENTIAL RISKS (need verification)

- Firestore rules may still be unpublished, leaving HR PII (PAN, Aadhaar, salary) world-readable
  with the public web API key.
- `cinematic_projects` list query (`where createdBy` + `orderBy updatedAt`) needs a composite
  index; no index file is in the repo [NOT CONFIRMED in console].
- `api/order-chat.homeFor` sends `main_admin` to `/tech-admin/work-assign`, a route main_admin
  cannot open (bounces to `/login`) if a main admin is ever a room participant.
- Logout deletes FCM tokens **after** `signOut`; if rules require auth, the delete fails silently
  and a shared device may keep receiving the previous user's pushes.
- `MODEL_LIST` still lists `gemini-2.0-flash`, reported retired in live tests; it costs an
  attempt before removal.
- The seed main-admin auto-creation trusts a hard-coded email on first login.
- `VITE_FIREBASE_VAPID_KEY` is absent locally; web push registration depends on the Vercel env.
- Heavy `strict:false` typing and `any` timestamps hide shape mismatches between old and new
  records. Many fields are optional for backward compatibility.
- Free-tier Firestore quota has been exceeded before. New listeners must be scoped.
- Work access codes, client chat ids and invite codes are bearer secrets. Links forwarded around
  WhatsApp grant access.
- Every AI video run now makes up to three more Gemini calls: the voice note (when one is
  attached), the scene plan (up to 2 attempts, skipped with client photos) and the Veo refine's plan
  step. More quota and latency per run; not measured live. Since 2026-10-01 a run whose facts carry an
  address and whose script is not English adds one `fast` call that writes the address in the
  script's language (`nativeAddressPromise`: runs alongside the core-message call and is awaited before
  the script is written, so it rarely adds time).
- The motion policy (in-place staging; push-in, rack focus, float or locked; speaker focus) and the in-code prompt rules were
  unit-tested only — **no live Gemini, image or Veo run** has confirmed how the generated frames and
  videos behave (e.g. whether Veo keeps to the attached frame).
- `AIPlatformApp` reloads saved generations in `useEffect(..., [user])`; a new `user` object on
  every profile snapshot re-reads `ai_generations` (read-quota; a test mock with an unstable user
  made it loop).
- A frame run with no logo FILE now uses the name board even when "No logo" is not ticked.
- The script quality gate adds a judge call per draft and up to two more drafts: 1 extra call on a
  script that passes, up to ~6 on one that is rewritten twice (more quota and latency; not measured).
- Verified facts drop a number the extraction put under a non-contact key or read from a product
  photo, and any number when only a logo was attached — by design, but a real number can be lost that
  way; the member types it into BUSINESS CONTENT to keep it.
- Speed work (2026-09-29): a rewrite now spends every extra draft at once (more calls than stopping at a
  passing second draft), and B-roll/overlays run concurrently — both use the small free-tier quota
  (~20 requests/day/key/model) faster. The thinking budgets were chosen from one live comparison
  (quality gate 9.8 → 8.9–9.0 on the same brief), not a broad study.
- The fixed-distance duo camera, the colour lock and the Indian-English accent are prompt rules checked
  by unit tests only — no live Veo run has confirmed the heights hold, the colour stays or the accent
  is Indian. Cinematic Ads has its own `dialect` field and was not changed.
- The 2026-10-01 frame-bounded motion, scale anchor, background plates, cast sheet, Kids packs and
  spoken address are prompt rules checked by unit tests and one full-pipeline test on a faked Gemini —
  **no live Gemini, image or Veo run** has confirmed that Veo stops walking people over furniture or
  onto roads, keeps Motu & Patlu's height, leaves a client photo unchanged, or how the children look.
- SMM (2026-10-03) writes across roles from the browser: the tech side writes a sale onto a
  salesperson's lead ("Add SMM sale"), and a salesperson's renewal sale creates the tech team's jobs
  (`linkRenewal` → `assignSmmMonth`). Fine under the catch-all rule; any rule restricting `leads` or
  `work_assignments` writes to their owner would break both (noted in `docs/firestore-rules.md`).
  History months mark their order `verified` with no job behind it. Unposted pieces are moved to the
  next month only when somebody presses "Move them here" — nothing moves on its own. Months started
  directly before 2026-10-03 have no renewal sale; set up again, their team now gets job cards.
  Checked by unit/service/UI tests and a 35-step browser run on the in-memory Firestore — not against
  live Firebase or push delivery.
- The renewal popup remembers "seen today" per browser (localStorage), so a second phone or a cleared
  browser shows it again the same day. Checked by unit tests and a browser harness on fake data at
  1440 / 1280 / 412 / 390 px — not against live Firebase.
- A month with no sale is a UI-level rule like the rest: the tech side could still add a client's
  CURRENT month as no-sale instead of the salesperson renewing it, when that client has no sale recorded
  in the app yet — the clash rules stop it only after a recorded sale. Its chat room is keyed on the
  month id (no order behind it); checked by service tests (real chat service on the in-memory Firestore)
  and a 37-step browser run, not against live Firebase or the client's side of the chat.
- The per-job Drive mark is a declaration: nothing checks that the file is really in the Drive, and the
  folder trail assumes the team's `Name › Month › Day N › <clips> Clips` layout. Checked by unit tests and
  a browser harness on fake data (1440 / 1280 / 390 px, dark and light) — not against live Firebase or a
  real Drive.
- AI Accounts' writes are browser-side: the rule lets anyone in an account's `visibleTo` update the
  whole document, so the credit totals and holder fields are a UI rule, not a security boundary.
- The rules' catch-all now EXCLUDES the five AI-account collections (Firestore ORs matching rules).
  The older restricted collections (`employee_profiles`, `member_credentials`, `hr_documents`,
  `onboarding_invites`, `cinematic_projects`) are still opened by it — a pre-existing gap, now noted
  in `docs/firestore-rules.md`; closing it needs each HR screen tested against the published rules.

---

## 28. DEVELOPMENT CONVENTIONS

- **Commands:** `npm run dev` (port 8080) · `npm run build` (Vite; the build-truth check) ·
  `npx vitest run` (full suite ≈2 min) · `npx tsc -p tsconfig.check.json --noEmit` (typecheck;
  expect only the VideoCallManager error) · `npm run lint`. `vite dev` does not run `/api`; use
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
  `npx esbuild api/<file>.ts --platform=node --log-level=error > /dev/null`.
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
12. Update CLAUDE.md after successful development (§30 step 10).
13. Remove outdated information from CLAUDE.md.
14. Keep CLAUDE.md synchronised with the actual project.
15. Clearly identify incomplete functionality (§25).
16. Avoid unnecessary large-scale refactoring.
17. Explain significant architectural changes (in the report and in §31).
18. Check for regressions after changes: build, vitest, typecheck, and the related flows.
19. Maintain existing coding conventions (§28).
20. Ask for clarification when requirements conflict with existing business logic and cannot
    safely be inferred.
21. Do not create any other project-context or documentation file (no ARCHITECTURE.md, API.md,
    etc.). Do not add new entries to `docs/AI-MEMORY.md`; history goes in §31. The one exception is
    **`HANDOFF.md`** at the repo root: a temporary note for an UNFINISHED task (§34), deleted when
    that task is done and this file has been updated.
22. Treat TODOs, placeholders and specs as intent, not implementation.

---

## 30. CHANGE PROTOCOL (every development request)

1. Read CLAUDE.md (start with §33).
2. Identify affected modules and files (§9, §10, §22).
3. Inspect the actual current implementation.
4. Compare it with CLAUDE.md.
5. Correct CLAUDE.md if it is outdated.
6. Write a concise implementation plan.
7. Make the requested changes.
8. Check the affected functionality (unit tests; browser harness for UI; state plainly what could
   not be driven, e.g. live Firebase or Gemini).
9. Check for related regressions: `npm run build`, `npx vitest run`,
   `npx tsc -p tsconfig.check.json --noEmit`.
10. Update CLAUDE.md: the relevant sections, §25–§27 status, and a dated §31 entry.
11. Make sure CLAUDE.md describes the new actual state.
12. Report: what changed, files changed, database/API changes, business-rule changes, known
    limitations, and confirmation that CLAUDE.md was updated.

---

## 31. DEVELOPMENT HISTORY (concise; newest first)

Detailed per-session notes up to 2026-09-19 live in `docs/AI-MEMORY.md` (historical, read-only).
Design intent lives in `docs/superpowers/specs/`.

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

---

## 32. CURRENT PROJECT STATE (as of 2026-10-03)

- The 2026-10-03 SMM work is committed (`a15b746`, `e1b9503`), and the renewal countdown popup, the
  month with no sale and the Drive step after a hand-in with it (`14985b1`); social-media months out of
  My Work in `f972c8a`. The instant Drive card (2026-10-04, §31) is complete in the working tree, **not yet
  committed** (check `git status` before committing — parallel sessions work in this tree).
- Open owner decision: CLAUDE.md is ~2,200 lines and is loaded into every session (docs recommend
  under ~200) — trimming it into a short core + on-demand reference would cut usage on every request.
- `main` = the merge of this machine's `346c7f0` into origin/main `1a090f9` (PR #1: the six AdGen
  fixes and AI Accounts; PR #2: the SMM delete / team lead / extra-work change), resolved to
  origin/main's implementation (§31, 2026-10-02) and pushed.
- `npm run build` ✅ (main chunk ≈455 KB, vendor-firebase ≈665 KB, geminiService chunk ≈790 KB; AI
  Accounts adds lazy `AiAccounts` ≈14 KB and `MyAiAccounts` ≈9 KB pages).
- `npx vitest run` ✅ 191 files, 2983 tests (2026-10-04, after the instant Drive card).
- `npx tsc -p tsconfig.check.json --noEmit` → 1 known error (VideoCallManager).
- `npx eslint .` → 599 problems (measured 2026-09-22, pre-existing).
- Most recent work: the SMM month that had no sale (not counted; renewed as a sale) and the month
  deadline fixes, the renewal countdown popup; before them SMM — every month is a sale, Add SMM sale,
  setup with clips per video, renewal by the salesperson, team-leader delete, the visual board
  (2026-10-03); before it the six AdGen fixes (frame-bounded video, duo heights, background plates, cast
  sheets, Kids, spoken address) and AI Accounts (2026-10-01); before them the AdGen integrity batch
  (verified contact facts, script quality gate, final script, fixed-distance duo camera, colour lock, job strip), the one-screen layout, the two-hander
  speaker-label fix and the studio UI, before them the AdGen.ai batch (§31), Cinematic Ads, SMM, Poster Creation, load-time splitting.
- Open follow-ups the owner must act on: replace the invalid and "reported as leaked" Gemini keys
  (§26.3); publish `docs/firestore-rules.md` in the console (it now also protects the Flow / ChatGPT /
  Grok passwords); move secrets out of source; authenticate `/api/send-notification`; run one live
  ad end to end (frames + Veo) to confirm the 2026-10-01 motion and plate rules on real output.

---

## 33. AI DEVELOPMENT CONTEXT (read this first)

**What it is.** DTS-OS ("DTS Manager") is the internal operating system of Dream Team Services, an
Indian ad agency. Sales calls leads and sells ads, posters, SMM months and websites. Tech produces
the ads with Gemini-written prompts (visuals made in external tools). The app also runs HR,
attendance, payroll, commission and finance.

**Stack.** React 18 + TS (non-strict) + Vite 5 + Tailwind/shadcn + zustand; Firebase
Auth/Firestore/FCM called **directly from the browser**; 3 Vercel functions in `api/`
(`send-notification`, `order-chat`, `onboarding`); Gemini via `@google/genai` from the browser
with key/model rotation; Cloudinary uploads; WebRTC; Capacitor Android; PWA with self-update.

**Architecture.** Thick client with no CRUD backend. Rules live in `src/utils` (pure, tested) and
`src/services` (Firestore ops with side-effects: notifications, activity logs, mirrors). Realtime
`onSnapshot` everywhere. Free-tier read quota shapes everything: scope queries, keep listeners
session-long, key effects on `uid`. No cron; sweeps run when pages open.

**Roles.** `main_admin`, `tech_admin`, `sales_admin`, `accounts_admin`, `tech_team_leader`,
`tech_member`, `sales_member`, plus flags `externalCreator` (ad tool only) and `smmLeader`. Team =
users with the same `createdBy`. Guard is `AppLayout allowedRoles` in `App.tsx`; navigation is in
`utils/roleHelpers.ts`.

**Permissions.** Enforced in the UI plus a few server checks. Firestore rules are coarse and were
unpublished as of 2026-08 [NOT CONFIRMED now]. Key rules: >10% discount needs sales admin; only
tech admin purges orders; members never assign; one promise extension; feedback before upsell;
SMM posting needs client approval.

**Entities.** `users`, `leads` (sales embedded in `saleItems[]`), `numberLocks`, `orders` (id
`o_<leadId>_<ms>`), `work_assignments`, `order_chats`, `clients` (id = phone digits),
`smm_campaigns` (id = order id), `ai_generations`, `cinematic_projects`, `notifications`, HR
(`employee_profiles`, `hr_documents`, `agreements`, `company_settings`, `onboarding_invites`,
`member_credentials`, `public_badges`), pay (`payroll_*`, `salary_*`, `commission_settlements`,
`leave_requests`, `daily_checkins`, `attendance`, `holidays`, `salesCheckins`), AI accounts
(`flow_accounts`, `flow_usage`, `paid_accounts`, and their `*_secrets`).

**Core pipeline.** `SaleForm` → `upsertOrderForSale` (order + team-only chat + SMM campaign) →
`SalesApprovals` verify → `createWorkAssignment` → member `MyWork` → `AIPlatformApp` →
the credit step (`useCreditGate`: the Flow credits the ad used) → `useCompleteWork` (completed) →
`verifyAssignments` (verified → client record). Statuses: order
`unassigned` / `assigned` / `completed` / `verified` / `cancelled` / `deleted`; work `assigned` /
`in_progress` / `completed` / `editing` / `verified`.

**Ad generation.** `AIPlatformApp` → `geminiService.generateAdAssets` (voice note → extract →
verified contact facts (`utils/businessFacts`) → core message → voice-over with repair, quality review
and the scored quality gate (best of three drafts), or a custom script word for word → numbers
as words / `mariyu` in Latin → scene plan → motion plan → frames / VIDEO BOTTOM LABEL / poster → Veo prompts
from the same plan) → `ai_generations`. Motion (2026-10-01): every video animates its own frame and
nothing beyond it — in-place staging; only push-in, rack focus, float or locked (a pair: a fixed frame
and a scale anchor); world + place + colour locks; never a goodbye wave. Client photos are background
plates, invented people get a cast sheet, and the last clip says the verified address (§17.2). "Input Final Script" on row 4 rewrites 5 · 6 · 7 from a pasted script (`FinalScriptPanel`). Poster mode → `generatePosterConcepts`. Cinematic Ads (tech admin) is a separate
7-step, project-persisted pipeline. All prompts are in `services/prompts.ts` +
`services/prompts/*`. **`aiadsdts/` is dead; never edit it.**

**AI Accounts.** Flow accounts (1000 credits a month from the creation day, 18 months, 7 / 10 / 12 /
15 credits per 4 / 6 / 8 / 10-second clip, 30 per member by 29 October), the paid ChatGPT / Grok
logins, and the credit entry every video job needs before Mark Complete (§9.21). Members see their
own; the tech admin and team leaders manage all.

**Conventions.** The AI platform is styled with its own scoped system (`.adgen`,
`components/ai-platform/adgen.css`, dark-only) — use `ag-*` classes there, Tailwind/shadcn
everywhere else. `@/` alias; heavy "why" comments; optional fields for back-compat, no
migrations; deterministic ids + `dedupeKey`; transactions for shared arrays; edit both
duplicated WorkAssign/MemberAssignments pages; verify with `npm run build` + `npx vitest run` +
`npx tsc -p tsconfig.check.json --noEmit` (1 known error); browser checks via a throwaway
harness with a faked Firebase.

**Known limitations.** Secrets in source and the Gemini keys in the bundle; unauthenticated push
API; plaintext stored passwords; member delete keeps the Auth account; unscoped listeners on admin
pages; lint debt; no priority, comments or scheduler; accounts module basic.

**Rules.** Follow §29 and §30. CLAUDE.md is the only context file: update it after every
meaningful change (sections + §25–§27 + dated §31 entry). The code wins over this file.

---

## 34. SESSION & USAGE PROTOCOL (owner's standing rules, 2026-10-03)

Why: on 2026-10-03 the usage panel showed **98% of usage was spent at >150k context** — one long
conversation re-sends everything on every step. The fix is short sessions that hand over in a file.
- **Start:** if `HANDOFF.md` exists, read it first and continue from it; read only the files the next
  step needs (it lists them) — do not re-read the whole module.
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
- This file is loaded into EVERY session; the docs recommend under ~200 lines. Keep additions short;
  trimming it (moving detail into on-demand docs) is an open owner decision (§32).

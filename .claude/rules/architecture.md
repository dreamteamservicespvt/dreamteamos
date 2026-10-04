---
paths:
  - "src/App.tsx"
  - "src/main.tsx"
  - "src/components/layout/**"
  - "src/components/common/**"
  - "src/components/ui/**"
  - "src/components/dashboard/**"
  - "src/components/analytics/**"
  - "src/components/birthday/**"
  - "src/components/BirthdayGreeting.tsx"
  - "src/components/ThemeSelector.tsx"
  - "src/components/NavLink.tsx"
  - "src/lib/**"
  - "src/index.css"
  - "index.html"
  - "tailwind.config.ts"
  - "vite.config.ts"
  - "vitest.config.ts"
  - "tsconfig*.json"
  - "package.json"
  - "eslint.config.js"
  - "components.json"
  - "capacitor.config.ts"
  - "android/**"
  - "public/**"
  - "src/store/sidebarStore.ts"
  - "src/services/{appUpdate,capacitor-plugins,birthdays}.ts"
  - "src/hooks/{use-mobile,use-toast,useViewMode,useConfirm,useNow}.ts"
  - "src/utils/{dateRange,periodFilter,formatters,platform,profileCompletion,birthdays,awaitRendered}.ts"
  - "src/pages/*/Dashboard.tsx"
  - "src/pages/*/Analytics.tsx"
  - "src/pages/*/MyAnalytics.tsx"
  - "src/pages/*/MemberAnalytics.tsx"
  - "src/pages/shared/Leaderboard.tsx"
  - "src/pages/main-admin/{SalesDepartment,TechDepartment}.tsx"
  - "src/utils/activityMeta.ts"
  - "src/pages/*/ActivityHistory.tsx"
  - "src/pages/*/SessionHistory.tsx"
  - "src/test/setup.ts"
  - "src/test/memoryFirestore.ts"
  - "README.md"
---

# Architecture, stack, structure, frontend, components, data flows — DTS-OS module context

> Part of the project context (CLAUDE.md → Context map). Claude Code loads this file automatically when a
> file matching the `paths:` above is read or edited. Section numbers are CLAUDE.md's originals, so a
> reference such as "§17.2" still points here. Keep it current per CLAUDE.md §30 step 8; the source code wins.

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

## 6. PROJECT STRUCTURE

```
DTS-OS/
├── CLAUDE.md                  ← this file (single source of project context)
├── README.md                  ← outdated Lovable-style template text ("Dream Team Command")
├── .claude/                   ← Claude Code tooling, committed (not a context doc): settings.json (SessionStart
│                                hook) · hooks/session-start.cjs (prints repo state + HANDOFF.md) · skills/dev/ (`/dev`)
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
│   └── test/                  ← Vitest suites (194 files, 3025 tests at 2026-10-04) + setup.ts + memoryFirestore.ts
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

## 9. APPLICATION MODULES

Each entry lists: purpose · key files · collections · roles.

**9.17 Analytics, leaderboards, reports, logs** ✅. Dashboards per role;
`pages/shared/Leaderboard.tsx` (team-scoped; sales members locked to Month view);
`pages/sales-admin/Analytics.tsx`; `components/analytics/MemberAnalyticsDashboard.tsx`;
`pages/shared/WorkReports.tsx`; activity feeds (`services/activityLog.ts` → `activityLogs`; sales
and tech ActivityHistory pages); session history (`sessions`); payroll audit (`services/auditLog.ts`
→ `audit_logs`).

**9.20 Platform & engagement** ✅. PWA install button, update banner and popup (`components/layout/*`),
Capacitor plugins (`services/capacitor-plugins.ts`), Android back button, `BirthdayGreeting`
(`services/birthdays.ts`, `utils/birthdays.ts`), `ProfileCompletionPrompt`
(`utils/profileCompletion.ts`), `UpdatePopup` (work_assigned / work_editing / attendance_update
popups).

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
  Social Media's stages and charts use the `--viz-*` tokens (R G B channels in `index.css`, light and
  `.dark` values validated with the dataviz palette checker) through Tailwind `viz-*` colours
  (`bg-viz-done/15` works) or `rgb(var(--viz-…))` in SVG — never the brand orange for a stage.
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

## 19. SEARCH / FILTERING / ANALYTICS

- **Search:** client lookup by any phone format (`utils/phone.ts`), lead search in My Leads /
  Leads Management, HR register search (person, type, reference, issuer) with 12-per-page
  pagination, member search on My Team, Tools history search.
- **Filters:** `components/dashboard/PeriodFilterBar`, `DateRangePicker`, `DayPicker`;
  `utils/periodFilter.ts` (cycle / month / custom), `utils/dateRange.ts`; status tabs on
  approvals, orders and HR; `ViewToggle` grid/table (`useViewMode`, localStorage).
- **Pagination:** mostly none (full lists). Exceptions: order history pages (300), HR register
  (12/page).
- **Analytics:** the Social Media Overview dashboard (hand-drawn SVG, §9.9), recharts dashboards (main, tech, sales, accounts), `MemberAnalyticsDashboard`,
  sales Analytics, Leaderboard (day / month / career; career is admin-only), tech productivity
  ratio, profit & loss (`utils/profitAnalytics.ts`), SMM monthly report (`SmmReportPanel`,
  client-wait summary).
- **No external analytics SDK** is wired (the Firebase `measurementId` exists in config, but
  Analytics is not initialised).

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
| `SmmItemDialog` (autosave ~900ms), `SmmContentTable` (+ `SmmCalendar`), `SmmStageBar`, `SmmAdsPanel`, `SmmMoneyPanel`, `SmmBudgetPaymentForm`, `SmmReportPanel`, `SmmMessageComposer`, `SmmDueCard`, `SmmAddSaleDialog`, `SmmSetupForm`/`SmmSetupDialog`, `SmmVisuals`, `SmmCampaignCard` (the one-card glance), `SmmGlance` (status pill, ring, legend, kind bars, time, next post), `SmmRenewalsCard`, `SmmRenewalPopup`, `SmmMyJobPanel`, `useSmmRenewal`, `SmmDashboard` (Insights; + `dashboard/`: `chartKit`, `Headline`, `PaceViews`, `WorkViews`, `RenewalRunway`, `TeamAndAds`, `MonthViews`) | `components/smm/` | SMM month UI, client cards and Insights (§9.9) |
| `AgreementView`, `SignaturePad`, `MandatoryAgreementGate`, `Letterhead` | `components/agreement/` | Document rendering, signing, forced signing gate |
| `IssueDocumentDialog`, `AllDocumentsPanel`, `EmploymentTermsCard`, `KycPanel`, `IdCardView`, `CompanyDocumentsCard`, `ProbationPanel`, `SeparationPanel`, `AssetsPanel` | `components/hr/` | HR centre and profile panels |
| `DailyCheckinPrompt` (mandatory), `CheckoutModal`, `MyDayCalendar` | `components/attendance/` | Tech attendance |
| `DriveUploadSheet` (+ `DrivePendingStrip`, `DriveUploadChip`), `useDriveUploadStep` | `components/work/` | The Drive step after a hand-in (§9.6): the job's folder, file name, the member's Drive link, "It's uploaded" / "Upload later" |
| `AccessCodeGate`, `FieldHint`, `ImageLightbox`, `ViewToggle`, `BrandLogo` | `components/common/` | Shared primitives (FieldHint has a 24px tap target) |
| `CreditUsageDialog`, `useCreditGate`, `FlowAccountDialog`, `FlowAccountsList`, `AssignDialog`, `PaidAccountsPanel`, `SecretField`, `CreditCalculator`, `TargetCard`, `UsageList`, `AiModal` | `components/ai-accounts/` | AI Accounts (§9.21). `useCreditGate` puts the credit step in front of Mark Complete on My Work and Recent Ads; `AiModal` is z-[70] so the credit dialog opens over the full-screen studio |
| `ui/*` | `components/ui/` | shadcn primitives. Do not hand-edit casually |

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
- Native Android camera capture uses the web file input (`@capacitor/camera` not installed).
- Error/loading handling is inconsistent across older pages (plain `console.error`).

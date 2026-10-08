---
paths:
  - "api/**"
  - "vercel.json"
  - "docs/firestore-rules*.md"
  - "src/services/{firebase,notifications,fcm,cloudinary,secondaryAuth,localCacheRecovery,memberCredentials,activityLog,auditLog,gemini}.ts"
  - "src/hooks/{useAuth,useNotifications,useNotificationTap,useFirestore}.ts"
  - "src/store/authStore.ts"
  - "src/pages/auth/**"
  - "src/utils/notificationRouting.ts"
  - "src/components/layout/AppLayout.tsx"
  - "src/components/layout/Sidebar.tsx"
  - "public/firebase-messaging-sw.js"
  - ".env*"
---

# Backend & API, auth & security, notifications, integrations, env, confirmed issues — DTS-OS module context

> Part of the project context (CLAUDE.md → Context map). Claude Code loads this file automatically when a
> file matching the `paths:` above is read or edited. Section numbers are CLAUDE.md's originals, so a
> reference such as "§17.2" still points here. Keep it current per CLAUDE.md §30 step 8; the source code wins.

## 9. APPLICATION MODULES (the entries for this module)

**9.1 Authentication & session** ✅. Email/password login, profile load, deactivation, session log,
cache recovery. `pages/auth/Login.tsx`, `hooks/useAuth.ts`, `store/authStore.ts`,
`services/localCacheRecovery.ts`, `components/layout/Sidebar.tsx` (logout). Collections `users`,
`sessions`. All roles. See §14.

**9.19 Notifications** ✅. See §18.

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

## 18. NOTIFICATIONS

- **In-app:** `sendNotification({userId,type,title,message,link?,meta?,dedupeKey?})` writes
  `notifications`. A `dedupeKey` makes the doc id deterministic, and repeats within 10 minutes
  (same text) are skipped entirely. `hooks/useNotifications.ts` powers the Topbar bell (mark
  read, clear). `UpdatePopup` shows popup types (`utils/notificationRouting.isPopupNotification`:
  `work_assigned`, `work_editing`, `attendance_update`, and since 2026-10-08 `sale_edited`) to `POPUP_ROLES`
  (tech member, sales member, team leader, and — for `sale_edited` — the tech admin).
  `useNotificationTap` handles taps.
- **Push:** the same call fire-and-forgets `POST /api/send-notification` → FCM data message.
  Web: `public/firebase-messaging-sw.js` renders it (call actions, vibration, tags). Native:
  Capacitor PushNotifications + LocalNotifications (`services/fcm.ts`). Tokens live in
  `fcmTokens` and are registered in `initFCM` (AppLayout). The web token needs
  `VITE_FIREBASE_VAPID_KEY`.
- **Fan-outs:** `notifyTechTeamLeaders` (team leaders sharing `createdBy`),
  `notifyTechSideOfNewOrder` (all tech admins + team leaders on order **creation** only; since 2026-10-08 one
  document per person — `order_new_<orderId>_<uid>`, linking to `/tech-admin/orders` or `/team-leader/orders` —
  where one shared key had made each recipient's write replace the last; `orders.removeOrderNotifications`
  deletes them, and a sold month's `smm_new_<orderId>_<uid>`, when the sale is deleted),
  `services/sales.notifySaleEdited` (2026-10-08: a sale the tech side has started was edited → `sale_edited`, a
  POPUP, to every tech admin, team leader and job holder, one per person per edit, `meta.changes` listed in the
  popup; members and leaders never get price lines),
  deadline sweep, SMM due reminders (seller nudged for approvals and budget), birthdays, order-chat
  alerts via `api/order-chat`.
- **Common types:** `work_assigned`, `work_completed`, `work_verified`, `work_editing`,
  `work_unassigned`, `sale_approved`, `attendance_update`, `order_new_*`, `chat_message`,
  `voice_call` / `video_call`, SMM (incl. `smm_lead`, `smm_new_month`; 2026-10-03: `smm_sale_entered`,
  `smm_month_setup`, `smm_renewed`, `smm_renewal_due`, `smm_renewal_reminder`; 2026-10-05:
  `smm_renewal_cancelled` — a renewal month removed, told to the tech admins and team leaders) and HR types, `ai_account`
  (an AI account assigned to or moved from someone), `drive_folder_missing` (a tech member with no Drive folder asks their tech admin; link `/tech-admin/drive`).

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

## 24. BUSINESS RULES (IMPLEMENTED; verified in code)

- **Deactivated users** cannot log in and are signed out live.
- **External APIs failing:** Gemini rotates keys and models, then errors to the UI; push and
  notification failures never block the main action; order, chat and campaign side-effects are
  "never fatal" to a sale.

## 25. CURRENT IMPLEMENTATION STATUS

**PARTIALLY IMPLEMENTED 🟡:**
- Firestore security: rules written but publication [NOT CONFIRMED]; authorization mostly
  client-side.

**NOT IMPLEMENTED ❌** (referenced or planned, absent in code):
- Server-side scheduler/cron; server-side authorization for most writes.
- Self-registration; Firebase Auth account deletion when a member is deleted.
- Firebase Analytics.

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

## 27. POTENTIAL RISKS (need verification)

- Firestore rules may still be unpublished, leaving HR PII (PAN, Aadhaar, salary) world-readable
  with the public web API key.
- Logout deletes FCM tokens **after** `signOut`; if rules require auth, the delete fails silently
  and a shared device may keep receiving the previous user's pushes.
- The seed main-admin auto-creation trusts a hard-coded email on first login.
- `VITE_FIREBASE_VAPID_KEY` is absent locally; web push registration depends on the Vercel env.
- Work access codes, client chat ids and invite codes are bearer secrets. Links forwarded around
  WhatsApp grant access.
- The rules' catch-all now EXCLUDES the five AI-account collections (Firestore ORs matching rules).
  The older restricted collections (`employee_profiles`, `member_credentials`, `hr_documents`,
  `onboarding_invites`, `cinematic_projects`) are still opened by it — a pre-existing gap, now noted
  in `docs/firestore-rules.md`; closing it needs each HR screen tested against the published rules.

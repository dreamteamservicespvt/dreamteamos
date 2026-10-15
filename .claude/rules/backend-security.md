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

The backend is Firestore (accessed directly from the client) plus **four Vercel serverless
functions** in `api/`. Each initialises `firebase-admin` from `FIREBASE_SERVICE_ACCOUNT_KEY` and
accepts `POST` only (`OPTIONS` → 204) — except `smm-monitor` (GET or POST, behind `CRON_SECRET`). There is no Express
server, no middleware stack; the one background job is the SMM server checker (2026-10-15, below). `vite dev` does **not** serve `/api/*`; use `vercel dev` or the DEV-only
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
| `smm-approvals` (2026-10-15) | guest token | the Social Media pieces waiting for this client's approval on the month whose id = the chat id (`utils/smmClientApproval.piecesAwaitingClient`) |
| `smm-answer` (2026-10-15) | guest token | records the client's ✔ / changes on one piece in a transaction on `smm_campaigns/{chatId}` (as `recordApproval` does + `approvalProof` via the client chat; 409 with a sentence when already answered); alerts the publisher (approved) / maker (changes) and the salesperson, link `/smm/control/<id>` |
CORS: production, `dreamteamos-*.vercel.app` previews, `https://localhost`, `http://localhost:*`.
Notification links per recipient come from `homeFor(role)`.

### `GET|POST /api/smm-monitor` (`api/smm-monitor.ts`, 2026-10-15, `maxDuration` 60)
SMM Delivery Control's **server checker** — the supervisor (`utils/smmMonitor.monitorSmm`) run when every app is closed. **Auth:**
`Authorization: Bearer <CRON_SECRET>` (what Vercel Cron sends) or `x-cron-secret: <CRON_SECRET>` (cron-job.org), constant-time
compare (`utils/smmServerDelivery.cronAuthProblem`); no `CRON_SECRET` → 500, wrong → 401, nothing read before the check; takes no input.
**Woken** by cron-job.org every 30 min 09:00–20:00 IST (to be set up by the owner) plus the Vercel daily cron at 04:30 UTC
(`vercel.json` `crons`, the Hobby plan's once a day). **Reads** (Admin SDK): `app_settings/smm_delivery`, active `smm_campaigns`,
`users` (name, role, smmLeader, isActive), `holidays`, today's `attendance` / `daily_checkins`, `leave_requests` with `toDate >= today`,
`smm_alert_state`. **Writes** only `notifications/{key}` with `create()` (exists = already sent — the dedupe; types `smm_urgent` /
`smm_notice`), the heartbeat `lastRunAt` + `lastRunSummary` (merge; a failed run writes none), and deletes dead FCM tokens. Pushes with
`messaging().sendEach` directly (NOT `/api/send-notification`): data-only; urgent = high priority / 4 h TTL, channel `smm_urgent` only to
tokens flagged `channels: "smm_urgent"` (else `default`); notice = normal / 24 h. Off → heartbeat only; Preview → computed, nothing
sent; stops sending after 40 s (the rest next run). Its runtime imports of the alias-free utils end in `.js` (Node ESM on Vercel).

### `POST /api/onboarding` (`api/onboarding.ts`), `{ action, inviteId, code, ... }`
Actions `open` · `accept-offer` (signature URL) · `accept-joining` (creates the account) ·
`decline` (reason). Every call re-checks the 4-digit code (lockout after 5 tries for 15 minutes; 410
revoked or expired, 409 wrong state). `publicView()` names the fields that go out (a test forbids
`accessCode`, `generatedPassword`, `failedAttempts`). `provision()` writes in one batch:
`users/{uid}` (`createdBy` = inviting admin), `employee_profiles/{uid}`, two signed `hr_documents`,
`member_credentials/{uid}`. It is idempotent via a claim transaction and rolls back to
`offer_accepted` on failure (e.g. `email_taken`). DEV fallback: `services/onboardingGuest.ts`
performs the same steps in the browser when `import.meta.env.DEV`. **Its "today" is the India day** (2026-10-15):
`todayIso()` formats `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" })`, because Vercel runs in UTC and
`toISOString().slice(0, 10)` was yesterday between 00:00 and 05:30 IST — it dates `offerAcceptedOn`,
`joiningAcceptedOn`, the starting stage (joining today → probation), both letters' `signedDate` and the offer-expiry
check (`publicView.expired`). The DEV twin uses the local `hrPolicy.todayIso()`.

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
  curl check that should return 403 for each sensitive collection once published. **2026-10-12:**
  `smm_campaigns` got its first own rule (kept out of the catch-all) — the view-only Social Media Team Lead
  updates only months she is on and creates / deletes none; the same check runs in the browser before every
  month write (`services/smm.assertMayChangeMonth` / `assertMayManageMonths`, reading the signed-in user from
  the auth store), so the screens, the services and the rule agree (`smm.md` §9.9). **2026-10-15:** `app_settings`
  got its own rule (kept out of the catch-all): staff read and write every document as before, except
  `app_settings/smm_delivery` (SMM Delivery Control's switch), which only the main admin and the tech admin write — the
  same check `services/smmDeliverySettings` makes from the auth store before writing.
- **Secrets in source (values not reproduced here):** Firebase web config (public by design) in
  `services/firebase.ts` and duplicated in `services/secondaryAuth.ts`; a **Gemini API key** in
  `services/gemini.ts` (dead code); **Metered.ca TURN username/credential** in
  `services/webrtcConfig.ts`; Cloudinary cloud name plus unsigned preset in
  `services/cloudinary.ts`. `.env` and `android/app/google-services.json` are gitignored.

## 18. NOTIFICATIONS

- **In-app:** `sendNotification({userId,type,title,message,link?,meta?,dedupeKey?,once?})` writes
  `notifications`. A `dedupeKey` makes the doc id deterministic, and repeats within 10 minutes
  (same text) are skipped entirely. **`once: true`** (2026-10-13) = the key names one occurrence (it
  carries the day): written at most once, ever — never re-sent, whether read, cleared or not. Used by
  the once-a-day reminders: birthdays, `smm_due`, `smm_renewal_due`, `smm_renewal_reminder`,
  `drive_folder_missing`. Without it they re-sent on every app open more than 10 minutes apart (a new
  phone alert each time, and the row back as unread after "Mark all read"). An event key without `once`
  (`work_completed_<id>`, `work_deadline_*`) still comes back as new when it really happens again.
- **The bell** (Topbar, `hooks/useNotifications.ts` → `services/notificationInbox.ts`, rules in
  `utils/notificationInbox.ts`; owner, 2026-10-13, "Mark all read and Clear all are not working").
  One listener on the newest 50 rows (`INBOX_WINDOW`; the panel shows 20) after the person's cleared
  point, plus one on `notification_state/{uid}`. Without the composite index (userId, createdAt desc) it
  falls back to the person's unordered rows, sorted in the browser; that listener is now torn down with
  the first (it used to leak). **Mark all read** marks EVERY unread row up to the newest on screen: the
  rows on screen first (the dots and badge go at once), then `where userId == && read == false` for
  the rest. Before, only the ≤50 loaded rows were touched. **Clear all** writes ONE point,
  `notification_state/{uid}.clearedUpTo` = the newest row on screen's `createdAt` (exact Timestamp).
  Every row at or before it is hidden on every device, and marked read so `UpdatePopup` agrees. Rows are
  **not deleted**: nothing else ever deleted them, so the old "delete the 50 loaded" let the next 50
  slide in. The kept row is also what stops a `once` reminder from coming back. A toast offers **Undo**
  for 6 s (the point goes back, the rows marked read are unread again). The bell stays open on Undo:
  `[data-keeps-bell-open]` is exempt from the outside-click close, which otherwise hid the rows Undo
  brought back. Undo shows NO "restored" toast (the rows coming back say it). A failure shows a destructive
  toast; one action runs at a time (spinner, buttons disabled). Only a real arrival chimes — a new id NEWER
  than every row seen this session, or a keyed row re-sent with a later time — never an Undo, a row turning
  read / unread, or an older row the bell only now loads.
- **One row at a time** (owner, 2026-10-13, later; `components/layout/NotificationRow.tsx`). Each row: tap to open
  (as before), an **X** or a **sideways swipe** (framer-motion `drag="x"`: past a third of the row, at most 96px, or
  a flick — `utils/notificationInbox.isDismissSwipe`; the swipe uncovers "Dismiss"; vertical scrolling still works)
  dismisses it, and an **envelope** marks it unread (on a read row) or read without opening it (on an unread row).
  **Dismiss** = `dismissed: true` + `read: true` on the row (`services/notificationInbox.dismissNotification`), hidden
  on every device, NOT deleted (the kept row stops a `once` reminder coming back), with a 5 s Undo toast that
  restores the row as it was. **Mark as unread** = `read: false` + `markedUnreadAt`; UpdatePopup skips a row with
  `markedUnreadAt` (the person has seen it; the bell's dot is the reminder). Firestore cannot query "not dismissed"
  (older rows lack the field), so when dismissed rows fill the loaded window and the panel shows fewer than 20,
  the listener asks for 50 more, up to 200 (`nextInboxWindow`). Desktop panel 24rem (was 20rem) for the two 28px
  buttons. The badge: 14px, text 9px, on the bell's top-right corner with a ring (it was 16px over the icon).
- **The 90-day clean-up** (owner, 2026-10-13; `services/notificationCleanup.ts`). 30 s after the bell mounts, the
  first app of the day (claimed in a transaction on `app_settings/notification_cleanup`; a device that looked
  today skips, `localStorage`) deletes every `notifications` row older than 90 days, for everybody, oldest first,
  in batches of 400, at most 2,000 a day (the rest on later days). Safe: every `once` key carries its day. Never
  fatal. Needs the catch-all rule's `delete` on other people's rows — see `docs/firestore-rules.md`.
- **Toasts** sit at the BOTTOM on every screen since 2026-10-13 (`components/ui/toast.tsx`; padded for the home
  bar). Below 640px they used to sit at the top (z-100), over the top bar and the bell's buttons — a tap meant for
  "Mark all read" landed on one. Sonner was already at the bottom.
- **Popups:** `UpdatePopup` shows popup types (`utils/notificationRouting.isPopupNotification`:
  `work_assigned`, `work_editing`, `attendance_update`, and since 2026-10-08 `sale_edited`) to `POPUP_ROLES`
  (tech member, sales member, team leader, and — for `sale_edited` — the tech admin).
  `useNotificationTap` handles taps.
- **Push:** the same call fire-and-forgets `POST /api/send-notification` → FCM data message.
  Web: `public/firebase-messaging-sw.js` renders it (call actions, vibration, tags; since 2026-10-15 `smm_urgent` with
  `requireInteraction`, `renotify`, a long vibration and tag = the alert key). Native:
  Capacitor PushNotifications + LocalNotifications (`services/fcm.ts`; 2026-10-15 an `smm_urgent` channel, importance high, and the
  token saved with `channels: "smm_urgent"` — needs a new APK; a full-screen intent on a locked phone needs native code, not written). Tokens live in
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
  `smm_renewal_cancelled` — a renewal month removed, told to the tech admins and team leaders; 2026-10-15:
  `smm_delivery_off` — SMM Delivery Control turned off, with the reason, to every other active main admin, key
  `smm_delivery_off_<ms>_<uid>`, link `/smm`; SMM Delivery Control (2026-10-15): `smm_urgent` / `smm_notice` — written ONLY by
  `api/smm-monitor` (the apps only display them; `smm_urgent` is deliberately NOT an `UpdatePopup` popup type — the in-app full
  screen is the alert host's, computed live), `smm_moved`, `smm_reassigned`, `smm_remind` (`once`), `smm_test`, and
  `smm_approved` / `smm_changes` from the client chat) and HR types, `ai_account`
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
| `CRON_SECRET` (2026-10-15) | `api/smm-monitor.ts` (server only; NOT `VITE_`-prefixed, never bundled) | protects the SMM server checker; Vercel Cron sends it as `Authorization: Bearer`, cron-job.org as `x-cron-secret`. **To be set by the owner** — until then the endpoint answers 500 and no server alerts go out |
| `import.meta.env.DEV` | `onboardingGuest.ts`, `orderChatGuest.ts` | Enables in-browser fallbacks for `/api` flows during `vite dev` |
| `__BUILD_ID__` (define, not env) | `services/appUpdate.ts` | Build identity compared with `/version.json` |

Hard-coded configuration that is not in env: see §14 (Firebase config, Cloudinary, TURN, legacy
Gemini key), the production API base URL, and CORS allow-lists in `api/*`.

## 24. BUSINESS RULES (IMPLEMENTED; verified in code)

- **Deactivated users** cannot log in and are signed out live.
- **External APIs failing:** Gemini rotates keys and models (`ai-ads.md` §17.3), then tells the UI in a plain
  sentence why nothing could answer (`GeminiUnavailableError`) — never Google's raw JSON; push and
  notification failures never block the main action; order, chat and campaign side-effects are
  "never fatal" to a sale.

- **The bell (owner, 2026-10-13):** "Mark all read" marks every unread notification the person has
  up to the newest one on screen, and "Clear all" empties the bell for good on every device (Undo for
  6 s). Neither touches a notification that arrived after the newest one on screen. A once-a-day
  reminder never comes back the same day once it has been read, cleared or dismissed. One row can be dismissed
  (X or swipe, Undo 5 s) or marked unread; a row marked unread does not pop up again. Notifications older than
  90 days are deleted, once a day, company-wide (2026-10-13, later).

## 25. CURRENT IMPLEMENTATION STATUS

**PARTIALLY IMPLEMENTED 🟡:**
- Firestore security: rules written but publication [NOT CONFIRMED]; authorization mostly
  client-side.
- The bell (2026-10-13): cleared and dismissed notifications are hidden, not deleted; what keeps the collection
  small is the 90-day clean-up (2,000 rows a day at most, so a large first backlog takes several days). It runs only
  when somebody opens the app and needs the catch-all rule's delete. The first "Mark all read" or "Clear all" of a
  person with a long unread backlog reads and writes each unread row once. A person who dismisses more than ~180 of
  their newest 200 rows one by one sees fewer than 20 until they Clear all (the window stops at 200). On a phone a
  toast now sits at the bottom for its 5 s, over whatever is there (a chat's message box, a sticky Save bar); swipe
  it right to close it. The bell's index is in `firestore.indexes.json`, but whether it exists live is
  [NOT CONFIRMED] (the CLI here was not signed in). Checked by unit tests, the services on the in-memory Firestore,
  the real Topbar and UpdatePopup in jsdom (`notificationInboxOct13`, `notificationRowsOct13`) and a browser
  harness. Not checked against live Firebase, push, or the published rule for `notification_state`.

**NOT IMPLEMENTED ❌** (referenced or planned, absent in code):
- A general server-side scheduler (only SMM Delivery Control's checker runs on a cron since 2026-10-15); server-side authorization for most writes.
- Self-registration; Firebase Auth account deletion when a member is deleted.
- Firebase Analytics.

## 26. CONFIRMED ISSUES (evidence in code)

1. **Unauthenticated push endpoint.** `api/send-notification.ts` accepts any POST with a
   `userId` and pushes to that user. CORS only limits browsers.
2. **Secrets committed in source:** Gemini API key in `src/services/gemini.ts` (its only export
   `verifyScreenshot` has **no callers**, so it is dead code carrying a live-looking key); TURN
   credentials in `src/services/webrtcConfig.ts`.
3. **Gemini keys shipped to every browser — and Google now reports several as leaked** (403 "Your API
   key was reported as leaked" on keys 13, 16 and 23–28, measured 2026-10-10; keys 1, 12, 18 invalid — 11 of 30
   dead, 19 working). `envPrefix`
   includes `API_KEY_` and `GEMINI_`, so every key is in the public bundle, and `geminiService.ts` also
   logs each key's first 6 and last 4 characters to the console on load ("DEBUG … remove after
   verification"). The call layer skips dead keys, but each is capacity lost; they must be replaced, and
   the lasting fix is a server-side proxy so no key reaches a browser.
4. **Plaintext passwords stored** in `member_credentials` (by design, admin-readable) and in
   completed `onboarding_invites`.
5. **Deleting a member leaves their Firebase Auth account** (only Firestore docs are deleted), so
   the email cannot be reused and the auth record lingers.
6. ~~One TypeScript error~~ — FIXED in `5ca75b0` (2026-10-12): `VideoCallManager.tsx` no longer reads `Plugins` off
   `CapacitorGlobal`; `npx tsc -p tsconfig.check.json --noEmit` reports 0 errors.
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

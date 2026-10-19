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

The backend is Firestore (accessed directly from the client) plus **five Vercel serverless
functions** in `api/`. Each initialises `firebase-admin` from `FIREBASE_SERVICE_ACCOUNT_KEY` and
accepts `POST` only (`OPTIONS` → 204) — except `smm-monitor` (GET or POST, behind `CRON_SECRET`) and `devos` (GET =
its cron tick behind `CRON_SECRET`, POST = actions with an ID token). There is no Express server, no middleware stack;
the background jobs are the SMM server checker (2026-10-15) and the Development OS tick (2026-10-18), both below.
`vite dev` does **not** serve `/api/*`; use `vercel dev` or the DEV-only fallbacks.

### `POST /api/send-notification` (`api/send-notification.ts`)
- **Purpose:** send an FCM push to all of a user's device tokens.
- **Body:** `{ userId, title, message, link?, type?, callDocId? }` (400 if the first three are
  missing).
- **Auth (2026-10-18):** `Authorization: Bearer <Firebase ID token>` of an ACTIVE staff member (`verifyIdToken` →
  `users/{uid}` exists and `isActive !== false`) — 401 without / with a bad token, 403 for a guest or a switched-off
  account. Until then it had **none**: anybody could push any text, or a fake call, to any staff member's devices.
  `services/notifications.sendNotification` sends the member's token (no one signed in → no push, the bell row is
  still written). CORS for `https://localhost` (Capacitor) and production; `Authorization` allowed in the preflight.
  Test: `sendNotificationAuthOct18`.
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

### `GET|POST /api/devos` (`api/devos.ts`, 2026-10-18, `maxDuration` 60)
The **Development OS server** — the one module whose every write is server-side (answer keys, scores, XP and ranks
must stay out of the browser; `devos.md` §9.23). **POST** `{action, …}`: `Authorization: Bearer <Firebase ID token>` →
`verifyIdToken` → `users/{uid}` (name, role, `createdBy`, `isActive`, `externalCreator` — never the body) →
`engine/router.dispatch` (refuses a switched-off account / an external creator first; input validated per action);
answers `{ok, result}` or `{ok:false, code, error}` with a plain sentence (`DevError` status). **GET** = the tick
(`engine/tick.runTick`, 48 s budget). With `CRON_SECRET` set: exactly like `smm-monitor` (`cronAuthProblem`; wrong /
missing → 401). **Without it (2026-10-18, owner: "0% human involvement") the tick is OPEN but throttled:** a repeat within
a minute on a warm instance → 202 before any read; otherwise one transaction on `devos_runs/open` lets at most ONE run per
20-minute slot company-wide (`tick.claimTickSlot`) → 202 for the rest. Accepted risk: anybody can make the normal,
idempotent, budgeted daily work run on time (never more often; the AI budget and the per-run caps still hold), at a cost
of one read per call that reaches the claim. Woken by SEVEN daily Vercel crons (`vercel.json`, on the hour; their
`x-vercel-cron-schedule` header is recorded as the run's `trigger`). **Secrets:** the sealing /
signing keys are derived from the service account's `private_key` — no new variable. **Gemini:** server-side REST
(`engine/geminiPort`, key in the `x-goog-api-key` header), keys = env `API_KEY_n` / `VITE_API_KEY_n` / `GEMINI_API_KEY`
/ `API_KEY` / `VITE_API_KEY` + `gemini_api_keys` docs not `failed`; metered (policy daily budget, ≤ 8 requests per
action, 30 / 40 for ticks), dead keys remembered by fingerprint in `devos_health/current.deadKeys` for a day; no name
or personal data in any prompt. **Writes** only `devos_*` and `notifications/{key}` (`create()`, `meta.source "devos"`)
+ data-only FCM push (`default` channel; dead tokens deleted) — NOT through `/api/send-notification`. CORS: production,
`dreamteamos-*.vercel.app`, `https://localhost`, `http://localhost:*`. Relative imports end in `.js`; parse after
editing: `npx esbuild api/devos.ts --bundle --platform=node --format=esm --external:firebase-admin --external:@vercel/node --log-level=error --outfile=/dev/null`.

### `POST /api/staff-account` (`api/staff-account.ts`, 2026-10-18)
Creates a staff LOGIN with the Admin SDK for the admins' add-member screens (main admin Team Management, tech / sales
admin My Team, via `services/secondaryAuth.createUserWithoutSignOut(email, password, role)`; a DEV build keeps the old
browser path). Bearer ID token of an ACTIVE admin; who may create whom (`CAN_CREATE`): main_admin → every role but
main_admin, tech_admin → tech_member / tech_team_leader, sales_admin → sales_member (403 otherwise). Answers `{uid}` or
`{error, code}` with the client SDK's codes (`auth/email-already-in-use`, `auth/weak-password`, `auth/invalid-email`).
Why: browser account creation needs Firebase's PUBLIC sign-up on, and with it on anybody could register an account the
rules treat as staff (rules audit G1). **Owner:** once deployed, switch public sign-up OFF (Firebase console →
Authentication → Settings → User actions → untick "Enable create (sign-up)"). Test: `staffAccountOct18` (14).

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
- **Firestore rules:** the model is in `docs/firestore-rules.md`, **published 2026-10-18** (until then the console
  held `allow read, write: if true`). Checked from outside the same minute: anonymous list / write → 403 on every
  sensitive collection, `public_badges` lists by design. Public email sign-up was switched OFF the same day (logins
  come only from `api/staff-account` / `api/onboarding`); the only provider is Email/Password. Still open: G2–G11
  (a staff member can rewrite their own `users.role`; HR / pay collections open to all staff; guest gaps). **2026-10-12:**
  `smm_campaigns` got its first own rule (kept out of the catch-all) — the view-only Social Media Team Lead
  updates only months she is on and creates / deletes none; the same check runs in the browser before every
  month write (`services/smm.assertMayChangeMonth` / `assertMayManageMonths`, reading the signed-in user from
  the auth store), so the screens, the services and the rule agree (`smm.md` §9.9). **2026-10-15:** `app_settings`
  got its own rule (kept out of the catch-all): staff read and write every document as before, except
  `app_settings/smm_delivery` (SMM Delivery Control's switch), which only the main admin and the tech admin write — the
  same check `services/smmDeliverySettings` makes from the auth store before writing. **2026-10-18:** every `devos_*`
  collection is kept out of the catch-all by its prefix: browsers write none (the Development OS writes only through
  `api/devos`), a person reads only their own `devos_users/{uid}` record, staff read the boards, leagues, missions and
  the policy. Because publication is [NOT CONFIRMED], the Dev OS does not rely on the rules: answer keys are AES-GCM
  sealed and the ledgers (attempts, XP, rank events, the profile) HMAC-signed with keys derived from the service
  account (`core/crypto`; `admin.integrity` reports and repairs a row edited outside the server).
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
  (`work_completed_<id>`) still comes back as new when it really happens again. **`work_deadline_*` is `once` since
  2026-10-19** (owner: Kusuma got deadline alerts all day): the sweep re-sent each late order every 6 h that anybody
  opened Orders, rewriting the row as unread with a new push. Key `work_deadline_<orderId>_<due_soon|overdue>[_ext]_<uid>`
  — the old key, so alerts already sent count as delivered; `_ext` = an extended promise, told once more. A row the
  90-day clean-up deleted can be sent once again if the order is still late then.
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
  (an AI account assigned to or moved from someone), `drive_folder_missing` (a tech member with no Drive folder asks their tech admin; link `/tech-admin/drive`),
  and the Development OS's (2026-10-18, written ONLY by `api/devos`, key = the notice's once key): `devos_invite`,
  `devos_quest` (09:00), `devos_due` (17:00), `devos_result`, `devos_badge`, `devos_rankup`, `devos_league`,
  `devos_mission`, `devos_report` (main + tech admin) — links `/dev-os…`, quiet hours 20:00–09:00 for pushes.

## 20. THIRD-PARTY INTEGRATIONS

| Service | Purpose | Code | Data sent / received | Auth | Errors |
|---|---|---|---|---|---|
| Firebase Auth | Staff login, guest custom tokens | `services/firebase.ts`, `secondaryAuth.ts`, `orderChatGuest.ts`, `api/*` | credentials / ID tokens | web config + service account | mapped `auth/*` codes |
| Cloud Firestore | All data | everywhere | documents | Auth + console rules | toasts, "never throw" services |
| Firebase Cloud Messaging | Push | `services/fcm.ts`, sw, `api/send-notification.ts`, `api/order-chat.ts` | tokens, data payloads | VAPID key; service account | invalid tokens deleted |
| Google Gemini | Scripts, prompts, extraction, vision reads; the Development OS's question writer, solver, rubric judges, embeddings, coach, reports, practicals (2026-10-18, server-side REST) | `services/geminiService.ts`, `cinematicAdsService.ts`, `gemini.ts`, `src/devos/engine/geminiPort.ts` (via `api/devos`) | business info, uploaded images/audio/text as base64, prompts; Dev OS: fictional scenarios, rubrics and answer text only — no names | API keys in bundle; Dev OS: the same keys on the server | key/model rotation (§17.3); Dev OS: dead keys remembered a day, bounded calls, answers stay pending when it fails |
| Cloudinary | File/image uploads (avatars, signatures, chat files, proofs, frames) | `services/cloudinary.ts` | files → `secure_url` | unsigned upload preset | rejects on non-2xx |
| Vercel | Hosting + 5 functions + 2 daily crons (`smm-monitor`, `devos`) | `vercel.json`, `api/` | — | env vars for the service account and `CRON_SECRET` | — |
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
| `CRON_SECRET` (2026-10-15) | `api/smm-monitor.ts`, and since 2026-10-18 `api/devos.ts` GET (server only; NOT `VITE_`-prefixed, never bundled) | protects the SMM server checker; for the Development OS tick it is OPTIONAL hardening (unset → the open, slot-throttled tick — it runs by itself on Vercel's crons). Vercel Cron sends it as `Authorization: Bearer`, cron-job.org as `x-cron-secret`. Not set as of 2026-10-18: `smm-monitor` answers 500 and sends no server alerts until it is |
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
- Firestore security: rules published 2026-10-18 (outsiders refused), but coarse — any staff member can still write
  most collections, incl. their own `role` (G2–G4); authorization mostly client-side.
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
- A general server-side scheduler (only SMM Delivery Control's checker, since 2026-10-15, and the Development OS tick,
  since 2026-10-18, run on a cron); server-side authorization for most writes (the Development OS is the exception:
  all of its writes are server-side).
- Self-registration; Firebase Auth account deletion when a member is deleted.
- Firebase Analytics.

## 26. CONFIRMED ISSUES (evidence in code)

1. ~~Unauthenticated push endpoint~~ — FIXED 2026-10-18: `api/send-notification.ts` takes only an active staff
   member's ID token (§12).
2. **Secrets committed in source:** TURN credentials in `src/services/webrtcConfig.ts`. The dead
   `src/services/gemini.ts` (a hard-coded Gemini key, no callers) was deleted on 2026-10-18 — the key is still in git
   history, so it must be revoked in Google AI Studio.
3. **Gemini keys shipped to every browser — and Google now reports several as leaked** (403 "Your API
   key was reported as leaked" on keys 13, 16 and 23–28, measured 2026-10-10; keys 1, 12, 18 invalid — 11 of 30
   dead, 19 working). `envPrefix`
   includes `API_KEY_` and `GEMINI_`, so every key is in the public bundle (the console log of each key's first 6
   and last 4 characters was removed on 2026-10-18). The call layer skips dead keys, but each is capacity lost; they must be replaced, and
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

- The published rules were checked statically, not on the emulator: a screen the audit missed may now get
  "permission denied" — run the ten checks in `docs/firestore-rules.md` with real logins.
- The seed main-admin auto-creation trusts a hard-coded email on first login.
- `VITE_FIREBASE_VAPID_KEY` is absent locally; web push registration depends on the Vercel env.
- Work access codes, client chat ids and invite codes are bearer secrets. Links forwarded around
  WhatsApp grant access.
- The rules' catch-all now EXCLUDES the five AI-account collections (Firestore ORs matching rules).
  The older restricted collections (`employee_profiles`, `member_credentials`, `hr_documents`,
  `onboarding_invites`, `cinematic_projects`) are still opened by it — a pre-existing gap, now noted
  in `docs/firestore-rules.md`; closing it needs each HR screen tested against the published rules.

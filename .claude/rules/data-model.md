---
paths:
  - "src/types/**"
  - "src/services/**"
  - "src/hooks/**"
  - "docs/firestore-rules*.md"
  - "src/test/memoryFirestore.ts"
---

# Database: collections, fields, relationships, statuses — DTS-OS module context

> Part of the project context (CLAUDE.md → Context map). Claude Code loads this file automatically when a
> file matching the `paths:` above is read or edited. Section numbers are CLAUDE.md's originals, so a
> reference such as "§17.2" still points here. Keep it current per CLAUDE.md §30 step 8; the source code wins.

## 13. DATABASE ARCHITECTURE (Cloud Firestore)

No schema files or migrations exist. Shapes are the TypeScript interfaces in `src/types/*`.
Timestamps are typed `any` (Firestore `Timestamp`/`serverTimestamp()`); `Timestamp.now()` is used
inside arrays. **Composite indexes:** since 2026-10-13 `firestore.indexes.json` (root, with `firebase.json` pointing at
it — indexes only, no rules, and `.firebaserc` → `dts-manager`) holds the bell's `notifications (userId ↑, createdAt ↓)`.
It is the only one written down: every other composite index a query needs lives only in the console [NOT CONFIRMED],
so a `firebase deploy --only firestore:indexes` asks whether to delete the console's others — answer **No** (or first
add them: `firebase firestore:indexes > firestore.indexes.json` exports the live list).

### Core collections
| Collection (doc id) | Type | Key fields / notes |
|---|---|---|
| `users/{uid}` | `AppUser` | `role`, `name`, `email`, `phone`, `createdBy` (**team key**), `isActive`, `salary` (mirrors package), `salaryPackageId`, `dailyTarget`, `earningsOption` (`stipend_plus_5`/`incentive_10`), **`payHistory[]`** (2026-10-15, `PayTermsChange`: `from` = the first pay period `yyyy-MM` it applies to, `salary`, `dailyTarget?`, `earningsOption?`, `previous?` {the terms before}, `at` (ms), `byUid`, `byName` — appended by `services/payroll.savePayTerms` when salary / target / plan change; the top-level fields keep the LATEST terms; read per period by `utils/payTerms.payTermsFor`; absent = no change recorded → the stored fields for every period), `employmentType`, `externalCreator`, `smmLeader`, `employeeId`, `avatar`, `dob`, `businessWhatsapp`, `signatureUrl`, `designation`, `googleDriveBaseUrl`, `activeFlowAccountId` (the Flow account in use). Deprecated: `target`, `monthlyTarget` |
| `leads/{auto}` | `Lead` | `assignedTo` (sales member), `assignedBy`, `phone` (+91…), `displayName`, `realName`, `status` (`not_called`/`answered`/`not_answered`/`call_later`/`not_interested`), `notes`, `saleDone`, **`saleItems: SaleDetail[]`** (legacy `saleDetails`), freeze mirrors (`frozen`, `saleFrozen*`), `duplicateCleared`, `isCustomEntry`. **2026-10-08:** each `SaleDetail` carries **`saleId`** (`<leadId>_<ms recorded>`, immutable; older sales get it derived by `utils/saleIdentity.saleIdOf` and stamped on the next write) — written only through `services/sales` transactions, found by id, never by position. **2026-10-15:** `SaleDetail.firstVerifiedAt` (set at the first approval, kept by every revoke / rejection / re-approval — `utils/saleDecision.keepFirstApproval`; absent = read `verifiedAt`, then `submittedAt`, `lead.createdAt`); `SmmSaleSpec.startDate` (`yyyy-MM-dd`, the sale form's "Month starts on"; absent = a renewal starts on the old end date, a first month on the sale day); `payments[]` (`SalePayment`: `id`, `amount`, `collectedAt` = the day the money came — My Leads' "Collected on", the moment when today, else midday of that day —, `note`, `screenshotUrl`, `byId`, `byName`): an advance ticked on an edit is written as id `pay_opening` dated to the sale; commission keys a collection as `<saleId>#<payment id>` (`salePayments.collectionKey`; the money taken at the sale, recorded or not = `opening`). The renewal prefill's `SmmRenewalPrefill.previousEnd` (the renewed month's end date, the earliest start) is in memory only |
| `numberLocks/{digitsPhone}` | `NumberLock` | `ownerId`, `ownerLeadId`, `reserveExpiresAt` (+24h), `saleFrozen`, `saleFrozenUntil`, `timeline[]` (`claimed`/`taken_over`/`sold`/`admin_override`) |
| `schedulePools/{auto}` | `SchedulePool` | `createdBy`, `assignedTo`, `numbers[]`, `releasedCount`, `dailyLimit`, `minCompletionPercent`, `isActive`, `lastReleasedDate` |
| `orders/{o_<saleId>}` = `o_<leadId>_<submittedAtMs>` (legacy `o_<leadId>__<idx>`) | `Order` | client (`clientPhone`, `clientPhoneId`, `businessName`, `clientName`), sale copy (`category`, `packageKey`, `amount`, bulk/discount fields, `requirement`, `promise`), link (`leadId`, **`saleId`** (2026-10-08), `saleItemIndex` / `saleItemKey` (where the sale sat when written — positions move), `saleSubmittedAtMs`), attribution (`soldBy`, `soldByName`, `salesAdminId`, `fromAd`), `saleVerified`, **`status`**, `workAssignmentId`, `assignedTo`, `progress` (SMM/bulk), `bulkVideos[]`, `penalties[]`/`penaltyTotal`, `updateNotes[]`, `feedback` (after-sale call), `clientReview` (mirror), tombstone/restore/retire fields |
| `work_assignments/{auto}` | `WorkAssignment` | `assignedTo`, `assignedBy`, `category` (`wishes`/`promotional`/`cinematic`/`bulk_ads`/`social_media_management`/`poster`), `clipCount`, `duration`, `pricePerUnit`, `uniqueId` (W/P/C/PS/O + number), **`accessCode`** (4 digits), `status`, `sessions[]`, `totalDurationSeconds`, `date`, ad spec (`modelGender`, `attireType`, `customAttire`, `aspectRatio`, `language`, `festival`, `characterPack`, `customCharacter` (Custom Character only), `realLocationProvided`, poster fields), brief (`requirementNotes`, `businessInfo`, `businessAddress`), `orderId`, `saleId` (2026-10-08, from the order), `chatId`, `promise`, `tracks[]`, `savedGenerationId`, `saleDeleted*`, `reassignedFrom/By/At`, `driveUploadedAt` / `driveUploadPath` / `driveFileName` (the member's word that the file is in their Drive, 2026-10-03; cleared on each hand-in) |
| `clients/{digitsPhone}` | `Client` | profile assets, `works[]`, totals, `reviews[]` (server-written), `salesAdminIds[]`, `soldByIds[]` (array-contains scope), `firstSoldBy`, review/loyalty mirror |
| `order_chats/{chatId}` (+`messages`) | `OrderChatDoc` | `chatId` = order id for sold work, else assignment id (`utils/orderChatId.orderChatIdOf`). `participants[]`, `accessCode`, `status` (`open`/`locked`), `clientReady`, `activeAt` heartbeats, `unreadCounts`, `clientReview`, member/seller/assigner ids |
| `smm_campaigns/{orderId or auto}` | `SmmCampaign` | `origin` (`sale` / legacy `direct` / `no_sale` — no order, amount 0, `soldBy` = the salesperson), `orderId` ("" for direct and no-sale months), `watchers[]`, `soldBy`, `team`, `items[]` (content with approval, chases, per-platform `postUrls`, extra work's `extraType`/`extraDuration`, `carriedFrom`), `adRuns[]` (day reports, budgets), `budgetPayments[]`, `cycle` (start → same date next month; since 2026-10-15 `endDate` is the RENEWAL DAY — the month's own days end the day before — and optional `anchorDay` = the billing day when a short month clamped it, e.g. 31 after 31 Jan → 28 Feb; absent = the start's own day), `commitments`, `renewal` (+`nextCampaignId`), `status` (`active`/`completed`/`renewed`/`lapsed`/`removed`/`deleted`), `deletedAt`/`deletedByName`; 2026-10-03: `clipsPerVideo`, `pageLinks`, `renewalOf`, `monthNumber`, `setupAt/ByName/ByUid`, `history`, `carriedOut[]`, `businessNameEdited`. Related: `SaleDetail.enteredBy`, `SmmSaleSpec.clipsPerVideo/renewalOf`, `WorkAssignment.smmCampaignId`. 2026-10-05: `platforms` is set in setup too (`setMonthPlatforms`; the sale keeps its own); a client's months are read together with `where clientPhoneId ==` for the client calendar (single-field index); a `history` month now keeps `team` + `watchers` (who did its work — no job cards), and an earlier month added in front of a later one sets that month's `renewalOf` and renumbers `monthNumber` down the run (no new fields). Later 2026-10-05, **On hold** (no new field): a month past its end with no renewal decision stays `active`; a `history` month is now `active` too while nothing follows it (was always `completed`), `completed` once the client has a next or later month, `lapsed` when not renewing; `app_settings/smm_history_hold` (`doneAt`, `checked`, `moved`, `byUid`, `byName`) records the one-time move of older `completed` history months back to `active`. 2026-10-15, **SMM Delivery Control** (typed in `types/smmDelivery`, read by `utils/smmCadence` / `utils/smmMonitor`, written by `services/smmDelivery` (phase 3) — and `startedAt` / `madeAt` / `revisions` by the classic `setItemStatus` / `requestApproval` / `recordApproval`, `approvalProof` + the approval by `api/order-chat` `smm-answer` from the client's chat; all optional, absent = no plan / no answer): on an item `plan {week 1–4, suggestedDate, fixedDate, fixedReason festival/extra/client_asked, title, idea, caption, hashtags[] (accepted AI suggestions, phase 5), plannedAt, by "auto"/uid}`, `moves[] {fromWeek, toWeek or "out", reason, at, byUid, byName}`, `startedAt`, `madeAt` (first sent for approval), `blocker {kind client_approval/client_footage/page_access/flow_credits/on_leave/other, note, since, byUid, byName, expiresAt, confirmedByUid, confirmedAt}`, `eta {kind focus/more_time, until, at, day, byUid, byName, focusUsed, moreTimeUsed}`, `lateReasons[] {step footage/send/approved/live, reason, note, newTime, at, byUid, byName}`, `footage {state needed/received/unusable/pending_client, link, at, byName}`, `revisions`, `reassigns[] {seat maker/publisher, fromUid, toUid, at, byUid, byName}`, `noLinkReason`, `approvalProof {approved, who, via whatsapp/call/client_chat/in_person/other, screenshotUrl, at, byUid, byName}`, `startingLine {decision catch_up/pending, at, byUid, byName}` (a piece late at switch-on, decided); on the month `delivery {activatedAt, activatedByName, baselineAt, rule "front_back_v1"}` ("Switch on this month"). A piece's last move `toWeek: "out"` = moved out of the month (not chased there). Times in ms; every list capped at 10 (`SMM_DELIVERY_ITEM_HISTORY_LIMIT`) |
| `smm_templates/{auto}` | `SmmTemplate` | saved client message wording (company-wide) |
| `ai_generations/{auto}` | `SavedGeneration` | `userId`, outputs (`mainFramePrompts[]`, `headerPrompt` (the VIDEO BOTTOM LABEL), `posterPrompt`, `voiceOverScript`, `veoPrompts[]`, `stockImagePrompts`, `overlayTexts` (each with `imagePrompt` / `imageDesign`), `posterConcepts` (since 2026-10-13 a concept may carry `changes`, the refine's "Changes:" line — "" when never refined, absent on older docs; the prompt text itself holds it too), `coreMessage`, `sceneContext` (motive + per-clip background and staging/camera/angle/focus, and since 2026-10-10 an optional per-clip `walk` boolean — asked only for Motu & Patlu: the scene planner's judgment that the clip's words take them somewhere; absent = the line is read in code), `voiceBrief`, `scriptQa` (the voice-over's quality-gate score, pass and drafts; since 2026-10-15 `passed` means a genuine 10/10 (≥ 8 before), `scores` has eight dimensions (+ `cast`, `originality`), and optional `passes` (improvement passes spent), `stopReason` (`perfect`/`passes`/`stalled`/`deadline`/`unscored`), `clipWords` (spoken words per clip), `checkedScript` (the exact voice-over judged and shipped — a later refine makes it differ) and `unscored` (no judge could score it; `score` is then 0, not a rating) — absent on older kits)), **`spec`** (2026-10-08, `utils/adSpec.AdSpec`: the configuration the kit was made with — adType, festivalName, language, aspectRatio, gender, attireType, customAttire, characterPack, customCharacter, locationMode, noLogo, logoNameText, clipCount; absent on older docs), the settings (written from `spec` since 2026-10-08, not the live form) incl. `frameInstructions` and `customCharacter`, `creationMode`, `createdAt`/`updatedAt`. Generate = new doc (a version); Save and auto-save update it |
| `cinematic_projects/{auto}` | `CinematicAdsProject` | `createdBy`, `name`, `currentStep`, `stepsCompleted`, brief, stories, boards, cast, clips, editing guide, deliverables, `delivered`, `updatedAt` (ms). `File` objects stripped |
| `notifications/{auto or dedupeKey}` | — | `userId`, `type`, `title`, `message`, `read`, `link`, `meta`, `createdAt`. 2026-10-08: `order_new_<orderId>_<uid>` (one per recipient), `sale_edited_<saleId>_<editMs>_<uid>` with `meta { saleId, orderId, uniqueId, changes[] }`. 2026-10-13: a row the person cleared stays (hidden by `notification_state`, marked read). The once-a-day keys (`birthday_*`, `smm_due_*`, `smm_renewal_due_*`, `smm_renew_remind_*`, `drive_folder_missing_*`) are written once (`once`). 2026-10-15 (SMM Delivery Control): `smm_urgent` (a full-screen SMM alert) and `smm_notice` (bell only) — doc id = the alert's once key `smm_alert_<subject>_<level>_<stamp>_<uid>`, written ONLY by `api/smm-monitor.ts` with `create()` (exists = already sent), `link: "/smm/control"`, `meta {key, level, reason, alertType, campaignId, itemIds, fullScreen, critical, subject}`; from the app `smm_moved`, `smm_reassigned`, `smm_remind` (`once`), `smm_test`, and `smm_approved` / `smm_changes` to the salesperson / from the client chat (links `/smm/control/<monthId>`). 2026-10-13 (later), optional: `dismissed` (true = the person dismissed this one row; hidden from their bell on every device, set with `read: true`; absent = shown) + `dismissedAt`; `markedUnreadAt` (the person marked it unread themselves — UpdatePopup does not pop it again). A re-sent keyed row is replaced whole, so both go. Rows older than 90 days are DELETED once a day, company-wide (`services/notificationCleanup`) |
| `notification_state/{uid}` (2026-10-13) | — | where the person last cleared their bell to: `clearedUpTo` (the exact `createdAt` Timestamp of the newest notification on screen when they pressed Clear all — every row at or before it is hidden), `clearedAt` (server time). Absent = never cleared; Undo puts the previous point back (`deleteField` when there was none). Only the person reads / writes it (`docs/firestore-rules.md`) |
| `fcmTokens/{token}` | — | `userId`, `token`, device id; 2026-10-15 optional `channels: "smm_urgent"` — this Android app created the `smm_urgent` channel (the server names that channel only for such tokens) |
| `smm_alert_state/{uid}` (2026-10-15) | `SmmAlertStateDoc` | SMM Delivery Control: a person's answers on alerts that are not their own pieces — `answers { <subject>: { kind on_it/escalate/remind/called/whatsapp, at (ms), byName, note } }`, `updatedAt`. Written only by the person (`services/smmDelivery.answerAlert`, a transaction that drops entries older than 14 days); read by the supervisor (overseers' screens, the server checker). Own rule in `docs/firestore-rules.md` |
| `activityLogs/{auto}` | `ActivityLogEntry` | actor, `action`, `details`, `adminId` (sales + tech feeds) |
| `sessions/{auto}` | — | `userId`, `loginAt`, `logoutAt`, `duration` (minutes) |
| `flow_accounts/{lower-case email}` | `FlowAccount` | `email`, `phone` (login number), `createdOn`, `expiresOn` (+18 months), `monthlyCredits`, `addedBy*`, `ownerId/Name` (whose target it counts toward), `holderId/Name` (who uses it), `visibleTo[]` (adder, owner, holder), `teamAdminId`, `status` (`active`/`disabled`), `usedByCycle` (cycle start → credits used), `lastUsed*`, `notes`, `history[]` (2026-10-10: also `api_key_added/replaced/removed`), `apiKey` (2026-10-10, optional: `fingerprint`, `status` `working`/`failed`/`unchecked`, `message`, `addedAt`, `addedByName`, `checkedAt` — the key's standing, never the key; absent = no key) |
| `flow_account_secrets/{same id}`, `paid_account_secrets/{id}` | `AccountSecret` | `password` only — read on Show/Copy |
| `gemini_api_keys/{flow account id}` (2026-10-10) | `GeminiApiKey` | the Gemini API key made in that Flow account: `key`, `fingerprint`, `accountId`/`accountEmail`, `ownerId/Name` (whose account), `addedById/Name`, `addedAt` (ms), `teamAdminId` (the tech admin's list is `where teamAdminId ==`), `status` + `statusMessage` + `checkedAt` (Google's last answer), `inUse` / `inUseAt` / `inUseByName` (the admin's "deployed to AdGen" label; a new key starts false). Written in one batch with the account's `apiKey`; deleted with the account |
| `flow_usage/{auto}` | `FlowUsageEntry` | one ad (or manual entry) on one account: `accountId`, `userId`, `teamAdminId`, `assignmentId`/`uniqueId`/`businessName`, `rows[]` (seconds × count), `credits`, `cycleStart`, `date`, `month` (`yyyy-MM`), `source` (`completion`/`manual`), `editedBy*`. Since 2026-10-15 `date` / `month` / `cycleStart` mean the day the clips were MADE (the dialog's "Day the clips were made", default today; never future, never before the account's `createdOn`) and its cycle — before, the day saved; no new field |
| `paid_accounts/{auto}` | `PaidAccount` | `provider` (`chatgpt`/`grok`/`other`), `label`, `email`, `plan`, `renewsOn`, `assignedTo[]`, `assignedNames`, `teamAdminId`, `history[]` |
| `invoices/{auto}` (2026-10-08) | `Invoice` (`types/invoice.ts`) | content: `issueDate`, `dueDate`, `seller` + `payment` snapshots (`payment.qrImageUrl` = an uploaded QR, 2026-10-08), `customer`, **`items[]` embedded with a stable `id`** (one read, one atomic write), `tax` {`mode` gst/none, `pricesIncludeTax`, `placeOfSupply`, `defaultRate`}, `roundOff`, `terms`, `notes`; `number` (null = draft; `DTS/26-27/0001`, never changes once set), `sequence`, `financialYear`, `status` (`draft`/`issued`/`paid`/`cancelled`; Overdue derived), `totals` {taxable, tax, grandTotal in paise, itemCount — written from `invoiceMath`}, `ownerId/Name/Role` (members see their own), `revision`, `history[]` (ms `at`), `duplicatedFrom`, `sourceOrderId`, `issuedAt/ByUid/ByName`, `paidAt`, `cancelledAt` |
| `invoice_counters/{2026-27}` · `invoice_numbers/{DTS-26-27-0001}` | — | the FY serial (`seq`, only goes up) and the create-only number register (`number`, `invoiceId`, `fy`, `sequence`, `byUid`, and since 2026-10-15 `issueDate` — the invoice's date, rewritten with the invoice when an issued invoice's date changes; absent on older entries = read that invoice), both written in `generateInvoice`'s one transaction; deleting a generated invoice marks its entry `deleted`, `deletedAt`, `deletedByUid/Name`, `customerName`, `grandTotal` (the number is never reused) |
| `invoice_settings/access` · `invoice_settings/defaults` | `InvoiceAccessSettings` / `InvoiceDefaults` | the team-leader switch `teamLeadersEnabled` (tech/main admin); what a new invoice starts with, edited in Invoices → Settings: `seller` (business block + `logoUrl`, over `company_settings/main`), `payment` (+ `qrImageUrl`), `terms`, `notes`, `taxRate`, `pricesIncludeTax`, `dueDays` (the four admins) |

### Development OS collections (2026-10-18, `devos.md` §9.23; types in `src/devos/core/types.ts`)
Written ONLY by the server (`api/devos.ts`, Admin SDK); a browser reads only its own `devos_users/{uid}` (+ the
subcollections tasks, sessions, attempts, xp, rank_events, achievements) and the shared boards / leagues / missions /
policy (`docs/firestore-rules.md`). Times in ms; days `yyyy-MM-dd` (India). `sig` = HMAC over the record's fields.
| Collection (doc id) | Type | Key fields / notes |
|---|---|---|
| `devos_users/{uid}` | `DevProfile` | the person's summary: `status` (`invited`/`active`/`paused`/`excluded`), `track`, `trackHistory[]`, `enrolled` (admin override), `onboarding` (consent, `baseline` state), `rank {level 1–6, since, eventId}`, `xp {total, season, seasonId, week, weekKey, today, day}`, `dims` (`DimensionState` per dimension: `score` 0–100 or null = not measured, `confidence`, `n`, `baseline`, `level` (adaptive difficulty), `run`, `lastAt`, `recent[]` evidence digests, `retention[]` Leitner boxes, `bestLevel`), `summary` (weighted), `plan`, `streak {current, best, lastDay, freezes, freezeUsedOn}`, `stats` (counters incl. `pending`), `seenShards`, `boardPrivate`, `badges[]`, `rating {seasonId, value, rounds, best}`, `gates`, `invites {count, lastDay}`, `rate {minute, count}` (20 answers / min), `lastActiveAt`, `sig` |
| `devos_users/{uid}/tasks/{id}` | `DevTask` | `baseline`, `quest_<day>`, `challenge_<week>`, practice / retry / retention / transfer / rank / league / mission tasks: `kind`, `state` (`assigned`/`in_progress`/`completed`/`expired`/`system_error`/…), `events[]`, `dueAt`, `blueprint`, `why`, practical `brief` / `evidence` / `rubric` / `submission` / `scoring`, **`submissionPending`** (a submitted practical awaiting its grade), `gradeTries`, `idem` |
| `devos_users/{uid}/sessions/{taskId}` | `DevSession` | the task's slots: `dim`, `difficulty`, `purpose`, `qid`, `item` (the PUBLIC item as shown — never a key), `state` (`pending`/`served`/`answered`/`expired`/`skipped_system`), `attemptId`, `score`, `passed`, `pending`, `reason`; `state` (`open`/`complete`/`expired` — closed by its deadline/`voided`), `dueAt` (a rank assessment's / league's own total time); `result` when complete: `score` (expired items count 0), `correct`, `answered`, `pending`, **`expired`** (2026-10-18, optional) |
| `devos_users/{uid}/attempts/{taskId}_{slot}` | `DevAttempt` | one answer, immutable: `item`, `response`, `servedAt` / `submittedAt` / `ms`, `hintsUsed`, `outcome` (`passed`/`failed`/`expired`/`system_error`/`pending_validation`/`partial`), `scoring` (method, score, criteria with evidence quotes, judges, confidence, codes), `reveal` (after answering), `feedback`, `rubricVersion`, `policyVersion`, `current` (a correction; the original is kept), `gradeTries`, `sig` |
| `devos_users/{uid}/exposures/{qid}` · `/seen/s{n}` · `/xp/{id}` · `/evidence/{id}` · `/rank_events/{id}` · `/achievements/{id}` | `Exposure` · seen shard · `XpTransaction` · evidence · `RankEvent` · `Achievement` | what was shown (`optionOrder`, `hintsShown`, written BEFORE the item is returned) · the no-repeat index (fingerprints) · the XP ledger (id = idempotency key `xp_<source>`, signed) · per-dimension evidence rows · promotions (`oldRank`, `newRank`, `gates`, `evidenceIds`, `policyVersion`) · badges |
| `devos_questions/{qid}` | `QuestionDoc` | the bank (template or AI): `public` item, `key` = the ItemKey **AES-GCM sealed** `{kid, iv, ct}`, `fp` (fingerprints), `poolState` `track|dim|difficulty|status`, `status` (`pool`/`served`/`quarantined`…), `validation {status, checks[], solverAgreed}`, `provenance {generator, version, model, jobId}`, `serves`, `stats` |
| `devos_bank/stats` · `devos_bank/idx_<track>_<dim>` | — | bank counters; the global dedupe index of AI items per track and dimension (newest 2,000 — `aipool.BANK_INDEX_LIMIT`, 0.62 MiB) |
| `devos_calibration/{pattern}` · `devos_bank/calibration_flags` | `PatternDoc` · `{flags: {[pattern]: PatternFlag}}` | answers per question pattern (`key`, `source`, `family`, `form`, `track`, `dim`, `difficulty`, `n`, `correct`, `ms`, `updatedAt`; `flaggedAt` + `previous {n, correct}` after a flag — counters restart) · the patterns withdrawn by calibration (`reason`, `n`, `correct`, `at`, `until` = +14 days; kept 90 days after for the Questions tab). FR-013 |
| `devos_queue/grading` | `{items: QueueItem[]}` | open answers / practicals / appeals awaiting a grade (`uid`, `kind` attempt / task / **appeal** — 2026-10-18, `id` = the correction's id — , `id`, `since`), ≤ 400; written in the save's transaction, taken out when graded |
| `devos_seasons/{S1…}` (+ `scores/{uid}`) · `devos_boards/{S1…}` | `SeasonScore` · `BoardsDoc` | per-season raw scores (server only) · the four boards built from them (approved fields only; `hidden` people left out; `final` when closed) |
| `devos_leagues/{round}` (+ `entries/{uid}`) · `devos_missions/{season}_{track}` | `LeagueRound` · `TeamMission` | the weekly league round (`blueprint`, `state`, `results` with Elo `ratingAfter`) · the team mission (`parts`, `state`, `score`) |
| `devos_config/policy` · `devos_policies/{v}` | `DevPolicy` | the live policy (every number; absent = `DEFAULT_POLICY`, version `v0-default`) · each saved version, kept |
| `devos_jobs/{id}` · `devos_runs/{id}` · `devos_audit/{id}` · `devos_corrections/{id}` · `devos_reports/{id}` · `devos_snapshots/overview` · `devos_health/current` | `DevJob` · claim · audit · `DevCorrection` · `DevReport` · snapshot · `HealthDoc` | AI generation jobs · once-only claims (`roll_<day>`, `ready_<day>`, `due_<day>`; `open` = `{slot, at}`, the open tick's 20-minute slot — 2026-10-18) · every admin action (and the daily integrity check's `repair_profile`, by "system") · voids / regrades / appeals (before / after; an appeal waiting for the graders has `pending: true` + `tries`, 2026-10-18) · AI reports with fact-cited claims · the Control Center's overview · the tick's heartbeat (`lastTickAt`, `lastTick` with its `trigger`), today's AI counters, quality counters, `deadKeys[] {fp, until, why}` (Gemini key fingerprints to skip for a day — never a key) |

`notifications` from the Dev OS: `devos_invite` · `devos_quest` · `devos_due` · `devos_result` · `devos_badge` ·
`devos_rankup` · `devos_league` · `devos_mission` · `devos_report`, doc id = the notice key, `meta.source "devos"`.

### HR / pay / other collections
`employee_profiles/{uid}` (`EmployeeProfile`: PAN, Aadhaar, addresses, CTC, stage, probation,
KYC docs, assets, separation; the most sensitive collection) · `hr_documents/{auto}` (`HrDocument`:
type, bodyText, `signatories[]`, status `issued`/`signed`/`declined`, view/download stats) ·
`hr_counters/{year}` · `agreements/{auto}` · `agreement_templates/{adminUid}_{category}` ·
`company_settings/main` (identity, logo, officer signatures, stamp) · `public_badges/{uid}`
(card-face only) · `onboarding_invites/{10-char id}` (terms, frozen letters, signatures, access
code, generated password after completion) · `member_credentials/{uid}` (**readable passwords**)
· `daily_checkins` · `attendance/{memberId}_{date}` (`status` full / half / absent / leave / holiday, and since
2026-10-10 `holiday_work` (W) / `comp_off` (C) — comp-off, `people.md` §9.13; since 2026-10-12 `half_leave` (HL, half-day
leave inside the allowance)) · `holidays/{date}` · `salesCheckins` ·
`leave_requests` (2026-10-12: `duration` `full_day` / `half_day` — absent = full day; a half day has `toDate = fromDate`;
`kind` deprecated, no longer written; `leaveDates` / `absentDates` read with `duration`: a half day's date is in
`leaveDates` when written HL, in `absentDates` when written H) · `salary_packages` · `payroll_config/default` · `employee_bank/{uid}` ·
`payroll_runs/{month}` (typed and read, but **nothing in the app writes it**) · `payroll_lines/{month}_{memberId}`
(the payment record — `paymentStatus`, `netSalary` = amount paid, frozen `computation`; 2026-10-09: `memberRole`, and
`incentive {salesBase, rate, amount, withheld}` on a sales payment; `monthlySalary` = the computation's; 2026-10-15:
`earlyPay {from, to, workingDays}` — paid before the period ended, the days not worked yet (today included) the admin
confirmed, absent = paid after it ended or before this was recorded; `incentive.settledBase` / `settledKeys` — the
collections in the period Settlements had paid, which this payment left out, absent = nothing left out / older) ·
`salary_receipts` (Accounts' receipts: `userId`, `amount`, `month` = the printed period, 2026-10-09: `period`
`yyyy-MM` — older ones lack it and are placed by `utils/receiptPeriod.receiptPeriodOf`, 2026-10-15) ·
`commission_settlements` (2026-10-15, optional: `periods[]` (pay periods settled), `paidKeys[]` (every collection paid,
`<saleId>#<payment id>` — never payable again here or in Sales Payroll), `breakdown[] {period, salesBase, rate, amount}`;
absent on older settlements, whose coverage is rebuilt by `utils/salesPay.settlementCoverage`) · `settlement_requests` · `audit_logs` · `review_tasks` · `expenses` ·
`other_income` · `training_modules` · `chatRooms` (+messages) · `calls` (+candidates) · `meetings`
(+participants, signals) · `settings/salesConfig` (`activeFestival`) · `app_settings/ad_languages`,
`app_settings/clients_backfill`, `app_settings/flow_accounts` (credit rates, monthly credits, validity, target),
`app_settings/smm_history_hold` (2026-10-05: the one-time record that older history months were put back on hold),
`app_settings/notification_cleanup` (2026-10-13: the last day the 90-day notification clean-up ran — `day`
(`yyyy-MM-dd`, claimed in a transaction so one app a day runs it), `startedAt`, `byUid`, `doneAt`, `deleted`),
`app_settings/smm_team` (2026-10-08: the Social Media Team Lead's corrections to her team on the Attendance board —
`added[]` / `removed[]` uids, `updatedAt`, `updatedByUid`, `updatedByName`; written with arrayUnion / arrayRemove by
`services/smmTeam`; absent = no corrections),
`app_settings/smm_delivery` (2026-10-15, `types/smmDelivery`: SMM Delivery Control's switch and numbers — `mode`
`off`/`preview`/`live` (absent document = preview), `pilotUids[]`, `deadlineHour`, `checkpoints {sendVideo, longVideoExtraDays,
longVideoClips, sendPoster, sendRealVideo, footage, approved}`, `quietHours {fromHour, toHour, sundays, holidays}`, `ladder {…
the escalation timings and limits, clientChaseDays[], and since phase 1 weeklyLoadLimit (12)}`, `history[]` (the switch's last 20 changes: `mode`, `at` ms, `byUid`,
`byName`, `reason`), `offReason` / `offAt` / `offByUid` / `offByName` (set while off, null otherwise), `updatedAt` /
`updatedByUid` / `updatedByName`, `lastRunAt` + `lastRunSummary {at ms, mode, months, alerts, delivered, errors, ms, deferred?, pushed?}` (the server checker's heartbeat after each successful run — `api/smm-monitor`, Admin SDK, merge); written by
`services/smmDeliverySettings` (main / tech admin only; own rule in `docs/firestore-rules.md`), read leniently by
`utils/smmDeliverySettings.parseSmmDeliverySettings` — see `smm.md` §9.9).

### Key relationships
```
users(admin) 1─* users(member)            via member.createdBy
users(sales_member) 1─* leads             via lead.assignedTo
leads 1─* saleItems (embedded)            1 saleItem ─1 orders (o_<saleId>; written together in one transaction)
orders 1─0..1 work_assignments            order.workAssignmentId ⇄ assignment.orderId (+ assignment.saleId); written
                                          together; a one-ad order never gets a second job, a deleted sale none
orders 1─1 order_chats                    chat id = order id (sold work)
orders 1─0..1 smm_campaigns               campaign id = order id (social_media_management)
work_assignments *─1 users(tech_member)   assignment.assignedTo
work_assignments 0..1─1 ai_generations    assignment.savedGenerationId
clients(phone digits) 1─* works           built from orders/assignments on complete/verify
users 1─1 employee_profiles / employee_bank / public_badges / member_credentials (doc id = uid)
users(tech) 1─* flow_accounts             via ownerId (target count) and holderId (in use)
flow_accounts 1─* flow_usage              via accountId; usedByCycle mirrors the entries' credits
flow_accounts 1─0..1 gemini_api_keys      same id; flow_accounts.apiKey mirrors the key's status
users 1─* invoices                        via invoice.ownerId; invoices 1─0..1 invoice_numbers (number ⇄ invoiceId)
orders 0..1─* invoices                    via invoice.sourceOrderId ("Fill from a sale"; informational only)
users 1─0..1 devos_users                  same uid (2026-10-18); devos_users 1─* tasks / sessions / attempts / xp / …
devos_questions 1─* devos_users/*/exposures  via exposure id = qid; attempts carry qid + qversion
```

### Status fields
- **Order.status:** `unassigned` (in the queue) → `assigned` (work linked) → `completed` (member
  submitted; "Awaiting verify") → `verified` (leaves the active queue). `cancelled` (sale
  rejected — over-discounted no longer, since 2026-10-05; reactivates on re-verify; a revoked approval no longer
  cancels, 2026-10-08). `deleted` (permanent tombstone;
  never recreated by the sale; can be restored; tech_admin can purge). Since 2026-10-08 a sale DELETED before any
  work removes its order document outright (with its chat and month); a sale with work cannot be deleted.
- **WorkAssignment.status:** see §16.
- **SaleDetail.verificationStatus:** `pending` → `verified` or `rejected`.
- **ReviewTask.status:** `requested` → `review_uploaded` → `verified` → `completed`.
- **SMM item:** `planned`, `in_progress`, `awaiting_approval`, `changes_requested`, `approved`,
  `scheduled`\*, `posted`\* (\*approval required).
- **Onboarding invite:** `sent`, `offer_accepted`, `completed`, `declined`, `revoked`.
- **Leave:** `pending`, `approved`, `rejected`, `cancelled` (duration `full_day` / `half_day`, 2026-10-12). **Check-in:** `checked_in`,
  `pending_approval`, `approved`, `rejected`.
- **Invoice.status** (2026-10-08): `draft` (no number; autosaves; deletable) → `issued` (numbered by
  `generateInvoice`; still editable, keeps its number, `revision` +1) → `paid` / `cancelled` (and back to
  `issued`). Any of them can be deleted by its maker or an admin (2026-10-08); a numbered one leaves its number
  in the register marked deleted. "Overdue" = issued and past `dueDate`, computed on read.

## 27. POTENTIAL RISKS (need verification)

- Heavy `strict:false` typing and `any` timestamps hide shape mismatches between old and new
  records. Many fields are optional for backward compatibility.
- Free-tier Firestore quota has been exceeded before. New listeners must be scoped.

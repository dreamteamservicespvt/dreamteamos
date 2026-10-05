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
| `smm_campaigns/{orderId or auto}` | `SmmCampaign` | `origin` (`sale` / legacy `direct` / `no_sale` — no order, amount 0, `soldBy` = the salesperson), `orderId` ("" for direct and no-sale months), `watchers[]`, `soldBy`, `team`, `items[]` (content with approval, chases, per-platform `postUrls`, extra work's `extraType`/`extraDuration`, `carriedFrom`), `adRuns[]` (day reports, budgets), `budgetPayments[]`, `cycle` (start → same date next month), `commitments`, `renewal` (+`nextCampaignId`), `status` (`active`/`completed`/`renewed`/`lapsed`/`removed`/`deleted`), `deletedAt`/`deletedByName`; 2026-10-03: `clipsPerVideo`, `pageLinks`, `renewalOf`, `monthNumber`, `setupAt/ByName/ByUid`, `history`, `carriedOut[]`, `businessNameEdited`. Related: `SaleDetail.enteredBy`, `SmmSaleSpec.clipsPerVideo/renewalOf`, `WorkAssignment.smmCampaignId`. 2026-10-05: `platforms` is set in setup too (`setMonthPlatforms`; the sale keeps its own); a client's months are read together with `where clientPhoneId ==` for the client calendar (single-field index) |
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

## 27. POTENTIAL RISKS (need verification)

- Heavy `strict:false` typing and `any` timestamps hide shape mismatches between old and new
  records. Many fields are optional for backward compatibility.
- Free-tier Firestore quota has been exceeded before. New listeners must be scoped.

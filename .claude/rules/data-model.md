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
| `leads/{auto}` | `Lead` | `assignedTo` (sales member), `assignedBy`, `phone` (+91…), `displayName`, `realName`, `status` (`not_called`/`answered`/`not_answered`/`call_later`/`not_interested`), `notes`, `saleDone`, **`saleItems: SaleDetail[]`** (legacy `saleDetails`), freeze mirrors (`frozen`, `saleFrozen*`), `duplicateCleared`, `isCustomEntry`. **2026-10-08:** each `SaleDetail` carries **`saleId`** (`<leadId>_<ms recorded>`, immutable; older sales get it derived by `utils/saleIdentity.saleIdOf` and stamped on the next write) — written only through `services/sales` transactions, found by id, never by position |
| `numberLocks/{digitsPhone}` | `NumberLock` | `ownerId`, `ownerLeadId`, `reserveExpiresAt` (+24h), `saleFrozen`, `saleFrozenUntil`, `timeline[]` (`claimed`/`taken_over`/`sold`/`admin_override`) |
| `schedulePools/{auto}` | `SchedulePool` | `createdBy`, `assignedTo`, `numbers[]`, `releasedCount`, `dailyLimit`, `minCompletionPercent`, `isActive`, `lastReleasedDate` |
| `orders/{o_<saleId>}` = `o_<leadId>_<submittedAtMs>` (legacy `o_<leadId>__<idx>`) | `Order` | client (`clientPhone`, `clientPhoneId`, `businessName`, `clientName`), sale copy (`category`, `packageKey`, `amount`, bulk/discount fields, `requirement`, `promise`), link (`leadId`, **`saleId`** (2026-10-08), `saleItemIndex` / `saleItemKey` (where the sale sat when written — positions move), `saleSubmittedAtMs`), attribution (`soldBy`, `soldByName`, `salesAdminId`, `fromAd`), `saleVerified`, **`status`**, `workAssignmentId`, `assignedTo`, `progress` (SMM/bulk), `bulkVideos[]`, `penalties[]`/`penaltyTotal`, `updateNotes[]`, `feedback` (after-sale call), `clientReview` (mirror), tombstone/restore/retire fields |
| `work_assignments/{auto}` | `WorkAssignment` | `assignedTo`, `assignedBy`, `category` (`wishes`/`promotional`/`cinematic`/`bulk_ads`/`social_media_management`/`poster`), `clipCount`, `duration`, `pricePerUnit`, `uniqueId` (W/P/C/PS/O + number), **`accessCode`** (4 digits), `status`, `sessions[]`, `totalDurationSeconds`, `date`, ad spec (`modelGender`, `attireType`, `customAttire`, `aspectRatio`, `language`, `festival`, `characterPack`, `customCharacter` (Custom Character only), `realLocationProvided`, poster fields), brief (`requirementNotes`, `businessInfo`, `businessAddress`), `orderId`, `saleId` (2026-10-08, from the order), `chatId`, `promise`, `tracks[]`, `savedGenerationId`, `saleDeleted*`, `reassignedFrom/By/At`, `driveUploadedAt` / `driveUploadPath` / `driveFileName` (the member's word that the file is in their Drive, 2026-10-03; cleared on each hand-in) |
| `clients/{digitsPhone}` | `Client` | profile assets, `works[]`, totals, `reviews[]` (server-written), `salesAdminIds[]`, `soldByIds[]` (array-contains scope), `firstSoldBy`, review/loyalty mirror |
| `order_chats/{chatId}` (+`messages`) | `OrderChatDoc` | `chatId` = order id for sold work, else assignment id (`utils/orderChatId.orderChatIdOf`). `participants[]`, `accessCode`, `status` (`open`/`locked`), `clientReady`, `activeAt` heartbeats, `unreadCounts`, `clientReview`, member/seller/assigner ids |
| `smm_campaigns/{orderId or auto}` | `SmmCampaign` | `origin` (`sale` / legacy `direct` / `no_sale` — no order, amount 0, `soldBy` = the salesperson), `orderId` ("" for direct and no-sale months), `watchers[]`, `soldBy`, `team`, `items[]` (content with approval, chases, per-platform `postUrls`, extra work's `extraType`/`extraDuration`, `carriedFrom`), `adRuns[]` (day reports, budgets), `budgetPayments[]`, `cycle` (start → same date next month), `commitments`, `renewal` (+`nextCampaignId`), `status` (`active`/`completed`/`renewed`/`lapsed`/`removed`/`deleted`), `deletedAt`/`deletedByName`; 2026-10-03: `clipsPerVideo`, `pageLinks`, `renewalOf`, `monthNumber`, `setupAt/ByName/ByUid`, `history`, `carriedOut[]`, `businessNameEdited`. Related: `SaleDetail.enteredBy`, `SmmSaleSpec.clipsPerVideo/renewalOf`, `WorkAssignment.smmCampaignId`. 2026-10-05: `platforms` is set in setup too (`setMonthPlatforms`; the sale keeps its own); a client's months are read together with `where clientPhoneId ==` for the client calendar (single-field index); a `history` month now keeps `team` + `watchers` (who did its work — no job cards), and an earlier month added in front of a later one sets that month's `renewalOf` and renumbers `monthNumber` down the run (no new fields). Later 2026-10-05, **On hold** (no new field): a month past its end with no renewal decision stays `active`; a `history` month is now `active` too while nothing follows it (was always `completed`), `completed` once the client has a next or later month, `lapsed` when not renewing; `app_settings/smm_history_hold` (`doneAt`, `checked`, `moved`, `byUid`, `byName`) records the one-time move of older `completed` history months back to `active` |
| `smm_templates/{auto}` | `SmmTemplate` | saved client message wording (company-wide) |
| `ai_generations/{auto}` | `SavedGeneration` | `userId`, outputs (`mainFramePrompts[]`, `headerPrompt` (the VIDEO BOTTOM LABEL), `posterPrompt`, `voiceOverScript`, `veoPrompts[]`, `stockImagePrompts`, `overlayTexts` (each with `imagePrompt` / `imageDesign`), `posterConcepts`, `coreMessage`, `sceneContext` (motive + per-clip background and staging/camera/angle/focus), `voiceBrief`, `scriptQa` (the voice-over's quality-gate score, pass and drafts)), **`spec`** (2026-10-08, `utils/adSpec.AdSpec`: the configuration the kit was made with — adType, festivalName, language, aspectRatio, gender, attireType, customAttire, characterPack, customCharacter, locationMode, noLogo, logoNameText, clipCount; absent on older docs), the settings (written from `spec` since 2026-10-08, not the live form) incl. `frameInstructions` and `customCharacter`, `creationMode`, `createdAt`/`updatedAt`. Generate = new doc (a version); Save and auto-save update it |
| `cinematic_projects/{auto}` | `CinematicAdsProject` | `createdBy`, `name`, `currentStep`, `stepsCompleted`, brief, stories, boards, cast, clips, editing guide, deliverables, `delivered`, `updatedAt` (ms). `File` objects stripped |
| `notifications/{auto or dedupeKey}` | — | `userId`, `type`, `title`, `message`, `read`, `link`, `meta`, `createdAt`. 2026-10-08: `order_new_<orderId>_<uid>` (one per recipient), `sale_edited_<saleId>_<editMs>_<uid>` with `meta { saleId, orderId, uniqueId, changes[] }` |
| `fcmTokens/{token}` | — | `userId`, `token`, device id |
| `activityLogs/{auto}` | `ActivityLogEntry` | actor, `action`, `details`, `adminId` (sales + tech feeds) |
| `sessions/{auto}` | — | `userId`, `loginAt`, `logoutAt`, `duration` (minutes) |
| `flow_accounts/{lower-case email}` | `FlowAccount` | `email`, `phone` (login number), `createdOn`, `expiresOn` (+18 months), `monthlyCredits`, `addedBy*`, `ownerId/Name` (whose target it counts toward), `holderId/Name` (who uses it), `visibleTo[]` (adder, owner, holder), `teamAdminId`, `status` (`active`/`disabled`), `usedByCycle` (cycle start → credits used), `lastUsed*`, `notes`, `history[]` |
| `flow_account_secrets/{same id}`, `paid_account_secrets/{id}` | `AccountSecret` | `password` only — read on Show/Copy |
| `flow_usage/{auto}` | `FlowUsageEntry` | one ad (or manual entry) on one account: `accountId`, `userId`, `teamAdminId`, `assignmentId`/`uniqueId`/`businessName`, `rows[]` (seconds × count), `credits`, `cycleStart`, `date`, `month` (`yyyy-MM`), `source` (`completion`/`manual`), `editedBy*` |
| `paid_accounts/{auto}` | `PaidAccount` | `provider` (`chatgpt`/`grok`/`other`), `label`, `email`, `plan`, `renewsOn`, `assignedTo[]`, `assignedNames`, `teamAdminId`, `history[]` |
| `invoices/{auto}` (2026-10-08) | `Invoice` (`types/invoice.ts`) | content: `issueDate`, `dueDate`, `seller` + `payment` snapshots (`payment.qrImageUrl` = an uploaded QR, 2026-10-08), `customer`, **`items[]` embedded with a stable `id`** (one read, one atomic write), `tax` {`mode` gst/none, `pricesIncludeTax`, `placeOfSupply`, `defaultRate`}, `roundOff`, `terms`, `notes`; `number` (null = draft; `DTS/26-27/0001`, never changes once set), `sequence`, `financialYear`, `status` (`draft`/`issued`/`paid`/`cancelled`; Overdue derived), `totals` {taxable, tax, grandTotal in paise, itemCount — written from `invoiceMath`}, `ownerId/Name/Role` (members see their own), `revision`, `history[]` (ms `at`), `duplicatedFrom`, `sourceOrderId`, `issuedAt/ByUid/ByName`, `paidAt`, `cancelledAt` |
| `invoice_counters/{2026-27}` · `invoice_numbers/{DTS-26-27-0001}` | — | the FY serial (`seq`, only goes up) and the create-only number register (`number`, `invoiceId`, `fy`, `sequence`, `byUid`), both written in `generateInvoice`'s one transaction; deleting a generated invoice marks its entry `deleted`, `deletedAt`, `deletedByUid/Name`, `customerName`, `grandTotal` (the number is never reused) |
| `invoice_settings/access` · `invoice_settings/defaults` | `InvoiceAccessSettings` / `InvoiceDefaults` | the team-leader switch `teamLeadersEnabled` (tech/main admin); what a new invoice starts with, edited in Invoices → Settings: `seller` (business block + `logoUrl`, over `company_settings/main`), `payment` (+ `qrImageUrl`), `terms`, `notes`, `taxRate`, `pricesIncludeTax`, `dueDays` (the four admins) |

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
`payroll_runs/{month}` (typed and read, but **nothing in the app writes it**) · `payroll_lines/{month}_{memberId}`
(the payment record — `paymentStatus`, `netSalary` = amount paid, frozen `computation`; 2026-10-09: `memberRole`, and
`incentive {salesBase, rate, amount, withheld}` on a sales payment; `monthlySalary` = the computation's) ·
`salary_receipts` (Accounts' receipts: `userId`, `amount`, `month` = the printed period, 2026-10-09: `period`
`yyyy-MM` — older ones lack it) ·
`commission_settlements` · `settlement_requests` · `audit_logs` · `review_tasks` · `expenses` ·
`other_income` · `training_modules` · `chatRooms` (+messages) · `calls` (+candidates) · `meetings`
(+participants, signals) · `settings/salesConfig` (`activeFestival`) · `app_settings/ad_languages`,
`app_settings/clients_backfill`, `app_settings/flow_accounts` (credit rates, monthly credits, validity, target),
`app_settings/smm_history_hold` (2026-10-05: the one-time record that older history months were put back on hold),
`app_settings/smm_team` (2026-10-08: the Social Media Team Lead's corrections to her team on the Attendance board —
`added[]` / `removed[]` uids, `updatedAt`, `updatedByUid`, `updatedByName`; written with arrayUnion / arrayRemove by
`services/smmTeam`; absent = no corrections).

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
users 1─* invoices                        via invoice.ownerId; invoices 1─0..1 invoice_numbers (number ⇄ invoiceId)
orders 0..1─* invoices                    via invoice.sourceOrderId ("Fill from a sale"; informational only)
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
- **Leave:** `pending`, `approved`, `rejected`, `cancelled`. **Check-in:** `checked_in`,
  `pending_approval`, `approved`, `rejected`.
- **Invoice.status** (2026-10-08): `draft` (no number; autosaves; deletable) → `issued` (numbered by
  `generateInvoice`; still editable, keeps its number, `revision` +1) → `paid` / `cancelled` (and back to
  `issued`). Any of them can be deleted by its maker or an admin (2026-10-08); a numbered one leaves its number
  in the register marked deleted. "Overdue" = issued and past `dueDate`, computed on read.

## 27. POTENTIAL RISKS (need verification)

- Heavy `strict:false` typing and `any` timestamps hide shape mismatches between old and new
  records. Many fields are optional for backward compatibility.
- Free-tier Firestore quota has been exceeded before. New listeners must be scoped.

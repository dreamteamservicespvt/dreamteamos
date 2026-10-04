---
paths:
  - "src/pages/sales-admin/**"
  - "src/pages/sales-member/**"
  - "src/components/sales/**"
  - "src/pages/shared/{Clients,FeedbackUpsell,Leaderboard}.tsx"
  - "src/pages/*/Training*.tsx"
  - "src/services/{numberLock,scheduleRelease,duplicateLeads,teamLeads,clients,saleFeedback,upsell,reviews}.ts"
  - "src/utils/{bulkDiscount,saleDiscount,salePayments,saleDecision,saleStatus,salesMessage,salesClients,salesScriptDocx,serviceCatalog,upsellLadder,clientValue,leadActivity,pricing,phone,promiseSla}.ts"
  - "src/store/{salesLeadsStore,salesOrdersStore}.ts"
  - "src/hooks/{useMyLeads,useMyOrders}.ts"
---

# Sales: leads & number locks, sale recording & approvals, clients, feedback & upsell, training & scripts — DTS-OS module context

> Part of the project context (CLAUDE.md → Context map). Claude Code loads this file automatically when a
> file matching the `paths:` above is read or edited. Section numbers are CLAUDE.md's originals, so a
> reference such as "§17.2" still points here. Keep it current per CLAUDE.md §30 step 8; the source code wins.

## 9. APPLICATION MODULES (the entries for this module)

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

**9.11 Clients, feedback & upsell, reviews** ✅. `pages/shared/Clients.tsx`,
`pages/shared/FeedbackUpsell.tsx`, `pages/sales-admin/ClientLookup.tsx`,
`pages/sales-member/MyClients.tsx`, `MyReviews.tsx`; `services/clients.ts`, `saleFeedback.ts`,
`upsell.ts`, `reviews.ts`; `utils/upsellLadder.ts`, `salesClients.ts`, `clientValue.ts`.
Collections `clients` (doc id = digits-only phone), `review_tasks`, `app_settings/clients_backfill`.
Rules: the client record is upserted on work completion and on verification. Feedback lives on
`orders.feedback`; both work and service ratings are required before the upsell button appears
(`feedbackComplete`). Review task: sales admin assigns → member uploads a 5★ screenshot → admin
verifies (10% loyalty discount) → member uploads a feedback video.

**9.18 Training & sales scripts** ✅. `pages/*/TrainingModules.tsx` (admin CRUD),
`pages/*/Training.tsx` (members; filtered by department in `["tech"|"sales","all"]`),
`pages/sales-member/SalesScripts.tsx` (≈2.2k lines, .docx export, active festival from
`settings/salesConfig`). Collection `training_modules`.

## 24. BUSINESS RULES (IMPLEMENTED; verified in code)

- **Numbers:** a claim reserves for 24h; takeover is allowed after that and freezes the old lead;
  a sale-freeze lasts 1–7 days; lock writes are transactions capped at 2 attempts.
- **Discount authority:** a member may give up to **10%** alone. Beyond that, no order exists
  until the sales admin approves (verifying the sale approves the discount). An earned discount
  (Google review and/or referral) is worth **10%** and does not stack to 20%.
- **Editing a sale** is locked once work is assigned; the seller sends update notes instead.
  Deleting the sale leaves assigned work in place with a `saleDeleted` banner.
- **Feedback gate:** upsell only after **both** work and service feedback; tech admin and leader
  can read but not enter feedback.
- **Upsell ladder:** ad → social → website → software, measured from the highest rung owned.

## 25. CURRENT IMPLEMENTATION STATUS

**PARTIALLY IMPLEMENTED 🟡:**
- Special-category catalogue: `SaleForm` keeps its own copy of the picker instead of
  `SpecialCategoryFields` (both now carry the Custom Character description field). The Custom
  Character description and the Real Owner Face image are enforced (2026-09-22).

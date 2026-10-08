---
paths:
  - "src/pages/sales-admin/**"
  - "src/pages/sales-member/**"
  - "src/components/sales/**"
  - "src/pages/shared/{Clients,FeedbackUpsell,Leaderboard}.tsx"
  - "src/pages/*/Training*.tsx"
  - "src/services/{numberLock,scheduleRelease,duplicateLeads,teamLeads,clients,saleFeedback,upsell,reviews,sales}.ts"
  - "src/utils/{bulkDiscount,saleDiscount,salePayments,saleDecision,saleStatus,salesMessage,salesClients,salesScriptDocx,serviceCatalog,upsellLadder,clientValue,leadActivity,pricing,phone,promiseSla,saleIdentity,saleEdit}.ts"
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
**One permanent `saleId` per sale (2026-10-08, owner).** `SaleDetail.saleId` = `<leadId>_<ms recorded>`;
its order is `orders/o_<saleId>` — the id `orders.orderDocId` always gave, so no migration
(`utils/saleIdentity`: `saleIdOf` derives it for older sales, `withSaleIds` stamps it on the next write;
`timestampMs` reads a JSON'd `{seconds, nanoseconds}` exactly). **Every sale write goes through
`services/sales.ts`, in a Firestore transaction, finding the sale by id in the lead as it is now:**
`recordSale` (the sale + its order together; a retry with identical content writes nothing; a different
sale in the same millisecond takes the next free id), `updateSale` (`utils/saleEdit.mergeSaleEdit` lays
only what the form changed onto the current sale — an approval, a payment or a penalty saved meanwhile
survives; same order, its status/job untouched; the job's changed fields via `jobPatchForSaleEdit`;
`sale_edited` popups when the tech side has started), `deleteSale` (sale + order + order chat + SMM month
in one transaction, then the `order_new` / `smm_new` bells; refused with `SaleWriteError("sale_has_work")`
once there is work), `deleteLeadWithSales` (My Leads' custom lead, the sales admin's Leads pages),
`mutateSaleItems` (Sales Approvals' verify / reject / revoke / bulk / duplicate resolution, the payment
panel). `SaleForm` has an in-flight guard, keeps the delivery promise's start on an edit, shows "The tech
team is already working on this sale (Ravi)" and locks the service for a started sale; My Leads keys rows,
the edit form, the log and the note composer by `saleId`.

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
- **Discount authority:** a member may give up to **10%** alone. Beyond that the sales admin approves
  the discount (verifying the sale approves it). **Since 2026-10-05 (owner) the sale reaches the tech side
  at once anyway** — its order is made at sale time with `saleVerified:false` ("Pending approval" on the
  Orders queue); a rejected sale is cancelled as before. Sales held under the old rule get their order when a
  sales admin opens Sales Approvals (`orders.releaseHeldSales`). An earned discount
  (Google review and/or referral) is worth **10%** and does not stack to 20%.
- **A sale's identity, edits and deletes (owner, 2026-10-08):** every sale has one immutable `saleId`;
  creating makes one sale and one order; an EDIT updates that same sale and order and never makes a new
  one. A sale the tech team has started (an order assigned / handed in / delivered, or any job pointing at
  it) **can still be edited** — the assignment is kept, the job takes the changed fields, and the tech
  admin(s), the team leaders and the member holding the job get a `sale_edited` popup with what changed
  (members and leaders never see price lines) — but its **service cannot change** (category, kind of
  video, number of videos, a Custom sale's base service): the tech admin takes the work back first. A sale
  nobody has started is **deleted everywhere at once** (sale, order, client chat, its SMM month, its "new
  order" bells); a started one is **never deleted** — by the salesperson or the sales admin — and the row
  says "Can't delete — work started (Ravi)". Deleting a lead deletes its sales the same way and is refused
  while one has work. Revoking an approval keeps the order on the tech side ("Pending approval"); only a
  rejection takes it out. (Before: edits were locked after assignment with update notes instead, and a
  delete left the job with a `saleDeleted` banner — jobs flagged that way earlier keep their banner.)
- **Feedback gate:** upsell only after **both** work and service feedback; tech admin and leader
  can read but not enter feedback.
- **Upsell ladder:** ad → social → website → software, measured from the highest rung owned.

## 25. CURRENT IMPLEMENTATION STATUS

**PARTIALLY IMPLEMENTED 🟡:**
- Sale identity (2026-10-08): `smmSetup` (Add SMM sale's set-up of an existing sale) still passes the
  sale's position (`itemIndex`) from a fresh read; the risk window is a delete in the same second.
  `cancelOrderForSale` (rejections) still deletes a waiting order without its chat (a re-approval reopens
  both). An edit is saved (and told) only when `saleChangeList` names a change — an edit whose only change
  is something it does not name (an SMM sale's price-mode toggle, an earned-discount proof re-uploaded) is
  treated as "nothing changed", as before. Waiting orders whose sale was deleted before this fix leave the queue only when a tech admin /
  team leader opens Orders or Work Assign (`healOrphanOrdersOnOpen`, once a session).
- Special-category catalogue: `SaleForm` keeps its own copy of the picker instead of
  `SpecialCategoryFields` (both now carry the Custom Character description field). The Custom
  Character description and the Real Owner Face image are enforced (2026-09-22).

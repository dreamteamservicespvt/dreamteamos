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
**My Leads speed and search (owner, 2026-10-19, Kusuma: 2,173 leads, 1,739 sales).** (1) A SEARCH covers every day
(and a picked date): the day window is skipped while the box has text ("Searching all days"); same on the Sales tab.
(2) One filter layout on every tab (`FilterBar` / `StatusSelect` / `DaySelect`, `data-test` `leads-filter-bar` /
`sales-filter-bar` / `dup-filter-bar`): on a phone the search has its OWN full row (44px, 16px text) and the two
dropdowns share the row below, half each; from `sm` all three are one row; an ✕ clears it. (Squeezed into one row with
the dropdowns on a 390px phone the box was 96px — measured in the harness.) Tab labels never wrap. (3) The **Duplicates** tab has the same row (its own search / status / day, opening on All Days) and
shows 10 at a time; Sales shows 20 at a time (it rendered all 1,739). (4) The lists follow the search through
`useDeferredValue` and are memoized; the sort and the day window compute each lead's day once per snapshot. (5) The
**duplicate scan** runs once per SESSION (`salesLeadsStore.duplicateScan`; Recheck runs it again), starts 1.5 s after
the page is on screen, and keeps 6 `in` queries in flight (`DUPLICATE_SCAN_CONCURRENCY`) — it fired ~218 at once on
every visit and took 51 s live, starving "Create Lead"'s transaction. (6) **"Already yours" that showed nothing:**
resolving a duplicate freezes the loser's lead but not the number's lock, so the lock kept naming a member whose list
hides the lead (Kusuma, +919885719740, `duplicate_resolved`). Now: Add Custom Lead first checks the member's own
loaded leads (an active one → "Already in your leads", the modal closes and the list is searched to it, no server
call); `claimNumber`'s own-lock branch reads the lock's lead — frozen → `held_elsewhere` ("<name> has this number
now"), gone → added fresh (timeline note), no `ownerLeadId` → `already_yours` as before; a searched number that is a
hidden (frozen) lead is said under the list (`hidden-search-match`); Upsell to a frozen lead says who has it
(`startUpsell` + My Leads' upsell arrival).
**Number requests (owner, 2026-10-19).** Wherever a colleague blocks a number — the hidden-number line in My Leads'
search, and Add Custom Lead's reserved / sold / closed answers (now said inside the box, `add-lead-blocked`, instead of
a toast) — `components/sales/NumberRequests.NumberRequestAction` names the member holding it (`services/numberRequests.
findNumberHolder`: the live lead on the phone, a sold one first; one query + one `users` read, cached a minute) and
offers **Request this number** (→ "Requested — waiting for Ravi or the sales admin"; "Ask again" after a decline;
"Take it back" when nobody holds it any more — her lead reopens at once). The holder sees **Number requests** at the top
of My Leads and the sales admin at the top of Leads Management (`NumberRequestsPanel`, Give with a confirm / Decline);
notifications `number_request` to the holder + their sales admin on asking, to the requester on the decision, to the
holder when an admin gave it. A SOLD number (any sale on the holder's lead, re-read at approval): only the sales admin
(or main admin) may give it; the holder's lead is closed with its sales on it. Approval (`decideNumberRequest`, one
transaction): the requester's hidden lead reopens (notes, history) or a new lead is made, the holder's lead closes
(`frozenReason: "transferred"`, `takenOverBy` = the requester), the lock moves to her (fresh 24 h, sale-freeze cleared,
timeline `transferred`). A number that moved since the request closes it ("No longer with the member").

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
**Real Owner Duo (2026-10-14, `ai-ads.md` §17.2):** the Special Category group "Real Owner Face — Duo" sells three
configurations — Male + Male, Female + Female, Male + Female (`owner_duo_*`). The salesperson picks the configuration
only; the two owners' photos are uploaded on the tech side (the studio's two slots). Picking one shows, in the sale form,
"Also collect a clear photo of EACH owner's face — two photos, one per owner" with who stands where
(`data-test="sale-owner-duo-note"`, from `characterPacks.ownerPhotoSlots`); the client's WhatsApp confirmation
(`utils/salesMessage`) asks for "a clear photo of EACH owner's face — two photos, one of the gentleman and the lady
(both gentlemen / both ladies), each person on their own" and says "Both owners speak in every clip"; the job's Special
Category note (`components/work/SpecialCategoryFields`, `data-test="job-owner-duo-note"`) says both photos are required;
the attire line reads "👨👩 man & woman" for the mixed owners (`adRequirement.castLabelFor`; the Human Duo keeps "woman &
man"). The pack line says "Both owners speak in every clip" (sale form, job form, studio, client message), and the tech
member's WhatsApp requirements message (`adRequirement.buildAssignmentRequirementsMessage`) says who is who — "Owner 1 =
the man (LEFT), Owner 2 = the woman (RIGHT); upload one clear photo of EACH owner". The single Real Owner Face keeps its
one-photo notes.
**Sale dates, payments and commission (owner, 2026-10-15).** (1) **"Month starts on"** — an SMM sale asks the day its month
starts (`SmmSaleSpec.startDate`, `data-test="sale-smm-start"`): a renewal opens on the renewed month's end date
(`renewal.previousEnd` — always, even recorded late), refuses an earlier day ("The last month runs until 5 Oct — the next
month can't start before 6 Oct.") and says a later one in days ("3 days after the last month ended (6 Oct)."); a new client
opens on the sale day. The renewal note shows the value that is saved. On an edit the field is hidden and the saved start
kept (a read-only line; never added to an older sale). The month is made on it (`smm.md` §9.9). (2) **"Collected on"** —
My Leads → Pending payments → Collect asks the day the money came (`collect-day`; today by default, not before the sale
day nor in the future — `salePayments.collectedOnProblem`; stamped `collectedAtFor(day)`: the moment when today, else
midday of that day) and says which pay period it counts in. (3) **The advance is the first payment** — the form used to
seed "advance" with the total collected and save it as the advance again, so later balances counted twice; now it holds
the first payment only, later balances are listed "Also collected after the sale: ₹3,000 (09 Oct) — kept as recorded"
(`advance-later-payments`) and counted in Pending payment; ticking "Advance collected" on an edit dates it to the sale
(id `pay_opening`); unticking it with a recorded balance is refused in the form and by `services/sales.updateSale`
(`SaleWriteError("payments_locked")`, `utils/saleEdit.paymentEditRefusal`). (4) **First approval** —
`SaleDetail.firstVerifiedAt` is set at the first approval and kept by every revoke, rejection and re-approval
(`utils/saleDecision.keepFirstApproval`, in all five decision writes of `SalesApprovals`); a re-approval used to re-date
`verifiedAt`, so an old settlement paid the sale again (`people.md` §9.14). (5) **Commission as sales see it** — ONE rule
(`utils/salesPay`, `people.md` §9.14): it counts in the pay period the money was COLLECTED, at the rate (5% / 10%) that
applied in that period (`users.payHistory`), only when the period reached 75% of its target; Settlements never pays what
Sales Payroll paid, nor the reverse. My Salary and the sales Dashboard (`useSalesEarnings`) leave out collections
Settlements paid (`incentive-settled-note`); the member's **Settlements** lists periods
(`components/sales/CommissionPeriodList`: in payroll / running / due / withheld / settled / none) and requests ENDED
periods only; **My Performance**'s settlement panel is `commissionByPeriod`, and its "My Earnings This Period · estimate"
is `salesPay.runningPlanEstimate` — the plan and target of the running period, each option's incentive ₹0 under 75% with
"· ₹X at 75% of target" and a gate line (`earnings-gate`); Option 1's salary part (≤ ₹5,000) is never gated. The
**Leaderboard**'s Day / Month / Career incentive columns: **plan rate (5% / 10%) × the VERIFIED money collected in the
window, with NO 75% target check** (owner, 2026-10-19 — the board as before 2026-10-15). `calcCommission` calls
`commissionInWindow` with `dailyTarget: 0` (= no target) and the rate that applied in each period (`payTerms`). From
2026-10-15 to 10-19 it was gated, so members with a target read ₹0 mid-month. The gate still decides what is PAID
(Sales Payroll, Settlements, My Salary); the revenue ranking is unchanged.

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
  a sale-freeze lasts 1–7 days; lock writes are transactions capped at 2 attempts. A lock whose lead is frozen tells
  its owner who has the number; a lock whose lead was deleted lets its owner add the number fresh (2026-10-19).
- **Search finds a number on any day** (owner, 2026-10-19): typing in My Leads' search ignores the day filter.
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
- **Sale dates and payments (owner, 2026-10-15):** an SMM sale says when its month starts (a renewal on the old end
  date or later, never earlier; a new client on the sale day unless changed). A balance is dated the day the money came —
  never before the sale, never in the future. Editing a sale never drops or re-dates a recorded payment; the advance is
  only the first payment.
- **Commission (owner, 2026-10-15, "Payroll's rule everywhere"):** the 5% / 10% counts in the pay period the money is
  collected, at the rate of that period, and only when the period reaches 75% of its target. A period or a collection is
  paid once — by Sales Payroll or by Settlements, never both. A member asks Settlements only for periods that have ended.
- **Feedback gate:** upsell only after **both** work and service feedback; tech admin and leader
  can read but not enter feedback.
- **Upsell ladder:** ad → social → website → software, measured from the highest rung owned.

## 25. CURRENT IMPLEMENTATION STATUS

**PARTIALLY IMPLEMENTED 🟡:**
- My Leads speed (2026-10-19): the member's whole lead history still loads (one session listener, ~2,000 docs for a
  long-serving member; the persistent cache makes later opens fast). Duplicates added by an admin during the session
  show from the next session or Recheck. The resolver still freezes the lead of a member who ADDED the number
  themselves when the other member's lead is older (a business-rule question, unchanged).
- Sale identity (2026-10-08): `smmSetup` (Add SMM sale's set-up of an existing sale) still passes the
  sale's position (`itemIndex`) from a fresh read; the risk window is a delete in the same second.
  `cancelOrderForSale` (rejections) still deletes a waiting order without its chat (a re-approval reopens
  both). An edit is saved (and told) only when `saleChangeList` names a change — an edit whose only change
  is something it does not name (an SMM sale's price-mode toggle, an earned-discount proof re-uploaded) is
  treated as "nothing changed", as before. Waiting orders whose sale was deleted before this fix leave the queue only when a tech admin /
  team leader opens Orders or Work Assign (`healOrphanOrdersOnOpen`, once a session).
- Sale dates and commission (2026-10-15): a sale revoked and re-approved BEFORE 2026-10-15 has no `firstVerifiedAt`, so
  for settlements made before then a balance collected between two old settlements could be paid once more (the old data
  cannot tell). A settlement stays paid if its sale is rejected later (no claw-back, as before). The renewals card's "+₹"
  is an estimate per renewal, not gated (`smm.md`). Checked by jsdom and in-memory-Firestore tests (`commissionRuleOct15`,
  `collectedOnOct15`, `smmSaleForm`, `smmStartDatesOct15`, `payLeftoversOct15`) — not against live Firebase.
- Special-category catalogue: `SaleForm` keeps its own copy of the picker instead of
  `SpecialCategoryFields` (both now carry the Custom Character description field). The Custom
  Character description and the Real Owner Face image are enforced (2026-09-22); the Real Owner Duo's two photos
  (2026-10-14) are enforced in the studio and the generator, not at sale time (the sale form only reminds the
  salesperson to collect them).

# DTS-OS — development history (newest first)

> Part of the project context (CLAUDE.md → Context map). Not loaded automatically: read it when you need
> the reason behind earlier work. Every finished task adds a dated entry at the TOP of the list below
> (CLAUDE.md §30 step 8). Detailed notes up to 2026-09-19 are in `docs/AI-MEMORY.md` (historical, read-only).

## 31. DEVELOPMENT HISTORY (concise; newest first)

Detailed per-session notes up to 2026-09-19 live in `docs/AI-MEMORY.md` (historical, read-only).
Design intent lives in `docs/superpowers/specs/`.

- **2026-10-08 (latest): Invoice Builder, round two — the owner's first real invoice** (`invoices.md` §9.22 /
  §24 / §25, `data-model.md` invoices + register + status, `roles-routes.md` §8.2, `docs/firestore-rules.md`
  invoices delete + register update).
  - **The owner's report** (a draft PDF "rebuild", ₹100): (1) no way to upload their own QR code; (2)+(3) the rate
    "was coming incl. GST" — it must be the subtotal, GST added after it; (4) the watermark was "cropping" over the
    invoice — no draft PDF at all, only the final one; (5) no Close; then "delete option is not there for the created
    invoice"; and "the world's best UI/UX".
  - **Done:** GST **on top by default** (`INVOICE_FALLBACK_DEFAULTS.pricesIncludeTax = false`; 100 → 100 + 9 + 9 =
    ₹118; "Rate includes GST" kept as the second option; the rate column just says "Rate"). **QR upload** in Payment
    details (`payment.qrImageUrl`, padded to a white square by `squareImageFile` before Cloudinary because html2canvas
    ignores `object-fit`; "Use the UPI ID instead"; saved with the payment defaults). **No watermark**; **no PDF or
    Print for a draft** (only Generate; a note on the preview says why); after Generate a "ready" window with
    Download PDF / Print / Done; a generated invoice's main button is Download PDF (+ Print, Edit, ⋯). A labelled
    **Close** top right (a link, so the leave guard covers it) replaces the back arrow. **Delete a generated
    invoice** (maker or admin, `deleteInvoice`): the number stays used — its `invoice_numbers` entry is marked
    `deleted` with who / when / customer / total in the same transaction, which the rules now require — so the
    series skips it and never reuses it; the confirmation suggests Cancelled when the client has the invoice
    (`deleteConfirmCopy`). The **logo** is drawn at an exact size from its natural proportions (`fitLogo`) so the PDF
    can never stretch or crop it. "Invoice details" folds for a draft, opens for a generated invoice.
  - **Tested:** unit tests updated and added (GST on top 100 → 118, delete keeps the number and the next is 0002, the
    uploaded-QR warning, `fitLogo`, the delete wording); full vitest 215 files / 3310 tests ✅; typecheck 1 known
    error; build ✅. Real headless Chrome on the real pages (memoryFirestore), 9 checks all PASS: the ₹118 sheet and
    PDF, no watermark on draft / paid / cancelled, draft has only Generate, the ready window downloads
    "Invoice DTS-26-27-0001 - Samas Sarees.pdf", Close (saves a draft, prompts for unsaved issued edits), a 300×500
    QR uploaded → printed square and unstretched (ink aspect 0.597 vs 0.6), logo 902×451 → 88×44, delete 0001 →
    register marked, next = 0002, 390 px no horizontal scroll, team-leader switch, 0 console errors.
  - **Owner's existing draft "rebuild"** keeps "Rate includes GST" (no migration) — flip it in Tax, or start a new one.
- **2026-10-08: the Invoice Builder — a new module** (session "invoice builder"; new
  `.claude/rules/invoices.md` §9.22; `roles-routes.md` flags / §8.1 / §8.2 / §10, `data-model.md` collections /
  relationships / statuses, `architecture.md` §11 Documents / §22, `people.md` §9.16, `docs/firestore-rules.md`;
  CLAUDE.md Context map / §32 / §33).
  - **The owner's request:** a world-class invoice workspace replacing the separate "Easy Invoice" app — editor +
    live A4 preview, GST (CGST / SGST / IGST, inclusive or on top), items with discounts and reordering, bank
    details and a UPI QR, terms, notes, drafts, generate, duplicate, delete, a PDF that matches the preview, no
    duplicate numbers, unsaved-change protection, phone to desktop; access: sales person, sales admin, tech admin
    yes, tech team leader by a switch, tech member never — enforced in the database too. Asked first and answered:
    Main Admin and Accounts Admin also get it; ONE switch for all team leaders (tech admin / main admin, in
    Settings); numbers `DTS/26-27/0001` per financial year; a generated invoice stays editable and keeps its number.
  - **Audit:** no invoice code or collection existed in DTS-OS. The old app lived in another Firebase project
    (`invoicegenerator-21b78`, collection `invoices`) with free-text numbers (`INV-<date>-<random>`, no uniqueness),
    tax always on top and computed in three places, and the QR fetched from api.qrserver.com — nothing to migrate.
    Reused: `company_settings` identity + logo (`useCompany`, `useCompanyLogo`), the HR counter's transaction
    pattern, the print CSS (`agreementPrint`, split into `printDocumentPages`), jsPDF + html2canvas + `qrcode`,
    Cloudinary, `useConfirm`, `holdUpdates`, a salesperson's in-memory orders.
  - **Built:** `utils/invoiceMath` (the ONE engine, integer paise, tax per rate group; inclusive prices keep the
    total exact and CGST = SGST — the owner's Inv. 4232 reproduces: 17,400 → 14,745.76 + 1,327.12 + 1,327.12),
    `utils/gst` (state codes, GSTIN check character, IGST by place of supply), `utils/invoiceNumber`,
    `utils/invoiceLayout` (pure page plan: rows never split, repeated table header, totals never alone, headings
    kept with text), `utils/invoiceDraft`, `utils/invoiceAccess`, `utils/invoicePdf`; `services/invoices` (one
    numbering transaction: FY counter + create-only `invoice_numbers` register + the invoice; Generate twice =
    same number) and `services/invoiceSettings`; `components/invoice/*`; pages `Invoices` and `InvoiceBuilder`;
    `hooks/useLeaveGuard`; routes `/invoices`, `/invoices/:id` (+ `InvoiceAccessGate`), one nav item per role
    (`requiresInvoiceSwitch` for team leaders, live in the Sidebar), `InvoiceAccessCard` on the tech / main admin
    Settings; rules for the four new collections, kept out of the catch-all. `company.numberInIndianWords` split
    out of `amountInWords` (payslip text unchanged).
  - **Found and fixed in the browser run:** the UPI QR printed as an empty square in the PDF (html2canvas paints an
    inline-block's background over its image → the frame is a plain block with no fill); every PDF line sat ~5 px
    low (html2canvas measures baselines with a probe `<img>` that Tailwind makes `display:block` → the probe is
    put back inline during capture, `withTrueBaselines`). Also, from review: an export double-click could hang,
    deleting a never-saved draft could bring it back via the leave-the-page save, an issued invoice's save waited
    on the network offline, and Status could not be changed without pressing Edit.
  - **Tested:** 70 new unit tests (`invoiceMath` incl. 300 random invoices, `invoiceRules`, `invoiceService` on
    memoryFirestore); real headless Chrome on the real pages over memoryFirestore, 15 checks A–O all passing after
    the two fixes — access for all 7 roles and the switch both ways, create / autosave, IGST / on-top / No GST /
    round-off, add / duplicate / reorder / delete items, discounts and mixed rates, QR, a 45-item 3-sheet invoice,
    numbering 0001→0002, double Generate, validation, edit after issue, Paid / Cancelled, PDF (light + dark ink,
    pages = sheets, QR present), print, 390 / 768 / 1440 with no horizontal scroll, refresh, the on-device copy and
    the leave prompt, duplicate / delete, Fill from a sale, zero console errors. Build ✅, typecheck 1 known error,
    full vitest ✅. Not driven: live Firebase (rules unpublished), two people generating in the same second
    (the fake store does not serialise transactions — the logic is Firestore's), a real printer.
- **2026-10-08: Sales → Tech on one permanent `saleId`; Real Owner Face keeps the client's face; దసరా**
  (session dts-os-db; `.claude/rules/sales.md` §9.4 / §24 / §25, `orders-work.md` §16 / §24 / §27, `data-model.md`
  leads / orders / work_assignments / notifications, `ai-ads.md` §17.2 / §24 / §27, `backend-security.md` §18,
  `roles-routes.md` §7 / §8.2, `architecture.md` §9.20 / §22 / §23, `docs/firestore-rules.md` note; CLAUDE.md §32 / §33).
  - **The owner's three items:** (1) "Fix the Sales → Tech workflow using a permanent saleId" — editing a sale
    created duplicate sales for Tech, deleted unassigned sales still appeared for Tech members, sales did not
    synchronise; the rules: one immutable saleId, create = one sale, edit = the same saleId (never a new sale),
    upsert on the tech side, UNASSIGNED + delete = gone everywhere, ASSIGNED + delete = blocked, ASSIGNED + edit =
    same saleId + assignment kept + a popup to the tech admin, team leader and member, no duplicate / stale /
    orphaned records, transactions; test CREATE → EDIT → ASSIGN → EDIT → DELETE UNASSIGNED → DELETE ASSIGNED.
    (2) Real-face ads sometimes changed the face — added a bindi — "check male and female both"; correct the frame
    and the video prompts; "for all the real person videos we need only this prompt based on gender": "With a
    very sweet voice she needs to say :- {Your Voice} with appropriate gestures · Negative prompt :- No text on the
    screen". (3) "Dusshera" was spelled wrongly in the voice-over script; the correct spelling is దసరా.
  - **Root causes (1):** a sale had no id — every writer found it by its POSITION in `leads.saleItems[]` and wrote
    the whole list back from its own copy (SaleForm's edit, My Leads' delete and payment, Sales Approvals,
    `mirrorPenaltyToSale` via `order.saleItemIndex`): an edit form open while an earlier sale was deleted saved over
    another sale (two rows of one sale), an approval could undo an edit or drop a just-added sale. The sale and its
    order were written separately and My Leads' `updateLead` swallowed its own error — an order with no sale, then a
    second sale + order on the retry; the save button had no in-flight guard (a double tap = two sales). An edit
    rebuilt the delivery promise from "now" (the deadline moved on every edit). Deleting removed the sale first and
    the order best-effort (a failure left it), never the chat or the "new order" bells; deleting a LEAD (custom lead,
    the sales admin's Leads pages, single and bulk) never touched its orders at all. `createWorkAssignment` wrote the
    job and then updated the order — a job for a sale deleted a moment earlier, or a second job for one ad (two
    people, or a double tap from a stale Assign form); the Work Assign pages failed silently. Revoking an approval
    deleted the pending sale's order. The "new order" bell had one dedupe key for every recipient, so each write
    replaced the last (only one tech admin / leader kept it). `timestampMs` lost the milliseconds of a JSON'd
    timestamp (a second order id for the same sale).
  - **Fix (1):** `utils/saleIdentity` (`saleId` = `<leadId>_<ms>`, order `o_<saleId>` — the id orders already
    had, no migration; `withSaleIds` stamps older sales; exact `timestampMs`; `leadHoldsSaleOf`), `utils/saleEdit`
    (`saleChangeList` — moved from SaleForm, money-tagged, now naming the advance, the screenshot, a Custom sale's
    service and length, a month's video length, a custom character; `mergeSaleEdit` three-way merge;
    `lockedServiceChange`; `saleHasWork`; `jobPatchForSaleEdit`; `saleEditNotice`), `services/sales` (`recordSale`,
    `updateSale`, `deleteSale`, `deleteLeadWithSales`, `mutateSaleItems`, `healOrphanOrdersOnOpen`,
    `notifySaleEdited` — all transactions), `orders.ts` (`orderSaleFields` / `newOrderForSale` /
    `orderUpdateForSale` / `afterOrderWrite` shared by the upsert and the transactions, per-recipient
    `order_new_<orderId>_<uid>` + role links, `removeOrderNotifications`, `markOrderSaleUnverified`, the penalty
    mirror by id), `workAssign.ts` (the job + the order in one transaction, `AssignmentRefusedError`), SaleForm
    (service + in-flight guard, promise kept, work-started banner, service locked), My Leads (rows / edit / log /
    note by `saleId`, Edit always, Delete with a confirm or "Can't delete — work started (Ravi)", payments and
    custom-lead delete through the service), Sales Approvals (every handler by id; delete through `deleteSale`;
    revoke keeps the order), MemberLeadsDetail / LeadsManagement (`deleteLeadWithSales`, bulk keeps and names the
    blocked leads), both Work Assign pages + `AssignTracksDialog` (toast on refusal; a gone order closes the form),
    Orders + Work Assign (orphan sweep on open), `UpdatePopup` + `notificationRouting` (`sale_edited` popup with its
    change list, `POPUP_ROLES` adds the tech admin), types (`saleId` on SaleDetail / Order / WorkAssignment).
  - **Root causes (2):** the owner-face frames' WARDROBE line (default female attire Traditional) was "a designer
    silk saree … with tasteful traditional jewellery" and overrode "keep what she wears in the photograph" — a
    "traditional look" the image model completed with a bindi; the male owner had no forehead-mark rule at all; the
    identity rules lived only in the frame writer's system prompt ("plain English, no negative list" output), and the
    one line the finished prompt carried about the face is the 📎 attach directive, which Copy strips; the studio's
    pack picker never set the entry's gender / attire, so "Real Owner Face (Male)" ran with the default Traditional
    (a kurta) while the picker showed Professional. Veo got the five-part motion prompt (walks, camera, keep sentence).
  - **Fix (2):** `frameBrand.withOwnerFaceLock` — `FACE LOCK:` in every owner-face frame BODY (survives Copy; re-stamped
    after a main-frame refine), by gender: the photograph's face, skin, hairline, hair / beard and forehead; a bare
    forehead stays bare, a mark the photo shows stays; nothing added (bindi, tilak, kumkum, sindoor, vibhuti, nose
    ring, face jewellery, make-up, new beard); only the clothes follow the outfit. `characterCastBlock` says the same;
    `ownerWardrobeDirective` (no jewellery, "the clothes only"); the male entry's negatives (catalogue TS + JSON);
    `resolveModelSpec` in `packWardrobe` and in the studio's pack picker. Video: `assembleRealPersonVeoPrompt` — ONLY
    the owner's template, "she"/"he" by the entry's gender; `writeVeoPrompts` returns it with no director call (first
    run, regenerate and the final-script rewrite); `spokenLinesIn` reads it (a refine still cannot change the words).
    Frames: no walking plan / 🎬 notes; `withRealPersonComposition` (standing, mid-gesture, never mid-step).
  - **Root cause / fix (3):** the occasion went into the Telugu prompts as the list's Latin "Dussehra" / "Dasara"
    (inside the Telugu greeting template too) and the writer transliterated it its own way. `utils/festivalNames`:
    the Telugu name in the greeting and the rule "Write the festival's name in Telugu exactly as దసరా" through
    `wishAudienceRule` (writer, repair, refine, character dialogue + its worked example), and
    `withFestivalSpellings` in `speakableLine` (Telugu only) rewriting every misspelling (దుస్సెహ్రా, దుస్సేరా,
    దసెరా, దస్సరా, దశరా, దసరాా, a bare దసర, the Latin forms; case endings kept; never దశరథ / విజయదశమి).
  - **Files:** new `src/services/sales.ts`, `src/utils/{saleIdentity,saleEdit,festivalNames}.ts`; changed
    `services/{orders,workAssign,geminiService,characterCatalogue}.ts`, `services/prompts/{motion,characterAd,festivalWish}.ts`,
    `utils/{frameBrand,spokenNumbers,notificationRouting}.ts`, `components/sales/SaleForm.tsx`,
    `components/layout/UpdatePopup.tsx`, `components/work/AssignTracksDialog.tsx`, `components/ai-platform/AIPlatformApp.tsx`,
    `pages/sales-member/MyLeads.tsx`, `pages/sales-admin/{SalesApprovals,MemberLeadsDetail,LeadsManagement}.tsx`,
    `pages/tech-admin/{Orders,WorkAssign}.tsx`, `pages/tech-team-leader/WorkAssign.tsx`, `types/index.ts`,
    `docs/video-category-catalogue.json`; tests new `saleIdentity`, `saleEdit`, `saleSyncOct08` (the owner's sequence +
    every duplicate / orphan path, real services on the in-memory Firestore), `saleRowsOct08` (UI), `realOwnerFaceOct08`
    (incl. a full run on a faked Gemini, both genders), `festivalNames`; updated `bulkSaleForm`, `wishesFestivalForm`,
    `smmAddSaleUi` (they now check what the form hands `services/sales`), `notificationRouting`, `aiPlatformInputs`.
  - **Tested:** build ✅ (main ≈457 KB, geminiService ≈833 KB), vitest ✅ — 212 files / 3235 tests passed but with 5
    unhandled errors from this batch (`.catch()` chained on `logActivity` / `sendNotification`, which a test stub returns
    `undefined` from — spotted by the parallel invoice session); fixed with try/await and `services/sales.quietly`, the
    full suite is now 215 files / 3305 tests (incl. the invoice session's), all pass, no unhandled errors; typecheck (1 known error),
    eslint on the changed files: no new findings beyond the tests' existing `any` style. **Browser** (a throwaway
    harness in the scratchpad driving the real My Leads, Orders, Work Assign, My Work and UpdatePopup on the
    in-memory Firestore, 390 and 1440 px — the owner's sequence, all 9 checks pass): CREATE (1 sale with its
    saleId, exactly 1 order `o_<saleId>`, its chat, a bell for the tech admin and the team leader, listed once);
    EDIT unassigned (same sale and order, the queue renamed, no popup); ASSIGN from the queue (1 job with orderId +
    saleId, the order assigned); EDIT assigned (Edit + "Can't delete — work started (Ravi)", the banner and the
    locked service, English → Hindi reached the job, 3 `sale_edited` rows); the POPUP for the member and the tech
    admin (changes listed, no ₹); DELETE UNASSIGNED (sale, order, chat and bells gone, the queue's Not assigned 0);
    DELETE ASSIGNED (no button; `deleteSale` refused, every document unchanged); a STALE Assign form after the sale
    was deleted ("Not assigned — This sale was deleted…", no job). No horizontal scroll; no console error but the
    refusal's own log. Not driven: live Firebase (transaction retries), push delivery, a team leader's popup on
    screen and the team leader's Work Assign copy; no Gemini run and no image or Flow generation — the owner-face
    frames / videos and దసరా are checked by unit tests and a full run on a faked Gemini.
- **2026-10-05 (evening): SMM "On hold", and the month the board could not show** (`.claude/rules/smm.md`
  §9.9 / §24 / §25 / §27, `data-model.md` smm_campaigns + app_settings, `docs/firestore-rules.md` note; CLAUDE.md §32).
  - **The owner's report:** adding an old client's earlier month (AIRAVATH, +13213899564, 24 Aug → 24 Sep) with
    "Add a month that had no sale" was refused — "AIRAVATH already has a month on these dates (25 Aug → 4 Oct 2026).
    Open it from the board instead" — but the board showed no such month. Mid-task: **"if the social is not renewal
    then keep it as hold"**; asked (AskUserQuestion): every ended month, history ones included (recommended), and
    "Not renewing" still files it under Finished (recommended).
  - **Root causes:** (1) `addNoSaleMonth` / `setupSaleMonth` saved every history month `completed` the moment it
    was added — overseers' Cards read only `status == "active"` and Finished is read on demand, so the month was
    nowhere in the default view; (2) Add SMM sale's lookup listed only SALES (`findSmmSalesForPhone`), so a number
    whose month had no sale read "No social media sale has been recorded" (and even offered "Record a new sale"
    against the rule that a client with months is renewed); (3) the clash check (`noSaleMonthClash`, every month
    on `clientPhoneId`) returned only a sentence, no link; (4) a removed history month restored by its order came
    back `active` + `history`, which neither Cards nor Finished showed. The live AIRAVATH document was not read (no
    Firebase access); every state it can be in is now visible.
  - **Fix:** `smmPackage.isOnHold` (active, ended, no renewal decision), `historyFiling`, `historyMonthsFollowed`;
    `renewalDue` / `closingStatus` / `renewalRelinkPatch` take history months, `renewalUnlinkPatch` returns a history
    month to `active`. `smmGlance` status `on_hold` ("Ended 4 Oct — not renewed yet · n posts not live", grey,
    after On track; it replaces "Off track — Month ended with n posts not live" for undecided months); board tile
    **On hold** (`SocialMedia` FILTERS `hold`, `Headline.SmmBoardFilter`), history months on hold in Cards, tiles
    fit by width from 1024px; month page renewal line "On hold — the month ended on … and has not been renewed".
    Setup paths save a history month `active` unless followed (next linked or any later month — `neighbourMonthsOf`
    now returns the client's `months`), file earlier on-hold history months a new month follows
    (`smm.fileFollowedHistoryMonths`, also in `closeEndedMonthsOnOpen`). One-time repair for months saved before:
    `smm.holdUnrenewedHistoryOnOpen` (first overseer board open; record `app_settings/smm_history_hold`).
    `SmmAddSaleDialog`: lists the number's months (`fetchClientMonths(phoneLockId)` — the clash check's query) with
    state, "No sale", salesperson and **Open month**; no new sale when months exist; the months shown above the
    no-sale form; a refusal shows **Open that month** (`noSaleMonthClashOf`, `SmmMonthClashError.monthId`).
  - **Files:** `utils/smmPackage.ts`, `utils/smmGlance.ts`, `utils/smmRenewalLink.ts`, `services/smm.ts`,
    `services/smmSetup.ts`, `components/smm/SmmAddSaleDialog.tsx`, `components/smm/SmmGlance.tsx`,
    `components/smm/dashboard/Headline.tsx`, `pages/shared/SocialMedia.tsx`, `pages/shared/SmmCampaignPage.tsx`;
    tests `smmOnHoldOct05.test.ts` (new, 15, real services on the in-memory Firestore), `smmAddSaleUi.test.tsx`
    (+3: the number's months, the clash link, the On hold tile), `smmGlance.test.ts`, and the history-status
    expectations in `smmHistoryOct05`, `smmNoSaleOct03`, `smmSetupOct03`, `smmRenewalOct05`.
  - **Tested:** build ✅, vitest 206 files / 3172 tests ✅, typecheck (1 known error). Browser (throwaway harness in
    the scratchpad, real SocialMedia + SmmCampaignPage on the in-memory Firestore, dark, 1440 and 390 px, two runs,
    no console errors): an AIRAVATH history month seeded as `completed` came back on hold by the one-time repair;
    On hold tile 2 (AIRAVATH, an ended sold month "· 8 posts not live"); Add SMM sale on +13213899564 listed the
    month with Open month; 24 Aug → 24 Sep refused with the inline Open that month (no month written, no toast);
    the month page said "On hold — the month ended on 4 Oct…"; the salesperson got Renew; no sideways scroll at
    390 px. Not driven: live Firebase — the owner's real AIRAVATH document was not read.
- **2026-10-05: a deleted renewal un-renews its month; over-discounted sales reach the tech side
  at once; the salesperson's renewal money card; the admins' Money tab; the 11 AM / 5 PM post-status
  popup** (session dts-os-ba; `.claude/rules/smm.md` §9.9 / §24 / §25 / §27, `sales.md` §24,
  `orders-work.md` §24, `architecture.md` §5 / §23, `roles-routes.md` §7 / §8, `backend-security.md` §18,
  `data-model.md` order statuses; CLAUDE.md §32 / §33).
  - **The owner's five items:** (1) a salesperson renewed an SMM package and then deleted that sale, and the
    tech side still read "Renewed by Govardhan — the next month is set. Next month"; (2) a sale with a
    discount over the member's 10% went to the sales admin and NOT to the tech side until approved — it must
    reach the tech side without the approval; (3) the salesperson needs a clear SMM calculation — running,
    renewed, pending, and the money they get for renewals — "a UI that 100% motivates them to convert their
    clients to the next month"; (4) the same, company-wide, for the tech admin and sales admin only; (5) a
    popup to everybody doing SMM work, twice a day, to update the status of all their posts. Layouts and
    times chosen by the owner from mockups (AskUserQuestion): "Money first" card, a "Money" tab in Social
    Media, 11 AM and 5 PM, anyone holding a seat on a month's team.
  - **(1) Root cause:** a renewal sale links Month N forward (`renewal: { state:"won", nextCampaignId }`,
    `linkRenewal`); deleting the sale removed Month N+1 (`cancelOrderForSale` → `setCampaignRemovedForOrders`
    when work was out, `deleteCampaignsForOrders` when not) but nothing ever touched Month N. **Fix — "renewed"
    follows the renewal sale:** `utils/smmRenewalLink` (pure: `renewalUnlinkPatch` — back to "no decision", a
    month already filed `renewed` back to `active` (history → `completed`); `renewalRelinkPatch` — only if it
    still points nowhere or here; `leadIdOfOrderId`) applied in a transaction by `smm.unlinkRenewal` when
    `cancelOrderForSale` (sale deleted / rejected / taken back) removes or erases the month (`saleWithdrawn`),
    and by `relinkRenewal` when the sale comes back (`ensureCampaignForOrder` revive, order restore). The tech
    admins / team leaders get `smm_renewal_cancelled`. **Deliberately not** for the tech side removing the
    renewal order from the queue (offered on delivered orders too), purging it, or deleting the month: the sale
    and its commission stand, and "no decision" on an old filed month would invite a duplicate renewal sale —
    the month page just drops the dead Next month link ("its next month was taken off the board"). **Existing
    broken links** are repaired by `healRenewalLinksOnOpen` (the board for every viewer — before the overseer's
    `closeEndedMonthsOnOpen` —, the month page when its next month is gone, the Money tab) only where the sale
    was withdrawn (`renewalSaleWithdrawn`: the next order `cancelled`, or no order and no such sale on the lead);
    once per link per session.
  - **(2)** `upsertOrderForSale` no longer returns early for an over-limit discount: the order is made at
    sale time like any sale (`saleVerified:false` → the Orders queue's existing "Pending approval" chip);
    approval still happens in Sales Approvals, a rejected sale is still cancelled. Removed with the gate:
    `releasedToTech` (now `discountAwaitingApproval`, a fact for screens), the `withheld` sale stage, the
    `held` SMM sale state / step, SaleForm's `heldForApproval` result, My Clients' held notice; SaleForm's
    banner, authority line and toast now say "Sent to the tech team right away — your admin must approve the
    N% discount". **Sales held under the old rule** get their order when a sales admin opens Sales Approvals
    (`orders.releaseHeldSales`: pending + discount awaiting approval + no order yet; one read each, once a
    visit).
  - **(3)** `SmmRenewalsCard` (sales Dashboard, and the top of their Social Media) rebuilt "Money first":
    ‹ month › stepper; "₹X from your renewals this month" + "₹Y more waiting — renew N clients"; one bar
    "3 of 7 renewed"; four counts (Running now · ✔ Renewed · ◷ Waiting (+n from earlier) · ✖ Not renewing,
    the calendar's marks); "Renew these now" rows with "+₹500" (their 5% / 10%, `commissionRate`) and Renew;
    Renewed / Not renewing chips; "N% of each renewal sale is yours — paid once verified and collected". It
    still rings the renewal bells (not on Social Media, which rings them itself). No new read.
  - **(4)** Social Media → **Money** (`components/smm/money/SmmMoneyView`, `canSeeSmmMoney`: main / tech /
    sales admin; anybody else asking for `?view=money` gets the cards): totals (running clients, ₹ a month,
    renewal rate), the month's renewals on one bar (✔ kept ₹ / ◷ still to win ₹ / ✖ gone ₹), one row per
    salesperson (running, ✔ ◷ ✖, kept, rate), and "Waiting for a decision" with Remind / Open. Numbers in
    `utils/smmRenewalMoney` (a month counts in the calendar month its last day falls in; value = next month's
    price, else its own, else the package's list price; history / removed / deleted left out). One on-demand
    read per month shown (`smm.fetchMonthsEndingBetween`, `cycle.endDate` range, single-field index).
  - **(5)** `components/smm/SmmStatusCheckPopup` (AppLayout, tech roles, not external creators; rules in
    `utils/smmStatusCheck`): from 11:00 and from 17:00, for a person holding a seat on a month running today,
    every post not live yet (theirs first, late next) with its status select (`setItemStatus`; Scheduled /
    Posted disabled until the client approved); "All updated" answers the slot on this device, "Later" = 30
    min; opened first after 17:00 it asks once; waits while any other popup or full-screen overlay is open. One scoped read when a
    slot comes due (`smm.fetchMyCampaigns`), live only while open.
  - **Files:** `services/smm.ts`, `services/orders.ts`, `services/smmSetup.ts`, `utils/{smmRenewalLink,
    smmRenewalMoney,smmStatusCheck}.ts` (new), `utils/{saleDiscount,saleStatus,smmPlan}.ts`,
    `components/smm/{SmmRenewalsCard,SmmStatusCheckPopup,SmmAddSaleDialog}.tsx`,
    `components/smm/money/{MonthStepper,SmmMoneyView}.tsx` (new), `components/sales/{SaleForm,SaleStatusChip}.tsx`,
    `components/layout/AppLayout.tsx`, `pages/shared/{SocialMedia,SmmCampaignPage}.tsx`,
    `pages/sales-admin/SalesApprovals.tsx`, `pages/sales-member/{MyClients,Dashboard}.tsx`.
  - Also: on a phone the Social Media view switcher is a full-width row of equal word tabs (icons from 640px)
    — the admins' fourth tab, Money, ran off a 360px screen.
  - **Tested:** new `smmRenewalOct05` (14), `smmUnrenewOct05` (15, in-memory Firestore: deleted after / before
    jobs, filed month back on the board, re-approve, a newer renewal kept, the tech side's queue removal /
    purge / Delete keep it renewed, the repair per case and once a session, the Money read),
    `smmStatusCheckOct05` (6); `discountHold`, `saleDiscount`, `saleStatus`, `saleOpensChat`, `smmSaleForm`
    rewritten to the new rule; `smmAddSaleUi` mock extended. **Browser** (throwaway harness on the in-memory
    Firestore, real pages, headless Chrome; 1440 / 1024 / 390 / 360 px, light + dark, zero console errors, no
    sideways scroll): the Govardhan case repaired on opening the month (strip → "Renewal due…", Renew back for
    the salesperson); the card's numbers checked by hand (5% and 10%), month arrows, Renew rows; the Money tab
    for tech admin and sales admin (absent for member / team leader, also via `?view=money`), Remind → toast +
    bell; the popup at 17:41 (5 PM slot) — worst first, own posts first, a status change saved, Posted disabled
    without approval and refused by the service, Later / All updated remembered, nothing for a salesperson.
    A second pass fixed what the first found: names squeezed by buttons on phones, the popup's clipped "You"
    chip, amber words on white (now text colour + amber marks; money in a darker green, 4.6:1), the 1024px rate
    bar, "1 month ends", the salesperson's own strip wording, the popup's count (now the card's), the tabs.
    Build ✅, typecheck (1 known).
- **2026-10-05: an old client's earlier SMM months — the Team Lead adds them, their people and
  work are kept, they join the client's run — and the Kids dressed for the ad** (session dts-os-d3;
  `.claude/rules/smm.md` §9.9 / §24 / §25 / §27, `roles-routes.md` §8 + `smmLeader`, `data-model.md`
  `smm_campaigns`, `ai-ads.md` §17.2 inputs (Kids) / §24 / §25; CLAUDE.md §32).
  - **The owner's four items (with screenshots):** (1) listing the previous months' work for a client —
    "assign to the person is not there", the work to be updated later; (2) the Social Media Team Lead's
    "Add SMM sale" showed "No social media sale has been recorded" and nothing else; (3) no way to check
    the previous month's work, "the calendar UI is worst" (the screenshot was the LIVE site — the old
    2026-10-03 calendar; today's redrawn calendar was uncommitted); (4) the Kids always in the same dress,
    whatever the concept, business or logo.
  - **Root causes (in code):** (1) `SmmSetupForm` hid the whole team section once the dates were over, and
    the month page hid Edit setup on a history month — so nobody could be put on a past month, see it or
    fill it in; and `setItemStatus` refused Posted without a recorded client approval, three presses per old
    post. (2) `canAddNoSaleMonth` was the three admins only, by a 2026-10-03 rule, while the lead had the
    button. (3) An earlier month was only ever linked BACKWARD (`previousMonthOf`), so August added after
    September stayed a separate "Month 1" with no "← August" link; the calendar opened a finished month on
    its middle page (often empty for a filled-in history month) and kept a client's months read for 5 minutes
    even after a month was added; the post dialog dropped what was typed in the 900 ms before it closed. (4)
    `castSheet.outfitFor` gave the children one outfit per attire choice, coloured from a fixed list.
  - **The owner's answers (asked first):** a past month's people by name, no job cards; Posted without the
    approval step on history months only; the Team Lead adds no-sale months but records no sale; the Kids'
    outfit follows the ad automatically.
  - **What changed:** `utils/smmPackage.canAddNoSaleMonth` (+ the lead); `SmmAddSaleDialog` (who records a
    new sale; history toast names the people; drops the client's kept months read); `SmmSetupForm` ("Who did
    the work" on history; `SmmSetupDialog` → `applyHistorySetup` on a history month); `services/smmSetup`
    (`historyTeam`, `historySetupProblem`, `applyHistorySetup`, `neighbourMonthsOf` replacing
    `previousMonthOf`, `linkInFront` — forward link + renumbering; history months built with their team);
    `smmPlan.canPublish(item, campaign)` + `smm.setItemStatus` (history: no approval, upload date required);
    `SmmItemDialog` (history note in place of the approval panel, date saved before Posted, unsaved edits
    written on close); `SmmCampaignPage` (Edit setup on history, no carry from a history month, fill-in
    note); `smmCalendar.openingMonth` (most posts, middle on a tie) and the history banner in
    `ClientCalendar`; `useSmmClientMonths` (`forgetClientMonths`, link-aware staleness); `smmAssign`
    (a tech-member assigner's tech admin joins the chat). Kids: `utils/castSheet` (`WardrobeTheme`,
    `kidsThemeOf` by first mention, `themeTextOf` — brief first, no address / contact / palette —,
    `brandColoursIn`, `dressKids`, `kidsWardrobeLine`, `an()`), `geminiService` (cast sheet built after the
    scene plan with the theme; `brandPaletteOf` lifted out of `overlayTheme`; the Kids' WARDROBE line repeats
    the sheet), `adRequirement` ("Smart casual" → "Matches the ad" for Kids). dts-os-83's stylist then took
    the WARDROBE line over for every cast (`castWardrobeLine`) and uses `dressKids` as the Kids' fallback.
  - **Tested:** new `smmHistoryOct05` (10, real services on the in-memory Firestore: history team without
    jobs, forward linking and renumbering through three months, posting rules, Edit setup on history, the
    lead's month puts the tech admin in the chat), `smmItemDialogOct05` (5), `kidsWardrobeOct05` (10), and
    updated `smmNoSaleOct03`, `smmAddSaleUi` (+1), `smmCalendar` (+1), `humanDuoKidsOct01`,
    `adPipelineEndToEnd` (+1, a school's Kids through the faked pipeline; the fake extraction is now per
    test). Browser (throwaway harness on the real pages, in-memory Firestore, headless Chrome): the lead's
    lookup, AIRAVATH 24 Aug – 24 Sep as history with Aswintha, a post filled in on 28 Aug, its calendar,
    Edit setup to Rekha, the owner's Javani month seeded as in the screenshot then August added in front
    (Month 1 → 2, "← August 2026", paged to on the calendar); 1440 / 390 / 360 px, no console errors. Full
    suite 202 files / 3122 tests, build, typecheck (the known VideoCallManager error only). Not checked:
    live Firebase, and no image yet from the Kids' new outfits.
- **2026-10-05: the wardrobe stylist — the invented cast is dressed for the business, the video
  and the logo** (`.claude/rules/ai-ads.md` §17.2 step 5 / §24 / §25 / §27; CLAUDE.md §32 / §33).
  - **The problem (owner):** "in the duo characters the girl and the boy always get the same outfit — we
    need them related to the video context, the business context and the logo, whatever is good."
  - **Root cause (in code):** the cast sheet (`utils/castSheet.outfitFor`) dressed every invented person by
    the ordered attire alone — Professional put both people in "a tailored formal suit with a crisp white
    shirt", Traditional was always a saree beside a kurta with a cream Nehru jacket — and the colours came
    from a fixed list of seven pairs picked by the business name. The frame prompt then called those colours
    "final", overruling the "brand palette" wording of the WARDROBE line and the duo's catalogue entry. The
    extraction is told not to describe the logo, so nothing in the run knew its colours.
  - **The owner's answers (asked first):** keep the ordered attire as the STYLE (Traditional ethnic,
    Professional formal, In-shirt & Pant, Custom verbatim) and choose everything inside it; apply it to every
    invented person (human duos, Kids, the Normal Ad presenter); decide it with an AI stylist that sees the
    logo, with a code fallback.
  - **What changed:** new `services/prompts/castWardrobe.ts` (`CAST_WARDROBE_SYSTEM_PROMPT`,
    `castWardrobeRequest`: the people with their ordered style, the business and core message, the brand
    palette, the festival's look, BUSINESS CONTENT, the FRAME instructions and the voice note's requests,
    the logo image) and `utils/castWardrobe.ts` (`styleRuleFor` per person and attire, `checkStyledCast`:
    inside the style, a nameable colour and garment that the outfit names, no writing / logo / profession's
    uniform / bridal / revealing clothes, children never a saree / suit / heels / make-up, two people never
    one name and two adults never one main colour; all or nothing). `geminiService.styleCastWardrobe` (one
    `fast` call, temperature 0, the logo attached unless "No logo"; a rejected answer goes back once with its
    problems) starts right after the core message and is awaited before `castSheetFor` (20 s cap).
    `castSheetFor` takes `styled` (wins over the Kids' `dressKids` and `outfitFor`; never for Custom),
    exports `castPeopleFor`, and without the stylist gives grown-ups the brand palette's colours
    (`brandColoursIn`). The WARDROBE line now repeats the sheet for every non-Custom cast in a run
    (`castWardrobeLine`; `kidsWardrobeLine` calls it); a refine keeps the ordered directive.
  - **Tested:** `castWardrobe.test.ts` (16) and `castWardrobePipeline.test.ts` (5, the run on a faked
    Gemini: the logo reaches the stylist, its answer is on every frame, in the WARDROBE line and in the Veo
    names, a retry, the fallback, Custom and Motu & Patlu never styled, the lone presenter); full suite,
    build, typecheck. Live (real Gemini): the prompt on five briefs — IconoIQ's black-and-copper logo gave an
    ivory Mangalagiri saree and a gold silk kurta, a children's hospital sky blue and forest green suits, a
    sweet shop's Sankranti a saffron and a maroon silk saree, the play school's first answer was correctly
    refused — and one full 2-clip duo run with the logo (stylist 24 s, in parallel; 52 requests, 154 s).
    No image or Veo clip has been made from a styled frame yet.
  - **Parallel work the same day:** dts-os-d3 dressed the Kids for the ad in code (`dressKids`), which is
    the Kids' fallback under the stylist (its own entry).
- **2026-10-05: the Veo dynamic pass — every clip a moving commercial shot, and the camera never
  moves backward** (`.claude/rules/ai-ads.md` §17.2 step 6 / §24 / §25 / §27; CLAUDE.md §32 / §33).
  - **The problem (owner's report, three Flow clips made from that morning's prompts):** still static. A
    woman in a maternity consultation room, a man and a woman at a hospital reception, and Motu & Patlu at
    the same reception all stood on one spot and talked. Measured from 9 frames per clip: the woman kept her
    hands clasped while the camera slowly pushed in; both pairs stood on an almost locked two-shot (the
    duo's sign board even redrew itself). Veo had done exactly what the prompts said.
  - **Audit (root causes, all in code):** the planner kept most clips standing (clip 1 and the last never
    walked, one walk per ad, drawn pairs and deities never walked); the one walk was "two or three steps,
    then stops"; three of the five moves did not move the camera (focus pull, locked, float), a pair never
    got a dolly in and a drawn pair only got locked / focus pull; the keep sentence asked for the place
    "exactly as in the attached frame for the whole clip" and a pair "side by side in the same positions"
    (contradicting the pair's own walk); the director was told "no steps" and any walking it wrote for other
    clips was thrown away; frames were posed (hands at rest, the hero frame's "formal front-clasp corporate
    pose"); catalogue lines like "his feet stay exactly where they are" reached the director; nothing asked
    for life around the cast. Running the real code for a 4-clip ad gave 1 walk for one woman, 1 for the
    man & woman, 0 for Motu & Patlu ("the camera fixed" in all four).
  - **Approved plan (shown in chat), with the owner's change:** "no walk-back, never do it" — read as "the
    camera never moves backward", so no pull-out either. The owner's keyword list became the planner's
    vocabulary, not prompt text; left out, with reasons given: pull-out, crane, orbit/360, pan, tilt,
    reveal, POV, over-the-shoulder, follow-from-behind, establishing shots, entering the store / opening
    doors (they invent rooms the frame does not have, hide the speaker's mouth, or lead outside).
  - **What changed:** `prompts/motion.ts` — six actions (`walk_toward`, `walk_across`, `approach_show`,
    `walk_stop_present`, `turn_present`, `walk_invite`) and five moves (`push_in`, `side_track`,
    `lateral_dolly`, `arc`, `static_locked` only for a walk in a client's photo); per-cast tables (`CAMERAS`,
    `PHOTO_CAMERAS`, `PAIR_MOVES`) — pairs incl. Motu & Patlu walk together side by side, sideways only;
    deities in place under blessing names; the planner opens on the move, walks at least half the clips and
    picks cameras with a backward pass so neighbours never repeat; new camera sentences, keep sentence
    (`VEO_FRAME_LOCK` "as the attached frame" + `LEGACY_VEO_FRAME_LOCK`), life line, speaker framing,
    one-line pair clips (`pairNamesOf`), negative additions; the director prompt and checks (`walkHint`,
    `RUNS`, `BACKWARD`, `PAIR_TOWARD`, relaxed tour limits), `stagingKeyOf` for saved plans, `withoutStillness`
    additions. `prompts.ts` — `HERO_FRAME_POSE` replaces the front-clasp in every hero-pose rule (also the
    attire directives in `geminiService`), "FRAMES BUILT FOR MOTION" asks for mid-movement stills.
    `prompts/characterAd.ts` — the pack frame text ("every clip MOVES"), the two-hander caught mid-step,
    `packVeoSubject` sides / pairNames / eyeLevel (kids at their own eye level). `prompts/scenePlan.ts` STEP 5
    per cast; `utils/scenePlan.ts` reads old keys; `prompts/refine.ts` and `utils/veoRefine.ts` know the new
    rules and both keep sentences; `types/aiPlatform.ts` comment.
  - **Tests:** `motionAndVeo` rewritten (64: the anti-static rule over every cast × 1–8 clips × ad type ×
    photo mix, never backward, pairs sideways, photos, director checks, saved kits); `adPipelineEndToEnd`
    (the frame and the video plan the same move through the faked-Gemini run), `characterAdPrompts`,
    `humanDuoKidsOct01`, `adGenSept22`, `spokenNumbers`, `prompts` updated (`soloCharacterAd` pins the
    "two-hander" staging, which was kept). Live Gemini:
    `regenerateVeoForClips` on prompts describing the owner's three frames — eight director actions, all
    specific and accepted (7 requests). `npx vitest run` 197 files / 3073 tests ✅, tsc = the known
    VideoCallManager error, build ✅.
  - **Not verified:** no Flow clip from the new prompts yet (the owner's A/B); no browser run — no UI changed,
    the prompts appear in the same Veo cards.
- **2026-10-05: the Veo 3 video-prompt engine rebuilt — short, motion-first prompts with bounded
  walking** (`.claude/rules/ai-ads.md` §17.2 step 6 / §24 / §25 / §27; CLAUDE.md §32 / §33).
  - **The problem (owner's brief):** videos were static (people stood still, no walking, almost no camera
    movement), duo videos did not follow the speaker, and Veo still invented new places and drifted
    identities. Wanted: short, simple prompts — camera + action + voice + gestures + frame/identity lock +
    negative — that direct motion and never re-describe the attached frame. The owner reviewed the audit and
    plan (shown in chat) and approved it with the recommended answers: a client's store/office photo walks
    only toward a still camera; Motu & Patlu and other drawn pairs never walk (the focus follows the
    speaker); human pairs and Kids walk only together; the Flow mode is written into the checklist.
  - **Audit (root causes):** the static videos WERE the 2026-10-01 spec, enforced in five layers (in-place
    stagings, a push-in of "a few percent", the director told "IN PLACE, ALWAYS", `resolveDirection` throwing
    away any walking or tracking text, and "No walking / no pan, tilt, tracking" negatives). Measured with
    the real assembler: 1,568 words for one presenter and 2,297 for Motu & Patlu, the spoken line after word
    1,000, the street / road / door named 15–18 times inside "No …" lines (Flow has one prompt box, so the
    negative is read as prompt), and the frame re-described from its PROMPT, not the generated image (two
    sources of truth). Google's Veo 3.1 guide: for frame-based video describe the motion, not the image. Also
    found: the video side planned from lines that carried the cast-sheet names, and "the woman in the teal
    saree" read as a product, so a duo clip's video could be planned differently from its frame.
  - **What changed:**
    - `prompts/motion.ts` (rewritten around the same exports): `walk_and_talk` is back, bounded (two or three
      steps on the open floor the frame shows); a `tracking` move (moves back with a walk at the same
      distance); `push_in` is now a visible slow dolly in; `castKindOf` decides who may walk and which moves
      (single / deity / pair / drawn pair) and `plates` keeps a client photo untracked; an ad with a middle clip
      that may walk always gets one walk (`TRUST_WALK` when only the promise clip can). `assembleVeoPrompt` is
      five short parts (opening, `cameraShot` + action, voice, the keep sentence `VEO_FRAME_LOCK`, a one-line
      negative). The director writes only `{ clip, action }`; `actionUsable` checks it (word lists that match a
      person, not things in the frame — a live run had refused a mannequin) and the plan's action is the
      fallback. Removed: `frameSummaryOf`, `COLOUR_LOCK`, `identityRules`, `worldRules`, `performanceRules`,
      `scaleLock`, the WHO SPEAKS / SPEAKER FOCUS blocks, the beats and scene life, `PRESENCE` /
      `HAND_GESTURES`, `LENS_COMBOS` / `SPEED_KEYWORDS`. `spokenLinesIn` reads the new and the old line form.
    - `geminiService`: the frame side and the video side plan from the same SPOKEN words and plate clips;
      the director is told the planned action and the fixed camera; a single presenter is "she / he".
    - `characterAd.packVeoSubject` / `prompts.modelVeoSubject`: short identity locks, no manner / gesture
      blocks; frame system prompts say what each clip does (and "A WALK NEEDS ITS FLOOR").
    - `prompts/scenePlan` STEP 5 offers each cast only what it may do; `prompts/refine` and `utils/veoRefine`
      know both prompt forms, and an edit may not drop the keep sentence.
    - `generation/mission.ts` and `AIGuideSheet`: use Flow's Frames to Video with the frame as the START
      frame, never Ingredients to Video.
  - **Tests:** `motionAndVeo` rewritten (60), plus `adPipelineEndToEnd` (a 3-clip run: the frame composed
    for a walk is the clip that walks; a store photo is never tracked; a duo plans the same move on both
    sides), `characterAdPrompts`, `humanDuoKidsOct01`, `adGenSept22` (refine on new and old prompts),
    `spokenNumbers` (scene-plan options per cast), `prompts`, `standardPathUnchanged`, `missionWorkspace`.
    Live Gemini (2026-10-05): one full 4-clip Telugu model ad (128 s; every frame composed for its move) and
    three director runs through `regenerateVeoForClips` (model ad, Motu & Patlu, a human duo) — the actions
    came back specific and passed the checks. Browser (real `MissionWorkspace`, `AIGuideSheet` and Veo
    `GeneratedCard` in the studio's dark theme, 1440 and 390 px): no overflow, no console errors, the copy
    button copies the prompt exactly. Build ✅, vitest ✅, tsc = the known VideoCallManager error.
  - **Not verified:** no Veo video has been generated from the new prompts — the owner should A/B a few clips
    in Flow (same frame, old vs new prompt).
- **2026-10-05: the client calendar becomes a normal calendar; every post on its upload date**
  (`.claude/rules/smm.md` §9.9 / §24 / §25 / §27; `roles-routes.md` §10).
  - **The problem (owner, with two screenshots of Dhana lakshmi's month):**
    - "No option to change the month": version 2 paged by the client's months, and this client has one.
    - "Not clear": a day showed only "✔ 9", never a post's name.
    - "Not responsive": from 1280px the day's posts sat beside the grid in a column as long as the list,
      leaving the calendar in empty space, and each card's buttons wrapped onto two or three rows. The
      layout switched on the screen width, not the room it had.
    - The same day, via session dts-os-a1, the owner said all nine posts sat on one date. `postedAt` is
      stamped when Posted is pressed, and the team marked the nine together on 5 Oct.
  - **Confirmed (AskUserQuestion with mockups):** normal calendar months, not client months.
  - **What changed:**
    - `utils/smmCalendar`: version 2's one-client-month model (`buildMonthCalendar`, `openingMonthId`,
      `isMonthDay`, the 14-day reach) is replaced. New: `buildClientRun`, `calendarPage`,
      `openingMonth` / `openingDay`, `clientMonthOn`, `outsideItsMonth`, `monthOf` / `monthTitle` /
      `monthShort` / `shiftMonth` / `monthBounds`.
    - An entry's `day` is now its `uploadDate`, falling back to the stamp only when there is no upload
      date. `wentLiveDay` is renamed `markedDay`.
    - Sentences: "Posted on 15 Aug" (+ the upload time); "Marked posted on 5 Oct — no upload date was
      given"; "Posted — no date was given".
    - `ClientCalendar` is rewritten: ‹ Sep · October 2026 ▾ · Nov ›, Today, a month list, the client's
      months as links, and start/end written on the day. It measures itself (`chartKit.useWidth`):
      post names from 600px, three per day from 960px, marks only below. The body font is used for the
      title when narrow. The day's posts sit under the grid.
    - `CalendarDayPanel`: cards side by side, Open beside the name, and "Its date is outside Month 1".
    - `marks`: fixed sizes, plus `xs`.
    - `SmmCalendarBoard`: the client list moves beside the calendar only from 1280px.
  - **Owner's data:** Dhana lakshmi's nine upload dates are each a month early (August, before the 6 Sep
    start). The calendar now shows them on August's page, flagged; the dates are to be corrected in the
    Content list. `smmDashboard.postedDay` (Insights) is unchanged.
  - **Files:** `src/utils/smmCalendar.ts`, `src/components/smm/calendar/{ClientCalendar,CalendarDayPanel,marks}.tsx`,
    `src/components/smm/{SmmCalendar,SmmCalendarBoard,SmmReportPanel}.tsx` (comments and breakpoints),
    `src/test/smmCalendar.test.ts` (19), `src/test/smmCalendarUi.test.tsx` (8).
  - **Tested:**
    - Unit and UI tests on the in-memory Firestore.
    - Browser harness (real `SmmCampaignPage` / `SocialMedia` on memoryFirestore, 240px sidebar shell):
      the owner's month at 1920; widths 1920 / 1280 / 1024 / 800; phones 412 / 390 / 360 (every month's
      name fits); dark and light; Report tab; board at 1440 / 390; the month list; keyboard across a
      month's edge; swipe; tap-to-reveal. No horizontal overflow and no console errors.

- **2026-10-05 (later): the client calendar redrawn so anybody can read it** (`.claude/rules/smm.md` §9.9 /
  §24 / §25; `roles-routes.md` §10; `architecture.md` §22).
  - **The problem.** The owner asked whether earlier months can be checked, and said the calendar was
    confusing — it had to be clear "even to an uneducated person".
    - The first calendar paged by calendar month, so one client month (5 Sep → 5 Oct) was split over two
      pages.
    - It used six stage colours, hatching and small icons.
    - Its prev/next were small chevrons and a strip.
    - The Report tab's "This month's calendar" was a stacked bar chart, with no way to an earlier month.
  - **Confirmed (with mockups):** one client month per page, and three marks only.
  - **The new page:**
    - **Which month:** "Month 2 · 5 Sep – 5 Oct 2026 · Running now", big "‹ Month 1 / Aug 2026" and
      "Month 3 ›" buttons, and a button per month.
    - **How it went:** three big counts — ✔ Posted, ✖ Not posted, ◷ Coming up — each a solid circle, a
      number and a word.
    - **The calendar:** each day shows only those marks with a number, today ringed, and the days around
      the month faded.
    - **The picked day:** its posts in sentences ("Posted on 12 Aug (it was planned for 10 Aug)", "Not
      posted — it was due on 25 Aug", "Waiting for the client's approval"), with "See on Instagram" and
      Open.
  - **Where:** the same calendar is now on Content → Calendar, the Report tab (replacing the bar chart)
    and Social Media → Calendar.
  - **Files:** `utils/smmCalendar.ts` rewritten around one month (`buildMonthCalendar`,
    `openingMonthId`, `openingDay`, `dayMarks`, `markOf`, `entryNote`, `waitingNote`, `phaseLabel`,
    `rangeLabel`, `weekGrid`); `calendar/ClientCalendar` and `CalendarDayPanel` rewritten; new
    `calendar/marks`; `SmmCalendar` takes `focusId`; `SmmReportPanel` (+ `onOpen`) and
    `SmmCampaignPage`.
  - **Fixed in the browser check:**
    - A right-swipe on the calendar was taken by the browser as Back and left the page; the grid is now
      `touch-pan-y`.
    - The phone's "Month 2 ›" button was cut to "Mo…"; the buttons now sit under the name on a phone.
    - Day marks grow on wider screens.
  - **Tested:**
    - `smmCalendar.test.ts` (15) and `smmCalendarUi.test.tsx` (6), both rewritten.
    - A browser harness at 1440 / 390 px, dark and light: the month page (Content and Report), the board,
      the step buttons, the month buttons, a swipe, the day panel and the links. No console errors, no
      sideways scroll.
    - `npm run build` ✅; `npx vitest run` ✅ 197 files, 3057 tests; tsc → only the VideoCallManager
      error; eslint clean on the changed files.
  - **Not covered:** live Firebase.

- **2026-10-05: the SMM client calendar, and "Accounts it covers" in setup** (`.claude/rules/smm.md`
  §9.9 / §24 / §25 / §27; `roles-routes.md` §10; `architecture.md` §22; `data-model.md` §13).
  - **Client calendar.** The owner asked for a world-class monthly calendar of each client's social
    media for checking the history. The month page's calendar showed only that month's thirty days.
    Confirmed answers: one calendar per client across all their months; on the month page AND as a new
    Calendar view on `/smm`; posts only; a person sees only the months they can already open.
    - **Rules:** `utils/smmCalendar.ts` (pure, tested) — grid, spans, entries (a posted piece on the day
      it went live, late vs missed), words ("Went live 2 days after its planned day"), month summary,
      strip, clients.
    - **Data:** `services/smm.fetchClientMonths` (one on-demand `where clientPhoneId ==`) and
      `hooks/useSmmClientMonths` (live month merged over the read, 5-minute cache, visibility filter;
      no read at all for a member's or salesperson's board).
    - **UI:** `components/smm/calendar/ClientCalendar` + `CalendarDayPanel` + `kindIcons` — toolbar,
      history strip, chips (dots on a phone), hatched non-running days, a "Month N" start marker, a
      day panel with links, keyboard, swipe, reduced-motion-safe transitions.
    - **Wiring:** `SmmCalendar` (now the month-page wrapper; the kind filter spans every month);
      `SmmCalendarBoard` (client list / phone sheet, `?client=`); `SocialMedia` (third view, `?view=`,
      the finished-clients read shared with the Finished tab via `loadFinished`).
  - **Accounts it covers** (owner, mid-task: Edit setup had no way to choose the accounts).
    - **Rules:** `smmPackage.cleanPlatforms` / `itemsForAccounts` / `linksForAccounts`.
    - **Write:** `smm.setMonthPlatforms` (transaction; posted pieces keep their accounts).
    - **Setup:** `MonthSetupInput.platforms` through `applyMonthSetup` / `setupSaleMonth` /
      `setupProblem`.
    - **Form:** `SmmSetupForm` (`SmmSetupValue.platforms`, shared `AccountPicker`); `SmmAddSaleDialog`
      (setting up a recorded sale asks too; the no-sale step's chips are the same control).
  - Tested:
    - New tests: `smmCalendar.test.ts` (17), `smmCalendarUi.test.tsx` (7, the real calendar on the
      in-memory Firestore), `smmAccountsOct05.test.tsx` (9, the real setup dialog and services); +2
      in `smmAddSaleUi.test.tsx` (Calendar view) and its setup-step test extended to the accounts.
    - Totals: `npm run build` ✅; `npx vitest run` ✅ 197 files, 3060 tests;
      `npx tsc -p tsconfig.check.json --noEmit` → only the known VideoCallManager error; eslint clean on the
      new and changed files.
    - Browser harness on fake data (in the scratchpad): overseer and member, 1440 / 1280 / 390 px,
      dark and light — history paging, strip, chips → panel, keyboard focus across months, a swipe,
      the phone client sheet, the finished clients, Edit setup → Instagram + YouTube saved with the
      unposted pieces moved and the posted ones kept. No console errors, no sideways scroll.
  - Fixed on the way: chip titles clamp to two lines; a full-width month band (heavy orange lines) was
      replaced by a start marker; the phone client header wraps instead of squeezing the name.
  - Not covered: live Firebase.

- **2026-10-04: CLAUDE.md split into a short core, module files that load by path, and this
  history** (CLAUDE.md Context map, §29.21, §30, §32–§34). The owner approved the recommended split
  ("take the world's best solution"). CLAUDE.md had grown to ~2,450 lines / ~208 KB, roughly 50k tokens
  in every session, and the owner's workflow rules sat ~1,900 lines down. The Claude Code docs
  recommend under 200 lines and say long files reduce how well the rules are followed.
  - **The new core** (~360 lines, ~28 KB): a header with the quick start, a Context map, §1, §28–§30,
    §32–§34.
  - **Eleven `.claude/rules/*.md` files** with `paths:` globs, loaded by Claude Code only when a
    matching file is read or edited: architecture, backend-security, data-model, roles-routes,
    sales, orders-work, smm, ai-ads, ai-accounts, chat, people.
  - **§31** moved here.
  - Section numbers are unchanged, so every "§17.2"-style reference still resolves through the map.
    Each module file carries its own §9 entries and its share of the §24 rules and §25 / §27 status
    and risk bullets.
  - §29.21 now defines the three-part context and caps the core. §30 steps 1 and 8 say which file
    to read and which to update; `/dev` was updated to match.

  Done by script, with no rewording: sections, §9 entries and bullets were moved verbatim. A second
  script confirmed that every non-blank line of the old file is in one of the new files; the only
  exceptions are the 16 lines of the old header, which was replaced. Every glob was checked against
  the repo's files. The other session working in this tree (SMM dashboard) had finished its CLAUDE.md
  edits first, and they were carried over.

- **2026-10-04 (later still): one clear card per client** (§9.9, §10, §22, §24). The owner's verdict on
  the Overview charts: not easy to understand the work progress and status — they wanted each SMM month
  clear in a single card. The cards are now the default view of `/smm`: each says a status in everyday
  words with its reason (Off track · At risk · On track · Completed · Not started · Needs setup —
  `utils/smmGlance.ts`), carries a status-coloured stripe, draws every promised post as one ring of five
  named buckets with "6/16 posted" in the middle, then each kind's bar, the days left and the next post;
  the board above is a row of status counts that filter the cards, worst first. The same glance heads the
  month's page; the content table's chips use the same colours. The charts stay as **Insights**, one
  switch away. Fixed on the way: the team initials and the next-post row vanished in dark mode (the dark
  "muted" colour equals the card), white words on amber buttons, and the month page's legend stretched
  across the page. Verified: build ✅, vitest 194 files / 3025 tests ✅ (new `smmGlance.test.ts`; the board
  tests now cover status words, worst-first order, status filters and the Insights switch), typecheck 1
  known error; a throwaway harness outside the repo (real `/smm` and month pages on `memoryFirestore`, 12
  seeded months; deleted after) ran 19 checks at 1440 and 390 px, dark and light — default cards, worst
  first, every status filter's count matches its cards, search, Insights and back, card → month, a
  salesperson's own months with Renew — no console errors, no horizontal scroll. Not run against live
  Firebase.

- **2026-10-04 (later): Social Media Overview dashboard** (§9.9, §11, §19, §22). The owner asked for
  "the world's best" visual dashboard for Social Media Management — clean, minimal, premium — after the
  2026-10-03 board (tiles + cards) still had to be read card by card. `/smm` now opens on **Overview**:
  a Delivered hero (meter with today's target), six tiles that open the pile they count, a **pace
  matrix** (every client by month gone × posted, against the even-pace diagonal), the stage pipeline, a
  posting calendar stacked by stage, clients worst first as bullet charts, a renewals runway with ₹, team
  load and ads — the board is the **Clients** view. All numbers in a new pure `utils/smmDashboard.ts`,
  drawn in hand-made SVG (`components/smm/dashboard/*`), following the dataviz method: stage colours
  validated (CVD + normal-vision separation for every neighbouring pair, both themes) as `--viz-*`
  tokens; text never in a data colour; legend or table behind every chart; hover and keyboard tooltips.
  Found and fixed on the way: "Approved" was the brand orange beside the amber of "with the client" and
  the red of "late" — the whole section (cards, timeline, popup, chips) now uses the validated scale, with
  late also a diamond; chip and pace texts were amber-on-white (unreadable) and are now in the text
  colour; the month's Report tab (orange progress bars) uses the dashboard's parts; `ProgressBar` and
  `SmmBoardStats` removed as unused. Verified: build ✅, vitest 193 files / 3014 tests ✅ (31 new in
  `smmDashboard.test.ts` and `smmDashboardUi.test.tsx`; the board test now opens the Clients view),
  typecheck 1 known error; a throwaway harness outside the repo (the real `/smm` and month pages on
  `memoryFirestore` with 12 seeded months; deleted after) ran 13 checks at 1440 and 390 px, dark and light
  — tooltips, tile → Clients tab, table view, member filter, a salesperson's own view, the month report —
  no console errors, no horizontal scroll. Not run against live Firebase.

- **2026-10-04: one source of instructions, read at start-up without being asked** (§6, §29, §30,
  §34). The owner kept two files — CLAUDE.md (loaded into every session) and `claude-agent-prompt.md`
  (an "investigate & fix" prompt pasted by hand) — and asked for an agent that reads them first on
  every task. The prompt file mixed two things: standing rules (root-cause fixes only, break nothing,
  100% with zero errors, restate the task first, test in a real browser, loop, list improvements
  without implementing them, a report with steps for the owner to verify), which applied only when
  pasted; and a per-task slot. It also told agents to log sessions in `docs/AI-MEMORY.md`, which §29.21
  forbids. The rules were merged into §30, which now opens with the three non-negotiables and steps
  0–9, and the quick start states them. The prompt file was deleted, and its task slot became
  `.claude/skills/dev/SKILL.md` (`/dev <task>`, user-invoked only, pointing back to §30).
  `.claude/settings.json` adds a SessionStart hook (startup, resume, /clear, compaction) that runs
  `.claude/hooks/session-start.cjs`. It prints the branch, the number of uncommitted files (a sign of
  a parallel session) and the commits behind origin/main, plus `HANDOFF.md` in full when it exists. Before
  this, §34's "read HANDOFF.md first" relied on the agent remembering to. All of it is committed in the
  repo, so cloud sessions get the same skill. Verified: the hook was pipe-tested under Git Bash with
  and without a `HANDOFF.md` and from another directory (exit 0, correct output); the settings
  parse. The hook goes live in the next session (or after `/hooks`). No app code changed.

- **2026-10-04 (later): the Drive card appears instantly, fits the screen, and is a solid card** (§9.6,
  §24). The owner saw the Drive step arrive a little late after Mark complete and asked for it at once,
  as a fitted, strong card. Cause: the card opened only after `useCompleteWork` returned — six writes in
  a row (job, assigner alert, team-leader alerts, order, chat lock, client record). Now
  `useDriveUploadStep.submit` opens it first and runs the completion behind it; `complete` gained
  `onSaved` (fired after the job's own write) so the card can say "Submitting…" → "Video submitted"
  truthfully, with "Not submitted yet" + Try again on failure, and a follow-up failure after the save no
  longer tells the member their work was not submitted. The session time is handed to `complete` and
  the studio's close no longer records it a second time. The card: centred on every width, max-width
  440 px, green top band, compact steps, no close on a backdrop tap. Verified: build ✅, vitest 191 files
  / 2983 tests ✅ (6 new in `driveStepInstant.test.tsx`, the job's write held open to prove the card is
  there first), typecheck 1 known error; a throwaway CDP harness outside the repo (the real card through
  the real hook, a fake 1.5 s save; deleted after) ran 19 checks — on screen 41 ms after the tap at 390 px
  and 6 ms at 1440 px, fits 360×640 / 375×667 / 390×844 / 412×915 / 1440×900 with no inner scroll, failure
  → Try again, backdrop tap keeps it, no console errors.

- **2026-10-04: social-media months out of My Work, into Social Media** (§9.6, §9.9, §24). The owner
  asked that a tech member's My Work stop showing social media, with all of it in the Social Media
  page, and that anything on My Work not needed be removed. The month's job card is the month's only
  way into the AI studio (code, credits, time, completion), so it was moved, not dropped: My Work and
  Recent Ads filter it out (`isSmmMonthJob`) — with it went the "each video" label and the "Month plan
  →" link — and the month page gained `SmmMyJobPanel`, whose buttons use My Work's existing `?open=`
  (new) / `?chat=` links with `back=`, so there is still one studio and one completion flow; closing
  any of it returns to the month (`useDriveUploadStep({ onClosed })` for the Drive step). Kept on My
  Work because bulk orders use them: the shared progress panel, pinning and the "who does what"
  labels. The month's assignment alert now opens the month, and a withdrawal opens `/smm`. Verified:
  build ✅, vitest 190 files / 2977 tests ✅ (13 new in `smmOutOfMyWork.test.tsx`, 2 link checks in
  `smmSetupOct03`), typecheck 1 known error; a throwaway CDP harness outside the repo (real My Work and
  month page on `memoryFirestore`, the real studio and code box; deleted after) ran 22 checks at 1440 /
  390 px — My Work without the month, the panel, Start → code → studio → Close back on the month as "In
  progress", chat there and back — no console errors, no horizontal scroll.

- **2026-10-03 (later): the Drive step after a job is handed in** (§9.6, §16, §24). The owner asked that
  the member's own Drive link appear the moment a video is marked complete. The real problem: uploading
  was one tick at check-out for the whole day, when several `VID_…mp4` files had to be matched to Day /
  clip-count folders from memory — files went missing or into the wrong folder, and work not in the
  Drive is not counted. Now `DriveUploadSheet` opens on every hand-in (My Work, Recent Ads) with three
  steps (open your folder · go to this folder · upload it with this name), one-tap copies, the next step
  always the loudest button, and "It's uploaded" stamped on the job (`driveUploadedAt/Path/FileName`,
  `services/workDrive`); "Upload later" leaves a strip at the top of both pages and a button on the job;
  check-out lists today's jobs in / not in the Drive; no Drive link → one tap asks the tech admin.
  `useCompleteWork` clears the mark on every hand-in. Verified: build ✅, vitest 189 files / 2964 tests
  (16 new in `driveUploadStep.test.tsx`, 1 in `recentAdsComplete`; one unrelated `aiPlatformInputs` test
  timed out once under the full run's load and passes alone), typecheck 1 known error; a throwaway CDP
  harness outside the repo (real sheet / strip / chips, faked auth and writes, deleted after) ran 31
  checks at 1440 / 1280 / 390 px, dark and light — no horizontal scroll, no console errors.
- **2026-10-03 (later): SMM — a month that had no sale** (§9.9, §24, §8.2). The owner had run SMM for
  some clients before the app recorded sales and wanted them in it — client number, salesperson, the
  rest set up by hand — shown in the salesperson's login with from/to dates, NOT in revenue or
  commission, and tracked normally from the next month. Built as `origin: "no_sale"` months (no order,
  amount 0, `soldBy` = the salesperson) added from Add SMM sale (`smmSetup.addNoSaleMonth`), with clash
  rules so one can never stand in for a recorded sale (overlap, a deleted sale's dates, any month after
  a sale) or a future month; the salesperson's Renew makes month 2 a sale. Orderless months now get job
  cards sharing one client chat on the month id (`orderChat.joinMonthRoom`, `createWorkAssignment`
  `roomId`/`soldBy`) and never adopt the client's waiting sale by phone (the test was mutation-checked).
  Found and fixed on the way: a renewed month's jobs read "23h 59m left" (the sale form's promise) —
  `linkRenewal` now sets the month's deadline first (`monthPromise` moved to `services/smm`); and every
  edit or approval of a sale wrote its promise back over an order's month deadline or a used extension
  — `upsertOrderForSale` keeps both. Verified: build ✅, vitest 189 files / 2964 tests ✅ (14 new in
  `smmNoSaleOct03`, 3 in `smmAddSaleUi`), typecheck 1 known error; a throwaway CDP harness (real board,
  month page, My Leads and My Work on `memoryFirestore`, deleted after) ran 37 checks at 1440 / 390 px —
  add, refusals, history, the salesperson's view, the renewal as a sale with the month's deadline, My
  Work — no console errors, no horizontal scroll. Built alongside a parallel session in the same tree
  (the renewal popup, then a Drive-upload step), files split by message.
- **2026-10-03 (later): SMM renewal countdown popup for the salesperson** (§9.9, §24). The owner asked
  that, from three days before a month's renewal date, the salesperson who made the sale gets a popup
  like a work report — the month's work status, report and timeline drawn clearly — counting down
  3 days, 2 days, 1 day to renewal. New `SmmRenewalPopup` (lazy, in `AppLayout`, sales members only;
  reuses the seller's scoped `useSmmCampaigns` query, which the dashboard card shares) and pure rules
  in `utils/smmPackage` (`daysToRenewal` counts to the end date — `daysLeftInCycle` counts today and
  read "3 days left" under a "2 days to renewal" countdown, so the popup draws its own timeline labels).
  The month page opens on `?tab=report`. Shown on the renewal day too; not after it. Verified: build ✅
  (popup chunk ≈12 KB), vitest 187 files / 2930 tests ✅ (13 new in `smmRenewalPopup.test.tsx`),
  typecheck 1 known error; a throwaway CDP harness (real popup, faked auth and months, outside the repo,
  deleted after) ran 25 checks at 1440 / 1280 / 412 / 390 px, dark and light — countdown at 3 / 1 / 0
  days, nothing at 4, paging, Later, Full report, Renew, no horizontal scroll, no console errors.
  Built alongside a parallel session's SMM "month with no sale" work in the same tree (files split).
- **2026-10-03: SMM — every month is a sale; setup, renewal by the salesperson, visual board** (§9.9,
  §24). The owner re-created old SMM months from the tech side and needed: a sale recorded for the
  salesperson who made it (counting in their login and commission), old deleted months set up again
  without a second sale, a month that ends on the same date next month, clips per video, assignment
  that reaches My Work, team-leader delete, renewal only by the salesperson, and a clear board.
  Found and fixed on the way: the Orders split dialog gave the AI studio the number of VIDEOS in the
  month as each video's clip count (a Pro month locked every video to 8 clips) and duplicated job cards
  on every re-split; assigning on the month page created no job and told nobody; "They renewed" linked
  nothing; overseers' Finished tab was always empty; seller renewal reminders were never shown; cards
  said "Last day" the day after a month ended; Renew/upsell links opened My Leads on a lead hidden by
  the "today" filter (now brought into view); a sale's chat room now opens before its month (a
  renewal's auto-assigned jobs join it). Verified: build ✅, vitest 186 files / 2910 tests ✅ (new:
  `smmPackage`, `smmSetupOct03` on memoryFirestore, `smmAddSaleUi`), typecheck 1 known error; a
  throwaway CDP harness (real SMM pages, My Leads and My Work on memoryFirestore, deleted after) ran 35
  checks at 1440 / 390 px across tech admin, team leader, salesperson and member — all passing, no
  console errors (43 after the same-day rename / counts / undo follow-up). Not run against live Firebase.
- **2026-10-02: this machine's `main` merged with origin/main; the parallel Flow module dropped** —
  a local session had built a second implementation of the same request on top of `eb2c3ff`
  (Flow Accounts: `components/flow/*`, `pages/shared/FlowAccounts.tsx`, `services|utils|types/
  flowAccounts`, `hooks/useFlowAccounts`, and a credit step inside `AIPlatformApp`; commit `346c7f0`).
  Following the owner's choice recorded in `b260745`, every overlapping file was resolved to
  origin/main's version and that module was removed — it stays in history at `346c7f0`. Git had
  auto-merged its credit step into `AIPlatformApp` WITHOUT a conflict, next to `useCreditGate` in My
  Work / Recent Ads: members would have been asked twice and the build would have broken. The merged
  tree equals origin/main apart from this file. Verified after the merge: build ✅, vitest 183 files /
  2873 tests ✅, typecheck 1 known error, `api/*` parse with esbuild.
- **2026-10-01 (later): Social Media Management — delete, the Social Media Team Lead, typed extra
  work** — (1) months can be deleted (main admin, tech admin, team lead): a direct month outright, a
  sold month as a `deleted` tombstone that `ensureCampaignForOrder` never revives. (2) The existing
  `smmLeader` flag (a hard-to-find icon in My Team's table) became the **Social Media Team Lead**: a
  panel at the top of `/smm` where the tech admin / main admin appoints or removes them
  (`SmmTeamLeadPanel`, `setSmmTeamLead`, `watchSmmTeamLeads`), notified on appointment and on every
  newly sold month (`smm_new_month`), with delete added to their powers. (3) The top bar no longer shows
  a month's order id (`o_Uwng…_1790…`) — it reads "Social Media / <business>" (`Topbar.looksLikeId`;
  any unresolved id segment is left out). (4) Extra work is chosen from a list (poster / promotional /
  wishes / cinematic video + duration); fixed on the way: it was added via `addItems`, which never told
  the seller although the toast said it had. Verified: build ✅, vitest 183 files / 2873 tests ✅ (8 new
  in `smmManageOct01`), typecheck 1 known error; a throwaway Playwright harness (real SMM pages + real
  Topbar on `memoryFirestore`, deleted after) ran 16 checks at 1440 / 390 px — appoint + notify,
  breadcrumb, extra work saved and shown, delete → tombstone → gone from the list, member / team-leader
  permissions — all passing, no console errors, no horizontal scroll.

- **2026-10-01: six AdGen faults fixed at their cause, and the AI Accounts module** —
  (1) *Unrealistic videos* (people walking over tables and cupboards, toward the camera onto the road,
  the shop extended): every Veo prompt now animates its own frame — it opens with THE ATTACHED FRAME
  (`frameSummaryOf` the clip's frame prompt) and a FRAME BOUNDARY rule; walk-and-talk and every move
  that shows space beyond the still (pull back, dolly out, crane, pedestal, orbit, arc, pan, tilt,
  truck, follow tracking) are retired, leaving push-in, rack focus, float and locked; director text
  that walks, climbs or reveals is discarded; the negatives name each fault. Different places in one
  shop come from different FRAMES. (2) *Motu & Patlu growing*: a drawn pair is filmed on a locked frame
  or a rack focus only, every approach is stripped (`withoutApproach`), and a scale anchor (their
  height against a 90 cm counter) is stamped on every frame and opens the scale lock. (3) *Client
  photos changed*: each store/office photo is a background plate — kept exactly, only enhanced to 8K,
  the cast placed into it; the photos are attached to the frame writer and reused round-robin instead
  of an invented zone. (4) *Human duos weaker than Motu & Patlu*: the writer, repair and frame requests
  no longer call every pack a cartoon (`packAdKind`), role-label casts are never asked to say their
  labels, and a deterministic cast sheet (`utils/castSheet`) fixes each invented person's face and
  outfit across clips; Veo names speakers by how they look. (5) *Kids*: three packs (two girls, two
  boys, girl & boy) in the sale form, Work Assign and the studio, with child voices, kid attire and
  family-safe negatives. (6) *Address*: the last clip says the verified address in spoken form; no
  clip may invent one. Then **AI Accounts** (§9.21): Flow accounts (email, password, login phone,
  creation date → expiry), the 30-by-29-October target, credits per clip length, the mandatory credit
  step before Mark Complete, "using now" and splitting an ad across accounts, assignment with
  who-moved-what history, live editable usage, the admin overview and calculator, and the paid
  ChatGPT / Grok logins — tech admin and team leaders manage everything. New collections and rules
  (§13, `docs/firestore-rules.md`, where the catch-all no longer covers them). Verified: build ✅,
  vitest 182 files / 2865 tests ✅ (new: `adPipelineEndToEnd`, `humanDuoKidsOct01`, `spokenAddress`,
  `flowCredits`, `aiAccountsFlow`; `recentAdsComplete` now goes through the credit step), typecheck 1
  known error; a throwaway Playwright harness (the real pages and the real studio's Mark Complete on
  `memoryFirestore`, deleted after) ran 92 checks at 1440 / 412 / 390 px and 1680 / 390 px — totals,
  add / duplicate / validation, assign + notifications, disable, history, edit and delete credits,
  paid assign + password, settings, using-now, the credit dialog over the studio — all passing with no
  console errors and no horizontal scroll. Found and fixed on the way: a credit dialog opened before
  the accounts loaded kept an empty account; the assign dialog could lose a pick on a live update;
  account history could drop a concurrent event (now `arrayUnion`); a job handed in again offered its
  whole clip count again; settings accepted 0; a creation date could move away from recorded credits;
  and five phone/desktop layout faults. Nothing was run against live Gemini, Veo or Flow. *Merged with `main` (PR #1):* `main` had meanwhile gained a parallel version of the same work
  (`eb2c3ff`: its own motion/duo/Kids/address prompts and an unrouted Flow-accounts module —
  `services/flowAccounts`, `components/flow`, `flow_credit_logs` — writing `flow_accounts` in a
  different shape). The owner chose this branch's version: the conflicted files, the catalogue and
  the Flow module are this branch's; kept from `main` are the optional `dialogueFormat` children's
  word budget and final-clip slack, the `scriptQa` address field and the sales-message attire line.
  `main`'s `api/send-notification.ts` had stray editor text before its first import (a broken
  function); this branch's copy replaced it.

- **2026-09-29: generation made ~2× faster, measured live** — a live 4-clip Telugu run took 129 s (plus
  the B-roll/overlay tail) in 13 strictly sequential calls, 20,693 thinking tokens against 6,736 of
  output. Now ~70–90 s with B-roll and overlays included; a Motu & Patlu ad 161 s → 108 s with a better
  script (5.4 → 7.4). (1) **Thinking budgets** per call (`effort`: fast 0 / standard 768 / deep 1536,
  26 pipeline call sites) — thinking tokens down ~60%. (2) **Overlaps**: poster after extraction, photo
  scout during the script, a scene plan per draft during the gate, B-roll and overlays inside the run
  (`extras`). (3) **Gate**: judge first — the review runs only for a polish; extra drafts written in
  parallel with a 60 s deadline. (4) **Keys**: round-robin across usable keys, dead (invalid/expired/
  leaked) keys skipped with no wait and remembered for a day, 429 keys rested (30 min for a daily limit),
  last good key kept. (5) **Images** downscaled to 2048 px once per file before upload (checked in
  Chrome: 11.7 MB → 1.6 MB, cached). Verified: vitest 177 files / 2796 tests ✅ (5 new, fake SDK),
  build ✅, typecheck 1 known error; three live runs. Found: nine of the thirty keys are invalid or
  "reported as leaked" (§26).

- **2026-09-25 (later): AdGen integrity batch — eight faults, each traced to its cause** —
  (1) *Spec edits not reaching the member*: reopening a job re-loaded its last kit and that restore
  wrote the kit's old attire, gender, ratio, language, pack, festival and background back over the
  job's spec, into fields locked as "Fixed by assignment". The job's spec is now one util
  (`utils/assignmentFormSpec`) applied on open, on change and on top of every restore; a stale kit
  says what changed. The three edit dialogs gained the occasion and the brief (`AssignmentBriefFields`;
  `categoryDependentPatch` now writes `festival` for ads), the brief carries the business name and
  client's notes, and a corrected brief reaches an edited BUSINESS CONTENT box. (2) *Fake contact
  details*: every number and address came from the extraction model's JSON unchecked — now
  `utils/businessFacts` verifies it against what was typed or could be read, rewrites the profile to
  only those facts, lays out 1–3 numbers, and scrubs unverified numbers from posters, concepts,
  overlays and refines; the old unverified readers were deleted. (3) *Motu & Patlu growing*: the pair
  was filmed with dolly/push/crane/pedestal/orbit/low-angle moves and speaker push-ins, and the
  negatives forbade a steady camera — a pair is now filmed from a fixed distance at eye level
  (`DUO_SAFE_MOVES`), speaker focus moves only the focus, scale-changing beats are refused. (4) *Final
  script*: `FinalScriptPanel` rewrites 5 · 6 · 7 from a pasted script with per-section progress. (5)
  *Completed but missing*: the post-run auto-load race (above) is gone, rows are always drawn with a
  state and their own Generate, missing frames are written not copied, and a failed poster no longer
  fails the run. (6) *Pale video*: `COLOUR_LOCK` + negatives + no light-changing scene life. (7) *Which
  ad*: the job strip. (8) *Script quality*: the separate quality gate with automatic polish / rewrite
  and the educated-speaker register in the writer rules. Also fixed two regexes an earlier edit had
  stripped of backslashes (`/whatss*app/`, the header initials split). New optional field only:
  `ai_generations.scriptQa`. Verified: build ✅, vitest 176 files / 2784 tests ✅ (56 new, 5 changed to
  the new behaviour), typecheck 1 known error, and a throwaway CDP harness (Gemini + Firestore faked,
  deleted after) walked idle → run → missing poster Generate → final script → phone width with no
  console errors and no horizontal scroll. Nothing run against live Gemini or Veo.
  *Follow-up, same day:* the final-script entry moved from the Deliverables header INTO row 4 as the
  highlighted "Input Final Script" strip (visible with the row shut; `OutputSection` gained a `footer`
  slot), with a three-step guide, "Load current script" and a copyable ChatGPT / Gemini instruction.
  Vitest 2787 ✅; a CDP harness checked 1680px and 390px (no overflow). The owner's commit `b781037`
  captured that throwaway harness (`verify.html`, `vite.verify.config.ts`, `src/__verify__/*`); it is
  deleted again and the deletion belongs in the next commit.
  *Follow-up: English ads in Indian English.* English ads were voiced by Veo in a British/American
  accent because the prompt said only "speaking English". `speechAccentFor` now puts "Indian English with
  a natural Andhra Pradesh accent" in the opening line, a VOICE AND ACCENT block, every spoken line and
  the negatives; the English writer rules, language directive and quality gate ask for Indian English
  (rupees, Indian places, no American/British slang). Telugu and other languages unchanged. Vitest
  176 files / 2791 tests ✅, build ✅, typecheck 1 known error. No live Veo run.

- **2026-09-23: a two-hander's video prompts lost one speaker** — `utils/dialogueFormat`'s speaker
  label was matched as a single WORD, so any character whose NAME contains a space was unreadable in
  the DISPLAY form (`[Chhota Bheem]: …`). Generation was unaffected (the model writes the canonical
  `0-8|bheem:` form, keyed on single-word keys), but `voiceOverScript` is stored in the display form
  and re-read to build the Veo prompts, so **Chhota Bheem & Chutki reached the video prompts with
  only Chutki's half of each clip, Ben 10 & Grandpa Max with no dialogue at all**, and the solo
  Business Owner / Custom Character / Chosen Deity / Mickey Mouse packs with no spoken line. The
  label now accepts multi-word names (`LABEL`, `labelKey`), and `parseDialogueClips` takes a
  `SpeakerVocabulary` — plain aliases as before, or the pack's `{key, name}` speakers — so
  `[Chhota Bheem]` resolves to the key `bheem` that validation, frames, Veo and name spellings all
  read. `geminiService` passes `packSpeakers(pack)` at all four call sites. Also fixes: refining such
  an ad's voice-over, and a member pasting a correctly labelled two-person script being told it
  needed speaker lines. Verified: build ✅, vitest 171 files / 2720 tests ✅ (8 new, incl. a
  round-trip over the whole catalogue and an end-to-end Veo assembly for Bheem & Chutki), typecheck
  1 known error. No live Gemini or Veo run.
- **2026-09-25 (later): the workspace band** — the four blocks above the deliverables were taking a
  third of the first screen for things a member reads once or never. Finished, **Generation Status is
  one 50px line** (title and sentence share it; the five milestone ticks are dropped, since they only
  repeat what "Completed" says — the full stepper stays while a run is going, where it is the useful
  thing on the screen). The **AI Guide strip, the ChatGPT/Gemini link, Open Video Generation Platform
  and "What we understood"** became one 46px `ag-bar` of small buttons, with the understanding panel
  opening under the band instead of being a card of its own. Same handlers, same links, same test
  hooks (`ai-guide-button`, `run-understanding-toggle`, `run-understanding`). Measured in the harness:
  Deliverables now start 255px down instead of ~535px, and all seven rows fit one 1680×1050 screen.
- **2026-09-25 (later): "mariyu" on the page, and a duo that stops saying its own labels** — two
  faults from a delivered ad. (1) The script still showed **మరియు** and the Veo prompt carried a
  `PRONUNCIATION` line; the team reads the script aloud and wants the one Latin spelling **on the
  page**. `FIXED_WORDS` now normalises the Telugu word and every misspelling TO `mariyu`,
  `pronunciationNotes` is gone from the Veo prompt (replaced by `fixedWordsIn`, test-only), the
  writer rule asks for the Latin form, and `withoutFixedWords` keeps the validator's "no Latin in
  spoken content" rule from reporting it. (2) A **Male & Female duo** was cast as "Friend"/"Host" —
  which says nothing about who is who — and, worse, the two people addressed each other by those
  labels out loud ("హోస్ట్, ఈ కిట్స్‌తో…"), which reads like a template nobody finished. The mixed duo is
  now **Girl & Boy** (keys `girl`/`boy`, its style and script directives updated), every human cast
  character carries `labelSpellings` (how its label would be written if spoken), and
  `validateDialogueClips` takes `forbiddenNames` so a spoken label is a per-clip issue the repair
  pass fixes — the prompt had forbidden it since the packs were written, but nothing checked it.
  Verified: build ✅, vitest 171 files / 2728 tests ✅ (4 new), typecheck 1 known error. No live
  Gemini or Veo run.
- **2026-09-25: AdGen.ai batch — density, the two extras, and five faults**
  *UI.* The header is one row that never wraps at any width (every block `whitespace-nowrap shrink-0`,
  only the business name truncates; the member chip and the job chip drop out below 2xl). Generation
  Status is ~40% shorter (one status line instead of two, 36px milestone nodes, the progress bar gone
  once it reads 100%) and the AI Guide ~35% (`ag-row--tight`, 56px strip), so both fit the first
  screen. Deliverables 6 and 7 became ordinary `OutputSection` rows through a new `actions` slot that
  carries their theme picker and Generate button, so all seven rows are one height and open only when
  asked. "What we understood" (voice brief + background plan) folded into its own 56px expander above
  the Deliverables card, and the Flow link is a normal button.
  *Behaviour.* **B-roll and overlay images are now generated with the kit** — `handleGenerate` runs
  both existing handlers against the run's own result (they take an optional `source` because state
  is not committed yet); the buttons remain as Regenerate. **The first run's "wrong business" output
  is stopped at the source**: a run is refused while `useAssignmentBrief` is still fetching the order
  (the Start button says "Loading the brief…"), and refused outright when nothing describes the
  business — no BUSINESS CONTENT and no card, store, product, flyer or voice file — which is what made
  the model invent one. The brief also now follows a job that is corrected later, replacing the text
  it previously wrote (never a member's own writing). **A two-hander never walks toward the lens**
  (`planClipMotion`, like a deity): a character arriving nearer the camera is what let the video model
  re-proportion the pair, and a new `scaleLock()` block opens every duo prompt naming both characters,
  with matching negatives — this is the height-drift fault. The pasted-script hint is now built per
  special category (two speakers / one named speaker / plain clips) with a Copy format button, since
  final scripts are written in ChatGPT or Gemini and pasted back. `FIXED_WORDS` catches more మరియు
  spellings, including spaced and half-transliterated forms. The client's chat message names the
  festival a wishes video is for (`buildClientChatMessage`, five call sites).
  Verified: build ✅, vitest 171 files / 2724 tests ✅ (4 new), typecheck 1 known error, and a
  throwaway CDP harness walked idle → generating → completed at 1680px and measured the header at
  1024/1280/1440/1590px (72px, one line, no overflow). Nothing run against live Gemini or Veo.
- **2026-09-24: AdGen.ai laid out as one screen** — the studio rebuilt to the owner's three-stage
  reference: a fixed 72px header, a 34% input panel and a 66% workspace, with nothing below the fold
  that matters. LEFT: Assets & Files and Configuration became two sections sharing one space — the
  one that opens takes the room the other gives back (`leftPanel` + the `.ag-morph` grid-row
  transition, 280ms) — so reaching the duration no longer means scrolling past every upload slot; shut,
  Assets is a six-tile summary of what has been given to the run and Configuration reads back the
  run's own settings. Start/Stop moved below both, and a run now shuts both panels. RIGHT: the
  "Generated Ad Kit" hero was dropped; Generation Status became a card with the five milestones
  (`MissionStepper`, exported from MissionWorkspace so the card and the guide can never disagree —
  both read `missionStages()`), the Mission Workspace became the **AI Guide** card the reference asks
  for (numbered rows, each with its own Tab/Open Flow button, countdown compact in the header), and
  once the first asset lands it folds into a 72px strip above the Deliverables card — seven numbered
  72px rows, each with an icon, a one-line subtitle and its existing controls. Project History moved
  into the header, main-frame quick-copy chips now say "Tab 1" like the guide does, and the two
  always-open panels (B-roll, overlay images) took the same row anatomy. New in adgen.css: `ag-sec`,
  `ag-morph`, `ag-ico`, `ag-tile-up`, `ag-steps`/`ag-stepnode`, `ag-row`, `ag-strip`; canvas retuned to
  #030B1A / #07152B. **No handler, prop, state, route or generated output changed** — one deliverable
  heading now renders its number as the row badge ("2. Video Bottom Label"), which is the only string
  that moved. Verified: build ✅, vitest 171 files / 2720 tests ✅, typecheck 1 known error, and a
  throwaway browser harness (headless Chrome over CDP, Gemini faked, deleted after) walked idle →
  configuration morph → generating → completed at 1680px and 390px, confirming all seven deliverables
  in order and no horizontal scroll.
- **2026-09-23: AdGen.ai studio UI, taken live** — the design (dark luxury SaaS: #020617 canvas,
  glass cards, violet→blue→cyan accent, Space Grotesk + Inter) implemented in the real platform, not
  a mock-up. New `src/components/ai-platform/adgen.css` holds the whole system (§11); `index.html`
  loads the two fonts. `AIPlatformApp` gained the 72px glass nav with the run-state chip, the
  "Generated Ad Kit" hero with History/Save, a `max-w-[1520px]` two-column grid whose welcome panel
  is sticky, a system status card with the shimmering progress track, and `ag-acc` accordions for
  every output section. `FileUpload` drop zones now carry rest/over/owner/refused states,
  `GeneratedCard` became a panel with a mono prompt body and a `ag-codebar` toolbar,
  `MissionWorkspace` got the stage rail, checklist steps and countdown in system type, and
  `SavedItems` / `PosterConceptsPanel` follow. A mechanical pass retuned 147 slate-700/800/900
  surfaces across the platform to the glass palette. The studio is dark in every app theme
  (`STUDIO_IS_DARK` + `color-scheme: dark`); `CodeVerificationModal`, which opens outside it, was
  left theme-aware. No handler, prop, data flow, prompt or Firestore shape changed. Verified: build
  ✅, vitest 171 files / 2712 tests ✅, typecheck 1 known error, and a throwaway browser harness
  (headless Chrome over CDP, deleted after) rendered the studio and the generated-asset cards at
  1600px and 390px — no horizontal scroll, tokens and fonts resolving.
- **2026-09-22: AdGen.ai batch (28 items)** — AI platform inputs: BUSINESS CONTENT and FRAME /
  BACKGROUND INSTRUCTIONS boxes, owner image slot, no document uploads (Gemini extraction guidance),
  working drag & drop, voice note understood first (`voiceNote`, `voiceBrief`), custom script word
  for word (`utils/customScript`, wider clip-header parser), human duos (female / male / mixed,
  family `human_duo`) and the Custom Character description in sales, Work Assign and the platform.
  Frames: scene plan (motive + a different background per clip), name board whenever there is no
  logo file, owner-image attach line. Scripts: 15–17 words for two speakers, fixed LEFT/RIGHT
  positions, "speak from inside the business" check, numbers as words and exact మరియు
  (`utils/spokenNumbers`; the ఇంకా swap removed). Motion rebuilt twice in the session — first to
  strictly in place, then (per the owner) to mixed stand / walk-a-few-steps / show-product staging with
  the standard camera vocabulary, speaker focus for duos and no goodbye wave; world and place locks
  kept. Veo refine = plan → JSON edit → check. B-roll shows each line's subject (no presenter, no
  text). Overlay Text Image Generator (`utils/overlayImage`). "VIDEO BOTTOM LABEL" rename with festival
  theme and video context. Check-in prompt skipped on Sundays and holidays. New optional fields only
  (no collections). Verified: build ✅, vitest 171 files / 2712 tests ✅, typecheck 1 known error;
  AI-platform inputs rendered in jsdom with Firebase/Gemini faked; nothing run against live
  Gemini or Veo.
- **2026-09-22: CLAUDE.md created** as the single authoritative context file from a full code
  audit. No application code changed. Baseline: build ✅, vitest 165 files / 2613 tests ✅,
  typecheck 1 known error, eslint 599 problems.
- **2026-09-20:** whitespace-only edit in `accounts-admin/DailyExpenses.tsx`.
- **2026-09-19: Cinematic Ads rebuilt** (`0eb4726`): project list plus `cinematic_projects`
  persistence with autosave, ad-format presets, typed brief inputs, storyboard gate (≤9 panels per
  board), merged Clips step with clip types and camera-move enforcement, cinematic service moved to
  the shared Gemini fallback. `tsconfig.app.json` lost its `ignoreDeprecations` line (so
  `tsc -p tsconfig.app.json` now runs). New rule in `docs/firestore-rules.md`.
- **2026-09-19:** suspense boundary moved inside `AppLayout` (shell stays on screen); deleting an
  order retires its SMM month (`setCampaignRemovedForOrders`); lower-third prompt extracted to
  `prompts/lowerThird.ts`; SMM money trail (`route` direct/via_us, two-leg proofs, `heldByUs`),
  item-dialog fold, inline ad figures; AI upload limits (no video/PDF, ≤10MB); **load time**:
  every page `lazy()`, only `vendor-react` / `vendor-firebase` named chunks.
- **2026-09-18: Social Media Management** section (`smm_campaigns`, `smm_templates`,
  `smmLeader` flag, `/smm` routes, approval gate, derived order progress, direct months,
  reminders in check-in/out, autosaving item dialog, per-platform links). Word-timed overlay cues.
- **2026-09-12: read-quota cut** (352K reads/day incident): team-scoped Leaderboard, session-long
  sales leads/orders stores in AppLayout, `user?.uid` effect keys.
- **2026-09-11: Poster Creation** (`category: "poster"`, poster spec/styles/occasions/concepts),
  business info reaches the assignment and brief, human-pack attire, one-row-per-job generation
  history, generation doc versioning.
- **2026-09-09: sales↔tech workflow batch:** full order capture on the sale (address, business
  info, WhatsApp required), real-vs-AI background on every ad, SMM 2 posts + 2 stories per video,
  sale status chip, upsell ladder, one promise extension, feedback-gated upsell
  (`FeedbackUpsell`), new-order alerts to the tech side, sales admin lands on the leaderboard.
- **2026-08-10 → 08-14:** client chat opens at sale; leave past allowance = absence;
  pay-vs-output; My Clients with upsell; commission shown before earned; incentives in totals.
- **2026-08-02 → 08-04: client order chat** (per-assignment rooms, guest tokens, calls,
  reviews); **hiring link** (`onboarding_invites`, `api/onboarding`); company settings and
  officer signatures; 14 HR document types, references, pagination-based PDF and print, letter
  conventions, internships, training period, role ladders, public badges.
- **2026-07-21 → 07-26:** attendance popup, member dashboard as attendance hub, overlay
  sequencing fix, voice-over quality review pass, assignment ad-spec fields plus locking, sales
  approvals totals, leaderboard month/career, grouped sales nav, sales settlements page,
  notification dedupe, unassign work, phantom-login fix, PWA self-update.
- **2026-07-15:** AI generator batch (male models, name board, attire gating, custom attire,
  language-aware VO, English overlays); tech attendance, employment type, agreements and signing
  gate, deactivation enforcement, reassign work.
- **2026-03 → 2026-06:** initial build of the multi-role app (≈134 commits, mostly unlabelled).

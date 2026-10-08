---
paths:
  - "src/services/{orders,workAssign,workReassign,workVerify,workDrive,bulkVideos}.ts"
  - "src/hooks/{useCompleteWork,useAssignmentBrief,useOrderCategory,useOrdersByIds}.ts"
  - "src/components/work/**"
  - "src/components/tech/**"
  - "src/pages/tech-admin/{Orders,WorkAssign,MemberAssignments,DriveManagement,MemberHistory}.tsx"
  - "src/pages/tech-team-leader/**"
  - "src/pages/tech-member/{MyWork,RecentAds,Dashboard}.tsx"
  - "src/pages/shared/WorkReports.tsx"
  - "src/utils/{orderSort,orderQueue,orderProgress,orderHours,orderCategoryFilter,assignmentEdit,assignmentSpecDiff,assignmentDuration,driveUpload,workUnlock,workDates,bulkVideos,penalty,promiseSla,memberWorkload,memberPicker}.ts"
---

# Orders queue, work assignments, task lifecycle, Drive step — DTS-OS module context

> Part of the project context (CLAUDE.md → Context map). Claude Code loads this file automatically when a
> file matching the `paths:` above is read or edited. Section numbers are CLAUDE.md's originals, so a
> reference such as "§17.2" still points here. Keep it current per CLAUDE.md §30 step 8; the source code wins.

## 9. APPLICATION MODULES (the entries for this module)

**9.5 Orders (sales → tech queue)** ✅. `services/orders.ts`, `pages/tech-admin/Orders.tsx` (shared
with team leader), `components/work/*` (`OrderProgressPanel`, `BulkVideoBoard`, `PenaltyDialog`,
`ExtendPromiseButton`, `DeadlineChip`, `SaleDeletedBanner`). Collection `orders`. See §16.

**9.6 Work assignment (task management)** ✅. `services/workAssign.ts`, `workReassign.ts`,
`workVerify.ts`, `hooks/useCompleteWork.ts`; pages `tech-admin/WorkAssign.tsx` and
`tech-team-leader/WorkAssign.tsx` (**near-duplicates, edit both**), `tech-admin/MemberAssignments.tsx`
and `tech-team-leader/MemberAssignments.tsx` (**near-duplicates**), `tech-member/MyWork.tsx`,
`tech-member/RecentAds.tsx`, `shared/WorkReports.tsx`. Collection `work_assignments`. See §16.
**Drive step (2026-10-03):** the moment a job is handed in (My Work, Recent Ads — `useDriveUploadStep`),
`components/work/DriveUploadSheet` opens: this job's folder (`Name › Month › Day N › 4 Clips`, or `Posters`;
`utils/driveUpload.jobDrivePath`, the day it was finished), a file name (`W123 - Business`, `driveFileName`),
the member's own `users.googleDriveBaseUrl`, and "It's uploaded" (`services/workDrive.markDriveUploaded` →
`driveUploadedAt` / `driveUploadPath` / `driveFileName` on the job; every new hand-in clears them). Folder
names and the file name copy in one tap; the loudest button is always the next step. "Upload later" leaves
`DrivePendingStrip` at the top of both pages and a `DriveUploadChip` on the job; no link set → "Ask my
admin" (`askAdminForDriveFolder`, `drive_folder_missing`, once a day).
**Opens at once (2026-10-04):** `useDriveUploadStep.submit` closes the studio and puts the card on screen the
moment the member submits (after the Flow credit step) — not after `useCompleteWork`'s six writes. The
card says "Submitting your video…" until the JOB is saved (`complete(…, { onSaved })`, the first write),
then "Video submitted" while the follow-ups (alerts, order, chat, client) finish behind it; a failed save
shows "Not submitted yet" + Try again, and "It's uploaded" stays disabled until the job is saved. A
follow-up failing after the save is reported as "Submitted — one follow-up did not finish", never as
"not submitted". The card is centred on every screen, fits a 360×640 phone without scrolling, has a green
top band, and does not close on a tap outside it (X, Escape, Upload later or It's uploaded).
**Social-media months are not in My Work or Recent Ads (2026-10-04):** a month's job card
(`utils/smmPackage.isSmmMonthJob`: SMM category + `smmCampaignId` or `orderId`) is kept out of both
lists, their tiles and counts, and the Drive strip. It is still loaded: the month page's
`SmmMyJobPanel` opens it through My Work's `?open=<jobId>` (studio, behind the code) or `?chat=<jobId>`
links with `back=/smm/<id>` (`monthJobLink`), and closing the studio, the chat, the code box or the
Drive step returns there (`safeMonthReturn`: only a month page).

## 16. TASK MANAGEMENT (work assignments + orders)

"Tasks" in this app are **work assignments** (`work_assignments`), normally created from
**orders**.

**Creation (`createWorkAssignment`, the only path).** Callers are both Work Assign pages and the
Orders queue. Inputs: assignee, category, duration, clip count, price per unit, uniqueId
(`nextWorkUniqueId`: W/P/C/PS/O + sequence), brief and ad spec (pre-filled from the order via
`assignmentFormFromOrder`), optional tracks (SMM split: `ad_creation` / `social_upload` /
`digital_marketing`). Side effects, in order:
1. adopt an unassigned order for the same phone if none was given;
2. **one transaction (2026-10-08):** re-read the order — refuse with `AssignmentRefusedError` when it is
   gone ("This sale was deleted by the salesperson…", `sale_gone`), removed or cancelled (`order_closed`),
   or, for a one-ad order (`takesOneJob`: no progress, not SMM / bulk / tracks), already has a live job
   (`already_assigned`); then write the job (4-digit access code, `orderId`, `saleId`) and the order's
   `assigned` / `workAssignmentId` TOGETHER. An order adopted by phone that is no longer free is simply not
   linked. (Before: `addDoc` the job, then update the order — a job for a sale deleted a moment earlier, or a
   second job for one ad.) Both Work Assign pages and `AssignTracksDialog` show the refusal as a toast; a gone
   or closed order closes the form;
3. attach to the order's chat (or create a chat on the assignment id);
4. notify the assignee (dedupe key, includes the client note);
5. `logTechActivity`.

The page also shows a WhatsApp-ready requirements message (`RequirementsShareModal`). Tech admin
assignment also notifies team leaders.

**Statuses (`WorkAssignmentStatus`):**
| Status | Set by | Meaning / side effects |
|---|---|---|
| `assigned` | `createWorkAssignment`, `reassignWork` | Waiting for the member |
| `in_progress` | Member opens the job (My Work / Recent Ads) from `assigned` or `editing`; also **Undo completion** | Being worked. Sessions (open→close, >5s) accumulate `totalDurationSeconds`. Chat status synced |
| `completed` | Member submits (`useCompleteWork`) — a video job first asks for the Flow credits it used (`useCreditGate`, §9.21) | Notifies the assigner + team leaders (dedupe keys), order → `completed`, chat **locked as delivered** (invites the client review), client record upserted; the job's previous Drive mark cleared. The Drive step is already on screen from the moment of the submit (§9.6) |
| `editing` | Tech admin / team leader "send back" (MemberAssignments, WorkReports) | Order → `assigned`, chat reopened, member notified `work_editing` |
| `verified` | Tech admin / team leader (`verifyAssignments`, bulk or single) | Member notified, chat shows Delivered, `upsertClientOnWorkVerify` (order → `verified`, client works/totals), activity logged |

**Other operations:** `unassignWork` (deletes the assignment; order → `unassigned`; chat kept and
detached; member told) · `reassignWork` (move to another member; resets sessions and completion)
· spec edits (`utils/assignmentEdit.ts`, `assignmentSpecDiff.ts`; the member sees a
`SpecUpdateDialog`). All three edit dialogs (both MemberAssignments pages and Work Reports) also edit
the occasion of a wishes ad and the brief — business info, address, client's notes
(`components/work/AssignmentBriefFields`, `briefPatch`, written whole so a cleared field stays cleared;
`useAssignmentBrief` reads the order only for a field the job never carried). On the member's side the
job's spec is applied by one util (`utils/assignmentFormSpec`) when the job opens, when it changes, and
ON TOP of a reopened kit, so a restored kit can never put an old value back into a locked field; a kit
made for an older spec shows a "made for an earlier version of the job" banner with the differences ·
**a sale edited after assignment (2026-10-08)** → `services/sales.updateSale` writes the job's changed
fields in the same transaction as the sale and order (`utils/saleEdit.jobPatchForSaleEdit`: the
`assignmentFormFromOrder` result before vs after, so the tech side's own edits to other fields stay; a new
package length re-derives clips and rate; SMM month jobs are left to the month) — the member's live
`SpecUpdateDialog` shows it — and a `sale_edited` popup goes to every tech admin, team leader and the job
holder · **a sale with work can no longer be deleted** (the `saleDeleted` banner remains for jobs flagged
before) · sales member **update notes** (`addOrderUpdateNote`) for anything the form has no field for ·
**orders whose sale is gone** (deleted before 2026-10-08 without reaching the tech side) are removed when
Orders or either Work Assign page opens (`services/sales.healOrphanOrdersOnOpen`: unassigned, no job, the
lead gone or provably without the sale — `utils/saleIdentity.leadHoldsSaleOf`; re-checked in a transaction;
once a session; Orders toasts "Queue tidied").

**Priority:** there is **no priority field**. Queue order comes from `utils/orderSort.ts` /
`orderQueue.ts` (deadline and state) and `isPinnedOrder`.

**Deadlines:** `PromiseDeadline` chosen at sale (`presetKey`, `hours`, `startAt` = sale time,
`dueAt`). **One extension** allowed (`canExtendPromise`, `extendOrderPromise` writes the order and
mirrors it onto the assignment, never the sale). `notifyDueOrdersOnOpen` (Orders page open) alerts
the assignee, seller, tech admin and team leaders when a job is near or overdue.

**Multi-deliverable orders:** `OrderProgress` (targets/done counters `ads`, `posters`, `posted`,
`stories`, `campaigns`; tracks and owners; log). Derived from the SMM plan when
`progress.derived`. Bulk orders carry `bulkVideos[]` slots (`n`, owner, status `pending` /
`assigned` / `completed`).

**Penalties:** `addOrderPenalty` (clips × rate, by sales member or tech admin), kept out of
`amount` and commission.

**Comments / attachments:** no per-task comments. Communication goes through the **order chat**
(files, voice, images). Admins attach nothing to the task itself.

**Search / filters:** day filters (Today / Yesterday / N days / date picker), member cards,
category filters (`useOrderCategory`), period filters (`utils/periodFilter.ts`, cycle 10th→9th),
Orders tabs (active / delivered history paged by `ORDER_HISTORY_PAGE = 300` / removed).

**Task dashboards:** tech admin Dashboard, Work Assign (member workload cards,
`MemberWorkloadCard`), Work Done & Reports, member analytics, `AdsStatusBoard`.

## 24. BUSINESS RULES (IMPLEMENTED; verified in code)

- **Orders** are created at **sale time** — approval is not a gate, not even for a discount over 10%
  (2026-10-05, owner); a rejected sale cancels its order; a revoked approval keeps it (marked unapproved).
  Re-verifying never duplicates (idempotent id). A deleted order is never recreated by its sale.
  Progress is seeded once and never re-seeded.
- **One sale, one order, one job (owner, 2026-10-08):** an order is `o_<saleId>`, written in the same
  transaction as its sale; an edit of the sale updates that order (and its job) and never makes another; a
  sale nobody has started is deleted with its order, chat, month and bells; a job is never created for a sale
  that no longer exists, and a one-ad order never gets a second job; a waiting order with no sale behind it
  leaves the queue. Editing a started sale tells the tech admins, the team leaders and the member (popup).
- **The "new order" bell** is one notification per tech admin / team leader (`order_new_<orderId>_<uid>`,
  linking to the queue their role opens) — it was one shared document each recipient's write replaced.
- **Delivery promise:** the countdown starts at the sale; exactly **one extension**, by team
  leader / tech admin / main admin, the assignee or the seller; recorded on the order and
  assignment, never on the sale.
- **Work:** members cannot assign, including to themselves; a job needs its access code once
  per device; completing notifies the assigner and team leaders once per event; verifying
  records the client delivery.
- **Bulk videos:** only tech admin, main admin or team leader assign slots; the owner or those
  roles can tick them done; slot numbers are never renumbered.
- **Drive upload per job (2026-10-03):** every job handed in opens the Drive step at once — the file goes
  in `Name › Month › Day N › <clips> Clips` (posters: `Posters`) of the day it was finished, named
  `<job id> - <business>`. "It's uploaded" is the member's word (the app cannot see a Drive). A job handed
  in again after edits must be uploaded again. Jobs finished before 2026-10-03 are never shown as missing.
  The Drive card appears the instant the job is handed in and only says "submitted" once the job is saved.

## 25. CURRENT IMPLEMENTATION STATUS

**PARTIALLY IMPLEMENTED 🟡:**
- Drive step (2026-10-04): the studio closes as soon as the member submits. If the job's save then
  fails and the member closes the card without Try again, the job stays in progress (they hand it in
  again from My Work) and that studio session's time is not recorded.

**NOT IMPLEMENTED ❌** (referenced or planned, absent in code):
- Task priority field; per-task comments or attachments (chat is used instead).

## 27. POTENTIAL RISKS (need verification)

- The sale transactions (2026-10-08) write `leads`, `orders`, `order_chats`, `smm_campaigns`,
  `work_assignments` and delete other people's `notifications` from the salesperson's browser — fine under the
  catch-all rule; a rule restricting any of those to their owner would make sales fail to save (noted in
  `docs/firestore-rules.md`). Checked by unit tests, service tests on the in-memory Firestore
  (`saleSyncOct08`) and a browser harness on the real pages — not against live Firebase. The on-open orphan
  sweep costs one read per lead of the waiting orders, once a session per browser.

- The per-job Drive mark is a declaration: nothing checks that the file is really in the Drive, and the
  folder trail assumes the team's `Name › Month › Day N › <clips> Clips` layout. Checked by unit tests and
  a browser harness on fake data (1440 / 1280 / 390 px, dark and light) — not against live Firebase or a
  real Drive.

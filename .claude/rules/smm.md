---
paths:
  - "src/**/*smm*"
  - "src/**/*Smm*"
  - "src/components/smm/**"
  - "src/pages/shared/SocialMedia.tsx"
---

# Social Media Management (SMM months, setup, renewal, board) — DTS-OS module context

> Part of the project context (CLAUDE.md → Context map). Claude Code loads this file automatically when a
> file matching the `paths:` above is read or edited. Section numbers are CLAUDE.md's originals, so a
> reference such as "§17.2" still points here. Keep it current per CLAUDE.md §30 step 8; the source code wins.

## 9. APPLICATION MODULES (the entries for this module)

**9.9 Social Media Management (SMM)** ✅. `pages/shared/SocialMedia.tsx` (`/smm`),
`pages/shared/SmmCampaignPage.tsx` (`/smm/:campaignId`), `components/smm/*`, `services/smm.ts`,
`services/smmTemplates.ts`, `utils/smmPlan.ts`, `smmPricing.ts`, `smmMessages.ts`,
`smmReminders.ts`, `hooks/useSmmCampaigns.ts`, `types/smm.ts`. Collections `smm_campaigns` (doc id
= order id, or an auto id for a month with no order; `origin: "sale" | "direct" | "no_sale"`), `smm_templates`. Rules: items cannot go
`scheduled`/`posted` without a recorded client approval (`setItemStatus` throws). Every mutation
runs in a transaction (`mutateCampaign`). The order's progress counters are **derived** from the
plan (`syncOrderProgress`). Budget ledger with `direct`/`via_us` payment routes and two-leg proof.
Due reminders appear in the check-in/check-out screens. Removing an order retires its month.
**2026-10-01:** a month can be **deleted** (`deleteCampaign`, Delete button on the month's page): a
direct month's document is deleted; a sold month becomes a `status: "deleted"` tombstone
(`deletedAt`, `deletedByName`) that lists and the page treat as gone and that `ensureCampaignForOrder`
never revives (unlike `removed`). **Extra work** is added from a form — type Poster / Promotional
video / Wishes video / Cinematic video (`SMM_EXTRA_WORK_TYPES`) and, for a video, a duration
(16/32/48/64 s or other) — stored as `extraType` / `extraDuration` with the title "Promotional video ·
32 sec"; it now goes through `addItem`, which notifies the seller (the old button used `addItems`,
which notified nobody). The top bar's breadcrumb names a month by its business, never its order id.
**2026-10-03 — every month is a sale; setup, renewal, board.** No-sale "Start a month" removed
(`createDirectCampaign` gone; old `origin:"direct"` months still work — their team now gets job cards
too, see the no-sale paragraph below). **Add SMM sale**
(`SmmAddSaleDialog`, `services/smmSetup`): the client's number lists every SMM sale ever recorded on it
(`findSmmSalesForPhone`, any salesperson, legacy `saleDetails` too); a sale already there is **set up,
never sold again** (`setupSaleMonth`: restores a removed order / rebuilds a purged one under the same
id with `announce:false`, replaces a removed/deleted month, original sold date, chains to the
previous month if continuous); dates already over → **history** (status `completed`, order
`verified`, no jobs). Only a number with no SMM sale may get a new sale, recorded through the real
`SaleForm` in `onBehalfOf` mode on the salesperson's own lead (`leadForSeller` → `adminAssignNumber`,
refused while another salesperson holds the number) — their sale, Sales Approvals, existing
commission; `enteredBy` + an "Entered by" chip. **Setup** (`SmmSetupForm`/`SmmSetupDialog`,
`applyMonthSetup`): start → end auto = same date next month (`monthCycle`; that date is the renewal day, the month's own
days end the day before — 2026-10-15 below), `clipsPerVideo` (also on
the sale form; default 4 = 32 s), page links, team → **one assignment path** `services/smmAssign`
(`assignSmmMonth`: one job per person with their tracks, at the month's length, `smmCampaignId`,
idempotent, untouched cards withdrawn, started kept; also used by Orders → Assign jobs); order
deadline = month end (`monthPromise`). **Renewal = the salesperson's sale**: Renew (`useSmmRenewal` →
upsell path → My Leads `?renew=` → `SaleForm renewal`) → `ensureCampaignForOrder` links Month N+1
(start = the sale's "Month starts on", else the old end date — 2026-10-15; team/clips/page links copied, jobs
auto-created, tech side told); the old month closes on its renewal day (`closeEndedMonthsOnOpen`, on board open). Unposted pieces
can be moved forward (`moveUnpostedToMonth`). **Board** (the Clients view since 2026-10-04): tabs Needs setup /
Running / Needs attention / Renewals / Finished (on-demand), member/seller filters, cards and month
header drawn by `SmmVisuals` (timeline with post dots, one block per piece, `PaceChip`), Content
List/Calendar (`SmmCalendar`); salesperson dashboard `SmmRenewalsCard`; for a tech member, **"Your work on this month"** (`SmmMyJobPanel`, under the month's header, 2026-10-04): their seats, the video length, status, access code, Start / Continue in AI studio and Chat with client (My Work's links, back to the month), or "handed in" with the Drive chip — read once with `smmAssign.fetchMyMonthJobs` (their own card only). A month's jobs are no longer listed in My Work or Recent Ads, and their assignment alert opens the month (`memberLink: /smm/<id>`).
Rules in `utils/smmPackage.ts`. Same day, from the owner: the month's **name** is editable (setup's
Name field, or the pencil beside the title — `smmSetup.renameMonth`; renames the jobs too; sets
`businessNameEdited` so a sale edit never renames it back; the order keeps the sale's name); setup
sets the **number of videos / posters / real videos** (`setMonthCommitments`: adds rows, removes only
untouched ones, order counters follow); **Delete offers Undo for 5 s** (deleted at once,
`undoDeleteCampaign` puts the month back exactly as it was).
**Renewal countdown popup (2026-10-03, `components/smm/SmmRenewalPopup.tsx`, mounted in `AppLayout`
for sales members):** from 3 days before a month's renewal date (= its end date) through the day
itself — 3 days · 2 days · 1 day · renewal day — the salesperson who SOLD it gets a popup once a day
per month per device (localStorage `renewalPopupSeenKey`): the countdown strip, the month's timeline
with every post on its day, work status (% posted, `PaceChip`, a stacked stage bar from `toneCounts`,
one block per piece per kind), the call figures (posts live, leads, ad spend, cost per lead, days
waiting on the client, extra work, team) and the next month's dates; Renew (the usual
`useSmmRenewal` sale), Full report (`/smm/:id?tab=report` — the month page now opens on `?tab=`),
Later; several clients page 1 of N. Rules: `SMM_RENEWAL_POPUP_DAYS`, `daysToRenewal`,
`renewalCountdownLabel/Steps`, `renewalPopupMonths` in `utils/smmPackage.ts`.
**A month that had no sale (2026-10-03, later)** — for clients served before sales were recorded in the
app. Add SMM sale → number → **Add a month that had no sale** (tech admin, team leader and main admin —
`canAddNoSaleMonth`; the Social Media Team Lead too from 2026-10-05 until 2026-10-12, when she became view-only): salesperson, the package it ran on (fills counts + accounts) or Custom, then the
ordinary setup form → `smmSetup.addNoSaleMonth` → `origin: "no_sale"`, auto id, no order/lead/sale
item, **amount 0**, `soldBy` = the salesperson — so it is in their Social Media with its dates and they
get Renew, but nothing reaches revenue, leaderboards or commission. Refused (`noSaleMonthProblem`,
`noSaleMonthClash`): a start in the future (that is a sale), dates on any month the number has, dates a
recorded sale covers (even a deleted one → "Set up this sale"), any month after a recorded sale (that is
the salesperson's renewal). Over → history; running → `applyMonthSetup` → jobs. **Orderless months now
get job cards** (`assignSmmMonth`): one client chat per month keyed on the month id
(`createWorkAssignment` `roomId`/`soldBy`, `orderChat.joinMonthRoom`), never adopting the client's
waiting sale by phone, with the month's deadline. Shown as a "No sale" chip, "No sale — not counted in
revenue or commission" on the month, "salesperson X" (`sellerLineOf`). The salesperson's Renew makes
month 2 a real sale. Fixed with it: a renewal's order and jobs now get the month's deadline
(`monthPromise`, now in `services/smm`, set in `linkRenewal`), and a sale edit or approval no longer
writes the sale's promise over an order's `smm_month` deadline or a used extension (`upsertOrderForSale`).
**One clear card per client (2026-10-04, later — the default view of `/smm`):** the owner found the
charts below hard to read and asked for each SMM month to be clear in a single card. `SmmCampaignCard`
now shows, top to bottom: the business and package; a **status in everyday words** with its reason
(`utils/smmGlance.monthGlance`: **Off track** — posts past their date, or the month ended short; **At
risk** — behind the month's calendar (`paceOf`) with nothing late; **On track** — "Everything is on
schedule" or "n posts waiting for the client's approval"; **Completed**; **Not started**; **Needs setup**;
History); a coloured stripe along the top in the status colour; **one ring** of every promised post in five
buckets — Posted · In progress (being made + approved/scheduled) · Waiting for client · Late · Not started
(planned + not planned) — with "6/16 posted" in the middle and each bucket named with its count; each
kind's posted/promised bar; the dates and days left; the **next post** and when; team initials + seller;
the renewal chip (due / overdue / renewed / not renewing) and Set up / Renew. Parts in
`components/smm/SmmGlance.tsx` (`StatusPill`, `StatusRing`, `RingLegend`, `KindBars`, `TimeBar`,
`NextPost`, `MonthGlance`). Above the cards a row of **status counts that filter them** — All clients,
Off track, At risk, On track, Needs setup (only when there is one), Renewals due, Finished (read on
demand) — sorted worst first (`byGlanceUrgency`), plus search and the member / salesperson filters. The
month's page header shows the same glance (`MonthGlance layout="wide"`), and the content table's status
chips use the same colours (`SmmChips.StatusChip`: a coloured dot, words in the text colour). The ring's
order keeps red (late) away from green (posted) — they touch in a ring and collapse for colour-blind
readers.
**Insights (2026-10-04, `components/smm/SmmDashboard.tsx` + `components/smm/dashboard/*`, numbers in
`utils/smmDashboard.ts`) — the charts, one switch away** (Cards / Insights, remembered per browser,
`dts_smm_view`; the member / salesperson filters scope both). Drawn from
the months the viewer already has (`useSmmCampaigns` → active, not history — no extra read), in hand-drawn
SVG (`dashboard/chartKit`: `VizCard`, `ChartTip`, `TableToggle`/`VizTable`, `Sparkline`, `PaceBullet`,
`niceScale`, `columnPath`): **Delivered** hero (posted ÷ promised, a meter with today's target tick —
each month's quota spread over its days — and a 14-day posts sparkline); tiles (clients running + ₹ a
month, due this week, late, with the client + days lost, renewals due + ₹, needs setup) that open the
cards filtered to that pile; **pace matrix** (every client: x = month gone, y = posted; diagonal = even
pace; colour = `paceOf`/late, late work a red diamond; worst three named; hover/keyboard tooltip, click
opens the month, table view); **stage pipeline** (every promised piece by stage, legend = table);
**posting calendar** (two weeks back, two ahead, each day stacked by stage, today line, "Tomorrow: n to
post — …" line); **clients, worst first** (bullets: posted, due-by-today tick, tinted shortfall);
**renewals runway** (next 30 days + overdue zone, this week / 30 days / overdue with ₹, next five
listed); **team load** (overseers only: each person's pieces by stage); **ads** (leads, spend, cost per
lead, 14-day sparklines ending yesterday until today is reported, leads by client). Money shows only to
overseers and the seller (`showMoney`). The month's **Report tab** uses the same parts
(`dashboard/MonthViews`: promise tracker with per-kind bullets, stage pipeline, leads a day via
`adDaily`; its calendar is the plain client calendar since 2026-10-05 — it was a bar chart of the days
via `scheduleBetween`, which Insights still uses). Stage colours are one validated scale for
the whole section — `--viz-*` in `index.css`, Tailwind `viz-*` (§11); `SmmVisuals.TONE_BG/TONE_RGB/TONE_CHIP`
use it, so the cards, timeline, popup and dashboard agree; late is red **and** a diamond (deuteranopes
cannot tell red from green). `SmmBoardStats` was removed (`smmPackage.boardStats` stays, tested).

**The client calendar (2026-10-05, redrawn twice that day) — a client's whole run as a NORMAL CALENDAR.**
The owner asked for "a monthly calendar for each client's social media, for checking the history". Version 1
paged by calendar month with six stage colours ("confusing"); version 2 paged by the CLIENT's months
("Month 2 · 5 Sep – 5 Oct"), so a client with one month had nothing to switch to ("no option to change the
month"), and its day list beside the grid left the calendar in empty space. **Version 3 (owner's choice, with
mockups): one calendar month per page, like a phone calendar, with the three marks.** Top to bottom
(`calendar/ClientCalendar`): **which month** — "‹ Sep · October 2026 ▾ · Nov ›" and **Today**, always shown;
the title opens a list of every month (newest first, each with the client months in it and its marks); the
arrows stop at the first and last calendar months holding anything of the client's, greyed and saying "No
earlier month for this client"; under it the client's months on this page — "Month 2 · 5 Sep – 5 Oct 2026 ·
Running now" — the page's own month plain, the others links to their pages; **how it went** — three counts
for the posts on this page's days, each a solid circle + number + word: ✔ green **Posted**, ✖ red **Not
posted** (its day has passed), ◷ grey **Coming up** (`calendar/marks.MarkIcon`; shape AND colour AND word —
the counts are the legend); **when** — Monday first, days of the months around it faded and inert, days in
no client month dimmed, today ringed, "Month 2 starts" / "Month 2 ends" written on the day ("Start" / "End"
when narrow). **Sized by its own width** (`chartKit.useWidth`), not the screen: from 600px a day lists its
posts by name, mark first (two, or three from 960px, then "+n more"); narrower, only its marks with a
number; the title uses the body face when narrow (Syne cut "October 2026" at 360px). The picked day's posts
are always **under** the calendar, cards side by side (`CalendarDayPanel.POST_GRID`, `PostRow`: "Posted on
15 Aug, 6:00 AM", "Not posted — it was due on 25 Aug", "To be posted today, 9:00 AM", what it waits for,
Instagram / Facebook links, **Open** beside the name for the page's own month, the month's name when the
page shows two, and "Its date is outside Month 1 (6 Sep – 5 Oct 2026)" when it is — the month's own days since 2026-10-15); a day tapped while its
posts are below the fold scrolls them up. Posts with no date are listed under the calendar on the pages of
their month. **Every post sits on its upload date** (`uploadDate`, the Content list's column — owner, same
day, via session dts-os-a1): `postedAt` is stamped when Posted is pressed, and the team marked a month's
nine posts posted together, which piled them all onto 5 Oct; only a posted piece with no upload date falls
back to that stamp ("Marked posted on 5 Oct — no upload date was given"). A post dated outside its month
shows on that date's page (the arrows reach it) and is counted there. A history month's blank plan is left
out ("added after it ended"). Swipe left/right (the grid is `touch-pan-y`, or the browser takes a
right-swipe as Back) and Page Up/Down change month; arrows move a day, over a month's edge too. Opens on
today's page while the month it is about runs, else on the page holding most of its posts dated inside it,
its middle on a tie (`openingMonth`; since 2026-10-05 — a history month "24 Aug – 24 Sep" opened on September
while its filled-in work sat on 28 Aug). Three places: the month page's Content → **Calendar** (`SmmCalendar`, about that month;
the kind filter applies), its **Report** tab (the same calendar replaced the stacked bar chart of the
days), and **Social Media → Calendar** (`SmmCalendarBoard`, third view beside Cards / Insights, kept in
`dts_smm_view`; about the client's month running now; client list A–Z with search beside it from 1280px
— at 1024px it left the calendar ~440px — a bottom sheet below that; `?client=` in the URL; the member /
salesperson filters narrow the clients).
**Visibility (owner): only months the viewer can already open** — `smmCalendar.canSeeSmmMonth`: an
overseer all, otherwise `watchers` or `soldBy`.
**Reads:** the month on screen is live; the client's other months come from one on-demand query
(`smm.fetchClientMonths`, `where clientPhoneId ==`) kept 5 minutes per session (`useSmmClientMonths`);
an overseer's board asks it per client picked, and clients with only finished months join the list on
"Show clients whose months have all ended" (the existing `fetchFinishedCampaigns`); a member's or
salesperson's board reads nothing more (their listener already has every month they can see). Rules in
`utils/smmCalendar.ts` (calendar months, the client's run `buildClientRun`, one page `calendarPage`, which
month and day it opens on, marks, sentences, clients); UI in
`components/smm/calendar/` (`ClientCalendar`, `CalendarDayPanel`, `marks`, `kindIcons`).
**Accounts it covers, in setup (2026-10-05, owner).** Set up / Edit setup (and setting up a recorded sale
in Add SMM sale) now asks which accounts the month covers (`AccountPicker`, shared with the no-sale
step), with a page box per ticked account; none ticked is refused. Saved by `applyMonthSetup` →
`smm.setMonthPlatforms` (transaction): the month's `platforms`, and its pieces by
`smmPackage.itemsForAccounts` — **posted pieces keep where they went**, pieces still on the month's old
accounts take the new ones, a piece given its own accounts keeps them minus a dropped one (none left →
the month's). Page links are kept only for covered accounts (`linksForAccounts`). The sale keeps the
accounts it was sold with, and a later sale edit never copies them back (`ensureCampaignForOrder` does
not touch `platforms`).
**An old client's earlier months, their people and their work (2026-10-05, owner).** The team lists the
months a client had before the app ("the previous months' work that we made for the client") and fills
their work in afterwards. (1) **The Social Media Team Lead may add a month that had no sale**
(`canAddNoSaleMonth`; WITHDRAWN 2026-10-12 — she is view-only, see "The Team Lead, view-only" below); recording a
NEW sale stays with the three admins, and a number with no sale now says who records one (`smm-add-sale-new-who`)
— the lead used to get "No social media sale has been recorded" and nothing to press. (2) **A history month keeps who did its work** — the setup form's team section,
hidden for past dates before, now reads **"Who did the work"** (optional): saved by name, their seats on
every row and in `watchers` (so it is in their Social Media and they may edit it), with **no job card, no
chat, no work alert** (`smmSetup.historyTeam` → `buildSoldCampaign({ team })` for `addNoSaleMonth` /
`setupSaleMonth`, `setCampaignTeam` for a month that already existed). **Edit setup works on a history
month** (`applyHistorySetup`: name, counts, accounts, dates — kept before today, `historySetupProblem` —,
video length, links, people; never jobs, no salesperson notice). (3) **Filling a past month in:** on a
history month a post is marked Posted **without a recorded client approval** (`smmPlan.canPublish(item,
campaign)`, the same check in `setItemStatus`) but **only with its upload date** — `postedAt` is the day it
was filled in, so without a date the calendar would put an August post on today; the post dialog shows
"Past month — no approval step" in place of the approval panel and saves the date just typed before marking
it posted. (4) **An earlier month added after a later one joins the client's run**
(`smmSetup.neighbourMonthsOf` — one read for the months either side — and `linkInFront`): it points
forward (`renewal.nextCampaignId`, `won`), the month after points back (`renewalOf`) and the run is
renumbered from there (Month 1 → 2 → 3), within the same one-week gap as the backward link; the later
month's page then shows "← August 2026" and Month 2. A history month's unfilled rows are never offered as
"Move them here" (`canCarry`). (5) The calendar: a not-running month opens where most of its posts are (see
above); a history month's note says it shows the posts filled in since; the client's kept months read is
dropped when a month is added in this session (`useSmmClientMonths.forgetClientMonths`) or when a month on
screen points to one the read does not hold — an August added in front stayed off September's calendar for
five minutes. (6) The post dialog writes whatever is still unsaved when it closes (it was dropped with its
900 ms autosave timer — the last thing typed in each post). (7) `assignSmmMonth`: a tech member assigning
(the Team Lead, until 2026-10-12) puts their creator, the tech admin, in the client chat — the lead used to fill both places.
**Renewals kept true, renewal money, the Money tab, the post-status popup (2026-10-05, owner, session
dts-os-ba).** (1) **"Renewed" follows the renewal sale.** When the renewal sale is withdrawn — deleted by the
salesperson, rejected or taken back by the sales admin (`cancelOrderForSale`, which passes `saleWithdrawn` to
`setCampaignRemovedForOrders` / `deleteCampaignsForOrders`) — the month before is un-renewed
(`smm.unlinkRenewal`, rules `utils/smmRenewalLink.renewalUnlinkPatch`: renewal back to `none`, a month filed
`renewed` back to `active` — history → `completed` —, inside a transaction and only while it still points at
that month) and the tech admins / team leaders get `smm_renewal_cancelled`. Re-approving the sale (or
restoring the order) renews it again (`relinkRenewal`, never over a link to another month). The tech side
removing the renewal month's order from the queue, purging it or deleting the month does NOT un-renew — the
sale stands, the client did renew, and "no decision" would invite a second renewal sale; the month page then
says "its next month was taken off the board" without the dead Next month link. Links broken before the fix
are repaired on open (`healRenewalLinksOnOpen`: the board for every viewer — before `closeEndedMonthsOnOpen`
—, the month page when its next month is gone, the Money tab) only where the sale was withdrawn
(`renewalSaleWithdrawn`: the next month's order `cancelled`, or no order and no such sale on the lead —
`leadIdOfOrderId`); one to three reads per dangling link, once a session. (2) **Salesperson's
card** `SmmRenewalsCard` ("My Social Media", sales Dashboard + top of their Social Media, owner's "Money
first" mockup): ‹ month ›; "₹X from your renewals" + "₹Y more waiting — renew N clients"; a bar "3 of 7
renewed"; Running now · ✔ Renewed · ◷ Waiting (+n from earlier) · ✖ Not renewing (the calendar's
`MarkIcon`); "Renew these now" rows with "+₹" and Renew; Renewed / Not renewing
chips. Since 2026-10-15 "+₹" and the totals use the rate of the PAY PERIOD the money falls in (`payTerms.commissionTermsFor`
+ `termsPeriodOn`: a renewed row at its renewal day's period, a waiting or lost one at the running period's), worded
"· estimate" with the footnote `smm-my-rate-note` (paid on the money collected, once verified and 75% of that period's target
is reached — `people.md` §9.14); it was today's `commissionRate` for every row. Still rings the renewal bells (`ring={false}` on Social Media). (3) **Money tab**
(`components/smm/money/SmmMoneyView`, fourth view beside Cards / Insights / Calendar, `canSeeSmmMoney`: main,
tech and sales admin only): running clients, ₹ a month, renewal rate; ✔ kept / ◷ still to win / ✖ gone with ₹
on one bar; one row per salesperson; "Waiting for a decision" with Remind / Open. One on-demand read per
month (`fetchMonthsEndingBetween`, `cycle.endDate` range) because filed months are not live. Numbers:
`utils/smmRenewalMoney` — a month counts in the calendar month of its renewal day (`cycle.endDate`); outcome renewed (next
month linked / won / status renewed), lost (lost / lapsed), else waiting; value = next month's amount, else
its own, else its package's list price; history, removed and deleted months left out; running clients counted
once each from the month covering today. (4) **Post-status check at 11 AM and 5 PM**
(`SmmStatusCheckPopup`, AppLayout for tech roles; rules `utils/smmStatusCheck`): anyone holding a seat on a
month running today gets every post not live yet — theirs first, late next — with a status select
(`setItemStatus`; Scheduled / Posted disabled until the client approved); "All updated" answers the slot
(localStorage `dts_smm_status_check_<uid>`), "Later" brings it back in 30 min, first opened after 17:00 it
asks once; it waits its turn through the popup coordinator (since 2026-10-15, see "SMM Delivery Control" below): never over a call, the AI
studio, another popup (the check-in gate even while it is still loading) or a window the person opened, and not within ten
minutes of a different popup closing. One scoped read when a slot comes due (`fetchMyCampaigns`),
live (`watchMyCampaigns`) only while open.
**On hold, and the month the board could not show (2026-10-05, owner).** The owner's AIRAVATH: Add SMM sale →
"Add a month that had no sale" refused 24 Aug → 24 Sep with "already has a month on these dates (25 Aug → 4 Oct
2026). Open it from the board instead" — but no such month was on the board. Causes: a history month was filed
`completed` the moment it was added (only under Finished, read on demand); the number lookup listed only SALES
(`findSmmSalesForPhone`), so a number whose month had no sale read "No social media sale has been recorded"; the
refusal gave no link. Then the owner: **"if the social is not renewal then keep it as hold"** (choices, via
AskUserQuestion: every ended month; "Not renewing" still files it). (1) **On hold** = `active`, last day passed, no
renewal decision (`smmPackage.isOnHold`; a pitch is no decision). The card says **On hold** ("Ended 4 Oct — not
renewed yet · 3 posts not live"; a history month's blank rows are not counted), grey, ranked after On track
(`smmGlance` status `on_hold`); the board has an **On hold** count/filter (`SocialMedia` FILTERS `hold`; the tiles
fit as many to a row as 7.5rem allows from 1024px); the month page's renewal line says "On hold — the month ended on
4 Oct and has not been renewed". It replaces "Off track — Month ended with n posts not live" for an undecided ended
month. Renew → filed `renewed`; Not renewing → `lapsed` (Finished). (2) **A history month with nothing after it is
`active` (on hold)**, on the board with Renew for its salesperson (`renewalDue` / `closingStatus` /
`renewalRelinkPatch` now take history months; `renewalUnlinkPatch` puts a history month back on hold, not
`completed`). Filed `completed` only when the client's run went on — a next month linked, or ANY later month of the
client, after a gap too (`smmPackage.historyFiling`, `historyMonthsFollowed`): set at creation by `addNoSaleMonth` /
`setupSaleMonth` (from the client-months read `neighbourMonthsOf` already makes, now returning `months`), earlier
history months on hold that a newly added month follows are filed then (`smm.fileFollowedHistoryMonths`), and the
board sweep (`closeEndedMonthsOnOpen`) files one once a later month of the client is in the overseer's live list. A
month that ran in the app stays the salesperson's to decide. **Legacy:** history months saved `completed` before
this with nothing after them are put back on hold ONCE for the company by the first overseer who opens the board
(`smm.holdUnrenewedHistoryOnOpen`: one read of `app_settings/smm_history_hold`; while missing, the `completed`
months and one `clientPhoneId` read per such client; writes the record only when all succeeded). (3) **Add SMM
sale lists every month on the number** (`smm.fetchClientMonths(phoneLockId)` — the same query as the clash check)
that no listed sale owns: name, dates, package, salesperson, "No sale", its state in board words (On hold / Running
/ Needs setup / Not started / History / Renewed / Not renewed / Finished) and **Open month**; such a number gets no
"Record a new sale" (it is a renewal; Remind reaches a no-sale month's salesperson too); the no-sale step lists
them above the form ("a new month cannot overlap these dates"). (4) **The refusal links the month**:
`smmSetup.noSaleMonthClashOf` → `SmmMonthClashError.monthId`; the step shows the message with **Open that month**
under the form (cleared when the dates change); the text now says "Open it to fill in its work, or correct its
dates with Edit setup."
**Attendance — TODAY, for the Social Media Team Lead's daily meeting (2026-10-08).** A fifth view, **Social Media →
Attendance** (`SocialMedia` view `attendance`, kept in `dts_smm_view`; `components/smm/SmmAttendanceView`), for the lead
(`smmLeader`) and the tech / main admin (`utils/smmAttendance.canSeeSmmAttendance`; anybody else asking for it gets the
cards). First built that day as the pay-cycle grid of the people on the months running today; the owner, seeing it live:
"only today — she holds a meeting every day, people don't join, she calls them and they say they are absent; she needs
to know who is absent before the meeting; some members are not showing." Asked, the owner chose each part:
**the board** — the day ("Thursday, 8 October 2026", "updates by itself as people check in"), four big numbers
(Present · Not checked in · On leave · Absent), then the people in groups, **the call list first**: *Not checked in yet
— call them* (with **Call** `tel:` and **WhatsApp** `wa.me` from the profile's `phone`, `utils/phone`), *Not coming
today — no need to call* (approved leave, a leave request nobody decided yet, marked absent), *Present* ("In at 9:42
AM · left 6:05 PM", half day), *No check-in record* (team leaders — they never check in; Call / WhatsApp too), *Day
off*. **Each card says what Social Media work the person handles** (owner, the same night: "in the cards, for each
member, write what social media handling they are doing"): "Handles 2 clients", then one line per client — the
client's name and what they do for it ("Lakshmi Jewellers — Creator, Publisher, Marketer"), tagged "month ended" (on
hold) or "starts 20 Oct" when that month is not running; running clients first (`SmmTeamPerson.handles`, from the
same months and posts, a client's two months on the board one line). Edit team lists each person's client names
too. Each status is an icon + colour + words; "Everyone who checks in has checked in or is on leave — nobody to chase"
when the call list is empty; an amber banner on a Sunday or an announced holiday. **A day** (`todayStatusOf`): an
admin's mark (`attendance/{uid}_{day}` — an approved leave is written as one), else today's check-in
(`techAttendance.watchCheckinsOnDay`, with its times), else Sunday / a holiday, else a pending leave request covering
today, else a team leader's "no check-in record", else **"Not checked in"** — the grid left today blank until the day
was over (`resolveStatus`), so the lead could not tell "not here" from "fine". **Who** (`smmTeamFromMonths` +
`applyTeamEdits`): everybody on a month **on the board** (status `active` — running, on hold, not started, waiting for
setup), from its seats AND each post's own `makerUid` / `publisherUid` — the running-months-only, seats-only list
dropped the people of the five months on hold and of posts given to somebody without a seat — then the lead's
corrections: **Edit team** (`SmmTeamEditor`, the lead and the tech / main admin, `canEditSmmTeam`) adds an active tech
member / team leader (`fetchAssignableMembers`) or takes a person off ("Taken off the list" → Put back), saved at once
for everybody in **`app_settings/smm_team`** (`services/smmTeam`: `added` / `removed` uid lists, arrayUnion /
arrayRemove; a month's person put back only leaves `removed`, a hand-added one taken off only leaves `added`). Left
employees and outside creators are never listed. View only for the days: marks stay with the admins in Team
Attendance (a mark changes the salary). Live: today's check-ins, marks, holiday, pending leave and the corrections are
listeners; the board turns to the new day at midnight. Reads: the team's user records once by id
(`hooks/useUsersByIds`), today's check-ins (one equality on `date`), today's marks and holiday, the pending leave
requests, one settings document. The member / salesperson filters are hidden on this view; on a phone the admins'
five view tabs sit three and two. Team Attendance keeps the pay-cycle grid, now drawn by the shared
`components/attendance/AttendanceGrid`. Half-day leave (2026-10-12, `people.md` §9.13): an approved one reads "Half-day leave" and a
pending one "Asked for a half-day leave — not approved yet", both in *Not coming today*.
**The Team Lead, view-only — a hybrid role (owner, 2026-10-12).** The owner: "VIEW-ONLY access to all SMM team members,
their assignments, progress, and work status, with no ability to edit, delete, or manage other members' work — and the
exact same working permissions as an SMM Team Member for SMM assignments personally assigned to them" (Manasa leads;
Sreerasthu Silvers is assigned to her → she works it like a member and only views the rest). Asked, the owner kept her
**Edit team** on Attendance and took away **Add a month that had no sale**. Before: `canEditCampaign` asked
`isSmmOverseer`, so the lead could edit every month; commit `5ca75b0` (same day, another tool) had moved setup and delete
off her but left her every other write, a guard on one write only (`setItemStatus`), `canAddNoSaleMonth` still true with
its button hidden, write sweeps over everyone's months from her board, the client-message buttons on others' months, and
copy telling her she "runs every month". Now: **one answer** — `smmPlan.canEditCampaign` (an SMM admin by role, the
month's salesperson, or somebody on the month: `watchers` / a seat, `isAssignedToSmm`); `isViewOnlySmmLead` = the flag on a
role that is not `isSmmAdmin` (a Tech Team Leader or admin with the flag keeps everything); `isSmmOverseer` (sight) is
unchanged. **Screens:** a month she is not on shows "View only." at the top (`smm-page-view-only`); its Content add
buttons, the post dialog (fields, stage, approvals, remove, Send posting update — `SmmItemDialog canEdit`, its banner on
theme tokens), Ads, Money (incl. Ask for a top-up), Report's Send the monthly report, "Their chat" (the client's own
`/c/<id>` page, where typing talks to the client), setup, rename and delete are gone; a month she is on is a member's
page (her job panel too). No Add SMM sale, setup, assign, rename, move pieces or
delete anywhere — a member has none of those either. **Services (the backend check):** `services/smm` — `SmmViewOnlyError`;
`assertMayChangeMonth` inside `mutateCampaign`'s transaction (the month as the database holds it), so every working write
(posts, stages, approvals, ads, budget, renewal links) is refused on a month she is not on; `assertMayManageMonths` first
in every managing write, even on her own month (delete / undo, `createRenewalMonth`, `setCampaignTeam`, `saveMonthSetup`,
`setCycle`, `setCommitments`, `setMonthCommitments`, `setMonthPlatforms`, `moveUnpostedToMonth`; `smmSetup.renameMonth`,
`applyMonthSetup`, `applyHistorySetup`, `setupSaleMonth`, `addNoSaleMonth`; `smmAssign.assignSmmMonth` — before any job is
created or withdrawn). Who is signed in is read from the auth store (`useAuthStore.getState().user`, the live `users/{uid}`),
as the rule reads `request.auth`; nobody signed in (scripts, tests) and every other role pass untouched. The on-open sweeps
skip what she may not change (`mayChangeMonth`: `closeEndedMonthsOnOpen`, `fileFollowedHistoryMonths`,
`healRenewalLinksOnOpen` — so the admins file and repair the rest) and `holdUnrenewedHistoryOnOpen` never runs from her
browser. **Security:** the first rule of its own for `smm_campaigns` in `docs/firestore-rules.md` (`isViewOnlySmmLead`: read
for staff; create / delete not for her; update only where she is in `watchers` or is `soldBy`; kept out of the catch-all;
every other role as before) — once published. Wording: her appointment notification, the Team Lead panel, My Team's
toggle and the new-month bell ("It is on the Social Media board" — the admins put the team on it).
**Locked months and "Create next renewal" (2026-10-12, commit `5ca75b0`; who sees it — owner, 2026-10-13).** A month
whose renewal day (end date) has come — since 2026-10-15; its last day passed before —, or that is `completed` / `renewed` / `lapsed` or `history`, is **locked**
(`smmPackage.isMonthLocked`): its Edit setup becomes "Manage historical record" (`applyHistorySetup`, dates kept in the
past — `historySetupProblem`; `saveMonthSetup` refuses moving it into today), so a month is never stretched into the
next period. The next period is a NEW month: **Create next renewal** (`smm.createRenewalMonth`: copies the name, client,
package, amount, salesperson, accounts, page links, clips per video, counts and team; starts on the old end date — always,
even when made late (2026-10-15; it was "or the renewal day once that is past"), an earlier start is refused; `orderId: ""`; linked by `linkRenewal` — Month N+1, the same team's jobs, the tech side
told; an existing next month is returned, never duplicated). Offered on the client card (`smm-card-admin-renew`, when the
renewal is due or the month is locked and nothing follows it), the month page's renewal row (`smm-page-admin-renew`) and
the locked setup banner (`smm-setup-create-renewal`). **No sale stands behind it** — no Sales Approvals, no commission.
So it is **the main admin's and the tech admin's alone** (`canAdminRenewSmm`). The owner, 2026-10-13: "don't show this to
the team lead, show this only to the admin and the sales person"; the Tech Team Leader had it from 2026-10-12, and the
view-only Social Media Team Lead never did. Asked, the owner kept the salesperson on their own **Renew** (the renewal
sale) rather than this button. The service refuses anybody else signed in (`assertMayCreateRenewalMonth`,
`SMM_CREATE_RENEWAL_ADMIN_ONLY`; the view-only lead gets her own sentence first from `assertMayManageMonths`). A team
leader gets **Remind <salesperson>** on an undecided month again, and still manages the locked month's record.
**Dates and periods — a month's end date is its RENEWAL DAY (owner, 2026-10-15).** The owner's Dhana lakshmi month read
"6 Oct → 6 Nov 2026" though it ran 6 Sep → 6 Oct (sold 5 Jul 2026, month id `o_LQciB3pSGZEbscZipLBS_1783240453303`); its
posts were dated 13 Aug – 9 Sep plus one 9 Oct. Causes: the header prints the saved `cycle`, which only setup writes, and
before 2026-10-12 Edit setup could move an ended month into the next period (the 2026-10-12 lock still missed the last day,
a first setup and Add SMM sale's set-up path); the SMM sale had no start date; the status ignored post dates; "Up 10d ago"
read `postedAt`. The owner decided: the sale asks when the month starts, and **the end date is the renewal day**. Fixed:
(1) **The rule.** A month is still shown and billed "6 Sep → 6 Oct"; its OWN days are 6 Sep – 5 Oct, and 6 Oct
(`cycle.endDate`) is the renewal day — the next month's first day. It runs while start ≤ today < end; on the end date it
has ended (On hold if undecided, locked, filed by the board sweep); no day counts in two months. Helpers `smmPlan.lastOwnDay`
/ `isOwnDay` / `ownDayCount`, `smmPackage.ownDaysLabel` ("6 Sep – 5 Oct"); `cyclePhase`, `cycleElapsed`, `cycleTimeLabel`
("Last day" on the last own day, "Ended today" on the renewal day), `isMonthLocked` (`endDate <= today`), `isOnHold`,
`closingStatus`, `needsSetup` follow it. ONE count of days left: `smmPlan.daysLeftInCycle` = `daysToRenewal` = days to the
renewal day (was +1), so bell, card and chip agree ("Renewal in 5 days" / "Renewal tomorrow" / "Renewal is today" /
overdue — `renewalWhenLabel`, also the Money tab's words). A month's deadline (`monthPromise`) is the end of its last own
day, "by 5 Oct". `renewalDue` opens 5 days before the renewal day; the popup's 3·2·1·renewal-day window is unchanged. The
calendar writes "Month N ends" on the last own day (`CalendarClientMonth.lastDay`, in memory only); Insights counts a
running client once (`clientPhoneId`) and no longer counts a month that has not started; `MonthTimeline` shades to the
end of today with the marker on that edge.
(2) **Anchor day.** `cycle.anchorDay` (only when a short month clamped the day): `monthCycle(start, end?, anchorDay?)` and
`nextCycleAfter(prev, start?)` give 31 Jan → 28 Feb → 31 Mar → 30 Apr → 31 May instead of drifting to the 28th; the anchor is
kept only when the next month starts exactly on the old end date (`buildSoldCampaign`, `createRenewalMonth`, and
`applyMonthSetup` / `applyHistorySetup` / the setup form's `autoEndOf` while the start is unchanged).
(3) **Where a month starts.** The SMM sale asks **"Month starts on"** (`SmmSaleSpec.startDate`, `sales.md` §9.4): a renewal
opens on the old end date — always, even recorded late (`renewalStartDate(prev)` = `prev.endDate`; the prefill's
`previousEnd`) — and may not start earlier; a new client opens on the sale day. `ensureCampaignForOrder` uses it (a renewal
without one → the old end; earlier → moved to the old end; a first month without one → `soldOn`, the sale day);
`createRenewalMonth` = `params.startDate || prev.cycle.endDate`. Add SMM sale: setting up a recorded sale opens on its
month's own dates, else its `startDate`, else the sale day; "Add a month that had no sale" opens with no start ("Pick the day
the month started."). `upsertOrderForSale({ announce:false })` makes no month (`ensureCampaignForOrder(…, { create:false })`)
— `setupSaleMonth` makes it with its dates, no renewal links, jobs or "renewed" bells first.
(4) **One checked way to change a month's dates** (`utils/smmMonthDates.monthDatesCheck`, pure): nothing asked when the
dates do not change; refused when the month is locked and the new end is after today (whatever `setupAt` says — the
first-setup exception is gone), when they overlap another live month of the client (back-to-back is fine; the message names
it, with **Open that month**), and when posts would fall outside the new own days unless the person sees the list and presses
**Keep the new dates anyway** (`SmmSetupForm.MonthDatesAsk`, `smm-dates-outside` / `smm-dates-keep` / `smm-dates-refused`;
the save is retried with exactly those post ids, `confirmedOutside`). `saveMonthSetup(id, setup, guard)` is THE write of
`cycle` and re-checks inside its transaction against the stored month (`smm.assertMonthDates` → `SmmMonthDatesError`; the
client's months are read just before — a browser transaction cannot query); `applyMonthSetup`, `applyHistorySetup` and
`setupSaleMonth` check before any write. Filing a sold month as history through Add SMM sale withdraws its jobs through one
path, `smmAssign.withdrawMonthJobs` (split out of `assignSmmMonth`): untouched → deleted and the member told, started → kept and
named (`MonthSetupResult.historyJobs`). The setup form reads "6 Sep – 5 Oct · 30 days · renews 6 Oct", the end field is
"Renews on", and a month is history when its end date is today or earlier.
(5) **Posts dated outside their month.** A post counts toward its month only when its `uploadDate` is one of the month's own
days, or it has none (`smmPlan.itemDatedOutside`, `isDeliveredInMonth`): `fulfilment`, `toneCounts.outside`, the glance (ring
bucket "Posted outside its dates"; all live but some outside → **At risk — "9 posts are dated outside 6 Oct – 5 Nov"**, the
amber `DatedOutsideNote` on cards and the month header), pace, the renewal popup, the monthly report, the renewal message,
Insights' stage pipeline and the bell's "x/y posted". The Content list tags such rows "Outside this month"; the post dialog
warns under the date (the date is still saved). An admin / team leader (`canSetUpSmm`) gets **Move to Month 2 (6 Oct – 5 Nov)**
in the post dialog (`smm.movePieceToMonth`: one transaction on both months, same client only, the post moved whole with a
note, an untouched blank row of its kind replaced in the target, a blank row given back to the month it left — that month
still owes the post). **Months to check** (`SmmMonthsToCheck`, folded, on the board's cards view for overseers who can set up;
from the live months, no read) lists months with posts dated outside, shared days or a gap between linked months, each with
Open. Ad reports count only the month's own days (`monthAdReports`: tiles, report and renewal messages, `adDaily`); a new ad
run starts today while the month runs, else on its first day (`defaultAdRunStart`).
(6) **Smaller fixes.** The posted chip reads the upload date (`smmGlance.postedUpLabel`, "Up today, 6:00 AM"; `postedAt` only
without one) and so does Insights' posts-a-day (`postedDayOf`); "Completed (Locked)" only for a finished month, otherwise
"Ended — not renewed yet" / "Ended — renewed" / "Ended — not renewing" (`lockedMonthLabel`); `moveUnpostedToMonth` clears a
carried piece's upload date (its note says where it was dated) and the old month's ring leaves moved pieces out
(`toneCounts.moved`, "· 1 post moved to the next month"); linked neighbours use `continuesInto` (0–7 days, forward only,
`RUN_GAP_DAYS`); a used extension survives later setup saves (`promiseSla.keepUsedExtension`) and a month's extension box opens
on 3 days (`defaultExtensionHours`); every job of a month — orderless ones, Orders → Assign jobs, Create next renewal — gets the
month's deadline and is dated `max(today, start)` (`orders-work.md` §16); a deleted sale's period in the no-sale clash comes from
its `startDate`.
**SMM Delivery Control — planned and built 2026-10-15, all phases 0–7 (the owner: "complete everything"; the plan's
decisions are below and in DEVELOPMENT-HISTORY; it starts in Preview).** The owner: the board shows the month, people update it or not, and the admins chase
by hand. The approved plan divides each client's month into WEEKLY tasks (the client's own weeks: W1 = days 1–7 from
`cycle.startDate` … W4 = day 22 → the day before `cycle.endDate`; counts per week from the package; one deadline per week, its
last working day at 19:00; checkpoints inside the week), escalates in full-screen alerts until done, and lives in a NEW UI
behind a button — the classic Social Media stays exactly as it is. Phase 0 (groundwork, nothing new on screen):
(1) **The popup coordinator** (`utils/popupCoordinator` rules, `store/popupStore` registry, `hooks/usePopupClaim`) — every
popup the app opens by itself reports itself while it is on screen: the daily check-in gate (`checkin`, "pending" while its
reads come in, held until the member has checked in on a working day), the agreement gate, the profile prompt, `UpdatePopup`,
the birthday greeting, the renewal countdown (`smm_renewal`); so do a call (`VideoCallManager`, `call`, ringing / calling / in a
call) and the AI studio (`AIPlatformApp`, `studio`). Those popups show exactly as before. A popup that WAITS its turn — the
post-status check now, the urgent alerts from phase 4 — opens through `tryOpenPopup(kind)`, which claims the screen in the same
step (two never both get a yes) and is refused (`popupVerdict`) while a call holds the screen (always first), any other claim
holds it, the person has a window of their own open (`personIsBusy`: `[role=dialog], [role=alertdialog], .fixed.inset-0` with
a box — the old check, now one input), or a DIFFERENT popup closed less than ten minutes ago (`POPUP_GAP_MS`; nothing after
its own kind, a call or the studio). A pending claim counts for two minutes at most (`POPUP_PENDING_LIMIT_MS`). Per tab, in
memory. (2) **The settings** — ONE document, `app_settings/smm_delivery` (`types/smmDelivery`, `utils/smmDeliverySettings`,
`services/smmDeliverySettings`): `mode` off / preview / live (missing = **preview**: the new screens show what would happen,
nothing saved, nobody alerted), `pilotUids`, `deadlineHour` 19, `checkpoints` (working days before the deadline: sent — AI video
3, +1 when `clipsPerVideo` ≥ 6, poster 2, real video 2; footage 4; approved 1), `quietHours` (20–9, Sundays, holidays),
`ladder` (deadline day 10:00, every 2 h, leads +1 / admins +2 working days, approvals 2 / 4 days, footage +1, ad report by 12,
campaign 2 days, extras unbilled 3 days, Do it now 45 min, I'm on it 4 h, a block 24 h, Need more time 2 per task, 2
reassigns / revisions, client chased day 2-4-7, ≤ 3 full screens a day, data fresh within 5 min, and — phase 1 —
`weeklyLoadLimit` 12 pieces a person makes a week), `history` (the switch's last
20 changes), `offReason` / `offAt` / `offByUid` / `offByName` while off, `lastRunAt` (the server checker's heartbeat, phase 6).
Read leniently (`parseSmmDeliverySettings`: anything missing, mistyped or out of range is the default); written only by the
tech admin and the main admin (`canManageSmmDelivery`; team leaders will SEE Settings, `canViewSmmDeliverySettings`):
`setSmmDeliveryMode(mode, reason)` — OFF needs a reason (≥ 5 characters) and every other active main admin gets
`smm_delivery_off` ("Kiran turned off SMM Delivery Control: …", link `/smm`); the same mode writes nothing — and
`saveSmmDeliveryTunables(patch)` (each number whole and in range — `tunablesInputProblem` —, the steps in order —
`tunablesProblem`: approval after every send, footage before the real video is sent, leads before admins, salesperson before
sales admin, the deadline-day alert before the deadline hour; quiet hours of some length). Both in a transaction, the person
read from the auth store. `utils/smmDeliverySettings` is written WITHOUT the `@/` alias (the phase-6 server checker reuses it;
a test asserts it). (3) **The data health check** (`utils/smmDeliveryHealth`: `monthHealth(month, { today, holidays, users? })`,
`deliveryHealth(months, ctx)` worst first with counts) — run on a month before it is switched on; says in sentences what is
wrong, what is left out and what to know, and changes nothing (hand-typed dates and titles are kept). States: **excluded**
(deleted, removed, a history month, finished, ended, on hold — "no production alerts, only the salesperson's renewal"),
**blocked** (dates missing or backwards, shorter than 22 days, nothing promised), **setup** (nobody on it — the tech admin's
one SETUP alert), **attention** (warnings), **ready**. Warnings: week 4 longer than 10 days, an empty "Makes the content" /
"Posts it" seat, a seat or a piece given to a deactivated person (when the people are passed), rows ≠ promised per kind (extra
work outside the count, carried pieces inside it), dates outside the month's own days (start → the day before the end date, which is the renewal day — the owner's
rule of 2026-10-15),
pieces already late (→ the Starting line, never escalated), extra work without a needed-by date or an owner, holidays
unreadable. Information: starts later, posted with no date / no link, undated rows (normal — the plan gives each a week),
carried pieces (first, in week 1), a client's first month (no post before day 4), a Sunday / holiday start, festival dates
missing for a year the month reaches (`utils/festivals.FESTIVALS` has 2026 only).
**Phase 1 (2026-10-15) — the rules, pure, alias-free (the phase-6 server reuses them; a test asserts it and esbuild bundles
them without the alias), nothing on screen yet.** (4) **The weekly rules** (`utils/smmCadence`): its own day helpers (dates
as UTC arithmetic, times as India time — `istMoment`, `istDay`; working day = Mon–Sat and not in `holidays`, null = Sundays
only) and its own copy of the month's date rule (`ownDaysOf`: start → end − 1; `monthRunsOn`; `monthExclusion` — deleted /
removed / history / finished / on hold / ended, the same answers as `smmDeliveryHealth.excludedReason` and
`smmPackage.isOnHold`, held together by a parity test). `monthWeeks` (W1–W4, each with its working days and its deadline: the
last working day at `deadlineHour`, stepping back over a Sunday / holiday; null under 22 own days); `splitAcrossWeeks` (÷ 4,
leftovers to W1, W4, W2) and `weekTargets` (per kind; a first month's W1 real videos move to W2); `taskCheckpoints` (counted
back in working days from the deadline — footage −4, sent −3 video / −4 long / −2 poster / −2 real video, approved −1, live
at the deadline — none before the week's first working day or the day extra work was added: `compressed`); `planMonth` (every
piece placed: a saved `plan.fixedDate` / `plan.week` first, then the team's own date (kept), then carried pieces in W1, then
the earliest week short of its running total; rows beyond the promise uncounted — untouched ones first —, promised pieces
with no row in `missing`; extra work on its needed-by date outside the count, none → no deadline; a festival post due on the
festival morning (06:00), even a Sunday; suggested post days spread Mon–Sat over each week, ≥ day 4 in a first month, at
most two a day where possible; `bunched` days > 2; owners = the piece's, else the seats; never writes `uploadDate`);
`crowdedWeeks` (> 2 a day left); `taskProgress` (state done / pending_client / uncounted / unscheduled / not_due / on_track /
checkpoint_missed / due_today / late; the next step and whose — footage and approval the salesperson's, make the maker's, post
the publisher's; checkpoints missed; blame = the first missed: send → team, footage / approval → client, live → publisher; live =
posted, at upload date + time, else `postedAt`; a step done with no stamp counts as on time; a real video already being made has
its footage); `onTimeSummary` (client delays never count against the team); `moveCheck` (same week free; another week a
reason + the lead told; out of the month, or a piece already past its deadline, only the tech admin / team leader / main
admin). (5) **The supervisor** (`utils/smmMonitor.monitorSmm({ now, months, settings, holidays, people, answers?, baselineAt? })`
→ `alerts`, `plans`, `startingLine`, `errors`, `load`): Off → nothing; each month in its own try/catch; only running months
not excluded; nobody on it → one `month_unstaffed` (🛠 SETUP) to the tech / main admin. Per piece: the owner's week-start
list (notice, one per client-week), "watch" (not started, must be sent by the next working day — never a full screen),
`checkpoint_missed` (amber, not sent), `deadline_today` (full, from 10:00), `deadline_passed` (red, again every 2 h counted
from the start of each working day until a late reason is given; the leads told), `lead_escalation` (red, the Social Media
Team Lead + tech team leaders, from 09:00 of the next working day), `admin_escalation` (critical, tech + main admin, +2 working
days or at once on a lead's Escalate; a lead's I'm on it holds the admins 4 h); the client's side never climbs the team's
ladder — `approval_waiting` to the salesperson on the chase days (2, 4, 7; a chase logged that day quiets it), the sales admin at
4 days, `approval_not_responding` after the last; `client_keeps_changing` (a 3rd revision; notice); `footage_missing` at its
checkpoint, the sales admin a working day later; `extra_unbilled` (3 days live, not billed / free); the marketer's
`ad_report_missing` (yesterday's report by 12:00) and `ad_not_started` (a video live 2 days with no ad covering it);
`nobody_owns` (an empty seat / a deactivated owner — one per month); `owner_away` (the owner on leave → the leads, the salesperson
→ the sales admin); `blocked` (to whoever clears it: client approval / footage / page access → salesperson, Flow credits →
admins, leave / other → leads); `overloaded` (more than `weeklyLoadLimit` pieces this week → ONE admin alert, that person's
early warnings held as watch) and `plan_impossible` (a crowded week). Quiet: a valid `blocker` (confirmed, or within its 24 h),
an `eta` (Do it now / Need more time), a reassigned piece's new owner until the end of the next working day, a lead's / admin's
`on_it` (4 h, everything to them on that subject), the Starting line (a piece whose deadline passed before `delivery.baselineAt`
— never escalated, listed; a checkpoint missed before it is not chased). One alert per person per month per subject (the worst);
the once key `smm_alert_<subject>_<level>_<stamp>_<uid>`; delivery held in Preview, outside the pilot group, in quiet hours
unless critical, while away (`heldBecause`). Each alert names its type (🎬 AI VIDEO · 🖼 POSTER · 📹 REAL VIDEO · ⭐ EXTRA ·
✅ APPROVAL · 📤 POSTING · 🎞 FOOTAGE · 📊 AD REPORT · 🧾 BILLING · 🛠 SETUP; 📝 REPORT reserved) and says one sentence. Also:
`screenFor` (one screen per person, worst first; the main admin's combined), `screenProblem` (stale data over 5 min / a device
clock 5 min off → no full screen), `isQuietTime`, `presenceFromToday` (the Attendance board's kinds → working / half_in / away),
`etaCheck` (Do it now 45 min, renewed once a day; Need more time today only, 2 a piece; neither past the deadline), `reassignCheck`
(a 3rd reassign needs the tech / main admin), `blockerActive`, `blockerClearer`, and **the rehearsal** `rehearseSmm(input, {
fromDay, days: 30 })` — the supervisor replayed every 30 min 09:00–20:00 on the months as their stamps say they stood
(`itemAsOf`, `monthAsOf`), Live for everyone, nobody answering, presence ignored → full screens per person per day against the
target (3), `overTarget`, by type / reason. The item fields it reads (`plan`, `moves`, `startedAt`, `madeAt`, `blocker`, `eta`,
`lateReasons`, `footage`, `revisions`, `reassigns`, `noLinkReason`) and the month's `delivery` are typed in `types/smmDelivery`
(`SmmDeliveryItemFields`, `SmmMonthDelivery`) — all optional; written since phase 3 (below). The owner's decisions behind phases
0–7 (2026-10-15, final): split ÷ 4 with leftovers to W1, W4, W2 per kind; a first month keeps W1 but posts from day 4; post Mon–Sat
skipping holidays, a festival post on the festival day; footage the client never sends stays that month's pending work, never the
team's; no mid-month pause (On hold = ended, undecided); the 11 AM / 5 PM check retires for covered people; check-out asks "why not
done"; Posted needs a link per account or a reason; the server checker runs from cron-job.org (free) every 30 min 09–20 IST with the
Vercel daily cron as backup; the posting seat always posts; the approval rule stays; on-time % only for the tech / main admin; only
they turn it off (with a reason, the owner told); the button shows in Preview to the admins, team leaders and the Social Media Team
Lead, at Live to all six roles; the last screen used is remembered per browser (`dts_smm_ui`).
**Phases 2–4 (2026-10-15) — the new screen, the writes, the alerts.** (6) **The button and the page.** The classic page's ONLY
change: **✨ Delivery Control** (`smm-open-control`, tagged Preview / New) beside Add SMM sale (`utils/smmControlAccess`
`canSeeControlButton`: Off → the two admins, Preview → admins / team leaders / the lead, Live → all six), and a plain `/smm` reopens
Delivery Control when that was this browser's last screen (`components/smm/control/smmUi`, `dts_smm_ui`; **← Classic view** sets it
back). Routes `/smm/control` and `/smm/control/:monthId` (App.tsx, static segments before `/smm/:campaignId`, the six SMM roles),
lazy page `pages/shared/SmmDeliveryControl.tsx`, parts in `components/smm/control/`. One data hook (`useDeliveryData`): the settings,
the months with snapshot metadata (`services/smmDelivery.watchDeliveryMonths` — the classic board's two queries, shared by the SDK),
holidays around the months (`holidayWindow`), `smm_alert_state` (everybody's for overseers, own for others), the people on the months +
the leads (users by id; `watchSmmTeamLeads` + one team-leader read) and today's presence (the Attendance board's sources → `presenceFromToday`).
The view rules are pure: `utils/smmDeliveryView` (`buildControlBoard` = one pass of `planMonth` / `taskProgress` / `monitorSmm`; `controlViewOf`
member / lead / team_leader / admin / salesperson / sales_admin; `tabsFor`; `tilesFor`; `todayCards`; `weekCells`; `teamCards`; `startingLineRows`;
`alertLog` + `delaySummary`; `monthSentence`, `dayOfMonth`; the five marks ✔ ◷ ⚠ ✖ ⏸ with words; `liveSinceOf` = the server's
`smmDeliveryBaseline.liveSinceAt`). **Frame:** status line (Preview / Live / Off, "Supervisor checked n min ago" from `lastRunAt`, red
for managers after 45 min or never in Live), an offline line, the Preview banner, count tiles that filter Today (per role), sideways tabs,
everyone lands on Today; each tab sits in an error boundary ("couldn't load — the classic view still works"). **Today:** one card per
client-week, groups Week ends today · Late · Checkpoint missed · This week · Next week · Waiting on client · Extra work with no date ·
Done (collapsed); rows with type, state words, next checkpoint, ONE main button (Start / Sent to client / Client's answer / Footage /
Posted… / Why late? / Details) and ⋯ (Do it now / Need more time, Blocked, Move, Reassign, details, classic month page); the lead,
team leaders and admins can show it by person; admins "Needs you"; members "My week" (AI); others the morning brief (AI); the
salesperson's Today is the client's side + Reports due (week 4) + On hold renewals. **Weeks:** one row per client, worst first, four
cells "1 + 1 · due Wed 28 Oct" with a mark per piece (⭐ extra), the current week ringed, "+n promised, no row", "not switched on",
On hold at the bottom. **Client plan:** header (Day x of y, week, team, salesperson, one sentence), "would be set — not saved" /
"switched on", the data health check, **Switch on this month** (managers; confirm), Re-plan (Live), Client's weekly update (AI
draft), weeks 1–4 with each type's checkpoints in words, extra work, the client's pending work, owed from last month, moved out,
bunched days, and **Titles & ideas** (AI, accept ticked rows). **Piece sheet** (`PieceSheet`, bottom sheet on phones): the step
timeline (footage → sent → approved → scheduled → live, each with its day, owner, done-at and "Missed — counts against …"), quick
stage buttons (Start, Sent to the client, Mark scheduled, WhatsApp the approval message, **Make it in the AI studio** — phase 7),
Billed / Free for extra work, the answer forms (Do it now / Need more time, Why late with an optional new time, Blocked + confirm /
clear, Move to a week / a client's day / out of the month, the client's answer with who + how + screenshot, Posted with a link box
per account checked against that site or "no link — why?", Footage, Reassign with each candidate's load and leave), history, and the
classic page link. Read-only in Preview / Off ("answers switch on when Live"); "View only" for the lead on others' months. **Team:**
a card per person — today's presence, clients, due / late / waiting, this week's load vs the limit, today's answers, Call / WhatsApp,
Remind (Live; the lead and managers), on-time % (tech / main admin only), the Flow-credit line (AI-account managers); for the sales
admin a Salespeople list. **Starting line:** pieces late at switch-on (Preview: switching on now) — managers catch up in a week (this
week + 2) or keep as pending work. **Alerts log:** the supervisor's alerts now (Preview "would get") + every answer, a sentence on
client vs team delays, the AI reasons summary (7 days). **Settings** (`SettingsTab`; tech / main admin edit, team leaders view):
Off / Preview / Live (Off asks a reason), "Switch them all on" in Live, the supervisor's last check (`lastRunSummary`), the pilot
group, deadline hour, checkpoints, quiet hours, every ladder number (`tunablesInputProblem` / `tunablesProblem` live), the weekly rule
in words, **Send me a test alert** (a bell + push to self, `smm_test`, and the real full screen with Close), the **30-day rehearsal**
(`rehearseSmm` on the loaded months), the switch history.
(7) **The writes** (`services/smmDelivery`, rules in `utils/smmDeliveryActions`, every one ONE transaction through the now-exported
`smm.mutateCampaign`, so the approval rule and the view-only lead's guard hold; who is signed in from the auth store):
`switchOnMonth` (managers; `switchOnProblem`; plans only the planner's pieces — `activationItems`, by "auto" — never a dated piece or
`uploadDate`; `delivery {activatedAt, activatedByName, baselineAt, rule}`; once), `switchOnMonths`, `replanMonth` (only `by:"auto"` rows;
accepted titles carried), `answerEta` (`etaAnswer`: focus 45 min renewed once a day, more time today only ×2, never past the deadline),
`answerBlocked` / `confirmBlocker` / `clearBlocker` (the clearer: salesperson / sales admin for the client's side, the lead, managers),
`answerLate`, `saveCheckoutReasons` (per month), `setFootage`, `recordApprovalWithProof` (classic `recordApproval` + `approvalProof`; the
salesperson told when the tech side records it), `markPostedWithLinks` (`postLinkProblems`, then classic `setItemStatus("posted")`),
`movePiece` (`moveCheck`; another week needs a reason and the Social Media Team Lead is told `smm_moved`; a late piece only by a manager;
a client's day = `fixedReason "client_asked"`; "out" = the planner's `movedOutOf` — not chased here, carried next month), `reassignPiece`
(managers; `reassignCheck`; `smm_reassigned` to the new owner; eta / blocker cleared), `decideStartingLine` (catch-up week or kept as
pending — the monitor then leaves it off the list), `acceptPlanSuggestions` (titles on `plan`, never over the team's own title; a festival
in the piece's week fixes its day), `answerAlert` (`smm_alert_state/{uid}`, own doc, entries > 14 days dropped), `remindOwner` (`smm_remind`,
once a day), `sendTestAlert`, `fetchServerNow` (the `/version.json` Date header, for the clock check). The classic writes leave stamps:
`setItemStatus` / `requestApproval` → `startedAt` / `madeAt` once (`statusStamps`), `recordApproval` changes → `revisions` +1.
(8) **The alerts** (`components/smm/alerts/`): `SmmAlertHost` (AppLayout, own error boundary, the six roles, not outside creators) is a
light gate — Live and in the pilot group (`coveredByDelivery`) — that lazy-loads `LiveAlertHost`: the supervisor on the person's months
(`buildControlBoard`), `screenFor` their full-screen alerts, `screenProblem` (synced within `freshMinutes` + the device clock against the
server's) → **AlertScreen** (`role=alertdialog`, z-90, every alert worst first, the level in words and colour, never closed; answers by
audience: owner Do it now / Need more time / Why late / Blocked / Open; salesperson WhatsApp (logs a chase) / Call / Approved or Changes
(how) / Not answering; footage Received / Client says later / Won't send (pending); extra Billed / Free; blocked Confirm / Cleared; lead
Call / WhatsApp / Remind / I'm on it / Escalate; sales admin Call salesperson / client; admins Reassign or set up / Call / I'm on it;
marketer Open the ads) — through the popup coordinator (`tryOpenPopup("smm_alert", { urgent: critical })` — `urgent` skips only the
10-minute gap), retried every 20 s; in the AI studio, on `/smm/control*`, or on stale data a **red bar** instead ("They show when you
leave the studio", "Showing 10:42 data — alerts paused"); a new alert sounds once per device (WebAudio + vibration, BroadcastChannel
`dts_smm_alert_sound`) and the tab title blinks. The host never writes. **Old reminders:** `DeliveryCoverage.UnlessCoveredByDelivery` —
covered people get no 11 AM / 5 PM status check (AppLayout), no due card / due bells at check-in (a line pointing to Delivery Control)
and, at **check-out**, `CheckoutSmmReasons` instead: every piece of theirs due today, late or behind a checkpoint (`checkoutTasksFor`) needs
a one-tap reason (+ optional new time), Submit waits for all, saved by `saveCheckoutReasons` first (a failure never blocks leaving).
`useSmmDeliverySettings` (its own light file) reads the switch; a refused read = Preview defaults.
**Phase 5 (2026-10-15) — the AI layer.** `utils/smmAiRules` (pure, alias-free), `services/prompts/smmDelivery`, `services/smmAi` (lazy via
`control/ai/aiLoader` — never downloaded by the classic pages), parts in `components/smm/control/ai/` (`AiTitlesPanel`, `BriefCard`,
`ClientUpdateDialog`, `ReasonsSummary`). The rules fix counts and deadlines; the AI writes a title, idea, caption and hashtags per piece and
may theme a piece for a festival in its own week. Every answer is checked in code: unknown pieces dropped; 60 / 200 / 400 characters and 8
hashtags; no phone number, price, percentage, offer word, other number or town the team did not type on the month; no repeat of the last 2
months' titles (`fetchClientMonths`); a festival only inside its week, on the calendar, not past, not on a fixed piece, once per day, never a
regional day from elsewhere or an eve. A person accepts (ticked rows only; Preview "would set — not saved") → `acceptPlanSuggestions`.
Briefs: My week (once per person per week, `dts_smm_week_brief_<uid>_<Monday>`) and the morning brief (`dts_smm_morning_<uid>_<day>`) — code
fills the numbers into the AI's sentences and a number that disagrees falls back to the plain template; the reasons summary (client vs team
delays); the client's weekly WhatsApp draft (English / తెలుగు; the AI writes only the opening and closing). Gemini failing / slow / unusable →
blank titles, plain templates, a line saying why; nothing waits for the AI. 2027 festival dates: `utils/festivals.FESTIVALS_2027`
(`FESTIVAL_CALENDAR` = all years, read by `posterOccasions` and the health check; `FESTIVALS` stays 2026-only for the sales dropdowns).
**Phase 6 (2026-10-15) — the server checker.** `api/smm-monitor.ts` runs the same supervisor when every app is closed: woken by cron-job.org
every 30 min 09:00–20:00 IST, with the Vercel daily cron (04:30 UTC = 10:00 IST, `vercel.json` `crons`) as backup, protected by `CRON_SECRET`
(`Authorization: Bearer` or `x-cron-secret`). Off → heartbeat only; Preview → computed, nothing sent; Live → each due alert (not watch)
created once as `notifications/{key}` (`smm_urgent` full screen / `smm_notice`) and pushed once per device (high priority, channel
`smm_urgent` only to tokens flagged `channels: "smm_urgent"`; the service worker shows it with requireInteraction). Presence is the
Attendance board's rule on the raw documents (`utils/smmServerPresence`, parity-tested); the starting line `utils/smmDeliveryBaseline`
(the month's `delivery.baselineAt`, else when it last went Live, else now); answers from `smm_alert_state`. It writes only notifications,
the heartbeat (`lastRunAt` + `lastRunSummary`) and dead tokens. Every runtime relative import on its chain ends in `.js` (Node ESM on
Vercel); `smmServerCheckerOct15` enforces it. Pure parts in `utils/smmServerDelivery`.
**Phase 7 (2026-10-15, the owner: "complete everything") — three extras.** (a) **Make it in the AI studio** from a piece (the maker's own
month job via `smmAssign.fetchMyMonthJobs` → `monthJobLink`; marks it being made). (b) **The Flow-credit forecast** (`utils/smmCreditForecast`,
`control/CreditForecast`): this week's / next week's AI videos still to make × clips × 12 credits against the credits left in the Flow
accounts the maker holds — ok / tight / short / no accounts — on a member's Today and on the Team cards (AI-account managers only).
(c) **One-tap client approval in the client's chat:** for a Social Media month the chat id IS the month id, so `/c/<id>` shows "n posts are
waiting for your approval" (`components/order-chat/ClientSmmApprovals`) with ✔ Approve / ✎ Changes (what to change); `api/order-chat`
`smm-approvals` / `smm-answer` (guest token only, `isGuestOf`) record it in a transaction exactly like `recordApproval` + `approvalProof`
via the client chat (`utils/smmClientApproval`, alias-free) and tell the publisher (approved) / maker (changes) and the salesperson.

## 24. BUSINESS RULES (IMPLEMENTED; verified in code)

- **SMM Delivery Control's switch (owner, 2026-10-15, decision 14):** only the tech admin and the main admin may turn it
  Off, Preview or Live or change its numbers; turning it off needs a reason, and the owner (every other main admin) is told
  who did it and why. Until somebody saves a setting it is in Preview, which saves nothing and alerts nobody. Enforced in the
  service and in the `app_settings` rule (once published); on screen in Delivery Control → Settings (2026-10-15).
- **SMM weekly tasks (owner, 2026-10-15, decisions 1–6; on screen in Delivery Control and alerted in Live):** a client's
  month is four weeks of its own (days 1–7, 8–14, 15–21, 22 → the day before the renewal day); each kind's promise is split
  ÷ 4 with leftovers to weeks 1, 4, 2 (4 → 1 a week, 6 → 2,1,1,2, 8 → 2 a week); a week's deadline is its last working day
  (Mon–Sat, not a company holiday) at 7 PM; a festival post, extra work and a date the client asked for keep their own date;
  a first month posts from day 4 and has no real video in week 1; carried pieces go first; a date the team typed is kept. A
  late piece counts against the first checkpoint missed — the maker (not sent), the client (approval / footage), the publisher
  (approved, not posted); client delays never count against the team. Alerts climb owner → leads (+1 working day) → tech /
  main admin (+2), the client's side goes to the salesperson / sales admin, nobody away or in quiet hours is alerted (only a
  critical passes quiet hours), and lateness that existed when a month is switched on never escalates.
- **SMM Delivery Control's screen and answers (owner, 2026-10-15, decisions 7–16):** the classic Social Media stays as it
  was, with one button to the new screen (Preview: admins, team leaders, the Social Media Team Lead; Live: all six roles; the
  last screen used is remembered per browser). A full-screen alert is answered, never closed; "Do it now" quiets it 45 minutes
  (renewed once a day), "Need more time" until the evening (twice a piece), "Blocked" until whoever must clear it acts (24 hours
  unless they confirm). Moving a piece to another week needs a reason and the Social Media Team Lead is told; a late piece or one
  leaving the month moves only by a manager; a 3rd reassign needs the tech / main admin. "Posted" needs a link on each account or a
  reason. At check-out a covered member gives a reason for each piece due, late or behind before checking out; their 11 AM / 5 PM
  check and due card step aside. The client may approve a post with one tap in their own chat link (still the client's approval).
  On-time % is shown only to the tech admin and the main admin. Switching a month on is a manager's act and saves its plan once.
- **Popups take turns (owner, 2026-10-15):** a popup the app opens by itself that can wait — the 11 AM / 5 PM post check, and
  later the SMM alerts — never covers a call, the AI studio, another popup or a window the person opened, and comes at least
  ten minutes after a different popup closed. The check-in gate, the agreement gate, the update popup and the others show
  exactly as before.

- **SMM dates (owner, 2026-10-15):** a month is shown and billed "6 Sep → 6 Oct"; its own days are 6 Sep – 5 Oct and
  6 Oct is the renewal day — the next month's first day, and the day the old month has ended (On hold when nobody
  renewed it). Its work is due by the end of its last own day. A billing day a short month moved (31st → 28 Feb) comes
  back the next month. The SMM sale says when the month starts: a renewal on the old end date (also when recorded late;
  never earlier; a later day is said in days), a new client on the sale day unless the salesperson changes it. A
  month's dates change only one checked way: never overlapping another month of the client, never leaving posts
  outside the new dates unless the person sees the list and keeps the dates anyway, an ended month only within the
  past. A post counts for the month its upload date falls in; one dated outside is shown and not counted, and an admin
  or team leader can move it to the client's month it belongs to (the month it left still owes it). Ad reports count
  the month's own days. Filing a month as history takes back its untouched jobs (started ones stay, named). A used
  extension stays used; a month's extension starts at 3 days.

- **SMM "Create next renewal" (owner, 2026-10-13):** only the main admin and the tech admin see and may use it (the
  next month made directly, with no sale behind it). The team leaders and the Social Media Team Lead do not. The
  salesperson renews with their own Renew, the renewal sale (approval and commission as before). Enforced in the
  screens and in `createRenewalMonth`.

- **SMM Team Lead, view-only (owner, 2026-10-12):** the Social Media Team Lead sees every month and every person's
  work on it, but on a month somebody else works she changes nothing — no edit, delete, setup, assigning, messages to
  the client or management of that person's work. On a month she is personally on she has exactly a member's working
  rights (and, like a member, no setup, assigning, renaming, moving pieces or deleting). She adds no month (the
  "month that had no sale" went back to the three admins) and keeps Edit team on the Attendance board. A Tech Team
  Leader or admin who also has the flag keeps their role's full rights. Enforced in the screens, in every service
  that writes a month (refused with "View only — …"), and in the Firestore rule (once published).

- **SMM attendance (owner, 2026-10-08):** the Social Media Team Lead (and the tech / main admin) sees, in Social
  Media, TODAY's attendance of the Social Media team before her daily meeting — who has not checked in (with Call and
  WhatsApp), who is not coming (leave, a leave request, absent), who is present and since when — and cannot change a
  day; marking days, leave and holidays stay with the admins. The team is everybody working on a Social Media month on
  the board (its seats and its posts), which the lead may correct by adding or taking off people.

- **SMM On hold (owner, 2026-10-05):** a month whose last day has passed with no renewal decision is **On hold** and
  stays on the board until its salesperson renews it (then it is filed as renewed) or marks the client as not
  renewing (filed as not renewed). A past month added afterwards is on hold too when nothing follows it; it is filed
  once the client has any later month. Add SMM sale shows every month already on the client's number with Open
  month, and a month refused for overlapping dates links to the month it overlaps.

- **SMM renewals (owner, 2026-10-05):** "renewed" follows the renewal sale — a renewal sale deleted,
  rejected or taken back puts the month before back to "no decision" (and back on the board), and the sale
  coming back renews it again; the tech side tidying the renewal month or its order away leaves it renewed. The salesperson sees their
  running clients, the month's renewals (renewed / waiting / not renewing) and the money: their 5% or 10% of
  each renewal sale — an estimate at the rate of that pay period (2026-10-15), paid once verified and collected and
  the period reaches 75% of its target. Social Media → Money (company renewals in rupees,
  per salesperson) is for the main admin, tech admin and sales admin only. Everybody holding a seat on a
  running month is asked at 11 AM and 5 PM to update the status of every post not live yet.

- **SMM client calendar (owner, 2026-10-05):** one calendar per client across all their months, paged by
  calendar month like a phone calendar (‹ › and Today always there), plain enough for anybody — three marks
  only (✔ posted, ✖ not posted, ◷ coming up), each with its word; the counts are the posts on the days on
  screen; a person sees only the months they can already open; **every post sits on its upload date**
  (never on the day Posted was pressed); a post whose day has passed without going up is "not posted".
- **SMM accounts (owner, 2026-10-05):** the tech side sets which accounts a month covers in setup; a post
  already live keeps the accounts it went on; at least one account is required.
- **SMM past months (owner, 2026-10-05):** the Social Media Team Lead may add a month that had no sale (but
  never record a sale — and since 2026-10-12 not even that: she is view-only); a past (history) month keeps who did its work by name — never a job card — and they
  can see it and fill it in; on a past month a post is marked posted without the client-approval step, but
  only with the day it went up; a running month keeps the approval rule; an earlier month added later joins
  the client's run (Month 1 → 2 …).

- **SMM deletion and lead (2026-10-01, team leader added 2026-10-03):** the main admin, the tech
  admin and the tech team leader delete a month (the Social Media Team Lead too until 2026-10-12); a deleted sold month never
  comes back with its sale; only the tech admin and main admin appoint the team lead; extra work always
  says what it is (and a video its length), and the seller is told.
- **SMM months (owner, 2026-10-03):** every month is a sale — recorded by the salesperson or, by the
  tech admin / team leader / main admin, on the salesperson's behalf (their sale, Sales Approvals,
  existing 5%/10% commission). A sale already recorded is set up, never recorded again (no double
  commission). A month runs from its start to the same date next month — that date is the renewal day,
  not one of its own days (2026-10-15). Clips per video default 4
  (32 s); every job of the month is made at that length. Only the month's salesperson renews, as a
  sale; the next month starts on the old end date with the same team; the old month closes on its
  renewal day. A number held by another salesperson is refused. The tech side cannot record a new sale
  for a client who already has months (that is a renewal). The tech side may rename a month and change
  how many videos/posters it owes; a worked row is never removed. A deleted month can be undone for 5 s.
  The one exception — **a month that had no sale (owner, 2026-10-03):** a client served before sales
  were recorded in the app is added by the tech admin / team leader / main admin (the Social Media Team
  Lead could from 2026-10-05 until 2026-10-12) with the salesperson's name: amount 0, counted in nobody's revenue or commission, shown in the salesperson's login with its
  dates. It cannot start in the future, overlap any month of the client, cover a recorded sale's dates,
  or come after a recorded sale. Its next month is the salesperson's Renew — a sale. A month's deadline
  is its last own day (the day before the renewal day, since 2026-10-15), on the order and every job, including a
  renewal's; a later edit or approval of the sale does not change it, nor does a later setup save undo a used extension.
- **SMM work lives in Social Media (owner, 2026-10-04):** a tech member's social-media month is never
  listed in My Work or Recent Ads; they open it from the month's page ("Your work on this month"), which
  uses the same studio, code, credits, completion and Drive step, and returns them to the month.
- **SMM renewal popup (2026-10-03):** from 3 days before a month's renewal date through the day itself,
  the salesperson who sold it gets the countdown + work-report popup once a day (per month, per device)
  until there is a decision (a renewal linked, won or lost — a pitch is not one). Once the date has
  passed it stops; the dashboard card (every month ending this calendar month, and earlier ones still
  undecided — since 2026-10-05) and the board carry it from there.
- **SMM status words (owner, 2026-10-04):** every client card says one status — **Off track** when any
  post is past its date (or the month ended with posts not live), **At risk** when it is behind the
  month's calendar with nothing late, **On track** otherwise, **Completed** when every promised post is
  live, **Not started** before its first day, **Needs setup** when nobody is assigned — with a one-line
  reason, and the board lists the worst first. Extra work never counts toward a month's progress.
- **SMM:** nothing is scheduled or posted without a recorded client approval (enforced in
  `setItemStatus`); month quotas are 2 posts + 2 stories per video (`smmQuota`; stories target
  now 0 for plan-derived months); campaigns run on the video count; the real-video add-on is
  `SMM_REAL_VIDEO_RATE = 500`.

## 25. CURRENT IMPLEMENTATION STATUS

**PARTIALLY IMPLEMENTED 🟡:**
- SMM Delivery Control (2026-10-15): **all phases built; it starts in Preview** (no settings document = Preview: nothing saved,
  nobody alerted — an admin goes Live in Settings). Not done / limits: **nothing was checked against live Firebase, real FCM, a
  Vercel deploy, cron-job.org or an Android phone** — the owner must set `CRON_SECRET` in Vercel and the cron-job.org job (until
  then alerts reach people only while the app is open, and the bell / push rows are not written); the `smm_urgent` Android channel
  needs a new APK; the full-screen intent on a LOCKED phone needs native Java (not written — `MainActivity`, the messaging
  service, `canUseFullScreenIntent`, the setting link). The studio strip shows during the whole studio visit (the full screen comes
  on exit, not "between runs" — the studio claim has no running flag). A month not switched on is still supervised in Live from
  when Live began (its weeks computed each time, not saved). Moving a piece to another week does not change its classic post date
  (the sheet says so). "Out of the month" is a flag — the piece is carried with the classic "Move them here". The Alerts log is
  "now" + the recorded answers (the app keeps no per-person alert history; the server's bell rows are that). The client's chat
  approval needs the chat id to equal the month id (true for sold months and months with no sale); it lists the pieces — the files
  are in the chat above. The Flow forecast assumes 8-second clips at the configured rate. The AI parts were checked in jsdom and
  live against Gemini (two runs). The phase-1 limits stand: an unanswered late piece repeats every 2 h (the rehearsal's worst case
  is above 3 a day by design — answers stop it), a half day is "in" while checked in, "Need more time" lasts until 8 PM, the weekly
  load limit 12 is a starting number. The coordinator is per tab and in memory; a reload forgets the 10-minute gap. Checked by
  `smmCadenceOct15` + `smmMonitorOct15` (158), `smmDeliveryServiceOct15` (21, memory Firestore), `smmDeliveryViewOct15` (15),
  `smmDeliveryControlUiOct15` (10 — the real page, alert host and check-out step in jsdom), `smmDeliveryPhase7Oct15` (7),
  `smmAiOct15` + `smmAiUiOct15` (58), `smmServerCheckerOct15` (44, a mocked firebase-admin), phase 0's suites, and a
  real-browser harness (DEVELOPMENT-HISTORY).
- SMM dates (2026-10-15): data already wrong is not repaired by itself (no migration) — the owner's Dhana lakshmi month
  still holds 6 Oct → 6 Nov until an admin puts it back to 6 Sep → 6 Oct (Months to check → Open → Edit setup; the check
  lists its posts dated outside) and corrects its posts' dates; ends that drifted to a short month's day (28 Feb → 28 Mar)
  stay until edited. Months saved before are read with the new rule, so on their renewal day they read "ended" one day
  earlier than before. **Months to check** sees only months in the live list — damage in filed (renewed / completed)
  months is not listed. The overlap check reads the client's months just before the transaction (a month made in that
  instant is not seen); the posts and the lock are checked inside it. A month moved wholly into the past by Edit setup
  (not locked before) stays a running month On hold with overdue jobs — filing it as history is Add SMM sale's / Manage
  historical record's job. The ring leaves moved pieces out while the kind bars and the report still count the sold
  commitments. A posted piece with no upload date counts as inside its month for delivery, but the dates check judges it
  by the day Posted was pressed. Not changed: the client renewal template's "finishes on {endDate}" (billing words),
  `smmPackage.boardStats.running` (no screen; still counts months not started), and the calendar marking an ended month's
  unposted piece "Not posted" even when dated after it. The renewals card prices a renewal at its renewal day's pay
  period, not the day its money was collected (the card reads months, not payments). Checked by unit, service (in-memory
  Firestore) and jsdom tests (`smmDatesOct15`, `smmDatesUiOct15`, `smmSetupChecksOct15`, `smmStartDatesOct15`,
  `smmSetupChecksUiOct15`, `payLeftoversOct15`; the real-browser check is in the 2026-10-15 history entry) — not against
  live Firebase or the owner's real month.
- SMM "Create next renewal" (2026-10-13, main + tech admin only): the service reads who is signed in from the auth store,
  like the lead's guard. Nothing in `docs/firestore-rules.md` limits creating an `smm_campaigns` document to the two
  admins, so a script that bypasses the app could still write one. The month it makes has no order and no sale, as it
  has had since 2026-10-12. Checked by unit tests, the service on the in-memory Firestore, the real board, month page
  and setup dialog for each role (`smmCreateRenewalAdminOct13`, `smmAddSaleUi`) and a browser harness — not against
  live Firebase.
- SMM Team Lead view-only (2026-10-12): the services read who is signed in from the auth store, so a script or a
  browser console that bypasses the app reaches Firestore with only the rule in `docs/firestore-rules.md` in the
  way — and that rule protects nothing until it is published (publication [NOT CONFIRMED]). The rule checks
  `watchers` / `soldBy` (the app writes `watchers` with every team change); the screens and services also count a
  seat. "On the month" means a seat or `watchers` — a person given only a post (`makerUid` / `publisherUid`, no seat)
  is not on it, for the lead as for any member (as before). Her board files and repairs only her own months; the
  admins' boards do the rest. Checked by unit tests, service tests on the in-memory Firestore and the real month page
  rendered for her (`smmLeadViewOnlyOct12`), plus a browser harness — not against live Firebase or the published rule.
- SMM attendance (2026-10-08, the TODAY board): today only — earlier days stay in Team Attendance. "Not checked in"
  is the same at 10 AM and at 10 PM (no office start time exists in the app, so nobody is called "late"). Team leaders
  never check in, so their day is "no check-in record". A check-in is read from `daily_checkins` only (the team holds
  tech roles). Call / WhatsApp use the profile's `phone`; a member without one gets "No phone number on their
  profile". The team list follows the months automatically; the lead's corrections are one company-wide list
  (`app_settings/smm_team`), not per lead. Checked by unit tests, the real board on the in-memory Firestore and a
  real-browser harness (the lead, the tech admin and a team leader without the flag; 1440 / 390 / 360 px, dark and
  light; a live check-in; Edit team; a holiday) — not against live Firebase or a real phone's dialler / WhatsApp.
- SMM On hold (2026-10-05): "a later month follows it" is decided where the client's months are in hand — at
  setup, and by the overseer's board sweep for later months that are live — so a history month whose only later
  month is already filed (renewed / not renewed) stays on hold until somebody decides it. A month that ran in the
  app is never filed for a later unlinked month (the salesperson decides). On hold months are counted in the
  board's tiles and cards but not in Insights, the salesperson's renewals card or the Money tab, which still
  leave history months out. A past month on hold rings the salesperson's daily "Social media month has ended"
  bell like any ended month — as history months always did (`renewalsDueFor` never left them out).
- SMM renewal money (2026-10-05): the card and the Money tab count a renewal's money from the month
  documents (next month's `amount`), not from collected payments, so "₹ from your renewals" is the
  commission the renewal is worth, not what payroll has paid (that follows `useSalesEarnings`: verified and
  collected, with the target gate). Since 2026-10-15 each row is priced at the rate of its pay period (an estimate,
  still not gated per row — the card says so). History months are left out of renewals. A renewed month whose next
  month is a filed month the viewer does not hold is valued at its own price. The post-status popup is
  in-app only — at 11 AM a closed app gets nothing until it is opened (no scheduler / push at a time); "done"
  is remembered per device, and nobody can see who answered it.
- SMM month jobs (2026-10-04): opened from the month page only. A member cannot undo a month job they
  handed in by mistake (My Work's Undo was on its Completed list) — the admin sends it back for edits.
  Only a `tech_member` gets the panel (the studio link is My Work's route); a team leader on a month's
  seat had no My Work before either. A month job linked by an order whose month was never created
  (sold before the section existed) is hidden from My Work with no month page to open it from.
  Deleting any month leaves its members' job cards in place (as it always did for sold months).
- SMM client cards (2026-10-04): a status is worked out in the browser from the plan, so it is only as
  true as the plan — a post nobody gave a date can never be late, and a month whose rows were never
  planned shows them as "Not started". At risk uses the month's even-pace rule (`paceOf`, rounded down),
  so a month is called behind only for a whole post its calendar says is due by today.
- SMM Insights (2026-10-04): it draws only the months in play (active, not history) — finished
  months are read on demand, never live — so "posts a day" and the ads trends count the months running
  now; a month closed in the last fortnight drops out of those trends. A post's day is its upload date
  (since 2026-10-15, `smmPlan.postedDayOf`), else its `postedAt` stamp, else its planned day for posts marked before the
  stamp existed. Team load counts a piece for its
  own maker/publisher, else the month's content and posting seats; a marketer-only member shows "No posts
  of their own".

- SMM client calendar (2026-10-05): it is only as true as the plan's upload dates — a posted piece shows
  "Posted on <its upload date>" even when it really went up later (the app records only when Posted was
  pressed, not when it went live); a date typed wrong shows on the wrong page, flagged "Its date is outside
  Month 1 (6 Sep – 5 Oct 2026)" when it falls outside its month's own days. Since 2026-10-15 such a post is also not
  counted for its month, is tagged in the Content list, and can be moved to the client's month it belongs to (the
  owner's Dhana lakshmi month: its dates put back with Edit setup, then its posts' dates checked — §25 "SMM dates"). Months are
  joined by the client's number, so a client recorded under two numbers shows as two clients, and a very
  old month with no number is a client of its own. Overseers see finished-only clients after asking for
  them (one read of every finished month, as the Finished tab already does). No print / export of the
  calendar. Where a post is held up (with the client, being made) is said in words on the day, not shown
  as a mark — by the owner's choice of three marks.
- SMM past months (2026-10-05): a past month is filled in one post at a time (open it, give the day it went
  up, Posted) — there is no bulk entry. A filled-in post's `postedAt` is the day it was filled in (the
  calendar uses its upload date). The people on a history month get no notification (they find it in
  Social Media — on the board On hold while nothing follows it, else under Finished). Months more than a week
  apart are not linked (a client who came back after a gap — the earlier one is still filed, not on hold), and a
  run is renumbered only from the added month forward.

## 27. POTENTIAL RISKS (need verification)

- SMM Delivery Control (2026-10-15): **reads** — the server checker reads ~150 documents a run (≈3.5K a day at 30-minute runs) and
  each heartbeat re-fires every open app's settings listener (one read per open app per run); the page and the alert host reuse the
  board's month queries (shared by the SDK) but add holidays, `smm_alert_state` (all docs for overseers), users by id, today's
  check-ins / marks / pending leave, and — on Today / Team — Flow accounts. **Rules** — `smm_alert_state` has its own rule (own write;
  overseers read) in `docs/firestore-rules.md`, kept out of the catch-all; the server's notifications and heartbeat are Admin SDK
  writes. Until the rules are published any staff account can write any `smm_alert_state` doc (a fake "I'm on it" holds an
  escalation 4 h). **Node ESM** — `api/smm-monitor.ts` and `api/order-chat.ts` import the alias-free utils with `.js`; a new
  runtime import on that chain without `.js` breaks the function only on Vercel (`smmServerCheckerOct15` and
  `smmDeliveryPhase7Oct15` assert it). **The client approval** (`api/order-chat` `smm-answer`) trusts the room's guest token —
  anybody holding a month's chat link can approve its posts (the same bearer-link model as the chat itself). **The monitor runs in
  the browser** on every snapshot for the alert host (an overseer's = every active month); with a few hundred months that is real
  work per change. The AI may still word a title or caption badly — a person accepts each one.

- SMM Delivery Control's settings (2026-10-15) gave `app_settings` its own rule in `docs/firestore-rules.md` (staff read and
  write as before; `smm_delivery` only the main / tech admin) and took it out of the catch-all. Every other document there is
  written from whoever's browser does the job (the lead's Edit team, the notification clean-up claim, the hold record, the
  clients back-fill, the ad languages, the Flow numbers) — if the published rule ever differs from the doc, those writes are
  what to check first. The server checker (phase 6) must write `lastRunAt` with the Admin SDK.

- SMM dates (2026-10-15): "the end date is the renewal day" lives in the app's helpers (`smmPlan.lastOwnDay` /
  `daysLeftInCycle`, `smmPackage.cyclePhase` / `isMonthLocked`, `smmMonthDates`) AND in SMM Delivery Control's alias-free
  copy (`utils/smmCadence.ownDaysOf` / `monthExclusion`, parity-tested with `isOnHold`); a change to one needs the others.
  `setupSaleMonth` and a date change now read the client's months first (one `clientPhoneId` query), and
  `movePieceToMonth` writes two months in one transaction (needs a connection).

- On hold (2026-10-05) puts history months back into the overseers' live `status == "active"` listener (a few
  reads more per board load, one per client's last month) and writes the one-time `app_settings/smm_history_hold`
  record plus those months' status from the first overseer's browser (catch-all rule). Checked by unit tests,
  service tests on the in-memory Firestore (`smmOnHoldOct05`), UI tests and a browser harness on the real pages —
  not against live Firebase, so the owner's AIRAVATH document itself was not read: it is on the board after the
  first overseer opens it if it was a history month (`completed`), already on it if it ran in the app, and under
  Finished if it was renewed or marked not renewing; Add SMM sale shows it in every case.

- Un-renewing (2026-10-05) writes the PREVIOUS month from whoever removed the renewal — a salesperson
  deleting their sale, a sales admin rejecting it — so a rule limiting `smm_campaigns` writes to the team
  would leave the link (the board / month page repair it later for a viewer allowed to write). The Money
  tab's `cycle.endDate` range query relies on the automatic single-field index. Checked by unit tests and
  service tests on the in-memory Firestore — not against live Firebase.

- Back-filling an earlier month (2026-10-05) writes the LATER months of the client's run from the browser
  (`renewalOf`, `monthNumber`, best effort — a failed link leaves the two months unlinked, as before).
  Fine under the catch-all rule. A month a person was named on by Edit setup on a history month is
  immediately visible to them (`watchers`). Checked by service tests on the in-memory Firestore
  (`smmHistoryOct05`), UI tests and a browser harness on the real pages (the Team Lead's lookup, a history
  month with its people, a post filled in, Edit setup, August added in front of September and paged to on
  the calendar; 1440 / 390 / 360 px, no console errors) — not against live Firebase.

- The client calendar reads a client's months with `where clientPhoneId ==` and filters what the viewer
  may see in the browser, so a member's browser receives that client's other months before they are
  hidden (the month page could already be opened by id; Firestore rules are the catch-all). A rule that
  limits `smm_campaigns` reads to `watchers` would make that query fail for members — the calendar then
  says it could not load the other months and shows the one on screen. Checked by unit/UI tests on the
  in-memory Firestore and a browser harness (version 3: 1920 / 1280 / 1024 / 800 px with the 240px sidebar,
  412 / 390 / 360 px phones, dark and light, month page, Report tab and board, keyboard, swipe and the
  month list) — not against live Firebase.

- SMM (2026-10-03) writes across roles from the browser: the tech side writes a sale onto a
  salesperson's lead ("Add SMM sale"), and a salesperson's renewal sale creates the tech team's jobs
  (`linkRenewal` → `assignSmmMonth`). Fine under the catch-all rule; any rule restricting `leads` or
  `work_assignments` writes to their owner would break both (noted in `docs/firestore-rules.md`).
  History months mark their order `verified` with no job behind it. Unposted pieces are moved to the
  next month only when somebody presses "Move them here" — nothing moves on its own. Months started
  directly before 2026-10-03 have no renewal sale; set up again, their team now gets job cards.
  Checked by unit/service/UI tests and a 35-step browser run on the in-memory Firestore — not against
  live Firebase or push delivery.
- The renewal popup remembers "seen today" per browser (localStorage), so a second phone or a cleared
  browser shows it again the same day. Checked by unit tests and a browser harness on fake data at
  1440 / 1280 / 412 / 390 px — not against live Firebase.
- A month with no sale is a UI-level rule like the rest: the tech side could still add a client's
  CURRENT month as no-sale instead of the salesperson renewing it, when that client has no sale recorded
  in the app yet — the clash rules stop it only after a recorded sale. Its chat room is keyed on the
  month id (no order behind it); checked by service tests (real chat service on the in-memory Firestore)
  and a 37-step browser run, not against live Firebase or the client's side of the chat.
- The SMM dashboard is computed in the browser from the overseer's live `smm_campaigns` listener (no new
  query, no new read), so its cost grows with the number of active months like the board's; with a few
  hundred active months the page would do noticeably more work per snapshot. Checked by unit/UI tests
  and a browser harness on 12 fake months (1440 / 390 px, dark and light) — not against live Firebase.

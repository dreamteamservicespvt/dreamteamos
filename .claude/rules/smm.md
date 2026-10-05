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
`applyMonthSetup`): start → end auto = same date next month (`monthCycle`), `clipsPerVideo` (also on
the sale form; default 4 = 32 s), page links, team → **one assignment path** `services/smmAssign`
(`assignSmmMonth`: one job per person with their tracks, at the month's length, `smmCampaignId`,
idempotent, untouched cards withdrawn, started kept; also used by Orders → Assign jobs); order
deadline = month end (`monthPromise`). **Renewal = the salesperson's sale**: Renew (`useSmmRenewal` →
upsell path → My Leads `?renew=` → `SaleForm renewal`) → `ensureCampaignForOrder` links Month N+1
(start = old end or renewal day, team/clips/page links copied, jobs auto-created, tech side told);
the old month closes after its last day (`closeEndedMonthsOnOpen`, on board open). Unposted pieces
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
app. Add SMM sale → number → **Add a month that had no sale** (tech admin, team leader, main admin;
`canAddNoSaleMonth`): salesperson, the package it ran on (fills counts + accounts) or Custom, then the
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
page shows two, and "Its date is outside Month 1 (6 Sep – 6 Oct 2026)" when it is); a day tapped while its
posts are below the fold scrolls them up. Posts with no date are listed under the calendar on the pages of
their month. **Every post sits on its upload date** (`uploadDate`, the Content list's column — owner, same
day, via session dts-os-a1): `postedAt` is stamped when Posted is pressed, and the team marked a month's
nine posts posted together, which piled them all onto 5 Oct; only a posted piece with no upload date falls
back to that stamp ("Marked posted on 5 Oct — no upload date was given"). A post dated outside its month
shows on that date's page (the arrows reach it) and is counted there. A history month's blank plan is left
out ("added after it ended"). Swipe left/right (the grid is `touch-pan-y`, or the browser takes a
right-swipe as Back) and Page Up/Down change month; arrows move a day, over a month's edge too. Opens on
today's page while the month it is about runs, else on the page holding that month's middle
(`openingMonth`). Three places: the month page's Content → **Calendar** (`SmmCalendar`, about that month;
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

## 24. BUSINESS RULES (IMPLEMENTED; verified in code)

- **SMM client calendar (owner, 2026-10-05):** one calendar per client across all their months, paged by
  calendar month like a phone calendar (‹ › and Today always there), plain enough for anybody — three marks
  only (✔ posted, ✖ not posted, ◷ coming up), each with its word; the counts are the posts on the days on
  screen; a person sees only the months they can already open; **every post sits on its upload date**
  (never on the day Posted was pressed); a post whose day has passed without going up is "not posted".
- **SMM accounts (owner, 2026-10-05):** the tech side sets which accounts a month covers in setup; a post
  already live keeps the accounts it went on; at least one account is required.

- **SMM deletion and lead (2026-10-01, team leader added 2026-10-03):** the main admin, the tech
  admin, the tech team leader and the Social Media Team Lead delete a month; a deleted sold month never
  comes back with its sale; only the tech admin and main admin appoint the team lead; extra work always
  says what it is (and a video its length), and the seller is told.
- **SMM months (owner, 2026-10-03):** every month is a sale — recorded by the salesperson or, by the
  tech admin / team leader / main admin, on the salesperson's behalf (their sale, Sales Approvals,
  existing 5%/10% commission). A sale already recorded is set up, never recorded again (no double
  commission). A month runs from its start to the same date next month. Clips per video default 4
  (32 s); every job of the month is made at that length. Only the month's salesperson renews, as a
  sale; the next month starts on the old end date with the same team; the old month closes after its
  last day. A number held by another salesperson is refused. The tech side cannot record a new sale
  for a client who already has months (that is a renewal). The tech side may rename a month and change
  how many videos/posters it owes; a worked row is never removed. A deleted month can be undone for 5 s.
  The one exception — **a month that had no sale (owner, 2026-10-03):** a client served before sales
  were recorded in the app is added by the tech admin / team leader / main admin with the salesperson's
  name: amount 0, counted in nobody's revenue or commission, shown in the salesperson's login with its
  dates. It cannot start in the future, overlap any month of the client, cover a recorded sale's dates,
  or come after a recorded sale. Its next month is the salesperson's Renew — a sale. A month's deadline
  is its last day, on the order and every job, including a renewal's; a later edit or approval of the
  sale does not change it (nor a used extension).
- **SMM work lives in Social Media (owner, 2026-10-04):** a tech member's social-media month is never
  listed in My Work or Recent Ads; they open it from the month's page ("Your work on this month"), which
  uses the same studio, code, credits, completion and Drive step, and returns them to the month.
- **SMM renewal popup (2026-10-03):** from 3 days before a month's renewal date through the day itself,
  the salesperson who sold it gets the countdown + work-report popup once a day (per month, per device)
  until there is a decision (a renewal linked, won or lost — a pitch is not one). Once the date has
  passed it stops; the dashboard card (5 days, and ended months) and the board carry it from there.
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
  now; a month closed in the last fortnight drops out of those trends. A post's day is its `postedAt`
  stamp, or its planned day for posts marked before the stamp existed. Team load counts a piece for its
  own maker/publisher, else the month's content and posting seats; a marketer-only member shows "No posts
  of their own".

- SMM client calendar (2026-10-05): it is only as true as the plan's upload dates — a posted piece shows
  "Posted on <its upload date>" even when it really went up later (the app records only when Posted was
  pressed, not when it went live); a date typed wrong shows on the wrong page, flagged "Its date is outside
  Month 1" when it falls outside its month (the owner's Dhana lakshmi month: nine dates a month early, to be
  corrected in the Content list). Months are
  joined by the client's number, so a client recorded under two numbers shows as two clients, and a very
  old month with no number is a client of its own. Overseers see finished-only clients after asking for
  them (one read of every finished month, as the Finished tab already does). No print / export of the
  calendar. Where a post is held up (with the client, being made) is said in words on the day, not shown
  as a mark — by the owner's choice of three marks.

## 27. POTENTIAL RISKS (need verification)

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

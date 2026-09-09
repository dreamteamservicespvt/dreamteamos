# Sales ↔ Tech workflow batch — design

Seven changes that all sit on the same seam: what the sales member captures at sale time, what
the client is told, what the tech team is handed, and who hears about it when the promise slips.

## 1. The client confirmation carries the whole order

`AdRequirement` gains three fields, all captured on the sale form and all ad-only:

| Field | Notes |
|---|---|
| `businessWhatsapp` | **Already exists**, already pre-filled from the lead's phone. Now **required** on an ad sale, and printed in the client's confirmation. |
| `businessAddress` | New. |
| `businessInfo` | New. What the business does and what the ad must include — offers, taglines, must-say lines. **Client-facing**: it is read back to the client in the confirmation. |

`notes` stays exactly what it is — the internal note to the tech team, never sent to the client.
The two boxes sit next to each other, so each carries an ⓘ that says which audience it is for.

The confirmation (`utils/salesMessage.ts`) gains 📞 contact, 📍 address, ℹ️ business info, and the
background line. Under `⏱️ Delivery` it gains the caveat, verbatim:

> _(this is only applied when you confirm your business details before the work begin and you
> respond very quickly when we send you the script for the confirmation — we are not responsible)_

## 2. Every ad sale row shows its live status

Today a sale row shows a chip only once work is **locked**. Everything before that is blank, so a
member cannot tell an unassigned sale from one in production without leaving the page.

A new pure helper `utils/saleStatus.ts` maps an `Order` (+ its `WorkAssignment`, when loaded) to one
display state: `awaiting_approval → queued → assigned → in_production → delivered → verified`, plus
a `delayed` overlay derived from `promiseSla`. Rendered as a chip on every sale row in **My Leads**
and **My Clients**, one per sale — a lead with three ads shows three chips.

## 3. Feedback & Upsell live inside the Clients page

Not a new section. Each **delivered** sale in My Clients becomes a working card carrying:

- a **status dropdown** and the member's **notes** — the same shape as a lead row
- **Work feedback** (the ad) and **Service feedback** (communication, promises kept), each
  `Outstanding | Good | Not Bad | Bad`
- **Sold by** and **Made by**, on every row
- an **Upsell** button that stays **disabled until both feedbacks are recorded**, then opens the
  ordinary `SaleForm` through the existing `startUpsell` path — so an upsell can be anything

This is **not** the existing `clientReview`: that is the customer's own 1–5 star rating, written by
them in their chat. This is what the member heard on a call. Both are kept and shown together.

Stored as `ClientWorkFeedback` on the client record, keyed by order id, so one delivered job has one
feedback however many times it is edited.

**Who sees it:** the sales member for their own clients; the **sales admin, tech admin and tech team
leader** by opening a *member* first and reading that one member's book. Per-member by construction —
a scan across every member's clients is what burns the Firestore free-tier quota.

The ladder (ad → social media → website → software) orders the upsell suggestions. It does not
restrict them.

## 4. One extension, then somebody hears about it

`PromiseDeadline` gains an `extension` record: `{ hours, at, by, byName, byRole, reason }`, plus
`originalDueAt` so the first promise is never lost.

- **Who may extend:** the tech team leader, the tech member holding the work, or the sales member who
  sold it. **Once.** After that the button is gone and the record says who used it.
- **How much:** defaults to the same length again (a 24h promise extends by 24h → 48h total). The
  number of hours is editable.
- **Every category**, not just ads.

`notifyDueOrdersOnOpen` currently alerts only the assignee. It now also alerts the **sales member who
sold it**, the **tech team leader(s)** and the **tech admin** — in-app and push — with the existing
dedupe key extended per recipient.

## 5. Social media packages

Prices unchanged. What each package owes changes shape:

| Package | ₹/month | Videos | Posters | Posts | Stories | Campaigns | Platforms |
|---|---|---|---|---|---|---|---|
| Starter | 10,000 | 4 | 4 | 8 | 8 | 4 | Instagram + Facebook |
| Plus | 15,000 | 6 | 6 | 12 | 12 | 6 | + YouTube |
| Pro ⭐ | 20,000 | 8 | 8 | 16 | 16 | 8 | + LinkedIn |
| Business | 25,000 | 10 | 10 | 20 | 20 | 10 | + LinkedIn |
| Ultra | 30,000 | 12 | 12 | 24 | 24 | 12 | + LinkedIn |

Posts and stories are **2× the video count**. **Campaigns stay**, and equal the **video** count —
only videos are run as campaigns. `OrderProgressCounts` gains `stories`; the social-upload track owns
`posted` **and** `stories`. `ServicePackage` gains `platforms: string[]`, shown on the sale form and
in the client's confirmation.

Existing orders keep their stored targets — nothing is rewritten, and a missing `stories` reads as 0.

## 6. The sales admin lands on the Leaderboard

`getDefaultRoute("sales_admin")` → `/sales-admin/leaderboard`, and Leaderboard moves to the top of
that nav. Dashboard stays reachable, it just is not the front door.

## 7. Real vs AI background, on every ad

Today the question is asked **only** when a character pack is chosen; `AIPlatformApp` sets
`locationMode` only when `characterPack` is set, and the generator gates photo scouting on `!!pack`.

- The sale form asks it on **every ad** — human-model ads included — as a dropdown.
- It travels sale → order → work assignment → AI platform, exactly as the pack already does.
- The generator honours it for a normal ad: `real_provided` builds each clip from the client's own
  store/office photographs; `ai_generated` builds the location from the business profile.

**Locking.** Once the work is assigned, the background choice is **fixed for the tech member** — their
AI Platform shows it read-only. Only the **tech team leader** or the **sales member who sold it** can
change it afterwards; a change re-raises the existing spec-changed dialog on the member's screen.

**Routing is unchanged.** A new ad notifies **both the tech admin and the tech team leader** — the
leader usually does the assigning, but both must see it.

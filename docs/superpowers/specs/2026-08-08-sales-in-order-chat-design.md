# Sales in the order chat, client reviews, and four smaller things

**Date:** 2026-08-08

Five requirements, delivered together because three of them touch the same order-chat surface.

---

## A. The logo goes to the dashboard

`BrandLogo` stays presentational — a logo is not a link, and the login screen's copies must not
become one. The four in-app mounts wrap it in a `Link` to `defaultRouteForUser(user)`, the same
helper `/` already redirects through, so it is right for every role and for an external creator
whose "dashboard" is the ad tool.

**The one hazard.** In the collapsed desktop rail the mark is the *only* control that re-expands the
sidebar. Making it navigate would leave the rail permanently collapsed. The collapsed header
therefore becomes a stacked pair: the mark (a link to the dashboard) above a chevron button (the
expander).

## B. Unassigned orders, divided by the hour they arrived

`utils/orderHours.ts` (pure, tested):

- `hourBucketKey(ts)` → `yyyy-MM-dd-HH`
- `hourBucketLabel(ts, now)` → `Today (6 – 7 PM)`, `Yesterday (6 – 7 PM)`, `12 Aug 2026 (6 – 7 PM)`

Rendered on the **Not assigned** tab only. The list is walked in whatever order the existing sort
produced and a header is emitted when the bucket changes — **the sort is not touched**, because the
grouping is for reading the queue, not for reordering it. Headers span the row in grid view.

Team leaders get it from the same component behind `/team-leader/orders`.

## C. The sales member belongs in the chat

The client often gives the material to the person who sold them the ad. Today that person cannot
reach the room, so the details are re-typed, forwarded, or lost.

### Membership

`createOrderChat` takes `soldByUid` / `soldByName` (both present on the `order` that
`createWorkAssignment` already holds) and puts the seller in `participants`. Rooms created before
this pick the seller up through `ensureOrderChat`'s existing join path the first time they open one.

### Who said it

`OrderChatMessage.senderRole: "tech" | "sales"`, stamped at send time from the sender's own role.
Rendering:

| Viewer | Tech message | Sales message |
|---|---|---|
| Staff | sender's name (as today) | sender's name + a **Sales** badge |
| Client | "Tech team" | "Ravi · Sales" |

Messages written before this field exists have no role and render as "Tech team" on the client's
side, which is accurate — sales could not write here before.

This is a deliberate, narrow exception to the rule that the customer never learns a staff name. The
customer already knows their sales person by name; they bought from them.

### Status in the header

One mirrored field, `order_chats/{id}.workStatus`, written by `syncOrderChatWorkStatus` from the
four places an assignment's status changes (assign, start, complete, verify). Reading it costs
nothing extra on a page that already has the room. Shown on **staff** headers only —
`Assigned · In progress · Completed · Delivered`. The client header keeps its existing wording; a
customer must never read "Not assigned".

### Ways in

- a chat icon on each sale row in `MyLeads`, once the order has a `workAssignmentId`
- `/sales/client-chats` — every room they are on, with unread badge and status, plus rows for sold
  orders that have no assignment yet (shown "Not assigned", nothing to open)

## D. A review, and the next sale, when the ad is delivered

`lockOrderChat` learns *why* it is locking. Work returned to the queue also locks a chat, and asking
that customer to rate the work would be absurd — only a real delivery sets `reviewInvited`.

### The card

Under the locked composer on the client's page: **Work** and **Service**, five stars each,
pre-set to 5. One Submit. Dropping either below 5 reveals "What could we have done better?".
After submitting it collapses to the two scores with an **Edit** link.

### Where it is written

The guest writes `clientReview` onto its own chat document — one added key in the guest rule. Then a
fire-and-forget `POST /api/order-chat {action:"submit-review"}` mirrors it onto `orders/{orderId}`
and the client's record and notifies the seller and the maker.

The direct write is the primary one on purpose: it is what makes the feature work against a plain
`vite dev` server (no serverless functions) and what makes it survive a failed mirror. It is the
same shape as sending a message today — the message lands in Firestore, and `alertTeam` is best
effort on top.

### The enquiry button

`wa.me/<the seller's own business number>`, resolved once when the card mounts through
`{action:"enquiry-target"}`, which reads `users/{soldBy}.businessWhatsapp` server-side. Resolved
rather than mirrored so the number is always current, and so it never sits in a customer's browser
until they actually ask for it. Falls back to the company number.

`AppUser.businessWhatsapp` is settable by the member on My Profile **and** by their sales admin from
My Team — the member owns the number, the admin needs to fix it when they cannot.

### Where staff see it

Delivered order card, staff chat header, and the client's record.

## E. Clients, for the people who sold them

`Client.soldByIds: string[]`, so `clientsQuery` can answer `array-contains uid` for a
`sales_member` — a scoped query, not a scan, because this database runs on the free daily read
budget. Two sellers on one client means two uids in the array and the client appears for both; they
edit one shared document, so an update by either is live for the other and for the sales admin (the
page is already `onSnapshot`).

`/sales/clients` reuses `shared/Clients.tsx` with the import sweep and upsell-assignment off, and
profile editing **on** — sharing what you learn about a client is the point.

### The attribution bug this uncovered

`upsertClientOnWorkComplete` writes `soldBy: assignment.assignedBy` — the *tech assigner*, not the
seller. It runs on completion, before `upsertClientOnWorkVerify`, whose idempotency check then sees
the order already recorded and skips. So the wrong name is the one that sticks, and "Sold by" in
Clients is wrong today for every order-backed job.

`soldByIds` built on top of that would show sales members other people's customers, so it is fixed
rather than worked around: when an assignment carries an `orderId`, the order is read and its
`soldBy` / `soldByName` / `amount` are used. The existing **Re-sync** button carries the fix over
the history, reading `orders` once for the sweep.

---

## Not doing

- Changing the client's view of *tech* staff names. One exception, for one reason, and no more.
- A reviews page for the sales admin. The three surfaces above are where the work already happens.
- Mirroring the seller's WhatsApp number onto every chat document.

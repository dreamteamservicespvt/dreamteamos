# Social Media Management — Design

Date: 2026-09-18

A monthly retainer is not an order. An order is a thing you make once and hand over; a retainer is
a promise you keep for thirty days, in front of a client who is watching. Today the app models the
month as four counters on the order (`OrderProgress`, `kind: "smm"`) — 8 ads, 8 posters, 16 posts,
8 campaigns — and that is genuinely all it knows. It cannot say **what** the eight posts are,
**when** they go up, **which account** they go on, whether the client has **approved** them, what
the ads **cost** or **returned**, what the client was **told**, or why a week went by with nothing
posted.

Every problem in the brief is a symptom of that one gap:

| What goes wrong | What is missing |
|---|---|
| "You didn't do the work" a fortnight later | A dated record of what we asked for and when they answered |
| Posts go up unapproved, or approved work sits unposted | Approval as a **state the item must pass through**, not a habit |
| Nobody knows what is due this week | Content items with dates, and a reminder that finds the person |
| Ad results live in screenshots on a phone | A day report per campaign, and a message built from it |
| Extra work done for free, forgotten | An item flagged extra, and the seller told the day it happens |
| Ad budget runs out mid-campaign | A ledger of what the client funded against what was spent |
| Renewal missed | A cycle with an end date, and a nudge before it |

So the design is: **one campaign document per sold month, holding the plan, the approvals, the ads,
the money and the messages — and every screen, every reminder and every report reads from it.**

---

## 1. Scope of change

Additive. Nothing existing is removed. `OrderProgress` stays and keeps working — it is now
*derived* from the campaign rather than typed in by hand, so the Orders queue, the balance-collect
gate (`utils/collectReadiness`) and tech payroll (`utils/techProductivity`) all keep reading the
field they already read.

---

## 2. Data

### 2.1 `smm_campaigns/{orderId}` — one document per sold month

Doc id is the **order id**, for the same reason the client chat is keyed on it
(`utils/orderChatId`): it is deterministic, stable for the life of the sale, and survives a sale
being re-verified, unassigned and reassigned. No lookup collection, no second id to keep straight.

Why its own collection rather than a field on the order: the order document is streamed by the
whole tech department on the Orders queue. A month's plan is ~30 content items, a per-day ad report
for each campaign, a budget ledger and an approval trail — kilobytes that change several times a
day. Putting it on the order would re-push the entire orders snapshot to every screen in the
company every time somebody ticked a post. This project runs on the Firebase free tier
(~50k reads/day), so that is not a style preference.

```ts
type SmmPlatform  = "instagram" | "facebook" | "youtube" | "linkedin" | "x";
type SmmKind      = "poster" | "ai_ad" | "real_video";

type SmmItemStatus =
  | "planned"            // in the plan, nothing made
  | "in_progress"        // being made
  | "awaiting_approval"  // sent to the client
  | "changes_requested"  // they came back with notes
  | "approved"           // cleared to go up
  | "scheduled"          // queued in the platform's own scheduler
  | "posted";            // live

interface SmmApproval {
  state: "not_sent" | "waiting" | "approved" | "changes";
  askedAt;        // when we sent it
  respondedAt;    // when they answered
  note;           // what they said
  chases: { at; byName }[];  // every time we had to follow up
}

interface SmmItem {
  id; kind; title;
  uploadDate;   // yyyy-MM-dd
  uploadTime;   // HH:mm
  platforms;    // a subset of the committed accounts
  scheduled;    // pre-scheduled in the platform vs posted by hand
  status; approval;
  makerUid / makerName;          // who creates it
  publisherUid / publisherName;  // who puts it up
  extra;                         // beyond the committed quota
  extraCharge: "unbilled" | "billed" | "free" | null;
  extraAmount;
  postedAt; postUrl; notes; createdAt; updatedAt;
}

interface SmmAdDayReport {
  date; leads; spend; costPerResult; reach;
  screenshotUrl;   // the Meta dashboard shot it was read from
  byName; at;
}

interface SmmAdRun {                // one Meta campaign
  id; name;
  /** Whole section, or named items. `kind` + empty `itemIds` = every item of that kind. */
  scope: { kind: SmmKind | "all"; itemIds: string[] };
  startDate; days;
  dailyBudget;                                // agreed once, at the sale
  budgetByDay: Record<string, number>;        // yyyy-MM-dd → that day's budget, when it moved
  status: "planned" | "running" | "paused" | "ended";
  reports: SmmAdDayReport[];
}

interface SmmBudgetPayment {        // the client funding the ad spend
  id; amount; at; method; note; screenshotUrl; byName;
}

interface SmmCampaign {
  id;                               // = orderId
  orderId; leadId; saleItemKey;
  clientPhone; clientPhoneId; clientName; businessName;
  packageKey; packageLabel; amount;
  cycle: { month /* yyyy-MM */; startDate; endDate };
  platforms;                        // the accounts committed at the sale
  commitments: Record<SmmKind, number>;   // what was promised
  items; ads; budgetPayments;
  team: { creator?; publisher?; marketer?; assistants[] };
  soldBy; soldByName; salesAdminId;
  watchers: string[];               // every uid that may read it — the array-contains key
  status: "active" | "completed" | "renewed" | "lapsed";
  renewal: { state: "none" | "pitched" | "won" | "lost"; at?; byName?; note? };
  createdAt; updatedAt;
}
```

**Concurrency.** Two members editing different items of the same month would clobber each other
with a naive array write. Every item mutation goes through `runTransaction` and merges by item id.

### 2.2 `smm_templates/{id}` — saved message templates

Company-wide, one document per template. Built-in defaults live in code (`utils/smmMessages.ts`)
and are used when no saved template overrides them — so the feature works on day one with nothing
configured.

### 2.3 `AppUser.smmLeader?: boolean`

An **additive** flag, exactly like `externalCreator`: a tech member or team leader promoted to SMM
Leader keeps their role and gains company-wide visibility of every campaign plus the right to
assign them. Not a new `UserRole`, because a new role would mean a new nav tree, a new default
route, a new set of allowed routes and a person who suddenly loses their old screens.

---

## 3. The sale

`SaleForm` gains a Social Media Management section, shown only for that category.

1. **Committed accounts** — Instagram, Facebook, YouTube, LinkedIn, X. Pre-ticked from the
   package's own `platforms`, editable, because what is actually promised on the call is what the
   client will hold us to.
2. **Committed content** — Posters / AI Ads / Real videos, pre-filled from the package quota
   (`deliverables.posters`, `.ads`) and editable.
3. **Real video add-on (editing + posting)** — `SMM_REAL_VIDEO_RATE = 500` per video, quantity ×
   rate added to the gross. This is client-supplied footage we edit and post; it is in no package.
4. **Price** — gross = package + add-ons. Then a **two-way** pair of boxes:
   - type the **price the client committed to** → the discount is the difference;
   - type the **discount** → the final amount is what is left.
   Both write the same `discountAmount` the rest of the app already understands, so the 10%
   member-authority rule (`utils/saleDiscount`), the approval hold and the commission maths need no
   changes at all.

The arithmetic lives in `utils/smmPricing.ts`, pure and tested, not inline in a 2,000-line form.

On order creation (`upsertOrderForSale`) the campaign document is created from these fields, with
one `SmmItem` per committed unit, untitled and undated — the plan is a checklist the moment the
sale is made, and the tech team fills in titles and dates.

---

## 4. Approval is a gate, not a habit

> *without approval we won't post any content on social media.*

So it is enforced, not remembered: `setItemStatus` refuses `scheduled` and `posted` unless
`approval.state === "approved"`, and the UI never offers them. The only way past is to record the
approval, which stamps who recorded it and when.

The same record answers the other half of the complaint. Every ask is stamped (`askedAt`), every
follow-up is appended (`chases`), and the answer is stamped (`respondedAt`). From that,
`utils/smmPlan.clientWaitDays()` derives how many days of the month were spent waiting on the
client — a number that appears on the monthly report, with the dates. That is the answer to "you
didn't do the work", and it is built from the work itself rather than written up afterwards by the
person being accused.

---

## 5. Reminders

`utils/smmReminders.ts` is pure: given campaigns, a uid and today, it returns what is due.

- **Three days out.** Any item whose `uploadDate` is within 3 days and is not yet posted surfaces
  to its maker and its publisher — in the **check-in** prompt and again in the **check-out** modal,
  the two moments a tech member is guaranteed to be looking at the app.
- **Push**, once per item per day-offset, via `sendNotification`'s `dedupeKey`, on the same "sweep
  when somebody opens the app" pattern as `notifyDueOrdersOnOpen`. There is no cron on this stack.
- **Stuck approvals** nudge the **seller**, not the tech member — they are the one who talks to the
  client.
- **Budget** — when funded minus spent is less than the next day's budget, the campaign shows a red
  line and the seller is told.

---

## 6. Ads

A run names its scope (a whole kind, or specific items), a start date, a number of days, and the
daily budget agreed at the sale. `budgetByDay` overrides a single day when the client moves it,
leaving the agreed figure intact underneath — "what did we agree" and "what did we actually spend
on the 12th" are different questions and both get answered.

**Day reports** are entered by hand, or read from a Meta dashboard screenshot by
`readMetaAdsReport()` (Gemini vision, the same `callWithFallback` path the app already uses). The
screenshot is uploaded either way and kept as the proof. AI extraction is a convenience that
pre-fills the three boxes; if it fails, the boxes are still there. Nothing depends on it.

From a saved report, one click builds the client's daily message.

---

## 7. Visibility

| Who | Sees | May |
|---|---|---|
| Sales member who sold it | their own campaigns | record approvals, chases, budget payments, extra-work billing, send messages |
| Assigned tech (creator / publisher / marketer) | campaigns they are on | everything about the content and the ads |
| Assistant (junior tech) | campaigns they are added to | the same — they are doing the work |
| SMM Leader | every campaign | everything, plus assign |
| Tech admin / tech team leader / sales admin / main admin | every campaign | read, assign, and correct |

Members read with `where("watchers", "array-contains", uid)`; overseers read the active set, which
is a handful of documents, not a scan.

The overview list is exactly what was asked for: **client and project name large, the assigned
member's name small underneath**, so a screen of twelve campaigns is legible at a glance.

---

## 8. Layout

One component, two shapes: `md:` and up renders a real `<table>` — a month's plan is tabular data
and a table is the honest way to show it. Below `md` the same rows render as cards with the date
and status as the headline. Not two components; one, so a column added to the table cannot go
missing on a phone.

---

## 9. Reports

- **Daily ad report message** — leads, spend, cost per result, for one campaign, one day.
- **Monthly report** — committed vs delivered per kind, posts per platform, ad totals (leads,
  spend, average cost per result), extra work done and whether it was charged, and the days spent
  waiting on the client. Rendered on screen, copyable as a message, and printable through the
  existing `printAgreementElement` document pipeline.
- **Renewal** — from five days before `cycle.endDate` the seller sees a renewal card with the
  month's numbers and a message built from them, because a renewal is won by showing what was
  delivered, not by asking.

Every message goes out two ways: copy / WhatsApp deep link (`utils/phone.getWhatsAppUrl`), or
straight into the client's existing order chat (`sendOrderChatMessage` on `orderChatIdOf` — the
campaign id *is* the chat id for a sold order).

---

## 10. Extra work

An item created with `extra: true` is outside the quota. On creation the **seller** is notified by
name — what was made, for whom — and the campaign shows it in an Extra work section where the
seller marks it `billed` (with an amount) or `free`. It appears in the monthly report either way,
because "we did three extra posters for you at no charge" is the most useful sentence in a renewal
conversation.

---

## 11. Keeping the existing world true

`services/smm.syncOrderProgress()` recomputes the order's `progress.done` from the campaign's items
after every mutation:

- `ads` ← AI ads + real videos made
- `posters` ← posters made
- `posted` ← items posted
- `stories` ← story placements posted
- `campaigns` ← items covered by a running ad run

So `collectReadiness` (the balance-collect gate), `techProductivity` (tech payroll) and the Orders
queue keep working with no change, and the counters stop being hand-typed.

---

## 12. Files

**New**
```
src/types/smm.ts
src/utils/smmPricing.ts        add-ons, committed-price <-> discount
src/utils/smmPlan.ts           plan build, fulfilment, client-wait days, derived progress
src/utils/smmReminders.ts      due soon, stuck approvals, budget alerts
src/utils/smmMessages.ts       built-in templates + rendering
src/services/smm.ts            Firestore: create, item CRUD (tx), ads, reports, budget, notify
src/services/smmTemplates.ts   saved templates
src/hooks/useSmmCampaigns.ts   scoped subscription
src/components/smm/*           the campaign UI
src/pages/shared/SocialMedia.tsx        list
src/pages/shared/SmmCampaignPage.tsx    detail
src/components/sales/SmmSaleFields.tsx  the sale section
```

**Changed**
```
src/types/index.ts             AppUser.smmLeader
src/utils/roleHelpers.ts       nav for six roles + the leader flag
src/App.tsx                    routes
src/components/sales/SaleForm.tsx
src/services/orders.ts         create the campaign with the order
src/services/geminiService.ts  readMetaAdsReport()
src/components/attendance/DailyCheckinPrompt.tsx, CheckoutModal.tsx
src/pages/tech-admin/MyTeam.tsx  promote to SMM Leader
docs/firestore-rules.md        smm_campaigns, smm_templates
```

## 13. Tests

Pure units first — pricing, plan/fulfilment, client-wait days, reminders, message rendering,
derived progress — then component tests for the sale section, the content table, the approval gate
and the reminder surfacing, in the established `src/test/*.test.tsx` style.

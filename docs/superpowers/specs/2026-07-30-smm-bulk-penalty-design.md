# Social Media Monthly, Bulk Ads, Custom Entry & Penalty — Design

Date: 2026-07-30
 
Four changes to the sale → order → work-assignment pipeline. They share one idea: an order
carries what still has to be *done*, not just what was *sold*.

## 1. Social Media Monthly — packages and progress

### Packages

`social_media_management` in `utils/serviceCatalog.ts` is replaced:

| Package  | Amount  | Ads | Posters | Posted | Ads run |
|----------|---------|-----|---------|--------|---------|
| Starter  | ₹10,000 | 4   | 4       | 4      | 4       |
| Plus     | ₹15,000 | 6   | 6       | 6      | 6       |
| Pro      | ₹20,000 | 8   | 8       | 8      | 8       |
| Business | ₹25,000 | 10  | 10      | 10     | 10      |
| Ultra    | ₹30,000 | 12  | 12      | 12     | 12      |

`ServicePackage` gains `deliverables?: { ads; posters; posted; campaigns }`. Every ad in these
packages is 30 seconds + poster; the dropdown label spells the quota out so the sales member does
not have to remember it.

One sale covers **one month**. Next month is a new sale — there is no auto-renewal.

### Progress

Progress lives on the **Order** doc, because the order is the single object the tech admin, the
team leader and the assigned members all already subscribe to. Putting it anywhere else would mean
a second read on every screen, and this project runs on the Firebase free tier.

```ts
interface OrderProgress {
  kind: "smm" | "bulk";
  targets: OrderProgressCounts;      // { ads, posters, posted, campaigns }
  done: OrderProgressCounts;
  tracks: Partial<Record<OrderTrack, OrderTrackAssignee>>;
  completedTracks: OrderTrack[];
  log: OrderProgressEntry[];
  completedAt?: unknown | null;
}

type OrderTrack = "ad_creation" | "social_upload" | "digital_marketing";
```

`kind: "smm"` uses all four counters. `kind: "bulk"` uses `ads` and `posters` only.

### Split assignment

A tech leader or tech admin can put each track on a different member, or all three on one. One
`work_assignment` is created per **distinct member**, carrying `tracks: OrderTrack[]` — so a member
who owns two tracks still gets exactly one card and one notification.

Because the counters live on the shared order, a member marking their track complete is visible
immediately to everyone else on that order.

Anyone in `tracks`, plus the tech admin and tech team leader, may update progress.

### Pinning

`sortOrders` pins orders with incomplete `progress` above every other order, in all three sort
modes. The same pin applies on Work Assign and on the member's My Work, so an SMM or bulk job stays
at the top for tech admin, team leader and assignee until every counter is met.

## 2. Custom entry — description input

Choosing the **Custom** category currently offers an amount box but no way to say *what* was sold;
`customDescription` is auto-filled with the meaningless string `` `Custom ${category}` ``.

Add a required text input, store the typed value in the existing `SaleDetail.customDescription`,
and carry it to `Order.customDescription` so the tech team reads the real thing.

## 3. Bulk Ads

New catalog category `bulk_ads` — *Bulk Ads (Promotional)*, `fromAd: true`, `bulk: true`. Its
packages are the promotional packages priced **₹999 and above**: 30s ₹999, 45s ₹1499, 1min ₹1999.
The ₹499 15-second package is deliberately absent — the discount only applies from ₹999 up.

The form adds a quantity box. Discount is suggested from quantity:

| Quantity | Suggested discount |
|----------|--------------------|
| 5–9      | 5%                 |
| 10–19    | 10%                |
| 20+      | 20% (max)          |

Thresholds are inclusive, matching the existing `>=` ladder in `utils/pricing.ts`.

The suggestion is **optional and editable** — the member may clear it to 0 or set any value from 0
to 20. `amount = round(quantity × unitAmount × (1 − discountPercent / 100))`.

New `SaleDetail` fields: `quantity`, `unitAmount`, `suggestedDiscountPercent`, `discountPercent`,
`discountEdited`. When the member departs from the suggestion, `discountEdited` is set and both
the tech admin's Orders card and the sales admin's approval row show
`Edited discount 10% → 15%`.

A bulk sale becomes **one** order with `progress.kind: "bulk"` and `targets.ads = quantity`,
pinned and counted *3 of 8* until complete — not N separate orders, which would flood the queue
and multiply reads.

## 4. Penalty

Charged when a client asks for changes beyond what was committed, or after the ad is already made.

Default rates, editable on every entry:

| Clip type   | Rate per clip |
|-------------|---------------|
| Promotional | ₹250          |
| Wishes      | ₹250          |
| Cinematic   | ₹500          |

```ts
interface PenaltyEntry {
  id: string;
  clips: number;
  ratePerClip: number;
  amount: number;          // clips × ratePerClip
  reason?: string | null;
  byId: string; byName: string; byRole: UserRole;
  at: unknown;
}
```

Canonical on the **Order** (`penalties`, `penaltyTotal`, `penaltyClips`). A compact
`{ penaltyTotal, penaltyClips }` mirrors onto the lead's sale item so the sales member's own screens
render without an extra read.

Both the **sales member** (from the sale in My Leads) and the **tech admin** (from Orders) can add
one; the entry records who did.

### Penalty is not revenue

A penalty is never folded into `SaleDetail.amount` or `Order.amount`. It is a separate field, so
`utils/salesRevenue.dayRevenue`, `hooks/useSalesEarnings`, commission and Profit are unaffected
*by construction* rather than by remembering to subtract it. A test asserts that adding a penalty
leaves a member's commission unchanged.

### Orders → Changes

A new section on the tech Orders page listing orders that carry penalties.

- **Tech admin** sees clips, amount, who added it and the reason.
- **Tech team leader** sees the clip count only — the same commercial blind that already governs
  `showSalesInfo` on that page.

## Risks

`utils/orderQueue.assignmentsByOrderId` is a `Map<string, WorkAssignment>` — one assignment per
order. Split SMM assignment breaks that assumption. The map is widened to hold a list, with the
existing single-value accessor kept so current call sites keep working unchanged.

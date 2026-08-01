# Bulk Video Types & Stored Member Credentials — Design

Date: 2026-08-01

Two unrelated changes, shipped together.

---

## 1. Bulk videos carry the video type

### The problem

`bulk_ads` — *Bulk Ads (Promotional)* — is hardwired to promotional pricing. A client buying ten
wishes videos or ten cinematic ads at once cannot be recorded: the member either sells them at the
wrong price or splits them into ten separate sales, which floods the tech queue.

Worse, a bulk order today reaches Work Assign broken. `assignmentFormFromOrder` passes
`category: "bulk_ads"` straight through (it is `fromAd: true`, so it survives the ad check), and
`DURATIONS["bulk_ads"]` does not exist — the pre-filled form opens with an empty duration and a
₹0 unit price, so whoever assigns it (tech admin or tech team leader) has to re-derive everything
by hand. Carrying the real video type fixes that by construction.

### The flow

Bulk Videos → **video type** (Wishes / Promotional / Cinematic) → package (that type's normal
price list) → how many → discount (% **or** ₹).

### Catalog

`bulk_ads` is relabelled **Bulk Videos** and stops carrying its own package list. `ServiceCategory`
gains `bulkTypes?: string[]`; for `bulk_ads` it is `["wishes", "promotional", "cinematic"]`, and the
package list shown is the chosen type's own — the same prices a single video is sold at, which is
what "just like the normal" means.

The old ₹999 floor (`BULK_MIN_PACKAGE_AMOUNT`, which the previous design enforced by simply
omitting the ₹499 package from the bulk list) is therefore relaxed: every package of the chosen type
is offered. It was never enforced in code, only in that hand-curated list, and it cannot survive a
type picker — wishes has exactly two packages and one of them is ₹499. The discount is the member's
to give or withhold either way, and it stays capped at 20%.

New shared helper, so nothing downstream has to know how bulk works:

```ts
export function effectiveAdCategory(category: string, bulkAdType?: string | null): string;
```

`bulk_ads` → its `bulkAdType`, defaulting to `"promotional"` for the sales recorded before this
change (which is exactly what `bulk_ads` used to mean). Everything else → itself.

### Discount in percent or rupees

`quoteBulk(quantity, unitAmount, discountValue?, mode = "percent")`.

- **percent** — unchanged: 0…20, `discountAmount = round(gross × pct / 100)`.
- **amount** — the member types rupees. Clamped to `floor(gross × 20 / 100)`, so the 20% ceiling
  holds however the discount is expressed. `discountPercent` is derived from it and still stored,
  so every existing reader (the Orders badge, the approvals row, the edit log) keeps working with
  no change.

`edited` compares the applied *rupee* discount against what the ladder would have given at that
quantity, so a member who types the equivalent amount is not flagged for it.

New `SaleDetail`/`Order` fields: `bulkAdType`, `discountMode`, `discountAmount`.

### Downstream

| Place | Change |
|---|---|
| `assignmentFormFromOrder` | Uses `effectiveAdCategory` → real duration and unit price on the pre-filled assignment |
| `initialProgress` | Bulk posters target = quantity for promotional/cinematic, **0 for wishes** (wishes packages ship no poster) |
| `defaultClipType` (penalty) | Bulk cinematic charges the ₹500 cinematic rate, not ₹250 |
| `presetsForCategory` (SLA) | Bulk cinematic offers 3/5 days; bulk wishes/promotional offer 24 hours |
| Orders queue, Sales approvals, My Leads | Show the video type alongside "Bulk Videos", and the discount in the unit the member used |

`nextWorkUniqueId` needs no change — it is called with the resolved form category, so a bulk
cinematic job now gets a `C###` id instead of `O###`.

---

## 2. Stored member credentials

### The problem

When a member forgets their password there is nothing to send them. The "Share Credentials"
WhatsApp message tells every member *"password and email both are same"*, which is simply untrue
for anyone whose password was set to anything else.

### Where the password lives

A separate collection, `member_credentials/{uid}`:

```ts
{ uid, email, password, setBy, setByName, updatedAt }
```

**Not** a field on the user doc. Half the app subscribes to the whole `users` collection
(`useFirestoreCollection('users')`), so a password there would be downloaded by every screen that
lists people. In its own collection it is read only when an admin actually asks for it — one
document, on demand, which also respects the Firestore free-tier budget.

### What writes it

- Tech admin creating a tech member / team leader
- Sales admin creating a sales member
- Main admin creating an admin account
- **A member changing their own password** — otherwise the stored copy goes stale the first time
  someone uses Change Password, and the admin sends a password that no longer works.

Deleting a member deletes their credential doc.

### What reads it

A shared `MemberPasswordModal`: reveals the stored password, copies it, and sends the full login
message on WhatsApp. Reachable from a key button on each My Team row. The existing one-click
Share Credentials keeps working and now puts the real password in the message when one is stored,
falling back to the old "contact your admin" line when it is not.

### Risk, stated plainly

This stores passwords in readable form. That is what the feature asks for, and it is the only way
a client-side app can hand a forgotten password back — the Firebase client SDK cannot read or set
another user's password. The mitigation is access, not obscurity: `member_credentials` must be
locked to admins in the Firestore console.

```
match /member_credentials/{uid} {
  allow read, write: if request.auth != null
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
       in ['main_admin', 'tech_admin', 'sales_admin'];
}
```

Without that rule the collection is as readable as anything else in the database. It is called out
here because it lives in the Firebase console, not in this repository.

---

## Tests

- `bulkDiscount` — amount-mode clamping to the 20% ceiling, derived percent, `edited` in both modes.
- `serviceCatalog` — `effectiveAdCategory` including the legacy default, bulk package lists per type.
- `orderProgress` — bulk wishes has no poster target; bulk cinematic does.
- `penalty` — a bulk cinematic order defaults to the ₹500 rate.

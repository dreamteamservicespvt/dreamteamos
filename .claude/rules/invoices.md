---
paths:
  - "src/types/invoice.ts"
  - "src/utils/invoice*.ts"
  - "src/utils/gst.ts"
  - "src/services/invoice*.ts"
  - "src/hooks/useInvoiceSettings.ts"
  - "src/hooks/useLeaveGuard.ts"
  - "src/components/invoice/**"
  - "src/pages/shared/Invoice*.tsx"
  - "src/test/invoice*.test.ts"
---

# Invoice Builder — DTS-OS module context

> Part of the project context (CLAUDE.md → Context map). Claude Code loads this file automatically when a
> file matching the `paths:` above is read or edited. Keep it current per CLAUDE.md §30 step 8; the source
> code wins. Built 2026-10-08; replaces the separate "Easy Invoice" app (its own Firebase project
> `invoicegenerator-21b78`, free-text numbers, three copies of the GST formula, a QR from api.qrserver.com —
> nothing of it was migrated: it never shared this database).

## 9.22 INVOICE BUILDER ✅ (2026-10-08)

**What it is.** A two-pane workspace: the editor on the left, the invoice as real A4 sheets on the right,
updating as you type (on a narrow screen: Edit | Preview). Drafts save themselves; Generate gives the invoice
its permanent number; Download PDF and Print come from the same sheets the preview shows.

**Who (owner, 2026-10-08).** Sales member, Sales Admin, Tech Admin, Main Admin, Accounts Admin — always. Tech
Team Leader — only while ONE company-wide switch is on (`invoice_settings/access.teamLeadersEnabled`, set by the
Tech Admin or the Main Admin in Settings → Invoice Builder, `InvoiceAccessCard`). Tech member — never (route
guard + rules). A member sees the invoices they made; the four admins see every invoice. All in
`utils/invoiceAccess` (`INVOICE_ROUTE_ROLES`, `canUseInvoiceBuilder`, `canManageInvoiceAccess`, `isInvoiceAdmin`,
`canEditInvoiceDefaults`, `canEditInvoice`, `canDeleteInvoice`) and mirrored in `docs/firestore-rules.md`
(`canUseInvoices`, `invoiceAdmin`).

**Routes** (`App.tsx`, un-prefixed like `/smm`): `/invoices` (`pages/shared/Invoices.tsx` — the register:
search, status filters that are counts, "₹X waiting to be paid", row menu Open / Duplicate / Delete draft) and
`/invoices/:invoiceId` (`pages/shared/InvoiceBuilder.tsx`; `/invoices/new` replaces itself with a fresh id before
anything is typed, so the URL never changes under someone typing). Both under
`AppLayout allowedRoles={INVOICE_ROUTE_ROLES}` → `components/invoice/InvoiceAccessGate` (the team-leader switch;
shows "isn't turned on for you" instead of bouncing). Nav: one `INVOICES_NAV` item per allowed role in
`roleHelpers.NAV` (main admin after Accounts; tech/sales admin after Clients; accounts admin after Revenue
Summary; sales member after the Salary group — the first six are locked by `salesNav.test`; team leader after
Feedback & Upsell with `requiresInvoiceSwitch`, filtered by `getNavItems(role, user, { invoiceBuilder })`; the
Sidebar listens to the switch for team leaders only).

**Files.**
- `types/invoice.ts` — `Invoice`, `InvoiceContent`, `InvoiceItem`, settings types (why lines are embedded).
- `utils/invoiceMath.ts` — **THE calculation engine** (`computeInvoice`, `formatPaise`). Nothing else computes an
  invoice figure: editor totals, preview, PDF and the saved `totals` all call it.
- `utils/gst.ts` — GST state codes, GSTIN shape + mod-36 check character, `supplyTypeOf`, IFSC / UPI checks.
- `utils/invoiceNumber.ts` — FY series `DTS/26-27/0001` (prefix fixed, not from the company name).
- `utils/invoiceLayout.ts` — `planInvoicePages`, the pure page plan (rules below).
- `utils/invoiceDraft.ts` — new-invoice defaults (`INVOICE_FALLBACK_DEFAULTS` = the company's own Inv. 4232),
  `contentOf` (any stored shape → complete content), `validateInvoice`, `displayStatusOf`, `rupeesInWords`,
  `upiPaymentLink`, `fillFromOrder`, `duplicateContent`, `invoiceFileName`, `recentCustomers`.
- `utils/invoicePdf.ts` — `downloadInvoicePdf` (html2canvas 3× → JPEG → jsPDF, loaded on first use) and
  `printInvoicePages` (clones → `agreementPrint.printDocumentPages`, the HR letters' print path, split out for this).
- `services/invoices.ts` — `newInvoiceId`, `watchInvoices`, `watchInvoice`, `saveInvoiceContent`,
  `generateInvoice`, `setInvoiceStatus`, `deleteDraftInvoice`, `duplicateInvoice`, `fetchMyRecentInvoices`.
- `services/invoiceSettings.ts` — the switch and the defaults (own file so the sidebar does not pull the engine
  into the first bundle); `hooks/useInvoiceSettings.ts` (`useInvoiceAccess(enabled)`, `useInvoiceDefaults`).
- `components/invoice/` — `InvoicePaper` (the A4 sheet + the measuring copy, inline styles only), `InvoicePreview`
  (measure → plan → scaled sheets; `capturePages()` for export), `InvoiceEditor` (8 sections), `ItemsEditor`,
  `editorKit` (Field, TextInput, NumberInput, Segmented, Section), `FillFromSale`, `StatusPill`,
  `InvoiceAccessGate`, `InvoiceAccessCard`, `useInvoiceAssets` (local UPI QR via `qrcode`, inlined logo).
- `hooks/useLeaveGuard.ts` — unsaved-change prompt under `BrowserRouter` (no `useBlocker`): `beforeunload` +
  capture-phase interception of in-app `<a>` clicks.

**Data** (rules in `docs/firestore-rules.md`, kept out of the catch-all):
- `invoices/{invoiceId}` — content (`issueDate`, `dueDate`, `seller` snapshot, `customer`, `items[]` each with a
  stable `id`, `tax` {mode gst|none, pricesIncludeTax, placeOfSupply, defaultRate}, `roundOff`, `payment`
  snapshot {bank, branch, account, IFSC, SWIFT, UPI, showQr}, `terms`, `notes`) + `number` (null = draft),
  `sequence`, `financialYear`, `status` (`draft` → `issued` → `paid` / `cancelled`; "Overdue" is derived, never
  stored), `totals` {taxable, tax, grandTotal (paise), itemCount}, `ownerId/Name/Role`, `revision`, `history[]`
  ({at ms, action created|generated|edited|paid|unpaid|cancelled|duplicated, byUid, byName, note}),
  `duplicatedFrom`, `sourceOrderId`, timestamps (`createdAt`, `updatedAt`, `issuedAt`, `issuedBy*`, `paidAt`,
  `cancelledAt`).
- `invoice_counters/{2026-27}` `{ seq, fy }` · `invoice_numbers/{DTS-26-27-0001}` `{ number, invoiceId, fy,
  sequence, byUid }` (create-only register) · `invoice_settings/access` `{ teamLeadersEnabled }` ·
  `invoice_settings/defaults` `{ payment, terms, notes, taxRate, pricesIncludeTax, dueDays }`.

## 24. BUSINESS RULES (this module)

- **Numbers:** `DTS/<yy-yy>/<0001>`, one series per Indian financial year taken from the INVOICE DATE (31 March
  belongs to the year ending that day), ≤16 characters (GST). Given only by `generateInvoice`, one transaction:
  counter +1, register entry created, invoice takes the number and the latest content. Pressing Generate twice
  returns the same number; a draft never holds one, so deleting drafts leaves no gaps. Generate needs a
  connection (15 s timeout) — a number is never given out offline.
- **After issue (owner's choice):** editable and keeps its number. The builder opens an issued invoice
  read-only; Edit → Save changes (explicit, validated) bumps `revision` and logs `edited`. Status Unpaid / Paid /
  Cancelled can change; a numbered invoice is never deleted (cancel it; the rules refuse a delete).
- **Tax:** CGST + SGST when the place of supply is the seller's state (from the seller GSTIN, else 37 Andhra
  Pradesh), IGST otherwise; typing a valid client GSTIN sets the place of supply. Prices include GST by default
  (the company quotes all-in; ₹17,400 → 14,745.76 + 1,327.12 + 1,327.12). Tax is computed per rate group in
  integer paise; inclusive prices keep the total exactly as typed and CGST = SGST to the paisa; line amounts
  always sum to the taxable value. "No GST" prints a plain INVOICE.
- **Before Generate (errors):** invoice date; due date not before it; seller name; seller GSTIN valid (and present
  for a GST invoice); customer name; client GSTIN valid if given; ≥1 item, each named with quantity > 0; total >
  ₹0. Warnings only: emails, IFSC, UPI (QR hidden), a ₹0 line, a discount to ₹0, missing ship-to address.
- **Defaults:** a new invoice takes the company from `company_settings/main` and payment/terms/notes/GST from
  `invoice_settings/defaults` over `INVOICE_FALLBACK_DEFAULTS`; the four admins can "Save as default" from the
  Tax, Payment, Terms and Notes sections. Both are snapshots in the invoice.
- **Not losing work:** drafts autosave 0.9 s after typing; leaving with an unsaved draft saves it on the way out;
  an issued invoice's unsaved edits prompt on in-app links/reload and are also kept on the device
  (`localStorage dts.invoiceWip.<uid>.<id>`) and offered back ("Restore") on reopening; `holdUpdates()` while
  anything is unsaved.
- **Fill from a sale** (sales members): from their in-memory orders (`useMyOrders`, no reads) — customer name and
  phone + one line at the sale amount; `sourceOrderId` recorded.

**Page plan (`planInvoicePages`):** item rows never split; every sheet with rows repeats the table header; the
header is never last on a sheet; the totals carry the last row with them rather than sit alone; a heading keeps
with its paragraph (terms and notes are split per line); a block taller than a sheet gets its own. Sheet 2+
starts with a fixed-height continuation header; every sheet has a footer "<number> · Page X of N". Draft and
Cancelled sheets carry a faint watermark; Paid prints a PAID pill. Geometry: A4 794 × 1123 px, 56 px sides.

## 25. STATUS

✅ Everything above. Verified: unit tests (`invoiceMath`, `invoiceRules`, `invoiceService` on memoryFirestore) and
a real-browser run of the pages on the in-memory store (see DEVELOPMENT-HISTORY 2026-10-08).
🟡 The PDF is photographed (html2canvas), so its text is not selectable; Print → "Save as PDF" gives a text PDF.
🟡 No credit notes, no partial payments, no emailing from the app, no starting-number setting for the series.

## 27. RISKS

- The rules are written but — like the rest of `docs/firestore-rules.md` — only real once published. Until then
  any staff account could write an invoice or the counter directly.
- `users/{uid}` is still writable by any staff under the catch-all, so a member could change their own `role`;
  every role-based rule (this module's included) inherits that pre-existing gap.
- An admin's invoice list query is capped at 500 (newest first).

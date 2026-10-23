---
paths:
  - "src/components/ai-accounts/**"
  - "src/pages/shared/AiAccounts.tsx"
  - "src/pages/tech-member/MyAiAccounts.tsx"
  - "src/services/aiAccounts.ts"
  - "src/hooks/useAiAccounts.ts"
  - "src/utils/flowCredits.ts"
  - "src/utils/geminiKeys.ts"
  - "src/hooks/useApiKeyEntry.ts"
  - "src/types/aiAccounts.ts"
  - "src/utils/proProof.ts"
---

# AI Accounts (Flow credits, paid logins) — DTS-OS module context

> Part of the project context (CLAUDE.md → Context map). Claude Code loads this file automatically when a
> file matching the `paths:` above is read or edited. Section numbers are CLAUDE.md's originals, so a
> reference such as "§17.2" still points here. Keep it current per CLAUDE.md §30 step 8; the source code wins.

## 9. APPLICATION MODULES (the entries for this module)

**9.21 AI Accounts (Flow credits, paid logins)** ✅ (2026-10-01). The team makes its videos in Google
Flow on Google AI Pro accounts from a Jio offer (1000 Flow credits a month each, for 18 months), and
every tech member opens 30 of them by 29 October at 2 a day. `pages/shared/AiAccounts.tsx` (tech admin
and team leader: Overview — totals, each member against the target, backups, credit calculator; Flow
accounts — search, filters, add for anyone, assign, disable, delete, history; Credit usage — the
month's ledger, edit/delete; Paid accounts; Settings — rates, monthly credits, validity, target),
`pages/tech-member/MyAiAccounts.tsx` (target card, "using now", own accounts, own credit entries, the
paid logins assigned to them, calculator), `components/ai-accounts/*`, `services/aiAccounts.ts`,
`hooks/useAiAccounts.ts`, `utils/flowCredits.ts` (pure rules), `types/aiAccounts.ts`. Collections
`flow_accounts` (id = lower-case email), `flow_account_secrets`, `flow_usage`, `paid_accounts`,
`paid_account_secrets`, `app_settings/flow_accounts`; `users.activeFlowAccountId`. Rules: credits per
clip 4 s = 7, 6 s = 10, 8 s = 12, 10 s = 15 (editable); an account's credits refresh on its creation
day each month (`cycleStartOf`, month-end clamped) and it expires 18 months after creation
(`expiryOf`); a member sees what they added, own or hold (`visibleTo`), a manager sees the team
(`teamAdminId`); an assigned account stays in its opener's target count and says "assigned to X by
Y"; passwords live in their own collections and are read only on Show/Copy; **every video job asks for
its Flow credits before it is marked complete** (My Work and Recent Ads through `useCreditGate`;
posters skip it; "No Flow credits" is allowed; a job handed in again shows what was already recorded
and starts at 0 clips); an ad can be split across accounts when one runs out; a ledger entry and the
account's cycle total move together (`increment` on `usedByCycle.<cycleStart>` — in one transaction since 2026-10-15, a
batch before); a creation date is fixed once credits are recorded.
**Dates (2026-10-15).** **Credits are dated by the day the clips were made** — the credit dialog asks "Day the clips were
made" (`credit-made-on`; today by default or the entry's own day when editing; never a day to come; a per-account warning
`credit-day-issue` and a refusal for a day before that account was opened). `recordFlowUsage(…, meta.madeOn)` (absent =
today) sets `date`, `month` and `cycleStart` from it, in a TRANSACTION that reads each account as stored and works the
cycle out from its STORED `createdOn` (`flowCredits.usageDateProblem`, `cycleFiguresOn`). `editFlowUsage` takes an
optional `date` (the credits move to that day's cycle), moves to another account's cycle for the entry's day and refuses
an account opened after the clips, rewrites `date` + `month`, and no longer fails on an entry whose account was deleted;
unchanged account + day keep the recorded `cycleStart`. **The opening day is checked on the stored account:**
`updateFlowAccount` is a transaction (the "credits already recorded" lock and the status compare read the stored
document; the password secret is written in it), and both pages hand `FlowAccountDialog` the LIVE account, filling the
form only when it opens (so "Fixed — credits are already recorded" shows live and typing is not wiped) — whichever of a
record and an opening-day edit runs second sees the other. The field reads **"Day the Flow account was opened"** with
the hint "Today — change it if the account was opened earlier. Its credits refresh on this day every month."
**"Month" now says which:** Overview "Credits per cycle" (Used / Left "in each account's current cycle"); the Credit usage
picker "Calendar month" with `usage-month-note` (entries by the calendar month the clips were made in; an account's cycle
runs from its opening day); each `UsageList` row "· cycle from 12 Oct"; account cards "This cycle (12 Oct – 11 Nov)";
My AI Accounts "Left / Used this cycle"; the credit dialog's figures are for the chosen day's cycle (an old entry shows
its own cycle and gives its credits back only within it). Paid ChatGPT (frames, footers, posters) and Grok (animations)
logins carry no credit maths: name, login, password, plan, renewal date, and who has them.
**Paste accounts + "Opening day not set" (2026-10-22, owner).** The tech admin's header button **Paste accounts**
(`flow-paste`, `components/ai-accounts/PasteAccountsDialog`, `canSeeAllApiKeys`) takes a list copied from a sheet — one
account a line, the login then its password — read by `flowCredits.parseFlowAccountPaste`: a bare login gets
`@gmail.com` (`BARE_LOGIN`: ≥ 6 characters with a letter, so a stray word or password is never an account), a password
alone on the next INDENTED line joins the login above it when that had none, a repeated account counts once and its
later password wins (a later blank never wipes one), anything else ("=====") is listed as skipped by line number only.
The preview shows counts and never a password (new / already in the list / without a password / skipped). Each line is
`services/aiAccounts.importFlowAccount` in its own transaction: a NEW account is the paster's (owner = holder = adder),
no phone, `createdOn: ""`, `expiresOn: ""`, its password if the line has one; an EXISTING account is left exactly as it
is, except that a password is filled in (`password_changed` in its history) when none is saved — a saved password is
never replaced from a paste. Result: added / passwords filled / left as they were / failed (paste again to retry).
`addFlowAccount` and the import share one record builder (`newFlowAccount`). **No opening day** (`hasOpeningDay` false):
`expiryOf` / `nextResetOf` give "", `accountState.noOpeningDay` true and `usable` false, `usageDateProblem` refuses
credits on it ("has no opening day yet — set it (Edit)…"), the credit picker shows it disabled "opening day not set",
`teamTotals.undated` counts it apart (Overview: "N usable · M opening day not set"; not in the credit totals), the card
reads "Opening day not set" with a note instead of the cycle bar, the filter has "Opening day not set" (`noday`), and
Edit saves such an account without making a phone or day up (`validateFlowAccountInput`'s `phoneOptional` /
`openingDayOptional`, only when the stored one is empty; typed values are still checked). Setting the day on Edit sets
the expiry as before. The add form still requires both.
**Move to (2026-10-23, owner).** A pasted account is the paster's, and Assign changes only the holder — Srinu pasted 8
accounts Bhanu Bezawada had opened and nothing could make them hers. The tech admin (`keyAdmin`; the `gemini_api_keys`
rule lets only them update a key record whose account they will not see) now gets a tick box on each Flow account card
and **Select all N shown** (`flow-select`, `flow-select-shown` — it takes what the search / filters / member filter show;
changing the member filter clears the selection); a sticky bar `flow-move-bar` "N selected · Move to… · **Move**" calls
`services/aiAccounts.moveFlowAccounts(accounts, to, actor)`: owner AND holder = `to`, `visibleTo` recomputed, history
`moved` (from = the previous owner) shown as "X moved it from A to B (owner)", the account's `gemini_api_keys` record's
`ownerId/Name` follow; batched ≤ 200 accounts a commit; accounts already `to`'s skipped (returns the count moved); the new
owner told once with the count, each previous owner / holder (not the mover) once. Credit entries stay as recorded.
**Pro proof (2026-10-23, owner).** Nothing knew whether an account really is Google AI Pro (an offer never activated
looks the same until Flow shows no credits). Each account now carries `proProof` (`types/aiAccounts.ProProof`; pure rules
`utils/proProof.ts`): a screenshot of **https://myaccount.google.com** in that account — the owner chose it: the "Pro"
badge under the picture, the FULL email and Google's address bar in one picture (the Gemini menu cuts a long email; the
Google One / Payments pages show no email). States `none` (absent) → `submitted` ("Waiting for check") → `confirmed`
("Pro confirmed") or `rejected` ("Sent back", with `reason`). **Send** (`components/ai-accounts/ProProofDialog`): the
card's **Send proof / Send again** (`flow-pro-proof-send`; the account's `visibleTo` people until it is confirmed, the
managers always — `canSendProProof`) and the member's progress card **Send next proof** (`ProProofProgress`,
`proProofToSend`: sent-back first, then never sent, oldest; "Send & next") open it; **Open myaccount.google.com** adds
`?authuser=<email>` (`proProofPageUrl`); the picture is picked, dropped or PASTED (Win+Shift+S, Ctrl+V). At once
`services/aiAccounts.prepareProProof` uploads it (Cloudinary), hashes it (`fileSha256`, SHA-256 — `duplicateProofOf`: the
same picture already sent for another visible account) and has Gemini read it (`readProProofImage`: the ad pipeline's
`callGeminiWithFallback`, lazily imported, `fast`, 25 s cap, never throws → `unchecked`; `PRO_PROOF_READER_PROMPT`,
`proProofReadingFrom` → `match` / `mismatch` (another email — Gmail compared without dots / +tags, `sameEmail` — or no Pro
badge) / `unclear` (email cut off, badge not seen) / `unchecked`). A mismatch or a duplicate needs the tick "send it
anyway" (`pro-proof-anyway`); the reviewer still sees the flag. `submitProProof` is a transaction (a member cannot
replace a proof confirmed a moment ago), history `pro_proof_sent`. **Check** (the tech admin, team leaders, main admin —
`canReviewProProof`): the **Pro proof** tab (`ProProofPanel`, tab label "Pro proof (N to check)") — confirmed / total bar,
four tiles that filter the list (Not sent / Waiting / Confirmed / Sent back), a **By member** table by the accounts each
person OPENED (Accounts, Sent, Not sent, Waiting, Confirmed, Sent back; most to do first; a row filters to that person),
the list (thumbnail, owner, what the app read, Check / View, **Send proof** for a reviewer on a not-sent account) and
**Check proofs (N)** (`ProProofReviewDialog`: flagged first, then oldest — `proProofReviewQueue`; the screenshot beside
the account's email and the app's reading; **Confirm Pro** (C) / **Send back** (S, a reason chip from `SEND_BACK_REASONS`
or typed); moves to the next by itself; ← → move). A card's **Check** (`flow-pro-proof-check`) opens it for one account.
`reviewProProof(account, decision, actor, { seenAt, reason })` is a transaction that refuses when the stored proof's
`submittedAt` is not the one on screen ("A new screenshot was sent — look at it first"); history `pro_confirmed` /
`pro_sent_back`; a send-back tells the owner and the sender once (`dedupeKey pro_sent_back_<id>_<submittedAt>_<uid>`), a
confirmation tells no one (the card shows it). Overview's member table has **Pro ✓** (confirmed / accounts opened); the
Flow accounts filter has the four Pro proof states; a sent-back account is only **flagged** in the credit picker
("· Pro proof sent back"), never blocked (owner's go-ahead: a wrong send-back must not stop real work). Disabled accounts
are left out of every count.

**Gemini API keys** ✅ (2026-10-10). Every Flow account is a Google account that makes one free Gemini key
in AI Studio (project `aiads`, key name "Gemini API Key"); the team collects them for DTS AdGen's prompt
generation. **Member:** each card has a "Gemini API key" row (status + Show/Copy, or **Add API key**);
`ApiKeyProgress` ("N / M of your accounts have a key", **Add next key**) walks the accounts they opened
without a working key (`apiKeyCoverage`: none first, oldest first, then refused); `ApiKeyDialog` opens AI
Studio in that account (`?authuser=<email>`) — or **Copy link** copies that same link, for an account signed in
on another Chrome profile or device — lists the steps with the name / project to copy (folded
once they have a key), checks the pasted key with Google as it is pasted, refuses a key cut short, an
invalid / leaked one, or one already on another visible account (fingerprint), and offers **Save & next**.
**The "Add a Flow account" form asks for the key too** (owner, 2026-10-10, later): the same steps and Google
check (`ApiKeySteps` + `hooks/useApiKeyEntry`, shared with `ApiKeyDialog`; AI Studio opens in the email being
typed), saved in the SAME transaction as the account (`addFlowAccount`'s `apiKey`); saving without a key needs
**"Add the key later"** ticked, and the card / "Add next key" ask for it after. **Tech admin
only** (`canSeeAllApiKeys`; owner, 2026-10-10): the **API keys** tab (`ApiKeysPanel`) — keys by person
(account, masked key, Working / Not working / Not checked, In use), "Still to add a key" per person,
search / person / status filters, select any set (or everything shown) → **Copy keys** (one per line),
**Download .env** (`API_KEY_1=…` numbered in list order, a `# n · person · account` comment each, a note
past 30), **Check**, **Mark in use / Not in use**; per row In use toggle, show, copy, check, remove. A key
Google refused is left out of every copy and .env; a refused key marked in use says to take it out of
Vercel. Overview's member table has an **API keys** column (working keys / accounts opened). Team leaders
see only each account's status, never the keys. **AdGen is unchanged** (owner's choice): it still reads
`API_KEY_1…30` from Vercel; the owner downloads the .env, pastes it into Vercel, redeploys, then marks
those keys in use. Code: `utils/geminiKeys.ts` (pure), `services/aiAccounts` (`checkGeminiApiKey`,
`saveFlowApiKey`, `removeFlowApiKey`, `setApiKeysInUse`, `saveApiKeyChecks`; `deleteFlowAccount` deletes
the key too), `useGeminiApiKeys` (only while the tab is open), `lib/clipboard.ts` (`copyText`,
`downloadText`; `copyText` moved there from DriveUploadSheet). The check is Google's **models.list**
(free, no generation quota; key in the `x-goog-api-key` header): 200 / 429 = working, 400 invalid / 403
leaked or API off = failed, unreachable = unchecked — measured live on 2026-10-10 against AdGen's 30
keys: keys 1, 12, 18 invalid, 13, 16, 23–28 leaked (11 dead).

## 24. BUSINESS RULES (IMPLEMENTED; verified in code)

- **AI Accounts (2026-10-01):** a video job is marked complete only after its Flow credits are entered
  (or "No Flow credits" is ticked); credits are 7 / 10 / 12 / 15 per 4 / 6 / 8 / 10-second clip; an
  account has 1000 credits a month from its creation day and expires 18 months after it; each tech
  member's target is 30 accounts by 29 October, 2 a day; members see only the accounts they added, own
  or hold; the tech admin and team leaders manage every account; an account's creation date is fixed
  once credits are recorded on it.
- **Pasted accounts (2026-10-22):** only the tech admin pastes; a pasted new account is the paster's with no opening
  day; an account already in the list is never changed by a paste except to fill a password it lacks; no credits are
  recorded on an account until its opening day is set.
- **Pro proof (2026-10-23):** the proof is a screenshot of myaccount.google.com in that account (Pro badge + full email);
  the account's people send it until it is confirmed, then only the tech admin / a team leader replaces it; only they
  confirm or send back, and a send-back needs a reason the owner is told; a decision is refused when a newer screenshot
  arrived; the app's reading is advice, never a decision; counts are by the accounts a person opened, disabled ones left
  out; a sent-back account is flagged in the credit picker, never blocked.
- **Credit dates (2026-10-15):** a credit entry's day, calendar month and account cycle come from the day the clips
  were made (default today) — never a day still to come, never before the account was opened; the day can be corrected
  later and the credits move to that day's cycle.
- **Gemini API keys (2026-10-10):** a new Flow account is asked for its key in its own form — pasted, or "Add
  the key later" ticked; never silently skipped. One key per Flow account, saved only after Google is asked (a refused
  key is never saved; an unreachable Google saves it as "Not checked"); the same key cannot go on two
  accounts the person can see; a new or replacement key starts **not in use**; only the tech admin sees
  every key (team leaders see status only; members their own accounts'); copies and the .env leave out
  keys Google refused; when a check finds a key newly dead its owner is told once (`dedupeKey`
  `api_key_failed_<account>_<fingerprint>`), and removing a key asks its owner for a new one.

## 25. CURRENT IMPLEMENTATION STATUS

**PARTIALLY IMPLEMENTED 🟡:**
- AI Accounts: credits are entered by the member (there is no Flow API), so the totals are only as
  good as the entries; nothing reconciles them with Flow's own balance. The rules for the new
  collections are written (`docs/firestore-rules.md`) but restrict nothing until they are published.
  Since 2026-10-15 recording credits, editing a credit entry and editing a Flow account are transactions: they need a
  connection (the batches before were queued offline). Checked by unit tests, the services on the in-memory Firestore
  and the real dialog in jsdom (`flowUsageDateOct15`) — not against live Firebase.
- Gemini API keys: collected, checked and exported, but AdGen does not read them by itself (the owner
  chose to deploy them by hand) — a key is used only once it is in Vercel's `API_KEY_1…30` and the app is
  redeployed, and AdGen reads at most 30. "In use" is the admin's label, not something the app verifies.
  `?authuser=<email>` opening AI Studio in the right account is Google's behaviour, not verified live.
- Pro proof (2026-10-23): checked by unit tests, the service on the in-memory Firestore, the real components in jsdom
  (`proProofOct23`) and the real pages in a browser harness with faked upload and reader — NOT against live Firebase,
  Cloudinary or Gemini. The reader runs on AdGen's Vercel keys (`API_KEY_*`); with none working every proof is "Not read
  by the app" and is checked by eye. `myaccount.google.com/?authuser=` is Google's behaviour, not verified live.

## 27. POTENTIAL RISKS (need verification)

- AI Accounts' writes are browser-side: the rule lets anyone in an account's `visibleTo` update the
  whole document, so the credit totals and holder fields are a UI rule, not a security boundary.
- `gemini_api_keys` holds live API keys in plain text, readable (once the rules are published) by the
  tech admin and the account's own people; until `docs/firestore-rules.md` is published any signed-in
  staff member can read them. A key in Vercel's `VITE_`/`API_KEY_` variables is built into the public JS
  bundle (`vite.config` `envPrefix`) — the likely reason keys get "reported as leaked" [NOT CONFIRMED] — so
  every key deployed that way can die the same way; the API keys tab's Check finds them.
- Pro proof: "only reviewers confirm" is a UI + service rule — the `flow_accounts` rule lets anyone in `visibleTo` write
  the whole document, so a member could write `proProof.status: "confirmed"` by hand (history would not show a
  reviewer). The screenshots are on Cloudinary's public URLs (each shows a team Google account's email).

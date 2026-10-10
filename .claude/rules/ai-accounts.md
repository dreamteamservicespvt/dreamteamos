---
paths:
  - "src/components/ai-accounts/**"
  - "src/pages/shared/AiAccounts.tsx"
  - "src/pages/tech-member/MyAiAccounts.tsx"
  - "src/services/aiAccounts.ts"
  - "src/hooks/useAiAccounts.ts"
  - "src/utils/flowCredits.ts"
  - "src/utils/geminiKeys.ts"
  - "src/types/aiAccounts.ts"
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
account's cycle total move in one batch (`increment` on `usedByCycle.<cycleStart>`); a creation date
is fixed once credits are recorded. Paid ChatGPT (frames, footers, posters) and Grok (animations)
logins carry no credit maths: name, login, password, plan, renewal date, and who has them.

**Gemini API keys** ✅ (2026-10-10). Every Flow account is a Google account that makes one free Gemini key
in AI Studio (project `aiads`, key name "Gemini API Key"); the team collects them for DTS AdGen's prompt
generation. **Member:** each card has a "Gemini API key" row (status + Show/Copy, or **Add API key**);
`ApiKeyProgress` ("N / M of your accounts have a key", **Add next key**) walks the accounts they opened
without a working key (`apiKeyCoverage`: none first, oldest first, then refused); `ApiKeyDialog` opens AI
Studio in that account (`?authuser=<email>`), lists the steps with the name / project to copy (folded
once they have a key), checks the pasted key with Google as it is pasted, refuses a key cut short, an
invalid / leaked one, or one already on another visible account (fingerprint), and offers **Save & next**;
a newly added Flow account goes straight on to its key (managers: only their own backup). **Tech admin
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
- **Gemini API keys (2026-10-10):** one key per Flow account, saved only after Google is asked (a refused
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
- Gemini API keys: collected, checked and exported, but AdGen does not read them by itself (the owner
  chose to deploy them by hand) — a key is used only once it is in Vercel's `API_KEY_1…30` and the app is
  redeployed, and AdGen reads at most 30. "In use" is the admin's label, not something the app verifies.
  `?authuser=<email>` opening AI Studio in the right account is Google's behaviour, not verified live.

## 27. POTENTIAL RISKS (need verification)

- AI Accounts' writes are browser-side: the rule lets anyone in an account's `visibleTo` update the
  whole document, so the credit totals and holder fields are a UI rule, not a security boundary.
- `gemini_api_keys` holds live API keys in plain text, readable (once the rules are published) by the
  tech admin and the account's own people; until `docs/firestore-rules.md` is published any signed-in
  staff member can read them. A key in Vercel's `VITE_`/`API_KEY_` variables is built into the public JS
  bundle (`vite.config` `envPrefix`) — the likely reason keys get "reported as leaked" [NOT CONFIRMED] — so
  every key deployed that way can die the same way; the API keys tab's Check finds them.

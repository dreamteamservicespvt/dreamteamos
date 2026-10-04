---
paths:
  - "src/components/ai-accounts/**"
  - "src/pages/shared/AiAccounts.tsx"
  - "src/pages/tech-member/MyAiAccounts.tsx"
  - "src/services/aiAccounts.ts"
  - "src/hooks/useAiAccounts.ts"
  - "src/utils/flowCredits.ts"
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

## 24. BUSINESS RULES (IMPLEMENTED; verified in code)

- **AI Accounts (2026-10-01):** a video job is marked complete only after its Flow credits are entered
  (or "No Flow credits" is ticked); credits are 7 / 10 / 12 / 15 per 4 / 6 / 8 / 10-second clip; an
  account has 1000 credits a month from its creation day and expires 18 months after it; each tech
  member's target is 30 accounts by 29 October, 2 a day; members see only the accounts they added, own
  or hold; the tech admin and team leaders manage every account; an account's creation date is fixed
  once credits are recorded on it.

## 25. CURRENT IMPLEMENTATION STATUS

**PARTIALLY IMPLEMENTED 🟡:**
- AI Accounts: credits are entered by the member (there is no Flow API), so the totals are only as
  good as the entries; nothing reconciles them with Flow's own balance. The rules for the new
  collections are written (`docs/firestore-rules.md`) but restrict nothing until they are published.

## 27. POTENTIAL RISKS (need verification)

- AI Accounts' writes are browser-side: the rule lets anyone in an account's `visibleTo` update the
  whole document, so the credit totals and holder fields are a UI rule, not a security boundary.

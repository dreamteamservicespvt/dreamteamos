# The Hiring Link — offer → joining → login, on one URL

**Date:** 2026-08-03
**Status:** Approved, ready for implementation

## The problem

Becoming an employee here means an admin types a password into a form and the person is instantly
inside the platform. The paperwork — offer letter, appointment letter — happens afterwards, from
inside the app, if it happens at all. A member therefore exists before anything has been agreed, and
the signed record of what they were offered is optional.

This inverts it. **The paperwork is the door.** One person, one link. They read what they are being
offered, they sign it, they read what they are agreeing to, they sign that — and only then does an
account exist for them. The login credentials are what waits on the other side of the signature.

```
   ┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌─────────────┐
   │  code gate  │ →  │ OFFER LETTER │ →  │ JOINING LTR  │ →  │ YOUR LOGIN  │
   │  [4][8][2]  │    │ read · sign  │    │ read · sign  │    │ email + pwd │
   └─────────────┘    │ ↓ PDF        │    │ ↓ PDF        │    │ + app URL   │
                      └──────────────┘    └──────────────┘    └─────────────┘
        no account ───────────────────────────────────────┘         │
                                            account created here ───┘
```

The department the admin belongs to decides everything downstream: a tech admin's hire gets a tech
role, a technical department record, and letters signed **CTO (Tech Admin)**; a sales admin's hire
gets a sales role, a sales department record, and letters signed **CEO (Sales Admin)**.

## What already exists, and is reused unchanged

This feature is mostly assembly. The following are used as they are:

| Existing piece | Role here |
|---|---|
| `utils/hrTemplates.ts` | Offer and appointment letter text (extended — see §5) |
| `components/agreement/AgreementView.tsx` | Renders the letter as A4 paper with two signature blocks |
| `utils/agreementPdf.ts` | True paginated PDF export of that paper |
| `components/agreement/SignaturePad.tsx` | Draw-or-photograph signature capture |
| `services/cloudinary.ts` | Unsigned upload — already works without an account |
| `users.signatureUrl` | The admin's stored signature, applied automatically |
| `services/hrDocuments.ts` | Where both signed letters land at the end |
| `services/hr.ts` | Where the employment record lands at the end |
| `services/memberCredentials.ts` | Where the generated password lands at the end |
| `api/order-chat.ts` pattern | Serverless endpoint + code gate + lockout, proven on the client chat |

## 1. Architecture

### One self-contained document per invite

`onboarding_invites/{inviteId}` holds everything about a pending hire: the terms the admin typed,
**both letters fully rendered and frozen at creation**, the company signature, and — as they arrive —
the candidate's two signatures. Nothing about this person exists anywhere else until they finish.

Frozen letter text is the same discipline `HrDocument.bodyText` already follows: a signed letter must
keep saying what the person actually signed, even if the admin later edits the invite or policy
changes.

### The candidate never touches Firestore

The client chat needed a scoped custom token because it holds a live subscription. This does not —
it is three sequential form posts. So every candidate-side read and write goes through one serverless
endpoint holding the service-account credentials.

Two consequences, both good:

- **No Firestore rule is opened to the public.** `onboarding_invites` stays admin-only.
- **The generated password is returned in an HTTP response**, not left in a document the candidate's
  browser could re-read.

### Completion is one server-side step

Signing the joining letter is what creates the account. The server then fans the invite out into the
records the rest of the app already reads:

| Written on completion | Why |
|---|---|
| Firebase Auth user | Their login, with a server-generated password |
| `users/{uid}` | They appear in My Team, payroll, work assignment — a normal member |
| `employee_profiles/{uid}` | Terms pre-filled and admin-confirmed, their signature stored, stage derived |
| `hr_documents` ×2 | Both signed letters, downloadable as PDF forever by them and the admin |
| `member_credentials/{uid}` | The existing 🔑 and Share Credentials buttons work on them immediately |
| `notifications` | The admin is told they accepted and joined |

This is the core design decision: the feature does not build a parallel HR system beside the existing
one, it **feeds** it. Their offer letter ends up in the same Documents tab as everyone's warning
letters and increment letters.

## 2. Data model

### `src/types/onboarding.ts`

```ts
export type InviteStatus =
  | "sent"            // link created, nothing signed
  | "offer_accepted"  // offer signed, joining letter not yet
  | "completed"       // both signed, account created
  | "declined"        // candidate refused one of the letters
  | "revoked";        // admin cancelled it

export interface OnboardingInvite {
  id: string;
  department: Department;                 // "tech" | "sales"
  role: UserRole;                         // tech_member | tech_team_leader | sales_member
  accessCode: string;                     // 4 digits
  failedAttempts?: number;
  lockedUntil?: number;                   // epoch ms

  // Person
  name: string;
  email: string;                          // lowercased — becomes their login
  phone: string;                          // normalised +91…
  address?: string | null;

  // Position
  designation: string;
  engagementType: EngagementType;
  employeeId?: string | null;
  reportingToName?: string | null;
  workLocation: string;

  // Dates
  joiningDate: string;                    // yyyy-MM-dd
  probationMonths: number;
  offerValidUntil?: string | null;

  // Money
  ctcMonthly: number;
  salaryPayDay?: number | null;           // day of month salary is paid
  target?: number;                        // sales only
  dailyTarget?: number;
  monthlyTarget?: number;
  googleDriveBaseUrl?: string | null;     // tech only

  // Schedule
  workingDays: string;
  workingHours: string;
  shiftDetails?: string | null;
  noticeDays: number;

  offerLetterNumber: string;              // e.g. DTS/OFR/2026/007

  // Frozen letters
  offerLetter:   { title: string; bodyText: string; issuedOn: string };
  joiningLetter: { title: string; bodyText: string; issuedOn: string };

  // Company side, captured at creation
  issuedById: string;
  issuedByName: string;
  issuedByDesignation: string;            // "CTO (Tech Admin)" | "CEO (Sales Admin)"
  companySignatureUrl: string;

  // Candidate side
  offerSignatureUrl?: string | null;
  offerAcceptedOn?: string | null;        // yyyy-MM-dd
  offerAcceptedAt?: HrTime | null;
  joiningSignatureUrl?: string | null;
  joiningAcceptedOn?: string | null;
  joiningAcceptedAt?: HrTime | null;

  status: InviteStatus;
  declinedStep?: "offer" | "joining" | null;
  declinedReason?: string | null;
  declinedAt?: HrTime | null;

  // Produced at completion
  createdUid?: string | null;
  generatedPassword?: string | null;      // admin-readable, like member_credentials
  completedAt?: HrTime | null;

  createdAt: HrTime;
  createdBy: string;
}
```

`inviteId` is 10 URL-safe characters from `crypto.getRandomValues` — short enough to survive being
pasted into WhatsApp, long enough not to be enumerable.

### Firestore rule (console, not repo)

Same situation as `member_credentials`: this document holds salary and, after completion, a readable
password.

```
match /onboarding_invites/{id} {
  allow read, write: if request.auth != null
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
       in ['main_admin', 'tech_admin', 'sales_admin'];
}
```

Written to `docs/firestore-rules-onboarding.md` for the admin to paste into the console.

## 3. The serverless endpoint — `api/onboarding.ts`

Same shape as `api/order-chat.ts`: origin allow-list, `firebase-admin` initialised from
`FIREBASE_SERVICE_ACCOUNT_KEY`, one POST with an `action`.

| Action | Body | Returns |
|---|---|---|
| `open` | `inviteId`, `code` | The candidate-facing projection of the invite (see below), or `wrong_code` / `locked` / `not_found` / `revoked` |
| `accept-offer` | `inviteId`, `code`, `signatureUrl` | updated projection |
| `accept-joining` | `inviteId`, `code`, `signatureUrl` | updated projection **+ `credentials: { email, password, loginUrl }`** |
| `decline` | `inviteId`, `code`, `step`, `reason` | `{ ok: true }` |

Every action re-checks the code — there is no session to steal, and re-posting four digits costs
nothing on three requests.

**The candidate projection** deliberately excludes `accessCode`, `failedAttempts`, `createdBy`,
`generatedPassword` and `createdUid`. It carries the two letter bodies, both signature URLs, the
company signatory details, status, and the person's own name/email/phone.

### Lockout

Identical to the client chat: 5 wrong codes → the invite stops answering for 15 minutes. Constants
shared, values unchanged, so both gates behave the same way for the same reason.

### `accept-joining` — the one that matters

Guarded so a double-tap or a retry cannot create two accounts:

1. Read the invite in a transaction. If `status === "completed"`, **return the existing credentials**
   rather than erroring — the candidate who refreshed at the wrong moment must still get their login.
2. If `status !== "offer_accepted"`, reject: the joining letter cannot be signed before the offer.
3. Generate the password: `Dts@` + 6 random alphanumerics (10 chars, ≥6 for Firebase, readable aloud
   over a phone call).
4. `admin.auth().createUser({ email, password, displayName })`. On `auth/email-already-exists`, fail
   with a clear message — the admin must fix the email, and silently binding to a stranger's existing
   account would be worse than failing.
5. Write `users/{uid}`, `employee_profiles/{uid}`, both `hr_documents`, `member_credentials/{uid}`.
6. Mark the invite `completed` with `createdUid`, `generatedPassword`, `completedAt`.
7. Notify the inviting admin.

**Field mapping at step 5**

`users/{uid}` — uid, email, name, role, `createdBy` = the inviting admin (so the existing
`createdBy === currentUser.uid` team filters pick them up), `isActive: true`, `salary` = ctcMonthly,
`target`/`dailyTarget`/`monthlyTarget` for sales, `googleDriveBaseUrl` for tech, phone, employeeId,
`employmentType` (only when the engagement is full/part-time — interns and contractors have no
equivalent there and must not be flattened into a lie), timestamps.

`employee_profiles/{uid}` — department, `stage` from `deriveStage` (so a future joining date reads
`offer_accepted` and a past one reads `probation`), designation, engagementType, workLocation,
reportingToName, joiningDate, probationMonths, ctcMonthly, workingHours, workingDays,
`noticeDaysOverride` = noticeDays, `seniorRole` = (role is tech_team_leader), **`signatureUrl` = the
signature they just uploaded** (so they never have to provide it again), `offerIssuedOn`,
`offerAcceptedOn`, and `termsSelfDeclared: false` with `termsConfirmedByName`/`termsConfirmedOn` set
to the admin — the admin typed these terms, so they are confirmed by definition.

`hr_documents` ×2 — full rows with `status: "signed"`, both signature URLs, `issuedByDesignation`,
and the frozen body text. Types `offer_letter` and `appointment_letter`.

### Local development

`vite dev` has no serverless functions. `services/onboardingGuest.ts` carries a dev-only fallback —
the same technique `orderChatGuest.devFallbackJoin` already uses, guarded by `import.meta.env.DEV` so
the branch is removed from production builds entirely. It checks the code against the invite document
with the client SDK and creates the account through `secondaryAuth.createUserWithoutSignOut`.

## 4. Screens

### Candidate — `/join/:inviteId` (public, no AppLayout)

A single page, four states, a progress rail across the top (Offer · Joining · Login).

1. **Code gate.** Four boxes, auto-advance, paste support, lockout messaging. Extracted from
   `ClientChat` into `components/common/AccessCodeGate.tsx` and used by both — it is the same UI
   solving the same problem, and two copies would drift.
2. **Offer letter.** The paper, full width, exactly as it will print. Below it: `SignaturePad`, an
   "Accept & sign this offer" button, and a quieter "I can't accept this" that takes a reason.
   On acceptance the paper re-renders with their signature in place, a **Download PDF** button
   appears, and so does **Continue to joining letter →**.
3. **Joining letter.** Identical treatment. On acceptance: **Download PDF**, then **Get my login →**.
4. **Credentials.** Email, password (masked with a reveal, plus copy buttons), the platform URL, and
   an **Open the platform** button. A line telling them to change the password after first login.
   Re-opening the link after completion returns straight to this screen.

Mobile-first throughout — this is opened on a phone, from WhatsApp, by someone who has never seen the
product.

### Admin — My Team (tech and sales)

**Add Member becomes a two-option menu:**

- *Onboard new employee* → the invite form (default)
- *Quick add (no paperwork)* → today's existing form, unchanged — needed for external ad creators,
  who are not employees and must never be sent an offer letter

**The invite form** — one modal, grouped exactly as §2: Person, Position, Dates, Money, Schedule.
Probation end date is computed and shown live from joining date + probation months. Notice period
defaults from the existing policy ladder (intern 7 / probation 15 / confirmed 30 / senior 45) and
stays editable. Offer letter number is auto-suggested as `DTS/OFR/{year}/{n}` and stays editable.

Two actions: **Preview letters** (both, in the real paper renderer, exactly what the candidate sees)
and **Create link**. Creation is blocked — with the same warning the Issue Document dialog already
shows — if the admin has not stored a signature yet, because the alternative is a letter going out
with an empty signature line.

On success: the URL and the code, with copy buttons and a one-tap WhatsApp share carrying both.

**Pending onboarding** — a collapsible card above the member grid, listing invites that are not yet
completed: name, designation, status chip, when it was sent. Per row: copy link, copy code, share on
WhatsApp, view the letters, revoke. Completed invites drop off the list, because the person is now in
the grid below it.

## 5. Letter templates

Both templates in `hrTemplates.ts` are extended to cover the README in full. This improves every
letter issued from the existing Issue Document dialog too, not just onboarding.

**Offer letter gains:** offer letter number, candidate address, a short leave-policy summary, an
explicit confidentiality clause, and the acceptance deadline stated as a condition.

**Joining letter gains:** employee ID, probation end date, confirmation-on-successful-probation,
shift details, salary payment date, bank account requirement, statutory deductions (TDS/PF/ESI as
applicable), the employee-responsibilities list, attendance / late-coming / remote-work policies,
conflict of interest, non-solicitation, background verification, an amendment clause, governing law
(India), and Place alongside the signature block.

New `HrDocumentExtras` keys: `offerLetterNumber`, `candidateAddress`, `salaryPayDay`, `shiftDetails`,
`noticeDays`, `probationEndDate`, `place`.

`utils/onboardingLetters.ts` shapes an invite into the `EmployeeProfile` the templates already expect
and builds both letters — so onboarding and the Issue Document dialog produce byte-identical text
from the same source, and there is exactly one place where an offer letter is worded.

**Signatory titles** — `hrPolicy.SIGNATORY_TITLE` becomes:

```ts
{ tech: "CTO (Tech Admin)", sales: "CEO (Sales Admin)" }
```

An admin who has set their own `designation` in Settings still overrides it, as today.

## 6. Error handling

| Situation | Behaviour |
|---|---|
| Wrong code | Count it; 5 wrong → 15-minute lockout, message says when to come back |
| Invite revoked or missing | "This link is no longer valid — please contact the team" |
| Offer expired (`offerValidUntil` passed) | Read-only, "this offer has expired", admin notified on open |
| Candidate declines | Invite `declined` with the reason; admin notified; link becomes read-only |
| Cloudinary upload fails | Signature step retries in place; nothing is recorded |
| Email already in Auth | Completion fails loudly with "this email already has an account"; invite stays at `offer_accepted` so the admin can fix the email and the candidate can retry |
| `accept-joining` called twice | Second call returns the same credentials — never a second account |
| Server unreachable | "Couldn't connect, check your internet" — no state changes |

## 7. Testing

**Unit (vitest):** password generation shape and randomness · letter building from an invite (both
types, all optional fields present and absent) · the candidate projection never leaks `accessCode` or
`generatedPassword` · lockout arithmetic · `deriveStage` for past/future joining dates · employee ID
and offer-number formatting.

**Browser (manual, per the agreed process):** create an invite as tech admin → open the link in a
clean profile → wrong code ×5 → lockout → correct code → read offer → sign → download PDF → continue
→ sign joining letter → download PDF → see credentials → log in with them → confirm the member
appears in My Team, their Documents tab holds both signed letters, their employment terms are
pre-filled and confirmed, and the 🔑 button shows the generated password. Then the same for sales,
and the decline path.

## 8. Files

**New**

```
api/onboarding.ts
src/types/onboarding.ts
src/services/onboarding.ts              admin side: create, watch, revoke
src/services/onboardingGuest.ts         candidate side: API client + dev fallback
src/utils/onboardingLetters.ts          invite → profile shape → both letters
src/pages/onboarding/JoinOnboarding.tsx
src/components/onboarding/OnboardInviteModal.tsx
src/components/onboarding/PendingInvites.tsx
src/components/onboarding/LetterStep.tsx
src/components/onboarding/CredentialsStep.tsx
src/components/common/AccessCodeGate.tsx
docs/firestore-rules-onboarding.md
```

**Modified**

```
src/utils/hrTemplates.ts        extended offer + appointment letters, new extras
src/utils/hrPolicy.ts           SIGNATORY_TITLE → CTO (Tech Admin) / CEO (Sales Admin)
src/App.tsx                     /join/:inviteId route
src/pages/tech-admin/MyTeam.tsx     split Add Member, pending invites
src/pages/sales-admin/MyTeam.tsx    same
src/pages/client/ClientChat.tsx      use the extracted AccessCodeGate
```

## 9. Deliberately out of scope

- **KYC during onboarding** (PAN, Aadhaar, address, bank). The existing profile panels already
  collect these after login, with the prompts and completion tracking built around them. Asking for
  them before the person has agreed to work here inverts the order and duplicates a working screen.
- **NDA and policy acknowledgement as separate documents.** Both are clauses inside the joining
  letter. The existing Issue Document dialog can still issue them standalone afterwards.
- **Editing an invite after creation.** The letters are frozen; changing terms means revoking and
  re-issuing, which is also what an employer should actually do.

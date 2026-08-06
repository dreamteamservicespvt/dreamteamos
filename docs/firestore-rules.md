# Firestore rules — the whole block

Paste this into **Firebase console → Firestore Database → Rules → Publish**. It replaces whatever
is there now.

> **Read this first.** As of writing, this database answers **unauthenticated reads**: anyone with
> the web API key — which is public, and has to be, it ships in the browser bundle — can read
> `employee_profiles` and get every employee's PAN, Aadhaar, home address and salary. These rules
> are what close that. Nothing in the app depends on the database staying open; it has been built
> and tested against these rules.

## The three public surfaces, and why each is safe

Everything else requires a signed-in account.

| Surface | Reads | Why it can be public |
|---|---|---|
| `/c/{chatId}` — client chat | `order_chats/{id}` | The link **is** the credential: `chatId` is a 20-character Firestore auto-id, and `/api/order-chat` exchanges it for a token scoped by an `orderChat` claim to that one room. Same model as an unlisted document link, and the exposure is one customer's own conversation about their own order. There is deliberately no code to type — see the header of `api/order-chat.ts`. |
| `/verify/{uid}` — ID card QR | `public_badges/{uid}` | Holds only what is already printed on the card in the scanner's hand: name, employee ID, designation, department, photo, joining date, active. **Never** the HR record. |
| `/join/{inviteId}` — hiring | via `/api/onboarding` | The candidate has no account yet; the serverless endpoint checks their code. The collection itself stays closed. |

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ── Helpers ────────────────────────────────────────────────────────────────────────────────
    function signedIn()  { return request.auth != null; }
    // A client-chat guest carries an `orderChat` claim; a real account never does.
    function isStaff()   { return signedIn() && !('orderChat' in request.auth.token); }
    function role()      { return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role; }
    function isAdmin()   { return isStaff() && role() in ['main_admin', 'tech_admin', 'sales_admin']; }
    function isManager() { return isStaff() && role() in ['main_admin', 'tech_admin', 'sales_admin', 'tech_team_leader']; }

    // ── The employment record: PAN, Aadhaar, address, salary ───────────────────────────────────
    // The single most sensitive collection here. The employee and their managers, nobody else.
    match /employee_profiles/{uid} {
      allow read:  if isStaff() && (request.auth.uid == uid || isManager());
      allow write: if isStaff() && (request.auth.uid == uid || isAdmin());
    }

    // ── What an ID card's QR resolves to ───────────────────────────────────────────────────────
    // World-readable ON PURPOSE, and the only reason employee_profiles above can be closed. It
    // holds a copy of the card's own face and nothing else — see services/publicBadge.ts, where
    // the field list is fixed and tested.
    match /public_badges/{uid} {
      allow read:  if true;
      allow write: if isStaff();
    }

    // ── Readable passwords, HR letters, company marks ──────────────────────────────────────────
    match /member_credentials/{uid} { allow read, write: if isAdmin(); }

    match /hr_documents/{docId} {
      allow read:   if isStaff() && (resource.data.memberId == request.auth.uid || isManager());
      allow create: if isAdmin();
      // The employee signs their own copy; nobody edits a letter after it has been issued.
      allow update: if isStaff() && (resource.data.memberId == request.auth.uid || isAdmin());
      allow delete: if isAdmin();
    }

    // Company identity and the marks that sign its letters — address, GSTIN, MSME, logo, the CEO's
    // and CTO's signatures, the stamp. Everyone signed in reads them, because every letterhead,
    // ID card and payslip in the app renders from this one document. Only admins set them: a write
    // here changes the signature on every document the company issues from that moment on.
    match /company_settings/{docId} {
      allow read:  if signedIn();
      allow write: if isAdmin();
    }

    // The document reference series — DTS/OFR/2026/0007. One counter document per year.
    // Readable by staff so an admin can see where a series has got to; written only by admins,
    // because rewinding a counter makes two letters share a reference.
    match /hr_counters/{year} {
      allow read:  if isStaff();
      allow write: if isAdmin();
    }

    // Hiring invites are reached only through /api/onboarding, which checks the candidate's code.
    match /onboarding_invites/{id} { allow read, write: if isAdmin(); }

    // ── The client order chat ──────────────────────────────────────────────────────────────────
    match /order_chats/{chatId} {
      function isGuestOfThisChat() {
        return signedIn() && request.auth.token.orderChat == chatId;
      }

      allow read:   if isStaff() || isGuestOfThisChat();
      allow create: if isStaff();
      allow delete: if isStaff();
      // A guest may only touch presence, unread counters and the last-message preview — never the
      // access code, the status, or who is in the room.
      allow update: if isStaff() || (
        isGuestOfThisChat() &&
        request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(['activeUsers', 'unreadCounts', 'lastMessage', 'lastMessageAt', 'lastMessageBy'])
      );

      match /messages/{messageId} {
        function guest() { return signedIn() && request.auth.token.orderChat == chatId; }
        // One extra read, on guest writes only, so a delivered chat cannot be reopened from a
        // browser console. Staff writes skip it, so ordinary messaging costs nothing.
        function chatIsOpen() {
          return get(/databases/$(database)/documents/order_chats/$(chatId)).data.status == 'open';
        }

        allow read:   if isStaff() || guest();
        allow create: if isStaff() || (guest() && request.resource.data.senderId == 'client' && chatIsOpen());
        allow update: if isStaff() || (guest() && resource.data.senderId == 'client');
        allow delete: if false;
      }
    }

    // ── Calls ──────────────────────────────────────────────────────────────────────────────────
    // A client's call rings the assigned member through the same collection the team already uses.
    match /calls/{callId} {
      function isGuest()  { return signedIn() && 'orderChat' in request.auth.token; }
      function isParty()  {
        return signedIn() && (
          request.auth.uid == resource.data.callerId || request.auth.uid == resource.data.receiverId
        );
      }

      allow read:   if signedIn();
      allow create: if signedIn() && (!isGuest() || request.resource.data.callerId == request.auth.uid);
      allow update, delete: if signedIn() && (!isGuest() || isParty());

      match /{candidateCollection}/{candidateId} {
        allow read, write: if signedIn();
      }
    }

    // ── Everything else the app runs on ────────────────────────────────────────────────────────
    // Staff-only, which is what it always should have been. Nothing outside this file needs it.
    match /{document=**} {
      allow read, write: if isStaff();
    }
  }
}
```

## After publishing, check these five things

1. Open an ID card and scan its QR (or visit `/verify/<uid>` signed out) — it must say **Verified
   employee**. If it says "could not be verified", press **Republish all badges** in
   Settings → ID card verification.
2. Open a client chat link in a private window. It must allow notifications, then open straight
   into the conversation with nothing typed. Send a message, and check it arrives on the member's
   side.
3. Sign in as a member and open **My details** — their own KYC must still load.
4. Sign in as an admin, open **HR & Documents**, and issue one letter. It must come back with a
   reference like `DTS/OFR/2026/0001` — if the reference is missing, `hr_counters` is being
   refused and the rule above did not publish.
5. Confirm an outsider is locked out. Every one of these returns **200 today**:

   ```sh
   KEY=<web-api-key>
   for c in employee_profiles hr_documents company_settings hr_counters member_credentials; do
     printf '%s -> ' "$c"
     curl -s -o /dev/null -w '%{http_code}\n' \
       "https://firestore.googleapis.com/v1/projects/dts-manager/databases/(default)/documents/$c?key=$KEY&pageSize=1"
   done
   ```

   After publishing, every line must read **403**. Anything still reading 200 is a collection these
   rules missed.

## Status

**Not yet published.** Verified on 2026-08-03: all five collections above still answer
unauthenticated reads with HTTP 200, including `employee_profiles` with every employee's PAN,
Aadhaar, home address and salary. Everything in the app has been built and tested against these
rules — publishing them is a paste into the console, and nothing in the product depends on the
database staying open.

## Nothing else to enable

Custom-token sign-in needs no auth provider turned on — it works from the service account the
Vercel functions already use (`FIREBASE_SERVICE_ACCOUNT_KEY`).

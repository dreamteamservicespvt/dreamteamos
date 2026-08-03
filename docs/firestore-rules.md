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
| `/c/{chatId}` — client chat | `order_chats/{id}` | The customer holds a link **and** a 4-digit code checked on the server, which mints a token scoped to that one room. |
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

    // The CEO signature and the company stamp. Everyone signed in reads them; admins set them.
    match /company_settings/{docId} {
      allow read:  if signedIn();
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

## After publishing, check these four things

1. Open an ID card and scan its QR (or visit `/verify/<uid>` signed out) — it must say **Verified
   employee**. If it says "could not be verified", press **Republish all badges** in
   Settings → Company signature & stamp.
2. Open a client chat link in a private window, enter the code, send a message.
3. Sign in as a member and open **My details** — their own KYC must still load.
4. Confirm an outsider is locked out:
   `curl "https://firestore.googleapis.com/v1/projects/dts-manager/databases/(default)/documents/employee_profiles?key=<web-api-key>"`
   must now return **403**, where today it returns 200 with everyone's PAN.

## Nothing else to enable

Custom-token sign-in needs no auth provider turned on — it works from the service account the
Vercel functions already use (`FIREBASE_SERVICE_ACCOUNT_KEY`).

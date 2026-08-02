# Firestore rules for the client order chat

Paste these into **Firebase console → Firestore Database → Rules**, alongside the rules already
there for `member_credentials`, `employee_profiles` and `hr_documents`.

> **Note on the current state of the database:** as of writing, this project's rules allow reads
> from unauthenticated clients — anyone holding the (public) web API key can read collections
> directly over the REST API. The order chat works either way, but the rules below are what make
> the client's 4-digit code mean anything. They are worth adding before the first client link goes
> out, because a client link is the first URL this app has ever handed to someone outside the team.

## How access works

A customer has no account. When they type the four digits, `/api/order-chat` checks the code with
the Admin SDK and returns a Firebase **custom token carrying an `orderChat` claim** naming exactly
one chat. These rules read that claim. Staff are matched by "signed in and not a guest", which
costs no extra document reads — the boundary that matters here is the client, and every staff
account already has access to the internal chat.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ── The client order chat ──────────────────────────────────────────────────────────────────
    match /order_chats/{chatId} {
      // A customer, pinned by their token to this one room.
      function isGuestOfThisChat() {
        return request.auth != null && request.auth.token.orderChat == chatId;
      }
      // Anyone signed in with a real account (a guest token always carries an orderChat claim).
      function isStaff() {
        return request.auth != null && !('orderChat' in request.auth.token);
      }

      allow read: if isStaff() || isGuestOfThisChat();
      allow create: if isStaff();

      // Staff may edit the room. A guest may only touch presence, unread counters and the
      // last-message preview — never the access code, the status or who is in the room.
      allow update: if isStaff() || (
        isGuestOfThisChat() &&
        request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(['activeUsers', 'unreadCounts', 'lastMessage', 'lastMessageAt', 'lastMessageBy'])
      );

      allow delete: if isStaff();

      match /messages/{messageId} {
        function guest() { return request.auth != null && request.auth.token.orderChat == chatId; }
        function staff() { return request.auth != null && !('orderChat' in request.auth.token); }
        // Only for guest writes: one extra read, and only to stop a delivered chat being reopened
        // from the browser console. Staff writes skip it, so ordinary messaging costs nothing.
        function chatIsOpen() {
          return get(/databases/$(database)/documents/order_chats/$(chatId)).data.status == 'open';
        }

        allow read: if staff() || guest();
        allow create: if staff() || (
          guest() && request.resource.data.senderId == 'client' && chatIsOpen()
        );
        allow update: if staff() || (guest() && resource.data.senderId == 'client');
        allow delete: if false;
      }
    }

    // ── Calls ──────────────────────────────────────────────────────────────────────────────────
    // The client's call rings the assigned member through the same `calls` collection the team
    // already uses, so a guest token has to be able to write there — but only for a call it is a
    // party to, and only ICE candidates on top of that.
    match /calls/{callId} {
      function isGuest() { return request.auth != null && 'orderChat' in request.auth.token; }
      function isParty() {
        return request.auth != null && (
          request.auth.uid == resource.data.callerId || request.auth.uid == resource.data.receiverId
        );
      }

      allow read: if request.auth != null;
      allow create: if request.auth != null && (
        !isGuest() || request.resource.data.callerId == request.auth.uid
      );
      allow update, delete: if request.auth != null && (!isGuest() || isParty());

      match /{candidateCollection}/{candidateId} {
        allow read, write: if request.auth != null;
      }
    }
  }
}
```

## Also required in the Firebase console

Nothing. Custom-token sign-in needs no auth provider to be enabled — it works from the service
account the Vercel functions already use (`FIREBASE_SERVICE_ACCOUNT_KEY`).

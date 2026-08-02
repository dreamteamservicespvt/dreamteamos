# Order Chat — a temporary client ↔ tech chat per assignment

**Date:** 2026-08-02
**Status:** approved, in implementation

## The problem

Every assigned order currently needs a WhatsApp group: someone creates it, adds the client, adds the
tech member, and both sides end up holding each other's phone numbers. It is slow to repeat for
every order, it leaks numbers, and there is no way to shut it down when the work is delivered.

## The feature

When a tech leader or tech admin assigns an order to a tech member, a chat room is created for that
assignment. Four people can be in it: the assigned member, the team leader, the tech admin, and that
one client. The client gets in with a link plus the **same 4-digit access code the assignment already
carries** — no account, no app, no phone numbers exchanged.

When the member marks the work completed, the room becomes view-only. If the work is reassigned, it
opens again for the new member.

## Data model

`order_chats/{assignmentId}` — the assignment id is already a random 20-character Firestore id, so
the share link is unguessable on its own.

| field | meaning |
|---|---|
| `assignmentId`, `orderId`, `uniqueId` | what job this is |
| `businessName`, `clientName`, `clientPhone` | who the client is |
| `accessCode` | mirrored from the assignment — the 4 digits the client types |
| `memberUid`, `memberName` | current assignee; the only person a client call rings |
| `participants[]`, `participantNames{}` | staff who may open it |
| `status` | `open` \| `locked` |
| `lastMessage*`, `unreadCounts{}`, `activeUsers[]` | list previews, badges, presence |
| `failedAttempts`, `lockedUntil` | wrong-code throttling, written only by the server |

`order_chats/{id}/messages/{msgId}` — same shape as the existing internal chat message (text, image,
video, file, voice, emoji, replies, soft delete) plus `senderName`, and `senderId: "client"` for the
customer. System lines (`type: "system"`) record reassignment and completion.

## Client access

1. Client opens `/c/{chatId}` and types the 4 digits.
2. The page POSTs to `/api/order-chat` (`action: "join"`). The Vercel function verifies the code with
   the Firebase Admin SDK, throttles wrong attempts (5 tries → 15-minute lockout), and returns a
   **custom token carrying an `orderChat` claim naming that one chat**.
3. The page signs in on an **isolated Firebase app instance**, so opening a client link on a machine
   where a staff member is logged in cannot disturb their session.
4. Firestore rules grant that token exactly one room.

The code is never sent to the browser to be compared, so it cannot be read out of the page or
brute-forced client-side.

Staff do not type the code — they are already authenticated and they are the ones handing it out.

## Lifecycle

| event | room |
|---|---|
| `createWorkAssignment` | created, `open` |
| `useCompleteWork` (mark completed) | `locked` — composer hidden, history readable forever |
| `reassignWork` | `open` again, new `memberUid`, system line "Work reassigned to …" |
| `unassignWork` | `locked` |
| assignment deleted | room deleted |

## Calls

Reuses the existing `calls` collection and its offer/answer/ICE protocol verbatim. The member's
receiver is mounted app-wide in `AppLayout`, listens on `calls where receiverId == my uid`, and takes
the caller's name off the call document — so a client call rings the assigned member on any page with
no change to the existing call system. The client's half is a small dedicated component mirroring the
same handshake against the guest Firestore instance.

- **Only the assigned member rings.** Leader and admin get a quiet in-app note ("client is calling
  <member>") because they hold many orders and ringing them all day is noise.
- The member can call the client back; the client can only be rung while their chat page is open,
  since they have no app. The member is told this plainly rather than left listening to a dead line.

## Notifications

A client message pushes to the assigned member only. Leader and admin see an unread badge on the
assignment card instead. Notifications from the client are raised server-side by `/api/order-chat`
(`action: "notify"`), which derives recipients from the chat document — a guest cannot address
arbitrary users.

## Surfaces

- **Leader / admin** — "Chat with client" on each assignment card in both `MemberAssignments` pages
  and on the assignment-created success screen. Modal offers **Send on WhatsApp** (pre-filled to the
  client's saved number), **Copy message**, and **Open chat**.
- **Member** — chat icon with unread badge on active cards in `MyWork` and `RecentAds`, behind the
  existing 4-digit modal.
- **Client** — `/c/{chatId}`: one full-screen mobile page, code screen, then the conversation.

One `OrderChatPanel` renders all three; only identity and "can I type" differ.

## Firestore rules

Guests are pinned to one room by their token claim, which costs no extra document reads. Staff are
allowed by "authenticated and not a guest" rather than a participant lookup, which would add a
billed read to every message — the boundary that matters here is the client, and every staff account
is already trusted with the internal chat. Guest message creates additionally `get()` the room to
enforce the lock; those writes are rare enough for the read to be irrelevant.

## Testing

Vitest for the lifecycle transitions and the share-message builder. Then a real browser: tech member
and tech leader signed in, client link on a mobile viewport, messages and media both ways, lock on
completion, re-open on reassignment.

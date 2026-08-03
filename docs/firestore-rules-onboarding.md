# Firestore rules — onboarding invites

The hiring link (`/join/:inviteId`) stores each pending hire in `onboarding_invites/{id}`. That
document holds the offer's salary and, once the candidate finishes, the readable password their
account was created with.

**The candidate never reads it.** Every step of their journey goes through `api/onboarding.ts`,
which runs under the service account and returns only the projection it decided to share. So no rule
has to be opened to the public for this feature to work — the collection should be locked to admins
exactly like `member_credentials`.

Paste this into **Firebase console → Firestore Database → Rules**:

```
match /onboarding_invites/{id} {
  allow read, write: if request.auth != null
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
       in ['main_admin', 'tech_admin', 'sales_admin'];
}
```

Without it the collection is as readable as anything else in the database, and a salary offer is
exactly the kind of thing that should not be.

## Why not a rule that lets the candidate read their own invite

Because there is no "own" to match on. They have no account — that is the point of the whole
feature; the account is what they get for signing. Any rule that let them read would have to let
*anyone* read, and the document contains the access code that is supposed to be guarding it.

## The environment variable this depends on

`api/onboarding.ts` needs `FIREBASE_SERVICE_ACCOUNT_KEY` set in the Vercel project — the same
variable `api/order-chat.ts` and `api/send-notification.ts` already use. Nothing new to add if
those are working.

## Local development

`vite dev` serves no serverless functions, so `services/onboardingGuest.ts` falls back to doing the
same work in the browser with the client SDK. That branch is compiled out of production builds
(`import.meta.env.DEV` is a literal `false` there). It relies on the rules being permissive in the
project you develop against — if you lock `onboarding_invites` down as above, local end-to-end
testing needs `vercel dev` instead.

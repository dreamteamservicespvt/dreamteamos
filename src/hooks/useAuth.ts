import { useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDocFromServer, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { reportCacheTrouble } from "@/services/localCacheRecovery";
import type { AppUser } from "@/types";

/**
 * Who is signed in, and their live profile.
 *
 * ── The rule this file exists to enforce ──────────────────────────────────────────────────────
 * FIREBASE AUTH decides whether you are signed in. Firestore only supplies your profile.
 *
 * That distinction used to be missing, and it was the cause of the "I typed the right password and
 * it says wrong" bug that could only be cleared by wiping browser data. The old listener called
 * `setUser(null)` — which the layout treats as signed out and bounces to /login — in two cases it
 * had no business doing so:
 *
 *   1. `!snap.exists()` without checking WHERE the snapshot came from. Firestore's persistent
 *      IndexedDB cache answers first and answers offline, so a cold or evicted cache reports
 *      "no such user" for an account that exists perfectly well on the server.
 *   2. The listener's error callback. A momentary network drop, a permission hiccup, or — the real
 *      culprit — an IndexedDB that has got itself into a bad state (multi-tab lock, quota, private
 *      mode, corruption) fires this, and the session was destroyed for it.
 *
 * Both look identical to the person at the keyboard: correct credentials, thrown back to the login
 * screen. And because the broken IndexedDB survives a refresh, it kept happening until they cleared
 * site data — which is exactly what "clear your browser cache" was papering over.
 *
 * So now: a session is ended ONLY on an answer the server actually gave. Anything unconfirmed —
 * cache miss, listener error, offline — leaves the session alone and is retried against the server.
 */
export function useAuth() {
  const { user, loading, setUser, setLoading } = useAuthStore();

  useEffect(() => {
    let docUnsub: (() => void) | null = null;
    let cancelled = false;

    /**
     * The last resort before ending someone's session: ask the server directly.
     *
     * Reached when the local cache says the profile is missing. If the server agrees, the account
     * really is gone and signing out is right. If the server cannot be reached, we keep the session
     * — being offline is not grounds for locking someone out of their own app.
     */
    const confirmAgainstServer = async (uid: string) => {
      try {
        const fresh = await getDocFromServer(doc(db, "users", uid));
        if (cancelled) return;

        if (!fresh.exists()) {
          setUser(null);
          setLoading(false);
          return;
        }
        const data = fresh.data();
        if (data.isActive === false) {
          setUser(null);
          setLoading(false);
          try { await signOut(auth); } catch { /* already gone */ }
          return;
        }
        setUser({ uid, ...data } as AppUser);
        setLoading(false);
      } catch {
        if (cancelled) return;
        // Could not reach the server. The cache could not answer either, which together points at
        // local storage being unusable — flag it so it can be repaired without the member ever
        // being told to clear their browser.
        reportCacheTrouble("user-profile-unreadable");
        setLoading(false);
      }
    };

    const authUnsub = onAuthStateChanged(auth, (firebaseUser) => {
      docUnsub?.();
      docUnsub = null;

      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      docUnsub = onSnapshot(
        doc(db, "users", firebaseUser.uid),
        async (snap) => {
          if (cancelled) return;
          // Read before the `exists()` check: that call is a type guard, and TypeScript narrows
          // the snapshot itself away in the negative branch.
          const fromCache = snap.metadata.fromCache;

          if (!snap.exists()) {
            // Never trust a cache-sourced "this account does not exist". Ask the server.
            if (fromCache) {
              void confirmAgainstServer(firebaseUser.uid);
              return;
            }
            setUser(null);
            setLoading(false);
            return;
          }

          const data = snap.data();

          // Deactivation is an admin decision, so it must come from the admin's copy of the truth.
          // Acting on a cached copy could lock out someone who was re-activated minutes ago.
          if (data.isActive === false) {
            if (fromCache) {
              void confirmAgainstServer(firebaseUser.uid);
              return;
            }
            setUser(null);
            setLoading(false);
            try { await signOut(auth); } catch { /* already gone */ }
            return;
          }

          // A cached profile is good enough to work from — it keeps the app usable offline, and
          // the server's copy overwrites it moments later.
          setUser({ uid: firebaseUser.uid, ...data } as AppUser);
          setLoading(false);
        },
        () => {
          if (cancelled) return;
          // The listener failed. The user is still authenticated — that is Firebase Auth's call,
          // not Firestore's — so the session stands and we go straight to the server.
          reportCacheTrouble("user-listener-failed");
          void confirmAgainstServer(firebaseUser.uid);
        },
      );
    });

    return () => {
      cancelled = true;
      docUnsub?.();
      authUnsub();
    };
  }, [setUser, setLoading]);

  return { user, loading };
}

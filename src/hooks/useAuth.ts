import { useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import type { AppUser } from "@/types";

export function useAuth() {
  const { user, loading, setUser, setLoading } = useAuthStore();

  useEffect(() => {
    // Live listener on the signed-in user's own doc. Using onSnapshot (not getDoc) means an
    // admin deactivation takes effect immediately — the user is signed out on the spot — and
    // role / profile changes reflect live without a reload.
    let docUnsub: (() => void) | null = null;

    const authUnsub = onAuthStateChanged(auth, (firebaseUser) => {
      // Tear down any previous user-doc listener before attaching a new one.
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
          if (!snap.exists()) {
            setUser(null);
            setLoading(false);
            return;
          }
          const data = snap.data();
          // Deactivated accounts cannot use the app — sign them straight out.
          if (data.isActive === false) {
            setUser(null);
            setLoading(false);
            try { await signOut(auth); } catch { /* ignore */ }
            return;
          }
          setUser({ uid: firebaseUser.uid, ...data } as AppUser);
          setLoading(false);
        },
        () => {
          setUser(null);
          setLoading(false);
        },
      );
    });

    return () => {
      docUnsub?.();
      authUnsub();
    };
  }, [setUser, setLoading]);

  return { user, loading };
}

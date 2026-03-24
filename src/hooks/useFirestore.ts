import { useState, useEffect } from "react";
import { collection, onSnapshot, query, type Query, type DocumentData } from "firebase/firestore";
import { db } from "@/services/firebase";

/**
 * Real-time Firestore collection listener hook.
 * Replaces getDocs with onSnapshot for live updates.
 */
export function useFirestoreCollection<T>(
  collectionName: string,
  transform?: (docs: { id: string; data: () => DocumentData }[]) => T[]
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    const unsub = onSnapshot(collection(db, collectionName), (snap) => {
      if (transform) {
        setData(transform(snap.docs as any));
      } else {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as T)));
      }
      setLoading(false);
    }, (err) => {
      console.error(`Firestore listener error (${collectionName}):`, err);
      setError(err.message || `Failed to load ${collectionName}`);
      setLoading(false);
    });
    return unsub;
  }, [collectionName]);

  return { data, loading, error };
}

export function useFirestoreQuery<T>(
  q: Query<DocumentData> | null,
  deps: any[] = []
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!q) { setLoading(false); return; }
    const unsub = onSnapshot(q, (snap) => {
      setData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as T)));
      setLoading(false);
    }, (err) => {
      console.error("Firestore query listener error:", err);
      setLoading(false);
    });
    return unsub;
  }, deps);

  return { data, loading };
}

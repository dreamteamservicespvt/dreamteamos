/**
 * The engine's storage port (2026-10-18).
 *
 * The Development OS engine is written once and runs in three places: the server (`api/devos.ts`, firebase-admin —
 * production), the browser during `vite dev` (no `/api` there — the DEV fallback) and the tests / browser harness
 * (the client SDK aliased to `src/test/memoryFirestore.ts`). This port is the only thing that differs. Paths are
 * plain strings ("devos_users/<uid>/attempts/<id>"); values are plain JSON (times are ms numbers — no Timestamp, no
 * FieldValue), so every adapter stores exactly what the engine wrote. `undefined` is stripped before a write.
 */
export type Doc = Record<string, unknown>;

export type FilterOp = "==" | "<" | "<=" | ">" | ">=" | "in" | "array-contains";
export type Filter = [field: string, op: FilterOp, value: unknown];

export interface QueryOptions {
  orderBy?: [field: string, dir: "asc" | "desc"];
  limit?: number;
}

export interface Row {
  id: string;
  path: string;
  data: Doc;
}

export interface DevTx {
  get(path: string): Promise<Doc | null>;
  set(path: string, data: Doc, merge?: boolean): void;
  delete(path: string): void;
}

export interface DevStore {
  /** Which adapter (for logs and the health view). */
  kind: "admin" | "client";
  get(path: string): Promise<Doc | null>;
  query(collectionPath: string, filters?: Filter[], opts?: QueryOptions): Promise<Row[]>;
  set(path: string, data: Doc, merge?: boolean): Promise<void>;
  delete(path: string): Promise<void>;
  /** All reads before writes (a Firestore rule); retried by the SDK on contention. */
  tx<T>(fn: (t: DevTx) => Promise<T>): Promise<T>;
  /** Up to ~400 independent writes in one batch. */
  batch(writes: { path: string; data: Doc | null; merge?: boolean }[]): Promise<void>;
}

/** A deep copy without `undefined` values (Firestore refuses them). */
export function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.filter((v) => v !== undefined).map(clean) as unknown as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (v !== undefined) out[k] = clean(v);
    return out as T;
  }
  return value;
}

// ── The client-SDK adapter (DEV fallback, tests, harness) ─────────────────────────────────────────

/** The few client-SDK functions the adapter needs — passed in, so this file never imports `firebase/firestore`. */
export interface ClientSdk {
  doc: (db: unknown, path: string) => unknown;
  collection: (db: unknown, path: string) => unknown;
  getDoc: (ref: unknown) => Promise<{ exists: () => boolean; data: () => Doc | undefined }>;
  getDocs: (q: unknown) => Promise<{ docs: { id: string; ref: { path: string }; data: () => Doc }[] }>;
  setDoc: (ref: unknown, data: Doc, opts?: { merge?: boolean }) => Promise<void>;
  deleteDoc: (ref: unknown) => Promise<void>;
  query: (col: unknown, ...c: unknown[]) => unknown;
  where: (f: string, op: string, v: unknown) => unknown;
  orderBy: (f: string, d: "asc" | "desc") => unknown;
  limit: (n: number) => unknown;
  runTransaction: <T>(db: unknown, fn: (tx: {
    get: (ref: unknown) => Promise<{ exists: () => boolean; data: () => Doc | undefined }>;
    set: (ref: unknown, data: Doc, opts?: { merge?: boolean }) => unknown;
    delete: (ref: unknown) => unknown;
  }) => Promise<T>) => Promise<T>;
  writeBatch: (db: unknown) => { set: (ref: unknown, d: Doc, o?: { merge?: boolean }) => unknown; delete: (ref: unknown) => unknown; commit: () => Promise<void> };
}

export function clientStore(sdk: ClientSdk, db: unknown): DevStore {
  const ref = (path: string) => sdk.doc(db, path);
  return {
    kind: "client",
    async get(path) {
      const snap = await sdk.getDoc(ref(path));
      return snap.exists() ? (snap.data() as Doc) : null;
    },
    async query(collectionPath, filters = [], opts = {}) {
      const constraints: unknown[] = filters.map(([f, op, v]) => sdk.where(f, op, v));
      if (opts.orderBy) constraints.push(sdk.orderBy(opts.orderBy[0], opts.orderBy[1]));
      if (opts.limit) constraints.push(sdk.limit(opts.limit));
      const snap = await sdk.getDocs(sdk.query(sdk.collection(db, collectionPath), ...constraints));
      return snap.docs.map((d) => ({ id: d.id, path: d.ref.path, data: d.data() }));
    },
    async set(path, data, merge) {
      await sdk.setDoc(ref(path), clean(data), merge ? { merge: true } : undefined);
    },
    async delete(path) {
      await sdk.deleteDoc(ref(path));
    },
    tx(fn) {
      return sdk.runTransaction(db, async (t) =>
        fn({
          async get(path) {
            const snap = await t.get(ref(path));
            return snap.exists() ? (snap.data() as Doc) : null;
          },
          set(path, data, merge) {
            t.set(ref(path), clean(data), merge ? { merge: true } : undefined);
          },
          delete(path) {
            t.delete(ref(path));
          },
        }),
      );
    },
    async batch(writes) {
      for (let i = 0; i < writes.length; i += 400) {
        const b = sdk.writeBatch(db);
        for (const w of writes.slice(i, i + 400)) {
          if (w.data === null) b.delete(ref(w.path));
          else b.set(ref(w.path), clean(w.data), w.merge ? { merge: true } : undefined);
        }
        await b.commit();
      }
    },
  };
}

// ── The firebase-admin adapter (production, `api/devos.ts`) ────────────────────────────────────────

/** The admin Firestore surface the adapter uses (typed loosely so this file does not import firebase-admin). */
export interface AdminDb {
  doc(path: string): unknown;
  collection(path: string): {
    where(f: string, op: string, v: unknown): AdminQuery;
    orderBy(f: string, d: "asc" | "desc"): AdminQuery;
    limit(n: number): AdminQuery;
    get(): Promise<AdminSnap>;
  };
  runTransaction<T>(fn: (t: {
    get(ref: unknown): Promise<{ exists: boolean; data(): Doc | undefined }>;
    set(ref: unknown, d: Doc, o?: { merge?: boolean }): unknown;
    delete(ref: unknown): unknown;
  }) => Promise<T>): Promise<T>;
  batch(): { set(ref: unknown, d: Doc, o?: { merge?: boolean }): unknown; delete(ref: unknown): unknown; commit(): Promise<unknown> };
}
interface AdminQuery { where(f: string, op: string, v: unknown): AdminQuery; orderBy(f: string, d: "asc" | "desc"): AdminQuery; limit(n: number): AdminQuery; get(): Promise<AdminSnap> }
interface AdminSnap { docs: { id: string; ref: { path: string }; data(): Doc }[] }

export function adminStore(db: AdminDb): DevStore {
  const ref = (path: string) => db.doc(path) as { get(): Promise<{ exists: boolean; data(): Doc | undefined }>; set(d: Doc, o?: { merge?: boolean }): Promise<unknown>; delete(): Promise<unknown> };
  return {
    kind: "admin",
    async get(path) {
      const snap = await ref(path).get();
      return snap.exists ? ((snap.data() ?? {}) as Doc) : null;
    },
    async query(collectionPath, filters = [], opts = {}) {
      let q: AdminQuery = db.collection(collectionPath) as unknown as AdminQuery;
      for (const [f, op, v] of filters) q = q.where(f, op, v);
      if (opts.orderBy) q = q.orderBy(opts.orderBy[0], opts.orderBy[1]);
      if (opts.limit) q = q.limit(opts.limit);
      const snap = await q.get();
      return snap.docs.map((d) => ({ id: d.id, path: d.ref.path, data: d.data() }));
    },
    async set(path, data, merge) {
      await ref(path).set(clean(data), merge ? { merge: true } : undefined);
    },
    async delete(path) {
      await ref(path).delete();
    },
    tx(fn) {
      return db.runTransaction(async (t) =>
        fn({
          async get(path) {
            const snap = await t.get(db.doc(path));
            return snap.exists ? ((snap.data() ?? {}) as Doc) : null;
          },
          set(path, data, merge) {
            t.set(db.doc(path), clean(data), merge ? { merge: true } : undefined);
          },
          delete(path) {
            t.delete(db.doc(path));
          },
        }),
      );
    },
    async batch(writes) {
      for (let i = 0; i < writes.length; i += 400) {
        const b = db.batch();
        for (const w of writes.slice(i, i + 400)) {
          if (w.data === null) b.delete(db.doc(w.path));
          else b.set(db.doc(w.path), clean(w.data), w.merge ? { merge: true } : undefined);
        }
        await b.commit();
      }
    },
  };
}

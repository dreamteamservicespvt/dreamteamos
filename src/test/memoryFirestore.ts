/**
 * An in-memory stand-in for `firebase/firestore`, for tests that need the data to behave like the
 * real thing: writes land, live listeners fire again when what they see changes, a transaction or a
 * batch is all-or-nothing, and `increment`, `arrayUnion`, `serverTimestamp`, `deleteField` and
 * `FieldPath` updates are applied the way Firestore applies them.
 *
 *   vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
 *
 * then seed and inspect it through the `__` helpers (same module instance as the mock). It covers the
 * calls the app makes — not the whole SDK; add what a new test needs here rather than in the test.
 */

type Data = Record<string, unknown>;

export class Timestamp {
  constructor(public seconds: number, public nanoseconds: number) {}
  static now() { return Timestamp.fromMillis(Date.now()); }
  static fromDate(d: Date) { return Timestamp.fromMillis(d.getTime()); }
  static fromMillis(ms: number) { return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6); }
  toDate() { return new Date(this.toMillis()); }
  toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
}

export class FieldPath {
  readonly segments: string[];
  constructor(...segments: string[]) { this.segments = segments; }
}

class Sentinel {
  constructor(readonly kind: "increment" | "serverTimestamp" | "arrayUnion" | "arrayRemove" | "deleteField", readonly value?: unknown) {}
}
export const increment = (n: number) => new Sentinel("increment", n);
export const serverTimestamp = () => new Sentinel("serverTimestamp");
export const arrayUnion = (...values: unknown[]) => new Sentinel("arrayUnion", values);
export const arrayRemove = (...values: unknown[]) => new Sentinel("arrayRemove", values);
export const deleteField = () => new Sentinel("deleteField");

// ── The store ───────────────────────────────────────────────────────────────────────────────────

/** "collection/id" (or a nested path) → the document's data. */
const docs = new Map<string, Data>();
let autoId = 0;

const clone = <T,>(v: T): T => {
  if (v instanceof Timestamp || v instanceof Sentinel || v instanceof FieldPath) return v;
  if (Array.isArray(v)) return v.map(clone) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Data).map(([k, x]) => [k, clone(x)])) as T;
  return v;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Test helpers. */
export function __reset() { docs.clear(); listeners.clear(); failing.clear(); autoId = 0; }
/**
 * Make every listener opened from now on for this collection (or document) path fail, the way a
 * denied or broken read does — its error callback is called and it never delivers.
 */
export function __failReads(path: string) { failing.add(path); }
export function __seed(path: string, data: Data) { docs.set(path, resolveAll(clone(data))); notify(); }
export function __read(path: string): Data | undefined { return docs.has(path) ? clone(docs.get(path)!) : undefined; }
export function __all(collectionPath: string): (Data & { id: string })[] {
  return [...docs.entries()]
    .filter(([path]) => parentOf(path) === collectionPath)
    .map(([path, data]) => ({ ...clone(data), id: idOf(path) }));
}

const parentOf = (path: string) => path.split("/").slice(0, -1).join("/");
const idOf = (path: string) => path.split("/").pop() || "";

// ── References and queries ──────────────────────────────────────────────────────────────────────

export type DocumentData = Data;
export type Firestore = object;
interface CollectionRef { type: "collection"; path: string; id: string }
interface DocRef { type: "document"; path: string; id: string; parent: CollectionRef }
type Constraint =
  | { kind: "where"; field: string | FieldPath; op: string; value: unknown }
  | { kind: "orderBy"; field: string; dir: "asc" | "desc" }
  | { kind: "limit"; n: number };
interface Query { type: "query"; path: string; constraints: Constraint[] }

export const getFirestore = () => ({});
export const initializeFirestore = () => ({});
export const memoryLocalCache = () => ({});
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export const documentId = () => new FieldPath("__name__");

export function collection(_parent: unknown, ...segments: string[]): CollectionRef {
  const path = segments.join("/");
  return { type: "collection", path, id: idOf(path) };
}

export function doc(parent: unknown, ...segments: string[]): DocRef {
  if (parent && (parent as CollectionRef).type === "collection") {
    const col = parent as CollectionRef;
    const id = segments.length ? segments.join("/") : `auto${String(++autoId).padStart(5, "0")}`;
    return { type: "document", path: `${col.path}/${id}`, id, parent: col };
  }
  const path = segments.join("/");
  return { type: "document", path, id: idOf(path), parent: collection(null, parentOf(path)) };
}

export const query = (col: CollectionRef | Query, ...constraints: Constraint[]): Query =>
  col.type === "query" ? { ...col, constraints: [...col.constraints, ...constraints] } : { type: "query", path: col.path, constraints };
export const where = (field: string | FieldPath, op: string, value: unknown): Constraint => ({ kind: "where", field, op, value });
export const orderBy = (field: string, dir: "asc" | "desc" = "asc"): Constraint => ({ kind: "orderBy", field, dir });
export const limit = (n: number): Constraint => ({ kind: "limit", n });

const segmentsOf = (field: string | FieldPath) => (field instanceof FieldPath ? field.segments : field.split("."));
const valueAt = (data: Data, id: string, field: string | FieldPath): unknown => {
  const segs = segmentsOf(field);
  if (segs.length === 1 && segs[0] === "__name__") return id;
  return segs.reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Data)[k] : undefined), data);
};
const comparable = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : v) as number | string;

function matches(data: Data, id: string, c: Constraint & { kind: "where" }): boolean {
  const v = valueAt(data, id, c.field);
  switch (c.op) {
    case "==": return same(v, c.value);
    case "!=": return v !== undefined && !same(v, c.value);
    case "<": return v !== undefined && comparable(v) < comparable(c.value);
    case "<=": return v !== undefined && comparable(v) <= comparable(c.value);
    case ">": return v !== undefined && comparable(v) > comparable(c.value);
    case ">=": return v !== undefined && comparable(v) >= comparable(c.value);
    case "array-contains": return Array.isArray(v) && v.some((x) => same(x, c.value));
    case "array-contains-any": return Array.isArray(v) && (c.value as unknown[]).some((want) => v.some((x) => same(x, want)));
    case "in": return (c.value as unknown[]).some((want) => same(v, want));
    case "not-in": return v !== undefined && !(c.value as unknown[]).some((want) => same(v, want));
    default: throw new Error(`memoryFirestore: the "${c.op}" filter is not supported`);
  }
}

function run(q: Query): { id: string; path: string; data: Data }[] {
  let rows = [...docs.entries()]
    .filter(([path]) => parentOf(path) === q.path)
    .map(([path, data]) => ({ id: idOf(path), path, data }));
  for (const c of q.constraints) {
    if (c.kind === "where") rows = rows.filter((r) => matches(r.data, r.id, c));
  }
  const orders = q.constraints.filter((c): c is Constraint & { kind: "orderBy" } => c.kind === "orderBy");
  if (orders.length) {
    rows.sort((a, b) => {
      for (const o of orders) {
        const x = comparable(valueAt(a.data, a.id, o.field));
        const y = comparable(valueAt(b.data, b.id, o.field));
        if (x === y) continue;
        return (x < y ? -1 : 1) * (o.dir === "desc" ? -1 : 1);
      }
      return 0;
    });
  }
  const lim = q.constraints.find((c): c is Constraint & { kind: "limit" } => c.kind === "limit");
  return lim ? rows.slice(0, lim.n) : rows;
}

// ── Snapshots ───────────────────────────────────────────────────────────────────────────────────

const docSnap = (ref: DocRef, data: Data | undefined) => ({
  id: ref.id, ref, exists: () => data !== undefined, data: () => (data === undefined ? undefined : clone(data)),
  get: (field: string) => (data === undefined ? undefined : clone(valueAt(data, ref.id, field))),
});
const querySnap = (q: Query) => {
  const found = run(q).map((r) => docSnap(doc(null, r.path), r.data));
  return { docs: found, empty: found.length === 0, size: found.length, forEach: (cb: (d: (typeof found)[number]) => void) => found.forEach(cb) };
};

export const getDoc = async (ref: DocRef) => docSnap(ref, docs.get(ref.path));
export const getDocFromServer = getDoc;
export const getDocFromCache = getDoc;
export const getDocs = async (q: Query | CollectionRef) => querySnap(q.type === "query" ? q : query(q));
export const getDocsFromServer = getDocs;

type Listener = { target: DocRef | Query; next: (snap: unknown) => void; last?: string };
const listeners = new Set<Listener>();
const failing = new Set<string>();

function deliver(l: Listener) {
  const snap = l.target.type === "document" ? docSnap(l.target, docs.get(l.target.path)) : querySnap(l.target);
  const key = l.target.type === "document"
    ? JSON.stringify(docs.get(l.target.path) ?? null)
    : JSON.stringify((snap as ReturnType<typeof querySnap>).docs.map((d) => [d.id, d.data()]));
  // Like Firestore: a listener hears again only when what it sees has changed.
  if (key === l.last) return;
  l.last = key;
  l.next(snap);
}
function notify() { for (const l of [...listeners]) if (listeners.has(l)) deliver(l); }

export function onSnapshot(target: DocRef | Query | CollectionRef, next: (snap: never) => void, _error?: (err: Error) => void): () => void {
  if (failing.has(target.path)) {
    queueMicrotask(() => _error?.(new Error("permission-denied (memoryFirestore.__failReads)")));
    return () => undefined;
  }
  const l: Listener = { target: target.type === "collection" ? query(target) : target, next: next as (snap: unknown) => void };
  listeners.add(l);
  // The first answer arrives asynchronously, as it does from the SDK.
  queueMicrotask(() => { if (listeners.has(l)) deliver(l); });
  return () => { listeners.delete(l); };
}

// ── Writes ──────────────────────────────────────────────────────────────────────────────────────

function resolve(current: unknown, value: unknown): unknown {
  if (!(value instanceof Sentinel)) return value;
  switch (value.kind) {
    case "increment": return (typeof current === "number" ? current : 0) + (value.value as number);
    case "serverTimestamp": return Timestamp.now();
    case "arrayUnion": {
      const list = Array.isArray(current) ? [...current] : [];
      for (const v of value.value as unknown[]) if (!list.some((x) => same(x, v))) list.push(clone(v));
      return list;
    }
    case "arrayRemove": return (Array.isArray(current) ? current : []).filter((x) => !(value.value as unknown[]).some((v) => same(x, v)));
    default: return undefined;
  }
}
/** Sentinels inside a plain `set` (no merge) resolve against nothing. */
function resolveAll(data: Data): Data {
  const out: Data = {};
  for (const [k, v] of Object.entries(data)) {
    if (v instanceof Sentinel) { if (v.kind !== "deleteField") out[k] = resolve(undefined, v); }
    else out[k] = v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Timestamp) ? resolveAll(v as Data) : v;
  }
  return out;
}
function setAt(data: Data, segs: string[], value: unknown) {
  let node = data;
  for (const k of segs.slice(0, -1)) {
    if (!node[k] || typeof node[k] !== "object" || Array.isArray(node[k])) node[k] = {};
    node = node[k] as Data;
  }
  const last = segs[segs.length - 1];
  if (value instanceof Sentinel && value.kind === "deleteField") delete node[last];
  else node[last] = clone(resolve(node[last], value));
}
function merge(target: Data, patch: Data) {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Timestamp) && !(v instanceof Sentinel)) {
      if (!target[k] || typeof target[k] !== "object" || Array.isArray(target[k])) target[k] = {};
      merge(target[k] as Data, v as Data);
    } else setAt(target, [k], v);
  }
}
/** `update(ref, {a: 1, "b.c": 2})` or `update(ref, "a", 1, new FieldPath("b", "c"), 2)`. */
function fieldPairs(args: unknown[]): [string[], unknown][] {
  if (args.length === 1 && !(args[0] instanceof FieldPath) && typeof args[0] === "object") {
    return Object.entries(args[0] as Data).map(([k, v]) => [k.split("."), v]);
  }
  const pairs: [string[], unknown][] = [];
  for (let i = 0; i < args.length; i += 2) pairs.push([segmentsOf(args[i] as string | FieldPath), args[i + 1]]);
  return pairs;
}

type Op =
  | { kind: "set"; ref: DocRef; data: Data; merge: boolean }
  | { kind: "update"; ref: DocRef; args: unknown[] }
  | { kind: "delete"; ref: DocRef };

/** Applies every op to a copy first, so one bad op (an update of a missing doc) writes nothing. */
function commit(ops: Op[]) {
  const staged = new Map<string, Data | null>();
  const read = (path: string) => (staged.has(path) ? staged.get(path) : docs.has(path) ? clone(docs.get(path)!) : null);
  for (const op of ops) {
    const current = read(op.ref.path);
    if (op.kind === "delete") { staged.set(op.ref.path, null); continue; }
    if (op.kind === "set") {
      if (op.merge && current) { const next = clone(current); merge(next, op.data); staged.set(op.ref.path, next); }
      else if (op.merge) { const next: Data = {}; merge(next, op.data); staged.set(op.ref.path, next); }
      else staged.set(op.ref.path, resolveAll(clone(op.data)));
      continue;
    }
    if (!current) throw Object.assign(new Error(`No document to update: ${op.ref.path}`), { code: "not-found" });
    const next = clone(current);
    for (const [segs, value] of fieldPairs(op.args)) setAt(next, segs, value);
    staged.set(op.ref.path, next);
  }
  for (const [path, data] of staged) { if (data) docs.set(path, data); else docs.delete(path); }
  notify();
}

export async function setDoc(ref: DocRef, data: Data, options?: { merge?: boolean }) { commit([{ kind: "set", ref, data, merge: !!options?.merge }]); }
export async function updateDoc(ref: DocRef, ...args: unknown[]) { commit([{ kind: "update", ref, args }]); }
export async function deleteDoc(ref: DocRef) { commit([{ kind: "delete", ref }]); }
export async function addDoc(col: CollectionRef, data: Data) { const ref = doc(col); commit([{ kind: "set", ref, data, merge: false }]); return ref; }

export function writeBatch(_db?: unknown) {
  const ops: Op[] = [];
  const batch = {
    set: (ref: DocRef, data: Data, options?: { merge?: boolean }) => { ops.push({ kind: "set", ref, data, merge: !!options?.merge }); return batch; },
    update: (ref: DocRef, ...args: unknown[]) => { ops.push({ kind: "update", ref, args }); return batch; },
    delete: (ref: DocRef) => { ops.push({ kind: "delete", ref }); return batch; },
    commit: async () => commit(ops),
  };
  return batch;
}

export async function runTransaction<T>(_db: unknown, fn: (tx: unknown) => Promise<T>): Promise<T> {
  const ops: Op[] = [];
  const tx = {
    get: async (ref: DocRef) => docSnap(ref, docs.get(ref.path)),
    set: (ref: DocRef, data: Data, options?: { merge?: boolean }) => { ops.push({ kind: "set", ref, data, merge: !!options?.merge }); return tx; },
    update: (ref: DocRef, ...args: unknown[]) => { ops.push({ kind: "update", ref, args }); return tx; },
    delete: (ref: DocRef) => { ops.push({ kind: "delete", ref }); return tx; },
  };
  const result = await fn(tx);
  commit(ops);
  return result;
}

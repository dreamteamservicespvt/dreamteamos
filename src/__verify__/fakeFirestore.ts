// THROWAWAY — an in-memory stand-in for firebase/firestore, enough for the studio to mount.
export type DocumentData = Record<string, unknown>;
export type Firestore = object;
export type Query = object;
export class Timestamp {
  constructor(public seconds: number, public nanoseconds: number) {}
  static now() { return new Timestamp(Math.floor(Date.now() / 1000), 0); }
  static fromDate(d: Date) { return new Timestamp(Math.floor(d.getTime() / 1000), 0); }
  toDate() { return new Date(this.seconds * 1000); }
  toMillis() { return this.seconds * 1000; }
}
const ok = async () => ({ id: "g1" });
export const collection = () => ({});
export const doc = () => ({});
export const query = () => ({});
export const where = () => ({});
export const orderBy = () => ({});
export const limit = () => ({});
export const documentId = () => "__id";
export const addDoc = ok;
export const setDoc = ok;
export const updateDoc = ok;
export const deleteDoc = ok;
export const getDoc = async () => ({ exists: () => false, id: "none", data: () => ({}) });
export const getDocFromServer = getDoc;
export const getDocs = async () => ({ docs: [], empty: true, size: 0, forEach: () => {} });
export const onSnapshot = () => () => {};
export const serverTimestamp = () => null;
export const deleteField = () => null;
export const arrayUnion = (...v: unknown[]) => v;
export const arrayRemove = (...v: unknown[]) => v;
export const increment = (n: number) => n;
export const runTransaction = async (_db: unknown, fn: (t: unknown) => unknown) => fn({ get: getDoc, set: () => {}, update: () => {} });
export const writeBatch = () => ({ set: () => {}, update: () => {}, delete: () => {}, commit: async () => {} });
export const getFirestore = () => ({});
export const initializeFirestore = () => ({});
export const memoryLocalCache = () => ({});
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});

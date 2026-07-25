import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager,
} from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyDJcuVz64r8STeCmY-SqhFlv1nKvbjGmC8",
  authDomain: "dts-manager.firebaseapp.com",
  projectId: "dts-manager",
  storageBucket: "dts-manager.firebasestorage.app",
  messagingSenderId: "569171106682",
  appId: "1:569171106682:web:326467f9b90e953b2e14c3",
  measurementId: "G-3LWNG8G36G",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

/**
 * Firestore with an on-disk cache, and a working app when that cache cannot be had.
 *
 * The persistent IndexedDB cache is a real saving on the free plan: documents served from it cost
 * ZERO reads, so re-opening a listener only pulls what changed instead of re-reading the whole
 * result set. But it is a nice-to-have, and it used to be treated as a requirement — when IndexedDB
 * was unavailable (private browsing, storage pressure, a locked multi-tab handle, an Android
 * WebView that had reclaimed its storage) the app came up broken rather than simply coming up
 * without a cache.
 *
 * Now the persistent cache is attempted and an in-memory one is used if it cannot be created. That
 * session costs more reads and works completely, which is the right trade against a member who
 * cannot get in at all.
 */
function createDb() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (err) {
    console.warn("[firebase] persistent cache unavailable — running from memory this session", err);
    return initializeFirestore(app, { localCache: memoryLocalCache() });
  }
}

export const db = createDb();

export default app;

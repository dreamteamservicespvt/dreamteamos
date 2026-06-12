import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

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

// Persistent IndexedDB cache (free-plan quota saver): documents served from the local
// cache cost ZERO reads — when a page re-opens a listener, the server only sends docs
// that changed since last sync instead of re-reading the whole result set every time.
// Multi-tab manager keeps the cache working when several tabs are open.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export default app;

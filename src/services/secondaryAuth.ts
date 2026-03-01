import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";

// Secondary Firebase app instance used solely for creating new users
// This prevents the admin from being signed out when creating accounts
const firebaseConfig = {
  apiKey: "AIzaSyDJcuVz64r8STeCmY-SqhFlv1nKvbjGmC8",
  authDomain: "dts-manager.firebaseapp.com",
  projectId: "dts-manager",
  storageBucket: "dts-manager.firebasestorage.app",
  messagingSenderId: "569171106682",
  appId: "1:569171106682:web:326467f9b90e953b2e14c3",
  measurementId: "G-3LWNG8G36G",
};

const secondaryApp = initializeApp(firebaseConfig, "secondary");
const secondaryAuth = getAuth(secondaryApp);

export async function createUserWithoutSignOut(email: string, password: string) {
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  // Sign out the secondary auth so it doesn't hold a session
  await secondaryAuth.signOut();
  return cred;
}

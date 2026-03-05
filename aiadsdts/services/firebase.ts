import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyApBlPT_Xad7mGPki8flnngkX94nKH3AXE",
  authDomain: "aiproject-f6c62.firebaseapp.com",
  projectId: "aiproject-f6c62",
  storageBucket: "aiproject-f6c62.firebasestorage.app",
  messagingSenderId: "968514055212",
  appId: "1:968514055212:web:bf0272e11dcf8da48b3589",
  measurementId: "G-7YRR591SDF"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Sign in with email and password
export const loginWithEmail = async (email: string, password: string): Promise<User> => {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
};

// Sign out
export const logout = async (): Promise<void> => {
  await signOut(auth);
};

// Auth state observer
export const onAuthChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

// Saved generation interface
export interface SavedGeneration {
  id?: string;
  userId: string;
  businessName: string;
  businessType: string;
  businessInfo: any;
  mainFramePrompts: string[];
  headerPrompt: string;
  posterPrompt?: string;
  voiceOverScript: string;
  veoPrompts: string[];
  stockImagePrompts?: any[] | null;
  adType: string;
  festivalName?: string;
  attireType: string;
  duration: number;
  createdAt: Timestamp | null;
}

// Save a generation
export const saveGeneration = async (userId: string, data: Omit<SavedGeneration, 'id' | 'userId' | 'createdAt'>): Promise<string> => {
  try {
    console.log('Saving to Firestore...', { userId, data });
    const docRef = await addDoc(collection(db, 'generations'), {
      ...data,
      userId,
      createdAt: serverTimestamp()
    });
    console.log('Saved successfully with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Firestore save error:', error);
    throw error;
  }
};

// Get user's saved generations
export const getSavedGenerations = async (userId: string): Promise<SavedGeneration[]> => {
  try {
    console.log('Fetching saved generations for user:', userId);
    // Simplified query - just filter by userId without orderBy to avoid index requirement
    const q = query(
      collection(db, 'generations'),
      where('userId', '==', userId)
    );
    
    const querySnapshot = await getDocs(q);
    const generations: SavedGeneration[] = [];
    
    querySnapshot.forEach((doc) => {
      generations.push({
        id: doc.id,
        ...doc.data()
      } as SavedGeneration);
    });
    
    // Sort client-side instead
    generations.sort((a, b) => {
      const dateA = a.createdAt?.toDate?.() || new Date(0);
      const dateB = b.createdAt?.toDate?.() || new Date(0);
      return dateB.getTime() - dateA.getTime();
    });
    
    console.log('Fetched generations:', generations.length);
    return generations;
  } catch (error) {
    console.error('Firestore fetch error:', error);
    throw error;
  }
};

// Delete a saved generation
export const deleteGeneration = async (generationId: string): Promise<void> => {
  await deleteDoc(doc(db, 'generations', generationId));
};

export { auth, db };

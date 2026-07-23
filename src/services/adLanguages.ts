/**
 * The ad language list, shared company-wide.
 *
 * The six languages the team sells in are fixed, but a client occasionally asks for something
 * else. Rather than making every member re-type it, a custom language is appended to one
 * Firestore doc and appears in the dropdown for everyone from then on.
 */
import { doc, onSnapshot, setDoc, arrayUnion } from "firebase/firestore";
import { db } from "@/services/firebase";
import { BASE_AD_LANGUAGES } from "@/utils/adRequirement";

export { BASE_AD_LANGUAGES };

const LANGUAGES_DOC = () => doc(db, "app_settings", "ad_languages");

/** Base list + saved customs, de-duplicated case-insensitively, base entries first. */
export function mergeAdLanguages(custom?: string[] | null): string[] {
  const seen = new Set(BASE_AD_LANGUAGES.map((l) => l.toLowerCase()));
  const merged: string[] = [...BASE_AD_LANGUAGES];
  for (const raw of custom || []) {
    const value = String(raw || "").trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    merged.push(value);
  }
  return merged;
}

/**
 * Live language list. An unreadable doc degrades to the base list rather than an empty dropdown,
 * so a permissions hiccup can never block a sale.
 */
export function watchAdLanguages(cb: (languages: string[]) => void): () => void {
  return onSnapshot(
    LANGUAGES_DOC(),
    (snap) => cb(mergeAdLanguages(snap.exists() ? (snap.data() as { languages?: string[] }).languages : [])),
    () => cb(mergeAdLanguages(null)),
  );
}

/** Remember a custom language for future sales. No-op for the base list. Never throws. */
export async function rememberAdLanguage(language: string): Promise<void> {
  const value = language.trim();
  if (!value) return;
  if (BASE_AD_LANGUAGES.some((l) => l.toLowerCase() === value.toLowerCase())) return;
  try {
    await setDoc(LANGUAGES_DOC(), { languages: arrayUnion(value) }, { merge: true });
  } catch (err) {
    console.error("[adLanguages] could not save custom language:", err);
  }
}

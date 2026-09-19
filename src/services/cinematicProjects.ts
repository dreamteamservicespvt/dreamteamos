/**
 * Storage for cinematic ad projects.
 *
 * A project is one Firestore document. Before this existed the whole pipeline lived in
 * memory, so a refresh threw away the brief, the story, every prompt and every approval
 * — hours of paid AI output gone to a stray reload.
 *
 * Two rules keep the documents valid:
 *  - `File` objects are never written. Anything uploaded goes to Cloudinary first and the
 *    document keeps the URL, because a File does not survive serialisation.
 *  - `undefined` is never written. Firestore rejects it, and optional fields such as a
 *    clip's `panelCount` are undefined most of the time.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import type { CinematicAdsProject, CinematicProjectSummary } from "@/types/cinematicAds";

export const CINEMATIC_PROJECTS = "cinematic_projects";

/** Strip `undefined` and any non-serialisable value Firestore would reject. */
function sanitize<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof File !== "undefined" && value instanceof File) return undefined as unknown as T;
  if (typeof Blob !== "undefined" && value instanceof Blob) return undefined as unknown as T;
  if (Array.isArray(value)) {
    return value.map((v) => sanitize(v)).filter((v) => v !== undefined) as unknown as T;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const clean = sanitize(v);
      if (clean !== undefined) out[k] = clean;
    }
    return out as T;
  }
  return value;
}

/** The document shape: the project minus anything that cannot be stored. */
export function toStoredProject(project: CinematicAdsProject): Record<string, unknown> {
  const stored = sanitize({
    ...project,
    // Keep the file metadata and the uploaded URL; drop the File itself.
    uploadedFiles: project.uploadedFiles.map(({ file: _file, ...rest }) => rest),
  });
  return stored as Record<string, unknown>;
}

export async function saveProject(project: CinematicAdsProject): Promise<string> {
  const id = project.id || doc(collection(db, CINEMATIC_PROJECTS)).id;
  const payload = toStoredProject({ ...project, id, updatedAt: Date.now() });
  await setDoc(doc(db, CINEMATIC_PROJECTS, id), payload, { merge: true });
  return id;
}

export async function loadProject(id: string): Promise<CinematicAdsProject | null> {
  const snap = await getDoc(doc(db, CINEMATIC_PROJECTS, id));
  if (!snap.exists()) return null;
  return { ...(snap.data() as CinematicAdsProject), id: snap.id };
}

export async function deleteProject(id: string): Promise<void> {
  await deleteDoc(doc(db, CINEMATIC_PROJECTS, id));
}

/**
 * The project list.
 *
 * Scoped to one creator so opening the list never scans every project in the company —
 * a cross-member scan is what burns the daily read quota.
 */
export async function listProjects(createdBy: string): Promise<CinematicProjectSummary[]> {
  const snap = await getDocs(
    query(collection(db, CINEMATIC_PROJECTS), where("createdBy", "==", createdBy), orderBy("updatedAt", "desc")),
  );
  return snap.docs.map((d) => {
    const p = d.data() as CinematicAdsProject;
    return {
      id: d.id,
      name: p.name || "Untitled project",
      businessName: p.clientBrief?.businessName || "",
      duration: typeof p.selectedDuration === "number" ? p.selectedDuration : p.customDuration,
      language: p.selectedLanguage,
      currentStep: p.currentStep,
      stepsCompleted: p.stepsCompleted,
      delivered: !!p.delivered,
      updatedAt: p.updatedAt || 0,
    };
  });
}

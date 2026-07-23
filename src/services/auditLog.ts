import { addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp, where } from "firebase/firestore";
import { db } from "./firebase";
import type { AuditAction, AuditLog } from "@/types/payroll";

/**
 * Append-only audit trail for everything that can move money or change someone's attendance.
 *
 * Writes are fire-and-forget by design: an audit failure must never block the action the user
 * was performing, and must never surface as an error they can't act on. Failures are logged to
 * the console so they show up in monitoring.
 */

export interface RecordAuditInput {
  action: AuditAction;
  actor: { uid: string; name?: string };
  target?: { id: string; name?: string };
  month?: string;
  summary: string;
  before?: unknown;
  after?: unknown;
}

/** Record one auditable action. Never throws. */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  try {
    await addDoc(collection(db, "audit_logs"), {
      action: input.action,
      actorId: input.actor.uid,
      actorName: input.actor.name || "",
      ...(input.target ? { targetId: input.target.id, targetName: input.target.name || "" } : {}),
      ...(input.month ? { month: input.month } : {}),
      summary: input.summary,
      // Firestore rejects `undefined`; omit rather than write nulls that pollute diffs.
      ...(input.before !== undefined ? { before: input.before } : {}),
      ...(input.after !== undefined ? { after: input.after } : {}),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Audit log write failed:", input.action, error);
  }
}

/** Live feed of recent audit entries, newest first. Returns an unsubscribe function. */
export function watchAuditLogs(
  cb: (logs: AuditLog[]) => void,
  options: { month?: string; targetId?: string; max?: number } = {},
): () => void {
  const filters = [
    ...(options.month ? [where("month", "==", options.month)] : []),
    ...(options.targetId ? [where("targetId", "==", options.targetId)] : []),
  ];
  const q = query(
    collection(db, "audit_logs"),
    ...filters,
    orderBy("createdAt", "desc"),
    limit(options.max ?? 100),
  );

  return onSnapshot(
    q,
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog))),
    error => {
      console.error("Audit log listener failed:", error);
      cb([]);
    },
  );
}

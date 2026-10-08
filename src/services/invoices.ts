/**
 * The Invoice Builder's Firestore side (2026-10-08). The only code that writes an invoice.
 *
 * Collections (rules in docs/firestore-rules.md):
 *   invoices/{invoiceId}          one invoice, its lines embedded (types/invoice explains why)
 *   invoice_counters/{2026-27}    `{ seq }` — the last serial handed out in that financial year
 *   invoice_numbers/{DTS-26-27-0001}  the number register: created once, in the same transaction
 *                                 that gives the number to its invoice, never updated or deleted
 *   invoice_settings/*            the team-leader switch and the defaults — services/invoiceSettings
 *
 * ── Why a number cannot be handed out twice ───────────────────────────────────────────────────
 * `generateInvoice` is one transaction: it reads the invoice, the year's counter and the register
 * entry for the next number, then writes all three. Two people pressing Generate in the same second
 * are serialised by Firestore — the second transaction sees the first one's counter and retries with
 * the next number. Pressing it twice on one invoice is harmless: the second run finds the invoice
 * already numbered and returns that number. And the register document can only be CREATED, so even a
 * rewound counter could not make two invoices share a number — the rules refuse the second create.
 *
 * Every function either throws (the caller shows a toast) or returns; none fails silently.
 */
import {
  arrayUnion, collection, doc, getDocs, increment, limit, onSnapshot, orderBy, query,
  runTransaction, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import type { UserRole } from "@/types";
import type {
  Invoice, InvoiceContent, InvoiceEvent, InvoiceEventAction, InvoiceStatus,
} from "@/types/invoice";
import { computeInvoice } from "@/utils/invoiceMath";
import { contentOf, duplicateContent, totalsSnapshot } from "@/utils/invoiceDraft";
import { financialYearLabel, financialYearStart, formatInvoiceNumber, invoiceNumberKey } from "@/utils/invoiceNumber";
import { isInvoiceAdmin } from "@/utils/invoiceAccess";

const INVOICES = "invoices";
const COUNTERS = "invoice_counters";
const NUMBERS = "invoice_numbers";

export interface InvoiceActor {
  uid: string;
  name: string;
  role: UserRole;
}

/**
 * Firestore refuses `undefined` anywhere in a document. Strip it from plain objects and arrays,
 * leaving the SDK's own sentinels (serverTimestamp, arrayUnion …) untouched.
 */
function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => clean(v)) as unknown as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = clean(v);
    }
    return out as T;
  }
  return value;
}

const event = (action: InvoiceEventAction, actor: InvoiceActor, note?: string): InvoiceEvent =>
  clean({ at: Date.now(), action, byUid: actor.uid, byName: actor.name || "", note });

/** The editable part of an invoice plus its list figures, ready to write. */
function contentFields(content: InvoiceContent) {
  const c = contentOf(content);
  return { ...c, totals: totalsSnapshot(computeInvoice(c)) };
}

/** A fresh, stable id — the invoice keeps it from its first keystroke to its last reprint. */
export function newInvoiceId(): string {
  return doc(collection(db, INVOICES)).id;
}

const fromSnap = (id: string, data: Record<string, unknown>): Invoice => ({ ...(data as unknown as Invoice), id });

const millis = (v: any): number =>
  typeof v?.toMillis === "function" ? v.toMillis() : typeof v === "number" ? v : v?.seconds ? v.seconds * 1000 : 0;

/** Newest first. `updatedAt` is still pending (null) for a write made a moment ago — that one is newest. */
export function sortInvoices(list: Invoice[]): Invoice[] {
  return [...list].sort((a, b) => (millis(b.updatedAt) || Number.MAX_SAFE_INTEGER) - (millis(a.updatedAt) || Number.MAX_SAFE_INTEGER));
}

/**
 * The invoices this person may see: their own, or — for the four admins — every invoice.
 *
 * A member's query is `where ownerId ==` with no orderBy (that would need a composite index the repo
 * cannot ship), sorted here instead. The admin query is capped: the register is opened to find recent
 * invoices, and 500 is years of this company's invoicing.
 */
export function watchInvoices(
  viewer: { uid: string; role: UserRole },
  onData: (list: Invoice[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const q = isInvoiceAdmin(viewer.role)
    ? query(collection(db, INVOICES), orderBy("updatedAt", "desc"), limit(500))
    : query(collection(db, INVOICES), where("ownerId", "==", viewer.uid));
  return onSnapshot(
    q,
    (snap) => onData(sortInvoices(snap.docs.map((d) => fromSnap(d.id, d.data())))),
    (err) => onError?.(err as Error),
  );
}

export function watchInvoice(
  id: string,
  onData: (invoice: Invoice | null, meta: { pendingWrites: boolean; fromCache: boolean }) => void,
  onError?: (err: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, INVOICES, id),
    (snap) => onData(
      snap.exists() ? fromSnap(snap.id, snap.data()) : null,
      { pendingWrites: !!snap.metadata?.hasPendingWrites, fromCache: !!snap.metadata?.fromCache },
    ),
    (err) => onError?.(err as Error),
  );
}

export interface SaveOptions {
  /** True for the first write of a new invoice. */
  isNew: boolean;
  /** Set on the first write of a copy. */
  duplicatedFrom?: string | null;
  /** The sale order the customer and line were filled from. */
  sourceOrderId?: string | null;
  /** True when the invoice already has a number — the save is recorded as an edit after issue. */
  issued?: boolean;
}

/**
 * Write what the person typed. A new invoice is created as a draft owned by them; an existing one
 * is updated in place. Editing a generated invoice keeps its number (owner, 2026-10-08) and is
 * recorded: `revision` goes up and the history says who changed it and when.
 *
 * Returns once the write is QUEUED locally — Firestore's offline cache keeps it on this device and
 * sends it when the connection is back, so the caller can mark the invoice saved without waiting on
 * the network. `committed` resolves when the server has it.
 */
export function saveInvoiceContent(
  id: string,
  content: InvoiceContent,
  actor: InvoiceActor,
  opts: SaveOptions,
): { committed: Promise<void> } {
  const ref = doc(db, INVOICES, id);
  const fields = contentFields(content);
  if (opts.isNew) {
    const created = event(opts.duplicatedFrom ? "duplicated" : "created", actor);
    const committed = setDoc(ref, clean({
      ...fields,
      number: null,
      sequence: null,
      financialYear: null,
      status: "draft" as InvoiceStatus,
      ownerId: actor.uid,
      ownerName: actor.name || "",
      ownerRole: actor.role,
      revision: 0,
      history: [created],
      duplicatedFrom: opts.duplicatedFrom || null,
      sourceOrderId: opts.sourceOrderId || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    return { committed };
  }
  const patch: Record<string, unknown> = { ...fields, updatedAt: serverTimestamp() };
  if (opts.sourceOrderId) patch.sourceOrderId = opts.sourceOrderId;
  if (opts.issued) {
    patch.revision = increment(1);
    patch.history = arrayUnion(event("edited", actor));
  }
  return { committed: updateDoc(ref, clean(patch)) };
}

export interface GenerateResult {
  number: string;
  /** True when the invoice already had this number — a second press, or a retry. */
  already: boolean;
}

/** How long Generate waits for the server before saying so — a transaction needs the network. */
const GENERATE_TIMEOUT_MS = 15000;

/**
 * Give the invoice its permanent number and save its content in the same breath.
 *
 * The content goes in with the number so the numbered invoice can never be the version from before
 * the last few keystrokes. Works on an invoice that was never saved, too (created here).
 */
export async function generateInvoice(id: string, content: InvoiceContent, actor: InvoiceActor): Promise<GenerateResult> {
  const fields = contentFields(content);
  const fyStart = financialYearStart(fields.issueDate);
  const fy = financialYearLabel(fyStart);

  const run = runTransaction(db, async (tx) => {
    const invRef = doc(db, INVOICES, id);
    const counterRef = doc(db, COUNTERS, fy);
    const invSnap = await tx.get(invRef);
    const existing = invSnap.exists() ? (invSnap.data() as Partial<Invoice>) : null;
    if (existing?.number) return { number: existing.number, already: true };

    const counterSnap = await tx.get(counterRef);
    let seq = counterSnap.exists() ? Number((counterSnap.data() as { seq?: unknown }).seq) || 0 : 0;
    let number = "";
    // Normally the first candidate is free. The register is checked anyway: it is the guarantee,
    // the counter is only the fast path.
    for (let tries = 0; tries < 20; tries++) {
      seq += 1;
      number = formatInvoiceNumber(fyStart, seq);
      const reg = await tx.get(doc(db, NUMBERS, invoiceNumberKey(number)));
      if (!reg.exists()) break;
      number = "";
    }
    if (!number) throw new Error("The invoice series is blocked — ask an admin to check the counter.");

    tx.set(counterRef, { seq, fy, updatedAt: serverTimestamp() }, { merge: true });
    tx.set(doc(db, NUMBERS, invoiceNumberKey(number)), {
      number, invoiceId: id, fy, sequence: seq, byUid: actor.uid, createdAt: serverTimestamp(),
    });

    const issued = clean({
      ...fields,
      number,
      sequence: seq,
      financialYear: fy,
      status: "issued" as InvoiceStatus,
      issuedAt: serverTimestamp(),
      issuedByUid: actor.uid,
      issuedByName: actor.name || "",
      updatedAt: serverTimestamp(),
    });
    if (existing) {
      tx.update(invRef, { ...issued, history: arrayUnion(event("generated", actor, number)) });
    } else {
      tx.set(invRef, {
        ...issued,
        ownerId: actor.uid,
        ownerName: actor.name || "",
        ownerRole: actor.role,
        revision: 0,
        history: [event("created", actor), event("generated", actor, number)],
        duplicatedFrom: null,
        sourceOrderId: null,
        createdAt: serverTimestamp(),
      });
    }
    return { number, already: false };
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("offline")), GENERATE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([run, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Paid, unpaid again, or cancelled — only for a generated invoice. Recorded in its history. */
export async function setInvoiceStatus(
  invoice: Pick<Invoice, "id" | "number">,
  status: Exclude<InvoiceStatus, "draft">,
  actor: InvoiceActor,
): Promise<void> {
  if (!invoice.number) throw new Error("Generate the invoice first.");
  const action: InvoiceEventAction = status === "paid" ? "paid" : status === "cancelled" ? "cancelled" : "unpaid";
  await updateDoc(doc(db, INVOICES, invoice.id), {
    status,
    paidAt: status === "paid" ? serverTimestamp() : null,
    cancelledAt: status === "cancelled" ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
    history: arrayUnion(event(action, actor)),
  });
}

/**
 * Delete a draft. Refused for a numbered invoice: its number is part of the series, and a gap with
 * no invoice behind it is exactly what a tax inspector asks about. Those are cancelled instead.
 */
export async function deleteDraftInvoice(id: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, INVOICES, id);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data() as Partial<Invoice>;
    if (data.number || (data.status && data.status !== "draft")) {
      throw new Error("A generated invoice can't be deleted — cancel it instead.");
    }
    tx.delete(ref);
  });
}

/**
 * A new draft with the same customer and lines, dated today. Returns its id at once (the write is
 * queued locally, so the copy can be opened straight away) and `committed` for the server's answer.
 */
export function duplicateInvoice(source: Invoice, actor: InvoiceActor): { id: string; committed: Promise<void> } {
  const id = newInvoiceId();
  const { committed } = saveInvoiceContent(id, duplicateContent(contentOf(source)), actor, { isNew: true, duplicatedFrom: source.id });
  return { id, committed };
}

/**
 * The invoices this person made, read ONCE — for "invoiced before" suggestions on the customer field.
 * A one-shot read capped at 100, the first time the field is focused, rather than another live
 * listener for every open builder.
 */
export async function fetchMyRecentInvoices(uid: string): Promise<Invoice[]> {
  const snap = await getDocs(query(collection(db, INVOICES), where("ownerId", "==", uid), limit(100)));
  return sortInvoices(snap.docs.map((d) => fromSnap(d.id, d.data())));
}

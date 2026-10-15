/**
 * The Invoice Builder's Firestore side (2026-10-08). The only code that writes an invoice.
 *
 * Collections (rules in docs/firestore-rules.md):
 *   invoices/{invoiceId}          one invoice, its lines embedded (types/invoice explains why)
 *   invoice_counters/{2026-27}    `{ seq }` — the last serial handed out in that financial year
 *   invoice_numbers/{DTS-26-27-0001}  the number register: created once, in the same transaction
 *                                 that gives the number to its invoice, never deleted; updated only to
 *                                 record its invoice's deletion or (2026-10-15) its invoice's `issueDate`
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
  arrayUnion, collection, doc, getDoc, getDocs, increment, limit, onSnapshot, orderBy, query,
  runTransaction, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import type { UserRole } from "@/types";
import type {
  Invoice, InvoiceContent, InvoiceEvent, InvoiceEventAction, InvoiceStatus,
} from "@/types/invoice";
import { computeInvoice } from "@/utils/invoiceMath";
import {
  contentOf, duplicateContent, issuedDateProblem, totalsSnapshot, type IssuedDateRule, type SeriesNeighbour,
} from "@/utils/invoiceDraft";
import {
  financialYearLabel, financialYearStart, financialYearStartOfLabel, financialYearStartOfNumber, formatInvoiceNumber,
  invoiceNumberKey, sequenceOfNumber,
} from "@/utils/invoiceNumber";
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
    return { committed: saveIssuedContent(id, fields.issueDate, clean(patch)) };
  }
  return { committed: updateDoc(ref, clean(patch)) };
}

// ─── An issued invoice's date (2026-10-15) ──────────────────────────────────────────────────────

/** Refused: the new date would take a numbered invoice out of its year or out of order. */
export class InvoiceDateRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceDateRefusedError";
  }
}

/** How far either side of a number to look for a neighbour that is still on record. */
const NEIGHBOUR_REACH = 10;

type RegisterEntry = { invoiceId?: string; issueDate?: string; deleted?: boolean };
type ReadDoc = (path: [string, string]) => Promise<{ exists: boolean; data: Record<string, unknown> | null }>;

/**
 * The nearest earlier and later numbers of the same series that are still on record, with their
 * dates. A deleted number is skipped (it has no date to keep order with); the search stops at the
 * first number never handed out (the end of the series) and after `NEIGHBOUR_REACH` numbers.
 *
 * A neighbour's date comes from its register entry's `issueDate` (written since 2026-10-15 by
 * Generate and by every date change); an older entry has none, so `dateOfInvoice` reads that
 * invoice — which a member may not be allowed to read (another person's invoice). Then that side
 * is unknown and only the financial year is enforced on it.
 */
async function seriesNeighbours(
  read: ReadDoc,
  fyStart: number,
  seq: number,
  dateOfInvoice: (invoiceId: string) => Promise<string | null> | string | null,
): Promise<{ prev: SeriesNeighbour | null; next: SeriesNeighbour | null }> {
  const at = async (s: number): Promise<{ number: string; entry: RegisterEntry } | "missing"> => {
    const number = formatInvoiceNumber(fyStart, s);
    const snap = await read([NUMBERS, invoiceNumberKey(number)]);
    return snap.exists ? { number, entry: (snap.data || {}) as RegisterEntry } : "missing";
  };
  const dated = async (found: { number: string; entry: RegisterEntry }): Promise<SeriesNeighbour | null> => {
    const date = found.entry.issueDate || (found.entry.invoiceId ? await dateOfInvoice(found.entry.invoiceId) : null);
    return date ? { number: found.number, date } : null;
  };

  let prev: SeriesNeighbour | null = null;
  for (let s = seq - 1; s >= Math.max(1, seq - NEIGHBOUR_REACH); s--) {
    const found = await at(s);
    if (found === "missing" || found.entry.deleted) continue;
    prev = await dated(found);
    break;
  }
  let next: SeriesNeighbour | null = null;
  for (let s = seq + 1; s <= seq + NEIGHBOUR_REACH; s++) {
    const found = await at(s);
    if (found === "missing") break;
    if (found.entry.deleted) continue;
    next = await dated(found);
    break;
  }
  return { prev, next };
}

/** The year and the place in the series of a stored, numbered invoice — null for a draft. */
function seriesPlaceOf(stored: Partial<Invoice> | null): { number: string; fyStart: number; seq: number } | null {
  if (!stored?.number) return null;
  const fyStart = financialYearStartOfLabel(stored.financialYear) ?? financialYearStartOfNumber(stored.number);
  const seq = Number(stored.sequence) || sequenceOfNumber(stored.number);
  return fyStart !== null && seq ? { number: stored.number, fyStart, seq } : null;
}

const plainRead: ReadDoc = async ([coll, id]) => {
  const snap = await getDoc(doc(db, coll, id));
  return { exists: snap.exists(), data: snap.exists() ? (snap.data() as Record<string, unknown>) : null };
};

/** An invoice's date, or null when it is gone or this person may not read it. */
async function readInvoiceDate(invoiceId: string): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, INVOICES, invoiceId));
    const date = snap.exists() ? (snap.data() as Partial<Invoice>).issueDate : null;
    return typeof date === "string" && date ? date : null;
  } catch {
    return null;
  }
}

/**
 * What an issued invoice's date must respect — for the builder to show while it is being edited
 * (inline error, the date picker's min / max). Null for a draft. The same rule is checked again, in
 * a transaction, when the date is saved (`saveInvoiceContent` → `saveIssuedContent`).
 */
export async function fetchIssuedDateRule(id: string): Promise<IssuedDateRule | null> {
  const snap = await getDoc(doc(db, INVOICES, id));
  const place = seriesPlaceOf(snap.exists() ? (snap.data() as Partial<Invoice>) : null);
  if (!place) return null;
  const { prev, next } = await seriesNeighbours(plainRead, place.fyStart, place.seq, readInvoiceDate);
  return { number: place.number, fyStart: place.fyStart, prev, next };
}

/**
 * Save an edit of an issued invoice.
 *
 * ── Why the date gets a transaction ──
 * An issued invoice's date was saved like any other field, so it could leave its number's financial
 * year (DTS/26-27/0042 dated 2 April 2027) or go before the number ahead of it. When the date is
 * unchanged this is the plain update it always was (queued offline like before). When it CHANGES,
 * one transaction re-reads the invoice and the register entries around its number, refuses a date
 * outside the year or out of order (`InvoiceDateRefusedError`, with the reason in words), and
 * otherwise writes the invoice and its register entry's `issueDate` together — so the next check of
 * a neighbour sees this date. It needs a connection (15 s, like Generate): the series cannot be
 * checked from a device's cache.
 */
async function saveIssuedContent(id: string, issueDate: string, patch: Record<string, unknown>): Promise<void> {
  const ref = doc(db, INVOICES, id);
  const before = await getDoc(ref);
  const stored = before.exists() ? (before.data() as Partial<Invoice>) : null;
  const place = seriesPlaceOf(stored);
  if (!place || stored?.issueDate === issueDate) {
    await updateDoc(ref, patch);
    return;
  }

  // Older register entries carry no date: their invoices are read here, outside the transaction,
  // because a read this person is not allowed would otherwise abort it.
  const fallbackDates = new Map<string, string | null>();
  const remember = async (invoiceId: string) => {
    if (!fallbackDates.has(invoiceId)) fallbackDates.set(invoiceId, await readInvoiceDate(invoiceId));
    return fallbackDates.get(invoiceId) ?? null;
  };
  await seriesNeighbours(plainRead, place.fyStart, place.seq, remember);

  const run = runTransaction(db, async (tx) => {
    const fresh = await tx.get(ref);
    const now = seriesPlaceOf(fresh.exists() ? (fresh.data() as Partial<Invoice>) : null);
    if (!now) throw new Error("This invoice no longer exists.");
    const txRead: ReadDoc = async ([coll, docId]) => {
      const snap = await tx.get(doc(db, coll, docId));
      return { exists: snap.exists(), data: snap.exists() ? (snap.data() as Record<string, unknown>) : null };
    };
    const { prev, next } = await seriesNeighbours(txRead, now.fyStart, now.seq, (invoiceId) => fallbackDates.get(invoiceId) ?? null);
    const problem = issuedDateProblem(issueDate, { number: now.number, fyStart: now.fyStart, prev, next });
    if (problem) throw new InvoiceDateRefusedError(problem);
    const ownEntry = doc(db, NUMBERS, invoiceNumberKey(now.number));
    const own = await tx.get(ownEntry);
    tx.update(ref, patch);
    if (own.exists()) tx.update(ownEntry, { issueDate });
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(
      "Can't reach the server. Changing an issued invoice's date needs a connection, so its place in the series can be checked.",
    )), GENERATE_TIMEOUT_MS);
  });
  try {
    await Promise.race([run, timeout]);
  } finally {
    clearTimeout(timer);
  }
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
    // `issueDate` (2026-10-15): the register is readable by everyone who makes invoices, so a later
    // date change of a NEIGHBOUR can keep the series in order without reading this invoice (which a
    // member may not). Kept current by `saveIssuedContent`.
    tx.set(doc(db, NUMBERS, invoiceNumberKey(number)), {
      number, invoiceId: id, fy, sequence: seq, byUid: actor.uid, issueDate: fields.issueDate, createdAt: serverTimestamp(),
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
 * Delete an invoice — a draft, or (owner, 2026-10-08) a generated one.
 *
 * A generated invoice's NUMBER is never freed: its register entry (`invoice_numbers/{key}`) stays and
 * records the deletion — who, when, for whom and for how much — in the same transaction. The series
 * therefore skips that number rather than handing it to another invoice (two invoices sharing a number
 * is the one thing worse than a gap), and the gap can always be explained. Cancelling remains the
 * gentler choice for an invoice the client already has; the builder says so before deleting.
 */
export async function deleteInvoice(id: string, actor: InvoiceActor): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, INVOICES, id);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data() as Partial<Invoice>;
    if (data.number) {
      tx.set(doc(db, NUMBERS, invoiceNumberKey(data.number)), {
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedByUid: actor.uid,
        deletedByName: actor.name || "",
        customerName: data.customer?.name || "",
        grandTotal: data.totals?.grandTotal ?? 0,
      }, { merge: true });
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

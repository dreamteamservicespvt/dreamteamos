import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HrDocument } from "@/types/hr";

/**
 * The two places a letter and the employment record have to agree.
 *
 * 1. **Offer dates.** "Offer issued on" and "Offer accepted on" are one fact each, written twice —
 *    a pair of date fields an admin types, and a letter that gets issued and signed. Nothing joined
 *    them, so the lifecycle strip and the Documents tab could disagree with no way to tell which
 *    was right.
 *
 * 2. **The printed email.** Every letter this team holds was written before a personal email was
 *    collected, so they all carry the login — an account the employee loses on their last day.
 */

const store = new Map<string, Record<string, unknown>>();
const syncCalls: { uid: string; dates: Record<string, unknown>; onlyIfUnset?: boolean }[] = [];

vi.mock("firebase/firestore", () => {
  const patch = (id: string, p: Record<string, unknown>) =>
    store.set(id, { ...(store.get(id) || {}), ...p });
  return {
    collection: (_db: unknown, name: string) => ({ name }),
    doc: (_db: unknown, _n: string, id: string) => ({ id }),
    addDoc: async (_c: unknown, data: Record<string, unknown>) => {
      store.set("new", data);
      return { id: "new" };
    },
    updateDoc: async (ref: { id: string }, p: Record<string, unknown>) => patch(ref.id, p),
    deleteDoc: async (ref: { id: string }) => { store.delete(ref.id); },
    getDoc: async (ref: { id: string }) => ({
      exists: () => store.has(ref.id), data: () => store.get(ref.id),
    }),
    getDocs: async () => ({ docs: [], empty: true }),
    setDoc: async (ref: { id: string }, d: Record<string, unknown>) => patch(ref.id, d),
    query: (...a: unknown[]) => ({ a }),
    where: (f: string, _o: string, v: unknown) => ({ f, v }),
    runTransaction: async () => 1,
    increment: (n: number) => ({ __inc: n }),
    serverTimestamp: () => ({ __server: true }),
  };
});
vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification: async () => undefined }));
vi.mock("@/services/hr", () => ({
  clearOfferDates: async () => undefined,
  syncOfferDates: async (uid: string, dates: Record<string, unknown>, options?: { onlyIfUnset?: boolean }) => {
    syncCalls.push({ uid, dates, onlyIfUnset: options?.onlyIfUnset });
  },
}));

const {
  issueDocument, signDocument, replaceLetterEmail, documentsNeedingEmailRefresh,
  signedDocumentsWithStaleEmail, refreshDocumentEmails,
} = await import("@/services/hrDocuments");

beforeEach(() => { store.clear(); syncCalls.length = 0; });

const doc = (over: Partial<HrDocument> = {}): HrDocument => ({
  id: "d1",
  memberId: "u1",
  memberName: "Priya",
  department: "sales",
  type: "offer_letter",
  title: "Offer of Employment",
  bodyText: "OFFER OF EMPLOYMENT\n\nDate: 01 February 2026\nEmployee Name: Priya\nEmail: priya@dreamteam.com\n\nDear Priya,",
  issuedById: "a1",
  issuedByName: "Govardhan",
  issuedOn: "2026-02-01",
  requiresEmployeeSignature: true,
  status: "issued",
  createdAt: null,
  ...over,
});

describe("offer dates follow the offer letter", () => {
  it("issuing an offer letter records when the offer went out", async () => {
    await issueDocument({ document: { ...doc(), id: undefined } as never });
    expect(syncCalls).toEqual([
      { uid: "u1", dates: { offerIssuedOn: "2026-02-01" }, onlyIfUnset: true },
    ]);
  });

  it("does not overrule a date the admin typed deliberately", async () => {
    await issueDocument({ document: { ...doc(), id: undefined } as never });
    // The letter fills a blank; it does not overrule a decision somebody already made.
    expect(syncCalls[0].onlyIfUnset).toBe(true);
  });

  it("signing it records when the offer was accepted, and this one DOES overrule", async () => {
    await signDocument(doc(), {
      signatureUrl: "sig", signedName: "Priya", signedDate: "2026-02-03",
    });
    // A signature carries its own date and beats an admin's estimate — the right way round.
    expect(syncCalls).toEqual([{ uid: "u1", dates: { offerAcceptedOn: "2026-02-03" }, onlyIfUnset: undefined }]);
  });

  it("leaves the dates alone for every other kind of letter", async () => {
    await issueDocument({ document: { ...doc({ type: "warning_letter" }), id: undefined } as never });
    await signDocument(doc({ type: "nda" }), {
      signatureUrl: "sig", signedName: "Priya", signedDate: "2026-02-03",
    });
    expect(syncCalls).toEqual([]);
  });
});

describe("correcting the email printed on a letter", () => {
  const NEW = "priya.personal@gmail.com";

  it("swaps only the header line", () => {
    const out = replaceLetterEmail(doc().bodyText, NEW);
    expect(out).toContain(`Email: ${NEW}`);
    expect(out).not.toContain("priya@dreamteam.com");
    expect(out).toContain("Employee Name: Priya");
  });

  it("leaves an email that appears inside a clause completely alone", () => {
    // Narrow on purpose: a body that discusses an address must not be rewritten by a contact fix.
    const body = "Email: old@x.com\n\n5. Notices\nSend notices to legal@dreamteam.com at all times.";
    expect(replaceLetterEmail(body, NEW)).toContain("legal@dreamteam.com");
  });

  it("reports nothing to do when the letter already says the right thing", () => {
    expect(replaceLetterEmail(`Email: ${NEW}`, NEW)).toBeNull();
    expect(replaceLetterEmail("no email line here", NEW)).toBeNull();
  });

  it("offers to fix unsigned documents and refuses to touch signed ones", () => {
    const docs = [doc({ id: "a" }), doc({ id: "b", status: "signed" }), doc({ id: "c", status: "declined" })];
    expect(documentsNeedingEmailRefresh(docs, NEW).map((d) => d.id)).toEqual(["a"]);
    // A signed letter is a record of what was actually signed. Named, never rewritten.
    expect(signedDocumentsWithStaleEmail(docs, NEW).map((d) => d.id)).toEqual(["b"]);
  });

  it("rewrites the unsigned ones and stamps that they were altered after issue", async () => {
    const docs = [doc({ id: "a" }), doc({ id: "b", status: "signed" })];
    expect(await refreshDocumentEmails(docs, NEW)).toBe(1);
    expect(store.get("a")).toMatchObject({ contactRefreshedAt: { __server: true } });
    expect(String(store.get("a")?.bodyText)).toContain(`Email: ${NEW}`);
    expect(store.has("b")).toBe(false);
  });

  it("does nothing at all when there is no address to write", async () => {
    expect(await refreshDocumentEmails([doc()], "   ")).toBe(0);
  });
});

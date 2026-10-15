/**
 * An invoice's date and its number (bug audit, 2026-10-15).
 *
 * 1. An ISSUED invoice's date could be moved into another financial year (DTS/26-27/0042 dated
 *    2 April 2027) or before the number ahead of it. Now the date stays inside the number's year and
 *    between its neighbours' dates — refused by the service in a transaction, shown by the editor.
 * 2. A draft keeps the day it was started on; Generate now says which date and series the invoice
 *    gets and offers today's date.
 *
 * The pure rules, then the REAL service on the in-memory Firestore.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {}, auth: {} }));

const mem = await import("./memoryFirestore");
const svc = await import("@/services/invoices");
const draft = await import("@/utils/invoiceDraft");
const num = await import("@/utils/invoiceNumber");
const { resolveCompany } = await import("@/utils/company");
import type { InvoiceContent } from "@/types/invoice";

const read = (path: string) => mem.__read(path) as Record<string, any> | undefined;
const SALES = { uid: "s1", name: "Anil", role: "sales_member" as const };

function content(issueDate: string, over: Partial<InvoiceContent> = {}): InvoiceContent {
  const c = draft.buildNewInvoiceContent(resolveCompany({}), {}, new Date(2026, 9, 8));
  c.customer = { ...c.customer, name: "Samas Sarees" };
  c.items = [{ ...c.items[0], name: "Social Media Management", rate: 17400 }];
  return { ...c, issueDate, dueDate: draft.addDaysIso(issueDate, 5), ...over };
}

/** Generate one invoice dated `date`; returns its id. */
async function issue(date: string): Promise<string> {
  const id = svc.newInvoiceId();
  await svc.generateInvoice(id, content(date), SALES);
  return id;
}

/** Save an edit of an issued invoice with a new date. */
const moveTo = (id: string, date: string) =>
  svc.saveInvoiceContent(id, content(date, { notes: "moved" }), SALES, { isNew: false, issued: true }).committed;

beforeEach(() => mem.__reset());

describe("the number's year and place", () => {
  it("reads the year and the serial out of a printed number", () => {
    expect(num.financialYearStartOfNumber("DTS/26-27/0042")).toBe(2026);
    expect(num.financialYearStartOfNumber("DTS/99-00/0001")).toBe(2099);
    expect(num.financialYearStartOfNumber("DTS/26-28/0001")).toBeNull();
    expect(num.financialYearStartOfNumber("4232")).toBeNull();
    expect(num.financialYearStartOfLabel("2026-27")).toBe(2026);
    expect(num.financialYearStartOfLabel("2026-28")).toBeNull();
    expect(num.sequenceOfNumber("DTS/26-27/0042")).toBe(42);
    expect(num.financialYearSpan(2026)).toEqual({ from: "2026-04-01", to: "2027-03-31" });
  });
});

describe("issuedDateProblem — an issued invoice's date", () => {
  const rule = {
    number: "DTS/26-27/0042",
    fyStart: 2026,
    prev: { number: "DTS/26-27/0041", date: "2026-10-10" },
    next: { number: "DTS/26-27/0043", date: "2026-10-20" },
  };

  it("refuses a date in another financial year, naming the year", () => {
    const msg = draft.issuedDateProblem("2027-04-02", { number: rule.number, fyStart: 2026 });
    expect(msg).toMatch(/2026-27 series/);
    expect(msg).toMatch(/01 Apr 2026 and 31 Mar 2027/);
    expect(draft.issuedDateProblem("2026-03-31", { number: rule.number, fyStart: 2026 })).toMatch(/2026-27/);
    // The year's own first and last days are fine.
    expect(draft.issuedDateProblem("2026-04-01", { number: rule.number, fyStart: 2026 })).toBeNull();
    expect(draft.issuedDateProblem("2027-03-31", { number: rule.number, fyStart: 2026 })).toBeNull();
  });

  it("refuses a date before the number ahead of it or after the number behind it", () => {
    expect(draft.issuedDateProblem("2026-10-09", rule)).toMatch(/comes after DTS\/26-27\/0041, dated 10 Oct 2026/);
    expect(draft.issuedDateProblem("2026-10-21", rule)).toMatch(/comes before DTS\/26-27\/0043, dated 20 Oct 2026/);
    // The neighbours' own days are allowed — two invoices can share a date.
    expect(draft.issuedDateProblem("2026-10-10", rule)).toBeNull();
    expect(draft.issuedDateProblem("2026-10-20", rule)).toBeNull();
  });

  it("gives the date picker its limits", () => {
    expect(draft.issuedDateLimits(rule)).toEqual({ min: "2026-10-10", max: "2026-10-20" });
    expect(draft.issuedDateLimits({ number: rule.number, fyStart: 2026 })).toEqual({ min: "2026-04-01", max: "2027-03-31" });
  });

  it("is an error in validateInvoice only when a rule is given", () => {
    const c = content("2027-04-02");
    expect(draft.blockingIssues(draft.validateInvoice(c))).toEqual([]);
    const errs = draft.blockingIssues(draft.validateInvoice(c, undefined, { number: rule.number, fyStart: 2026 }));
    expect(errs.map((e) => e.field)).toEqual(["issueDate"]);
  });
});

describe("generateConfirmCopy — what Generate says", () => {
  it("names the date and the series when the draft is dated today", () => {
    const copy = draft.generateConfirmCopy("2026-10-15", "2026-10-15");
    expect(copy.offerToday).toBe(false);
    expect(copy.description).toMatch(/Invoice date: 15 Oct 2026/);
    expect(copy.description).toMatch(/2026-27 series \(DTS\/26-27\/…\)/);
  });

  it("offers today's date for an older draft, and says when that changes the series", () => {
    const copy = draft.generateConfirmCopy("2027-03-30", "2027-04-03");
    expect(copy.offerToday).toBe(true);
    expect(copy.todayLabel).toBe("Use today's date");
    expect(copy.keepLabel).toBe("Keep 30 Mar 2027");
    expect(copy.description).toMatch(/dated 30 Mar 2027, not today/);
    expect(copy.description).toMatch(/2027-28 series instead \(DTS\/27-28\/…\)/);
    expect(copy.description).toMatch(/2026-27 series/);
    const same = draft.generateConfirmCopy("2026-10-12", "2026-10-15");
    expect(same.description).toMatch(/Today is 15 Oct 2026/);
  });

  it("moves the due date with the invoice date", () => {
    const moved = draft.withIssueDate(content("2027-03-30"), "2027-04-03");
    expect([moved.issueDate, moved.dueDate]).toEqual(["2027-04-03", "2027-04-08"]);
  });
});

describe("the service refuses a date the series cannot hold", () => {
  it("records the invoice date in the number register at Generate", async () => {
    await issue("2026-10-10");
    expect(read("invoice_numbers/DTS-26-27-0001")).toMatchObject({ number: "DTS/26-27/0001", issueDate: "2026-10-10" });
  });

  it("refuses moving DTS/26-27/0002 into 2027-28, and leaves it as it was", async () => {
    await issue("2026-10-10");
    const id = await issue("2026-10-12");
    await expect(moveTo(id, "2027-04-02")).rejects.toThrow(/2026-27 series/);
    await expect(moveTo(id, "2027-04-02")).rejects.toMatchObject({ name: "InvoiceDateRefusedError" });
    expect(read(`invoices/${id}`)).toMatchObject({ issueDate: "2026-10-12", number: "DTS/26-27/0002", revision: 0 });
  });

  it("refuses a date before the previous number's or after the next number's", async () => {
    await issue("2026-10-10");
    const mid = await issue("2026-10-12");
    await issue("2026-10-20");
    await expect(moveTo(mid, "2026-10-09")).rejects.toThrow(/comes after DTS\/26-27\/0001/);
    await expect(moveTo(mid, "2026-10-21")).rejects.toThrow(/comes before DTS\/26-27\/0003/);
  });

  it("saves a date inside the limits and keeps the register's date current", async () => {
    await issue("2026-10-10");
    const mid = await issue("2026-10-12");
    await issue("2026-10-20");
    await moveTo(mid, "2026-10-18");
    expect(read(`invoices/${mid}`)).toMatchObject({ issueDate: "2026-10-18", revision: 1, notes: "moved" });
    expect(read("invoice_numbers/DTS-26-27-0002")).toMatchObject({ issueDate: "2026-10-18" });
    // …so the NEXT number now cannot go before the 18th.
    const rule = await svc.fetchIssuedDateRule(
      (mem.__all("invoices").find((d) => d.number === "DTS/26-27/0003") as { id: string }).id,
    );
    expect(rule?.prev).toEqual({ number: "DTS/26-27/0002", date: "2026-10-18" });
  });

  it("skips a deleted number and checks against the one before it", async () => {
    await issue("2026-10-10");
    const gone = await issue("2026-10-14");
    const last = await issue("2026-10-20");
    await svc.deleteInvoice(gone, SALES);
    await moveTo(last, "2026-10-11"); // before the deleted 0002's date — fine, it holds none now
    await expect(moveTo(last, "2026-10-09")).rejects.toThrow(/comes after DTS\/26-27\/0001/);
  });

  it("reads an older register entry's date from its invoice, and falls back to the year when it may not", async () => {
    const first = await issue("2026-10-10");
    const second = await issue("2026-10-12");
    // An entry written before 2026-10-15 has no issueDate.
    const entry = read("invoice_numbers/DTS-26-27-0001")!;
    delete entry.issueDate;
    mem.__seed("invoice_numbers/DTS-26-27-0001", entry);
    await expect(moveTo(second, "2026-10-09")).rejects.toThrow(/comes after DTS\/26-27\/0001/);
    // An invoice that cannot be read (another person's, which a member may not open — or gone):
    // that side is unknown and only the year is enforced on it.
    await mem.deleteDoc(mem.doc({}, "invoices", first));
    const rule = await svc.fetchIssuedDateRule(second);
    expect(rule).toMatchObject({ number: "DTS/26-27/0002", fyStart: 2026, prev: null });
  });

  it("an edit that leaves the date alone is the plain update it always was", async () => {
    const id = await issue("2026-10-12");
    await svc.saveInvoiceContent(id, content("2026-10-12", { notes: "Corrected address" }), SALES, { isNew: false, issued: true }).committed;
    expect(read(`invoices/${id}`)).toMatchObject({ issueDate: "2026-10-12", notes: "Corrected address", revision: 1 });
  });

  it("a draft's date is still free — the rule starts with the number", async () => {
    const id = svc.newInvoiceId();
    await svc.saveInvoiceContent(id, content("2026-10-12"), SALES, { isNew: true }).committed;
    await svc.saveInvoiceContent(id, content("2027-04-02"), SALES, { isNew: false }).committed;
    expect(read(`invoices/${id}`)).toMatchObject({ issueDate: "2027-04-02", number: null });
    expect(await svc.fetchIssuedDateRule(id)).toBeNull();
  });
});

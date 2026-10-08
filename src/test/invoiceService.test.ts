/**
 * The Invoice Builder end to end on the in-memory Firestore, with the REAL service: drafts, the
 * numbering transaction, the number register, editing after issue, status, duplicate and delete —
 * plus the draft rules (defaults, validation, words, UPI) the builder runs on.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {}, auth: {} }));

const mem = await import("./memoryFirestore");
const svc = await import("@/services/invoices");
const settings = await import("@/services/invoiceSettings");
const draft = await import("@/utils/invoiceDraft");
const { resolveCompany, amountInWords } = await import("@/utils/company");
import type { InvoiceContent } from "@/types/invoice";

const read = (path: string) => mem.__read(path) as Record<string, any> | undefined;
const all = (col: string) => mem.__all(col) as Record<string, any>[];

const SALES = { uid: "s1", name: "Anil", role: "sales_member" as const };
const OTHER = { uid: "s2", name: "Bhavya", role: "sales_member" as const };
const ADMIN = { uid: "a1", name: "Accounts", role: "accounts_admin" as const };

function content(over: Partial<InvoiceContent> = {}): InvoiceContent {
  const c = draft.buildNewInvoiceContent(resolveCompany({}), {}, new Date(2026, 9, 8));
  c.customer = { ...c.customer, name: "Samas Sarees", gstin: "37AAVFS8513R1ZZ" };
  c.items = [{ ...c.items[0], name: "Social Media Management", rate: 17400 }];
  return { ...c, ...over };
}

beforeEach(() => mem.__reset());

describe("a new invoice", () => {
  it("starts from the company, the fallbacks and today", () => {
    const c = draft.buildNewInvoiceContent(resolveCompany({}), {}, new Date(2026, 9, 8));
    expect(c.issueDate).toBe("2026-10-08");
    expect(c.dueDate).toBe("2026-10-13");
    expect(c.seller.name).toBe("Dream Team Services");
    expect(c.seller.gstin).toBe("37FWQPR6939Q1ZY");
    expect(c.tax).toMatchObject({ mode: "gst", pricesIncludeTax: true, placeOfSupply: "37", defaultRate: 18 });
    expect(c.payment.ifsc).toBe("BARB0GHATIX");
    expect(c.items).toHaveLength(1);
  });

  it("takes an admin's defaults field by field", () => {
    const c = draft.buildNewInvoiceContent(resolveCompany({}), { payment: { bankName: "SBI" }, terms: "Net 15", dueDays: 15, taxRate: 5 }, new Date(2026, 9, 8));
    expect(c.payment.bankName).toBe("SBI");
    expect(c.payment.ifsc).toBe("BARB0GHATIX");
    expect(c.terms).toBe("Net 15");
    expect(c.dueDate).toBe("2026-10-23");
    expect(c.items[0].taxRate).toBe(5);
  });
});

describe("drafts", () => {
  it("are created owned by their maker, with no number and the engine's totals", async () => {
    const id = svc.newInvoiceId();
    await svc.saveInvoiceContent(id, content(), SALES, { isNew: true }).committed;
    const doc = read(`invoices/${id}`)!;
    expect(doc).toMatchObject({ status: "draft", number: null, ownerId: "s1", ownerName: "Anil", ownerRole: "sales_member", revision: 0 });
    expect(doc.totals).toEqual({ taxable: 1474576, tax: 265424, grandTotal: 1740000, itemCount: 1 });
    expect(doc.items[0].id).toBeTruthy();
    expect(doc.history[0].action).toBe("created");
  });

  it("update in place, without touching who owns them", async () => {
    const id = svc.newInvoiceId();
    await svc.saveInvoiceContent(id, content(), SALES, { isNew: true }).committed;
    await svc.saveInvoiceContent(id, content({ notes: "Thanks" }), ADMIN, { isNew: false }).committed;
    expect(read(`invoices/${id}`)).toMatchObject({ notes: "Thanks", ownerId: "s1", revision: 0 });
  });
});

describe("generating — one number, never two", () => {
  it("gives the first invoice of the year DTS/26-27/0001 and registers it", async () => {
    const id = svc.newInvoiceId();
    await svc.saveInvoiceContent(id, content(), SALES, { isNew: true }).committed;
    const r = await svc.generateInvoice(id, content(), SALES);
    expect(r).toEqual({ number: "DTS/26-27/0001", already: false });
    expect(read(`invoices/${id}`)).toMatchObject({ number: "DTS/26-27/0001", sequence: 1, financialYear: "2026-27", status: "issued", issuedByUid: "s1" });
    expect(read("invoice_counters/2026-27")?.seq).toBe(1);
    expect(read("invoice_numbers/DTS-26-27-0001")).toMatchObject({ invoiceId: id, number: "DTS/26-27/0001" });
  });

  it("numbers the next invoice 0002, whoever makes it", async () => {
    const a = svc.newInvoiceId();
    const b = svc.newInvoiceId();
    await svc.generateInvoice(a, content(), SALES);
    const r = await svc.generateInvoice(b, content(), OTHER);
    expect(r.number).toBe("DTS/26-27/0002");
    expect(new Set(all("invoices").map((i) => i.number)).size).toBe(2);
  });

  it("pressing Generate twice keeps the first number and spends no second one", async () => {
    const id = svc.newInvoiceId();
    const first = await svc.generateInvoice(id, content(), SALES);
    const again = await svc.generateInvoice(id, content({ notes: "changed" }), SALES);
    expect(again).toEqual({ number: first.number, already: true });
    expect(read("invoice_counters/2026-27")?.seq).toBe(1);
    expect(all("invoice_numbers")).toHaveLength(1);
  });

  it("creates an invoice that was never saved, with its content", async () => {
    const id = svc.newInvoiceId();
    await svc.generateInvoice(id, content(), SALES);
    expect(read(`invoices/${id}`)).toMatchObject({ ownerId: "s1", status: "issued", customer: { name: "Samas Sarees" } });
    expect(read(`invoices/${id}`)!.history.map((h: any) => h.action)).toEqual(["created", "generated"]);
  });

  it("starts a new series each April, from the invoice date", async () => {
    const march = svc.newInvoiceId();
    const april = svc.newInvoiceId();
    expect((await svc.generateInvoice(march, content({ issueDate: "2027-03-31", dueDate: "2027-04-05" }), SALES)).number).toBe("DTS/26-27/0001");
    expect((await svc.generateInvoice(april, content({ issueDate: "2027-04-01", dueDate: "2027-04-06" }), SALES)).number).toBe("DTS/27-28/0001");
  });

  it("skips a number the register already holds, even if the counter forgot it", async () => {
    mem.__seed("invoice_numbers/DTS-26-27-0001", { number: "DTS/26-27/0001", invoiceId: "old" });
    const r = await svc.generateInvoice(svc.newInvoiceId(), content(), SALES);
    expect(r.number).toBe("DTS/26-27/0002");
  });
});

describe("after it is generated", () => {
  it("an edit keeps the number, counts a revision and is recorded", async () => {
    const id = svc.newInvoiceId();
    await svc.generateInvoice(id, content(), SALES);
    await svc.saveInvoiceContent(id, content({ notes: "Corrected address" }), SALES, { isNew: false, issued: true }).committed;
    const doc = read(`invoices/${id}`)!;
    expect(doc).toMatchObject({ number: "DTS/26-27/0001", status: "issued", revision: 1, notes: "Corrected address" });
    expect(doc.history.at(-1).action).toBe("edited");
  });

  it("can be marked paid, unpaid again, or cancelled — never deleted", async () => {
    const id = svc.newInvoiceId();
    await svc.generateInvoice(id, content(), SALES);
    await svc.setInvoiceStatus({ id, number: "DTS/26-27/0001" }, "paid", SALES);
    expect(read(`invoices/${id}`)?.status).toBe("paid");
    expect(read(`invoices/${id}`)?.paidAt).toBeTruthy();
    await svc.setInvoiceStatus({ id, number: "DTS/26-27/0001" }, "cancelled", SALES);
    expect(read(`invoices/${id}`)?.status).toBe("cancelled");
    await expect(svc.deleteDraftInvoice(id)).rejects.toThrow(/cancel/);
    expect(read(`invoices/${id}`)).toBeTruthy();
    expect(read(`invoices/${id}`)!.history.map((h: any) => h.action)).toEqual(["created", "generated", "paid", "cancelled"]);
  });

  it("refuses a status change on a draft", async () => {
    await expect(svc.setInvoiceStatus({ id: "x", number: null }, "paid", SALES)).rejects.toThrow();
  });
});

describe("drafts can be deleted and duplicated", () => {
  it("deletes a draft", async () => {
    const id = svc.newInvoiceId();
    await svc.saveInvoiceContent(id, content(), SALES, { isNew: true }).committed;
    await svc.deleteDraftInvoice(id);
    expect(read(`invoices/${id}`)).toBeUndefined();
  });

  it("a duplicate is a new draft, dated today, with fresh line ids and no number", async () => {
    const id = svc.newInvoiceId();
    await svc.generateInvoice(id, content(), SALES);
    const source = { ...read(`invoices/${id}`), id } as any;
    const { id: copyId, committed } = svc.duplicateInvoice(source, OTHER);
    await committed;
    const copy = read(`invoices/${copyId}`)!;
    expect(copy).toMatchObject({ status: "draft", number: null, ownerId: "s2", duplicatedFrom: id, customer: { name: "Samas Sarees" } });
    expect(copy.items[0].id).not.toBe(source.items[0].id);
    expect(copy.issueDate).toBe(draft.isoDate());
  });
});

describe("who sees which invoices", () => {
  it("a salesperson sees their own; an admin sees all", async () => {
    await svc.saveInvoiceContent(svc.newInvoiceId(), content(), SALES, { isNew: true }).committed;
    await svc.saveInvoiceContent(svc.newInvoiceId(), content(), OTHER, { isNew: true }).committed;
    const seen = (viewer: { uid: string; role: any }) => new Promise<number>((resolve) => {
      const stop = svc.watchInvoices(viewer, (list) => { stop(); resolve(list.length); });
    });
    expect(await seen(SALES)).toBe(1);
    expect(await seen(ADMIN)).toBe(2);
  });
});

describe("settings", () => {
  it("the team-leader switch and the defaults are their own documents", async () => {
    await settings.setTeamLeadersEnabled(true, { uid: "t", name: "Tech", role: "tech_admin" });
    expect(read("invoice_settings/access")).toMatchObject({ teamLeadersEnabled: true, updatedByUid: "t" });
    await settings.saveInvoiceDefaults({ payment: { bankName: "SBI" } as any }, ADMIN);
    await settings.saveInvoiceDefaults({ terms: "Net 7" }, ADMIN);
    expect(read("invoice_settings/defaults")).toMatchObject({ payment: { bankName: "SBI" }, terms: "Net 7" });
  });
});

describe("before it can be generated", () => {
  const fields = (c: InvoiceContent) => draft.validateInvoice(c).filter((i) => i.level === "error").map((i) => i.field);

  it("a complete invoice has nothing blocking", () => {
    expect(fields(content())).toEqual([]);
  });

  it("names what is missing or wrong, top to bottom", () => {
    const c = content();
    c.customer = { ...c.customer, name: "", gstin: "37AAVFS8531R1ZZ" };
    c.items = [{ ...c.items[0], name: "", rate: 100 }];
    c.dueDate = "2026-10-01";
    expect(fields(c)).toEqual(["dueDate", "customer.name", "customer.gstin", `items.${c.items[0].id}.name`]);
  });

  it("a GST invoice needs the seller's GSTIN; a No-GST one does not", () => {
    const c = content();
    c.seller = { ...c.seller, gstin: "" };
    expect(fields(c)).toContain("seller.gstin");
    expect(fields({ ...c, tax: { ...c.tax, mode: "none" } })).not.toContain("seller.gstin");
  });

  it("an invoice with no items, or a ₹0 total, cannot be generated", () => {
    expect(fields(content({ items: [] }))).toContain("items");
    const c = content();
    c.items = [{ ...c.items[0], rate: 0 }];
    expect(fields(c)).toContain("items");
  });
});

describe("how it reads", () => {
  it("writes the total in words, with paise when there are any", () => {
    expect(draft.rupeesInWords(1740000)).toBe("Seventeen Thousand Four Hundred Rupees Only");
    expect(draft.rupeesInWords(1050)).toBe("Ten Rupees and Fifty Paise Only");
    expect(draft.rupeesInWords(100)).toBe("One Rupee Only");
    expect(draft.rupeesInWords(0)).toBe("Zero Rupees Only");
    expect(draft.rupeesInWords(1234567890)).toBe("One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Rupees and Ninety Paise Only");
  });

  it("leaves the payslip's words exactly as they were", () => {
    expect(amountInWords(17400)).toBe("Seventeen Thousand Four Hundred Rupees Only");
    expect(amountInWords(0)).toBe("Zero Rupees Only");
  });

  it("builds a UPI link with the total and the invoice in it — and none for a bad id", () => {
    const link = draft.upiPaymentLink({ upiId: "9849834102-3@ybl", payeeName: "Dream Team Services", amount: 1740000, note: "Invoice DTS/26-27/0001" });
    expect(link).toBe("upi://pay?pa=9849834102-3%40ybl&pn=Dream%20Team%20Services&am=17400.00&cu=INR&tn=Invoice%20DTS%2F26-27%2F0001");
    expect(draft.upiPaymentLink({ upiId: "nope", payeeName: "", amount: 1, note: "" })).toBe("");
  });

  it("works out Overdue on read, never stores it", () => {
    expect(draft.displayStatusOf({ status: "issued", dueDate: "2026-10-01" }, "2026-10-08")).toBe("overdue");
    expect(draft.displayStatusOf({ status: "issued", dueDate: "2026-10-08" }, "2026-10-08")).toBe("unpaid");
    expect(draft.displayStatusOf({ status: "paid", dueDate: "2026-10-01" }, "2026-10-08")).toBe("paid");
    expect(draft.displayStatusOf({ status: "draft", dueDate: "2026-10-01" }, "2026-10-08")).toBe("draft");
  });

  it("names the PDF after the number and the customer", () => {
    expect(draft.invoiceFileName({ number: "DTS/26-27/0001", customer: { name: "Samas / Sarees" } })).toBe("Invoice DTS-26-27-0001 - Samas Sarees.pdf");
    expect(draft.invoiceFileName({ number: null, customer: { name: "" } })).toBe("Draft invoice.pdf");
  });

  it("reads an old or half-written invoice as complete content", () => {
    const c = draft.contentOf({ customer: { name: "X" } as any, items: [{ name: "Ad", rate: 5 } as any] });
    expect(c.customer).toMatchObject({ name: "X", shipToDifferent: false, gstin: "" });
    expect(c.items[0]).toMatchObject({ name: "Ad", rate: 5, quantity: 1, discountKind: "percent", taxRate: 18 });
    expect(c.items[0].id).toBeTruthy();
    expect(draft.contentFingerprint(c)).toBe(draft.contentFingerprint(draft.contentOf(c)));
  });

  it("fills a salesperson's sale in as the customer and a line", () => {
    const { customer, item } = draft.fillFromOrder({
      businessName: "Samas Sarees", clientName: "Ravi", clientPhone: "+919876543210",
      category: "social_media_management", packageKey: "Plus Package", amount: 15000,
    }, 18);
    expect(customer).toEqual({ name: "Samas Sarees", phone: "+919876543210" });
    expect(item).toMatchObject({ name: "Social Media Management", description: "Plus Package", quantity: 1, rate: 15000, taxRate: 18 });
  });

  it("suggests each earlier customer once, newest first", () => {
    const list = [
      { customer: { name: "B" }, updatedAt: 2 }, { customer: { name: "a" }, updatedAt: 1 }, { customer: { name: "b " }, updatedAt: 0 },
    ] as any;
    expect(draft.recentCustomers(list).map((c) => c.name)).toEqual(["B", "a"]);
  });
});

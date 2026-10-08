/**
 * The Invoice Builder's pure rules: GSTIN checking, the financial-year numbers, who may use it, and
 * the page plan the preview, PDF and print share.
 */
import { describe, expect, it } from "vitest";
import {
  gstinCheckChar, gstinProblem, isValidIfsc, isValidUpiId, normalizeGstin, stateCodeOfGstin, stateName, supplyTypeOf,
} from "@/utils/gst";
import {
  financialYearLabel, financialYearShort, financialYearStart, formatInvoiceNumber, GST_INVOICE_NUMBER_MAX,
  invoiceNumberForFile, invoiceNumberKey,
} from "@/utils/invoiceNumber";
import {
  canDeleteInvoice, canEditInvoice, canEditInvoiceDefaults, canManageInvoiceAccess, canUseInvoiceBuilder, INVOICE_ROUTE_ROLES, isInvoiceAdmin,
} from "@/utils/invoiceAccess";
import { planInvoicePages, type InvoiceLayoutInput } from "@/utils/invoiceLayout";
import { getNavItems } from "@/utils/roleHelpers";
import type { UserRole } from "@/types";

describe("GSTIN", () => {
  it("accepts the company's and the client's GSTINs from the owner's invoice", () => {
    expect(gstinProblem("37FWQPR6939Q1ZY")).toBeNull();
    expect(gstinProblem("37AAVFS8513R1ZZ")).toBeNull();
    expect(gstinProblem(" 37fwqpr6939q1zy ")).toBeNull();
    expect(gstinProblem("")).toBeNull();
  });

  it("catches two digits typed the wrong way round", () => {
    expect(gstinProblem("37FWQPR9639Q1ZY")).toBe("check");
    expect(gstinCheckChar("37FWQPR6939Q1Z")).toBe("Y");
  });

  it("names the shape and state mistakes", () => {
    expect(gstinProblem("37FWQPR6939Q1Z")).toBe("shape");
    expect(gstinProblem("99FWQPR6939Q1ZY")).toBe("state");
  });

  it("reads the state from the first two digits", () => {
    expect(stateCodeOfGstin("37AAVFS8513R1ZZ")).toBe("37");
    expect(stateName("37")).toBe("Andhra Pradesh");
    expect(stateCodeOfGstin("garbage")).toBe("");
    expect(normalizeGstin("37 aav fs8513r1zz")).toBe("37AAVFS8513R1ZZ");
  });

  it("same state → CGST+SGST, another → IGST, unknown → same", () => {
    expect(supplyTypeOf("37", "37")).toBe("intra");
    expect(supplyTypeOf("37", "36")).toBe("inter");
    expect(supplyTypeOf("37", "")).toBe("intra");
  });

  it("checks IFSC and UPI loosely but usefully", () => {
    expect(isValidIfsc("BARB0GHATIX")).toBe(true);
    expect(isValidIfsc("barb0ghatix")).toBe(true);
    expect(isValidIfsc("BARBOGHATIX")).toBe(false);
    expect(isValidUpiId("9849834102-3@ybl")).toBe(true);
    expect(isValidUpiId("not an id")).toBe(false);
  });
});

describe("invoice numbers — DTS/26-27/0001", () => {
  it("takes the financial year from the invoice date: April starts it, March ends it", () => {
    expect(financialYearStart("2026-04-01")).toBe(2026);
    expect(financialYearStart("2027-03-31")).toBe(2026);
    expect(financialYearStart("2026-10-08")).toBe(2026);
    expect(financialYearLabel(2026)).toBe("2026-27");
    expect(financialYearShort(2026)).toBe("26-27");
    expect(financialYearShort(2099)).toBe("99-00");
  });

  it("prints the owner's chosen format, padded so a year sorts as text", () => {
    expect(formatInvoiceNumber(2026, 1)).toBe("DTS/26-27/0001");
    expect(formatInvoiceNumber(2026, 42)).toBe("DTS/26-27/0042");
    expect(formatInvoiceNumber(2026, 12345)).toBe("DTS/26-27/12345");
  });

  it("never exceeds GST's 16 characters, even at 99,999 invoices a year", () => {
    for (let y = 2000; y < 2100; y++) {
      expect(formatInvoiceNumber(y, 99999).length).toBeLessThanOrEqual(GST_INVOICE_NUMBER_MAX);
      expect(formatInvoiceNumber(y, 99999)).toMatch(/^[A-Z0-9/-]+$/);
    }
  });

  it("makes a document id and a file name without slashes", () => {
    expect(invoiceNumberKey("DTS/26-27/0001")).toBe("DTS-26-27-0001");
    expect(invoiceNumberForFile("DTS/26-27/0001")).toBe("DTS-26-27-0001");
  });
});

describe("who may use the Invoice Builder (owner, 2026-10-08)", () => {
  const roles: UserRole[] = ["main_admin", "tech_admin", "sales_admin", "accounts_admin", "sales_member", "tech_team_leader", "tech_member"];

  it("salespeople and every admin — always; a tech member — never", () => {
    for (const r of ["main_admin", "tech_admin", "sales_admin", "accounts_admin", "sales_member"] as UserRole[]) {
      expect(canUseInvoiceBuilder(r, false), r).toBe(true);
    }
    expect(canUseInvoiceBuilder("tech_member", true)).toBe(false);
    expect(INVOICE_ROUTE_ROLES).not.toContain("tech_member");
  });

  it("a team leader follows the switch", () => {
    expect(canUseInvoiceBuilder("tech_team_leader", false)).toBe(false);
    expect(canUseInvoiceBuilder("tech_team_leader", true)).toBe(true);
  });

  it("only the Tech Admin and the Main Admin hold the switch", () => {
    expect(roles.filter(canManageInvoiceAccess)).toEqual(["main_admin", "tech_admin"]);
  });

  it("the four admins see every invoice and set the defaults; others see their own", () => {
    expect(roles.filter(isInvoiceAdmin)).toEqual(["main_admin", "tech_admin", "sales_admin", "accounts_admin"]);
    expect(canEditInvoiceDefaults("sales_member")).toBe(false);
    const mine = { ownerId: "s1" };
    expect(canEditInvoice({ uid: "s1", role: "sales_member" }, mine)).toBe(true);
    expect(canEditInvoice({ uid: "s2", role: "sales_member" }, mine)).toBe(false);
    expect(canEditInvoice({ uid: "a", role: "accounts_admin" }, mine)).toBe(true);
    expect(canEditInvoice({ uid: "l", role: "tech_team_leader" }, mine)).toBe(false);
  });

  it("the maker or an admin can delete a draft or a generated invoice; nobody else", () => {
    const me = { uid: "s1", role: "sales_member" as UserRole };
    expect(canDeleteInvoice(me, { ownerId: "s1", status: "draft", number: null })).toBe(true);
    expect(canDeleteInvoice(me, { ownerId: "s1", status: "issued", number: "DTS/26-27/0001" })).toBe(true);
    expect(canDeleteInvoice({ uid: "s2", role: "sales_member" }, { ownerId: "s1", status: "issued", number: "DTS/26-27/0001" })).toBe(false);
    expect(canDeleteInvoice({ uid: "a", role: "accounts_admin" }, { ownerId: "s1", status: "paid", number: "DTS/26-27/0001" })).toBe(true);
  });

  it("puts Invoices in the menu once per allowed role, never for a tech member", () => {
    const paths = (r: UserRole, access?: { invoiceBuilder?: boolean }) =>
      getNavItems(r, null, access).flatMap((i) => (i.children ? i.children.map((c) => c.path) : [i.path]));
    for (const r of ["main_admin", "tech_admin", "sales_admin", "accounts_admin", "sales_member"] as UserRole[]) {
      expect(paths(r).filter((p) => p === "/invoices"), r).toHaveLength(1);
    }
    expect(paths("tech_member")).not.toContain("/invoices");
    expect(paths("tech_member", { invoiceBuilder: true })).not.toContain("/invoices");
    expect(paths("tech_team_leader")).not.toContain("/invoices");
    expect(paths("tech_team_leader", { invoiceBuilder: true }).filter((p) => p === "/invoices")).toHaveLength(1);
  });
});

describe("the page plan", () => {
  const base = (over: Partial<InvoiceLayoutInput> = {}): InvoiceLayoutInput => ({
    firstPageHeight: 1000, nextPageHeight: 940, intro: 300, tableHead: 40, rows: [50, 50],
    after: [{ key: "summary", height: 150, keepWithRows: true }, { key: "payment", height: 160 }], ...over,
  });
  const flatRows = (pages: ReturnType<typeof planInvoicePages>) => pages.flatMap((p) => p.rows);

  it("a short invoice is one sheet", () => {
    const pages = planInvoicePages(base());
    expect(pages).toHaveLength(1);
    expect(pages[0]).toEqual({ intro: true, tableHead: true, rows: [0, 1], after: ["summary", "payment"] });
  });

  it("rows that do not fit move whole, and the next sheet repeats the table header", () => {
    const pages = planInvoicePages(base({ rows: Array(20).fill(50), after: [] }));
    expect(pages.length).toBe(2);
    expect(pages[1].intro).toBe(false);
    expect(pages[1].tableHead).toBe(true);
    expect(flatRows(pages)).toEqual([...Array(20).keys()]);
  });

  it("the totals take the last row with them rather than sit alone", () => {
    // Page 1 holds intro 300 + head 40 + 13 rows (650) = 990; the summary (150) does not fit.
    const pages = planInvoicePages(base({ rows: Array(13).fill(50), after: [{ key: "summary", height: 150, keepWithRows: true }] }));
    expect(pages).toHaveLength(2);
    expect(pages[0].rows).toHaveLength(12);
    expect(pages[1].rows).toEqual([12]);
    expect(pages[1].after).toEqual(["summary"]);
  });

  it("a heading never ends a sheet without its paragraph", () => {
    const pages = planInvoicePages(base({
      rows: [50],
      after: [
        { key: "summary", height: 150, keepWithRows: true },
        { key: "big", height: 400 },
        { key: "terms-h", height: 30, keepWithNext: true },
        { key: "terms-0", height: 60 },
      ],
    }));
    const where = (k: string) => pages.findIndex((p) => p.after.includes(k));
    expect(where("terms-h")).toBe(where("terms-0"));
  });

  it("the table header is never alone at the foot of a sheet", () => {
    const pages = planInvoicePages(base({ intro: 930, rows: [50, 50], after: [] }));
    expect(pages[0].tableHead).toBe(false);
    expect(pages[0].rows).toEqual([]);
    expect(pages[1].tableHead).toBe(true);
  });

  it("a block taller than any sheet still gets one, and the plan ends", () => {
    const pages = planInvoicePages(base({ rows: [50], after: [{ key: "huge", height: 5000 }, { key: "next", height: 10 }] }));
    expect(pages.some((p) => p.after.includes("huge"))).toBe(true);
    expect(pages[pages.length - 1].after).toContain("next");
  });

  it("every row and block appears exactly once, in order (random check)", () => {
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let run = 0; run < 200; run++) {
      const rows = Array.from({ length: Math.floor(rnd() * 60) + 1 }, () => 30 + Math.floor(rnd() * 120));
      const after = [
        { key: "summary", height: 120 + Math.floor(rnd() * 80), keepWithRows: true },
        { key: "payment", height: 150 },
        { key: "terms-h", height: 30, keepWithNext: true },
        ...Array.from({ length: Math.floor(rnd() * 8) }, (_, i) => ({ key: `terms-${i}`, height: 20 + Math.floor(rnd() * 60) })),
      ];
      const pages = planInvoicePages(base({ rows, after }));
      expect(flatRows(pages)).toEqual(rows.map((_, i) => i));
      expect(pages.flatMap((p) => p.after)).toEqual(after.map((b) => b.key));
      for (const p of pages) if (p.rows.length) expect(p.tableHead).toBe(true);
      expect(pages[0].intro).toBe(true);
      expect(pages.slice(1).every((p) => !p.intro)).toBe(true);
    }
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * "Paste Flow accounts" and accounts without an opening day (owner, 2026-10-22), on the in-memory
 * Firestore with the REAL service and the real dialog.
 *
 * The owner had a sheet of ~90 accounts with gaps — logins without "@gmail.com", rows without a
 * password, a password wrapped onto the next line, the whole block pasted twice (once with a different
 * password), and no opening days at all. Every account goes in once, as the paster's, with "Opening
 * day not set"; a paste fills a missing password but never replaces a saved one. (The passwords here
 * are made up — never the owner's.)
 */

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification: vi.fn(async () => undefined) }));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const mem = await import("./memoryFirestore");
const svc = await import("@/services/aiAccounts");
const fc = await import("@/utils/flowCredits");
const { default: PasteAccountsDialog } = await import("@/components/ai-accounts/PasteAccountsDialog");
const { default: FlowAccountDialog } = await import("@/components/ai-accounts/FlowAccountDialog");
import type { FlowAccount } from "@/types/aiAccounts";

configure({ testIdAttribute: "data-test" });

const S = fc.DEFAULT_FLOW_SETTINGS;
const srinu = { uid: "admin", name: "Srinu", role: "tech_admin", createdBy: "" } as const;
const account = (id: string) => ({ ...(mem.__read(`flow_accounts/${id}`) as unknown as FlowAccount), id });
const password = (id: string) => (mem.__read(`flow_account_secrets/${id}`) as { password?: string } | undefined)?.password;

const SHEET = [
  "first.one@gmail.com\t",
  "second.two@gmail.com",
  "\tWrapped@1",
  "third.three@gmail.com\tPw-3",
  "affreenaffreen27\tPw-4",
  "aishwarya.rao.2005.7341\tPw-5",
  "shaik.test0@gmail.com\tsri",
  "",
  "=====================",
  "shaik.test0@gmail.com\tPw-6",
  "third.three@gmail.com\tPw-3",
  "first.one@gmail.com\t",
].join("\n");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-22T10:00:00"));
  mem.__reset();
  toast.mockClear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("parseFlowAccountPaste", () => {
  it("reads the owner's sheet: bare logins, wrapped passwords, repeats, dividers", () => {
    const out = fc.parseFlowAccountPaste(SHEET);
    expect(out.accounts).toEqual([
      { email: "first.one@gmail.com", password: "" },
      { email: "second.two@gmail.com", password: "Wrapped@1" },
      { email: "third.three@gmail.com", password: "Pw-3" },
      { email: "affreenaffreen27@gmail.com", password: "Pw-4" },
      { email: "aishwarya.rao.2005.7341@gmail.com", password: "Pw-5" },
      // The later password wins (the owner's choice for shaikaffreen0).
      { email: "shaik.test0@gmail.com", password: "Pw-6" },
    ]);
    expect(out.repeats).toBe(3);
    expect(out.skipped).toEqual([{ line: 9, text: "=====================" }]);
  });

  it("never turns a stray password or a short word into an account, and a later blank never wipes a password", () => {
    const out = fc.parseFlowAccountPaste("Lonely@pass\nsri\nA.B@gmail.com  Pw 1\na.b@gmail.com");
    expect(out.accounts).toEqual([{ email: "a.b@gmail.com", password: "Pw 1" }]);
    expect(out.skipped.map((s) => s.line)).toEqual([1, 2]);
  });
});

describe("no opening day", () => {
  it("has no expiry, no cycle, is never usable and refuses credits", () => {
    const a = { createdOn: "", expiresOn: "", monthlyCredits: 1000, usedByCycle: {}, status: "active" as const };
    expect(fc.hasOpeningDay(a)).toBe(false);
    expect(fc.expiryOf("")).toBe("");
    expect(fc.nextResetOf("", "2026-10-22")).toBe("");
    expect(fc.accountState(a, "2026-10-22")).toMatchObject({ usable: false, noOpeningDay: true, expired: false });
    expect(fc.cycleFiguresOn(a, "2026-10-22").cycleEnd).toBe("");
    expect(fc.usageDateProblem("2026-10-22", "2026-10-22", { createdOn: "", email: "x@gmail.com" })).toMatch(/no opening day yet/);
    // Dated accounts are unchanged.
    expect(fc.accountState({ ...a, createdOn: "2026-10-01", expiresOn: "2028-04-01" }, "2026-10-22")).toMatchObject({ usable: true, noOpeningDay: false });
  });

  it("is counted apart in the team totals", () => {
    const base = { id: "", email: "", phone: "", monthlyCredits: 1000, addedBy: "a", addedByName: "", addedByRole: "tech_admin", ownerId: "a", ownerName: "", holderId: "a", holderName: "", visibleTo: [], teamAdminId: "a", status: "active", usedByCycle: {} } as unknown as FlowAccount;
    const totals = fc.teamTotals([{ ...base, createdOn: "2026-10-01", expiresOn: "2028-04-01" }, { ...base, createdOn: "", expiresOn: "" }], "2026-10-22");
    expect(totals).toMatchObject({ accounts: 2, live: 1, undated: 1, capacity: 1000, remaining: 1000 });
  });

  it("lets Edit fill a password on an account with no phone and no day — and still checks what is typed", () => {
    const input = { email: "a@gmail.com", password: "", phone: "", createdOn: "" };
    expect(fc.validateFlowAccountInput(input, "2026-10-22", { passwordRequired: false, phoneOptional: true, openingDayOptional: true })).toEqual({});
    expect(fc.validateFlowAccountInput({ ...input, phone: "123", createdOn: "2026-11-01" }, "2026-10-22", { passwordRequired: false, phoneOptional: true, openingDayOptional: true }))
      .toEqual({ phone: expect.any(String), createdOn: "That day is still to come." });
    // The add form still asks for both.
    expect(Object.keys(fc.validateFlowAccountInput(input, "2026-10-22"))).toEqual(["password", "phone", "createdOn"]);
  });
});

describe("importFlowAccount", () => {
  it("adds a new account as the paster's, undated, with its password", async () => {
    expect(await svc.importFlowAccount({ email: "new.one@gmail.com", password: "Pw-1" }, srinu, S)).toBe("added");
    expect(account("new.one@gmail.com")).toMatchObject({
      email: "new.one@gmail.com", phone: "", createdOn: "", expiresOn: "", ownerId: "admin", holderId: "admin", addedBy: "admin",
      teamAdminId: "admin", visibleTo: ["admin"], status: "active",
    });
    expect(password("new.one@gmail.com")).toBe("Pw-1");
  });

  it("fills a missing password once and never replaces a saved one", async () => {
    await svc.importFlowAccount({ email: "a@gmail.com", password: "" }, srinu, S);
    expect(password("a@gmail.com")).toBe("");
    expect(await svc.importFlowAccount({ email: "a@gmail.com", password: "First" }, srinu, S)).toBe("password_added");
    expect(password("a@gmail.com")).toBe("First");
    expect(account("a@gmail.com").history?.map((h) => h.action)).toEqual(["added", "password_changed"]);
    expect(await svc.importFlowAccount({ email: "a@gmail.com", password: "Other" }, srinu, S)).toBe("already_there");
    expect(password("a@gmail.com")).toBe("First");
  });

  it("leaves a member's existing account exactly as it was (owner, date, phone)", async () => {
    await svc.addFlowAccount({ email: "ravi@gmail.com", password: "Own", phone: "9876543210", createdOn: "2026-10-05" },
      { uid: "ravi", name: "Ravi", role: "tech_member", createdBy: "admin" }, S);
    const before = account("ravi@gmail.com");
    expect(await svc.importFlowAccount({ email: "ravi@gmail.com", password: "Pasted" }, srinu, S)).toBe("already_there");
    expect(account("ravi@gmail.com")).toEqual(before);
    expect(password("ravi@gmail.com")).toBe("Own");
  });

  it("then the account can be dated on Edit, which sets its expiry", async () => {
    await svc.importFlowAccount({ email: "a@gmail.com", password: "" }, srinu, S);
    await svc.updateFlowAccount(account("a@gmail.com"), { createdOn: "2026-10-03", phone: "" }, srinu, S);
    expect(account("a@gmail.com")).toMatchObject({ createdOn: "2026-10-03", expiresOn: "2028-04-03" });
  });
});

describe("the Paste dialog", () => {
  it("previews the counts without showing a password, then adds and reports", async () => {
    await svc.addFlowAccount({ email: "third.three@gmail.com", password: "Kept", phone: "9876543210", createdOn: "2026-10-01" }, srinu, S);
    const existing = [account("third.three@gmail.com")];
    render(<PasteAccountsDialog open onClose={() => undefined} actor={srinu} settings={S} accounts={existing} />);
    fireEvent.change(screen.getByTestId("paste-text"), { target: { value: SHEET } });
    expect(screen.getByTestId("paste-total").textContent).toBe("6");
    expect(screen.getByTestId("paste-new").textContent).toBe("5");
    expect(screen.getByTestId("paste-existing").textContent).toBe("1");
    expect(screen.getByTestId("paste-preview").textContent).not.toMatch(/Pw-|Wrapped/);
    fireEvent.click(screen.getByTestId("paste-save"));
    await waitFor(() => expect(screen.getByTestId("paste-result")).toBeTruthy());
    expect(screen.getByTestId("paste-added").textContent).toBe("5");
    expect(screen.getByTestId("paste-unchanged").textContent).toBe("1");
    expect(password("third.three@gmail.com")).toBe("Kept");
    expect(password("second.two@gmail.com")).toBe("Wrapped@1");
    expect(account("affreenaffreen27@gmail.com").createdOn).toBe("");
  });

  it("Edit saves a password on an undated account with no phone", async () => {
    await svc.importFlowAccount({ email: "a@gmail.com", password: "" }, srinu, S);
    render(<FlowAccountDialog open onClose={() => undefined} actor={srinu} settings={S} account={account("a@gmail.com")} />);
    expect(screen.getByTestId("flow-created-hint").textContent).toMatch(/Not set yet/);
    fireEvent.change(screen.getByTestId("flow-password"), { target: { value: "Typed" } });
    fireEvent.click(screen.getByTestId("flow-account-save"));
    await waitFor(() => expect(password("a@gmail.com")).toBe("Typed"));
    expect(account("a@gmail.com").createdOn).toBe("");
  });
});

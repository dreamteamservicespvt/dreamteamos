import { describe, it, expect } from "vitest";
import {
  normalizeBank, primaryAccount, isAccountComplete, isBankComplete,
  missingBankFields, accountSummary, payoutSummary,
} from "@/services/payroll";
import type { EmployeeBank, PayoutAccount } from "@/types/payroll";

const account = (fields: Partial<PayoutAccount> = {}): PayoutAccount => ({
  id: "a1", method: "upi", accountHolderName: "Ravi Kumar", upiId: "ravi@okaxis",
  isPrimary: true, verified: false, ...fields,
});

describe("normalizeBank — legacy records keep working", () => {
  it("returns null when nothing is stored", () => {
    expect(normalizeBank("u1", undefined)).toBeNull();
    expect(normalizeBank("u1", {})).toBeNull();
  });

  it("folds a legacy single-method record into a one-entry account list", () => {
    const bank = normalizeBank("u1", {
      method: "upi", accountHolderName: "Ravi Kumar", upiId: "ravi@okaxis", verified: true,
    });
    expect(bank?.accounts).toHaveLength(1);
    expect(bank?.accounts[0]).toMatchObject({
      id: "legacy", method: "upi", upiId: "ravi@okaxis", isPrimary: true, verified: true,
    });
  });

  it("drops legacy fields that were never filled in", () => {
    const bank = normalizeBank("u1", {
      method: "bank_transfer", accountHolderName: "Ravi", bankName: "HDFC", accountNumber: "123456",
    });
    expect(bank?.accounts[0]).not.toHaveProperty("upiId");
    expect(bank?.accounts[0].verified).toBe(false);
  });

  it("passes a modern multi-account record straight through", () => {
    const bank = normalizeBank("u1", {
      accounts: [account({ id: "a1", isPrimary: false }), account({ id: "a2", isPrimary: true })],
    });
    expect(bank?.accounts).toHaveLength(2);
    expect(primaryAccount(bank)?.id).toBe("a2");
  });

  it("repairs a record with no primary by promoting the first", () => {
    const bank = normalizeBank("u1", {
      accounts: [account({ id: "a1", isPrimary: false }), account({ id: "a2", isPrimary: false })],
    });
    expect(bank?.accounts.filter(a => a.isPrimary)).toHaveLength(1);
    expect(primaryAccount(bank)?.id).toBe("a1");
  });

  it("repairs a record with several primaries so only one survives", () => {
    const bank = normalizeBank("u1", {
      accounts: [account({ id: "a1", isPrimary: true }), account({ id: "a2", isPrimary: true })],
    });
    expect(bank?.accounts.filter(a => a.isPrimary)).toHaveLength(1);
    expect(primaryAccount(bank)?.id).toBe("a1");
  });
});

describe("completeness", () => {
  it("requires a UPI id for UPI", () => {
    expect(isAccountComplete(account())).toBe(true);
    expect(isAccountComplete(account({ upiId: "" }))).toBe(false);
    expect(missingBankFields(account({ upiId: undefined }))).toContain("upiId");
  });

  it("requires bank name, number and IFSC for a bank transfer", () => {
    const partial = account({ method: "bank_transfer", upiId: undefined, bankName: "HDFC" });
    expect(missingBankFields(partial).sort()).toEqual(["accountNumber", "ifsc"]);
  });

  it("requires a phone number for wallets", () => {
    expect(missingBankFields(account({ method: "phonepe", upiId: undefined }))).toEqual(["phoneNumber"]);
    expect(isAccountComplete(account({ method: "paytm", phoneNumber: "9876543210" }))).toBe(true);
  });

  it("treats an employee as payable when any one account is usable", () => {
    const bank = { uid: "u1", accounts: [account({ upiId: "" }), account({ id: "a2", method: "phonepe", phoneNumber: "9876543210" })] } as EmployeeBank;
    expect(isBankComplete(bank)).toBe(true);
  });

  it("treats an employee with no usable account as unpayable", () => {
    expect(isBankComplete({ uid: "u1", accounts: [account({ upiId: "" })] } as EmployeeBank)).toBe(false);
    expect(isBankComplete(null)).toBe(false);
  });
});

describe("display summaries", () => {
  it("masks all but the last four digits of a bank account", () => {
    const summary = accountSummary(account({
      method: "bank_transfer", bankName: "HDFC Bank", accountNumber: "50100123454321",
    }));
    expect(summary).toContain("HDFC Bank");
    expect(summary).toContain("4321");
    expect(summary).not.toContain("50100123454321");
  });

  it("shows the UPI id in full", () => {
    expect(accountSummary(account())).toBe("UPI · ravi@okaxis");
  });

  it("names the wallet", () => {
    expect(accountSummary(account({ method: "google_pay", phoneNumber: "9876543210" })))
      .toBe("Google Pay · 9876543210");
  });

  it("summarises the primary account for payroll", () => {
    const bank = { uid: "u1", accounts: [
      account({ id: "a1", isPrimary: false }),
      account({ id: "a2", method: "phonepe", phoneNumber: "9876543210", isPrimary: true }),
    ] } as EmployeeBank;
    expect(payoutSummary(bank)).toBe("PhonePe · 9876543210");
  });

  it("says so when nothing is set up", () => {
    expect(payoutSummary(null)).toBe("Not set up");
  });
});

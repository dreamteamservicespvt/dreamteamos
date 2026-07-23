import {
  addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { db } from "./firebase";
import { recordAudit } from "./auditLog";
import {
  DEFAULT_PAYROLL_CONFIG, PAYOUT_METHOD_LABELS, REQUIRED_BANK_FIELDS,
  type EmployeeBank, type PayoutAccount, type PayoutMethod, type PayrollConfig, type SalaryPackage,
} from "@/types/payroll";
import type { AppUser } from "@/types";

/**
 * Payroll setup data: salary packages, company policy, and employee payout details.
 *
 * Deliberately separate from the calculation engine (utils/payrollEngine) — this module only
 * reads and writes; it never decides what anyone earns.
 */

// ─── Salary packages ────────────────────────────────────────────────────────

/** Live list of salary packages, cheapest first. Returns an unsubscribe function. */
export function watchSalaryPackages(cb: (packages: SalaryPackage[]) => void): () => void {
  return onSnapshot(
    query(collection(db, "salary_packages"), orderBy("monthlyAmount", "asc")),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as SalaryPackage))),
    error => {
      console.error("Salary package listener failed:", error);
      cb([]);
    },
  );
}

export async function createSalaryPackage(
  input: { name: string; monthlyAmount: number; department?: string },
  actor: { uid: string; name?: string },
): Promise<string> {
  const ref = await addDoc(collection(db, "salary_packages"), {
    name: input.name.trim(),
    monthlyAmount: Math.max(0, Math.round(input.monthlyAmount)),
    ...(input.department ? { department: input.department } : {}),
    isActive: true,
    createdBy: actor.uid,
    createdAt: serverTimestamp(),
  });

  await recordAudit({
    action: "salary_package_created",
    actor,
    target: { id: ref.id, name: input.name },
    summary: `Created salary package "${input.name}" at ₹${input.monthlyAmount.toLocaleString("en-IN")}/month`,
    after: input,
  });

  return ref.id;
}

export async function updateSalaryPackage(
  id: string,
  patch: Partial<Pick<SalaryPackage, "name" | "monthlyAmount" | "department" | "isActive">>,
  actor: { uid: string; name?: string },
  previous?: SalaryPackage,
): Promise<void> {
  await updateDoc(doc(db, "salary_packages", id), { ...patch, updatedAt: serverTimestamp() });

  await recordAudit({
    action: "salary_package_updated",
    actor,
    target: { id, name: patch.name || previous?.name },
    summary: `Updated salary package "${patch.name || previous?.name || id}"`,
    before: previous,
    after: patch,
  });
}

/**
 * Put an employee on a package. Writes the package id and mirrors the amount onto `users.salary`
 * so every existing screen that reads `user.salary` keeps working unchanged.
 */
export async function assignSalaryPackage(
  member: Pick<AppUser, "uid" | "name" | "salary">,
  pkg: SalaryPackage,
  actor: { uid: string; name?: string },
): Promise<void> {
  await updateDoc(doc(db, "users", member.uid), {
    salaryPackageId: pkg.id,
    salary: pkg.monthlyAmount,
    updatedAt: serverTimestamp(),
  });

  await recordAudit({
    action: "salary_package_assigned",
    actor,
    target: { id: member.uid, name: member.name },
    summary: `Assigned ${member.name} to "${pkg.name}" (₹${pkg.monthlyAmount.toLocaleString("en-IN")}/month)`,
    before: { salary: member.salary },
    after: { salary: pkg.monthlyAmount, packageId: pkg.id },
  });
}

export async function deleteSalaryPackage(id: string): Promise<void> {
  await deleteDoc(doc(db, "salary_packages", id));
}

// ─── Company policy ─────────────────────────────────────────────────────────

const CONFIG_DOC = doc(db, "payroll_config", "default");

/** Live company payroll policy, falling back to the documented defaults when unset. */
export function watchPayrollConfig(cb: (config: PayrollConfig) => void): () => void {
  return onSnapshot(
    CONFIG_DOC,
    snap => cb(snap.exists() ? { ...DEFAULT_PAYROLL_CONFIG, ...snap.data() } as PayrollConfig : DEFAULT_PAYROLL_CONFIG),
    error => {
      console.error("Payroll config listener failed:", error);
      cb(DEFAULT_PAYROLL_CONFIG);
    },
  );
}

export async function fetchPayrollConfig(): Promise<PayrollConfig> {
  try {
    const snap = await getDoc(CONFIG_DOC);
    return snap.exists() ? { ...DEFAULT_PAYROLL_CONFIG, ...snap.data() } as PayrollConfig : DEFAULT_PAYROLL_CONFIG;
  } catch {
    return DEFAULT_PAYROLL_CONFIG;
  }
}

export async function updatePayrollConfig(
  patch: Partial<PayrollConfig>,
  actor: { uid: string; name?: string },
  previous?: PayrollConfig,
): Promise<void> {
  await setDoc(
    CONFIG_DOC,
    { ...patch, updatedBy: actor.uid, updatedAt: serverTimestamp() },
    { merge: true },
  );

  await recordAudit({
    action: "config_updated",
    actor,
    summary: `Updated payroll policy: ${Object.keys(patch).join(", ")}`,
    before: previous,
    after: patch,
  });
}

// ─── Employee payout details ────────────────────────────────────────────────

/**
 * Fold a stored record into the current multi-account shape.
 *
 * Records written before multi-account support carried a single method at the top level. Rather
 * than run a migration, those are converted on read into a one-entry `accounts` array — so old
 * and new records behave identically everywhere downstream.
 */
export function normalizeBank(uid: string, data: Partial<EmployeeBank> | undefined): EmployeeBank | null {
  if (!data) return null;

  if (Array.isArray(data.accounts) && data.accounts.length > 0) {
    // Guarantee exactly one primary even if a bad write left none, or several.
    const accounts = data.accounts.map(a => ({ ...a, isPrimary: false }));
    const primaryIndex = data.accounts.findIndex(a => a.isPrimary);
    accounts[primaryIndex >= 0 ? primaryIndex : 0].isPrimary = true;
    return { uid, accounts, updatedAt: data.updatedAt };
  }

  if (!data.method || !data.accountHolderName) return null;

  return {
    uid,
    updatedAt: data.updatedAt,
    accounts: [{
      id: "legacy",
      method: data.method,
      accountHolderName: data.accountHolderName,
      ...(data.upiId ? { upiId: data.upiId } : {}),
      ...(data.phoneNumber ? { phoneNumber: data.phoneNumber } : {}),
      ...(data.bankName ? { bankName: data.bankName } : {}),
      ...(data.accountNumber ? { accountNumber: data.accountNumber } : {}),
      ...(data.ifsc ? { ifsc: data.ifsc } : {}),
      isPrimary: true,
      verified: !!data.verified,
    }],
  };
}

/** The account payroll pays into. */
export function primaryAccount(bank: EmployeeBank | null): PayoutAccount | null {
  if (!bank?.accounts?.length) return null;
  return bank.accounts.find(a => a.isPrimary) ?? bank.accounts[0];
}

/** Live payout details for one employee. `null` means none set up yet. */
export function watchEmployeeBank(uid: string, cb: (bank: EmployeeBank | null) => void): () => void {
  return onSnapshot(
    doc(db, "employee_bank", uid),
    snap => cb(snap.exists() ? normalizeBank(uid, snap.data() as Partial<EmployeeBank>) : null),
    error => {
      console.error("Employee bank listener failed:", error);
      cb(null);
    },
  );
}

/** Live payout details for everyone, keyed by uid — for the admin payroll table. */
export function watchAllEmployeeBanks(cb: (byUid: Map<string, EmployeeBank>) => void): () => void {
  return onSnapshot(
    collection(db, "employee_bank"),
    snap => {
      const map = new Map<string, EmployeeBank>();
      snap.docs.forEach(d => {
        const bank = normalizeBank(d.id, d.data() as Partial<EmployeeBank>);
        if (bank) map.set(d.id, bank);
      });
      cb(map);
    },
    error => {
      console.error("Employee bank listener failed:", error);
      cb(new Map());
    },
  );
}

/** Required fields still missing on an account. Empty array = usable. */
export function missingBankFields(account: Partial<PayoutAccount> | null): string[] {
  if (!account?.method) return ["method"];
  return REQUIRED_BANK_FIELDS[account.method].filter(field => {
    const value = account[field];
    return typeof value !== "string" || value.trim() === "";
  });
}

export function isAccountComplete(account: Partial<PayoutAccount> | null): boolean {
  return !!account && missingBankFields(account).length === 0;
}

/** True when the employee has at least one account we could actually pay into. */
export function isBankComplete(bank: EmployeeBank | null): boolean {
  return !!bank?.accounts?.some(isAccountComplete);
}

/** Persist the full account list. Firestore rejects `undefined`, so blanks are stripped. */
async function writeAccounts(
  uid: string,
  accounts: PayoutAccount[],
  actor: { uid: string; name?: string },
  summary: string,
): Promise<void> {
  const cleaned = accounts.map(a =>
    Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined && v !== "")),
  ) as unknown as PayoutAccount[];

  await setDoc(
    doc(db, "employee_bank", uid),
    { accounts: cleaned, updatedAt: serverTimestamp() },
    { merge: true },
  );

  await recordAudit({
    action: "bank_details_updated",
    actor,
    target: { id: uid },
    summary,
    after: { accountCount: cleaned.length },
  });
}

/**
 * Add or replace one payout account.
 *
 * Saving always drops `verified` back to false for that account: any change to where money goes
 * must be re-checked by an admin before the next transfer.
 */
export async function savePayoutAccount(
  uid: string,
  bank: EmployeeBank | null,
  account: Omit<PayoutAccount, "verified" | "verifiedBy" | "verifiedAt">,
  actor: { uid: string; name?: string },
): Promise<void> {
  const existing = bank?.accounts ?? [];
  const next: PayoutAccount = { ...account, verified: false };

  const index = existing.findIndex(a => a.id === account.id);
  const accounts = index >= 0
    ? existing.map((a, i) => (i === index ? next : a))
    : [...existing, next];

  // The first account added is automatically primary; otherwise honour the flag being set.
  if (accounts.length === 1 || next.isPrimary) {
    accounts.forEach(a => { a.isPrimary = a.id === next.id; });
  }

  await writeAccounts(uid, accounts, actor,
    `${index >= 0 ? "Updated" : "Added"} a ${account.method} payout account`);
}

export async function removePayoutAccount(
  uid: string,
  bank: EmployeeBank,
  accountId: string,
  actor: { uid: string; name?: string },
): Promise<void> {
  const accounts = bank.accounts.filter(a => a.id !== accountId);
  // Removing the primary promotes the next account so payroll always has a target.
  if (accounts.length > 0 && !accounts.some(a => a.isPrimary)) accounts[0].isPrimary = true;

  await writeAccounts(uid, accounts, actor, "Removed a payout account");
}

export async function setPrimaryPayoutAccount(
  uid: string,
  bank: EmployeeBank,
  accountId: string,
  actor: { uid: string; name?: string },
): Promise<void> {
  const accounts = bank.accounts.map(a => ({ ...a, isPrimary: a.id === accountId }));
  await writeAccounts(uid, accounts, actor, "Changed the primary payout account");
}

/** Admin confirms an account is correct, locking the employee out of silent edits. */
export async function verifyEmployeeBank(
  uid: string,
  memberName: string,
  actor: { uid: string; name?: string },
  bank?: EmployeeBank | null,
  accountId?: string,
): Promise<void> {
  if (!bank?.accounts?.length) return;
  const targetId = accountId ?? primaryAccount(bank)?.id;

  const accounts = bank.accounts.map(a =>
    a.id === targetId ? { ...a, verified: true, verifiedBy: actor.uid } : a,
  );

  await setDoc(
    doc(db, "employee_bank", uid),
    { accounts, updatedAt: serverTimestamp() },
    { merge: true },
  );

  await recordAudit({
    action: "bank_details_verified",
    actor,
    target: { id: uid, name: memberName },
    summary: `Verified payout details for ${memberName}`,
    after: { verified: true, accountId: targetId },
  });
}

/** Admin re-opens a verified account so the employee can correct it. */
export async function unverifyPayoutAccount(
  uid: string,
  bank: EmployeeBank,
  accountId: string,
  actor: { uid: string; name?: string },
): Promise<void> {
  const accounts = bank.accounts.map(a => (a.id === accountId ? { ...a, verified: false } : a));
  await writeAccounts(uid, accounts, actor, "Unlocked a payout account for editing");
}

/** Display label for one account, e.g. `UPI · ravi@okaxis` or `HDFC · ••••4321`. */
export function accountSummary(account: PayoutAccount | null): string {
  if (!account) return "Not set up";
  switch (account.method) {
    case "bank_transfer":
      return `${account.bankName || "Bank"} · ••••${(account.accountNumber || "").slice(-4)}`;
    case "upi":
      return `UPI · ${account.upiId || "—"}`;
    default:
      return `${PAYOUT_METHOD_LABELS[account.method]} · ${account.phoneNumber || "—"}`;
  }
}

/** Display label for whichever account payroll would use. */
export function payoutSummary(bank: EmployeeBank | null): string {
  return accountSummary(primaryAccount(bank));
}

/** Payout methods in the order they are offered. */
export const PAYOUT_METHODS: PayoutMethod[] = ["upi", "phonepe", "google_pay", "paytm", "bank_transfer"];

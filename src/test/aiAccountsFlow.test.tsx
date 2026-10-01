import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * AI Accounts (2026-10-01) end to end against an in-memory Firestore: the service's writes (an account
 * and its password together, the credit ledger and the account's running total together, assignments
 * that say who moved what) and the credit step every video job now passes through before it is marked
 * complete (useCreditGate → CreditUsageDialog).
 */

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {} }));
const sendNotification = vi.fn(async (_p: Record<string, unknown>) => undefined);
vi.mock("@/services/notifications", () => ({ sendNotification }));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const mem = await import("./memoryFirestore");
const svc = await import("@/services/aiAccounts");
const { useCreditGate } = await import("@/components/ai-accounts/useCreditGate");
const { useAuthStore } = await import("@/store/authStore");
const { DEFAULT_FLOW_SETTINGS } = await import("@/utils/flowCredits");
import type { FlowAccount, FlowUsageEntry, PaidAccount } from "@/types/aiAccounts";
import type { AppUser, WorkAssignment } from "@/types";

configure({ testIdAttribute: "data-test" });

const S = DEFAULT_FLOW_SETTINGS;
const admin = { uid: "admin", name: "Kiran (CTO)", role: "tech_admin", createdBy: "main" } as const;
const leader = { uid: "lead", name: "Sravani", role: "tech_team_leader", createdBy: "admin" } as const;
const ravi = { uid: "ravi", name: "Ravi", role: "tech_member", createdBy: "admin" } as const;
const anil = { uid: "anil", name: "Anil", role: "tech_member", createdBy: "admin" } as const;

const account = (id: string) => mem.__read(`flow_accounts/${id}`) as unknown as FlowAccount;
const ledger = () => mem.__all("flow_usage") as unknown as FlowUsageEntry[];
const addFor = (who: typeof ravi | typeof anil, email: string, createdOn = "2026-10-01") =>
  svc.addFlowAccount({ email, password: `pw-${email}`, phone: "9876543210", createdOn }, who, S);

beforeEach(() => {
  // Only the clock's date is fixed; timers stay real so listeners and waitFor run normally.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-10T11:00:00"));
  mem.__reset();
  sendNotification.mockClear();
  toast.mockClear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Flow accounts — the service", () => {
  it("adds an account with its password kept apart, its expiry worked out, and refuses the same email twice", async () => {
    await addFor(ravi, "Ravi.Flow01@Gmail.com");
    const a = account("ravi.flow01@gmail.com");
    expect(a).toMatchObject({
      email: "ravi.flow01@gmail.com", createdOn: "2026-10-01", expiresOn: "2028-04-01", monthlyCredits: 1000,
      ownerId: "ravi", holderId: "ravi", addedBy: "ravi", visibleTo: ["ravi"], teamAdminId: "admin", status: "active",
    });
    expect(JSON.stringify(a)).not.toContain("pw-");
    expect(mem.__read("flow_account_secrets/ravi.flow01@gmail.com")).toMatchObject({ password: "pw-Ravi.Flow01@Gmail.com" });

    await expect(addFor(anil, "ravi.flow01@gmail.com")).rejects.toThrow("already in the list — added by Ravi");
    expect(mem.__all("flow_accounts")).toHaveLength(1);
  });

  it("lets a manager add a backup for a member — owned and held by the member, saying who added it", async () => {
    await svc.addFlowAccount({ email: "backup1@gmail.com", password: "x", phone: "9876543210", createdOn: "2026-10-05", owner: { uid: "ravi", name: "Ravi" } }, leader, S);
    const a = account("backup1@gmail.com");
    expect(a).toMatchObject({ ownerId: "ravi", holderId: "ravi", addedBy: "lead", addedByName: "Sravani", teamAdminId: "admin" });
    expect([...a.visibleTo].sort()).toEqual(["lead", "ravi"]);
    expect(a.history?.[0]).toMatchObject({ action: "added", byName: "Sravani", toName: "Ravi" });
  });

  it("charges an ad to the accounts it ran on — one ledger entry each — and adds it to their cycle totals", async () => {
    await addFor(ravi, "a@gmail.com");
    await addFor(ravi, "b@gmail.com", "2026-09-20");
    const job = { id: "w1", uniqueId: "P42", businessName: "Sri Sai Motors" };
    const total = await svc.recordFlowUsage([
      { account: account("a@gmail.com"), rows: [{ seconds: 8, count: 3 }] },
      { account: account("b@gmail.com"), rows: [{ seconds: 8, count: 1 }, { seconds: 10, count: 2 }, { seconds: 6, count: 0 }] },
    ], ravi, S, { assignment: job }, "2026-10-10");
    expect(total).toBe(36 + 12 + 30);
    expect(account("a@gmail.com").usedByCycle).toEqual({ "2026-10-01": 36 });
    // b was made on the 20th — its cycle runs 20 Sep → 19 Oct.
    expect(account("b@gmail.com").usedByCycle).toEqual({ "2026-09-20": 42 });
    expect(account("b@gmail.com").lastUsedByName).toBe("Ravi");
    const entries = ledger();
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.accountId === "b@gmail.com")).toMatchObject({
      credits: 42, rows: [{ seconds: 8, count: 1 }, { seconds: 10, count: 2 }], assignmentId: "w1", uniqueId: "P42",
      businessName: "Sri Sai Motors", userId: "ravi", teamAdminId: "admin", month: "2026-10", date: "2026-10-10", source: "completion",
    });

    await svc.recordFlowUsage([{ account: account("a@gmail.com"), rows: [{ seconds: 4, count: 2 }] }], ravi, S, {}, "2026-10-10");
    expect(account("a@gmail.com").usedByCycle).toEqual({ "2026-10-01": 50 });
    expect(await svc.usageForAssignment("ravi", "w1")).toHaveLength(2);
    expect(await svc.usageForAssignment("anil", "w1")).toHaveLength(0);
  });

  it("moves an entry's credits when it is corrected, and gives them back when it is deleted", async () => {
    await addFor(ravi, "a@gmail.com");
    await addFor(ravi, "b@gmail.com");
    await svc.recordFlowUsage([{ account: account("a@gmail.com"), rows: [{ seconds: 8, count: 4 }] }], ravi, S, {}, "2026-10-10");
    const [entry] = ledger();

    await svc.editFlowUsage(entry, { account: account("b@gmail.com"), rows: [{ seconds: 8, count: 3 }] }, leader, S);
    expect(account("a@gmail.com").usedByCycle).toEqual({ "2026-10-01": 0 });
    expect(account("b@gmail.com").usedByCycle).toEqual({ "2026-10-01": 36 });
    const edited = ledger()[0];
    expect(edited).toMatchObject({ accountId: "b@gmail.com", credits: 36, editedByName: "Sravani" });

    await svc.deleteFlowUsage(edited);
    expect(account("b@gmail.com").usedByCycle).toEqual({ "2026-10-01": 0 });
    expect(ledger()).toHaveLength(0);
  });

  it("assigns an account to someone else: they see it, it stays in the owner's count, both are told", async () => {
    await addFor(ravi, "a@gmail.com");
    await svc.assignFlowAccount(account("a@gmail.com"), { uid: "anil", name: "Anil", role: "tech_member" }, admin);
    const a = account("a@gmail.com");
    expect(a).toMatchObject({ ownerId: "ravi", holderId: "anil", holderName: "Anil" });
    expect([...a.visibleTo].sort()).toEqual(["anil", "ravi"]);
    expect(a.history?.map((e) => e.action)).toEqual(["added", "assigned"]);
    expect(a.history?.[1]).toMatchObject({ byName: "Kiran (CTO)", fromName: "Ravi", toName: "Anil" });
    expect(sendNotification.mock.calls.map((c) => c[0].userId).sort()).toEqual(["anil", "ravi"]);
    expect(sendNotification.mock.calls.find((c) => c[0].userId === "anil")?.[0]).toMatchObject({ link: "/tech/ai-accounts", type: "ai_account" });
  });

  it("moves the expiry with a corrected creation date — until credits are recorded on the account", async () => {
    await addFor(ravi, "a@gmail.com", "2026-10-01");
    await svc.updateFlowAccount(account("a@gmail.com"), { createdOn: "2026-10-03" }, ravi, S);
    expect(account("a@gmail.com")).toMatchObject({ createdOn: "2026-10-03", expiresOn: "2028-04-03" });

    await svc.recordFlowUsage([{ account: account("a@gmail.com"), rows: [{ seconds: 8, count: 1 }] }], ravi, S, {}, "2026-10-10");
    await expect(svc.updateFlowAccount(account("a@gmail.com"), { createdOn: "2026-10-01" }, ravi, S)).rejects.toThrow("creation date can't change");
    expect(account("a@gmail.com").createdOn).toBe("2026-10-03");
  });

  it("keeps history someone else wrote while a dialog had an older copy of the account open", async () => {
    await addFor(ravi, "a@gmail.com");
    const stale = account("a@gmail.com");
    await svc.assignFlowAccount(account("a@gmail.com"), { uid: "anil", name: "Anil" }, admin);
    await svc.updateFlowAccount(stale, { notes: "cousin's Jio number" }, ravi, S);
    expect(account("a@gmail.com").history?.map((e) => e.action)).toEqual(["added", "assigned", "edited"]);
  });

  it("keeps paid logins' passwords apart and tells only the people newly given one", async () => {
    const id = await svc.addPaidAccount({ provider: "chatgpt", label: "ChatGPT Plus #1", email: "dts.gpt1@gmail.com", password: "secret-1", plan: "Plus" }, admin);
    expect(JSON.stringify(mem.__read(`paid_accounts/${id}`))).not.toContain("secret-1");
    expect(await svc.getAccountSecret("paid", id)).toBe("secret-1");

    const paid = () => ({ ...(mem.__read(`paid_accounts/${id}`) as object), id }) as PaidAccount;
    await svc.assignPaidAccount(paid(), [{ uid: "ravi", name: "Ravi" }, { uid: "anil", name: "Anil" }], admin);
    expect(paid()).toMatchObject({ assignedTo: ["ravi", "anil"], assignedNames: { ravi: "Ravi", anil: "Anil" } });
    expect(sendNotification).toHaveBeenCalledTimes(2);

    sendNotification.mockClear();
    await svc.assignPaidAccount(paid(), [{ uid: "anil", name: "Anil" }], admin);
    expect(paid().assignedTo).toEqual(["anil"]);
    expect(sendNotification).not.toHaveBeenCalled();
    const events = paid().history?.length || 0;
    await svc.assignPaidAccount(paid(), [{ uid: "anil", name: "Anil" }], admin);
    expect(paid().history?.length).toBe(events);
  });
});

// ── The credit step before "Mark complete" ────────────────────────────────────────────────────────

const job = (over: Partial<WorkAssignment> = {}) => ({
  id: "w1", assignedTo: "ravi", category: "promotional", clipCount: 4, duration: "32s", uniqueId: "P42",
  businessName: "Sri Sai Motors", status: "in_progress", ...over,
}) as WorkAssignment;

/** What My Work does: the studio's Mark Complete asks the gate, which asks for the credits. */
function Studio({ assignment, onSubmitted }: { assignment: WorkAssignment; onSubmitted: () => void }) {
  const gate = useCreditGate();
  return (
    <>
      <button data-test="mark-complete" onClick={() => gate.request(assignment, async () => onSubmitted())}>Mark complete</button>
      {gate.dialog}
    </>
  );
}

/** The signed-in member, kept live from users/{uid} the way useAuth does. */
function signIn(user: AppUser) {
  mem.__seed(`users/${user.uid}`, user as unknown as Record<string, unknown>);
  return mem.onSnapshot(mem.doc({}, "users", user.uid), ((snap: { data: () => AppUser }) =>
    useAuthStore.setState({ user: { ...snap.data(), uid: user.uid }, loading: false })) as never);
}

describe("Mark complete asks for the Flow credits first", () => {
  it("starts on the account in use with the job's clips at 8 seconds, records them, then hands the job in", async () => {
    await addFor(ravi, "a@gmail.com");
    await addFor(ravi, "b@gmail.com");
    const stop = signIn({ ...ravi, activeFlowAccountId: "b@gmail.com" } as unknown as AppUser);
    const submitted = vi.fn();
    render(<Studio assignment={job()} onSubmitted={submitted} />);

    fireEvent.click(screen.getByTestId("mark-complete"));
    await screen.findByTestId("credit-usage-dialog");
    await waitFor(() => expect((screen.getByTestId("credit-account") as HTMLSelectElement).value).toBe("b@gmail.com"));
    expect((screen.getByTestId("credit-count") as HTMLInputElement).value).toBe("4");
    expect((screen.getByTestId("credit-seconds") as HTMLSelectElement).value).toBe("8");
    expect(screen.getByTestId("credit-total").textContent).toMatch(/48\s*credits · 4 clips/);
    expect(submitted).not.toHaveBeenCalled();

    // Two of the four were 10-second takes.
    fireEvent.change(screen.getByTestId("credit-count"), { target: { value: "2" } });
    fireEvent.click(screen.getByText("Clips of another length"));
    const counts = screen.getAllByTestId("credit-count");
    const lengths = screen.getAllByTestId("credit-seconds");
    fireEvent.change(lengths[1], { target: { value: "10" } });
    fireEvent.change(counts[1], { target: { value: "2" } });
    expect(screen.getByTestId("credit-total").textContent).toMatch(/54\s*credits/);

    fireEvent.click(screen.getByTestId("credit-save"));
    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("credit-usage-dialog")).not.toBeInTheDocument();
    expect(ledger()).toEqual([expect.objectContaining({ accountId: "b@gmail.com", credits: 54, assignmentId: "w1", source: "completion" })]);
    expect(account("b@gmail.com").usedByCycle).toEqual({ "2026-10-01": 54 });
    stop();
  });

  it("warns when the account would go over, and puts the rest on the next account in the same entry", async () => {
    await addFor(ravi, "a@gmail.com");
    await addFor(ravi, "b@gmail.com");
    await svc.recordFlowUsage([{ account: account("a@gmail.com"), rows: [{ seconds: 8, count: 82 }] }], ravi, S, {}, "2026-10-10");
    const stop = signIn({ ...ravi, activeFlowAccountId: "a@gmail.com" } as unknown as AppUser);
    const submitted = vi.fn();
    render(<Studio assignment={job()} onSubmitted={submitted} />);

    fireEvent.click(screen.getByTestId("mark-complete"));
    await screen.findByTestId("credit-usage-dialog");
    await waitFor(() => expect((screen.getByTestId("credit-account") as HTMLSelectElement).value).toBe("a@gmail.com"));
    // 1000 − 984 = 16 left; four clips need 48.
    expect(screen.getByTestId("credit-over").textContent).toContain("32 more than it has left");

    fireEvent.change(screen.getByTestId("credit-count"), { target: { value: "1" } });
    expect(screen.queryByTestId("credit-over")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("credit-add-account"));
    const accounts = screen.getAllByTestId("credit-account") as HTMLSelectElement[];
    expect(accounts[1].value).toBe("b@gmail.com");
    fireEvent.change(screen.getAllByTestId("credit-count")[1], { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("credit-save"));

    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));
    expect(account("a@gmail.com").usedByCycle).toEqual({ "2026-10-01": 984 + 12 });
    expect(account("b@gmail.com").usedByCycle).toEqual({ "2026-10-01": 36 });
    // The account the member finished on is the one they are using now.
    await waitFor(() => expect(useAuthStore.getState().user?.activeFlowAccountId).toBe("b@gmail.com"));
    stop();
  });

  it("refuses to save without an account or a clip, and lets a job that used no Flow credits through", async () => {
    const stop = signIn(ravi as unknown as AppUser);
    const submitted = vi.fn();
    render(<Studio assignment={job()} onSubmitted={submitted} />);
    fireEvent.click(screen.getByTestId("mark-complete"));
    await screen.findByTestId("credit-no-accounts");

    fireEvent.click(screen.getByTestId("credit-save"));
    expect(screen.getByTestId("credit-error").textContent).toContain("Choose the Flow account");
    expect(submitted).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("credit-none"));
    fireEvent.click(screen.getByTestId("credit-save"));
    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));
    expect(ledger()).toHaveLength(0);
    stop();
  });

  it("lets a poster job straight through — posters are not made in Flow", async () => {
    const stop = signIn(ravi as unknown as AppUser);
    const submitted = vi.fn();
    render(<Studio assignment={job({ category: "poster" })} onSubmitted={submitted} />);
    fireEvent.click(screen.getByTestId("mark-complete"));
    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("credit-usage-dialog")).not.toBeInTheDocument();
    stop();
  });

  it("says what a job handed in again already used, and starts at 0 clips instead of charging the ad twice", async () => {
    await addFor(ravi, "a@gmail.com");
    await svc.recordFlowUsage([{ account: account("a@gmail.com"), rows: [{ seconds: 8, count: 4 }] }], ravi, S, { assignment: { id: "w1" } }, "2026-10-08");
    const stop = signIn({ ...ravi, activeFlowAccountId: "a@gmail.com" } as unknown as AppUser);
    const submitted = vi.fn();
    render(<Studio assignment={job({ status: "editing" })} onSubmitted={submitted} />);

    fireEvent.click(screen.getByTestId("mark-complete"));
    const note = await screen.findByTestId("credit-prior");
    expect(note.textContent).toContain("48 credits");
    expect(note.textContent).toContain("4 × 8s on 2026-10-08");
    await waitFor(() => expect((screen.getByTestId("credit-count") as HTMLInputElement).value).toBe("0"));

    fireEvent.click(screen.getByTestId("credit-save"));
    expect(screen.getByTestId("credit-error").textContent).toContain("Enter how many clips");

    // The re-do made two new clips.
    fireEvent.change(screen.getByTestId("credit-count"), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("credit-save"));
    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));
    expect(account("a@gmail.com").usedByCycle).toEqual({ "2026-10-01": 48 + 24 });
    stop();
  });
});

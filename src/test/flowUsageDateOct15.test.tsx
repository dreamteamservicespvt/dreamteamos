import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Flow credits and the day the clips were made (bug audit, 2026-10-15), on the in-memory Firestore
 * with the REAL service and the real credit dialog.
 *
 *  • An entry was dated — and its cycle chosen — by the day Save was pressed: clips made on the 11th,
 *    handed in on the 12th, on an account whose cycles run 12th → 11th, landed in the NEW cycle.
 *  • Moving an entry to another account accepted a day before that account was opened.
 *  • Changing an account's creation day checked "credits recorded?" on the Edit dialog's old copy.
 *  • Editing an old entry showed today's cycle's figures.
 */

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification: vi.fn(async () => undefined) }));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const mem = await import("./memoryFirestore");
const svc = await import("@/services/aiAccounts");
const { default: CreditUsageDialog } = await import("@/components/ai-accounts/CreditUsageDialog");
const fc = await import("@/utils/flowCredits");
import type { FlowAccount, FlowUsageEntry } from "@/types/aiAccounts";

configure({ testIdAttribute: "data-test" });

const S = fc.DEFAULT_FLOW_SETTINGS;
const ravi = { uid: "ravi", name: "Ravi", role: "tech_member", createdBy: "admin" } as const;
const leader = { uid: "lead", name: "Sravani", role: "tech_team_leader", createdBy: "admin" } as const;
const account = (id: string) => ({ ...(mem.__read(`flow_accounts/${id}`) as unknown as FlowAccount), id });
const ledger = () => mem.__all("flow_usage") as unknown as FlowUsageEntry[];
const addFor = (email: string, createdOn: string) =>
  svc.addFlowAccount({ email, password: "pw", phone: "9876543210", createdOn }, ravi, S);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T10:00:00"));
  mem.__reset();
  toast.mockClear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("the pure rules", () => {
  it("refuses a day still to come or before the account was opened", () => {
    expect(fc.usageDateProblem("2026-10-11", "2026-10-12")).toBe("");
    expect(fc.usageDateProblem("2026-10-13", "2026-10-12")).toMatch(/still to come/);
    expect(fc.usageDateProblem("", "2026-10-12")).toMatch(/Pick the day/);
    expect(fc.usageDateProblem("2026-09-30", "2026-10-12", { createdOn: "2026-10-01", email: "a@gmail.com" }))
      .toMatch(/a@gmail.com was opened on 2026-10-01/);
  });

  it("gives the figures of the cycle a day falls in", () => {
    const a = { createdOn: "2026-09-12", monthlyCredits: 1000, usedByCycle: { "2026-09-12": 700, "2026-10-12": 50 } };
    expect(fc.cycleFiguresOn(a, "2026-10-11")).toEqual({ cycleStart: "2026-09-12", cycleEnd: "2026-10-11", monthly: 1000, used: 700, remaining: 300 });
    expect(fc.cycleFiguresOn(a, "2026-10-12")).toMatchObject({ cycleStart: "2026-10-12", cycleEnd: "2026-11-11", used: 50 });
    expect(fc.addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(fc.shortDay("2026-10-12")).toBe("12 Oct");
  });
});

describe("recordFlowUsage — the day the clips were made", () => {
  it("dates the entry and picks the cycle by that day, not by the day it was saved", async () => {
    await addFor("a@gmail.com", "2026-09-12");
    await svc.recordFlowUsage([{ account: account("a@gmail.com"), rows: [{ seconds: 8, count: 2 }] }], ravi, S,
      { madeOn: "2026-10-11" }, "2026-10-12");
    expect(account("a@gmail.com").usedByCycle).toEqual({ "2026-09-12": 24 });
    expect(ledger()[0]).toMatchObject({ date: "2026-10-11", month: "2026-10", cycleStart: "2026-09-12" });
    // Without a day it is today, as before.
    await svc.recordFlowUsage([{ account: account("a@gmail.com"), rows: [{ seconds: 8, count: 1 }] }], ravi, S, {}, "2026-10-12");
    expect(account("a@gmail.com").usedByCycle).toEqual({ "2026-09-12": 24, "2026-10-12": 12 });
  });

  it("refuses a day still to come, or before the account was opened — and writes nothing", async () => {
    await addFor("a@gmail.com", "2026-10-05");
    const charge = (madeOn: string) =>
      svc.recordFlowUsage([{ account: account("a@gmail.com"), rows: [{ seconds: 8, count: 1 }] }], ravi, S, { madeOn }, "2026-10-12");
    await expect(charge("2026-10-13")).rejects.toThrow(/still to come/);
    await expect(charge("2026-10-04")).rejects.toThrow(/opened on 2026-10-05/);
    expect(ledger()).toHaveLength(0);
    expect(account("a@gmail.com").usedByCycle).toEqual({});
  });

  it("works the cycle out from the creation day AS STORED, not from an older copy", async () => {
    await addFor("a@gmail.com", "2026-10-01");
    const stale = account("a@gmail.com");
    await svc.updateFlowAccount(stale, { createdOn: "2026-10-03" }, ravi, S);
    await svc.recordFlowUsage([{ account: stale, rows: [{ seconds: 8, count: 1 }] }], ravi, S, {}, "2026-10-12");
    expect(account("a@gmail.com").usedByCycle).toEqual({ "2026-10-03": 12 });
    expect(ledger()[0].cycleStart).toBe("2026-10-03");
  });
});

describe("editFlowUsage — moving an entry", () => {
  it("puts it in the new account's cycle for the entry's own day", async () => {
    await addFor("a@gmail.com", "2026-09-12");
    await addFor("b@gmail.com", "2026-09-20");
    await svc.recordFlowUsage([{ account: account("a@gmail.com"), rows: [{ seconds: 8, count: 2 }] }], ravi, S, { madeOn: "2026-10-11" }, "2026-10-12");
    await svc.editFlowUsage(ledger()[0], { account: account("b@gmail.com"), rows: [{ seconds: 8, count: 2 }] }, leader, S, "2026-10-12");
    expect(account("a@gmail.com").usedByCycle).toEqual({ "2026-09-12": 0 });
    expect(account("b@gmail.com").usedByCycle).toEqual({ "2026-09-20": 24 });
    expect(ledger()[0]).toMatchObject({ accountId: "b@gmail.com", date: "2026-10-11", cycleStart: "2026-09-20" });
  });

  it("refuses an account opened after the clips were made", async () => {
    await addFor("a@gmail.com", "2026-09-12");
    await addFor("new@gmail.com", "2026-10-12");
    await svc.recordFlowUsage([{ account: account("a@gmail.com"), rows: [{ seconds: 8, count: 2 }] }], ravi, S, { madeOn: "2026-10-11" }, "2026-10-12");
    await expect(svc.editFlowUsage(ledger()[0], { account: account("new@gmail.com"), rows: [{ seconds: 8, count: 2 }] }, leader, S, "2026-10-12"))
      .rejects.toThrow(/new@gmail.com was opened on 2026-10-12/);
    expect(account("a@gmail.com").usedByCycle).toEqual({ "2026-09-12": 24 });
    expect(ledger()[0].accountId).toBe("a@gmail.com");
  });

  it("corrects the day — the credits move to the cycle of the new day", async () => {
    await addFor("a@gmail.com", "2026-09-12");
    // Recorded the old way: saved on the 12th although the clips were made on the 11th.
    await svc.recordFlowUsage([{ account: account("a@gmail.com"), rows: [{ seconds: 8, count: 2 }] }], ravi, S, {}, "2026-10-12");
    expect(account("a@gmail.com").usedByCycle).toEqual({ "2026-10-12": 24 });
    await svc.editFlowUsage(ledger()[0], { account: account("a@gmail.com"), rows: [{ seconds: 8, count: 2 }], date: "2026-10-11" }, ravi, S, "2026-10-12");
    expect(account("a@gmail.com").usedByCycle).toEqual({ "2026-10-12": 0, "2026-09-12": 24 });
    expect(ledger()[0]).toMatchObject({ date: "2026-10-11", month: "2026-10", cycleStart: "2026-09-12" });
  });
});

describe("updateFlowAccount — the creation day, checked as stored", () => {
  it("refuses a new creation day once credits were recorded, even from a copy taken before them", async () => {
    await addFor("a@gmail.com", "2026-10-01");
    const openedEditWith = account("a@gmail.com"); // no credits yet on this copy
    await svc.recordFlowUsage([{ account: account("a@gmail.com"), rows: [{ seconds: 8, count: 1 }] }], ravi, S, {}, "2026-10-12");
    await expect(svc.updateFlowAccount(openedEditWith, { createdOn: "2026-10-03" }, ravi, S)).rejects.toThrow("creation date can't change");
    expect(account("a@gmail.com")).toMatchObject({ createdOn: "2026-10-01", usedByCycle: { "2026-10-01": 12 } });
    // Other fields still save.
    await svc.updateFlowAccount(openedEditWith, { notes: "cousin's number" }, ravi, S);
    expect(account("a@gmail.com").notes).toBe("cousin's number");
  });
});

describe("the credit dialog", () => {
  it("asks for the day the clips were made and records them on it", async () => {
    await addFor("a@gmail.com", "2026-09-12");
    const done = vi.fn();
    render(<CreditUsageDialog open onClose={() => undefined} actor={ravi} settings={S} accounts={[account("a@gmail.com")]}
      activeId="a@gmail.com" mode="manual" onDone={done} />);
    const day = screen.getByTestId("credit-made-on") as HTMLInputElement;
    expect(day.value).toBe("2026-10-12");
    expect(day.max).toBe("2026-10-12");
    expect(screen.getByTestId("credit-cycle").textContent).toContain("this cycle (12 Oct – 11 Nov)");

    fireEvent.change(day, { target: { value: "2026-10-11" } });
    expect(screen.getByTestId("credit-cycle").textContent).toContain("the cycle (12 Sep – 11 Oct)");
    fireEvent.click(screen.getByTestId("credit-save"));
    await waitFor(() => expect(done).toHaveBeenCalledWith({ credits: 12 }));
    expect(ledger()[0]).toMatchObject({ date: "2026-10-11", cycleStart: "2026-09-12" });
  });

  it("says why a day before the account was opened cannot be used", async () => {
    await addFor("a@gmail.com", "2026-10-05");
    const done = vi.fn();
    render(<CreditUsageDialog open onClose={() => undefined} actor={ravi} settings={S} accounts={[account("a@gmail.com")]}
      activeId="a@gmail.com" mode="manual" onDone={done} />);
    fireEvent.change(screen.getByTestId("credit-made-on"), { target: { value: "2026-10-04" } });
    expect(screen.getByTestId("credit-day-issue").textContent).toMatch(/opened on 2026-10-05/);
    fireEvent.click(screen.getByTestId("credit-save"));
    expect(screen.getByTestId("credit-error").textContent).toMatch(/opened on 2026-10-05/);
    expect(done).not.toHaveBeenCalled();
  });

  it("editing an old entry shows THAT entry's cycle, with its own credits given back", async () => {
    await addFor("a@gmail.com", "2026-09-12");
    await svc.recordFlowUsage([{ account: account("a@gmail.com"), rows: [{ seconds: 8, count: 10 }] }], ravi, S, { madeOn: "2026-10-01" }, "2026-10-12");
    await svc.recordFlowUsage([{ account: account("a@gmail.com"), rows: [{ seconds: 8, count: 1 }] }], ravi, S, {}, "2026-10-12");
    const old = ledger().find((e) => e.date === "2026-10-01")!;
    render(<CreditUsageDialog open onClose={() => undefined} actor={ravi} settings={S} accounts={[account("a@gmail.com")]}
      mode="edit" entry={old} onDone={() => undefined} />);
    expect((screen.getByTestId("credit-made-on") as HTMLInputElement).value).toBe("2026-10-01");
    // The 12 Sep – 11 Oct cycle: 120 used; this entry's own 120 come back first → 1000 − 120 + 120 − 120 = 880.
    expect(screen.getByTestId("credit-cycle").textContent).toContain("120 / 1000 used in the cycle (12 Sep – 11 Oct)");
    expect(screen.getByTestId("credit-block").textContent).toContain("880 left after this");
  });
});

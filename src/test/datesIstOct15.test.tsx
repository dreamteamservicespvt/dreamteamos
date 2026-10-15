// The app's users are in India; every rule below is checked on India time whatever the machine's zone
// is (vitest runs each file in its own process, so this only affects this file).
process.env.TZ = "Asia/Kolkata";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * India day vs UTC day (bug audit, 2026-10-15).
 *
 * `toISOString().slice(0, 10)` is the UTC day — YESTERDAY in India between 00:00 and 05:30 IST. It
 * dated hiring-link acceptances and signed letters, expense defaults, the main admin's "today" figures,
 * old jobs' work day, and the session-history CSV. Each now uses the local (India) day; the server,
 * which runs in UTC, computes the India day explicitly.
 */

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {}, auth: {} }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const mem = await import("./memoryFirestore");
const { localDayOfInstant, workCountsOn } = await import("@/utils/workDates");
const { workDayOf } = await import("@/utils/performanceCycle");
const { formatLocalDateTime } = await import("@/utils/formatters");
const { default: DailyExpenses } = await import("@/pages/accounts-admin/DailyExpenses");
const { useAuthStore } = await import("@/store/authStore");
import { format } from "date-fns";
import type { AppUser, WorkAssignment } from "@/types";

/** 01:00 IST on 6 October 2026 — still the 5th in UTC. */
const ONE_AM_IST = "2026-10-05T19:30:00.000Z";

describe("the local day of a UTC instant", () => {
  it("is the India day, not the first ten characters", () => {
    expect(ONE_AM_IST.slice(0, 10)).toBe("2026-10-05");
    expect(localDayOfInstant(ONE_AM_IST)).toBe("2026-10-06");
    expect(localDayOfInstant("2026-10-05T06:30:00.000Z")).toBe("2026-10-05");
    expect(localDayOfInstant("2026-10-05")).toBe("2026-10-05");
    expect(localDayOfInstant("not a date")).toBeUndefined();
    expect(localDayOfInstant(undefined)).toBeUndefined();
  });

  it("puts an old job (only assignedAtIso on record) on the same India day everywhere", () => {
    const job = { date: "", assignedAt: null, assignedAtIso: ONE_AM_IST } as unknown as WorkAssignment;
    expect(workCountsOn(job)).toBe("2026-10-06");
    expect(format(workDayOf(job)!, "yyyy-MM-dd")).toBe("2026-10-06");
  });
});

describe("session history CSV", () => {
  it("writes India local time, not UTC", () => {
    expect(new Date(ONE_AM_IST).toISOString()).toBe("2026-10-05T19:30:00.000Z");
    expect(formatLocalDateTime(new Date(ONE_AM_IST))).toBe("2026-10-06 01:00");
  });

  it("the three pages export with it", () => {
    for (const dir of ["main-admin", "tech-admin", "sales-admin"]) {
      const src = readFileSync(resolve(__dirname, `../pages/${dir}/SessionHistory.tsx`), "utf8");
      expect(src).toContain("formatLocalDateTime(s.loginAt.toDate())");
      expect(src).not.toMatch(/toDate\(\)\.toISOString\(\)/);
    }
  });
});

describe("the hiring link (api/onboarding.ts, Vercel = UTC) and its DEV twin", () => {
  const code = (path: string) => readFileSync(resolve(__dirname, path), "utf8")
    .split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");

  it("works out the India day explicitly on the server", () => {
    const api = code("../../api/onboarding.ts");
    expect(api).toMatch(/timeZone: "Asia\/Kolkata"/);
    expect(api).toMatch(/const todayIso = \(\): string => INDIA_DAY\.format\(new Date\(\)\)/);
    expect(api).not.toMatch(/toISOString\(\)\.slice\(0, 10\)/);
    // The formatter the server uses gives yyyy-MM-dd for the India day, whatever the host's zone.
    const indiaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
    expect(indiaDay.format(new Date(ONE_AM_IST))).toBe("2026-10-06");
    expect(indiaDay.format(new Date("2026-10-05T18:29:00.000Z"))).toBe("2026-10-05");
  });

  it("the browser fallback uses the local day", () => {
    const guest = code("../services/onboardingGuest.ts");
    expect(guest).toMatch(/const today = todayIso\(\);/);
    expect(guest).not.toMatch(/toISOString\(\)\.slice\(0, 10\)/);
  });
});

describe("Daily Expenses — the date a new expense starts with", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(ONE_AM_IST));
    mem.__reset();
    useAuthStore.setState({ user: { uid: "acc", name: "Accounts", role: "accounts_admin", isActive: true } as unknown as AppUser, loading: false });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("is the India day, and starts on today again after an entry made with a picked date", async () => {
    render(<DailyExpenses />);
    fireEvent.click(screen.getAllByText(/Add Expense|^Add$/)[0]);
    const dateInput = () => document.querySelector('form input[type="date"]') as HTMLInputElement;
    expect(dateInput().value).toBe("2026-10-06");

    fireEvent.change(dateInput(), { target: { value: "2026-10-01" } });
    expect(dateInput().value).toBe("2026-10-01");
    fireEvent.change(screen.getByPlaceholderText("Description"), { target: { value: "Tea" } });
    fireEvent.change(screen.getByPlaceholderText("₹ Amount"), { target: { value: "120" } });
    fireEvent.submit(dateInput().closest("form")!);
    await vi.waitFor(() => expect(mem.__all("expenses")).toHaveLength(1));
    expect(mem.__all("expenses")[0]).toMatchObject({ date: "2026-10-01", amount: 120 });
    await vi.waitFor(() => expect(dateInput()).toBeNull()); // the form closes after an entry

    fireEvent.click(screen.getAllByText(/Add Expense|^Add$/)[0]);
    expect(dateInput().value).toBe("2026-10-06");
  });
});

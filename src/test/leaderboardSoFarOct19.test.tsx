import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, configure, render, within } from "@testing-library/react";

/**
 * The Leaderboard's incentive while a pay period is still running — 2026-10-19.
 *
 * On 19 Oct the board showed ₹0 "Oct 2026 Comm." for Kusuma (₹1,71,018 collected) and Pavani
 * (₹52,736), but ₹2,370 for Govardhan (₹47,400). The two with a daily target were judged against
 * 75% of the WHOLE month's target nine days into it; Govardhan has none, so nothing was withheld.
 * The gate is decided when the period ends: until then the board shows the incentive building up,
 * "so far · at 75% target". An ended period under 75% still reads ₹0 — what payroll paid.
 */

configure({ testIdAttribute: "data-test" });

const { commissionInWindow, collectionsOf } = await import("@/utils/salesPay");

const at = (iso: string) => ({ seconds: Math.floor(Date.parse(iso) / 1000) });
const sale = (day: string, amount: number) => ({
  category: "promotional", packageKey: "p", amount, verificationStatus: "verified", submittedAt: at(`${day}T11:00:00`),
});

const users = [
  // A ₹10,000 daily target: 75% of October's (10 Oct → 9 Nov) target is far above ₹1,71,018.
  { uid: "k", name: "Kusuma", role: "sales_member", createdBy: "admin1", isActive: true, earningsOption: "stipend_plus_5", dailyTarget: 10000 },
  // No target — nothing to withhold.
  { uid: "g", name: "Govardhan", role: "sales_member", createdBy: "admin1", isActive: true, earningsOption: "stipend_plus_5" },
];
const leads = [
  { id: "l1", phone: "9000000001", assignedTo: "k", createdAt: at("2026-10-12T09:00:00"), saleItems: [sale("2026-10-12", 171018)] },
  { id: "l2", phone: "9000000002", assignedTo: "g", createdAt: at("2026-10-12T09:00:00"), saleItems: [sale("2026-10-13", 47400)] },
  // September (ended), under 75% of its target: stays ₹0.
  { id: "l3", phone: "9000000003", assignedTo: "k", createdAt: at("2026-09-15T09:00:00"), saleItems: [sale("2026-09-15", 20000)] },
];

vi.mock("@/services/teamLeads", () => ({
  fetchTeamMembers: async (adminUid: string) => users.filter((u) => u.createdBy === adminUid),
  subscribeTeamLeads: (memberIds: string[], cb: (l: unknown[]) => void) => {
    cb(leads.filter((l) => memberIds.includes(l.assignedTo)));
    return () => {};
  },
}));
const AUTH = { user: { uid: "k", name: "Kusuma", role: "sales_member", createdBy: "admin1" } };
vi.mock("@/store/authStore", () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel(AUTH) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/components/dashboard/DayPicker", () => ({ default: () => null }));

const Leaderboard = (await import("@/pages/shared/Leaderboard")).default;

beforeEach(() => { vi.setSystemTime(new Date("2026-10-19T14:00:00")); });
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe("commissionInWindow with todayStr", () => {
  const terms = () => ({ rate: 5, dailyTarget: 10000 });
  const collections = collectionsOf(leads.filter((l) => l.assignedTo === "k") as never);

  it("gives a running period under 75% its incentive as `accruing`, apart from `commission`", () => {
    const r = commissionInWindow({ collections, from: "2026-10-10", to: "2026-11-09", termsFor: terms, todayStr: "2026-10-19" });
    expect(r.commission).toBe(0);
    expect(r.accruing).toBe(8551); // 5% of 1,71,018
  });

  it("keeps an ENDED period under 75% at ₹0 — what payroll pays", () => {
    const r = commissionInWindow({ collections, from: "2026-09-10", to: "2026-10-09", termsFor: terms, todayStr: "2026-10-19" });
    expect(r).toMatchObject({ commission: 0, accruing: 0 });
  });

  it("changes nothing without todayStr (the P&L's cost)", () => {
    const r = commissionInWindow({ collections, from: null, to: null, termsFor: terms });
    expect(r).toMatchObject({ commission: 0, accruing: 0 });
  });
});

describe("Leaderboard on 19 Oct", () => {
  it("shows the running month's incentive so far for a member with a target", async () => {
    render(<Leaderboard />);
    await act(async () => {});
    const table = document.querySelector("table")!;
    const row = (name: string) => Array.from(table.querySelectorAll("tbody tr")).find((r) => r.textContent?.includes(name)) as HTMLElement;
    expect(within(row("Kusuma")).getAllByText(/₹8,551/).length).toBeGreaterThan(0);
    expect(within(row("Kusuma")).getAllByTestId("comm-so-far").length).toBeGreaterThan(0);
    // No target: earned outright, no "so far".
    expect(within(row("Govardhan")).getAllByText(/₹2,370/).length).toBeGreaterThan(0);
    expect(within(row("Govardhan")).queryAllByTestId("comm-so-far")).toHaveLength(0);
  });
});

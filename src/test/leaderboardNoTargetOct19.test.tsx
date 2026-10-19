import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, render, within } from "@testing-library/react";

/**
 * The Leaderboard's incentives: plan rate × verified money, with NO 75% target check (owner, 2026-10-19).
 *
 * From 2026-10-15 to 2026-10-19 the board applied Payroll's 75% gate, so on 19 Oct Kusuma (₹1,71,018
 * collected) and Pavani (₹52,736) read ₹0 while Govardhan (no target) read ₹2,370. The owner asked for the
 * board as before: every member sees 5% / 10% of the money, target or not, in a running or an ended period.
 */

const at = (iso: string) => ({ seconds: Math.floor(Date.parse(iso) / 1000) });
const sale = (day: string, amount: number, status = "verified") => ({
  category: "promotional", packageKey: "p", amount, verificationStatus: status, submittedAt: at(`${day}T11:00:00`),
});

const users = [
  { uid: "k", name: "Kusuma", role: "sales_member", createdBy: "admin1", isActive: true, earningsOption: "stipend_plus_5", dailyTarget: 10000 },
  { uid: "p", name: "Pavani", role: "sales_member", createdBy: "admin1", isActive: true, earningsOption: "incentive_10", dailyTarget: 10000 },
  { uid: "g", name: "Govardhan", role: "sales_member", createdBy: "admin1", isActive: true, earningsOption: "stipend_plus_5" },
];
const leads = [
  { id: "l1", phone: "9000000001", assignedTo: "k", createdAt: at("2026-10-12T09:00:00"), saleItems: [sale("2026-10-12", 171018)] },
  { id: "l2", phone: "9000000002", assignedTo: "p", createdAt: at("2026-10-14T09:00:00"), saleItems: [sale("2026-10-14", 52736)] },
  // Not verified yet: no incentive.
  { id: "l3", phone: "9000000003", assignedTo: "p", createdAt: at("2026-10-15T09:00:00"), saleItems: [sale("2026-10-15", 30000, "pending")] },
  { id: "l4", phone: "9000000004", assignedTo: "g", createdAt: at("2026-10-13T09:00:00"), saleItems: [sale("2026-10-13", 47400)] },
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

afterEach(() => { vi.useRealTimers(); cleanup(); });

async function rowOf(name: string): Promise<HTMLElement> {
  vi.setSystemTime(new Date("2026-10-19T14:00:00"));
  render(<Leaderboard />);
  await act(async () => {});
  const table = document.querySelector("table")!;
  return Array.from(table.querySelectorAll("tbody tr")).find((r) => r.textContent?.includes(name)) as HTMLElement;
}

describe("Leaderboard incentives — plan rate × verified money, no target check", () => {
  it("Kusuma (5%, with a target) sees 5% of ₹1,71,018 mid-month", async () => {
    expect(within(await rowOf("Kusuma")).getAllByText(/₹8,551/).length).toBeGreaterThan(0);
  });
  it("Pavani (10%, with a target) sees 10% of her verified ₹52,736 — the pending sale is left out", async () => {
    expect(within(await rowOf("Pavani")).getAllByText(/₹5,274/).length).toBeGreaterThan(0);
  });
  it("Govardhan (5%, no target) still sees ₹2,370", async () => {
    expect(within(await rowOf("Govardhan")).getAllByText(/₹2,370/).length).toBeGreaterThan(0);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, configure, fireEvent, render, screen, within } from "@testing-library/react";

/**
 * The leaderboard on the 1st of the month.
 *
 * It opened on the CALENDAR month, so on 1 August it measured 10 Aug → 9 Sep — a cycle that had
 * not started. Every member's month sales and commission read ₹0, and with every figure tied the
 * rows fell back to whatever order Firestore returned, which is what the team saw as an
 * alphabetical list. Both halves of that are pinned here.
 */

const at = (iso: string) => ({ seconds: Math.floor(Date.parse(iso) / 1000) });

const sale = (day: string, amount: number) => ({
  category: "promotional", packageKey: "30 Seconds + Poster", amount,
  verificationStatus: "verified", submittedAt: at(`${day}T11:00:00`),
});

// Deliberately alphabetical in the snapshot, and deliberately NOT in sales order: Asha is first by
// name and last by money, so a board that ranks properly must move her to the bottom.
const users = [
  { uid: "m1", name: "Asha", role: "sales_member", createdBy: "admin1", isActive: true, earningsOption: "incentive_10" },
  { uid: "m2", name: "Bhavani", role: "sales_member", createdBy: "admin1", isActive: true, earningsOption: "incentive_10" },
  { uid: "m3", name: "Chandra", role: "sales_member", createdBy: "admin1", isActive: true, earningsOption: "incentive_10" },
];

const leads = [
  // Sold on 15 July — inside the cycle we are living in on 1 August.
  { id: "l1", phone: "9000000001", displayName: "Ravi", assignedTo: "m1", createdAt: at("2026-07-15T09:00:00"), saleItems: [sale("2026-07-15", 999)] },
  { id: "l2", phone: "9000000002", displayName: "Sita", assignedTo: "m2", createdAt: at("2026-07-15T09:00:00"), saleItems: [sale("2026-07-16", 9999)] },
  { id: "l3", phone: "9000000003", displayName: "Gopal", assignedTo: "m3", createdAt: at("2026-07-15T09:00:00"), saleItems: [sale("2026-07-20", 4999)] },
  // Sold on 20 June — the PREVIOUS cycle, and must not be counted in this one.
  { id: "l4", phone: "9000000004", displayName: "Lata", assignedTo: "m1", createdAt: at("2026-06-20T09:00:00"), saleItems: [sale("2026-06-20", 50000)] },
  // Sold TODAY (1 Aug) — inside the July cycle, and the only sale on the selected day.
  { id: "l5", phone: "9000000005", displayName: "Kiran", assignedTo: "m1", createdAt: at("2026-08-01T09:00:00"), saleItems: [sale("2026-08-01", 499)] },
];

/**
 * The board now goes through services/teamLeads.ts (a one-time team fetch + a leads listener
 * scoped to that team by chunked `in` queries) instead of streaming the whole `users`/`leads`
 * collections — see the comment in Leaderboard.tsx. Mocking at that boundary, rather than raw
 * firebase/firestore, is what the component actually depends on now.
 */
vi.mock("@/services/teamLeads", () => ({
  fetchTeamMembers: async (adminUid: string) =>
    users.filter((u) => u.role === "sales_member" && u.createdBy === adminUid),
  subscribeTeamLeads: (memberIds: string[], cb: (leads: unknown[]) => void) => {
    cb(leads.filter((l) => memberIds.includes(l.assignedTo)));
    return () => {};
  },
}));
const AUTH = { user: { uid: "m1", name: "Asha", role: "sales_member", createdBy: "admin1" } };
vi.mock("@/store/authStore", () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel(AUTH) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/components/dashboard/DayPicker", () => ({ default: () => null }));

const Leaderboard = (await import("@/pages/shared/Leaderboard")).default;

beforeEach(() => { vi.setSystemTime(new Date("2026-08-01T13:00:00")); });
afterEach(() => { vi.useRealTimers(); cleanup(); });

configure({ testIdAttribute: "data-test" });

/** The member names in the order the board ranks them, top first. */
function rankedNames(): string[] {
  const table = document.querySelector("table")!;
  return Array.from(table.querySelectorAll("tbody tr")).map(
    // The name cell holds an avatar initial as well, so read the name's own element.
    (row) => row.querySelectorAll("td")[1].querySelector("p")?.textContent?.trim() || "",
  );
}

/** A clickable column header in the desktop table (the mobile cards repeat the labels). */
function header(text: RegExp): HTMLElement {
  const head = document.querySelector("thead")!;
  return Array.from(head.querySelectorAll("th")).find((th) => text.test(th.textContent || ""))!;
}

/**
 * `fetchTeamMembers` is a real (mocked) Promise, so the board's first paint is the loading
 * skeleton — flush that microtask before asserting on the rendered table.
 */
async function renderBoard() {
  render(<Leaderboard />);
  await act(async () => {});
}

describe("Team leaderboard on the 1st of the month", () => {
  it("opens on the cycle we are living in, not the one that starts on the 10th", async () => {
    await renderBoard();
    // 1 August sits inside 10 Jul → 9 Aug, so the board must be showing July's cycle.
    expect(screen.getByTestId("leaderboard-cycle").textContent).toContain("Jul 2026");
    expect(screen.getAllByText(/10 Jul 2026 → 09 Aug 2026/).length).toBeGreaterThan(0);
  });

  it("shows the month's sales instead of ₹0 — the commission that looked lost", async () => {
    await renderBoard();
    // 999 + 9,999 + 4,999 + 499 = 16,496 verified in the cycle. June's ₹50,000 is another cycle.
    expect(screen.getAllByText("₹16,496").length).toBeGreaterThan(0);
    // 10% of 16,496 = 1,649.6 → rounded by the formatter.
    expect(screen.getAllByText("₹1,650").length).toBeGreaterThan(0);
  });

  it("ranks by sales, biggest first — not by name", async () => {
    await renderBoard();
    fireEvent.click(header(/Jul 2026 Sales/));
    expect(rankedNames()).toEqual(["Bhavani", "Chandra", "Asha"]);
  });

  /**
   * The board opens filtered to Today, so it must be RANKED by today.
   *
   * It used to open ranked by the month while showing today's figures beside the names, so the
   * order and the numbers on the very first screen disagreed: whoever had the bigger month led,
   * even on a day somebody else had outsold them. Asha is the only member who has sold today, and
   * the smallest seller of the month — if she is not first, the board is ranking the wrong window.
   */
  it("opens ranked by today, the window it opens on", async () => {
    await renderBoard();
    expect(header(/Day's Sales/).className).toContain("underline");
    expect(rankedNames()[0]).toBe("Asha");
  });

  it("still ranks by money when the leading column ties", async () => {
    await renderBoard();
    // Asha is the only one who sold today, so she leads on the day column...
    expect(rankedNames()[0]).toBe("Asha");
    // ...and the other two, tied at ₹0 for the day, are ordered by the money they HAVE made
    // rather than left in the order Firestore returned them, which is alphabetical.
    expect(rankedNames().slice(1)).toEqual(["Bhavani", "Chandra"]);
  });

  it("re-ranks when the viewer changes the window, so the order always matches the numbers", async () => {
    await renderBoard();
    expect(rankedNames()[0]).toBe("Asha");        // today
    fireEvent.click(header(/Jul 2026 Sales/));
    expect(rankedNames()[0]).toBe("Bhavani");     // the cycle
  });

  it("keeps the previous cycle's sales out of this one", async () => {
    await renderBoard();
    const table = document.querySelector("table")!;
    const ashaRow = Array.from(table.querySelectorAll("tbody tr"))
      .find((r) => r.textContent?.includes("Asha"))!;
    // Her ₹50,000 June sale is in the previous cycle; only 15 Jul (₹999) and today (₹499) count.
    expect(within(ashaRow as HTMLElement).getByText("₹1,498")).toBeInTheDocument();
    expect(ashaRow.textContent).not.toContain("50,000");
  });
});

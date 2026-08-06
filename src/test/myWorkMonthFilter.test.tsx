import { describe, it, expect, vi, beforeEach } from "vitest";
import { configure, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * A tech member's month is the 10th → 9th cycle their output, targets and salary are all counted
 * over. My Work could only be read one day at a time, so "what did I do this month" was a question
 * the page could not answer. These drive the real page, because the filter is only useful if the
 * list AND the tiles agree with it.
 */

const assignments = [
  // Inside 10 Jul – 09 Aug.
  { id: "a1", date: "2026-07-28", status: "in_progress", businessName: "Sharma Electronics", uniqueId: "P001", category: "promotional", clipCount: 4, duration: "32s", accessCode: "1111", totalDurationSeconds: 600, assignedAtIso: "2026-07-28T09:00:00Z" },
  { id: "a2", date: "2026-07-15", status: "completed", businessName: "Bodhan Sweets", uniqueId: "P002", category: "promotional", clipCount: 2, duration: "16s", accessCode: "2222", totalDurationSeconds: 300, assignedAtIso: "2026-07-15T09:00:00Z" },
  { id: "a3", date: "2026-07-11", status: "verified", businessName: "Armoor Mobiles", uniqueId: "P003", category: "promotional", clipCount: 2, duration: "16s", accessCode: "3333", totalDurationSeconds: 120, assignedAtIso: "2026-07-11T09:00:00Z" },
  // The previous cycle, 10 Jun – 09 Jul. A calendar-month filter would wrongly lump 09 Jul in July.
  { id: "a4", date: "2026-07-09", status: "verified", businessName: "Old Job", uniqueId: "P004", category: "promotional", clipCount: 2, duration: "16s", accessCode: "4444", totalDurationSeconds: 60, assignedAtIso: "2026-07-09T09:00:00Z" },
  { id: "a5", date: "2026-06-12", status: "completed", businessName: "Older Job", uniqueId: "P005", category: "promotional", clipCount: 2, duration: "16s", accessCode: "5555", totalDurationSeconds: 60, assignedAtIso: "2026-06-12T09:00:00Z" },
];

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), doc: vi.fn(),
  updateDoc: vi.fn(), deleteField: vi.fn(), serverTimestamp: vi.fn(),
  // The page carries an unread badge for each job's client chat, which listens for its own rooms.
  onSnapshot: vi.fn(() => () => undefined),
  getDoc: vi.fn(), setDoc: vi.fn(), addDoc: vi.fn(), deleteDoc: vi.fn(),
  orderBy: vi.fn(), increment: vi.fn(), arrayUnion: vi.fn(), arrayRemove: vi.fn(),
}));
vi.mock("@/hooks/useFirestore", () => ({
  useFirestoreQuery: () => ({ data: assignments, loading: false }),
}));
vi.mock("@/store/authStore", () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { uid: "u1", name: "Jyothika", createdBy: "admin1" } }),
}));
vi.mock("@/services/notifications", () => ({ sendNotification: vi.fn(), notifyTechTeamLeaders: vi.fn() }));
vi.mock("@/services/orders", () => ({ markOrderCompleted: vi.fn(), revertOrderToAssigned: vi.fn() }));
vi.mock("@/services/clients", () => ({ upsertClientOnWorkComplete: vi.fn() }));
vi.mock("@/components/ai-platform/AIPlatformApp", () => ({ default: () => null }));
vi.mock("@/components/ai-platform/CodeVerificationModal", () => ({ default: () => null }));
vi.mock("@/components/work/SaleDeletedBanner", () => ({ default: () => null }));
vi.mock("@/components/dashboard/DayPicker", () => ({ default: () => null }));
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn(), ConfirmDialog: null }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const MyWork = (await import("@/pages/tech-member/MyWork")).default;

// This codebase marks test hooks with `data-test`, as the rest of the suite does.
configure({ testIdAttribute: "data-test" });

/** "Today" is fixed so the cycle list is deterministic: 28 Jul sits inside 10 Jul – 09 Aug. */
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-28T10:00:00"));
});

const tile = (label: string) =>
  screen.getByText(label).parentElement?.querySelector("p")?.textContent;

/**
 * The page reads `?chat=` so a tapped "client sent a message" notification opens that conversation,
 * which means it needs a router around it exactly as it has in the app.
 */
const renderPage = () => render(<MemoryRouter><MyWork /></MemoryRouter>);

const selectFilter = (optionText: RegExp) => {
  const select = screen.getByRole("combobox") as HTMLSelectElement;
  const option = within(select).getByText(optionText) as HTMLOptionElement;
  fireEvent.change(select, { target: { value: option.value } });
};

describe("My Work — the 10th to 9th month filter", () => {
  it("offers the last six performance months, spelled out in full", () => {
    renderPage();
    const group = within(screen.getByRole("combobox")).getByRole("group", { name: "Months (10th – 9th)" });
    const options = within(group).getAllByRole("option").map((o) => o.textContent);
    expect(options).toHaveLength(6);
    expect(options[0]).toBe("10 Jul – 09 Aug 2026 (this month)");
    expect(options[1]).toBe("10 Jun – 09 Jul 2026");
  });

  it("shows the work assigned inside the cycle and nothing outside it", () => {
    renderPage();
    selectFilter(/10 Jul – 09 Aug 2026/);

    expect(screen.getByText("Sharma Electronics")).toBeInTheDocument();
    expect(screen.getByText("Completed (2)")).toBeInTheDocument();
    // 09 Jul belongs to the PREVIOUS cycle, which is the whole point of a 10→9 month.
    expect(screen.queryByText("Old Job")).not.toBeInTheDocument();
    expect(screen.queryByText("Older Job")).not.toBeInTheDocument();
  });

  it("counts the tiles over the same cycle, not over the member's whole career", () => {
    renderPage();
    selectFilter(/10 Jul – 09 Aug 2026/);
    // One tile per status, so "completed" no longer swallows "verified" the way a combined
    // count did — a member can see what is waiting to be signed off separately from what is done.
    expect(tile("Active")).toBe("0");
    expect(tile("In Progress")).toBe("1");
    expect(tile("Changes")).toBe("0");
    expect(tile("Completed")).toBe("1");
    expect(tile("Verified")).toBe("1");
  });

  it("filters the list to the tile that was tapped, and back again", () => {
    renderPage();
    selectFilter(/All Days/);

    fireEvent.click(screen.getByTestId("my-work-tile-in_progress"));
    expect(screen.getByText("Sharma Electronics")).toBeInTheDocument();
    // The delivered work is a different status, so it is out of the way.
    expect(screen.queryByText("Bodhan Sweets")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("my-work-clear-status"));
    expect(screen.getByText("Sharma Electronics")).toBeInTheDocument();
  });

  it("opens the delivered list when a delivered status is picked, so the filter is not silent", () => {
    renderPage();
    selectFilter(/All Days/);
    fireEvent.click(screen.getByTestId("my-work-tile-verified"));
    expect(screen.getByText("Armoor Mobiles")).toBeInTheDocument();
    expect(screen.queryByText("Bodhan Sweets")).not.toBeInTheDocument();
  });

  it("moves to the previous cycle cleanly", () => {
    renderPage();
    selectFilter(/10 Jun – 09 Jul 2026/);
    expect(screen.getByText("Completed (2)")).toBeInTheDocument();
    expect(screen.queryByText("Sharma Electronics")).not.toBeInTheDocument();
    expect(tile("Completed")).toBe("1");
    expect(tile("Verified")).toBe("1");
  });

  it("says which period is empty rather than showing a blank page", () => {
    renderPage();
    selectFilter(/10 Feb – 09 Mar 2026/);
    const empty = screen.getByText("No work in this period").parentElement!;
    // Names the period that emptied it — a blank page otherwise reads as a broken one.
    expect(within(empty).getByText(/Nothing was assigned to you in/).textContent)
      .toContain("10 Feb – 09 Mar 2026");
  });

  it("leaves the day filters working as they did", () => {
    renderPage();
    selectFilter(/^Today$/);
    expect(screen.getByText("Sharma Electronics")).toBeInTheDocument();
    expect(tile("In Progress")).toBe("1");
  });
});

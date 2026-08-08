import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";

/**
 * My Performance, as a sales executive reads it.
 *
 * Two things it must get right. A member who has been put on an earnings plan sees THAT plan and
 * nothing else — the page used to offer both as tabs, so somebody on Salary + 5% could open the
 * 10% tab, read a larger number as their earnings, and take it to payroll. And the completed-sales
 * table has to open at a readable size: it listed every sale a member had ever made, in whatever
 * order Firestore returned them.
 */

const at = (iso: string) => ({ seconds: Math.floor(Date.parse(iso) / 1000) });

/** 23 completed sales, so the first page is a real cut rather than the whole list. */
const leads = Array.from({ length: 23 }, (_, i) => ({
  id: `l${i}`,
  displayName: i === 0 ? "Ravi Motors" : `Client ${i}`,
  phone: `98765432${String(i).padStart(2, "0")}`,
  status: "answered",
  saleDone: true,
  assignedTo: "u1",
  createdAt: at("2026-07-20T09:00:00"),
  saleItems: [{
    category: i === 0 ? "cinematic" : "promotional",
    packageKey: i === 0 ? "c1" : "p1",
    amount: 999 + i,
    verificationStatus: "verified",
    submittedAt: at(`2026-07-${String((i % 27) + 1).padStart(2, "0")}T10:00:00`),
    verifiedAt: at(`2026-07-${String((i % 27) + 1).padStart(2, "0")}T18:00:00`),
  }],
}));

const AUTH: { user: Record<string, unknown> } = { user: {} };

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), doc: vi.fn(), orderBy: vi.fn(),
  onSnapshot: (_q: unknown, next: (snap: unknown) => void) => {
    next({ docs: leads.map((l) => ({ id: l.id, data: () => l })) });
    return () => {};
  },
}));
vi.mock("@/store/authStore", () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel(AUTH) }));
vi.mock("@/hooks/useFirestore", () => ({ useFirestoreQuery: () => ({ data: [], loading: false }) }));
// Attendance is its own tested card; this suite is about earnings and the sales table.
vi.mock("@/components/sales/AttendanceCard", () => ({ default: () => null }));
/**
 * Charts stubbed out — this suite is about the numbers and the table, and jsdom cannot lay out an
 * SVG anyway. Listed one by one rather than returned as a catch-all Proxy: a Proxy that answers
 * every property with a function also answers `then` with one, which makes the module object
 * thenable and hangs vitest's `await factory()` for ever.
 */
vi.mock("recharts", () => {
  const Stub = () => null;
  return {
    BarChart: Stub, Bar: Stub, XAxis: Stub, YAxis: Stub, Tooltip: Stub,
    ResponsiveContainer: Stub, PieChart: Stub, Pie: Stub, Cell: Stub,
  };
});

import MyPerformance from "@/pages/sales-member/MyPerformance";

configure({ testIdAttribute: "data-test" });

beforeEach(() => {
  AUTH.user = { uid: "u1", name: "Asha Devi", role: "sales_member", salary: 0 };
});
afterEach(cleanup);

describe("which earnings plan a member is shown", () => {
  it("shows only Salary + 5% to somebody on Salary + 5%", () => {
    AUTH.user = { ...AUTH.user, earningsOption: "stipend_plus_5" };
    render(<MyPerformance />);

    expect(screen.getByTestId("earnings-option1")).toBeInTheDocument();
    expect(screen.queryByTestId("earnings-option2")).not.toBeInTheDocument();
    // No tabs at all — a plan is not a menu.
    expect(screen.queryByTestId("earnings-plan-toggle")).not.toBeInTheDocument();
    expect(screen.getByTestId("earnings-plan-badge")).toHaveTextContent("Salary + 5%");
  });

  it("shows only the 10% plan to somebody on the 10% plan", () => {
    AUTH.user = { ...AUTH.user, earningsOption: "incentive_10" };
    render(<MyPerformance />);

    expect(screen.getByTestId("earnings-option2")).toBeInTheDocument();
    expect(screen.queryByTestId("earnings-option1")).not.toBeInTheDocument();
    expect(screen.getByTestId("earnings-plan-badge")).toHaveTextContent("10% Incentive");
  });

  it("still offers both to somebody who has not been put on a plan yet", () => {
    render(<MyPerformance />);
    expect(screen.getByTestId("earnings-plan-toggle")).toBeInTheDocument();
    expect(screen.getByText(/hasn't been assigned yet/)).toBeInTheDocument();
  });

  it("never calls a salaried executive's pay a stipend", () => {
    AUTH.user = { ...AUTH.user, earningsOption: "stipend_plus_5" };
    const { container } = render(<MyPerformance />);
    expect(container.textContent).not.toMatch(/stipend/i);
    expect(container.textContent).toMatch(/Salary \(proportional/);
  });
});

describe("the completed sales table", () => {
  it("opens with ten rows, not the whole history", () => {
    render(<MyPerformance />);
    expect(screen.getByTestId("sales-count")).toHaveTextContent("Showing 10 of 23");
  });

  it("loads ten more at a time", () => {
    render(<MyPerformance />);
    fireEvent.click(screen.getByTestId("sales-load-more"));
    expect(screen.getByTestId("sales-count")).toHaveTextContent("Showing 20 of 23");

    // The last page is only as big as what is left, and the button then goes away.
    fireEvent.click(screen.getByTestId("sales-load-more"));
    expect(screen.getByTestId("sales-count")).toHaveTextContent("Showing 23 of 23");
    expect(screen.queryByTestId("sales-load-more")).not.toBeInTheDocument();
  });

  it("searches across the whole history, not just the rows on screen", () => {
    render(<MyPerformance />);
    // "Ravi Motors" is the oldest sale, well past the first page.
    fireEvent.change(screen.getByTestId("sales-search"), { target: { value: "ravi" } });

    expect(screen.getByText("Ravi Motors")).toBeInTheDocument();
    expect(screen.getByTestId("sales-count")).toHaveTextContent("Showing 1 of 1");
  });

  it("matches on category as well as name", () => {
    render(<MyPerformance />);
    fireEvent.change(screen.getByTestId("sales-search"), { target: { value: "cinematic" } });
    expect(screen.getByText("Ravi Motors")).toBeInTheDocument();
  });

  it("starts a new search at the top of its own results", () => {
    // Otherwise a search run after two "load more" presses shows 20 rows of a 1-row result and
    // reads as though nothing happened.
    render(<MyPerformance />);
    fireEvent.click(screen.getByTestId("sales-load-more"));
    fireEvent.change(screen.getByTestId("sales-search"), { target: { value: "client 1" } });
    expect(screen.getByTestId("sales-count").textContent).toMatch(/^Showing 10 of/);
  });

  it("says so plainly when nothing matches", () => {
    render(<MyPerformance />);
    fireEvent.change(screen.getByTestId("sales-search"), { target: { value: "zzzz" } });
    expect(screen.getByTestId("sales-no-match")).toBeInTheDocument();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, configure, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SmmDashboard from "@/components/smm/SmmDashboard";
import type { SmmCampaign, SmmContentItem } from "@/types/smm";

configure({ testIdAttribute: "data-test" });
afterEach(cleanup);

const TODAY = "2026-10-04";
let seq = 0;
const item = (over: Partial<SmmContentItem> = {}): SmmContentItem => ({
  id: `i${(seq += 1)}`, kind: "poster", title: "Post", uploadDate: null, uploadTime: "06:00", platforms: ["instagram"],
  status: "planned", approval: { state: "not_sent", askedAt: null, respondedAt: null, note: null, byName: null, chases: [] },
  extra: false, postedAt: null, ...over,
});
const month = (over: Partial<SmmCampaign>): SmmCampaign => ({
  id: "x", orderId: "x", leadId: "l", saleItemKey: "k", origin: "sale", clientPhone: "+919876543210",
  clientPhoneId: "919876543210", clientName: "Client", businessName: "Business", packageKey: "Starter",
  packageLabel: "Starter", amount: 10000, cycle: { month: "2026-09", startDate: "2026-09-20", endDate: "2026-10-20" },
  platforms: ["instagram"], commitments: { poster: 4, ai_ad: 0, real_video: 0 }, items: [], ads: [], budgetPayments: [],
  team: { creator: { uid: "u1", name: "Arjun" }, publisher: null, marketer: null, assistants: [] }, soldBy: "s1",
  soldByName: "Anil", watchers: ["s1"], status: "active", renewal: { state: "none" }, ...over,
});

function months(): SmmCampaign[] {
  return [
    month({
      id: "late", businessName: "Lakshmi Jewellers",
      items: [
        item({ status: "posted", uploadDate: "2026-09-25" }),
        item({ status: "planned", uploadDate: "2026-10-01" }),
        item({ status: "approved", uploadDate: "2026-10-05", approval: { state: "approved" } }),
        item({ status: "awaiting_approval", uploadDate: "2026-10-05", approval: { state: "waiting", askedAt: Date.now() - 86_400_000 } }),
      ],
      ads: [{
        id: "r", name: "Leads", scope: { kind: "all", itemIds: [] }, startDate: "2026-09-28", days: 10, dailyBudget: 400, status: "running",
        reports: [{ date: "2026-10-03", leads: 6, spend: 600, costPerResult: 100, byName: "x", at: null }],
      }],
    }),
    month({
      id: "good", businessName: "Green Leaf Cafe", amount: 15000,
      cycle: { month: "2026-09", startDate: "2026-09-06", endDate: "2026-10-06" },
      items: [1, 2, 3, 4].map(() => item({ status: "posted", uploadDate: "2026-09-28" })),
      renewal: { state: "pitched" },
    }),
    month({
      id: "new", businessName: "New Dawn Clinic", team: { creator: null, publisher: null, marketer: null, assistants: [] },
      cycle: { month: "2026-10", startDate: "2026-10-08", endDate: "2026-11-08" },
    }),
  ];
}

const renderDash = (props: Partial<Parameters<typeof SmmDashboard>[0]> = {}) => {
  const onPick = vi.fn();
  render(
    <MemoryRouter>
      <SmmDashboard campaigns={months()} today={TODAY} showMoney showTeam onPick={onPick} {...props} />
    </MemoryRouter>,
  );
  return { onPick };
};

describe("the Social Media dashboard", () => {
  it("leads with what is delivered against what was promised, and today's target on the meter", () => {
    renderDash();
    // 1 + 4 posted of 4 + 4 + 4 promised.
    expect(screen.getByTestId("smm-dash-delivered-percent").textContent).toBe("42%");
    expect(screen.getByTestId("smm-dash-expected-tick")).toBeTruthy();
    expect(screen.getByTestId("smm-stat-late").textContent).toBe("1");
    expect(screen.getByTestId("smm-stat-waiting").textContent).toBe("1");
    expect(screen.getByTestId("smm-stat-setup").textContent).toBe("1");
    expect(screen.getByTestId("smm-stat-running").textContent).toBe("3");
  });

  it("opens the pile a tile counts", () => {
    const { onPick } = renderDash();
    fireEvent.click(screen.getByTestId("smm-tile-late"));
    expect(onPick).toHaveBeenCalledWith("off");
    fireEvent.click(screen.getByTestId("smm-tile-renewals"));
    expect(onPick).toHaveBeenCalledWith("renewals");
  });

  it("places every client on the pace matrix, late work as a diamond, and has a table behind it", () => {
    renderDash();
    const matrix = screen.getByTestId("smm-dash-pace-matrix");
    const dots = within(matrix).getAllByTestId("smm-pace-dot");
    expect(dots).toHaveLength(3);
    const late = dots.find((d) => d.getAttribute("data-health") === "bad")!;
    expect(late.tagName.toLowerCase()).toBe("path");
    fireEvent.click(within(matrix).getByTestId("smm-pace-table-toggle"));
    const table = within(matrix).getByTestId("smm-pace-table");
    expect(table.textContent).toContain("Lakshmi Jewellers");
    expect(table.textContent).toContain("1 late");
  });

  it("counts every promised piece by stage, with the legend as the table", () => {
    renderDash();
    expect(screen.getByTestId("smm-stage-count-done").textContent).toBe("5");
    expect(screen.getByTestId("smm-stage-count-late").textContent).toBe("1");
    expect(screen.getByTestId("smm-stage-count-unplanned").textContent).toBe("4");
  });

  it("draws the posting calendar with today marked and says what tomorrow needs", () => {
    renderDash();
    const cal = screen.getByTestId("smm-dash-calendar");
    expect(within(cal).getAllByTestId("smm-calendar-col").length).toBeGreaterThan(10);
    expect(within(cal).getByText("Today")).toBeTruthy();
    expect(screen.getByTestId("smm-dash-tomorrow").textContent).toBe("Tomorrow: 2 to post — 1 approved, 1 with the client.");
  });

  it("lists clients worst first and puts renewals on a runway with their worth", () => {
    renderDash();
    const rows = screen.getAllByTestId("smm-dash-client-row");
    expect(rows[0].textContent).toContain("Lakshmi Jewellers");
    expect(rows[rows.length - 1].textContent).toContain("Green Leaf Cafe");
    expect(screen.getByTestId("smm-renewal-week").textContent).toContain("₹15,000");
    expect(screen.getAllByTestId("smm-renewal-mark").map((m) => m.getAttribute("data-state"))).toEqual(["pitched", "open"]);
  });

  it("shows team load and ads to the people who run the side", () => {
    renderDash();
    expect(screen.getAllByTestId("smm-dash-team-row")[0].textContent).toContain("Arjun");
    expect(screen.getByTestId("smm-dash-ads-leads").textContent).toBe("6");
  });

  it("keeps money and team load from a member, and says so plainly when nothing is running", () => {
    renderDash({ showMoney: false, showTeam: false });
    expect(screen.queryByTestId("smm-dash-team")).toBeNull();
    expect(screen.getByTestId("smm-renewal-week").textContent).not.toContain("₹");
    expect(screen.getByTestId("smm-stat-running").parentElement?.textContent).not.toContain("₹");
  });

  it("has an empty state", () => {
    const onAddSale = vi.fn();
    render(<MemoryRouter><SmmDashboard campaigns={[]} today={TODAY} showMoney showTeam onPick={vi.fn()} onAddSale={onAddSale} /></MemoryRouter>);
    expect(screen.getByTestId("smm-dashboard-empty")).toBeTruthy();
    fireEvent.click(screen.getByText("Add SMM sale"));
    expect(onAddSale).toHaveBeenCalled();
  });
});

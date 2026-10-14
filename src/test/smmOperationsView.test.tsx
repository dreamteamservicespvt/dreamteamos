import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import SmmOperationsView from "@/components/smm/SmmOperationsView";
import { addDays, blankItem, isoDay } from "@/utils/smmPlan";
import type { SmmCampaign, SmmContentItem, SmmContentKind } from "@/types/smm";

afterEach(cleanup);

const today = isoDay(new Date());
let seq = 0;

function item(kind: SmmContentKind, over: Partial<SmmContentItem> = {}): SmmContentItem {
  seq += 1;
  return {
    ...blankItem(kind, ["instagram", "facebook"]),
    id: "item-" + seq,
    title: "Test " + kind + " " + seq,
    ...over,
  };
}

function campaign(name: string, over: Partial<SmmCampaign> = {}): SmmCampaign {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    orderId: "order-1",
    leadId: "lead-1",
    saleItemKey: "sale-1",
    origin: "sale",
    clientPhone: "+919876543210",
    clientPhoneId: "919876543210",
    clientName: name,
    businessName: name,
    packageKey: "starter",
    packageLabel: "Starter package",
    amount: 10000,
    cycle: { month: today.slice(0, 7), startDate: addDays(today, -10), endDate: addDays(today, 20) },
    platforms: ["instagram", "facebook"],
    commitments: { poster: 1, ai_ad: 1, real_video: 1 },
    items: [],
    ads: [],
    budgetPayments: [],
    team: {
      creator: { uid: "maker-1", name: "Asha" },
      publisher: { uid: "publisher-1", name: "Ravi" },
      marketer: null,
      assistants: [],
    },
    soldBy: "seller-1",
    soldByName: "Anil",
    watchers: ["seller-1"],
    status: "active",
    renewal: { state: "none" },
    ...over,
  };
}

function renderView(campaigns: SmmCampaign[], props: Partial<ComponentProps<typeof SmmOperationsView>> = {}) {
  return render(
    <MemoryRouter>
      <SmmOperationsView campaigns={campaigns} loading={false} canSetUp={true} onClassicUI={vi.fn()} {...props} />
    </MemoryRouter>,
  );
}

describe("SMM Operations UI — atomic interactions", () => {
  it("renders metrics from records and separates extra work from package fulfilment", () => {
    const c = campaign("Sreerasthu Silvers", {
      items: [
        item("poster", { title: "Overdue poster", uploadDate: addDays(today, -2), status: "planned" }),
        item("ai_ad", { title: "Client approval video", uploadDate: addDays(today, 2), status: "awaiting_approval", approval: { state: "waiting", askedAt: null, respondedAt: null, note: null, byName: null, chases: [] } }),
        item("real_video", { title: "Published real video", uploadDate: addDays(today, -1), status: "posted" }),
        item("poster", { title: "Urgent festival extra", uploadDate: addDays(today, 1), status: "in_progress", extra: true, extraType: "poster", extraCharge: "unbilled" }),
      ],
    });
    renderView([c]);

    expect(screen.getByRole("heading", { name: "Social media" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Overdue work: 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Client response: 1" })).toBeInTheDocument();
    expect(screen.getByText("Urgent festival extra")).toBeInTheDocument();
    expect(screen.getAllByText("Extra work").length).toBeGreaterThan(0);
    expect(screen.getByText("Real videos")).toBeInTheDocument();
    expect(screen.getByText(/excluded from package total/)).toBeInTheDocument();
  });

  it("filters the action queue by overdue work and can return to all work", () => {
    const c = campaign("Sreerasthu Silvers", {
      items: [
        item("poster", { title: "Late poster", uploadDate: addDays(today, -1), status: "planned" }),
        item("ai_ad", { title: "Future video", uploadDate: addDays(today, 10), status: "planned" }),
      ],
    });
    renderView([c]);
    const queue = within(screen.getByRole("heading", { name: "Needs attention" }).closest("section")!);
    fireEvent.click(screen.getByRole("button", { name: "Overdue work: 1" }));
    expect(screen.getByRole("button", { name: "Filter Overdue: 1" })).toHaveAttribute("aria-pressed", "true");
    expect(queue.getByText("Late poster")).toBeInTheDocument();
    expect(queue.queryByText("Future video")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filter All work: 1" }));
    expect(screen.getByRole("button", { name: "Filter All work: 1" })).toHaveAttribute("aria-pressed", "true");
    expect(queue.getByText("Late poster")).toBeInTheDocument();
    expect(queue.queryByText("Future video")).not.toBeInTheDocument();
  });

  it("search narrows both action queue and client campaigns", () => {
    const one = campaign("Sreerasthu Silvers", { items: [item("poster", { title: "Sreerasthu poster", uploadDate: addDays(today, -1) })] });
    const two = campaign("Balaji Homes", { id: "balaji-homes", items: [item("poster", { title: "Balaji poster", uploadDate: addDays(today, -1) })] });
    renderView([one, two]);
    fireEvent.change(screen.getByRole("textbox", { name: "Search clients and deliverables" }), { target: { value: "Balaji" } });
    const queue = within(screen.getByRole("heading", { name: "Needs attention" }).closest("section")!);
    const clientList = within(screen.getByRole("heading", { name: "Client campaigns" }).closest("section")!);
    expect(queue.getByText("Balaji poster")).toBeInTheDocument();
    expect(queue.queryByText("Sreerasthu poster")).not.toBeInTheDocument();
    expect(clientList.getByText("Balaji Homes")).toBeInTheDocument();
    expect(clientList.queryByText("Sreerasthu Silvers")).not.toBeInTheDocument();
  });

  it("opens existing setup and classic-view actions without changing campaign records", () => {
    const onSetUp = vi.fn();
    const onClassicUI = vi.fn();
    const unassigned = campaign("Needs Setup", {
      team: { creator: null, publisher: null, marketer: null, assistants: [] },
    });
    renderView([unassigned], { onSetUp, onClassicUI });
    fireEvent.click(screen.getByRole("button", { name: "Classic view" }));
    expect(onClassicUI).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Set up" })[0]);
    expect(onSetUp).toHaveBeenCalledWith(unassigned);
  });

  it("shows a calm empty state when no action is needed", () => {
    const clean = campaign("Healthy client", {
      cycle: { month: today.slice(0, 7), startDate: addDays(today, -1), endDate: addDays(today, 29) },
      commitments: { poster: 1, ai_ad: 0, real_video: 0 },
      items: [item("poster", { title: "Completed poster", uploadDate: today, status: "posted" })],
    });
    renderView([clean]);
    expect(screen.getByText("Nothing needs attention here")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

/**
 * The renewal countdown popup (2026-10-03): in the last three days before a social-media month's
 * renewal date — 3 days, 2 days, 1 day, the day itself — the salesperson who sold it gets a popup,
 * once a day, with the countdown and the month's work report drawn out.
 */

let AUTH: { user: Record<string, unknown> | null } = { user: null };
let BOARD: unknown[] = [];
const renew = vi.fn(async (_c: unknown) => undefined);

vi.mock("@/store/authStore", () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel(AUTH) }));
vi.mock("@/hooks/useSmmCampaigns", () => ({ useSmmCampaigns: () => ({ campaigns: BOARD, loading: false }) }));
vi.mock("@/components/smm/useSmmRenewal", () => ({ useSmmRenewal: () => ({ renew, renewingId: null }) }));

import SmmRenewalPopup from "@/components/smm/SmmRenewalPopup";
import {
  daysToRenewal, monthCycle, renewalCountdownLabel, renewalCountdownSteps, renewalPopupMonths,
  renewalPopupSeenKey, toneCounts,
} from "@/utils/smmPackage";
import { blankItem } from "@/utils/smmPlan";
import type { SmmCampaign, SmmContentItem } from "@/types/smm";

const team = (over: Partial<SmmCampaign["team"]> = {}): SmmCampaign["team"] =>
  ({ creator: null, publisher: null, marketer: null, assistants: [], ...over });

const item = (kind: SmmContentItem["kind"], over: Partial<SmmContentItem> = {}): SmmContentItem =>
  ({ ...blankItem(kind, ["instagram"]), ...over });

/** 3 Oct → 3 Nov 2026: the renewal date is 3 Nov. */
function month(over: Partial<SmmCampaign> = {}): SmmCampaign {
  return {
    id: "o1", orderId: "o1", leadId: "l1", saleItemKey: "l1__0", origin: "sale",
    clientPhone: "+919000000000", clientPhoneId: "919000000000", clientName: "Ravi", businessName: "Sri Sai Silks",
    packageKey: "Starter Package", packageLabel: "Starter Package", amount: 10000,
    cycle: monthCycle("2026-10-03"),
    platforms: ["instagram"],
    commitments: { poster: 2, ai_ad: 2, real_video: 0 },
    items: [
      item("poster", { status: "posted", uploadDate: "2026-10-10" }),
      item("poster", { status: "awaiting_approval", uploadDate: "2026-11-02", approval: { state: "waiting", askedAt: null, respondedAt: null, note: null, byName: null, chases: [] } }),
      item("ai_ad", { status: "posted", uploadDate: "2026-10-12" }),
      item("ai_ad", { status: "in_progress", uploadDate: "2026-10-20" }),
    ],
    ads: [], budgetPayments: [], team: team({ creator: { uid: "arjun", name: "Arjun" } }),
    soldBy: "anil", soldByName: "Anil", watchers: ["anil", "arjun"], status: "active",
    renewal: { state: "none" },
    ...over,
  };
}

describe("the countdown rules", () => {
  const c = monthCycle("2026-10-03");

  it("counts whole days to the renewal date — 3, 2, 1, then 0 on the day", () => {
    expect(daysToRenewal(c, "2026-10-31")).toBe(3);
    expect(daysToRenewal(c, "2026-11-02")).toBe(1);
    expect(daysToRenewal(c, "2026-11-03")).toBe(0);
    expect(daysToRenewal(c, "2026-11-05")).toBe(-2);
  });

  it("says it in words", () => {
    expect(renewalCountdownLabel(3)).toBe("3 days to renewal");
    expect(renewalCountdownLabel(1)).toBe("1 day to renewal — tomorrow");
    expect(renewalCountdownLabel(0)).toBe("Renewal is today");
  });

  it("draws four stops and marks where today is", () => {
    expect(renewalCountdownSteps(3).map((s) => `${s.label}:${s.state}`))
      .toEqual(["3 days:now", "2 days:next", "1 day:next", "Renewal day:next"]);
    expect(renewalCountdownSteps(1).map((s) => s.state)).toEqual(["past", "past", "now", "next"]);
    expect(renewalCountdownSteps(0).map((s) => s.state)).toEqual(["past", "past", "past", "now"]);
  });

  it("pops only for the seller's own undecided months, in the last three days, soonest first", () => {
    const later = month({ id: "o2", cycle: monthCycle("2026-10-05") }); // renews 5 Nov
    const list = [later, month()];
    expect(renewalPopupMonths(list, "anil", "2026-10-30")).toEqual([]); // 4 days out
    expect(renewalPopupMonths(list, "anil", "2026-10-31").map((x) => x.id)).toEqual(["o1"]);
    expect(renewalPopupMonths(list, "anil", "2026-11-02").map((x) => x.id)).toEqual(["o1", "o2"]);
    expect(renewalPopupMonths(list, "anil", "2026-11-03").map((x) => x.id)).toEqual(["o1", "o2"]); // the day itself
    expect(renewalPopupMonths(list, "anil", "2026-11-04").map((x) => x.id)).toEqual(["o2"]); // o1's date has passed
    expect(renewalPopupMonths(list, "someone_else", "2026-11-01")).toEqual([]);
  });

  it("stops once there is a decision — but a pitch is not one", () => {
    const today = "2026-11-01";
    expect(renewalPopupMonths([month({ renewal: { state: "won", nextCampaignId: "o9" } })], "anil", today)).toEqual([]);
    expect(renewalPopupMonths([month({ renewal: { state: "lost" } })], "anil", today)).toEqual([]);
    expect(renewalPopupMonths([month({ history: true })], "anil", today)).toEqual([]);
    expect(renewalPopupMonths([month({ status: "renewed" })], "anil", today)).toEqual([]);
    expect(renewalPopupMonths([month({ renewal: { state: "pitched" } })], "anil", today)).toHaveLength(1);
  });

  it("counts the promised pieces at each stage, with promises that have no row yet", () => {
    const c2 = month({
      commitments: { poster: 3, ai_ad: 2, real_video: 0 },
      items: [...month().items, item("poster", { extra: true, status: "posted" })],
    });
    const t = toneCounts(c2, "2026-10-31");
    expect(t).toMatchObject({ done: 2, wait: 1, late: 1, unplanned: 1, total: 5 });
  });

  it("remembers a popup per seller, per month, per day", () => {
    expect(renewalPopupSeenKey("anil", "o1", "2026-10-31")).toBe("dts_smm_renewal_popup_anil_o1_2026-10-31");
  });
});

function Where() {
  const loc = useLocation();
  return <span data-test="where">{loc.pathname + loc.search}</span>;
}

function mount() {
  return render(
    <MemoryRouter initialEntries={["/sales/dashboard"]}>
      <SmmRenewalPopup />
      <Routes><Route path="*" element={<Where />} /></Routes>
    </MemoryRouter>,
  );
}

const popup = () => document.querySelector('[data-test="smm-renewal-popup"]') as HTMLElement | null;

describe("the popup", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 31, 10)); // 31 Oct — 3 days to renewal
    localStorage.clear();
    renew.mockClear();
    AUTH = { user: { uid: "anil", name: "Anil", role: "sales_member" } };
    BOARD = [month()];
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows the seller the countdown and the month's work report", () => {
    mount();
    const p = popup()!;
    expect(p).toBeTruthy();
    expect(p.getAttribute("data-days")).toBe("3");
    expect(within(p).getByText("3 days to renewal")).toBeTruthy();
    expect(within(p).getByText("Sri Sai Silks")).toBeTruthy();
    const steps = [...p.querySelectorAll('[data-test="smm-renewal-step"]')].map((s) => s.getAttribute("data-state"));
    expect(steps).toEqual(["now", "next", "next", "next"]);
    expect(p.querySelector('[data-test="smm-timeline"]')).toBeTruthy();
    expect(p.querySelectorAll('[data-test="smm-timeline-dot"]').length).toBe(4);
    expect(p.querySelector('[data-test="smm-renewal-percent"]')!.textContent).toBe("50%");
    expect(p.querySelector('[data-test="smm-renewal-stage-done"]')).toBeTruthy();
    expect(p.querySelector('[data-test="smm-renewal-stage-late"]')).toBeTruthy();
    expect(p.querySelector('[data-test="smm-renewal-bar-ai_ad"]')).toBeTruthy();
    expect(p.querySelector('[data-test="smm-renewal-next"]')!.textContent).toContain("3 Nov → 3 Dec 2026");
    expect(within(p).getByText(/still waiting for the client's approval/)).toBeTruthy();
  });

  it("pops once a day: Later hides it until tomorrow, when it comes back at two days", () => {
    const first = mount();
    fireEvent.click(screen.getByText("Later"));
    expect(popup()).toBeNull();
    expect(localStorage.getItem(renewalPopupSeenKey("anil", "o1", "2026-10-31"))).toBe("1");
    first.unmount();

    mount();
    expect(popup()).toBeNull(); // same day, another page
    cleanup();

    vi.setSystemTime(new Date(2026, 10, 1, 9));
    mount();
    expect(popup()!.getAttribute("data-days")).toBe("2");
    expect(within(popup()!).getByText("2 days to renewal")).toBeTruthy();
  });

  it("says 'today' on the renewal day, and nothing once the date has passed or before the three days", () => {
    vi.setSystemTime(new Date(2026, 10, 3, 9));
    mount();
    expect(within(popup()!).getByText("Renewal is today")).toBeTruthy();
    cleanup();

    vi.setSystemTime(new Date(2026, 10, 4, 9));
    mount();
    expect(popup()).toBeNull();
    cleanup();

    vi.setSystemTime(new Date(2026, 9, 30, 9));
    mount();
    expect(popup()).toBeNull();
  });

  it("is only for the salesperson who sold it", () => {
    AUTH = { user: { uid: "arjun", name: "Arjun", role: "tech_member" } };
    mount();
    expect(popup()).toBeNull();
    cleanup();
    AUTH = { user: { uid: "sunita", name: "Sunita", role: "sales_member" } };
    mount();
    expect(popup()).toBeNull();
  });

  it("steps through several clients, and the close button sets them all aside for today", () => {
    // Renews 2 Nov — two days out, so it comes first.
    BOARD = [month(), month({ id: "o2", businessName: "Lakshmi Jewellers", cycle: monthCycle("2026-10-02") })];
    mount();
    expect(screen.getByText("1 of 2")).toBeTruthy();
    expect(within(popup()!).getByText("Lakshmi Jewellers")).toBeTruthy();
    expect(popup()!.getAttribute("data-days")).toBe("2");
    fireEvent.click(screen.getByLabelText("Next client"));
    expect(within(popup()!).getByText("Sri Sai Silks")).toBeTruthy();
    expect(popup()!.getAttribute("data-days")).toBe("3");
    fireEvent.click(screen.getByLabelText("Close for today"));
    expect(popup()).toBeNull();
    expect(localStorage.getItem(renewalPopupSeenKey("anil", "o2", "2026-10-31"))).toBe("1");
  });

  it("Full report opens the month on its Report tab; Renew starts the renewal sale", async () => {
    mount();
    fireEvent.click(screen.getByText("Full report"));
    expect(screen.getByText("/smm/o1?tab=report", { selector: '[data-test="where"]' })).toBeTruthy();
    expect(popup()).toBeNull();
    cleanup();

    vi.setSystemTime(new Date(2026, 10, 1, 9));
    mount();
    await act(async () => { fireEvent.click(screen.getByText("Renew")); });
    expect(renew).toHaveBeenCalledTimes(1);
    expect((renew.mock.calls[0][0] as SmmCampaign).id).toBe("o1");
  });
});

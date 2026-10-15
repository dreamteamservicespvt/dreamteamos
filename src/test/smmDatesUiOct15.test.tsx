/**
 * The screens of the 2026-10-15 date rules, rendered for real (jsdom):
 *   • the card / month header glance says "9 posts are dated outside 6 Oct – 5 Nov" in amber, with the fix,
 *     and the ring names "Posted outside its dates" only when there is one;
 *   • the Content list tags a row dated outside the month "Outside this month" (table and phone cards);
 *   • the post dialog warns, without blocking, when the picked date is outside the month — the renewal day too;
 *   • the posted chip counts "Up …" from the upload date, not from when Posted was pressed;
 *   • the timeline's today marker sits exactly on the edge of its shaded part, and the posts dated outside
 *     are counted under it instead of being dropped.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/services/smm", () => ({
  addItem: vi.fn(), addItems: vi.fn(), addApprovalChase: vi.fn(), assignItem: vi.fn(), recordApproval: vi.fn(),
  removeItem: vi.fn(), requestApproval: vi.fn(), setItemStatus: vi.fn(), updateItem: vi.fn(async () => undefined),
}));
vi.mock("@/components/smm/SmmCalendar", () => ({ default: () => null }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/store/authStore", () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { uid: "u1", name: "Arjun", role: "tech_member" } }) }));

const { MonthGlance } = await import("@/components/smm/SmmGlance");
const SmmContentTable = (await import("@/components/smm/SmmContentTable")).default;
const SmmItemDialog = (await import("@/components/smm/SmmItemDialog")).default;
const { DueChip } = await import("@/components/smm/SmmChips");
const { MonthTimeline } = await import("@/components/smm/SmmVisuals");
const { monthGlance } = await import("@/utils/smmGlance");
const { blankItem } = await import("@/utils/smmPlan");
import type { SmmCampaign, SmmContentItem } from "@/types/smm";

configure({ testIdAttribute: "data-test" });
afterEach(cleanup);

let seq = 0;
const item = (over: Partial<SmmContentItem> = {}): SmmContentItem => ({ ...blankItem("poster", ["instagram"]), id: `u${(seq += 1)}`, ...over });
const OCT = { month: "2026-10", startDate: "2026-10-06", endDate: "2026-11-06" };
const month = (over: Partial<SmmCampaign> = {}): SmmCampaign => ({
  id: "m", orderId: "m", leadId: "l", saleItemKey: "k", origin: "sale", clientPhone: "+919876543210",
  clientPhoneId: "919876543210", clientName: "Lakshmi", businessName: "Lakshmi Jewellers", packageKey: "Starter",
  packageLabel: "Starter", amount: 10000, cycle: OCT, platforms: ["instagram"],
  commitments: { poster: 3, ai_ad: 0, real_video: 0 }, items: [], ads: [], budgetPayments: [],
  team: { creator: { uid: "u1", name: "Arjun" }, publisher: null, marketer: null, assistants: [] },
  soldBy: "s1", soldByName: "Anil", watchers: ["s1", "u1"], status: "active", renewal: { state: "none" },
  ...over,
});
const OUTSIDE_MONTH = month({
  items: [
    item({ title: "August post", status: "posted", uploadDate: "2026-08-13" }),
    item({ title: "Renewal-day post", uploadDate: "2026-11-06" }),
    item({ title: "Inside", status: "posted", uploadDate: "2026-10-10" }),
  ],
});

describe("the glance on the card and the month's header", () => {
  it("says in amber how many posts are dated outside the month, and how to fix it", () => {
    render(<MonthGlance glance={monthGlance(OUTSIDE_MONTH, "2026-10-15")} />);
    const note = screen.getByTestId("smm-dated-outside");
    expect(note.textContent).toMatch(/2 posts are dated outside 6 Oct – 5 Nov\./);
    expect(note.textContent).toMatch(/fix their upload dates in the Content list/);
    // The ring names the posted-outside part (1: the August post).
    expect(screen.getByTestId("smm-bucket-outside").textContent).toBe("1");
    expect(screen.getByTestId("smm-ring-count").textContent).toBe("1/3");
  });

  it("says nothing extra for a month whose posts are all inside it", () => {
    render(<MonthGlance glance={monthGlance(month({ items: [item({ status: "posted", uploadDate: "2026-10-10" })] }), "2026-10-15")} layout="wide" />);
    expect(screen.queryByTestId("smm-dated-outside")).toBeNull();
    expect(screen.queryByTestId("smm-bucket-outside")).toBeNull();
  });
});

describe("the Content list", () => {
  it("tags each row dated outside the month — in the table and on the phone cards", () => {
    render(<MemoryRouter><SmmContentTable campaign={OUTSIDE_MONTH} canEdit={false} onOpen={vi.fn()} /></MemoryRouter>);
    const tagged = (rows: HTMLElement[]) => rows.filter((r) => within(r).queryByTestId("smm-row-outside")).map((r) => within(r).getAllByText(/post|Inside/)[0].textContent);
    expect(tagged(screen.getAllByTestId("smm-row"))).toEqual(["August post", "Renewal-day post"]);
    expect(tagged(screen.getAllByTestId("smm-card"))).toEqual(["August post", "Renewal-day post"]);
    expect(screen.getAllByTestId("smm-row-outside")[0].textContent).toBe("Outside this month");
    expect(screen.getAllByTestId("smm-row-outside")[0].getAttribute("title")).toMatch(/6 Oct – 5 Nov/);
  });
});

describe("the post dialog", () => {
  it("warns — without blocking — when the date picked is outside the month, the renewal day included", () => {
    const post = item({ title: "Diwali" });
    render(<SmmItemDialog campaign={month({ items: [post] })} item={post} user={{ uid: "u1", name: "Arjun", role: "tech_member" }}
      members={[]} onClose={vi.fn()} onMessage={vi.fn()} />);
    expect(screen.queryByTestId("smm-item-date-outside")).toBeNull();
    fireEvent.change(screen.getByTestId("smm-item-date"), { target: { value: "2026-11-06" } });
    expect(screen.getByTestId("smm-item-date-outside").textContent)
      .toBe("This date is outside this month (6 Oct – 5 Nov). It will not count toward this month.");
    expect((screen.getByTestId("smm-item-date") as HTMLInputElement).value).toBe("2026-11-06"); // kept
    fireEvent.change(screen.getByTestId("smm-item-date"), { target: { value: "2026-11-05" } });
    expect(screen.queryByTestId("smm-item-date-outside")).toBeNull();
  });
});

describe("the posted chip", () => {
  it("counts from the upload date, not from the day Posted was pressed", () => {
    const pressedToday = { toMillis: () => new Date(2026, 9, 15, 10).getTime() };
    render(<DueChip item={item({ status: "posted", uploadDate: "2026-08-13", postedAt: pressedToday })} today="2026-10-15" />);
    expect(screen.getByTestId("smm-due-up").textContent).toBe("Up 63d ago");
  });
});

describe("the month's timeline", () => {
  it("puts today on the edge of the shaded part, and counts the posts it cannot show", () => {
    const { container } = render(<MonthTimeline cycle={OCT} today="2026-10-20" items={OUTSIDE_MONTH.items} />);
    const marker = screen.getByTestId("smm-timeline-today") as HTMLElement;
    const shaded = container.querySelector("[data-test=smm-timeline] .bg-foreground\\/15") as HTMLElement;
    // 6 Oct … 20 Oct is 15 of its 31 own days, today included.
    expect(marker.style.left).toBe(shaded.style.width);
    expect(parseFloat(marker.style.left)).toBeCloseTo((15 / 31) * 100, 3);
    expect(screen.getAllByTestId("smm-timeline-dot")).toHaveLength(1); // only the post inside the month
    expect(screen.getByTestId("smm-timeline-outside").textContent).toMatch(/^2 posts are dated outside 6 Oct – 5 Nov/);
    expect(screen.getByTestId("smm-timeline-left").textContent).toBe("17 days left");
  });
});

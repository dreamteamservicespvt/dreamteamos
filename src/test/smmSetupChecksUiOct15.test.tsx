import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";

/**
 * The screens of the month-dates checks (2026-10-15), in jsdom with the real components:
 *   • Edit setup lists the posts a change of dates would leave outside and saves only on "Keep the new dates
 *     anyway", carrying exactly those posts' ids; an overlap names the client's other month with Open;
 *   • the setup form shows a month's own days and its renewal day, files it as history ON its end date, and
 *     keeps the client's billing day in the automatic end;
 *   • the post dialog offers "Move to Month 2 (6 Oct – 5 Nov)" for a post dated in another month of the
 *     client — to the admins and team leaders only;
 *   • Months to check lists the months whose dates need a person's eye, each with Open.
 */

const applyMonthSetup = vi.fn();
const applyHistorySetup = vi.fn();
const movePieceToMonth = vi.fn(async () => ({ replacedBlank: true, toLabel: "October 2026" }));
const fetchClientMonths = vi.fn();
const toast = vi.fn();

vi.mock("@/services/firebase", () => ({ db: {}, auth: {} }));
vi.mock("@/services/smm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/smm")>()),
  fetchAssignableMembers: vi.fn(async () => [{ uid: "arjun", name: "Arjun" }]),
  createRenewalMonth: vi.fn(),
  movePieceToMonth,
  fetchClientMonths,
  updateItem: vi.fn(async () => undefined),
}));
vi.mock("@/services/smmSetup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/smmSetup")>()),
  applyMonthSetup,
  applyHistorySetup,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const { SmmSetupDialog, default: SmmSetupForm, setupValueOf } = await import("@/components/smm/SmmSetupForm");
const SmmItemDialog = (await import("@/components/smm/SmmItemDialog")).default;
const SmmMonthsToCheck = (await import("@/components/smm/SmmMonthsToCheck")).default;
const { SmmMonthDatesError } = await import("@/services/smm");
const { monthDatesCheck } = await import("@/utils/smmMonthDates");
const { __clearClientMonthsCache } = await import("@/hooks/useSmmClientMonths");
const { blankItem } = await import("@/utils/smmPlan");

configure({ testIdAttribute: "data-test" });
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T10:00:00"));
  applyMonthSetup.mockReset(); applyHistorySetup.mockReset(); movePieceToMonth.mockClear(); fetchClientMonths.mockReset();
  toast.mockClear(); __clearClientMonthsCache();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const ADMIN = { uid: "kiran", name: "Kiran", role: "tech_admin", createdBy: null } as const;
const post = (id: string, title: string, day: string) => ({
  ...blankItem("poster", ["instagram"]), id, title, uploadDate: day, status: "posted",
  approval: { state: "approved", askedAt: null, respondedAt: null, note: null, byName: null, chases: [] },
});
const MONTH = {
  id: "dl", orderId: "", origin: "no_sale", businessName: "Dhana lakshmi", clientName: "Dhana lakshmi", clientPhone: "+919876543210",
  clientPhoneId: "919876543210", packageKey: "Plus Package", packageLabel: "Plus Package", amount: 0,
  cycle: { month: "2026-10", startDate: "2026-10-06", endDate: "2026-11-06" }, platforms: ["instagram"],
  commitments: { ai_ad: 0, poster: 3, real_video: 0 },
  items: [post("p1", "Gold offer", "2026-08-13"), post("p4", "Temple jewellery", "2026-09-09"), post("p5", "Dussehra offers", "2026-10-09")],
  ads: [], budgetPayments: [], team: { creator: { uid: "arjun", name: "Arjun" }, publisher: null, marketer: null, assistants: [] },
  soldBy: "anil", soldByName: "Anil", watchers: ["anil", "arjun"], status: "active", monthNumber: 1,
  renewal: { state: "none", at: null, byName: null, note: null, nextCampaignId: null }, setupAt: { seconds: 1 },
};

describe("Edit setup asks before leaving posts outside the new dates", () => {
  it("lists them, and saves only on Keep the new dates anyway — with exactly those posts", async () => {
    const verdict = monthDatesCheck({ month: MONTH as never, next: { startDate: "2026-09-06", endDate: "2026-10-06" }, others: [], today: "2026-10-15" });
    applyMonthSetup.mockRejectedValueOnce(new SmmMonthDatesError(verdict)).mockResolvedValueOnce({ campaignId: "dl", history: false, assign: null });
    const onClose = vi.fn();
    render(<MemoryRouter><SmmSetupDialog campaign={MONTH as never} user={ADMIN as never} onClose={onClose} /></MemoryRouter>);
    fireEvent.change(screen.getByTestId("smm-setup-start"), { target: { value: "2026-09-06" } });
    expect(screen.getByTestId("smm-setup-range").textContent).toMatch(/6 Sep – 5 Oct · 30 days · renews 6 Oct/);
    fireEvent.click(screen.getByTestId("smm-setup-save"));

    const box = await screen.findByTestId("smm-dates-outside");
    expect(box.textContent).toMatch(/These 2 posts will be outside the month's new dates/);
    expect(screen.getByTestId("smm-dates-outside-list").textContent).toMatch(/Gold offer13 Aug · posted · already outside before/);
    expect(screen.getByTestId("smm-dates-outside-list").textContent).toMatch(/Dussehra offers9 Oct · posted$/);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("smm-dates-keep"));
    await waitFor(() => expect(applyMonthSetup).toHaveBeenCalledTimes(2));
    expect(applyMonthSetup.mock.calls[1][1]).toMatchObject({ startDate: "2026-09-06", endDate: "2026-10-06", confirmedOutside: ["p1", "p5"] });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("names the client's month the dates overlap, with Open that month", async () => {
    const verdict = monthDatesCheck({
      month: { ...MONTH, items: [] } as never, next: { startDate: "2026-10-01", endDate: "2026-11-01" }, today: "2026-10-15",
      others: [{ id: "sep", status: "active", monthNumber: 1, cycle: { month: "2026-09", startDate: "2026-09-06", endDate: "2026-10-06" } }],
    });
    applyMonthSetup.mockRejectedValueOnce(new SmmMonthDatesError(verdict));
    render(<MemoryRouter><SmmSetupDialog campaign={MONTH as never} user={ADMIN as never} onClose={vi.fn()} /></MemoryRouter>);
    fireEvent.change(screen.getByTestId("smm-setup-start"), { target: { value: "2026-10-01" } });
    fireEvent.click(screen.getByTestId("smm-setup-save"));
    const refused = await screen.findByTestId("smm-dates-refused");
    expect(refused.textContent).toMatch(/overlap the client's Month 1 · September 2026 \(6 Sep → 6 Oct 2026\)/);
    expect(screen.getByTestId("smm-dates-overlap-open").getAttribute("href")).toBe("/smm/sep");
    expect(screen.queryByTestId("smm-dates-keep")).toBeNull();
  });
});

describe("the setup form's dates", () => {
  const Harness = ({ initial }: { initial: ReturnType<typeof setupValueOf> }) => {
    const [v, setV] = useState(initial);
    return <SmmSetupForm value={v} onChange={setV} members={[]} />;
  };

  it("is history ON its end date (the renewal day) and counts own days", () => {
    render(<Harness initial={{ ...setupValueOf(null, "2026-09-15"), endDate: "2026-10-15" }} />);
    expect(screen.getByTestId("smm-setup-range").textContent).toMatch(/15 Sep – 14 Oct · 30 days · renews 15 Oct/);
    expect(screen.getByTestId("smm-setup-history")).toBeTruthy();
  });

  it("keeps the client's billing day while the start is unchanged (28 Feb → 31 Mar)", () => {
    const month = { ...MONTH, cycle: { month: "2027-02", startDate: "2027-02-28", endDate: "2027-03-31", anchorDay: 31 } };
    const initial = setupValueOf(month as never);
    expect(initial).toMatchObject({ endDate: "2027-03-31", endTouched: false });
    render(<Harness initial={initial} />);
    fireEvent.change(screen.getByTestId("smm-setup-start"), { target: { value: "2027-03-01" } });
    expect((screen.getByTestId("smm-setup-end") as HTMLInputElement).value).toBe("2027-04-01");
    fireEvent.change(screen.getByTestId("smm-setup-start"), { target: { value: "2027-02-28" } });
    expect((screen.getByTestId("smm-setup-end") as HTMLInputElement).value).toBe("2027-03-31");
  });
});

describe("a post dated in another month of the client", () => {
  const SEP = { ...MONTH, id: "sep", cycle: { month: "2026-09", startDate: "2026-09-06", endDate: "2026-10-06" } };
  const OCT = { ...MONTH, id: "oct", monthNumber: 2, items: [], cycle: { month: "2026-10", startDate: "2026-10-06", endDate: "2026-11-06" } };
  const DUSSEHRA = SEP.items[2];

  it("is offered Move to Month 2 by an admin, and moves", async () => {
    fetchClientMonths.mockResolvedValue([SEP, OCT]);
    const onClose = vi.fn();
    render(<MemoryRouter><SmmItemDialog campaign={SEP as never} item={DUSSEHRA as never} user={ADMIN as never} members={[]} onClose={onClose} onMessage={vi.fn()} /></MemoryRouter>);
    const button = await screen.findByTestId("smm-item-move-button");
    expect(button.textContent).toMatch(/Move to Month 2 \(6 Oct – 5 Nov\)/);
    fireEvent.click(button);
    await waitFor(() => expect(movePieceToMonth).toHaveBeenCalledWith("sep", "oct", "p5", ADMIN));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fetchClientMonths).toHaveBeenCalledWith("919876543210");
  });

  it("is not offered to a member on the month — and the client's months are not read for them", async () => {
    fetchClientMonths.mockResolvedValue([SEP, OCT]);
    render(<MemoryRouter><SmmItemDialog campaign={SEP as never} item={DUSSEHRA as never} user={{ uid: "arjun", name: "Arjun", role: "tech_member" } as never} members={[]} onClose={vi.fn()} onMessage={vi.fn()} /></MemoryRouter>);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("smm-item-move")).toBeNull();
    expect(fetchClientMonths).not.toHaveBeenCalled();
  });

  it("is not offered for a post on its own month's days", async () => {
    fetchClientMonths.mockResolvedValue([SEP, OCT]);
    render(<MemoryRouter><SmmItemDialog campaign={SEP as never} item={SEP.items[1] as never} user={ADMIN as never} members={[]} onClose={vi.fn()} onMessage={vi.fn()} /></MemoryRouter>);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("smm-item-move")).toBeNull();
    expect(fetchClientMonths).not.toHaveBeenCalled();
  });
});

describe("Months to check", () => {
  it("is folded to a count until opened, then lists each month with its reasons and Open", () => {
    render(<MemoryRouter><SmmMonthsToCheck months={[MONTH as never, { ...MONTH, id: "fine", businessName: "Fine", clientPhoneId: "1", items: [] } as never]} today="2026-10-15" /></MemoryRouter>);
    expect(screen.getByTestId("smm-months-to-check").textContent).toMatch(/Months to check \(1\)/);
    expect(screen.queryByTestId("smm-months-to-check-list")).toBeNull();
    fireEvent.click(screen.getByTestId("smm-months-to-check-toggle"));
    expect(screen.getByTestId("smm-month-to-check").textContent).toMatch(/Dhana lakshmi2 posts are dated outside 6 Oct – 5 Nov/);
    expect(screen.getByTestId("smm-month-to-check-open").getAttribute("href")).toBe("/smm/dl");
  });

  it("shows nothing when every month's dates fit", () => {
    render(<MemoryRouter><SmmMonthsToCheck months={[{ ...MONTH, items: [] } as never]} today="2026-10-15" /></MemoryRouter>);
    expect(screen.queryByTestId("smm-months-to-check")).toBeNull();
  });
});

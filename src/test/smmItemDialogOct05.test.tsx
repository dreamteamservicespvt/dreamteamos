import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * The post dialog, 2026-10-05 (the owner filling in an old client's earlier months):
 *   • on a history month a post has no approval step — Posted is open — but it needs the day it went up,
 *     and the date just typed is saved before the post is marked posted;
 *   • a running month keeps the rule: Scheduled and Posted wait for the client's recorded approval;
 *   • what was typed in the second before the dialog closed is saved, not lost with the autosave timer.
 */

const updateItem = vi.fn(async (_c: string, _i: string, _p: Record<string, unknown>) => undefined);
const setItemStatus = vi.fn(async (_c: string, _i: string, _s: string, _a: unknown) => undefined);
const toast = vi.fn();

vi.mock("@/services/smm", () => ({
  addApprovalChase: vi.fn(), assignItem: vi.fn(), recordApproval: vi.fn(), removeItem: vi.fn(), requestApproval: vi.fn(),
  setItemStatus, updateItem,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const SmmItemDialog = (await import("@/components/smm/SmmItemDialog")).default;

configure({ testIdAttribute: "data-test" });
beforeEach(() => { updateItem.mockClear(); setItemStatus.mockClear(); toast.mockClear(); });
afterEach(cleanup);

const ITEM = {
  id: "i1", kind: "poster", title: "", uploadDate: null, uploadTime: null, platforms: ["instagram"], status: "planned",
  approval: { state: "not_sent", askedAt: null, respondedAt: null, note: null, byName: null, chases: [] }, extra: false, postedAt: null,
};
const MONTH = {
  id: "c1", orderId: "", origin: "no_sale", businessName: "AIRAVATH", clientName: "AIRAVATH", clientPhone: "+13213899564",
  clientPhoneId: "13213899564", packageKey: "Starter Package", packageLabel: "Starter Package", amount: 0,
  cycle: { month: "2026-08", startDate: "2026-08-24", endDate: "2026-09-24" }, platforms: ["instagram", "facebook"],
  commitments: { ai_ad: 4, poster: 4, real_video: 0 }, items: [ITEM], ads: [], budgetPayments: [],
  team: { creator: null, publisher: null, marketer: null, assistants: [] }, soldBy: "govardhan", soldByName: "Govardhan",
  watchers: ["govardhan"], status: "completed", renewal: { state: "none" },
};
const USER = { uid: "aswintha", name: "Aswintha", role: "tech_member" as const };

function open(campaign: Record<string, unknown>, item: Record<string, unknown> = ITEM) {
  return render(<SmmItemDialog campaign={campaign as never} item={item as never} user={USER} members={[]} onClose={vi.fn()} onMessage={vi.fn()} />);
}

describe("a post on a history month", () => {
  it("has no approval step, and Posted is open", () => {
    open({ ...MONTH, history: true });
    expect(screen.getByTestId("smm-history-approval").textContent).toMatch(/no approval step/);
    expect(screen.queryByTestId("smm-approval-toggle")).toBeNull();
    expect((screen.getByTestId("smm-set-status-posted") as HTMLButtonElement).disabled).toBe(false);
  });

  it("asks for the day it went up first, then saves that day and marks it posted", async () => {
    open({ ...MONTH, history: true });
    fireEvent.click(screen.getByTestId("smm-set-status-posted"));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Give it the day it went up first" }));
    expect(setItemStatus).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("smm-item-date"), { target: { value: "2026-08-28" } });
    fireEvent.click(screen.getByTestId("smm-set-status-posted"));
    await waitFor(() => expect(setItemStatus).toHaveBeenCalledWith("c1", "i1", "posted", USER));
    expect(updateItem).toHaveBeenCalledWith("c1", "i1", { uploadDate: "2026-08-28", uploadTime: null });
    expect(updateItem.mock.invocationCallOrder[0]).toBeLessThan(setItemStatus.mock.invocationCallOrder[0]);
  });
});

describe("a post on a running month", () => {
  it("keeps Scheduled and Posted shut until the client's approval is recorded", () => {
    open({ ...MONTH, status: "active" });
    expect(screen.getByTestId("smm-approval-toggle")).toBeTruthy();
    expect(screen.queryByTestId("smm-history-approval")).toBeNull();
    expect((screen.getByTestId("smm-set-status-posted") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("closing the dialog", () => {
  it("saves what was typed a moment before — it is not lost with the autosave timer", async () => {
    const view = open({ ...MONTH, history: true });
    fireEvent.change(screen.getByTestId("smm-item-title"), { target: { value: "Krishnashtami wishes" } });
    view.unmount();
    await waitFor(() => expect(updateItem).toHaveBeenCalledTimes(1));
    expect(updateItem.mock.calls[0][0]).toBe("c1");
    expect(updateItem.mock.calls[0][2]).toMatchObject({ title: "Krishnashtami wishes" });
  });

  it("writes nothing when nothing was changed", async () => {
    const view = open({ ...MONTH, history: true });
    view.unmount();
    await new Promise((r) => setTimeout(r, 50));
    expect(updateItem).not.toHaveBeenCalled();
  });
});

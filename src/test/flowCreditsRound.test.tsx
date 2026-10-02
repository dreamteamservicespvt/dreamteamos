/**
 * The Flow credits question at hand-in, rendered — the first time and on a later round.
 *
 * A job sent back for edits (or undone, or reassigned) is made again, and those clips cost credits
 * too. The later round must ask only for what it made — starting from no clips — add to the job's
 * record, and let "none this round" through without writing over what the first round recorded.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { FlowAccount } from "@/types/flowAccounts";
import { DEFAULT_FLOW_SETTINGS, addMonths, isoToday } from "@/utils/flowAccounts";

const services = vi.hoisted(() => ({
  logFlowCredits: vi.fn(async (_input: unknown) => ({ logIds: ["l2"], total: 24 })),
  recordNoFlowCredits: vi.fn(async (_assignmentId: string, _reason: string, _actor: unknown) => {}),
  setFlowAccountInUse: vi.fn(async () => {}),
  updateFlowCreditLog: vi.fn(),
  deleteFlowCreditLog: vi.fn(),
}));
vi.mock("@/services/flowAccounts", () => services);
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const FlowCreditsDialog = (await import("@/components/flow/FlowCreditsDialog")).default;

const today = isoToday();
const createdOn = addMonths(today, -1);
const account: FlowAccount = {
  id: "ravi.one@gmail.com", email: "ravi.one@gmail.com", password: "x", authPhone: "+919876543210",
  createdOn, expiresOn: addMonths(createdOn, 18), monthlyCredits: 1000, status: "active",
  addedBy: "m1", addedByName: "Ravi", addedByRole: "tech_member", assignedTo: null, memberIds: ["m1"],
  teamAdminId: "admin", inUseBy: "m1", used: {}, history: [],
} as FlowAccount;
const actor = { uid: "m1", name: "Ravi", role: "tech_member" as const, createdBy: "admin" };
const job = { id: "job1", uniqueId: "P1042", businessName: "Sri Lakshmi Silks", displayTitle: "", category: "promotional", clipCount: 4 } as never;
const recorded = { total: 48, logIds: ["l1"], recordedAt: Date.now(), recordedBy: "m1" };

const open = (previous: typeof recorded | null) => {
  const onSaved = vi.fn();
  const view = render(
    <FlowCreditsDialog mode="complete" actor={actor} settings={DEFAULT_FLOW_SETTINGS} accounts={[account]}
      assignment={job} previous={previous} onClose={vi.fn()} onSaved={onSaved} />,
  );
  const q = (test: string) => view.container.querySelector(`[data-test="${test}"]`) as HTMLElement | null;
  return { ...view, q, onSaved };
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Flow credits at hand-in", () => {
  it("the first time: the whole ad, at the job's clip count", () => {
    const { q, getByRole } = open(null);
    expect(getByRole("dialog").getAttribute("aria-label")).toBe("Flow credits used for this ad");
    expect(q("credits-already")).toBeNull();
    expect((q("clips-s8-0") as HTMLInputElement).value).toBe("4");
    expect(q("credits-total")!.textContent).toContain("48 credits");
  });

  it("a later round starts from no clips, shows what is recorded, and adds to it", async () => {
    const { q, getByRole, onSaved } = open(recorded);
    expect(getByRole("dialog").getAttribute("aria-label")).toBe("Flow credits for this round");
    expect(q("credits-already")!.textContent).toContain("Already recorded on this job: 48 credits");
    expect((q("clips-s8-0") as HTMLInputElement).value).toBe("0");

    fireEvent.click(q("clips-s8-plus-0")!);
    fireEvent.click(q("clips-s8-plus-0")!);
    expect(q("credits-total")!.textContent).toContain("24 credits");
    fireEvent.click(q("credits-save")!);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(services.logFlowCredits).toHaveBeenCalledTimes(1);
    const call = services.logFlowCredits.mock.calls[0][0] as { entries: { accountId: string; clips: Record<string, number> }[]; assignment: { id: string } };
    expect(call.assignment.id).toBe("job1");
    expect(call.entries).toEqual([expect.objectContaining({ accountId: "ravi.one@gmail.com", clips: { s10: 0, s8: 2, s6: 0, s4: 0 } })]);
  });

  it("a later round with nothing new hands in without writing over the first round", async () => {
    const { q, onSaved } = open(recorded);
    fireEvent.click(q("credits-not-flow")!);
    expect(q("credits-not-flow")!.closest("label")!.textContent).toContain("No Flow credits used in this round");
    expect(q("credits-not-flow-reason")).toBeNull();
    expect(q("credits-save")!.textContent).toBe("Mark complete");
    fireEvent.click(q("credits-save")!);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(services.recordNoFlowCredits).not.toHaveBeenCalled();
    expect(services.logFlowCredits).not.toHaveBeenCalled();
  });

  it("the first time, “not made in Flow” must say where it was made", async () => {
    const { q, onSaved } = open(null);
    fireEvent.click(q("credits-not-flow")!);
    fireEvent.click(q("credits-save")!);
    await new Promise((r) => setTimeout(r, 20));
    expect(onSaved).not.toHaveBeenCalled();
    fireEvent.change(q("credits-not-flow-reason")!, { target: { value: "Grok" } });
    fireEvent.click(q("credits-save")!);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(services.recordNoFlowCredits).toHaveBeenCalledWith("job1", "Grok", actor);
  });
});

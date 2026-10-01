import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Social Media Management, 2026-10-01: deleting a month, the Social Media Team Lead, and extra work
 * chosen by type and duration — on the in-memory Firestore, so writes, listeners and the "a deleted
 * sold month never comes back" rule are exercised for real.
 */

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {} }));
const sendNotification = vi.fn(async (_p: Record<string, unknown>) => undefined);
vi.mock("@/services/notifications", () => ({ sendNotification }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const mem = await import("./memoryFirestore");
const smm = await import("@/services/smm");
const plan = await import("@/utils/smmPlan");
const { useAuthStore } = await import("@/store/authStore");
const SmmContentTable = (await import("@/components/smm/SmmContentTable")).default;
import type { SmmCampaign } from "@/types/smm";

configure({ testIdAttribute: "data-test" });

const ADMIN = { uid: "admin", name: "Kiran", role: "tech_admin" };
const sale = (orderId = "o_lead1_1790839133922") => ({
  orderId, leadId: "lead1", saleItemKey: "k1", clientPhone: "+919876543210", clientPhoneId: "9876543210",
  clientName: "Ravi", businessName: "Sri Sai Silks", packageKey: "smm_basic", packageLabel: "SMM Basic", amount: 6000,
  platforms: ["instagram" as const], commitments: { poster: 4, ai_ad: 2, real_video: 0 },
  soldBy: "seller1", soldByName: "Anil", startDate: "2026-10-01",
});
const campaign = (id: string) => mem.__read(`smm_campaigns/${id}`) as unknown as SmmCampaign | undefined;

beforeEach(() => { mem.__reset(); sendNotification.mockClear(); });
afterEach(cleanup);

describe("who may delete a month and appoint the team lead", () => {
  it("lets the main admin, tech admin and Social Media Team Lead delete — not every overseer", () => {
    expect(plan.canDeleteSmmCampaign({ role: "tech_admin" })).toBe(true);
    expect(plan.canDeleteSmmCampaign({ role: "main_admin" })).toBe(true);
    expect(plan.canDeleteSmmCampaign({ role: "tech_member", smmLeader: true })).toBe(true);
    expect(plan.canDeleteSmmCampaign({ role: "tech_team_leader" })).toBe(false);
    expect(plan.canDeleteSmmCampaign({ role: "sales_member" })).toBe(false);
    expect(plan.canAppointSmmLead({ role: "tech_admin" })).toBe(true);
    expect(plan.canAppointSmmLead({ role: "tech_member" })).toBe(false);
  });
});

describe("deleting a month", () => {
  it("removes a directly-added month outright", async () => {
    const id = await smm.createDirectCampaign({
      clientName: "Walk-in", businessName: "Walk-in Store", clientPhone: "9876543210", packageKey: "", packageLabel: "Custom",
      amount: 5000, platforms: ["instagram"], commitments: { poster: 2, ai_ad: 0, real_video: 0 }, startDate: "2026-10-01",
    }, ADMIN);
    expect(campaign(id)).toBeTruthy();
    await smm.deleteCampaign({ id, orderId: "" }, ADMIN);
    expect(campaign(id)).toBeUndefined();
  });

  it("keeps a sold month as a tombstone that editing or re-approving the sale never brings back", async () => {
    const input = sale();
    await smm.ensureCampaignForOrder(input);
    await smm.deleteCampaign({ id: input.orderId, orderId: input.orderId }, ADMIN);
    expect(campaign(input.orderId)).toMatchObject({ status: "deleted", deletedByName: "Kiran" });

    await smm.ensureCampaignForOrder({ ...input, businessName: "Sri Sai Silks & Sarees" });
    expect(campaign(input.orderId)).toMatchObject({ status: "deleted", businessName: "Sri Sai Silks" });
    await smm.setCampaignRemovedForOrders([input.orderId], false);
    expect(campaign(input.orderId)?.status).toBe("deleted");
  });
});

describe("the Social Media Team Lead", () => {
  it("is appointed and stood down from one place, and told both times", async () => {
    mem.__seed("users/ravi", { name: "Ravi", role: "tech_member", isActive: true });
    const seen: { uid: string }[][] = [];
    const stop = smm.watchSmmTeamLeads((l) => seen.push(l));
    await smm.setSmmTeamLead({ uid: "ravi", name: "Ravi" }, true, ADMIN);
    expect(mem.__read("users/ravi")?.smmLeader).toBe(true);
    await waitFor(() => expect(seen.at(-1)?.map((l) => l.uid)).toEqual(["ravi"]));
    expect(sendNotification.mock.calls[0][0]).toMatchObject({ userId: "ravi", type: "smm_lead", link: "/smm" });

    await smm.setSmmTeamLead({ uid: "ravi", name: "Ravi" }, false, ADMIN);
    await waitFor(() => expect(seen.at(-1)).toEqual([]));
    expect(sendNotification).toHaveBeenCalledTimes(2);
    stop();
  });

  it("is told when a new month is sold, once", async () => {
    mem.__seed("users/ravi", { name: "Ravi", role: "tech_member", isActive: true, smmLeader: true });
    mem.__seed("users/old", { name: "Old", role: "tech_member", isActive: false, smmLeader: true });
    await smm.ensureCampaignForOrder(sale());
    await smm.ensureCampaignForOrder(sale()); // an edit of the same sale
    const toLeads = sendNotification.mock.calls.map((c) => c[0]).filter((n) => n.type === "smm_new_month");
    expect(toLeads).toHaveLength(1);
    expect(toLeads[0]).toMatchObject({ userId: "ravi", link: "/smm/o_lead1_1790839133922" });
    expect(String(toLeads[0].message)).toContain("Sri Sai Silks");
  });
});

describe("extra work, by type and duration", () => {
  it("names the work, and needs a video's length", () => {
    expect(plan.extraWorkTitle("promotional", "32s")).toBe("Promotional video · 32 sec");
    expect(plan.extraWorkTitle("poster", "32s")).toBe("Poster");
    expect(plan.extraWorkTitle("cinematic", "45")).toBe("Cinematic video · 45 sec");
    expect(plan.extraWorkProblem("wishes", "")).toContain("duration");
    expect(plan.extraWorkProblem("poster", "")).toBe("");
    expect(plan.normaliseDuration("2")).toBe("");
    expect(plan.normaliseDuration(64)).toBe("64s");
  });

  it("records what was made and tells the seller what it was", async () => {
    const input = sale();
    await smm.ensureCampaignForOrder(input);
    await smm.addItem(input.orderId, { kind: "poster", extra: true, extraType: "wishes", extraDuration: "16s" }, ADMIN);
    const item = campaign(input.orderId)!.items.at(-1)!;
    expect(item).toMatchObject({ kind: "ai_ad", extra: true, extraType: "wishes", extraDuration: "16s", title: "Wishes video · 16 sec", extraCharge: "unbilled" });
    const toSeller = sendNotification.mock.calls.map((c) => c[0]).find((n) => n.type === "smm_extra_work");
    expect(toSeller).toMatchObject({ userId: "seller1" });
    expect(String(toSeller!.message)).toContain("Wishes video · 16 sec");
  });

  it("is chosen from a list on the plan, with a custom length for an odd video", async () => {
    const input = sale();
    await smm.ensureCampaignForOrder(input);
    useAuthStore.setState({ user: { uid: "admin", name: "Kiran", role: "tech_admin" } as never, loading: false });
    const { rerender } = render(<SmmContentTable campaign={campaign(input.orderId)!} canEdit onOpen={() => {}} />);

    fireEvent.click(screen.getByTestId("smm-add-extra"));
    fireEvent.change(screen.getByTestId("smm-extra-type"), { target: { value: "cinematic" } });
    fireEvent.change(screen.getByTestId("smm-extra-duration"), { target: { value: "custom" } });
    expect(screen.getByTestId("smm-extra-preview").textContent).toContain("duration");
    expect((screen.getByTestId("smm-extra-save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("smm-extra-seconds"), { target: { value: "45" } });
    expect(screen.getByTestId("smm-extra-preview").textContent).toContain("Cinematic video · 45 sec");
    fireEvent.click(screen.getByTestId("smm-extra-save"));

    await waitFor(() => expect(campaign(input.orderId)!.items.at(-1)).toMatchObject({ extraType: "cinematic", extraDuration: "45s" }));
    expect(screen.queryByTestId("smm-extra-form")).not.toBeInTheDocument();
    rerender(<SmmContentTable campaign={campaign(input.orderId)!} canEdit onOpen={() => {}} />);
    expect(screen.getAllByText(/Extra work · Cinematic video · 45 sec/).length).toBeGreaterThan(0);
  });
});

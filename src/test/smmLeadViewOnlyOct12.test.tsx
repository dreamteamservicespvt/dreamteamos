import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * The Social Media Team Lead as a hybrid role (owner, 2026-10-12): she SEES every month and everyone's
 * work, is view-only on a month somebody else works (no edit, delete or management), and on a month she
 * is personally on she works exactly like any member. Checked three ways — the one permission answer
 * (utils), the services refusing her writes on the in-memory Firestore (the "backend" check, mirroring
 * the Firestore rule in docs/firestore-rules.md), and the real month page rendered for her.
 */

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {}, auth: { currentUser: null } }));
const sendNotification = vi.fn(async (_p: Record<string, unknown>) => undefined);
vi.mock("@/services/notifications", () => ({ sendNotification }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn(() => ({ id: "t", dismiss: vi.fn(), update: vi.fn() })) }));

const mem = await import("./memoryFirestore");
const smm = await import("@/services/smm");
const smmSetup = await import("@/services/smmSetup");
const smmAssign = await import("@/services/smmAssign");
const plan = await import("@/utils/smmPlan");
const pkg = await import("@/utils/smmPackage");
const att = await import("@/utils/smmAttendance");
const { useAuthStore } = await import("@/store/authStore");
const SmmCampaignPage = (await import("@/pages/shared/SmmCampaignPage")).default;
import type { SmmCampaign, SmmTeam } from "@/types/smm";
import type { AppUser } from "@/types";

configure({ testIdAttribute: "data-test" });

const LEAD = { uid: "manasa", name: "Manasa", role: "tech_member", smmLeader: true, isActive: true } as AppUser;
const MEMBER = { uid: "arjun", name: "Arjun", role: "tech_member", isActive: true } as AppUser;
const ADMIN = { uid: "kiran", name: "Kiran", role: "tech_admin", isActive: true } as AppUser;
const LEADER_WITH_FLAG = { uid: "ravi", name: "Ravi", role: "tech_team_leader", smmLeader: true, isActive: true } as AppUser;

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const seat = (u: AppUser) => ({ uid: u.uid, name: u.name });
const teamOf = (u: AppUser): SmmTeam => ({ creator: seat(u), publisher: seat(u), marketer: null, assistants: [] });

/** A sold month built the way the app builds one, seeded straight into the in-memory database. */
function seedMonth(id: string, team: SmmTeam, extra: Partial<SmmCampaign> = {}): SmmCampaign {
  const built = smm.buildSoldCampaign({
    orderId: id, leadId: `lead_${id}`, saleItemKey: "k1", clientPhone: "+919876543210", clientPhoneId: `98765${id.length}3210`,
    clientName: "Client", businessName: id === "m_mine" ? "Sreerasthu Silvers" : "Lakshmi Jewellers",
    packageKey: "smm_basic", packageLabel: "SMM Basic", amount: 6000, platforms: ["instagram"],
    commitments: { poster: 2, ai_ad: 1, real_video: 0 }, soldBy: "anil", soldByName: "Anil",
  }, { startDate: day(-5), team });
  const month = { ...built, id, setupAt: { seconds: 1 }, setupByName: "Kiran", ...extra } as unknown as SmmCampaign;
  mem.__seed(`smm_campaigns/${id}`, month as unknown as Record<string, unknown>);
  return month;
}
const read = (id: string) => mem.__read(`smm_campaigns/${id}`) as unknown as SmmCampaign;
const signIn = (u: AppUser | null) => useAuthStore.setState({ user: u, loading: false });

beforeEach(() => {
  mem.__reset();
  sendNotification.mockClear();
  smm.__resetHistoryHoldCheckForTests();
  signIn(null);
});
afterEach(() => { cleanup(); signIn(null); });

describe("one answer to 'may this person work this month?'", () => {
  const other = { watchers: ["anil", "arjun"], soldBy: "anil", team: teamOf(MEMBER) };
  const mine = { watchers: ["anil", "manasa"], soldBy: "anil", team: teamOf(LEAD) };

  it("makes the lead view-only on a month somebody else works, and a member on her own", () => {
    expect(plan.isSmmOverseer(LEAD)).toBe(true); // she still SEES every month
    expect(plan.isViewOnlySmmLead(LEAD)).toBe(true);
    expect(plan.canEditCampaign(other, LEAD)).toBe(false);
    expect(plan.canEditCampaign(mine, LEAD)).toBe(true);
    // Exactly what a plain member gets on the same two months.
    expect(plan.canEditCampaign(other, MEMBER)).toBe(true);
    expect(plan.canEditCampaign(mine, MEMBER)).toBe(false);
  });

  it("gives her no managing right — not even on her own month — but keeps Edit team on the attendance board", () => {
    expect(pkg.canSetUpSmm(LEAD)).toBe(false);
    expect(plan.canDeleteSmmCampaign(LEAD)).toBe(false);
    expect(pkg.canRecordSmmSaleForSeller(LEAD)).toBe(false);
    expect(pkg.canAddNoSaleMonth(LEAD)).toBe(false); // owner, 2026-10-12: removed
    expect(pkg.canAdminRenewSmm(LEAD)).toBe(false);
    expect(att.canSeeSmmAttendance(LEAD)).toBe(true);
    expect(att.canEditSmmTeam(LEAD)).toBe(true); // owner, 2026-10-12: kept
  });

  it("never takes anything from a role that already runs Social Media", () => {
    expect(plan.isViewOnlySmmLead(LEADER_WITH_FLAG)).toBe(false);
    expect(plan.canEditCampaign(other, LEADER_WITH_FLAG)).toBe(true);
    expect(pkg.canSetUpSmm(LEADER_WITH_FLAG)).toBe(true);
    expect(plan.canDeleteSmmCampaign(LEADER_WITH_FLAG)).toBe(true);
    for (const role of ["main_admin", "tech_admin", "sales_admin", "tech_team_leader"]) {
      expect(plan.canEditCampaign(other, { uid: "x", role })).toBe(true);
    }
    expect(pkg.canAddNoSaleMonth(ADMIN)).toBe(true);
  });
});

describe("the services refuse what the screens hide (the backend check)", () => {
  it("stops every working write on a month somebody else works, and leaves it exactly as it was", async () => {
    const other = seedMonth("m_other", teamOf(MEMBER));
    const before = JSON.stringify(read("m_other"));
    const item = other.items[0];
    signIn(LEAD);

    const writes: [string, () => Promise<unknown>][] = [
      ["updateItem", () => smm.updateItem("m_other", item.id, { title: "Mine now" })],
      ["setItemStatus", () => smm.setItemStatus("m_other", item.id, "in_progress", LEAD)],
      ["addItem", () => smm.addItem("m_other", { kind: "poster", extra: true, extraType: "poster" }, LEAD)],
      ["addItems", () => smm.addItems("m_other", "poster", 2, false)],
      ["removeItem", () => smm.removeItem("m_other", item.id)],
      ["assignItem", () => smm.assignItem("m_other", item.id, "maker", seat(LEAD))],
      ["requestApproval", () => smm.requestApproval("m_other", item.id)],
      ["recordApproval", () => smm.recordApproval("m_other", item.id, { approved: true }, LEAD)],
      ["addApprovalChase", () => smm.addApprovalChase("m_other", item.id, LEAD)],
      ["addAdRun", () => smm.addAdRun("m_other", { name: "Boost", scope: { kind: "all", itemIds: [] }, startDate: day(0), days: 3, dailyBudget: 200 })],
      ["addBudgetPayment", () => smm.addBudgetPayment("m_other", { amount: 1000, route: "direct", paidOn: day(0) } as never, LEAD)],
    ];
    for (const [name, write] of writes) {
      await expect(write(), name).rejects.toBeInstanceOf(smm.SmmViewOnlyError);
    }
    expect(JSON.stringify(read("m_other"))).toBe(before);
  });

  it("lets her work the month she is on, exactly like a member", async () => {
    const mine = seedMonth("m_mine", teamOf(LEAD));
    const item = mine.items[0];
    signIn(LEAD);
    await smm.updateItem("m_mine", item.id, { title: "Silver anklets reel" });
    await smm.setItemStatus("m_mine", item.id, "in_progress", LEAD);
    await smm.addItem("m_mine", { kind: "poster", extra: true, extraType: "poster" }, LEAD);
    const after = read("m_mine");
    expect(after.items.find((i) => i.id === item.id)).toMatchObject({ title: "Silver anklets reel", status: "in_progress" });
    expect(after.items).toHaveLength(mine.items.length + 1);
  });

  it("refuses every managing write — even on her own month — before anything is written", async () => {
    const mine = seedMonth("m_mine", teamOf(LEAD));
    const other = seedMonth("m_other", teamOf(MEMBER));
    signIn(LEAD);
    const setup = {
      startDate: day(-5), clipsPerVideo: 4, team: teamOf(LEAD), businessName: "Renamed", pageLinks: null,
    } as never;
    const actor = { uid: LEAD.uid, name: LEAD.name, role: LEAD.role };
    const managing: [string, () => Promise<unknown>][] = [
      ["deleteCampaign", () => smm.deleteCampaign({ id: mine.id, orderId: mine.orderId }, actor)],
      ["undoDeleteCampaign", () => smm.undoDeleteCampaign(other)],
      ["createRenewalMonth", () => smm.createRenewalMonth({ previousCampaignId: mine.id, actor })],
      ["setCampaignTeam", () => smm.setCampaignTeam(mine.id, teamOf(MEMBER))],
      ["setMonthCommitments", () => smm.setMonthCommitments(mine.id, { poster: 9, ai_ad: 9, real_video: 0 })],
      ["setMonthPlatforms", () => smm.setMonthPlatforms(mine.id, ["facebook"])],
      ["moveUnpostedToMonth", () => smm.moveUnpostedToMonth(other.id, mine.id, [other.items[0].id], actor)],
      ["renameMonth", () => smmSetup.renameMonth(mine.id, "Renamed")],
      ["applyMonthSetup", () => smmSetup.applyMonthSetup(mine.id, setup, actor)],
      ["applyHistorySetup", () => smmSetup.applyHistorySetup(mine.id, setup, actor)],
      ["assignSmmMonth", () => smmAssign.assignSmmMonth({ campaignId: other.id, team: teamOf(LEAD), assigner: actor })],
      ["addNoSaleMonth", () => smmSetup.addNoSaleMonth({ phone: "9876500000", seller: { uid: "anil", name: "Anil" }, packageKey: "smm_basic", platforms: ["instagram"], setup, actor } as never)],
    ];
    for (const [name, write] of managing) {
      await expect(write(), name).rejects.toBeInstanceOf(smm.SmmViewOnlyError);
    }
    expect(read("m_mine")).toMatchObject({ businessName: "Sreerasthu Silvers", status: "active" });
    expect(read("m_mine").team.creator?.uid).toBe("manasa");
    expect(mem.__all("work_assignments")).toEqual([]);
  });

  it("changes nothing for anybody else, or with nobody signed in", async () => {
    const other = seedMonth("m_other", teamOf(MEMBER));
    for (const who of [ADMIN, MEMBER, LEADER_WITH_FLAG, null]) {
      signIn(who);
      await smm.updateItem("m_other", other.items[0].id, { notes: `by ${who?.uid || "nobody"}` });
      expect(read("m_other").items[0].notes).toBe(`by ${who?.uid || "nobody"}`);
    }
    signIn(ADMIN);
    await smmSetup.renameMonth("m_other", "Lakshmi Gold");
    expect(read("m_other").businessName).toBe("Lakshmi Gold");
  });

  it("keeps the board's sweeps off months she may not change", async () => {
    const decided = { cycle: { month: day(-40).slice(0, 7), startDate: day(-40), endDate: day(-10) }, renewal: { state: "lost" as const, nextCampaignId: null } };
    const other = seedMonth("m_other", teamOf(MEMBER), decided as Partial<SmmCampaign>);
    const mine = seedMonth("m_mine", teamOf(LEAD), decided as Partial<SmmCampaign>);
    signIn(LEAD);
    const filed = await smm.closeEndedMonthsOnOpen([other, mine], day(0));
    expect(filed).toBe(1);
    expect(read("m_mine").status).toBe("lapsed");
    expect(read("m_other").status).toBe("active");
    // The company-wide one-time job never runs from her browser — not even its first read.
    expect(await smm.holdUnrenewedHistoryOnOpen({ uid: LEAD.uid, name: LEAD.name })).toBe(0);
    expect(mem.__read("app_settings/smm_history_hold")).toBeUndefined();

    signIn(ADMIN);
    expect(await smm.closeEndedMonthsOnOpen([read("m_other")], day(0))).toBe(1);
    expect(read("m_other").status).toBe("lapsed");
  });
});

describe("the month page, as the Team Lead sees it", () => {
  const openPage = (id: string) => render(
    <MemoryRouter initialEntries={[`/smm/${id}`]}>
      <Routes><Route path="/smm/:campaignId" element={<SmmCampaignPage />} /></Routes>
    </MemoryRouter>,
  );

  it("says View only on a month somebody else works and offers nothing that changes it", async () => {
    seedMonth("m_other", teamOf(MEMBER));
    signIn(LEAD);
    openPage("m_other");
    expect((await screen.findByTestId("smm-page-view-only")).textContent).toMatch(/View only/);
    for (const id of ["smm-delete-month", "smm-page-setup", "smm-rename", "smm-add-poster", "smm-add-extra", "smm-page-chat"]) {
      expect(screen.queryByTestId(id), id).toBeNull();
    }
    // Everyone's work is still there to read — open a post: every control is quiet.
    fireEvent.click(screen.getAllByTestId("smm-row")[0]);
    expect(await screen.findByTestId("smm-item-readonly")).toBeTruthy();
    expect((screen.getByTestId("smm-item-title") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByTestId("smm-item-delete")).toBeNull();
    fireEvent.click(screen.getByTestId("smm-item-close"));
    fireEvent.click(screen.getByTestId("smm-tab-report"));
    await screen.findByTestId("smm-report-panel");
    expect(screen.queryByTestId("smm-send-monthly")).toBeNull();
  });

  it("opens her own month with a member's tools and no View only note", async () => {
    seedMonth("m_mine", teamOf(LEAD));
    signIn(LEAD);
    openPage("m_mine");
    await screen.findByTestId("smm-page-business");
    expect(screen.queryByTestId("smm-page-view-only")).toBeNull();
    expect(screen.getByTestId("smm-add-poster")).toBeTruthy();
    // ...but still no setup, rename or delete: a member has none of those either.
    for (const id of ["smm-delete-month", "smm-page-setup", "smm-rename"]) expect(screen.queryByTestId(id), id).toBeNull();
    fireEvent.click(screen.getAllByTestId("smm-row")[0]);
    await screen.findByTestId("smm-item-title");
    expect(screen.queryByTestId("smm-item-readonly")).toBeNull();
    expect((screen.getByTestId("smm-item-title") as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("smm-item-close"));
    fireEvent.click(screen.getByTestId("smm-tab-report"));
    await waitFor(() => expect(screen.getByTestId("smm-send-monthly")).toBeTruthy());
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * "Create next renewal" — Month N+1 made straight away, with no renewal sale — is the main admin's and the
 * tech admin's alone (owner, 2026-10-13: "don't show this to the team lead, show this only to the admin and
 * the sales person"; asked, the salesperson keeps their own Renew, the renewal sale). Checked on the
 * service (whoever is signed in, as the view-only lead's guard reads them) and on the real month page and
 * its setup dialog for each role. The board's card is in smmAddSaleUi.
 */

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {}, auth: { currentUser: null } }));
const sendNotification = vi.fn(async (_p: Record<string, unknown>) => undefined);
vi.mock("@/services/notifications", () => ({ sendNotification }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn(() => ({ id: "t", dismiss: vi.fn(), update: vi.fn() })) }));

const mem = await import("./memoryFirestore");
const smm = await import("@/services/smm");
const { useAuthStore } = await import("@/store/authStore");
const SmmCampaignPage = (await import("@/pages/shared/SmmCampaignPage")).default;
import type { SmmCampaign, SmmTeam } from "@/types/smm";
import type { AppUser } from "@/types";

configure({ testIdAttribute: "data-test" });

const TECH_ADMIN = { uid: "kiran", name: "Kiran", role: "tech_admin", isActive: true } as AppUser;
const MAIN_ADMIN = { uid: "owner", name: "Owner", role: "main_admin", isActive: true } as AppUser;
const TEAM_LEADER = { uid: "ravi", name: "Ravi", role: "tech_team_leader", isActive: true } as AppUser;
const SELLER = { uid: "anil", name: "Anil", role: "sales_member", isActive: true } as AppUser;
const MEMBER = { uid: "arjun", name: "Arjun", role: "tech_member", isActive: true } as AppUser;

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const team: SmmTeam = { creator: { uid: MEMBER.uid, name: MEMBER.name }, publisher: null, marketer: null, assistants: [] };

/** A sold month that ended ten days ago with no renewal decision — locked, on hold, its renewal due. */
function seedEndedMonth(id = "m_ended"): SmmCampaign {
  const built = smm.buildSoldCampaign({
    orderId: id, leadId: `lead_${id}`, saleItemKey: "k1", clientPhone: "+919876543210", clientPhoneId: "919876543210",
    clientName: "Client", businessName: "Lakshmi Jewellers", packageKey: "smm_basic", packageLabel: "SMM Basic",
    amount: 6000, platforms: ["instagram"], commitments: { poster: 2, ai_ad: 1, real_video: 0 },
    soldBy: SELLER.uid, soldByName: SELLER.name,
  }, { startDate: day(-40), team });
  const month = { ...built, id, setupAt: { seconds: 1 }, setupByName: "Kiran" } as unknown as SmmCampaign;
  mem.__seed(`smm_campaigns/${id}`, month as unknown as Record<string, unknown>);
  return month;
}
const read = (id: string) => mem.__read(`smm_campaigns/${id}`) as unknown as SmmCampaign;
const signIn = (u: AppUser | null) => useAuthStore.setState({ user: u, loading: false });

beforeEach(() => {
  mem.__reset();
  sendNotification.mockClear();
  signIn(null);
});
afterEach(() => { cleanup(); signIn(null); });

describe("createRenewalMonth refuses everyone but the main admin and the tech admin", () => {
  it("refuses the team leader and the salesperson before anything is written", async () => {
    seedEndedMonth();
    const before = JSON.stringify(read("m_ended"));
    for (const who of [TEAM_LEADER, SELLER, MEMBER]) {
      signIn(who);
      await expect(
        smm.createRenewalMonth({ previousCampaignId: "m_ended", actor: { uid: who.uid, name: who.name, role: who.role } }),
        who.role,
      ).rejects.toThrow(smm.SMM_CREATE_RENEWAL_ADMIN_ONLY);
    }
    expect(mem.__all("smm_campaigns")).toHaveLength(1);
    expect(JSON.stringify(read("m_ended"))).toBe(before);
    expect(mem.__all("work_assignments")).toEqual([]);
  });

  it("lets the tech admin and the main admin create Month 2, linked to the month before", async () => {
    for (const who of [TECH_ADMIN, MAIN_ADMIN]) {
      mem.__reset();
      seedEndedMonth();
      signIn(who);
      const { newCampaignId } = await smm.createRenewalMonth({
        previousCampaignId: "m_ended", actor: { uid: who.uid, name: who.name, role: who.role },
      });
      expect(read(newCampaignId), who.role).toMatchObject({ renewalOf: "m_ended", monthNumber: 2, soldBy: SELLER.uid });
      expect(read("m_ended").renewal?.nextCampaignId, who.role).toBe(newCampaignId);
    }
  });
});

describe("the month page and its setup dialog, for each role", () => {
  const openPage = () => render(
    <MemoryRouter initialEntries={["/smm/m_ended"]}>
      <Routes><Route path="/smm/:campaignId" element={<SmmCampaignPage />} /></Routes>
    </MemoryRouter>,
  );

  it("gives the tech admin and the main admin Create next renewal on the page and in the locked month's setup", async () => {
    for (const who of [TECH_ADMIN, MAIN_ADMIN]) {
      mem.__reset();
      seedEndedMonth();
      signIn(who);
      openPage();
      expect((await screen.findByTestId("smm-page-admin-renew")).textContent, who.role).toMatch(/Create next renewal/);
      expect(screen.queryByTestId("smm-page-remind"), who.role).toBeNull();
      fireEvent.click(screen.getByTestId("smm-page-setup"));
      await screen.findByTestId("smm-setup-locked-banner");
      expect(screen.getByTestId("smm-setup-create-renewal"), who.role).toBeTruthy();
      cleanup();
    }
  });

  it("hides it from the team leader, who reminds the salesperson instead and still manages the locked month", async () => {
    seedEndedMonth();
    signIn(TEAM_LEADER);
    openPage();
    expect((await screen.findByTestId("smm-page-remind")).textContent).toMatch(/Remind Anil/);
    expect(screen.queryByTestId("smm-page-admin-renew")).toBeNull();
    fireEvent.click(screen.getByTestId("smm-page-setup"));
    await screen.findByTestId("smm-setup-locked-banner");
    expect(screen.queryByTestId("smm-setup-create-renewal")).toBeNull();
  });

  it("leaves the salesperson their Renew — the renewal sale — and not the direct button", async () => {
    seedEndedMonth();
    signIn(SELLER);
    openPage();
    expect((await screen.findByTestId("smm-page-renew")).textContent).toMatch(/Renew for next month/);
    expect(screen.queryByTestId("smm-page-admin-renew")).toBeNull();
  });
});

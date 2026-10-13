import { beforeEach, describe, expect, it, vi } from "vitest";

const store: Record<string, any> = {};

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification: vi.fn(async () => {}) }));
vi.mock("firebase/firestore", () => ({
  doc: (a: any, coll?: string, id?: string) => {
    if (coll) return { id, path: `${coll}/${id}` };
    const generated = "new_renewal_id";
    return { id: generated, path: `${a?.path || "smm_campaigns"}/${generated}` };
  },
  collection: (_db: unknown, name: string) => ({ path: name }),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [] })),
  serverTimestamp: () => "SERVER_TS",
  Timestamp: { now: () => ({ seconds: 1_770_000_000, toMillis: () => 1_770_000_000_000 }) },
  setDoc: async (ref: any, data: any) => { store[ref.path] = data; },
  deleteDoc: async (ref: any) => { delete store[ref.path]; },
  updateDoc: async (ref: any, patch: any) => { store[ref.path] = { ...store[ref.path], ...patch }; },
  getDoc: async (ref: any) => ({
    exists: () => !!store[ref.path],
    id: ref.id || ref.path.split("/")[1],
    data: () => store[ref.path],
  }),
  runTransaction: async (_db: unknown, fn: any) => fn({
    get: async (ref: any) => ({
      exists: () => !!store[ref.path],
      id: ref.id || ref.path.split("/")[1],
      data: () => store[ref.path],
    }),
    update: (ref: any, patch: any) => { store[ref.path] = { ...store[ref.path], ...patch }; },
    set: (ref: any, data: any) => { store[ref.path] = data; },
  }),
}));

import { isMonthLocked, canSetUpSmm, canAdminRenewSmm } from "@/utils/smmPackage";
import { canEditCampaign, isAssignedToSmm } from "@/utils/smmPlan";
import { createRenewalMonth, saveMonthSetup, setItemStatus } from "@/services/smm";
import { useAuthStore } from "@/store/authStore";
import { historySetupProblem } from "@/services/smmSetup";
import type { SmmCampaign } from "@/types/smm";

describe("SMM Monthly Locking Architecture & Renewal", () => {
  const TODAY = "2026-10-12";

  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
  });

  describe("isMonthLocked", () => {
    it("locks months whose cycle ended before today", () => {
      const pastCampaign = {
        status: "active" as const,
        history: false,
        cycle: { month: "2026-09", startDate: "2026-09-01", endDate: "2026-10-01" },
      };
      expect(isMonthLocked(pastCampaign, TODAY)).toBe(true);
    });

    it("locks months explicitly marked as history", () => {
      const historyCampaign = {
        status: "completed" as const,
        history: true,
        cycle: { month: "2026-10", startDate: "2026-10-01", endDate: "2026-11-01" },
      };
      expect(isMonthLocked(historyCampaign, TODAY)).toBe(true);
    });

    it("locks months with completed, renewed, or lapsed statuses", () => {
      const futureDates = { month: "2026-10", startDate: "2026-10-01", endDate: "2026-11-01" };
      expect(isMonthLocked({ status: "completed", history: false, cycle: futureDates }, TODAY)).toBe(true);
      expect(isMonthLocked({ status: "renewed", history: false, cycle: futureDates }, TODAY)).toBe(true);
      expect(isMonthLocked({ status: "lapsed", history: false, cycle: futureDates }, TODAY)).toBe(true);
    });

    it("does NOT lock currently active months that have not ended", () => {
      const runningCampaign = {
        status: "active" as const,
        history: false,
        cycle: { month: "2026-10", startDate: "2026-10-01", endDate: "2026-11-01" },
      };
      expect(isMonthLocked(runningCampaign, TODAY)).toBe(false);
    });
  });

  describe("SMM Team Lead Permissions", () => {
    const campaignWithMember: Pick<SmmCampaign, "watchers" | "soldBy" | "team"> = {
      soldBy: "seller1",
      watchers: ["tech_member_1"],
      team: {
        creator: { uid: "tech_member_1", name: "Aswinitha" },
        publisher: { uid: "tech_member_1", name: "Aswinitha" },
        marketer: null,
        assistants: [],
      },
    };

    const leadUser = {
      uid: "lead_1",
      name: "Team Lead Kiran",
      role: "tech_member" as const,
      smmLeader: true,
    };

    it("grants VIEW-ONLY access to Team Lead for campaigns assigned to other members", () => {
      expect(canEditCampaign(campaignWithMember, leadUser)).toBe(false);
      expect(isAssignedToSmm(campaignWithMember, leadUser.uid)).toBe(false);
    });

    it("grants working/editing permissions to Team Lead when an SMM client is personally assigned to them", () => {
      const campaignWithLead: Pick<SmmCampaign, "watchers" | "soldBy" | "team"> = {
        soldBy: "seller1",
        watchers: ["lead_1"],
        team: {
          creator: { uid: "lead_1", name: "Team Lead Kiran" },
          publisher: null,
          marketer: null,
          assistants: [],
        },
      };

      expect(isAssignedToSmm(campaignWithLead, leadUser.uid)).toBe(true);
      expect(canEditCampaign(campaignWithLead, leadUser)).toBe(true);
    });

    it("restricts setup editing to admins (Team Lead cannot edit setups)", () => {
      expect(canSetUpSmm(leadUser)).toBe(false);
      expect(canSetUpSmm({ role: "tech_member" })).toBe(false);
      expect(canSetUpSmm({ role: "tech_admin" })).toBe(true);
      expect(canSetUpSmm({ role: "main_admin" })).toBe(true);
      expect(canSetUpSmm({ role: "tech_team_leader" })).toBe(true);
    });

    it("allows only admins to create renewals and manage historical setups", () => {
      expect(canAdminRenewSmm(leadUser)).toBe(false);
      expect(canAdminRenewSmm({ role: "tech_member" })).toBe(false);
      expect(canAdminRenewSmm({ role: "tech_admin" })).toBe(true);
      expect(canAdminRenewSmm({ role: "main_admin" })).toBe(true);
      expect(canAdminRenewSmm({ role: "tech_team_leader" })).toBe(true);
    });

    it("prevents unassigned Team Lead from updating item stage/progress", async () => {
      const cId = "camp_other";
      store[`smm_campaigns/${cId}`] = {
        id: cId,
        watchers: ["other_uid"],
        soldBy: "seller1",
        status: "active",
        team: { creator: { uid: "other_uid", name: "Other" } },
        items: [{ id: "item1", status: "planned", approval: { state: "approved" } }],
      };

      // The services ask who is SIGNED IN (the auth store, as the Firestore rule reads request.auth) — not
      // the actor a caller passes, which a caller could get wrong (2026-10-12, smmLeadViewOnlyOct12).
      useAuthStore.setState({ user: leadUser as never });
      try {
        await expect(
          setItemStatus(cId, "item1", "in_progress", leadUser),
        ).rejects.toThrow(/View only/);
      } finally {
        useAuthStore.setState({ user: null });
      }
    });
  });

  describe("History Setup Lock & Error Prevention", () => {
    it("reports a clear locking error when attempting to extend a history/locked month into the present/future", () => {
      const problem = historySetupProblem(
        {
          businessName: "Test Co",
          startDate: "2026-09-01",
          endDate: "2026-10-31", // >= TODAY (2026-10-12)
          clipsPerVideo: 4,
          pageLinks: {},
          team: { creator: { uid: "m1", name: "Aswinitha" }, publisher: null, marketer: null, assistants: [] },
        },
        TODAY,
      );
      expect(problem).toMatch(/locked and stays in the past/);
      expect(problem).toMatch(/cannot be extended or edited into the next renewal/);
    });

    it("prevents saveMonthSetup from extending a locked month to present/future dates", async () => {
      const cId = "completed_month_1";
      store[`smm_campaigns/${cId}`] = {
        id: cId,
        setupAt: { seconds: 123 },
        status: "completed",
        cycle: { month: "2026-09", startDate: "2026-09-01", endDate: "2026-10-01" },
        items: [],
      };

      await expect(
        saveMonthSetup(cId, {
          cycle: { month: "2026-10", startDate: "2026-10-01", endDate: "2026-11-01" },
          clipsPerVideo: 4,
          pageLinks: {},
          setupByName: "Admin",
          setupByUid: "admin_1",
        }),
      ).rejects.toThrow(/locked to preserve its history and cannot be edited/);
    });
  });

  describe("createRenewalMonth: Architecture & Configuration Carryover", () => {
    it("creates a brand new month record while preserving the previous month completely", async () => {
      const prevId = "prev_month_1";
      const prevCampaign: any = {
        id: prevId,
        businessName: "Green Foods",
        clientName: "Green Foods Corp",
        clientPhone: "+919876543210",
        clientPhoneId: "919876543210",
        packageKey: "Growth Package",
        packageLabel: "Growth Package",
        amount: 25000,
        soldBy: "seller_1",
        soldByName: "Anil",
        platforms: ["instagram", "facebook"],
        commitments: { poster: 10, ai_ad: 8, real_video: 0 },
        clipsPerVideo: 4,
        pageLinks: { instagram: "https://instagram.com/greenfoods" },
        team: {
          creator: { uid: "m1", name: "Aswinitha" },
          publisher: { uid: "m1", name: "Aswinitha" },
          marketer: null,
          assistants: [],
        },
        cycle: { month: "2026-09", startDate: "2026-09-01", endDate: "2026-10-01" },
        monthNumber: 1,
        status: "completed",
        history: false,
        items: [
          { id: "item_p1", title: "Past Item 1", status: "posted", uploadDate: "2026-09-10" },
        ],
      };
      store[`smm_campaigns/${prevId}`] = prevCampaign;

      const adminActor = { uid: "admin_1", name: "Main Admin", role: "main_admin" as const };
      const { newCampaignId } = await createRenewalMonth({
        previousCampaignId: prevId,
        actor: adminActor,
        startDate: "2026-10-01",
      });

      expect(newCampaignId).toBe("new_renewal_id");

      // Verify the new campaign was created with configuration carried forward
      const newDoc = store["smm_campaigns/new_renewal_id"];
      expect(newDoc).toBeDefined();
      expect(newDoc.businessName).toBe("Green Foods");
      expect(newDoc.clientPhone).toBe("+919876543210");
      expect(newDoc.packageKey).toBe("Growth Package");
      expect(newDoc.platforms).toEqual(["instagram", "facebook"]);
      expect(newDoc.commitments).toEqual({ poster: 10, ai_ad: 8, real_video: 0 });
      expect(newDoc.clipsPerVideo).toBe(4);
      expect(newDoc.pageLinks).toEqual({ instagram: "https://instagram.com/greenfoods" });
      expect(newDoc.team.creator.name).toBe("Aswinitha");
      expect(newDoc.monthNumber).toBe(2);
      expect(newDoc.renewalOf).toBe(prevId);
      expect(newDoc.cycle.startDate).toBe("2026-10-01"); // Starts when previous ended

      // Verify previous month was NOT modified except for linking to the next month
      const prevDoc = store[`smm_campaigns/${prevId}`];
      expect(prevDoc.cycle.startDate).toBe("2026-09-01");
      expect(prevDoc.cycle.endDate).toBe("2026-10-01");
      expect(prevDoc.items.length).toBe(1);
      expect(prevDoc.items[0].title).toBe("Past Item 1");
      expect(prevDoc.renewal.nextCampaignId).toBe("new_renewal_id");
      expect(prevDoc.status).toBe("renewed");
    });

    it("returns existing next campaign ID if already renewed to prevent accidental duplicates", async () => {
      const prevId = "prev_renewed";
      store[`smm_campaigns/${prevId}`] = {
        id: prevId,
        status: "renewed",
        renewal: { nextCampaignId: "already_next_1" },
      };
      store["smm_campaigns/already_next_1"] = {
        id: "already_next_1",
        status: "active",
      };

      const res = await createRenewalMonth({
        previousCampaignId: prevId,
        actor: { uid: "admin_1", name: "Admin", role: "main_admin" },
      });
      expect(res.newCampaignId).toBe("already_next_1");
    });
  });
});

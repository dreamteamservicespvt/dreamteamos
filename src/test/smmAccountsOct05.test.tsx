/**
 * The accounts a social-media month covers, chosen in setup (2026-10-05).
 *
 * The owner found "Edit setup" had no way to say which accounts a month covers — they were only ever
 * picked on the sale, so a client who added YouTube later, or a sale recorded with none, could not be
 * put right. On the in-memory Firestore, with the REAL setup dialog and services:
 *
 *   • the rule: posted pieces keep where they went, pieces on the month's accounts follow the change, a
 *     piece given its own accounts keeps them minus a dropped one, and a no-op writes nothing;
 *   • Edit setup shows "Accounts it covers" ticked from the month, a page box per ticked account, refuses
 *     none, and saves the month's accounts, its unposted pieces and only the covered accounts' links;
 *   • a later edit of the sale never puts the old accounts back;
 *   • setting up a recorded sale builds its plan on the accounts ticked at setup.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification: vi.fn(async () => undefined), notifyTechTeamLeaders: vi.fn(async () => undefined) }));
vi.mock("@/services/orderChat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/orderChat")>()),
  ensureSaleOrderChat: vi.fn(async () => undefined),
  attachAssignmentToChat: vi.fn(async () => undefined),
  createOrderChat: vi.fn(async () => undefined),
  detachAssignmentFromChat: vi.fn(async () => undefined),
  deleteOrderChat: vi.fn(async () => undefined),
}));

const mem = await import("./memoryFirestore");
const smm = await import("@/services/smm");
const setup = await import("@/services/smmSetup");
const { cleanPlatforms, itemsForAccounts, linksForAccounts, monthCycle } = await import("@/utils/smmPackage");
const { blankItem, isoDay } = await import("@/utils/smmPlan");
const { SmmSetupDialog } = await import("@/components/smm/SmmSetupForm");
import type { SmmCampaign, SmmContentItem } from "@/types/smm";

configure({ testIdAttribute: "data-test" });
afterEach(cleanup);

const DAY = 86_400_000;
const iso = (days: number) => isoDay(new Date(Date.now() + days * DAY));
const KIRAN = { uid: "kiran", name: "Kiran", role: "tech_admin" };
/** The same person as the setup dialog takes them. */
const KIRAN_USER = { ...KIRAN, role: "tech_admin" as const, createdBy: "" };
const ARJUN = { uid: "arjun", name: "Arjun" };
const TEAM = { creator: ARJUN, publisher: ARJUN, marketer: ARJUN, assistants: [] };
// Stored documents are read loosely here, as the other SMM service tests do.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = (path: string) => mem.__read(path) as Record<string, any> | undefined;

const piece = (id: string, over: Partial<SmmContentItem> = {}): SmmContentItem =>
  ({ ...blankItem("poster", ["instagram", "facebook"]), id, ...over });

function campaignDoc(over: Partial<SmmCampaign> & { id: string }): Record<string, unknown> {
  return {
    orderId: "", leadId: "l1", saleItemKey: "l1__0", origin: "sale",
    clientPhone: "+919876543210", clientPhoneId: "919876543210", clientName: "Sri Sai Silks", businessName: "Sri Sai Silks",
    packageKey: "Starter Package", packageLabel: "Starter Package", amount: 10000,
    cycle: monthCycle(iso(-5)), platforms: ["instagram", "facebook"], commitments: { poster: 3, ai_ad: 0, real_video: 0 },
    items: [], ads: [], budgetPayments: [], team: TEAM, setupAt: mem.Timestamp.now(),
    soldBy: "anil", soldByName: "Anil", watchers: ["anil", "arjun"], status: "active", renewal: { state: "none" },
    ...over,
  };
}

beforeEach(() => {
  mem.__reset();
  mem.__seed("users/anil", { name: "Anil", role: "sales_member", createdBy: "sadmin", isActive: true });
  mem.__seed("users/kiran", { name: "Kiran", role: "tech_admin", isActive: true });
  mem.__seed("users/arjun", { name: "Arjun", role: "tech_member", createdBy: "kiran", isActive: true });
});

describe("the rule: which pieces follow a change of accounts", () => {
  const before = ["instagram", "facebook"] as const;

  it("moves pieces on the month's accounts, keeps posted ones and a piece's own choice", () => {
    const items = [
      piece("default"),
      piece("posted", { status: "posted", platforms: ["instagram", "facebook"] }),
      piece("own", { platforms: ["facebook"] }),
      piece("ownDropped", { platforms: ["instagram"] }),
    ];
    const out = itemsForAccounts(items, [...before], ["facebook", "youtube"]);
    const by = (id: string) => out.find((i) => i.id === id)!.platforms;
    expect(by("default")).toEqual(["facebook", "youtube"]);
    expect(by("posted")).toEqual(["instagram", "facebook"]); // history: where it actually went
    expect(by("own")).toEqual(["facebook"]); // somebody chose it — still covered, so kept
    expect(by("ownDropped")).toEqual(["facebook", "youtube"]); // its only account was dropped
  });

  it("returns the very same list when the accounts did not change, in any order", () => {
    const items = [piece("a")];
    expect(itemsForAccounts(items, ["facebook", "instagram"], ["instagram", "facebook"])).toBe(items);
  });

  it("cleans a choice into the app's order, without unknown or repeated accounts", () => {
    expect(cleanPlatforms(["youtube", "instagram", "youtube", "myspace"])).toEqual(["instagram", "youtube"]);
    expect(cleanPlatforms(null)).toEqual([]);
  });

  it("keeps a page link only for an account the month covers", () => {
    expect(linksForAccounts({ instagram: " @sai ", facebook: "fb.com/sai", youtube: "" }, ["instagram", "youtube"]))
      .toEqual({ instagram: "@sai" });
    expect(linksForAccounts({ facebook: "fb.com/sai" }, ["instagram"])).toBeNull();
  });
});

describe("Edit setup — Accounts it covers", () => {
  it("shows the month's accounts ticked, adds a page box per account, and saves the change through", async () => {
    mem.__seed("smm_campaigns/c1", campaignDoc({
      id: "c1",
      pageLinks: { instagram: "@srisai", facebook: "fb.com/srisai" },
      items: [piece("p1"), piece("p2", { status: "posted" }), piece("p3")],
    }));
    const onClose = vi.fn();
    render(<SmmSetupDialog campaign={read("smm_campaigns/c1") as SmmCampaign} user={KIRAN_USER} onClose={onClose} />);

    expect(screen.getByTestId("smm-setup-accounts").textContent).toMatch(/Accounts it covers/);
    expect(screen.getByTestId("smm-setup-platform-instagram").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("smm-setup-platform-facebook").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("smm-setup-platform-youtube").getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByTestId("smm-setup-link-youtube")).toBeNull();

    // None ticked is refused, on the button and under the chips.
    fireEvent.click(screen.getByTestId("smm-setup-platform-instagram"));
    fireEvent.click(screen.getByTestId("smm-setup-platform-facebook"));
    const save = screen.getByTestId("smm-setup-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(save.textContent).toMatch(/Tick at least one account/);

    // Instagram + YouTube: Facebook dropped, YouTube added with its page.
    fireEvent.click(screen.getByTestId("smm-setup-platform-instagram"));
    fireEvent.click(screen.getByTestId("smm-setup-platform-youtube"));
    fireEvent.change(screen.getByTestId("smm-setup-link-youtube"), { target: { value: "youtube.com/@srisai" } });
    await waitFor(() => expect((screen.getByTestId("smm-setup-seat-creator") as HTMLSelectElement).options.length).toBeGreaterThan(1));
    fireEvent.click(screen.getByTestId("smm-setup-save"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const c = read("smm_campaigns/c1")!;
    expect(c.platforms).toEqual(["instagram", "youtube"]);
    expect(c.pageLinks).toEqual({ instagram: "@srisai", youtube: "youtube.com/@srisai" });
    const by = (id: string) => c.items.find((i: { id: string }) => i.id === id).platforms;
    expect(by("p1")).toEqual(["instagram", "youtube"]);
    expect(by("p3")).toEqual(["instagram", "youtube"]);
    expect(by("p2")).toEqual(["instagram", "facebook"]); // posted — stays where it went
  });

  it("lets a month sold with no accounts be given some", async () => {
    mem.__seed("smm_campaigns/c2", campaignDoc({ id: "c2", platforms: [], items: [piece("p1", { platforms: [] })] }));
    const onClose = vi.fn();
    render(<SmmSetupDialog campaign={read("smm_campaigns/c2") as SmmCampaign} user={KIRAN_USER} onClose={onClose} />);
    expect((screen.getByTestId("smm-setup-save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("smm-setup-platform-facebook"));
    await waitFor(() => expect((screen.getByTestId("smm-setup-seat-creator") as HTMLSelectElement).options.length).toBeGreaterThan(1));
    fireEvent.click(screen.getByTestId("smm-setup-save"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const c = read("smm_campaigns/c2")!;
    expect(c.platforms).toEqual(["facebook"]);
    expect(c.items[0].platforms).toEqual(["facebook"]);
  });
});

describe("the accounts stay what setup made them", () => {
  it("a later edit of the sale does not put the sale's accounts back", async () => {
    mem.__seed("smm_campaigns/o1", campaignDoc({ id: "o1", orderId: "o1" }));
    await smm.setMonthPlatforms("o1", ["youtube"]);
    await smm.ensureCampaignForOrder({
      orderId: "o1", leadId: "l1", saleItemKey: "l1__0", clientPhone: "+919876543210", clientPhoneId: "919876543210",
      clientName: "Sri Sai Silks", businessName: "Sri Sai Silks", packageKey: "Starter Package", packageLabel: "Starter Package",
      amount: 12000, platforms: ["instagram", "facebook"], commitments: { poster: 3, ai_ad: 0, real_video: 0 },
      soldBy: "anil", soldByName: "Anil",
    } as Parameters<typeof smm.ensureCampaignForOrder>[0]);
    const c = read("smm_campaigns/o1")!;
    expect(c.amount).toBe(12000); // the sale edit did land
    expect(c.platforms).toEqual(["youtube"]);
  });

  it("refuses a setup with no account, and a direct call with none", async () => {
    expect(setup.setupProblem({ startDate: iso(0), endDate: "", clipsPerVideo: 4, team: TEAM, platforms: [] }, iso(0)))
      .toMatch(/Tick at least one account/);
    // Absent means "leave them as they are" — the no-sale step passes its own.
    expect(setup.setupProblem({ startDate: iso(0), endDate: "", clipsPerVideo: 4, team: TEAM }, iso(0))).toBe("");
    mem.__seed("smm_campaigns/c3", campaignDoc({ id: "c3" }));
    await expect(smm.setMonthPlatforms("c3", [])).rejects.toThrow(/at least one account/);
    expect(read("smm_campaigns/c3")!.platforms).toEqual(["instagram", "facebook"]);
  });
});

describe("setting up a recorded sale", () => {
  it("builds the plan on the accounts ticked at setup", async () => {
    const soldMs = Date.now() - 3 * DAY;
    mem.__seed("leads/l1", {
      assignedTo: "anil", assignedBy: "sadmin", phone: "+919876543210", displayName: "Sri Sai Silks",
      status: "answered", notes: "", saleDone: true, lastUpdated: 0, createdAt: 0,
      saleItems: [{
        category: "social_media_management", packageKey: "Starter Package", amount: 10000,
        verificationStatus: "verified", submittedAt: mem.Timestamp.fromMillis(soldMs),
        requirement: { businessName: "Sri Sai Silks", businessWhatsapp: "+919876543210" },
        smm: {
          platforms: ["instagram"], commitments: { poster: 2, ai_ad: 0, real_video: 0 },
          addOns: { realVideos: 0 }, grossAmount: 10000, priceMode: "final", clipsPerVideo: 4,
        },
      }],
    });
    const result = await setup.setupSaleMonth({
      leadId: "l1", itemIndex: 0, actor: KIRAN,
      setup: { startDate: iso(-3), endDate: "", clipsPerVideo: 4, team: TEAM, platforms: ["instagram", "youtube"], pageLinks: { youtube: "@sai", facebook: "fb" } },
    });
    const c = read(`smm_campaigns/${result.campaignId}`)!;
    expect(c.platforms).toEqual(["instagram", "youtube"]);
    expect(c.items.every((i: { platforms: string[] }) => i.platforms.join() === "instagram,youtube")).toBe(true);
    expect(c.pageLinks).toEqual({ youtube: "@sai" });
  });
});

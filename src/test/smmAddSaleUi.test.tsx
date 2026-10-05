import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Social Media Management, 2026-10-03, through the real components:
 *   • the sale form recording a sale FOR a salesperson — it is theirs (seller, sales admin, freeze),
 *     and who typed it is kept;
 *   • the sale form opened by Renew — on the month's package and video length, and linked to it;
 *   • "Add SMM sale" — an old sale is set up, never sold again; a client with months gets the
 *     salesperson's Renew, not a new sale; a client from before the app gets a month with no sale;
 *   • the board — its tabs, and the buttons each role gets.
 */

const updateLead = vi.fn(async (_id: string, _data: Record<string, unknown>) => undefined);
const upsertOrderForSale = vi.fn(async (_p: Record<string, unknown>) => undefined);
const logActivity = vi.fn(async (_p: Record<string, unknown>) => undefined);
const applySaleFreeze = vi.fn(async (_p: Record<string, unknown>) => undefined);
const findSmmSalesForPhone = vi.fn();
const setupSaleMonth = vi.fn();
const addNoSaleMonth = vi.fn();
const remindSellerToRenew = vi.fn(async () => undefined);
const fetchClientMonths = vi.fn(async (_phoneId: string) => [] as unknown[]);

let AUTH: { user: Record<string, unknown> } = { user: { uid: "kiran", name: "Kiran", role: "tech_admin" } };

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), doc: vi.fn(), updateDoc: vi.fn(), serverTimestamp: vi.fn(),
  Timestamp: { now: () => ({ seconds: 1_790_000_000 }), fromMillis: (ms: number) => ({ seconds: Math.floor(ms / 1000) }) },
  onSnapshot: () => () => {},
}));
vi.mock("@/store/authStore", () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel(AUTH) }));
vi.mock("@/services/adLanguages", () => ({
  watchAdLanguages: () => () => {}, rememberAdLanguage: vi.fn(), mergeAdLanguages: (a: string[] | null) => a ?? ["Telugu"],
}));
vi.mock("@/services/activityLog", () => ({ logActivity }));
vi.mock("@/services/cloudinary", () => ({ uploadToCloudinary: vi.fn(async () => "https://img/pay.png") }));
vi.mock("@/services/numberLock", () => ({
  applySaleFreeze, buildLeadFreezeFields: () => ({}), fetchNumberLock: async () => null,
}));
vi.mock("@/services/orders", () => ({ upsertOrderForSale }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/services/smm", () => ({
  fetchAssignableMembers: async () => [{ uid: "arjun", name: "Arjun" }, { uid: "divya", name: "Divya" }],
  remindSellerToRenew,
  closeEndedMonthsOnOpen: vi.fn(async () => 0),
  fetchFinishedCampaigns: vi.fn(async () => []),
  fetchClientMonths,
  notifyRenewalsDueOnOpen: vi.fn(async () => undefined),
  watchSmmTeamLeads: () => () => {},
  setSmmTeamLead: vi.fn(),
}));
vi.mock("@/services/smmSetup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/smmSetup")>()),
  findSmmSalesForPhone, setupSaleMonth, addNoSaleMonth,
  fetchSalesPeople: async () => [{ uid: "anil", name: "Anil", createdBy: "sadmin" }],
  leadForSeller: vi.fn(),
  updateLeadDoc: vi.fn(),
  notifySellerOfEnteredSale: vi.fn(),
}));
let BOARD: unknown[] = [];
vi.mock("@/hooks/useSmmCampaigns", () => ({ useSmmCampaigns: () => ({ campaigns: BOARD, loading: false }) }));

const SaleForm = (await import("@/components/sales/SaleForm")).default;
const SmmAddSaleDialog = (await import("@/components/smm/SmmAddSaleDialog")).default;
const SocialMedia = (await import("@/pages/shared/SocialMedia")).default;
const { monthCycle } = await import("@/utils/smmPackage");
const { isoDay } = await import("@/utils/smmPlan");

configure({ testIdAttribute: "data-test" });
beforeEach(() => {
  AUTH = { user: { uid: "kiran", name: "Kiran", role: "tech_admin" } };
  for (const f of [updateLead, upsertOrderForSale, logActivity, applySaleFreeze, findSmmSalesForPhone, setupSaleMonth, addNoSaleMonth]) f.mockClear();
});
afterEach(cleanup);

const LEAD = { id: "l1", phone: "+919876543210", displayName: "Sri Sai Silks", status: "answered", assignedTo: "anil", saleItems: [] };

async function uploadScreenshot() {
  const input = screen.getByText(/Upload payment screenshot/).closest("label")!.querySelector("input")!;
  fireEvent.change(input, { target: { files: [new File(["x"], "pay.png", { type: "image/png" })] } });
  await screen.findByText(/Payment screenshot uploaded/);
}

describe("the sale form, recording a sale for a salesperson", () => {
  it("makes it the salesperson's sale and keeps who typed it", async () => {
    const onDone = vi.fn();
    render(
      <MemoryRouter>
        <SaleForm lead={LEAD as never} updateLead={updateLead} onDone={onDone} initialCategory="social_media_management"
          lockCategory onBehalfOf={{ uid: "anil", name: "Anil", createdBy: "sadmin" }} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("sale-on-behalf").textContent).toMatch(/Anil/);
    expect(screen.getByTestId("sale-category-locked").textContent).toMatch(/Social Media/);
    expect(screen.queryByTestId("save-and-add-another")).toBeNull();

    fireEvent.change(screen.getByTestId("sale-package"), { target: { value: "Starter Package" } });
    fireEvent.click(screen.getByTestId("smm-clips-6"));
    expect(screen.getByTestId("smm-clips-label").textContent).toMatch(/6 clips · 48 sec/);
    await uploadScreenshot();
    fireEvent.click(screen.getByTestId("save-sale"));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const saved = (updateLead.mock.calls[0] as unknown[])[1] as { saleItems: Record<string, any>[] };
    const item = saved.saleItems[0];
    expect(item.enteredBy).toMatchObject({ uid: "kiran", name: "Kiran" });
    expect(item.smm.clipsPerVideo).toBe(6);
    expect(item.verificationStatus).toBe("pending");
    expect(upsertOrderForSale.mock.calls[0][0]).toMatchObject({ soldByName: "Anil", salesAdminId: "sadmin" });
    expect(applySaleFreeze.mock.calls[0][0]).toMatchObject({ user: { uid: "anil", name: "Anil" } });
    expect(logActivity.mock.calls[0][0]).toMatchObject({ actorId: "kiran", details: { onBehalfOf: "Anil" } });
    expect(onDone.mock.calls[0][0]).toMatchObject({ leadId: "l1", itemIndex: 0 });
  });
});

describe("the sale form, opened by Renew", () => {
  it("opens on the month's package and video length, and links the sale to it", async () => {
    AUTH = { user: { uid: "anil", name: "Anil", role: "sales_member", createdBy: "sadmin" } };
    const onDone = vi.fn();
    render(
      <MemoryRouter>
        <SaleForm lead={LEAD as never} updateLead={updateLead} onDone={onDone} renewal={{
          campaignId: "o_prev", businessName: "Sri Sai Silks", packageKey: "Starter Package",
          platforms: ["instagram", "facebook"], clipsPerVideo: 6, monthLabel: "October 2026", nextStart: "2026-11-03",
        }} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("sale-renewal").textContent).toMatch(/October 2026/);
    expect((screen.getByTestId("sale-package") as HTMLSelectElement).value).toBe("Starter Package");
    expect(screen.getByTestId("smm-clips-6").getAttribute("aria-pressed")).toBe("true");
    await uploadScreenshot();
    fireEvent.click(screen.getByTestId("save-sale"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const item = ((updateLead.mock.calls[0] as unknown[])[1] as { saleItems: Record<string, any>[] }).saleItems[0];
    expect(item.smm.renewalOf).toBe("o_prev");
    expect(item.enteredBy).toBeUndefined();
  });
});

describe("Add SMM sale", () => {
  const record = (over: Record<string, unknown> = {}) => ({
    leadId: "l1", itemIndex: 0, sellerUid: "anil", sellerName: "Anil", soldDay: "2026-09-20", orderId: "o1",
    order: null, campaign: null, state: "removed", businessName: "Sri Sai Silks",
    item: {
      category: "social_media_management", packageKey: "Starter Package", amount: 10000, verificationStatus: "verified",
      smm: { platforms: ["instagram"], commitments: { poster: 4, ai_ad: 4, real_video: 0 }, addOns: { realVideos: 0 }, grossAmount: 10000, priceMode: "final", clipsPerVideo: 6 },
    },
    ...over,
  });

  function open() {
    const onCreated = vi.fn();
    render(<MemoryRouter><SmmAddSaleDialog user={{ uid: "kiran", name: "Kiran", role: "tech_admin" } as never} onClose={vi.fn()} onCreated={onCreated} /></MemoryRouter>);
    fireEvent.change(screen.getByTestId("smm-add-sale-phone"), { target: { value: "98765 43210" } });
    fireEvent.click(screen.getByTestId("smm-add-sale-find"));
    return onCreated;
  }

  it("sets an old sale up on its sold date — no new sale offered", async () => {
    findSmmSalesForPhone.mockResolvedValue([record()]);
    setupSaleMonth.mockResolvedValue({ campaignId: "o1", history: false, assign: { created: [{ uid: "arjun", name: "Arjun", id: "w1", accessCode: "1234" }], updated: [], withdrawn: [], keptStarted: [], skippedInactive: [] } });
    const onCreated = open();

    const card = await screen.findByTestId("smm-add-sale-record");
    expect(card.textContent).toMatch(/Sold by Anil/);
    expect(card.textContent).toMatch(/Order removed/);
    expect(screen.queryByTestId("smm-add-sale-new")).toBeNull();
    expect(screen.getByTestId("smm-add-sale-renew-note")).toBeTruthy();

    fireEvent.click(within(card).getByTestId("smm-add-sale-setup"));
    // The name comes from the sale and can be changed here.
    expect((screen.getByTestId("smm-setup-name") as HTMLInputElement).value).toBe("Sri Sai Silks");
    fireEvent.change(screen.getByTestId("smm-setup-name"), { target: { value: "Sri Sai Silks Official" } });
    // The counts start from the sale, and can be changed here.
    expect((screen.getByTestId("smm-setup-count-ai_ad") as HTMLInputElement).value).toBe("4");
    expect((screen.getByTestId("smm-setup-count-poster") as HTMLInputElement).value).toBe("4");
    expect(screen.getByTestId("smm-setup-sold").textContent).toMatch(/Sold as 4 videos · 4 posters/);
    fireEvent.click(screen.getByTestId("smm-setup-more-ai_ad"));
    fireEvent.click(screen.getByTestId("smm-setup-more-ai_ad"));
    expect(screen.getByTestId("smm-setup-sold").textContent).toMatch(/will owe what you set here/);
    expect((screen.getByTestId("smm-setup-start") as HTMLInputElement).value).toBe("2026-09-20");
    expect((screen.getByTestId("smm-setup-end") as HTMLInputElement).value).toBe("2026-10-20"); // same date next month
    // The accounts start from the sale and can be changed here (2026-10-05) — a page box per account.
    expect(screen.getByTestId("smm-setup-platform-instagram").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("smm-setup-platform-youtube").getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByTestId("smm-setup-link-youtube")).toBeNull();
    fireEvent.click(screen.getByTestId("smm-setup-platform-youtube"));
    expect(screen.getByTestId("smm-setup-link-youtube")).toBeTruthy();
    fireEvent.change(await screen.findByTestId("smm-setup-all"), { target: { value: "arjun" } });
    // Wait for the members list to load before choosing.
    await waitFor(() => expect((screen.getByTestId("smm-setup-seat-creator") as HTMLSelectElement).options.length).toBeGreaterThan(1));
    fireEvent.change(screen.getByTestId("smm-setup-all"), { target: { value: "arjun" } });
    fireEvent.click(screen.getByTestId("smm-add-sale-save"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("o1"));
    const args = setupSaleMonth.mock.calls[0][0];
    expect(args).toMatchObject({ leadId: "l1", itemIndex: 0 });
    expect(args.setup).toMatchObject({
      businessName: "Sri Sai Silks Official", startDate: "2026-09-20", endDate: "2026-10-20", clipsPerVideo: 6,
      commitments: { ai_ad: 6, poster: 4, real_video: 0 }, platforms: ["instagram", "youtube"],
    });
    expect(args.setup.team.creator.uid).toBe("arjun");
    expect(args.setup.team.marketer.uid).toBe("arjun");
  });

  it("offers a new sale only for a number with no social media sale at all", async () => {
    findSmmSalesForPhone.mockResolvedValue([]);
    open();
    await screen.findByTestId("smm-add-sale-none");
    expect(screen.getByTestId("smm-add-sale-new")).toBeTruthy();
  });

  it("sends a running client's renewal to the salesperson", async () => {
    findSmmSalesForPhone.mockResolvedValue([record({ state: "live", campaign: { id: "o1", soldBy: "anil", cycle: monthCycle("2026-09-20") } })]);
    open();
    const note = await screen.findByTestId("smm-add-sale-renew-note");
    fireEvent.click(within(note).getByTestId("smm-add-sale-remind"));
    await waitFor(() => expect(remindSellerToRenew).toHaveBeenCalled());
    expect(screen.queryByTestId("smm-add-sale-new")).toBeNull();
  });

  it("adds a month that had no sale — the salesperson's, set up by hand, not a sale", async () => {
    findSmmSalesForPhone.mockResolvedValue([]);
    addNoSaleMonth.mockResolvedValue({ campaignId: "c_pre", history: false, assign: { created: [{ uid: "arjun", name: "Arjun", id: "w1", accessCode: "1234" }], updated: [], withdrawn: [], keptStarted: [], skippedInactive: [] } });
    const onCreated = open();

    fireEvent.click(await screen.findByTestId("smm-add-sale-no-sale"));
    expect(screen.getByTestId("smm-no-sale-note").textContent).toMatch(/not counted in anyone's revenue or commission/);
    // The button says what is still missing, in order.
    expect(screen.getByTestId("smm-no-sale-save").textContent).toMatch(/Choose the salesperson/);
    await waitFor(() => expect((screen.getByTestId("smm-no-sale-seller") as HTMLSelectElement).options.length).toBeGreaterThan(1));
    fireEvent.change(screen.getByTestId("smm-no-sale-seller"), { target: { value: "anil" } });
    expect(screen.getByTestId("smm-no-sale-save").textContent).toMatch(/Give the month a name/);

    // A package fills in its counts and its accounts.
    expect((screen.getByTestId("smm-setup-count-ai_ad") as HTMLInputElement).value).toBe("4");
    fireEvent.change(screen.getByTestId("smm-no-sale-package"), { target: { value: "Plus Package" } });
    expect((screen.getByTestId("smm-setup-count-ai_ad") as HTMLInputElement).value).toBe("6");
    expect((screen.getByTestId("smm-setup-count-poster") as HTMLInputElement).value).toBe("6");
    expect(screen.getByTestId("smm-no-sale-platform-youtube").getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(screen.getByTestId("smm-setup-name"), { target: { value: "Lakshmi Jewellers" } });

    // A month that has not started is new business — a sale — and is refused here.
    const day = (n: number) => isoDay(new Date(Date.now() + n * 86_400_000));
    fireEvent.change(screen.getByTestId("smm-setup-start"), { target: { value: day(3) } });
    expect(screen.getByTestId("smm-no-sale-save").textContent).toMatch(/hasn't started yet is a sale/);
    fireEvent.change(screen.getByTestId("smm-setup-start"), { target: { value: day(-10) } });
    await waitFor(() => expect((screen.getByTestId("smm-setup-seat-creator") as HTMLSelectElement).options.length).toBeGreaterThan(1));
    fireEvent.change(screen.getByTestId("smm-setup-all"), { target: { value: "arjun" } });
    fireEvent.click(screen.getByTestId("smm-no-sale-save"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("c_pre"));
    const args = addNoSaleMonth.mock.calls[0][0];
    expect(args).toMatchObject({
      phone: "+919876543210", seller: { uid: "anil", name: "Anil" }, packageKey: "Plus Package",
      platforms: ["instagram", "facebook", "youtube"], actor: { uid: "kiran" },
    });
    expect(args.setup).toMatchObject({ businessName: "Lakshmi Jewellers", startDate: day(-10), commitments: { ai_ad: 6, poster: 6, real_video: 0 } });
    expect(args.setup.team.creator.uid).toBe("arjun");
    expect(setupSaleMonth).not.toHaveBeenCalled();
  });

  it("does not offer a month with no sale to the Social Media Team Lead", async () => {
    findSmmSalesForPhone.mockResolvedValue([]);
    render(<MemoryRouter><SmmAddSaleDialog user={{ uid: "ravi", name: "Ravi", role: "tech_member", smmLeader: true } as never} onClose={vi.fn()} onCreated={vi.fn()} /></MemoryRouter>);
    fireEvent.change(screen.getByTestId("smm-add-sale-phone"), { target: { value: "98765 43210" } });
    fireEvent.click(screen.getByTestId("smm-add-sale-find"));
    await screen.findByTestId("smm-add-sale-none");
    expect(screen.queryByTestId("smm-add-sale-no-sale")).toBeNull();
  });
});

describe("the board", () => {
  const today = isoDay(new Date());
  const base = {
    leadId: "l1", saleItemKey: "k", origin: "sale", clientPhone: "+919876543210", clientPhoneId: "919876543210",
    clientName: "Ravi", packageKey: "Starter Package", packageLabel: "Starter Package", amount: 10000,
    platforms: ["instagram"], commitments: { poster: 4, ai_ad: 4, real_video: 0 }, items: [], ads: [], budgetPayments: [],
    soldBy: "anil", soldByName: "Anil", watchers: ["anil"], status: "active", renewal: { state: "none" },
  };
  const noTeam = { creator: null, publisher: null, marketer: null, assistants: [] };
  const withTeam = { ...noTeam, creator: { uid: "arjun", name: "Arjun" } };

  beforeEach(() => {
    localStorage.clear();
    const start = new Date(); start.setDate(start.getDate() - 29);
    BOARD = [
      { ...base, id: "a", orderId: "a", businessName: "Needs Team Co", cycle: monthCycle(today), team: noTeam },
      { ...base, id: "b", orderId: "b", businessName: "Ending Soon Co", cycle: monthCycle(isoDay(start)), team: withTeam },
    ];
  });

  it("puts a month with nobody on it under Needs setup, with Set up & assign for the tech side", () => {
    render(<MemoryRouter><SocialMedia /></MemoryRouter>);
    // The cards open first; the status row counts and filters them.
    expect(screen.getAllByTestId("smm-campaign-card")).toHaveLength(2);
    expect(screen.getByTestId("smm-count-setup").textContent).toBe("1");
    fireEvent.click(screen.getByTestId("smm-tab-setup"));
    const cards = screen.getAllByTestId("smm-campaign-card");
    expect(cards).toHaveLength(1);
    expect(within(cards[0]).getByTestId("smm-card-business").textContent).toBe("Needs Team Co");
    expect(within(cards[0]).getByTestId("smm-card-setup")).toBeTruthy();
    expect(screen.getByTestId("smm-add-sale-open")).toBeTruthy();
  });

  it("gives the month's salesperson Renew on a month ending soon — and nobody else", () => {
    AUTH = { user: { uid: "anil", name: "Anil", role: "sales_member" } };
    render(<MemoryRouter><SocialMedia /></MemoryRouter>);
    fireEvent.click(screen.getByTestId("smm-tab-renewals"));
    const card = screen.getAllByTestId("smm-campaign-card").find((c) => c.textContent?.includes("Ending Soon Co"))!;
    expect(within(card).getByTestId("smm-card-renew")).toBeTruthy();
    expect(screen.queryByTestId("smm-add-sale-open")).toBeNull();
    cleanup();

    AUTH = { user: { uid: "kiran", name: "Kiran", role: "tech_admin" } };
    render(<MemoryRouter><SocialMedia /></MemoryRouter>);
    fireEvent.click(screen.getByTestId("smm-tab-renewals"));
    expect(screen.queryByTestId("smm-card-renew")).toBeNull();
  });

  it("marks a month that had no sale on its card — and its salesperson still renews it", () => {
    AUTH = { user: { uid: "anil", name: "Anil", role: "sales_member" } };
    const start = new Date(); start.setDate(start.getDate() - 29);
    BOARD = [{
      ...base, id: "n", orderId: "", leadId: "", saleItemKey: "", origin: "no_sale", amount: 0,
      businessName: "Old Client Co", cycle: monthCycle(isoDay(start)), team: withTeam,
    }];
    render(<MemoryRouter><SocialMedia /></MemoryRouter>);
    fireEvent.click(screen.getByTestId("smm-tab-renewals"));
    const card = screen.getAllByTestId("smm-campaign-card")[0];
    expect(within(card).getByTestId("smm-card-no-sale").textContent).toBe("No sale");
    expect(within(card).getByTestId("smm-card-team").textContent).toMatch(/salesperson Anil/);
    expect(within(card).getByTestId("smm-card-renew")).toBeTruthy();
  });

  it("says each month's status in words, puts the worst first, and filters by status", () => {
    const late = new Date(); late.setDate(late.getDate() - 2);
    const start = new Date(); start.setDate(start.getDate() - 10);
    const lateItem = { id: "x1", kind: "poster", title: "Diwali offer", uploadDate: isoDay(late), uploadTime: "06:00", platforms: ["instagram"],
      status: "planned", approval: { state: "not_sent", chases: [] }, extra: false, postedAt: null };
    BOARD = [
      { ...base, id: "fine", orderId: "fine", businessName: "Fine Co", cycle: monthCycle(today), team: withTeam },
      { ...base, id: "late", orderId: "late", businessName: "Late Co", cycle: monthCycle(isoDay(start)), team: withTeam, items: [lateItem] },
    ];
    render(<MemoryRouter><SocialMedia /></MemoryRouter>);
    const cards = screen.getAllByTestId("smm-campaign-card");
    expect(within(cards[0]).getByTestId("smm-card-business").textContent).toBe("Late Co");
    expect(within(cards[0]).getByTestId("smm-status").textContent).toContain("Off track");
    expect(within(cards[0]).getByTestId("smm-card-reason").textContent).toContain("1 post is late");
    expect(within(cards[1]).getByTestId("smm-status").textContent).toContain("On track");
    expect(screen.getByTestId("smm-count-off").textContent).toBe("1");
    fireEvent.click(screen.getByTestId("smm-tab-off"));
    expect(screen.getAllByTestId("smm-campaign-card").map((c) => within(c).getByTestId("smm-card-business").textContent)).toEqual(["Late Co"]);
    fireEvent.click(screen.getByTestId("smm-tab-ok"));
    expect(screen.getAllByTestId("smm-campaign-card").map((c) => within(c).getByTestId("smm-card-business").textContent)).toEqual(["Fine Co"]);
  });

  it("keeps the charts one switch away, as Insights", () => {
    render(<MemoryRouter><SocialMedia /></MemoryRouter>);
    expect(screen.queryByTestId("smm-dashboard")).toBeNull();
    fireEvent.click(screen.getByTestId("smm-view-insights"));
    expect(screen.getByTestId("smm-dashboard")).toBeTruthy();
    expect(screen.queryByTestId("smm-status-filters")).toBeNull();
  });

  it("opens a client's calendar from Calendar, and remembers the view", async () => {
    fetchClientMonths.mockClear();
    render(<MemoryRouter><SocialMedia /></MemoryRouter>);
    fireEvent.click(screen.getByTestId("smm-view-calendar"));
    // Both months are one client's (same number): one entry, on the month they are in now.
    expect(screen.getAllByTestId("smm-calboard-client")).toHaveLength(1);
    expect(screen.getByTestId("smm-calboard-name").textContent).toBe("Needs Team Co");
    expect(screen.getByTestId("smm-calendar")).toBeTruthy();
    expect(screen.queryByTestId("smm-status-filters")).toBeNull();
    // An overseer's board holds running months only, so the client's history is read — once.
    await waitFor(() => expect(fetchClientMonths).toHaveBeenCalledWith("919876543210"));
    expect(localStorage.getItem("dts_smm_view")).toBe("calendar");
  });

  it("reads nothing more for a salesperson, whose board already holds every month they can see", () => {
    AUTH = { user: { uid: "anil", name: "Anil", role: "sales_member" } };
    fetchClientMonths.mockClear();
    render(<MemoryRouter initialEntries={["/smm?view=calendar"]}><SocialMedia /></MemoryRouter>);
    expect(screen.getByTestId("smm-calendar")).toBeTruthy();
    expect(screen.queryByTestId("smm-calboard-finished")).toBeNull();
    expect(fetchClientMonths).not.toHaveBeenCalled();
  });
});

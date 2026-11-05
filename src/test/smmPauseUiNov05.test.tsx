import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * Pausing a running SMM month (owner, 2026-11-05) — the screens, on the real month page and board over
 * the in-memory Firestore: who gets Pause month, what the dialog says before it saves (the new renewal
 * day, the days left of 15, the refusal sentence), the Paused banner with Restart today, and the board's
 * Paused filter.
 */

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("@/services/notifications", () => ({ sendNotification: vi.fn(async () => undefined) }));
vi.mock("@/services/cloudinary", () => ({ uploadToCloudinary: vi.fn(async () => "https://res.cloudinary.com/x/proof.png") }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn(() => ({ id: "t", dismiss: vi.fn(), update: vi.fn() })) }));

const mem = await import("./memoryFirestore");
const smm = await import("@/services/smm");
const { useAuthStore } = await import("@/store/authStore");
const SmmCampaignPage = (await import("@/pages/shared/SmmCampaignPage")).default;
const { endAfterPause } = await import("@/utils/smmPause");
import type { SmmCampaign, SmmTeam } from "@/types/smm";
import type { AppUser } from "@/types";

configure({ testIdAttribute: "data-test" });

const SELLER = { uid: "anil", name: "Anil", role: "sales_member", isActive: true } as AppUser;
const MEMBER = { uid: "arjun", name: "Arjun", role: "tech_member", isActive: true } as AppUser;
const LEAD = { uid: "manasa", name: "Manasa", role: "tech_member", smmLeader: true, isActive: true } as AppUser;

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const team: SmmTeam = { creator: { uid: MEMBER.uid, name: MEMBER.name }, publisher: null, marketer: null, assistants: [] };

/** A sold month that started five days ago — running. */
function seedRunning(id = "m_run", extra: Partial<SmmCampaign> = {}): SmmCampaign {
  const built = smm.buildSoldCampaign({
    orderId: id, leadId: `lead_${id}`, saleItemKey: "k1", clientPhone: "+919876543210", clientPhoneId: "919876543210",
    clientName: "Client", businessName: "Lakshmi Jewellers", packageKey: "smm_basic", packageLabel: "SMM Basic",
    amount: 6000, platforms: ["instagram"], commitments: { poster: 2, ai_ad: 1, real_video: 0 },
    soldBy: SELLER.uid, soldByName: SELLER.name,
  }, { startDate: day(-5), team });
  const month = { ...built, id, setupAt: { seconds: 1 }, setupByName: "Kiran", ...extra } as unknown as SmmCampaign;
  mem.__seed(`smm_campaigns/${id}`, month as unknown as Record<string, unknown>);
  mem.__seed(`orders/${id}`, { id, status: "assigned", category: "social_media_management" });
  return month;
}
const read = (id: string) => mem.__read(`smm_campaigns/${id}`) as unknown as SmmCampaign;
const signIn = (u: AppUser | null) => useAuthStore.setState({ user: u, loading: false });
const openPage = (id = "m_run") => render(
  <MemoryRouter initialEntries={[`/smm/${id}`]}>
    <Routes><Route path="/smm/:campaignId" element={<SmmCampaignPage />} /></Routes>
  </MemoryRouter>,
);

beforeEach(() => { mem.__reset(); signIn(null); });
afterEach(() => { cleanup(); signIn(null); });

describe("Pause month on the month page", () => {
  it("is offered to the salesperson, not to a member or the view-only Team Lead", async () => {
    seedRunning();
    signIn(SELLER);
    openPage();
    expect(await screen.findByTestId("smm-page-pause")).toBeTruthy();
    cleanup();
    for (const who of [MEMBER, LEAD]) {
      signIn(who);
      openPage();
      await screen.findByTestId("smm-page-glance");
      expect(screen.queryByTestId("smm-page-pause"), who.name).toBeNull();
      cleanup();
    }
  });

  it("says the new renewal day before saving, refuses without a reason, then pauses and shows the banner", async () => {
    const month = seedRunning();
    signIn(SELLER);
    openPage();
    fireEvent.click(await screen.findByTestId("smm-page-pause"));
    const dialog = await screen.findByTestId("smm-pause-dialog");
    fireEvent.click(within(dialog).getByTestId("smm-pause-quick-3"));
    // No reason yet — the save is off and the rule's own sentence is shown.
    expect(within(dialog).getByTestId("smm-pause-problem").textContent).toMatch(/Pick why/);
    expect((within(dialog).getByTestId("smm-pause-save") as HTMLButtonElement).disabled).toBe(true);
    const effect = within(dialog).getByTestId("smm-pause-effect").textContent || "";
    expect(effect).toMatch(/Renewal moves .* → .* · 3 paused days \(12 of 15 left\)/);

    fireEvent.click(within(dialog).getByTestId("smm-pause-reason-client_asked"));
    expect(within(dialog).queryByTestId("smm-pause-problem")).toBeNull();
    fireEvent.click(within(dialog).getByTestId("smm-pause-save"));

    await waitFor(() => expect(read("m_run").pause?.until).toBe(day(3)));
    const saved = read("m_run");
    expect(saved.pause).toMatchObject({ from: day(0), reasonKind: "client_asked", byUid: SELLER.uid, endBefore: month.cycle.endDate });
    expect(saved.cycle.endDate).toBe(endAfterPause(month.cycle.endDate, day(0), day(3)));

    // The live page shows it paused: the banner, no Pause button, the status pill says Paused.
    expect((await screen.findByTestId("smm-pause-sentence")).textContent).toMatch(/^Paused .* · back on .* · renewal moved to /);
    expect(screen.queryByTestId("smm-page-pause")).toBeNull();
    expect(screen.getByTestId("smm-page-reason").textContent).toMatch(/Paused till/);
  });

  it("asks for a note with Other, and the 15-day cap stops a salesperson", async () => {
    seedRunning();
    signIn(SELLER);
    openPage();
    fireEvent.click(await screen.findByTestId("smm-page-pause"));
    const dialog = await screen.findByTestId("smm-pause-dialog");
    fireEvent.click(within(dialog).getByTestId("smm-pause-reason-other"));
    expect(within(dialog).getByTestId("smm-pause-problem").textContent).toMatch(/Write why/);
    fireEvent.change(within(dialog).getByTestId("smm-pause-note"), { target: { value: "Owner travelling" } });
    fireEvent.change(within(dialog).getByTestId("smm-pause-until"), { target: { value: day(16) } });
    expect(within(dialog).getByTestId("smm-pause-problem").textContent).toMatch(/at most 15 days/);
  });

  it("restarts today from the banner: the pause goes into the history and the renewal day comes back", async () => {
    const month = seedRunning();
    signIn(SELLER);
    // Paused from two days ago until five days ahead.
    mem.__seed("smm_campaigns/m_run", {
      ...(read("m_run") as unknown as Record<string, unknown>),
      pause: { from: day(-2), until: day(5), reasonKind: "festival", note: "Wedding", proofUrl: null,
        endBefore: month.cycle.endDate, at: 1, byUid: SELLER.uid, byName: SELLER.name },
      cycle: { ...month.cycle, endDate: endAfterPause(month.cycle.endDate, day(-2), day(5)) },
    });
    openPage();
    expect((await screen.findByTestId("smm-pause-sentence")).textContent).toMatch(/^Paused/);
    expect(screen.queryByTestId("smm-pause-cancel")).toBeNull(); // started two days ago: resume, not cancel
    fireEvent.click(screen.getByTestId("smm-pause-resume"));
    const confirm = await screen.findByRole("alertdialog");
    fireEvent.click(within(confirm).getByRole("button", { name: "Restart today" }));
    await waitFor(() => expect(read("m_run").pause ?? null).toBeNull());
    const saved = read("m_run");
    expect(saved.cycle.endDate).toBe(endAfterPause(month.cycle.endDate, day(-2), day(0)));
    expect(saved.pauses?.[0]).toMatchObject({ from: day(-2), days: 2, reasonKind: "festival" });
    expect((await screen.findByTestId("smm-pause-history")).textContent).toMatch(/Earlier pauses \(1\) · 2 days in all/);
    expect(await screen.findByTestId("smm-page-pause")).toBeTruthy();
  });
});

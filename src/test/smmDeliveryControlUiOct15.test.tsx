/**
 * SMM Delivery Control on screen (2026-10-15, phases 2–4), on the in-memory Firestore: the classic page's one new
 * button (Preview: admins / team leaders / the Social Media Team Lead; Live: all six roles), the new page per role
 * (tabs, tiles, Today cards, Weeks, Client plan with Switch on this month, read-only in Preview), a member's answers
 * in Live (Start, Blocked), the view-only lead, the full-screen alert (answered, never closed; a late reason clears
 * it) and the check-out step (Submit waits for a reason per piece).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {}, auth: { currentUser: null } }));
const sendNotification = vi.fn(async (_p: Record<string, unknown>) => undefined);
vi.mock("@/services/notifications", () => ({ sendNotification, notifyTechTeamLeaders: vi.fn(async () => undefined) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn(() => ({ id: "t", dismiss: vi.fn(), update: vi.fn() })) }));
vi.mock("@/services/smmAi", () => ({
  memberWeekBrief: vi.fn(async () => ({ text: "Your week: 2 pieces.", usedAi: false })),
  morningBrief: vi.fn(async () => ({ text: "Good morning.", usedAi: false })),
  reasonsSummary: vi.fn(async () => ({ text: "No reasons yet.", usedAi: false })),
  clientWeeklyUpdate: vi.fn(async () => ({ text: "Update", usedAi: false })),
  suggestWeekTasks: vi.fn(async () => ({ suggestions: [], usedAi: false })),
}));

const mem = await import("./memoryFirestore");
const { useAuthStore } = await import("@/store/authStore");
const { __resetPopupsForTests } = await import("@/store/popupStore");
const SmmDeliveryControl = (await import("@/pages/shared/SmmDeliveryControl")).default;
const SmmAlertHost = (await import("@/components/smm/alerts/SmmAlertHost")).default;
const CheckoutSmmReasons = (await import("@/components/smm/alerts/CheckoutSmmReasons")).default;
import { month as fixtureMonth, piece } from "./smmDeliveryFixtures";
import { istMoment } from "@/utils/smmCadence";
import type { AppUser } from "@/types";

configure({ testIdAttribute: "data-test" });

const KIRAN = { uid: "kiran", name: "Kiran", role: "tech_admin", isActive: true } as AppUser;
const RAVI = { uid: "ravi", name: "Ravi", role: "tech_member", isActive: true } as AppUser;
const MANASA = { uid: "manasa", name: "Manasa", role: "tech_member", smmLeader: true, isActive: true } as AppUser;
const SITA = { uid: "sita", name: "Sita", role: "sales_member", isActive: true } as AppUser;
const signIn = (u: AppUser | null) => useAuthStore.setState({ user: u, loading: false });

/** Mon 26 Oct 2026, 11:00 IST — week 2 of the month (deadline Wed 28 Oct); week 1's video is late. */
const MON26 = istMoment("2026-10-26", 11);

function seed(mode: "preview" | "live" | "off" | null) {
  if (mode) mem.__seed("app_settings/smm_delivery", { mode, history: mode === "live" ? [{ mode: "live", at: istMoment("2026-10-15", 9), byUid: "kiran", byName: "Kiran" }] : [] });
  const m = fixtureMonth({
    items: [
      piece({ id: "w1", title: "Diwali gold", plan: { week: 1, by: "auto" }, makerUid: "ravi", makerName: "Ravi", publisherUid: "ravi", publisherName: "Ravi" }),
      piece({ id: "w2", title: "Founder story", plan: { week: 2, by: "auto" }, makerUid: "ravi", makerName: "Ravi", publisherUid: "ravi", publisherName: "Ravi" }),
      piece({ id: "w3", plan: { week: 3, by: "auto" }, makerUid: "ravi", makerName: "Ravi" }),
    ],
    commitments: { ai_ad: 3, poster: 0, real_video: 0 },
    team: { creator: { uid: "ravi", name: "Ravi" }, publisher: { uid: "ravi", name: "Ravi" }, marketer: null, assistants: [] },
    watchers: ["ravi", "sita"],
  });
  mem.__seed("smm_campaigns/m1", { ...m, id: undefined } as never);
  for (const u of [KIRAN, RAVI, MANASA, SITA]) mem.__seed(`users/${u.uid}`, u as never);
}

const item = (id: string) => (mem.__read("smm_campaigns/m1") as { items: { id: string }[] }).items.find((i) => i.id === id) as Record<string, unknown>;

function page(path = "/smm/control") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/smm/control" element={<SmmDeliveryControl />} />
        <Route path="/smm/control/:monthId" element={<SmmDeliveryControl />} />
        <Route path="/smm" element={<p>classic</p>} />
        <Route path="/smm/:campaignId" element={<p>classic month</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MON26);
  mem.__reset();
  __resetPopupsForTests();
  sendNotification.mockClear();
  signIn(null);
  try { localStorage.clear(); } catch { /* none */ }
});
afterEach(() => {
  cleanup();
  signIn(null);
  vi.useRealTimers();
});

describe("the new page", () => {
  it("Preview, the tech admin: the status line, tiles, every tab, Today's late card first, read-only answers", async () => {
    seed("preview");
    signIn(KIRAN);
    page();
    expect(await screen.findByTestId("smm-control-mode", undefined, { timeout: 4000 })).toHaveTextContent("Preview");
    expect(screen.getByTestId("smm-control-preview-banner")).toBeInTheDocument();
    for (const t of ["today", "weeks", "plan", "team", "start", "log", "settings"]) expect(screen.getByTestId(`smm-control-tab-${t}`)).toBeInTheDocument();
    const cards = await screen.findAllByTestId("smm-week-card", undefined, { timeout: 4000 });
    expect(cards[0]).toHaveAttribute("data-group", "late");
    expect(within(cards[0]).getByText(/Late — was due Wed 21 Oct, 7 PM/)).toBeInTheDocument();
    // Preview: the main button only opens the details.
    expect(within(cards[0]).getByTestId("smm-task-main")).toHaveTextContent("Details");
    // The remembered screen (decision 16).
    expect(localStorage.getItem("dts_smm_ui")).toBe("control");
  });

  it("Weeks: one row per client, the current week ringed; Starting line lists week 1 in Preview", async () => {
    seed("preview");
    signIn(KIRAN);
    page("/smm/control?tab=weeks");
    const cells = await screen.findAllByTestId("smm-week-cell", undefined, { timeout: 4000 });
    expect(cells).toHaveLength(4);
    expect(cells[1]).toHaveAttribute("data-current", "true");
    cleanup();
    page("/smm/control?tab=start");
    expect(await screen.findAllByTestId("smm-start-row", undefined, { timeout: 4000 })).toHaveLength(1);
  });

  it("Client plan: the would-set label, the health check, and Switch on this month saves the plan", async () => {
    mem.__seed("app_settings/smm_delivery", { mode: "preview" });
    const m = fixtureMonth({ items: [piece({ id: "a" }), piece({ id: "b" })], commitments: { ai_ad: 2, poster: 0, real_video: 0 }, watchers: ["ravi"] });
    mem.__seed("smm_campaigns/m1", { ...m, id: undefined } as never);
    signIn(KIRAN);
    page("/smm/control/m1");
    expect(await screen.findByTestId("smm-plan-would-set", undefined, { timeout: 4000 })).toHaveTextContent(/would be set, not saved/);
    expect(screen.getAllByTestId("smm-plan-week")).toHaveLength(4);
    fireEvent.click(screen.getByTestId("smm-plan-switch-on"));
    fireEvent.click(await screen.findByRole("button", { name: "Switch on" }));
    await waitFor(() => expect((mem.__read("smm_campaigns/m1") as { delivery?: { activatedByName: string } }).delivery?.activatedByName).toBe("Kiran"));
    expect(item("a").plan).toMatchObject({ week: 1, by: "auto" });
  });

  it("a member who is not allowed in Preview is told so, with the way back", async () => {
    seed("preview");
    signIn(RAVI);
    page();
    expect(await screen.findByTestId("smm-control-closed")).toHaveTextContent(/Preview/);
  });

  it("Live, a member: their own pieces; Start marks it being made; Blocked asks what is in the way", async () => {
    seed("live");
    signIn(RAVI);
    page();
    const cards = await screen.findAllByTestId("smm-week-card", undefined, { timeout: 4000 });
    const week2 = cards.find((c) => c.textContent?.includes("Week 2 of 4"))!;
    fireEvent.click(within(week2).getByTestId("smm-task-main"));
    await waitFor(() => expect(item("w2").status).toBe("in_progress"));
    expect(typeof item("w2").startedAt).toBe("number");
  });

  it("Live, the view-only Social Media Team Lead: everyone's pieces, but only Details on a month she is not on", async () => {
    seed("live");
    signIn(MANASA);
    page();
    const cards = await screen.findAllByTestId("smm-week-card", undefined, { timeout: 4000 });
    for (const b of within(cards[0]).getAllByTestId("smm-task-main")) expect(b).toHaveTextContent("Details");
    fireEvent.click(within(cards[0]).getAllByTestId("smm-task-main")[0]);
    expect(await screen.findByText(/View only — only the people on this month/)).toBeInTheDocument();
  });
});

describe("the full-screen alert", () => {
  it("Live: the late owner gets a full screen naming the type; it cannot be closed and a late reason clears it", async () => {
    seed("live");
    signIn(RAVI);
    render(<MemoryRouter initialEntries={["/tech/dashboard"]}><SmmAlertHost /></MemoryRouter>);
    const screenEl = await screen.findByTestId("smm-alert-screen", undefined, { timeout: 4000 });
    expect(screenEl).toHaveAttribute("role", "alertdialog");
    expect(screenEl).toHaveTextContent("🎬 AI VIDEO · Lakshmi Jewellers");
    expect(within(screenEl).queryByRole("button", { name: /close/i })).toBeNull();
    fireEvent.click(within(screenEl).getByRole("button", { name: "Say why it is late" }));
    fireEvent.click(within(screenEl).getByRole("button", { name: "Too much work today" }));
    fireEvent.click(within(screenEl).getByRole("button", { name: "Save" }));
    await waitFor(() => expect((item("w1").lateReasons as unknown[]).length).toBe(1));
  });

  it("Preview: nobody is alerted", async () => {
    seed("preview");
    signIn(RAVI);
    render(<MemoryRouter><SmmAlertHost /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByTestId("smm-alert-screen")).toBeNull();
    expect(screen.queryByTestId("smm-alert-bar")).toBeNull();
  });

  it("on Delivery Control too the full screen shows; 'Open it' gives ten minutes there as the red bar", async () => {
    seed("live");
    signIn(RAVI);
    render(
      <MemoryRouter initialEntries={["/smm/control"]}>
        <SmmAlertHost />
        <Routes><Route path="*" element={<p>page</p>} /></Routes>
      </MemoryRouter>,
    );
    const full = await screen.findByTestId("smm-alert-screen", undefined, { timeout: 4000 });
    fireEvent.click(within(full).getAllByRole("button", { name: /Open it/ })[0]);
    expect(await screen.findByTestId("smm-alert-bar")).toHaveTextContent(/Answer it here/);
    expect(screen.queryByTestId("smm-alert-screen")).toBeNull();
  });
});

describe("the check-out step", () => {
  it("lists the member's late piece and reports complete only once a reason is picked", async () => {
    seed("live");
    signIn(RAVI);
    const states: { complete: boolean; entries: unknown[] }[] = [];
    render(<MemoryRouter><CheckoutSmmReasons user={RAVI} onChange={(s) => states.push(s)} /></MemoryRouter>);
    const rows = await screen.findAllByTestId("checkout-smm-row", undefined, { timeout: 4000 });
    expect(rows[0]).toHaveTextContent(/Lakshmi Jewellers · Diwali gold — Late/);
    expect(states.at(-1)?.complete).toBe(false);
    for (const r of rows) fireEvent.click(within(r).getAllByRole("button")[0]);
    await waitFor(() => expect(states.at(-1)?.complete).toBe(true));
    expect(states.at(-1)?.entries).toHaveLength(rows.length);
  });
});

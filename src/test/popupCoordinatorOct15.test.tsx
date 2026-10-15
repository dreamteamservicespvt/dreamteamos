import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * The popup coordinator in the app (2026-10-15, SMM Delivery Control phase 0): the 11 AM / 5 PM post-status
 * check now waits its turn through `store/popupStore` — never over a call, the studio, the check-in gate
 * (even before it appears), another popup, and not within ten minutes of a different popup closing — and
 * the popups that do not wait only REPORT themselves, showing exactly when they did before.
 */

const { smmApi } = vi.hoisted(() => ({
  smmApi: {
    fetchMyCampaigns: vi.fn(async () => [] as unknown[]),
    watchMyCampaigns: vi.fn(() => () => {}),
    setItemStatus: vi.fn(async () => {}),
  },
}));
vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("@/services/smm", () => smmApi);
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));
vi.mock("@/components/smm/SmmDueCard", () => ({ default: () => null }));
vi.mock("@/utils/attendance", () => ({
  getTodayWorkStats: () => ({ inProgress: 0, pending: 0, completedToday: 0 }),
  performCheckIn: vi.fn(),
}));

const mem = await import("./memoryFirestore");
const { useAuthStore } = await import("@/store/authStore");
const { usePopupStore, tryOpenPopup, __resetPopupsForTests } = await import("@/store/popupStore");
const { usePopupClaim } = await import("@/hooks/usePopupClaim");
const { POPUP_GAP_MS } = await import("@/utils/popupCoordinator");
const SmmStatusCheckPopup = (await import("@/components/smm/SmmStatusCheckPopup")).default;
const DailyCheckinPrompt = (await import("@/components/attendance/DailyCheckinPrompt")).default;
const UpdatePopup = (await import("@/components/layout/UpdatePopup")).default;

const ARJUN = { uid: "arjun", id: "arjun", name: "Arjun", role: "tech_member", isActive: true };
const kinds = () => usePopupStore.getState().claims.map((c) => `${c.kind}${c.pending ? "?" : ""}`);

beforeEach(() => {
  mem.__reset();
  __resetPopupsForTests();
  localStorage.clear();
  sessionStorage.clear();
  smmApi.fetchMyCampaigns.mockClear();
  useAuthStore.setState({ user: ARJUN as never, loading: false });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the registry", () => {
  it("a waiting popup gets the screen once; a second one waits until it is given back", () => {
    const release = tryOpenPopup("smm_status_check");
    expect(release).toBeTypeOf("function");
    expect(tryOpenPopup("smm_alert")).toBeNull();
    release!();
    release!(); // twice is harmless
    expect(kinds()).toEqual([]);
    // …and then the ten-minute gap applies to a different popup, not to the same kind.
    expect(tryOpenPopup("smm_alert")).toBeNull();
    expect(tryOpenPopup("smm_status_check")).toBeTypeOf("function");
  });

  it("a claim taken while still pending leaves no gap behind it", () => {
    const { rerender, unmount } = renderHook(({ on, pending }) => usePopupClaim("checkin", on, pending), { initialProps: { on: true, pending: true } });
    expect(kinds()).toEqual(["checkin?"]);
    rerender({ on: false, pending: true });
    expect(kinds()).toEqual([]);
    expect(usePopupStore.getState().closes).toEqual([]);
    rerender({ on: true, pending: true });
    rerender({ on: true, pending: false }); // the gate appeared — the same claim, now shown
    expect(kinds()).toEqual(["checkin"]);
    unmount();
    expect(usePopupStore.getState().closes.map((c) => c.kind)).toEqual(["checkin"]);
  });
});

/* ── The 11 AM / 5 PM post-status check ───────────────────────────────────────────────────── */

const MONTH = {
  id: "m1", businessName: "Lakshmi Jewellers", status: "active",
  cycle: { month: "2026-10", startDate: "2026-10-10", endDate: "2026-11-10" },
  team: { creator: { uid: "arjun", name: "Arjun" }, publisher: null, marketer: null, assistants: [] },
  commitments: { ai_ad: 1, poster: 0, real_video: 0 }, soldBy: "gov", watchers: ["arjun"],
  items: [{ id: "v1", kind: "ai_ad", title: "Diwali offer", status: "in_progress", uploadDate: "2026-10-20", uploadTime: null, platforms: ["instagram"], approval: { state: "not_sent" }, extra: false, makerUid: "arjun" }],
};

async function at11(fn: () => void = () => {}) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 15, 11, 5)); // Thursday 11:05
  smmApi.fetchMyCampaigns.mockResolvedValue([MONTH]);
  fn();
  render(<MemoryRouter><SmmStatusCheckPopup /></MemoryRouter>);
  await act(async () => { await vi.advanceTimersByTimeAsync(8_100); });
}
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
const check = () => screen.queryByText(/11 AM check/);

describe("the post-status check waits its turn", () => {
  it("opens on a free screen and holds it while open; Later gives it back", async () => {
    await at11();
    expect(check()).toBeTruthy();
    expect(kinds()).toEqual(["smm_status_check"]);
    fireEvent.click(screen.getByText("Later (30 min)"));
    expect(check()).toBeNull();
    expect(kinds()).toEqual([]);
  });

  it("never over a ringing call — it opens on the first tick after the call ends", async () => {
    let endCall = () => {};
    await at11(() => { endCall = tryOpenPopup("call")!; });
    expect(check()).toBeNull();
    await tick();
    expect(check()).toBeNull();
    endCall();
    await tick();
    expect(check()).toBeTruthy();
  });

  it("waits for the check-in gate even before the gate has appeared (pending)", async () => {
    const id = usePopupStore.getState().claim("checkin", true);
    await at11();
    expect(check()).toBeNull();
    act(() => usePopupStore.getState().release(id));
    await tick();
    expect(check()).toBeTruthy();
  });

  it("waits while the AI studio is open", async () => {
    let closeStudio = () => {};
    await at11(() => { closeStudio = tryOpenPopup("studio")!; });
    expect(check()).toBeNull();
    closeStudio();
    await tick();
    expect(check()).toBeTruthy();
  });

  it("leaves ten minutes after another popup closed", async () => {
    await at11(() => {
      const id = usePopupStore.getState().claim("update");
      usePopupStore.getState().release(id); // the update popup closed at 11:05
    });
    expect(check()).toBeNull();
    for (let i = 0; i < 8; i++) await tick(); // 11:13
    expect(check()).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(POPUP_GAP_MS); });
    expect(check()).toBeTruthy();
  });
});

/* ── The popups that do not wait only report ──────────────────────────────────────────────── */

describe("existing popups report themselves (and show as before)", () => {
  it("the daily check-in: pending while it reads, shown when it asks, gone once checked in", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 15, 9, 30)); // a Thursday, a working day
    render(<DailyCheckinPrompt />);
    expect(kinds()).toEqual(["checkin?"]); // before its reads answer
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByText(/Mark your attendance/)).toBeTruthy();
    expect(kinds()).toEqual(["checkin"]);
    act(() => mem.__seed("daily_checkins/c1", { memberId: "arjun", date: "2026-10-15" }));
    await act(async () => { await Promise.resolve(); });
    expect(kinds()).toEqual([]);
    expect(usePopupStore.getState().closes.map((c) => c.kind)).toEqual(["checkin"]);
  });

  it("the daily check-in holds nothing on a Sunday", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 18, 9, 30)); // a Sunday
    render(<DailyCheckinPrompt />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText(/Mark your attendance/)).toBeNull();
    expect(kinds()).toEqual([]);
  });

  it("the update popup: claimed while a new job is on screen, given back on Later", async () => {
    mem.__seed("notifications/n1", {
      userId: "arjun", type: "work_assigned", title: "New work assigned", message: "Lakshmi Jewellers — 32 s video",
      read: false, createdAt: mem.Timestamp.now(),
    });
    render(<MemoryRouter><UpdatePopup /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("New work assigned")).toBeTruthy();
    expect(kinds()).toEqual(["update"]);
    fireEvent.click(screen.getByText("Later"));
    expect(screen.queryByText("New work assigned")).toBeNull();
    expect(kinds()).toEqual([]);
  });
});

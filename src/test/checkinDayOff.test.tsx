import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * The daily check-in is mandatory on a working day — and stays away on a Sunday or an announced
 * holiday, so a member who opens the platform on their day off gets straight in.
 */

/** What the fake Firestore answers: is today's holiday doc there, and has the member checked in. */
const state = { holiday: false, checkedIn: false };

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, name: string) => ({ name }),
  doc: (_db: unknown, name: string, id: string) => ({ name, id }),
  query: (ref: { name: string }) => ref,
  where: () => ({}),
  onSnapshot: (ref: { name: string }, next: (snap: any) => void) => {
    if (ref.name === "holidays") next({ exists: () => state.holiday });
    else if (ref.name === "daily_checkins") next({ empty: !state.checkedIn });
    else next({ docs: [] });
    return () => {};
  },
}));
vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/components/smm/SmmDueCard", () => ({ default: () => null }));
vi.mock("@/utils/attendance", () => ({
  getTodayWorkStats: () => ({ inProgress: 0, pending: 0, completedToday: 0 }),
  performCheckIn: vi.fn(),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/store/authStore", () => ({
  useAuthStore: (select: (s: any) => unknown) => select({ user: { uid: "m1", name: "Ravi", role: "tech_member" } }),
}));

const { default: DailyCheckinPrompt } = await import("@/components/attendance/DailyCheckinPrompt");

const prompt = () => screen.queryByText(/Mark your attendance/);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  state.holiday = false;
  state.checkedIn = false;
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("the daily check-in prompt", () => {
  it("asks on a working day before the member has checked in", () => {
    vi.setSystemTime(new Date("2026-09-22T09:30:00")); // a Tuesday
    render(<DailyCheckinPrompt />);
    expect(prompt()).toBeTruthy();
  });

  it("stays away on a Sunday", () => {
    vi.setSystemTime(new Date("2026-09-20T09:30:00")); // a Sunday
    render(<DailyCheckinPrompt />);
    expect(prompt()).toBeNull();
  });

  it("stays away on an announced holiday", () => {
    vi.setSystemTime(new Date("2026-09-22T09:30:00"));
    state.holiday = true;
    render(<DailyCheckinPrompt />);
    expect(prompt()).toBeNull();
  });

  it("stays away once the member has checked in", () => {
    vi.setSystemTime(new Date("2026-09-22T09:30:00"));
    state.checkedIn = true;
    render(<DailyCheckinPrompt />);
    expect(prompt()).toBeNull();
  });
});

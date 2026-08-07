import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Recent Ads opens the same generator as My Work — and moves the job to "in progress" the moment
 * it is opened — but passed no `onComplete`, so the Submit button never rendered. A member who
 * started a job from here had no way to hand it in without going to find it on the other page.
 *
 * These drive the real page, and check that submitting from it does the same five things My Work
 * does, since both now go through hooks/useCompleteWork.
 */

const assignments = [
  { id: "w1", assignedTo: "u1", assignedBy: "leader1", orderId: "o1", status: "in_progress", businessName: "Sharma Electronics", displayTitle: "Sharma Electronics", uniqueId: "P001", category: "promotional", clipCount: 4, duration: "32s", accessCode: "1111", date: "2026-07-28" },
  { id: "w2", assignedTo: "u1", assignedBy: "leader1", status: "completed", businessName: "Done Already", displayTitle: "Done Already", uniqueId: "P002", category: "promotional", clipCount: 2, duration: "16s", accessCode: "2222", date: "2026-07-27" },
];

const updateDoc = vi.fn(async (_ref: { id: string }, _patch: Record<string, unknown>) => undefined);
const sendNotification = vi.fn(async (_params: Record<string, unknown>) => undefined);
const notifyTechTeamLeaders = vi.fn(async () => undefined);
const markOrderCompleted = vi.fn(async () => undefined);
const upsertClientOnWorkComplete = vi.fn(async () => undefined);

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), doc: (_db: unknown, _c: string, id: string) => ({ id }),
  updateDoc, serverTimestamp: () => "TS", deleteField: vi.fn(),
  // The page carries an unread badge for each job's client chat, which listens for its own rooms.
  onSnapshot: vi.fn(() => () => undefined),
  getDoc: vi.fn(async () => ({ exists: () => false })), setDoc: vi.fn(), addDoc: vi.fn(), deleteDoc: vi.fn(),
  orderBy: vi.fn(), increment: vi.fn(), arrayUnion: vi.fn(), arrayRemove: vi.fn(),
}));
vi.mock("@/hooks/useFirestore", () => ({ useFirestoreQuery: () => ({ data: assignments, loading: false }) }));
const AUTH = { user: { uid: "u1", name: "Jyothika", createdBy: "admin1" } };
vi.mock("@/store/authStore", () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel(AUTH) }));
vi.mock("@/services/notifications", () => ({ sendNotification, notifyTechTeamLeaders }));
vi.mock("@/services/orders", () => ({ markOrderCompleted, revertOrderToAssigned: vi.fn() }));
vi.mock("@/services/clients", () => ({ upsertClientOnWorkComplete }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn(), ConfirmDialog: null }) }));
vi.mock("@/components/dashboard/DayPicker", () => ({ default: () => null }));
vi.mock("@/components/work/SaleDeletedBanner", () => ({ default: () => null }));
// The access-code gate just lets us through; it is not what is under test here.
vi.mock("@/components/ai-platform/CodeVerificationModal", () => ({
  default: ({ onVerified }: { onVerified: () => void }) => (
    <button data-test="verify" onClick={onVerified}>verify</button>
  ),
}));
// Stands in for the generator: exposes exactly what the page hands it.
vi.mock("@/components/ai-platform/AIPlatformApp", () => ({
  default: ({ onComplete, completing }: { onComplete?: () => void; completing?: boolean }) => (
    <div data-test="generator">
      {onComplete
        ? <button data-test="submit" disabled={completing} onClick={onComplete}>Submit</button>
        : <span data-test="no-submit">no submit button</span>}
    </div>
  ),
}));

const RecentAds = (await import("@/pages/tech-member/RecentAds")).default;

configure({ testIdAttribute: "data-test" });

beforeEach(() => {
  updateDoc.mockClear();
  sendNotification.mockClear();
  notifyTechTeamLeaders.mockClear();
  markOrderCompleted.mockClear();
  upsertClientOnWorkComplete.mockClear();
  // A correct code is now remembered per job (utils/workUnlock), and localStorage outlives a
  // render — without this, the first test in the file would unlock the job for all the rest and
  // they would silently stop exercising the gate at all.
  localStorage.clear();
});
afterEach(cleanup);

/** Opens the named ad through the access-code gate. */
const openAd = (name: string) => {
  const row = screen.getByText(name).closest("div.bg-card") as HTMLElement;
  fireEvent.click(within(row).getByRole("button", { name: /open/i }));
  fireEvent.click(screen.getByTestId("verify"));
};

describe("Recent Ads — submitting an in-progress ad", () => {
  it("offers a Submit button, which it never used to", () => {
    render(<RecentAds />);
    openAd("Sharma Electronics");
    expect(screen.getByTestId("submit")).toBeInTheDocument();
  });

  it("marks the assignment completed", async () => {
    render(<RecentAds />);
    openAd("Sharma Electronics");
    fireEvent.click(screen.getByTestId("submit"));

    await waitFor(() => {
      const completion = updateDoc.mock.calls.find(
        (c) => (c[1] as { status?: string })?.status === "completed",
      );
      expect(completion).toBeTruthy();
      expect(completion![1]).toMatchObject({ status: "completed", completedDate: expect.any(String) });
    });
  });

  it("tells the assigner and the team leaders, once each", async () => {
    render(<RecentAds />);
    openAd("Sharma Electronics");
    fireEvent.click(screen.getByTestId("submit"));

    await waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(1));
    expect(sendNotification.mock.calls[0][0]).toMatchObject({
      userId: "leader1",
      type: "work_completed",
      dedupeKey: "work_completed_w1_leader1",
    });
    expect(notifyTechTeamLeaders).toHaveBeenCalledTimes(1);
  });

  it("closes the order and records the client, exactly as My Work does", async () => {
    render(<RecentAds />);
    openAd("Sharma Electronics");
    fireEvent.click(screen.getByTestId("submit"));

    await waitFor(() => expect(markOrderCompleted).toHaveBeenCalledWith("o1"));
    expect(upsertClientOnWorkComplete).toHaveBeenCalledTimes(1);
  });

  it("sends one round however many times the button is tapped", async () => {
    render(<RecentAds />);
    openAd("Sharma Electronics");
    const submit = screen.getByTestId("submit");
    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(upsertClientOnWorkComplete).toHaveBeenCalledTimes(1));
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(notifyTechTeamLeaders).toHaveBeenCalledTimes(1);
  });

  it("shows no Submit button on work already handed in", () => {
    render(<RecentAds />);
    openAd("Done Already");
    expect(screen.getByTestId("no-submit")).toBeInTheDocument();
    expect(screen.queryByTestId("submit")).not.toBeInTheDocument();
  });

  it("returns to the list once the work is submitted", async () => {
    render(<RecentAds />);
    openAd("Sharma Electronics");
    fireEvent.click(screen.getByTestId("submit"));
    await waitFor(() => expect(screen.queryByTestId("generator")).not.toBeInTheDocument());
    expect(screen.getByText("Sharma Electronics")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * The Drive step is on screen the moment a member hands a job in (2026-10-04).
 *
 * It used to open only after every write the completion makes — the job, two alerts, the order, the
 * chat, the client record — so on mobile data the member watched nothing happen for seconds. These
 * drive the real Recent Ads page with the completion's writes held open, to show the step appears
 * before anything is saved, says "Submitting…" until the JOB is saved, then "submitted" while the
 * follow-ups are still running — and never claims a submit that failed.
 */

const assignments = [
  { id: "w1", assignedTo: "u1", assignedBy: "leader1", orderId: "o1", status: "in_progress", businessName: "Sharma Electronics", displayTitle: "Sharma Electronics", uniqueId: "P001", category: "promotional", clipCount: 4, duration: "32s", accessCode: "1111", date: "2026-10-04", sessions: [], totalDurationSeconds: 0 },
];

/** A promise the test resolves or rejects by hand. */
function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

let completionWrite = deferred();
let orderWrite = deferred();
const updateDoc = vi.fn(async (_ref: { id: string }, patch: Record<string, unknown>) => {
  if (patch?.status === "completed") await completionWrite.promise;
});
const markOrderCompleted = vi.fn(async () => { await orderWrite.promise; });
const toast = vi.fn();

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), doc: (_db: unknown, _c: string, id: string) => ({ id }),
  updateDoc: (ref: { id: string }, patch: Record<string, unknown>) => updateDoc(ref, patch),
  serverTimestamp: () => "TS", deleteField: () => "DELETE",
  onSnapshot: vi.fn(() => () => undefined),
  getDoc: vi.fn(async () => ({ exists: () => false })), setDoc: vi.fn(), addDoc: vi.fn(), deleteDoc: vi.fn(),
  orderBy: vi.fn(), increment: vi.fn(), arrayUnion: vi.fn(), arrayRemove: vi.fn(),
}));
vi.mock("@/hooks/useFirestore", () => ({ useFirestoreQuery: () => ({ data: assignments, loading: false }) }));
const AUTH = { user: { uid: "u1", name: "Jyothika", createdBy: "admin1", googleDriveBaseUrl: "https://drive.google.com/drive/folders/x" } };
vi.mock("@/store/authStore", () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel(AUTH) }));
vi.mock("@/services/notifications", () => ({ sendNotification: vi.fn(async () => undefined), notifyTechTeamLeaders: vi.fn(async () => undefined) }));
vi.mock("@/services/orders", () => ({ markOrderCompleted: () => markOrderCompleted(), revertOrderToAssigned: vi.fn() }));
vi.mock("@/services/clients", () => ({ upsertClientOnWorkComplete: vi.fn(async () => undefined) }));
vi.mock("@/services/orderChat", async (orig) => ({
  ...(await orig<typeof import("@/services/orderChat")>()),
  lockOrderChat: vi.fn(async () => undefined), syncOrderChatWorkStatus: vi.fn(async () => undefined),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn(), ConfirmDialog: null }) }));
vi.mock("@/components/dashboard/DayPicker", () => ({ default: () => null }));
vi.mock("@/components/work/SaleDeletedBanner", () => ({ default: () => null }));
vi.mock("@/components/ai-platform/CodeVerificationModal", () => ({
  default: ({ onVerified }: { onVerified: () => void }) => <button data-test="verify" onClick={onVerified}>verify</button>,
}));
vi.mock("@/components/ai-platform/AIPlatformApp", () => ({
  default: ({ onComplete }: { onComplete?: () => void }) => (
    <div data-test="generator"><button data-test="submit" onClick={onComplete}>Submit</button></div>
  ),
}));

const RecentAds = (await import("@/pages/tech-member/RecentAds")).default;
configure({ testIdAttribute: "data-test" });

beforeEach(() => {
  completionWrite = deferred();
  orderWrite = deferred();
  updateDoc.mockClear();
  markOrderCompleted.mockClear();
  toast.mockClear();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Open the ad, press Submit, and answer the credit step with "No Flow credits". */
function handIn() {
  render(<RecentAds />);
  const row = screen.getByText("Sharma Electronics").closest("div.bg-card") as HTMLElement;
  fireEvent.click(within(row).getByRole("button", { name: /open/i }));
  fireEvent.click(screen.getByTestId("verify"));
  fireEvent.click(screen.getByTestId("submit"));
  fireEvent.click(screen.getByTestId("credit-none"));
  fireEvent.click(screen.getByTestId("credit-save"));
}

const eyebrow = () => screen.getByTestId("drive-upload-eyebrow").textContent;

describe("the Drive step after Mark complete", () => {
  it("is on screen before anything is saved, and the studio is already closed", async () => {
    handIn();
    const sheet = await screen.findByTestId("drive-upload-sheet");
    // The completion write is still held open: nothing has been saved yet.
    expect(updateDoc.mock.calls.some((c) => c[1]?.status === "completed")).toBe(true);
    expect(markOrderCompleted).not.toHaveBeenCalled();
    expect(screen.queryByTestId("generator")).not.toBeInTheDocument();
    expect(eyebrow()).toBe("Submitting your video…");
    expect(screen.getByTestId("drive-upload-badge").getAttribute("data-state")).toBe("saving");
    // The folder, the file name and the Drive link do not wait for the save.
    expect(within(sheet).getByTestId("drive-upload-filename").textContent).toBe("P001 - Sharma Electronics");
    expect(within(sheet).getByTestId("drive-upload-open")).toBeInTheDocument();
    // But "It's uploaded" does: a job not yet saved as completed cannot be marked uploaded.
    expect((screen.getByTestId("drive-upload-confirm") as HTMLButtonElement).disabled).toBe(true);
  });

  it("says submitted the moment the job is saved, while the follow-ups are still running", async () => {
    handIn();
    await screen.findByTestId("drive-upload-sheet");
    await act(async () => { completionWrite.resolve(); });
    await waitFor(() => expect(eyebrow()).toBe("Video submitted"));
    // The order write is the follow-up still in flight.
    expect(markOrderCompleted).toHaveBeenCalledTimes(1);
    expect((screen.getByTestId("drive-upload-confirm") as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { orderWrite.resolve(); });
    expect(eyebrow()).toBe("Video submitted");
  });

  it("never shows a failed submit as submitted, and Try again submits it", async () => {
    handIn();
    await screen.findByTestId("drive-upload-sheet");
    await act(async () => { completionWrite.reject(new Error("offline")); });
    await waitFor(() => expect(eyebrow()).toBe("Not submitted yet"));
    expect(screen.getByTestId("drive-upload-submit-failed")).toBeInTheDocument();
    expect(toast.mock.calls.at(-1)?.[0]).toMatchObject({ title: "Couldn't submit", variant: "destructive" });
    expect((screen.getByTestId("drive-upload-confirm") as HTMLButtonElement).disabled).toBe(true);

    completionWrite = deferred();
    orderWrite.resolve();
    fireEvent.click(screen.getByTestId("drive-upload-retry"));
    await waitFor(() => expect(eyebrow()).toBe("Submitting your video…"));
    await act(async () => { completionWrite.resolve(); });
    await waitFor(() => expect(eyebrow()).toBe("Video submitted"));
    expect(screen.queryByTestId("drive-upload-submit-failed")).not.toBeInTheDocument();
  });

  it("does not tell the member their work was not submitted when only a follow-up failed", async () => {
    handIn();
    await screen.findByTestId("drive-upload-sheet");
    await act(async () => { completionWrite.resolve(); });
    await act(async () => { orderWrite.reject(new Error("order write failed")); });
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls.at(-1)?.[0]).toMatchObject({ title: "Submitted" });
    expect(toast.mock.calls.some((c) => c[0]?.title === "Couldn't submit")).toBe(false);
    expect(eyebrow()).toBe("Video submitted");
  });

  it("records the studio time once — in the completion — not again when the studio closes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-04T10:00:00"));
    render(<RecentAds />);
    const row = screen.getByText("Sharma Electronics").closest("div.bg-card") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /open/i }));
    fireEvent.click(screen.getByTestId("verify"));
    vi.setSystemTime(new Date("2026-10-04T10:20:00"));   // twenty minutes in the studio
    fireEvent.click(screen.getByTestId("submit"));
    fireEvent.click(screen.getByTestId("credit-none"));
    fireEvent.click(screen.getByTestId("credit-save"));
    await screen.findByTestId("drive-upload-sheet");
    await act(async () => { completionWrite.resolve(); orderWrite.resolve(); });
    const sessionWrites = updateDoc.mock.calls.filter((c) => "sessions" in (c[1] || {}));
    expect(sessionWrites).toHaveLength(1);
    expect(sessionWrites[0][1]).toMatchObject({ status: "completed", totalDurationSeconds: 1200 });
  });

  it("stays until the member chooses — a tap on the dimmed page does not close it", async () => {
    handIn();
    const sheet = await screen.findByTestId("drive-upload-sheet");
    fireEvent.click(sheet.parentElement as HTMLElement);
    expect(screen.getByTestId("drive-upload-sheet")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("drive-upload-later"));
    expect(screen.queryByTestId("drive-upload-sheet")).not.toBeInTheDocument();
  });
});

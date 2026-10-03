import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

/**
 * A social-media month is worked from Social Media, not My Work (2026-10-04).
 *
 * The owner asked for a member's social-media work to be in the Social Media section only. These
 * drive the real pages: My Work and Recent Ads no longer list a month's job card (nor count it), the
 * month's page offers it instead (SmmMyJobPanel), and its buttons open the very same studio and
 * client chat through My Work's `?open=` / `?chat=` links — returning the member to the month when
 * they close, and only ever to a month page.
 */

const TODAY = "2026-10-04";
const assignments = [
  { id: "a1", date: TODAY, status: "in_progress", businessName: "Sharma Electronics", displayTitle: "Sharma Electronics", uniqueId: "P001", category: "promotional", clipCount: 4, duration: "32s", accessCode: "1111", totalDurationSeconds: 0, assignedAtIso: "2026-10-04T09:00:00Z" },
  { id: "s1", date: TODAY, status: "assigned", businessName: "Sri Sai Silks", displayTitle: "Sri Sai Silks", uniqueId: "O011", category: "social_media_management", smmCampaignId: "c1", orderId: "c1", tracks: ["ad_creation", "social_upload"], clipCount: 4, duration: "32s", accessCode: "9999", totalDurationSeconds: 0, assignedAtIso: "2026-10-04T08:00:00Z" },
];

let AUTH: { user: Record<string, unknown> } = { user: { uid: "u1", name: "Jyothika", role: "tech_member", createdBy: "admin1" } };
const fetchMyMonthJobs = vi.fn(async (_c: unknown, _uid: string) => [] as unknown[]);

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), doc: (_db: unknown, _c: string, id: string) => ({ id }),
  updateDoc: vi.fn(async () => undefined), deleteField: vi.fn(), serverTimestamp: vi.fn(),
  onSnapshot: vi.fn(() => () => undefined),
  getDoc: vi.fn(async () => ({ exists: () => false })), getDocs: vi.fn(async () => ({ docs: [] })),
  setDoc: vi.fn(), addDoc: vi.fn(), deleteDoc: vi.fn(),
  orderBy: vi.fn(), increment: vi.fn(), arrayUnion: vi.fn(), arrayRemove: vi.fn(),
}));
vi.mock("@/hooks/useFirestore", () => ({ useFirestoreQuery: () => ({ data: assignments, loading: false }) }));
vi.mock("@/store/authStore", () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel(AUTH) }));
vi.mock("@/services/notifications", () => ({ sendNotification: vi.fn(), notifyTechTeamLeaders: vi.fn() }));
vi.mock("@/services/orders", () => ({ markOrderCompleted: vi.fn(), revertOrderToAssigned: vi.fn() }));
vi.mock("@/services/clients", () => ({ upsertClientOnWorkComplete: vi.fn() }));
vi.mock("@/services/smmAssign", () => ({ fetchMyMonthJobs }));
vi.mock("@/components/work/SaleDeletedBanner", () => ({ default: () => null }));
vi.mock("@/components/dashboard/DayPicker", () => ({ default: () => null }));
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn(), ConfirmDialog: null }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
// The code gate: Verify lets the member through, Cancel dismisses it.
vi.mock("@/components/ai-platform/CodeVerificationModal", () => ({
  default: ({ onVerified, onClose }: { onVerified: () => void; onClose: () => void }) => (
    <div data-test="code-gate">
      <button onClick={onVerified}>Verify</button>
      <button onClick={onClose}>Cancel</button>
    </div>
  ),
}));
// Stands in for the studio and the chat: which job they were opened on, and a way to close them.
vi.mock("@/components/ai-platform/AIPlatformApp", () => ({
  default: ({ assignment, onClose }: { assignment: { id: string }; onClose: () => void }) => (
    <div data-test="studio" data-job={assignment.id}><button onClick={onClose}>Close studio</button></div>
  ),
}));
vi.mock("@/components/order-chat/StaffOrderChat", () => ({
  default: ({ assignment, onClose }: { assignment: { id: string }; onClose: () => void }) => (
    <div data-test="chat" data-job={assignment.id}><button onClick={onClose}>Close chat</button></div>
  ),
}));

const MyWork = (await import("@/pages/tech-member/MyWork")).default;
const RecentAds = (await import("@/pages/tech-member/RecentAds")).default;
const SmmMyJobPanel = (await import("@/components/smm/SmmMyJobPanel")).default;
const { isSmmMonthJob, monthJobLink, safeMonthReturn, smmMonthIdOf } = await import("@/utils/smmPackage");

configure({ testIdAttribute: "data-test" });

function Where() {
  const loc = useLocation();
  return <span data-test="where">{loc.pathname + loc.search}</span>;
}

function at(url: string, page: JSX.Element) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/tech/my-work" element={page} />
        <Route path="/tech/recent-ads" element={page} />
        <Route path="/smm/:id" element={<><Where />{page}</>} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The month page with only the panel on it; wherever it sends the member is read back. */
function onMonthPage(panel: JSX.Element) {
  return render(
    <MemoryRouter initialEntries={["/smm/c1"]}>
      <Routes>
        <Route path="/smm/:id" element={panel} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  fetchMyMonthJobs.mockReset();
  fetchMyMonthJobs.mockResolvedValue([]);
  AUTH = { user: { uid: "u1", name: "Jyothika", role: "tech_member", createdBy: "admin1" } };
});
afterEach(cleanup);

describe("which jobs belong to a month", () => {
  it("is a social-media job linked to a month, by its own link or its order", () => {
    expect(isSmmMonthJob({ category: "social_media_management", smmCampaignId: "c1" })).toBe(true);
    expect(isSmmMonthJob({ category: "social_media_management", orderId: "o1" })).toBe(true);
    expect(isSmmMonthJob({ category: "social_media_management" })).toBe(false);
    expect(isSmmMonthJob({ category: "bulk_ads", orderId: "o1" })).toBe(false);
    expect(smmMonthIdOf({ smmCampaignId: "", orderId: "o1" })).toBe("o1");
  });

  it("opens the studio or the chat on My Work and comes back only to a month page", () => {
    expect(monthJobLink("s1", "c1", "open")).toBe("/tech/my-work?open=s1&back=%2Fsmm%2Fc1");
    expect(monthJobLink("s1", "c1", "chat")).toBe("/tech/my-work?chat=s1&back=%2Fsmm%2Fc1");
    expect(safeMonthReturn("/smm/o_abc123_1790000000000")).toBe("/smm/o_abc123_1790000000000");
    expect(safeMonthReturn("https://evil.example")).toBeNull();
    expect(safeMonthReturn("/tech-admin/orders")).toBeNull();
    expect(safeMonthReturn("/smm/c1/../../x")).toBeNull();
    expect(safeMonthReturn(null)).toBeNull();
  });
});

describe("My Work", () => {
  it("lists the ad but not the month's job, and does not count it", () => {
    at("/tech/my-work", <MyWork />);
    expect(screen.getByText("Sharma Electronics")).toBeInTheDocument();
    expect(screen.queryByText("Sri Sai Silks")).not.toBeInTheDocument();
    expect(screen.queryByTestId("my-work-month-plan")).not.toBeInTheDocument();
    // The month's job is "assigned"; the ad is "in progress". Only the ad is counted.
    expect(screen.getByTestId("my-work-tile-assigned").textContent).toContain("0");
    expect(screen.getByTestId("my-work-tile-in_progress").textContent).toContain("1");
  });

  it("opens the month's job in the studio from the month's link, behind its code, and goes back on close", () => {
    at(monthJobLink("s1", "c1", "open"), <MyWork />);
    expect(screen.getByTestId("code-gate")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Verify"));
    expect(screen.getByTestId("studio").getAttribute("data-job")).toBe("s1");
    fireEvent.click(screen.getByText("Close studio"));
    expect(screen.getByTestId("where").textContent).toBe("/smm/c1");
  });

  it("goes back to the month when the code box is cancelled", () => {
    at(monthJobLink("s1", "c1", "open"), <MyWork />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByTestId("where").textContent).toBe("/smm/c1");
  });

  it("opens the month's client chat and goes back to the month when it closes", () => {
    at(monthJobLink("s1", "c1", "chat"), <MyWork />);
    expect(screen.getByTestId("chat").getAttribute("data-job")).toBe("s1");
    fireEvent.click(screen.getByText("Close chat"));
    expect(screen.getByTestId("where").textContent).toBe("/smm/c1");
  });

  it("never follows a back link to anywhere but a month page", () => {
    at("/tech/my-work?chat=s1&back=https%3A%2F%2Fevil.example", <MyWork />);
    fireEvent.click(screen.getByText("Close chat"));
    expect(screen.queryByTestId("where")).not.toBeInTheDocument();
    expect(screen.getByText("Sharma Electronics")).toBeInTheDocument();
  });

  it("goes straight back to the month when the job is not this member's", () => {
    at("/tech/my-work?open=nope&back=%2Fsmm%2Fc1", <MyWork />);
    expect(screen.getByTestId("where").textContent).toBe("/smm/c1");
  });
});

describe("Recent Ads", () => {
  it("lists the ad but not the month's job", () => {
    at("/tech/recent-ads", <RecentAds />);
    expect(screen.getByText("Sharma Electronics")).toBeInTheDocument();
    expect(screen.queryByText("Sri Sai Silks")).not.toBeInTheDocument();
  });
});

describe("the month page's 'Your work on this month'", () => {
  const month = { id: "c1", orderId: "c1", clipsPerVideo: 4 };

  it("offers the member's own job: what they do, the code, and the studio", async () => {
    fetchMyMonthJobs.mockResolvedValue([assignments[1]]);
    onMonthPage(<SmmMyJobPanel campaign={month} user={AUTH.user as never} />);
    const panel = await screen.findByTestId("smm-my-job");
    expect(fetchMyMonthJobs).toHaveBeenCalledWith(month, "u1");
    expect(panel.textContent).toContain("Makes the content · Posts it");
    expect(panel.textContent).toContain("4 clips · 32 sec");
    expect(screen.getByTestId("smm-my-job-status").textContent).toBe("Not started");
    expect(screen.getByTestId("smm-my-job-code").textContent).toBe("9999");
    expect(screen.getByTestId("smm-my-job-open").textContent).toContain("Start in AI studio");

    fireEvent.click(screen.getByTestId("smm-my-job-open"));
    expect(screen.getByTestId("where").textContent).toBe(monthJobLink("s1", "c1", "open"));
  });

  it("opens the client chat the same way", async () => {
    fetchMyMonthJobs.mockResolvedValue([assignments[1]]);
    onMonthPage(<SmmMyJobPanel campaign={month} user={AUTH.user as never} />);
    fireEvent.click(await screen.findByTestId("smm-my-job-chat"));
    expect(screen.getByTestId("where").textContent).toBe(monthJobLink("s1", "c1", "chat"));
  });

  it("says a handed-in job is handed in, and offers its Drive upload", async () => {
    fetchMyMonthJobs.mockResolvedValue([{ ...assignments[1], status: "completed", completedDate: TODAY }]);
    onMonthPage(<SmmMyJobPanel campaign={month} user={AUTH.user as never} />);
    const panel = await screen.findByTestId("smm-my-job");
    expect(panel.getAttribute("data-status")).toBe("completed");
    expect(screen.queryByTestId("smm-my-job-open")).not.toBeInTheDocument();
    expect(screen.getByTestId("drive-upload-chip").getAttribute("data-state")).toBe("pending");
  });

  it("shows nothing to somebody with no job on the month, or who is not a tech member", async () => {
    onMonthPage(<SmmMyJobPanel campaign={month} user={AUTH.user as never} />);
    await Promise.resolve();
    expect(screen.queryByTestId("smm-my-job")).not.toBeInTheDocument();
    cleanup();

    fetchMyMonthJobs.mockClear();
    onMonthPage(<SmmMyJobPanel campaign={month} user={{ uid: "anil", role: "sales_member" }} />);
    expect(fetchMyMonthJobs).not.toHaveBeenCalled();
    expect(screen.queryByTestId("smm-my-job")).not.toBeInTheDocument();
  });
});

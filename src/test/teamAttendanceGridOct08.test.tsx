/**
 * Team Attendance after its grid moved into components/attendance/AttendanceGrid (2026-10-08, shared with
 * Social Media → Attendance). The page must work exactly as before: a cell opens the override editor, the
 * Full-Time / Part-Time switch sits under each name, and the days are worked out the same way.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification: vi.fn(async () => undefined) }));
const AUTH = { user: { uid: "admin", name: "Admin", role: "tech_admin" } };
vi.mock("@/store/authStore", () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel(AUTH) }));

const mem = await import("./memoryFirestore");
const TeamAttendance = (await import("@/pages/shared/TeamAttendance")).default;

configure({ testIdAttribute: "data-test" });

describe("Team Attendance on the shared grid", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 8, 11, 0));
    mem.__reset();
    mem.__seed("users/admin", { name: "Admin", role: "tech_admin", isActive: true });
    mem.__seed("users/arjun", { name: "Arjun", role: "tech_member", isActive: true, createdBy: "admin", employmentType: "full_time" });
    mem.__seed("daily_checkins/c1", { memberId: "arjun", date: "2026-10-07", status: "approved" });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("draws the member, their days and the employment switch — and a cell opens the editor", async () => {
    render(<TeamAttendance />);
    const table = await screen.findByTestId("attendance-table");
    await waitFor(() => expect(within(table).getByText("Arjun")).toBeTruthy());
    expect(within(table).getByTitle("Click to switch Full-Time / Part-Time").textContent).toContain("Full-Time");
    expect(within(screen.getByTestId("attendance-cards")).getByTitle("Tap to switch Full-Time / Part-Time")).toBeTruthy();
    const cells = [...table.querySelectorAll("tbody td button[title]")];
    const seventh = cells.find((b) => b.getAttribute("title")?.includes("07 Oct"))!;
    await waitFor(() => expect(seventh.textContent).toBe("P"));
    expect(cells.find((b) => b.getAttribute("title")?.includes("06 Oct"))?.textContent).toBe("A");
    fireEvent.click(seventh);
    expect(await screen.findByText("Auto (from check-in)")).toBeTruthy();
  });
});

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { configure, render, screen, cleanup } from "@testing-library/react";
import DailyDriveCard from "@/components/attendance/DailyDriveCard";
import { driveFolderPath } from "@/utils/driveUpload";
import type { AppUser } from "@/types";

configure({ testIdAttribute: "data-test" });

/**
 * The day's Drive upload, on the page a tech member lands on.
 *
 * The link used to live on the profile page and inside the check-out modal — both seen at the end of
 * the day, or never — while work that is not uploaded is not counted. What is pinned here is what a
 * member must be able to act on the moment they log in: today's real folder name, and a way in.
 */

const member = (over: Partial<AppUser> = {}): AppUser => ({
  uid: "u1",
  name: "Ravi Kumar",
  email: "ravi@example.com",
  role: "tech_member",
  googleDriveBaseUrl: "https://drive.google.com/drive/folders/abc123",
  ...over,
} as AppUser);

beforeEach(() => {
  // A fixed day, so "Day 18" in the assertions is not a calendar accident.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-18T09:30:00"));
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("the daily Drive card", () => {
  it("asks for today's work and names today's folder, not a generic example", () => {
    render(<DailyDriveCard user={member()} />);
    expect(screen.getByText("Upload today's work to your Drive")).toBeTruthy();
    // The same trail the check-out prompt and the stored record use.
    for (const part of driveFolderPath("Ravi Kumar", new Date("2026-09-18"))) {
      expect(screen.getAllByText(part).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/Today's folder · Friday, 18 September 2026/)).toBeTruthy();
    expect(screen.getByText(/Ad type/)).toBeTruthy();
  });

  it("opens the member's own Drive folder in a new tab", () => {
    render(<DailyDriveCard user={member()} />);
    const link = screen.getByTestId("open-drive-daily") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://drive.google.com/drive/folders/abc123");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("says who to ask when no Drive folder is set yet", () => {
    render(<DailyDriveCard user={member({ googleDriveBaseUrl: undefined })} />);
    expect(screen.queryByTestId("open-drive-daily")).toBeNull();
    expect(screen.getByText(/ask your admin to add it/)).toBeTruthy();
  });

  it("warns that unuploaded work is not counted, until it is uploaded", () => {
    render(<DailyDriveCard user={member()} />);
    expect(screen.getByText(/not counted for the day/)).toBeTruthy();
    cleanup();
    render(<DailyDriveCard user={member()} uploaded />);
    expect(screen.getByText("Today's work is uploaded")).toBeTruthy();
    expect(screen.queryByText(/not counted for the day/)).toBeNull();
    // Still one tap away — more work can land in the same day folder.
    expect(screen.getByTestId("open-drive-daily")).toBeTruthy();
  });
});

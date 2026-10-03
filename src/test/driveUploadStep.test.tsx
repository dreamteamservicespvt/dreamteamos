import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * The Drive step after "Mark complete" (2026-10-03): the moment a job is handed in, the member sees
 * this job's exact folder, a file name, their own Drive link, and says when it is uploaded. "Later"
 * leaves a reminder on the page and on check-out.
 */

const { markDriveUploaded, askAdminForDriveFolder } = vi.hoisted(() => ({
  markDriveUploaded: vi.fn(async (..._a: unknown[]) => undefined),
  askAdminForDriveFolder: vi.fn(async (..._a: unknown[]) => true),
}));
vi.mock("@/services/workDrive", () => ({ markDriveUploaded, askAdminForDriveFolder }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
let AUTH: { user: unknown } = { user: null };
vi.mock("@/store/authStore", () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel(AUTH) }));
// Check-out's own writes are not under test here — only its list of today's work.
vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({ doc: vi.fn(), updateDoc: vi.fn(), serverTimestamp: vi.fn() }));
vi.mock("@/services/notifications", () => ({ sendNotification: vi.fn() }));
vi.mock("@/components/smm/SmmDueCard", () => ({ default: () => null }));

import DriveUploadSheet, { DrivePendingStrip, DriveUploadChip } from "@/components/work/DriveUploadSheet";
import { useDriveUploadStep } from "@/components/work/useDriveUploadStep";
import CheckoutModal from "@/components/attendance/CheckoutModal";
import {
  DRIVE_UPLOAD_TRACKED_FROM, driveAdTypeFolder, driveFileName, jobDrivePath, needsDriveUpload, todaysDriveUploads,
} from "@/utils/driveUpload";
import type { AppUser, WorkAssignment } from "@/types";

configure({ testIdAttribute: "data-test" });

function job(over: Partial<WorkAssignment> = {}): WorkAssignment {
  return {
    id: "w1", assignedTo: "u1", assignedBy: "a1", assignedAt: null, category: "promotional", clipCount: 4,
    includesEndCredits: false, duration: "32s", pricePerUnit: 0, totalPrice: 0, uniqueId: "W123", accessCode: "1111",
    businessName: "Sri Sai Silks", displayTitle: "Sri Sai Silks", status: "completed", sessions: [],
    totalDurationSeconds: 0, date: "2026-10-03", completedDate: "2026-10-03",
    ...over,
  } as WorkAssignment;
}

const member = (over: Partial<AppUser> = {}) =>
  ({ uid: "u1", name: "Srinu", createdBy: "admin1", googleDriveBaseUrl: "https://drive.google.com/drive/folders/abc", ...over }) as AppUser;

describe("where this job's file goes", () => {
  it("names the ad-type folder from the job — clips for a video, Posters for a poster", () => {
    expect(driveAdTypeFolder(job())).toBe("4 Clips");
    expect(driveAdTypeFolder(job({ clipCount: 1 }))).toBe("1 Clip");
    expect(driveAdTypeFolder(job({ clipCount: 0, duration: "48s" }))).toBe("6 Clips");
    expect(driveAdTypeFolder(job({ category: "poster", clipCount: 0 }))).toBe("Posters");
  });

  it("gives the whole trail for the day it was finished", () => {
    expect(jobDrivePath("Srinu", job(), new Date(2026, 9, 3))).toEqual(["Srinu", "October", "Day 3", "4 Clips"]);
  });

  it("names the file after the job, without characters a file name cannot carry", () => {
    expect(driveFileName(job())).toBe("W123 - Sri Sai Silks");
    expect(driveFileName(job({ businessName: "A/B: Silks*" }))).toBe("W123 - A B Silks");
    expect(driveFileName(job({ uniqueId: "", businessName: "", displayTitle: "" }))).toBe("Video");
  });

  it("asks for an upload only for work finished since uploads were tracked one job at a time", () => {
    expect(needsDriveUpload(job())).toBe(true);
    expect(needsDriveUpload(job({ status: "verified" }))).toBe(true);
    expect(needsDriveUpload(job({ driveUploadedAt: { seconds: 1 } }))).toBe(false);
    expect(needsDriveUpload(job({ status: "in_progress" }))).toBe(false);
    expect(needsDriveUpload(job({ completedDate: "2026-09-30" }))).toBe(false);
    expect(needsDriveUpload(job({ completedDate: undefined }))).toBe(false);
    expect(DRIVE_UPLOAD_TRACKED_FROM).toBe("2026-10-03");
  });

  it("splits today's finished work by whether it is in the Drive", () => {
    const list = [job({ id: "a" }), job({ id: "b", driveUploadedAt: { seconds: 1 } }), job({ id: "c", completedDate: "2026-10-02" }), job({ id: "d", status: "editing" })];
    const t = todaysDriveUploads(list, "2026-10-03");
    expect(t.pending.map((j) => j.id)).toEqual(["a"]);
    expect(t.uploaded.map((j) => j.id)).toEqual(["b"]);
  });
});

describe("the upload sheet", () => {
  beforeEach(() => {
    markDriveUploaded.mockClear();
    askAdminForDriveFolder.mockClear();
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } });
  });
  afterEach(cleanup);

  it("walks the member through it, and the next action is always the loudest", async () => {
    const onClose = vi.fn();
    render(<DriveUploadSheet assignment={job()} user={member()} justCompleted onClose={onClose} />);
    expect(screen.getByText("Video submitted")).toBeInTheDocument();
    expect(screen.getByText("Now upload it to your Drive")).toBeInTheDocument();
    expect(screen.getAllByTestId("drive-upload-folder").map((b) => b.textContent)).toEqual(["Srinu", "October", "Day 3", "4 Clips"]);
    expect(screen.getByTestId("drive-upload-filename").textContent).toBe("W123 - Sri Sai Silks");

    const open = screen.getByTestId("drive-upload-open");
    expect(open.getAttribute("href")).toBe("https://drive.google.com/drive/folders/abc");
    expect(open.getAttribute("target")).toBe("_blank");
    expect(screen.getByTestId("drive-upload-confirm").getAttribute("data-emphasis")).toBe("secondary");

    fireEvent.click(open);
    expect(screen.getByTestId("drive-upload-confirm").getAttribute("data-emphasis")).toBe("primary");
    expect(screen.getAllByTestId("drive-upload-step")[0].getAttribute("data-done")).toBe("1");
    expect(screen.getByTestId("drive-upload-open-again")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("drive-upload-confirm"));
    await screen.findByTestId("drive-upload-saved");
    expect(markDriveUploaded).toHaveBeenCalledWith(expect.objectContaining({ id: "w1" }), ["Srinu", "October", "Day 3", "4 Clips"], "W123 - Sri Sai Silks");
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 2000 });
  });

  it("copies a folder name or the file name with one tap", async () => {
    render(<DriveUploadSheet assignment={job()} user={member()} justCompleted onClose={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getAllByTestId("drive-upload-folder")[2]); });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Day 3");
    expect(screen.getAllByTestId("drive-upload-folder")[2].textContent).toContain("Copied");
    await act(async () => { fireEvent.click(screen.getByTestId("drive-upload-copy-name")); });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("W123 - Sri Sai Silks");
  });

  it("Upload later closes without recording anything; Escape does the same", () => {
    const onClose = vi.fn();
    render(<DriveUploadSheet assignment={job()} user={member()} justCompleted onClose={onClose} />);
    fireEvent.click(screen.getByTestId("drive-upload-later"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(markDriveUploaded).not.toHaveBeenCalled();
  });

  it("with no Drive folder set, asks the admin in one tap", async () => {
    render(<DriveUploadSheet assignment={job()} user={member({ googleDriveBaseUrl: "" })} justCompleted onClose={vi.fn()} />);
    expect(screen.getByTestId("drive-upload-no-link")).toBeInTheDocument();
    expect(screen.queryByTestId("drive-upload-open")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("drive-upload-ask-admin"));
    await screen.findByTestId("drive-upload-asked");
    expect(askAdminForDriveFolder).toHaveBeenCalledWith(expect.objectContaining({ uid: "u1", createdBy: "admin1" }));
  });

  it("a poster is a poster, filed under Posters", () => {
    render(<DriveUploadSheet assignment={job({ category: "poster", clipCount: 0 })} user={member()} justCompleted onClose={vi.fn()} />);
    expect(screen.getByText("Poster submitted")).toBeInTheDocument();
    expect(screen.getAllByTestId("drive-upload-folder").at(-1)!.textContent).toBe("Posters");
  });

  it("reopened from a job card: points at the day it was finished, or shows where it went", () => {
    render(<DriveUploadSheet assignment={job({ completedDate: "2026-10-01" })} user={member()} justCompleted={false} onClose={vi.fn()} />);
    expect(screen.getByText("Not in your Drive yet")).toBeInTheDocument();
    expect(screen.getAllByTestId("drive-upload-folder")[2].textContent).toBe("Day 1");
    cleanup();

    const uploaded = job({ driveUploadedAt: { toDate: () => new Date(2026, 9, 3, 10, 42) }, driveUploadPath: ["Srinu", "October", "Day 3", "4 Clips"], driveFileName: "W123 - Sri Sai Silks" });
    render(<DriveUploadSheet assignment={uploaded} user={member()} justCompleted={false} onClose={vi.fn()} />);
    expect(screen.getByText("This video is in your Drive")).toBeInTheDocument();
    expect(screen.getByText(/Marked uploaded 3 Oct, 10:42 AM/)).toBeInTheDocument();
    expect(screen.queryByTestId("drive-upload-confirm")).not.toBeInTheDocument();
  });
});

describe("the reminders", () => {
  afterEach(cleanup);

  it("the strip lists only finished work still to go up", () => {
    const onOpen = vi.fn();
    render(<DrivePendingStrip jobs={[job(), job({ id: "w2", uniqueId: "W124", driveUploadedAt: { seconds: 1 } }), job({ id: "w3", status: "in_progress" })]} onOpen={onOpen} />);
    expect(screen.getByText("1 finished job is not in your Drive yet")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("drive-pending-upload"));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "w1" }));
  });

  it("the strip is not drawn when nothing is waiting", () => {
    const { container } = render(<DrivePendingStrip jobs={[job({ driveUploadedAt: { seconds: 1 } })]} onOpen={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("the card button says Upload to Drive, then In Drive", () => {
    render(<DriveUploadChip assignment={job()} onOpen={vi.fn()} />);
    expect(screen.getByTestId("drive-upload-chip").getAttribute("data-state")).toBe("pending");
    cleanup();
    render(<DriveUploadChip assignment={job({ driveUploadedAt: { seconds: 1 } })} onOpen={vi.fn()} />);
    expect(screen.getByTestId("drive-upload-chip").getAttribute("data-state")).toBe("done");
    cleanup();
    const { container } = render(<DriveUploadChip assignment={job({ completedDate: "2026-09-01" })} onOpen={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("check-out", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 3, 18));
    markDriveUploaded.mockClear();
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("lists today's finished work with what is still to go up, and marks one in a tap", async () => {
    const jobs = [
      job({ id: "a", uniqueId: "W123" }),
      job({ id: "b", uniqueId: "W124", businessName: "Lakshmi Jewellers", driveUploadedAt: { seconds: 1 } }),
      job({ id: "c", uniqueId: "W100", completedDate: "2026-10-02" }),
    ];
    const checkin = { id: "ck1", checkedInAt: { toDate: () => new Date(2026, 9, 3, 9) } } as never;
    render(<CheckoutModal user={member()} todayCheckin={checkin} assignments={jobs} onClose={vi.fn()} />);
    expect(screen.getByTestId("checkout-drive-count").textContent).toBe("1 of 2 in your Drive");
    const rows = screen.getAllByTestId("checkout-drive-job");
    expect(rows.map((r) => r.getAttribute("data-done"))).toEqual(["0", "1"]);
    await act(async () => { fireEvent.click(screen.getByTestId("checkout-drive-mark")); });
    expect(markDriveUploaded).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), ["Srinu", "October", "Day 3", "4 Clips"], "W123 - Sri Sai Silks");
  });
});

describe("useDriveUploadStep", () => {
  afterEach(cleanup);

  function Harness({ a, justCompleted }: { a: WorkAssignment; justCompleted: boolean }) {
    const step = useDriveUploadStep();
    return <><button data-test="go" onClick={() => step.offer(a, justCompleted)}>go</button>{step.sheet}</>;
  }

  it("a job handed in again after edits is asked for again, whatever it was marked before", () => {
    AUTH = { user: member() };
    const before = job({ status: "in_progress", completedDate: "2026-09-29", driveUploadedAt: { seconds: 1 }, driveUploadPath: ["old"] });
    render(<Harness a={before} justCompleted />);
    fireEvent.click(screen.getByTestId("go"));
    const sheet = screen.getByTestId("drive-upload-sheet");
    expect(within(sheet).getByText("Now upload it to your Drive")).toBeInTheDocument();
    expect(within(sheet).getByTestId("drive-upload-confirm")).toBeInTheDocument();
  });
});

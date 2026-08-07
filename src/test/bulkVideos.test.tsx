import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Bulk video orders, as individual videos rather than a counter.
 *
 * `orderProgress` answers "how many of the ten are done", which is enough for a social-media month
 * where the eight ads are interchangeable. A bulk order is not like that: ten videos get shared
 * across the team, and the questions actually asked are "who has video 6", "which are still free"
 * and "has Kiran finished hers". A counter answers none of them, so the list lived on paper and a
 * video with nobody on it was found at the deadline.
 */

const { updateDoc, sendNotification, navigate } = vi.hoisted(() => ({
  updateDoc: vi.fn().mockResolvedValue(undefined),
  sendNotification: vi.fn().mockResolvedValue(undefined),
  navigate: vi.fn(),
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, col: string, id: string) => ({ col, id }),
  updateDoc,
  serverTimestamp: () => ({ __server: true }),
  Timestamp: { now: () => ({ seconds: 1_800_000_000, nanoseconds: 0 }) },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import {
  bulkStatsOf, bulkSummary, bulkVideoCount, bulkVideoStats, bulkVideosOf, canAssignBulkVideos,
  canCompleteBulkVideo, clientProgress, isBulkVideoOrder, memberProgress, memberProgressAcross,
  slotsForMember, totalBulkStats,
} from "@/utils/bulkVideos";
import { assignBulkVideos, setBulkVideoComplete, unassignBulkVideo } from "@/services/bulkVideos";
import BulkVideoBoard from "@/components/work/BulkVideoBoard";
import type { BulkVideoSlot, Order } from "@/types";

configure({ testIdAttribute: "data-test" });

const order = (patch: Partial<Order> = {}): Order => ({
  id: "o1",
  category: "bulk_ads",
  bulkAdType: "promotional",
  businessName: "Sharma Electronics",
  clientPhone: "+919876543210",
  quantity: 10,
  status: "assigned",
  progress: {
    kind: "bulk",
    targets: { ads: 10, posters: 10, posted: 0, campaigns: 0 },
    done: { ads: 0, posters: 0, posted: 0, campaigns: 0 },
    tracks: {},
    completedTracks: [],
    log: [],
  },
  ...patch,
} as unknown as Order);

const slot = (n: number, patch: Partial<BulkVideoSlot> = {}): BulkVideoSlot =>
  ({ n, status: "pending", ...patch } as BulkVideoSlot);

const ADMIN = { uid: "a1", name: "Ravi", role: "tech_admin" } as const;
const MEMBER = { uid: "m1", name: "Kiran", role: "tech_member" } as const;
const TEAM = [{ uid: "m1", name: "Kiran" }, { uid: "m2", name: "Asha" }];

beforeEach(() => { updateDoc.mockClear(); sendNotification.mockClear(); navigate.mockClear(); });
afterEach(cleanup);

describe("reading a bulk order as videos", () => {
  it("recognises a bulk order and leaves other work alone", () => {
    expect(isBulkVideoOrder(order())).toBe(true);
    expect(isBulkVideoOrder(order({ category: "promotional" }))).toBe(false);
    expect(isBulkVideoOrder(null)).toBe(false);
  });

  it("builds one slot per video from the quantity sold", () => {
    const slots = bulkVideosOf(order());
    expect(slots).toHaveLength(10);
    expect(slots.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(slots.every((s) => s.status === "pending")).toBe(true);
  });

  it("carries progress across from the old counting model, with no migration", () => {
    // The compatibility claim: an order half-finished before this existed must not read as untouched.
    const half = order({ progress: { ...order().progress!, done: { ads: 4, posters: 0, posted: 0, campaigns: 0 } } });
    const stats = bulkStatsOf(half);
    expect(stats.completed).toBe(4);
    expect(stats.pending).toBe(6);
  });

  it("falls back to the progress target when the quantity is missing", () => {
    expect(bulkVideoCount(order({ quantity: undefined }))).toBe(10);
    expect(bulkVideoCount(order({ quantity: undefined, progress: null }))).toBe(1);
  });

  it("keeps the list the right length when the quantity is corrected later", () => {
    const stored = [slot(1, { status: "completed" }), slot(2, { assignedTo: "m1", status: "assigned" })];
    // Quantity raised from 2 to 4 — the two extra videos must appear, not stay invisible.
    const grown = bulkVideosOf(order({ quantity: 4, bulkVideos: stored }));
    expect(grown).toHaveLength(4);
    expect(grown[0].status).toBe("completed");
    expect(grown[3].status).toBe("pending");
    // …and lowered to 1 leaves no phantom slots nobody owes.
    expect(bulkVideosOf(order({ quantity: 1, bulkVideos: stored }))).toHaveLength(1);
  });
});

describe("the numbers every screen shows", () => {
  const slots = [
    slot(1, { status: "completed", assignedTo: "m1", assignedToName: "Kiran" }),
    slot(2, { status: "completed", assignedTo: "m2", assignedToName: "Asha" }),
    slot(3, { status: "assigned", assignedTo: "m1", assignedToName: "Kiran" }),
    slot(4),
    slot(5),
  ];

  it("splits the order into done, in hand, and nobody's", () => {
    expect(bulkVideoStats(slots)).toEqual({
      total: 5, completed: 2, assigned: 1, unassigned: 2, pending: 3, percent: 40,
    });
  });

  it("counts a completed video as done even though somebody owns it", () => {
    // The trap: an owner AND finished must not be counted in both buckets, or the totals exceed
    // the number of videos and every percentage on the page is wrong.
    const s = bulkVideoStats(slots);
    expect(s.completed + s.assigned + s.unassigned).toBe(s.total);
  });

  it("says it in words for a card", () => {
    expect(bulkSummary(bulkVideoStats(slots))).toBe("2 of 5 done · 1 with the team · 2 unassigned");
  });

  it("is safe on an empty order", () => {
    expect(bulkVideoStats([])).toMatchObject({ total: 0, percent: 0 });
  });
});

describe("who is making what", () => {
  const slots = [
    slot(1, { status: "completed", assignedTo: "m1", assignedToName: "Kiran" }),
    slot(2, { status: "assigned", assignedTo: "m1", assignedToName: "Kiran" }),
    slot(3, { status: "completed", assignedTo: "m2", assignedToName: "Asha" }),
    slot(4),
  ];

  it("reports each member's own progress", () => {
    const rows = memberProgress(slots);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.uid === "m1")).toMatchObject({ assigned: 2, completed: 1, pending: 1, percent: 50 });
    expect(rows.find((r) => r.uid === "m2")).toMatchObject({ assigned: 1, completed: 1, pending: 0, percent: 100 });
  });

  it("puts whoever has most left first — the answer to 'who is free'", () => {
    expect(memberProgress(slots)[0].uid).toBe("m1");
  });

  it("adds up across every bulk order at once", () => {
    const rows = memberProgressAcross([order({ bulkVideos: slots, quantity: 4 }), order({ id: "o2", bulkVideos: slots, quantity: 4 })]);
    expect(rows.find((r) => r.uid === "m1")).toMatchObject({ assigned: 4, completed: 2 });
  });

  it("gives a member only their own videos", () => {
    expect(slotsForMember(slots, "m1").map((s) => s.n)).toEqual([1, 2]);
    expect(slotsForMember(slots, undefined)).toEqual([]);
  });
});

describe("client-wise tracking", () => {
  it("puts the client furthest from delivery at the top, finished ones last", () => {
    const nearlyDone = order({ id: "a", businessName: "A", quantity: 2, bulkVideos: [slot(1, { status: "completed" }), slot(2)] });
    const untouched = order({ id: "b", businessName: "B", quantity: 5, bulkVideos: [slot(1), slot(2), slot(3), slot(4), slot(5)] });
    const finished = order({ id: "c", businessName: "C", quantity: 1, bulkVideos: [slot(1, { status: "completed" })] });

    const rows = clientProgress([nearlyDone, finished, untouched]);
    expect(rows.map((r) => r.clientName)).toEqual(["B", "A", "C"]);
  });

  it("totals every order on screen", () => {
    const a = order({ id: "a", quantity: 2, bulkVideos: [slot(1, { status: "completed" }), slot(2)] });
    const b = order({ id: "b", quantity: 3, bulkVideos: [slot(1), slot(2), slot(3)] });
    expect(totalBulkStats([a, b])).toMatchObject({ total: 5, completed: 1, pending: 4 });
  });
});

describe("who may do what", () => {
  it("lets the admins and the leader hand videos out", () => {
    expect(canAssignBulkVideos("tech_admin")).toBe(true);
    expect(canAssignBulkVideos("tech_team_leader")).toBe(true);
    expect(canAssignBulkVideos("main_admin")).toBe(true);
  });

  it("does not let a member assign — including to themselves", () => {
    // Self-service is how the easy videos go first and the awkward ones are left for whoever looks last.
    expect(canAssignBulkVideos("tech_member")).toBe(false);
  });

  it("lets a member tick off their own video, and nobody else's", () => {
    expect(canCompleteBulkVideo(slot(1, { assignedTo: "m1" }), MEMBER)).toBe(true);
    expect(canCompleteBulkVideo(slot(1, { assignedTo: "m2" }), MEMBER)).toBe(false);
    expect(canCompleteBulkVideo(slot(1), MEMBER)).toBe(false);
  });

  it("lets a leader tick off anyone's, so one absent member cannot hold up the order", () => {
    expect(canCompleteBulkVideo(slot(1, { assignedTo: "m2" }), ADMIN)).toBe(true);
  });
});

describe("assigning and completing", () => {
  const written = () => updateDoc.mock.calls[0][1] as { bulkVideos: BulkVideoSlot[]; progress?: { done: { ads: number } } };

  it("gives several videos to one member in a single write", async () => {
    const n = await assignBulkVideos({ order: order(), numbers: [1, 2, 3], member: { uid: "m1", name: "Kiran" }, actor: ADMIN });
    expect(n).toBe(3);
    const slots = written().bulkVideos;
    expect(slots.filter((s) => s.assignedTo === "m1").map((s) => s.n)).toEqual([1, 2, 3]);
    expect(slots[0].status).toBe("assigned");
  });

  it("tells the member, once, what they were given", async () => {
    await assignBulkVideos({ order: order(), numbers: [1, 2], member: { uid: "m1", name: "Kiran" }, actor: ADMIN });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification.mock.calls[0][0]).toMatchObject({ userId: "m1", title: "2 videos assigned to you" });
  });

  it("skips videos that are already finished rather than refusing the whole batch", async () => {
    // "Select all remaining, assign" must do the sensible thing, not fail because one just landed.
    const o = order({ bulkVideos: [slot(1, { status: "completed" }), slot(2), slot(3)], quantity: 3 });
    const n = await assignBulkVideos({ order: o, numbers: [1, 2, 3], member: { uid: "m1", name: "Kiran" }, actor: ADMIN });
    expect(n).toBe(2);
    expect(written().bulkVideos[0].status).toBe("completed");
    expect(written().bulkVideos[0].assignedTo).toBeUndefined();
  });

  it("writes nothing when there is nothing to change", async () => {
    const o = order({ bulkVideos: [slot(1, { status: "assigned", assignedTo: "m1", assignedToName: "Kiran" })], quantity: 1 });
    expect(await assignBulkVideos({ order: o, numbers: [1], member: { uid: "m1", name: "Kiran" }, actor: ADMIN })).toBe(0);
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it("keeps the old counter in step, so everything reading it stays right", async () => {
    // The queue's sort, the pinning rule and the pending-payment readiness check all read done.ads.
    const o = order({ bulkVideos: [slot(1, { assignedTo: "m1", status: "assigned" }), slot(2)], quantity: 2 });
    await setBulkVideoComplete({ order: o, n: 1, complete: true, actor: MEMBER });
    expect(written().progress?.done.ads).toBe(1);
  });

  it("stamps who finished it", async () => {
    const o = order({ bulkVideos: [slot(1, { assignedTo: "m1", status: "assigned" })], quantity: 1 });
    await setBulkVideoComplete({ order: o, n: 1, complete: true, actor: MEMBER });
    expect(written().bulkVideos[0]).toMatchObject({ status: "completed", completedByName: "Kiran" });
  });

  it("can be undone, back to its owner rather than back to the pool", async () => {
    const o = order({ bulkVideos: [slot(1, { status: "completed", assignedTo: "m1", assignedToName: "Kiran" })], quantity: 1 });
    await setBulkVideoComplete({ order: o, n: 1, complete: false, actor: MEMBER });
    expect(written().bulkVideos[0]).toMatchObject({ status: "assigned", assignedTo: "m1" });
  });

  it("does nothing when the video is already in the state asked for", async () => {
    const o = order({ bulkVideos: [slot(1, { status: "completed" })], quantity: 1 });
    await setBulkVideoComplete({ order: o, n: 1, complete: true, actor: ADMIN });
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it("says so when the last video lands", async () => {
    const o = order({
      techAdminId: "a1",
      quantity: 2,
      bulkVideos: [slot(1, { status: "completed" }), slot(2, { assignedTo: "m1", status: "assigned" })],
    });
    await setBulkVideoComplete({ order: o, n: 2, complete: true, actor: MEMBER });
    expect(sendNotification.mock.calls[0][0]).toMatchObject({ title: "Bulk order fully delivered" });
  });

  it("frees a video back to the pool when it is taken off someone", async () => {
    const o = order({ bulkVideos: [slot(1, { status: "assigned", assignedTo: "m1", assignedToName: "Kiran" })], quantity: 1 });
    await unassignBulkVideo({ order: o, n: 1, actor: ADMIN });
    expect(written().bulkVideos[0]).toEqual({ n: 1, status: "pending" });
  });
});

describe("the board, as a leader uses it", () => {
  const boardOrder = order({
    quantity: 4,
    bulkVideos: [
      slot(1, { status: "completed", assignedTo: "m1", assignedToName: "Kiran" }),
      slot(2, { status: "assigned", assignedTo: "m1", assignedToName: "Kiran" }),
      slot(3),
      slot(4),
    ],
  });

  it("shows one tile per video, colour-coded by state", () => {
    render(<BulkVideoBoard order={boardOrder} user={ADMIN} members={TEAM} />);
    expect(screen.getByTestId("bulk-video-1")).toHaveAttribute("data-status", "completed");
    expect(screen.getByTestId("bulk-video-2")).toHaveAttribute("data-status", "assigned");
    expect(screen.getByTestId("bulk-video-3")).toHaveAttribute("data-status", "unassigned");
  });

  it("leads with the count in plain words", () => {
    render(<BulkVideoBoard order={boardOrder} user={ADMIN} members={TEAM} />);
    expect(screen.getByTestId("bulk-board-summary"))
      .toHaveTextContent("1 done · 1 being made · 2 not given out");
  });

  it("selects every free video in one press", () => {
    render(<BulkVideoBoard order={boardOrder} user={ADMIN} members={TEAM} />);
    fireEvent.click(screen.getByTestId("bulk-select-free"));
    expect(screen.getByTestId("bulk-picked-count")).toHaveTextContent("2 videos selected");
  });

  it("hands the selected videos over through the Work Assign form", () => {
    // Not a dropdown here: a video needs a length, a language, a model and the client's brief
    // before anyone can build it, so it goes through the same form every other order goes through
    // — with the video numbers riding along to be stamped on the order afterwards.
    render(<BulkVideoBoard order={boardOrder} user={ADMIN} members={TEAM} />);
    fireEvent.click(screen.getByTestId("bulk-select-free"));
    fireEvent.click(screen.getByTestId("bulk-assign-go"));

    expect(navigate).toHaveBeenCalledWith("/tech-admin/work-assign?order=o1&videos=3,4");
  });

  it("sends a team leader to their own Work Assign, not the admin's", () => {
    render(<BulkVideoBoard order={boardOrder} user={{ ...ADMIN, role: "tech_team_leader" }} members={TEAM} />);
    fireEvent.click(screen.getByTestId("bulk-select-free"));
    fireEvent.click(screen.getByTestId("bulk-assign-go"));

    expect(navigate).toHaveBeenCalledWith("/team-leader/work-assign?order=o1&videos=3,4");
  });

  it("passes the video numbers in order, however they were tapped", () => {
    render(<BulkVideoBoard order={boardOrder} user={ADMIN} members={TEAM} />);
    fireEvent.click(screen.getByTestId("bulk-video-4"));
    fireEvent.click(screen.getByTestId("bulk-video-3"));
    fireEvent.click(screen.getByTestId("bulk-assign-go"));

    expect(navigate).toHaveBeenCalledWith("/tech-admin/work-assign?order=o1&videos=3,4");
  });

  it("never lets a finished video be selected for reassignment", () => {
    render(<BulkVideoBoard order={boardOrder} user={ADMIN} members={TEAM} />);
    fireEvent.click(screen.getByTestId("bulk-video-1"));
    expect(screen.queryByTestId("bulk-picked-count")).not.toBeInTheDocument();
  });

  it("shows who is carrying what", () => {
    render(<BulkVideoBoard order={boardOrder} user={ADMIN} members={TEAM} />);
    expect(within(screen.getByTestId("bulk-member-m1")).getByText("Kiran")).toBeInTheDocument();
    expect(screen.getByTestId("bulk-member-m1")).toHaveTextContent("1/2");
  });
});

describe("the board, as the member making the videos uses it", () => {
  const boardOrder = order({
    quantity: 4,
    bulkVideos: [
      slot(1, { status: "assigned", assignedTo: "m1", assignedToName: "Kiran" }),
      slot(2, { status: "assigned", assignedTo: "m2", assignedToName: "Asha" }),
      slot(3),
      slot(4),
    ],
  });

  it("shows them only their own videos", () => {
    render(<BulkVideoBoard order={boardOrder} user={MEMBER} />);
    expect(screen.getByTestId("bulk-video-1")).toBeInTheDocument();
    expect(screen.queryByTestId("bulk-video-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bulk-video-3")).not.toBeInTheDocument();
  });

  it("gives them a green tick to finish one", async () => {
    render(<BulkVideoBoard order={boardOrder} user={MEMBER} />);
    fireEvent.click(screen.getByTestId("bulk-video-toggle-1"));

    await waitFor(() => expect(updateDoc).toHaveBeenCalled());
    const slots = (updateDoc.mock.calls[0][1] as { bulkVideos: BulkVideoSlot[] }).bulkVideos;
    expect(slots.find((s) => s.n === 1)).toMatchObject({ status: "completed", completedByName: "Kiran" });
  });

  it("offers them no way to assign anything", () => {
    render(<BulkVideoBoard order={boardOrder} user={MEMBER} />);
    expect(screen.queryByTestId("bulk-assign-go")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bulk-select-free")).not.toBeInTheDocument();
  });

  it("renders nothing at all when none of the videos are theirs", () => {
    const notMine = order({ quantity: 1, bulkVideos: [slot(1, { assignedTo: "m9", status: "assigned" })] });
    const { container } = render(<BulkVideoBoard order={notMine} user={MEMBER} />);
    expect(container).toBeEmptyDOMElement();
  });
});

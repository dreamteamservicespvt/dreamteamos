import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";

/**
 * The tech department's activity log.
 *
 * Sales has had one since early on; tech had none. That gap was not academic — an order can leave
 * the delivery queue on one click while the SALE behind it stays verified and counted, and when two
 * of Gova's three Fmcg orders went that way on 2 Aug 2026 there was nothing anywhere that could
 * name who did it. These pin that tech actions are recorded, attributed, and filed against the
 * department rather than the individual.
 */

const logged: any[] = [];
vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  addDoc: async (_c: unknown, data: any) => { logged.push(data); return { id: `log${logged.length}` }; },
  collection: (_db: unknown, name: string) => ({ name }),
  serverTimestamp: () => ({ __server: true }),
  query: (...a: unknown[]) => ({ a }),
  where: (field: string, _op: string, value: unknown) => ({ field, value }),
  onSnapshot: (_q: unknown, cb: (s: unknown) => void) => {
    cb({ docs: feedRows.map((r, i) => ({ id: `r${i}`, data: () => r })) });
    return () => {};
  },
}));

/**
 * Read at subscribe time by the onSnapshot mock above, so a test sets it and then renders.
 * Deliberately NOT paired with vi.resetModules(): resetting the registry gives the page a second
 * copy of React, which testing-library's `cleanup` cannot see — its nodes then leak into the next
 * test, and the suite only fails when the whole file runs.
 */
let feedRows: any[] = [];

const { logTechActivity, TECH_ACTIVITY_ACTIONS } = await import("@/services/activityLog");
const { useAuthStore } = await import("@/store/authStore");
const TechActivityHistory = (await import("@/pages/tech-admin/ActivityHistory")).default;

beforeEach(() => {
  logged.length = 0;
  useAuthStore.setState({ user: { uid: "ta1", name: "Srinu", role: "tech_admin", createdBy: "ma1" } as any });
});
afterEach(cleanup);
configure({ testIdAttribute: "data-test" });

describe("logTechActivity — who did it, and whose feed it lands in", () => {
  it("files a tech admin's action under their own uid", async () => {
    await logTechActivity({
      actor: { uid: "ta1", name: "Srinu", role: "tech_admin", createdBy: "ma1" },
      action: "deleted_orders",
      details: { count: 2 },
    });
    expect(logged[0]).toMatchObject({ actorId: "ta1", actorRole: "tech_admin", adminId: "ta1" });
  });

  it("files a team leader's action under their tech admin — one feed for the department", async () => {
    await logTechActivity({
      actor: { uid: "tl1", name: "Saiveni", role: "tech_team_leader", createdBy: "ta1" },
      action: "assigned_work",
      details: { memberName: "Jyothika" },
    });
    // Without this the leader's removals would be invisible to the admin answerable for them.
    expect(logged[0]).toMatchObject({ actorId: "tl1", actorRole: "tech_team_leader", adminId: "ta1" });
  });

  it("still records an action whose actor has no admin above them", async () => {
    await logTechActivity({ actor: { uid: "ta1", name: "Srinu" }, action: "verified_work", details: {} });
    // A missing link must cost the grouping, never the record itself.
    expect(logged[0]).toMatchObject({ actorId: "ta1", adminId: "ta1" });
  });

  it("writes nothing when there is no actor at all", async () => {
    await logTechActivity({ actor: null, action: "verified_work", details: {} });
    expect(logged).toHaveLength(0);
  });
});

describe("Tech Activity History page", () => {
  const row = (over: Record<string, unknown>) => ({
    actorId: "ta1", actorName: "Srinu", actorRole: "tech_admin", adminId: "ta1",
    action: "verified_work", details: {}, createdAt: { seconds: 1_785_000_000 },
    ...over,
  });

  it("shows tech actions, names the person, and separates the leader's from the admin's", () => {
    feedRows = [
      row({ action: "deleted_orders", details: { count: 2, orders: [{ businessName: "Fmcg", category: "promotional" }] } }),
      row({ actorName: "Saiveni", actorRole: "tech_team_leader", action: "assigned_work", details: { memberName: "Jyothika", category: "promotional", businessName: "Ballon house", fromOrder: true } }),
      // A sales entry filed under the same admin must not leak into the tech feed.
      row({ action: "verified_sale", details: { amount: 999, leadName: "Someone" } }),
    ];

    render(<TechActivityHistory />);
    const rows = screen.getAllByTestId("tech-activity-row");
    expect(rows).toHaveLength(2);
    expect(document.body.textContent).toContain("Srinu");
    expect(document.body.textContent).toContain("Saiveni");
    // The sales action was filtered out — this page is the tech record.
    expect(document.body.textContent).not.toContain("Someone");
    // A bulk deletion names what actually went, so the log answers "which orders?" on its own.
    expect(document.body.textContent).toContain("Fmcg");
  });

  it("can be narrowed to just what left the delivery queue", () => {
    feedRows = [
      row({ action: "deleted_orders", details: { count: 1, orders: [] } }),
      row({ action: "verified_work", details: { memberName: "Jyothika", category: "wishes" } }),
    ];

    render(<TechActivityHistory />);
    expect(screen.getAllByTestId("tech-activity-row")).toHaveLength(2);
    fireEvent.click(screen.getByTestId("tech-activity-filter-removals"));
    expect(screen.getAllByTestId("tech-activity-row")).toHaveLength(1);
  });
});

describe("the tech action list", () => {
  it("covers every action the tech side can take, so none is silently dropped from the feed", () => {
    // The page filters on this list; an action missing from it is recorded and never shown.
    expect(TECH_ACTIVITY_ACTIONS).toEqual(expect.arrayContaining([
      "assigned_work", "unassigned_work", "reassigned_work", "verified_work",
      "deleted_orders", "restored_orders", "cleaned_up_orders", "added_penalty", "removed_penalty",
    ]));
  });
});

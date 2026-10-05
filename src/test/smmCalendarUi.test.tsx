/**
 * The client calendar on a month's page (2026-10-05, redrawn twice that day) — the real component, the real
 * history read (`fetchClientMonths`) on the in-memory Firestore, as a member on the client's months:
 *
 *   • a normal calendar: it opens on today's month ("October 2026"), with ‹ › that name where they go,
 *     Today, and a list of every month; the arrows stop (greyed) at the client's first and last month;
 *   • the client's months on the page are named above it (this page's own month, the others as links) and
 *     where they start and end is written on the day;
 *   • the three counts are the posts on the days on screen; every post sits on its upload date;
 *   • on a wide calendar a day lists its posts by name; on a narrow one only its marks;
 *   • a day picked lists its posts under the calendar, in sentences, with the live links; this month's
 *     posts open for editing;
 *   • arrows move a day (over a month's edge too) and Page Up / Page Down a month; the kind filter applies;
 *   • a month the member is not on never shows; a failed read says so and can be tried again;
 *   • Social Media → Calendar lists the clients and opens the one picked on today's month.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {} }));
vi.mock("@/services/notifications", () => ({ sendNotification: vi.fn(async () => undefined), notifyTechTeamLeaders: vi.fn(async () => undefined) }));
const mockState = { fail: 0 };
vi.mock("@/services/smm", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/services/smm")>();
  return {
    ...real,
    fetchClientMonths: vi.fn(async (id: string) => {
      if (mockState.fail > 0) { mockState.fail -= 1; throw new Error("offline"); }
      return real.fetchClientMonths(id);
    }),
  };
});
const AUTH = { user: { uid: "arjun", name: "Arjun", role: "tech_member" } };
vi.mock("@/store/authStore", () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel(AUTH) }));

const mem = await import("./memoryFirestore");
const { __clearClientMonthsCache } = await import("@/hooks/useSmmClientMonths");
const SmmCalendar = (await import("@/components/smm/SmmCalendar")).default;
const SmmCalendarBoard = (await import("@/components/smm/SmmCalendarBoard")).default;
import type { SmmCampaign, SmmContentItem } from "@/types/smm";

configure({ testIdAttribute: "data-test" });

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 11, 0).getTime();
const item = (id: string, over: Partial<SmmContentItem> = {}): SmmContentItem => ({
  id, kind: "ai_ad", title: id.toUpperCase(), uploadDate: null, uploadTime: null, platforms: ["instagram"],
  status: "planned", approval: { state: "not_sent", askedAt: null, respondedAt: null, note: null, byName: null, chases: [] },
  extra: false, postedAt: null, ...over,
});
const month = (over: Partial<SmmCampaign> & { id: string }): SmmCampaign => ({
  orderId: over.id, leadId: "l", saleItemKey: "k", origin: "sale", clientPhone: "+919876543210",
  clientPhoneId: "919876543210", clientName: "Lakshmi", businessName: "Lakshmi Jewellers", packageKey: "Starter",
  packageLabel: "Starter", amount: 10000, cycle: { month: "2026-09", startDate: "2026-09-05", endDate: "2026-10-05" },
  platforms: ["instagram"], commitments: { poster: 0, ai_ad: 4, real_video: 0 }, items: [], ads: [], budgetPayments: [],
  team: { creator: { uid: "arjun", name: "Arjun" }, publisher: null, marketer: null, assistants: [] }, soldBy: "anil",
  soldByName: "Anil", watchers: ["anil", "arjun"], status: "active", renewal: { state: "none" }, ...over,
});

const M0 = month({ // a month Arjun was not on — never shown to him
  id: "m0", watchers: ["divya"], soldBy: "ravi", status: "completed",
  cycle: { month: "2026-07", startDate: "2026-07-05", endDate: "2026-08-05" },
  items: [item("secret", { status: "posted", uploadDate: "2026-07-10", postedAt: at(2026, 7, 10) })],
});
const M1 = month({
  id: "m1", monthNumber: 1, status: "renewed", cycle: { month: "2026-08", startDate: "2026-08-05", endDate: "2026-09-05" },
  items: [
    // Marked posted two days late — it still sits on its upload date, the 10th.
    item("p1", { status: "posted", uploadDate: "2026-08-10", uploadTime: "06:00", postedAt: at(2026, 8, 12), postUrls: { instagram: "https://instagram.com/p/abc" } }),
    item("p3", { uploadDate: "2026-08-25" }),
  ],
});
const M2 = month({
  id: "m2", monthNumber: 2,
  items: [
    item("p5", { status: "posted", uploadDate: "2026-09-10", postedAt: at(2026, 10, 5) }),
    item("p6", { uploadDate: "2026-10-01" }),
    item("p7", { uploadDate: "2026-10-05", uploadTime: "09:00", kind: "poster" }),
  ],
});
const M3 = month({
  id: "m3", monthNumber: 3, cycle: { month: "2026-10", startDate: "2026-10-05", endDate: "2026-11-05" },
  items: [item("p10", { uploadDate: "2026-10-20" })],
});

const pickedDay = () => screen.getAllByTestId("smm-cal-day").find((d) => d.getAttribute("aria-selected") === "true")!.getAttribute("data-day");
const title = () => screen.getByTestId("smm-cal-title").textContent;
const count = (k: string) => screen.getByTestId(`smm-cal-count-${k}`).textContent;
const cell = (day: string) => screen.getAllByTestId("smm-cal-day").find((d) => d.getAttribute("data-day") === day)!;
const clientMonths = () => screen.getAllByTestId("smm-cal-client-month").map((c) => c.getAttribute("data-id"));
/** Wait until the client's other months are in (Month 3 is named on October's page). */
const loaded = () => waitFor(() => expect(clientMonths()).toEqual(["m2", "m3"]));

function show(kind: "all" | "poster" = "all") {
  const onOpen = vi.fn();
  render(<MemoryRouter><SmmCalendar campaign={M2} kind={kind} onOpen={onOpen} /></MemoryRouter>);
  return { onOpen };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 5, 10, 0));
  mem.__reset();
  __clearClientMonthsCache();
  mockState.fail = 0;
  for (const m of [M0, M1, M2, M3]) mem.__seed(`smm_campaigns/${m.id}`, m as unknown as Record<string, unknown>);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the client calendar on a month's page", () => {
  it("opens on today's month with its counts, the client's months and today's posts", async () => {
    const { onOpen } = show();
    expect(title()).toBe("October 2026");
    await loaded();
    // This page's own month is named, not linked; the next one links to its page.
    const [own, next] = screen.getAllByTestId("smm-cal-client-month");
    expect(own.tagName).toBe("SPAN");
    expect(own.textContent).toMatch(/Month 2· 5 Sep – 5 Oct 2026Running now/);
    expect(next.getAttribute("href")).toBe("/smm/m3");
    // The posts on October's days: 1 Oct not posted; 5 Oct and 20 Oct to come.
    expect(count("posted")).toBe("0Posted");
    expect(count("notPosted")).toBe("1Not posted");
    expect(count("coming")).toBe("2Coming up");
    expect(pickedDay()).toBe("2026-10-05");
    // A wide calendar lists a day's posts by name, mark first; the handover day says so.
    const oct1 = within(cell("2026-10-01")).getAllByTestId("smm-cal-day-entry");
    expect(oct1.map((e) => [e.getAttribute("data-mark"), e.textContent])).toEqual([["notPosted", "P6"]]);
    expect(within(cell("2026-10-05")).getAllByTestId("smm-cal-marker").map((m) => m.textContent)).toEqual(["Month 2 ends", "Month 3 starts"]);
    // A day of September is drawn empty and inert.
    expect(cell("2026-09-28").getAttribute("aria-disabled")).toBe("true");
    expect(within(cell("2026-09-28")).queryAllByTestId("smm-cal-day-entry")).toHaveLength(0);

    const today = within(screen.getByTestId("smm-cal-panel")).getAllByTestId("smm-cal-entry");
    expect(today.map((e) => e.getAttribute("data-key"))).toEqual(["m2:p7"]);
    expect(within(today[0]).getByTestId("smm-cal-entry-note").textContent).toBe("To be posted today, 9:00 AM");
    fireEvent.click(within(today[0]).getByTestId("smm-cal-entry-open"));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "p7" }));
    // Today is already on screen; the arrows go to September and November.
    expect(screen.getByTestId("smm-cal-today")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("smm-cal-prev").getAttribute("aria-label")).toBe("Previous month: September 2026");
    expect(screen.getByTestId("smm-cal-next").getAttribute("aria-label")).toBe("Next month: November 2026");
  });

  it("goes back month by month to the client's first, where ‹ stops; posts sit on their upload dates", async () => {
    show();
    await loaded();
    fireEvent.click(screen.getByTestId("smm-cal-prev"));
    expect(title()).toBe("September 2026");
    // Marked posted today, but its upload date is 10 Sep: it is on September's page, not today.
    expect(count("posted")).toBe("1Posted");
    expect(within(cell("2026-09-10")).getAllByTestId("smm-cal-day-entry")[0].getAttribute("data-mark")).toBe("posted");
    expect(clientMonths()).toEqual(["m1", "m2"]);

    fireEvent.click(screen.getByTestId("smm-cal-prev"));
    expect(title()).toBe("August 2026");
    expect(count("posted")).toBe("1Posted");
    expect(count("notPosted")).toBe("1Not posted");
    expect(screen.getByTestId("smm-cal-prev")).toHaveProperty("disabled", true); // Month 0 is not his
    expect(screen.getByTestId("smm-cal-prev").getAttribute("aria-label")).toBe("No earlier month for this client");
    expect(pickedDay()).toBe("2026-08-10"); // the first day with a post
    const panel = screen.getByTestId("smm-cal-panel");
    expect(within(panel).getByTestId("smm-cal-entry-note").textContent).toBe("Posted on 10 Aug, 6:00 AM");
    expect(within(panel).getByTestId("smm-cal-entry-link").getAttribute("href")).toBe("https://instagram.com/p/abc");
    expect(within(panel).queryByTestId("smm-cal-entry-open")).toBeNull(); // not this page's month
    expect(screen.getAllByTestId("smm-cal-client-month")[0].getAttribute("href")).toBe("/smm/m1");

    fireEvent.click(cell("2026-08-25"));
    expect(screen.getByTestId("smm-cal-entry-note").textContent).toBe("Not posted — it was due on 25 Aug");
    expect(document.body.textContent).not.toMatch(/SECRET/);

    // Today brings it back, with today picked.
    fireEvent.click(screen.getByTestId("smm-cal-today"));
    expect(title()).toBe("October 2026");
    expect(pickedDay()).toBe("2026-10-05");
  });

  it("lists every month to jump to, and › stops at the client's last", async () => {
    show();
    await loaded();
    fireEvent.click(screen.getByTestId("smm-cal-pick-month"));
    const options = await screen.findAllByTestId("smm-cal-month-option");
    expect(options.map((o) => o.getAttribute("data-ym"))).toEqual(["2026-11", "2026-10", "2026-09", "2026-08"]);
    expect(options[1].getAttribute("aria-current")).toBe("true");
    expect(options[3].textContent).toMatch(/August 2026Month 1/);
    fireEvent.click(options[0]);
    expect(title()).toBe("November 2026");
    expect(screen.getByTestId("smm-cal-next")).toHaveProperty("disabled", true);
    expect(clientMonths()).toEqual(["m3"]);
    expect(within(cell("2026-11-05")).getAllByTestId("smm-cal-marker")[0].textContent).toBe("Month 3 ends");
  });

  it("moves a day with the arrows — over the month's edge too — and a month with Page Up / Page Down", async () => {
    show();
    await loaded();
    act(() => { (cell("2026-10-05") as HTMLElement).focus(); });
    fireEvent.keyDown(screen.getByTestId("smm-cal-grid"), { key: "ArrowRight" });
    expect(pickedDay()).toBe("2026-10-06");
    expect(document.activeElement?.getAttribute("data-day")).toBe("2026-10-06");
    fireEvent.keyDown(screen.getByTestId("smm-cal-grid"), { key: "PageDown" });
    expect(title()).toBe("November 2026");
    expect(document.activeElement?.getAttribute("data-day")).toBe("2026-11-01");
    fireEvent.keyDown(screen.getByTestId("smm-cal-grid"), { key: "ArrowLeft" });
    expect(title()).toBe("October 2026");
    expect(pickedDay()).toBe("2026-10-31");
    expect(document.activeElement?.getAttribute("data-day")).toBe("2026-10-31");
    fireEvent.keyDown(screen.getByTestId("smm-cal-grid"), { key: "PageUp" });
    fireEvent.keyDown(screen.getByTestId("smm-cal-grid"), { key: "PageUp" });
    expect(title()).toBe("August 2026");
    fireEvent.keyDown(screen.getByTestId("smm-cal-grid"), { key: "PageUp" }); // nothing earlier: stays
    expect(title()).toBe("August 2026");
  });

  it("applies the kind filter", async () => {
    show("poster");
    await loaded();
    expect(count("coming")).toMatch(/^1/); // p7, the only poster
    expect(count("posted")).toMatch(/^0/);
    expect(count("notPosted")).toMatch(/^0/);
    expect(within(cell("2026-10-01")).queryAllByTestId("smm-cal-day-entry")).toHaveLength(0);
  });

  it("on a narrow calendar a day shows only its marks", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 360, height: 600, top: 0, left: 0, right: 360, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    show();
    await loaded();
    expect(within(cell("2026-10-01")).getAllByTestId("smm-cal-day-mark").map((m) => m.getAttribute("data-mark"))).toEqual(["notPosted"]);
    expect(within(cell("2026-10-01")).queryAllByTestId("smm-cal-day-entry")).toHaveLength(0);
    expect(within(cell("2026-10-05")).getByTestId("smm-cal-marker").textContent).toBe("Start");
    expect(screen.getByTestId("smm-cal-prev").textContent).toBe(""); // just the arrow
  });

  it("says when the earlier months could not be read, and tries again", async () => {
    mockState.fail = 1;
    show();
    await screen.findByTestId("smm-cal-error");
    expect(title()).toBe("October 2026"); // this month is still there
    expect(clientMonths()).toEqual(["m2"]);
    fireEvent.click(within(screen.getByTestId("smm-cal-error")).getByRole("button"));
    await waitFor(() => expect(screen.queryByTestId("smm-cal-error")).toBeNull());
    await loaded();
  });
});

describe("Social Media → Calendar, for an overseer", () => {
  const OTHER = month({ id: "o1", clientPhoneId: "911111111111", clientPhone: "+911111111111", businessName: "Annapurna Sweets", items: [] });

  it("lists the clients A to Z, opens the one picked on today's month, and offers the ended ones", async () => {
    const onLoadFinished = vi.fn();
    render(
      <MemoryRouter initialEntries={["/smm?view=calendar"]}>
        <SmmCalendarBoard campaigns={[M2, M3, OTHER]} scope={() => true} viewer={{ uid: "kiran", role: "tech_admin" }}
          overseer today="2026-10-05" finishedState="not_loaded" onLoadFinished={onLoadFinished} />
      </MemoryRouter>,
    );
    const names = () => screen.getAllByTestId("smm-calboard-client").map((b) => b.textContent);
    expect(names()[0]).toMatch(/Annapurna Sweets/);
    expect(names()[1]).toMatch(/Lakshmi Jewellers/);
    expect(screen.getByTestId("smm-calboard-name").textContent).toBe("Annapurna Sweets");

    fireEvent.click(screen.getAllByTestId("smm-calboard-client")[1]);
    expect(screen.getByTestId("smm-calboard-name").textContent).toBe("Lakshmi Jewellers");
    expect(title()).toBe("October 2026");
    expect(screen.getByTestId("smm-calboard-open").getAttribute("href")).toBe("/smm/m3");
    // Their finished months are read for an overseer — every one, back to July.
    fireEvent.click(screen.getByTestId("smm-cal-pick-month"));
    await waitFor(() => expect(screen.getAllByTestId("smm-cal-month-option").map((o) => o.getAttribute("data-ym")))
      .toEqual(["2026-11", "2026-10", "2026-09", "2026-08", "2026-07"]));

    fireEvent.click(screen.getAllByTestId("smm-calboard-finished")[0]);
    expect(onLoadFinished).toHaveBeenCalled();

    fireEvent.change(screen.getAllByTestId("smm-calboard-search")[0], { target: { value: "anna" } });
    expect(screen.getAllByTestId("smm-calboard-client").every((b) => /Annapurna/.test(b.textContent || ""))).toBe(true);
  });
});

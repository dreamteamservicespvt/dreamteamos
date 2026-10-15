/**
 * SMM Delivery Control, phase 7 (2026-10-15): the Flow-credit forecast (what this week's AI videos cost against
 * the credits left in the maker's Flow accounts), the client's one-tap approval in their own chat (the rules the
 * server runs, alias-free and `.js`-clean, and the card the client sees), and the server action's wiring.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { month, piece } from "./smmDeliveryFixtures";
import { istMoment } from "@/utils/smmCadence";
import { DEFAULT_SMM_DELIVERY } from "@/utils/smmDeliverySettings";
import { buildControlBoard } from "@/utils/smmDeliveryView";
import { creditForecast, forecastWords, videoCredits } from "@/utils/smmCreditForecast";
import { clientAnswerItems, piecesAwaitingClient } from "@/utils/smmClientApproval";
import type { FlowAccount } from "@/types/aiAccounts";

configure({ testIdAttribute: "data-test" });
afterEach(() => cleanup());

const MON26 = istMoment("2026-10-26", 11);
const boardOf = (items: Record<string, unknown>[], over: Record<string, unknown> = {}) => buildControlBoard({
  months: [month({ items, commitments: { ai_ad: 4, poster: 4, real_video: 0 }, clipsPerVideo: 4, ...over })],
  settings: { ...DEFAULT_SMM_DELIVERY, mode: "live" }, holidays: null, now: MON26,
  viewer: { uid: "kiran", role: "tech_admin" }, liveSince: istMoment("2026-10-15", 9),
});
const account = (over: Partial<FlowAccount> = {}) => ({
  id: "a@x.com", email: "a@x.com", createdOn: "2026-10-01", expiresOn: "2028-04-01", monthlyCredits: 1000,
  usedByCycle: { "2026-10-01": 900 }, holderId: "ravi", ownerId: "ravi", status: "active", ...over,
}) as unknown as FlowAccount;

describe("the Flow-credit forecast", () => {
  it("a 4-clip video costs 48 credits (12 an 8-second clip); posters cost nothing", () => {
    const b = boardOf([piece({ id: "v", plan: { week: 2, by: "auto" }, makerUid: "ravi" })]);
    expect(videoCredits(b.rows[0])).toBe(48);
  });

  it("this week's and next week's videos against what the maker holds: short, tight, ok, no accounts", () => {
    const items = [
      piece({ id: "late", plan: { week: 1, by: "auto" }, makerUid: "ravi" }),
      piece({ id: "now", plan: { week: 2, by: "auto" }, makerUid: "ravi" }),
      piece({ id: "next", plan: { week: 3, by: "auto" }, makerUid: "ravi" }),
      piece({ id: "poster", kind: "poster", plan: { week: 2, by: "auto" }, makerUid: "ravi" }),
    ];
    const b = boardOf(items);
    const short = creditForecast({ rows: b.rows, accounts: [account()], today: b.today }).get("ravi")!;
    expect(short).toMatchObject({ videosThisWeek: 2, creditsThisWeek: 96, videosNextWeek: 1, creditsNextWeek: 48, remaining: 100, state: "tight" });
    const none = creditForecast({ rows: b.rows, accounts: [], today: b.today }).get("ravi")!;
    expect(none.state).toBe("no_accounts");
    expect(forecastWords(none)).toMatch(/no usable Flow account/);
    const low = creditForecast({ rows: b.rows, accounts: [account({ usedByCycle: { "2026-10-01": 950 } })], today: b.today }).get("ravi")!;
    expect(low.state).toBe("short");
    expect(forecastWords(low)).toMatch(/46 short/);
    const ok = creditForecast({ rows: b.rows, accounts: [account({ usedByCycle: {} })], today: b.today }).get("ravi")!;
    expect(ok.state).toBe("ok");
  });
});

describe("the client's one-tap approval — the rules the server runs", () => {
  const waiting = (id: string, title = "Diwali offer") =>
    piece({ id, title, status: "awaiting_approval", approval: { state: "waiting", askedAt: 1000, respondedAt: null, chases: [] }, makerUid: "ravi", publisherUid: "priya" });

  it("lists only pieces sent and not answered; nothing for a deleted month", () => {
    const m = { status: "active", items: [waiting("a"), piece({ id: "b" }), { ...waiting("c"), status: "approved", approval: { state: "approved" } }] };
    expect(piecesAwaitingClient(m as never).map((p) => p.itemId)).toEqual(["a"]);
    expect(piecesAwaitingClient({ ...m, status: "deleted" } as never)).toEqual([]);
  });

  it("approved: stage, approval and proof (via the client chat); changes: needs words, one more revision", () => {
    const m = { status: "active", items: [waiting("a")] };
    const ok = clientAnswerItems(m as never, "a", { approved: true, clientName: "Lakshmi", guestUid: "guest_m1", now: 5, stamp: "T" });
    expect(ok.problem).toBe("");
    expect(ok.item).toMatchObject({
      status: "approved", approval: { state: "approved", respondedAt: "T", byName: "Lakshmi (client chat)" },
      approvalProof: { approved: true, who: "Lakshmi", via: "client_chat", byUid: "guest_m1", at: 5 },
    });
    expect(clientAnswerItems(m as never, "a", { approved: false, note: "", clientName: "L", guestUid: "g", now: 5, stamp: "T" }).problem).toMatch(/say what to change/);
    const ch = clientAnswerItems(m as never, "a", { approved: false, note: "Make the logo bigger", clientName: "L", guestUid: "g", now: 5, stamp: "T" });
    expect(ch.item).toMatchObject({ status: "changes_requested", approval: { state: "changes", note: "Make the logo bigger" }, revisions: 1 });
  });

  it("an answer twice is refused politely; an unknown piece too", () => {
    const m = { status: "active", items: [{ ...waiting("a"), status: "approved", approval: { state: "approved" } }] };
    expect(clientAnswerItems(m as never, "a", { approved: true, clientName: "L", guestUid: "g", now: 5, stamp: "T" }).problem).toMatch(/already answered/);
    expect(clientAnswerItems(m as never, "zz", { approved: true, clientName: "L", guestUid: "g", now: 5, stamp: "T" }).problem).toMatch(/no longer waiting/);
  });

  it("the server can load the rules: no @/ imports, and api/order-chat imports them with .js", () => {
    const src = readFileSync(resolve(__dirname, "../utils/smmClientApproval.ts"), "utf8");
    expect(src).not.toMatch(/from "@\//);
    expect(src.match(/^import (?!type)[^;]*from "\.[^"]*";/gm) || []).toEqual([]);
    const api = readFileSync(resolve(__dirname, "../../api/order-chat.ts"), "utf8");
    expect(api).toContain(`from "../src/utils/smmClientApproval.js"`);
    expect(api).toMatch(/action === "smm-approvals" \|\| action === "smm-answer"/);
    expect(api).toMatch(/isGuestOf\(chatId, req\.headers\.authorization\)\)\) \{\s*return res\.status\(403\)/);
  });
});

describe("the client's card", () => {
  it("shows the waiting posts, approves with one tap, and asks what to change", async () => {
    vi.resetModules();
    const answerSmmPiece = vi.fn(async () => undefined);
    vi.doMock("@/services/orderChatGuest", () => ({
      fetchSmmApprovals: vi.fn(async () => [
        { itemId: "a", title: "Diwali offer", label: "Video", sentAt: Date.now() },
        { itemId: "b", title: "Founder story", label: "Poster", sentAt: null },
      ]),
      answerSmmPiece,
    }));
    const ClientSmmApprovals = (await import("@/components/order-chat/ClientSmmApprovals")).default;
    render(<ClientSmmApprovals chatId="m1" />);
    fireEvent.click(await screen.findByText(/2 posts are waiting for your approval/));
    const approve = await screen.findAllByTestId("client-smm-approve");
    fireEvent.click(approve[0]);
    await waitFor(() => expect(answerSmmPiece).toHaveBeenCalledWith("m1", "a", true, ""));
    expect(await screen.findByText(/"Diwali offer" is approved/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Changes/ }));
    fireEvent.change(screen.getByPlaceholderText("What should we change?"), { target: { value: "Brighter colours" } });
    fireEvent.click(screen.getByRole("button", { name: "Send the changes" }));
    await waitFor(() => expect(answerSmmPiece).toHaveBeenCalledWith("m1", "b", false, "Brighter colours"));
    vi.doUnmock("@/services/orderChatGuest");
  });
});

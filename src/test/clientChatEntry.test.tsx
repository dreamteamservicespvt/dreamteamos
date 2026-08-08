import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * How a customer gets into their own chat.
 *
 * This is the single most fragile path in the product, because the person walking it has no
 * account, no instructions and no patience — and every extra step is one at which the whole
 * feature is abandoned in favour of the WhatsApp group it replaced. Two guarantees are worth
 * pinning hard:
 *
 *  1. **Nothing is typed.** There used to be a four-digit code. There must never be one again.
 *  2. **Notifications are asked for before the conversation opens**, because a customer who does
 *     not get told the team replied has, from their point of view, not been replied to.
 */

const {
  hasGuestSession, openOrderChat, enableGuestPush, pushState, guestUid, alertTeam, guestDb,
  useOrderChat,
} = vi.hoisted(() => ({
  hasGuestSession: vi.fn().mockResolvedValue(false),
  openOrderChat: vi.fn().mockResolvedValue({ ok: true, chat: {} }),
  enableGuestPush: vi.fn().mockResolvedValue("granted"),
  pushState: vi.fn().mockReturnValue("default"),
  guestUid: (id: string) => `guest_${id}`,
  alertTeam: vi.fn(),
  guestDb: () => ({}),
  useOrderChat: vi.fn(),
}));

vi.mock("@/services/orderChatGuest", () => ({
  hasGuestSession, openOrderChat, enableGuestPush, pushState, guestUid, alertTeam, guestDb,
}));
vi.mock("@/hooks/useOrderChat", () => ({ useOrderChat }));
vi.mock("@/hooks/useNotificationTap", () => ({ useNotificationTap: () => {} }));
// The call layer opens WebRTC and Firestore listeners; neither is what this file is about.
vi.mock("@/components/order-chat/ClientCall", () => ({ default: () => null }));

import ClientChat from "@/pages/client/ClientChat";

configure({ testIdAttribute: "data-test" });

const room = {
  businessName: "Sharma Electronics",
  memberName: "Ravi",
  memberUid: "m1",
  uniqueId: "P001",
};

function renderChat() {
  return render(
    <MemoryRouter initialEntries={["/c/abc123"]}>
      <Routes><Route path="/c/:chatId" element={<ClientChat />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  hasGuestSession.mockResolvedValue(false);
  openOrderChat.mockResolvedValue({ ok: true, chat: {} });
  enableGuestPush.mockResolvedValue("granted");
  pushState.mockReturnValue("default");
  useOrderChat.mockReturnValue({
    room, messages: [], loading: false, missing: false, locked: false,
    canSend: true, sending: false, send: vi.fn(),
  });
});
afterEach(cleanup);

describe("getting in", () => {
  it("asks the customer for nothing — the link is the whole credential", async () => {
    renderChat();
    await waitFor(() => expect(openOrderChat).toHaveBeenCalledWith("abc123"));
    // The four-digit code is gone and must stay gone: it was the single biggest reason a chat
    // was never opened at all.
    expect(screen.queryByText(/4-digit/i)).toBeNull();
    expect(screen.queryByText(/enter the code/i)).toBeNull();
    expect(document.querySelectorAll("input[inputmode=numeric]")).toHaveLength(0);
  });

  it("does not spend a round trip re-opening a room this browser is already in", async () => {
    hasGuestSession.mockResolvedValue(true);
    pushState.mockReturnValue("granted");
    renderChat();
    await screen.findByText("Sharma Electronics");
    expect(openOrderChat).not.toHaveBeenCalled();
  });

  it("says so plainly when the link has gone stale", async () => {
    openOrderChat.mockResolvedValue({ ok: false, error: "not_found" });
    renderChat();
    expect(await screen.findByText(/no longer available/i)).toBeTruthy();
  });
});

describe("the notification gate", () => {
  it("stands between the link and the conversation", async () => {
    renderChat();
    expect(await screen.findByTestId("enable-notifications")).toBeTruthy();
    expect(screen.queryByText("Sharma Electronics")).toBeNull();
  });

  it("opens the conversation once permission is given", async () => {
    renderChat();
    fireEvent.click(await screen.findByTestId("enable-notifications"));
    await waitFor(() => expect(enableGuestPush).toHaveBeenCalledWith("abc123"));
    expect(await screen.findByText("Sharma Electronics")).toBeTruthy();
  });

  it("registers this room even when the browser already said yes to another one", async () => {
    // Permission belongs to the browser; the registration belongs to the room. A customer with
    // two orders would otherwise be unreachable on the second one.
    pushState.mockReturnValue("granted");
    renderChat();
    await screen.findByText("Sharma Electronics");
    expect(enableGuestPush).toHaveBeenCalledWith("abc123");
  });

  it("holds a customer whose browser has blocked notifications, and says how to fix it", async () => {
    /**
     * There used to be a "Continue without notifications" link here. Taking it produced exactly the
     * failure this screen exists to prevent: a customer sitting in a chat that cannot reach them,
     * a team replying into silence, and a missed call neither side can explain. Letting them in is
     * not the kind option — it is the one that wastes their week.
     */
    pushState.mockReturnValue("denied");
    renderChat();

    expect(await screen.findByText(/Notifications are blocked/)).toBeTruthy();
    expect(screen.queryByTestId("skip-notification-gate")).toBeNull();
    expect(screen.queryByText("Sharma Electronics")).toBeNull();
  });

  it("opens the chat once they have allowed it and pressed re-check", async () => {
    // The way out is to fix the setting, so the button re-reads it rather than making them hunt
    // for the link again.
    pushState.mockReturnValue("denied");
    renderChat();
    // Waited for, not assumed: the gate is decided in an async effect, so flipping the mock before
    // it has read the first value tests nothing at all.
    const recheck = await screen.findByTestId("recheck-notifications");

    pushState.mockReturnValue("granted");
    fireEvent.click(recheck);
    expect(await screen.findByText("Sharma Electronics")).toBeTruthy();
  });

  it("tells them what the permission is actually for — messages and calls", async () => {
    pushState.mockReturnValue("default");
    renderChat();
    expect(await screen.findByText(/Messages/)).toBeTruthy();
    expect(screen.getByText(/Calls/)).toBeTruthy();
  });

  it("does not block a browser that has no notifications to offer at all", async () => {
    pushState.mockReturnValue("unsupported");
    renderChat();
    expect(await screen.findByText("Sharma Electronics")).toBeTruthy();
    expect(screen.queryByTestId("enable-notifications")).toBeNull();
  });
});

describe("the page a customer sees", () => {
  it("is light, whatever the staff app's theme is set to", async () => {
    document.documentElement.classList.add("dark");
    pushState.mockReturnValue("granted");
    renderChat();
    await screen.findByText("Sharma Electronics");
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(false));
  });

  it("points the install prompt at the chat's own manifest, not the staff app's", async () => {
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "/manifest.webmanifest";
    document.head.appendChild(link);
    pushState.mockReturnValue("granted");

    const view = renderChat();
    await screen.findByText("Sharma Electronics");
    expect(link.getAttribute("href")).toBe("/chat.webmanifest");

    // …and hands the document back when the customer leaves.
    view.unmount();
    expect(link.getAttribute("href")).toBe("/manifest.webmanifest");
    link.remove();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, configure, render, screen } from "@testing-library/react";

/**
 * The member's client chat, and the bug that made it look like the button did nothing.
 *
 * Every page mounts this as `onClose={() => setOpenChatFor(null)}` — a fresh function on every
 * render. The back-button integration had `onClose` in its dependency array, so the effect tore
 * itself down and rebuilt on each of the page's renders, and its teardown called
 * `history.back()`. That popstate reached the listener the rebuild had just attached, which called
 * `onClose`. The chat shut roughly the instant it opened, on every screen, for every role.
 *
 * These pin the two halves: it stays open while the page underneath re-renders, and Back still
 * closes it exactly once.
 */

const { ensureOrderChat, alertClient, useOrderChat, startCall } = vi.hoisted(() => ({
  ensureOrderChat: vi.fn().mockResolvedValue(undefined),
  alertClient: vi.fn(),
  useOrderChat: vi.fn(),
  startCall: vi.fn(),
}));

vi.mock("@/services/orderChat", () => ({
  ensureOrderChat,
  alertClient,
  // Real behaviour, not a stub: what it returns decides whether a message is stamped as sales or
  // tech, and a mock that always said "tech" would let that regress silently.
  senderRoleOf: (role: string) => (role === "sales_member" || role === "sales_admin" ? "sales" : "tech"),
}));
vi.mock("@/hooks/useOrderChat", () => ({ useOrderChat }));
vi.mock("@/services/orderChatGuest", () => ({ guestUid: (id: string) => `guest_${id}` }));
vi.mock("@/store/authStore", () => ({
  useAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ user: { uid: "m1", name: "Hasini", role: "tech_member", createdBy: "a1" } }),
}));
vi.mock("@/store/callStore", () => ({
  useCallStore: (sel: (s: unknown) => unknown) => sel({ startCall }),
}));

import StaffOrderChat from "@/components/order-chat/StaffOrderChat";
import type { WorkAssignment } from "@/types";

configure({ testIdAttribute: "data-test" });

const assignment = {
  id: "job-1",
  uniqueId: "P001",
  businessName: "Sharma Electronics",
  category: "promotional",
  assignedTo: "m1",
  accessCode: "1234",
} as unknown as WorkAssignment;

/** The page underneath, re-rendering the way a live Firestore listener makes it. */
function Page({ onClose }: { onClose: () => void }) {
  return (
    <StaffOrderChat
      assignment={assignment}
      memberName="Hasini"
      onClose={onClose}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useOrderChat.mockReturnValue({
    room: { memberUid: "m1", clientName: "Sharma Electronics" },
    messages: [], loading: false, missing: false, locked: false,
    canSend: true, sending: false, send: vi.fn(),
  });
});
afterEach(cleanup);

describe("opening the client chat", () => {
  /**
   * The re-render must not disturb the history stack.
   *
   * Asserting on `history.back()` rather than on the chat disappearing, because jsdom queues the
   * popstate that `back()` produces and never delivers it inside a synchronous test — so watching
   * for the chat to vanish passes whether the bug is present or not. `back()` being called at all
   * during an ordinary re-render IS the bug: in a real browser that call is what fires the
   * popstate that closes the chat.
   */
  it("does not touch history while the page underneath keeps re-rendering", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const onClose = vi.fn();
    // A NEW arrow every render, exactly as every real call site passes.
    const view = render(<Page onClose={() => onClose()} />);
    expect(screen.getByTestId("staff-order-chat")).toBeInTheDocument();

    for (let i = 0; i < 5; i += 1) {
      act(() => { view.rerender(<Page onClose={() => onClose()} />); });
    }

    expect(back).not.toHaveBeenCalled();
    expect(screen.getByTestId("staff-order-chat")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it("keeps exactly one Back listener however often the page re-renders", () => {
    const added: unknown[] = [];
    const removed: unknown[] = [];
    const addSpy = vi.spyOn(window, "addEventListener").mockImplementation(((t: string, f: unknown) => {
      if (t === "popstate") added.push(f);
    }) as never);
    const removeSpy = vi.spyOn(window, "removeEventListener").mockImplementation(((t: string, f: unknown) => {
      if (t === "popstate") removed.push(f);
    }) as never);

    const view = render(<Page onClose={vi.fn()} />);
    for (let i = 0; i < 5; i += 1) {
      act(() => { view.rerender(<Page onClose={vi.fn()} />); });
    }

    expect(added).toHaveLength(1);
    expect(removed).toHaveLength(0);
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("closes once, and only once, when Back is pressed", () => {
    const onClose = vi.fn();
    render(<Page onClose={() => onClose()} />);
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("leaves the history stack as it found it when closed by the arrow", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const view = render(<Page onClose={vi.fn()} />);
    view.unmount();
    // The entry it pushed is taken back off, so the member's next Back does what it did before.
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });

  it("does not pop an entry that Back already consumed", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const view = render(<Page onClose={vi.fn()} />);
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    view.unmount();
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });
});

describe("calling the client from the chat", () => {
  it("offers one button, and it is a voice call", () => {
    render(<Page onClose={vi.fn()} />);
    expect(screen.getByTestId("staff-call-client-voice")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-call-video")).toBeNull();
  });

  it("rings the customer as a voice call, never video", () => {
    render(<Page onClose={vi.fn()} />);
    screen.getByTestId("staff-call-client-voice").click();
    expect(startCall).toHaveBeenCalledWith("guest_job-1", "Sharma Electronics", undefined, "voice");
  });
});

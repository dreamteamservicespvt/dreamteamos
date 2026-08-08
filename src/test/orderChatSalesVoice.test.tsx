import { describe, it, expect, afterEach } from "vitest";
import { cleanup, configure, render, screen } from "@testing-library/react";

/**
 * Who the customer is told they are talking to.
 *
 * The rule this file pins down is a deliberate, narrow exception. The tech team stays anonymous to
 * the customer — naming the maker turns a company into one individual, and the day that job is
 * reassigned the client believes they have been dropped. The person who SOLD them the ad is
 * different: the client already knows their name and has their number, so a message arriving with
 * no name on it reads as a stranger in their conversation.
 *
 * Staff, meanwhile, see everyone by name, because on their screen the whole point of the label is
 * telling one colleague's message from another's on the same side of the thread.
 */

const OrderChatPanel = (await import("@/components/order-chat/OrderChatPanel")).default;

configure({ testIdAttribute: "data-test" });

const at = (h: number) => ({
  seconds: Math.floor(new Date(`2026-08-08T${String(h).padStart(2, "0")}:00:00Z`).getTime() / 1000),
});

const MESSAGES = [
  { id: "m1", senderId: "client", senderName: "Sharma Electronics", text: "Here is my logo", createdAt: at(9) },
  { id: "m2", senderId: "tech1", senderName: "Hasini", senderRole: "tech", text: "Got it, starting now", createdAt: at(10) },
  { id: "m3", senderId: "sales1", senderName: "Ravi", senderRole: "sales", text: "They also want the shop photo in it", createdAt: at(11) },
  // Written before roles existed. There is only one honest reading of it: the tech side, because
  // until sales joined these rooms nobody else could write here.
  { id: "m4", senderId: "tech1", senderName: "Hasini", text: "Preview attached", createdAt: at(12) },
];

const panel = (identity: { senderId: string; senderName: string; isClient: boolean; role?: "tech" | "sales" }) => (
  <OrderChatPanel identity={identity} messages={MESSAGES as never} onSend={() => {}} />
);

afterEach(() => cleanup());

describe("what the customer sees above each message", () => {
  it("names the sales member who sold to them", () => {
    render(panel({ senderId: "client", senderName: "Sharma Electronics", isClient: true }));
    expect(screen.getByText("Ravi")).toBeInTheDocument();
    expect(screen.getAllByTestId("order-chat-sales-badge").length).toBe(1);
  });

  it("still never names the people making the ad", () => {
    render(panel({ senderId: "client", senderName: "Sharma Electronics", isClient: true }));
    expect(screen.queryByText("Hasini")).not.toBeInTheDocument();
    expect(screen.getAllByText("Tech team").length).toBeGreaterThan(0);
  });

  it("reads a message written before roles existed as the tech team", () => {
    render(panel({ senderId: "client", senderName: "Sharma Electronics", isClient: true }));
    // "Preview attached" carries no senderRole at all and must not become an unnamed sales voice.
    const bubble = screen.getByText("Preview attached").closest("[data-test=order-chat-bubble]");
    expect(bubble?.textContent).toContain("Tech team");
    expect(bubble?.textContent).not.toContain("Hasini");
  });

  it("does not caption the customer's own messages", () => {
    render(panel({ senderId: "client", senderName: "Sharma Electronics", isClient: true }));
    const bubble = screen.getByText("Here is my logo").closest("[data-test=order-chat-bubble]");
    expect(bubble?.querySelector("[data-test=order-chat-sender]")).toBeNull();
  });
});

describe("what the team sees above each message", () => {
  it("names every colleague, and marks the sales ones", () => {
    render(panel({ senderId: "tech1", senderName: "Hasini", isClient: false, role: "tech" }));
    expect(screen.getByText("Ravi")).toBeInTheDocument();
    expect(screen.getAllByTestId("order-chat-sales-badge").length).toBe(1);
    // The customer keeps their name on a staff screen — it is not the customer we anonymise.
    expect(screen.getByText("Sharma Electronics")).toBeInTheDocument();
  });

  it("does not caption the reader's own messages", () => {
    render(panel({ senderId: "tech1", senderName: "Hasini", isClient: false, role: "tech" }));
    expect(screen.queryByText("Hasini")).not.toBeInTheDocument();
  });

  /**
   * The sales member reading their own room sees the maker by name, and not themselves.
   * This is the case the whole feature was built for: the client sent the seller a photo, the
   * seller posts it here, and the person building the ad can see who it came from.
   */
  it("works the same way round for the sales member", () => {
    render(panel({ senderId: "sales1", senderName: "Ravi", isClient: false, role: "sales" }));
    // Twice, because the seller's own message sits between the maker's two — two runs, two names.
    expect(screen.getAllByText("Hasini")).toHaveLength(2);
    expect(screen.queryByText("Ravi")).not.toBeInTheDocument();
  });
});

describe("captions do not repeat down a run", () => {
  it("names a sender once per run, not once per bubble", () => {
    const run = [
      { id: "a", senderId: "tech1", senderName: "Hasini", senderRole: "tech", text: "one", createdAt: at(9) },
      { id: "b", senderId: "tech1", senderName: "Hasini", senderRole: "tech", text: "two", createdAt: at(9) },
      { id: "c", senderId: "tech1", senderName: "Hasini", senderRole: "tech", text: "three", createdAt: at(9) },
    ];
    render(
      <OrderChatPanel
        identity={{ senderId: "client", senderName: "Sharma Electronics", isClient: true }}
        messages={run as never}
        onSend={() => {}}
      />,
    );
    // Three bubbles from one person is one person talking, not three introductions.
    expect(screen.getAllByText("Tech team")).toHaveLength(1);
  });
});

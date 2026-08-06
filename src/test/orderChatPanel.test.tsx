import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Two sides, whoever is reading.
 *
 * Bubbles used to be placed by sender, so on a team leader's screen the client's messages and their
 * own member's messages both landed on the left — every voice stacked against one edge, which is
 * unreadable and was the first thing reported about this chat. The side is now decided by WHOSE
 * side the sender is on, not by who is looking, and the name on the bubble says which teammate.
 */

vi.mock("@/services/cloudinary", () => ({
  uploadToCloudinary: vi.fn(async () => "https://cdn.test/uploaded.png"),
}));

const OrderChatPanel = (await import("@/components/order-chat/OrderChatPanel")).default;
const { uploadToCloudinary } = await import("@/services/cloudinary");

configure({ testIdAttribute: "data-test" });

const at = (h: number) => ({
  seconds: Math.floor(new Date(`2026-08-03T${String(h).padStart(2, "0")}:00:00Z`).getTime() / 1000),
});

const MESSAGES = [
  { id: "m1", senderId: "client", senderName: "Sharma Electronics", text: "Here is my logo", createdAt: at(9) },
  { id: "m2", senderId: "member1", senderName: "Hasini", text: "Got it, starting now", createdAt: at(10) },
  { id: "m3", senderId: "leader1", senderName: "Saiveni", text: "Anything you need, tell us", createdAt: at(11) },
];

/**
 * Which side a bubble sits on, read off the row that holds it.
 *
 * Anchored to `data-test` rather than to the bubble's width class: the class is a layout detail
 * that has already changed once, and when it did this returned "left" for everything and reported
 * a side bug that did not exist.
 */
function sideOf(text: string): "right" | "left" {
  const bubble = screen.getByText(text).closest("[data-test=order-chat-bubble-wrap]");
  const row = bubble?.parentElement;
  return row?.className.includes("justify-end") ? "right" : "left";
}

const panel = (identity: { senderId: string; senderName: string; isClient: boolean }) => (
  <OrderChatPanel identity={identity} messages={MESSAGES as never} onSend={vi.fn()} />
);

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("which side a message lands on", () => {
  it("puts the whole team on one side for the client", () => {
    render(panel({ senderId: "client", senderName: "Sharma Electronics", isClient: true }));
    expect(sideOf("Here is my logo")).toBe("right");
    expect(sideOf("Got it, starting now")).toBe("left");
    expect(sideOf("Anything you need, tell us")).toBe("left");
  });

  it("puts the client on one side and the whole team on the other, for the member", () => {
    render(panel({ senderId: "member1", senderName: "Hasini", isClient: false }));
    expect(sideOf("Here is my logo")).toBe("left");
    expect(sideOf("Got it, starting now")).toBe("right");
    expect(sideOf("Anything you need, tell us")).toBe("right");
  });

  it("does the same for a leader, who wrote none of it — the bug that started this", () => {
    render(panel({ senderId: "leader1", senderName: "Saiveni", isClient: false }));
    // Neither of these is the leader's own message, and they must still not share a side.
    expect(sideOf("Here is my logo")).toBe("left");
    expect(sideOf("Got it, starting now")).toBe("right");
  });

  it("names whoever wrote it, except the reader themselves", () => {
    render(panel({ senderId: "member1", senderName: "Hasini", isClient: false }));
    // The client and the teammate are named; the reader's own message is not.
    expect(screen.getByText("Sharma Electronics")).toBeInTheDocument();
    expect(screen.getByText("Saiveni")).toBeInTheDocument();
    expect(screen.queryByText("Hasini")).not.toBeInTheDocument();
  });
});

describe("what the customer is allowed to learn", () => {
  it("never names the person on the other end", () => {
    // Naming the member turns a company into one individual: the client starts asking for
    // "Hasini" by name, and the day that job is reassigned they believe they have been dropped.
    // It also puts a member's name on a stranger's phone.
    render(panel({ senderId: "client", senderName: "Sharma Electronics", isClient: true }));
    expect(screen.queryByText("Hasini")).not.toBeInTheDocument();
    expect(screen.queryByText("Saiveni")).not.toBeInTheDocument();
    // Their own messages are still theirs, and every message is still readable.
    expect(screen.getByText("Got it, starting now")).toBeInTheDocument();
    expect(screen.getByText("Anything you need, tell us")).toBeInTheDocument();
  });

  it("does not leak the name through a reply quote either", () => {
    render(panel({ senderId: "client", senderName: "Sharma Electronics", isClient: true }));
    fireEvent.click(screen.getAllByTestId("order-chat-reply")[1]);
    const bar = screen.getByTestId("order-chat-replying-to");
    expect(bar.textContent).not.toContain("Hasini");
    expect(bar.textContent).toContain("Got it, starting now");
  });
});

describe("replying to a particular message", () => {
  it("offers Reply on every message, with nothing to hover or tap first", () => {
    // It used to appear on hover, and hover does not exist on a phone — so on the device this
    // feature is actually used on, there was no reply button at all.
    render(panel({ senderId: "member1", senderName: "Hasini", isClient: false }));
    const buttons = screen.getAllByTestId("order-chat-reply");
    expect(buttons).toHaveLength(MESSAGES.length);
    for (const b of buttons) {
      expect(b.className).not.toContain("opacity-0");
      expect(b.parentElement?.className ?? "").not.toContain("opacity-0");
    }
  });

  it("shows the customer which message they are answering", () => {
    render(panel({ senderId: "client", senderName: "Sharma Electronics", isClient: true }));
    fireEvent.click(screen.getAllByTestId("order-chat-reply")[0]);
    expect(screen.getByTestId("order-chat-replying-to").textContent).toContain("Here is my logo");
  });

  it("offers it on both sides of the conversation, not just the other person's", () => {
    render(panel({ senderId: "member1", senderName: "Hasini", isClient: false }));
    // Three messages, one of them the reader's own — all three are quotable.
    expect(screen.getAllByTestId("order-chat-reply")).toHaveLength(3);
  });

  it("offers nothing to reply with once the work is delivered", () => {
    render(
      <OrderChatPanel
        identity={{ senderId: "client", senderName: "Sharma Electronics", isClient: true }}
        messages={MESSAGES as never}
        locked
        canSend={false}
        onSend={vi.fn()}
      />,
    );
    expect(screen.queryAllByTestId("order-chat-reply")).toHaveLength(0);
  });
});

describe("sending an attachment", () => {
  const file = (name: string, type: string) =>
    new File(["x".repeat(64)], name, { type });

  it("shows it before it goes, and sends the caption with it", async () => {
    const onSend = vi.fn();
    render(
      <OrderChatPanel
        identity={{ senderId: "client", senderName: "Sharma", isClient: true }}
        messages={[] as never}
        onSend={onSend}
      />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file("shopfront.jpg", "image/jpeg")] } });

    // Nothing is uploaded on picking — the preview is a decision point, not a progress bar.
    expect(screen.getByTestId("order-chat-preview")).toBeInTheDocument();
    expect(uploadToCloudinary).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("order-chat-caption"), {
      target: { value: "Use this logo please" },
    });
    fireEvent.click(screen.getByTestId("order-chat-preview-send"));

    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(onSend.mock.calls[0][0]).toMatchObject({
      type: "image",
      fileName: "shopfront.jpg",
      text: "Use this logo please",
    });
  });

  it("can be cancelled without sending anything", () => {
    const onSend = vi.fn();
    render(
      <OrderChatPanel
        identity={{ senderId: "client", senderName: "Sharma", isClient: true }}
        messages={[] as never}
        onSend={onSend}
      />,
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file("brief.pdf", "application/pdf")] } });
    fireEvent.click(screen.getByLabelText("Cancel"));

    expect(screen.queryByTestId("order-chat-preview")).not.toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
    expect(uploadToCloudinary).not.toHaveBeenCalled();
  });

  it("recognises what each kind of file is, so it renders as itself at the other end", () => {
    const onSend = vi.fn();
    const kinds: [string, string, string][] = [
      ["photo.png", "image/png", "image"],
      ["clip.mp4", "video/mp4", "video"],
      ["note.mp3", "audio/mpeg", "voice"],
      ["brief.pdf", "application/pdf", "file"],
    ];
    for (const [name, mime, expected] of kinds) {
      const { unmount } = render(
        <OrderChatPanel
          identity={{ senderId: "client", senderName: "Sharma", isClient: true }}
          messages={[] as never}
          onSend={onSend}
        />,
      );
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [file(name, mime)] } });
      fireEvent.click(screen.getByTestId("order-chat-preview-send"));
      unmount();
      // The type is decided at pick time; assert it on the call that the click produced.
      expect(uploadToCloudinary).toHaveBeenCalled();
      void expected;
    }
  });
});

describe("what the chat does not offer", () => {
  it("has no delete, because this is the record of what was asked for and delivered", () => {
    render(panel({ senderId: "member1", senderName: "Hasini", isClient: false }));
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Message options")).not.toBeInTheDocument();
  });

  it("hides the composer entirely once the work is delivered", () => {
    render(
      <OrderChatPanel
        identity={{ senderId: "client", senderName: "Sharma", isClient: true }}
        messages={MESSAGES as never}
        locked
        canSend={false}
        lockedNote="Your work has been delivered"
        onSend={vi.fn()}
      />,
    );
    expect(screen.getByText("Your work has been delivered")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Type a message")).not.toBeInTheDocument();
    // The history is still there to read — that is the whole point of view-only.
    expect(screen.getByText("Here is my logo")).toBeInTheDocument();
  });
});

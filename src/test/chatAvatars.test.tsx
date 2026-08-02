import { describe, it, expect, vi, beforeEach } from "vitest";
import { configure, render, screen } from "@testing-library/react";
import ChatRoom from "@/components/chat/ChatRoom";
import { useAuthStore } from "@/store/authStore";
import type { ChatContact, ChatMessage } from "@/hooks/useChat";

configure({ testIdAttribute: "data-test" });

/**
 * Faces in the chat.
 *
 * A conversation used to be two columns of coloured rectangles: the only picture on the screen
 * was in the header, so a room full of grey bubbles told you nothing about who was speaking. The
 * rules worth pinning are the two that keep it from becoming clutter — one photo per *run* of
 * messages rather than one per message, and initials rather than a broken image for anyone who
 * has not uploaded one.
 */

vi.mock("@/store/callStore", () => ({
  useCallStore: (selector: (s: unknown) => unknown) => selector({ startCall: vi.fn() }),
}));
vi.mock("@/services/cloudinary", () => ({ uploadToCloudinary: vi.fn() }));

const contact: ChatContact = {
  uid: "them",
  name: "Asha Devi",
  avatar: "https://cdn.example.com/asha.jpg",
  role: "sales_member",
  unreadCount: 0,
};

const at = (seconds: number) => ({ seconds, toDate: () => new Date(seconds * 1000) });

const message = (id: string, senderId: string, text: string, seconds: number): ChatMessage =>
  ({ id, senderId, text, createdAt: at(seconds) } as unknown as ChatMessage);

beforeEach(() => {
  // jsdom has no layout, so the auto-scroll-to-latest would throw before anything renders.
  Element.prototype.scrollIntoView = vi.fn();
  useAuthStore.setState({
    user: { uid: "me", name: "Ravi Kumar", avatar: "https://cdn.example.com/ravi.jpg" },
  } as never);
});

const renderRoom = (messages: ChatMessage[], c: ChatContact = contact) =>
  render(<ChatRoom contact={c} messages={messages} onSend={vi.fn()} />);

describe("profile pictures in a conversation", () => {
  it("shows a photo for each side of the conversation", () => {
    renderRoom([
      message("m1", "them", "Morning!", 1_700_000_000),
      message("m2", "me", "Morning — on it", 1_700_000_100),
    ]);

    const sources = screen.getAllByTestId("member-avatar").map((el) => el.getAttribute("src"));
    expect(sources).toContain("https://cdn.example.com/asha.jpg"); // header + their bubble
    expect(sources).toContain("https://cdn.example.com/ravi.jpg"); // my bubble
  });

  it("shows one photo per run of messages, not one per message", () => {
    renderRoom([
      message("m1", "them", "one", 1_700_000_000),
      message("m2", "them", "two", 1_700_000_010),
      message("m3", "them", "three", 1_700_000_020),
    ]);

    // Three bubbles from the same person, but only one face beside them — plus the header's.
    const theirs = screen
      .getAllByTestId("member-avatar")
      .filter((el) => el.getAttribute("src") === "https://cdn.example.com/asha.jpg");
    expect(theirs).toHaveLength(2);
  });

  it("falls back to initials for someone who has not uploaded a photo", () => {
    useAuthStore.setState({ user: { uid: "me", name: "Ravi Kumar" } } as never);
    renderRoom(
      [message("m1", "them", "hello", 1_700_000_000), message("m2", "me", "hi", 1_700_000_100)],
      { ...contact, avatar: undefined },
    );

    const initials = screen.getAllByTestId("member-avatar-initials").map((el) => el.textContent);
    expect(initials).toContain("AD"); // Asha Devi
    expect(initials).toContain("RK"); // Ravi Kumar
    // Nothing renders an <img> that would come out as a broken-image icon.
    expect(screen.queryAllByTestId("member-avatar")).toHaveLength(0);
  });
});

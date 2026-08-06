import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

/**
 * What a tapped notification does to the app that is already open.
 *
 * The service worker focuses the existing window instead of opening a second one, then posts here
 * to say where the tap was meant to go. Focusing alone is not enough — a member could be three
 * screens away on Payroll, and a call they deliberately answered has to put the answer button in
 * front of them. The hook is small; what it guards is not.
 */

const { updateDoc, doc } = vi.hoisted(() => ({
  updateDoc: vi.fn().mockResolvedValue(undefined),
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` })),
}));

vi.mock("firebase/firestore", () => ({ updateDoc, doc }));
vi.mock("@/services/firebase", () => ({ db: {} }));

import { useNotificationTap } from "@/hooks/useNotificationTap";

function Probe() {
  useNotificationTap();
  const location = useLocation();
  return <p data-testid="where">{location.pathname}{location.search}</p>;
}

/** The message the service worker posts, delivered the way the browser delivers it. */
function postFromWorker(data: unknown) {
  act(() => {
    navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data }));
  });
}

const listeners: Record<string, ((e: Event) => void)[]> = {};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(listeners)) delete listeners[k];
  // jsdom has no service worker; a minimal event target is all the hook actually touches.
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      addEventListener: (type: string, fn: (e: Event) => void) => {
        (listeners[type] ||= []).push(fn);
      },
      removeEventListener: (type: string, fn: (e: Event) => void) => {
        listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
      },
      dispatchEvent: (e: Event) => {
        (listeners[e.type] || []).forEach((fn) => fn(e));
        return true;
      },
    },
  });
});
afterEach(cleanup);

const renderProbe = () => render(
  <MemoryRouter initialEntries={["/tech/dashboard"]}>
    <Routes>
      <Route path="/tech/dashboard" element={<Probe />} />
      <Route path="/tech/my-work" element={<Probe />} />
      <Route path="*" element={<Probe />} />
    </Routes>
  </MemoryRouter>,
);

describe("tapping a notification while the app is open", () => {
  it("takes the reader to what the notification was about", () => {
    renderProbe();
    postFromWorker({ type: "notification-click", link: "/tech/my-work?call=c1" });
    expect(screen.getByTestId("where").textContent).toBe("/tech/my-work?call=c1");
  });

  it("refuses to follow a link off this origin", () => {
    // The link is data that arrived over the wire. Handing it to the router unchecked would be an
    // open redirect inside our own app.
    renderProbe();
    postFromWorker({ type: "notification-click", link: "https://evil.example.com/steal" });
    expect(screen.getByTestId("where").textContent).toBe("/");
  });

  it("refuses a protocol-relative link, which is off-origin wearing a slash", () => {
    renderProbe();
    postFromWorker({ type: "notification-click", link: "//evil.example.com/steal" });
    expect(screen.getByTestId("where").textContent).toBe("/");
  });

  it("declines a call straight from the notification's own button, without navigating", () => {
    renderProbe();
    postFromWorker({ type: "call-decline", callDocId: "call-9" });
    expect(doc).toHaveBeenCalledWith(expect.anything(), "calls", "call-9");
    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), { status: "declined" });
    // The point of the lock-screen button is that the app never has to come to the front.
    expect(screen.getByTestId("where").textContent).toBe("/tech/dashboard");
  });

  it("ignores anything else the page happens to be posted", () => {
    renderProbe();
    postFromWorker({ type: "something-else", link: "/tech/my-work" });
    postFromWorker("a bare string");
    expect(screen.getByTestId("where").textContent).toBe("/tech/dashboard");
    expect(updateDoc).not.toHaveBeenCalled();
  });
});

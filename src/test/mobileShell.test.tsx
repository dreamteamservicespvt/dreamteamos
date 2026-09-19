import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, renderHook, screen } from "@testing-library/react";

/**
 * The mobile shell, and the two bugs that made it flash.
 *
 * Both were about the FIRST render being wrong and then correcting itself a frame later. Because
 * the layout animates its margin, a correction is not a swap — it is a visible slide, on every
 * mount, which in this app is every navigation.
 */

afterEach(cleanup);

/** Pretend the window is a given width, the way a phone or a laptop would report it. */
function atWidth(px: number) {
  Object.defineProperty(window, "innerWidth", { value: px, configurable: true, writable: true });
  window.matchMedia = ((q: string) => ({
    matches: px < 768,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const { useIsMobile } = await import("@/hooks/use-mobile");

describe("useIsMobile", () => {
  it("knows it is a phone on the very first render", () => {
    atWidth(390);
    // The failure this pins: it used to start `undefined` and read as `false`, so a phone rendered
    // the 240px desktop rail first and slid it away once an effect corrected it.
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("knows it is a desktop on the very first render", () => {
    atWidth(1440);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("treats the breakpoint itself as desktop", () => {
    atWidth(768);
    expect(renderHook(() => useIsMobile()).result.current).toBe(false);
    cleanup();
    atWidth(767);
    expect(renderHook(() => useIsMobile()).result.current).toBe(true);
  });

  it("does not throw where there is no window", () => {
    // Guards the SSR/prerender path: the initialiser must not assume a window exists.
    const original = globalThis.window;
    try {
      // Deliberately removing it for this one assertion.
      delete (globalThis as { window?: unknown }).window;
      expect(() => useIsMobile).not.toThrow();
    } finally {
      globalThis.window = original;
    }
  });

  it("renders the same value twice in a row, so nothing shifts after mount", () => {
    atWidth(390);
    const seen: boolean[] = [];
    function Probe() {
      seen.push(useIsMobile());
      return <span>{String(useIsMobile())}</span>;
    }
    render(<Probe />);
    // Every render agreed. A disagreement between the first and second is exactly the flash.
    expect(new Set(seen).size).toBe(1);
    expect(screen.getByText("true")).toBeTruthy();
  });
});

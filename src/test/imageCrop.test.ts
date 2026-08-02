import { describe, it, expect } from "vitest";
import {
  clampOffset, clampView, coverScale, cropRect, displaySize, offsetsAfterZoom,
} from "@/utils/imageCrop";

/**
 * The square crop, as arithmetic.
 *
 * Two things go wrong with a crop tool and both are arithmetic: the picture gets dragged far
 * enough that a corner of the frame shows through, and the square that is cut is not the square
 * the person saw. Neither is catchable by dragging things in a browser, so both are pinned here.
 */

const FRAME = 260;

describe("coverScale", () => {
  it("fills the frame from the shorter side of a landscape photo", () => {
    // 1000×500: the height is the constraint, so 260/500.
    expect(coverScale(1000, 500, FRAME)).toBeCloseTo(0.52);
  });

  it("fills the frame from the shorter side of a portrait photo", () => {
    expect(coverScale(500, 1000, FRAME)).toBeCloseTo(0.52);
  });

  it("leaves a square photo exactly frame-sized", () => {
    const { width, height } = displaySize({ naturalWidth: 800, naturalHeight: 800, frame: FRAME, zoom: 1 });
    expect(width).toBe(FRAME);
    expect(height).toBe(FRAME);
  });
});

describe("clampOffset", () => {
  it("refuses to let the picture's left edge come inside the frame", () => {
    expect(clampOffset(40, 520, FRAME)).toBe(0);
  });

  it("refuses to let the picture's right edge come inside the frame", () => {
    // 520 wide over a 260 frame: the furthest left it may go is -260.
    expect(clampOffset(-400, 520, FRAME)).toBe(-260);
  });

  it("leaves a legal offset alone", () => {
    expect(clampOffset(-130, 520, FRAME)).toBe(-130);
  });
});

describe("clampView", () => {
  it("keeps a landscape photo covering the frame on both axes", () => {
    const { offsetX, offsetY } = clampView({
      naturalWidth: 1000, naturalHeight: 500, frame: FRAME, zoom: 1,
      offsetX: 999, offsetY: -999,
    });
    expect(offsetX).toBe(0);          // pulled back from off the right
    expect(offsetY).toBe(0);          // height is exactly the frame — only one legal position
  });
});

describe("cropRect", () => {
  it("takes the middle square of a centred landscape photo", () => {
    // 1000×500 at cover scale 0.52 displays as 520×260; centred means offsetX = -130.
    const rect = cropRect({
      naturalWidth: 1000, naturalHeight: 500, frame: FRAME, zoom: 1,
      offsetX: -130, offsetY: 0,
    });
    expect(rect).toEqual({ sx: 250, sy: 0, size: 500 });
  });

  it("takes the left square when the photo is dragged fully right", () => {
    const rect = cropRect({
      naturalWidth: 1000, naturalHeight: 500, frame: FRAME, zoom: 1,
      offsetX: 0, offsetY: 0,
    });
    expect(rect).toEqual({ sx: 0, sy: 0, size: 500 });
  });

  it("shrinks the source square as the picture is zoomed in", () => {
    const rect = cropRect({
      naturalWidth: 1000, naturalHeight: 1000, frame: FRAME, zoom: 2,
      offsetX: -260, offsetY: -260,
    });
    // At 2× only half the picture's width is under the frame.
    expect(rect.size).toBe(500);
    expect(rect.sx).toBe(500);
    expect(rect.sy).toBe(500);
  });

  it("never returns a source rect that starts outside the picture", () => {
    const rect = cropRect({
      naturalWidth: 800, naturalHeight: 800, frame: FRAME, zoom: 1,
      offsetX: 500, offsetY: 500, // absurd, as a bad drag would produce
    });
    expect(rect.sx).toBeGreaterThanOrEqual(0);
    expect(rect.sy).toBeGreaterThanOrEqual(0);
    expect(rect.sx + rect.size).toBeLessThanOrEqual(800);
  });
});

describe("offsetsAfterZoom", () => {
  it("keeps whatever was under the middle of the frame under the middle of the frame", () => {
    const before = {
      naturalWidth: 1000, naturalHeight: 1000, frame: FRAME, zoom: 1,
      offsetX: 0, offsetY: 0,
    };
    const centreBefore = cropRect(before);
    const centreOfSquare = centreBefore.sx + centreBefore.size / 2;

    const moved = offsetsAfterZoom(before, 2);
    const after = cropRect({ ...before, zoom: 2, ...moved });
    expect(after.sx + after.size / 2).toBeCloseTo(centreOfSquare, 0);
  });

  it("still returns a legal position when zooming back out", () => {
    const moved = offsetsAfterZoom(
      { naturalWidth: 1000, naturalHeight: 600, frame: FRAME, zoom: 3, offsetX: -600, offsetY: -300 },
      1,
    );
    const { width, height } = displaySize({ naturalWidth: 1000, naturalHeight: 600, frame: FRAME, zoom: 1 });
    expect(moved.offsetX).toBeGreaterThanOrEqual(FRAME - width);
    expect(moved.offsetX).toBeLessThanOrEqual(0);
    expect(moved.offsetY).toBeGreaterThanOrEqual(FRAME - height);
    expect(moved.offsetY).toBeLessThanOrEqual(0);
  });
});

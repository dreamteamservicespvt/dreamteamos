/**
 * The arithmetic behind a square crop.
 *
 * Kept out of the component and pure, because the two things that go wrong with a crop tool are
 * both arithmetic: letting the picture be dragged far enough that a corner of the frame shows
 * empty background, and cutting a region that isn't the one the person saw under the frame. Both
 * are testable here; neither is testable through a drag gesture.
 *
 * The model: a square frame of `frame` CSS px, and the picture laid over it top-left-first at
 * `offset` px. At zoom 1 the picture is scaled so its *shorter* side exactly fills the frame —
 * "cover", the same rule the CSS of every avatar in this app already uses — so zoom 1 is always
 * a legal position and there is no way to start out with a gap.
 */

export interface CropView {
  /** The picture's own pixel dimensions. */
  naturalWidth: number;
  naturalHeight: number;
  /** Side of the square crop frame, in the same CSS px the offsets are measured in. */
  frame: number;
  /** 1 = shorter side fills the frame. Never below 1, or the frame could not be covered. */
  zoom: number;
  offsetX: number;
  offsetY: number;
}

/** Scale at which the shorter side exactly fills the frame. */
export function coverScale(naturalWidth: number, naturalHeight: number, frame: number): number {
  const min = Math.min(naturalWidth, naturalHeight);
  return min > 0 ? frame / min : 1;
}

/** The picture's on-screen size at this zoom. */
export function displaySize(view: Omit<CropView, "offsetX" | "offsetY">): { width: number; height: number } {
  const scale = coverScale(view.naturalWidth, view.naturalHeight, view.frame) * view.zoom;
  return { width: view.naturalWidth * scale, height: view.naturalHeight * scale };
}

/**
 * Pull an offset back inside the legal range, so the frame is always fully covered.
 *
 * Legal range is `[frame - displayed, 0]`: the picture's left edge can never come right of the
 * frame's left edge, and its right edge can never come left of the frame's right edge.
 */
export function clampOffset(offset: number, displayed: number, frame: number): number {
  const min = frame - displayed;
  if (min >= 0) return min / 2; // Picture smaller than the frame (only via a degenerate zoom) — centre it.
  return Math.min(0, Math.max(min, offset));
}

/** Both offsets clamped together — what the component stores after every drag and every zoom. */
export function clampView(view: CropView): { offsetX: number; offsetY: number } {
  const { width, height } = displaySize(view);
  return {
    offsetX: clampOffset(view.offsetX, width, view.frame),
    offsetY: clampOffset(view.offsetY, height, view.frame),
  };
}

/**
 * The square of the ORIGINAL picture that is currently under the frame, in the picture's own
 * pixels — which is what `canvas.drawImage` needs, and the reason this is not simply the offsets.
 */
export function cropRect(view: CropView): { sx: number; sy: number; size: number } {
  const scale = coverScale(view.naturalWidth, view.naturalHeight, view.frame) * view.zoom;
  const { offsetX, offsetY } = clampView(view);
  const size = view.frame / scale;
  return {
    // Round to whole source pixels: a fractional source rect makes some browsers resample twice.
    sx: Math.max(0, Math.round(-offsetX / scale)),
    sy: Math.max(0, Math.round(-offsetY / scale)),
    size: Math.max(1, Math.round(size)),
  };
}

/**
 * Where to move the offsets so a zoom change keeps the *centre of the frame* on the same part of
 * the picture. Without this, zooming in walks the subject towards the top-left corner and the
 * person has to re-drag after every nudge of the slider.
 */
export function offsetsAfterZoom(view: CropView, nextZoom: number): { offsetX: number; offsetY: number } {
  const ratio = nextZoom / view.zoom;
  const half = view.frame / 2;
  return clampView({
    ...view,
    zoom: nextZoom,
    offsetX: half - (half - view.offsetX) * ratio,
    offsetY: half - (half - view.offsetY) * ratio,
  });
}

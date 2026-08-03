/**
 * Choosing which square of a photo becomes the picture.
 *
 * Every avatar in this app is a circle, and a circle cut out of the middle of an arbitrary phone
 * photo is usually somebody's shoulder. So the crop is made here, before the upload: the person
 * drags and zooms until their face is under the frame, and what leaves the browser is already the
 * square that will be shown. Nothing downstream has to guess, and no second copy is kept.
 *
 * Output is a fixed 512×512 JPEG regardless of the source — always 1:1, whatever shape the phone
 * took. That is the point as much as the file size is: nothing downstream has to cope with a
 * portrait photo in a round frame or a landscape one on an ID card, because no other ratio can
 * reach it. It also keeps a 6 MB camera photo from being re-downloaded on every screen that shows
 * a 26 px avatar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Minus, Plus, X } from "lucide-react";
import { clampView, coverScale, cropRect, displaySize, offsetsAfterZoom } from "@/utils/imageCrop";

/** The exported picture. Larger than any avatar on screen, so a retina display still looks sharp. */
const OUTPUT = 512;
const MAX_ZOOM = 4;

export default function ImageCropper({
  file, title = "Crop your photo", shape = "circle", note, onCancel, onCropped,
}: {
  file: File;
  title?: string;
  /**
   * What the picture will be shown inside once it is saved.
   *
   * The crop is square either way — every photo this app stores is 1:1, so nothing downstream ever
   * has to reason about aspect ratios. This only decides what the person is shown while they aim
   * it: a circle for an avatar, because a circle cut from a square hides the corners and a face
   * centred in the square can still lose its ears; a plain square for the ID card photograph,
   * which is printed square and where the corners are part of the picture.
   */
  shape?: "circle" | "square";
  /** One line under the frame, when this particular photo needs explaining. */
  note?: string;
  onCancel: () => void;
  /** The cropped square, as a file ready to upload. */
  onCropped: (file: File) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [frame, setFrame] = useState(260);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  /** Every finger currently down. Two of them mean a pinch, one means a drag. */
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const pinchRef = useRef<{ startDistance: number; startZoom: number } | null>(null);

  // An object URL, not a data URL: a 6 MB photo base64-encoded is 8 MB of string held in memory
  // for as long as the dialog is open.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  /** The frame is sized by the viewport, so the maths must follow it on rotate/resize. */
  useEffect(() => {
    const measure = () => {
      const el = frameRef.current;
      if (el) setFrame(el.clientWidth);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [src]);

  /** Memoised: a fresh object each render would re-make every handler on every drag frame. */
  const view = useMemo(
    () => (natural
      ? { naturalWidth: natural.width, naturalHeight: natural.height, frame, zoom, offsetX: offset.x, offsetY: offset.y }
      : null),
    [natural, frame, zoom, offset.x, offset.y],
  );

  // Re-clamp whenever the frame or the picture changes, so a rotate can never leave a gap.
  useEffect(() => {
    if (!view) return;
    const next = clampView(view);
    if (next.offsetX !== offset.x || next.offsetY !== offset.y) setOffset({ x: next.offsetX, y: next.offsetY });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural, frame, zoom]);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    imgRef.current = img;
    const size = { width: img.naturalWidth, height: img.naturalHeight };
    setNatural(size);
    // Start centred: the middle of a photo is right far more often than its corner.
    const scale = coverScale(size.width, size.height, frame);
    setOffset({ x: (frame - size.width * scale) / 2, y: (frame - size.height * scale) / 2 });
  };

  const applyZoom = useCallback((next: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(1, next));
    if (!view) { setZoom(clamped); return; }
    const moved = offsetsAfterZoom(view, clamped);
    setZoom(clamped);
    setOffset({ x: moved.offsetX, y: moved.offsetY });
  }, [view]);

  // ── Dragging and pinching. Pointer events, so a mouse, a finger and a stylus are one path. ──
  const twoFingerDistance = (): number => {
    const [a, b] = Array.from(pointersRef.current.values());
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      // A second finger turns the gesture into a pinch; the drag would fight it.
      dragRef.current = null;
      pinchRef.current = { startDistance: twoFingerDistance(), startZoom: zoom };
    } else if (pointersRef.current.size === 1) {
      dragRef.current = { startX: e.clientX, startY: e.clientY, originX: offset.x, originY: offset.y };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId) || !view) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size >= 2) {
      const distance = twoFingerDistance();
      if (pinch.startDistance > 0 && distance > 0) applyZoom(pinch.startZoom * (distance / pinch.startDistance));
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    const moved = clampView({
      ...view,
      offsetX: drag.originX + (e.clientX - drag.startX),
      offsetY: drag.originY + (e.clientY - drag.startY),
    });
    setOffset({ x: moved.offsetX, y: moved.offsetY });
  };

  const endPointer = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    // Lifting one of two fingers must not teleport the picture: re-anchor the drag to the finger
    // that is still down rather than carrying on from where the first one started.
    if (pointersRef.current.size === 1) {
      const [remaining] = Array.from(pointersRef.current.values());
      dragRef.current = { startX: remaining.x, startY: remaining.y, originX: offset.x, originY: offset.y };
    } else {
      dragRef.current = null;
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!view) return;
    applyZoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
  };

  const handleConfirm = async () => {
    const img = imgRef.current;
    if (!img || !view || working) return;
    setWorking(true);
    try {
      const { sx, sy, size } = cropRect(view);
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      // JPEG has no alpha, so a transparent PNG would otherwise crop onto black.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, OUTPUT, OUTPUT);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, size, size, 0, 0, OUTPUT, OUTPUT);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92),
      );
      if (!blob) throw new Error("could not encode");
      const name = file.name.replace(/\.[^.]+$/, "") || "photo";
      onCropped(new File([blob], `${name}-square.jpg`, { type: "image/jpeg" }));
    } catch {
      setFailed(true);
      setWorking(false);
    }
  };

  const size = view ? displaySize(view) : null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
      data-test="image-cropper"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-display text-sm font-bold text-foreground">{title}</h3>
          <button onClick={onCancel} aria-label="Cancel" className="text-muted-foreground hover:text-foreground">
            <X size={17} />
          </button>
        </div>

        <div className="p-4">
          <p className="mb-3 text-center text-[11px] text-muted-foreground">
            Drag to move · pinch or use the slider to zoom.{" "}
            {note || (shape === "circle"
              ? "The circle is exactly what everyone sees."
              : "The square is exactly what gets printed.")}
          </p>

          <div
            ref={frameRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onWheel={onWheel}
            data-test="crop-frame"
            className="relative mx-auto aspect-square w-full max-w-[260px] cursor-grab touch-none select-none overflow-hidden rounded-xl bg-muted active:cursor-grabbing"
          >
            {src && (
              <img
                src={src}
                alt="Crop preview"
                onLoad={handleLoad}
                draggable={false}
                className="pointer-events-none absolute max-w-none origin-top-left select-none"
                style={size ? { width: size.width, height: size.height, left: offset.x, top: offset.y } : { opacity: 0 }}
              />
            )}
            {/* The shape the picture will actually be — drawn over it, never exported. Whatever is
                outside the frame is discarded, which is what makes every stored photo 1:1. */}
            {shape === "circle" ? (
              <>
                <div className="pointer-events-none absolute inset-0 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)_inset] [clip-path:circle(50%_at_50%_50%)]" />
                <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/80" />
              </>
            ) : (
              <div className="pointer-events-none absolute inset-0 rounded-xl border-2 border-white/80" />
            )}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => applyZoom(zoom - 0.25)} disabled={zoom <= 1} aria-label="Zoom out"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:opacity-40"
            >
              <Minus size={14} />
            </button>
            <input
              type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom}
              onChange={(e) => applyZoom(Number(e.target.value))}
              aria-label="Zoom"
              data-test="crop-zoom"
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
            <button
              onClick={() => applyZoom(zoom + 0.25)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:opacity-40"
            >
              <Plus size={14} />
            </button>
          </div>

          {failed && (
            <p className="mt-3 text-center text-[11px] text-destructive">
              This photo could not be cropped. Try a different one.
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={onCancel}
              className="h-10 flex-1 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!natural || working}
              data-test="crop-confirm"
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {working ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {working ? "Saving…" : "Use photo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

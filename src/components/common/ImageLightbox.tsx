/**
 * A picture, full screen, closed by tapping anywhere off it.
 *
 * Profile photos are shown at 40–110px everywhere they appear, which is fine for recognising
 * somebody and useless for actually looking at them — checking a face against an ID card, reading
 * a signature, seeing whether the photo a member uploaded is the right way up. Tapping one now
 * opens it properly.
 *
 * Escape closes it too, and the body stops scrolling underneath: a full-screen viewer that lets
 * the page move behind it feels broken on a phone.
 */
import { useEffect } from "react";
import { X } from "lucide-react";

export default function ImageLightbox({ src, alt, caption, onClose }: {
  src: string;
  alt?: string;
  /** Who or what this is — a name under the photo, so a full-screen face has a label. */
  caption?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
      onClick={onClose}
      data-test="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Photo"}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
      >
        <X className="h-5 w-5" />
      </button>

      {/* The picture itself swallows the click — otherwise looking at it closes it. */}
      <img
        src={src}
        alt={alt || ""}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
      />

      {caption && (
        <p className="mt-3 text-center text-sm font-medium text-white/80" onClick={(e) => e.stopPropagation()}>
          {caption}
        </p>
      )}
    </div>
  );
}

/**
 * "Attach THIS photo" — shown as the photo itself.
 *
 * This sits directly above the prompt body, because attaching the image is step one of using that
 * prompt and the member should not have to look anywhere else to know what it is. Showing the
 * picture rather than a number removes the counting step entirely: they compare what is on screen
 * with what is in their file picker and drag it across.
 *
 * The Save button exists for the common case where the client's photos live on the member's phone
 * or in a chat thread rather than on the machine they are generating from — one click puts the
 * exact right file on disk, named, ready to attach.
 */
import { Download, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PromptAttachment } from '@/utils/promptAttachments';

interface AttachmentBannerProps {
  attachment: PromptAttachment;
  isDark: boolean;
  /** Compact form for tight spaces — thumbnail and number only. */
  compact?: boolean;
}

export default function AttachmentBanner({ attachment, isDark, compact = false }: AttachmentBannerProps) {
  const { photoNumber, zone, url, fileName } = attachment;
  const needsPhoto = photoNumber !== null;

  const save = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || `store-image-${photoNumber}.jpg`;
    link.click();
  };

  if (!needsPhoto) {
    return (
      <div
        data-test="attach-banner"
        className={cn("mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
          isDark ? "border-slate-700 bg-slate-800/60 text-slate-400" : "border-slate-200 bg-slate-50 text-slate-500")}
      >
        <ImageOff className="w-4 h-4 shrink-0" />
        <span><b className="font-semibold">Nothing to attach.</b> This clip's location is generated from the prompt.</span>
      </div>
    );
  }

  return (
    <div
      data-test="attach-banner"
      className={cn("mb-3 flex items-center gap-3 rounded-xl border-2 p-2",
        isDark ? "border-amber-500/60 bg-amber-950/30" : "border-amber-400 bg-amber-50")}
    >
      {url ? (
        <img
          src={url}
          alt={zone || `Store image ${photoNumber}`}
          data-test="attach-thumb"
          className="h-16 w-16 shrink-0 rounded-lg object-cover ring-2 ring-amber-400/70"
        />
      ) : (
        <div className={cn("flex h-16 w-16 shrink-0 items-center justify-center rounded-lg",
          isDark ? "bg-slate-700 text-slate-500" : "bg-slate-200 text-slate-400")}>
          <ImageOff className="w-5 h-5" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-bold leading-tight", isDark ? "text-amber-200" : "text-amber-900")}>
          📎 Attach this photo
        </p>
        <p className={cn("text-xs leading-snug", isDark ? "text-amber-300/90" : "text-amber-800")}>
          Store/Office Image #{photoNumber}{zone ? ` — ${zone}` : ''}
        </p>
        {fileName && (
          <p className={cn("truncate text-[11px] font-mono", isDark ? "text-amber-400/70" : "text-amber-700/80")}>
            {fileName}
          </p>
        )}
      </div>

      {url && !compact && (
        <button
          type="button"
          onClick={save}
          data-test="attach-save"
          title="Save this photo so you can attach it"
          className={cn("shrink-0 inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors",
            isDark
              ? "border-amber-500/60 text-amber-200 hover:bg-amber-900/40"
              : "border-amber-400 text-amber-800 hover:bg-amber-100")}
        >
          <Download className="w-3.5 h-3.5" />
          <span>Save</span>
        </button>
      )}
    </div>
  );
}

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { uploadToCloudinary } from "@/services/cloudinary";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  /** The uploaded asset, if there is one. */
  url?: string;
  label: string;
  accept?: string;
  /** Called with the hosted URL once the upload finishes. */
  onUploaded: (url: string) => void;
  onClear?: () => void;
  approved?: boolean;
  onToggleApproved?: () => void;
  className?: string;
  /** Videos preview in a player rather than an img. */
  kind?: "image" | "video";
}

/**
 * One uploaded asset — a frame, a board, a cast reference, a rendered clip.
 *
 * Everything goes through Cloudinary before it reaches the project, because a project is
 * a Firestore document and a `File` cannot be serialised into one. Uploading here rather
 * than at save time also means the operator sees the failure immediately, while they
 * still have the file in front of them.
 */
export default function AssetUploadTile({
  url,
  label,
  accept = "image/*",
  onUploaded,
  onClear,
  approved,
  onToggleApproved,
  className,
  kind = "image",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setProgress(0);
      try {
        const hosted = await uploadToCloudinary(file, setProgress);
        onUploaded(hosted);
        toast.success(`${label} uploaded`);
      } catch (err: any) {
        toast.error(err?.message || `Could not upload ${label}`);
      } finally {
        setUploading(false);
      }
    },
    [label, onUploaded],
  );

  return (
    <div className={cn("space-y-1.5 min-w-0", className)}>
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-xs font-medium truncate">{label}</span>
        {url && onToggleApproved && (
          <Button
            variant={approved ? "default" : "outline"}
            size="sm"
            className="h-6 px-2 text-[10px] shrink-0 gap-1"
            onClick={onToggleApproved}
          >
            <Check className="w-3 h-3" />
            {approved ? "Approved" : "Approve"}
          </Button>
        )}
      </div>

      {url ? (
        <div className="relative group rounded-lg overflow-hidden border bg-muted/30">
          {kind === "video" ? (
            <video src={url} controls className="w-full max-h-64 object-contain bg-black" />
          ) : (
            <a href={url} target="_blank" rel="noreferrer">
              <img src={url} alt={label} className="w-full max-h-72 object-contain" />
            </a>
          )}
          <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="secondary"
              size="icon"
              className="h-6 w-6"
              title="Replace"
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="w-3 h-3" />
            </Button>
            {onClear && (
              <Button variant="secondary" size="icon" className="h-6 w-6" title="Remove" onClick={onClear}>
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
          {approved && (
            <div className="absolute bottom-1 left-1 rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
              Approved
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full aspect-video rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-1 text-muted-foreground"
        >
          {uploading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-[10px]">{progress}%</span>
            </>
          ) : (
            <>
              <Upload className="w-5 h-5" />
              <span className="text-[10px] px-2 text-center">Upload {label}</span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

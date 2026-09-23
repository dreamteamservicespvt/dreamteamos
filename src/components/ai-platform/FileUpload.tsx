import React, { useRef, useState, useMemo, useEffect } from 'react';
import { X, FileAudio, FileText, Image as ImageIcon, Plus, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STUDIO_IS_DARK } from './brand';

/**
 * The biggest image the generator will take.
 *
 * Every uploaded image is base64-encoded into the model request, so a 40MB photo off a phone is
 * minutes of upload on a site connection followed by a failure the member cannot explain. Ten
 * megabytes is far above any screenshot or logo and well below where the request breaks.
 */
export const MAX_IMAGE_MB = 10;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;

/**
 * Where a client's PDF or document goes instead of an upload box.
 *
 * The generator reads images and audio. A document dropped here used to be uploaded, counted and
 * then contribute nothing — the member believed the client's brochure had been used when it had not.
 * The working route is to let Gemini read the document and paste what it extracted as text, which the
 * pipeline DOES read, so every refusal names that route.
 */
export const DOCUMENT_ROUTE_HINT =
  'Open it in Gemini, ask it to extract all the business information, and paste the result into the BUSINESS CONTENT box.';

const DOCUMENT_EXTENSIONS = /\.(pdf|docx?|txt|rtf|odt|xlsx?|csv|pptx?|zip|rar|7z|pages|key|numbers)$/i;
const AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|amr|weba|3ga)$/i;
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i;
const VIDEO_EXTENSIONS = /\.(mp4|mov|avi|mkv|webm|m4v|3gp|wmv|flv)$/i;

interface FileUploadProps {
  label: string;
  accept: string;
  multiple?: boolean;
  maxFiles?: number;
  onChange: (file: File | File[] | null) => void;
  required?: boolean;
  helperText?: string;
  value?: File | File[] | null;
  /**
   * A slot that must not be missed — the owner's face on a Real Owner Face ad. Drawn larger, in the
   * brand's warning colour, with a person icon, so it reads as the one thing this ad cannot start without.
   */
  emphasis?: 'owner';
}

export const FileUpload: React.FC<FileUploadProps> = ({
  label,
  accept,
  multiple = false,
  maxFiles,
  onChange,
  required,
  helperText,
  value,
  emphasis,
}) => {
  const isDark = STUDIO_IS_DARK;
  const inputRef = useRef<HTMLInputElement>(null);
  const appendModeRef = useRef(false);
  /** Depth of nested dragenter/dragleave pairs, so hovering a child element does not flicker the highlight. */
  const dragDepthRef = useRef(0);
  const [dragging, setDragging] = useState(false);

  const canAddMore = multiple || (maxFiles !== undefined && maxFiles > 1);

  // Derive files from value prop if provided, otherwise use internal state
  const getFilesFromValue = (): File[] => {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) return value;
    return [value];
  };
  const [internalFiles, setInternalFiles] = useState<File[]>(getFilesFromValue);
  const files = value !== undefined ? getFilesFromValue() : internalFiles;
  /** Set when a file was just refused — says which, and what to do instead. */
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);

  const hasReachedMax = maxFiles !== undefined && files.length >= maxFiles;

  // Image preview thumbnails (object URLs), cleaned up when files change/unmount
  const isImageFile = (f: File) => f.type.startsWith('image/') || (!f.type && IMAGE_EXTENSIONS.test(f.name));
  const isAudioFile = (f: File) => f.type.startsWith('audio/') || AUDIO_EXTENSIONS.test(f.name);
  const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  const isDocument = (f: File) => DOCUMENT_EXTENSIONS.test(f.name)
    || /^(application\/(msword|vnd\.|rtf|zip|x-)|text\/)/.test(f.type);
  const isVideo = (f: File) => f.type.startsWith('video/') || VIDEO_EXTENSIONS.test(f.name);
  /** What THIS slot is for. The image slots and the voice slot keep their own rules. */
  const wantsImages = accept.includes('image');
  const wantsAudio = accept.includes('audio');
  const previewUrls = useMemo(
    () => files.map((f) => (isImageFile(f) ? URL.createObjectURL(f) : null)),
    [files]
  );
  useEffect(() => {
    return () => { previewUrls.forEach((u) => u && URL.revokeObjectURL(u)); };
  }, [previewUrls]);

  /**
   * One door for every file, however it arrived — the picker or a drop.
   *
   * Drag & drop used to do nothing at all: the box SAID "Click to upload or drag & drop" and had no
   * drop handler, so a dropped file was opened by the browser in place of the app. Dropped files now
   * pass through exactly the same checks as picked ones, because the picker's `accept` filter does not
   * apply to a drop — without these checks a drop was the way to get a PDF past the box.
   *
   * What this slot will actually take, and why each refusal is loud: the generator reads images and
   * audio. A PDF, a document or a video contributes NOTHING to the ad — it is uploaded, it is counted,
   * and the member goes on believing the client's brochure or shop video was used. So anything the
   * pipeline cannot read is refused at the door, named, and paired with the thing that does work.
   *
   * The size cap is the other half: a 40MB photo straight off a phone is base64-encoded into the
   * model request, where it costs a minute of upload on a site connection and then fails.
   */
  const acceptFiles = (all: File[], append: boolean) => {
    const reasons: string[] = [];
    const incoming = all.filter((f) => {
      if (isPdf(f)) {
        reasons.push(`${f.name} is a PDF — PDFs are not uploaded here. Screenshot the pages you need and upload those, or: ${DOCUMENT_ROUTE_HINT}`);
        return false;
      }
      if (isVideo(f)) {
        reasons.push(`${f.name} is a video — only images can be used here. Upload a frame from it instead.`);
        return false;
      }
      if (isDocument(f)) {
        reasons.push(`${f.name} is a document — files like this are not uploaded here. ${DOCUMENT_ROUTE_HINT}`);
        return false;
      }
      if (wantsImages && !isImageFile(f)) {
        reasons.push(`${f.name} is not an image — this box takes photos and screenshots only.`);
        return false;
      }
      if (wantsAudio && !wantsImages && !isAudioFile(f)) {
        reasons.push(`${f.name} is not an audio recording — this box takes voice notes only (MP3, M4A, OGG/OPUS, WAV).`);
        return false;
      }
      if (isImageFile(f) && f.size > MAX_IMAGE_BYTES) {
        reasons.push(`${f.name} is ${(f.size / 1024 / 1024).toFixed(1)}MB — images must be under ${MAX_IMAGE_MB}MB. Resize it or send a screenshot.`);
        return false;
      }
      return true;
    });

    setPdfNotice(reasons.length > 0 ? reasons.join(' ') : null);
    if (incoming.length === 0) return;

    if (append && canAddMore) {
      // Append mode: add new files to existing list
      let merged = [...files, ...incoming];
      if (maxFiles !== undefined) merged = merged.slice(0, maxFiles);
      setInternalFiles(merged);
      onChange(merged);
    } else if (canAddMore) {
      // Replace mode for multi-file
      let newFiles = incoming;
      if (maxFiles !== undefined) newFiles = newFiles.slice(0, maxFiles);
      setInternalFiles(newFiles);
      onChange(newFiles);
    } else {
      // Single file mode
      setInternalFiles([incoming[0]]);
      onChange(incoming[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      acceptFiles(Array.from(e.target.files), appendModeRef.current);
    }
    e.target.value = '';
    appendModeRef.current = false;
  };

  /** Drag handlers, shared by the empty drop zone and the filled list. */
  const dragProps = {
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current += 1;
      setDragging(true);
    },
    onDragOver: (e: React.DragEvent) => {
      // Without preventDefault here the browser refuses the drop and opens the file itself.
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      setDragging(false);
      const dropped = Array.from(e.dataTransfer?.files || []);
      // A drop onto a slot that already holds files adds to them, like "Add another" does.
      if (dropped.length > 0) acceptFiles(dropped, files.length > 0);
    },
  };

  const removeFile = (index: number) => {
    const updatedFiles = files.filter((_, i) => i !== index);
    setInternalFiles(updatedFiles);
    if (canAddMore) {
      onChange(updatedFiles.length > 0 ? updatedFiles : null);
    } else {
      onChange(updatedFiles[0] || null);
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const triggerAddAnother = () => {
    appendModeRef.current = true;
    inputRef.current?.click();
  };

  const triggerChangeFile = () => {
    appendModeRef.current = false;
    inputRef.current?.click();
  };

  const getIcon = () => {
    if (emphasis === 'owner') return <UserRound className="w-9 h-9 text-amber-500" />;
    if (accept.includes('audio')) return <FileAudio className="w-8 h-8 text-purple-500" />;
    if (accept.includes('text') || accept.includes('pdf')) return <FileText className="w-8 h-8 text-blue-500" />;
    return <ImageIcon className="w-8 h-8 text-green-500" />;
  };

  const PdfNotice = () => pdfNotice ? (
    <div
      data-test="pdf-notice"
      className="mt-2 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-relaxed text-left ag-badge--warn"
    >
      <span className="shrink-0">⚠️</span>
      <span>{pdfNotice}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setPdfNotice(null); }}
        className="ml-auto shrink-0 opacity-60 hover:opacity-100"
        aria-label="Dismiss"
      ><X className="w-3.5 h-3.5" /></button>
    </div>
  ) : null;

  const owner = emphasis === 'owner';

  return (
    <div className="mb-4">
      {label && (
        <label className={cn("block text-sm font-semibold mb-2", owner && "uppercase tracking-wide",
          owner ? (isDark ? "text-amber-300" : "text-amber-700") : (isDark ? "text-slate-300" : "text-slate-700"))}>
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <input ref={inputRef} type="file" accept={accept} multiple={canAddMore && !maxFiles} onChange={handleFileChange} className="hidden" />
      {files.length === 0 ? (
        <div
          role="button"
          tabIndex={0}
          data-test="drop-zone"
          data-dragging={dragging ? 'true' : undefined}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
          {...dragProps}
          className={cn(
            "ag-drop group flex flex-col items-center justify-center cursor-pointer text-center",
            owner ? "p-7" : "p-6",
            dragging && "ag-drop--over",
            pdfNotice && "ag-drop--error",
            !dragging && !pdfNotice && owner && "ag-drop--owner"
          )}
        >
          <div className="mb-2 pointer-events-none">{getIcon()}</div>
          <p className={cn("text-sm font-medium pointer-events-none", isDark ? "text-slate-300" : "text-slate-500")}>
            {dragging ? 'Drop to upload' : 'Click to upload or drag & drop'}
          </p>
          <p className={cn("text-xs mt-1 pointer-events-none", isDark ? "text-slate-500" : "text-slate-400")}>{helperText || accept}</p>
          <PdfNotice />
        </div>
      ) : (
        <div
          {...dragProps}
          data-test="drop-list"
          className={cn("space-y-2 rounded-xl transition-all", dragging && "ag-drop ag-drop--over p-1")}
        >
          {files.map((file, idx) => {
            const previewUrl = previewUrls[idx];
            return (
            <div key={idx} className={cn(
              "flex items-center justify-between p-2.5 border rounded-lg shadow-sm",
              isDark ? "bg-white/[0.08] border-white/[0.14]" : "bg-white border-slate-200"
            )}>
              <div className="flex items-center space-x-3 overflow-hidden">
                {previewUrl ? (
                  <button
                    type="button"
                    onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}
                    title="Click to view full image"
                    className="flex-shrink-0 w-12 h-12 rounded-md overflow-hidden border border-slate-300/60 dark:border-slate-500/60 hover:ring-2 hover:ring-blue-400 transition-all"
                  >
                    <img src={previewUrl} alt={file.name} className="w-full h-full object-cover" />
                  </button>
                ) : (
                  <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-md bg-slate-100 dark:bg-slate-600/40">{getIcon()}</div>
                )}
                <div className="truncate">
                  <p className={cn("text-sm font-medium truncate max-w-[180px]", isDark ? "text-slate-200" : "text-slate-700")}>{file.name}</p>
                  <p className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
                    {(file.size / 1024).toFixed(1)} KB{previewUrl ? ' · tap thumbnail to preview' : ''}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => removeFile(idx)} aria-label={`Remove ${file.name}`}
                className="p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex-shrink-0">
                <X className="w-4 h-4 text-red-500" />
              </button>
            </div>
            );
          })}
          {canAddMore && !hasReachedMax ? (
            <button
              type="button"
              onClick={triggerAddAnother}
              className={cn("w-full text-xs text-center py-2 rounded-lg border border-dashed transition-colors flex items-center justify-center gap-1",
                isDark ? "border-blue-500/50 text-blue-400 hover:border-blue-400 hover:bg-blue-900/20" : "border-blue-300 text-blue-500 hover:border-blue-400 hover:bg-blue-50"
              )}
            >
              <Plus className="w-3 h-3" /> Add another — or drop more here
            </button>
          ) : (
            <button
              type="button"
              onClick={triggerChangeFile}
              className={cn("w-full text-xs text-center py-2 rounded-lg border border-dashed transition-colors",
                isDark ? "border-white/[0.14] text-slate-400 hover:border-blue-500" : "border-slate-300 text-slate-500 hover:border-blue-400"
              )}
            >
              Change file
            </button>
          )}
          <PdfNotice />
        </div>
      )}
    </div>
  );
};


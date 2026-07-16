import { useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Eraser, PenLine, Upload, Camera } from "lucide-react";
import { normalizeSignatureFile } from "@/utils/signatureImage";

/**
 * Signature capture: draw on-screen (finger/mouse) OR upload / take a photo of a signature.
 * Calls `onSave(file)` with a PNG (draw) or the chosen image file (upload).
 */
export default function SignaturePad({ onSave, saving }: { onSave: (file: File) => void; saving?: boolean }) {
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string>("");

  // Prepare the canvas backing store to match its displayed size.
  useEffect(() => {
    if (mode !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0f172a";
    }
  }, [mode]);

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInk.current = true;
    if (!hasDrawn) setHasDrawn(true);
  };
  const end = () => { drawing.current = false; };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    setHasDrawn(false);
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadFile(f);
    setUploadPreview(URL.createObjectURL(f));
  };

  const handleSave = async () => {
    if (mode === "upload") {
      // Normalize the photo/scan: strip the whitish paper background to transparency so
      // the stored signature is a clean PNG that renders perfectly on screen and in PDFs.
      if (uploadFile) onSave(await normalizeSignatureFile(uploadFile));
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas || !hasInk.current) return;
    canvas.toBlob((blob) => {
      if (blob) onSave(new File([blob], "signature.png", { type: "image/png" }));
    }, "image/png");
  };

  const canSave = mode === "draw" ? hasDrawn : !!uploadFile;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setMode("draw")}
          className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border",
            mode === "draw" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
          <PenLine className="w-3.5 h-3.5" /> Draw
        </button>
        <button onClick={() => setMode("upload")}
          className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border",
            mode === "upload" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
          <Camera className="w-3.5 h-3.5" /> Upload / Photo
        </button>
      </div>

      {mode === "draw" ? (
        <div>
          <canvas
            ref={canvasRef}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            className="w-full h-40 rounded-lg border border-dashed border-border bg-white touch-none cursor-crosshair"
            style={{ touchAction: "none" }}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Sign above with your finger or mouse.</span>
            <button onClick={clear} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <Eraser className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        </div>
      ) : (
        <div>
          <label className="flex flex-col items-center justify-center h-40 rounded-lg border border-dashed border-border bg-white cursor-pointer overflow-hidden">
            {uploadPreview ? (
              <img src={uploadPreview} alt="signature preview" className="max-h-full object-contain" />
            ) : (
              <span className="flex flex-col items-center text-muted-foreground text-xs gap-1">
                <Upload className="w-6 h-6" /> Tap to upload or take a photo of your signature
              </span>
            )}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickFile} />
          </label>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={!canSave || saving}
        className={cn("mt-3 w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-colors",
          canSave && !saving ? "bg-primary hover:opacity-90" : "bg-muted text-muted-foreground cursor-not-allowed")}>
        {saving ? "Saving…" : "Save Signature & Sign Agreement"}
      </button>
    </div>
  );
}

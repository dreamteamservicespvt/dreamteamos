/**
 * Shared bits of SMM Delivery Control's AI parts (2026-10-15, phase 5): the "✨ AI" / "Plain" tag every AI
 * text carries (the service's lazy loader is `aiLoader.ts`).
 */
import { Sparkles, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

/** "✨ AI" when Gemini wrote it, "Plain" when the rules' template did — an icon, a colour and a word. */
export function AiTag({ usedAi, className }: { usedAi: boolean; className?: string }) {
  return usedAi ? (
    <span
      data-test="smm-ai-tag"
      className={cn("inline-flex shrink-0 items-center gap-1 rounded-full bg-viz-ready/15 px-2 py-0.5 text-[11px] font-semibold text-viz-ready", className)}
    >
      <Sparkles className="h-3 w-3" aria-hidden /> AI
    </span>
  ) : (
    <span
      data-test="smm-plain-tag"
      className={cn("inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground", className)}
    >
      <FileText className="h-3 w-3" aria-hidden /> Plain
    </span>
  );
}

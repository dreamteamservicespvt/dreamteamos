/**
 * Answering one item: choice (native radio inputs — keyboard and screen-reader friendly), a number, an order (move
 * up / down buttons — no drag needed, works on a phone and with a keyboard), or a written answer with a word count and
 * "what a strong answer covers" (the rubric's criteria, never the model answer).
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AttemptResponse, PublicItem } from "@/devos/core/types";
import { readItemDraft, writeItemDraft } from "../drafts";

export const wordCount = (s: string) => (s.trim().match(/\S+/g) ?? []).length;

/**
 * An unsent written answer is kept in this browser per person and question (`../drafts`), so leaving the page or a
 * reload never loses it; it counts once it is SUBMITTED, which the server records.
 */
export const clearDraft = (uid: string, qid: string) => writeItemDraft(uid, qid, "");

export function ItemForm({ uid, item, disabled, onChange }: { uid: string; item: PublicItem; disabled: boolean; onChange: (r: AttemptResponse | null) => void }) {
  const [choice, setChoice] = useState<number | null>(null);
  const [num, setNum] = useState("");
  const [order, setOrder] = useState<number[]>(() => (item.options ?? []).map((_, i) => i));
  const [text, setText] = useState(() => (item.type === "open" ? readItemDraft(uid, item.qid) : ""));
  const [showRubric, setShowRubric] = useState(false);

  useEffect(() => {
    setChoice(null);
    setNum("");
    setOrder((item.options ?? []).map((_, i) => i));
    setText(item.type === "open" ? readItemDraft(uid, item.qid) : "");
  }, [uid, item.qid, item.options, item.type]);

  // Keep the unsent draft (a short pause after typing, so a long answer is not written on every key).
  useEffect(() => {
    if (item.type !== "open") return;
    const t = setTimeout(() => writeItemDraft(uid, item.qid, text), 400);
    return () => clearTimeout(t);
  }, [text, uid, item.qid, item.type]);

  useEffect(() => {
    if (item.type === "mcq" || item.type === "multi") onChange(choice === null ? null : { kind: "choice", selected: [choice] });
    else if (item.type === "numeric") {
      const v = Number(num.replace(/,/g, ""));
      onChange(num.trim() !== "" && Number.isFinite(v) ? { kind: "number", value: v } : null);
    } else if (item.type === "order") onChange({ kind: "order", order });
    else onChange(wordCount(text) >= 1 ? { kind: "text", text } : null);
  }, [choice, num, order, text, item.type, onChange]);

  const words = useMemo(() => wordCount(text), [text]);
  const max = item.rubric?.maxWords ?? 150;

  if (item.type === "mcq" || item.type === "multi") {
    return (
      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="sr-only">Choose one answer</legend>
        {(item.options ?? []).map((opt, i) => (
          <label key={i} className={cn("flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors min-h-[48px]",
            choice === i ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border hover:bg-muted/60", disabled && "cursor-default opacity-90")}
            data-test={`option-${i}`}>
            <input type="radio" name={`opt-${item.qid}`} className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={choice === i} onChange={() => setChoice(i)} />
            <span className="text-sm leading-relaxed">{opt}</span>
          </label>
        ))}
      </fieldset>
    );
  }

  if (item.type === "numeric") {
    return (
      <div className="flex items-center gap-2 max-w-xs">
        <Input inputMode="decimal" type="text" value={num} disabled={disabled} onChange={(e) => setNum(e.target.value.replace(/[^\d.,-]/g, ""))} placeholder="Your answer" aria-label="Your answer (a number)" className="text-lg h-12" data-test="numeric-input" />
        {item.unit && <span className="text-sm text-muted-foreground whitespace-nowrap">{item.unit}</span>}
      </div>
    );
  }

  if (item.type === "order") {
    const move = (i: number, d: -1 | 1) => setOrder((o) => {
      const j = i + d;
      if (j < 0 || j >= o.length) return o;
      const n = [...o];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
    return (
      <ol className="space-y-2" aria-label="Put these in order — first at the top">
        {order.map((opt, i) => (
          <li key={opt} className="flex items-center gap-2 rounded-xl border border-border p-2 pl-3 bg-card" data-test={`order-row-${i}`}>
            <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
            <span className="text-sm flex-1 min-w-0">{item.options![opt]}</span>
            <button type="button" disabled={disabled || i === 0} onClick={() => move(i, -1)} className="h-10 w-10 grid place-items-center rounded-lg hover:bg-muted disabled:opacity-30" aria-label={`Move "${item.options![opt]}" up`}><ArrowUp className="h-4 w-4" /></button>
            <button type="button" disabled={disabled || i === order.length - 1} onClick={() => move(i, 1)} className="h-10 w-10 grid place-items-center rounded-lg hover:bg-muted disabled:opacity-30" aria-label={`Move "${item.options![opt]}" down`}><ArrowDown className="h-4 w-4" /></button>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="space-y-2">
      {item.rubric && (
        <div className="rounded-xl border border-border">
          <button type="button" onClick={() => setShowRubric((v) => !v)} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium min-h-[44px]" aria-expanded={showRubric}>
            What a strong answer covers {showRubric ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showRubric && (
            <ul className="px-3 pb-3 space-y-1.5 text-xs text-muted-foreground">
              {item.rubric.criteria.map((c) => <li key={c.id}><span className="font-medium text-foreground">{c.label}</span> — {c.anchors[4]}</li>)}
              <li className="pt-1">Passes at {item.rubric.passMark}%. Graded on meaning — spelling and English level do not cost marks.</li>
            </ul>
          )}
        </div>
      )}
      <Textarea value={text} disabled={disabled} onChange={(e) => setText(e.target.value.slice(0, 6000))} rows={8} placeholder="Write your answer here…" aria-label="Your answer" className="text-base leading-relaxed" data-test="open-input" />
      <p className={cn("text-xs text-right", words > max ? "text-amber-600 dark:text-warning" : "text-muted-foreground")}>{words} / {max} words{words > max ? " — shorter is better; extra words are not rewarded" : ""}</p>
    </div>
  );
}

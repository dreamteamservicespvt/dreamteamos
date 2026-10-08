/**
 * The invoice's lines — typed in place, like a spreadsheet that knows what an invoice is.
 *
 * - Add with the button or ⌘/Ctrl + Enter from anywhere in the builder (the new line's name is focused).
 * - Reorder by dragging the handle (desktop), from the ⋯ menu, or Alt + ↑ / ↓ inside a line.
 * - Delete asks once, in place: the bin turns into "Delete?" for a few seconds. An empty line goes at once.
 * - SAC, discount and a line's own GST rate sit behind "More" so a simple invoice stays simple; a line
 *   that uses them shows them open.
 *
 * The "Amount" shown here is the line as typed (quantity × rate − discount — so with prices that include
 * GST, it includes GST). The summary underneath and the preview give the formal split, all from
 * `invoiceMath`.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, GripVertical, MoreHorizontal, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import type { InvoiceItem } from "@/types/invoice";
import type { InvoiceTotals } from "@/utils/invoiceMath";
import { formatPaise, formatRate } from "@/utils/invoiceMath";
import { GST_RATES } from "@/utils/gst";
import { blankItem, newItemId } from "@/utils/invoiceDraft";
import { SERVICE_CATALOG } from "@/utils/serviceCatalog";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, NumberInput, Segmented, TextArea, TextInput, type FieldIssue, inputClass } from "@/components/invoice/editorKit";

/** What the company sells, offered as the item name is typed. */
const SERVICE_NAMES = Array.from(new Set(
  SERVICE_CATALOG.map((c) => c.label.replace(/\s*\((Monthly|Single Campaign)\)\s*$/i, "").trim()),
)).concat(["Social Media Management", "Logo Design", "Video Editing"]).filter((v, i, a) => a.indexOf(v) === i);

interface Props {
  items: InvoiceItem[];
  totals: InvoiceTotals;
  gstOn: boolean;
  defaultRate: number;
  pricesIncludeTax: boolean;
  disabled: boolean;
  compact: boolean;
  issueFor: (field: string) => FieldIssue | null;
  onChange: (items: InvoiceItem[]) => void;
  /** A line that was just added — its name gets focus. */
  focusId: string | null;
  onFocusDone: () => void;
  onAdd: () => void;
}

export default function ItemsEditor({
  items, totals, gstOn, defaultRate, pricesIncludeTax, disabled, compact, issueFor, onChange, focusId, onFocusDone, onAdd,
}: Props) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(armTimer.current), []);

  const update = (id: string, patch: Partial<InvoiceItem>) =>
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    onChange(next);
  };

  const duplicate = (index: number) => {
    const next = [...items];
    next.splice(index + 1, 0, { ...items[index], id: newItemId() });
    onChange(next);
  };

  const remove = (item: InvoiceItem, index: number) => {
    const line = totals.lines[index];
    const empty = !item.name.trim() && !item.description.trim() && (!line || line.gross === 0);
    if (!empty && armed !== item.id) {
      setArmed(item.id);
      clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmed(null), 3500);
      return;
    }
    setArmed(null);
    const next = items.filter((it) => it.id !== item.id);
    onChange(next.length ? next : [blankItem(defaultRate)]);
  };

  const listIssue = issueFor("items");

  return (
    <div data-field="items">
      <datalist id="inv-service-names">
        {SERVICE_NAMES.map((n) => <option key={n} value={n} />)}
      </datalist>

      {!compact && (
        <div className="grid grid-cols-[20px_minmax(0,1fr)_72px_116px_104px_64px] gap-2 px-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span />
          <span>Item</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Rate{gstOn ? (pricesIncludeTax ? " (incl. GST)" : " (excl. GST)") : ""}</span>
          <span className="text-right">Amount</span>
          <span />
        </div>
      )}

      <ol className="space-y-2" aria-label="Invoice items">
        {items.map((item, index) => (
          <ItemRow
            key={item.id}
            item={item}
            index={index}
            count={items.length}
            line={totals.lines[index]}
            gstOn={gstOn}
            defaultRate={defaultRate}
            pricesIncludeTax={pricesIncludeTax}
            disabled={disabled}
            compact={compact}
            issueFor={issueFor}
            armed={armed === item.id}
            autoFocus={focusId === item.id}
            onFocused={onFocusDone}
            onPatch={(p) => update(item.id, p)}
            onMove={(dir) => move(index, index + dir)}
            onDuplicate={() => duplicate(index)}
            onRemove={() => remove(item, index)}
            dragging={dragFrom === index}
            dropTarget={dragOver === index && dragFrom !== null && dragFrom !== index}
            onDragStart={() => setDragFrom(index)}
            onDragEnter={() => setDragOver(index)}
            onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
            onDrop={() => { if (dragFrom !== null) move(dragFrom, index); setDragFrom(null); setDragOver(null); }}
          />
        ))}
      </ol>

      {listIssue && (
        <p role="alert" className={cn("mt-2 text-[11.5px]", listIssue.level === "error" ? "text-destructive" : "text-amber-600 dark:text-amber-400")}>
          {listIssue.message}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled}
          data-test="add-item"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-dashed border-border text-sm font-medium text-foreground hover:bg-accent/60 hover:border-primary/40 transition-colors disabled:opacity-50"
        >
          <Plus size={15} /> Add item
          <kbd className="hidden sm:inline ml-1.5 text-[10px] font-medium text-muted-foreground border border-border rounded px-1 py-px">Ctrl ↵</kbd>
        </button>
        <span className="text-xs text-muted-foreground tabular-nums">
          {totals.printedCount} {totals.printedCount === 1 ? "item" : "items"}
        </span>
      </div>

      <TotalsSummary totals={totals} gstOn={gstOn} />
    </div>
  );
}

function ItemRow({
  item, index, count, line, gstOn, defaultRate, pricesIncludeTax, disabled, compact, issueFor, armed, autoFocus, onFocused,
  onPatch, onMove, onDuplicate, onRemove, dragging, dropTarget, onDragStart, onDragEnter, onDragEnd, onDrop,
}: {
  item: InvoiceItem;
  index: number;
  count: number;
  line: InvoiceTotals["lines"][number] | undefined;
  gstOn: boolean;
  defaultRate: number;
  pricesIncludeTax: boolean;
  disabled: boolean;
  compact: boolean;
  issueFor: (field: string) => FieldIssue | null;
  armed: boolean;
  autoFocus: boolean;
  onFocused: () => void;
  onPatch: (p: Partial<InvoiceItem>) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  dragging: boolean;
  dropTarget: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [draggable, setDraggable] = useState(false);
  const usesExtras = !!item.sac.trim() || item.discountValue > 0 || (gstOn && item.taxRate !== defaultRate);
  const [moreOpen, setMoreOpen] = useState(usesExtras);
  useEffect(() => { if (usesExtras) setMoreOpen(true); }, [usesExtras]);

  useEffect(() => {
    if (!autoFocus) return;
    nameRef.current?.focus();
    nameRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    onFocused();
  }, [autoFocus, onFocused]);

  const nameIssue = issueFor(`items.${item.id}.name`);
  const qtyIssue = issueFor(`items.${item.id}.quantity`);
  const rateIssue = issueFor(`items.${item.id}.rate`);
  const discountIssue = issueFor(`items.${item.id}.discount`);
  const lineIssue = nameIssue || qtyIssue || rateIssue || discountIssue;
  const n = index + 1;

  const actions = (
    <div className="flex items-center justify-end gap-0.5">
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={armed ? `Confirm delete item ${n}` : `Delete item ${n}`}
        title={armed ? "Click again to delete" : "Delete item"}
        className={cn(
          "h-8 rounded-md inline-flex items-center justify-center transition-all disabled:opacity-40",
          armed ? "px-2 bg-destructive text-destructive-foreground text-xs font-semibold" : "w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10",
        )}
      >
        {armed ? "Delete?" : <Trash2 size={15} />}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" disabled={disabled} aria-label={`More actions for item ${n}`}
            className="w-8 h-8 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40">
            <MoreHorizontal size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={onDuplicate}><Copy size={14} className="mr-2" /> Duplicate</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onMove(-1)} disabled={index === 0}><ArrowUp size={14} className="mr-2" /> Move up</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onMove(1)} disabled={index === count - 1}><ArrowDown size={14} className="mr-2" /> Move down</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setMoreOpen((v) => !v)}><SlidersHorizontal size={14} className="mr-2" /> {moreOpen ? "Hide options" : "SAC, discount, GST"}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const amount = (
    <div className="text-right min-w-0">
      <div className="h-9 flex items-center justify-end text-sm font-medium text-foreground tabular-nums truncate" data-test="item-amount">
        {formatPaise(line?.net ?? 0)}
      </div>
    </div>
  );

  return (
    <li
      data-test="invoice-item"
      draggable={draggable && !disabled}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", item.id); onDragStart(); }}
      onDragEnter={onDragEnter}
      onDragOver={(e) => { if (!disabled) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      onDragEnd={() => { setDraggable(false); onDragEnd(); }}
      onKeyDown={(e) => {
        if (!e.altKey || disabled) return;
        if (e.key === "ArrowUp") { e.preventDefault(); onMove(-1); }
        if (e.key === "ArrowDown") { e.preventDefault(); onMove(1); }
      }}
      className={cn(
        "group rounded-xl border bg-card/40 transition-[border-color,box-shadow,opacity]",
        dropTarget ? "border-primary ring-2 ring-primary/15" : lineIssue?.level === "error" ? "border-destructive/50" : "border-border/80 hover:border-border",
        dragging && "opacity-50",
      )}
    >
      <div className={cn("p-2", compact ? "space-y-2" : "grid grid-cols-[20px_minmax(0,1fr)_72px_116px_104px_64px] gap-2 items-start")}>
        {!compact && (
          <button
            type="button"
            aria-label={`Drag to reorder item ${n}`}
            title="Drag to reorder (or Alt + ↑ / ↓)"
            onMouseDown={() => setDraggable(true)}
            onMouseUp={() => setDraggable(false)}
            disabled={disabled}
            className="h-9 w-5 flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing disabled:cursor-not-allowed"
          >
            <GripVertical size={15} />
          </button>
        )}

        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            {compact && <span className="text-[11px] font-semibold text-muted-foreground tabular-nums w-5 shrink-0">{n}.</span>}
            <TextInput
              ref={nameRef}
              value={item.name}
              onValue={(v) => onPatch({ name: v })}
              placeholder="Item or service"
              aria-label={`Item ${n} name`}
              list="inv-service-names"
              maxLength={160}
              disabled={disabled}
              invalid={nameIssue?.level === "error"}
              data-test="item-name"
            />
            {compact && actions}
          </div>
          <TextArea
            value={item.description}
            onValue={(v) => onPatch({ description: v })}
            placeholder="Description (optional)"
            aria-label={`Item ${n} description`}
            minRows={1}
            maxLength={600}
            disabled={disabled}
            className="text-[13px] min-h-[36px]"
          />
        </div>

        {compact ? (
          <div className="grid grid-cols-[72px_minmax(0,1fr)_minmax(0,1fr)] gap-2 items-end">
            <Field label="Qty" htmlFor={`qty-${item.id}`}>
              <NumberInput id={`qty-${item.id}`} value={item.quantity} onValue={(v) => onPatch({ quantity: v })} decimals={3} max={9999999} disabled={disabled} invalid={qtyIssue?.level === "error"} />
            </Field>
            <Field label={gstOn ? (pricesIncludeTax ? "Rate (incl. GST)" : "Rate (excl. GST)") : "Rate"} htmlFor={`rate-${item.id}`}>
              <NumberInput id={`rate-${item.id}`} value={item.rate} onValue={(v) => onPatch({ rate: v })} max={99999999} placeholder="0.00" blankZero disabled={disabled} data-test="item-rate" />
            </Field>
            <Field label="Amount">{amount}</Field>
          </div>
        ) : (
          <>
            <NumberInput value={item.quantity} onValue={(v) => onPatch({ quantity: v })} decimals={3} max={9999999} aria-label={`Item ${n} quantity`} disabled={disabled} invalid={qtyIssue?.level === "error"} data-test="item-qty" />
            <NumberInput value={item.rate} onValue={(v) => onPatch({ rate: v })} max={99999999} placeholder="0.00" blankZero aria-label={`Item ${n} rate`} disabled={disabled} data-test="item-rate" />
            {amount}
            {actions}
          </>
        )}
      </div>

      {moreOpen && (
        <div className={cn("px-2 pb-2.5 pt-0.5 grid gap-2", compact ? "grid-cols-2" : "grid-cols-[20px_120px_minmax(0,1fr)_120px]")}>
          {!compact && <span />}
          <Field label="HSN / SAC" htmlFor={`sac-${item.id}`}>
            <TextInput id={`sac-${item.id}`} value={item.sac} onValue={(v) => onPatch({ sac: v.replace(/[^0-9A-Za-z]/g, "").slice(0, 10) })} placeholder="998361" disabled={disabled} />
          </Field>
          <Field label="Discount" issue={discountIssue} className={compact ? "col-span-2 order-3" : ""}>
            <div className="flex items-center gap-2">
              <Segmented
                size="sm"
                ariaLabel="Discount type"
                value={item.discountKind}
                onChange={(k) => onPatch({ discountKind: k, discountValue: 0 })}
                options={[{ value: "percent", label: "%" }, { value: "amount", label: "₹" }]}
                disabled={disabled}
              />
              <NumberInput
                value={item.discountValue}
                onValue={(v) => onPatch({ discountValue: v })}
                max={item.discountKind === "percent" ? 100 : 99999999}
                aria-label={`Item ${n} discount`}
                placeholder="0"
                blankZero
                disabled={disabled}
                data-test="item-discount"
              />
            </div>
          </Field>
          {gstOn ? (
            <Field label="GST rate" htmlFor={`gst-${item.id}`}>
              <select
                id={`gst-${item.id}`}
                value={GST_RATES.includes(item.taxRate) ? String(item.taxRate) : "custom"}
                onChange={(e) => { if (e.target.value !== "custom") onPatch({ taxRate: Number(e.target.value) }); }}
                disabled={disabled}
                className={cn(inputClass, "pr-8")}
                data-test="item-gst"
              >
                {GST_RATES.map((r) => <option key={r} value={r}>{formatRate(r)}</option>)}
                {!GST_RATES.includes(item.taxRate) && <option value="custom">{formatRate(item.taxRate)}</option>}
              </select>
            </Field>
          ) : <span />}
        </div>
      )}
      {lineIssue && lineIssue !== discountIssue && (
        <p role={lineIssue.level === "error" ? "alert" : undefined}
          className={cn("px-3 pb-2 -mt-0.5 text-[11.5px]", lineIssue.level === "error" ? "text-destructive" : "text-amber-600 dark:text-amber-400")}>
          {lineIssue.message}
        </p>
      )}
    </li>
  );
}

function TotalsSummary({ totals: t, gstOn }: { totals: InvoiceTotals; gstOn: boolean }) {
  const row = (label: string, value: string, key?: string) => (
    <div key={key ?? label} className="flex items-center justify-between gap-4 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  );
  return (
    <div className="mt-4 ml-auto w-full sm:max-w-[300px] space-y-1.5" data-test="editor-totals">
      {row("Subtotal", formatPaise(t.subtotal))}
      {t.discount > 0 && row("Discount", `−${formatPaise(t.discount)}`)}
      {t.discount > 0 && gstOn && row("Taxable value", formatPaise(t.taxable))}
      {gstOn && t.buckets.filter((b) => b.tax > 0).flatMap((b) => t.supply === "inter"
        ? [row(`IGST ${formatRate(b.rate)}`, formatPaise(b.igst), `i${b.rate}`)]
        : [row(`CGST ${formatRate(b.rate / 2)}`, formatPaise(b.cgst), `c${b.rate}`), row(`SGST ${formatRate(b.rate / 2)}`, formatPaise(b.sgst), `s${b.rate}`)])}
      {t.roundOff !== 0 && row("Round off", formatPaise(t.roundOff))}
      <div className="flex items-center justify-between gap-4 pt-2 mt-1 border-t border-border">
        <span className="text-sm font-semibold text-foreground">Total</span>
        <span className="text-lg font-semibold text-foreground tabular-nums" data-test="editor-grand-total">{formatPaise(t.grandTotal, { symbol: true })}</span>
      </div>
    </div>
  );
}

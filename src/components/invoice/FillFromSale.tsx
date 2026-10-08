/**
 * "Fill from a sale" — a salesperson's own sales, one tap from the customer section.
 *
 * Reads the session-long orders a salesperson already has in memory (`useMyOrders`, fed by
 * AppLayout), so it costs no Firestore reads at all. Picking a sale fills the customer's name and
 * phone and adds the sale as a line, priced at what the client agreed to pay.
 */
import { useMemo, useState } from "react";
import { ReceiptText, Search } from "lucide-react";
import type { Order } from "@/types";
import { useMyOrders } from "@/hooks/useMyOrders";
import { categoryLabel } from "@/utils/serviceCatalog";
import { formatPaise, toPaise } from "@/utils/invoiceMath";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const millis = (v: any): number =>
  typeof v?.toMillis === "function" ? v.toMillis() : typeof v === "number" ? v : v?.seconds ? v.seconds * 1000 : 0;

export default function FillFromSale({ onPick }: { onPick: (order: Order) => void }) {
  const { orders, loading } = useMyOrders();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return orders
      .filter((o) => o.status !== "deleted" && o.status !== "cancelled")
      .filter((o) => !needle || `${o.businessName} ${o.clientName || ""} ${o.clientPhone}`.toLowerCase().includes(needle))
      .sort((a, b) => (b.saleSubmittedAtMs || millis(b.createdAt)) - (a.saleSubmittedAtMs || millis(a.createdAt)))
      .slice(0, 30);
  }, [orders, q]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" data-test="fill-from-sale"
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-accent">
          <ReceiptText size={13} /> Fill from a sale
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,360px)] p-0">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your sales"
              className="w-full h-8 pl-8 pr-2 rounded-md bg-background border border-input text-sm outline-none focus:border-primary" />
          </div>
        </div>
        <ul className="max-h-72 overflow-auto py-1">
          {loading && <li className="px-3 py-3 text-sm text-muted-foreground">Loading your sales…</li>}
          {!loading && list.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">No sales to show.</li>}
          {list.map((o) => (
            <li key={o.id}>
              <button type="button" onClick={() => { onPick(o); setOpen(false); }}
                className="w-full text-left px-3 py-2 hover:bg-accent/70 flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm text-foreground truncate">{o.businessName || o.clientName || o.clientPhone}</span>
                  <span className="block text-xs text-muted-foreground truncate">{categoryLabel(o.category)}{o.packageKey ? ` · ${o.packageKey}` : ""}</span>
                </span>
                <span className="text-sm tabular-nums text-foreground shrink-0">{formatPaise(toPaise(o.amount), { symbol: true })}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

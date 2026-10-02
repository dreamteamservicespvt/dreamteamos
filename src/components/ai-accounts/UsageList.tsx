import { Pencil, Trash2 } from "lucide-react";
import { buttonClass } from "./AiModal";
import type { FlowUsageEntry } from "@/types/aiAccounts";

/**
 * Credit entries for a month, newest first — each ad's clips, the account charged and who entered it.
 * Anyone can correct their own entry; a manager can correct anyone's. Changes update the account's
 * total live for everyone looking at it.
 */
export default function UsageList({
  entries, viewerId, manager, showUser, onEdit, onDelete,
}: {
  entries: FlowUsageEntry[];
  viewerId: string;
  manager: boolean;
  showUser: boolean;
  onEdit: (entry: FlowUsageEntry) => void;
  onDelete: (entry: FlowUsageEntry) => void;
}) {
  if (entries.length === 0) {
    return <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">No credits recorded this month.</div>;
  }
  const total = entries.reduce((sum, e) => sum + e.credits, 0);
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-muted-foreground">
        <span>{entries.length} entr{entries.length === 1 ? "y" : "ies"}</span>
        <span>Total <b className="text-foreground" data-test="usage-total">{total}</b> credits</span>
      </div>
      <ul className="divide-y divide-border">
        {entries.map((e) => {
          const canChange = manager || e.userId === viewerId;
          return (
            <li key={e.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 min-w-0" data-test="usage-row">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground truncate">
                  <b>{e.credits}</b> credits · {e.rows.map((r) => `${r.count} × ${r.seconds}s`).join(" + ")}
                  {e.businessName || e.uniqueId ? <span className="text-muted-foreground"> — {e.businessName || e.uniqueId}</span> : <span className="text-muted-foreground"> — manual entry</span>}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {e.date} · <span className="font-mono">{e.accountEmail}</span>{showUser ? <> · {e.userName}</> : null}
                  {e.editedByName ? <> · edited by {e.editedByName}</> : null}
                </p>
              </div>
              {canChange ? (
                <div className="flex gap-1.5 shrink-0">
                  <button className={buttonClass.small} onClick={() => onEdit(e)} data-test="usage-edit"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                  <button className={buttonClass.danger} onClick={() => onDelete(e)}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

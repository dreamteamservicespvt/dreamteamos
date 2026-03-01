import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { formatCurrency } from "@/utils/formatters";
import { format } from "date-fns";
import { Receipt, ExternalLink } from "lucide-react";

interface SalaryReceipt {
  id: string;
  userId: string;
  amount: number;
  month: string;
  note: string;
  fileUrl?: string;
  fileName?: string;
  sentBy: string;
  sentAt: any;
}

export default function SalaryTimeline({ userId }: { userId: string }) {
  const [receipts, setReceipts] = useState<SalaryReceipt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, "salary_receipts"), where("userId", "==", userId));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as SalaryReceipt))
        .sort((a, b) => (b.sentAt?.seconds || 0) - (a.sentAt?.seconds || 0));
      setReceipts(data);
      setLoading(false);
    });
    return unsub;
  }, [userId]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (receipts.length === 0) {
    return (
      <div className="text-center py-6">
        <Receipt size={24} className="mx-auto text-muted-foreground/30 mb-2" />
        <p className="text-xs text-muted-foreground">No salary receipts yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {receipts.map((r, i) => (
        <div key={r.id} className="flex gap-3">
          {/* Timeline line */}
          <div className="flex flex-col items-center">
            <div className="w-2.5 h-2.5 rounded-full bg-success mt-1.5 shrink-0" />
            {i < receipts.length - 1 && <div className="w-px flex-1 bg-border" />}
          </div>
          {/* Content */}
          <div className="pb-4 min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display font-bold text-foreground text-sm">{formatCurrency(r.amount)}</span>
              <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                {r.sentAt?.seconds ? format(new Date(r.sentAt.seconds * 1000), "dd MMM yyyy") : "—"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="font-medium text-foreground/70">{r.month}</span>
              {r.note && <span> · {r.note}</span>}
            </p>
            {r.fileUrl && (
              <a
                href={r.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-1.5 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
              >
                <ExternalLink size={11} />
                {r.fileName || "View Receipt"}
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

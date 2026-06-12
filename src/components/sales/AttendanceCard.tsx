import { useEffect, useState } from "react";
import { format, getDate, parseISO } from "date-fns";
import { CalendarCheck, Loader2 } from "lucide-react";
import { fetchMonthCheckins, type SalesCheckin } from "@/services/salesCheckin";

function fmtTs(ts: any): string {
  const s = ts?.seconds;
  return s ? format(new Date(s * 1000), "hh:mm a") : "—";
}

/**
 * Monthly attendance for a sales member, derived from the daily check-in/check-out records.
 * A day counts as present when the member checked in. Shown in My Profile and My Performance.
 */
export default function AttendanceCard({ memberId }: { memberId: string }) {
  const [checkins, setCheckins] = useState<SalesCheckin[]>([]);
  const [loading, setLoading] = useState(true);
  const month = format(new Date(), "yyyy-MM");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMonthCheckins(memberId, month)
      .then((list) => { if (!cancelled) setCheckins(list); })
      .catch(() => { if (!cancelled) setCheckins([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [memberId, month]);

  const presentDays = checkins.filter((c) => c.checkInAt).length;
  const daysElapsed = getDate(new Date());
  const pct = daysElapsed > 0 ? Math.round((presentDays / daysElapsed) * 100) : 0;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
          <CalendarCheck size={16} className="text-success" /> Attendance — {format(new Date(), "MMMM yyyy")}
        </h2>
        {!loading && (
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            pct >= 80 ? "bg-success/15 text-success" : pct >= 50 ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive"
          }`}>
            {presentDays} / {daysElapsed} days · {pct}%
          </span>
        )}
      </div>

      {loading ? (
        <div className="py-6 flex justify-center">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      ) : checkins.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No check-ins this month yet. Check in from the Dashboard to mark attendance.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {[...checkins].reverse().map((c) => (
            <div key={c.id} className="flex items-center justify-between text-xs bg-background border border-border rounded-lg px-3 py-2">
              <span className="font-medium text-foreground">{format(parseISO(c.date), "EEE, dd MMM")}</span>
              <span className="text-muted-foreground font-mono">
                In {fmtTs(c.checkInAt)} · Out {fmtTs(c.checkOutAt)}
              </span>
              {typeof c.totalSalesAmount === "number" && c.checkOutAt ? (
                <span className="font-mono text-success">₹{c.totalSalesAmount.toLocaleString("en-IN")}</span>
              ) : (
                <span className="text-muted-foreground/50">—</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

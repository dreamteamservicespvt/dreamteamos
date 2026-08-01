import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarCheck, Loader2 } from "lucide-react";
import { fetchCycleCheckins, type SalesCheckin } from "@/services/salesCheckin";
import { currentPayMonth, payPeriodForDate, payPeriodLabel, periodDates } from "@/utils/payrollEngine";

function fmtTs(ts: any): string {
  const s = ts?.seconds;
  return s ? format(new Date(s * 1000), "hh:mm a") : "—";
}

/**
 * This pay cycle's attendance for a sales member, from the daily check-in/check-out records.
 * A day counts as present when the member checked in. Shown in My Profile and My Performance.
 *
 * Measured over the 10th → 9th cycle, not the calendar month, because attendance is what the
 * salary engine deducts from and the two must cover the same days. On the calendar it showed
 * "0 / 1 days" on the 1st of a month while the member had been at work for three weeks.
 */
export default function AttendanceCard({ memberId }: { memberId: string }) {
  const [checkins, setCheckins] = useState<SalesCheckin[]>([]);
  const [loading, setLoading] = useState(true);
  const cycle = useMemo(() => payPeriodForDate(new Date()), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCycleCheckins(memberId, cycle.start, cycle.end)
      .then((list) => { if (!cancelled) setCheckins(list); })
      .catch(() => { if (!cancelled) setCheckins([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [memberId, cycle.start, cycle.end]);

  const presentDays = checkins.filter((c) => c.checkInAt).length;
  // Days of the cycle that have actually happened — the cycle runs past today, and dividing by
  // its full length would report everyone as behind on attendance for the whole month.
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const daysElapsed = periodDates(cycle).filter((d) => d <= todayStr).length;
  const pct = daysElapsed > 0 ? Math.round((presentDays / daysElapsed) * 100) : 0;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
          <CalendarCheck size={16} className="text-success" /> Attendance — {payPeriodLabel(currentPayMonth())}
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
          No check-ins this cycle yet. Check in from the Dashboard to mark attendance.
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

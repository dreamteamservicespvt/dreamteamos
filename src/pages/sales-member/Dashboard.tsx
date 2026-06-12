import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/utils/formatters";
import { format } from "date-fns";
import type { Lead } from "@/types";
import { motion } from "framer-motion";
import { Phone, CheckCircle, Clock, TrendingUp, AlertCircle, LogIn, LogOut, Loader2, Send } from "lucide-react";
import DashboardDayPicker from "@/components/dashboard/DayPicker";
import {
  recordCheckIn, recordCheckOut, watchTodayCheckin, buildCheckInMessage, buildCheckOutReport,
  reportWhatsAppUrl, type SalesCheckin,
} from "@/services/salesCheckin";

const statVariant = (i: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { delay: i * 0.08 } },
});

export default function SalesMemberDashboard() {
  const user = useAuthStore((s) => s.user);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "leads"), where("assignedTo", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead)));
      setLoading(false);
    });
    return unsub;
  }, [user]);

  // Filter by date
  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const filtered = dateStr
    ? leads.filter((l) => {
        const ts = l.lastUpdated?.seconds || l.createdAt?.seconds;
        if (!ts) return false;
        return format(new Date(ts * 1000), "yyyy-MM-dd") === dateStr;
      })
    : leads;

  const total = filtered.length;
  const called = filtered.filter((l) => l.status !== "not_called").length;
  const answered = filtered.filter((l) => l.status === "answered").length;
  const salesDone = filtered.filter((l) => l.saleDone).length;
  const allItems = filtered.flatMap((l) => l.saleItems || (l.saleDetails ? [l.saleDetails] : []));
  const pendingVerification = allItems.filter((item) => item.verificationStatus === "pending").length;
  const totalRevenue = allItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  const conversionRate = total > 0 ? ((salesDone / total) * 100).toFixed(1) : "0";
  const monthlyTarget = user?.monthlyTarget || user?.target || 0;
  const dailyTarget = user?.dailyTarget || 0;
  const allTimeRevenue = leads.flatMap((l) => l.saleItems || (l.saleDetails ? [l.saleDetails] : [])).reduce((sum, item) => sum + (item.amount || 0), 0);
  const monthlyProgress = monthlyTarget > 0 ? Math.min((allTimeRevenue / monthlyTarget) * 100, 100) : 0;

  // Daily revenue: today's leads only
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayRevenue = leads
    .filter((l) => {
      const ts = l.lastUpdated?.seconds || l.createdAt?.seconds;
      return ts && format(new Date(ts * 1000), "yyyy-MM-dd") === todayStr;
    })
    .flatMap((l) => l.saleItems || (l.saleDetails ? [l.saleDetails] : []))
    .reduce((sum, item) => sum + (item.amount || 0), 0);
  const dailyProgress = dailyTarget > 0 ? Math.min((todayRevenue / dailyTarget) * 100, 100) : 0;

  const stats = [
    { label: selectedDate ? "Active Leads" : "Total Leads", value: total, icon: Phone, color: "text-info" },
    { label: "Called", value: called, icon: Clock, color: "text-warning" },
    { label: "Answered", value: answered, icon: CheckCircle, color: "text-success" },
    { label: "Sales Done", value: salesDone, icon: TrendingUp, color: "text-primary" },
    { label: "Pending Verify", value: pendingVerification, icon: AlertCircle, color: "text-role-sales-admin" },
    { label: "Revenue", value: formatCurrency(totalRevenue), icon: TrendingUp, color: "text-success" },
  ];

  const statusBreakdown = [
    { label: "Not Called", count: filtered.filter((l) => l.status === "not_called").length, color: "bg-muted-foreground" },
    { label: "Answered", count: answered, color: "bg-info" },
    { label: "Not Answered", count: filtered.filter((l) => l.status === "not_answered").length, color: "bg-warning" },
    { label: "Call Later", count: filtered.filter((l) => l.status === "call_later").length, color: "bg-role-main-admin" },
    { label: "Not Interested", count: filtered.filter((l) => l.status === "not_interested").length, color: "bg-destructive" },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 h-24 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {selectedDate ? `Activity on ${format(selectedDate, "dd/MM/yyyy")}` : `Welcome back, ${user?.name}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DashboardDayPicker selectedDate={selectedDate} onSelect={setSelectedDate} />
          {selectedDate && (
            <button onClick={() => setSelectedDate(undefined)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Daily check-in / check-out — drives monthly attendance */}
      {user && <CheckinCard user={{ uid: user.uid, name: user.name }} leads={leads} />}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((s, i) => (
          <motion.div key={s.label} {...statVariant(i)} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <s.icon size={16} className={s.color} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <p className="font-display font-bold text-xl text-foreground">{s.value}</p>
          </motion.div>
        ))}
      </div>

      {(dailyTarget > 0 || monthlyTarget > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {dailyTarget > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-display font-semibold text-foreground text-sm">Daily Target</h2>
                <span className="text-xs text-muted-foreground font-mono">
                  {formatCurrency(todayRevenue)} / {formatCurrency(dailyTarget)}
                </span>
              </div>
              <div className="h-2 bg-border rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${dailyProgress}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className={`h-full rounded-full ${dailyProgress >= 100 ? "bg-success" : "bg-primary"}`}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">{dailyProgress.toFixed(0)}% achieved</p>
            </div>
          )}
          {monthlyTarget > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-display font-semibold text-foreground text-sm">Monthly Target</h2>
                <span className="text-xs text-muted-foreground font-mono">
                  {formatCurrency(allTimeRevenue)} / {formatCurrency(monthlyTarget)}
                </span>
              </div>
              <div className="h-2 bg-border rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${monthlyProgress}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className={`h-full rounded-full ${monthlyProgress >= 100 ? "bg-success" : "bg-primary"}`}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">{monthlyProgress.toFixed(0)}% achieved</p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-display font-semibold text-foreground mb-4">Lead Status Breakdown</h2>
          <div className="space-y-3">
            {statusBreakdown.map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${s.color}`} />
                <span className="text-sm text-foreground flex-1">{s.label}</span>
                <span className="text-sm font-mono text-muted-foreground">{s.count}</span>
                <div className="w-24 h-2 bg-border rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${s.color}`} style={{ width: `${total > 0 ? (s.count / total) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-display font-semibold text-foreground mb-4">Performance</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Conversion Rate</span>
              <span className="font-display font-bold text-foreground text-lg">{conversionRate}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Avg Sale Value</span>
              <span className="font-display font-bold text-foreground text-lg">
                {salesDone > 0 ? formatCurrency(totalRevenue / salesDone) : "—"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Call Rate</span>
              <span className="font-display font-bold text-foreground text-lg">
                {total > 0 ? ((called / total) * 100).toFixed(0) : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Daily Check-In / Check-Out ─── */

function fmtTs(ts: any): string {
  const s = ts?.seconds;
  return s ? format(new Date(s * 1000), "hh:mm a") : "—";
}

function CheckinCard({ user, leads }: { user: { uid: string; name: string }; leads: Lead[] }) {
  const { toast } = useToast();
  const [checkin, setCheckin] = useState<SalesCheckin | null>(null);
  const [busy, setBusy] = useState<"in" | "out" | null>(null);

  useEffect(() => watchTodayCheckin(user.uid, setCheckin), [user.uid]);

  const checkedIn = !!checkin?.checkInAt;
  const checkedOut = !!checkin?.checkOutAt;

  const handleCheckIn = async () => {
    setBusy("in");
    try {
      await recordCheckIn(user);
      window.open(reportWhatsAppUrl(buildCheckInMessage(user.name)), "_blank");
      toast({ title: "Checked in", description: "Check-in recorded — send the WhatsApp message that just opened." });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Check-in failed.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleCheckOut = async () => {
    setBusy("out");
    try {
      const report = buildCheckOutReport(user.name, leads);
      await recordCheckOut(user, report);
      window.open(reportWhatsAppUrl(report.reportText), "_blank");
      toast({ title: "Checked out", description: "Progress report ready — send the WhatsApp message that just opened." });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Check-out failed.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const resendReport = () => {
    const text = checkin?.reportText || buildCheckOutReport(user.name, leads).reportText;
    window.open(reportWhatsAppUrl(text), "_blank");
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
          checkedOut ? "bg-success/15 text-success" : checkedIn ? "bg-info/15 text-info" : "bg-warning/15 text-warning"
        }`}>
          {checkedOut ? <CheckCircle size={18} /> : checkedIn ? <Clock size={18} /> : <LogIn size={18} />}
        </div>
        <div className="min-w-0">
          <p className="font-display font-semibold text-foreground text-sm">
            {checkedOut ? "Day complete" : checkedIn ? "Checked in — working" : "Start your day"}
          </p>
          <p className="text-xs text-muted-foreground">
            {checkedIn ? `In: ${fmtTs(checkin?.checkInAt)}` : "Check in to mark today's attendance"}
            {checkedOut ? ` · Out: ${fmtTs(checkin?.checkOutAt)} · Sales ₹${(checkin?.totalSalesAmount || 0).toLocaleString("en-IN")}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!checkedIn && (
          <button
            onClick={handleCheckIn}
            disabled={busy !== null}
            className="h-9 px-4 rounded-lg bg-success text-white font-display font-semibold text-xs flex items-center gap-1.5 hover:bg-success/90 disabled:opacity-50 transition-colors"
          >
            {busy === "in" ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />} Check In
          </button>
        )}
        {checkedIn && !checkedOut && (
          <button
            onClick={handleCheckOut}
            disabled={busy !== null}
            className="h-9 px-4 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-xs flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {busy === "out" ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />} Check Out
          </button>
        )}
        {checkedOut && (
          <button
            onClick={resendReport}
            className="h-9 px-4 rounded-lg bg-accent border border-border text-foreground font-medium text-xs flex items-center gap-1.5 hover:bg-accent/80 transition-colors"
          >
            <Send size={13} /> Resend report
          </button>
        )}
      </div>
    </div>
  );
}

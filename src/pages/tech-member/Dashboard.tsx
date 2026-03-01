import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { format } from "date-fns";
import type { WorkSubmission } from "@/types";
import { motion } from "framer-motion";
import { BarChart3, CheckCircle, Clock, XCircle, Video } from "lucide-react";
import DashboardDayPicker from "@/components/dashboard/DayPicker";

export default function TechMemberDashboard() {
  const user = useAuthStore((s) => s.user);
  const [submissions, setSubmissions] = useState<WorkSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "work_submissions"), where("techMemberId", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setSubmissions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkSubmission)));
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const filtered = dateStr ? submissions.filter((s) => s.date === dateStr) : submissions;

  const totalVideos = filtered.reduce((s, w) => s + w.totalVideos, 0);
  const approved = filtered.filter((s) => s.status === "approved");
  const pending = filtered.filter((s) => s.status === "pending");
  const rejected = filtered.filter((s) => s.status === "rejected");
  const stats = [
    { label: "Submissions", value: filtered.length, icon: BarChart3, color: "text-info" },
    { label: "Total Videos", value: totalVideos, icon: Video, color: "text-primary" },
    { label: "Approved", value: approved.length, icon: CheckCircle, color: "text-success" },
    { label: "Pending", value: pending.length, icon: Clock, color: "text-warning" },
    { label: "Rejected", value: rejected.length, icon: XCircle, color: "text-destructive" },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
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
            {selectedDate ? `Showing data for ${format(selectedDate, "dd/MM/yyyy")}` : `Welcome back, ${user?.name}`}
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

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0, transition: { delay: i * 0.08 } }}
            className="bg-card border border-border rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <s.icon size={16} className={s.color} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <p className="font-display font-bold text-xl text-foreground">{s.value}</p>
          </motion.div>
        ))}
      </div>

      {filtered.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="font-display font-semibold text-foreground">
              {selectedDate ? `Submissions on ${format(selectedDate, "dd/MM/yyyy")}` : "Recent Submissions"}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="p-3 text-xs text-muted-foreground font-medium">Date</th>
                  <th className="p-3 text-xs text-muted-foreground font-medium">Videos</th>
                  <th className="p-3 text-xs text-muted-foreground font-medium">AI Check</th>
                  <th className="p-3 text-xs text-muted-foreground font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered
                  .sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0))
                  .slice(0, selectedDate ? 50 : 10)
                  .map((s) => (
                    <tr key={s.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                      <td className="p-3 font-mono text-muted-foreground text-xs">{s.date}</td>
                      <td className="p-3 text-foreground">{s.totalVideos}</td>
                      <td className="p-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          s.aiVerificationResult === "pass" ? "bg-success/15 text-success"
                          : s.aiVerificationResult === "fail" ? "bg-destructive/15 text-destructive"
                          : "bg-warning/15 text-warning"
                        }`}>
                          {s.aiVerificationResult}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          s.status === "approved" ? "bg-success/15 text-success"
                          : s.status === "rejected" ? "bg-destructive/15 text-destructive"
                          : "bg-warning/15 text-warning"
                        }`}>
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

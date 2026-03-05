import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { format } from "date-fns";
import type { WorkSubmission, WorkAssignment } from "@/types";
import { motion } from "framer-motion";
import { BarChart3, CheckCircle, Clock, XCircle, Video, Briefcase, Play, Edit3, AlertCircle } from "lucide-react";
import DashboardDayPicker from "@/components/dashboard/DayPicker";
import { useNavigate } from "react-router-dom";

export default function TechMemberDashboard() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<WorkSubmission[]>([]);
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    const qSub = query(collection(db, "work_submissions"), where("techMemberId", "==", user.uid));
    const unsub1 = onSnapshot(qSub, (snap) => {
      setSubmissions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkSubmission)));
      setLoading(false);
    });
    const qAssign = query(collection(db, "work_assignments"), where("assignedTo", "==", user.uid));
    const unsub2 = onSnapshot(qAssign, (snap) => {
      setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkAssignment)));
    });
    return () => { unsub1(); unsub2(); };
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

  // Today's assigned tasks + unfinished past tasks
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const activeTasks = assignments.filter(a =>
    ['assigned', 'in_progress', 'editing'].includes(a.status)
  );
  const todayTasks = activeTasks.filter(a => a.date === todayStr);
  const unfinishedPast = activeTasks.filter(a => a.date !== todayStr);

  const taskStatusConfig: Record<string, { icon: typeof Play; label: string; color: string }> = {
    assigned: { icon: Play, label: 'New', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    in_progress: { icon: Clock, label: 'In Progress', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    editing: { icon: Edit3, label: 'Needs Edit', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  };

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

      {/* Active Work Section */}
      {activeTasks.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase size={16} className="text-primary" />
              <h2 className="font-display font-semibold text-foreground">Active Work</h2>
              <span className="text-xs text-muted-foreground">({activeTasks.length} tasks)</span>
            </div>
            <button onClick={() => navigate('/tech/my-work')} className="text-xs text-primary hover:underline">View All</button>
          </div>
          <div className="p-4 space-y-3">
            {todayTasks.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Today's Tasks</p>
                {todayTasks.map(a => {
                  const cfg = taskStatusConfig[a.status];
                  return (
                    <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 mb-2 last:mb-0">
                      <div className="flex items-center space-x-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg?.color}`}>{cfg?.label}</span>
                        <div>
                          <p className="text-sm font-medium text-foreground">{a.businessName || a.displayTitle}</p>
                          <p className="text-xs text-muted-foreground capitalize">{a.category} · {a.clipCount} clips + EC · {a.duration} · Code: <span className="font-mono">{a.accessCode}</span></p>
                        </div>
                      </div>
                      <button onClick={() => navigate('/tech/my-work')} className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">Open</button>
                    </div>
                  );
                })}
              </div>
            )}
            {unfinishedPast.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <AlertCircle size={12} /> Previous Unfinished Tasks
                </p>
                {unfinishedPast.map(a => {
                  const cfg = taskStatusConfig[a.status];
                  return (
                    <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/10 mb-2 last:mb-0">
                      <div className="flex items-center space-x-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg?.color}`}>{cfg?.label}</span>
                        <div>
                          <p className="text-sm font-medium text-foreground">{a.businessName || a.displayTitle}</p>
                          <p className="text-xs text-muted-foreground capitalize">{a.category} · {a.clipCount} clips + EC · {a.duration} · From: {a.date} · Code: <span className="font-mono">{a.accessCode}</span></p>
                        </div>
                      </div>
                      <button onClick={() => navigate('/tech/my-work')} className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">Open</button>
                    </div>
                  );
                })}
              </div>
            )}
            {activeTasks.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No active tasks. You're all caught up!</p>
            )}
          </div>
        </div>
      )}

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

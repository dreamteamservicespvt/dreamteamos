import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency } from "@/utils/formatters";
import { format } from "date-fns";
import type { AppUser, WorkSubmission } from "@/types";
import { Users, Video, CheckCircle, Clock, TrendingUp } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import DashboardDayPicker from "@/components/dashboard/DayPicker";

export default function TechAdminDashboard() {
  const currentUser = useAuthStore((s) => s.user);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [submissions, setSubmissions] = useState<WorkSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    const unsubs: (() => void)[] = [];
    unsubs.push(onSnapshot(collection(db, "users"), (snap) => {
      const allUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
      setMembers(allUsers.filter((u) => u.role === "tech_member" && u.createdBy === currentUser?.uid));
    }));
    unsubs.push(onSnapshot(collection(db, "work_submissions"), (snap) => {
      setSubmissions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkSubmission)));
      setLoading(false);
    }));
    return () => unsubs.forEach((u) => u());
  }, [currentUser?.uid]);

  const memberIds = members.map((m) => m.uid);
  const teamSubs = submissions.filter((s) => memberIds.includes(s.techMemberId));

  // Filter by selected date
  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const filteredSubs = dateStr ? teamSubs.filter((s) => s.date === dateStr) : teamSubs;

  const approved = filteredSubs.filter((s) => s.status === "approved");
  const pending = filteredSubs.filter((s) => s.status === "pending");
  const totalVideos = approved.reduce((s, sub) => s + (sub.totalVideos || 0), 0);
  const totalRevenue = approved.reduce((s, sub) => s + (sub.calculatedRevenue || 0), 0);

  const chartData = members.map((m) => {
    const mSubs = filteredSubs.filter((s) => s.techMemberId === m.uid);
    const mApproved = mSubs.filter((s) => s.status === "approved");
    return {
      name: m.name?.split(" ")[0] || "?",
      videos: mApproved.reduce((s, sub) => s + (sub.totalVideos || 0), 0),
      submissions: mSubs.length,
      revenue: mApproved.reduce((s, sub) => s + (sub.calculatedRevenue || 0), 0),
    };
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Tech Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {selectedDate ? `Showing data for ${format(selectedDate, "dd/MM/yyyy")}` : "Overview of your team's work"}
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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-4">
        <StatBox icon={Users} label="Team Members" value={members.length} color="text-role-tech-member" />
        <StatBox icon={Video} label="Total Videos" value={totalVideos} color="text-info" />
        <StatBox icon={Clock} label="Pending" value={pending.length} color="text-warning" />
        <StatBox icon={CheckCircle} label="Submissions" value={filteredSubs.length} color="text-success" />
        <StatBox icon={TrendingUp} label="Revenue" value={formatCurrency(totalRevenue)} color="text-primary" />
      </div>

      {pending.length > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-center gap-3">
          <Clock size={18} className="text-warning" />
          <p className="text-sm text-warning font-medium">
            {pending.length} submission{pending.length > 1 ? "s" : ""} awaiting your approval
          </p>
        </div>
      )}

      {chartData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-3 md:p-5 overflow-hidden">
          <h3 className="font-display font-semibold text-foreground mb-3 md:mb-4 text-sm md:text-base">Team Performance</h3>
          <div className="-mx-2 md:mx-0">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ left: -10, right: 4, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 3.8% 16.1%)" />
                <XAxis dataKey="name" stroke="hsl(240 3.7% 65.9%)" fontSize={10} tick={{ fontSize: 10 }} />
                <YAxis stroke="hsl(240 3.7% 65.9%)" fontSize={10} tick={{ fontSize: 10 }} width={35} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(240 5.3% 7.1%)", border: "1px solid hsl(240 3.8% 16.1%)", borderRadius: "8px", fontSize: "11px" }} />
                <Bar dataKey="videos" name="Videos" fill="hsl(217.2 91.2% 59.8%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="submissions" name="Submissions" fill="hsl(142.1 70.6% 45.3%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden md:block bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-display font-semibold text-foreground">Member Summary</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-elevated/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Member</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Videos</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Submissions</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No team members yet. Add from "My Team".</td></tr>
            ) : (
              members.map((m, i) => {
                const d = chartData.find((c) => c.name === m.name?.split(" ")[0]);
                return (
                  <tr key={m.uid} className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${i % 2 === 1 ? "bg-elevated/20" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-md bg-role-tech-member/15 flex items-center justify-center font-display font-bold text-role-tech-member text-[10px]">
                          {m.name?.charAt(0)}
                        </div>
                        <span className="font-medium text-foreground">{m.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{d?.videos || 0}</td>
                    <td className="px-4 py-3 text-right font-mono">{d?.submissions || 0}</td>
                    <td className="px-4 py-3 text-right font-mono text-primary">{formatCurrency(d?.revenue || 0)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        <h3 className="font-display font-semibold text-foreground text-sm">Member Summary</h3>
        {members.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-6 text-center text-muted-foreground text-sm">No team members yet. Add from "My Team".</div>
        ) : (
          members.map((m) => {
            const d = chartData.find((c) => c.name === m.name?.split(" ")[0]);
            return (
              <div key={m.uid} className="bg-card border border-border rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-md bg-role-tech-member/15 flex items-center justify-center font-display font-bold text-role-tech-member text-xs">
                    {m.name?.charAt(0)}
                  </div>
                  <span className="font-medium text-foreground text-sm">{m.name}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center bg-background border border-border rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground">Videos</p>
                    <p className="font-mono font-bold text-sm text-foreground">{d?.videos || 0}</p>
                  </div>
                  <div className="text-center bg-background border border-border rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground">Subs</p>
                    <p className="font-mono font-bold text-sm text-foreground">{d?.submissions || 0}</p>
                  </div>
                  <div className="text-center bg-background border border-border rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground">Revenue</p>
                    <p className="font-mono font-bold text-sm text-primary">{formatCurrency(d?.revenue || 0)}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function StatBox({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-2.5 md:p-4">
      <div className="flex items-center gap-1.5 md:gap-2 mb-1 md:mb-2">
        <Icon size={14} className={`${color} md:hidden`} />
        <Icon size={16} className={`${color} hidden md:block`} />
        <span className="text-[10px] md:text-xs text-muted-foreground font-medium truncate">{label}</span>
      </div>
      <p className="font-display text-base md:text-xl font-bold text-foreground truncate">{value}</p>
    </div>
  );
}

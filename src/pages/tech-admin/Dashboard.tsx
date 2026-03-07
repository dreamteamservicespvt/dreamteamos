import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency } from "@/utils/formatters";
import { format, subDays, startOfDay } from "date-fns";
import type { AppUser, WorkSubmission, WorkAssignment } from "@/types";
import { Users, Video, CheckCircle, Clock, TrendingUp, ArrowDownUp, ClipboardList } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import DashboardDayPicker from "@/components/dashboard/DayPicker";

export default function TechAdminDashboard() {
  const currentUser = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [members, setMembers] = useState<AppUser[]>([]);
  const [submissions, setSubmissions] = useState<WorkSubmission[]>([]);
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [dayFilter, setDayFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'high' | 'low'>(() => (localStorage.getItem('dash_sortOrder') as 'high' | 'low') || 'high');
  const [sortBy, setSortBy] = useState<'videos' | 'assigned'>(() => (localStorage.getItem('dash_sortBy') as 'videos' | 'assigned') || 'videos');

  useEffect(() => { localStorage.setItem('dash_sortOrder', sortOrder); }, [sortOrder]);
  useEffect(() => { localStorage.setItem('dash_sortBy', sortBy); }, [sortBy]);

  // Generate recent 5 days for dropdown
  const recentDays = (() => {
    const days: { date: Date; dateStr: string; label: string }[] = [];
    for (let i = 0; i < 5; i++) {
      const d = subDays(new Date(), i);
      const today = startOfDay(new Date());
      const target = startOfDay(d);
      const diffMs = today.getTime() - target.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      const label = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Yesterday' : `${diffDays} days ago`;
      days.push({ date: startOfDay(d), dateStr: format(d, 'yyyy-MM-dd'), label });
    }
    return days;
  })();

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
    unsubs.push(onSnapshot(collection(db, "work_assignments"), (snap) => {
      setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkAssignment)));
    }));
    return () => unsubs.forEach((u) => u());
  }, [currentUser?.uid]);

  const memberIds = members.map((m) => m.uid);
  const teamSubs = submissions.filter((s) => memberIds.includes(s.techMemberId));

  // Filter by selected date or day filter
  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const filteredSubs = (() => {
    if (dateStr) return teamSubs.filter((s) => s.date === dateStr);
    if (dayFilter !== 'all') {
      const dayIndex = parseInt(dayFilter);
      const dayDateStr = recentDays[dayIndex]?.dateStr;
      if (dayDateStr) return teamSubs.filter((s) => s.date === dayDateStr);
    }
    return teamSubs;
  })();

  const filterLabel = selectedDate
    ? format(selectedDate, "dd/MM/yyyy")
    : dayFilter === 'all'
      ? 'All Days'
      : recentDays[parseInt(dayFilter)]?.label || 'All Days';

  const approved = filteredSubs.filter((s) => s.status === "approved");
  const pending = filteredSubs.filter((s) => s.status === "pending");
  const totalVideos = approved.reduce((s, sub) => s + (sub.totalVideos || 0), 0);
  const totalRevenue = approved.reduce((s, sub) => s + (sub.calculatedRevenue || 0), 0);

  // Assignments filtered to current user's team
  const teamAssignments = assignments.filter((a) => memberIds.includes(a.assignedTo) && a.assignedBy === currentUser?.uid);

  const chartData = members.map((m) => {
    const mSubs = filteredSubs.filter((s) => s.techMemberId === m.uid);
    const mApproved = mSubs.filter((s) => s.status === "approved");
    const mAssigned = teamAssignments.filter((a) => a.assignedTo === m.uid && (a.status === 'assigned' || a.status === 'in_progress'));

    // Category breakdown from approved submission items
    const categoryBreakdown = { wishes: 0, promotional: 0, cinematic: 0 };
    mApproved.forEach((sub) => {
      sub.items?.forEach((item) => {
        if (item.type in categoryBreakdown) {
          categoryBreakdown[item.type as keyof typeof categoryBreakdown] += item.quantity;
        }
      });
    });

    return {
      uid: m.uid,
      name: m.name?.split(" ")[0] || "?",
      fullName: m.name || "?",
      initial: m.name?.charAt(0) || "?",
      videos: mApproved.reduce((s, sub) => s + (sub.totalVideos || 0), 0),
      submissions: mSubs.length,
      revenue: mApproved.reduce((s, sub) => s + (sub.calculatedRevenue || 0), 0),
      assigned: mAssigned.length,
      categoryBreakdown,
    };
  });

  // Sorted data for table and mobile cards
  const sortedChartData = [...chartData].sort((a, b) => {
    const field = sortBy === 'assigned' ? 'assigned' : 'videos';
    return sortOrder === 'high' ? b[field] - a[field] : a[field] - b[field];
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold text-foreground">Tech Dashboard</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-1">
            {selectedDate ? `Showing data for ${format(selectedDate, "dd/MM/yyyy")}` : dayFilter !== 'all' ? `Showing data for ${recentDays[parseInt(dayFilter)]?.label}` : "Overview of your team's work"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!selectedDate && (
            <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}
              className="border rounded-lg px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none">
              <option value="all">All Days</option>
              {recentDays.map((d, i) => (
                <option key={d.dateStr} value={String(i)}>{d.label} ({format(d.date, "dd/MM")})</option>
              ))}
            </select>
          )}
          <DashboardDayPicker selectedDate={selectedDate} onSelect={(d) => { setSelectedDate(d); if (d) setDayFilter('all'); }} />
          {(selectedDate || dayFilter !== 'all') && (
            <button onClick={() => { setSelectedDate(undefined); setDayFilter('all'); }} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
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
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="font-display font-semibold text-foreground">Member Summary</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{filterLabel}</span>
            <button onClick={() => { setSortBy('videos'); setSortOrder(prev => sortBy === 'videos' ? (prev === 'high' ? 'low' : 'high') : 'high'); }}
              className={`flex items-center gap-1 border rounded-lg px-2 py-1 text-xs transition-colors ${sortBy === 'videos' ? 'bg-primary/10 text-primary border-primary/30' : 'bg-background text-foreground border-border hover:bg-accent/50'}`}>
              <ArrowDownUp size={12} />
              Videos {sortBy === 'videos' ? (sortOrder === 'high' ? '↓' : '↑') : ''}
            </button>
            <button onClick={() => { setSortBy('assigned'); setSortOrder(prev => sortBy === 'assigned' ? (prev === 'high' ? 'low' : 'high') : 'high'); }}
              className={`flex items-center gap-1 border rounded-lg px-2 py-1 text-xs transition-colors ${sortBy === 'assigned' ? 'bg-primary/10 text-primary border-primary/30' : 'bg-background text-foreground border-border hover:bg-accent/50'}`}>
              <ArrowDownUp size={12} />
              Assigned {sortBy === 'assigned' ? (sortOrder === 'high' ? '↓' : '↑') : ''}
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-elevated/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Member</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Assigned</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Videos</th>
              <th className="text-center px-3 py-3 font-medium text-muted-foreground text-[11px]">W / P / C</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Revenue</th>
              <th className="text-center px-3 py-3 font-medium text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody>
            {sortedChartData.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No team members yet. Add from "My Team".</td></tr>
            ) : (
              sortedChartData.map((d, i) => (
                  <tr key={d.uid} className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${i % 2 === 1 ? "bg-elevated/20" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate(`/tech-admin/team/${d.uid}`)}>
                        <div className="w-7 h-7 rounded-md bg-role-tech-member/15 flex items-center justify-center font-display font-bold text-role-tech-member text-[10px]">
                          {d.initial}
                        </div>
                        <span className="font-medium text-foreground hover:text-primary transition-colors">{d.fullName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full text-xs font-bold ${d.assigned > 0 ? 'bg-warning/15 text-warning' : 'text-muted-foreground'}`}>
                        {d.assigned}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{d.videos}</td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-1 text-[11px] font-mono">
                        <span className="text-pink-400">{d.categoryBreakdown.wishes}</span>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-blue-400">{d.categoryBreakdown.promotional}</span>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-amber-400">{d.categoryBreakdown.cinematic}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-primary">{formatCurrency(d.revenue)}</td>
                    <td className="px-3 py-3 text-center">
                      <button onClick={() => navigate(`/tech-admin/work-assign?member=${d.uid}`)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                        <ClipboardList size={12} />
                        Assign
                      </button>
                    </td>
                  </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-foreground text-sm">Member Summary</h3>
          <div className="flex items-center gap-1">
            <button onClick={() => { setSortBy('videos'); setSortOrder(prev => sortBy === 'videos' ? (prev === 'high' ? 'low' : 'high') : 'high'); }}
              className={`flex items-center gap-1 border rounded-lg px-1.5 py-1 text-[10px] transition-colors ${sortBy === 'videos' ? 'bg-primary/10 text-primary border-primary/30' : 'bg-background text-foreground border-border'}`}>
              <ArrowDownUp size={10} />
              Videos {sortBy === 'videos' ? (sortOrder === 'high' ? '↓' : '↑') : ''}
            </button>
            <button onClick={() => { setSortBy('assigned'); setSortOrder(prev => sortBy === 'assigned' ? (prev === 'high' ? 'low' : 'high') : 'high'); }}
              className={`flex items-center gap-1 border rounded-lg px-1.5 py-1 text-[10px] transition-colors ${sortBy === 'assigned' ? 'bg-primary/10 text-primary border-primary/30' : 'bg-background text-foreground border-border'}`}>
              <ArrowDownUp size={10} />
              Assigned {sortBy === 'assigned' ? (sortOrder === 'high' ? '↓' : '↑') : ''}
            </button>
          </div>
        </div>
        {sortedChartData.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-6 text-center text-muted-foreground text-sm">No team members yet. Add from "My Team".</div>
        ) : (
          sortedChartData.map((d) => (
              <div key={d.uid} className="bg-card border border-border rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate(`/tech-admin/team/${d.uid}`)}>
                    <div className="w-8 h-8 rounded-md bg-role-tech-member/15 flex items-center justify-center font-display font-bold text-role-tech-member text-xs">
                      {d.initial}
                    </div>
                    <div>
                      <span className="font-medium text-foreground text-sm hover:text-primary transition-colors">{d.fullName}</span>
                      {d.assigned > 0 && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-warning/15 text-warning">
                          {d.assigned} assigned
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => navigate(`/tech-admin/work-assign?member=${d.uid}`)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                    <ClipboardList size={11} />
                    Assign
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div className="text-center bg-background border border-border rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground">Videos</p>
                    <p className="font-mono font-bold text-sm text-foreground">{d.videos}</p>
                  </div>
                  <div className="text-center bg-background border border-border rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground">W / P / C</p>
                    <p className="font-mono font-bold text-[11px] text-foreground">
                      <span className="text-pink-400">{d.categoryBreakdown.wishes}</span>
                      {' / '}
                      <span className="text-blue-400">{d.categoryBreakdown.promotional}</span>
                      {' / '}
                      <span className="text-amber-400">{d.categoryBreakdown.cinematic}</span>
                    </p>
                  </div>
                  <div className="text-center bg-background border border-border rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground">Revenue</p>
                    <p className="font-mono font-bold text-sm text-primary">{formatCurrency(d.revenue)}</p>
                  </div>
                </div>
              </div>
          ))
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

import { useState, useEffect } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { getRoleLabel, getRoleColor } from "@/utils/roleHelpers";
import { formatCurrency, formatDate } from "@/utils/formatters";
import type { AppUser } from "@/types";
import { Code, Users, Video, CheckCircle, Clock, AlertCircle } from "lucide-react";

export default function TechDepartment() {
  const [techAdmins, setTechAdmins] = useState<AppUser[]>([]);
  const [techMembers, setTechMembers] = useState<AppUser[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    let loaded = 0;
    const checkDone = () => { loaded++; if (loaded >= 2) setLoading(false); };
    const unsubs: (() => void)[] = [];
    unsubs.push(onSnapshot(collection(db, "users"), (snap) => {
      const allUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
      setTechAdmins(allUsers.filter((u) => u.role === "tech_admin"));
      setTechMembers(allUsers.filter((u) => u.role === "tech_member"));
      checkDone();
    }));
    unsubs.push(onSnapshot(collection(db, "work_assignments"), (snap) => { setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); checkDone(); }));
    return () => unsubs.forEach((u) => u());
  }, []);

  const todayAssignments = assignments.filter((a) => a.date === today);
  const verifiedToday = todayAssignments.filter((a) => a.status === "verified");
  const inProgressToday = todayAssignments.filter((a) => ["assigned", "in_progress"].includes(a.status));
  const totalVideosToday = verifiedToday.reduce((s, a) => s + (a.clipCount || 0), 0);
  const totalRevToday = verifiedToday.reduce((s, a) => s + (a.totalPrice || 0), 0);

  const memberData = techMembers.map((m) => {
    const memberAssignments = assignments.filter((a) => a.assignedTo === m.uid);
    const todayMemberAssignments = memberAssignments.filter((a) => a.date === today);
    const todayVideos = todayMemberAssignments.filter((a) => a.status === "verified").reduce((s, a) => s + (a.clipCount || 0), 0);
    const totalVideos = memberAssignments.filter((a) => a.status === "verified").reduce((s, a) => s + (a.clipCount || 0), 0);
    const todayStatus = todayMemberAssignments.length > 0 ? todayMemberAssignments[0].status : "no_work";
    return { ...m, todayVideos, totalVideos, todayStatus, totalAssignments: memberAssignments.length };
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 md:h-24 bg-card border border-border rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Tech Department</h1>
        <p className="text-muted-foreground text-sm mt-1">Monitor tech team performance and submissions</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatBox icon={Users} label="Tech Members" value={techMembers.length} color="text-info" />
        <StatBox icon={Video} label="Videos Today" value={totalVideosToday} color="text-success" />
        <StatBox icon={Clock} label="In Progress" value={inProgressToday.length} color="text-warning" />
        <StatBox icon={Code} label="Revenue Today" value={formatCurrency(totalRevToday)} color="text-primary" />
      </div>

      {/* Tech Admins */}
      {techAdmins.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 md:p-5">
          <h3 className="font-display font-semibold text-foreground mb-3">Tech Admins</h3>
          <div className="flex flex-wrap gap-3">
            {techAdmins.map((a) => (
              <div key={a.uid} className="flex items-center gap-3 bg-background border border-border rounded-lg px-3 md:px-4 py-2 md:py-3">
                <div className="w-8 h-8 rounded-lg bg-role-tech-admin/15 flex items-center justify-center font-display font-bold text-role-tech-admin text-xs">
                  {a.name?.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{a.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.email}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${a.isActive ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                  {a.isActive ? "Active" : "Inactive"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tech Members */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-border">
          <h3 className="font-display font-semibold text-foreground">Tech Members</h3>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-elevated/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Member</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Today's Videos</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total Videos</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Assignments</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Today's Status</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Account</th>
              </tr>
            </thead>
            <tbody>
              {memberData.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">No tech members yet</td></tr>
              ) : (
                memberData.map((m, i) => (
                  <tr key={m.uid} className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${i % 2 === 1 ? "bg-elevated/20" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-role-tech-member/15 flex items-center justify-center font-display font-bold text-role-tech-member text-xs">
                          {m.name?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-foreground">{m.todayVideos}</td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">{m.totalVideos}</td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">{m.totalAssignments}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={m.todayStatus} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`w-2 h-2 rounded-full inline-block ${m.isActive ? "bg-success" : "bg-destructive"}`} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-border/50">
          {memberData.length === 0 ? (
            <p className="px-4 py-8 text-center text-muted-foreground text-sm">No tech members yet</p>
          ) : (
            memberData.map((m) => (
              <div key={m.uid} className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-md bg-role-tech-member/15 flex items-center justify-center font-display font-bold text-role-tech-member text-[10px]">
                      {m.name?.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground text-sm truncate">{m.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{m.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={m.todayStatus} />
                    <span className={`w-2 h-2 rounded-full ${m.isActive ? "bg-success" : "bg-destructive"}`} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-muted-foreground text-[10px]">Today</p><p className="font-mono text-foreground">{m.todayVideos} videos</p></div>
                  <div><p className="text-muted-foreground text-[10px]">Total</p><p className="font-mono text-foreground">{m.totalVideos} videos</p></div>
                  <div className="text-right"><p className="text-muted-foreground text-[10px]">Assignments</p><p className="font-mono text-foreground">{m.totalAssignments}</p></div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] md:text-xs px-2 py-0.5 rounded-full ${
      status === "verified" ? "bg-success/15 text-success" :
      status === "completed" ? "bg-info/15 text-info" :
      status === "in_progress" || status === "assigned" ? "bg-warning/15 text-warning" :
      status === "editing" ? "bg-orange-500/15 text-orange-500" :
      "bg-muted text-muted-foreground"
    }`}>
      {status === "no_work" ? "N/A" : status.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}
    </span>
  );
}

function StatBox({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3 md:p-4">
      <div className="flex items-center gap-2 mb-1 md:mb-2">
        <Icon size={14} className={`md:w-4 md:h-4 ${color}`} />
        <span className="text-[10px] md:text-xs text-muted-foreground font-medium truncate">{label}</span>
      </div>
      <p className="font-display text-lg md:text-xl font-bold text-foreground truncate">{value}</p>
    </div>
  );
}
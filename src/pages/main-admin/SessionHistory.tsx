import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/services/firebase";
import { formatDate, formatTime } from "@/utils/formatters";
import { getRoleLabel, getRoleColor } from "@/utils/roleHelpers";
import type { AppUser } from "@/types";
import { Clock, Download, Users, Filter } from "lucide-react";

interface Session {
  id: string;
  userId: string;
  loginAt: any;
  logoutAt: any;
  duration: number;
}

export default function SessionHistory() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberFilter, setMemberFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  useEffect(() => {
    let loaded = 0;
    const checkDone = () => { loaded++; if (loaded >= 2) setLoading(false); };
    const unsubs: (() => void)[] = [];
    unsubs.push(onSnapshot(collection(db, "sessions"), (snap) => {
      setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Session)).sort((a, b) => (b.loginAt?.seconds || 0) - (a.loginAt?.seconds || 0)));
      checkDone();
    }));
    unsubs.push(onSnapshot(collection(db, "users"), (snap) => { setMembers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser))); checkDone(); }));
    return () => unsubs.forEach((u) => u());
  }, []);

  const getMember = (uid: string) => members.find((m) => m.uid === uid);

  const filtered = sessions.filter((s) => {
    const member = getMember(s.userId);
    if (memberFilter !== "all" && s.userId !== memberFilter) return false;
    if (roleFilter !== "all" && member?.role !== roleFilter) return false;
    return true;
  });

  const totalHours = filtered.reduce((s, sess) => s + (sess.duration || 0), 0) / 60;

  const exportCSV = () => {
    const rows = [["Member", "Role", "Login", "Logout", "Duration (min)"]];
    filtered.forEach((s) => {
      const m = getMember(s.userId);
      rows.push([
        m?.name || "Unknown",
        m ? getRoleLabel(m.role) : "",
        s.loginAt?.toDate?.() ? s.loginAt.toDate().toISOString() : "",
        s.logoutAt?.toDate?.() ? s.logoutAt.toDate().toISOString() : "Active",
        String(s.duration || 0),
      ]);
    });
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "session-history.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const getDurationColor = (mins: number) => {
    if (mins < 60) return "text-warning";
    if (mins <= 240) return "text-success";
    return "text-info";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Session History</h1>
          <p className="text-muted-foreground text-sm mt-1">Track login/logout activity across the team</p>
        </div>
        <button
          onClick={exportCSV}
          className="h-9 px-3 md:px-4 rounded-lg bg-accent text-foreground text-sm font-medium flex items-center gap-2 border border-border hover:bg-accent/80 transition-colors"
        >
          <Download size={14} /> <span className="hidden sm:inline">Export CSV</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 md:gap-3 flex-wrap">
        <select
          value={memberFilter}
          onChange={(e) => setMemberFilter(e.target.value)}
          className="h-9 px-3 rounded-lg bg-card border border-border text-foreground text-sm outline-none focus:border-primary max-w-[140px] md:max-w-none"
        >
          <option value="all">All Members</option>
          {members.map((m) => (
            <option key={m.uid} value={m.uid}>{m.name}</option>
          ))}
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-9 px-3 rounded-lg bg-card border border-border text-foreground text-sm outline-none focus:border-primary max-w-[140px] md:max-w-none"
        >
          <option value="all">All Roles</option>
          <option value="main_admin">Main Admin</option>
          <option value="tech_admin">Tech Admin</option>
          <option value="sales_admin">Sales Admin</option>
          <option value="accounts_admin">Accounts Admin</option>
          <option value="tech_member">Tech Member</option>
          <option value="sales_member">Sales Member</option>
        </select>
        <span className="ml-auto text-[10px] md:text-xs text-muted-foreground font-mono">
          {totalHours.toFixed(1)}hrs · {filtered.length} sessions
        </span>
      </div>

      {/* Table / Cards */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-elevated/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Member</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Login Time</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Logout Time</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Duration</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-24" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <Clock size={32} className="mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-muted-foreground text-sm">No sessions found</p>
                  </td>
                </tr>
              ) : (
                filtered.map((s, i) => {
                  const member = getMember(s.userId);
                  const loginDate = s.loginAt?.toDate?.();
                  const logoutDate = s.logoutAt?.toDate?.();
                  return (
                    <tr key={s.id} className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${i % 2 === 1 ? "bg-elevated/20" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-md bg-primary/15 flex items-center justify-center font-display font-bold text-primary text-[10px]">
                            {member?.name?.charAt(0) || "?"}
                          </div>
                          <span className="font-medium text-foreground">{member?.name || "Unknown"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {member && (
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${getRoleColor(member.role)}`}>
                            {getRoleLabel(member.role)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                        {loginDate ? `${formatDate(loginDate)} ${formatTime(loginDate)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                        {logoutDate ? `${formatDate(logoutDate)} ${formatTime(logoutDate)}` : (
                          <span className="text-success flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-success animate-live-dot" /> Active
                          </span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono text-sm ${getDurationColor(s.duration || 0)}`}>
                        {s.duration ? `${Math.floor(s.duration / 60)}h ${s.duration % 60}m` : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-border/50">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-3 space-y-2">
                <div className="h-4 bg-muted rounded animate-pulse w-32" />
                <div className="h-3 bg-muted rounded animate-pulse w-48" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Clock size={32} className="mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-muted-foreground text-sm">No sessions found</p>
            </div>
          ) : (
            filtered.map((s) => {
              const member = getMember(s.userId);
              const loginDate = s.loginAt?.toDate?.();
              const logoutDate = s.logoutAt?.toDate?.();
              return (
                <div key={s.id} className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center font-display font-bold text-primary text-[9px]">
                        {member?.name?.charAt(0) || "?"}
                      </div>
                      <span className="font-medium text-foreground text-sm">{member?.name || "Unknown"}</span>
                    </div>
                    {member && (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${getRoleColor(member.role)}`}>
                        {getRoleLabel(member.role)}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground text-[10px]">Login</p>
                      <p className="font-mono text-muted-foreground">{loginDate ? `${formatDate(loginDate)} ${formatTime(loginDate)}` : "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[10px]">Logout</p>
                      {logoutDate ? (
                        <p className="font-mono text-muted-foreground">{formatDate(logoutDate)} {formatTime(logoutDate)}</p>
                      ) : (
                        <span className="text-success flex items-center gap-1 text-[10px]">
                          <span className="w-1 h-1 rounded-full bg-success animate-live-dot" /> Active
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-muted-foreground text-[10px]">Duration</p>
                      <p className={`font-mono ${getDurationColor(s.duration || 0)}`}>
                        {s.duration ? `${Math.floor(s.duration / 60)}h ${s.duration % 60}m` : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
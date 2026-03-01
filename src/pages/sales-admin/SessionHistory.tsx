import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { formatDate, formatTime } from "@/utils/formatters";
import { getRoleLabel, getRoleColor } from "@/utils/roleHelpers";
import type { AppUser } from "@/types";
import { Clock, Download } from "lucide-react";

interface Session {
  id: string;
  userId: string;
  loginAt: any;
  logoutAt: any;
  duration: number;
}

export default function SalesAdminSessionHistory() {
  const currentUser = useAuthStore((s) => s.user);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberFilter, setMemberFilter] = useState("all");

  useEffect(() => {
    let loaded = 0;
    const checkDone = () => { loaded++; if (loaded >= 2) setLoading(false); };
    const unsubs: (() => void)[] = [];
    let myMemberIds: string[] = [];

    unsubs.push(onSnapshot(collection(db, "users"), (snap) => {
      const allUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
      const myMembers = allUsers.filter((u) => u.role === "sales_member" && u.createdBy === currentUser?.uid);
      const relevantIds = [currentUser?.uid || "", ...myMembers.map((m) => m.uid)];
      setMembers([allUsers.find((u) => u.uid === currentUser?.uid)!, ...myMembers].filter(Boolean));
      myMemberIds = relevantIds;
      checkDone();
    }));

    unsubs.push(onSnapshot(collection(db, "sessions"), (snap) => {
      setSessions(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Session))
          .filter((s) => myMemberIds.includes(s.userId))
          .sort((a, b) => (b.loginAt?.seconds || 0) - (a.loginAt?.seconds || 0))
      );
      checkDone();
    }));
    return () => unsubs.forEach((u) => u());
  }, [currentUser?.uid]);

  const getMember = (uid: string) => members.find((m) => m.uid === uid);

  const filtered = memberFilter === "all" ? sessions : sessions.filter((s) => s.userId === memberFilter);

  const exportCSV = () => {
    const rows = [["Member", "Login", "Logout", "Duration (min)"]];
    filtered.forEach((s) => {
      const m = getMember(s.userId);
      rows.push([
        m?.name || "Unknown",
        s.loginAt?.toDate?.() ? s.loginAt.toDate().toISOString() : "",
        s.logoutAt?.toDate?.() ? s.logoutAt.toDate().toISOString() : "Active",
        String(s.duration || 0),
      ]);
    });
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "sales-sessions.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Session History</h1>
          <p className="text-muted-foreground text-sm mt-1">Track your team's login activity</p>
        </div>
        <button onClick={exportCSV}
          className="h-9 px-4 rounded-lg bg-accent text-foreground text-sm font-medium flex items-center gap-2 border border-border hover:bg-accent/80 transition-colors">
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="flex items-center gap-3">
        <select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)}
          className="h-9 px-3 rounded-lg bg-card border border-border text-foreground text-sm outline-none focus:border-primary">
          <option value="all">All Members</option>
          {members.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
        </select>
        <span className="ml-auto text-xs text-muted-foreground font-mono">{filtered.length} sessions</span>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-elevated/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Member</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Login</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Logout</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Duration</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 4 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-24" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-12 text-center">
                <Clock size={32} className="mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-muted-foreground text-sm">No sessions found</p>
              </td></tr>
            ) : (
              filtered.map((s, i) => {
                const member = getMember(s.userId);
                const login = s.loginAt?.toDate?.();
                const logout = s.logoutAt?.toDate?.();
                return (
                  <tr key={s.id} className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${i % 2 === 1 ? "bg-elevated/20" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-md bg-role-sales-admin/15 flex items-center justify-center font-display font-bold text-role-sales-admin text-[10px]">
                          {member?.name?.charAt(0) || "?"}
                        </div>
                        <span className="font-medium text-foreground">{member?.name || "Unknown"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                      {login ? `${formatDate(login)} ${formatTime(login)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                      {logout ? `${formatDate(logout)} ${formatTime(logout)}` : (
                        <span className="text-success flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-success animate-live-dot" /> Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-foreground">
                      {s.duration ? `${Math.floor(s.duration / 60)}h ${s.duration % 60}m` : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

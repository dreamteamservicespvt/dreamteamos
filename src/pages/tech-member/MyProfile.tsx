import { useState, useEffect } from "react";
import { doc, updateDoc, serverTimestamp, collection, query, where, onSnapshot } from "firebase/firestore";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { auth, db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/utils/formatters";
import { User, Mail, Phone, Shield, Loader2, Check, Lock, ExternalLink, Receipt, Calendar, Video } from "lucide-react";
import SalaryTimeline from "@/components/SalaryTimeline";
import ThemeSelector from "@/components/ThemeSelector";
import type { DailyCheckin } from "@/types";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, getDay } from "date-fns";

export default function TechMemberProfile() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [saving, setSaving] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [calMonth, setCalMonth] = useState(new Date());
  const [selectedCheckin, setSelectedCheckin] = useState<DailyCheckin | null>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "daily_checkins"), where("memberId", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setCheckins(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DailyCheckin)));
    });
    return unsub;
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), { name: name.trim(), phone: phone.trim(), updatedAt: serverTimestamp() });
      toast({ title: "Profile Updated" });
    } catch {
      toast({ title: "Error", description: "Failed to update profile.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!auth.currentUser || !currentPw || newPw.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }
    setChangingPw(true);
    try {
      const cred = EmailAuthProvider.credential(auth.currentUser.email!, currentPw);
      await reauthenticateWithCredential(auth.currentUser, cred);
      await updatePassword(auth.currentUser, newPw);
      setCurrentPw("");
      setNewPw("");
      toast({ title: "Password Changed" });
    } catch {
      toast({ title: "Error", description: "Current password is incorrect.", variant: "destructive" });
    } finally {
      setChangingPw(false);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">My Profile</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account details</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-role-tech-member/15 text-role-tech-member flex items-center justify-center">
            <User size={24} />
          </div>
          <div>
            <p className="font-display font-bold text-foreground text-lg">{user.name}</p>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-role-tech-member/15 text-role-tech-member capitalize">Tech Member</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Email</label>
            <div className="h-10 px-3 rounded-lg bg-background border border-border flex items-center gap-2 text-sm text-muted-foreground">
              <Mail size={14} /> {user.email}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Role</label>
            <div className="h-10 px-3 rounded-lg bg-background border border-border flex items-center gap-2 text-sm text-muted-foreground">
              <Shield size={14} /> Tech Member
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary transition-colors" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary transition-colors" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-background border border-border rounded-lg p-3">
            <span className="text-xs text-muted-foreground">Salary</span>
            <p className="font-display font-bold text-foreground">{formatCurrency(user.salary || 0)}</p>
          </div>
          <div className="bg-background border border-border rounded-lg p-3">
            <span className="text-xs text-muted-foreground">Target</span>
            <p className="font-display font-bold text-foreground">{formatCurrency(user.target || 0)}</p>
          </div>
        </div>

        {user.googleDriveBaseUrl && (
          <a href={user.googleDriveBaseUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline mb-6">
            <ExternalLink size={14} /> My Drive Folder
          </a>
        )}

        <button onClick={handleSave} disabled={saving}
          className="h-9 px-5 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-xs hover:bg-primary/90 disabled:opacity-40 transition-colors flex items-center gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {/* Salary History */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <Receipt size={16} /> Salary History
        </h2>
        <SalaryTimeline userId={user.uid} />
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <Lock size={16} /> Change Password
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <input type="password" placeholder="Current password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)}
            className="w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/40" />
          <input type="password" placeholder="New password (min 6)" value={newPw} onChange={(e) => setNewPw(e.target.value)}
            className="w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/40" />
        </div>
        <button onClick={handlePasswordChange} disabled={changingPw || !currentPw || newPw.length < 6}
          className="h-9 px-5 rounded-lg bg-accent text-foreground font-display font-semibold text-xs hover:bg-accent/80 disabled:opacity-40 transition-colors flex items-center gap-2 border border-border">
          {changingPw ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
          {changingPw ? "Changing..." : "Update Password"}
        </button>
      </div>

      {/* Check-In History Calendar */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <Calendar size={16} /> Check-In History
        </h2>

        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1))}
            className="text-xs px-2 py-1 rounded bg-accent text-muted-foreground border border-border hover:text-foreground">&lt;</button>
          <span className="text-sm font-medium text-foreground">{format(calMonth, "MMMM yyyy")}</span>
          <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1))}
            className="text-xs px-2 py-1 rounded bg-accent text-muted-foreground border border-border hover:text-foreground">&gt;</button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground mb-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <span key={d}>{d}</span>)}
        </div>

        {(() => {
          const monthStart = startOfMonth(calMonth);
          const monthEnd = endOfMonth(calMonth);
          const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
          const startPad = getDay(monthStart);
          const checkinMap = new Map(checkins.map((c) => [c.date, c]));

          return (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}
              {days.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const ci = checkinMap.get(dateStr);
                const hasCheckout = ci?.checkedOutAt;
                const today = isToday(day);

                return (
                  <button
                    key={dateStr}
                    onClick={() => ci && setSelectedCheckin(ci)}
                    className={`aspect-square rounded-md flex items-center justify-center text-xs font-mono transition-colors relative ${
                      ci
                        ? ci.status === "approved"
                          ? "bg-success/20 text-success hover:bg-success/30 cursor-pointer"
                          : ci.status === "rejected"
                          ? "bg-destructive/20 text-destructive hover:bg-destructive/30 cursor-pointer"
                          : ci.status === "pending_approval"
                          ? "bg-warning/20 text-warning hover:bg-warning/30 cursor-pointer"
                          : hasCheckout
                          ? "bg-info/20 text-info hover:bg-info/30 cursor-pointer"
                          : "bg-primary/20 text-primary hover:bg-primary/30 cursor-pointer"
                        : today
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {day.getDate()}
                    {ci && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-current" />}
                  </button>
                );
              })}
            </div>
          );
        })()}

        <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-success/30" /> Approved</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-warning/30" /> Pending</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-destructive/30" /> Rejected</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-info/30" /> Checked out</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-primary/30" /> Checked in</span>
        </div>

        {/* Selected day detail */}
        {selectedCheckin && (
          <div className="mt-4 p-3 bg-background border border-border rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-foreground font-medium">{selectedCheckin.date}</span>
                {selectedCheckin.status && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize ${
                    selectedCheckin.status === "approved" ? "bg-success/15 text-success"
                    : selectedCheckin.status === "rejected" ? "bg-destructive/15 text-destructive"
                    : selectedCheckin.status === "pending_approval" ? "bg-warning/15 text-warning"
                    : "bg-info/15 text-info"
                  }`}>{selectedCheckin.status === "pending_approval" ? "Pending" : selectedCheckin.status}</span>
                )}
              </div>
              <button onClick={() => setSelectedCheckin(null)} className="text-xs text-muted-foreground hover:text-foreground">×</button>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>In: {selectedCheckin.checkedInAt?.toDate?.() ? format(selectedCheckin.checkedInAt.toDate(), "hh:mm a") : "—"}</span>
              {selectedCheckin.checkedOutAt && (
                <span>Out: {selectedCheckin.checkedOutAt?.toDate?.() ? format(selectedCheckin.checkedOutAt.toDate(), "hh:mm a") : "—"}</span>
              )}
              {selectedCheckin.totalVideos != null && (
                <span className="flex items-center gap-1"><Video size={10} /> {selectedCheckin.totalVideos} videos</span>
              )}
              {selectedCheckin.aiVerificationResult && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  selectedCheckin.aiVerificationResult === "pass" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                }`}>AI: {selectedCheckin.aiVerificationResult}</span>
              )}
            </div>
            {selectedCheckin.summary && (
              <p className="text-xs text-foreground">{selectedCheckin.summary}</p>
            )}
            {selectedCheckin.driveFolderUrl && (
              <a href={selectedCheckin.driveFolderUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1">
                <ExternalLink size={10} /> Drive Folder
              </a>
            )}
          </div>
        )}
      </div>

      <ThemeSelector />
    </div>
  );
}

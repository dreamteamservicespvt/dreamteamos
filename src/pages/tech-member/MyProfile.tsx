import { useState } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { auth, db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/utils/formatters";
import { User, Mail, Phone, Shield, Loader2, Check, Lock, ExternalLink, Receipt } from "lucide-react";
import SalaryTimeline from "@/components/SalaryTimeline";
import ThemeSelector from "@/components/ThemeSelector";

export default function TechMemberProfile() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [saving, setSaving] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [changingPw, setChangingPw] = useState(false);

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

      <ThemeSelector />
    </div>
  );
}

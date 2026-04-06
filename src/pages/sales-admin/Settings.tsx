import { useState, useEffect } from "react";
import { doc, updateDoc, serverTimestamp, getDoc, setDoc } from "firebase/firestore";
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { auth, db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { getRoleLabel, getRoleColor } from "@/utils/roleHelpers";
import { User, Lock, Loader2, Check, Eye, EyeOff, Wallet, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import ThemeSelector from "@/components/ThemeSelector";
import { FESTIVALS, getUpcomingFestivalName, getFestivalOptionLabel } from "@/utils/festivals";

export default function SalesAdminSettings() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { toast } = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [activeFestival, setActiveFestival] = useState<string>(getUpcomingFestivalName());
  const [savingFestival, setSavingFestival] = useState(false);
  const [festivalSaved, setFestivalSaved] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "settings", "salesConfig")).then((snap) => {
      const val: string | undefined = snap.data()?.activeFestival;
      if (val) setActiveFestival(val);
    }).catch(() => { /* keep default */ });
  }, []);

  const handleSaveFestival = async () => {
    setSavingFestival(true);
    try {
      await setDoc(doc(db, "settings", "salesConfig"), {
        activeFestival,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setFestivalSaved(true);
      toast({ title: "Festival updated", description: `Active festival set to "${activeFestival}" for all sales members.` });
      setTimeout(() => setFestivalSaved(false), 2000);
    } catch {
      toast({ title: "Error", description: "Failed to save festival.", variant: "destructive" });
    } finally {
      setSavingFestival(false);
    }
  };

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim()) return;
    setSavingProfile(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        name: name.trim(), phone: phone.trim(), updatedAt: serverTimestamp(),
      });
      setUser({ ...user, name: name.trim(), phone: phone.trim() });
      toast({ title: "Saved", description: "Profile updated." });
    } catch {
      toast({ title: "Error", description: "Failed to update.", variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast({ title: "Error", description: "Min 6 characters.", variant: "destructive" }); return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "Passwords don't match.", variant: "destructive" }); return;
    }
    setChangingPassword(true);
    try {
      const fbUser = auth.currentUser;
      if (!fbUser?.email) throw new Error("Not authenticated");
      await reauthenticateWithCredential(fbUser, EmailAuthProvider.credential(fbUser.email, currentPassword));
      await updatePassword(fbUser, newPassword);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      toast({ title: "Success", description: "Password changed." });
    } catch (err: any) {
      const msg = err.code === "auth/wrong-password" || err.code === "auth/invalid-credential"
        ? "Current password is incorrect." : "Failed to change password.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-lg md:text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-xs md:text-sm mt-1">Manage your profile and security</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 md:p-6">
        <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
          <div className="w-10 h-10 md:w-14 md:h-14 rounded-xl bg-role-sales-admin/15 flex items-center justify-center font-display font-bold text-role-sales-admin text-base md:text-xl shrink-0">
            {user.name?.charAt(0) || "S"}
          </div>
          <div className="min-w-0">
            <p className="font-display font-bold text-base md:text-lg text-foreground truncate">{user.name}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={`text-[10px] md:text-[11px] font-medium px-2 py-0.5 rounded-full ${getRoleColor(user.role)}`}>{getRoleLabel(user.role)}</span>
              <span className="text-[10px] md:text-xs text-muted-foreground truncate">{user.email}</span>
            </div>
          </div>
        </div>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2"><User size={14} /> Profile</div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Display Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />
          </div>
          <button type="submit" disabled={savingProfile}
            className="h-10 px-6 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {savingProfile ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {savingProfile ? "Saving..." : "Save"}
          </button>
        </form>
      </div>

      {/* Salary */}
      <button onClick={() => navigate("/sales-admin/salary")}
        className="w-full bg-card border border-border rounded-xl p-5 flex items-center gap-4 hover:bg-accent/30 transition-colors text-left">
        <div className="w-10 h-10 rounded-lg bg-warning/15 flex items-center justify-center">
          <Wallet size={18} className="text-warning" />
        </div>
        <div>
          <p className="font-display font-semibold text-foreground">My Salary</p>
          <p className="text-xs text-muted-foreground mt-0.5">View salary receipts & payment history</p>
        </div>
      </button>

      <div className="bg-card border border-border rounded-xl p-4 md:p-6">
        <div className="flex items-center gap-2 text-xs md:text-sm font-medium text-muted-foreground mb-4"><Lock size={14} /> Change Password</div>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Current Password</label>
            <div className="relative">
              <input type={showCurrent ? "text" : "password"} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required
                className="w-full h-10 px-4 pr-10 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">New Password</label>
            <div className="relative">
              <input type={showNew ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6}
                className="w-full h-10 px-4 pr-10 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />
              <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Confirm New Password</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required
              className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />
          </div>
          <button type="submit" disabled={changingPassword}
            className="h-10 px-6 rounded-lg bg-accent text-foreground font-medium text-sm border border-border hover:bg-accent/80 disabled:opacity-50 flex items-center gap-2">
            {changingPassword ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />} {changingPassword ? "Changing..." : "Change Password"}
          </button>
        </form>
      </div>

      {/* Festival Settings */}
      <div className="bg-card border border-border rounded-xl p-4 md:p-6">
        <div className="flex items-center gap-2 text-xs md:text-sm font-medium text-muted-foreground mb-1">
          <Calendar size={14} /> Active Festival for Sales Scripts
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Select the current/upcoming festival — all sales members will see this as the default in their call scripts.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Festival</label>
            <select
              value={activeFestival}
              onChange={(e) => setActiveFestival(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary"
            >
              {FESTIVALS.map((f) => (
                <option key={f.name} value={f.name}>
                  {getFestivalOptionLabel(f)}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleSaveFestival}
            disabled={savingFestival}
            className="h-10 px-6 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {savingFestival ? (
              <Loader2 size={14} className="animate-spin" />
            ) : festivalSaved ? (
              <Check size={14} />
            ) : (
              <Calendar size={14} />
            )}
            {savingFestival ? "Saving..." : festivalSaved ? "Saved!" : "Set Active Festival"}
          </button>
        </div>
      </div>

      <ThemeSelector />
    </div>
  );
}

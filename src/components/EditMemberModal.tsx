import { useState } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import { normalizePhone, formatPhoneDisplay } from "@/utils/phone";
import type { AppUser } from "@/types";
import { X, Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface EditMemberModalProps {
  member: AppUser;
  onClose: () => void;
  onUpdated: (updated: AppUser) => void;
  variant: "sales" | "tech";
}

export default function EditMemberModal({ member, onClose, onUpdated, variant }: EditMemberModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState(member.name);
  const [phone, setPhone] = useState(member.phone || "");
  const [salary, setSalary] = useState(member.salary || 0);
  const [target, setTarget] = useState(member.target || 0);
  const [dailyTarget, setDailyTarget] = useState(member.dailyTarget || 0);
  const [monthlyTarget, setMonthlyTarget] = useState(member.monthlyTarget || 0);
  const [driveUrl, setDriveUrl] = useState(member.googleDriveBaseUrl || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "Error", description: "Name is required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const normalizedPhone = phone.trim() ? normalizePhone(phone.trim()) : "";
      const updates: Record<string, any> = {
        name: name.trim(),
        phone: normalizedPhone,
        salary,
        updatedAt: serverTimestamp(),
      };

      if (variant === "sales") {
        updates.target = target;
        updates.dailyTarget = dailyTarget;
        updates.monthlyTarget = monthlyTarget;
      } else {
        updates.googleDriveBaseUrl = driveUrl.trim() || null;
      }

      await updateDoc(doc(db, "users", member.uid), updates);

      const updated: AppUser = {
        ...member,
        ...updates,
        phone: normalizedPhone,
        updatedAt: new Date(),
      };
      onUpdated(updated);
      onClose();
      toast({ title: "Updated", description: `${name.trim()} details saved.` });
    } catch {
      toast({ title: "Error", description: "Failed to update member.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-bold text-lg text-foreground">Edit Member</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Full Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
              className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
            <input type="email" value={member.email} disabled
              className="w-full h-10 px-4 rounded-lg bg-muted border border-border text-muted-foreground text-sm outline-none cursor-not-allowed" />
            <p className="text-[10px] text-muted-foreground mt-0.5">Email cannot be changed</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210"
              className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />
            <p className="text-[10px] text-muted-foreground mt-0.5">+91 will be added automatically</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Salary (₹)</label>
            <input type="number" min={0} value={salary || ""} onChange={(e) => setSalary(Number(e.target.value) || 0)}
              className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono" />
          </div>

          {variant === "sales" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Daily Target (₹)</label>
                  <input type="number" min={0} value={dailyTarget || ""} onChange={(e) => setDailyTarget(Number(e.target.value) || 0)}
                    className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Monthly Target (₹)</label>
                  <input type="number" min={0} value={monthlyTarget || ""} onChange={(e) => setMonthlyTarget(Number(e.target.value) || 0)}
                    className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Legacy Target (₹)</label>
                <input type="number" min={0} value={target || ""} onChange={(e) => setTarget(Number(e.target.value) || 0)}
                  className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono" />
              </div>
            </>
          )}

          {variant === "tech" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Google Drive Base URL</label>
              <input type="url" value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/..."
                className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary placeholder:text-muted-foreground/40" />
            </div>
          )}

          <button type="submit" disabled={saving}
            className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 mt-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  );
}

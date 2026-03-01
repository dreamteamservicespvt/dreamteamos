import { useState, useEffect } from "react";
import { collection, onSnapshot, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import type { AppUser } from "@/types";
import { FolderOpen, ExternalLink, Edit3, Check, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function DriveManagement() {
  const currentUser = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [members, setMembers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const all = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
      setMembers(all.filter((u) => u.role === "tech_member" && u.createdBy === currentUser?.uid));
      setLoading(false);
    });
    return unsub;
  }, [currentUser?.uid]);

  const handleSave = async (uid: string) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", uid), {
        googleDriveBaseUrl: editUrl.trim(),
        updatedAt: serverTimestamp(),
      });
      setMembers((prev) => prev.map((m) => m.uid === uid ? { ...m, googleDriveBaseUrl: editUrl.trim() } : m));
      setEditingUid(null);
      toast({ title: "Saved", description: "Drive URL updated." });
    } catch {
      toast({ title: "Error", description: "Failed to update.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Drive Management</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage Google Drive folders for each team member</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 bg-card border border-border rounded-xl animate-pulse" />)}
        </div>
      ) : members.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <FolderOpen size={32} className="mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-muted-foreground text-sm">No team members yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {members.map((m) => (
            <div key={m.uid} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-role-tech-member/15 flex items-center justify-center font-display font-bold text-role-tech-member">
                    {m.name?.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </div>
                </div>
                {editingUid !== m.uid && (
                  <button onClick={() => { setEditingUid(m.uid); setEditUrl(m.googleDriveBaseUrl || ""); }}
                    className="h-8 px-3 rounded-md text-xs font-medium text-muted-foreground border border-border hover:bg-accent hover:text-foreground transition-colors flex items-center gap-1">
                    <Edit3 size={12} /> Edit URL
                  </button>
                )}
              </div>

              {editingUid === m.uid ? (
                <div className="mt-3 flex gap-2">
                  <input type="url" value={editUrl} onChange={(e) => setEditUrl(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..."
                    className="flex-1 h-9 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary placeholder:text-muted-foreground/40 font-mono" />
                  <button onClick={() => handleSave(m.uid)} disabled={saving}
                    className="h-9 px-3 rounded-lg bg-success/15 text-success hover:bg-success/25 transition-colors flex items-center gap-1 text-xs font-medium">
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
                  </button>
                  <button onClick={() => setEditingUid(null)}
                    className="h-9 px-3 rounded-lg bg-accent text-foreground hover:bg-accent/80 transition-colors flex items-center gap-1 text-xs font-medium border border-border">
                    <X size={12} /> Cancel
                  </button>
                </div>
              ) : (
                <div className="mt-2">
                  {m.googleDriveBaseUrl ? (
                    <a href={m.googleDriveBaseUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-info flex items-center gap-1 hover:underline font-mono truncate">
                      <ExternalLink size={12} /> {m.googleDriveBaseUrl}
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground">No Drive URL configured</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

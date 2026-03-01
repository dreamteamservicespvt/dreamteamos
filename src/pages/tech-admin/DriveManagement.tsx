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
        <h1 className="font-display text-lg md:text-2xl font-bold text-foreground">Drive Management</h1>
        <p className="text-muted-foreground text-xs md:text-sm mt-1">Manage Google Drive folders for each team member</p>
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
            <div key={m.uid} className="bg-card border border-border rounded-xl p-3 md:p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 md:gap-3 min-w-0">
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-role-tech-member/15 flex items-center justify-center font-display font-bold text-role-tech-member text-sm md:text-base shrink-0">
                    {m.name?.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground text-sm md:text-base truncate">{m.name}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>
                </div>
                {editingUid !== m.uid && (
                  <button onClick={() => { setEditingUid(m.uid); setEditUrl(m.googleDriveBaseUrl || ""); }}
                    className="h-7 md:h-8 px-2 md:px-3 rounded-md text-[10px] md:text-xs font-medium text-muted-foreground border border-border hover:bg-accent hover:text-foreground transition-colors flex items-center gap-1 shrink-0">
                    <Edit3 size={12} /> <span className="hidden sm:inline">Edit URL</span><span className="sm:hidden">Edit</span>
                  </button>
                )}
              </div>

              {editingUid === m.uid ? (
                <div className="mt-3 space-y-2 sm:space-y-0 sm:flex sm:gap-2">
                  <input type="url" value={editUrl} onChange={(e) => setEditUrl(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..."
                    className="w-full sm:flex-1 h-9 px-3 rounded-lg bg-background border border-border text-foreground text-xs md:text-sm outline-none focus:border-primary placeholder:text-muted-foreground/40 font-mono" />
                  <div className="flex gap-2">
                    <button onClick={() => handleSave(m.uid)} disabled={saving}
                      className="flex-1 sm:flex-none h-9 px-3 rounded-lg bg-success/15 text-success hover:bg-success/25 transition-colors flex items-center justify-center gap-1 text-xs font-medium">
                      {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
                    </button>
                    <button onClick={() => setEditingUid(null)}
                      className="flex-1 sm:flex-none h-9 px-3 rounded-lg bg-accent text-foreground hover:bg-accent/80 transition-colors flex items-center justify-center gap-1 text-xs font-medium border border-border">
                      <X size={12} /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2">
                  {m.googleDriveBaseUrl ? (
                    <a href={m.googleDriveBaseUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 h-7 md:h-8 px-2.5 md:px-3 rounded-lg bg-info/10 text-info hover:bg-info/20 transition-colors text-[10px] md:text-xs font-medium">
                      <FolderOpen size={12} className="shrink-0" />
                      Open Drive
                      <ExternalLink size={10} className="shrink-0" />
                    </a>
                  ) : (
                    <p className="text-[10px] md:text-xs text-muted-foreground">No Drive URL configured</p>
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

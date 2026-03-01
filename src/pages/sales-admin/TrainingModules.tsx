import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import { uploadToCloudinary } from "@/services/cloudinary";
import { useAuthStore } from "@/store/authStore";
import { BookOpen, Plus, Trash2, Loader2, ExternalLink, Upload, File, Image, Video, Music, FileText, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ModuleFile {
  name: string;
  url: string;
  type: string; // "image" | "video" | "audio" | "pdf" | "text" | "other"
}

interface TrainingModule {
  id: string;
  title: string;
  purpose: string;
  files: ModuleFile[];
  addedBy: string;
  department: string;
  createdAt: any;
}

function getFileType(file: File): string {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("text/")) return "text";
  return "other";
}

function getFileIcon(type: string) {
  switch (type) {
    case "image": return <Image size={14} className="text-info" />;
    case "video": return <Video size={14} className="text-primary" />;
    case "audio": return <Music size={14} className="text-warning" />;
    case "pdf": return <FileText size={14} className="text-destructive" />;
    default: return <File size={14} className="text-muted-foreground" />;
  }
}

export default function TrainingModules() {
  const currentUser = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [adding, setAdding] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    const fetch = async () => {
      try {
        const snap = await getDocs(collection(db, "training_modules"));
        const all = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as TrainingModule))
          .filter((m) => m.department === "sales")
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setModules(all);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    setPendingFiles((prev) => [...prev, ...selected]);
    e.target.value = "";
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast({ title: "Error", description: "Title is required.", variant: "destructive" });
      return;
    }
    if (pendingFiles.length === 0) {
      toast({ title: "Error", description: "Please add at least one file.", variant: "destructive" });
      return;
    }
    setAdding(true);
    setUploadProgress(0);
    try {
      const uploadedFiles: ModuleFile[] = [];
      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i];
        setUploadProgress(Math.round(((i) / pendingFiles.length) * 100));
        const url = await uploadToCloudinary(file);
        uploadedFiles.push({
          name: file.name,
          url,
          type: getFileType(file),
        });
      }
      setUploadProgress(100);

      const docRef = await addDoc(collection(db, "training_modules"), {
        title: title.trim(),
        purpose: purpose.trim(),
        files: uploadedFiles,
        addedBy: currentUser?.uid || "",
        department: "sales",
        createdAt: serverTimestamp(),
      });

      setModules((prev) => [{
        id: docRef.id,
        title: title.trim(),
        purpose: purpose.trim(),
        files: uploadedFiles,
        addedBy: currentUser?.uid || "",
        department: "sales",
        createdAt: { seconds: Date.now() / 1000 },
      }, ...prev]);

      setTitle(""); setPurpose(""); setPendingFiles([]); setShowAdd(false);
      toast({ title: "Added", description: "Training module added." });
    } catch {
      toast({ title: "Error", description: "Failed to add module.", variant: "destructive" });
    } finally {
      setAdding(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this training module?")) return;
    try {
      await deleteDoc(doc(db, "training_modules", id));
      setModules((prev) => prev.filter((m) => m.id !== id));
      toast({ title: "Deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-lg md:text-2xl font-bold text-foreground">Training Modules</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-1">Create and manage training resources for your team</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="h-8 md:h-9 px-3 md:px-4 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-xs md:text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors shrink-0">
          <Plus size={14} /> <span className="hidden sm:inline">Add Module</span><span className="sm:hidden">Add</span>
        </button>
      </div>

      {/* Add Form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="bg-card border border-border rounded-xl p-3 md:p-5 space-y-3 md:space-y-4">
          <h3 className="font-display font-semibold text-foreground text-sm md:text-base">New Training Module</h3>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Title *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Module title" required
              className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary placeholder:text-muted-foreground/40" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Purpose</label>
            <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="What is this module about?" rows={2}
              className="w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary placeholder:text-muted-foreground/40 resize-none" />
          </div>

          {/* File Upload Area */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Files (text, image, video, audio, pdf) *</label>
            <label className="block cursor-pointer">
              <div className="border-2 border-dashed border-border rounded-lg p-4 md:p-6 text-center hover:border-primary/50 transition-colors">
                <Upload size={20} className="mx-auto text-muted-foreground/50 mb-2 md:hidden" />
                <Upload size={24} className="mx-auto text-muted-foreground/50 mb-2 hidden md:block" />
                <p className="text-xs md:text-sm text-muted-foreground">Click to add files</p>
                <p className="text-[10px] md:text-xs text-muted-foreground/60 mt-1">Supports images, videos, audio, PDFs, and text files</p>
              </div>
              <input type="file" multiple accept="image/*,video/*,audio/*,.pdf,.txt,.doc,.docx" className="hidden" onChange={handleFileSelect} />
            </label>
          </div>

          {/* Pending Files */}
          {pendingFiles.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">{pendingFiles.length} file(s) selected</span>
              {pendingFiles.map((file, i) => (
                <div key={i} className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2">
                  {getFileIcon(getFileType(file))}
                  <span className="text-xs text-foreground flex-1 truncate">{file.name}</span>
                  <span className="text-[10px] text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)}MB</span>
                  <button type="button" onClick={() => removePendingFile(i)} className="text-muted-foreground hover:text-destructive">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {adding && uploadProgress > 0 && (
            <div className="space-y-1">
              <div className="h-2 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">Uploading... {uploadProgress}%</p>
            </div>
          )}

          <div className="flex gap-2">
            <button type="submit" disabled={adding}
              className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1">
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add Module
            </button>
            <button type="button" onClick={() => { setShowAdd(false); setPendingFiles([]); }}
              className="h-10 px-4 rounded-lg bg-accent text-foreground text-sm border border-border hover:bg-accent/80">Cancel</button>
          </div>
        </form>
      )}

      {/* Modules Grid */}
      {modules.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <BookOpen size={32} className="mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-muted-foreground text-sm">No training modules yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map((m) => (
            <div key={m.id} className="bg-card border border-border rounded-xl p-5 flex flex-col">
              <div className="flex items-start justify-between mb-2">
                <BookOpen size={18} className="text-primary mt-0.5" />
                <button onClick={() => handleDelete(m.id)}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
              <h3 className="font-display font-semibold text-foreground mb-1">{m.title}</h3>
              {m.purpose && <p className="text-xs text-muted-foreground mb-3">{m.purpose}</p>}

              {/* Files list */}
              <div className="space-y-1.5 mt-auto">
                {(m.files || []).map((file, i) => (
                  <a key={i} href={file.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-foreground hover:text-primary transition-colors bg-background border border-border rounded-md px-2.5 py-1.5">
                    {getFileIcon(file.type)}
                    <span className="truncate flex-1">{file.name}</span>
                    <ExternalLink size={10} className="text-muted-foreground shrink-0" />
                  </a>
                ))}
                {/* Legacy support for old modules with url field */}
                {!(m.files?.length) && (m as any).url && (
                  <a href={(m as any).url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-primary hover:underline">
                    <ExternalLink size={12} /> Open Resource
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

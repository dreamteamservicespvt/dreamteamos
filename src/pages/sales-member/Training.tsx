import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { BookOpen, ArrowLeft, Image, Video, Music, FileText, File } from "lucide-react";
import { motion } from "framer-motion";

interface ModuleFile {
  name: string;
  url: string;
  type: string;
}

interface TrainingModule {
  id: string;
  title: string;
  purpose?: string;
  description?: string;
  files?: ModuleFile[];
  url?: string;
  type?: string;
  category?: string;
  createdAt: any;
}

function getFileIcon(type: string) {
  switch (type) {
    case "image": return <Image size={16} className="text-info" />;
    case "video": return <Video size={16} className="text-primary" />;
    case "audio": return <Music size={16} className="text-warning" />;
    case "pdf": return <FileText size={16} className="text-destructive" />;
    default: return <File size={16} className="text-muted-foreground" />;
  }
}

function renderFileContent(file: ModuleFile) {
  switch (file.type) {
    case "image":
      return <img src={file.url} alt={file.name} className="w-full rounded-lg max-h-[70vh] object-contain" />;
    case "video":
      return <video src={file.url} controls className="w-full rounded-lg max-h-[70vh]" />;
    case "audio":
      return (
        <div className="bg-background border border-border rounded-lg p-4">
          <p className="text-sm text-foreground mb-2">{file.name}</p>
          <audio src={file.url} controls className="w-full" />
        </div>
      );
    case "pdf":
      return <iframe src={file.url} className="w-full h-[70vh] rounded-lg border border-border" title={file.name} />;
    default:
      return (
        <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-primary text-sm underline">
          Open: {file.name}
        </a>
      );
  }
}

export default function SalesMemberTraining() {
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "training_modules"), where("department", "in", ["sales", "all"]));
    const unsub = onSnapshot(q, (snap) => {
      setModules(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TrainingModule)));
      setLoading(false);
    });
    return unsub;
  }, []);

  const selectedModule = modules.find((m) => m.id === selected);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 h-40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Full-page module view
  if (selectedModule) {
    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} /> Back to modules
        </button>

        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">{selectedModule.title}</h1>
          {(selectedModule.purpose || selectedModule.description) && (
            <p className="text-muted-foreground text-sm mt-1">{selectedModule.purpose || selectedModule.description}</p>
          )}
        </div>

        <div className="space-y-6">
          {selectedModule.files && selectedModule.files.length > 0 ? (
            selectedModule.files.map((file, fi) => (
              <div key={fi} className="bg-card border border-border rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  {getFileIcon(file.type)}
                  <span className="text-sm text-foreground font-medium">{file.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-muted-foreground capitalize">{file.type}</span>
                </div>
                {renderFileContent(file)}
              </div>
            ))
          ) : selectedModule.url ? (
            <div className="bg-card border border-border rounded-xl p-5">
              <a href={selectedModule.url} target="_blank" rel="noopener noreferrer" className="text-primary underline text-sm">
                Open resource
              </a>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <p className="text-muted-foreground text-sm">No content available</p>
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Training</h1>
        <p className="text-muted-foreground text-sm mt-1">Sales resources and learning modules</p>
      </div>

      {modules.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <BookOpen size={32} className="mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-muted-foreground text-sm">No training modules available yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {modules.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }}
              onClick={() => setSelected(m.id)}
              className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <BookOpen size={14} />
                </div>
                {m.files && m.files.length > 0 && (
                  <div className="flex gap-1">
                    {[...new Set(m.files.map(f => f.type))].map(t => (
                      <span key={t} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent text-muted-foreground capitalize">{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <h3 className="font-display font-semibold text-foreground group-hover:text-primary transition-colors mb-1">{m.title}</h3>
              <p className="text-xs text-muted-foreground line-clamp-2">{m.purpose || m.description}</p>
              {m.files && <p className="text-[10px] text-muted-foreground/60 mt-2">{m.files.length} file(s) • Click to view</p>}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

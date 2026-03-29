import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { useCinematicAdsStore } from "@/store/cinematicAdsStore";
import { generateClientBrief } from "@/services/cinematicAdsService";
import {
  FILE_CATEGORIES_INFO,
  TARGET_PLATFORMS,
  DURATION_OPTIONS,
  LANGUAGES,
  type UploadedFile,
  type TargetPlatform,
  type ClientBrief,
} from "@/types/cinematicAds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Upload,
  X,
  FileText,
  Image as ImageIcon,
  FileAudio,
  Loader2,
  Sparkles,
  Pencil,
  Copy,
  Check,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

export default function Step0ClientOnboarding() {
  const {
    project,
    addFiles,
    removeFile,
    setPlatforms,
    setDuration,
    setCustomDuration,
    setLanguage,
    setDialectNotes,
    setBrief,
    updateBrief,
    confirmBrief,
    setProcessing,
    processing,
    processingMessage,
  } = useCinematicAdsStore();

  const [editingBrief, setEditingBrief] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  if (!project) return null;

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length === 0) return;
      const mapped = classifyFiles(droppedFiles);
      addFiles(mapped);
    },
    [addFiles],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files || []);
      if (selected.length === 0) return;
      const mapped = classifyFiles(selected);
      addFiles(mapped);
      e.target.value = "";
    },
    [addFiles],
  );

  const handleGenerate = useCallback(async () => {
    const hasLogo = project.uploadedFiles.some((f) => f.category === "logo");
    const hasCard = project.uploadedFiles.some((f) => f.category === "visiting_card");
    if (!hasLogo || !hasCard) {
      toast.error("Business Logo and Visiting Card are required");
      return;
    }
    if (project.selectedPlatforms.length === 0) {
      toast.error("Select at least one target platform");
      return;
    }
    const dur = project.selectedDuration === "custom" ? project.customDuration : project.selectedDuration;
    if (!dur || dur < 10) {
      toast.error("Please set a valid ad duration");
      return;
    }

    setProcessing(true, "Analyzing client materials and generating brief…");
    try {
      const brief = await generateClientBrief(
        project.uploadedFiles,
        project.selectedPlatforms,
        dur,
        project.selectedLanguage,
        project.dialectNotes,
      );
      setBrief(brief);
      toast.success("Client brief generated successfully!");
    } catch (err: any) {
      console.error("Brief generation failed:", err);
      toast.error(err?.message || "Failed to generate brief");
    } finally {
      setProcessing(false);
    }
  }, [project, setBrief, setProcessing]);

  const handleConfirmBrief = useCallback(() => {
    if (!project.clientBrief) return;
    confirmBrief();
    toast.success("Brief confirmed! Proceeding to Story Generation.");
  }, [project?.clientBrief, confirmBrief]);

  const handleCopyBrief = useCallback(() => {
    if (!project.clientBrief) return;
    const b = project.clientBrief;
    const text = `CLIENT BRIEF — ${b.businessName}\n\nBusiness Type: ${b.businessType}\nCore Services: ${b.coreServices}\nTarget Audience: ${b.targetAudience}\nKey Message: ${b.keyMessage}\nTone & Style: ${b.toneAndStyle}\nBrand Colors: ${b.brandColors.join(", ")}\nDuration: ${b.duration}s\nPlatforms: ${b.platforms.join(", ")}\nLanguage: ${b.language}\nDialect: ${b.dialect || "—"}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Brief copied to clipboard");
  }, [project?.clientBrief]);

  const getFileIcon = (type: string) => {
    if (type.startsWith("audio/")) return <FileAudio className="w-4 h-4 text-purple-500" />;
    if (type.startsWith("image/")) return <ImageIcon className="w-4 h-4 text-green-500" />;
    return <FileText className="w-4 h-4 text-blue-500" />;
  };

  const dur = project.selectedDuration === "custom" ? project.customDuration : project.selectedDuration;

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Client Materials
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File category legend */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
            {FILE_CATEGORIES_INFO.map((cat) => (
              <div key={cat.category} className="flex items-center gap-1.5">
                <div className={cn("w-2 h-2 rounded-full", cat.required ? "bg-red-500" : "bg-muted-foreground/40")} />
                <span className="font-medium">{cat.label}</span>
                <span className="text-muted-foreground">({cat.description})</span>
              </div>
            ))}
          </div>

          {/* Drag-and-drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
              dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50",
            )}
          >
            <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium">
              Drag & drop files here, or <span className="text-primary underline">browse</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Logo, Visiting Card, Voice Recording, Scripts, Documents, References, Brand Guidelines
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
              accept=".png,.svg,.jpg,.jpeg,.ai,.pdf,.mp3,.wav,.m4a,.ogg,.txt,.docx,.mp4"
            />
          </div>

          {/* Uploaded files list */}
          {project.uploadedFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Uploaded Files ({project.uploadedFiles.length})</p>
              <div className="grid gap-1.5">
                {project.uploadedFiles.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted/50 text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {getFileIcon(f.type)}
                      <span className="truncate">{f.name}</span>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {f.category.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeFile(f.id)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Project Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Target Platform */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Target Platform *</Label>
            <div className="flex flex-wrap gap-2">
              {TARGET_PLATFORMS.map((p) => (
                <label key={p.value} className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={project.selectedPlatforms.includes(p.value)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setPlatforms([...project.selectedPlatforms, p.value]);
                      } else {
                        setPlatforms(project.selectedPlatforms.filter((v) => v !== p.value));
                      }
                    }}
                  />
                  <span className="text-sm">{p.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Ad Duration */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Ad Duration *</Label>
            <div className="flex flex-wrap gap-2">
              {DURATION_OPTIONS.map((d) => (
                <Button
                  key={d}
                  variant={project.selectedDuration === d ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDuration(d)}
                >
                  {d} sec
                </Button>
              ))}
              <Button
                variant={project.selectedDuration === "custom" ? "default" : "outline"}
                size="sm"
                onClick={() => setDuration("custom")}
              >
                Custom
              </Button>
            </div>
            {project.selectedDuration === "custom" && (
              <Input
                type="number"
                min={10}
                max={300}
                value={project.customDuration}
                onChange={(e) => setCustomDuration(Number(e.target.value))}
                placeholder="Duration in seconds"
                className="w-40 mt-2"
              />
            )}
          </div>

          {/* Language & Dialect */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Language *</Label>
              <Select value={project.selectedLanguage} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Dialect Notes (optional)</Label>
              <Input
                value={project.dialectNotes}
                onChange={(e) => setDialectNotes(e.target.value)}
                placeholder='e.g., "Telangana dialect", "Mumbai Hindi"'
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Generate Brief Button */}
      {!project.clientBrief && (
        <Button
          className="w-full gap-2"
          size="lg"
          onClick={handleGenerate}
          disabled={processing}
        >
          {processing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {processingMessage}
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Generate Brief
            </>
          )}
        </Button>
      )}

      {/* Generated Brief */}
      {project.clientBrief && (
        <Card className="border-primary/30">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Client Brief Summary
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditingBrief(!editingBrief)}>
                <Pencil className="w-4 h-4 mr-1" />
                {editingBrief ? "Done" : "Edit"}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCopyBrief}>
                {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                {copied ? "Copied" : "Share"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <BriefDisplay
              brief={project.clientBrief}
              editing={editingBrief}
              onUpdate={updateBrief}
            />
            {!project.briefConfirmed && (
              <>
                <Separator className="my-4" />
                <Button className="w-full gap-2" size="lg" onClick={handleConfirmBrief}>
                  <ChevronRight className="w-5 h-5" />
                  Confirm & Proceed to Story Generation
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Brief Display / Edit Component ──

function BriefDisplay({
  brief,
  editing,
  onUpdate,
}: {
  brief: ClientBrief;
  editing: boolean;
  onUpdate: (partial: Partial<ClientBrief>) => void;
}) {
  const fields: { key: keyof ClientBrief; label: string }[] = [
    { key: "businessName", label: "Business Name" },
    { key: "businessType", label: "Business Type" },
    { key: "coreServices", label: "Core Services / Products" },
    { key: "targetAudience", label: "Target Audience" },
    { key: "keyMessage", label: "Key Message / USP" },
    { key: "toneAndStyle", label: "Tone & Style Direction" },
  ];

  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.key}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{f.label}</p>
          {editing ? (
            <Input
              value={String(brief[f.key] || "")}
              onChange={(e) => onUpdate({ [f.key]: e.target.value })}
              className="mt-1"
            />
          ) : (
            <p className="text-sm">{String(brief[f.key] || "—")}</p>
          )}
        </div>
      ))}

      {/* Brand Colors */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Brand Colors</p>
        <div className="flex items-center gap-2 mt-1">
          {brief.brandColors.map((color, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="w-6 h-6 rounded-md border" style={{ backgroundColor: color }} />
              <span className="text-xs font-mono">{color}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Duration & Platform */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Duration</p>
          <p className="text-sm">{brief.duration}s</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Language</p>
          <p className="text-sm">{brief.language}{brief.dialect ? ` (${brief.dialect})` : ""}</p>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Platforms</p>
        <div className="flex flex-wrap gap-1 mt-1">
          {brief.platforms.map((p) => (
            <Badge key={p} variant="secondary" className="text-xs">
              {p.replace(/_/g, " ")}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── File Classification Helper ──

function classifyFiles(files: File[]): UploadedFile[] {
  return files.map((file) => {
    let category: UploadedFile["category"] = "reference";
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();

    if (type.startsWith("audio/")) {
      category = "voice_recording";
    } else if (name.includes("logo") || name.includes("brand")) {
      category = type === "application/pdf" ? "brand_guidelines" : "logo";
    } else if (name.includes("card") || name.includes("visiting") || name.includes("business card")) {
      category = "visiting_card";
    } else if (name.includes("script") || name.includes("story")) {
      category = "script";
    } else if (name.includes("guideline") || name.includes("brand")) {
      category = "brand_guidelines";
    } else if (type === "application/pdf" || type.includes("document") || name.endsWith(".docx") || name.endsWith(".txt")) {
      category = "business_doc";
    } else if (type.startsWith("image/") && !name.includes("logo")) {
      category = "visiting_card";
    } else if (type.startsWith("video/")) {
      category = "reference";
    }

    return {
      id: Math.random().toString(36).slice(2, 10),
      file,
      name: file.name,
      type: file.type,
      category,
    };
  });
}

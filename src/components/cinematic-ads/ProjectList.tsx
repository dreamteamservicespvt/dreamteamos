import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useCinematicAdsStore } from "@/store/cinematicAdsStore";
import { PIPELINE_STEPS, type CinematicProjectSummary } from "@/types/cinematicAds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Check, Film, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userId: string;
}

/**
 * The landing screen: every project this person has, newest first.
 *
 * The list is scoped to its creator, so opening it costs a handful of reads rather than a
 * scan of every project in the company.
 */
export default function ProjectList({ userId }: Props) {
  const { projects, projectsLoading, refreshProjects, newProject, openProject, removeProject } =
    useCinematicAdsStore();

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CinematicProjectSummary | null>(null);

  useEffect(() => {
    if (userId) void refreshProjects(userId);
  }, [userId, refreshProjects]);

  const handleCreate = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Give the project a name — the client's business is usually best");
      return;
    }
    setCreating(true);
    try {
      await newProject(userId, trimmed);
      setName("");
    } finally {
      setCreating(false);
    }
  }, [name, newProject, userId]);

  const handleDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await removeProject(target.id);
      toast.success(`"${target.name}" deleted`);
    } catch (err: any) {
      toast.error(err?.message || "Could not delete that project");
    }
  }, [pendingDelete, removeProject]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="w-5 h-5" />
            New Project
          </CardTitle>
          <CardDescription>One project per ad. Everything is saved as you work.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
              placeholder="Client or business name"
              className="flex-1 min-w-0"
            />
            <Button onClick={() => void handleCreate()} disabled={creating} className="gap-1.5 shrink-0">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Your Projects</h2>
          {projectsLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>

        {!projectsLoading && projects.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="pt-6 text-center text-sm text-muted-foreground">
              <Film className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No projects yet. Name one above to begin.
            </CardContent>
          </Card>
        )}

        {projects.map((p) => (
          <Card key={p.id} className="transition-colors hover:border-primary/50">
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left"
                  onClick={() => void openProject(p.id)}
                >
                  <p className="font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[
                      p.businessName && p.businessName !== p.name ? p.businessName : null,
                      p.duration ? `${p.duration}s` : null,
                      p.language,
                      formatWhen(p.updatedAt),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>

                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge variant={p.delivered ? "default" : "secondary"} className="text-[10px]">
                      {p.delivered ? "Delivered" : PIPELINE_STEPS[p.currentStep]?.shortLabel || "Brief"}
                    </Badge>
                    <StepDots stepsCompleted={p.stepsCompleted} />
                  </div>
                </button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setPendingDelete(p)}
                  title="Delete project"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The brief, the story, every prompt and every approval in this project go with it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>Delete project</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StepDots({ stepsCompleted }: { stepsCompleted: CinematicProjectSummary["stepsCompleted"] }) {
  return (
    <div className="flex items-center gap-1">
      {PIPELINE_STEPS.map((step) => {
        const done = stepsCompleted?.[step.number as keyof typeof stepsCompleted];
        return (
          <span
            key={step.number}
            title={step.label}
            className={cn(
              "w-3.5 h-3.5 rounded-full flex items-center justify-center",
              done ? "bg-primary text-primary-foreground" : "bg-muted",
            )}
          >
            {done && <Check className="w-2.5 h-2.5" />}
          </span>
        );
      })}
    </div>
  );
}

function formatWhen(timestamp: number): string {
  if (!timestamp) return "";
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(timestamp).toLocaleDateString();
}

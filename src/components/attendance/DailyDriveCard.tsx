import { motion } from "framer-motion";
import { format } from "date-fns";
import { CheckCircle2, ExternalLink, FolderPlus, UploadCloud } from "lucide-react";
import type { AppUser } from "@/types";
import { driveFolderPath } from "@/utils/driveUpload";

/**
 * The day's Drive upload, on the page a tech member lands on when they log in.
 *
 * The Drive link already existed twice — a small line on the profile page, and a button inside the
 * check-out modal — and both are seen at the end of the day, or never. Work that is not uploaded is
 * not counted for the day, so the ask belongs where the day starts, with today's folder trail spelled
 * out: the same `Name → Month → Day N` that driveUpload names everywhere else, so nobody has to guess
 * what to call the folder they are about to create.
 */
export default function DailyDriveCard({
  user,
  /** Set once the member has declared the upload at check-out — the card then confirms instead of asking. */
  uploaded = false,
}: {
  user: AppUser;
  uploaded?: boolean;
}) {
  const now = new Date();
  const path = driveFolderPath(user.name, now);
  const driveUrl = user.googleDriveBaseUrl;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 }}
      data-test="daily-drive-card"
      className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 ${
        uploaded ? "border-success/40 bg-success/5" : "border-primary/40 bg-primary/5"
      }`}
    >
      {/* A quiet accent bar, so this reads as the day's one standing instruction. */}
      <div className={`absolute inset-y-0 left-0 w-1 ${uploaded ? "bg-success" : "bg-primary"}`} />

      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            uploaded ? "bg-success/15 text-success" : "bg-primary/15 text-primary"
          }`}
        >
          {uploaded ? <CheckCircle2 size={20} /> : <FolderPlus size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-bold text-foreground sm:text-lg">
            {uploaded ? "Today's work is uploaded" : "Upload today's work to your Drive"}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {uploaded
              ? "You confirmed the upload at check-out. Anything you make after this goes in the same day folder."
              : "Every day gets its own folder. Create today's day folder in your Drive and upload everything you make today into it."}
          </p>
        </div>
      </div>

      {/* Today's actual trail — never a generic example, because "Day 1" is ambiguous on the 14th. */}
      <div className="mt-3 rounded-xl border border-border bg-background p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Today's folder · {format(now, "EEEE, dd MMMM yyyy")}
        </p>
        <div className="flex flex-wrap items-center gap-1 text-xs">
          {path.map((part, idx) => (
            <span key={part} className="flex items-center gap-1">
              {idx > 0 && <span className="text-muted-foreground">›</span>}
              <span
                className={`rounded-md border px-1.5 py-0.5 font-medium ${
                  idx === path.length - 1
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border bg-card text-foreground"
                }`}
              >
                {part}
              </span>
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="text-muted-foreground">›</span>
            <span className="rounded-md border border-dashed border-border px-1.5 py-0.5 text-muted-foreground">
              Ad type
            </span>
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Create <b className="text-foreground">{path[path.length - 1]}</b> inside{" "}
          <b className="text-foreground">{path[path.length - 2]}</b> if it is not there yet, then a folder
          inside it for the kind of ad — for example <b className="text-foreground">2 Clips</b> or{" "}
          <b className="text-foreground">4 Clips</b> — and put that work in it.
        </p>
      </div>

      {driveUrl ? (
        <a
          href={driveUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-test="open-drive-daily"
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <UploadCloud size={16} /> Open my Drive folder <ExternalLink size={13} className="opacity-70" />
        </a>
      ) : (
        <div className="mt-3 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs text-foreground">
          No Drive folder is set for you yet — ask your admin to add it, then upload your work there.
        </div>
      )}

      {!uploaded && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Work that is not uploaded to the Drive is <b className="text-foreground">not counted for the day</b>.
        </p>
      )}
    </motion.section>
  );
}

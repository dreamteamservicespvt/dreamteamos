/**
 * "Now put it in your Drive" — the step that opens the moment a job is marked complete (2026-10-03).
 *
 * ── The problem it solves ─────────────────────────────────────────────────────────────────────
 * Uploading used to be one tick at check-out: "I have uploaded today's work". By then a member has
 * finished four or five jobs, the files all sit in Downloads called `VID_2026…mp4`, and matching each
 * one to its Day / clip-count folder is done from memory — so files went in the wrong folder or not
 * at all, and work not in the Drive is not counted for the day. The one moment the member knows,
 * for certain, which file it is and where it goes is the moment they finish it. So that is where the
 * Drive now appears.
 *
 * ── How it reads ──────────────────────────────────────────────────────────────────────────────
 * Three numbered steps, each one thing: open your folder · go to this folder · upload it with this
 * name. The folder trail is THIS job's (its day, and its clip count as the ad-type folder), every
 * folder name and the file name copy with one tap — for creating a missing folder or renaming the
 * file — and whatever the member should do next is always the loudest button on screen: "Open my
 * Drive folder" until they have, then "It's uploaded". "Later" is never hidden; the job card keeps an
 * "Upload to Drive" button and check-out lists what is still to go up.
 *
 * A declaration, like check-out's: the app cannot see inside a Drive, and people upload from another
 * device. No Drive link set → the member asks their admin with one tap instead of being stuck.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import {
  Check, CheckCircle2, ChevronRight, Copy, ExternalLink, FolderOpen, Loader2, Send, UploadCloud, X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { askAdminForDriveFolder, markDriveUploaded } from "@/services/workDrive";
import { driveFileName, isUploadedToDrive, jobDrivePath, needsDriveUpload } from "@/utils/driveUpload";
import { isPosterCategory } from "@/utils/posterSpec";
import type { AppUser, WorkAssignment } from "@/types";

type Member = Pick<AppUser, "uid" | "name" | "createdBy" | "googleDriveBaseUrl">;

/** `yyyy-MM-dd` → a local Date, so a job reopened tomorrow still points at the day it was finished. */
function dayOf(iso?: string): Date {
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date();
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older WebViews: the textarea route still works where the Clipboard API is refused.
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export default function DriveUploadSheet({ assignment, user, justCompleted, onClose }: {
  assignment: WorkAssignment;
  user: Member;
  /** Opened by Mark Complete — the header celebrates the submit. Otherwise it was opened from a job card. */
  justCompleted: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const alreadyUploaded = isUploadedToDrive(assignment);
  const poster = isPosterCategory(assignment.category);
  const what = poster ? "poster" : "video";
  const path = alreadyUploaded && assignment.driveUploadPath?.length
    ? assignment.driveUploadPath
    : jobDrivePath(user.name, assignment, dayOf(assignment.completedDate));
  const fileName = (alreadyUploaded && assignment.driveFileName) || driveFileName(assignment);
  const driveUrl = (user.googleDriveBaseUrl || "").trim();

  const [opened, setOpened] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [asked, setAsked] = useState(false);
  const [asking, setAsking] = useState(false);
  const primaryRef = useRef<HTMLButtonElement | HTMLAnchorElement | null>(null);

  // The next action has the focus, so Enter does the right thing on a laptop.
  useEffect(() => { primaryRef.current?.focus(); }, [opened]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const copy = async (key: string, text: string) => {
    if (await copyText(text)) {
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
    } else {
      toast({ title: "Couldn't copy", description: text });
    }
  };

  const confirmUploaded = async () => {
    setSaving(true);
    try {
      await markDriveUploaded(assignment, path, fileName);
      setSaved(true);
      window.setTimeout(onClose, 1300);
    } catch {
      toast({ title: "Not saved", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const askAdmin = async () => {
    setAsking(true);
    try {
      const sent = await askAdminForDriveFolder(user);
      setAsked(sent);
      if (!sent) toast({ title: "No admin found", description: "Tell your tech admin to add your Drive folder.", variant: "destructive" });
    } catch {
      toast({ title: "Not sent", description: "Try again in a moment.", variant: "destructive" });
    } finally {
      setAsking(false);
    }
  };

  const clips = poster ? "" : [assignment.clipCount ? `${assignment.clipCount} clips` : "", assignment.duration || ""].filter(Boolean).join(" · ");
  const jobLine = [assignment.uniqueId, assignment.businessName || assignment.displayTitle].filter(Boolean).join(" · ");
  const uploadedOn = alreadyUploaded && assignment.driveUploadedAt?.toDate
    ? format(assignment.driveUploadedAt.toDate(), "d MMM, h:mm a") : "";

  // ── The confirmation, briefly, before it closes itself ───────────────────────────────────
  if (saved) {
    return (
      <Overlay onClose={onClose}>
        <div data-test="drive-upload-saved" className="flex flex-col items-center px-6 py-10 text-center">
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckCircle2 size={34} />
          </motion.div>
          <p className="mt-3 font-display text-lg font-bold text-foreground">In your Drive</p>
          <p className="mt-1 text-xs text-muted-foreground">{path.join(" › ")}</p>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={saving ? undefined : onClose}>
      {/* ── Header ─────────────────────────────────────────────────────────────────────── */}
      <div className={`relative px-5 pb-4 pt-5 ${justCompleted || alreadyUploaded ? "bg-gradient-to-b from-success/15 to-transparent" : "bg-gradient-to-b from-primary/10 to-transparent"}`}>
        <button onClick={onClose} disabled={saving} aria-label="Close" data-test="drive-upload-close"
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
          <X size={16} />
        </button>
        <div className="flex items-center gap-3 pr-8">
          <motion.div
            initial={justCompleted ? { scale: 0.4, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 18 }}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
              justCompleted || alreadyUploaded ? "bg-success/15 text-success" : "bg-primary/15 text-primary"
            }`}
          >
            {justCompleted || alreadyUploaded ? <CheckCircle2 size={26} /> : <UploadCloud size={24} />}
          </motion.div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {alreadyUploaded ? "Uploaded" : justCompleted ? `${poster ? "Poster" : "Video"} submitted` : "Not in your Drive yet"}
            </p>
            <h2 id="drive-upload-title" className="font-display text-lg font-bold leading-tight text-foreground">
              {alreadyUploaded ? `This ${what} is in your Drive` : `Now upload it to your Drive`}
            </h2>
            {/* The business may run out of room; the job's length may not — it names the folder. */}
            <p data-test="drive-upload-job" className="flex min-w-0 text-xs text-muted-foreground">
              <span className="truncate">{jobLine}</span>
              {clips && <span className="shrink-0 whitespace-nowrap">&nbsp;· {clips}</span>}
            </p>
          </div>
        </div>
        {!alreadyUploaded && (
          <p className="mt-3 rounded-lg bg-background/70 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Do it now, while the file is fresh — work that is not in your Drive is <b className="text-foreground">not counted for the day</b>.
          </p>
        )}
      </div>

      {/* ── The three steps ───────────────────────────────────────────────────────────── */}
      <ol className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
        <Step n={1} done={opened || alreadyUploaded} title={driveUrl ? "Open your Drive folder" : "Your Drive folder"}>
          {driveUrl ? (
            opened && !alreadyUploaded ? (
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                Opened in a new tab.
                <a href={driveUrl} target="_blank" rel="noopener noreferrer" data-test="drive-upload-open-again"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                  Open again <ExternalLink size={11} />
                </a>
              </p>
            ) : (
              <a
                ref={(el) => { if (!alreadyUploaded) primaryRef.current = el; }}
                href={driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpened(true)}
                data-test="drive-upload-open"
                className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors ${
                  alreadyUploaded
                    ? "border border-border bg-background text-foreground hover:bg-accent"
                    : "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
                }`}
              >
                <FolderOpen size={17} /> Open my Drive folder <ExternalLink size={13} className="opacity-70" />
              </a>
            )
          ) : (
            <div data-test="drive-upload-no-link" className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
              <p>No Drive folder is set for you yet. Your admin adds it — ask them in one tap.</p>
              {asked ? (
                <p data-test="drive-upload-asked" className="mt-2 inline-flex items-center gap-1.5 font-medium text-success">
                  <Check size={13} /> Asked — it will appear here once they add it.
                </p>
              ) : (
                <button onClick={askAdmin} disabled={asking} data-test="drive-upload-ask-admin"
                  className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg bg-warning px-3 text-xs font-semibold text-white hover:bg-warning/90 disabled:opacity-60">
                  {asking ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Ask my admin to add it
                </button>
              )}
            </div>
          )}
        </Step>

        <Step n={2} done={alreadyUploaded} title="Go to this folder">
          <div data-test="drive-upload-path" className="flex flex-wrap items-center gap-1">
            {path.map((part, i) => {
              const last = i === path.length - 1;
              const key = `folder-${i}`;
              return (
                <span key={key} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={13} className="text-muted-foreground" />}
                  <button
                    onClick={() => copy(key, part)}
                    title={`Copy "${part}"`}
                    data-test="drive-upload-folder"
                    className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-xs font-semibold transition-colors ${
                      last ? "border-primary/50 bg-primary/10 text-foreground" : "border-border bg-background text-foreground hover:bg-accent"
                    }`}
                  >
                    {copied === key ? <><Check size={12} className="text-success" /> Copied</> : part}
                  </button>
                </span>
              );
            })}
          </div>
          {!alreadyUploaded && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              A folder missing? Create it with exactly this name — tap a name to copy it.
            </p>
          )}
        </Step>

        <Step n={3} done={alreadyUploaded} title={`Upload the ${what}, named`} last>
          <div className="flex items-center gap-2">
            {/* Shown whole, never cut short: someone renaming on a phone may be typing it. */}
            <code data-test="drive-upload-filename" className="min-w-0 flex-1 break-words rounded-lg border border-border bg-background px-2.5 py-2 font-mono text-xs leading-relaxed text-foreground">
              {fileName}
            </code>
            <button onClick={() => copy("file", fileName)} data-test="drive-upload-copy-name"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground hover:bg-accent">
              {copied === "file" ? <><Check size={13} className="text-success" /> Copied</> : <><Copy size={13} /> Copy</>}
            </button>
          </div>
          {!alreadyUploaded && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              Rename the file to this, then drag it into the folder — on a phone, tap <b className="text-foreground">+ → Upload</b>.
              The job number lets whoever checks your work find it at a glance.
            </p>
          )}
          {uploadedOn && <p className="mt-1.5 text-[11px] text-success">Marked uploaded {uploadedOn}</p>}
        </Step>
      </ol>

      {/* ── Footer: the next action is always the loudest ─────────────────────────────────── */}
      <div className="flex gap-2 border-t border-border bg-card px-5 py-3">
        {alreadyUploaded ? (
          <button onClick={onClose} data-test="drive-upload-done-close"
            className="h-11 flex-1 rounded-xl bg-accent text-sm font-semibold text-foreground">
            Close
          </button>
        ) : (
          <>
            <button onClick={onClose} disabled={saving} data-test="drive-upload-later"
              className="h-11 flex-1 rounded-xl border border-border bg-background text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
              Upload later
            </button>
            <button
              ref={(el) => { if (opened || !driveUrl) primaryRef.current = el; }}
              onClick={confirmUploaded}
              disabled={saving}
              data-test="drive-upload-confirm"
              data-emphasis={opened ? "primary" : "secondary"}
              className={`inline-flex h-11 flex-[1.4] items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60 ${
                opened
                  ? "bg-success text-white shadow-lg shadow-success/25 hover:bg-success/90"
                  : "border border-success/40 text-success hover:bg-success/10"
              }`}
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={16} />} It's uploaded
            </button>
          </>
        )}
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drive-upload-title"
        data-test="drive-upload-sheet"
        initial={{ y: 32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:max-w-md sm:rounded-2xl"
      >
        {children}
      </motion.div>
    </div>
  );
}

function Step({ n, done, title, last = false, children }: {
  n: number;
  done: boolean;
  title: string;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="relative flex gap-3 pt-3" data-test="drive-upload-step" data-done={done ? "1" : "0"}>
      {/* The rail joining the steps — it reads as one short journey, not three separate asks. */}
      {!last && <span className="absolute bottom-0 left-[13px] top-10 w-px bg-border" />}
      <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        done ? "bg-success text-white" : "border-2 border-primary/50 bg-card text-primary"
      }`}>
        {done ? <Check size={14} /> : n}
      </span>
      <div className="min-w-0 flex-1 pb-1">
        <p className="mb-1.5 pt-1 text-sm font-semibold text-foreground">{title}</p>
        {children}
      </div>
    </li>
  );
}

/**
 * "Not in your Drive yet" — at the top of the page, whatever day or month is being looked at.
 *
 * "Upload later" has to lead somewhere a member will actually see. The finished list is folded away
 * and filtered by date, so its buttons alone would hide a job finished yesterday the moment today's
 * filter is on. This strip is the to-do list: every finished job still waiting, one tap each.
 */
export function DrivePendingStrip({ jobs, onOpen }: { jobs: WorkAssignment[]; onOpen: (a: WorkAssignment) => void }) {
  const pending = jobs.filter(needsDriveUpload);
  if (pending.length === 0) return null;
  const shown = pending.slice(0, 3);
  return (
    <section data-test="drive-pending-strip" className="rounded-xl border border-warning/40 bg-warning/10 p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <UploadCloud size={18} className="shrink-0 text-warning" />
        <p className="text-sm font-semibold text-foreground">
          {pending.length === 1 ? "1 finished job is" : `${pending.length} finished jobs are`} not in your Drive yet
        </p>
      </div>
      <ul className="mt-2 space-y-1.5">
        {shown.map((a) => (
          <li key={a.id} className="flex items-center gap-2 rounded-lg bg-card px-2.5 py-2">
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">
              <b className="font-mono">{a.uniqueId}</b> · {a.businessName || a.displayTitle}
            </span>
            <button onClick={() => onOpen(a)} data-test="drive-pending-upload"
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-warning px-3 text-xs font-semibold text-white hover:bg-warning/90">
              <UploadCloud size={13} /> Upload
            </button>
          </li>
        ))}
      </ul>
      {pending.length > shown.length && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">and {pending.length - shown.length} more in Completed below.</p>
      )}
    </section>
  );
}

/**
 * The job card's reminder: "Upload to Drive" while a finished job's file is not in the Drive yet,
 * a quiet "In Drive" once it is. Nothing at all for work that is still being made, or that was
 * finished before uploads were tracked one job at a time.
 */
export function DriveUploadChip({ assignment, onOpen }: { assignment: WorkAssignment; onOpen: (a: WorkAssignment) => void }) {
  if (needsDriveUpload(assignment)) {
    return (
      <button onClick={() => onOpen(assignment)} data-test="drive-upload-chip" data-state="pending"
        className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-warning/15 px-2.5 text-[11px] font-semibold text-warning ring-1 ring-inset ring-warning/40 transition-colors hover:bg-warning/25">
        <UploadCloud size={13} /> Upload to Drive
      </button>
    );
  }
  if (isUploadedToDrive(assignment)) {
    return (
      <button onClick={() => onOpen(assignment)} data-test="drive-upload-chip" data-state="done" title="See where it was uploaded"
        className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 text-[11px] font-medium text-success hover:bg-success/10">
        <CheckCircle2 size={13} /> In Drive
      </button>
    );
  }
  return null;
}

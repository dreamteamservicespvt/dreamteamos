/**
 * The conversation itself — the one piece of UI the client, the member, the leader and the admin
 * all look at.
 *
 * Deliberately free of `useAuthStore`, `useNavigate` and anything else that assumes a signed-in
 * member of staff: the customer renders this same component from a public page with no account, and
 * a second, "simpler" client version would be the thing that quietly rots while the staff one gets
 * fixed. Who you are arrives as a prop; everything else is identical.
 *
 * ── Two sides, always ─────────────────────────────────────────────────────────────────────────
 * Bubbles are placed by SIDE — the client on one, the whole team on the other — not by who is
 * reading. Placing them by sender put the client's messages and the member's messages on the same
 * side of a leader's screen, because neither was the leader's own, and a conversation where both
 * voices stack up on one edge is unreadable. Whoever on the team wrote it is named on the bubble
 * instead, which is the part that actually needed saying.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Send, Paperclip, Mic, Square, SmilePlus, X, Play, Pause, FileText, Download,
  Loader2, Reply, Lock, Phone, Video as VideoIcon,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { uploadToCloudinary } from "@/services/cloudinary";
import { CLIENT_SENDER_ID } from "@/types/orderChat";
import type { OrderChatIdentity, OrderChatMessage, OrderChatMessageType } from "@/types/orderChat";

const EMOJI_LIST = [
  "😀", "😂", "🥰", "😎", "🤔", "😢", "🙏", "🤩",
  "👍", "👎", "❤️", "🔥", "🎉", "👏", "✅", "💪",
];

/** Cloudinary's unsigned preset stops well short of this; refusing early beats a failed upload. */
const MAX_FILE_MB = 50;

function toDate(ts: unknown): Date | null {
  const t = ts as { toDate?: () => Date; seconds?: number } | null;
  if (!t) return null;
  if (typeof t.toDate === "function") return t.toDate();
  if (typeof t.seconds === "number") return new Date(t.seconds * 1000);
  return null;
}

function clock(ts: unknown): string {
  const d = toDate(ts);
  return d ? format(d, "h:mm a") : "";
}

function dayLabel(d: Date): string {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return format(d, "d MMM yyyy");
}

function secs(n: number): string {
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}

/** What kind of thing this file is, from the browser's own idea of it. */
function kindOf(file: File): OrderChatMessageType {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "voice";
  return "file";
}

export interface OrderChatPanelProps {
  identity: OrderChatIdentity;
  messages: OrderChatMessage[];
  loading?: boolean;
  locked?: boolean;
  canSend?: boolean;
  sending?: boolean;
  /** Shown above the composer when the room is closed. */
  lockedNote?: string;
  onSend: (input: {
    text?: string;
    type?: OrderChatMessageType;
    fileUrl?: string;
    fileName?: string;
    fileType?: string;
    duration?: number;
    replyTo?: { id: string; text: string; senderId: string } | null;
  }) => Promise<void> | void;
  /** Rendered by the page above the messages — the header is page-specific, the chat is not. */
  header?: React.ReactNode;
  /** Empty-state copy, which differs for the client and the team. */
  emptyHint?: string;
}

export default function OrderChatPanel({
  identity, messages, loading, locked, canSend = true, sending,
  lockedNote, onSend, header, emptyHint,
}: OrderChatPanelProps) {
  const [text, setText] = useState("");
  const [showEmojis, setShowEmojis] = useState(false);
  const [replyTo, setReplyTo] = useState<OrderChatMessage | null>(null);
  /** A picked file waiting on its caption and a confirmation. Nothing uploads until Send. */
  const [pending, setPending] = useState<{ file: File; type: OrderChatMessageType; url: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordSecsRef = useRef(0);

  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  // The preview holds a blob URL; letting it go stops a long conversation leaking one per picture.
  useEffect(() => () => { if (pending) URL.revokeObjectURL(pending.url); }, [pending]);

  const replyPayload = useCallback(() => (
    replyTo
      ? {
          id: replyTo.id,
          text: replyTo.text || (replyTo.type === "voice" ? "🎤 Voice message" : "📎 Attachment"),
          senderId: replyTo.senderId,
        }
      : null
  ), [replyTo]);

  const submitText = async () => {
    if (!text.trim() || sending) return;
    const payload = { text, type: "text" as const, replyTo: replyPayload() };
    setText("");
    setReplyTo(null);
    setShowEmojis(false);
    try { await onSend(payload); } catch (e) { setError(e instanceof Error ? e.message : "Could not send."); }
  };

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`That file is too big. Please keep it under ${MAX_FILE_MB} MB.`);
      return;
    }
    setCaption("");
    setPending({ file, type: kindOf(file), url: URL.createObjectURL(file) });
  };

  /** Upload the held file and send it as one message, caption included. */
  const sendPending = async () => {
    if (!pending) return;
    const { file, type, url } = pending;
    const note = caption.trim();
    setPending(null);
    setCaption("");
    URL.revokeObjectURL(url);
    setUploading(true);
    setProgress(0);
    try {
      const uploaded = await uploadToCloudinary(file, setProgress);
      await onSend({
        type,
        fileUrl: uploaded,
        fileName: file.name,
        fileType: file.type,
        text: note,
        replyTo: replyPayload(),
      });
      setReplyTo(null);
    } catch {
      setError("That didn't upload. Check your connection and try again.");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  // ── Voice notes ──
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recordSecsRef.current = 0;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        // A tap that produced nothing is a mis-tap, not a message.
        if (blob.size < 1000) return;
        const seconds = recordSecsRef.current;
        setUploading(true);
        try {
          const file = new File([blob], `voice-${Date.now()}.${mimeType.includes("webm") ? "webm" : "m4a"}`, { type: recorder.mimeType });
          const url = await uploadToCloudinary(file, setProgress);
          await onSend({ type: "voice", fileUrl: url, duration: seconds, fileType: recorder.mimeType, replyTo: replyPayload() });
          setReplyTo(null);
        } catch {
          setError("Your voice message didn't send. Please try again.");
        } finally {
          setUploading(false);
          setProgress(0);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordSecs(0);
      recordTimerRef.current = setInterval(() => {
        recordSecsRef.current += 1;
        setRecordSecs(recordSecsRef.current);
      }, 1000);
    } catch {
      setError("Microphone access was blocked. Allow it in your browser to send a voice message.");
    }
  };

  const stopRecording = (cancel = false) => {
    const rec = recorderRef.current;
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    setRecording(false);
    if (!rec) return;
    if (cancel) {
      rec.onstop = null;
      rec.ondataavailable = null;
      rec.stream.getTracks().forEach((t) => t.stop());
      rec.stop();
    } else {
      rec.stop();
    }
    recorderRef.current = null;
  };

  const togglePlay = (msg: OrderChatMessage) => {
    if (playing === msg.id) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(msg.fileUrl);
    audioRef.current = audio;
    audio.onended = () => setPlaying(null);
    audio.play().catch(() => setPlaying(null));
    setPlaying(msg.id);
  };

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  let lastDay = "";

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {header}

      {/* ── Messages ─────────────────────────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <div className="mb-3 text-4xl">💬</div>
            <p className="text-sm font-medium text-foreground">No messages yet</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              {emptyHint || "Send a message to get started."}
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
            {messages.map((m) => {
              const fromClient = m.senderId === CLIENT_SENDER_ID;
              // The client sits on one side; everyone on the team sits on the other.
              const mine = identity.isClient ? fromClient : !fromClient;
              // Named whenever it is not the reader's own words — which is how a leader can tell
              // their member's messages from their own, on the same side.
              const showName = m.senderId !== identity.senderId && !!m.senderName;
              const when = toDate(m.createdAt);
              const day = when ? dayLabel(when) : "";
              const showDay = day && day !== lastDay;
              if (showDay) lastDay = day;
              const deleted = !!m.deletedAt;
              /**
               * Text sent WITH an attachment, shown under it.
               *
               * Keyed on there being a file, not on the type being "not text": a message written
               * before the type was recorded has no `type` at all, and treating that as an
               * attachment printed its words twice, once as the message and once as its own caption.
               */
              const hasCaption = !!m.text && !!m.fileUrl;

              if (m.type === "system") {
                return (
                  <div key={m.id} className="my-2 flex justify-center">
                    <span className="rounded-full bg-muted px-3 py-1 text-center text-[11px] text-muted-foreground">
                      {m.text}
                    </span>
                  </div>
                );
              }

              return (
                <div key={m.id}>
                  {showDay && (
                    <div className="my-3 flex justify-center">
                      <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {day}
                      </span>
                    </div>
                  )}
                  <div className={cn("group flex items-end gap-1", mine ? "justify-end" : "justify-start")}>
                    {/* Reply, on the outside of the bubble where it cannot cover the message. */}
                    {!deleted && canSend && mine && (
                      <button onClick={() => setReplyTo(m)} aria-label="Reply"
                        className="mb-1 shrink-0 rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100">
                        <Reply className="h-3.5 w-3.5" />
                      </button>
                    )}

                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-2.5 py-1.5 shadow-sm sm:max-w-[70%]",
                        mine
                          ? "rounded-br-sm bg-primary text-primary-foreground"
                          : "rounded-bl-sm border border-border bg-card text-card-foreground",
                      )}
                    >
                      {showName && (
                        <p className={cn(
                          "mb-0.5 text-[11px] font-semibold",
                          mine ? "text-primary-foreground/80" : "text-primary",
                        )}>
                          {m.senderName}
                        </p>
                      )}

                      {m.replyToId && !deleted && (
                        <div className={cn(
                          "mb-1.5 rounded-lg border-l-2 px-2 py-1 text-[11px]",
                          mine ? "border-primary-foreground/50 bg-black/10 text-primary-foreground/80"
                               : "border-primary/50 bg-muted text-muted-foreground",
                        )}>
                          {m.replyToText}
                        </div>
                      )}

                      {deleted ? (
                        <p className="px-0.5 py-1 text-sm italic opacity-60">This message was deleted</p>
                      ) : m.type === "image" ? (
                        <a href={m.fileUrl} target="_blank" rel="noreferrer" className="block">
                          <img src={m.fileUrl} alt={m.fileName || "Photo"}
                            className="max-h-80 w-full rounded-lg object-cover" loading="lazy" />
                        </a>
                      ) : m.type === "video" ? (
                        <video src={m.fileUrl} controls playsInline className="max-h-80 w-full rounded-lg" />
                      ) : m.type === "voice" && m.fileName ? (
                        // A shared audio FILE, not a recorded note: it has a name worth showing and
                        // is long enough that scrubbing matters.
                        <div className="min-w-[210px] py-1">
                          <p className="mb-1 truncate text-xs font-medium">{m.fileName}</p>
                          <audio src={m.fileUrl} controls className="w-full" style={{ height: 34 }} />
                        </div>
                      ) : m.type === "voice" ? (
                        <button onClick={() => togglePlay(m)}
                          className="flex min-w-[150px] items-center gap-2 py-1 text-left">
                          <span className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                            mine ? "bg-primary-foreground/20" : "bg-primary/10",
                          )}>
                            {playing === m.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                          </span>
                          <span className="flex-1">
                            <span className="block h-1 rounded-full bg-current opacity-30" />
                            <span className="mt-1 block text-[11px] opacity-70">
                              {m.duration ? secs(m.duration) : "Voice message"}
                            </span>
                          </span>
                        </button>
                      ) : m.type === "file" ? (
                        <a href={m.fileUrl} target="_blank" rel="noreferrer"
                          className="flex items-center gap-2 py-1">
                          <FileText className="h-5 w-5 shrink-0 opacity-80" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{m.fileName || "Attachment"}</span>
                            <span className="text-[11px] opacity-70">Tap to open</span>
                          </span>
                          <Download className="h-4 w-4 shrink-0 opacity-60" />
                        </a>
                      ) : m.type === "emoji" ? (
                        <p className="py-1 text-4xl leading-none">{m.text}</p>
                      ) : (
                        <p className="whitespace-pre-wrap break-words px-0.5 py-0.5 text-sm leading-relaxed">{m.text}</p>
                      )}

                      {/* The caption sent with a photo, video or file. */}
                      {hasCaption && !deleted && (
                        <p className="whitespace-pre-wrap break-words px-0.5 pt-1 text-sm leading-relaxed">
                          {m.text}
                        </p>
                      )}

                      <div className={cn(
                        "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
                        mine ? "text-primary-foreground/70" : "text-muted-foreground",
                      )}>
                        {clock(m.createdAt)}
                      </div>
                    </div>

                    {!deleted && canSend && !mine && (
                      <button onClick={() => setReplyTo(m)} aria-label="Reply"
                        className="mb-1 shrink-0 rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100">
                        <Reply className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Composer ─────────────────────────────────────────────────────────────────────────── */}
      {locked ? (
        <div className="border-t border-border bg-muted/40 px-4 py-4 text-center">
          <Lock className="mx-auto mb-1.5 h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            {lockedNote || "This chat is closed"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            You can still read everything and open the files that were shared.
          </p>
        </div>
      ) : (
        <div className="border-t border-border bg-card">
          {error && (
            <div className="flex items-center justify-between gap-2 border-b border-destructive/20 bg-destructive/10 px-3 py-2">
              <p className="text-xs text-destructive">{error}</p>
              <button onClick={() => setError(null)} aria-label="Dismiss">
                <X className="h-3.5 w-3.5 text-destructive" />
              </button>
            </div>
          )}

          {replyTo && (
            <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-2">
              <Reply className="h-3.5 w-3.5 shrink-0 text-primary" />
              <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                Replying to: {replyTo.text || "attachment"}
              </p>
              <button onClick={() => setReplyTo(null)} aria-label="Cancel reply">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          )}

          {uploading && (
            <div className="border-b border-border px-3 py-2">
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Sending… {progress}%
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {showEmojis && (
            <div className="grid grid-cols-8 gap-1 border-b border-border p-2">
              {EMOJI_LIST.map((e) => (
                <button key={e} onClick={() => { setText((t) => t + e); }}
                  className="rounded-lg p-1.5 text-xl transition-colors hover:bg-accent">
                  {e}
                </button>
              ))}
            </div>
          )}

          {recording ? (
            <div className="flex items-center gap-3 px-3 py-3">
              <span className="flex h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
              <span className="flex-1 font-mono text-sm text-foreground">{secs(recordSecs)}</span>
              <button onClick={() => stopRecording(true)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent">
                Cancel
              </button>
              <button onClick={() => stopRecording(false)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                <Square className="h-3 w-3" /> Send
              </button>
            </div>
          ) : (
            <div className="flex items-end gap-1.5 px-2 py-2">
              <input ref={fileInputRef} type="file" hidden onChange={pickFile}
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" />
              <button onClick={() => fileInputRef.current?.click()} disabled={!canSend || uploading}
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                aria-label="Attach a file" title="Photo, video, audio, PDF or any file">
                <Paperclip className="h-5 w-5" />
              </button>
              <button onClick={() => setShowEmojis((s) => !s)} disabled={!canSend}
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                aria-label="Emoji">
                <SmilePlus className="h-5 w-5" />
              </button>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitText(); }
                }}
                rows={1}
                disabled={!canSend}
                placeholder="Type a message"
                className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              />
              {text.trim() ? (
                <button onClick={submitText} disabled={!canSend || sending}
                  className="rounded-full bg-primary p-2.5 text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                  aria-label="Send">
                  {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </button>
              ) : (
                <button onClick={startRecording} disabled={!canSend || uploading}
                  className="rounded-full bg-primary p-2.5 text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                  aria-label="Record a voice message" title="Hold a conversation without typing">
                  <Mic className="h-5 w-5" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── See it before it goes, and say something about it ─────────────────────────────────── */}
      {pending && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-black/90" data-test="order-chat-preview">
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={() => { URL.revokeObjectURL(pending.url); setPending(null); setCaption(""); }}
              aria-label="Cancel" className="rounded-full p-2 text-white/80 hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
            <p className="truncate px-3 text-sm text-white/70">{pending.file.name}</p>
            <span className="w-9" />
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center px-4">
            {pending.type === "image" ? (
              <img src={pending.url} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
            ) : pending.type === "video" ? (
              <video src={pending.url} controls playsInline className="max-h-full max-w-full rounded-lg" />
            ) : pending.type === "voice" ? (
              <div className="w-full max-w-sm rounded-xl bg-white/10 p-4 text-center">
                <p className="mb-3 truncate text-sm text-white">{pending.file.name}</p>
                <audio src={pending.url} controls className="w-full" />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center">
                <FileText className="h-16 w-16 text-white/60" />
                <p className="max-w-xs truncate text-sm text-white">{pending.file.name}</p>
                <p className="text-xs text-white/50">
                  {(pending.file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
            )}
          </div>

          <div className="flex items-end gap-2 bg-black/60 px-3 py-3">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPending(); } }}
              rows={1}
              autoFocus
              placeholder="Add a message (optional)"
              data-test="order-chat-caption"
              className="max-h-28 min-h-[42px] flex-1 resize-none rounded-2xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/50 focus:border-white/40"
            />
            <button onClick={sendPending} data-test="order-chat-preview-send"
              className="rounded-full bg-primary p-3 text-primary-foreground transition-opacity hover:opacity-90"
              aria-label="Send">
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The call buttons a page drops into its header. Kept here so both sides look the same. */
export function OrderChatCallButtons({ onVoice, onVideo, disabled }: {
  onVoice: () => void; onVideo: () => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={onVoice} disabled={disabled} title="Voice call"
        className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30">
        <Phone className="h-5 w-5" />
      </button>
      <button onClick={onVideo} disabled={disabled} title="Video call"
        className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30">
        <VideoIcon className="h-5 w-5" />
      </button>
    </div>
  );
}

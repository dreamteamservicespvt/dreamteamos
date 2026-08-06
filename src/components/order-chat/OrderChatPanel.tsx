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
 *
 * ── Why it looks like WhatsApp ────────────────────────────────────────────────────────────────
 * This replaces a WhatsApp group, and the customer it replaces it for has never used anything else.
 * Every convention here is load-bearing rather than decorative: the patterned backdrop that makes
 * bubbles read as bubbles, the tail on the last message of a run, the timestamp tucked into the
 * bottom-right of the bubble, the quoted bar above a reply. A chat that looks like a web form gets
 * treated like a web form — filled in once and abandoned.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Send, Paperclip, Mic, Square, SmilePlus, X, Play, Pause, FileText, Download,
  Loader2, Reply, Lock, Phone, Video as VideoIcon, CheckCheck, Trash2,
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

/**
 * The chat wallpaper, as a data URI so it costs no request and cannot 404.
 *
 * A flat panel makes bubbles look like list rows. The faint doodle field is what makes the eye
 * read them as a conversation, and it is the single strongest signal that this is a chat.
 *
 * Mid-grey rather than black, because this same panel is beige for the customer and near-black for
 * the member. A black stroke vanished completely against the staff theme; grey at a tenth of an
 * alpha darkens a light backdrop and lightens a dark one, so one image serves both.
 */
const WALLPAPER =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cg fill='none' stroke='%23808080' stroke-opacity='0.13' stroke-width='1.5' stroke-linecap='round'%3E%3Cpath d='M18 22h14M18 27h9'/%3E%3Ccircle cx='92' cy='24' r='6'/%3E%3Cpath d='M30 62l6 6 10-12'/%3E%3Cpath d='M84 58h16v11h-6l-4 4v-4h-6z'/%3E%3Cpath d='M22 96c4-6 10-6 14 0'/%3E%3Ccircle cx='29' cy='90' r='3.5'/%3E%3Cpath d='M74 98l8-8 8 8-8 8z'/%3E%3C/g%3E%3C/svg%3E\")";

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
  /** Which bubble has its action bar open. Touch has no hover, so tapping is how you get at Reply. */
  const [openActions, setOpenActions] = useState<string | null>(null);
  /** Briefly ringed after jumping to it from a reply quote, so the eye can find it. */
  const [flashed, setFlashed] = useState<string | null>(null);
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const bubbleRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  // The preview holds a blob URL; letting it go stops a long conversation leaking one per picture.
  useEffect(() => () => { if (pending) URL.revokeObjectURL(pending.url); }, [pending]);

  // Any tap outside a bubble puts its action bar away again.
  useEffect(() => {
    if (!openActions) return;
    const close = () => setOpenActions(null);
    // Capture, so it runs before a bubble's own handler can reopen it.
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [openActions]);

  /**
   * Scroll to the message a reply is quoting.
   *
   * The quote is the only way back to what somebody actually said three days ago, and a quote you
   * cannot follow is decoration. Falls back to a shake of the composer's error line when the
   * original has scrolled out of the loaded window — better than a tap that appears broken.
   */
  const jumpTo = useCallback((id?: string) => {
    if (!id) return;
    const el = bubbleRefs.current[id];
    if (!el) { setError("That message is further up — scroll back to find it."); return; }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashed(id);
    setTimeout(() => setFlashed((f) => (f === id ? null : f)), 1600);
  }, []);

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

  /**
   * Which messages end a run from the same sender.
   *
   * Only the last bubble of a run gets a tail and a visible timestamp, exactly as WhatsApp does it.
   * Five bubbles each with their own tail and clock read as five separate interruptions rather than
   * one person talking.
   */
  const lastOfRun = useMemo(() => {
    const set = new Set<string>();
    messages.forEach((m, i) => {
      const next = messages[i + 1];
      if (!next || next.senderId !== m.senderId || next.type === "system" || m.type === "system") {
        set.add(m.id);
      }
    });
    return set;
  }, [messages]);

  let lastDay = "";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#eae6df] dark:bg-[#0b141a]">
      {header}

      {/* ── Messages ─────────────────────────────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 sm:px-6"
        style={{ backgroundImage: WALLPAPER, backgroundSize: "200px" }}
        data-test="order-chat-messages"
      >
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <div className="max-w-sm rounded-xl bg-[#fff8d4] px-4 py-3 shadow-sm dark:bg-[#182229]">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">No messages yet</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {emptyHint || "Send a message to get started."}
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-0.5">
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
              const tail = lastOfRun.has(m.id);
              /**
               * Text sent WITH an attachment, shown under it.
               *
               * Keyed on there being a file, not on the type being "not text": a message written
               * before the type was recorded has no `type` at all, and treating that as an
               * attachment printed its words twice, once as the message and once as its own caption.
               */
              const hasCaption = !!m.text && !!m.fileUrl;
              const isMedia = !deleted && (m.type === "image" || m.type === "video");

              if (m.type === "system") {
                return (
                  <div key={m.id} className="my-2 flex justify-center">
                    <span className="rounded-lg bg-[#ffeecd] px-3 py-1.5 text-center text-[11.5px] leading-snug text-slate-700 shadow-sm dark:bg-[#182229] dark:text-slate-300">
                      {m.text}
                    </span>
                  </div>
                );
              }

              return (
                <div key={m.id}>
                  {showDay && (
                    <div className="my-3 flex justify-center">
                      <span className="rounded-lg bg-white/90 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-600 shadow-sm dark:bg-[#182229] dark:text-slate-300">
                        {day}
                      </span>
                    </div>
                  )}

                  <div
                    className={cn("group flex", mine ? "justify-end" : "justify-start", tail ? "mb-2" : "mb-0.5")}
                  >
                    <div className="relative max-w-[85%] sm:max-w-[70%]">
                      {/* The tap target for the actions below — a whole bubble, as on a phone. */}
                      <div
                        ref={(el) => { bubbleRefs.current[m.id] = el; }}
                        onClick={() => { if (!deleted && canSend) setOpenActions((o) => (o === m.id ? null : m.id)); }}
                        className={cn(
                          "relative rounded-lg px-2 py-1.5 text-[14.2px] shadow-sm transition-shadow",
                          isMedia && "p-1",
                          mine
                            ? "bg-[#d9fdd3] text-slate-900 dark:bg-[#005c4b] dark:text-slate-50"
                            : "bg-white text-slate-900 dark:bg-[#202c33] dark:text-slate-50",
                          tail && (mine ? "rounded-br-none" : "rounded-bl-none"),
                          flashed === m.id && "ring-2 ring-emerald-500/70",
                          !deleted && canSend && "cursor-pointer",
                        )}
                        data-test="order-chat-bubble"
                      >
                        {/* The little corner that makes a rectangle read as speech. */}
                        {tail && (
                          <span
                            aria-hidden
                            className={cn(
                              "absolute bottom-0 h-3 w-3",
                              mine
                                ? "-right-2 bg-[#d9fdd3] dark:bg-[#005c4b] [clip-path:polygon(0_0,0_100%,100%_100%)]"
                                : "-left-2 bg-white dark:bg-[#202c33] [clip-path:polygon(100%_0,0_100%,100%_100%)]",
                            )}
                          />
                        )}

                        {showName && (
                          <p className={cn(
                            "mb-0.5 px-0.5 text-[12.5px] font-semibold",
                            mine ? "text-emerald-900/70 dark:text-emerald-200/80" : "text-emerald-700 dark:text-emerald-400",
                          )}>
                            {m.senderName}
                          </p>
                        )}

                        {m.replyToId && !deleted && (
                          <button
                            onClick={(e) => { e.stopPropagation(); jumpTo(m.replyToId); }}
                            className={cn(
                              "mb-1 block w-full overflow-hidden rounded border-l-[3px] px-2 py-1 text-left text-[12.5px]",
                              mine
                                ? "border-emerald-700 bg-black/5 text-slate-700 dark:border-emerald-300 dark:bg-black/20 dark:text-slate-200"
                                : "border-emerald-600 bg-black/5 text-slate-600 dark:border-emerald-400 dark:bg-black/20 dark:text-slate-300",
                            )}
                          >
                            <span className="line-clamp-2 break-words">{m.replyToText}</span>
                          </button>
                        )}

                        {deleted ? (
                          <p className="px-0.5 py-1 text-[13.5px] italic opacity-60">This message was deleted</p>
                        ) : m.type === "image" ? (
                          <a href={m.fileUrl} target="_blank" rel="noreferrer" className="block"
                            onClick={(e) => e.stopPropagation()}>
                            <img src={m.fileUrl} alt={m.fileName || "Photo"}
                              className="max-h-80 w-full rounded-md object-cover" loading="lazy" />
                          </a>
                        ) : m.type === "video" ? (
                          <video src={m.fileUrl} controls playsInline className="max-h-80 w-full rounded-md"
                            onClick={(e) => e.stopPropagation()} />
                        ) : m.type === "voice" && m.fileName ? (
                          // A shared audio FILE, not a recorded note: it has a name worth showing and
                          // is long enough that scrubbing matters.
                          <div className="min-w-[210px] py-1" onClick={(e) => e.stopPropagation()}>
                            <p className="mb-1 truncate text-xs font-medium">{m.fileName}</p>
                            <audio src={m.fileUrl} controls className="w-full" style={{ height: 34 }} />
                          </div>
                        ) : m.type === "voice" ? (
                          <button onClick={(e) => { e.stopPropagation(); togglePlay(m); }}
                            className="flex min-w-[150px] items-center gap-2 py-1 text-left">
                            <span className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                              mine ? "bg-black/10 dark:bg-white/15" : "bg-emerald-600/10 dark:bg-white/10",
                            )}>
                              {playing === m.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            </span>
                            <span className="flex-1">
                              <span className="block h-1 rounded-full bg-current opacity-25" />
                              <span className="mt-1 block text-[11px] opacity-60">
                                {m.duration ? secs(m.duration) : "Voice message"}
                              </span>
                            </span>
                          </button>
                        ) : m.type === "file" ? (
                          <a href={m.fileUrl} target="_blank" rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                              "flex items-center gap-2 rounded-md px-2 py-2",
                              mine ? "bg-black/5 dark:bg-white/10" : "bg-slate-500/5 dark:bg-white/5",
                            )}>
                            <FileText className="h-6 w-6 shrink-0 opacity-70" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-medium">{m.fileName || "Attachment"}</span>
                              <span className="text-[11px] opacity-60">Tap to open</span>
                            </span>
                            <Download className="h-4 w-4 shrink-0 opacity-50" />
                          </a>
                        ) : m.type === "emoji" ? (
                          <p className="py-1 text-4xl leading-none">{m.text}</p>
                        ) : (
                          <p className="whitespace-pre-wrap break-words px-0.5 leading-[1.35]">{m.text}</p>
                        )}

                        {/* The caption sent with a photo, video or file. */}
                        {hasCaption && !deleted && (
                          <p className="whitespace-pre-wrap break-words px-1.5 pt-1 text-[14.2px] leading-[1.35]">
                            {m.text}
                          </p>
                        )}

                        {/* Timestamp on the last of a run only, in the corner it belongs in. */}
                        {tail && (
                          <span className={cn(
                            "float-right ml-2 mt-0.5 flex select-none items-center gap-0.5 pr-0.5 text-[10.5px] leading-none",
                            isMedia && "rounded bg-black/45 px-1.5 py-0.5 text-white",
                            mine ? "text-slate-600 dark:text-slate-300/70" : "text-slate-500 dark:text-slate-400",
                          )}>
                            {clock(m.createdAt)}
                            {mine && !deleted && (
                              <CheckCheck className="h-3 w-3 opacity-70" aria-label="Sent" />
                            )}
                          </span>
                        )}
                        {tail && <span className="clear-both block" />}
                      </div>

                      {/* Tap a bubble on a phone, hover it on a desktop — either way, Reply. */}
                      {!deleted && canSend && (
                        <div
                          /* Fully above the bubble, never on top of it — at `-top-3` it sat over
                             the sender's name, which is the one line telling a leader which of
                             their people wrote this. */
                          className={cn(
                            "absolute bottom-full right-1 z-10 mb-1 flex items-center gap-1 rounded-full border border-slate-200 bg-white px-1 py-0.5 shadow-md transition-opacity dark:border-slate-700 dark:bg-[#233138]",
                            openActions === m.id
                              ? "opacity-100"
                              : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100",
                          )}
                        >
                          <button
                            onClick={(e) => { e.stopPropagation(); setReplyTo(m); setOpenActions(null); }}
                            data-test="order-chat-reply"
                            title="Reply to this message"
                            className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
                          >
                            <Reply className="h-3.5 w-3.5" /> Reply
                          </button>
                        </div>
                      )}
                    </div>
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
        <div className="border-t border-black/10 bg-[#f0f2f5] px-4 py-4 text-center dark:border-white/10 dark:bg-[#202c33]">
          <Lock className="mx-auto mb-1.5 h-4 w-4 text-slate-500 dark:text-slate-400" />
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
            {lockedNote || "This chat is closed"}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            You can still read everything and open the files that were shared.
          </p>
        </div>
      ) : (
        <div className="border-t border-black/5 bg-[#f0f2f5] pb-[env(safe-area-inset-bottom)] dark:border-white/5 dark:bg-[#202c33]">
          {error && (
            <div className="flex items-center justify-between gap-2 border-b border-rose-500/20 bg-rose-500/10 px-3 py-2">
              <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p>
              <button onClick={() => setError(null)} aria-label="Dismiss">
                <X className="h-3.5 w-3.5 text-rose-700 dark:text-rose-300" />
              </button>
            </div>
          )}

          {replyTo && (
            <div className="flex items-stretch gap-2 px-2 pt-2" data-test="order-chat-replying-to">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border-l-4 border-emerald-500 bg-white px-2.5 py-1.5 dark:bg-[#111b21]">
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {replyTo.senderId === identity.senderId ? "You" : replyTo.senderName || "Message"}
                  </p>
                  <p className="truncate text-[12.5px] text-slate-600 dark:text-slate-300">
                    {replyTo.text || (replyTo.type === "voice" ? "🎤 Voice message" : "📎 Attachment")}
                  </p>
                </div>
                <button onClick={() => setReplyTo(null)} aria-label="Cancel reply"
                  className="shrink-0 rounded-full p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {uploading && (
            <div className="px-3 py-2">
              <div className="mb-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Loader2 className="h-3 w-3 animate-spin" /> Sending… {progress}%
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {showEmojis && (
            <div className="grid grid-cols-8 gap-1 border-b border-black/5 p-2 dark:border-white/5">
              {EMOJI_LIST.map((e) => (
                <button key={e} onClick={() => { setText((t) => t + e); }}
                  className="rounded-lg p-1.5 text-xl transition-colors hover:bg-black/5 dark:hover:bg-white/10">
                  {e}
                </button>
              ))}
            </div>
          )}

          {recording ? (
            <div className="flex items-center gap-3 px-3 py-3">
              <span className="flex h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
              <span className="flex-1 font-mono text-sm text-slate-700 dark:text-slate-200">{secs(recordSecs)}</span>
              <button onClick={() => stopRecording(true)} aria-label="Cancel recording"
                className="rounded-full p-2 text-slate-500 hover:bg-black/5 dark:hover:bg-white/10">
                <Trash2 className="h-4 w-4" />
              </button>
              <button onClick={() => stopRecording(false)}
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white">
                <Square className="h-3 w-3" /> Send
              </button>
            </div>
          ) : (
            <div className="flex items-end gap-1.5 px-2 py-2">
              <input ref={fileInputRef} type="file" hidden onChange={pickFile}
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" />
              <div className="flex flex-1 items-end gap-1 rounded-3xl bg-white px-2 py-1 dark:bg-[#2a3942]">
                <button onClick={() => setShowEmojis((s) => !s)} disabled={!canSend}
                  className="rounded-full p-2 text-slate-500 transition-colors hover:bg-black/5 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/10"
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
                  data-test="order-chat-input"
                  className="max-h-32 min-h-[38px] flex-1 resize-none bg-transparent px-1 py-2 text-[14.5px] text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-50 dark:text-slate-50"
                />
                <button onClick={() => fileInputRef.current?.click()} disabled={!canSend || uploading}
                  className="rounded-full p-2 text-slate-500 transition-colors hover:bg-black/5 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/10"
                  aria-label="Attach a file" title="Photo, video, audio, PDF or any file">
                  <Paperclip className="h-5 w-5 -rotate-45" />
                </button>
              </div>
              {text.trim() ? (
                <button onClick={submitText} disabled={!canSend || sending}
                  data-test="order-chat-send"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  aria-label="Send">
                  {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </button>
              ) : (
                <button onClick={startRecording} disabled={!canSend || uploading}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
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

          <div className="flex items-end gap-2 bg-black/60 px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
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
              className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white transition-opacity hover:opacity-90"
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
    <div className="flex items-center gap-0.5">
      <button onClick={onVoice} disabled={disabled} title="Voice call" data-test="chat-call-voice"
        className="rounded-full p-2 text-current opacity-90 transition-opacity hover:opacity-100 disabled:opacity-30">
        <Phone className="h-5 w-5" />
      </button>
      <button onClick={onVideo} disabled={disabled} title="Video call" data-test="chat-call-video"
        className="rounded-full p-2 text-current opacity-90 transition-opacity hover:opacity-100 disabled:opacity-30">
        <VideoIcon className="h-5 w-5" />
      </button>
    </div>
  );
}

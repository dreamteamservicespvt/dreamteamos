import { useRef, useEffect, useState, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Send, Video, Phone, ArrowLeft, Loader2, Paperclip, Mic, Square, SmilePlus, X,
  Play, Pause, FileText, Image as ImageIcon, Film, Trash2, Pencil, Reply, Ban,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useCallStore } from "@/store/callStore";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { uploadToCloudinary } from "@/services/cloudinary";
import type { ChatMessage, ChatContact } from "@/hooks/useChat";
import type { ChatMessageType } from "@/types";

const EMOJI_LIST = [
  "😀","😂","🥰","😎","🤔","😢","😡","🤩",
  "👍","👎","❤️","🔥","🎉","👏","🙏","💪",
  "😮","🥳","😴","🤗","🤮","💀","👀","✅",
];

interface Props {
  contact: ChatContact;
  messages: ChatMessage[];
  loading?: boolean;
  onSend: (text: string, replyTo?: { id: string; text: string; senderId: string }) => void;
  onSendFile?: (opts: {
    type: ChatMessageType;
    text?: string;
    fileUrl?: string;
    fileName?: string;
    fileType?: string;
    duration?: number;
    replyTo?: { id: string; text: string; senderId: string };
  }) => void;
  onDelete?: (messageId: string) => void;
  onEdit?: (messageId: string, newText: string) => void;
  onBack?: () => void;
  showBackButton?: boolean;
}

function toDate(ts: any): Date | null {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return null;
}

export default function ChatRoom({ contact, messages, loading, onSend, onSendFile, onDelete, onEdit, onBack, showBackButton }: Props) {
  const user = useAuthStore((s) => s.user);
  const startCall = useCallStore((s) => s.startCall);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Emoji picker
  const [showEmojis, setShowEmojis] = useState(false);

  // Upload progress
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Audio playback refs
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Reply-to state
  const [replyToMsg, setReplyToMsg] = useState<ChatMessage | null>(null);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ msgId: string; x: number; y: number; isMine: boolean; text: string; type?: string } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Edit mode
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  // Edit history popover
  const [showHistoryFor, setShowHistoryFor] = useState<string | null>(null);

  // File confirmation
  const [pendingFile, setPendingFile] = useState<{ file: File; type: ChatMessageType } | null>(null);

  // Voice confirmation
  const [pendingVoice, setPendingVoice] = useState<{ blob: Blob; mimeType: string; duration: number } | null>(null);

  // Swipe state
  const swipeRef = useRef<{ startX: number; msgId: string; el: HTMLElement } | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Close context menu on any tap
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [contextMenu]);

  const handleSend = () => {
    if (!input.trim()) return;
    const reply = replyToMsg ? { id: replyToMsg.id, text: replyToMsg.text || (replyToMsg.type === "voice" ? "🎤 Voice message" : "📎 File"), senderId: replyToMsg.senderId } : undefined;
    onSend(input, reply);
    setInput("");
    setShowEmojis(false);
    setReplyToMsg(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (editingMsgId) { handleEditSave(); } else { handleSend(); }
    }
    if (e.key === "Escape") { setReplyToMsg(null); setEditingMsgId(null); }
  };

  // ── File upload with confirmation ──
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onSendFile) return;
    e.target.value = "";

    let type: ChatMessageType = "file";
    if (file.type.startsWith("image/")) type = "image";
    else if (file.type.startsWith("video/")) type = "video";

    setPendingFile({ file, type });
  }, [onSendFile]);

  const confirmFileSend = useCallback(async () => {
    if (!pendingFile || !onSendFile) return;
    const { file, type } = pendingFile;
    setPendingFile(null);
    try {
      setUploading(true);
      setUploadProgress(0);
      const url = await uploadToCloudinary(file, (p) => setUploadProgress(p));
      const reply = replyToMsg ? { id: replyToMsg.id, text: replyToMsg.text || "📎 File", senderId: replyToMsg.senderId } : undefined;
      onSendFile({ type, fileUrl: url, fileName: file.name, fileType: file.type, replyTo: reply });
      setReplyToMsg(null);
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [pendingFile, onSendFile, replyToMsg]);

  // ── Voice recording with confirmation ──
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4" });
      recordingChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType });
        setPendingVoice({ blob, mimeType: recorder.mimeType, duration: recordingDuration });
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => setRecordingDuration((d) => d + 1), 1000);
    } catch (err) {
      console.error("Mic access denied:", err);
    }
  }, [recordingDuration]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const confirmVoiceSend = useCallback(async () => {
    if (!pendingVoice || !onSendFile) return;
    const { blob, mimeType, duration } = pendingVoice;
    setPendingVoice(null);
    const file = new File([blob], `voice-${Date.now()}.webm`, { type: mimeType });
    try {
      setUploading(true);
      const url = await uploadToCloudinary(file, (p) => setUploadProgress(p));
      const reply = replyToMsg ? { id: replyToMsg.id, text: replyToMsg.text || "🎤 Voice", senderId: replyToMsg.senderId } : undefined;
      onSendFile({ type: "voice", fileUrl: url, fileName: file.name, fileType: mimeType, duration, replyTo: reply });
      setReplyToMsg(null);
    } catch (err) {
      console.error("Voice upload failed:", err);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [pendingVoice, onSendFile, replyToMsg]);

  // ── Emoji insert ──
  const handleEmojiClick = useCallback((emoji: string) => {
    setInput((prev) => prev + emoji);
  }, []);

  // ── Audio playback ──
  const toggleAudioPlayback = useCallback((msgId: string, url: string) => {
    if (playingAudioId === msgId) {
      audioRef.current?.pause();
      setPlayingAudioId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlayingAudioId(null);
    audio.play();
    setPlayingAudioId(msgId);
  }, [playingAudioId]);

  // ── Context menu (long press / right-click) ──
  const handleMsgTouchStart = useCallback((e: React.TouchEvent, msg: ChatMessage, isMine: boolean) => {
    const touch = e.touches[0];
    longPressTimerRef.current = setTimeout(() => {
      setContextMenu({ msgId: msg.id, x: touch.clientX, y: touch.clientY, isMine, text: msg.text || "", type: msg.type });
    }, 500);
  }, []);

  const handleMsgTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
  }, []);

  const handleMsgContextMenu = useCallback((e: React.MouseEvent, msg: ChatMessage, isMine: boolean) => {
    e.preventDefault();
    setContextMenu({ msgId: msg.id, x: e.clientX, y: e.clientY, isMine, text: msg.text || "", type: msg.type });
  }, []);

  // ── Swipe to reply (touch) ──
  const handleSwipeStart = useCallback((e: React.TouchEvent, msg: ChatMessage) => {
    swipeRef.current = { startX: e.touches[0].clientX, msgId: msg.id, el: e.currentTarget as HTMLElement };
  }, []);
  const handleSwipeMove = useCallback((e: React.TouchEvent) => {
    if (!swipeRef.current) return;
    const diff = e.touches[0].clientX - swipeRef.current.startX;
    if (diff > 0 && diff < 100) { swipeRef.current.el.style.transform = `translateX(${diff}px)`; swipeRef.current.el.style.transition = "none"; }
  }, []);
  const handleSwipeEnd = useCallback(() => {
    if (!swipeRef.current) return;
    const el = swipeRef.current.el;
    const diff = parseInt(el.style.transform.replace(/[^0-9.-]/g, "") || "0");
    el.style.transition = "transform 0.2s ease";
    el.style.transform = "translateX(0)";
    if (diff > 50) { const msg = messages.find((m) => m.id === swipeRef.current!.msgId); if (msg) setReplyToMsg(msg); }
    swipeRef.current = null;
  }, [messages]);

  // ── Edit save ──
  const handleEditSave = useCallback(() => {
    if (editingMsgId && editText.trim() && onEdit) onEdit(editingMsgId, editText.trim());
    setEditingMsgId(null);
    setEditText("");
  }, [editingMsgId, editText, onEdit]);

  const formatRecordTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const initials = contact.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  // Group messages by date
  let lastDateStr = "";

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shrink-0 z-10">
        {showBackButton && (
          <Button variant="ghost" size="icon" className="shrink-0 mr-1" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
        )}
        <Avatar className="h-9 w-9">
          <AvatarImage src={contact.avatar} />
          <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{contact.name}</p>
          <p className="text-[11px] text-muted-foreground capitalize">{contact.role.replace("_", " ")}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-primary hover:bg-primary/10"
          title="Start voice call"
          onClick={() => startCall(contact.uid, contact.name, contact.avatar, "voice")}
        >
          <Phone className="w-5 h-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-primary hover:bg-primary/10"
          title="Start video call"
          onClick={() => startCall(contact.uid, contact.name, contact.avatar, "video")}
        >
          <Video className="w-5 h-5" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4" ref={scrollAreaRef}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p className="text-sm">No messages yet</p>
            <p className="text-xs mt-1">Say hello to start the conversation!</p>
          </div>
        ) : (
          <div className="py-4 space-y-1">
            {messages.map((msg) => {
              const isMine = msg.senderId === user?.uid;
              const d = toDate(msg.createdAt);
              const dateStr = d ? format(d, "MMM d, yyyy") : "";
              const showDate = dateStr !== lastDateStr;
              if (showDate) lastDateStr = dateStr;

              const isDeleted = !!msg.deletedAt;
              const isEdited = !!msg.editedAt;

              return (
                <div key={msg.id}>
                  {showDate && dateStr && (
                    <div className="flex items-center justify-center my-4">
                      <span className="text-[10px] text-muted-foreground bg-muted px-3 py-1 rounded-full">
                        {dateStr}
                      </span>
                    </div>
                  )}
                  <div className={cn("flex", isMine ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[75%] px-3 py-2 rounded-2xl text-sm break-words relative group",
                        isMine
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted text-foreground rounded-bl-md",
                        isDeleted && "opacity-60 italic",
                      )}
                      onTouchStart={(e) => { handleMsgTouchStart(e, msg, isMine); handleSwipeStart(e, msg); }}
                      onTouchMove={handleSwipeMove}
                      onTouchEnd={() => { handleMsgTouchEnd(); handleSwipeEnd(); }}
                      onContextMenu={(e) => handleMsgContextMenu(e, msg, isMine)}
                    >
                      {/* Reply reference */}
                      {msg.replyToText && !isDeleted && (
                        <div className={cn(
                          "text-[11px] mb-1 px-2 py-1 rounded border-l-2",
                          isMine ? "bg-primary-foreground/10 border-primary-foreground/40" : "bg-foreground/5 border-foreground/20",
                        )}>
                          <p className="font-medium opacity-70 truncate">{msg.replyToSenderId === user?.uid ? "You" : contact.name}</p>
                          <p className="truncate opacity-60">{msg.replyToText}</p>
                        </div>
                      )}

                      {isDeleted ? (
                        <div className="flex items-center gap-1.5">
                          <Ban className="w-3.5 h-3.5 opacity-60" />
                          <span className="text-xs">This message was deleted</span>
                        </div>
                      ) : (
                        <>
                          {/* Image message */}
                          {msg.type === "image" && msg.fileUrl && (
                            <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer">
                              <img src={msg.fileUrl} alt={msg.fileName ?? "Image"} className="rounded-lg max-w-full max-h-60 object-cover mb-1" />
                            </a>
                          )}
                          {/* Video message */}
                          {msg.type === "video" && msg.fileUrl && (
                            <video src={msg.fileUrl} controls className="rounded-lg max-w-full max-h-60 mb-1" />
                          )}
                          {/* Voice message */}
                          {msg.type === "voice" && msg.fileUrl && (
                            <div className="flex items-center gap-2 min-w-[160px]">
                              <button
                                onClick={() => toggleAudioPlayback(msg.id, msg.fileUrl!)}
                                className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", isMine ? "bg-primary-foreground/20" : "bg-foreground/10")}
                              >
                                {playingAudioId === msg.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                              </button>
                              <div className="flex-1"><div className={cn("h-1 rounded-full", isMine ? "bg-primary-foreground/30" : "bg-foreground/20")} /></div>
                              <span className="text-[10px] opacity-70">{msg.duration ? formatRecordTime(msg.duration) : "0:00"}</span>
                            </div>
                          )}
                          {/* File message */}
                          {msg.type === "file" && msg.fileUrl && (
                            <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 py-1">
                              <FileText className="w-5 h-5 shrink-0" />
                              <span className="truncate underline">{msg.fileName ?? "File"}</span>
                            </a>
                          )}
                          {/* Text content */}
                          {msg.text && msg.type !== "voice" && (msg.type !== "text" || !msg.fileUrl) && !((!msg.type) && msg.fileUrl) && (
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                          )}
                        </>
                      )}
                      {/* Timestamp + edited badge */}
                      <div className={cn("flex items-center gap-1 mt-1", isMine ? "justify-end" : "justify-start")}>
                        {isEdited && !isDeleted && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowHistoryFor(showHistoryFor === msg.id ? null : msg.id); }}
                            className={cn("text-[9px] italic underline cursor-pointer", isMine ? "text-primary-foreground/50" : "text-muted-foreground")}
                          >
                            edited
                          </button>
                        )}
                        {d && (
                          <p className={cn("text-[10px]", isMine ? "text-primary-foreground/60" : "text-muted-foreground")}>
                            {format(d, "h:mm a")}
                          </p>
                        )}
                      </div>
                      {/* Reply button on hover (desktop) */}
                      {!isDeleted && (
                        <button
                          onClick={() => setReplyToMsg(msg)}
                          className={cn(
                            "absolute top-1 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-full bg-background/80 flex items-center justify-center shadow-sm",
                            isMine ? "-left-8" : "-right-8",
                          )}
                          title="Reply"
                        >
                          <Reply className="w-3.5 h-3.5 text-foreground/60" />
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Edit history popover */}
                  {showHistoryFor === msg.id && msg.editHistory && msg.editHistory.length > 0 && (
                    <div className={cn("flex", isMine ? "justify-end" : "justify-start")}>
                      <div className="max-w-[70%] mt-1 p-2 rounded-lg border border-border bg-popover text-popover-foreground text-xs shadow-md">
                        <p className="font-medium mb-1 text-[10px] text-muted-foreground">Edit history</p>
                        {msg.editHistory.map((oldText, i) => (
                          <p key={i} className="text-muted-foreground line-through py-0.5">{oldText}</p>
                        ))}
                        <p className="py-0.5 font-medium">{msg.text} <span className="text-muted-foreground font-normal">(current)</span></p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-popover border border-border rounded-xl shadow-xl py-1 min-w-[160px]"
          style={{ top: Math.min(contextMenu.y, window.innerHeight - 200), left: Math.min(contextMenu.x, window.innerWidth - 180) }}
        >
          <button
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted transition-colors"
            onClick={(e) => { e.stopPropagation(); const msg = messages.find((m) => m.id === contextMenu.msgId); if (msg) setReplyToMsg(msg); setContextMenu(null); }}
          >
            <Reply className="w-4 h-4" /> Reply
          </button>
          {contextMenu.isMine && contextMenu.type !== "voice" && contextMenu.type !== "image" && contextMenu.type !== "video" && contextMenu.type !== "file" && contextMenu.text && (
            <button
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted transition-colors"
              onClick={(e) => { e.stopPropagation(); setEditingMsgId(contextMenu.msgId); setEditText(contextMenu.text); setContextMenu(null); }}
            >
              <Pencil className="w-4 h-4" /> Edit
            </button>
          )}
          {contextMenu.isMine && (
            <button
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted transition-colors text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete?.(contextMenu.msgId); setContextMenu(null); }}
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* File send confirmation */}
      {pendingFile && (
        <div className="border-t border-border px-4 py-3 shrink-0 bg-muted/50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
              {pendingFile.type === "image" ? <ImageIcon className="w-6 h-6 text-muted-foreground" />
                : pendingFile.type === "video" ? <Film className="w-6 h-6 text-muted-foreground" />
                : <FileText className="w-6 h-6 text-muted-foreground" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{pendingFile.file.name}</p>
              <p className="text-xs text-muted-foreground">{(pendingFile.file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setPendingFile(null)}><X className="w-4 h-4" /></Button>
            <Button size="sm" onClick={confirmFileSend}><Send className="w-4 h-4 mr-1" /> Send</Button>
          </div>
        </div>
      )}

      {/* Voice send confirmation */}
      {pendingVoice && (
        <div className="border-t border-border px-4 py-3 shrink-0 bg-muted/50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
              <Mic className="w-6 h-6 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Voice message</p>
              <p className="text-xs text-muted-foreground">{formatRecordTime(pendingVoice.duration)}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setPendingVoice(null)}><X className="w-4 h-4" /></Button>
            <Button size="sm" onClick={confirmVoiceSend}><Send className="w-4 h-4 mr-1" /> Send</Button>
          </div>
        </div>
      )}

      {/* Emoji picker */}
      {showEmojis && (
        <div className="border-t border-border px-3 py-2 bg-background shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground font-medium">Emojis</span>
            <button onClick={() => setShowEmojis(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {EMOJI_LIST.map((e) => (
              <button
                key={e}
                onClick={() => handleEmojiClick(e)}
                className="text-xl hover:scale-110 transition-transform p-0.5"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Upload progress bar */}
      {uploading && (
        <div className="border-t border-border px-4 py-2 shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Uploading… {uploadProgress}%</span>
          </div>
          <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {/* Reply preview */}
      {replyToMsg && !editingMsgId && (
        <div className="border-t border-border px-4 py-2 shrink-0 bg-muted/40 flex items-center gap-2">
          <div className="w-1 h-8 bg-primary rounded-full" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-primary">{replyToMsg.senderId === user?.uid ? "You" : contact.name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {replyToMsg.text || (replyToMsg.type === "voice" ? "🎤 Voice message" : replyToMsg.type === "image" ? "📷 Photo" : "📎 File")}
            </p>
          </div>
          <button onClick={() => setReplyToMsg(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Edit mode bar */}
      {editingMsgId && (
        <div className="border-t border-border px-4 py-2 shrink-0 bg-blue-500/5 flex items-center gap-2">
          <Pencil className="w-4 h-4 text-blue-500" />
          <span className="text-xs text-blue-500 font-medium">Editing message</span>
          <div className="flex-1" />
          <button onClick={() => { setEditingMsgId(null); setEditText(""); }} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border p-3 shrink-0">
        {isRecording ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-medium text-red-500">Recording {formatRecordTime(recordingDuration)}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={cancelRecording} title="Cancel"><X className="w-5 h-5 text-muted-foreground" /></Button>
            <Button size="icon" className="rounded-xl h-[42px] w-[42px] bg-red-500 hover:bg-red-600" onClick={stopRecording} title="Stop"><Square className="w-4 h-4" /></Button>
          </div>
        ) : editingMsgId ? (
          <div className="flex items-end gap-2">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-blue-500/50 bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 max-h-32"
              style={{ minHeight: 42 }}
              autoFocus
            />
            <Button size="icon" className="rounded-xl h-[42px] w-[42px] shrink-0 bg-blue-500 hover:bg-blue-600" onClick={handleEditSave}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-primary" onClick={() => setShowEmojis((p) => !p)} title="Emojis">
              <SmilePlus className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-primary" onClick={() => fileInputRef.current?.click()} title="Attach file" disabled={uploading}>
              <Paperclip className="w-5 h-5" />
            </Button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              rows={1}
              className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring max-h-32"
              style={{ minHeight: 42 }}
            />
            {input.trim() ? (
              <Button size="icon" className="rounded-xl h-[42px] w-[42px] shrink-0" onClick={handleSend}>
                <Send className="w-4 h-4" />
              </Button>
            ) : (
              <Button size="icon" variant="ghost" className="rounded-xl h-[42px] w-[42px] shrink-0 text-muted-foreground hover:text-primary" onClick={startRecording} title="Record voice message">
                <Mic className="w-5 h-5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

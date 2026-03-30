import { useRef, useEffect, useState, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Send, Video, Phone, ArrowLeft, Loader2, Paperclip, Mic, Square, SmilePlus, X, Play, Pause, FileText, Image as ImageIcon, Film } from "lucide-react";
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
  onSend: (text: string) => void;
  onSendFile?: (opts: {
    type: ChatMessageType;
    text?: string;
    fileUrl?: string;
    fileName?: string;
    fileType?: string;
    duration?: number;
  }) => void;
  onSend: (text: string) => void;
  onBack?: () => void;
  showBackButton?: boolean;
}

function toDate(ts: any): Date | null {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return null;
}

export default function ChatRoom({ contact, messages, loading, onSend, onSendFile, onBack, showBackButton }: Props) {
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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input);
    setInput("");
    setShowEmojis(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── File upload ──
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onSendFile) return;
    e.target.value = ""; // reset input

    let type: ChatMessageType = "file";
    if (file.type.startsWith("image/")) type = "image";
    else if (file.type.startsWith("video/")) type = "video";

    try {
      setUploading(true);
      setUploadProgress(0);
      const url = await uploadToCloudinary(file, (p) => setUploadProgress(p));
      onSendFile({
        type,
        fileUrl: url,
        fileName: file.name,
        fileType: file.type,
      });
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [onSendFile]);

  // ── Voice recording ──
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4" });
      recordingChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: recorder.mimeType });
        if (onSendFile) {
          try {
            setUploading(true);
            const url = await uploadToCloudinary(file, (p) => setUploadProgress(p));
            onSendFile({
              type: "voice",
              fileUrl: url,
              fileName: file.name,
              fileType: recorder.mimeType,
              duration: recordingDuration,
            });
          } catch (err) {
            console.error("Voice upload failed:", err);
          } finally {
            setUploading(false);
            setUploadProgress(0);
          }
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => setRecordingDuration((d) => d + 1), 1000);
    } catch (err) {
      console.error("Mic access denied:", err);
    }
  }, [onSendFile, recordingDuration]);

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

  // ── Emoji insert / send ──
  const handleEmojiClick = useCallback((emoji: string) => {
    if (onSendFile) {
      // Insert emoji into input
      setInput((prev) => prev + emoji);
    }
  }, [onSendFile]);

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
                        "max-w-[75%] px-3 py-2 rounded-2xl text-sm break-words",
                        isMine
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted text-foreground rounded-bl-md",
                      )}
                    >
                      {/* Image message */}
                      {msg.type === "image" && msg.fileUrl && (
                        <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer">
                          <img
                            src={msg.fileUrl}
                            alt={msg.fileName ?? "Image"}
                            className="rounded-lg max-w-full max-h-60 object-cover mb-1"
                          />
                        </a>
                      )}
                      {/* Video message */}
                      {msg.type === "video" && msg.fileUrl && (
                        <video
                          src={msg.fileUrl}
                          controls
                          className="rounded-lg max-w-full max-h-60 mb-1"
                        />
                      )}
                      {/* Voice message */}
                      {msg.type === "voice" && msg.fileUrl && (
                        <div className="flex items-center gap-2 min-w-[160px]">
                          <button
                            onClick={() => toggleAudioPlayback(msg.id, msg.fileUrl!)}
                            className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                              isMine ? "bg-primary-foreground/20" : "bg-foreground/10",
                            )}
                          >
                            {playingAudioId === msg.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </button>
                          <div className="flex-1">
                            <div className={cn("h-1 rounded-full", isMine ? "bg-primary-foreground/30" : "bg-foreground/20")} />
                          </div>
                          <span className="text-[10px] opacity-70">{msg.duration ? formatRecordTime(msg.duration) : "0:00"}</span>
                        </div>
                      )}
                      {/* File message (PDF, etc.) */}
                      {msg.type === "file" && msg.fileUrl && (
                        <a
                          href={msg.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 py-1"
                        >
                          <FileText className="w-5 h-5 shrink-0" />
                          <span className="truncate underline">{msg.fileName ?? "File"}</span>
                        </a>
                      )}
                      {/* Text content — show for text/emoji types or legacy msgs (no type), skip for voice-only */}
                      {msg.text && msg.type !== "voice" && (msg.type !== "text" || !msg.fileUrl) && !((!msg.type) && msg.fileUrl) && (
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                      )}
                      {d && (
                        <p
                          className={cn(
                            "text-[10px] mt-1",
                            isMine ? "text-primary-foreground/60" : "text-muted-foreground",
                          )}
                        >
                          {format(d, "h:mm a")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
        className="hidden"
        onChange={handleFileSelect}
      />

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

      {/* Input */}
      <div className="border-t border-border p-3 shrink-0">
        {isRecording ? (
          /* Voice recording bar */
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-medium text-red-500">Recording {formatRecordTime(recordingDuration)}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={cancelRecording} title="Cancel">
              <X className="w-5 h-5 text-muted-foreground" />
            </Button>
            <Button size="icon" className="rounded-xl h-[42px] w-[42px] bg-red-500 hover:bg-red-600" onClick={stopRecording} title="Send voice message">
              <Square className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          /* Normal input bar */
          <div className="flex items-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-primary"
              onClick={() => setShowEmojis((p) => !p)}
              title="Emojis"
            >
              <SmilePlus className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-primary"
              onClick={() => fileInputRef.current?.click()}
              title="Attach file"
              disabled={uploading}
            >
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
              <Button
                size="icon"
                className="rounded-xl h-[42px] w-[42px] shrink-0"
                onClick={handleSend}
              >
                <Send className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                className="rounded-xl h-[42px] w-[42px] shrink-0 text-muted-foreground hover:text-primary"
                onClick={startRecording}
                title="Record voice message"
              >
                <Mic className="w-5 h-5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

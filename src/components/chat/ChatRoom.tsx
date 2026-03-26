import { useRef, useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Send, Video, ArrowLeft, Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useCallStore } from "@/store/callStore";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { ChatMessage, ChatContact } from "@/hooks/useChat";

interface Props {
  contact: ChatContact;
  messages: ChatMessage[];
  loading?: boolean;
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

export default function ChatRoom({ contact, messages, loading, onSend, onBack, showBackButton }: Props) {
  const user = useAuthStore((s) => s.user);
  const startCall = useCallStore((s) => s.startCall);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const initials = contact.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  // Group messages by date
  let lastDateStr = "";

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
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
          className="text-primary hover:bg-primary/10"
          title="Start video call"
          onClick={() => startCall(contact.uid, contact.name, contact.avatar)}
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
                      <p className="whitespace-pre-wrap">{msg.text}</p>
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

      {/* Input */}
      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring max-h-32"
            style={{ minHeight: 42 }}
          />
          <Button
            size="icon"
            className="rounded-xl h-[42px] w-[42px] shrink-0"
            onClick={handleSend}
            disabled={!input.trim()}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

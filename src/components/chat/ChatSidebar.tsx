import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import { useState } from "react";
import type { ChatContact } from "@/hooks/useChat";

interface Props {
  contacts: ChatContact[];
  activeContactUid: string | null;
  onSelect: (uid: string) => void;
  loading?: boolean;
}

function timeAgo(ts: any): string {
  if (!ts) return "";
  const seconds = ts?.seconds ?? ts?._seconds;
  if (!seconds) return "";
  const diff = Math.floor((Date.now() - seconds * 1000) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function ChatSidebar({ contacts, activeContactUid, onSelect, loading }: Props) {
  const [search, setSearch] = useState("");

  const filtered = contacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  // Sort: unread first, then by last message time
  const sorted = [...filtered].sort((a, b) => {
    if (a.unreadCount && !b.unreadCount) return -1;
    if (!a.unreadCount && b.unreadCount) return 1;
    const aTime = a.lastMessageAt?.seconds ?? 0;
    const bTime = b.lastMessageAt?.seconds ?? 0;
    return bTime - aTime;
  });

  return (
    <div className="flex flex-col h-full border-r border-border bg-background">
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search contacts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-6 text-center text-muted-foreground text-sm">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">No contacts found</div>
        ) : (
          sorted.map((c) => (
            <button
              key={c.uid}
              onClick={() => onSelect(c.uid)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-accent/50 transition-colors border-b border-border/50",
                activeContactUid === c.uid && "bg-accent",
              )}
            >
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={c.avatar} />
                <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                  {c.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm truncate">{c.name}</span>
                  {c.lastMessageAt && (
                    <span className="text-[10px] text-muted-foreground ml-1 shrink-0">
                      {timeAgo(c.lastMessageAt)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs text-muted-foreground truncate max-w-[160px]">
                    {c.lastMessage ?? "No messages yet"}
                  </span>
                  {c.unreadCount > 0 && (
                    <Badge
                      variant="default"
                      className="ml-1 h-5 min-w-[20px] flex items-center justify-center rounded-full text-[10px] px-1.5 shrink-0"
                    >
                      {c.unreadCount}
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </ScrollArea>
    </div>
  );
}

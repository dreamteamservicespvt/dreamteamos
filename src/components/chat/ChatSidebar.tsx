import MemberAvatar from "@/components/MemberAvatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import { useState } from "react";
import { useAuthStore } from "@/store/authStore";
import {
  CHAT_SECTIONS, defaultChatSection, inChatSection, type ChatSectionKey,
} from "@/utils/chatHelpers";
import { getRoleLabel } from "@/utils/roleHelpers";
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
  const user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState("");
  /**
   * Which part of the company is listed. Opens on the reader's own section — the people they
   * message every day — with everyone else one choice away rather than one rule away.
   */
  const [section, setSection] = useState<ChatSectionKey>(() => defaultChatSection(user?.role));

  const sectionCounts = CHAT_SECTIONS.map((s) => ({
    ...s,
    count: contacts.filter((c) => inChatSection(c.role, s.key)).length,
  }));

  const filtered = contacts
    .filter((c) => inChatSection(c.role, section))
    // Searching is for finding a person, so it looks across the whole company, not just the
    // section on screen — otherwise you have to know where someone sits to find them.
    .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  const searchHitsElsewhere = search.trim()
    ? contacts.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) && !inChatSection(c.role, section)).length
    : 0;

  // Sort: unread first, then by last message time
  const sorted = [...filtered].sort((a, b) => {
    if (a.unreadCount && !b.unreadCount) return -1;
    if (!a.unreadCount && b.unreadCount) return 1;
    const aTime = a.lastMessageAt?.seconds ?? 0;
    const bTime = b.lastMessageAt?.seconds ?? 0;
    return bTime - aTime;
  });

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background">
      <div className="p-3 border-b border-border shrink-0 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search everyone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={section}
          data-test="chat-section"
          onChange={(e) => setSection(e.target.value as ChatSectionKey)}
          className="w-full h-9 px-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {sectionCounts.map((s) => (
            <option key={s.key} value={s.key}>{s.label} ({s.count})</option>
          ))}
        </select>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-6 text-center text-muted-foreground text-sm">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            {/* Almost always the section, not the company — say so rather than "no contacts". */}
            {searchHitsElsewhere > 0 ? (
              <>
                Nobody here matches “{search}”.
                <button onClick={() => setSection("all")} className="mt-2 block w-full text-primary hover:underline">
                  {searchHitsElsewhere} match{searchHitsElsewhere === 1 ? "" : "es"} in other sections — show everyone
                </button>
              </>
            ) : "No contacts found"}
          </div>
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
              {/* The one avatar component the whole app uses — a photo uploaded once shows here,
                  and a deleted Cloudinary URL falls back to initials instead of a broken image.
                  Tapping the photo views it; tapping anywhere else in the row opens the chat, and
                  closing the viewer does not open one — see ImageLightbox for how. */}
              <MemberAvatar name={c.name} avatar={c.avatar} size={40} viewable />

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
                    {/* With the whole company listed, "who is this?" matters more than "no messages
                        yet" — so an untouched conversation shows their role instead. */}
                    {c.lastMessage ?? getRoleLabel(c.role as never)}
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

import { useState, useEffect } from "react";
import {
  collection, query, where, onSnapshot, orderBy,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { getDepartmentMemberRole } from "@/utils/chatHelpers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, MessageSquare, ArrowLeft } from "lucide-react";
import type { AppUser, ChatRoom, ChatMessage } from "@/types";

export default function AdminChatMonitor() {
  const user = useAuthStore((s) => s.user);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Load team members
  useEffect(() => {
    if (!user) return;
    const memberRole = getDepartmentMemberRole(user.role);
    if (!memberRole) return;

    const q = query(
      collection(db, "users"),
      where("role", "==", memberRole),
      where("isActive", "==", true),
    );
    const unsub = onSnapshot(q, (snap) => {
      setMembers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser)));
      setLoadingMembers(false);
    });
    return unsub;
  }, [user?.uid, user?.role]);

  // Load all chat rooms where any member is a participant
  useEffect(() => {
    if (!user || members.length === 0) return;
    // Get all member UIDs including the admin
    const allUids = [user.uid, ...members.map((m) => m.uid)];

    // Firestore array-contains can only check one value, so we listen per member
    const unsubs: (() => void)[] = [];
    const roomMap = new Map<string, ChatRoom>();

    allUids.forEach((uid) => {
      const q = query(
        collection(db, "chatRooms"),
        where("participants", "array-contains", uid),
      );
      const unsub = onSnapshot(q, (snap) => {
        snap.docs.forEach((d) => {
          const room = { id: d.id, ...d.data() } as ChatRoom;
          // Only include rooms where both participants are in our department
          const bothInDept = room.participants.every((p) => allUids.includes(p));
          if (bothInDept) {
            roomMap.set(room.id, room);
          }
        });
        setRooms(Array.from(roomMap.values()));
      });
      unsubs.push(unsub);
    });

    return () => unsubs.forEach((u) => u());
  }, [user?.uid, members]);

  // Load messages for selected room
  useEffect(() => {
    if (!selectedRoom) { setMessages([]); return; }
    setLoadingMessages(true);
    const q = query(
      collection(db, "chatRooms", selectedRoom.id, "messages"),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage)));
      setLoadingMessages(false);
    });
    return unsub;
  }, [selectedRoom?.id]);

  const getInitials = (name: string) =>
    name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const allUids = user ? [user.uid, ...members.map((m) => m.uid)] : [];
  const nameMap = new Map<string, string>();
  const avatarMap = new Map<string, string>();
  if (user) {
    nameMap.set(user.uid, user.name);
    if (user.avatar) avatarMap.set(user.uid, user.avatar);
  }
  members.forEach((m) => {
    nameMap.set(m.uid, m.name);
    if (m.avatar) avatarMap.set(m.uid, m.avatar);
  });

  const sortedRooms = [...rooms].sort((a, b) => {
    const aTime = a.lastMessageAt?.toMillis?.() ?? 0;
    const bTime = b.lastMessageAt?.toMillis?.() ?? 0;
    return bTime - aTime;
  });

  if (loadingMembers) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* Room list */}
      <div className={`w-80 border-r flex flex-col shrink-0 ${selectedRoom ? "hidden md:flex" : "flex"}`}>
        <div className="p-4 border-b shrink-0">
          <h2 className="font-semibold flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            Chat Monitor
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            View all team conversations ({sortedRooms.length} chats)
          </p>
        </div>
        <ScrollArea className="flex-1">
          {sortedRooms.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No conversations yet
            </div>
          ) : (
            sortedRooms.map((room) => {
              const p1Name = room.participantNames?.[room.participants[0]] ?? "Unknown";
              const p2Name = room.participantNames?.[room.participants[1]] ?? "Unknown";
              const isSelected = selectedRoom?.id === room.id;
              return (
                <button
                  key={room.id}
                  onClick={() => setSelectedRoom(room)}
                  className={`w-full flex items-center gap-3 p-3 border-b hover:bg-muted/50 transition-colors text-left ${
                    isSelected ? "bg-muted" : ""
                  }`}
                >
                  <div className="flex -space-x-2">
                    <Avatar className="w-8 h-8 border-2 border-background">
                      <AvatarImage src={avatarMap.get(room.participants[0])} />
                      <AvatarFallback className="text-[10px]">{getInitials(p1Name)}</AvatarFallback>
                    </Avatar>
                    <Avatar className="w-8 h-8 border-2 border-background">
                      <AvatarImage src={avatarMap.get(room.participants[1])} />
                      <AvatarFallback className="text-[10px]">{getInitials(p2Name)}</AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {p1Name} ↔ {p2Name}
                    </p>
                    {room.lastMessage && (
                      <p className="text-xs text-muted-foreground truncate">{room.lastMessage}</p>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </ScrollArea>
      </div>

      {/* Messages panel */}
      <div className={`flex-1 flex flex-col min-w-0 ${!selectedRoom ? "hidden md:flex" : "flex"}`}>
        {!selectedRoom ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <MessageSquare className="w-12 h-12 mx-auto opacity-30" />
              <p className="text-sm">Select a conversation to view messages</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-4 py-3 border-b flex items-center gap-3 shrink-0">
              <button
                onClick={() => setSelectedRoom(null)}
                className="md:hidden p-1 hover:bg-muted rounded"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex -space-x-2">
                {selectedRoom.participants.map((uid) => (
                  <Avatar key={uid} className="w-8 h-8 border-2 border-background">
                    <AvatarImage src={avatarMap.get(uid)} />
                    <AvatarFallback className="text-[10px]">
                      {getInitials(nameMap.get(uid) ?? "?")}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">
                  {selectedRoom.participants.map((uid) => nameMap.get(uid) ?? "Unknown").join(" ↔ ")}
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                <Eye className="w-3 h-3 mr-1" /> Read-only
              </Badge>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {loadingMessages ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  No messages yet
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg) => {
                    const senderName = nameMap.get(msg.senderId) ?? "Unknown";
                    const senderAvatar = avatarMap.get(msg.senderId);
                    return (
                      <div key={msg.id} className="flex items-start gap-2">
                        <Avatar className="w-7 h-7 mt-0.5 shrink-0">
                          <AvatarImage src={senderAvatar} />
                          <AvatarFallback className="text-[10px]">{getInitials(senderName)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs font-semibold">{senderName}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {msg.createdAt?.toDate?.()?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) ?? ""}
                            </span>
                          </div>
                          <p className="text-sm break-words">{msg.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            {/* No input — read only */}
            <div className="px-4 py-2 border-t bg-muted/30 text-center shrink-0">
              <p className="text-xs text-muted-foreground">
                <Eye className="w-3 h-3 inline mr-1" />
                Monitoring mode — messages are read-only
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

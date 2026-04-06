import { useMemo } from "react";
import { useChat } from "@/hooks/useChat";
import { useIsMobile } from "@/hooks/use-mobile";
import ChatSidebar from "@/components/chat/ChatSidebar";
import ChatRoom from "@/components/chat/ChatRoom";
import { MessageSquare } from "lucide-react";
import type { ChatContact } from "@/hooks/useChat";

export default function Chat() {
  const isMobile = useIsMobile();
  const {
    contacts,
    activeRoomId,
    messages,
    loadingContacts,
    loadingMessages,
    openRoom,
    sendMessage,
    sendFileMessage,
    deleteMessage,
    editMessage,
    closeRoom,
  } = useChat();

  // Derive active contact from activeRoomId
  const activeContact: ChatContact | undefined = useMemo(() => {
    if (!activeRoomId) return undefined;
    const parts = activeRoomId.split("_");
    return contacts.find((c) => parts.includes(c.uid));
  }, [activeRoomId, contacts]);

  // Mobile: show either sidebar or room
  if (isMobile) {
    if (activeContact) {
      // Render as a fixed full-screen overlay that covers the Topbar completely.
      // The ChatRoom has its own header (contact name + call buttons).
      return (
        <div className="fixed inset-0 z-30 bg-background" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
          <ChatRoom
            contact={activeContact}
            messages={messages}
            loading={loadingMessages}
            onSend={sendMessage}
            onSendFile={sendFileMessage}
            onDelete={deleteMessage}
            onEdit={editMessage}
            onBack={closeRoom}
            showBackButton
          />
        </div>
      );
    }
    return (
      <div className="h-full flex flex-col">
        <div className="border-b border-border px-4 py-3 shrink-0">
          <h1 className="text-lg font-semibold">Team Chat</h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ChatSidebar
            contacts={contacts}
            activeContactUid={null}
            onSelect={openRoom}
            loading={loadingContacts}
          />
        </div>
      </div>
    );
  }

  // Desktop: split view
  return (
    <div className="h-full flex rounded-xl border border-border overflow-hidden bg-background shadow-sm">
      {/* Left — contacts */}
      <div className="w-80 shrink-0 h-full flex flex-col overflow-hidden border-r border-border">
        <div className="border-b border-border px-4 py-3 shrink-0">
          <h1 className="text-lg font-semibold">Team Chat</h1>
        </div>
        <ChatSidebar
          contacts={contacts}
          activeContactUid={activeContact?.uid ?? null}
          onSelect={openRoom}
          loading={loadingContacts}
        />
      </div>

      {/* Right — messages */}
      <div className="flex-1 min-w-0 h-full">
        {activeContact ? (
          <ChatRoom
            contact={activeContact}
            messages={messages}
            loading={loadingMessages}
            onSend={sendMessage}
            onSendFile={sendFileMessage}
            onDelete={deleteMessage}
            onEdit={editMessage}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
            <MessageSquare className="w-12 h-12 opacity-30" />
            <p className="text-sm">Select a contact to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}

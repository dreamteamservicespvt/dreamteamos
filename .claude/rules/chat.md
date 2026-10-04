---
paths:
  - "src/components/order-chat/**"
  - "src/components/chat/**"
  - "src/pages/client/**"
  - "src/pages/shared/{Chat,Meeting,AdminChatMonitor}.tsx"
  - "src/pages/sales-member/ClientChats.tsx"
  - "src/services/{orderChat,orderChatGuest,webrtcConfig,audio-route}.ts"
  - "src/hooks/{useOrderChat,useChat}.ts"
  - "src/store/callStore.ts"
  - "src/types/orderChat.ts"
  - "api/order-chat.ts"
  - "src/utils/{chatHelpers,orderChatId,orderChatStatus,audio}.ts"
  - "public/chat.webmanifest"
---

# Client order chat & calls, team chat, video calls, meetings — DTS-OS module context

> Part of the project context (CLAUDE.md → Context map). Claude Code loads this file automatically when a
> file matching the `paths:` above is read or edited. Section numbers are CLAUDE.md's originals, so a
> reference such as "§17.2" still points here. Keep it current per CLAUDE.md §30 step 8; the source code wins.

## 9. APPLICATION MODULES (the entries for this module)

**9.10 Client order chat + client calls** ✅. `pages/client/ClientChat.tsx` (public),
`components/order-chat/*` (`StaffOrderChat`, `SalesOrderChat`, `OrderChatPanel`, `ClientCall`,
`ClientReviewCard`, `ShareChatModal`), `services/orderChat.ts`, `services/orderChatGuest.ts`
(separate Firebase app instance for guests), `hooks/useOrderChat.ts`, `utils/orderChatId.ts`,
`api/order-chat.ts`. Collections `order_chats` (+`messages` subcollection), `calls`. The room opens
at **sale** time (team-only, `clientReady:false`), becomes client-accessible on assignment, locks on
completion (`delivered`), and reopens on undo or edits. Sales members read their rooms at
`/sales/client-chats`.

**9.12 Team chat, video calls, meetings, chat monitor** ✅. `pages/shared/Chat.tsx`, `Meeting.tsx`,
`AdminChatMonitor.tsx`; `components/chat/*` (`ChatRoom`, `ChatSidebar`, `VideoCallManager`,
`MeetingRoom`); `hooks/useChat.ts`, `store/callStore.ts`, `utils/chatHelpers.ts`,
`services/webrtcConfig.ts`, `services/audio-route.ts`. Collections `chatRooms` (+messages),
`calls` (+ICE candidate subcollections), `meetings` (+participants/signals). Everyone can chat with
everyone (`CHATTABLE_ROLES`). Tech and sales admins can read their department members' chats.

## 24. BUSINESS RULES (IMPLEMENTED; verified in code)

- **Client chat:** opens at sale (team-only), the client is admitted after assignment, locks on
  delivery, reopens on undo or edits; guests may only update presence, unread counts, last
  message and their review.

## 27. POTENTIAL RISKS (need verification)

- `api/order-chat.homeFor` sends `main_admin` to `/tech-admin/work-assign`, a route main_admin
  cannot open (bounces to `/login`) if a main admin is ever a room participant.

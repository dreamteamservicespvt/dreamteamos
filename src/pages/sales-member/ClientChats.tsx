/**
 * Every client conversation this sales member is part of, in one place.
 *
 * Their route into the chats is My Leads — the sale row has a button — but a lead list is
 * organised around *numbers being worked*, and by the time an ad is in production the sale has
 * scrolled somewhere below a fortnight of calls. This page is organised around the thing they
 * actually come looking for: which of my clients is waiting on a reply.
 *
 * ── What it costs ─────────────────────────────────────────────────────────────────────────────
 * Two live queries, both scoped to this member: the rooms they are on, and the orders they sold.
 * Neither scans the company. That matters more here than it looks — this app runs on Firestore's
 * free daily read budget, and a chat list is exactly the kind of screen someone leaves open.
 *
 * The orders query earns its place by supplying the rows that have no room yet: a sale nobody has
 * picked up has no assignment and therefore no conversation, and leaving it off the list would
 * make "where is my client's chat?" unanswerable for the one case where the answer is "the tech
 * team has not started it".
 */
import { useMemo, useState } from "react";
import { collection, query, where } from "firebase/firestore";
import { MessageCircle, Search, Loader2, Star, Clock, Hourglass } from "lucide-react";
import { format } from "date-fns";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { useFirestoreQuery } from "@/hooks/useFirestore";
import { useMyOrderChats } from "@/hooks/useOrderChat";
import { workStatusChip, NOT_ASSIGNED_CHIP } from "@/utils/orderChatStatus";
import { bulkCategoryLabel } from "@/utils/serviceCatalog";
import SalesOrderChat from "@/components/order-chat/SalesOrderChat";
import type { Order } from "@/types";
import type { ClientReview, OrderChatDoc } from "@/types/orderChat";

function tsMs(ts: unknown): number {
  const t = ts as { toMillis?: () => number; seconds?: number } | null;
  if (!t) return 0;
  if (typeof t.toMillis === "function") return t.toMillis();
  return typeof t.seconds === "number" ? t.seconds * 1000 : 0;
}

function whenLabel(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return format(d, "h:mm a");
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return format(d, "dd MMM");
}

/** One line in the list — a room, or a sale that has not become one yet. */
interface ChatRow {
  key: string;
  /** Present once the job has been assigned; absent means there is nothing to open. */
  assignmentId?: string;
  businessName: string;
  uniqueId?: string;
  category?: string;
  bulkAdType?: string | null;
  chip: { label: string; className: string };
  unread: number;
  preview: string;
  at: number;
  review?: ClientReview | null;
  /** A room that exists but has not got this member on it yet — see `rows` for why. */
  joinable?: boolean;
}

/**
 * The order's own idea of where the work is, for a room this member cannot read yet.
 *
 * Coarser than the assignment's status by one step — an order does not know about `in_progress` —
 * which is why it is only a stand-in until they open the chat and the real status arrives.
 */
function statusFromOrder(status: Order["status"]) {
  if (status === "verified") return workStatusChip("verified");
  if (status === "completed") return workStatusChip("completed");
  if (status === "assigned") return workStatusChip("assigned");
  return NOT_ASSIGNED_CHIP;
}

export default function ClientChats() {
  const user = useAuthStore((s) => s.user);
  const { rooms, loading: roomsLoading } = useMyOrderChats(user?.uid);

  const ordersQuery = useMemo(
    () => (user?.uid ? query(collection(db, "orders"), where("soldBy", "==", user.uid)) : null),
    [user?.uid],
  );
  const { data: orders, loading: ordersLoading } = useFirestoreQuery<Order>(ordersQuery, [user?.uid]);

  const [search, setSearch] = useState("");
  const [openChat, setOpenChat] = useState<string | null>(null);

  const rows = useMemo((): ChatRow[] => {
    const byAssignment = new Map<string, OrderChatDoc>(rooms.map((r) => [r.id, r]));
    const claimed = new Set<string>();

    /**
     * Their sales, each carrying whatever conversation it has grown.
     *
     * Driven from the ORDERS rather than from the rooms, and that is the whole point of this memo.
     * A seller is only put on a room when the work is assigned, so every job already in production
     * on the day this shipped has a room that does not list them — and a page built from rooms
     * alone would show a member with thirty live ads an empty list, or worse, thirty rows all
     * claiming "Not assigned" while the tech team is mid-way through them.
     *
     * A row for a room they are not on yet is still openable: opening it is what joins them (see
     * `ensureOrderChat`). Until then the order's own status stands in for the room's.
     */
    const fromOrders: ChatRow[] = orders
      .filter((o) => !o.deleted && o.status !== "deleted" && o.status !== "cancelled")
      .map((o) => {
        const room = o.workAssignmentId ? byAssignment.get(o.workAssignmentId) : undefined;
        if (room) claimed.add(room.id);
        const base = {
          key: `order_${o.id}`,
          businessName: o.businessName || o.clientName || "Client",
          category: o.category,
          bulkAdType: o.bulkAdType,
        };

        if (room) {
          return {
            ...base,
            assignmentId: room.id,
            uniqueId: room.uniqueId,
            chip: workStatusChip(room.workStatus),
            unread: (user?.uid && room.unreadCounts?.[user.uid]) || 0,
            preview: room.lastMessage || "No messages yet",
            at: tsMs(room.lastMessageAt) || tsMs(room.createdAt) || tsMs(o.createdAt),
            review: room.clientReview || null,
          };
        }

        if (o.workAssignmentId) {
          return {
            ...base,
            assignmentId: o.workAssignmentId,
            chip: statusFromOrder(o.status),
            unread: 0,
            preview: "Open to join the conversation about this ad.",
            at: tsMs(o.updatedAt) || tsMs(o.createdAt),
            joinable: true,
          };
        }

        return {
          ...base,
          chip: NOT_ASSIGNED_CHIP,
          unread: 0,
          preview: "Waiting for the tech team to pick this up.",
          at: tsMs(o.createdAt),
        };
      });

    /** Rooms they are on that no order of theirs accounts for — an ad they were added to by hand. */
    const extraRooms: ChatRow[] = rooms
      .filter((r) => !claimed.has(r.id))
      .map((r) => ({
        key: r.id,
        assignmentId: r.id,
        businessName: r.businessName || r.clientName || "Client",
        uniqueId: r.uniqueId,
        category: r.category,
        chip: workStatusChip(r.workStatus),
        unread: (user?.uid && r.unreadCounts?.[user.uid]) || 0,
        preview: r.lastMessage || "No messages yet",
        at: tsMs(r.lastMessageAt) || tsMs(r.createdAt),
        review: r.clientReview || null,
      }));

    const all = [...fromOrders, ...extraRooms];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? all.filter((r) =>
          r.businessName.toLowerCase().includes(q)
          || (r.uniqueId || "").toLowerCase().includes(q)
          || r.chip.label.toLowerCase().includes(q))
      : all;

    // Anything unread first — it is the only reason to open this page in a hurry — then by when
    // something last happened.
    return filtered.sort((a, b) => {
      if ((a.unread > 0) !== (b.unread > 0)) return a.unread > 0 ? -1 : 1;
      return b.at - a.at;
    });
  }, [rooms, orders, user?.uid, search]);

  const totalUnread = rows.reduce((n, r) => n + r.unread, 0);
  const loading = roomsLoading || ordersLoading;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-accent/20 p-4 shadow-sm md:p-5">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
          <MessageCircle className="h-3 w-3" /> Your clients, mid-production
        </div>
        <h1 className="text-xl font-bold text-foreground md:text-2xl">Client Chats</h1>
        <p className="mt-1 text-xs text-muted-foreground md:text-sm">
          The same conversation the tech team is in. Anything the client sends you — photos, a logo,
          a change of mind — put it here and everyone working on the ad has it.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by business, job id or status…"
          data-test="client-chats-search"
          className="h-10 w-full rounded-xl border border-border/70 bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{rows.length} {rows.length === 1 ? "chat" : "chats"}</span>
        {totalUnread > 0 && (
          <span className="rounded-full bg-destructive/15 px-2 py-0.5 font-semibold text-destructive">
            {totalUnread} unread
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <MessageCircle className="mx-auto mb-3 h-12 w-12 opacity-30" />
          <p className="text-lg font-medium">No client chats yet</p>
          <p className="text-sm">
            A chat opens the moment the tech team is assigned one of your sales.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const openable = !!r.assignmentId;
            return (
              <button
                key={r.key}
                disabled={!openable}
                data-test="client-chat-row"
                onClick={() => r.assignmentId && setOpenChat(r.assignmentId)}
                className={`w-full rounded-xl border border-border bg-card p-3 text-left transition-all md:p-4 ${
                  openable ? "hover:border-primary/40 hover:shadow-md" : "cursor-default opacity-70"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 font-display font-bold text-primary">
                    {r.businessName.charAt(0).toUpperCase()}
                    {r.unread > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                        {r.unread > 9 ? "9+" : r.unread}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                        {r.businessName}
                      </p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{whenLabel(r.at)}</span>
                    </div>
                    <p className={`mt-0.5 truncate text-xs ${r.unread > 0 ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                      {r.preview}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.chip.className}`}>
                        {r.chip.label}
                      </span>
                      {r.category && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          {bulkCategoryLabel(r.category, r.bulkAdType || undefined)}
                        </span>
                      )}
                      {r.uniqueId && (
                        <span className="font-mono text-[10px] text-muted-foreground">{r.uniqueId}</span>
                      )}
                      {r.review && (
                        <span
                          title={r.review.comment || undefined}
                          className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          <Star className="h-2.5 w-2.5 fill-current" />
                          {r.review.work}/5 work · {r.review.service}/5 service
                        </span>
                      )}
                      {!openable && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Hourglass className="h-2.5 w-2.5" /> No chat until it is assigned
                        </span>
                      )}
                      {r.joinable && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          Tap to join
                        </span>
                      )}
                      {openable && r.at > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-2.5 w-2.5" /> {format(new Date(r.at), "dd MMM, h:mm a")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {openChat && user && (
        <SalesOrderChat
          assignmentId={openChat}
          soldBy={{ uid: user.uid, name: user.name }}
          onClose={() => setOpenChat(null)}
        />
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { getRoleLabel, getRoleColor, getProfileRoute, defaultRouteForUser, breadcrumbLabel } from "@/utils/roleHelpers";
import { Bell, Menu, Check, Trash2, Loader2 } from "lucide-react";
import { formatTime } from "@/utils/formatters";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNotifications, type AppNotification, type ClearReceipt } from "@/hooks/useNotifications";
import { PANEL_ROWS } from "@/utils/notificationInbox";
import NotificationRow from "@/components/layout/NotificationRow";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { AnimatePresence, motion } from "framer-motion";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import { playClickSound } from "@/utils/audio";
import MemberAvatar from "@/components/MemberAvatar";
import BrandLogo from "@/components/common/BrandLogo";
import { useMyDesignation } from "@/hooks/useEmployeeProfile";

interface TopbarProps {
  onMenuClick?: () => void;
}

/** A Firestore document id in the URL (a user's uid, an order-keyed month) rather than a page name. */
function looksLikeId(segment: string): boolean {
  return segment.length >= 20 && /^[A-Za-z0-9_-]+$/.test(segment) && /\d/.test(segment) && !/^[a-z]+(-[a-z]+)*$/.test(segment);
}

const UNDO_CLEAR_MS = 6000;

/**
 * "Cleared" with an Undo. Clear all takes effect at once (no "are you sure?" in the way); a press by
 * mistake is put right from here. Lives outside the component so a page change does not drop it.
 */
function offerUndoClear(receipt: ClearReceipt, undo: (r: ClearReceipt) => Promise<void>) {
  let done = false;
  const handle = toast({
    title: "Notifications cleared",
    description: "New notifications will still appear in the bell.",
    duration: UNDO_CLEAR_MS,
    action: (
      <ToastAction
        altText="Undo clearing the notifications"
        data-test="notif-undo-clear"
        data-keeps-bell-open=""
        onClick={async () => {
          if (done) return;
          done = true;
          try {
            await undo(receipt);
            // No "restored" toast: the rows coming back into the open bell say it. (Until 2026-10-13 a
            // phone's toasts sat at the top, over the bell's own buttons — one there made the next tap
            // on "Mark all read" land on the toast. They sit at the bottom now; the rows still say it.)
            handle.dismiss();
          } catch {
            toast({ title: "Could not restore your notifications", description: "Check your internet connection and try again.", variant: "destructive" });
          }
        }}
      >
        Undo
      </ToastAction>
    ),
  });
}

const UNDO_DISMISS_MS = 5000;

/** "Dismissed" with an Undo — a swipe can be a slip of the thumb. Outside the component, like the one above. */
function offerUndoDismiss(n: AppNotification, undo: (n: AppNotification) => Promise<void>) {
  let done = false;
  const handle = toast({
    title: "Notification dismissed",
    duration: UNDO_DISMISS_MS,
    action: (
      <ToastAction
        altText="Undo dismissing the notification"
        data-test="notif-undo-dismiss"
        data-keeps-bell-open=""
        onClick={async () => {
          if (done) return;
          done = true;
          try {
            await undo(n);
            handle.dismiss();
          } catch {
            toast({ title: "Could not bring the notification back", description: "Check your internet connection and try again.", variant: "destructive" });
          }
        }}
      >
        Undo
      </ToastAction>
    ),
  });
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const navigate = useNavigate();
  const [time, setTime] = useState(new Date());
  const isMobile = useIsMobile();
  const {
    notifications, unreadCount, busy, markAsRead, markAsUnread, dismiss, undoDismiss, markAllAsRead, clearAll, undoClear,
  } = useNotifications();
  const [showNotifs, setShowNotifs] = useState(false);

  // One row (2026-10-13). Each changes the row at once; words only when it could not be saved.
  const handleDismiss = (n: AppNotification) => {
    offerUndoDismiss(n, undoDismiss);
    dismiss(n).catch((err) => {
      console.error("Failed to dismiss notification:", err);
      toast({ title: "Could not dismiss the notification", description: "Check your internet connection and try again.", variant: "destructive" });
    });
  };
  const handleToggleRead = (n: AppNotification) => {
    if (!n.read) {
      void markAsRead(n.id);
      return;
    }
    markAsUnread(n.id).catch((err) => {
      console.error("Failed to mark notification as unread:", err);
      toast({ title: "Could not mark it as unread", description: "Check your internet connection and try again.", variant: "destructive" });
    });
  };

  // Both change the list at once; they only need words when they could not be saved.
  const handleMarkAllRead = async () => {
    try {
      await markAllAsRead();
    } catch (err) {
      console.error("Failed to mark all as read:", err);
      toast({ title: "Could not mark them as read", description: "Check your internet connection and try again.", variant: "destructive" });
    }
  };
  const handleClearAll = async () => {
    try {
      const receipt = await clearAll();
      if (receipt) offerUndoClear(receipt, undoClear);
    } catch (err) {
      console.error("Failed to clear notifications:", err);
      toast({ title: "Could not clear your notifications", description: "Check your internet connection and try again.", variant: "destructive" });
    }
  };
  const notifRef = useRef<HTMLDivElement>(null);
  /* At component level, not inside the badge below — that block only renders when there is a user,
     and a hook called conditionally is a hook called in a different order next render. */
  const designation = useMyDesignation(user);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Close on outside click — except the Undo of a clear, so the notifications it brings back are seen.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.("[data-keeps-bell-open]")) return;
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifs(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Resolve Firebase UIDs in URL to user names
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const pathSegments = location.pathname.split("/").filter(Boolean);
    pathSegments.forEach(async (s, i) => {
      if (resolvedNames[s]) return;
      try {
        // A social-media month's page (/smm/<id>) is named after its business, not its document id.
        if (pathSegments[i - 1] === "smm" && looksLikeId(s)) {
          const snap = await getDoc(doc(db, "smm_campaigns", s));
          const c = snap.exists() ? snap.data() : null;
          const name = c?.businessName || c?.clientName;
          if (name) setResolvedNames((prev) => ({ ...prev, [s]: name }));
          return;
        }
        if (/^[a-zA-Z0-9]{20,}$/.test(s)) {
          const userDoc = await getDoc(doc(db, "users", s));
          if (userDoc.exists()) {
            const name = userDoc.data().name;
            if (name) setResolvedNames((prev) => ({ ...prev, [s]: name }));
          }
        }
      } catch { /* ignore */ }
    });
  }, [location.pathname]);

  const segments = location.pathname.split("/").filter(Boolean);
  // A raw document id is never shown (it read "O_Uwng3cPr…_1790839133922" on a social-media month):
  // it is replaced by its name once that has been read, and left out until then.
  const breadcrumb = segments
    .map((s, i) => {
      if (resolvedNames[s]) return resolvedNames[s];
      if (looksLikeId(s)) return "";
      // The page's menu name, never a title-cased slug ("Hr", "Dev Os" — audit D-09).
      return breadcrumbLabel(segments, i, user?.role);
    })
    .filter(Boolean);

  const getNotifColor = (type: string) => {
    if (type.includes("approved") || type.includes("verified") || type.includes("completed")) return "bg-success/15 text-success";
    if (type.includes("rejected")) return "bg-destructive/15 text-destructive";
    if (type.includes("assigned")) return "bg-info/15 text-info";
    return "bg-primary/15 text-primary";
  };

  const getDefaultLink = (type: string) => {
    if (!user) return "/";
    const r = user.role;
    if (type === "salary_receipt") {
      if (r === "tech_member") return "/tech/salary";
      if (r === "tech_admin") return "/tech-admin/salary";
      if (r === "sales_admin") return "/sales-admin/salary";
      if (r === "accounts_admin") return "/accounts/salary";
      return "/salary"; 
    }
    if (type.includes("approved") || type.includes("rejected") || type === "check_out") {
      if (r === "tech_member") return "/tech/dashboard";
      if (r === "sales_member") return "/sales/dashboard";
      if (r === "tech_admin") return "/tech-admin/dashboard";
      if (r === "sales_admin") return "/sales-admin/dashboard";
    }
    if (type.includes("sale") || type === "lead_assigned") {
      if (r === "sales_member") return "/sales/leads";
      if (r === "sales_admin") return "/sales-admin/approvals";
    }
    // A client's message or call is about an assignment, so it lands wherever that person works
    // with assignments — a member's My Work, a leader's or an admin's assignment board.
    if (type === "chat_message" || type === "order_chat_call" || type === "voice_call" || type === "video_call") {
      if (r === "tech_member") return "/tech/my-work";
      if (r === "tech_team_leader") return "/team-leader/work-assign";
      if (r === "tech_admin" || r === "main_admin") return "/tech-admin/work-assign";
      if (r === "sales_member") return "/sales/chat";
      if (r === "sales_admin") return "/sales-admin/chat";
    }
    if (type === "work_assigned" || type === "team_work_assigned" || type === "work_completed" || type === "work_verified" || type === "work_editing" || type === "project_assigned") {
      if (r === "tech_admin" || r === "main_admin") return "/tech-admin/work-assign";
      if (r === "tech_member") return "/tech/my-work";
      // Team-wide FYIs land on a leader; without this they fell through to the dashboard.
      if (r === "tech_team_leader") return "/team-leader/work-assign";
    }
    return "/";
  };

  return (
    <header className="h-14 md:h-16 border-b border-border bg-card flex items-center px-4 md:px-6 justify-between">
      {/* Left side */}
      <div className="flex items-center gap-3">
        {isMobile && (
          <>
            <button onClick={onMenuClick}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              <Menu size={20} />
            </button>
            {/* The logo is the way home on a phone, where there is no sidebar to reach for. */}
            <Link to={user ? defaultRouteForUser(user) : "/"} title="Go to dashboard" data-test="topbar-logo">
              <BrandLogo variant="mark" alt="DTS" className="h-5 w-auto shrink-0" />
            </Link>
          </>
        )}
        <div className="flex items-center gap-2 text-sm">
          {breadcrumb.map((item, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span className="text-border">/</span>}
              <span className={`${i === breadcrumb.length - 1 ? "text-foreground font-medium" : "text-muted-foreground"} ${isMobile && i < breadcrumb.length - 1 ? "hidden" : ""}`}>
                {item}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 md:gap-4">
        <span className="font-mono text-xs md:text-sm text-muted-foreground hidden sm:block">{formatTime(time)}</span>

        {/* Notification Bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            data-test="notif-bell"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
            className="relative w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Bell size={16} />
            {/* On the bell's top-right corner, not over it (owner, 2026-10-13): the old 16px badge at
                top-1 right-1 covered most of the 16px icon on a phone. 14px, starting just right of
                the bell's centre line, with a ring in the bar's colour to part it from the icon. */}
            {unreadCount > 0 && (
              <span
                data-test="notif-badge"
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-0.5 ml-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-destructive px-[3px] text-[9px] font-semibold leading-none tabular-nums text-destructive-foreground ring-2 ring-card"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {showNotifs && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                /*
                  Pinned to the viewport on a phone, hung off the bell on a desktop.

                  A fixed 320px panel anchored to the bell's right edge runs off the left of a
                  360px screen, because the bell is not at the edge — the profile block is to the
                  right of it. `fixed inset-x-2` gives the panel the screen instead of the bell,
                  which is the only anchor a phone actually has.

                  24rem on a desktop (was 20rem) since 2026-10-13: each row now carries two 28px
                  buttons, and the message kept the width it had.
                */
                className="fixed inset-x-2 top-14 z-50 flex max-h-[70dvh] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-96 sm:w-96"
              >
                {/* min-h = the row with its 28px buttons, so it does not jump when a clear removes them. */}
                <div className="flex min-h-[53px] shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-border px-4 py-3">
                  <h3 className="font-display font-semibold text-foreground text-sm">Notifications</h3>
                  {/* 28px tall: the 16px text links were hard to hit on a phone. */}
                  <div className="flex items-center gap-1">
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        disabled={busy !== null}
                        data-test="notif-mark-all-read"
                        className="flex min-h-[28px] items-center gap-1 rounded-md px-2 text-xs text-primary hover:bg-primary/10 disabled:opacity-60"
                      >
                        {busy === "read" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Mark all read
                      </button>
                    )}
                    {notifications.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearAll}
                        disabled={busy !== null}
                        data-test="notif-clear-all"
                        className="flex min-h-[28px] items-center gap-1 rounded-md px-2 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-60"
                      >
                        {busy === "clear" ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Clear all
                      </button>
                    )}
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center">
                      <Bell size={24} className="mx-auto text-muted-foreground/30 mb-2" />
                      <p className="text-xs text-muted-foreground">No notifications</p>
                    </div>
                  ) : (
                    // A dismissed row folds away; the rest slide up into its place.
                    <AnimatePresence initial={false}>
                      {notifications.slice(0, PANEL_ROWS).map((n) => (
                        <NotificationRow
                          key={n.id}
                          n={n}
                          chipClassName={getNotifColor(n.type)}
                          onOpen={(row) => {
                            playClickSound();
                            markAsRead(row.id);
                            navigate(row.link || getDefaultLink(row.type));
                            setShowNotifs(false);
                          }}
                          onToggleRead={handleToggleRead}
                          onDismiss={handleDismiss}
                        />
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {user && (() => {
          const body = (
            <>
              <MemberAvatar name={user.name} avatar={user.avatar} size={30} />
              <div className="hidden md:block max-w-[200px] text-left">
                <p className="text-sm font-medium text-foreground leading-tight truncate">{user.name}</p>
                <span
                  title={`${designation} · ${getRoleLabel(user.role)} access`}
                  data-test="topbar-designation"
                  className={`inline-block max-w-full truncate align-bottom text-[10px] font-medium px-1.5 py-0.5 rounded-full ${getRoleColor(user.role)}`}
                >
                  {designation}
                </span>
              </div>
            </>
          );
          const profileRoute = getProfileRoute(user.role);
          // Your own face and name is the thing everybody clicks expecting their profile — so it
          // goes there. An accounts admin has no such page, and gets plain text rather than a
          // link that does nothing.
          return profileRoute ? (
            <Link
              to={profileRoute}
              title="My Profile"
              data-test="topbar-profile"
              className="flex items-center gap-2 rounded-lg pl-2 md:pl-3 py-1 pr-1 border-l border-border transition-colors hover:bg-accent"
            >
              {body}
            </Link>
          ) : (
            <div className="flex items-center gap-2 pl-2 md:pl-3 border-l border-border">{body}</div>
          );
        })()}
      </div>
    </header>
  );
}

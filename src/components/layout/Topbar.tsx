import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { getRoleLabel, getRoleColor, getProfileRoute } from "@/utils/roleHelpers";
import { Bell, Menu, Check, Trash2 } from "lucide-react";
import { formatTime } from "@/utils/formatters";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNotifications } from "@/hooks/useNotifications";
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

export default function Topbar({ onMenuClick }: TopbarProps) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const navigate = useNavigate();
  const [time, setTime] = useState(new Date());
  const isMobile = useIsMobile();
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotifications();
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  /* At component level, not inside the badge below — that block only renders when there is a user,
     and a hook called conditionally is a hook called in a different order next render. */
  const designation = useMyDesignation(user);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifs(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Resolve Firebase UIDs in URL to user names
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const pathSegments = location.pathname.split("/").filter(Boolean);
    pathSegments.forEach(async (s) => {
      if (/^[a-zA-Z0-9]{20,}$/.test(s) && !resolvedNames[s]) {
        try {
          const userDoc = await getDoc(doc(db, "users", s));
          if (userDoc.exists()) {
            const name = userDoc.data().name;
            if (name) setResolvedNames((prev) => ({ ...prev, [s]: name }));
          }
        } catch { /* ignore */ }
      }
    });
  }, [location.pathname]);

  const segments = location.pathname.split("/").filter(Boolean);
  const breadcrumb = segments.map((s) => {
    if (resolvedNames[s]) return resolvedNames[s];
    return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  });

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
            <BrandLogo variant="mark" alt="DTS" className="h-5 w-auto shrink-0" />
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
            className="relative w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
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
                */
                className="fixed inset-x-2 top-14 z-50 flex max-h-[70dvh] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-96 sm:w-80"
              >
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-border px-4 py-3">
                  <h3 className="font-display font-semibold text-foreground text-sm">Notifications</h3>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button onClick={markAllAsRead} className="text-xs text-primary hover:underline flex items-center gap-1">
                        <Check size={12} /> Mark all read
                      </button>
                    )}
                    {notifications.length > 0 && (
                      <button onClick={clearAll} className="text-xs text-destructive hover:underline flex items-center gap-1">
                        <Trash2 size={12} /> Clear all
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
                    notifications.slice(0, 20).map((n) => (
                      <button
                        key={n.id}
                        onClick={() => { 
                          playClickSound();
                          markAsRead(n.id); 
                          navigate(n.link || getDefaultLink(n.type)); 
                          setShowNotifs(false); 
                        }}
                        className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-accent/30 transition-colors ${!n.read ? "bg-primary/5" : ""}`}
                      >
                        <div className="flex items-start gap-2">
                          {/* Capped and truncated: "order chat call" at shrink-0 was wide enough to
                              push the message text past the edge of the panel on a phone. */}
                          <span className={`mt-0.5 max-w-[7rem] shrink-0 truncate rounded-full px-1.5 py-0.5 text-[10px] ${getNotifColor(n.type)}`}>
                            {n.type.replace(/_/g, " ")}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-xs font-medium text-foreground">{n.title}</p>
                            <p className="truncate text-[11px] text-muted-foreground">{n.message}</p>
                          </div>
                          {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />}
                        </div>
                      </button>
                    ))
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

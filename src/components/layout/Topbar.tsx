import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { getRoleLabel, getRoleColor } from "@/utils/roleHelpers";
import { Bell, Menu, Check, Trash2 } from "lucide-react";
import { formatTime } from "@/utils/formatters";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNotifications } from "@/hooks/useNotifications";
import { AnimatePresence, motion } from "framer-motion";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/services/firebase";

interface TopbarProps {
  onMenuClick?: () => void;
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const [time, setTime] = useState(new Date());
  const isMobile = useIsMobile();
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotifications();
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

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
    if (type.includes("approved") || type.includes("verified")) return "bg-success/15 text-success";
    if (type.includes("rejected")) return "bg-destructive/15 text-destructive";
    if (type.includes("assigned")) return "bg-info/15 text-info";
    return "bg-primary/15 text-primary";
  };

  return (
    <header className="h-14 md:h-16 border-b border-border bg-card flex items-center px-4 md:px-6 justify-between">
      {/* Left side */}
      <div className="flex items-center gap-3">
        {isMobile && (
          <button onClick={onMenuClick}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <Menu size={20} />
          </button>
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
                className="absolute right-0 top-full mt-2 w-80 max-h-96 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
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
                <div className="overflow-y-auto max-h-80">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center">
                      <Bell size={24} className="mx-auto text-muted-foreground/30 mb-2" />
                      <p className="text-xs text-muted-foreground">No notifications</p>
                    </div>
                  ) : (
                    notifications.slice(0, 20).map((n) => (
                      <button
                        key={n.id}
                        onClick={() => { markAsRead(n.id); }}
                        className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-accent/30 transition-colors ${!n.read ? "bg-primary/5" : ""}`}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full mt-0.5 shrink-0 ${getNotifColor(n.type)}`}>
                            {n.type.replace(/_/g, " ")}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground">{n.title}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{n.message}</p>
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

        {user && (
          <div className="flex items-center gap-2 pl-2 md:pl-3 border-l border-border">
            <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-primary/20 flex items-center justify-center font-display font-bold text-primary text-xs">
              {user.name?.charAt(0) || "U"}
            </div>
            <div className="hidden md:block">
              <p className="text-sm font-medium text-foreground leading-tight">{user.name}</p>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${getRoleColor(user.role)}`}>
                {getRoleLabel(user.role)}
              </span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

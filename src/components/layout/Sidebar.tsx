import { useLocation, useNavigate, Link } from "react-router-dom";
import { signOut } from "firebase/auth";
import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { useSidebarStore } from "@/store/sidebarStore";
import { getNavItems, getRoleLabel, getRoleColor } from "@/utils/roleHelpers";
import { ChevronLeft, ChevronRight, LogOut, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const collapsed = useSidebarStore((s) => s.collapsed);
  const toggle = useSidebarStore((s) => s.toggle);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  if (!user) return null;

  const navItems = getNavItems(user.role);

  const handleLogout = async () => {
    if (user) {
      try {
        const sessionsQuery = query(
          collection(db, "sessions"),
          where("userId", "==", user.uid),
          where("logoutAt", "==", null)
        );
        const snap = await getDocs(sessionsQuery);
        if (!snap.empty) {
          const now = new Date();
          const updates = snap.docs.map((sessionDoc) => {
            const loginAt = sessionDoc.data().loginAt;
            const durationMinutes = loginAt?.seconds
              ? Math.round((now.getTime() / 1000 - loginAt.seconds) / 60)
              : 0;
            return updateDoc(doc(db, "sessions", sessionDoc.id), {
              logoutAt: serverTimestamp(),
              duration: durationMinutes,
            });
          });
          await Promise.all(updates);
        }
      } catch (e) {
        console.error("Failed to update session on logout:", e);
      }
    }
    await signOut(auth);
    setUser(null);
    navigate("/login");
  };

  const handleNavClick = () => {
    if (isMobile) onMobileClose();
  };

  // On mobile: overlay drawer
  if (isMobile) {
    return (
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onMobileClose}
              className="fixed inset-0 bg-black/50 z-40"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="fixed left-0 top-0 h-screen w-[280px] bg-card border-r border-border flex flex-col z-50 overflow-hidden"
            >
              <div className="h-14 flex items-center px-4 border-b border-border justify-between shrink-0">
                <span className="font-display font-bold text-xl bg-gradient-to-r from-primary to-warning bg-clip-text text-transparent">DTS</span>
                <button onClick={onMobileClose} className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  <X size={18} />
                </button>
              </div>
              <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto min-h-0">
                {navItems.map((item) => {
                  const active = location.pathname === item.path;
                  return (
                    <Link key={item.path} to={item.path} onClick={handleNavClick}
                      className={`flex items-center gap-3 px-3 h-10 rounded-lg transition-all duration-150 relative ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}>
                      {active && <motion.div layoutId="sidebar-active-mobile" className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" transition={{ duration: 0.2 }} />}
                      <item.icon size={18} className="shrink-0" />
                      <span className="text-sm font-medium truncate">{item.title}</span>
                    </Link>
                  );
                })}
              </nav>
              <div className="border-t border-border p-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center font-display font-bold text-primary text-sm shrink-0">
                    {user.name?.charAt(0) || "U"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${getRoleColor(user.role)}`}>{getRoleLabel(user.role)}</span>
                  </div>
                  <button onClick={handleLogout} className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Logout">
                    <LogOut size={16} />
                  </button>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    );
  }

  // Desktop sidebar
  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="fixed left-0 top-0 h-screen bg-card border-r border-border flex flex-col z-30"
    >
      <div className="h-16 flex items-center px-4 border-b border-border justify-between">
        <AnimatePresence mode="wait">
          {!collapsed ? (
            <motion.span key="full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="font-display font-bold text-xl bg-gradient-to-r from-primary to-warning bg-clip-text text-transparent">DTS</motion.span>
          ) : (
            <motion.span key="icon" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="font-display font-bold text-lg text-primary mx-auto">D</motion.span>
          )}
        </AnimatePresence>
        <button onClick={toggle} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = location.pathname === item.path;
          return (
            <Link key={item.path} to={item.path}
              className={`flex items-center gap-3 px-3 h-10 rounded-lg transition-all duration-150 group relative ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
              title={collapsed ? item.title : undefined}>
              {active && <motion.div layoutId="sidebar-active" className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" transition={{ duration: 0.2 }} />}
              <item.icon size={18} className="shrink-0" />
              {!collapsed && <span className="text-sm font-medium truncate">{item.title}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center font-display font-bold text-primary text-sm shrink-0">{user.name?.charAt(0) || "U"}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${getRoleColor(user.role)}`}>{getRoleLabel(user.role)}</span>
            </div>
            <button onClick={handleLogout} className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Logout">
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button onClick={handleLogout} className="w-10 h-10 mx-auto rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Logout">
            <LogOut size={16} />
          </button>
        )}
      </div>
    </motion.aside>
  );
}

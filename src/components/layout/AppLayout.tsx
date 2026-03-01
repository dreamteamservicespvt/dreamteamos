import { useState } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/authStore";
import { useSidebarStore } from "@/store/sidebarStore";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { Loader2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import type { UserRole } from "@/types";

interface AppLayoutProps {
  allowedRoles?: UserRole[];
}

export default function AppLayout({ allowedRoles }: AppLayoutProps) {
  const { loading } = useAuth();
  const user = useAuthStore((s) => s.user);
  const collapsed = useSidebarStore((s) => s.collapsed);
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={32} className="animate-spin text-primary" />
          <p className="text-muted-foreground text-sm font-body">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div
        className="flex-1 flex flex-col transition-all duration-200"
        style={{ marginLeft: isMobile ? 0 : collapsed ? 64 : 240 }}
      >
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

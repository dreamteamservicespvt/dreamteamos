import { useState, useEffect, useRef } from "react";
import { Outlet, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/authStore";
import { useSidebarStore } from "@/store/sidebarStore";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { Loader2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { initFCM, onForegroundMessage } from "@/services/fcm";
import VideoCallManager from "@/components/chat/VideoCallManager";
import { registerBackButton } from "@/services/capacitor-plugins";
import { isNative } from "@/utils/platform";
import type { UserRole } from "@/types";

interface AppLayoutProps {
  allowedRoles?: UserRole[];
}

export default function AppLayout({ allowedRoles }: AppLayoutProps) {
  const { loading } = useAuth();
  const user = useAuthStore((s) => s.user);
  const collapsed = useSidebarStore((s) => s.collapsed);
  const fcmInitialized = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (user && !fcmInitialized.current) {
      fcmInitialized.current = true;
      initFCM(user.uid);
      const unsub = onForegroundMessage();
      return () => unsub();
    }
  }, [user?.uid]);

  // Hardware back button for Android
  useEffect(() => {
    if (!isNative()) return;
    const unsub = registerBackButton(() => {
      navigate(-1);
    });
    return unsub;
  }, [navigate]);
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
    <div className="h-full bg-background flex overflow-hidden">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div
        className="flex-1 flex flex-col min-w-0 transition-all duration-200"
        style={{ marginLeft: isMobile ? 0 : collapsed ? 64 : 240 }}
      >
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
          <Outlet />
        </main>
        <VideoCallManager />
      </div>
    </div>
  );
}

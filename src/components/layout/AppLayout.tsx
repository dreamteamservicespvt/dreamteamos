import { useState, useEffect, useRef } from "react";
import { Outlet, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/authStore";
import { useSidebarStore } from "@/store/sidebarStore";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { Loader2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { initFCM, onForegroundMessage } from "@/services/fcm";
import VideoCallManager from "@/components/chat/VideoCallManager";
import DailyCheckinPrompt from "@/components/attendance/DailyCheckinPrompt";
import ProfileCompletionPrompt from "@/components/profile/ProfileCompletionPrompt";
import MandatoryAgreementGate from "@/components/agreement/MandatoryAgreementGate";
import UpdatePopup from "@/components/layout/UpdatePopup";
import BirthdayGreeting from "@/components/BirthdayGreeting";
import { registerBackButton } from "@/services/capacitor-plugins";
import { isNative } from "@/utils/platform";
import { EXTERNAL_CREATOR_ROUTES } from "@/utils/roleHelpers";
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
  const location = useLocation();

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
  // External creators are confined to the ad-creation tool and their profile — any other route
  // (typed in, deep-linked, or bookmarked) sends them back to Create Ad.
  if (user.externalCreator && !EXTERNAL_CREATOR_ROUTES.includes(location.pathname)) {
    return <Navigate to="/tech/create" replace />;
  }

  return (
    <div className="h-full bg-background flex overflow-hidden">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div
        className="flex-1 flex flex-col min-w-0 transition-all duration-200"
        style={{ marginLeft: isMobile ? 0 : collapsed ? 64 : 240 }}
      >
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 md:p-6 overflow-x-hidden overflow-y-auto">
          {/* Above the page, not inside it: a birthday belongs to the whole company, so it shows
              wherever someone happens to be working. External creators are not colleagues. */}
          {!user.externalCreator && <BirthdayGreeting />}
          <Outlet />
        </main>
        <VideoCallManager />
        {user.role === "tech_member" && !user.externalCreator && <DailyCheckinPrompt />}
        {/* Asks employees once a day for whatever the company still needs from them, until it
            has it all. Decides for itself who it applies to — see utils/profileCompletion. */}
        <ProfileCompletionPrompt />
        <MandatoryAgreementGate />
        <UpdatePopup />
      </div>
    </div>
  );
}

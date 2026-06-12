import { useAuthStore } from "@/store/authStore";
import MemberAnalyticsDashboard from "@/components/analytics/MemberAnalyticsDashboard";
import { BarChart3 } from "lucide-react";

export default function TechMemberMyAnalytics() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="font-display text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 size={20} className="text-primary" /> My Analytics
        </h1>
        <p className="text-muted-foreground text-xs md:text-sm mt-1">Your videos and attendance — day by day</p>
      </div>
      <MemberAnalyticsDashboard member={user} showRevenue={false} />
    </div>
  );
}

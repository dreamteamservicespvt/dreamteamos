import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import type { AppUser } from "@/types";
import MemberAnalyticsDashboard from "@/components/analytics/MemberAnalyticsDashboard";
import { ArrowLeft, BarChart3, Loader2 } from "lucide-react";

export default function TechAdminMemberAnalytics() {
  const { memberId } = useParams<{ memberId: string }>();
  const navigate = useNavigate();
  const [member, setMember] = useState<AppUser | null>(null);

  useEffect(() => {
    if (!memberId) return;
    const unsub = onSnapshot(doc(db, "users", memberId), (snap) => {
      if (snap.exists()) setMember({ uid: snap.id, ...snap.data() } as AppUser);
    });
    return unsub;
  }, [memberId]);

  if (!member) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0">
          <h1 className="font-display text-lg md:text-2xl font-bold text-foreground truncate flex items-center gap-2">
            <BarChart3 size={20} className="text-primary shrink-0" /> {member.name}'s Analytics
          </h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-0.5 truncate">{member.email}</p>
        </div>
      </div>
      <MemberAnalyticsDashboard member={member} />
    </div>
  );
}

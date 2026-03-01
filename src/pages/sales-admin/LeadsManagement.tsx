import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import type { AppUser, Lead } from "@/types";
import { Search, Users, ChevronRight } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

export default function LeadsManagement() {
  const currentUser = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [members, setMembers] = useState<AppUser[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchMembers = async () => {
      const usersSnap = await getDocs(collection(db, "users"));
      const allUsers = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
      const myMembers = allUsers.filter((u) => u.role === "sales_member" && u.createdBy === currentUser?.uid);
      setMembers(myMembers);
      return myMembers;
    };

    let unsub: (() => void) | undefined;

    fetchMembers().then((myMembers) => {
      const leadsRef = collection(db, "leads");
      unsub = onSnapshot(leadsRef, (snap) => {
        const memberIds = myMembers.map((m) => m.uid);
        const allLeads = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Lead))
          .filter((l) => memberIds.includes(l.assignedTo) || l.assignedBy === currentUser?.uid);
        setLeads(allLeads);
        setLoading(false);
      });
    });

    return () => { unsub?.(); };
  }, [currentUser?.uid]);

  const getLeadsForMember = (uid: string) => leads.filter((l) => l.assignedTo === uid);

  const filteredMembers = members.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl md:text-2xl font-bold text-foreground">Leads Management</h1>
        <p className="text-muted-foreground text-xs md:text-sm mt-1">
          Click on a team member to view & manage their leads • {leads.length} total leads
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members..."
          className="w-full h-9 pl-9 pr-3 rounded-lg bg-card border border-border text-foreground text-sm outline-none focus:border-primary" />
      </div>

      {/* Team Members List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse space-y-2">
              <div className="h-5 bg-muted rounded w-32" />
              <div className="h-4 bg-muted rounded w-24" />
            </div>
          ))}
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Users size={32} className="mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-muted-foreground text-sm">{search ? "No members match your search" : "No team members found"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMembers.map((member) => {
            const memberLeads = getLeadsForMember(member.uid);
            const salesCount = memberLeads.filter((l) => l.saleDone).length;
            const calledCount = memberLeads.filter((l) => l.status !== "not_called").length;

            return (
              <button
                key={member.uid}
                onClick={() => navigate(`/sales-admin/leads/${member.uid}`)}
                className="w-full bg-card border border-border rounded-xl p-4 flex items-center justify-between hover:bg-accent/30 hover:border-primary/30 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-primary/15 flex items-center justify-center font-display font-bold text-primary text-sm md:text-base shrink-0">
                    {member.name?.charAt(0) || "?"}
                  </div>
                  <div className="text-left">
                    <p className="font-display font-semibold text-foreground">{member.name}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs">
                    <span className="px-1.5 md:px-2 py-0.5 rounded-full bg-info/15 text-info">{memberLeads.length} leads</span>
                    <span className="px-1.5 md:px-2 py-0.5 rounded-full bg-warning/15 text-warning hidden sm:inline-flex">{calledCount} called</span>
                    <span className="px-1.5 md:px-2 py-0.5 rounded-full bg-success/15 text-success">{salesCount} sales</span>
                  </div>
                  <ChevronRight size={18} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
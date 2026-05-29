import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency } from "@/utils/formatters";
import { format } from "date-fns";
import type { AppUser, Lead, SaleDetail } from "@/types";
import { Trophy, Medal, Crown, TrendingUp, IndianRupee, Calendar, Star } from "lucide-react";

interface MemberStats {
  member: AppUser;
  todaySales: number;
  careerSales: number;
  commissionToday: number;
  commissionCareer: number;
}

function getSaleItems(lead: Lead): SaleDetail[] {
  return lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
}

function calcCommission(revenue: number, option?: "stipend_plus_5" | "incentive_10"): number {
  if (option === "incentive_10") return revenue * 0.10;
  return revenue * 0.05; // stipend_plus_5 or default
}

const RANK_STYLES = [
  { bg: "bg-amber-500/10 border-amber-500/30", text: "text-amber-400", icon: Crown, size: 20 },
  { bg: "bg-slate-400/10 border-slate-400/30", text: "text-slate-400", icon: Medal, size: 18 },
  { bg: "bg-orange-600/10 border-orange-600/30", text: "text-orange-500", icon: Medal, size: 16 },
];

export default function Leaderboard() {
  const currentUser = useAuthStore((s) => s.user);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"today" | "career" | "commToday" | "commCareer">("career");

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const isAdmin = currentUser?.role === "sales_admin";

  useEffect(() => {
    if (!currentUser) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(
      onSnapshot(collection(db, "users"), (snap) => {
        const allUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
        let teamMembers: AppUser[];
        if (isAdmin) {
          teamMembers = allUsers.filter(
            (u) => u.role === "sales_member" && u.createdBy === currentUser.uid
          );
        } else {
          // Sales member: find members in same team (same admin)
          teamMembers = allUsers.filter(
            (u) =>
              u.role === "sales_member" &&
              u.createdBy === currentUser.createdBy
          );
        }
        setMembers(teamMembers);
      })
    );

    unsubs.push(
      onSnapshot(collection(db, "leads"), (snap) => {
        setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead)));
        setLoading(false);
      })
    );

    return () => unsubs.forEach((u) => u());
  }, [currentUser, isAdmin]);

  const stats: MemberStats[] = members.map((member) => {
    const memberLeads = leads.filter((l) => l.assignedTo === member.uid);

    // Today's sales: leads where lastUpdated is today AND saleDone
    const todayLeads = memberLeads.filter((l) => {
      if (!l.lastUpdated?.seconds) return false;
      return format(new Date(l.lastUpdated.seconds * 1000), "yyyy-MM-dd") === todayStr;
    });
    const todaySales = todayLeads
      .filter((l) => l.saleDone)
      .reduce((sum, l) => sum + getSaleItems(l).reduce((s, i) => s + (i.amount || 0), 0), 0);

    // Today's verified revenue (for commission)
    const todayVerifiedRevenue = todayLeads.reduce(
      (sum, l) =>
        sum +
        getSaleItems(l)
          .filter((i) => i.verificationStatus === "verified")
          .reduce((s, i) => s + (i.amount || 0), 0),
      0
    );

    // Career: all verified sale items
    const careerSales = memberLeads.reduce(
      (sum, l) =>
        sum +
        getSaleItems(l)
          .filter((i) => i.verificationStatus === "verified")
          .reduce((s, i) => s + (i.amount || 0), 0),
      0
    );

    return {
      member,
      todaySales,
      careerSales,
      commissionToday: calcCommission(todayVerifiedRevenue, member.earningsOption),
      commissionCareer: calcCommission(careerSales, member.earningsOption),
    };
  });

  const sorted = [...stats].sort((a, b) => {
    if (sortBy === "today") return b.todaySales - a.todaySales;
    if (sortBy === "career") return b.careerSales - a.careerSales;
    if (sortBy === "commToday") return b.commissionToday - a.commissionToday;
    return b.commissionCareer - a.commissionCareer;
  });

  const totalTodaySales = stats.reduce((s, m) => s + m.todaySales, 0);
  const totalCareerSales = stats.reduce((s, m) => s + m.careerSales, 0);
  const totalCommToday = stats.reduce((s, m) => s + m.commissionToday, 0);
  const totalCommCareer = stats.reduce((s, m) => s + m.commissionCareer, 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-card border border-border rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Trophy size={20} className="text-amber-400" />
          <h1 className="font-display text-lg md:text-2xl font-bold text-foreground">Team Leaderboard</h1>
        </div>
        <p className="text-muted-foreground text-xs md:text-sm">
          {format(new Date(), "EEEE, dd MMMM yyyy")} — Live team performance
        </p>
      </div>

      {/* Team Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Team Sales Today", value: formatCurrency(totalTodaySales), icon: Calendar, color: "text-info" },
          { label: "Team Career Sales", value: formatCurrency(totalCareerSales), icon: TrendingUp, color: "text-success" },
          { label: "Commission Today", value: formatCurrency(totalCommToday), icon: IndianRupee, color: "text-warning" },
          { label: "Commission Career", value: formatCurrency(totalCommCareer), icon: Star, color: "text-primary" },
        ].map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-3 md:p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <card.icon size={14} className={card.color} />
              <span className="text-[10px] md:text-xs text-muted-foreground">{card.label}</span>
            </div>
            <p className="font-display font-bold text-base md:text-xl text-foreground">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Sort Controls */}
      <div className="flex flex-wrap gap-1.5">
        {[
          { key: "career", label: "Career Sales" },
          { key: "today", label: "Today's Sales" },
          { key: "commCareer", label: "Career Commission" },
          { key: "commToday", label: "Today's Commission" },
        ].map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSortBy(opt.key as typeof sortBy)}
            className={`h-7 px-3 rounded-full text-xs font-medium transition-colors ${
              sortBy === opt.key
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Leaderboard Table */}
      {sorted.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Trophy size={32} className="mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-muted-foreground text-sm">No team members yet</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="p-3 text-left text-xs text-muted-foreground font-medium w-12">#</th>
                  <th className="p-3 text-left text-xs text-muted-foreground font-medium">Name</th>
                  <th
                    className={`p-3 text-right text-xs font-medium cursor-pointer hover:text-foreground transition-colors ${sortBy === "today" ? "text-primary" : "text-muted-foreground"}`}
                    onClick={() => setSortBy("today")}
                  >
                    Today's Sales {sortBy === "today" && "▲"}
                  </th>
                  <th
                    className={`p-3 text-right text-xs font-medium cursor-pointer hover:text-foreground transition-colors ${sortBy === "career" ? "text-primary" : "text-muted-foreground"}`}
                    onClick={() => setSortBy("career")}
                  >
                    Career Sales {sortBy === "career" && "▲"}
                  </th>
                  <th
                    className={`p-3 text-right text-xs font-medium cursor-pointer hover:text-foreground transition-colors ${sortBy === "commToday" ? "text-primary" : "text-muted-foreground"}`}
                    onClick={() => setSortBy("commToday")}
                  >
                    Commission Today {sortBy === "commToday" && "▲"}
                  </th>
                  <th
                    className={`p-3 text-right text-xs font-medium cursor-pointer hover:text-foreground transition-colors ${sortBy === "commCareer" ? "text-primary" : "text-muted-foreground"}`}
                    onClick={() => setSortBy("commCareer")}
                  >
                    Commission Career {sortBy === "commCareer" && "▲"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s, idx) => {
                  const rankStyle = RANK_STYLES[idx] || null;
                  const RankIcon = rankStyle?.icon;
                  const isCurrentUser = s.member.uid === currentUser?.uid;
                  return (
                    <tr
                      key={s.member.uid}
                      className={`border-b border-border/50 transition-colors ${
                        isCurrentUser ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-accent/30"
                      }`}
                    >
                      <td className="p-3">
                        {rankStyle && RankIcon ? (
                          <RankIcon size={rankStyle.size} className={rankStyle.text} />
                        ) : (
                          <span className="text-xs text-muted-foreground font-mono">{idx + 1}</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {s.member.avatar ? (
                            <img src={s.member.avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                              {s.member.name?.charAt(0)?.toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-foreground text-sm">{s.member.name}</p>
                            {isCurrentUser && (
                              <p className="text-[9px] text-primary">You</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <span className={`font-mono text-sm ${s.todaySales > 0 ? "text-info font-semibold" : "text-muted-foreground"}`}>
                          {formatCurrency(s.todaySales)}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <span className={`font-mono text-sm ${s.careerSales > 0 ? "text-success font-semibold" : "text-muted-foreground"}`}>
                          {formatCurrency(s.careerSales)}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <span className={`font-mono text-sm ${s.commissionToday > 0 ? "text-warning font-semibold" : "text-muted-foreground"}`}>
                          {formatCurrency(s.commissionToday)}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <span className={`font-mono text-sm ${s.commissionCareer > 0 ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                          {formatCurrency(s.commissionCareer)}
                          {s.member.earningsOption && (
                            <span className="ml-1 text-[9px] text-muted-foreground">
                              ({s.member.earningsOption === "incentive_10" ? "10%" : "5%"})
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-border">
            {sorted.map((s, idx) => {
              const rankStyle = RANK_STYLES[idx] || null;
              const RankIcon = rankStyle?.icon;
              const isCurrentUser = s.member.uid === currentUser?.uid;
              return (
                <div
                  key={s.member.uid}
                  className={`p-4 ${isCurrentUser ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="shrink-0 w-8 flex items-center justify-center">
                      {rankStyle && RankIcon ? (
                        <RankIcon size={rankStyle.size} className={rankStyle.text} />
                      ) : (
                        <span className="text-sm text-muted-foreground font-mono font-bold">{idx + 1}</span>
                      )}
                    </div>
                    {s.member.avatar ? (
                      <img src={s.member.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                        {s.member.name?.charAt(0)?.toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">{s.member.name}</p>
                      {isCurrentUser && <p className="text-[10px] text-primary">You</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs pl-11">
                    <div className="bg-muted/30 rounded-lg p-2">
                      <p className="text-muted-foreground mb-0.5">Today's Sales</p>
                      <p className={`font-mono font-semibold ${s.todaySales > 0 ? "text-info" : "text-muted-foreground"}`}>
                        {formatCurrency(s.todaySales)}
                      </p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2">
                      <p className="text-muted-foreground mb-0.5">Career Sales</p>
                      <p className={`font-mono font-semibold ${s.careerSales > 0 ? "text-success" : "text-muted-foreground"}`}>
                        {formatCurrency(s.careerSales)}
                      </p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2">
                      <p className="text-muted-foreground mb-0.5">Comm. Today</p>
                      <p className={`font-mono font-semibold ${s.commissionToday > 0 ? "text-warning" : "text-muted-foreground"}`}>
                        {formatCurrency(s.commissionToday)}
                      </p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2">
                      <p className="text-muted-foreground mb-0.5">Comm. Career</p>
                      <p className={`font-mono font-semibold ${s.commissionCareer > 0 ? "text-primary" : "text-muted-foreground"}`}>
                        {formatCurrency(s.commissionCareer)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <p className="text-[10px] text-muted-foreground text-center">
        Today's Sales = all sales submitted today • Career Sales = all verified sales ever • Commission based on each member's assigned earnings plan (5% or 10%)
      </p>
    </div>
  );
}

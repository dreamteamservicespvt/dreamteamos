import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency } from "@/utils/formatters";
import { format, subDays } from "date-fns";
import { useNavigate } from "react-router-dom";
import type { AppUser, Lead, SaleDetail } from "@/types";
import { Trophy, Medal, Crown, ChevronDown, ExternalLink } from "lucide-react";
import DashboardDayPicker from "@/components/dashboard/DayPicker";

// ── Types ─────────────────────────────────────────────────────────────────

type SortKey = "career" | "daySales" | "commCareer" | "commDay";

interface DayOption {
  label: string;
  dateStr: string | null;
}

function buildDayOptions(): DayOption[] {
  const today = new Date();
  return [
    { label: `Today (${format(today, "dd/MM")})`, dateStr: format(today, "yyyy-MM-dd") },
    { label: `Yesterday (${format(subDays(today, 1), "dd/MM")})`, dateStr: format(subDays(today, 1), "yyyy-MM-dd") },
    { label: `2 days ago (${format(subDays(today, 2), "dd/MM")})`, dateStr: format(subDays(today, 2), "yyyy-MM-dd") },
    { label: `3 days ago (${format(subDays(today, 3), "dd/MM")})`, dateStr: format(subDays(today, 3), "yyyy-MM-dd") },
    { label: `4 days ago (${format(subDays(today, 4), "dd/MM")})`, dateStr: format(subDays(today, 4), "yyyy-MM-dd") },
    { label: "All Days", dateStr: null },
  ];
}

function getSaleItems(lead: Lead): SaleDetail[] {
  return lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
}

function getSaleDate(item: SaleDetail, lead: Lead): string | null {
  const ts = (item.submittedAt as any)?.seconds;
  if (ts) return format(new Date(ts * 1000), "yyyy-MM-dd");
  if (lead.createdAt?.seconds) return format(new Date(lead.createdAt.seconds * 1000), "yyyy-MM-dd");
  return null;
}

function calcCommission(revenue: number, option?: "stipend_plus_5" | "incentive_10"): number {
  return option === "incentive_10" ? revenue * 0.10 : revenue * 0.05;
}

const RANK_STYLES = [
  { text: "text-amber-400", icon: Crown, size: 20 },
  { text: "text-slate-400", icon: Medal, size: 18 },
  { text: "text-orange-500", icon: Medal, size: 16 },
];

// ── Component ──────────────────────────────────────────────────────────────

export default function Leaderboard() {
  const currentUser = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [members, setMembers] = useState<AppUser[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>("career");
  const [dayOpen, setDayOpen] = useState(false);

  const dayOptions = useMemo(buildDayOptions, []);
  const [selectedDayIdx, setSelectedDayIdx] = useState(0); // default: Today
  const [calendarDate, setCalendarDate] = useState<Date | undefined>(undefined);

  const isAdmin = currentUser?.role === "sales_admin";

  // Effective date: calendar takes priority over quick dropdown
  const effectiveDateStr = calendarDate
    ? format(calendarDate, "yyyy-MM-dd")
    : dayOptions[selectedDayIdx].dateStr;

  const effectiveLabel = calendarDate
    ? format(calendarDate, "dd/MM/yyyy")
    : dayOptions[selectedDayIdx].label;

  const handleDayDropdown = (idx: number) => {
    setSelectedDayIdx(idx);
    setCalendarDate(undefined); // clear calendar selection
    setDayOpen(false);
  };

  const handleCalendar = (date: Date | undefined) => {
    setCalendarDate(date);
    // Keep dayIdx but calendar overrides it visually
  };

  useEffect(() => {
    if (!currentUser) return;
    const unsubs: (() => void)[] = [];
    unsubs.push(
      onSnapshot(collection(db, "users"), (snap) => {
        const allUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
        const team = isAdmin
          ? allUsers.filter((u) => u.role === "sales_member" && u.createdBy === currentUser.uid)
          : allUsers.filter((u) => u.role === "sales_member" && u.createdBy === currentUser.createdBy);
        setMembers(team);
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

  // ── Per-member stats ─────────────────────────────────────────────────────

  interface MemberStats {
    member: AppUser;
    daySales: number;
    careerSales: number;
    commDay: number;
    commCareer: number;
  }

  const stats: MemberStats[] = members.map((member) => {
    const memberLeads = leads.filter((l) => l.assignedTo === member.uid);
    const allItems: Array<{ item: SaleDetail; lead: Lead }> = memberLeads.flatMap((l) =>
      getSaleItems(l).map((item) => ({ item, lead: l }))
    );

    const careerSales = allItems
      .filter(({ item }) => item.verificationStatus === "verified")
      .reduce((s, { item }) => s + (item.amount || 0), 0);

    let daySales = 0;
    let dayVerified = 0;

    if (effectiveDateStr) {
      const dayItems = allItems.filter(({ item, lead }) => {
        return getSaleDate(item, lead) === effectiveDateStr;
      });
      daySales = dayItems.reduce((s, { item }) => s + (item.amount || 0), 0);
      dayVerified = dayItems
        .filter(({ item }) => item.verificationStatus === "verified")
        .reduce((s, { item }) => s + (item.amount || 0), 0);
    } else {
      // All days
      daySales = allItems.reduce((s, { item }) => s + (item.amount || 0), 0);
      dayVerified = careerSales;
    }

    return {
      member,
      daySales,
      careerSales,
      commDay: calcCommission(dayVerified, member.earningsOption),
      commCareer: calcCommission(careerSales, member.earningsOption),
    };
  });

  const sorted = [...stats].sort((a, b) => {
    if (sortBy === "daySales") return b.daySales - a.daySales;
    if (sortBy === "commDay") return b.commDay - a.commDay;
    if (sortBy === "commCareer") return b.commCareer - a.commCareer;
    return b.careerSales - a.careerSales; // default: career
  });

  const totalDaySales = stats.reduce((s, m) => s + m.daySales, 0);
  const totalCareerSales = stats.reduce((s, m) => s + m.careerSales, 0);
  const totalCommDay = stats.reduce((s, m) => s + m.commDay, 0);
  const totalCommCareer = stats.reduce((s, m) => s + m.commCareer, 0);

  const handleMemberClick = (memberId: string) => {
    if (!isAdmin) return;
    const dateParam = effectiveDateStr ? `?date=${effectiveDateStr}&tab=sales` : `?tab=sales`;
    navigate(`/sales-admin/leads/${memberId}${dateParam}`);
  };

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
    <div className="space-y-6" onClick={() => setDayOpen(false)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Trophy size={20} className="text-amber-400" />
            <h1 className="font-display text-lg md:text-2xl font-bold text-foreground">Team Leaderboard</h1>
          </div>
          <p className="text-muted-foreground text-xs md:text-sm">
            Showing: <span className="text-foreground font-medium">{effectiveLabel}</span>
          </p>
        </div>

        {/* Two controls: quick dropdown + calendar */}
        <div className="flex items-center gap-2">
          {/* Quick day dropdown */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setDayOpen((o) => !o)}
              className="flex items-center gap-2 h-9 px-3 rounded-lg bg-card border border-border text-sm text-foreground hover:bg-accent transition-colors min-w-[170px] justify-between"
            >
              <span className="truncate">{dayOptions[selectedDayIdx].label}</span>
              <ChevronDown size={14} className={`shrink-0 transition-transform ${dayOpen ? "rotate-180" : ""}`} />
            </button>
            {dayOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-xl overflow-hidden min-w-[200px]">
                {dayOptions.map((opt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleDayDropdown(idx)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      !calendarDate && selectedDayIdx === idx
                        ? "bg-primary/15 text-primary font-medium"
                        : "text-foreground hover:bg-accent"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Calendar date picker */}
          <DashboardDayPicker
            selectedDate={calendarDate}
            onSelect={handleCalendar}
          />
          {calendarDate && (
            <button
              onClick={() => setCalendarDate(undefined)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Team Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: effectiveDateStr ? "Day's Total Sales" : "All Sales", value: formatCurrency(totalDaySales), color: "text-info" },
          { label: "Career Sales (Verified)", value: formatCurrency(totalCareerSales), color: "text-success" },
          { label: effectiveDateStr ? "Day's Commission" : "All Commission", value: formatCurrency(totalCommDay), color: "text-warning" },
          { label: "Career Commission", value: formatCurrency(totalCommCareer), color: "text-primary" },
        ].map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-3 md:p-4">
            <p className="text-[10px] md:text-xs text-muted-foreground mb-1">{card.label}</p>
            <p className={`font-display font-bold text-base md:text-xl ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Sort hint */}
      <p className="text-[10px] text-muted-foreground">
        Sort by clicking column headers below ↓ &nbsp;·&nbsp; Currently sorted by:{" "}
        <span className="text-foreground font-medium">
          {sortBy === "career" ? "Career Sales" : sortBy === "daySales" ? "Day Sales" : sortBy === "commCareer" ? "Career Commission" : "Day Commission"}
        </span>
        {isAdmin && " · Click a row to view that member's sales for the selected date"}
      </p>

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
                  <th className="p-3 text-left text-xs text-muted-foreground font-medium w-10">#</th>
                  <th className="p-3 text-left text-xs text-muted-foreground font-medium">Name</th>
                  <th
                    className={`p-3 text-right text-xs font-medium cursor-pointer hover:text-foreground transition-colors select-none ${sortBy === "daySales" ? "text-primary underline" : "text-muted-foreground"}`}
                    onClick={() => setSortBy("daySales")}
                  >
                    {effectiveDateStr ? "Day's Sales" : "All Sales"}
                    {sortBy === "daySales" && " ▲"}
                  </th>
                  <th
                    className={`p-3 text-right text-xs font-medium cursor-pointer hover:text-foreground transition-colors select-none ${sortBy === "career" ? "text-primary underline" : "text-muted-foreground"}`}
                    onClick={() => setSortBy("career")}
                  >
                    Career Sales {sortBy === "career" && "▲"}
                  </th>
                  <th
                    className={`p-3 text-right text-xs font-medium cursor-pointer hover:text-foreground transition-colors select-none ${sortBy === "commDay" ? "text-primary underline" : "text-muted-foreground"}`}
                    onClick={() => setSortBy("commDay")}
                  >
                    {effectiveDateStr ? "Day Commission" : "All Commission"}
                    {sortBy === "commDay" && " ▲"}
                  </th>
                  <th
                    className={`p-3 text-right text-xs font-medium cursor-pointer hover:text-foreground transition-colors select-none ${sortBy === "commCareer" ? "text-primary underline" : "text-muted-foreground"}`}
                    onClick={() => setSortBy("commCareer")}
                  >
                    Career Commission {sortBy === "commCareer" && "▲"}
                  </th>
                  {isAdmin && <th className="p-3 w-8" />}
                </tr>
              </thead>
              <tbody>
                {sorted.map((s, idx) => {
                  const rankStyle = RANK_STYLES[idx] || null;
                  const RankIcon = rankStyle?.icon;
                  const isMe = s.member.uid === currentUser?.uid;
                  return (
                    <tr
                      key={s.member.uid}
                      className={`border-b border-border/50 transition-colors ${isMe ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-accent/30"} ${isAdmin ? "cursor-pointer" : ""}`}
                      onClick={isAdmin ? () => handleMemberClick(s.member.uid) : undefined}
                    >
                      <td className="p-3">
                        {rankStyle && RankIcon
                          ? <RankIcon size={rankStyle.size} className={rankStyle.text} />
                          : <span className="text-xs text-muted-foreground font-mono">{idx + 1}</span>
                        }
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {s.member.avatar
                            ? <img src={s.member.avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                            : <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">{s.member.name?.charAt(0)?.toUpperCase()}</div>
                          }
                          <div>
                            <p className={`font-medium text-sm ${isAdmin ? "text-primary" : "text-foreground"}`}>{s.member.name}</p>
                            {isMe && <p className="text-[9px] text-primary">You</p>}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <span className={`font-mono text-sm ${s.daySales > 0 ? "text-info font-semibold" : "text-muted-foreground"}`}>{formatCurrency(s.daySales)}</span>
                      </td>
                      <td className="p-3 text-right">
                        <span className={`font-mono text-sm ${s.careerSales > 0 ? "text-success font-semibold" : "text-muted-foreground"}`}>{formatCurrency(s.careerSales)}</span>
                      </td>
                      <td className="p-3 text-right">
                        <span className={`font-mono text-sm ${s.commDay > 0 ? "text-warning font-semibold" : "text-muted-foreground"}`}>{formatCurrency(s.commDay)}</span>
                      </td>
                      <td className="p-3 text-right">
                        <span className={`font-mono text-sm ${s.commCareer > 0 ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                          {formatCurrency(s.commCareer)}
                          {s.member.earningsOption && (
                            <span className="ml-1 text-[9px] text-muted-foreground">({s.member.earningsOption === "incentive_10" ? "10%" : "5%"})</span>
                          )}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="p-3 text-center">
                          <ExternalLink size={13} className="text-muted-foreground" />
                        </td>
                      )}
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
              const isMe = s.member.uid === currentUser?.uid;
              return (
                <div
                  key={s.member.uid}
                  className={`p-4 ${isMe ? "bg-primary/5 border-l-2 border-l-primary" : ""} ${isAdmin ? "cursor-pointer active:bg-accent/50" : ""}`}
                  onClick={isAdmin ? () => handleMemberClick(s.member.uid) : undefined}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="shrink-0 w-7 flex items-center justify-center">
                      {rankStyle && RankIcon
                        ? <RankIcon size={rankStyle.size} className={rankStyle.text} />
                        : <span className="text-sm text-muted-foreground font-mono font-bold">{idx + 1}</span>
                      }
                    </div>
                    {s.member.avatar
                      ? <img src={s.member.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                      : <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">{s.member.name?.charAt(0)?.toUpperCase()}</div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm truncate ${isAdmin ? "text-primary" : "text-foreground"}`}>{s.member.name}</p>
                      {isMe && <p className="text-[10px] text-primary">You</p>}
                    </div>
                    {isAdmin && <ExternalLink size={14} className="text-muted-foreground shrink-0" />}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs pl-10">
                    <div className="bg-muted/30 rounded-lg p-2">
                      <p className="text-muted-foreground mb-0.5">{effectiveDateStr ? "Day's Sales" : "All Sales"}</p>
                      <p className={`font-mono font-semibold ${s.daySales > 0 ? "text-info" : "text-muted-foreground"}`}>{formatCurrency(s.daySales)}</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2">
                      <p className="text-muted-foreground mb-0.5">Career Sales</p>
                      <p className={`font-mono font-semibold ${s.careerSales > 0 ? "text-success" : "text-muted-foreground"}`}>{formatCurrency(s.careerSales)}</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2">
                      <p className="text-muted-foreground mb-0.5">{effectiveDateStr ? "Day Commission" : "All Comm."}</p>
                      <p className={`font-mono font-semibold ${s.commDay > 0 ? "text-warning" : "text-muted-foreground"}`}>{formatCurrency(s.commDay)}</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2">
                      <p className="text-muted-foreground mb-0.5">Career Comm.</p>
                      <p className={`font-mono font-semibold ${s.commCareer > 0 ? "text-primary" : "text-muted-foreground"}`}>{formatCurrency(s.commCareer)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground text-center">
        Day Sales = all amounts submitted on selected date • Career = all verified sales ever • Commission: 5% or 10% based on member plan
      </p>
    </div>
  );
}

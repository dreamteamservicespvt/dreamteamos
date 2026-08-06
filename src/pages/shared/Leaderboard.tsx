import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency } from "@/utils/formatters";
import { format, subDays } from "date-fns";
import { useNavigate } from "react-router-dom";
import type { AppUser, Lead, SaleDetail } from "@/types";
import { Trophy, Medal, Crown, ChevronDown, ExternalLink, ChevronLeft, ChevronRight, CalendarRange } from "lucide-react";
import DashboardDayPicker from "@/components/dashboard/DayPicker";
import { useNow } from "@/hooks/useNow";
import { currentPayMonth, payPeriodForMonth, shiftPayMonth } from "@/utils/payrollEngine";

/** Granularity for the "Career Sales" / "Career Commission" columns — Month is the default and
 *  the only option sales members ever see; Career (true all-time totals) is admin-only, since
 *  it exposes company-wide lifetime revenue. */
type Granularity = "career" | "month";

/**
 * The cycle we are IN — 10th to 9th, labelled by the month it starts in.
 *
 * This board used to open on the CALENDAR month, which between the 1st and the 9th is a cycle that
 * has not begun: on 1 August it showed 10 Aug → 9 Sep, so every member's month sales and commission
 * read ₹0 and the rows fell back to whatever order Firestore happened to return them in. That is
 * the "my commission has vanished" report, and the "sorted alphabetically" one, from one cause.
 */
const todayMonth = () => currentPayMonth();

// ── Types ─────────────────────────────────────────────────────────────────

type SortKey = "career" | "daySales" | "commCareer" | "commDay";

interface DayOption {
  label: string;
  /** A single day. Null for the spans below. */
  dateStr: string | null;
  /**
   * A span, for the options that are not one day. "This Month" is the 10th → 9th pay cycle, which
   * is the only "month" this business has — see utils/payrollEngine.
   */
  span?: { from: string; to: string };
}

function buildDayOptions(): DayOption[] {
  const today = new Date();
  const cycle = payPeriodForMonth(currentPayMonth());
  return [
    { label: `Today (${format(today, "dd/MM")})`, dateStr: format(today, "yyyy-MM-dd") },
    { label: `Yesterday (${format(subDays(today, 1), "dd/MM")})`, dateStr: format(subDays(today, 1), "yyyy-MM-dd") },
    { label: `2 days ago (${format(subDays(today, 2), "dd/MM")})`, dateStr: format(subDays(today, 2), "yyyy-MM-dd") },
    { label: `3 days ago (${format(subDays(today, 3), "dd/MM")})`, dateStr: format(subDays(today, 3), "yyyy-MM-dd") },
    { label: `4 days ago (${format(subDays(today, 4), "dd/MM")})`, dateStr: format(subDays(today, 4), "yyyy-MM-dd") },
    // The five days above answer "how did we do today"; this answers "how are we doing this
    // cycle", which is the question everyone actually asks by the third week.
    {
      label: `This Month (${format(new Date(`${cycle.start}T00:00:00`), "dd MMM")} – ${format(new Date(`${cycle.end}T00:00:00`), "dd MMM")})`,
      dateStr: null,
      span: { from: cycle.start, to: cycle.end },
    },
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
  /**
   * Ranked by the window the board is actually showing, which is today.
   *
   * ── The bug this fixes ────────────────────────────────────────────────────────────────────────
   * The day filter has always defaulted to Today and the "Day's Sales" column has always shown
   * today's figures — but the ranking was by the month, so the two disagreed on the very first
   * screen. A member who had sold ₹29,497 today sat second to one who had sold ₹23,971, because
   * the second had a bigger month. A leaderboard that puts today's top seller in second place on
   * the day they earned first place is not doing the one job a leaderboard has.
   *
   * `daySales` follows the chosen window rather than meaning "today" literally — pick All Days and
   * it ranks by all days, pick This Month and it ranks by the cycle. So the order always agrees
   * with the numbers beside it, whatever the viewer has selected.
   */
  const [sortBy, setSortBy] = useState<SortKey>("daySales");
  const [dayOpen, setDayOpen] = useState(false);

  /**
   * The day list, rebuilt when the actual date changes.
   *
   * Built once at mount, "Today" was whatever day the tab was opened on — and this board is left
   * open on a screen in the office. Past midnight it still said "Today (06/08)" while showing
   * 6 August's sales on 7 August, which is worse than being wrong: the label insists it is right.
   * Keyed on the date string so it rebuilds exactly once a day, not once a minute.
   */
  const todayStr = format(new Date(useNow(60_000)), "yyyy-MM-dd");
  const dayOptions = useMemo(buildDayOptions, [todayStr]);
  const [selectedDayIdx, setSelectedDayIdx] = useState(0); // default: Today
  const [calendarDate, setCalendarDate] = useState<Date | undefined>(undefined);

  const isAdmin = currentUser?.role === "sales_admin";

  // Career/Month toggle — defaults to Month for everyone. Sales members can never switch to
  // Career (true all-time totals), since that exposes the company's lifetime revenue.
  const [granularityChoice, setGranularityChoice] = useState<Granularity>("month");
  const granularity: Granularity = isAdmin ? granularityChoice : "month";
  const [selectedMonth, setSelectedMonth] = useState<string>(todayMonth());
  // Optional custom period — when both dates are set they override the month cycle entirely,
  // giving admin AND members full freedom over the window they're looking at.
  const [rangeFrom, setRangeFrom] = useState<string>("");
  const [rangeTo, setRangeTo] = useState<string>("");
  const customRangeActive = granularity === "month" && !!rangeFrom && !!rangeTo && rangeFrom <= rangeTo;

  // The business "month" runs on a 10th-to-9th pay cycle, not the calendar month: selecting June
  // means 10 Jun → 9 Jul. Derived from the one pay-period function rather than string-built here,
  // so this board and the salary screens can never disagree about where a month begins.
  // (The custom range above overrides it when set.)
  const cycle = payPeriodForMonth(selectedMonth);
  const periodStart = customRangeActive ? rangeFrom : cycle.start;
  const periodEnd = customRangeActive ? rangeTo : cycle.end;

  // Effective date: calendar takes priority over quick dropdown
  const effectiveDateStr = calendarDate
    ? format(calendarDate, "yyyy-MM-dd")
    : dayOptions[selectedDayIdx].dateStr;
  /** Set only by a span option ("This Month"), and never while a single day is chosen. */
  const effectiveSpan = calendarDate ? undefined : dayOptions[selectedDayIdx].span;

  const effectiveLabel = calendarDate
    ? format(calendarDate, "dd/MM/yyyy")
    : dayOptions[selectedDayIdx].label;

  /**
   * Choosing a day re-ranks the board by that day.
   *
   * Picking "Yesterday" and being shown a list still ordered by the month's totals is the board
   * answering a question nobody asked — the whole reason to select a day is to see who did best
   * ON it. The column header is still clickable, so anyone who wants the month order back is one
   * click away; this only changes what the board opens on after a choice.
   *
   * "All Days" is the exception: its day column IS the career total, so leaving the sort where it
   * is keeps the ranking meaningful rather than duplicating the column beside it.
   */
  const handleDayDropdown = (idx: number) => {
    setSelectedDayIdx(idx);
    setCalendarDate(undefined); // clear calendar selection
    setDayOpen(false);
    const picked = dayOptions[idx];
    if (picked.dateStr || picked.span) setSortBy("daySales");
  };

  const handleCalendar = (date: Date | undefined) => {
    setCalendarDate(date);
    // Keep dayIdx but calendar overrides it visually
    if (date) setSortBy("daySales");
  };

  useEffect(() => {
    if (!currentUser) return;
    const unsubs: (() => void)[] = [];
    unsubs.push(
      onSnapshot(collection(db, "users"), (snap) => {
        const allUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
        const team = isAdmin
          ? allUsers.filter((u) => u.role === "sales_member" && u.createdBy === currentUser.uid && u.isActive !== false)
          : allUsers.filter((u) => u.role === "sales_member" && u.createdBy === currentUser.createdBy && u.isActive !== false);
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
    monthSales: number;
    commDay: number;
    commCareer: number;
    commMonth: number;
  }

  const stats: MemberStats[] = members.map((member) => {
    const memberLeads = leads.filter((l) => l.assignedTo === member.uid);
    const allItems: Array<{ item: SaleDetail; lead: Lead }> = memberLeads.flatMap((l) =>
      getSaleItems(l).map((item) => ({ item, lead: l }))
    );

    const careerSales = allItems
      .filter(({ item }) => item.verificationStatus === "verified")
      .reduce((s, { item }) => s + (item.amount || 0), 0);

    const monthItems = allItems.filter(({ item, lead }) => {
      const d = getSaleDate(item, lead);
      return d !== null && d >= periodStart && d <= periodEnd;
    });
    const monthSales = monthItems
      .filter(({ item }) => item.verificationStatus === "verified")
      .reduce((s, { item }) => s + (item.amount || 0), 0);

    let daySales = 0;
    let dayVerified = 0;

    if (effectiveDateStr || effectiveSpan) {
      const dayItems = allItems.filter(({ item, lead }) => {
        const d = getSaleDate(item, lead);
        if (d === null) return false;
        return effectiveSpan ? d >= effectiveSpan.from && d <= effectiveSpan.to : d === effectiveDateStr;
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
      monthSales,
      commDay: calcCommission(dayVerified, member.earningsOption),
      commCareer: calcCommission(careerSales, member.earningsOption),
      commMonth: calcCommission(monthSales, member.earningsOption),
    };
  });

  // The "Career Sales" / "Career Commission" columns show MONTH totals by default (and always
  // for sales members); only an admin who has switched the toggle to Career sees true all-time
  // totals. Sort keys "career" / "commCareer" follow whichever is currently on screen.
  const secondarySales = (s: MemberStats) => (granularity === "career" ? s.careerSales : s.monthSales);
  const secondaryComm = (s: MemberStats) => (granularity === "career" ? s.commCareer : s.commMonth);

  /**
   * A leaderboard is ranked by money, always — and every rank has to be decided by money too.
   *
   * The chosen column alone is not enough: when it ties (early in a cycle it is ₹0 for everyone)
   * a comparator returning 0 leaves the rows in whatever order Firestore handed them over in,
   * which is why the board read as an arbitrary, alphabetical-looking list rather than a ranking.
   * So every metric is tried in turn, and only a member who has sold *exactly* the same as another
   * on all four falls back to their name — a stable, explainable order rather than an accident.
   */
  const sortMetrics: Record<SortKey, (s: MemberStats) => number> = {
    career: secondarySales,
    daySales: (s) => s.daySales,
    commCareer: secondaryComm,
    commDay: (s) => s.commDay,
  };
  const tieBreakOrder: SortKey[] = ["career", "daySales", "commCareer", "commDay"];

  const sorted = [...stats].sort((a, b) => {
    for (const key of [sortBy, ...tieBreakOrder.filter((k) => k !== sortBy)]) {
      const diff = sortMetrics[key](b) - sortMetrics[key](a);
      if (diff !== 0) return diff;
    }
    return (a.member.name || "").localeCompare(b.member.name || "");
  });

  const totalDaySales = stats.reduce((s, m) => s + m.daySales, 0);
  const totalSecondarySales = stats.reduce((s, m) => s + secondarySales(m), 0);
  const totalCommDay = stats.reduce((s, m) => s + m.commDay, 0);
  const totalSecondaryComm = stats.reduce((s, m) => s + secondaryComm(m), 0);
  const secondaryLabel = granularity === "career"
    ? "Career"
    : customRangeActive
      ? `${format(new Date(periodStart), "dd MMM")} → ${format(new Date(periodEnd), "dd MMM")}`
      : format(new Date(`${selectedMonth}-01`), "MMM yyyy");
  /** Full human-readable window, shown beside the month navigator. */
  const periodLabel = `${format(new Date(periodStart), "dd MMM yyyy")} → ${format(new Date(periodEnd), "dd MMM yyyy")}`;

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
              // Anchor LEFT on mobile (the controls sit at the screen's left there, so a
              // right-anchored menu spilled off-screen) and RIGHT on desktop; cap the width to
              // the viewport as a hard guard against any horizontal overflow.
              <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-xl overflow-hidden min-w-[200px] max-w-[calc(100vw-2rem)]">
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

      {/* Career / Month toggle (+ month navigator) — Day controls above are untouched */}
      <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {isAdmin && (
          <div className="inline-flex items-center rounded-lg border border-border bg-card p-0.5">
            {(["month", "career"] as Granularity[]).map((g) => (
              <button key={g} onClick={() => setGranularityChoice(g)}
                className={`px-3 h-8 rounded-md text-xs font-semibold transition-colors ${
                  granularity === g ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>
                {g === "month" ? "Month" : "Career"}
              </button>
            ))}
          </div>
        )}
        {granularity === "month" && (
          <>
            <div className={`flex items-center gap-1 rounded-lg border border-border bg-card px-1 ${customRangeActive ? "opacity-40" : ""}`}>
              <button onClick={() => setSelectedMonth((m) => shiftPayMonth(m,-1))} className="p-1.5 hover:bg-accent rounded-md">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span data-test="leaderboard-cycle" className="text-sm font-semibold text-foreground px-1 min-w-[92px] text-center inline-flex items-center justify-center gap-1">
                <CalendarRange className="w-3.5 h-3.5 text-muted-foreground" /> {format(new Date(`${selectedMonth}-01`), "MMM yyyy")}
              </span>
              <button onClick={() => setSelectedMonth((m) => shiftPayMonth(m,1))} disabled={selectedMonth >= todayMonth()}
                className="p-1.5 hover:bg-accent rounded-md disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Custom period — overrides the 10th-to-9th cycle when both dates are set */}
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1">
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">Custom:</span>
              <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)}
                className="h-7 rounded-md bg-background border border-border text-foreground text-xs px-1.5 outline-none focus:border-primary" />
              <span className="text-[10px] text-muted-foreground">→</span>
              <input type="date" value={rangeTo} min={rangeFrom || undefined} onChange={(e) => setRangeTo(e.target.value)}
                className="h-7 rounded-md bg-background border border-border text-foreground text-xs px-1.5 outline-none focus:border-primary" />
              {(rangeFrom || rangeTo) && (
                <button onClick={() => { setRangeFrom(""); setRangeTo(""); }}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">Clear</button>
              )}
            </div>

            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {customRangeActive ? "Custom period: " : "Cycle (10th → 9th): "}
              <span className="text-foreground font-medium">{periodLabel}</span>
            </span>
          </>
        )}
        {!isAdmin && (
          <span className="text-[10px] text-muted-foreground">Showing month &amp; day performance — company career totals are admin-only.</span>
        )}
      </div>

      {/* Team Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: effectiveDateStr ? "Day's Total Sales" : "All Sales", value: formatCurrency(totalDaySales), color: "text-info" },
          { label: `${secondaryLabel} Sales (Verified)`, value: formatCurrency(totalSecondarySales), color: "text-success" },
          { label: effectiveDateStr ? "Day's Commission" : "All Commission", value: formatCurrency(totalCommDay), color: "text-warning" },
          { label: `${secondaryLabel} Commission`, value: formatCurrency(totalSecondaryComm), color: "text-primary" },
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
          {sortBy === "career" ? `${secondaryLabel} Sales` : sortBy === "daySales" ? "Day Sales" : sortBy === "commCareer" ? `${secondaryLabel} Commission` : "Day Commission"}
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
                    {effectiveDateStr ? "Day's Sales" : effectiveSpan ? "Month Sales" : "All Sales"}
                    {sortBy === "daySales" && " ▲"}
                  </th>
                  <th
                    className={`p-3 text-right text-xs font-medium cursor-pointer hover:text-foreground transition-colors select-none ${sortBy === "career" ? "text-primary underline" : "text-muted-foreground"}`}
                    onClick={() => setSortBy("career")}
                  >
                    {secondaryLabel} Sales {sortBy === "career" && "▲"}
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
                    {secondaryLabel} Commission {sortBy === "commCareer" && "▲"}
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
                        <span className={`font-mono text-sm ${secondarySales(s) > 0 ? "text-success font-semibold" : "text-muted-foreground"}`}>{formatCurrency(secondarySales(s))}</span>
                      </td>
                      <td className="p-3 text-right">
                        <span className={`font-mono text-sm ${s.commDay > 0 ? "text-warning font-semibold" : "text-muted-foreground"}`}>{formatCurrency(s.commDay)}</span>
                      </td>
                      <td className="p-3 text-right">
                        <span className={`font-mono text-sm ${secondaryComm(s) > 0 ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                          {formatCurrency(secondaryComm(s))}
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
                      <p className="text-muted-foreground mb-0.5">{effectiveDateStr ? "Day's Sales" : effectiveSpan ? "Month Sales" : "All Sales"}</p>
                      <p className={`font-mono font-semibold ${s.daySales > 0 ? "text-info" : "text-muted-foreground"}`}>{formatCurrency(s.daySales)}</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2">
                      <p className="text-muted-foreground mb-0.5">{secondaryLabel} Sales</p>
                      <p className={`font-mono font-semibold ${secondarySales(s) > 0 ? "text-success" : "text-muted-foreground"}`}>{formatCurrency(secondarySales(s))}</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2">
                      <p className="text-muted-foreground mb-0.5">{effectiveDateStr ? "Day Commission" : "All Comm."}</p>
                      <p className={`font-mono font-semibold ${s.commDay > 0 ? "text-warning" : "text-muted-foreground"}`}>{formatCurrency(s.commDay)}</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2">
                      <p className="text-muted-foreground mb-0.5">{secondaryLabel} Comm.</p>
                      <p className={`font-mono font-semibold ${secondaryComm(s) > 0 ? "text-primary" : "text-muted-foreground"}`}>{formatCurrency(secondaryComm(s))}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground text-center">
        Day Sales = all amounts submitted in the selected window • {secondaryLabel} = {granularity === "career" ? "all verified sales ever" : `verified sales in ${periodLabel}`} • Commission: 5% or 10% based on member plan
      </p>
    </div>
  );
}

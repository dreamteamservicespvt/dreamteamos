import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, serverTimestamp, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { createUserWithoutSignOut } from "@/services/secondaryAuth";
import { saveMemberPassword, deleteMemberPassword, fetchMemberPassword, buildCredentialsMessage } from "@/services/memberCredentials";
import { useAuthStore } from "@/store/authStore";
import { normalizePhone, formatPhoneDisplay, getWhatsAppUrl, getCallUrl } from "@/utils/phone";
import type { AppUser, DailyCheckin, WorkAssignment } from "@/types";
import { formatCurrency } from "@/utils/formatters";
import { Users, Plus, X, Loader2, Eye, EyeOff, UserCheck, UserX, Trash2, Phone, MessageCircle, Pencil, Share2, Search, LogIn, LogOut, Sparkles, BarChart3, Wand2, Film, ExternalLink, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import EditMemberModal from "@/components/EditMemberModal";
import MemberPasswordModal from "@/components/MemberPasswordModal";
import AdsHistoryModal from "@/components/tech/AdsHistoryModal";
import MemberGridCard from "@/components/team/MemberGridCard";
import ViewToggle from "@/components/common/ViewToggle";
import { useViewMode } from "@/hooks/useViewMode";
import { watchTeamProfiles } from "@/services/hr";
import type { EmployeeProfile } from "@/types/hr";
import PeriodFilterBar from "@/components/dashboard/PeriodFilterBar";
import { format } from "date-fns";
import { defaultPeriodFilter, periodLabel, withinPeriod, type PeriodFilter } from "@/utils/periodFilter";
import { workCountsOn } from "@/utils/workDates";

export default function TechAdminMyTeam() {
  const currentUser = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [members, setMembers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AppUser | null>(null);
  const [editingMember, setEditingMember] = useState<AppUser | null>(null);
  /** The member whose stored login the admin is looking up. */
  const [passwordMember, setPasswordMember] = useState<AppUser | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const isMobile = useIsMobile();
  // Grid by default: a member is a person, and a card shows who they are — name, photo, stage —
  // where a table row shows only what they cost. The table stays one click away.
  const [view, setView] = useViewMode("techTeam");
  /** HR records for the team, so the grid can show who is on probation or serving notice. */
  const [hrProfiles, setHrProfiles] = useState<Map<string, EmployeeProfile>>(new Map());
  const [todayCheckins, setTodayCheckins] = useState<Map<string, DailyCheckin>>(new Map());
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [memberRevenue, setMemberRevenue] = useState<Map<string, number>>(new Map());
  const [revenueStatusFilter, setRevenueStatusFilter] = useState<"verified" | "completed_verified" | "all">("verified");
  // The tech team's month is the 10th → 9th performance cycle their output and pay are measured
  // on, so "This Month" here means exactly what it means on the dashboard and Work Done & Reports.
  const [period, setPeriod] = useState<PeriodFilter>(() => defaultPeriodFilter("cycle"));
  const [revenueSortOrder, setRevenueSortOrder] = useState<"none" | "high_to_low" | "low_to_high">("none");

  const todayStr = format(new Date(), "yyyy-MM-dd");

  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formSalary, setFormSalary] = useState<number>(0);
  const [formDriveUrl, setFormDriveUrl] = useState("");
  const [formRole, setFormRole] = useState<"tech_member" | "tech_team_leader">("tech_member");
  const [showPw, setShowPw] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const unsubs: (() => void)[] = [];
    unsubs.push(onSnapshot(collection(db, "users"), (snap) => {
      const all = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
      setMembers(all.filter((u) => (u.role === "tech_member" || u.role === "tech_team_leader") && u.createdBy === currentUser?.uid));
      setLoading(false);
    }));
    unsubs.push(onSnapshot(
      query(collection(db, "daily_checkins"), where("date", "==", todayStr)),
      (snap) => {
        const map = new Map<string, DailyCheckin>();
        snap.docs.forEach((d) => {
          const ci = { id: d.id, ...d.data() } as DailyCheckin;
          map.set(ci.memberId, ci);
        });
        setTodayCheckins(map);
      }
    ));
    unsubs.push(onSnapshot(
      collection(db, "work_assignments"),
      (snap) => {
        setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkAssignment)));
      }
    ));
    return () => unsubs.forEach((u) => u());
  }, [currentUser?.uid, todayStr]);

  // One document read per member — the same cost as listing them — so the grid can show where
  // each person is in their employment without a subscription per card.
  const memberUidKey = members.map((m) => m.uid).sort().join(",");
  useEffect(() => {
    const uids = memberUidKey ? memberUidKey.split(",") : [];
    if (uids.length === 0) { setHrProfiles(new Map()); return; }
    return watchTeamProfiles(uids, "tech", setHrProfiles);
  }, [memberUidKey]);

  useEffect(() => {
    const memberIds = new Set(members.map((m) => m.uid));
    // Count all of a member's work, whoever handed it out. `members` is already scoped to this
    // admin's team (createdBy === me), so filtering again on `assignedBy === me` only threw away
    // everything a team leader assigned — which is most of it — and left the column reading ₹0.
    let filtered = assignments.filter((a) => memberIds.has(a.assignedTo));

    if (revenueStatusFilter === "verified") {
      filtered = filtered.filter((a) => a.status === "verified");
    } else if (revenueStatusFilter === "completed_verified") {
      filtered = filtered.filter((a) => a.status === "completed" || a.status === "verified");
    }

    // Career / This Month / Day / Range — the same control used everywhere money is shown.
    filtered = filtered.filter((a) => withinPeriod(workCountsOn(a), period));

    const revMap = new Map<string, number>();
    filtered.forEach((a) => {
      revMap.set(a.assignedTo, (revMap.get(a.assignedTo) || 0) + (a.totalPrice || 0));
    });
    setMemberRevenue(revMap);
  }, [assignments, members, currentUser?.uid, revenueStatusFilter, period]);

  const grandTotalRevenue = useMemo(
    () => Array.from(memberRevenue.values()).reduce((sum, revenue) => sum + revenue, 0),
    [memberRevenue]
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim() || !formPassword) {
      toast({ title: "Error", description: "Name, email and password are required.", variant: "destructive" });
      return;
    }
    if (formPassword.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const cred = await createUserWithoutSignOut(formEmail.trim(), formPassword);
      const uid = cred.user.uid;
      const normalizedPhone = formPhone.trim() ? normalizePhone(formPhone.trim()) : "";
      const newUser: Record<string, any> = {
        uid,
        email: formEmail.trim().toLowerCase(),
        name: formName.trim(),
        role: formRole,
        createdBy: currentUser?.uid || "",
        isActive: true,
        salary: formSalary,
        target: 0,
        phone: normalizedPhone,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (formDriveUrl.trim()) newUser.googleDriveBaseUrl = formDriveUrl.trim();
      await setDoc(doc(db, "users", uid), newUser);
      // Keep the password, so this admin can send it back when the member forgets it.
      await saveMemberPassword({
        uid, email: formEmail.trim(), password: formPassword,
        setBy: currentUser?.uid || "", setByName: currentUser?.name || "",
      });
      setMembers((prev) => [...prev, { ...newUser, createdAt: new Date(), updatedAt: new Date() } as AppUser]);
      setShowModal(false);
      resetForm();
      toast({ title: formRole === "tech_team_leader" ? "Team Leader Created" : "Member Created", description: `${formName.trim()} added to your team.` });
    } catch (err: any) {
      const msg = err.code === "auth/email-already-in-use" ? "Email already in use." : "Failed to create member.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (member: AppUser) => {
    try {
      await updateDoc(doc(db, "users", member.uid), { isActive: !member.isActive, updatedAt: serverTimestamp() });
      setMembers((prev) => prev.map((m) => m.uid === member.uid ? { ...m, isActive: !m.isActive } : m));
      toast({ title: member.isActive ? "Deactivated" : "Activated" });
    } catch {
      toast({ title: "Error", description: "Failed to update.", variant: "destructive" });
    }
  };

  /**
   * Flip a member between team member and "external creator" — an outside person who uses the
   * platform only to create their own ads. Marking them removes them from every team list, report
   * and payroll (they stay only here); they get access to just the ad-creation tool.
   */
  const toggleExternalCreator = async (member: AppUser) => {
    const next = !member.externalCreator;
    try {
      await updateDoc(doc(db, "users", member.uid), { externalCreator: next, updatedAt: serverTimestamp() });
      setMembers((prev) => prev.map((m) => m.uid === member.uid ? { ...m, externalCreator: next } : m));
      toast({
        title: next ? "Marked as external creator" : "Marked as team member",
        description: next
          ? `${member.name} now only creates ads — removed from all team lists and payroll.`
          : `${member.name} is a full team member again.`,
      });
    } catch {
      toast({ title: "Error", description: "Failed to update.", variant: "destructive" });
    }
  };

  /** The external creator whose ad history is open. */
  const [adsHistoryMember, setAdsHistoryMember] = useState<AppUser | null>(null);

  const handleDelete = async (member: AppUser) => {
    setDeletingId(member.uid);
    try {
      await deleteDoc(doc(db, "users", member.uid));
      // A departed member's password has nobody left to send it to.
      await deleteMemberPassword(member.uid);
      setMembers((prev) => prev.filter((m) => m.uid !== member.uid));
      toast({ title: "Deleted", description: `${member.name} has been removed.` });
    } catch {
      toast({ title: "Error", description: "Failed to delete member.", variant: "destructive" });
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  };

  const resetForm = () => {
    setFormName(""); setFormEmail(""); setFormPhone(""); setFormPassword("");
    setFormSalary(0); setFormDriveUrl(""); setFormRole("tech_member"); setShowPw(false);
  };

  /**
   * Send the member their login on WhatsApp — with the real password when one was stored. The
   * message used to claim the password was the same as the email, which was true for nobody whose
   * password had been set to anything else.
   */
  const handleShareCredentials = async (member: AppUser) => {
    if (!member.phone) {
      toast({ title: "Error", description: "Member does not have a phone number.", variant: "destructive" });
      return;
    }
    const password = await fetchMemberPassword(member.uid);
    const message = buildCredentialsMessage({
      email: member.email, password, loginUrl: window.location.origin,
    });
    window.open(getWhatsAppUrl(member.phone, message), "_blank", "noopener,noreferrer");
  };

  /**
   * Clicking a member opens their full record. An external creator has no employment record —
   * they are not a team member — so for them the click still opens their ad history.
   */
  const openMember = (m: AppUser) =>
    m.externalCreator ? setAdsHistoryMember(m) : navigate(`/tech-admin/team/${m.uid}/profile`);

  const filteredMembers = useMemo(() => {
    const base = members.filter((m) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return m.name?.toLowerCase().includes(q) || m.phone?.includes(q) || formatPhoneDisplay(m.phone || '').includes(q);
    });

    if (revenueSortOrder === "none") return base;

    return [...base].sort((a, b) => {
      const revA = memberRevenue.get(a.uid) || 0;
      const revB = memberRevenue.get(b.uid) || 0;
      if (revA === revB) return (a.name || "").localeCompare(b.name || "");
      return revenueSortOrder === "high_to_low" ? revB - revA : revA - revB;
    });
  }, [members, searchQuery, memberRevenue, revenueSortOrder]);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold text-foreground">My Team</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-1">Manage your tech team members</p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle mode={view} onChange={setView} />
          <button onClick={() => { resetForm(); setShowModal(true); }}
            className="h-9 px-3 md:px-4 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-xs md:text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors">
            <Plus size={14} /> <span className="hidden sm:inline">Add Member</span><span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input type="text" placeholder="Search by name or phone..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none" />
      </div>

      {/* Revenue Filters + Grand Total */}
      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-accent/20 p-3 md:p-4 shadow-sm space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
              <Sparkles size={12} />
              Team revenue lens
            </div>
            <p className="text-xs md:text-sm font-medium text-foreground">Track overall and member-wise output inside a custom date window.</p>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:justify-end">
          <select
            value={revenueStatusFilter}
            onChange={(e) => setRevenueStatusFilter(e.target.value as "verified" | "completed_verified" | "all")}
            className="h-10 rounded-xl border border-border/70 bg-background/80 px-3 text-xs md:text-sm text-foreground shadow-sm outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="verified">Verified Only</option>
            <option value="completed_verified">Completed + Verified</option>
            <option value="all">All Status</option>
          </select>
          <select
            value={revenueSortOrder}
            onChange={(e) => setRevenueSortOrder(e.target.value as "none" | "high_to_low" | "low_to_high")}
            className="h-10 rounded-xl border border-border/70 bg-background/80 px-3 text-xs md:text-sm text-foreground shadow-sm outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="none">Revenue Sort: Default</option>
            <option value="high_to_low">Revenue: High to Low</option>
            <option value="low_to_high">Revenue: Low to High</option>
          </select>
          </div>
        </div>

        <div className="mb-3">
          <PeriodFilterBar value={period} onChange={setPeriod} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="rounded-lg border border-border bg-background px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Grand Total Revenue</p>
            <p className="font-display font-bold text-primary text-base md:text-lg">{formatCurrency(grandTotalRevenue)}</p>
          </div>
          <div className="rounded-lg border border-border bg-background px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Members with Revenue</p>
            <p className="font-display font-bold text-foreground text-base md:text-lg">{Array.from(memberRevenue.values()).filter((v) => v > 0).length}</p>
          </div>
          <div className="rounded-lg border border-border bg-background px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Current Scope</p>
            <p className="font-medium text-foreground text-xs md:text-sm">{periodLabel(period)}</p>
          </div>
        </div>
      </div>

      {view === "grid" ? (
        loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-52 animate-pulse rounded-xl border border-border bg-card" />
            ))}
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center">
            <Users size={32} className="mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {searchQuery ? "No members match your search." : 'No members yet. Click "Add Member" to get started.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-test="member-grid">
            {filteredMembers.map((m) => {
              const ci = todayCheckins.get(m.uid);
              const checkin = !ci ? "Not in"
                : ci.status === "approved" ? "Approved"
                  : ci.status === "rejected" ? "Rejected"
                    : ci.status === "pending_approval" ? "Pending"
                      : ci.checkedOutAt ? "Checked out" : "Checked in";
              return (
                <MemberGridCard
                  key={m.uid}
                  member={m}
                  profile={hrProfiles.get(m.uid)}
                  onOpen={() => openMember(m)}
                  badges={m.externalCreator ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      <Wand2 size={9} /> External
                    </span>
                  ) : null}
                  stats={[
                    { label: "Salary", value: `₹${m.salary?.toLocaleString() || 0}` },
                    { label: "Revenue", value: formatCurrency(memberRevenue.get(m.uid) || 0), tone: "primary" },
                    { label: "Today", value: checkin, tone: "muted" },
                    { label: "Role", value: m.role === "tech_team_leader" ? "Team Leader" : "Tech Member", tone: "muted" },
                  ]}
                  actions={
                    <>
                      {m.externalCreator && (
                        <button onClick={() => setAdsHistoryMember(m)} title="Ads history"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-amber-500/10 hover:text-amber-600">
                          <Film size={13} />
                        </button>
                      )}
                      {!m.externalCreator && (
                        <button onClick={() => navigate(`/tech-admin/team/${m.uid}/analytics`)} title="Analytics"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-primary/10 hover:text-primary">
                          <BarChart3 size={13} />
                        </button>
                      )}
                      <button onClick={() => handleShareCredentials(m)} title="Share credentials"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-success/10 hover:text-success">
                        <Share2 size={13} />
                      </button>
                      <button onClick={() => setPasswordMember(m)} title="Login details"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-primary/10 hover:text-primary">
                        <KeyRound size={13} />
                      </button>
                      <button onClick={() => setEditingMember(m)} title="Edit"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-primary/10 hover:text-primary">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => toggleActive(m)} title={m.isActive ? "Deactivate" : "Activate"}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg border border-border ${m.isActive ? "text-destructive hover:bg-destructive/10" : "text-success hover:bg-success/10"}`}>
                        {m.isActive ? <UserX size={13} /> : <UserCheck size={13} />}
                      </button>
                      <button onClick={() => setConfirmDelete(m)} title="Delete"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 size={13} />
                      </button>
                    </>
                  }
                />
              );
            })}
          </div>
        )
      ) : isMobile ? (
        <MobileTechCards members={filteredMembers} loading={loading} onToggle={toggleActive} onDelete={(m) => setConfirmDelete(m)} onEdit={(m) => setEditingMember(m)} onClickMember={openMember} onShare={handleShareCredentials} onPassword={setPasswordMember} onToggleExternal={toggleExternalCreator} onAdsHistory={(m) => setAdsHistoryMember(m)} todayCheckins={todayCheckins} memberRevenue={memberRevenue} />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-elevated/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Member</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Phone</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Salary</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Revenue (Filtered)</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Check-In</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {Array.from({ length: 7 }).map((__, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-20" /></td>)}
                  </tr>
                ))
              ) : filteredMembers.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  <Users size={32} className="mx-auto mb-2 opacity-30" />
                  <p>{searchQuery ? 'No members match your search.' : 'No members yet. Click "Add Member" to get started.'}</p>
                </td></tr>
              ) : (
                filteredMembers.map((m, i) => (
                  <tr key={m.uid} onClick={() => openMember(m)} className={`border-b border-border/50 hover:bg-accent/30 transition-colors cursor-pointer ${i % 2 === 1 ? "bg-elevated/20" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-role-tech-member/15 flex items-center justify-center font-display font-bold text-role-tech-member text-xs">
                          {m.name?.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-foreground">{m.name}</p>
                            {m.externalCreator && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400" title="External creator — ad access only, not a team member">
                                <Wand2 size={9} /> External
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {m.phone ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-muted-foreground">{formatPhoneDisplay(m.phone)}</span>
                          <a href={getCallUrl(m.phone)} className="w-6 h-6 rounded flex items-center justify-center text-success hover:bg-success/10 transition-colors" title="Call"><Phone size={12} /></a>
                          <a href={getWhatsAppUrl(m.phone)} target="_blank" rel="noopener noreferrer" className="w-6 h-6 rounded flex items-center justify-center text-success hover:bg-success/10 transition-colors" title="WhatsApp"><MessageCircle size={12} /></a>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-foreground">₹{m.salary?.toLocaleString() || 0}</td>
                    <td className="px-4 py-3 text-right font-mono text-primary">{formatCurrency(memberRevenue.get(m.uid) || 0)}</td>
                    <td className="px-4 py-3 text-center">
                      {(() => {
                        const ci = todayCheckins.get(m.uid);
                        if (!ci) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Not In</span>;
                        if (ci.status === "approved") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success">Approved</span>;
                        if (ci.status === "rejected") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">Rejected</span>;
                        if (ci.status === "pending_approval") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/15 text-warning">Pending</span>;
                        if (ci.checkedOutAt) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-info/15 text-info flex items-center gap-1 justify-center"><LogOut size={10} /> Out</span>;
                        return <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success flex items-center gap-1 justify-center"><LogIn size={10} /> In</span>;
                      })()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${m.isActive ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                        {m.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                       <div className="flex items-center gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
                        {m.externalCreator && (
                          <button onClick={() => setAdsHistoryMember(m)} title="Ads history"
                            className="w-8 h-8 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10 transition-colors">
                            <Film size={15} />
                          </button>
                        )}
                        {m.role === "tech_member" && (
                          <button onClick={() => toggleExternalCreator(m)}
                            title={m.externalCreator ? "Make a team member again" : "Mark as external creator (ad access only)"}
                            className={`w-8 h-8 rounded-md inline-flex items-center justify-center transition-colors ${m.externalCreator ? "text-amber-600 hover:bg-amber-500/10" : "text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10"}`}>
                            <Wand2 size={15} />
                          </button>
                        )}
                        {!m.externalCreator && (
                          <button onClick={() => navigate(`/tech-admin/team/${m.uid}/analytics`)} title="Analytics"
                            className="w-8 h-8 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                            <BarChart3 size={15} />
                          </button>
                        )}
                        <button onClick={() => handleShareCredentials(m)} title="Share Credentials"
                          className="w-8 h-8 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-success hover:bg-success/10 transition-colors">
                          <Share2 size={15} />
                        </button>
                        <button onClick={() => setPasswordMember(m)} title="Login details" data-test="member-password-btn"
                          className="w-8 h-8 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                          <KeyRound size={15} />
                        </button>
                        <button onClick={() => setEditingMember(m)} title="Edit"
                          className="w-8 h-8 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => toggleActive(m)}
                          className={`w-8 h-8 rounded-md inline-flex items-center justify-center transition-colors ${m.isActive ? "text-destructive hover:bg-destructive/10" : "text-success hover:bg-success/10"}`}
                          title={m.isActive ? "Deactivate" : "Activate"}>
                          {m.isActive ? <UserX size={15} /> : <UserCheck size={15} />}
                        </button>
                        <button onClick={() => setConfirmDelete(m)} title="Delete"
                          className="w-8 h-8 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-bold text-foreground mb-2">Delete Member?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to delete <strong className="text-foreground">{confirmDelete.name}</strong>? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 h-9 rounded-lg bg-accent text-foreground text-sm font-medium border border-border">Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} disabled={deletingId === confirmDelete.uid}
                className="flex-1 h-9 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {deletingId === confirmDelete.uid ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display font-bold text-lg text-foreground">Add Team Member</h3>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Role *</label>
                <select value={formRole} onChange={(e) => setFormRole(e.target.value as "tech_member" | "tech_team_leader")}
                  className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary">
                  <option value="tech_member">Tech Member</option>
                  <option value="tech_team_leader">Tech Team Leader</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Full Name *</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} required
                  className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Email *</label>
                <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} required
                  className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Password *</label>
                <div className="relative">
                  <input type={showPw ? "text" : "password"} value={formPassword} onChange={(e) => setFormPassword(e.target.value)} required minLength={6}
                    className="w-full h-10 px-4 pr-10 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label>
                <input type="tel" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="9876543210"
                  className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />
                <p className="text-[10px] text-muted-foreground mt-0.5">+91 will be added automatically</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Google Drive Base URL <span className="text-muted-foreground/50">(optional)</span></label>
                <input type="url" value={formDriveUrl} onChange={(e) => setFormDriveUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/..."
                  className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary placeholder:text-muted-foreground/40" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Salary (₹) <span className="text-muted-foreground/50">(optional)</span></label>
                <input type="number" min={0} value={formSalary || ""} onChange={(e) => setFormSalary(Number(e.target.value) || 0)}
                  className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono" />
              </div>
              <button type="submit" disabled={creating}
                className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 mt-2">
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {creating ? "Creating..." : formRole === "tech_team_leader" ? "Create Team Leader" : "Create Member"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingMember && (
        <EditMemberModal
          member={editingMember}
          variant="tech"
          onClose={() => setEditingMember(null)}
          onUpdated={(updated) => setMembers((prev) => prev.map((m) => m.uid === updated.uid ? updated : m))}
        />
      )}

      {adsHistoryMember && (
        <AdsHistoryModal member={adsHistoryMember} onClose={() => setAdsHistoryMember(null)} />
      )}

      {/* The member forgot their password: look it up, copy it, or send it straight to them. */}
      {passwordMember && (
        <MemberPasswordModal member={passwordMember} onClose={() => setPasswordMember(null)} />
      )}
    </div>
  );
}

/* ─── Mobile Cards ─── */
function MobileTechCards({ members, loading, onToggle, onDelete, onEdit, onClickMember, onShare, onPassword, onToggleExternal, onAdsHistory, todayCheckins, memberRevenue }: {
  members: AppUser[]; loading: boolean; onToggle: (m: AppUser) => void; onDelete: (m: AppUser) => void; onEdit: (m: AppUser) => void; onClickMember: (m: AppUser) => void; onShare: (m: AppUser) => void; onPassword: (m: AppUser) => void; onToggleExternal: (m: AppUser) => void; onAdsHistory: (m: AppUser) => void; todayCheckins: Map<string, DailyCheckin>; memberRevenue: Map<string, number>;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse space-y-2">
            <div className="h-4 bg-muted rounded w-32" />
            <div className="h-3 bg-muted rounded w-24" />
          </div>
        ))}
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <Users size={32} className="mx-auto text-muted-foreground/30 mb-2" />
        <p className="text-muted-foreground text-sm">No members yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {members.map((m) => (
        <div key={m.uid} onClick={() => onClickMember(m)} className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:bg-accent/30 transition-colors">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-role-tech-member/15 flex items-center justify-center font-display font-bold text-role-tech-member text-sm shrink-0">
                {m.name?.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="font-medium text-foreground text-sm">{m.name}</p>
                  {m.externalCreator && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                      <Wand2 size={8} /> External
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{m.email}</p>
              </div>
            </div>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${m.isActive ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
              {m.isActive ? "Active" : "Inactive"}
            </span>
            {(() => {
              const ci = todayCheckins.get(m.uid);
              if (!ci) return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Not In</span>;
              if (ci.status === "approved") return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-success/15 text-success">Approved</span>;
              if (ci.status === "rejected") return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">Rejected</span>;
              if (ci.status === "pending_approval") return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-warning/15 text-warning">Pending</span>;
              if (ci.checkedOutAt) return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-info/15 text-info">Out</span>;
              return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-success/15 text-success">Checked In</span>;
            })()}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs mb-3">
            <div><span className="text-muted-foreground">Salary</span><span className="ml-2 font-mono text-foreground">₹{m.salary?.toLocaleString() || 0}</span></div>
            <div><span className="text-muted-foreground">Revenue</span><span className="ml-2 font-mono text-primary">{formatCurrency(memberRevenue.get(m.uid) || 0)}</span></div>
            {m.phone && (
              <div className="col-span-2"><span className="text-muted-foreground">Phone</span><span className="ml-2 font-mono text-foreground">{formatPhoneDisplay(m.phone)}</span></div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-border/50">
            {m.phone && (
              <>
                <a href={getCallUrl(m.phone)} className="flex-1 h-8 rounded-lg bg-success/10 text-success text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-success/20 transition-colors">
                  <Phone size={12} /> Call
                </a>
                <a href={getWhatsAppUrl(m.phone)} target="_blank" rel="noopener noreferrer"
                  className="flex-1 h-8 rounded-lg bg-success/10 text-success text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-success/20 transition-colors">
                  <MessageCircle size={12} /> WhatsApp
                </a>
              </>
            )}
            {m.externalCreator && (
              <button onClick={(e) => { e.stopPropagation(); onAdsHistory(m); }} title="Ads history"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10 transition-colors border border-border">
                <Film size={14} />
              </button>
            )}
            {m.role === "tech_member" && (
              <button onClick={(e) => { e.stopPropagation(); onToggleExternal(m); }}
                title={m.externalCreator ? "Make a team member again" : "Mark as external creator"}
                className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors border border-border ${m.externalCreator ? "text-amber-600 hover:bg-amber-500/10" : "text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10"}`}>
                <Wand2 size={14} />
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); onShare(m); }} title="Share Credentials"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-success hover:bg-success/10 transition-colors border border-border">
              <Share2 size={14} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onPassword(m); }} title="Login details"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors border border-border">
              <KeyRound size={14} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onEdit(m); }} title="Edit"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors border border-border">
              <Pencil size={14} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onToggle(m); }} title={m.isActive ? "Deactivate" : "Activate"}
              className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors border border-border ${m.isActive ? "text-destructive hover:bg-destructive/10" : "text-success hover:bg-success/10"}`}>
              {m.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(m); }} title="Delete"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors border border-border">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

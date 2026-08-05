import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import { syncPublicBadge } from "@/services/publicBadge";
import { createUserWithoutSignOut } from "@/services/secondaryAuth";
import { saveMemberPassword, deleteMemberPassword, fetchMemberPassword, buildCredentialsMessage } from "@/services/memberCredentials";
import { useAuthStore } from "@/store/authStore";
import { normalizePhone, formatPhoneDisplay, getWhatsAppUrl, getCallUrl } from "@/utils/phone";
import type { AppUser } from "@/types";
import { Users, Plus, X, Loader2, Eye, EyeOff, UserCheck, UserX, Trash2, Phone, MessageCircle, Pencil, Share2, KeyRound, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import EditMemberModal from "@/components/EditMemberModal";
import MemberPasswordModal from "@/components/MemberPasswordModal";
import MemberAvatar from "@/components/MemberAvatar";
import MemberGridCard from "@/components/team/MemberGridCard";
import AddMemberButton from "@/components/onboarding/AddMemberButton";
import PendingInvites from "@/components/onboarding/PendingInvites";
import OnboardInviteModal from "@/components/onboarding/OnboardInviteModal";
import ViewToggle from "@/components/common/ViewToggle";
import { useViewMode } from "@/hooks/useViewMode";
import { watchTeamProfiles } from "@/services/hr";
import type { EmployeeProfile } from "@/types/hr";
import { formatCurrency } from "@/utils/formatters";
import { daysInPayCycle, dailyTargetOf, monthlyTargetFor, monthlyTargetOf } from "@/utils/salesTargets";

export default function MyTeam() {
  const currentUser = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [members, setMembers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  /** The hiring flow: offer letter → joining letter → login, all on one link. */
  const [showOnboard, setShowOnboard] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AppUser | null>(null);
  const [editingMember, setEditingMember] = useState<AppUser | null>(null);
  /** The member whose stored login the admin is looking up. */
  const [passwordMember, setPasswordMember] = useState<AppUser | null>(null);
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState("");
  // Grid by default: a member is a person, and a card shows who they are — name, photo, stage —
  // where a table row shows only what they cost. The table stays one click away.
  const [view, setView] = useViewMode("salesTeam");
  /** HR records for the team, so the grid can show who is on probation or serving notice. */
  const [hrProfiles, setHrProfiles] = useState<Map<string, EmployeeProfile>>(new Map());

  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formSalary, setFormSalary] = useState<number>(0);
  // One target, not three. The monthly figure is derived from this — see utils/salesTargets.
  const [formDailyTarget, setFormDailyTarget] = useState<number>(10000);
  const [showPw, setShowPw] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const all = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
      setMembers(all.filter((u) => u.role === "sales_member" && u.createdBy === currentUser?.uid));
      setLoading(false);
    });
    return unsub;
  }, [currentUser?.uid]);

  // One document read per member — the same cost as listing them — so the grid can show where
  // each person is in their employment without a subscription per card.
  const memberUidKey = members.map((m) => m.uid).sort().join(",");
  useEffect(() => {
    const uids = memberUidKey ? memberUidKey.split(",") : [];
    if (uids.length === 0) { setHrProfiles(new Map()); return; }
    return watchTeamProfiles(uids, "sales", setHrProfiles);
  }, [memberUidKey]);

  const openMember = (uid: string) => navigate(`/sales-admin/team/${uid}/profile`);

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      m.name?.toLowerCase().includes(q)
      || m.email?.toLowerCase().includes(q)
      || (m.phone || "").includes(q)
      || formatPhoneDisplay(m.phone || "").includes(q));
  }, [members, searchQuery]);

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
      const newUser: AppUser = {
        uid,
        email: formEmail.trim().toLowerCase(),
        name: formName.trim(),
        role: "sales_member",
        createdBy: currentUser?.uid || "",
        isActive: true,
        salary: formSalary,
        dailyTarget: formDailyTarget,
        phone: normalizedPhone,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, "users", uid), newUser);
      // Keep the password, so this admin can send it back when the member forgets it.
      await saveMemberPassword({
        uid, email: formEmail.trim(), password: formPassword,
        setBy: currentUser?.uid || "", setByName: currentUser?.name || "",
      });
      setMembers((prev) => [...prev, { ...newUser, createdAt: new Date(), updatedAt: new Date() }]);
      setShowModal(false);
      resetForm();
      toast({ title: "Member Created", description: `${formName.trim()} added to your team.` });
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
      // A card scanned after this must say so, which is the entire reason the QR exists.
      await syncPublicBadge(member.uid);
      setMembers((prev) => prev.map((m) => m.uid === member.uid ? { ...m, isActive: !m.isActive } : m));
      toast({ title: member.isActive ? "Deactivated" : "Activated", description: `${member.name} has been ${member.isActive ? "deactivated" : "activated"}.` });
    } catch {
      toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
    }
  };

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
    setFormSalary(0); setFormDailyTarget(10000); setShowPw(false);
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

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold text-foreground">My Team</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-1">Manage your sales team members</p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle mode={view} onChange={setView} />
          <AddMemberButton
            onOnboard={() => setShowOnboard(true)}
            onQuickAdd={() => { resetForm(); setShowModal(true); }}
          />
        </div>
      </div>

      {/* People who have been offered a job and have not finished accepting it. Deliberately above
          the grid and outside it: they are not on the team until they sign. */}
      {currentUser?.uid && <PendingInvites adminUid={currentUser.uid} />}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input type="text" placeholder="Search by name, email or phone..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none" />
      </div>

      {/* Grid of member cards / Desktop Table / Mobile Cards */}
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
            {filteredMembers.map((m) => (
              <MemberGridCard
                key={m.uid}
                member={m}
                profile={hrProfiles.get(m.uid)}
                onOpen={() => openMember(m.uid)}
                stats={[
                  { label: "Salary", value: formatCurrency(m.salary || 0) },
                  // Derived, never stored — the daily figure is the only one anybody sets.
                  { label: "Monthly target", value: formatCurrency(monthlyTargetOf(m)), tone: "primary" },
                  { label: "Daily target", value: formatCurrency(dailyTargetOf(m)), tone: "muted" },
                  {
                    label: "Earnings plan",
                    value: m.earningsOption === "stipend_plus_5" ? "Stipend + 5%"
                      : m.earningsOption === "incentive_10" ? "10% incentive" : "Not set",
                    tone: "muted",
                  },
                ]}
                actions={
                  <>
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
            ))}
          </div>
        )
      ) : isMobile ? (
        <MobileTeamCards members={filteredMembers} loading={loading} onToggle={toggleActive} onDelete={(m) => setConfirmDelete(m)} onEdit={(m) => setEditingMember(m)} deletingId={deletingId} onClickMember={openMember} onShare={handleShareCredentials} onPassword={setPasswordMember} />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-elevated/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Member</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Phone</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Salary</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Daily target</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-20" /></td>
                    ))}
                  </tr>
                ))
              ) : filteredMembers.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  <Users size={32} className="mx-auto mb-2 opacity-30" />
                  <p>{searchQuery ? "No members match your search." : 'No members yet. Click "Add Member" to get started.'}</p>
                </td></tr>
              ) : (
                filteredMembers.map((m, i) => (
                  <tr key={m.uid} onClick={() => openMember(m.uid)} className={`border-b border-border/50 hover:bg-accent/30 transition-colors cursor-pointer ${i % 2 === 1 ? "bg-elevated/20" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <MemberAvatar name={m.name} avatar={m.avatar} size={32} />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate" title={m.name}>{m.name}</p>
                          <p className="text-xs text-muted-foreground truncate" title={m.email}>{m.email}</p>
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
                    <td className="px-4 py-3 text-right font-mono text-primary">{formatCurrency(dailyTargetOf(m))}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${m.isActive ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                        {m.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-center">
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

      {/* Delete Confirmation Modal */}
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

      {/* Hiring: the letters are written here, the account is created when they sign the second one. */}
      {showOnboard && currentUser && (
        <OnboardInviteModal
          existingEmployeeIds={members.map(m => m.employeeId)}
          department="sales"
          signatory={currentUser}
          roleOptions={[{ value: "sales_member", label: "Sales Member" }]}
          settingsPath="/sales-admin/settings"
          onClose={() => setShowOnboard(false)}
        />
      )}

      {/* Quick add — no paperwork. For anyone already signed on paper. */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display font-bold text-lg text-foreground">Add Sales Executive</h3>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Salary (₹)</label>
                  <input type="number" min={0} value={formSalary || ""} onChange={(e) => setFormSalary(Number(e.target.value) || 0)}
                    className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Daily Target (₹)</label>
                  <input type="number" min={0} value={formDailyTarget || ""} onChange={(e) => setFormDailyTarget(Number(e.target.value) || 0)}
                    data-test="daily-target-input"
                    className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono" />
                </div>
              </div>
              {/* The monthly figure, shown and not asked for. It is the daily target across the
                  pay cycle, so typing it separately could only ever contradict this one. */}
              <p className="text-[10px] text-muted-foreground -mt-1" data-test="derived-monthly-target">
                Monthly target works out to{" "}
                <span className="font-mono font-semibold text-foreground">
                  {formatCurrency(monthlyTargetFor(formDailyTarget))}
                </span>{" "}
                — the daily target across this {daysInPayCycle()}-day pay cycle.
              </p>
              <button type="submit" disabled={creating}
                className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 mt-2">
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {creating ? "Creating..." : "Create Member"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingMember && (
        <EditMemberModal
          member={editingMember}
          variant="sales"
          onClose={() => setEditingMember(null)}
          onUpdated={(updated) => setMembers((prev) => prev.map((m) => m.uid === updated.uid ? updated : m))}
        />
      )}

      {/* The member forgot their password: look it up, copy it, or send it straight to them. */}
      {passwordMember && (
        <MemberPasswordModal member={passwordMember} onClose={() => setPasswordMember(null)} />
      )}
    </div>
  );
}

/* ─── Mobile Team Cards ─── */
function MobileTeamCards({ members, loading, onToggle, onDelete, onEdit, deletingId, onClickMember, onShare, onPassword }: {
  members: AppUser[]; loading: boolean; onToggle: (m: AppUser) => void;
  onDelete: (m: AppUser) => void; onEdit: (m: AppUser) => void; deletingId: string | null; onClickMember: (uid: string) => void;
  onShare: (m: AppUser) => void;
  onPassword: (m: AppUser) => void;
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
        <div key={m.uid} onClick={() => onClickMember(m.uid)} className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:bg-accent/30 transition-colors">
          <div className="flex items-start justify-between gap-2 mb-3">
            {/* min-w-0 down the chain, or a long name pushes the row wider than the card and the
                status chip beside it falls off the right edge. */}
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <MemberAvatar name={m.name} avatar={m.avatar} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground text-sm" title={m.name}>{m.name}</p>
                <p className="truncate text-xs text-muted-foreground" title={m.email}>{m.email}</p>
              </div>
            </div>
            <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${m.isActive ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
              {m.isActive ? "Active" : "Inactive"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs mb-3">
            <div><span className="text-muted-foreground">Salary</span><span className="ml-2 font-mono text-foreground">₹{m.salary?.toLocaleString() || 0}</span></div>
            <div><span className="text-muted-foreground">Daily target</span><span className="ml-2 font-mono text-primary">{formatCurrency(dailyTargetOf(m))}</span></div>
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

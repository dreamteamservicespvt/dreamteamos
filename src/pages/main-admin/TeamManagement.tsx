import { useState, useEffect, useMemo } from "react";
import {
  collection, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, setDoc,
} from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth, db } from "@/services/firebase";
import { createUserWithoutSignOut } from "@/services/secondaryAuth";
import { useAuthStore } from "@/store/authStore";
import { getRoleLabel, getRoleColor } from "@/utils/roleHelpers";
import { formatDate } from "@/utils/formatters";
import { normalizePhone, formatPhoneDisplay, getWhatsAppUrl, getCallUrl } from "@/utils/phone";
import type { AppUser, UserRole } from "@/types";
import {
  Users, Search, Shield, ShieldOff, RotateCcw,
  Loader2, Check, X, UserPlus, Eye, EyeOff, Trash2, Phone, MessageCircle, Share2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

const ADMIN_ROLES: { value: UserRole; label: string }[] = [
  { value: "tech_admin", label: "Tech Admin" },
  { value: "sales_admin", label: "Sales Admin" },
  { value: "accounts_admin", label: "Accounts Admin" },
];

const ALL_ROLES: { value: UserRole; label: string }[] = [
  { value: "tech_admin", label: "Tech Admin" },
  { value: "sales_admin", label: "Sales Admin" },
  { value: "accounts_admin", label: "Accounts Admin" },
  { value: "tech_member", label: "Tech Member" },
  { value: "sales_member", label: "Sales Member" },
];

export default function TeamManagement() {
  const [members, setMembers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AppUser | null>(null);
  const currentUser = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      setMembers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser)));
      setLoading(false);
    });
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    return members.filter((m) => {
      const matchSearch =
        m.name?.toLowerCase().includes(search.toLowerCase()) ||
        m.email?.toLowerCase().includes(search.toLowerCase());
      const matchRole = roleFilter === "all" || m.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [members, search, roleFilter]);

  const toggleActive = async (member: AppUser) => {
    try {
      await updateDoc(doc(db, "users", member.uid), {
        isActive: !member.isActive,
        updatedAt: serverTimestamp(),
      });
      setMembers((prev) =>
        prev.map((m) => (m.uid === member.uid ? { ...m, isActive: !m.isActive } : m))
      );
      toast({
        title: member.isActive ? "Deactivated" : "Activated",
        description: `${member.name} has been ${member.isActive ? "deactivated" : "activated"}.`,
      });
    } catch {
      toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
    }
  };

  const handleDelete = async (member: AppUser) => {
    setDeletingId(member.uid);
    try {
      await deleteDoc(doc(db, "users", member.uid));
      setMembers((prev) => prev.filter((m) => m.uid !== member.uid));
      toast({ title: "Deleted", description: `${member.name} has been removed.` });
    } catch {
      toast({ title: "Error", description: "Failed to delete member.", variant: "destructive" });
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  };

  const handleResetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      toast({ title: "Reset Email Sent", description: `Password reset link sent to ${email}.` });
    } catch {
      toast({ title: "Error", description: "Failed to send reset email.", variant: "destructive" });
    }
  };

  const getCreatorName = (createdBy: string) => {
    if (createdBy === "system") return "System";
    const creator = members.find((m) => m.uid === createdBy);
    return creator?.name || "Admin";
  };

  const handleShareCredentials = (member: AppUser) => {
    if (!member.phone) {
      toast({ title: "Error", description: "Member does not have a phone number.", variant: "destructive" });
      return;
    }
    const loginLink = window.location.origin;
    const message = `🌐 *Website Login*\n\n📧 *Your Email:* ${member.email}\npassword and email both are same\n🔗 *Login here:* ${loginLink}\n\nIf you forgot your password, please contact your admin.`;
    const url = getWhatsAppUrl(member.phone, message);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold text-foreground">Team Management</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-1">Manage all team members and create admin accounts</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="h-9 md:h-10 px-3 md:px-4 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-xs md:text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors"
        >
          <UserPlus size={14} /> <span className="hidden sm:inline">Create Admin</span><span className="sm:hidden">Add</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 md:h-10 pl-9 pr-4 rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none text-sm font-body"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[{ value: "all", label: "All" }, ...ALL_ROLES].map((r) => (
            <button
              key={r.value}
              onClick={() => setRoleFilter(r.value)}
              className={`h-7 md:h-8 px-2 md:px-3 rounded-md text-[10px] md:text-xs font-medium transition-colors ${
                roleFilter === r.value
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-card text-muted-foreground border border-border hover:bg-accent"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block">
        <DesktopTable
          members={filtered}
          loading={loading}
          getCreatorName={getCreatorName}
          onToggleActive={toggleActive}
          onResetPassword={handleResetPassword}
          onDelete={(m) => setConfirmDelete(m)}
          deletingId={deletingId}
          onShare={handleShareCredentials}
        />
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden">
        <MobileCards
          members={filtered}
          loading={loading}
          getCreatorName={getCreatorName}
          onToggleActive={toggleActive}
          onResetPassword={handleResetPassword}
          onDelete={(m) => setConfirmDelete(m)}
          deletingId={deletingId}
          onShare={handleShareCredentials}
        />
      </div>

      {/* Delete Confirmation */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setConfirmDelete(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-card border border-border rounded-xl p-6"
            >
              <h3 className="font-display font-bold text-foreground mb-2">Delete Member?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Are you sure you want to delete <strong className="text-foreground">{confirmDelete.name}</strong>? This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(null)} className="flex-1 h-9 rounded-lg bg-accent text-foreground text-sm font-medium border border-border hover:bg-accent/80 transition-colors">Cancel</button>
                <button
                  onClick={() => handleDelete(confirmDelete)}
                  disabled={deletingId === confirmDelete.uid}
                  className="flex-1 h-9 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {deletingId === confirmDelete.uid ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Admin Modal */}
      <AnimatePresence>
        {showCreate && (
          <CreateAdminModal
            onClose={() => setShowCreate(false)}
            onCreated={() => setShowCreate(false)}
            currentUserId={currentUser?.uid || ""}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Desktop Table ─── */
interface TableProps {
  members: AppUser[];
  loading: boolean;
  getCreatorName: (id: string) => string;
  onToggleActive: (m: AppUser) => void;
  onResetPassword: (email: string) => void;
  onDelete: (m: AppUser) => void;
  deletingId: string | null;
  onShare: (m: AppUser) => void;
}

function DesktopTable({ members, loading, getCreatorName, onToggleActive, onResetPassword, onDelete, onShare }: TableProps) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-elevated/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Member</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Phone</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created By</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-24" /></td>
                  ))}
                </tr>
              ))
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <Users size={32} className="mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-muted-foreground text-sm">No members found</p>
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr key={m.uid} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center font-display font-bold text-primary text-xs shrink-0">
                        {m.name?.charAt(0) || "?"}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{m.name}</p>
                        <p className="text-xs text-muted-foreground">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {m.phone ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono text-muted-foreground">{formatPhoneDisplay(m.phone)}</span>
                        <a href={getCallUrl(m.phone)} className="w-6 h-6 rounded flex items-center justify-center text-success hover:bg-success/10 transition-colors" title="Call">
                          <Phone size={12} />
                        </a>
                        <a href={getWhatsAppUrl(m.phone)} target="_blank" rel="noopener noreferrer" className="w-6 h-6 rounded flex items-center justify-center text-success hover:bg-success/10 transition-colors" title="WhatsApp">
                          <MessageCircle size={12} />
                        </a>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-medium px-2 py-1 rounded-full ${getRoleColor(m.role)}`}>
                      {getRoleLabel(m.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{getCreatorName(m.createdBy)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${m.isActive ? "text-success" : "text-destructive"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${m.isActive ? "bg-success" : "bg-destructive"}`} />
                      {m.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs font-mono">
                    {m.createdAt?.toDate ? formatDate(m.createdAt.toDate()) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => onShare(m)} title="Share credentials"
                        className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-success hover:bg-success/10 transition-colors">
                        <Share2 size={15} />
                      </button>
                      <button onClick={() => onToggleActive(m)} title={m.isActive ? "Deactivate" : "Activate"}
                        className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                        {m.isActive ? <ShieldOff size={15} /> : <Shield size={15} />}
                      </button>
                      <button onClick={() => onResetPassword(m.email)} title="Send password reset"
                        className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                        <RotateCcw size={15} />
                      </button>
                      <button onClick={() => onDelete(m)} title="Delete member"
                        className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
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
      <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
        {members.length} member{members.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

/* ─── Mobile Cards ─── */
function MobileCards({ members, loading, getCreatorName, onToggleActive, onResetPassword, onDelete, onShare }: TableProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-3 animate-pulse">
            <div className="h-4 bg-muted rounded w-32" />
            <div className="h-3 bg-muted rounded w-24" />
            <div className="h-3 bg-muted rounded w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <Users size={32} className="mx-auto text-muted-foreground/30 mb-2" />
        <p className="text-muted-foreground text-sm">No members found</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {members.map((m) => (
        <div key={m.uid} className="bg-card border border-border rounded-xl p-4">
          {/* Top: avatar + name + status */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center font-display font-bold text-primary text-sm shrink-0">
                {m.name?.charAt(0) || "?"}
              </div>
              <div>
                <p className="font-medium text-foreground text-sm">{m.name}</p>
                <p className="text-xs text-muted-foreground">{m.email}</p>
              </div>
            </div>
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${m.isActive ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${m.isActive ? "bg-success" : "bg-destructive"}`} />
              {m.isActive ? "Active" : "Inactive"}
            </span>
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-2 text-xs mb-3">
            <div>
              <span className="text-muted-foreground">Role</span>
              <span className={`ml-2 font-medium px-1.5 py-0.5 rounded-full text-[10px] ${getRoleColor(m.role)}`}>{getRoleLabel(m.role)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Created by</span>
              <span className="ml-2 text-foreground">{getCreatorName(m.createdBy)}</span>
            </div>
            {m.phone && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Phone</span>
                <span className="ml-2 font-mono text-foreground">{formatPhoneDisplay(m.phone)}</span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-2 border-t border-border/50">
            {m.phone && (
              <>
                <a href={getCallUrl(m.phone)}
                  className="flex-1 h-8 rounded-lg bg-success/10 text-success text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-success/20 transition-colors">
                  <Phone size={12} /> Call
                </a>
                <a href={getWhatsAppUrl(m.phone)} target="_blank" rel="noopener noreferrer"
                  className="flex-1 h-8 rounded-lg bg-success/10 text-success text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-success/20 transition-colors">
                  <MessageCircle size={12} /> WhatsApp
                </a>
              </>
            )}
            <button onClick={() => onShare(m)} title="Share credentials"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-success hover:bg-success/10 transition-colors border border-border">
              <Share2 size={14} />
            </button>
            <button onClick={() => onToggleActive(m)} title={m.isActive ? "Deactivate" : "Activate"}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border border-border">
              {m.isActive ? <ShieldOff size={14} /> : <Shield size={14} />}
            </button>
            <button onClick={() => onResetPassword(m.email)} title="Reset password"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border border-border">
              <RotateCcw size={14} />
            </button>
            <button onClick={() => onDelete(m)} title="Delete"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors border border-border">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground text-center py-2">{members.length} member{members.length !== 1 ? "s" : ""}</p>
    </div>
  );
}

/* ─── Create Admin Modal ─── */
interface CreateModalProps {
  onClose: () => void;
  onCreated: () => void;
  currentUserId: string;
}

function CreateAdminModal({ onClose, onCreated, currentUserId }: CreateModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<UserRole>("tech_admin");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ email: string; password: string } | null>(null);
  const { toast } = useToast();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();
    const normalizedPhone = trimmedPhone ? normalizePhone(trimmedPhone) : "";
    const trimmedPassword = password.trim();

    if (!trimmedName || trimmedName.length > 100) {
      setError("Name is required and must be under 100 characters.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (trimmedPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setCreating(true);
    try {
      const cred = await createUserWithoutSignOut(trimmedEmail, trimmedPassword);

      await setDoc(doc(db, "users", cred.user.uid), {
        email: trimmedEmail,
        name: trimmedName,
        role,
        phone: normalizedPhone,
        createdBy: currentUserId,
        isActive: true,
        salary: 0,
        target: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSuccess({ email: trimmedEmail, password: trimmedPassword });
      toast({ title: "Account Created", description: `${trimmedName} has been added as ${getRoleLabel(role)}.` });
    } catch (err: any) {
      const msg =
        err.code === "auth/email-already-in-use"
          ? "This email is already registered."
          : err.code === "auth/weak-password"
          ? "Password is too weak (min 6 characters)."
          : "Failed to create account. Please try again.";
      setError(msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <UserPlus size={18} className="text-primary" />
            <h2 className="font-display font-bold text-lg text-foreground">Create Admin Account</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <X size={16} />
          </button>
        </div>

        {success ? (
          <div className="p-6 space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-3">
                <Check size={24} className="text-success" />
              </div>
              <h3 className="font-display font-bold text-foreground">Account Created!</h3>
              <p className="text-sm text-muted-foreground mt-1">Share these credentials with the admin</p>
            </div>
            <div className="bg-background border border-border rounded-lg p-4 font-mono text-sm space-y-1">
              <p><span className="text-muted-foreground">Email:</span> <span className="text-foreground">{success.email}</span></p>
              <p><span className="text-muted-foreground">Password:</span> <span className="text-foreground">{success.password}</span></p>
            </div>
            <button onClick={onCreated} className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:bg-primary/90 transition-colors">Done</button>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="p-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Full Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Admin Name" required maxLength={100}
                className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none text-sm font-body" />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Email Address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@dreamteam.com" required maxLength={255}
                className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none text-sm font-body" />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" maxLength={20}
                className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none text-sm font-body" />
              <p className="text-[10px] text-muted-foreground mt-1">+91 will be added automatically</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full h-10 px-4 rounded-lg bg-background border border-border text-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none text-sm font-body appearance-none cursor-pointer">
                {ADMIN_ROLES.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Password</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password (min 6 characters)" required minLength={6} maxLength={100}
                  className="w-full h-10 px-4 pr-11 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none text-sm font-body" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {error && <p className="text-destructive text-sm bg-destructive/10 px-4 py-2.5 rounded-lg">{error}</p>}
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose} className="flex-1 h-10 rounded-lg bg-accent text-foreground font-medium text-sm hover:bg-accent/80 transition-colors border border-border">Cancel</button>
              <button type="submit" disabled={creating}
                className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                {creating && <Loader2 size={15} className="animate-spin" />}
                {creating ? "Creating..." : "Create Account"}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
}

import { useState, useEffect, useRef, useMemo } from "react";
import { collection, onSnapshot, updateDoc, doc, addDoc, deleteDoc, serverTimestamp, query, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency } from "@/utils/formatters";
import { getRoleLabel, getRoleColor } from "@/utils/roleHelpers";
import { uploadToCloudinary } from "@/services/cloudinary";
import type { AppUser } from "@/types";
import { Users, Download, Edit3, Check, X, Loader2, Send, Receipt, Upload, FileText, Trash2, History } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useConfirm } from "@/hooks/useConfirm";

export default function SalaryManagement() {
  const currentUser = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const isMobile = useIsMobile();
  const [members, setMembers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState("all");
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editSalary, setEditSalary] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  // Receipt modal state
  const [receiptMember, setReceiptMember] = useState<AppUser | null>(null);
  const [receiptAmount, setReceiptAmount] = useState<number>(0);
  const [receiptMonth, setReceiptMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [receiptNote, setReceiptNote] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sendingReceipt, setSendingReceipt] = useState(false);

  // Track sent receipts
  const [sentReceipts, setSentReceipts] = useState<Record<string, { id: string; month: string; amount: number; fileUrl?: string; fileName?: string; sentAt: any; note?: string }[]>>({});
  const [receiptHistoryMember, setReceiptHistoryMember] = useState<AppUser | null>(null);
  const [deletingReceiptId, setDeletingReceiptId] = useState<string | null>(null);

  useEffect(() => {
    const unsubs: (() => void)[] = [];
    unsubs.push(onSnapshot(collection(db, "users"), (snap) => {
      setMembers(
        snap.docs
          .map((d) => ({ uid: d.id, ...d.data() } as AppUser))
          .sort((a, b) => (b.salary || 0) - (a.salary || 0))
      );
      setLoading(false);
    }));
    unsubs.push(onSnapshot(collection(db, "salary_receipts"), (snap) => {
      const map: Record<string, { id: string; month: string; amount: number; fileUrl?: string; fileName?: string; sentAt: any; note?: string }[]> = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        if (!map[data.userId]) map[data.userId] = [];
        map[data.userId].push({ id: d.id, month: data.month, amount: data.amount, fileUrl: data.fileUrl, fileName: data.fileName, sentAt: data.sentAt, note: data.note });
      });
      // Sort each by sentAt desc
      Object.values(map).forEach((arr) => arr.sort((a, b) => (b.sentAt?.seconds || 0) - (a.sentAt?.seconds || 0)));
      setSentReceipts(map);
    }));
    return () => unsubs.forEach((u) => u());
  }, []);

  const handleSave = async (uid: string) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", uid), { salary: editSalary, updatedAt: serverTimestamp() });
      setMembers((prev) => prev.map((m) => m.uid === uid ? { ...m, salary: editSalary } : m));
      setEditingUid(null);
      toast({ title: "Saved", description: "Salary updated." });
    } catch {
      toast({ title: "Error", description: "Failed to update.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openReceiptModal = (m: AppUser) => {
    setReceiptMember(m);
    setReceiptAmount(m.salary || 0);
    setReceiptNote("");
    setReceiptFile(null);
    setUploadProgress(0);
    const now = new Date();
    setReceiptMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  };

  const handleSendReceipt = async () => {
    if (!receiptMember || receiptAmount <= 0) {
      toast({ title: "Error", description: "Amount must be greater than 0.", variant: "destructive" });
      return;
    }
    if (!receiptFile) {
      toast({ title: "Error", description: "Please upload a receipt file (PDF or screenshot).", variant: "destructive" });
      return;
    }
    setSendingReceipt(true);
    try {
      // Upload file to Cloudinary
      const fileUrl = await uploadToCloudinary(receiptFile, (pct) => setUploadProgress(pct));
      
      const monthLabel = new Date(receiptMonth + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      await addDoc(collection(db, "salary_receipts"), {
        userId: receiptMember.uid,
        amount: receiptAmount,
        month: monthLabel,
        note: receiptNote.trim(),
        fileUrl,
        fileName: receiptFile.name,
        sentBy: currentUser?.uid || "",
        sentAt: serverTimestamp(),
      });

      // Send notification to the member
      await addDoc(collection(db, "notifications"), {
        userId: receiptMember.uid,
        type: "salary_receipt",
        title: "Salary Receipt Received",
        message: `Your salary receipt for ${monthLabel} — ${formatCurrency(receiptAmount)} has been sent. Check your profile.`,
        read: false,
        createdAt: serverTimestamp(),
      });

      toast({ title: "Receipt Sent", description: `Salary receipt with file sent to ${receiptMember.name}.` });
      setReceiptMember(null);
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Failed to send receipt.", variant: "destructive" });
    } finally {
      setSendingReceipt(false);
    }
  };

  const handleDeleteReceipt = async (receiptId: string) => {
    const { confirmed } = await confirm({ title: "Undo Receipt", description: "Undo this salary receipt? This will permanently delete it.", confirmText: "Undo", variant: "destructive" });
    if (!confirmed) return;
    setDeletingReceiptId(receiptId);
    try {
      await deleteDoc(doc(db, "salary_receipts", receiptId));
      toast({ title: "Undone", description: "Salary receipt has been deleted." });
    } catch {
      toast({ title: "Error", description: "Failed to delete receipt.", variant: "destructive" });
    } finally {
      setDeletingReceiptId(null);
    }
  };

  const filtered = roleFilter === "all" ? members : members.filter((m) => m.role === roleFilter);
  const totalSalary = filtered.reduce((s, m) => s + (m.salary || 0), 0);

  const exportCSV = () => {
    const rows = [["Name", "Email", "Role", "Salary", "Status"]];
    filtered.forEach((m) => rows.push([m.name, m.email, getRoleLabel(m.role), String(m.salary || 0), m.isActive ? "Active" : "Inactive"]));
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "salary-report.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {ConfirmDialog}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold text-foreground">Salary Management</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-1">View and manage salary for all staff</p>
        </div>
        <button onClick={exportCSV}
          className="h-9 px-3 md:px-4 rounded-lg bg-accent text-foreground text-xs md:text-sm font-medium flex items-center gap-2 border border-border hover:bg-accent/80 transition-colors">
          <Download size={14} /> <span className="hidden sm:inline">Export CSV</span><span className="sm:hidden">CSV</span>
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 md:p-5">
          <p className="text-xs text-muted-foreground font-medium mb-1">Total Monthly Salary</p>
          <p className="font-display text-xl md:text-2xl font-bold text-warning">{formatCurrency(totalSalary)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 md:p-5">
          <p className="text-xs text-muted-foreground font-medium mb-1">Active Staff</p>
          <p className="font-display text-xl md:text-2xl font-bold text-success">{filtered.filter((m) => m.isActive).length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 md:p-5">
          <p className="text-xs text-muted-foreground font-medium mb-1">Average Salary</p>
          <p className="font-display text-xl md:text-2xl font-bold text-foreground">{formatCurrency(filtered.length > 0 ? Math.round(totalSalary / filtered.length) : 0)}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
          className="h-9 px-3 rounded-lg bg-card border border-border text-foreground text-sm outline-none focus:border-primary">
          <option value="all">All Roles</option>
          <option value="main_admin">Main Admin</option>
          <option value="tech_admin">Tech Admin</option>
          <option value="sales_admin">Sales Admin</option>
          <option value="accounts_admin">Accounts Admin</option>
          <option value="tech_member">Tech Member</option>
          <option value="sales_member">Sales Member</option>
        </select>
        <span className="ml-auto text-xs text-muted-foreground font-mono">{filtered.length} staff</span>
      </div>

      {/* Table / Cards */}
      {isMobile ? (
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse space-y-2">
                <div className="h-4 bg-muted rounded w-32" />
                <div className="h-3 bg-muted rounded w-24" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <Users size={32} className="mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-muted-foreground text-sm">No staff found</p>
            </div>
          ) : (
            filtered.map((m) => (
              <div key={m.uid} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center font-display font-bold text-primary text-xs shrink-0">
                      {m.name?.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-foreground text-sm">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${m.isActive ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                    {m.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${getRoleColor(m.role)}`}>{getRoleLabel(m.role)}</span>
                  </div>
                  <span className="font-mono font-bold text-warning text-sm">{formatCurrency(m.salary || 0)}</span>
                </div>
                {/* Receipt status */}
                {sentReceipts[m.uid]?.length > 0 ? (
                  <button onClick={() => setReceiptHistoryMember(m)} className="flex items-center gap-1.5 mt-2 hover:opacity-80 transition-opacity">
                    <Receipt size={11} className="text-success" />
                    <span className="text-[10px] text-success font-medium">
                      Last: {sentReceipts[m.uid][0]?.month || "—"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">({sentReceipts[m.uid].length})</span>
                    <History size={10} className="text-muted-foreground" />
                  </button>
                ) : null}
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/50">
                  <button onClick={() => { setEditingUid(m.uid); setEditSalary(m.salary || 0); }}
                    className="flex-1 h-8 rounded-lg bg-accent text-foreground text-xs font-medium flex items-center justify-center gap-1.5 border border-border hover:bg-accent/80 transition-colors">
                    <Edit3 size={12} /> Edit Salary
                  </button>
                  <button onClick={() => openReceiptModal(m)}
                    className="flex-1 h-8 rounded-lg bg-success/10 text-success text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-success/20 transition-colors">
                    <Send size={12} /> Send Receipt
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-elevated/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Staff</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Salary</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Receipt</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {Array.from({ length: 6 }).map((__, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-20" /></td>)}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  <Users size={32} className="mx-auto mb-2 opacity-30" /><p>No staff found</p>
                </td></tr>
              ) : (
                filtered.map((m, i) => (
                  <tr key={m.uid} className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${i % 2 === 1 ? "bg-elevated/20" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center font-display font-bold text-primary text-xs">
                          {m.name?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${getRoleColor(m.role)}`}>
                        {getRoleLabel(m.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editingUid === m.uid ? (
                        <div className="flex items-center gap-1 justify-end">
                          <input type="number" min={0} value={editSalary || ""} onChange={(e) => setEditSalary(Number(e.target.value) || 0)}
                            className="w-28 h-8 px-2 rounded-md bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono text-right" autoFocus />
                          <button onClick={() => handleSave(m.uid)} disabled={saving}
                            className="w-7 h-7 rounded-md inline-flex items-center justify-center text-success hover:bg-success/10">
                            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          </button>
                          <button onClick={() => setEditingUid(null)}
                            className="w-7 h-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:bg-accent">
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <span className="font-mono text-warning font-semibold">{formatCurrency(m.salary || 0)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {sentReceipts[m.uid]?.length > 0 ? (
                        <button onClick={() => setReceiptHistoryMember(m)} className="flex flex-col items-center hover:opacity-80 transition-opacity mx-auto">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success font-medium">
                            ✓ {sentReceipts[m.uid][0]?.month}
                          </span>
                          <span className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-1">{sentReceipts[m.uid].length} sent <History size={9} /></span>
                        </button>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Not sent</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${m.isActive ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                        {m.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center gap-1 justify-center">
                        {editingUid !== m.uid && (
                          <button onClick={() => { setEditingUid(m.uid); setEditSalary(m.salary || 0); }}
                            className="w-8 h-8 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Edit Salary">
                            <Edit3 size={14} />
                          </button>
                        )}
                        <button onClick={() => openReceiptModal(m)}
                          className="w-8 h-8 rounded-md inline-flex items-center justify-center text-success hover:bg-success/10 transition-colors" title="Send Receipt">
                          <Send size={14} />
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

      {/* Inline Edit Modal for Mobile */}
      {isMobile && editingUid && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setEditingUid(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-bold text-foreground mb-3">Edit Salary</h3>
            <input type="number" min={0} value={editSalary || ""} onChange={(e) => setEditSalary(Number(e.target.value) || 0)}
              className="w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono mb-3" autoFocus />
            <div className="flex gap-2">
              <button onClick={() => setEditingUid(null)} className="flex-1 h-9 rounded-lg bg-accent text-foreground text-sm font-medium border border-border">Cancel</button>
              <button onClick={() => handleSave(editingUid)} disabled={saving}
                className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Receipt Modal */}
      {receiptMember && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setReceiptMember(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-foreground">Send Salary Receipt</h3>
              <button onClick={() => setReceiptMember(null)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="flex items-center gap-3 mb-4 p-3 bg-background rounded-lg border border-border">
              <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center font-display font-bold text-primary text-xs">
                {receiptMember.name?.charAt(0)}
              </div>
              <div>
                <p className="font-medium text-foreground text-sm">{receiptMember.name}</p>
                <p className="text-xs text-muted-foreground">{getRoleLabel(receiptMember.role)}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Month</label>
                <input type="month" value={receiptMonth} onChange={(e) => setReceiptMonth(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Amount (₹)</label>
                <input type="number" min={0} value={receiptAmount || ""} onChange={(e) => setReceiptAmount(Number(e.target.value) || 0)}
                  className="w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Note <span className="text-muted-foreground/50">(optional)</span></label>
                <input type="text" value={receiptNote} onChange={(e) => setReceiptNote(e.target.value)} placeholder="e.g. Bonus included"
                  className="w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary placeholder:text-muted-foreground/40" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Receipt File <span className="text-destructive">*</span></label>
                <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} className="hidden" />
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className={`w-full h-10 px-3 rounded-lg border text-sm flex items-center gap-2 transition-colors ${
                    receiptFile ? "bg-success/10 border-success/30 text-success" : "bg-background border-border text-muted-foreground hover:border-primary"
                  }`}>
                  {receiptFile ? (
                    <><FileText size={14} /> <span className="truncate flex-1 text-left">{receiptFile.name}</span></>
                  ) : (
                    <><Upload size={14} /> Upload PDF or Screenshot</>
                  )}
                </button>
                {sendingReceipt && uploadProgress > 0 && uploadProgress < 100 && (
                  <div className="h-1.5 bg-border rounded-full overflow-hidden mt-2">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                )}
              </div>
              <button onClick={handleSendReceipt} disabled={sendingReceipt || !receiptFile}
                className="w-full h-10 rounded-lg bg-success text-white font-display font-semibold text-sm hover:bg-success/90 disabled:opacity-50 flex items-center justify-center gap-2">
                {sendingReceipt ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {sendingReceipt ? "Uploading & Sending..." : "Send Receipt"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt History Modal */}
      {receiptHistoryMember && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setReceiptHistoryMember(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
              <div>
                <h3 className="font-display font-bold text-foreground">Salary Receipts</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{receiptHistoryMember.name} · {getRoleLabel(receiptHistoryMember.role)}</p>
              </div>
              <button onClick={() => setReceiptHistoryMember(null)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              {(sentReceipts[receiptHistoryMember.uid] || []).length === 0 ? (
                <div className="text-center py-8">
                  <Receipt size={24} className="mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No receipts sent yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(sentReceipts[receiptHistoryMember.uid] || []).map((r) => (
                    <div key={r.id} className="bg-background border border-border rounded-lg p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-display font-bold text-foreground">{formatCurrency(r.amount)}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success font-medium">{r.month}</span>
                          </div>
                          {r.note && <p className="text-xs text-muted-foreground mt-1">{r.note}</p>}
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {r.sentAt?.seconds ? format(new Date(r.sentAt.seconds * 1000), "dd MMM yyyy, hh:mm a") : "—"}
                            </span>
                            {r.fileUrl && (
                              <a href={r.fileUrl} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] text-primary hover:text-primary/80 font-medium flex items-center gap-1">
                                <FileText size={10} /> {r.fileName || "View File"}
                              </a>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteReceipt(r.id)}
                          disabled={deletingReceiptId === r.id}
                          className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                          title="Undo / Delete Receipt"
                        >
                          {deletingReceiptId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

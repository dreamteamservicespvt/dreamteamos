import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency } from "@/utils/formatters";
import { Wallet, Plus, Trash2, Loader2, Download, Pencil, X, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

interface Expense {
  id: string;
  addedBy: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  createdAt: any;
}

const PRESET_CATEGORIES = [
  "Salary", "Software/Tools", "Marketing", "Infrastructure", "Miscellaneous",
];

export default function DailyExpenses() {
  const currentUser = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");

  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [expCategory, setExpCategory] = useState("Miscellaneous");
  const [customCategory, setCustomCategory] = useState("");
  const [expDesc, setExpDesc] = useState("");
  const [expAmount, setExpAmount] = useState<number>(0);
  const [adding, setAdding] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editCustomCat, setEditCustomCat] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editAmount, setEditAmount] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "expenses"), (snap) => {
      setExpenses(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Expense))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      );
      setLoading(false);
    });
    return unsub;
  }, []);

  const allCategories = useMemo(() => {
    const fromData = expenses.map((e) => e.category);
    const combined = new Set([...PRESET_CATEGORIES, ...fromData]);
    return Array.from(combined).sort();
  }, [expenses]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalCategory = expCategory === "__custom__" ? customCategory.trim() : expCategory;
    if (!expDesc.trim() || expAmount <= 0 || !finalCategory) {
      toast({ title: "Error", description: "Fill all fields including category.", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const docRef = await addDoc(collection(db, "expenses"), {
        addedBy: currentUser?.uid || "",
        date: expDate,
        category: finalCategory,
        description: expDesc.trim(),
        amount: expAmount,
        createdAt: serverTimestamp(),
      });
      setExpenses((prev) => [{
        id: docRef.id, addedBy: currentUser?.uid || "", date: expDate,
        category: finalCategory, description: expDesc.trim(), amount: expAmount,
        createdAt: { seconds: Date.now() / 1000 },
      }, ...prev]);
      setExpDesc(""); setExpAmount(0); setCustomCategory(""); setShowAdd(false);
      toast({ title: "Added", description: `${formatCurrency(expAmount)} expense recorded.` });
    } catch {
      toast({ title: "Error", description: "Failed to add.", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (e: Expense) => {
    setEditingId(e.id);
    setEditDate(e.date);
    const isPreset = PRESET_CATEGORIES.includes(e.category);
    setEditCategory(isPreset ? e.category : "__custom__");
    setEditCustomCat(isPreset ? "" : e.category);
    setEditDesc(e.description);
    setEditAmount(e.amount);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const finalCat = editCategory === "__custom__" ? editCustomCat.trim() : editCategory;
    if (!editDesc.trim() || editAmount <= 0 || !finalCat) {
      toast({ title: "Error", description: "Fill all fields.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, "expenses", editingId), {
        date: editDate, category: finalCat, description: editDesc.trim(), amount: editAmount,
      });
      setExpenses((prev) => prev.map((ex) =>
        ex.id === editingId ? { ...ex, date: editDate, category: finalCat, description: editDesc.trim(), amount: editAmount } : ex
      ));
      setEditingId(null);
      toast({ title: "Updated" });
    } catch {
      toast({ title: "Error", description: "Failed to update.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this expense?")) return;
    try {
      await deleteDoc(doc(db, "expenses", id));
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      toast({ title: "Deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
    }
  };

  const filtered = categoryFilter === "all" ? expenses : expenses.filter((e) => e.category === categoryFilter);
  const totalFiltered = filtered.reduce((s, e) => s + e.amount, 0);
  const totalAll = expenses.reduce((s, e) => s + e.amount, 0);

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    expenses.forEach((e) => {
      if (!map[e.category]) map[e.category] = { count: 0, total: 0 };
      map[e.category].count++;
      map[e.category].total += e.amount;
    });
    return Object.entries(map)
      .map(([name, data]) => ({ name, ...data, pct: totalAll > 0 ? (data.total / totalAll) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [expenses, totalAll]);

  const breakdownColors = [
    "bg-primary", "bg-info", "bg-warning", "bg-success", "bg-destructive",
    "bg-role-sales-admin", "bg-role-tech-admin", "bg-role-main-admin",
  ];

  const exportCSV = () => {
    const rows = [["Date", "Category", "Description", "Amount"]];
    filtered.forEach((e) => rows.push([e.date, e.category, e.description, String(e.amount)]));
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "expenses.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const editCategoryOptions = [...PRESET_CATEGORIES, ...allCategories.filter((c) => !PRESET_CATEGORIES.includes(c))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold text-foreground">Daily Expenses</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-1">Track and manage all expenses</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV}
            className="h-9 px-3 md:px-4 rounded-lg bg-accent text-foreground text-xs md:text-sm font-medium flex items-center gap-2 border border-border hover:bg-accent/80 transition-colors">
            <Download size={14} /> <span className="hidden sm:inline">CSV</span>
          </button>
          <button onClick={() => setShowAdd(!showAdd)}
            className="h-9 px-3 md:px-4 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-xs md:text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors">
            <Plus size={14} /> <span className="hidden sm:inline">Add Expense</span><span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-card border border-border rounded-xl p-4 md:p-5 space-y-3">
          <h3 className="font-display font-semibold text-foreground text-sm">New Expense</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)}
              className="h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono" />
            <div className="space-y-2">
              <select value={expCategory} onChange={(e) => setExpCategory(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary">
                {PRESET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="__custom__">+ Custom Category</option>
              </select>
              {expCategory === "__custom__" && (
                <input type="text" value={customCategory} onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Enter custom category"
                  className="w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary placeholder:text-muted-foreground/40" />
              )}
            </div>
            <input type="text" value={expDesc} onChange={(e) => setExpDesc(e.target.value)} placeholder="Description"
              className="h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary placeholder:text-muted-foreground/40" />
            <div className="flex gap-2">
              <input type="number" min={1} value={expAmount || ""} onChange={(e) => setExpAmount(Number(e.target.value) || 0)} placeholder="₹ Amount"
                className="flex-1 h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono placeholder:text-muted-foreground/40" />
              <button type="submit" disabled={adding}
                className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1">
                {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Compact Category Breakdown */}
      {categoryBreakdown.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-display font-semibold text-foreground text-sm">Category Breakdown</h3>
            <span className="text-xs text-muted-foreground font-mono">{formatCurrency(totalAll)} total</span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden flex mb-3">
            {categoryBreakdown.map((cat, i) => (
              <div key={cat.name} className={`${breakdownColors[i % breakdownColors.length]} transition-all`}
                style={{ width: `${cat.pct}%` }} title={`${cat.name}: ${formatCurrency(cat.total)}`} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {categoryBreakdown.map((cat, i) => (
              <div key={cat.name} className="flex items-center gap-1.5 text-xs">
                <div className={`w-2 h-2 rounded-full shrink-0 ${breakdownColors[i % breakdownColors.length]}`} />
                <span className="text-muted-foreground">{cat.name}</span>
                <span className="font-mono font-medium text-foreground">{formatCurrency(cat.total)}</span>
                <span className="text-muted-foreground/60">({cat.pct.toFixed(0)}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter + Total */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-9 px-3 rounded-lg bg-card border border-border text-foreground text-sm outline-none focus:border-primary">
          <option value="all">All Categories</option>
          {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="ml-auto text-sm font-mono">
          <span className="text-muted-foreground">{filtered.length} entries</span>
          <span className="mx-2 text-border">|</span>
          <span className="text-destructive font-semibold">{formatCurrency(totalFiltered)}</span>
        </span>
      </div>

      {/* Edit Modal */}
      {editingId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setEditingId(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-foreground">Edit Expense</h3>
              <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Date</label>
                <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
                <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary">
                  {editCategoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  <option value="__custom__">+ Custom Category</option>
                </select>
                {editCategory === "__custom__" && (
                  <input type="text" value={editCustomCat} onChange={(e) => setEditCustomCat(e.target.value)} placeholder="Custom category name"
                    className="w-full h-10 px-3 mt-2 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary placeholder:text-muted-foreground/40" />
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                <input type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Amount (₹)</label>
                <input type="number" min={1} value={editAmount || ""} onChange={(e) => setEditAmount(Number(e.target.value) || 0)}
                  className="w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono" />
              </div>
              <button onClick={handleSaveEdit} disabled={saving}
                className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table (Desktop) / Cards (Mobile) */}
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
              <Wallet size={32} className="mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-muted-foreground text-sm">No expenses recorded</p>
            </div>
          ) : (
            filtered.map((e) => (
              <div key={e.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-foreground text-sm">{e.description}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{e.date}</p>
                  </div>
                  <p className="font-mono font-bold text-destructive text-sm">{formatCurrency(e.amount)}</p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent text-foreground">{e.category}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEdit(e)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => handleDelete(e.id)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
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
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {Array.from({ length: 5 }).map((__, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-20" /></td>)}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  <Wallet size={32} className="mx-auto mb-2 opacity-30" /><p>No expenses recorded</p>
                </td></tr>
              ) : (
                filtered.map((e, i) => (
                  <tr key={e.id} className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${i % 2 === 1 ? "bg-elevated/20" : ""}`}>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{e.date}</td>
                    <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-accent text-foreground">{e.category}</span></td>
                    <td className="px-4 py-3 text-foreground">{e.description}</td>
                    <td className="px-4 py-3 text-right font-mono text-destructive">{formatCurrency(e.amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center gap-1 justify-center">
                        <button onClick={() => startEdit(e)}
                          className="w-7 h-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDelete(e.id)}
                          className="w-7 h-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                          <Trash2 size={14} />
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
    </div>
  );
}

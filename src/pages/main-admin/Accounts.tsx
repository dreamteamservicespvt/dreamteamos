import { useState, useEffect } from "react";
import { collection, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency, formatDate } from "@/utils/formatters";
import type { AppUser } from "@/types";
import { Wallet, TrendingUp, TrendingDown, Plus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Expense {
  id: string;
  addedBy: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  createdAt: any;
}

const EXPENSE_CATEGORIES = [
  "Salary", "Software/Tools", "Marketing", "Infrastructure", "Miscellaneous", "Other",
];

export default function Accounts() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [members, setMembers] = useState<AppUser[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [expCategory, setExpCategory] = useState("Miscellaneous");
  const [expDesc, setExpDesc] = useState("");
  const [expAmount, setExpAmount] = useState<number>(0);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let loaded = 0;
    const checkDone = () => { loaded++; if (loaded >= 4) setLoading(false); };
    const unsubs: (() => void)[] = [];
    unsubs.push(onSnapshot(collection(db, "users"), (snap) => { setMembers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser))); checkDone(); }));
    unsubs.push(onSnapshot(collection(db, "expenses"), (snap) => {
      setExpenses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense)).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      checkDone();
    }));
    unsubs.push(onSnapshot(collection(db, "leads"), (snap) => { setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); checkDone(); }));
    unsubs.push(onSnapshot(collection(db, "work_submissions"), (snap) => { setSubmissions(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); checkDone(); }));
    return () => unsubs.forEach((u) => u());
  }, []);

  const totalSalesRevenue = leads
    .filter((l: any) => l.saleDone && l.saleDetails)
    .reduce((s, l: any) => s + (l.saleDetails?.amount || 0), 0);
  const totalTechRevenue = submissions
    .filter((s) => s.status === "approved")
    .reduce((s, sub) => s + (sub.calculatedRevenue || 0), 0);
  const totalRevenue = totalSalesRevenue + totalTechRevenue;
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalSalaries = members.reduce((s, m) => s + (m.salary || 0), 0);
  const netProfit = totalRevenue - totalExpenses - totalSalaries;

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expDesc.trim() || expAmount <= 0) {
      toast({ title: "Error", description: "Fill all fields correctly.", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const docRef = await addDoc(collection(db, "expenses"), {
        addedBy: user?.uid || "",
        date: expDate,
        category: expCategory,
        description: expDesc.trim(),
        amount: expAmount,
        createdAt: serverTimestamp(),
      });
      setExpenses((prev) => [
        { id: docRef.id, addedBy: user?.uid || "", date: expDate, category: expCategory, description: expDesc.trim(), amount: expAmount, createdAt: { seconds: Date.now() / 1000 } },
        ...prev,
      ]);
      setExpDesc("");
      setExpAmount(0);
      setShowAdd(false);
      toast({ title: "Expense Added", description: `${formatCurrency(expAmount)} recorded.` });
    } catch {
      toast({ title: "Error", description: "Failed to add expense.", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Accounts</h1>
          <p className="text-muted-foreground text-sm mt-1">Financial overview and expense tracking</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="h-9 px-3 md:px-4 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} /> <span className="hidden sm:inline">Add Expense</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-card border border-border rounded-xl p-3 md:p-5">
          <div className="flex items-center gap-2 mb-1"><TrendingUp size={14} className="text-success" /><span className="text-[10px] md:text-xs text-muted-foreground">Total Revenue</span></div>
          <p className="font-display text-lg md:text-2xl font-bold text-foreground">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 md:p-5">
          <div className="flex items-center gap-2 mb-1"><TrendingDown size={14} className="text-destructive" /><span className="text-[10px] md:text-xs text-muted-foreground">Expenses</span></div>
          <p className="font-display text-lg md:text-2xl font-bold text-foreground">{formatCurrency(totalExpenses)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 md:p-5">
          <div className="flex items-center gap-2 mb-1"><Wallet size={14} className="text-warning" /><span className="text-[10px] md:text-xs text-muted-foreground">Salaries</span></div>
          <p className="font-display text-lg md:text-2xl font-bold text-foreground">{formatCurrency(totalSalaries)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 md:p-5">
          <div className="flex items-center gap-2 mb-1"><TrendingUp size={14} className={netProfit >= 0 ? "text-success" : "text-destructive"} /><span className="text-[10px] md:text-xs text-muted-foreground">Net Profit</span></div>
          <p className={`font-display text-lg md:text-2xl font-bold ${netProfit >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(netProfit)}</p>
        </div>
      </div>

      {/* Add Expense Form */}
      {showAdd && (
        <form onSubmit={handleAddExpense} className="bg-card border border-border rounded-xl p-4 md:p-5 space-y-3">
          <h3 className="font-display font-semibold text-foreground">New Expense</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)}
              className="h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono" />
            <select value={expCategory} onChange={(e) => setExpCategory(e.target.value)}
              className="h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary">
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="text" value={expDesc} onChange={(e) => setExpDesc(e.target.value)} placeholder="Description" maxLength={200}
              className="h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary placeholder:text-muted-foreground/40" />
            <div className="flex gap-2">
              <input type="number" min={1} value={expAmount || ""} onChange={(e) => setExpAmount(Number(e.target.value) || 0)} placeholder="Amount (₹)"
                className="flex-1 h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono placeholder:text-muted-foreground/40" />
              <button type="submit" disabled={adding}
                className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1">
                {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Expenses */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-border">
          <h3 className="font-display font-semibold text-foreground">Expenses</h3>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-elevated/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">No expenses recorded yet</td></tr>
              ) : (
                expenses.map((e, i) => (
                  <tr key={e.id} className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${i % 2 === 1 ? "bg-elevated/20" : ""}`}>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{e.date}</td>
                    <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-accent text-foreground">{e.category}</span></td>
                    <td className="px-4 py-3 text-foreground">{e.description}</td>
                    <td className="px-4 py-3 text-right font-mono text-destructive">{formatCurrency(e.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-border/50">
          {expenses.length === 0 ? (
            <p className="px-4 py-8 text-center text-muted-foreground text-sm">No expenses recorded yet</p>
          ) : (
            expenses.map((e) => (
              <div key={e.id} className="p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-foreground">{e.category}</span>
                  <span className="font-mono text-sm text-destructive font-medium">{formatCurrency(e.amount)}</span>
                </div>
                <p className="text-sm text-foreground">{e.description}</p>
                <p className="text-[10px] font-mono text-muted-foreground">{e.date}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
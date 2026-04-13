import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { normalizePhone, formatPhoneDisplay } from "@/utils/phone";
import type { AppUser, SchedulePool } from "@/types";
import { Plus, Loader2, Trash2, Users, Clock, CalendarClock, ChevronDown, ChevronUp, Pause, Play, Hash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { format, subDays, startOfDay } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";

function extractPhoneDigits(raw: string): string | null {
  let cleaned = raw.replace(/[\s\-().]/g, "");
  if (!cleaned) return null;
  if (cleaned.startsWith("+91")) cleaned = cleaned.slice(3);
  else if (cleaned.startsWith("91") && cleaned.length > 10) cleaned = cleaned.slice(2);
  if (cleaned.startsWith("0") && cleaned.length > 10) cleaned = cleaned.slice(1);
  if (/^\d{10}$/.test(cleaned)) return cleaned;
  return null;
}

function parseMultipleNumbers(text: string): string[] {
  const parts = text.split(/[\n,\t]+/).map((s) => s.trim()).filter(Boolean);
  const results: string[] = [];
  for (const part of parts) {
    const num = extractPhoneDigits(part);
    if (num && !results.includes(num)) results.push(num);
  }
  return results;
}

export default function ScheduleNumbers() {
  const currentUser = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const isMobile = useIsMobile();

  const [members, setMembers] = useState<AppUser[]>([]);
  const [pools, setPools] = useState<SchedulePool[]>([]);
  const [loading, setLoading] = useState(true);

  // Create pool form
  const [showCreate, setShowCreate] = useState(false);
  const [poolName, setPoolName] = useState("");
  const [selectedMember, setSelectedMember] = useState("");
  const [dailyLimit, setDailyLimit] = useState(50);
  const [minCompletion, setMinCompletion] = useState(75);
  const [bulkText, setBulkText] = useState("");
  const [parsedNumbers, setParsedNumbers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Expanded pool
  const [expandedPool, setExpandedPool] = useState<string | null>(null);

  // Fetch members & pools
  useEffect(() => {
    const fetchMembers = async () => {
      const snap = await getDocs(collection(db, "users"));
      const allUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
      setMembers(allUsers.filter((u) => u.role === "sales_member" && u.createdBy === currentUser?.uid));
    };
    fetchMembers();

    const unsub = onSnapshot(collection(db, "schedulePools"), (snap) => {
      const allPools = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as SchedulePool))
        .filter((p) => p.createdBy === currentUser?.uid);
      allPools.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setPools(allPools);
      setLoading(false);
    });

    return () => unsub();
  }, [currentUser?.uid]);

  const handleParse = useCallback(() => {
    const numbers = parseMultipleNumbers(bulkText);
    setParsedNumbers((prev) => {
      const combined = [...prev];
      numbers.forEach((n) => { if (!combined.includes(n)) combined.push(n); });
      return combined;
    });
    setBulkText("");
  }, [bulkText]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poolName.trim() || !selectedMember || parsedNumbers.length === 0) {
      toast({ title: "Error", description: "Fill all fields and add at least one number.", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const normalizedNumbers = parsedNumbers.map((n) => normalizePhone(n));
      await addDoc(collection(db, "schedulePools"), {
        poolName: poolName.trim(),
        createdBy: currentUser?.uid || "",
        assignedTo: selectedMember,
        numbers: normalizedNumbers,
        releasedCount: 0,
        dailyLimit,
        minCompletionPercent: minCompletion,
        isActive: true,
        createdAt: serverTimestamp(),
      } satisfies Omit<SchedulePool, "id">);

      toast({ title: "Pool Created", description: `${parsedNumbers.length} numbers scheduled for distribution.` });
      setPoolName("");
      setSelectedMember("");
      setDailyLimit(50);
      setMinCompletion(75);
      setBulkText("");
      setParsedNumbers([]);
      setShowCreate(false);
    } catch {
      toast({ title: "Error", description: "Failed to create schedule pool.", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (pool: SchedulePool) => {
    try {
      await updateDoc(doc(db, "schedulePools", pool.id), { isActive: !pool.isActive });
      toast({ title: pool.isActive ? "Paused" : "Activated", description: `Pool "${pool.poolName}" ${pool.isActive ? "paused" : "activated"}.` });
    } catch {
      toast({ title: "Error", description: "Failed to update pool.", variant: "destructive" });
    }
  };

  const handleDeletePool = async (pool: SchedulePool) => {
    const { confirmed } = await confirm({
      title: "Delete Pool",
      description: `Delete "${pool.poolName}"? Already released leads will remain. Only unreleased numbers are removed.`,
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, "schedulePools", pool.id));
      toast({ title: "Deleted", description: "Schedule pool removed." });
    } catch {
      toast({ title: "Error", description: "Failed to delete pool.", variant: "destructive" });
    }
  };

  const getMemberName = (uid: string) => members.find((m) => m.uid === uid)?.name || "Unknown";

  // Manual release for a pool (admin can trigger immediately)
  const handleManualRelease = async (pool: SchedulePool) => {
    const remaining = pool.numbers.length - pool.releasedCount;
    if (remaining <= 0) {
      toast({ title: "Done", description: "All numbers in this pool have been released." });
      return;
    }

    const memberId = pool.assignedTo;
    const todayStr = format(new Date(), "yyyy-MM-dd");

    // Check yesterday's completion
    const yesterdayStr = format(subDays(new Date(), 1), "yyyy-MM-dd");
    const leadsSnap = await getDocs(collection(db, "leads"));
    const memberLeads = leadsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as any)
      .filter((l: any) => l.assignedTo === memberId);

    // Yesterday's leads
    const yesterdayLeads = memberLeads.filter((l: any) => {
      const ts = l.createdAt?.seconds;
      if (!ts) return false;
      return format(new Date(ts * 1000), "yyyy-MM-dd") === yesterdayStr;
    });

    if (yesterdayLeads.length > 0) {
      const calledYesterday = yesterdayLeads.filter((l: any) => l.status !== "not_called").length;
      const completionPct = Math.round((calledYesterday / yesterdayLeads.length) * 100);
      if (completionPct < pool.minCompletionPercent) {
        toast({
          title: "Completion Too Low",
          description: `${getMemberName(memberId)} completed ${completionPct}% yesterday (min: ${pool.minCompletionPercent}%). Release blocked.`,
          variant: "destructive",
        });
        return;
      }
    }

    // Release the next batch
    const batchSize = Math.min(pool.dailyLimit, remaining);
    const nextNumbers = pool.numbers.slice(pool.releasedCount, pool.releasedCount + batchSize);

    // Get existing lead count for display names
    const existingCount = memberLeads.length;

    // Add as leads
    for (let i = 0; i < nextNumbers.length; i++) {
      await addDoc(collection(db, "leads"), {
        assignedTo: memberId,
        assignedBy: currentUser?.uid || "",
        phone: nextNumbers[i],
        displayName: `C${existingCount + i + 1}`,
        status: "not_called",
        notes: "",
        saleDone: false,
        lastUpdated: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
    }

    // Update pool
    await updateDoc(doc(db, "schedulePools", pool.id), {
      releasedCount: pool.releasedCount + batchSize,
      lastReleasedAt: serverTimestamp(),
      lastReleasedDate: todayStr,
    });

    toast({ title: "Released", description: `${batchSize} numbers released to ${getMemberName(memberId)}.` });
  };

  return (
    <div className="space-y-6">
      {ConfirmDialog}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold text-foreground">Schedule Numbers</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-1">
            Create number pools with daily release rules • {pools.length} pool{pools.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); setParsedNumbers([]); setBulkText(""); setPoolName(""); }}
          className="h-8 md:h-9 px-3 md:px-4 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-xs md:text-sm flex items-center gap-1.5 hover:bg-primary/90 transition-colors self-start sm:self-auto"
        >
          <Plus size={14} /> Create Pool
        </button>
      </div>

      {/* Create Pool Form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <form onSubmit={handleCreate} className="bg-card border border-border rounded-xl p-4 md:p-5 space-y-4">
              <h3 className="font-display font-semibold text-foreground text-sm">Create Schedule Pool</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Pool Name */}
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">Pool Name</label>
                  <input type="text" value={poolName} onChange={(e) => setPoolName(e.target.value)}
                    placeholder="e.g., Excel Batch 1"
                    className="w-full h-9 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />
                </div>

                {/* Assign To */}
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">Assign To Member</label>
                  <select value={selectedMember} onChange={(e) => setSelectedMember(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary">
                    <option value="">Select member...</option>
                    {members.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
                  </select>
                </div>

                {/* Daily Limit */}
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">Daily Limit / Member</label>
                  <input type="number" value={dailyLimit} onChange={(e) => setDailyLimit(Math.max(1, parseInt(e.target.value) || 1))}
                    min={1} max={1000}
                    className="w-full h-9 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />
                </div>

                {/* Min Completion */}
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">Min Completion % (yesterday)</label>
                  <input type="number" value={minCompletion} onChange={(e) => setMinCompletion(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                    min={0} max={100}
                    className="w-full h-9 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />
                  <p className="text-[10px] text-muted-foreground">Member must update {minCompletion}% of yesterday's leads before new numbers unlock</p>
                </div>
              </div>

              {/* Bulk Numbers Input */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-medium">Phone Numbers (paste bulk)</label>
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  rows={5}
                  placeholder={"9876543210\n+91 91234 56789\n8765432109, 7654321098"}
                  className="w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono placeholder:text-muted-foreground/40 resize-none"
                />
                <button type="button" onClick={handleParse} disabled={!bulkText.trim()}
                  className="h-8 px-3 rounded-lg bg-info/15 text-info text-xs font-semibold hover:bg-info/25 disabled:opacity-40 flex items-center gap-1.5 transition-colors">
                  <Plus size={12} /> Parse Numbers
                </button>
              </div>

              {/* Parsed Numbers Preview */}
              {parsedNumbers.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">{parsedNumbers.length} numbers parsed</span>
                    <button type="button" onClick={() => setParsedNumbers([])}
                      className="text-[10px] text-destructive hover:underline">Clear All</button>
                  </div>
                  <div className="border border-border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-elevated/40 border-b border-border">
                          <th className="text-left px-3 py-1.5 font-medium text-muted-foreground w-12">#</th>
                          <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Phone Number</th>
                          <th className="w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedNumbers.slice(0, 50).map((num, i) => (
                          <tr key={`${num}-${i}`} className="border-b border-border/40 hover:bg-accent/20">
                            <td className="px-3 py-1 text-muted-foreground tabular-nums">{i + 1}</td>
                            <td className="px-3 py-1 font-mono text-foreground">{formatPhoneDisplay(normalizePhone(num))}</td>
                            <td className="px-1 py-1">
                              <button type="button" onClick={() => setParsedNumbers((p) => p.filter((_, j) => j !== i))}
                                className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                                <Trash2 size={10} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {parsedNumbers.length > 50 && (
                          <tr><td colSpan={3} className="px-3 py-1.5 text-center text-[10px] text-muted-foreground">...and {parsedNumbers.length - 50} more</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button type="submit" disabled={creating || parsedNumbers.length === 0 || !poolName.trim() || !selectedMember}
                  className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
                  {creating ? <Loader2 size={13} className="animate-spin" /> : <CalendarClock size={13} />}
                  {creating ? "Creating..." : `Create Pool (${parsedNumbers.length} numbers)`}
                </button>
                <button type="button" onClick={() => setShowCreate(false)}
                  className="h-9 px-4 rounded-lg bg-accent text-foreground text-xs font-medium border border-border hover:bg-accent/80">
                  Cancel
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pools List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse space-y-2">
              <div className="h-5 bg-muted rounded w-40" />
              <div className="h-4 bg-muted rounded w-28" />
            </div>
          ))}
        </div>
      ) : pools.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <CalendarClock size={32} className="mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-muted-foreground text-sm">No schedule pools created yet</p>
          <p className="text-muted-foreground text-xs mt-1">Create a pool to automatically distribute numbers daily</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pools.map((pool) => {
            const remaining = pool.numbers.length - pool.releasedCount;
            const progress = pool.numbers.length > 0 ? Math.round((pool.releasedCount / pool.numbers.length) * 100) : 0;
            const isExpanded = expandedPool === pool.id;

            return (
              <div key={pool.id} className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Pool Header */}
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-accent/20 transition-colors"
                  onClick={() => setExpandedPool(isExpanded ? null : pool.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${pool.isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                      <Hash size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-display font-semibold text-foreground text-sm truncate">{pool.poolName}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${pool.isActive ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                          {pool.isActive ? "Active" : "Paused"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1"><Users size={10} /> {getMemberName(pool.assignedTo)}</span>
                        <span>•</span>
                        <span>{pool.releasedCount}/{pool.numbers.length} released</span>
                        <span>•</span>
                        <span>{pool.dailyLimit}/day</span>
                        <span>•</span>
                        <span>Min {pool.minCompletionPercent}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Progress */}
                    <div className="hidden sm:flex items-center gap-2">
                      <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${progress === 100 ? "bg-success" : "bg-primary"}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums w-8">{progress}%</span>
                    </div>
                    {isExpanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                  </div>
                </div>

                {/* Expanded Details */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                      <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                        {/* Stats */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div className="bg-background border border-border rounded-lg p-2.5">
                            <p className="text-[10px] text-muted-foreground">Total Numbers</p>
                            <p className="font-display font-bold text-foreground">{pool.numbers.length}</p>
                          </div>
                          <div className="bg-background border border-border rounded-lg p-2.5">
                            <p className="text-[10px] text-muted-foreground">Released</p>
                            <p className="font-display font-bold text-success">{pool.releasedCount}</p>
                          </div>
                          <div className="bg-background border border-border rounded-lg p-2.5">
                            <p className="text-[10px] text-muted-foreground">Remaining</p>
                            <p className="font-display font-bold text-warning">{remaining}</p>
                          </div>
                          <div className="bg-background border border-border rounded-lg p-2.5">
                            <p className="text-[10px] text-muted-foreground">Est. Days Left</p>
                            <p className="font-display font-bold text-info">{pool.dailyLimit > 0 ? Math.ceil(remaining / pool.dailyLimit) : "∞"}</p>
                          </div>
                        </div>

                        {/* Rules */}
                        <div className="bg-background border border-border rounded-lg p-3 space-y-1.5">
                          <p className="text-xs font-medium text-foreground">Rules</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs text-muted-foreground">
                            <span>📊 Daily Limit: <strong className="text-foreground">{pool.dailyLimit} numbers/day</strong></span>
                            <span>✅ Min Completion: <strong className="text-foreground">{pool.minCompletionPercent}%</strong></span>
                            <span>👤 Assigned to: <strong className="text-foreground">{getMemberName(pool.assignedTo)}</strong></span>
                            {pool.lastReleasedDate && (
                              <span>📅 Last Released: <strong className="text-foreground">{pool.lastReleasedDate}</strong></span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => handleManualRelease(pool)}
                            disabled={remaining <= 0}
                            className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                          >
                            <Play size={12} /> Release Next Batch ({Math.min(pool.dailyLimit, remaining)})
                          </button>
                          <button
                            onClick={() => handleToggleActive(pool)}
                            className={`h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-colors ${pool.isActive ? "border-warning/30 text-warning hover:bg-warning/10" : "border-success/30 text-success hover:bg-success/10"}`}
                          >
                            {pool.isActive ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Activate</>}
                          </button>
                          <button
                            onClick={() => handleDeletePool(pool)}
                            className="h-8 px-3 rounded-lg text-xs font-medium text-destructive border border-destructive/30 hover:bg-destructive/10 flex items-center gap-1.5 transition-colors"
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

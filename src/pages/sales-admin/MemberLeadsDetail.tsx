import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { collection, addDoc, updateDoc, doc, serverTimestamp, deleteDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { adminAssignNumber, transferLockOwnership } from "@/services/numberLock";
import { fetchTeamMembers, subscribeMemberLeads } from "@/services/teamLeads";
import { useAuthStore } from "@/store/authStore";
import { normalizePhone, formatPhoneDisplay, getWhatsAppUrl, getCallUrl } from "@/utils/phone";
import { formatCurrency } from "@/utils/formatters";
import { format, subDays, startOfDay } from "date-fns";
import type { AppUser, Lead, LeadStatus, SaleDetail } from "@/types";
import { ArrowLeft, Phone, Plus, Loader2, Search, Trash2, MessageCircle, StickyNote, ShoppingBag, X, Hash, List, Type, CheckSquare, Square, XCircle, CalendarClock, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useConfirm } from "@/hooks/useConfirm";
import { AnimatePresence, motion } from "framer-motion";
import DashboardDayPicker from "@/components/dashboard/DayPicker";
import NumberTimelineButton from "@/components/sales/NumberTimelineButton";

/**
 * Extract 10-digit Indian phone numbers from raw input.
 * Handles formats: +91 9876543210, 9876543210, 98765 43210, 98 7654 3210, etc.
 * Returns cleaned 10-digit numbers (without +91).
 */
function extractPhoneDigits(raw: string): string | null {
  // Strip all whitespace, dashes, parens, dots
  let cleaned = raw.replace(/[\s\-().]/g, "");
  if (!cleaned) return null;
  // Remove +91 or 91 prefix if present
  if (cleaned.startsWith("+91")) cleaned = cleaned.slice(3);
  else if (cleaned.startsWith("91") && cleaned.length > 10) cleaned = cleaned.slice(2);
  // Remove leading 0
  if (cleaned.startsWith("0") && cleaned.length > 10) cleaned = cleaned.slice(1);
  // Must be exactly 10 digits
  if (/^\d{10}$/.test(cleaned)) return cleaned;
  return null;
}

/**
 * Parse pasted text that may contain multiple numbers (multi-line or comma-separated).
 */
function parseMultipleNumbers(text: string): string[] {
  // Split by newlines, commas, tabs, or multiple spaces
  const parts = text.split(/[\n,\t]+/).map((s) => s.trim()).filter(Boolean);
  const results: string[] = [];
  for (const part of parts) {
    const num = extractPhoneDigits(part);
    if (num) results.push(num);
  }
  return results;
}

const STATUS_OPTIONS: { value: LeadStatus; label: string; color: string }[] = [
  { value: "not_called", label: "Not Called", color: "bg-muted text-muted-foreground" },
  { value: "answered", label: "Answered", color: "bg-success/15 text-success" },
  { value: "not_answered", label: "No Answer", color: "bg-warning/15 text-warning" },
  { value: "call_later", label: "Call Later", color: "bg-info/15 text-info" },
  { value: "not_interested", label: "Not Interested", color: "bg-destructive/15 text-destructive" },
];

function getDayLabel(date: Date): string {
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const diffMs = today.getTime() - target.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

function getSaleDate(item: SaleDetail, lead: Lead): string | null {
  const ts = (item.submittedAt as any)?.seconds;
  if (ts) return format(new Date(ts * 1000), "yyyy-MM-dd");
  if (lead.createdAt?.seconds) return format(new Date(lead.createdAt.seconds * 1000), "yyyy-MM-dd");
  return null;
}

type SaleRow = { lead: Lead; item: SaleDetail; itemIndex: number };

export default function MemberLeadsDetail() {
  const { memberId } = useParams<{ memberId: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const isMobile = useIsMobile();

  const [member, setMember] = useState<AppUser | null>(null);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [viewTab, setViewTab] = useState<"leads" | "sales">("leads");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedNotes, setExpandedNotes] = useState<string | null>(null);
  const [dayFilter, setDayFilter] = useState<string>("0");

  const [salesSearch, setSalesSearch] = useState("");
  const [salesDay, setSalesDay] = useState<string>("all");
  const [salesStatus, setSalesStatus] = useState<string>("all");

  // Add leads form
  const [showAdd, setShowAdd] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [numberInput, setNumberInput] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [numberQueue, setNumberQueue] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const numberInputRef = useRef<HTMLInputElement>(null);
  const shouldRefocusRef = useRef(false);

  // Schedule mode state
  const [addMode, setAddMode] = useState<"one" | "bulk" | "schedule">("one");
  const [schedPoolName, setSchedPoolName] = useState("");
  const [schedDailyLimit, setSchedDailyLimit] = useState(50);
  const [schedMinCompletion, setSchedMinCompletion] = useState(75);
  const [schedBulkText, setSchedBulkText] = useState("");
  const [schedNumbers, setSchedNumbers] = useState<string[]>([]);
  const [creatingPool, setCreatingPool] = useState(false);

  // Multi-select delete / reassign
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  // Render leads 10 at a time ("Show 10 more") — resets when the visible set changes.
  const [visibleLeadCount, setVisibleLeadCount] = useState(10);
  useEffect(() => { setVisibleLeadCount(10); }, [dayFilter, statusFilter, search, selectedDate, viewTab]);
  const [reassignTarget, setReassignTarget] = useState("");
  const [bulkReassigning, setBulkReassigning] = useState(false);

  // Auto-refocus input after queue changes (React re-render safe)
  useEffect(() => {
    if (shouldRefocusRef.current && numberInputRef.current && showAdd && !bulkMode) {
      numberInputRef.current.focus();
      shouldRefocusRef.current = false;
    }
  }, [numberQueue.length, showAdd, bulkMode]);

  // Add a single number to the queue (deduped)
  const addNumberToQueue = useCallback((digits: string) => {
    setNumberQueue((prev) => {
      if (prev.includes(digits)) return prev; // skip duplicates
      return [...prev, digits];
    });
    shouldRefocusRef.current = true;
  }, []);

  // Handle paste event on the input — detect numbers instantly
  const handleNumberPaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (!pasted.trim()) return;
    const numbers = parseMultipleNumbers(pasted);
    if (numbers.length > 0) {
      e.preventDefault();
      numbers.forEach((n) => addNumberToQueue(n));
      setNumberInput("");
    }
  }, [addNumberToQueue]);

  // Handle typing + Enter
  const handleNumberKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const digits = extractPhoneDigits(numberInput);
      if (digits) {
        addNumberToQueue(digits);
        setNumberInput("");
      }
    }
  }, [numberInput, addNumberToQueue]);

  // Also auto-detect when input reaches a valid number length
  const handleNumberChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNumberInput(val);
    // Auto-add if valid 10+ digits detected after typing
    const digits = extractPhoneDigits(val);
    if (digits && val.replace(/\D/g, "").length >= 10) {
      addNumberToQueue(digits);
      setNumberInput("");
    }
  }, [addNumberToQueue]);

  const removeFromQueue = useCallback((index: number) => {
    setNumberQueue((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Parse bulk textarea and add all valid numbers to queue
  const handleBulkParse = useCallback(() => {
    const numbers = parseMultipleNumbers(bulkText);
    if (numbers.length > 0) {
      numbers.forEach((n) => addNumberToQueue(n));
      setBulkText("");
    }
  }, [bulkText, addNumberToQueue]);

  // Schedule mode: parse numbers
  const handleSchedParse = useCallback(() => {
    const numbers = parseMultipleNumbers(schedBulkText);
    setSchedNumbers((prev) => {
      const combined = [...prev];
      numbers.forEach((n) => { if (!combined.includes(n)) combined.push(n); });
      return combined;
    });
    setSchedBulkText("");
  }, [schedBulkText]);

  // Schedule mode: create pool
  const handleCreateSchedulePool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedPoolName.trim() || schedNumbers.length === 0 || !memberId) {
      toast({ title: "Error", description: "Fill pool name and add at least one number.", variant: "destructive" });
      return;
    }
    setCreatingPool(true);
    try {
      const normalizedNumbers = schedNumbers.map((n) => normalizePhone(n));
      await addDoc(collection(db, "schedulePools"), {
        poolName: schedPoolName.trim(),
        createdBy: currentUser?.uid || "",
        assignedTo: memberId,
        numbers: normalizedNumbers,
        releasedCount: 0,
        dailyLimit: schedDailyLimit,
        minCompletionPercent: schedMinCompletion,
        isActive: true,
        createdAt: serverTimestamp(),
      });
      toast({ title: "Pool Created", description: `${schedNumbers.length} numbers scheduled. Go to Schedule Numbers to manage.` });
      setSchedPoolName(""); setSchedNumbers([]); setSchedBulkText(""); setSchedDailyLimit(50); setSchedMinCompletion(75);
      setShowAdd(false);
    } catch {
      toast({ title: "Error", description: "Failed to create schedule pool.", variant: "destructive" });
    } finally {
      setCreatingPool(false);
    }
  };

  // Fetch team members (one-time, scoped) + listen ONLY to this member's leads — quota-friendly.
  useEffect(() => {
    if (!memberId || !currentUser?.uid) return;

    // Team members for the reassign dropdown (scoped query, not the whole users collection)
    fetchTeamMembers(currentUser.uid).then((teamMembers) => {
      setMembers(teamMembers);
      setMember(teamMembers.find((u) => u.uid === memberId) || null);
    }).catch(() => {});

    // Real-time leads for this member only
    const unsub = subscribeMemberLeads(memberId, (memberLeads) => {
      memberLeads.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setLeads(memberLeads);
      setLoading(false);
    });
    return unsub;
  }, [memberId, currentUser?.uid]);

  // Search and status filters kept separate so the dropdown counts can ignore the
  // selected status (otherwise picking a status zeroes every other count).
  const matchesSearch = (l: Lead) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return l.phone.includes(q) || l.displayName?.toLowerCase().includes(q) || l.notes?.toLowerCase().includes(q) || l.realName?.toLowerCase().includes(q);
  };
  const matchesStatus = (l: Lead) => {
    if (statusFilter === "all") return true;
    const items = l.saleItems || (l.saleDetails ? [l.saleDetails] : []);
    if (statusFilter === "sale_done") return !!l.saleDone;
    if (statusFilter === "verification_pending") return items.some((item) => item.verificationStatus === "pending");
    if (statusFilter === "verified_sales") return items.some((item) => item.verificationStatus === "verified");
    return l.status === statusFilter;
  };
  const searchFiltered = leads.filter(matchesSearch);
  const filtered = searchFiltered.filter(matchesStatus);

  // Last 5 days
  const recentDays = useMemo(() => {
    const days: { date: Date; dateStr: string; label: string }[] = [];
    for (let i = 0; i < 5; i++) {
      const d = subDays(new Date(), i);
      days.push({ date: startOfDay(d), dateStr: format(d, "yyyy-MM-dd"), label: getDayLabel(d) });
    }
    return days;
  }, []);

  // Sale rows (for sales tab) — filtered by salesSearch + salesDay + salesStatus
  const allSaleRows: SaleRow[] = leads.flatMap((lead) => {
    const items = lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
    return items
      .filter((item) => {
        if (salesStatus !== "all") {
          if (item.verificationStatus !== salesStatus) return false;
        }
        if (salesDay !== "all") {
          const d = getSaleDate(item, lead);
          const dayDateStr = recentDays[parseInt(salesDay)]?.dateStr;
          if (!d || d !== dayDateStr) return false;
        }
        if (salesSearch) {
          const q = salesSearch.toLowerCase();
          const matchName = lead.displayName?.toLowerCase().includes(q);
          const matchPhone = lead.phone?.includes(q);
          const matchCat = item.category?.toLowerCase().includes(q);
          if (!matchName && !matchPhone && !matchCat) return false;
        }
        return true;
      })
      .map((item, idx) => ({ lead, item, itemIndex: idx }));
  });

  // Group leads by date
  const groupLeadsByDate = (memberLeads: Lead[]) => {
    const groups: Record<string, Lead[]> = {};
    memberLeads.forEach((l) => {
      const ts = l.createdAt?.seconds;
      if (!ts) return;
      const dateStr = format(new Date(ts * 1000), "yyyy-MM-dd");
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(l);
    });
    return groups;
  };

  // Calendar date indicators — performance per day
  const dateIndicators = useMemo(() => {
    const indicators: Record<string, "good" | "average" | "bad"> = {};
    const allGrouped = groupLeadsByDate(leads); // raw leads
    Object.entries(allGrouped).forEach(([dateStr, dayLeads]) => {
      const total = dayLeads.length;
      if (total === 0) return;
      const called = dayLeads.filter((l) => l.status !== "not_called").length;
      const pct = Math.round((called / total) * 100);
      if (pct >= 70) indicators[dateStr] = "good";
      else if (pct >= 40) indicators[dateStr] = "average";
      else indicators[dateStr] = "bad";
    });
    return indicators;
  }, [leads]);

  // Apply the active day window to any list — used for both display and (status-independent) counts
  const applyDayWindow = (src: Lead[]): Lead[] => {
    const groups = groupLeadsByDate(src);
    if (selectedDate) return groups[format(selectedDate, "yyyy-MM-dd")] || [];
    if (dayFilter === "all") return src;
    return groups[recentDays[parseInt(dayFilter)]?.dateStr] || [];
  };

  const activeDayLeads = applyDayWindow(filtered);           // displayed list
  const dayWindowLeads = applyDayWindow(searchFiltered);     // counts/stats — ignores the status filter

  // Stats from the day window (independent of the status filter)
  const calledLeads = dayWindowLeads.filter((l) => l.status !== "not_called").length;
  const saleDoneLeads = dayWindowLeads.filter((l) => l.saleDone).length;
  const activeSaleRows: SaleRow[] = dayWindowLeads.flatMap((lead) => {
    const items = lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
    return items.map((item, idx) => ({ lead, item, itemIndex: idx }));
  });
  const pendingVerification = activeSaleRows.filter((r) => r.item.verificationStatus === "pending");
  const verified = activeSaleRows.filter((r) => r.item.verificationStatus === "verified");
  const totalRevenue = verified.reduce((s, r) => s + (r.item.amount || 0), 0);

  // Status counts for dropdown — from the day window WITHOUT the status filter applied
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: dayWindowLeads.length };
    STATUS_OPTIONS.forEach((s) => { counts[s.value] = dayWindowLeads.filter((l) => l.status === s.value).length; });
    counts["verification_pending"] = activeSaleRows.filter((r) => r.item.verificationStatus === "pending").length;
    counts["verified_sales"] = activeSaleRows.filter((r) => r.item.verificationStatus === "verified").length;
    counts["sale_done"] = dayWindowLeads.filter((l) => l.saleDone).length;
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, search, selectedDate, dayFilter, recentDays]);

  // Handlers
  const handleBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numberQueue.length === 0 || !memberId) {
      toast({ title: "Error", description: "Add at least one phone number.", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const existingCount = leads.length;
      let added = 0;
      let takenOver = 0;
      const skipped: string[] = [];

      // Each number goes through the global number-lock, so a number already held by another
      // member inside its validity window (or sale-frozen) is refused instead of duplicated.
      for (let i = 0; i < numberQueue.length; i++) {
        const phone = normalizePhone(numberQueue[i]);
        const displayName = `C${existingCount + i + 1}`;
        try {
          const result = await adminAssignNumber({
            admin: { uid: currentUser?.uid || "", name: currentUser?.name || "Admin" },
            member: { uid: memberId, name: member?.name || "Member" },
            phone,
            displayName,
          });
          if (result.kind === "created" || result.kind === "takeover") {
            added++;
            if (result.kind === "takeover") takenOver++;
            await sendNotification({
              userId: memberId,
              type: "lead_assigned",
              title: "New Lead Assigned",
              message: `You have a new lead: ${displayName}`,
            });
          } else if (result.kind === "reserved") {
            skipped.push(`${numberQueue[i]} (with ${result.ownerName} until ${format(result.until, "dd MMM, h:mm a")})`);
          } else if (result.kind === "sale_frozen") {
            skipped.push(`${numberQueue[i]} (sold by ${result.saleByName}, frozen until ${format(result.until, "dd MMM")})`);
          } else {
            skipped.push(`${numberQueue[i]} (already with this member)`);
          }
        } catch {
          skipped.push(`${numberQueue[i]} (failed)`);
        }
      }

      setNumberQueue([]);
      setNumberInput("");
      setBulkText("");
      setShowAdd(false);
      const parts: string[] = [];
      if (added > 0) parts.push(`${added} assigned${takenOver > 0 ? ` (${takenOver} taken over after validity expiry)` : ""}`);
      if (skipped.length > 0) parts.push(`${skipped.length} skipped: ${skipped.slice(0, 3).join("; ")}${skipped.length > 3 ? "…" : ""}`);
      toast({
        title: added > 0 ? "Leads Added" : "Nothing added",
        description: parts.join(" · ") || "No numbers processed.",
        variant: added > 0 ? undefined : "destructive",
        duration: skipped.length > 0 ? 9000 : undefined,
      });
    } catch {
      toast({ title: "Error", description: "Failed to add leads.", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (leadId: string) => {
    const { confirmed } = await confirm({ title: "Delete Lead", description: "Delete this lead?", confirmText: "Delete", variant: "destructive" });
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, "leads", leadId));
      toast({ title: "Deleted", description: "Lead removed." });
    } catch {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
    }
  };

  const toggleSelectLead = useCallback((leadId: string) => {
    setSelectedLeads((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((leadsOnScreen: Lead[]) => {
    setSelectedLeads((prev) => {
      const allIds = leadsOnScreen.map((l) => l.id);
      const allSelected = allIds.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(allIds);
    });
  }, []);

  const handleBulkDelete = async () => {
    if (selectedLeads.size === 0) return;
    const { confirmed } = await confirm({
      title: "Delete Selected Leads",
      description: `Are you sure you want to delete ${selectedLeads.size} lead${selectedLeads.size > 1 ? "s" : ""}? This cannot be undone.`,
      confirmText: `Delete ${selectedLeads.size}`,
      variant: "destructive",
    });
    if (!confirmed) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedLeads);
      await Promise.all(ids.map((id) => deleteDoc(doc(db, "leads", id))));
      toast({ title: "Deleted", description: `${ids.length} lead${ids.length > 1 ? "s" : ""} removed.` });
      setSelectedLeads(new Set());
      setSelectMode(false);
    } catch {
      toast({ title: "Error", description: "Failed to delete some leads.", variant: "destructive" });
    } finally {
      setBulkDeleting(false);
    }
  };

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedLeads(new Set());
  }, []);

  const handleReassign = async (leadId: string, newMemberId: string) => {
    try {
      const target = members.find((m) => m.uid === newMemberId);
      const lead = leads.find((l) => l.id === leadId);
      await updateDoc(doc(db, "leads", leadId), { assignedTo: newMemberId, lastUpdated: serverTimestamp() });
      // Keep the number-lock pointing at the new holder so validity checks stay correct.
      if (lead?.phone && target) {
        try {
          await transferLockOwnership({ phone: lead.phone, leadId, newOwner: { uid: target.uid, name: target.name } });
        } catch { /* best-effort */ }
      }
    } catch {
      toast({ title: "Error", description: "Failed to reassign.", variant: "destructive" });
    }
  };

  // Quick-select every lead with the given status in the current day window (date filter applied)
  const selectByStatus = (status: "not_called" | "not_answered", label: string) => {
    const ids = activeDayLeads.filter((l) => l.status === status).map((l) => l.id);
    setSelectedLeads(new Set(ids));
    if (ids.length === 0) {
      toast({ title: `No ${label} leads`, description: `There are no ${label} leads in the current view.` });
    }
  };
  const selectNotCalled = () => selectByStatus("not_called", "not-called");
  const selectNotAnswered = () => selectByStatus("not_answered", "not-answered");

  const handleBulkReassign = async () => {
    if (selectedLeads.size === 0 || !reassignTarget) return;
    const target = members.find((m) => m.uid === reassignTarget);
    if (!target) return;
    const { confirmed } = await confirm({
      title: "Reassign Selected Leads",
      description: `Move ${selectedLeads.size} lead${selectedLeads.size > 1 ? "s" : ""} from ${member?.name || "this member"} to ${target.name}?`,
      confirmText: `Reassign ${selectedLeads.size}`,
    });
    if (!confirmed) return;
    setBulkReassigning(true);
    try {
      const ids = Array.from(selectedLeads);
      await Promise.all(ids.map(async (id) => {
        const lead = leads.find((l) => l.id === id);
        await updateDoc(doc(db, "leads", id), { assignedTo: reassignTarget, lastUpdated: serverTimestamp() });
        if (lead?.phone) {
          try {
            await transferLockOwnership({ phone: lead.phone, leadId: id, newOwner: { uid: target.uid, name: target.name } });
          } catch { /* best-effort */ }
        }
      }));
      await sendNotification({
        userId: target.uid,
        type: "lead_assigned",
        title: "Leads Reassigned to You",
        message: `${ids.length} lead${ids.length > 1 ? "s were" : " was"} reassigned to you from ${member?.name || "another member"}.`,
      });
      toast({ title: "Reassigned", description: `${ids.length} lead${ids.length > 1 ? "s" : ""} moved to ${target.name}.` });
      setSelectedLeads(new Set());
      setSelectMode(false);
      setReassignTarget("");
    } catch {
      toast({ title: "Error", description: "Failed to reassign some leads.", variant: "destructive" });
    } finally {
      setBulkReassigning(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-card border border-border rounded-xl animate-pulse" />)}
        </div>
        <div className="h-64 bg-card border border-border rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {ConfirmDialog}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 md:gap-3">
          <button onClick={() => navigate("/sales-admin/leads")}
            className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors shrink-0">
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-lg md:text-2xl font-bold text-foreground truncate">{member?.name || "Member"}</h1>
            <p className="text-muted-foreground text-xs md:text-sm mt-0.5">
              {selectedDate ? `Filtered: ${format(selectedDate, "dd/MM/yyyy")}` : "All history"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 pl-10 sm:pl-0">
          <DashboardDayPicker selectedDate={selectedDate} onSelect={setSelectedDate} dateIndicators={dateIndicators} />
          {selectedDate && (
            <button onClick={() => setSelectedDate(undefined)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Clear</button>
          )}
          <button
            onClick={() => { setNumberInput(""); setBulkText(""); setNumberQueue([]); setBulkMode(false); setAddMode("one"); setSchedNumbers([]); setSchedBulkText(""); setSchedPoolName(""); setShowAdd(!showAdd); }}
            className="h-8 md:h-9 px-3 md:px-4 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-xs md:text-sm flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
          >
            <Plus size={14} /> Add Leads
          </button>
        </div>
      </div>

      {/* Add Leads Form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={addMode === "schedule" ? handleCreateSchedulePool : handleBulkAdd} className="bg-card border border-border rounded-xl p-4 md:p-5 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-display font-semibold text-foreground text-sm">Add Leads for {member?.name}</h3>
                <div className="flex items-center gap-1 bg-accent/50 rounded-lg p-0.5">
                  <button type="button" onClick={() => { setBulkMode(false); setAddMode("one"); }}
                    className={`h-7 px-2.5 rounded-md text-[10px] font-medium flex items-center gap-1 transition-colors ${addMode === "one" ? "bg-card text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"}`}>
                    <Type size={11} /> One-by-One
                  </button>
                  <button type="button" onClick={() => { setBulkMode(true); setAddMode("bulk"); }}
                    className={`h-7 px-2.5 rounded-md text-[10px] font-medium flex items-center gap-1 transition-colors ${addMode === "bulk" ? "bg-card text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"}`}>
                    <List size={11} /> Bulk
                  </button>
                  <button type="button" onClick={() => { setAddMode("schedule"); }}
                    className={`h-7 px-2.5 rounded-md text-[10px] font-medium flex items-center gap-1 transition-colors ${addMode === "schedule" ? "bg-card text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"}`}>
                    <CalendarClock size={11} /> Schedule
                  </button>
                </div>
              </div>

              {addMode === "one" ? (
                /* ─── One-by-One Mode ─── */
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Paste a number → auto-adds with SNO → paste next. Supports: +91 98765 43210, 9876543210, etc.
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        ref={numberInputRef}
                        type="text"
                        value={numberInput}
                        onChange={handleNumberChange}
                        onPaste={handleNumberPaste}
                        onKeyDown={handleNumberKeyDown}
                        placeholder="Paste or type number here..."
                        autoFocus
                        className="w-full h-10 pl-9 pr-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono placeholder:text-muted-foreground/40"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                      {numberQueue.length} added
                    </span>
                  </div>
                </div>
              ) : addMode === "bulk" ? (
                /* ─── Bulk Mode ─── */
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Paste all numbers at once — one per line, comma-separated, or any format. Click "Parse Numbers" to preview.
                  </p>
                  <textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    rows={5}
                    placeholder={"9876543210\n+91 91234 56789\n8765432109, 7654321098\n98 7654 3210"}
                    autoFocus
                    className="w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono placeholder:text-muted-foreground/40 resize-none"
                  />
                  <button type="button" onClick={handleBulkParse} disabled={!bulkText.trim()}
                    className="h-8 px-3 rounded-lg bg-info/15 text-info text-xs font-semibold hover:bg-info/25 disabled:opacity-40 flex items-center gap-1.5 transition-colors">
                    <Plus size={12} /> Parse Numbers
                  </button>
                </div>
              ) : (
                /* ─── Schedule Mode ─── */
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Add numbers to a pool. They'll be released daily based on rules — member must complete yesterday's work first.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground font-medium">Pool Name</label>
                      <input type="text" value={schedPoolName} onChange={(e) => setSchedPoolName(e.target.value)}
                        placeholder="e.g., Excel Batch 1"
                        className="w-full h-9 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground font-medium">Daily Limit / Member</label>
                      <input type="number" value={schedDailyLimit} onChange={(e) => setSchedDailyLimit(Math.max(1, parseInt(e.target.value) || 1))}
                        min={1}
                        className="w-full h-9 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground font-medium">Min Completion % (yesterday)</label>
                      <input type="number" value={schedMinCompletion} onChange={(e) => setSchedMinCompletion(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                        min={0} max={100}
                        className="w-full h-9 px-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary" />
                    </div>
                  </div>
                  <textarea
                    value={schedBulkText}
                    onChange={(e) => setSchedBulkText(e.target.value)}
                    rows={4}
                    placeholder={"Paste phone numbers here (one per line, comma-separated, etc.)"}
                    className="w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary font-mono placeholder:text-muted-foreground/40 resize-none"
                  />
                  <button type="button" onClick={handleSchedParse} disabled={!schedBulkText.trim()}
                    className="h-8 px-3 rounded-lg bg-info/15 text-info text-xs font-semibold hover:bg-info/25 disabled:opacity-40 flex items-center gap-1.5 transition-colors">
                    <Plus size={12} /> Parse Numbers
                  </button>
                  {schedNumbers.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">{schedNumbers.length} numbers parsed</span>
                      <button type="button" onClick={() => setSchedNumbers([])} className="text-[10px] text-destructive hover:underline">Clear All</button>
                    </div>
                  )}
                </div>
              )}

              {/* Preview list with SNO (for one-by-one & bulk modes) */}
              {addMode !== "schedule" && numberQueue.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden max-h-52 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-elevated/40 border-b border-border">
                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground w-16">SNO</th>
                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Phone Number</th>
                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Display Name</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {numberQueue.map((num, i) => (
                        <tr key={`${num}-${i}`} className="border-b border-border/40 hover:bg-accent/20">
                          <td className="px-3 py-1.5 text-muted-foreground tabular-nums">{i + 1}</td>
                          <td className="px-3 py-1.5 font-mono text-foreground">
                            {formatPhoneDisplay(num)}
                          </td>
                          <td className="px-3 py-1.5 text-primary font-semibold">
                            C{leads.length + i + 1}
                          </td>
                          <td className="px-1 py-1.5">
                            <button type="button" onClick={() => removeFromQueue(i)}
                              className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                              <X size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex items-center gap-2">
                {addMode === "schedule" ? (
                  <button type="submit" disabled={creatingPool || schedNumbers.length === 0 || !schedPoolName.trim()}
                    className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
                    {creatingPool ? <Loader2 size={13} className="animate-spin" /> : <CalendarClock size={13} />}
                    {creatingPool ? "Creating..." : `Schedule ${schedNumbers.length} Number${schedNumbers.length !== 1 ? "s" : ""}`}
                  </button>
                ) : (
                  <>
                    <button type="submit" disabled={adding || numberQueue.length === 0}
                      className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
                      {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                      {adding ? "Adding..." : `Add ${numberQueue.length} Lead${numberQueue.length !== 1 ? "s" : ""}`}
                    </button>
                    {numberQueue.length > 0 && (
                      <button type="button" onClick={() => setNumberQueue([])}
                        className="h-9 px-3 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10 border border-destructive/20">
                        Clear All
                      </button>
                    )}
                  </>
                )}
                <button type="button" onClick={() => setShowAdd(false)}
                  className="h-9 px-4 rounded-lg bg-accent text-foreground text-xs font-medium border border-border hover:bg-accent/80">
                  Cancel
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
        {[
          { label: "Total Leads", value: activeDayLeads.length, color: "text-primary" },
          { label: "Called", value: calledLeads, color: "text-info" },
          { label: "Verif. Pending", value: pendingVerification.length, color: "text-warning" },
          { label: "Sale Done", value: saleDoneLeads, color: "text-success" },
          { label: "Revenue", value: formatCurrency(totalRevenue), color: "text-primary" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-2.5 md:p-4">
            <p className="text-[10px] md:text-xs text-muted-foreground">{s.label}</p>
            <p className={`font-display font-bold text-base md:text-xl ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* View Toggle */}
      <div className="flex gap-1.5">
        <button onClick={() => setViewTab("leads")}
          className={`h-8 md:h-9 px-3 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-colors ${viewTab === "leads" ? "bg-primary/15 text-primary border border-primary/30" : "bg-card border border-border text-muted-foreground hover:bg-accent"}`}>
          Leads ({filtered.length})
        </button>
        <button onClick={() => setViewTab("sales")}
          className={`h-8 md:h-9 px-3 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-colors ${viewTab === "sales" ? "bg-success/15 text-success border border-success/30" : "bg-card border border-border text-muted-foreground hover:bg-accent"}`}>
          Sales ({allSaleRows.length})
        </button>
      </div>

      {/* ─── LEADS TAB ─── */}
      {viewTab === "leads" && (
        <div className="space-y-4">
          {/* Multi-select action bar */}
          <AnimatePresence>
            {selectMode && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-2 bg-destructive/10 border border-destructive/30 rounded-xl px-3 py-2 md:px-4 md:py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckSquare size={16} className="text-destructive shrink-0" />
                      <span className="text-xs md:text-sm font-medium text-destructive truncate">
                        {selectedLeads.size} selected
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => toggleSelectAll(activeDayLeads)}
                        className="h-7 md:h-8 px-2 md:px-3 rounded-lg text-[10px] md:text-xs font-medium bg-card border border-border text-foreground hover:bg-accent transition-colors"
                      >
                        {activeDayLeads.length > 0 && activeDayLeads.every((l) => selectedLeads.has(l.id)) ? "Deselect All" : "Select All"}
                      </button>
                      <button
                        onClick={selectNotCalled}
                        className="h-7 md:h-8 px-2 md:px-3 rounded-lg text-[10px] md:text-xs font-medium bg-card border border-border text-foreground hover:bg-accent transition-colors"
                        title="Select every not-called lead in the current day/date view"
                      >
                        Select Not Called
                      </button>
                      <button
                        onClick={selectNotAnswered}
                        className="h-7 md:h-8 px-2 md:px-3 rounded-lg text-[10px] md:text-xs font-medium bg-card border border-border text-foreground hover:bg-accent transition-colors"
                        title="Select every not-answered lead in the current day/date view"
                      >
                        Select Not Answered
                      </button>
                      <button
                        onClick={handleBulkDelete}
                        disabled={selectedLeads.size === 0 || bulkDeleting}
                        className="h-7 md:h-8 px-2 md:px-3 rounded-lg text-[10px] md:text-xs font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 flex items-center gap-1 transition-colors"
                      >
                        {bulkDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        {bulkDeleting ? "Deleting..." : "Delete"}
                      </button>
                      <button
                        onClick={exitSelectMode}
                        className="h-7 md:h-8 w-7 md:w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent border border-border transition-colors"
                      >
                        <XCircle size={14} />
                      </button>
                    </div>
                  </div>
                  {/* Reassign selected leads to another member */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] md:text-xs text-muted-foreground">Reassign selected to:</span>
                    <select
                      value={reassignTarget}
                      onChange={(e) => setReassignTarget(e.target.value)}
                      className="h-7 md:h-8 px-2 rounded-lg bg-card border border-border text-foreground text-[10px] md:text-xs outline-none focus:border-primary"
                    >
                      <option value="">Select member…</option>
                      {members.filter((m) => m.uid !== memberId).map((m) => (
                        <option key={m.uid} value={m.uid}>{m.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleBulkReassign}
                      disabled={selectedLeads.size === 0 || !reassignTarget || bulkReassigning}
                      className="h-7 md:h-8 px-2 md:px-3 rounded-lg text-[10px] md:text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1 transition-colors"
                    >
                      {bulkReassigning ? <Loader2 size={12} className="animate-spin" /> : <ArrowLeft size={12} className="rotate-180" />}
                      {bulkReassigning ? "Moving..." : `Reassign (${selectedLeads.size})`}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Search + Filter */}
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..."
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-card border border-border text-foreground text-sm outline-none focus:border-primary" />
            </div>
            {!selectMode && (
              <button
                onClick={() => setSelectMode(true)}
                className="h-9 px-3 rounded-lg bg-card border border-border text-foreground text-xs md:text-sm font-medium flex items-center gap-1.5 hover:bg-accent transition-colors"
              >
                <CheckSquare size={14} /> Select
              </button>
            )}
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-3 rounded-lg bg-card border border-border text-foreground text-xs md:text-sm outline-none focus:border-primary">
              <option value="all">All Status ({statusCounts.all})</option>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label} ({statusCounts[s.value] || 0})</option>)}
              <option disabled className="text-muted-foreground">──────────</option>
              <option value="verification_pending">Verif. Pending ({statusCounts.verification_pending || 0})</option>
              <option value="verified_sales">Verified Sales ({statusCounts.verified_sales || 0})</option>
              <option value="sale_done">Sale Done ({statusCounts.sale_done || 0})</option>
            </select>
            {!selectedDate && (
              <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}
                className="h-9 px-3 rounded-lg bg-card border border-border text-foreground text-xs md:text-sm outline-none focus:border-primary">
                {recentDays.map((d, i) => (
                  <option key={d.dateStr} value={String(i)}>{d.label} ({format(d.date, "dd/MM")})</option>
                ))}
                <option value="all">All Days</option>
              </select>
            )}
          </div>

          {/* Day header + lead count */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {selectedDate
                ? `Showing leads from ${format(selectedDate, "dd/MM/yyyy")}`
                : dayFilter === "all"
                  ? "Showing all leads"
                  : `Showing leads from ${recentDays[parseInt(dayFilter)]?.label}`
              }
            </p>
            <span className={`text-xs px-2 py-0.5 rounded-full ${activeDayLeads.length > 0 ? "bg-info/15 text-info" : "bg-muted text-muted-foreground"}`}>
              {activeDayLeads.length} leads
            </span>
          </div>

          {activeDayLeads.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <Phone size={32} className="mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-muted-foreground text-sm">No leads found{search || statusFilter !== "all" ? " for these filters" : selectedDate ? " on this date" : " for this day"}</p>
            </div>
          ) : (
            <>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Rendered 10 at a time to keep large lists (500+) fast; select-all / select-not-called still cover the FULL day list */}
                <LeadsList leads={activeDayLeads.slice(0, visibleLeadCount)} members={members} isMobile={isMobile} expandedNotes={expandedNotes} setExpandedNotes={setExpandedNotes} onDelete={handleDelete} onReassign={handleReassign} selectMode={selectMode} selectedLeads={selectedLeads} onToggleSelect={toggleSelectLead} onToggleSelectAll={() => toggleSelectAll(activeDayLeads)} />
              </div>
              {activeDayLeads.length > visibleLeadCount && (
                <button
                  onClick={() => setVisibleLeadCount((c) => c + 10)}
                  className="w-full h-10 mt-3 rounded-xl bg-card border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors flex items-center justify-center gap-2"
                >
                  <ChevronDown size={15} /> Show 10 more ({activeDayLeads.length - visibleLeadCount} remaining)
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── SALES TAB ─── */}
      {viewTab === "sales" && (
        <div className="space-y-4">
          {/* Sales filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={salesSearch}
                onChange={(e) => setSalesSearch(e.target.value)}
                placeholder="Search by name, phone, category..."
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
              />
            </div>
            <select
              value={salesStatus}
              onChange={(e) => setSalesStatus(e.target.value)}
              className="h-9 px-3 rounded-lg bg-card border border-border text-foreground text-xs md:text-sm outline-none focus:border-primary"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
            </select>
            <select
              value={salesDay}
              onChange={(e) => setSalesDay(e.target.value)}
              className="h-9 px-3 rounded-lg bg-card border border-border text-foreground text-xs md:text-sm outline-none focus:border-primary"
            >
              {recentDays.map((d, i) => (
                <option key={d.dateStr} value={String(i)}>{d.label} ({format(d.date, "dd/MM")})</option>
              ))}
              <option value="all">All Days</option>
            </select>
          </div>
          {allSaleRows.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <ShoppingBag size={32} className="mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-muted-foreground text-sm">No sales found{salesSearch || salesDay !== "all" || salesStatus !== "all" ? " for these filters" : ""}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allSaleRows.map((r, key) => (
                <div key={`${r.lead.id}-${r.itemIndex}-${key}`} className="bg-card border border-border rounded-xl p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-foreground">{r.lead.displayName || r.lead.phone}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-muted-foreground font-mono">{formatPhoneDisplay(r.lead.phone)}</span>
                        <a href={getCallUrl(r.lead.phone)} className="text-success hover:bg-success/10 w-5 h-5 rounded flex items-center justify-center"><Phone size={10} /></a>
                        <a href={getWhatsAppUrl(r.lead.phone)} target="_blank" rel="noopener noreferrer" className="text-success hover:bg-success/10 w-5 h-5 rounded flex items-center justify-center"><MessageCircle size={10} /></a>
                      </div>
                    </div>
                    <p className="font-display font-bold text-primary text-lg">{formatCurrency(r.item.amount || 0)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Category:</span>{" "}
                      <span className="text-foreground font-medium capitalize">{r.item.category?.replace(/_/g, " ") || "—"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Package:</span>{" "}
                      <span className="text-foreground font-medium">{r.item.packageKey || "—"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status:</span>{" "}
                      <span className={`font-medium ${r.item.verificationStatus === "verified" ? "text-success" : r.item.verificationStatus === "rejected" ? "text-destructive" : "text-warning"}`}>
                        {r.item.verificationStatus === "verified" ? "Verified ✓" : r.item.verificationStatus === "rejected" ? "Rejected ✗" : "Pending ⏳"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Lead Status:</span>{" "}
                      <span className="text-foreground font-medium capitalize">{r.lead.status?.replace(/_/g, " ")}</span>
                    </div>
                    {(r.item.submittedAt as any)?.seconds && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Submitted:</span>{" "}
                        <span className="text-foreground font-mono text-[10px]">
                          {format(new Date((r.item.submittedAt as any).seconds * 1000), "dd MMM yyyy, hh:mm a")}
                        </span>
                      </div>
                    )}
                    {r.item.verificationStatus === "verified" && (r.item.verifiedAt as any)?.seconds && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Approved:</span>{" "}
                        <span className="text-success font-mono text-[10px]">
                          {format(new Date((r.item.verifiedAt as any).seconds * 1000), "dd MMM yyyy, hh:mm a")}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Leads List (shared for day sections & calendar view) ─── */
function LeadsList({ leads, members, isMobile, expandedNotes, setExpandedNotes, onDelete, onReassign, selectMode, selectedLeads, onToggleSelect, onToggleSelectAll }: {
  leads: Lead[];
  members: AppUser[];
  isMobile: boolean;
  expandedNotes: string | null;
  setExpandedNotes: (id: string | null) => void;
  onDelete: (id: string) => void;
  onReassign: (id: string, uid: string) => void;
  selectMode: boolean;
  selectedLeads: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
}) {
  if (isMobile) {
    return (
      <div className="p-3 space-y-2">
        {leads.map((l) => {
          const statusInfo = STATUS_OPTIONS.find((s) => s.value === l.status);
          const isSelected = selectedLeads.has(l.id);
          return (
            <div
              key={l.id}
              onClick={selectMode ? () => onToggleSelect(l.id) : undefined}
              className={`bg-background border rounded-xl p-3 space-y-2.5 transition-colors ${l.saleDone ? "border-success/40" : "border-border"} ${selectMode ? "cursor-pointer" : ""} ${isSelected ? "border-primary bg-primary/5" : ""}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2">
                  {selectMode && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleSelect(l.id); }}
                      className="mt-0.5 shrink-0"
                    >
                      {isSelected
                        ? <CheckSquare size={16} className="text-primary" />
                        : <Square size={16} className="text-muted-foreground" />
                      }
                    </button>
                  )}
                  <div>
                    <p className="font-display font-bold text-foreground text-sm">{l.displayName || l.phone}</p>
                    {l.realName && <p className="text-[10px] text-muted-foreground">{l.realName}</p>}
                    <div className="flex items-center gap-1 mt-0.5">
                      <p className="text-[10px] font-mono text-muted-foreground">{formatPhoneDisplay(l.phone)}</p>
                      <NumberTimelineButton phone={l.phone} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusInfo?.color}`}>{statusInfo?.label}</span>
                  {l.saleDone && (() => {
                    const items = l.saleItems || (l.saleDetails ? [l.saleDetails] : []);
                    const total = items.reduce((s, i) => s + (i.amount || 0), 0);
                    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success">₹{total.toLocaleString()}</span>;
                  })()}
                </div>
              </div>

              <div className="flex gap-1.5">
                <a href={getCallUrl(l.phone)} className="flex-1 h-7 rounded-lg bg-info/10 text-info text-[10px] font-medium flex items-center justify-center gap-1 hover:bg-info/20">
                  <Phone size={11} /> Call
                </a>
                <a href={getWhatsAppUrl(l.phone)} target="_blank" rel="noopener noreferrer"
                  className="flex-1 h-7 rounded-lg bg-success/10 text-success text-[10px] font-medium flex items-center justify-center gap-1 hover:bg-success/20">
                  <MessageCircle size={11} /> WA
                </a>
                <button onClick={() => setExpandedNotes(expandedNotes === l.id ? null : l.id)}
                  className="flex-1 h-7 rounded-lg bg-accent text-foreground text-[10px] font-medium flex items-center justify-center gap-1 border border-border">
                  <StickyNote size={11} /> Notes
                </button>
                <button onClick={() => onDelete(l.id)}
                  className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-border shrink-0">
                  <Trash2 size={11} />
                </button>
              </div>

              {/* Reassign */}
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-muted-foreground">Reassign:</span>
                <select value={l.assignedTo} onChange={(e) => onReassign(l.id, e.target.value)}
                  className="h-6 px-1.5 rounded bg-card border border-border text-foreground text-[10px] outline-none focus:border-primary flex-1">
                  {members.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
                </select>
              </div>

              <AnimatePresence>
                {expandedNotes === l.id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="bg-card border border-border rounded-lg p-2.5">
                      <p className="text-[10px] text-muted-foreground whitespace-pre-wrap">{l.notes || "No notes yet"}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    );
  }

  // Desktop table
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-elevated/30">
            {selectMode && (
              <th className="text-center px-3 py-2.5 w-10">
                <button onClick={onToggleSelectAll} className="mx-auto">
                  {leads.length > 0 && leads.every((l) => selectedLeads.has(l.id))
                    ? <CheckSquare size={15} className="text-primary" />
                    : <Square size={15} className="text-muted-foreground" />
                  }
                </button>
              </th>
            )}
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Lead</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Phone</th>
            <th className="text-center px-4 py-2.5 font-medium text-muted-foreground text-xs">Status</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Notes</th>
            <th className="text-center px-4 py-2.5 font-medium text-muted-foreground text-xs">Sale</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Last Activity</th>
            <th className="text-center px-4 py-2.5 font-medium text-muted-foreground text-xs">Reassign</th>
            <th className="text-center px-4 py-2.5 font-medium text-muted-foreground text-xs">Actions</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l, i) => {
            const statusInfo = STATUS_OPTIONS.find((s) => s.value === l.status);
            return (
              <tr
                key={l.id}
                onClick={selectMode ? () => onToggleSelect(l.id) : undefined}
                className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${i % 2 === 1 ? "bg-elevated/20" : ""} ${selectMode ? "cursor-pointer" : ""} ${selectedLeads.has(l.id) ? "bg-primary/5" : ""}`}
              >
                {selectMode && (
                  <td className="px-3 py-3 text-center">
                    <button onClick={(e) => { e.stopPropagation(); onToggleSelect(l.id); }}>
                      {selectedLeads.has(l.id)
                        ? <CheckSquare size={15} className="text-primary" />
                        : <Square size={15} className="text-muted-foreground" />
                      }
                    </button>
                  </td>
                )}
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground text-xs">{l.displayName || l.phone}</p>
                  {l.realName && <p className="text-[10px] text-muted-foreground">{l.realName}</p>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs text-muted-foreground">{formatPhoneDisplay(l.phone)}</span>
                    <a href={getCallUrl(l.phone)} className="w-5 h-5 rounded flex items-center justify-center text-success hover:bg-success/10" title="Call"><Phone size={11} /></a>
                    <a href={getWhatsAppUrl(l.phone)} target="_blank" rel="noopener noreferrer" className="w-5 h-5 rounded flex items-center justify-center text-success hover:bg-success/10" title="WhatsApp"><MessageCircle size={11} /></a>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusInfo?.color || ""}`}>
                    {statusInfo?.label || l.status}
                  </span>
                </td>
                <td className="px-4 py-3 max-w-[200px]">
                  <p className="text-[10px] text-muted-foreground whitespace-pre-wrap break-words line-clamp-2">{l.notes || "—"}</p>
                </td>
                <td className="px-4 py-3 text-center">
                  {l.saleDone ? (() => {
                    const items = l.saleItems || (l.saleDetails ? [l.saleDetails] : []);
                    const total = items.reduce((s, i) => s + (i.amount || 0), 0);
                    return (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success">
                        ₹{total.toLocaleString()} ({items.length})
                      </span>
                    );
                  })() : (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {l.lastUpdated?.seconds ? (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {new Date(l.lastUpdated.seconds * 1000).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      {" "}
                      {new Date(l.lastUpdated.seconds * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}
                    </span>
                  ) : <span className="text-[10px] text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  <select value={l.assignedTo} onChange={(e) => onReassign(l.id, e.target.value)}
                    className="h-6 px-1.5 rounded bg-background border border-border text-foreground text-[10px] outline-none focus:border-primary">
                    {members.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => onDelete(l.id)}
                    className="w-6 h-6 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

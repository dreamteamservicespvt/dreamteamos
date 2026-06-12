import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import type { AppUser, Lead, NumberLock } from "@/types";
import { Search, Users, ChevronRight, Phone, MessageCircle, Snowflake, ShieldOff, Trash2, AlertTriangle, Loader2, Lock, UserCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { useNow } from "@/hooks/useNow";
import { normalizePhone, formatPhoneDisplay, getCallUrl, getWhatsAppUrl } from "@/utils/phone";
import { formatCurrency, formatDuration } from "@/utils/formatters";
import { fetchNumberLock, applySaleFreeze, adminReleaseLock, buildLeadFreezeFields, clearedLeadFreezeFields } from "@/services/numberLock";
import { format } from "date-fns";

type TimestampLike = { toMillis?: () => number; seconds?: number } | null | undefined;
function tsToMs(ts: TimestampLike): number {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  return 0;
}

const STATUS_LABELS: Record<string, string> = {
  not_called: "Not Called",
  answered: "Answered",
  not_answered: "Not Answered",
  call_later: "Call Later",
  not_interested: "Not Interested",
};

export default function LeadsManagement() {
  const currentUser = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [members, setMembers] = useState<AppUser[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchMembers = async () => {
      const usersSnap = await getDocs(collection(db, "users"));
      const allUsers = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
      const myMembers = allUsers.filter((u) => u.role === "sales_member" && u.createdBy === currentUser?.uid);
      setMembers(myMembers);
      return myMembers;
    };

    let unsub: (() => void) | undefined;

    fetchMembers().then((myMembers) => {
      const leadsRef = collection(db, "leads");
      unsub = onSnapshot(leadsRef, (snap) => {
        const memberIds = myMembers.map((m) => m.uid);
        const allLeads = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Lead))
          .filter((l) => memberIds.includes(l.assignedTo) || l.assignedBy === currentUser?.uid);
        setLeads(allLeads);
        setLoading(false);
      });
    });

    return () => { unsub?.(); };
  }, [currentUser?.uid]);

  const getLeadsForMember = (uid: string) => leads.filter((l) => l.assignedTo === uid);

  // A "number search" is any query with 4+ digits — switches the view to the number-lookup panel.
  const searchDigits = search.replace(/[^0-9]/g, "");
  const isNumberSearch = searchDigits.length >= 4;

  const filteredMembers = members.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl md:text-2xl font-bold text-foreground">Leads Management</h1>
        <p className="text-muted-foreground text-xs md:text-sm mt-1">
          Click a member to manage their leads, or search a phone number to find & manage it • {leads.length} total leads
        </p>
      </div>

      {/* Search — members or a phone number */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members or a phone number..."
          className="w-full h-9 pl-9 pr-3 rounded-lg bg-card border border-border text-foreground text-sm outline-none focus:border-primary" />
      </div>

      {/* ── Number lookup mode ── */}
      {isNumberSearch ? (
        <NumberLookup
          query={search}
          leads={leads}
          members={members}
          admin={currentUser!}
          confirm={confirm}
          toast={toast}
        />
      ) : loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse space-y-2">
              <div className="h-5 bg-muted rounded w-32" />
              <div className="h-4 bg-muted rounded w-24" />
            </div>
          ))}
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Users size={32} className="mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-muted-foreground text-sm">{search ? "No members match your search" : "No team members found"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMembers.map((member) => {
            const memberLeads = getLeadsForMember(member.uid);
            const salesCount = memberLeads.filter((l) => l.saleDone).length;
            const calledCount = memberLeads.filter((l) => l.status !== "not_called").length;

            return (
              <button
                key={member.uid}
                onClick={() => navigate(`/sales-admin/leads/${member.uid}`)}
                className="w-full bg-card border border-border rounded-xl p-4 flex items-center justify-between hover:bg-accent/30 hover:border-primary/30 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-primary/15 flex items-center justify-center font-display font-bold text-primary text-sm md:text-base shrink-0">
                    {member.name?.charAt(0) || "?"}
                  </div>
                  <div className="text-left">
                    <p className="font-display font-semibold text-foreground">{member.name}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs">
                    <span className="px-1.5 md:px-2 py-0.5 rounded-full bg-info/15 text-info">{memberLeads.length} leads</span>
                    <span className="px-1.5 md:px-2 py-0.5 rounded-full bg-warning/15 text-warning hidden sm:inline-flex">{calledCount} called</span>
                    <span className="px-1.5 md:px-2 py-0.5 rounded-full bg-success/15 text-success">{salesCount} sales</span>
                  </div>
                  <ChevronRight size={18} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {ConfirmDialog}
    </div>
  );
}

/* ─── Number Lookup ─── */

type ConfirmFn = ReturnType<typeof useConfirm>["confirm"];
type ToastFn = ReturnType<typeof useToast>["toast"];

function NumberLookup({
  query,
  leads,
  members,
  admin,
  confirm,
  toast,
}: {
  query: string;
  leads: Lead[];
  members: AppUser[];
  admin: AppUser;
  confirm: ConfirmFn;
  toast: ToastFn;
}) {
  const now = useNow(1000);
  const digits = query.replace(/[^0-9]/g, "");

  const memberName = (uid: string) => members.find((m) => m.uid === uid)?.name || "Unknown / other team";

  // Group every matching lead by its normalized number.
  const groups = useMemo(() => {
    const matched = leads.filter((l) => (l.phone || "").replace(/[^0-9]/g, "").includes(digits));
    const map = new Map<string, Lead[]>();
    matched.forEach((l) => {
      const np = normalizePhone(l.phone);
      if (!map.has(np)) map.set(np, []);
      map.get(np)!.push(l);
    });
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [leads, digits]);

  if (digits.length < 4) {
    return <p className="text-xs text-muted-foreground">Type at least 4 digits to look up a number.</p>;
  }
  if (groups.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-12 text-center">
        <Search size={32} className="mx-auto text-muted-foreground/30 mb-2" />
        <p className="text-muted-foreground text-sm">No leads found for "{query}" in your team.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {groups.length} number{groups.length > 1 ? "s" : ""} matching "{query}"
      </p>
      {groups.map(([phone, holders]) => (
        <NumberGroupCard
          key={phone}
          phone={phone}
          holders={holders}
          members={members}
          admin={admin}
          now={now}
          memberName={memberName}
          confirm={confirm}
          toast={toast}
        />
      ))}
    </div>
  );
}

function NumberGroupCard({
  phone,
  holders,
  members,
  admin,
  now,
  memberName,
  confirm,
  toast,
}: {
  phone: string;
  holders: Lead[];
  members: AppUser[];
  admin: AppUser;
  now: number;
  memberName: (uid: string) => string;
  confirm: ConfirmFn;
  toast: ToastFn;
}) {
  const [lock, setLock] = useState<NumberLock | null>(null);
  const [loadingLock, setLoadingLock] = useState(true);

  const reloadLock = async () => {
    setLoadingLock(true);
    try {
      setLock(await fetchNumberLock(phone));
    } catch {
      setLock(null);
    } finally {
      setLoadingLock(false);
    }
  };
  useEffect(() => {
    reloadLock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  const isDuplicate = holders.length > 1;
  const lockSaleUntil = tsToMs(lock?.saleFrozenUntil);
  const lockSaleFrozen = !!lock?.saleFrozen && lockSaleUntil > now;
  const reserveMs = tsToMs(lock?.reserveExpiresAt);

  return (
    <div className={`bg-card border rounded-xl p-4 space-y-3 ${isDuplicate ? "border-destructive/40" : "border-border"}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono font-semibold text-foreground text-sm md:text-base">{formatPhoneDisplay(phone)}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <a href={getCallUrl(phone)} className="w-6 h-6 rounded flex items-center justify-center text-info hover:bg-info/10 transition-colors" title="Call"><Phone size={12} /></a>
            <a href={getWhatsAppUrl(phone)} target="_blank" rel="noopener noreferrer" className="w-6 h-6 rounded flex items-center justify-center text-success hover:bg-success/10 transition-colors" title="WhatsApp"><MessageCircle size={12} /></a>
            <span className="text-[10px] text-muted-foreground">{holders.length} holder{holders.length > 1 ? "s" : ""}</span>
          </div>
        </div>
        {isDuplicate && (
          <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-destructive/15 text-destructive">
            <AlertTriangle size={11} /> Duplicate · {holders.length} members
          </span>
        )}
      </div>

      {/* Lock / ownership summary */}
      <div className="rounded-md bg-elevated/40 border border-border p-2 text-[11px] space-y-0.5">
        {loadingLock ? (
          <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 size={11} className="animate-spin" /> Loading lock…</span>
        ) : lock ? (
          <>
            <div className="flex items-center gap-1.5 text-foreground"><UserCheck size={11} className="text-info" /> Lock owner: <b>{lock.ownerName}</b></div>
            {lockSaleFrozen ? (
              <div className="flex items-center gap-1.5 text-success"><Snowflake size={11} /> Sale-frozen · {formatDuration(lockSaleUntil - now)} left{lock.saleByName ? ` · by ${lock.saleByName}` : ""}</div>
            ) : reserveMs > now ? (
              <div className="flex items-center gap-1.5 text-warning"><Lock size={11} /> Reserved (24h validity) until {format(new Date(reserveMs), "dd MMM, hh:mm a")}</div>
            ) : (
              <div className="text-muted-foreground">Validity over — claimable by anyone</div>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">No lock record (older admin-added number — no reservation/freeze).</span>
        )}
      </div>

      {/* Holders */}
      <div className="space-y-2">
        {holders.map((h) => (
          <HolderRow
            key={h.id}
            lead={h}
            members={members}
            admin={admin}
            now={now}
            memberName={memberName}
            confirm={confirm}
            toast={toast}
            onChanged={reloadLock}
          />
        ))}
      </div>
    </div>
  );
}

function HolderRow({
  lead,
  members,
  admin,
  now,
  memberName,
  confirm,
  toast,
  onChanged,
}: {
  lead: Lead;
  members: AppUser[];
  admin: AppUser;
  now: number;
  memberName: (uid: string) => string;
  confirm: ConfirmFn;
  toast: ToastFn;
  onChanged: () => void;
}) {
  const [days, setDays] = useState(lead.saleFrozenDays || 1);
  const [busy, setBusy] = useState<null | "reassign" | "freeze" | "release" | "delete">(null);

  const items = lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
  const saleTotal = items.reduce((s, i) => s + (i.amount || 0), 0);
  const saleFrozenMs = tsToMs(lead.saleFrozenUntil);
  const isSaleFrozen = !!lead.saleFrozen && saleFrozenMs > now;
  const takenOver = !!lead.frozen;

  const reassign = async (newMemberId: string) => {
    if (!newMemberId || newMemberId === lead.assignedTo) return;
    setBusy("reassign");
    try {
      await updateDoc(doc(db, "leads", lead.id), { assignedTo: newMemberId, assignedBy: admin.uid, lastUpdated: serverTimestamp() });
      toast({ title: "Reassigned", description: `Moved to ${memberName(newMemberId)}.` });
    } catch {
      toast({ title: "Error", description: "Failed to reassign.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const freeze = async () => {
    setBusy("freeze");
    try {
      await applySaleFreeze({ user: { uid: admin.uid, name: admin.name }, phone: lead.phone, days, leadId: lead.id });
      await updateDoc(doc(db, "leads", lead.id), { ...buildLeadFreezeFields(days, admin.name), lastUpdated: serverTimestamp() });
      toast({ title: isSaleFrozen ? "Freeze updated" : "Number frozen", description: `Frozen for ${days} day${days > 1 ? "s" : ""}.` });
      onChanged();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to freeze.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const release = async () => {
    setBusy("release");
    try {
      await adminReleaseLock({ admin: { uid: admin.uid, name: admin.name }, phone: lead.phone });
      const updates: Record<string, any> = { ...clearedLeadFreezeFields(), lastUpdated: serverTimestamp() };
      // If this lead was also frozen by a takeover / duplicate rule, un-freeze it too.
      if (takenOver) { updates.frozen = false; updates.frozenReason = null; updates.takenOverBy = null; }
      await updateDoc(doc(db, "leads", lead.id), updates);
      toast({ title: "Released", description: "This number is unfrozen and claimable again." });
      onChanged();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to release.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const del = async () => {
    const { confirmed } = await confirm({
      title: "Delete lead",
      description: `Delete ${memberName(lead.assignedTo)}'s lead for this number? This cannot be undone.`,
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!confirmed) return;
    setBusy("delete");
    try {
      await deleteDoc(doc(db, "leads", lead.id));
      toast({ title: "Deleted", description: "Lead removed." });
    } catch {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-border p-2.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground text-sm">{memberName(lead.assignedTo)}</p>
          <p className="text-[10px] text-muted-foreground truncate">{lead.displayName || "—"}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1 max-w-[55%]">
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{STATUS_LABELS[lead.status] || lead.status}</span>
          {lead.saleDone && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-success/15 text-success">Sale ✓ {saleTotal ? formatCurrency(saleTotal) : ""}</span>}
          {takenOver && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-warning/15 text-warning inline-flex items-center gap-1"><Lock size={9} /> {lead.frozenReason === "duplicate_resolved" ? "Dup-frozen" : "Taken over"}</span>}
          {isSaleFrozen && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-success/15 text-success inline-flex items-center gap-1"><Snowflake size={9} /> {formatDuration(saleFrozenMs - now)}</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value=""
          disabled={busy !== null}
          onChange={(e) => reassign(e.target.value)}
          className="h-7 px-2 rounded-md bg-card border border-border text-foreground text-[11px] outline-none focus:border-primary disabled:opacity-50"
          title="Reassign to another member"
        >
          <option value="">Reassign…</option>
          {members.filter((m) => m.uid !== lead.assignedTo).map((m) => (
            <option key={m.uid} value={m.uid}>{m.name}</option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-7 px-1.5 rounded-md bg-card border border-border text-foreground text-[11px] outline-none focus:border-primary"
            title="Freeze days"
          >
            {[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{d}d</option>)}
          </select>
          <button onClick={freeze} disabled={busy !== null} className="h-7 px-2 rounded-md bg-success/10 text-success text-[11px] font-medium hover:bg-success/20 disabled:opacity-50 transition-colors inline-flex items-center gap-1">
            {busy === "freeze" ? <Loader2 size={11} className="animate-spin" /> : <Snowflake size={11} />} {isSaleFrozen ? "Extend" : "Freeze"}
          </button>
        </div>

        {(isSaleFrozen || takenOver) && (
          <button onClick={release} disabled={busy !== null} className="h-7 px-2 rounded-md bg-warning/10 text-warning text-[11px] font-medium hover:bg-warning/20 disabled:opacity-50 transition-colors inline-flex items-center gap-1">
            {busy === "release" ? <Loader2 size={11} className="animate-spin" /> : <ShieldOff size={11} />} Release
          </button>
        )}

        <button onClick={del} disabled={busy !== null} className="h-7 px-2 rounded-md bg-destructive/10 text-destructive text-[11px] font-medium hover:bg-destructive/20 disabled:opacity-50 transition-colors inline-flex items-center gap-1 ml-auto">
          {busy === "delete" ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Delete
        </button>
      </div>
    </div>
  );
}

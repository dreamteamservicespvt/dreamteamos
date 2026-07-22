import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ClipboardList, Plus, CheckCircle2, Loader2,
  Search, ChevronRight, X, Users, History, Copy, Check, MessageCircle, Sparkles
} from 'lucide-react';
import { getWhatsAppUrl, normalizePhone } from '@/utils/phone';
import { collection, addDoc, serverTimestamp, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { sendNotification, notifyTechTeamLeaders } from '@/services/notifications';
import { useAuthStore } from '@/store/authStore';
import { useFirestoreCollection } from '@/hooks/useFirestore';
import {
  DURATIONS, END_CREDITS_SECONDS,
  getClipCount, hasPoster, durationForClips, normalizeClipCount, priceForClips,
} from '@/utils/assignmentDuration';
import { formatCurrency, formatDate, formatTime } from '@/utils/formatters';
import { format } from 'date-fns';
import type { WorkAssignment, AppUser, DailyCheckin } from '@/types';
import { AttireType, ModelGender, ATTIRE_OPTIONS_BY_GENDER } from '@/types/aiPlatform';
import { verifyAssignments, awaitingVerification } from '@/services/workVerify';

/**
 * Work Assign — the control centre for work that still needs doing: search the team's live
 * workload, assign new work, and approve what has been delivered. Reporting and the full
 * assignment history live on the Work Done & Reports page (pages/shared/WorkReports).
 */

// Human-readable labels for each attire option (mirrors AIPlatformApp's ATTIRE_LABELS so the
// requirement the admin sets here reads identically wherever it's shown).
const ATTIRE_LABELS: Record<AttireType, string> = {
  [AttireType.PROFESSIONAL]: 'Professional (Formal Suit)',
  [AttireType.TRADITIONAL]: 'Traditional (Designer Saree)',
  [AttireType.SHIRT_PANT]: 'Professional (In-shirt & Pant)',
  [AttireType.CUSTOM]: 'Custom',
};

const ASSIGNMENT_LANGUAGE_OPTIONS = ['Telugu', 'English', 'Hindi', 'Kannada', 'Custom'] as const;

function generateAccessCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// Simple sequential ID: W001, P002, C003
function generateSimpleId(category: string, existingAssignments: WorkAssignment[]): string {
  const prefix = category === 'wishes' ? 'W' : category === 'promotional' ? 'P' : 'C';
  const sameCategory = existingAssignments.filter(a => a.uniqueId?.startsWith(prefix));
  const maxNum = sameCategory.reduce((max, a) => {
    const num = parseInt(a.uniqueId?.slice(1) || '0');
    return isNaN(num) ? max : Math.max(max, num);
  }, 0);
  return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
}

export default function WorkAssign() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: allUsers, loading: usersLoading } = useFirestoreCollection<AppUser>('users');
  const { data: assignments, loading: assignmentsLoading } = useFirestoreCollection<WorkAssignment>('work_assignments');
  const techMembers = useMemo(() => allUsers.filter(u => u.role === 'tech_member' && u.isActive), [allUsers]);

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  /** Duration entered as a free clip count instead of a standard package. */
  const [customDuration, setCustomDuration] = useState(false);
  const [customClips, setCustomClips] = useState(3);
  const [workloadSearch, setWorkloadSearch] = useState('');
  const [todayCheckins, setTodayCheckins] = useState<Map<string, DailyCheckin>>(new Map());
  const [verifying, setVerifying] = useState(false);
  const [verifyDialog, setVerifyDialog] = useState<{ mode: 'single' | 'all'; items: WorkAssignment[] } | null>(null);

  // Listen for today's check-ins
  useEffect(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const unsub = onSnapshot(
      query(collection(db, "daily_checkins"), where("date", "==", todayStr)),
      (snap) => {
        const map = new Map<string, DailyCheckin>();
        snap.docs.forEach((d) => {
          const ci = { id: d.id, ...d.data() } as DailyCheckin;
          map.set(ci.memberId, ci);
        });
        setTodayCheckins(map);
      }
    );
    return unsub;
  }, []);

  // Form state — no more end credits or manual clip count
  const [form, setForm] = useState({
    assignedTo: '',
    category: 'promotional' as 'wishes' | 'promotional' | 'cinematic',
    duration: '16s',
    pricePerUnit: 499,
    clientName: '',
    businessName: '',
    businessWhatsapp: '',
    modelGender: ModelGender.FEMALE as ModelGender,
    attireType: AttireType.TRADITIONAL as AttireType,
    customAttire: '',
    aspectRatio: '9:16' as '9:16' | '16:9',
    language: 'Telugu' as string,
    customLanguage: '',
  });
  const [copiedBusiness, setCopiedBusiness] = useState<string | null>(null);
  /** Requirements message to copy/send on WhatsApp, shown right after Create Assignment succeeds. */
  const [waReq, setWaReq] = useState<{ member: AppUser; message: string } | null>(null);
  const [waReqCopied, setWaReqCopied] = useState(false);

  // Auto-open form with pre-selected member from query param
  useEffect(() => {
    const memberUid = searchParams.get('member');
    if (memberUid && techMembers.length > 0) {
      const member = techMembers.find(m => m.uid === memberUid);
      if (member) {
        setForm(prev => ({ ...prev, assignedTo: memberUid }));
        setMemberSearch(member.name);
        setShowForm(true);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('member');
        setSearchParams(nextParams, { replace: true });
      }
    }
  }, [searchParams, techMembers]);

  // Auto-update price when category/duration changes
  const updateField = (field: string, value: any) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'category') {
        const durations = DURATIONS[value as string];
        // A custom clip count survives a category switch — only the price is re-derived.
        if (!customDuration) next.duration = durations[0];
        next.pricePerUnit = priceForClips(value as string, getClipCount(next.duration));
      }
      if (field === 'duration') {
        next.pricePerUnit = priceForClips(next.category, getClipCount(value as string));
      }
      return next;
    });
  };

  /** Switches the Duration dropdown to a free clip count, or back to the standard packages. */
  const setCustomDurationMode = (enabled: boolean) => {
    setCustomDuration(enabled);
    const duration = enabled ? durationForClips(customClips) : DURATIONS[form.category][0];
    setForm(prev => ({ ...prev, duration, pricePerUnit: priceForClips(prev.category, getClipCount(duration)) }));
  };

  const updateCustomClips = (clips: number) => {
    const safe = normalizeClipCount(clips);
    setCustomClips(safe);
    setForm(prev => ({
      ...prev,
      duration: durationForClips(safe),
      pricePerUnit: priceForClips(prev.category, safe),
    }));
  };

  const clipCount = getClipCount(form.duration);
  const totalPrice = form.pricePerUnit;

  const filteredMembers = useMemo(() => {
    const qRaw = memberSearch.trim();
    if (!qRaw) return techMembers;
    const q = qRaw.toLowerCase();
    const qDigits = qRaw.replace(/\D/g, '');
    return techMembers.filter(m => {
      if (m.name.toLowerCase().includes(q)) return true;
      if (qDigits && m.phone) {
        const pd = normalizePhone(m.phone).replace(/\D/g, '');
        if (pd.includes(qDigits) || qDigits.includes(pd)) return true;
      }
      return false;
    });
  }, [techMembers, memberSearch]);

  const resolvedLanguage = () => (form.language === 'Custom' ? (form.customLanguage.trim() || 'Custom') : form.language);

  const handleCreate = async () => {
    if (!user || !form.assignedTo) return;
    setSubmitting(true);
    try {
      const uniqueId = generateSimpleId(form.category, assignments);
      const accessCode = generateAccessCode();
      const today = format(new Date(), 'yyyy-MM-dd');
      const clips = getClipCount(form.duration);
      const language = resolvedLanguage();
      const attireLabel = form.attireType === AttireType.CUSTOM && form.customAttire.trim() ? form.customAttire.trim() : ATTIRE_LABELS[form.attireType];

      await addDoc(collection(db, 'work_assignments'), {
        assignedTo: form.assignedTo,
        assignedBy: user.uid,
        assignedAt: serverTimestamp(),
        assignedAtIso: new Date().toISOString(),
        category: form.category,
        clipCount: clips,
        includesEndCredits: false,
        duration: form.duration,
        pricePerUnit: form.pricePerUnit,
        totalPrice: form.pricePerUnit,
        uniqueId,
        accessCode,
        businessName: form.businessName.trim(),
        clientName: form.businessName.trim(),
        ...(form.businessWhatsapp.trim() ? { businessWhatsapp: normalizePhone(form.businessWhatsapp.trim()) } : {}),
        displayTitle: `${form.category.charAt(0).toUpperCase() + form.category.slice(1)} - ${uniqueId}`,
        status: 'assigned',
        sessions: [],
        totalDurationSeconds: 0,
        date: today,
        modelGender: form.modelGender,
        attireType: form.attireType,
        ...(form.attireType === AttireType.CUSTOM && form.customAttire.trim() ? { customAttire: form.customAttire.trim() } : {}),
        aspectRatio: form.aspectRatio,
        language,
      });

      // Send notification to the assignee
      await sendNotification({
        userId: form.assignedTo,
        type: 'work_assigned',
        title: 'New Work Assigned',
        message: `You have been assigned a new ${form.category} work (${clips} clips, ${form.duration}). Access code: ${accessCode}`,
        link: '/tech/my-work',
      });

      // Keep the tech team leader(s) informed of new work on their team.
      await notifyTechTeamLeaders({
        teamAdminUid: user.uid,
        excludeUserId: form.assignedTo,
        type: 'work_assigned',
        title: 'New Team Work Assigned',
        message: `${getMemberName(form.assignedTo)} was assigned a new ${form.category} work (${clips} clips, ${form.duration}).`,
        link: `/team-leader/work-assign/${form.assignedTo}`,
      });

      // Build the WhatsApp-ready requirements message — every ad spec + configuration the
      // member needs, in one copy-paste-able, attention-grabbing block — and surface it for
      // the admin to send. No internal assignment ID or price — the member doesn't need either.
      const assignedMember = techMembers.find(m => m.uid === form.assignedTo);
      const message = [
        `🎬✨ *NEW AD ASSIGNMENT* ✨🎬`,
        ``,
        form.businessName.trim() ? `🏢 *Business:* ${form.businessName.trim()}` : null,
        `🎯 *Category:* ${form.category.charAt(0).toUpperCase() + form.category.slice(1)}`,
        `⏱️ *Duration:* ${form.duration} (${clips} clips${hasPoster(form.duration) ? ' + Poster' : ''} + ${END_CREDITS_SECONDS}s EC)`,
        ``,
        `📋 *AD SPECIFICATION*`,
        `👤 *Model:* ${form.modelGender === ModelGender.MALE ? 'Male' : 'Female'}`,
        `👔 *Attire:* ${attireLabel}`,
        `📐 *Ratio:* ${form.aspectRatio}`,
        `🗣️ *Language:* ${language}`,
        ``,
        `🔑 *Access Code:* ${accessCode}`,
        ``,
        `🚀 Let's create something amazing — good luck! 🔥`,
      ].filter((line): line is string => line !== null).join('\n');

      if (assignedMember) setWaReq({ member: assignedMember, message });

      setShowForm(false);
      setForm({
        assignedTo: '', category: 'promotional', duration: '16s', pricePerUnit: 499, clientName: '', businessName: '', businessWhatsapp: '',
        modelGender: ModelGender.FEMALE, attireType: AttireType.TRADITIONAL, customAttire: '', aspectRatio: '9:16', language: 'Telugu', customLanguage: '',
      });
      setCustomDuration(false);
      setMemberSearch('');
    } catch (error) {
      console.error('Failed to create assignment:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmVerify = async () => {
    if (!verifyDialog?.items.length || !user) return;
    setVerifying(true);
    try {
      await verifyAssignments(verifyDialog.items, user.uid, getMemberName);
      setVerifyDialog(null);
    } finally {
      setVerifying(false);
    }
  };

  const getMemberName = (uid: string) => allUsers.find(u => u.uid === uid)?.name || 'Unknown';

  /**
   * Live work only. This page is the control centre for what still needs doing — verified work
   * has left the queue and belongs to Work Done & Reports.
   */
  const activeAssignments = useMemo(
    () => assignments.filter(a => a.status !== 'verified'),
    [assignments]
  );

  /** Delivered work waiting on approval — the "approve work" queue. */
  const pendingApproval = useMemo(() => awaitingVerification(assignments), [assignments]);

  // Active work grouped by member, most recently assigned team first
  const memberWorkload = useMemo(() => {
    return techMembers
      .map(member => ({ member, assignments: activeAssignments.filter(a => a.assignedTo === member.uid) }))
      .filter(entry => entry.assignments.length > 0)
      .sort((a, b) => {
        const latest = (items: WorkAssignment[]) => Math.max(...items.map(x => x.assignedAt?.seconds || 0));
        return latest(b.assignments) - latest(a.assignments);
      });
  }, [activeAssignments, techMembers]);

  /**
   * The page's one search box: matches a member by name or phone, or any of their live work by
   * business name, title, ad ID, or the business's WhatsApp number.
   */
  const filteredWorkload = useMemo(() => {
    const rawQ = workloadSearch.trim();
    if (!rawQ) return memberWorkload;

    const q = rawQ.toLowerCase();
    const queryDigits = rawQ.replace(/\D/g, '');
    const digitsMatch = (value?: string | null) => {
      if (!queryDigits || !value) return false;
      const d = normalizePhone(value).replace(/\D/g, '');
      return d.includes(queryDigits) || queryDigits.includes(d);
    };

    return memberWorkload.filter(({ member, assignments: mAsgn }) => {
      if (member.name?.toLowerCase().includes(q) || digitsMatch(member.phone)) return true;
      return mAsgn.some(a =>
        (a.businessName || a.clientName || '').toLowerCase().includes(q) ||
        (a.displayTitle || '').toLowerCase().includes(q) ||
        (a.uniqueId || '').toLowerCase().includes(q) ||
        digitsMatch(a.businessWhatsapp)
      );
    });
  }, [memberWorkload, workloadSearch]);

  const statusColors: Record<string, string> = {
    assigned: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    in_progress: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    verified: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    editing: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  };

  const getAssignedStamp = (assignment: WorkAssignment) => {
    const ts = assignment.assignedAt as any;
    const assignedDate = ts?.toDate?.()
      || (typeof ts?.seconds === 'number' ? new Date(ts.seconds * 1000) : undefined)
      || (assignment.assignedAtIso ? new Date(assignment.assignedAtIso) : undefined)
      || (assignment.date ? new Date(`${assignment.date}T00:00:00`) : undefined);
    if (!assignedDate || Number.isNaN(assignedDate.getTime())) return assignment.date || '—';
    return `${formatDate(assignedDate)} ${formatTime(assignedDate)}`;
  };

  const getAdName = (assignment: WorkAssignment) => {
    return assignment.businessName || assignment.clientName || assignment.displayTitle;
  };

  if (assignmentsLoading || usersLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Verify Dialog */}
      {verifyDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !verifying && setVerifyDialog(null)}>
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  {verifyDialog.mode === 'all' ? `Verify All (${verifyDialog.items.length})` : 'Verify Assignment'}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Review member, ad name, price, and date/time before confirming verification.
                </p>
              </div>
              <button
                onClick={() => setVerifyDialog(null)}
                disabled={verifying}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/50 text-[11px] md:text-xs font-medium text-muted-foreground">
                <span className="col-span-3">Member Name</span>
                <span className="col-span-4">Ad Name</span>
                <span className="col-span-2">Price</span>
                <span className="col-span-3">Time & Date</span>
              </div>
              <div className="max-h-[45vh] overflow-y-auto divide-y divide-border">
                {verifyDialog.items.map(item => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 px-3 py-2.5 text-xs md:text-sm text-foreground">
                    <span className="col-span-3 truncate" title={getMemberName(item.assignedTo)}>{getMemberName(item.assignedTo)}</span>
                    <span className="col-span-4 truncate" title={getAdName(item)}>{getAdName(item)}</span>
                    <span className="col-span-2 font-medium text-primary">{formatCurrency(item.totalPrice)}</span>
                    <span className="col-span-3 text-muted-foreground">{getAssignedStamp(item)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between mt-4">
              <p className="text-xs md:text-sm text-muted-foreground">
                Total items: <span className="font-semibold text-foreground">{verifyDialog.items.length}</span>
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setVerifyDialog(null)}
                  disabled={verifying}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmVerify}
                  disabled={verifying}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>{verifying ? 'Verifying...' : 'Confirm Verify'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp requirements — shown right after Create Assignment succeeds */}
      {waReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setWaReq(null)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <MessageCircle className="w-4 h-4 text-emerald-500" />
              <span className="font-semibold text-foreground">Share ad requirements</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Assignment created for <b>{waReq.member.name}</b>. Copy or send this requirements message so they generate exactly what you configured.
            </p>
            <textarea
              value={waReq.message}
              onChange={(e) => setWaReq({ ...waReq, message: e.target.value })}
              rows={9}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground font-mono leading-relaxed resize-y mb-3"
            />
            {!waReq.member.phone && (
              <p className="text-[11px] rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 px-3 py-2 mb-3">
                This member has no phone number saved — you can still copy the message.
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={() => setWaReq(null)}
                className="flex-1 py-2 rounded-lg text-sm font-medium border border-border bg-background hover:bg-accent text-foreground">
                Done
              </button>
              <button
                onClick={() => { navigator.clipboard.writeText(waReq.message); setWaReqCopied(true); setTimeout(() => setWaReqCopied(false), 2000); }}
                className="flex-1 py-2 rounded-lg text-sm font-semibold border border-border bg-background hover:bg-accent text-foreground inline-flex items-center justify-center gap-1.5">
                {waReqCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />} {waReqCopied ? 'Copied' : 'Copy'}
              </button>
              <button
                disabled={!waReq.member.phone}
                onClick={() => { window.open(getWhatsAppUrl(waReq.member.phone, waReq.message), "_blank"); setWaReq(null); }}
                className="flex-[1.4] py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 inline-flex items-center justify-center gap-1.5">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-accent/20 p-4 md:p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
            <Sparkles className="w-3 h-3" />
            Assignment control center
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Work Assignments</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">Assign, track and verify AI ad generation work</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex h-10 items-center justify-center space-x-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 w-full sm:w-auto">
          <Plus className="w-4 h-4" /><span>{showForm ? 'Cancel' : 'New Assignment'}</span>
        </button>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-card border rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold text-lg mb-4 text-card-foreground">Create New Assignment</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Member */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Assign To</label>
              <div className="relative">
                <input type="text" placeholder="Search member..." value={memberSearch}
                  onChange={(e) => { setMemberSearch(e.target.value); if (form.assignedTo) updateField('assignedTo', ''); }}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none" />
                {form.assignedTo && (
                  <div className="mt-1 text-xs text-green-500">✓ {techMembers.find(m => m.uid === form.assignedTo)?.name}</div>
                )}
                {!form.assignedTo && memberSearch && filteredMembers.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {filteredMembers.map(m => (
                      <button key={m.uid} type="button" onClick={() => { updateField('assignedTo', m.uid); setMemberSearch(m.name); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors text-foreground">{m.name}</button>
                    ))}
                  </div>
                )}
                {!form.assignedTo && memberSearch && filteredMembers.length === 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-lg shadow-lg p-3 text-xs text-muted-foreground">No members found</div>
                )}
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Category</label>
              <select value={form.category} onChange={(e) => updateField('category', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none">
                <option value="promotional">Promotional</option>
                <option value="wishes">Wishes</option>
                <option value="cinematic">Cinematic</option>
              </select>
            </div>

            {/* Duration — standard packages, or any custom clip count */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Duration</label>
              <select value={customDuration ? 'custom' : form.duration}
                onChange={(e) => e.target.value === 'custom' ? setCustomDurationMode(true) : (setCustomDuration(false), updateField('duration', e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none">
                {DURATIONS[form.category].map(d => <option key={d} value={d}>{d} ({getClipCount(d)} clips + {hasPoster(d) ? 'Poster ' : ''}{END_CREDITS_SECONDS}s EC)</option>)}
                <option value="custom">Custom clips…</option>
              </select>
              {customDuration && (
                <div className="mt-1.5 flex items-center gap-2">
                  <input type="number" min={1} value={customClips}
                    onChange={(e) => updateCustomClips(parseInt(e.target.value))}
                    className="w-24 border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none" />
                  <span className="text-xs text-muted-foreground">
                    clips = {form.duration}{hasPoster(form.duration) ? ' + Poster' : ''} + {END_CREDITS_SECONDS}s EC
                  </span>
                </div>
              )}
            </div>

            {/* Price Per Unit */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Price Per Unit (₹)</label>
              <input type="number" min={0} value={form.pricePerUnit}
                onChange={(e) => updateField('pricePerUnit', parseInt(e.target.value) || 0)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>

            {/* Business Name */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Business Name <span className="text-[10px] text-muted-foreground/60">(optional)</span></label>
              <input type="text" placeholder="e.g. Sharma Electronics" value={form.businessName}
                onChange={(e) => setForm(prev => ({ ...prev, businessName: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>

            {/* Business WhatsApp */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Business WhatsApp <span className="text-[10px] text-muted-foreground/60">(optional)</span></label>
              <input type="text" placeholder="e.g. 9876543210" value={form.businessWhatsapp}
                onChange={(e) => setForm(prev => ({ ...prev, businessWhatsapp: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>

            {/* Model Gender */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Model</label>
              <div className="grid grid-cols-2 gap-2">
                {[ModelGender.FEMALE, ModelGender.MALE].map(g => (
                  <button key={g} type="button"
                    onClick={() => setForm(prev => {
                      const allowed = ATTIRE_OPTIONS_BY_GENDER[g];
                      const nextAttire = allowed.includes(prev.attireType) ? prev.attireType : AttireType.PROFESSIONAL;
                      return { ...prev, modelGender: g, attireType: nextAttire };
                    })}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      form.modelGender === g ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent'
                    }`}>
                    {g === ModelGender.FEMALE ? '👩 Female' : '👨 Male'}
                  </button>
                ))}
              </div>
            </div>

            {/* Attire */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Attire</label>
              <select value={form.attireType} onChange={(e) => setForm(prev => ({ ...prev, attireType: e.target.value as AttireType }))}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none">
                {ATTIRE_OPTIONS_BY_GENDER[form.modelGender].map(a => (
                  <option key={a} value={a}>{ATTIRE_LABELS[a]}</option>
                ))}
              </select>
              {form.attireType === AttireType.CUSTOM && (
                <input type="text" placeholder="Describe the exact attire…" value={form.customAttire}
                  onChange={(e) => setForm(prev => ({ ...prev, customAttire: e.target.value }))}
                  className="w-full mt-1.5 border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none" />
              )}
            </div>

            {/* Aspect Ratio */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Aspect Ratio</label>
              <div className="grid grid-cols-2 gap-2">
                {(['9:16', '16:9'] as const).map(r => (
                  <button key={r} type="button" onClick={() => setForm(prev => ({ ...prev, aspectRatio: r }))}
                    className={`px-3 py-2 rounded-lg text-sm font-mono font-medium border transition-colors ${
                      form.aspectRatio === r ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent'
                    }`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Language</label>
              <select value={form.language} onChange={(e) => setForm(prev => ({ ...prev, language: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none">
                {ASSIGNMENT_LANGUAGE_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              {form.language === 'Custom' && (
                <input type="text" placeholder="Type the language…" value={form.customLanguage}
                  onChange={(e) => setForm(prev => ({ ...prev, customLanguage: e.target.value }))}
                  className="w-full mt-1.5 border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none" />
              )}
            </div>
          </div>

          {/* Total */}
          <div className="mt-4 flex items-center justify-between pt-4 border-t border-border">
            <div className="text-sm text-muted-foreground">
              Total: <span className="font-bold text-foreground text-lg">{formatCurrency(totalPrice)}</span>
              <span className="ml-2">({clipCount} clips + {hasPoster(form.duration) ? 'Poster ' : ''}5s EC)</span>
            </div>
            <button onClick={handleCreate} disabled={submitting || !form.assignedTo}
              className="flex items-center space-x-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
              <span>{submitting ? 'Creating...' : 'Create Assignment'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Approve work — everything the team has delivered and is waiting on a decision */}
      <div className="rounded-2xl border border-border/70 bg-card/80 p-3 md:p-4 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${pendingApproval.length > 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
              <CheckCircle2 className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Approve work</p>
              <p className="text-xs text-muted-foreground">
                {pendingApproval.length === 0
                  ? 'Nothing waiting — all delivered work is approved.'
                  : `${pendingApproval.length} delivered ${pendingApproval.length === 1 ? 'video is' : 'videos are'} waiting for your approval.`}
              </p>
            </div>
          </div>
          <button
            onClick={() => pendingApproval.length && setVerifyDialog({ mode: 'all', items: pendingApproval })}
            disabled={verifying || pendingApproval.length === 0}
            className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-green-100 px-4 text-xs md:text-sm font-medium text-green-700 transition-colors hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 disabled:cursor-not-allowed disabled:opacity-50"
            title="Review and approve all delivered work">
            {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            <span>{verifying ? 'Verifying...' : `Review & Verify (${pendingApproval.length})`}</span>
          </button>
        </div>
      </div>

      {/* Team Workload Overview */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-3 md:px-4 py-2.5 md:py-3 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-foreground text-sm">Team Workload</h3>
            <span className="text-[10px] text-muted-foreground">{memberWorkload.reduce((s, m) => s + m.assignments.length, 0)} active across {memberWorkload.length} members</span>
            <button onClick={() => navigate('/tech-admin/work-reports')}
              className="ml-auto flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border bg-background text-muted-foreground border-border hover:text-foreground hover:bg-accent/50 transition-colors">
              <History className="w-3.5 h-3.5" />
              <span>History &amp; Reports</span>
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input type="text" placeholder="Search by member, business, ID or phone..." value={workloadSearch}
              onChange={e => setWorkloadSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
          </div>
        </div>
        {filteredWorkload.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {workloadSearch.trim() ? 'No members match that search.' : 'No active work right now — everything is verified.'}
          </div>
        ) : (
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredWorkload.map(({ member, assignments: mAsgn }) => {
              const totalMemberPrice = mAsgn.reduce((s, a) => s + a.totalPrice, 0);
              // name → best available whatsapp (prefer entries that have one)
              const namePhoneMap = new Map<string, string | null>();
              mAsgn.forEach(a => {
                const name = a.businessName || a.clientName;
                if (!name) return;
                if (!namePhoneMap.has(name) || (!namePhoneMap.get(name) && a.businessWhatsapp))
                  namePhoneMap.set(name, a.businessWhatsapp || null);
              });
              const businessEntries = [...namePhoneMap.entries()];
              return (
                <button key={member.uid}
                  onClick={() => navigate(`/tech-admin/work-assign/${member.uid}?status=all&day=all`)}
                  className="bg-background border border-border rounded-xl p-3 hover:border-primary/40 hover:shadow-md transition-all text-left group"
                >
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <div className="w-9 h-9 rounded-lg bg-role-tech-member/15 flex items-center justify-center font-display font-bold text-role-tech-member text-sm shrink-0">
                      {member.name?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{member.name}</span>
                        {(() => {
                          const ci = todayCheckins.get(member.uid);
                          if (!ci) return <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" title="Not checked in" />;
                          if (ci.status === "pending_approval") return <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse shrink-0" title="Pending approval" />;
                          if (ci.status === "approved") return <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" title="Approved" />;
                          if (ci.status === "rejected") return <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" title="Rejected" />;
                          if (ci.checkedOutAt) return <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" title="Checked out" />;
                          return <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" title="Checked in" />;
                        })()}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">
                          {mAsgn.length} video{mAsgn.length !== 1 ? 's' : ''}
                        </span>
                        <span className="text-[10px] text-primary font-mono font-medium">{formatCurrency(totalMemberPrice)}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                  </div>
                  {businessEntries.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {businessEntries.slice(0, 3).map(([name, phone]) => {
                        const key = `${member.uid}-${name}`;
                        const copied = copiedBusiness === key;
                        return (
                          <button
                            key={name}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!phone) return;
                              navigator.clipboard.writeText(phone);
                              setCopiedBusiness(key);
                              setTimeout(() => setCopiedBusiness(null), 2000);
                            }}
                            title={phone ? `Copy WhatsApp: ${phone}` : 'No WhatsApp number'}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium truncate max-w-[140px] transition-colors ${
                              copied
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : phone
                                  ? 'bg-primary/10 text-primary hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-900/30 dark:hover:text-green-400 cursor-pointer'
                                  : 'bg-primary/10 text-primary cursor-default'
                            }`}
                          >
                            {copied ? <Check className="w-2.5 h-2.5 shrink-0" /> : phone ? <Copy className="w-2.5 h-2.5 shrink-0 opacity-50" /> : null}
                            <span className="truncate">{name}</span>
                          </button>
                        );
                      })}
                      {businessEntries.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{businessEntries.length - 3} more</span>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {mAsgn.slice(0, 5).map(a => (
                      <span key={a.id} className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${statusColors[a.status]}`}>
                        {a.uniqueId}
                      </span>
                    ))}
                    {mAsgn.length > 5 && (
                      <span className="text-[9px] text-muted-foreground">+{mAsgn.length - 5}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ClipboardList, Plus, CheckCircle2, Loader2,
  Search, X, Users, History, Copy, Check, MessageCircle, Sparkles, ShoppingBag
} from 'lucide-react';
import { getWhatsAppUrl, normalizePhone } from '@/utils/phone';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/store/authStore';
import { useFirestoreCollection, useFirestoreQuery } from '@/hooks/useFirestore';
import {
  DURATIONS, END_CREDITS_SECONDS,
  getClipCount, hasPoster, durationForClips, normalizeClipCount, priceForClips,
} from '@/utils/assignmentDuration';
import { formatDate, formatTime } from '@/utils/formatters';
import { format } from 'date-fns';
import type { WorkAssignment, AppUser, DailyCheckin, Order } from '@/types';
import { AttireType, ModelGender, ATTIRE_OPTIONS_BY_GENDER } from '@/types/aiPlatform';
import { ATTIRE_LABELS, assignmentFormFromOrder, buildAssignmentRequirementsMessage } from '@/utils/adRequirement';
import { watchAdLanguages, mergeAdLanguages, rememberAdLanguage } from '@/services/adLanguages';
import { bulkCategoryLabel } from '@/utils/serviceCatalog';
import { fetchOrder, activeOrdersQuery } from '@/services/orders';
import { createWorkAssignment, nextWorkUniqueId } from '@/services/workAssign';
import { verifyAssignments, awaitingVerification } from '@/services/workVerify';
import MemberWorkloadCard from '@/components/work/MemberWorkloadCard';
import SpecialCategoryFields from '@/components/work/SpecialCategoryFields';
import AdsStatusBoard from '@/components/work/AdsStatusBoard';
import { buildMemberWorkload, filterMemberWorkload } from '@/utils/memberWorkload';
import { buildMemberPickerOptions, filterMemberPickerOptions } from '@/utils/memberPicker';

/**
 * Work Assign — the control centre for work that still needs doing: search the team's live
 * workload, assign new work, and approve what has been delivered. Reporting and the full
 * assignment history live on the Work Done & Reports page (pages/shared/WorkReports).
 *
 * Arriving with `?order=<id>` (the Assign button on the Orders queue) opens the form already
 * filled in from the sale and the brief the sales member captured — everything stays editable,
 * it just never has to be re-typed.
 */

export default function TeamLeaderWorkAssign() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: allUsers, loading: usersLoading } = useFirestoreCollection<AppUser>('users');
  const { data: allAssignments, loading: assignmentsLoading } = useFirestoreCollection<WorkAssignment>('work_assignments');
  // Live orders — the "not assigned" side of the ads-status board.
  const ordersQuery = useMemo(() => activeOrdersQuery(), []);
  const { data: orders } = useFirestoreQuery<Order>(ordersQuery, []);

  // Team leader sees tech_members created by the same tech_admin that created them.
  // `isActive !== false`, not `isActive`: member records created before the flag existed have no
  // `isActive` field at all, and a truthy test silently drops every one of them from the team.
  const techAdminUid = user?.createdBy;
  const techMembers = useMemo(
    () => allUsers.filter(u => u.role === 'tech_member' && u.isActive !== false && !u.externalCreator && u.createdBy === techAdminUid),
    [allUsers, techAdminUid]
  );
  // Only show assignments for members in this team
  const memberUids = useMemo(() => new Set(techMembers.map(m => m.uid)), [techMembers]);
  const assignments = useMemo(
    () => allAssignments.filter(a => memberUids.has(a.assignedTo)),
    [allAssignments, memberUids]
  );

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  /** Duration entered as a free clip count instead of a standard package. */
  const [customDuration, setCustomDuration] = useState(false);
  const [customClips, setCustomClips] = useState(3);
  const [workloadSearch, setWorkloadSearch] = useState('');
  const [todayCheckins, setTodayCheckins] = useState<Map<string, DailyCheckin>>(new Map());
  const [verifying, setVerifying] = useState(false);
  const [verifyDialog, setVerifyDialog] = useState<{ mode: 'single' | 'all'; items: WorkAssignment[] } | null>(null);

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
    requirementNotes: '',
    characterPack: '',
    realLocationProvided: false,
  });
  /** The order being fulfilled, when the form was opened from the Orders queue. */
  const [sourceOrder, setSourceOrder] = useState<Order | null>(null);
  /** Shared language list — grows whenever anyone sells in a language that wasn't listed. */
  const [languages, setLanguages] = useState<string[]>(() => mergeAdLanguages(null));
  useEffect(() => watchAdLanguages(setLanguages), []);
  /** Requirements message to copy/send on WhatsApp, shown right after Create Assignment succeeds. */
  // `waReq` holds the last requirements message; `waOpen` controls the popup. Keeping the content
  // after the popup is dismissed lets the lead reopen it — the message would otherwise be lost.
  const [waReq, setWaReq] = useState<{ member: AppUser; message: string } | null>(null);
  const [waOpen, setWaOpen] = useState(false);
  const [waReqCopied, setWaReqCopied] = useState(false);

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

  // Opened from the Orders queue → fill the form from the sale and its brief.
  useEffect(() => {
    const orderId = searchParams.get('order');
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      const order = await fetchOrder(orderId);
      if (cancelled || !order) return;
      setSourceOrder(order);
      setForm(prev => ({ ...prev, ...assignmentFormFromOrder(order, languages) }));
      setCustomDuration(false);
      setShowForm(true);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('order');
      setSearchParams(nextParams, { replace: true });
    })();
    return () => { cancelled = true; };
    // `languages` is read for the custom-language fallback only; re-running on its arrival would
    // overwrite edits the lead has already made to the pre-filled form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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

  // Ranked "who should take this next": checked-in and most vacant first. Only a suggestion —
  // the whole team stays listed and searchable, and the lead can pick anyone.
  const memberOptions = useMemo(
    () => buildMemberPickerOptions(techMembers, assignments, todayCheckins),
    [techMembers, assignments, todayCheckins],
  );
  const filteredMembers = useMemo(
    () => filterMemberPickerOptions(memberOptions, memberSearch, v => normalizePhone(v).replace(/\D/g, '')),
    [memberOptions, memberSearch],
  );

  const resolvedLanguage = () => (form.language === 'Custom' ? (form.customLanguage.trim() || 'Custom') : form.language);

  const handleCreate = async () => {
    if (!user || !form.assignedTo) return;
    setSubmitting(true);
    try {
      const uniqueId = nextWorkUniqueId(form.category, assignments);
      const clips = getClipCount(form.duration);
      const language = resolvedLanguage();
      const assignedMember = techMembers.find(m => m.uid === form.assignedTo);

      const { accessCode } = await createWorkAssignment({
        assignedTo: form.assignedTo,
        assignedToName: assignedMember?.name,
        assignerUid: user.uid,
        category: form.category,
        duration: form.duration,
        clipCount: clips,
        pricePerUnit: form.pricePerUnit,
        uniqueId,
        businessName: form.businessName,
        businessWhatsapp: form.businessWhatsapp,
        modelGender: form.modelGender,
        attireType: form.attireType,
        customAttire: form.customAttire,
        aspectRatio: form.aspectRatio,
        language,
        requirementNotes: form.requirementNotes,
        characterPack: form.characterPack,
        realLocationProvided: form.realLocationProvided,
        order: sourceOrder,
      });

      // A language typed in here joins the shared list, same as one entered at sale time.
      if (form.language === 'Custom' && language) await rememberAdLanguage(language);

      // The WhatsApp-ready requirements message (no price — leads don't see pricing; no internal
      // assignment ID — the member doesn't need it), from the shared builder so this page and the
      // tech admin's send exactly the same brief.
      const message = buildAssignmentRequirementsMessage({
        businessName: form.businessName,
        category: form.category,
        duration: form.duration,
        clipCount: clips,
        modelGender: form.modelGender,
        attireType: form.attireType,
        customAttire: form.customAttire,
        aspectRatio: form.aspectRatio,
        language,
        requirementNotes: form.requirementNotes,
        characterPack: form.characterPack,
        realLocationProvided: form.realLocationProvided,
        accessCode,
      });

      if (assignedMember) { setWaReq({ member: assignedMember, message }); setWaOpen(true); }

      setShowForm(false);
      setSourceOrder(null);
      setForm({
        assignedTo: '', category: 'promotional', duration: '16s', pricePerUnit: 499, clientName: '', businessName: '', businessWhatsapp: '',
        modelGender: ModelGender.FEMALE, attireType: AttireType.TRADITIONAL, customAttire: '', aspectRatio: '9:16', language: 'Telugu', customLanguage: '',
        requirementNotes: '', characterPack: '', realLocationProvided: false,
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

  /** Delivered work waiting on approval — the "approve work" queue. */
  const pendingApproval = useMemo(() => awaitingVerification(assignments), [assignments]);

  /**
   * The whole team, every member, with their recent work at any status attached. See
   * utils/memberWorkload for why nobody is filtered out and why verified work still shows.
   */
  const memberWorkload = useMemo(
    () => buildMemberWorkload(techMembers, assignments),
    [assignments, techMembers]
  );

  const filteredWorkload = useMemo(
    () => filterMemberWorkload(memberWorkload, workloadSearch, v => normalizePhone(v).replace(/\D/g, '')),
    [memberWorkload, workloadSearch]
  );

  const totalActive = useMemo(
    () => memberWorkload.reduce((sum, w) => sum + w.activeCount, 0),
    [memberWorkload]
  );

  const getAssignedStamp = (assignment: WorkAssignment) => {
    const ts = assignment.assignedAt;
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
      {/* Verify Dialog — no pricing shown */}
      {verifyDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !verifying && setVerifyDialog(null)}>
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  {verifyDialog.mode === 'all' ? `Verify All (${verifyDialog.items.length})` : 'Verify Assignment'}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Review member, ad name, and date/time before confirming verification.
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
              <div className="grid grid-cols-10 gap-2 px-3 py-2 bg-muted/50 text-[11px] md:text-xs font-medium text-muted-foreground">
                <span className="col-span-3">Member Name</span>
                <span className="col-span-4">Ad Name</span>
                <span className="col-span-3">Time & Date</span>
              </div>
              <div className="max-h-[45vh] overflow-y-auto divide-y divide-border">
                {verifyDialog.items.map(item => (
                  <div key={item.id} className="grid grid-cols-10 gap-2 px-3 py-2.5 text-xs md:text-sm text-foreground">
                    <span className="col-span-3 truncate" title={getMemberName(item.assignedTo)}>{getMemberName(item.assignedTo)}</span>
                    <span className="col-span-4 truncate" title={getAdName(item)}>{getAdName(item)}</span>
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

      {/* WhatsApp requirements — shown after Create Assignment, and reopenable from the header. */}
      {waOpen && waReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setWaOpen(false)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <MessageCircle className="w-4 h-4 text-emerald-500" />
              <span className="font-semibold text-foreground">Share ad requirements</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Assignment for <b>{waReq.member.name}</b>. Copy or send this requirements message so they generate exactly what you configured.
            </p>
            <textarea
              value={waReq.message}
              onChange={(e) => setWaReq({ ...waReq, message: e.target.value })}
              rows={8}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground font-mono leading-relaxed resize-y mb-3"
            />
            {!waReq.member.phone && (
              <p className="text-[11px] rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 px-3 py-2 mb-3">
                This member has no phone number saved — you can still copy the message.
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={() => setWaOpen(false)}
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
                onClick={() => { window.open(getWhatsAppUrl(waReq.member.phone, waReq.message), "_blank"); setWaOpen(false); }}
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* Reopen the last requirements message — it's not lost when the popup is dismissed. */}
            {waReq && !waOpen && (
              <button onClick={() => setWaOpen(true)}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400 w-full sm:w-auto"
                title={`Reopen the requirements message for ${waReq.member.name}`}>
                <MessageCircle className="w-4 h-4" /> Share requirements ({waReq.member.name})
              </button>
            )}
            <button onClick={() => { setShowForm(!showForm); if (showForm) setSourceOrder(null); }}
              className="flex h-10 items-center justify-center space-x-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 w-full sm:w-auto">
              <Plus className="w-4 h-4" /><span>{showForm ? 'Cancel' : 'New Assignment'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Create Form — no price field */}
      {showForm && (
        <div className="bg-card border rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold text-lg mb-4 text-card-foreground">Create New Assignment</h3>

          {/* Pre-filled from a verified sale — say what was actually sold, so the lead can see at
              a glance whether the derived category/duration are right. No amounts: leads don't
              see pricing. */}
          {sourceOrder && (
            <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
                <ShoppingBag className="w-3.5 h-3.5" /> From order
              </span>
              <span className="text-muted-foreground">
                {/* A bulk order names its kind, because that is what the form below was filled in
                    from — "Bulk Videos" alone would not explain a cinematic duration. */}
                {bulkCategoryLabel(sourceOrder.category, sourceOrder.bulkAdType)}
                {sourceOrder.quantity && sourceOrder.quantity > 1 ? ` × ${sourceOrder.quantity}` : ''}
                {sourceOrder.packageKey && sourceOrder.packageKey !== 'custom' ? ` · ${sourceOrder.packageKey}` : ''}
                {` · sold by ${sourceOrder.soldByName}`}
              </span>
              {sourceOrder.promise && <span className="text-muted-foreground">Promise: <strong className="text-foreground">{sourceOrder.promise.label}</strong></span>}
              <button onClick={() => setSourceOrder(null)}
                className="ml-auto text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                Unlink
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Member */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Assign To</label>
              <div className="relative">
                <input type="text" placeholder="Search or pick a member…" value={memberSearch}
                  onFocus={() => setMemberPickerOpen(true)}
                  onBlur={() => setTimeout(() => setMemberPickerOpen(false), 150)}
                  onChange={(e) => { setMemberSearch(e.target.value); setMemberPickerOpen(true); if (form.assignedTo) updateField('assignedTo', ''); }}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none" />
                {form.assignedTo && (
                  <div className="mt-1 text-xs text-green-500">✓ {techMembers.find(m => m.uid === form.assignedTo)?.name}</div>
                )}
                {/* Opens on focus — no need to type first. Checked-in and most vacant lead the
                    list, but anyone can be picked. */}
                {!form.assignedTo && memberPickerOpen && filteredMembers.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                    {filteredMembers.map(({ member: m, activeCount, checkedIn }) => (
                      <button key={m.uid} type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { updateField('assignedTo', m.uid); setMemberSearch(m.name); setMemberPickerOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-foreground">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${checkedIn ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                        <span className="truncate">{m.name}</span>
                        <span className={`ml-auto shrink-0 text-[10px] ${checkedIn ? 'text-green-500' : 'text-muted-foreground'}`}>
                          {checkedIn ? 'active' : 'inactive'}
                          {activeCount > 0 ? ` · ${activeCount} ad${activeCount === 1 ? '' : 's'}` : ' · free'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {!form.assignedTo && memberPickerOpen && filteredMembers.length === 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-card border border-border rounded-lg shadow-lg p-3 text-xs text-muted-foreground">No members found</div>
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

            <SpecialCategoryFields
              characterPack={form.characterPack}
              realLocationProvided={form.realLocationProvided}
              onChange={(patch) => setForm(prev => ({ ...prev, ...patch }))}
            />

            {/* Model Gender — a character pack replaces the human model, so it drops out entirely. */}
            {!form.characterPack && (
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
            )}

            {/* Attire */}
            {!form.characterPack && (
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
            )}

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
                {languages.map(l => <option key={l} value={l}>{l}</option>)}
                <option value="Custom">Other language…</option>
              </select>
              {form.language === 'Custom' && (
                <input type="text" placeholder="Type the language…" value={form.customLanguage}
                  onChange={(e) => setForm(prev => ({ ...prev, customLanguage: e.target.value }))}
                  className="w-full mt-1.5 border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none" />
              )}
            </div>

            {/* Client notes — whatever the client asked for beyond the spec above. */}
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Client notes <span className="text-[10px] text-muted-foreground/60">(optional — sent to the member)</span>
              </label>
              <textarea rows={2} value={form.requirementNotes}
                onChange={(e) => setForm(prev => ({ ...prev, requirementNotes: e.target.value }))}
                placeholder="Offers, tagline, colours, must-say lines…"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none resize-y" />
            </div>
          </div>

          {/* Footer — no total price, just clip info + button */}
          <div className="mt-4 flex items-center justify-between pt-4 border-t border-border">
            <div className="text-sm text-muted-foreground">
              <span>({getClipCount(form.duration)} clips + {hasPoster(form.duration) ? 'Poster ' : ''}5s EC)</span>
            </div>
            <button onClick={handleCreate} disabled={submitting || !form.assignedTo}
              className="flex items-center space-x-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
              <span>{submitting ? 'Creating...' : 'Create Assignment'}</span>
            </button>
          </div>
        </div>
      )}

      {/* How many ads landed in a period and where each one has got to. No pricing for a lead. */}
      <AdsStatusBoard
        assignments={assignments} orders={orders} members={techMembers} showPricing={false}
        onAssignOrder={(orderId) => navigate(`/team-leader/work-assign?order=${encodeURIComponent(orderId)}`)}
        onOpenMember={(uid) => navigate(`/team-leader/work-assign/${uid}?status=all&day=all`)}
      />

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

      {/* Team Workload Overview — no pricing in member cards */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-3 md:px-4 py-2.5 md:py-3 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-foreground text-sm">Team Workload</h3>
            <span className="text-[10px] text-muted-foreground">{totalActive} active across {memberWorkload.length} members</span>
            <button onClick={() => navigate('/team-leader/work-reports')}
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
            {workloadSearch.trim() ? 'No members match that search.' : 'No tech members on your team yet.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {filteredWorkload.map(w => (
              <MemberWorkloadCard
                key={w.member.uid}
                member={w.member}
                assignments={w.assignments}
                activeCount={w.activeCount}
                activeValue={w.activeValue}
                totalCount={w.totalCount}
                checkin={todayCheckins.get(w.member.uid)}
                onOpen={() => navigate(`/team-leader/work-assign/${w.member.uid}?status=all&day=all`)}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Send, Eye, CheckCircle2, Clock, FileSignature, FileText, User, Users, UsersRound, Loader2, Sparkles, Trash2, Download, Printer, X, Filter, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompany";
import type { AppUser } from "@/types";
import {
  Agreement, extractTitle, sendAgreement, watchTeamSentAgreements, watchAgreementsForMembers,
  loadAgreementTemplate, saveAgreementTemplate, deleteAgreement,
} from "@/services/agreements";
import { formatAgreementWithAI } from "@/services/geminiService";
import { employmentOf, EMPLOYMENT_LABELS, EmploymentType } from "@/services/employment";
import AgreementView, { companySideOf } from "@/components/agreement/AgreementView";
import { useCompanyLogo } from "@/hooks/useCompanyLogo";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import { downloadAgreementPdf } from "@/utils/agreementPdf";
import MissingLettersPanel, { findMissingLetters } from "@/components/hr/MissingLettersPanel";
import { watchTeamProfiles } from "@/services/hr";
import { watchTeamDocuments } from "@/services/hrDocuments";
import { departmentOfRole, resolveSignatories, SIGNATORY_TITLE } from "@/utils/hrPolicy";
import { buildDocument } from "@/utils/hrTemplates";
import {
  AGREEMENT_TOKENS, fillTokens, tokenizeForBulk, tokensUsed, untokenizedPersonalValues,
} from "@/utils/agreementTokens";
import { HR_DOCUMENT_GROUPS, HR_DOCUMENT_LABELS } from "@/types/hr";
import type { EmployeeProfile, HrDocument, HrDocumentType, IssuedSignatory } from "@/types/hr";

const memberProfileLink = (role: string): string =>
  role === "sales_member" ? "/sales/profile" : role === "tech_member" ? "/tech/profile" : "";

/**
 * Who this goes to.
 *
 * "Everyone" is deliberately its own mode rather than a Select-all button inside "Choose people".
 * Sending a document to the entire company is a different decision from sending it to seven named
 * people, and it should take a different click to get there.
 */
type SendMode = "individual" | "multiple" | "everyone";

const MODES: { key: SendMode; label: string; Icon: typeof User }[] = [
  { key: "individual", label: "One person", Icon: User },
  { key: "multiple", label: "Choose people", Icon: Users },
  { key: "everyone", label: "Everyone", Icon: UsersRound },
];

/**
 * Paste-an-agreement, still exactly as it was.
 *
 * This is somebody else's document reproduced verbatim and sent for signature — a different job
 * from the letters the company generates itself, which is why it survived the move into the HR
 * centre rather than being folded into the document generator. When `embedded` is set it drops its
 * own page heading and the missing-letters panel, because the page hosting it already shows both.
 */
export default function SendAgreement({ embedded }: { embedded?: boolean } = {}) {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [sent, setSent] = useState<Agreement[]>([]);
  const [mode, setMode] = useState<SendMode>("individual");
  const [selectedId, setSelectedId] = useState<string>("");
  const [category, setCategory] = useState<EmploymentType>("full_time");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [body, setBody] = useState<string>("");
  /** Which document template the text in the box came from. Blank = the admin's own paste. */
  const [templateType, setTemplateType] = useState<HrDocumentType | "">("");
  /** Who signs it, resolved when the template was loaded and frozen onto every copy sent. */
  const [templateSignatories, setTemplateSignatories] = useState<IssuedSignatory[]>([]);
  const { company, assets: marks, officer } = useCompany();
  const logo = useCompanyLogo();
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState("");
  const [formatting, setFormatting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Agreement | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** Filter the sent list down to one individual's agreements ("view agreement of the individual"). */
  const [viewMemberId, setViewMemberId] = useState<string>("");
  const [viewOpen, setViewOpen] = useState<Agreement | null>(null);
  const [downloading, setDownloading] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);
  const { printing, print } = usePrintDocument(paperRef);
  /** The HR side of this page: who is still missing the letters everyone should hold. */
  const [profiles, setProfiles] = useState<Map<string, EmployeeProfile>>(new Map());
  const [hrDocs, setHrDocs] = useState<HrDocument[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => setAllUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser))));
    return () => unsub();
  }, []);

  // Senders whose agreements appear in the "Sent agreements" list:
  // a tech admin also sees everything their team leaders sent.
  const senderUids = useMemo(() => {
    if (!user) return [] as string[];
    const uids = [user.uid];
    if (user.role === "tech_admin") {
      allUsers
        .filter((u) => u.role === "tech_team_leader" && u.createdBy === user.uid)
        .forEach((u) => uids.push(u.uid));
    }
    return uids;
  }, [user, allUsers]);

  useEffect(() => {
    if (!user) return;
    const unsub = watchTeamSentAgreements(senderUids, setSent);
    return () => unsub();
  }, [user?.uid, senderUids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tech admin AND tech team leader both see every agreement addressed TO the team
  // (members + leads), no matter who sent it — one shared, complete list.
  const teamMemberUids = useMemo(() => {
    if (!user || (user.role !== "tech_admin" && user.role !== "tech_team_leader")) return [] as string[];
    const teamAdminUid = user.role === "tech_team_leader" ? user.createdBy : user.uid;
    return allUsers
      .filter((u) => (u.role === "tech_member" || u.role === "tech_team_leader") && u.createdBy === teamAdminUid && !u.externalCreator)
      .map((u) => u.uid);
  }, [user, allUsers]);

  const [teamSent, setTeamSent] = useState<Agreement[]>([]);
  useEffect(() => {
    if (teamMemberUids.length === 0) { setTeamSent([]); return; }
    const unsub = watchAgreementsForMembers(teamMemberUids, setTeamSent);
    return () => unsub();
  }, [teamMemberUids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const allSent = useMemo(() => {
    const map = new Map<string, Agreement>();
    [...sent, ...teamSent].forEach((a) => { if (a.id) map.set(a.id, a); });
    return [...map.values()].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [sent, teamSent]);

  // Recipients eligible for this admin / lead.
  const members = useMemo(() => {
    if (!user) return [];
    let allowedRoles: string[] = [];
    let teamAdminUid = user.uid;
    if (user.role === "tech_admin") allowedRoles = ["tech_member", "tech_team_leader"];
    else if (user.role === "sales_admin") allowedRoles = ["sales_member"];
    else if (user.role === "tech_team_leader") { allowedRoles = ["tech_member"]; teamAdminUid = user.createdBy; }
    return allUsers
      .filter((u) => allowedRoles.includes(u.role) && u.createdBy === teamAdminUid && u.isActive !== false)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [allUsers, user]);

  /**
   * The pool the checkbox list shows.
   *
   * "Everyone" means everyone, with no category filter — that is what the word has to mean, or an
   * admin who picked it would still silently miss the part-timers.
   */
  const poolMembers = useMemo(
    () => (mode === "everyone" ? members : members.filter((m) => employmentOf(m.employmentType) === category)),
    [members, category, mode],
  );

  /**
   * The HR records behind those members, and every letter already issued to them.
   *
   * Keyed on the uid list rather than the array, so this does not re-subscribe on every render of
   * a page that re-renders whenever anything is typed into the agreement box.
   */
  const memberUidKey = members.map((m) => m.uid).sort().join(",");
  const department = departmentOfRole(user?.role) || "tech";
  useEffect(() => {
    const uids = memberUidKey ? memberUidKey.split(",") : [];
    if (uids.length === 0) { setProfiles(new Map()); setHrDocs([]); return; }
    const stopProfiles = watchTeamProfiles(uids, department, setProfiles);
    const stopDocs = watchTeamDocuments(uids, setHrDocs);
    return () => { stopProfiles(); stopDocs(); };
  }, [memberUidKey, department]);

  const missingLetters = useMemo(
    () => findMissingLetters(members, profiles, hrDocs),
    [members, profiles, hrDocs],
  );

  // Pre-tick the whole pool whenever it changes — the common case is "all of these".
  useEffect(() => {
    if (mode !== "individual") setTicked(new Set(poolMembers.map((m) => m.uid)));
  }, [mode, category, poolMembers.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Remembered template per category: load it when the box is empty and nothing was generated.
  useEffect(() => {
    if (mode === "individual" || !user) return;
    let cancelled = false;
    loadAgreementTemplate(user.uid, category).then((tpl) => {
      if (!cancelled && tpl) setBody((prev) => (prev.trim() ? prev : tpl));
    });
    return () => { cancelled = true; };
  }, [mode, category, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const agreementFlag = (memberId: string): "signed" | "sent" | null => {
    const mine = allSent.filter((a) => a.memberId === memberId);
    if (mine.some((a) => a.status === "signed")) return "signed";
    if (mine.length > 0) return "sent";
    return null;
  };

  // Every individual who has at least one agreement on record — derived from the sent list
  // itself so it still covers deactivated / former members, not just current recipients.
  const individualsWithAgreements = useMemo(() => {
    const map = new Map<string, string>();
    allSent.forEach((a) => map.set(a.memberId, a.memberName));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [allSent]);

  const visibleSent = useMemo(
    () => (viewMemberId ? allSent.filter((a) => a.memberId === viewMemberId) : allSent),
    [allSent, viewMemberId],
  );

  const handleDownloadViewed = async () => {
    if (!paperRef.current || !viewOpen || downloading) return;
    setDownloading(true);
    try {
      await downloadAgreementPdf(paperRef.current, `${viewOpen.title.replace(/[^\w]+/g, "_")}.pdf`);
    } catch {
      toast({ title: "Error", description: "Could not generate the PDF.", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const selected = members.find((m) => m.uid === selectedId);
  const previewMember = mode === "individual" ? selected : poolMembers.find((m) => ticked.has(m.uid)) || poolMembers[0];
  const tickedMembers = poolMembers.filter((m) => ticked.has(m.uid));
  const targets = mode === "individual" ? (selected ? [selected] : []) : tickedMembers;

  const subjectOf = (m?: AppUser) => ({ member: m || ({} as AppUser), profile: m ? profiles.get(m.uid) : null });

  /**
   * Load one of the company's own letters into the editing box.
   *
   * This is the whole point of the change: the generator writes the letter, and the admin gets to
   * change the wording before it goes out — rather than choosing between a generated letter they
   * cannot touch and a blank box they have to fill from nothing.
   *
   * Sent to one person it is generated with that person's facts in it and edited freely. Sent to
   * several, the reference employee's own values are swapped for `{{tokens}}` first, because a
   * letter generated for Asha and mailed to eight people tells all eight of them Asha's salary.
   */
  const loadTemplate = (type: HrDocumentType | "") => {
    setTemplateType(type);
    setShowPreview(false);
    setTemplateSignatories([]);
    if (!type) return;

    const base = targets[0] || previewMember;
    if (!base || !user) {
      toast({
        title: "Pick who it is for first",
        description: "The letter is written from the employee's own record, so it needs a recipient.",
        variant: "destructive",
      });
      setTemplateType("");
      return;
    }
    const profile = profiles.get(base.uid);
    if (!profile) {
      toast({
        title: `No employment record for ${base.name}`,
        description: "Fill in their designation, joining date and salary on their profile first.",
        variant: "destructive",
      });
      setTemplateType("");
      return;
    }

    const department = departmentOfRole(user.role) || profile.department || "tech";
    const designation = user.designation || SIGNATORY_TITLE[department] || "Authorised Signatory";
    const signatories = resolveSignatories(
      type,
      { ceo: officer("ceo"), cto: officer("cto") },
      { name: user.name, designation, signatureUrl: user.signatureUrl },
    );

    const built = buildDocument({
      type,
      subject: { name: base.name, phone: base.phone, email: base.email, employeeId: base.employeeId },
      profile,
      signatory: signatories,
      issuedOn: format(new Date(), "yyyy-MM-dd"),
      company,
    });

    const text = mode === "individual"
      ? built.bodyText
      : tokenizeForBulk(built.bodyText, { member: base, profile });
    setBody(text);
    setTemplateSignatories(signatories);
    toast({
      title: `${HR_DOCUMENT_LABELS[type]} loaded`,
      description: mode === "individual"
        ? `Written from ${base.name}'s record. Edit anything you like before sending.`
        : "Personal details became {{tokens}} — each person's copy fills in their own.",
    });
  };

  /** What the box would say for one specific person, tokens and blanks resolved. */
  const textFor = (member?: AppUser): string => {
    if (!member) return body;
    return fillTokens(body, subjectOf(member));
  };

  const usedTokens = tokensUsed(body);
  /** Personal values still written out in full — a bulk send would copy these to everybody. */
  const leakedValues = mode === "individual" || !previewMember
    ? []
    : untokenizedPersonalValues(body, subjectOf(previewMember));

  const toggleTick = (uid: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });

  const sendTo = async (member: AppUser) => {
    if (!user) return;
    // Resolved per recipient, so one edited document becomes each person's own copy.
    const text = textFor(member).trim();
    await sendAgreement(
      {
        memberId: member.uid,
        memberName: member.name,
        memberPhone: member.phone,
        memberRole: member.role,
        sentBy: user.uid,
        sentByName: user.name,
        sentByRole: user.role,
        title: extractTitle(text),
        bodyText: text,
        // A generated letter goes out on the letterhead and under the company's signature; a
        // pasted one carries neither, exactly as it always did.
        ...(templateType
          ? {
            letterhead: true,
            templateType,
            companySignatories: templateSignatories,
            companyStampUrl: marks.stampUrl || null,
            companySignedDate: format(new Date(), "yyyy-MM-dd"),
          }
          : {}),
      },
      memberProfileLink(member.role),
    );
  };

  const handleFormatAI = async () => {
    if (!body.trim() || formatting) return;
    setFormatting(true);
    try {
      const formatted = await formatAgreementWithAI(body);
      setBody(formatted);
      toast({ title: "Formatted with AI", description: "Structure cleaned up — review it before sending." });
    } catch {
      toast({ title: "Error", description: "AI formatting failed. Try again.", variant: "destructive" });
    } finally {
      setFormatting(false);
    }
  };

  const handleDeleteAgreement = async () => {
    if (!confirmDelete?.id || deleting) return;
    setDeleting(true);
    try {
      await deleteAgreement(confirmDelete.id);
      toast({ title: "Agreement deleted", description: `"${confirmDelete.title}" to ${confirmDelete.memberName} was removed.` });
      setConfirmDelete(null);
    } catch {
      toast({ title: "Error", description: "Could not delete the agreement.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleSend = async () => {
    if (!user || !body.trim()) {
      toast({ title: "Missing info", description: "Paste the agreement text first.", variant: "destructive" });
      return;
    }
    if (targets.length === 0) {
      toast({ title: "No recipients", description: mode === "individual" ? "Select a member." : "Tick at least one member.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      let done = 0;
      for (const m of targets) {
        setSendProgress(targets.length > 1 ? `Sending ${done + 1}/${targets.length} — ${m.name}…` : "");
        await sendTo(m);
        done++;
      }
      if (mode !== "individual") await saveAgreementTemplate(user.uid, category, body.trim());
      toast({
        title: targets.length > 1 ? `Sent to ${targets.length} members` : "Agreement sent",
        description: targets.length > 1
          ? "Everyone got their own copy, with their own details filled in."
          : `${targets[0].name} will see it in their profile to sign.`,
      });
      if (mode === "individual") { setBody(""); setSelectedId(""); setTemplateType(""); }
      setShowPreview(false);
    } catch {
      toast({ title: "Error", description: "Could not send the agreement.", variant: "destructive" });
    } finally {
      setSending(false);
      setSendProgress("");
    }
  };

  return (
    <div className={embedded ? "" : "p-4 md:p-6 max-w-5xl mx-auto"}>
      {!embedded && (
        <div className="mb-5">
          <h1 className="font-display font-bold text-xl md:text-2xl text-foreground flex items-center gap-2">
            <FileSignature className="w-5 h-5 text-primary" /> Agreements
          </h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-1">
            Start from one of the company's own letters or paste your own text, edit it, and send it
            for signature — to one person, to a chosen few, or to everyone.
          </p>
        </div>
      )}

      {/* The company's own letters come first: the team's missing offer and appointment letters
          are a bigger gap than any agreement waiting to be pasted. */}
      {user && !embedded && (
        <div className="mb-5">
          <MissingLettersPanel
            rows={missingLetters}
            signatory={user}
            settingsPath={user.role === "sales_admin" ? "/sales-admin/settings" : "/tech-admin/settings"}
            memberLink={(m) => memberProfileLink(m.role)}
          />
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4 md:p-5 space-y-4">
        {/* Who it goes to */}
        <div className="flex flex-wrap items-center gap-2">
          {MODES.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => { setMode(key); setShowPreview(false); }}
              data-test={`send-mode-${key}`}
              className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border",
                mode === key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent")}>
              <Icon className="w-3.5 h-3.5" /> {label}
              {key === "everyone" && <span className="text-[10px] opacity-70">({members.length})</span>}
            </button>
          ))}
        </div>

        {mode === "individual" ? (
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Send to</label>
              <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
                data-test="agreement-recipient"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
                <option value="">Select a team member…</option>
                {members.map((m) => (
                  <option key={m.uid} value={m.uid}>{m.name} · {EMPLOYMENT_LABELS[employmentOf(m.employmentType)]}</option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Category is a way of picking people quickly, not a restriction — so it is offered
                for "Choose people" and withheld for "Everyone", where it would be a contradiction. */}
            {mode === "multiple" && (
              <div className="flex flex-wrap items-center gap-2">
                {(["full_time", "part_time"] as EmploymentType[]).map((c) => (
                  <button key={c} onClick={() => setCategory(c)}
                    className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border",
                      category === c
                        ? c === "full_time" ? "border-emerald-500 bg-emerald-500/10 text-emerald-600" : "border-violet-500 bg-violet-500/10 text-violet-600"
                        : "border-border text-muted-foreground hover:bg-accent")}>
                    {EMPLOYMENT_LABELS[c]} ({members.filter((m) => employmentOf(m.employmentType) === c).length})
                  </button>
                ))}
              </div>
            )}

            {poolMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border p-4 text-center">
                {mode === "everyone"
                  ? "No active team members yet."
                  : `No ${EMPLOYMENT_LABELS[category]} members. Switch members to this category from the Attendance page.`}
              </p>
            ) : (
              <div className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground" data-test="recipient-count">
                    Recipients — {tickedMembers.length}/{poolMembers.length} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setTicked(new Set(poolMembers.map((m) => m.uid)))}
                      className="text-[11px] text-primary hover:underline">Select all</button>
                    <button onClick={() => setTicked(new Set())}
                      className="text-[11px] text-muted-foreground hover:underline">Clear</button>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-1.5 max-h-52 overflow-y-auto">
                  {poolMembers.map((m) => {
                    const flag = agreementFlag(m.uid);
                    return (
                      <label key={m.uid}
                        className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-1.5 cursor-pointer text-sm",
                          ticked.has(m.uid) ? "border-primary/40 bg-primary/5" : "border-border opacity-70")}>
                        <input type="checkbox" checked={ticked.has(m.uid)} onChange={() => toggleTick(m.uid)} className="rounded border-border" />
                        <span className="truncate text-foreground">{m.name}</span>
                        {flag === "signed" && <span className="ml-auto shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600">signed</span>}
                        {flag === "sent" && <span className="ml-auto shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600">sent</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Start from one of the company's own letters, then edit it. */}
        <div className="rounded-lg border border-border bg-accent/30 p-3">
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
            <FileText className="h-4 w-4 text-primary" /> Start from a document
          </label>
          <select
            value={templateType}
            onChange={(e) => loadTemplate(e.target.value as HrDocumentType | "")}
            data-test="agreement-template"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="">Blank — paste your own text</option>
            {HR_DOCUMENT_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.types.map((t) => <option key={t} value={t}>{HR_DOCUMENT_LABELS[t]}</option>)}
              </optgroup>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            {mode === "individual"
              ? "Written from the selected employee's own record, straight into the box below — change any wording you like before sending."
              : "Personal details come through as {{tokens}}, so one edited document becomes each person's own copy."}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
            <label className="block text-sm font-medium text-foreground">
              Agreement text
              {templateType && (
                <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {HR_DOCUMENT_LABELS[templateType]} — edit freely
                </span>
              )}
            </label>
            <button onClick={handleFormatAI} disabled={!body.trim() || formatting}
              title="AI cleans the structure: title, numbered sections, and auto-fill placeholders"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-violet-500/40 bg-violet-500/10 text-violet-500 hover:bg-violet-500/20 disabled:opacity-40">
              {formatting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {formatting ? "Formatting…" : "Format with AI"}
            </button>
          </div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14}
            data-test="agreement-body"
            placeholder="Paste the full agreement text here, or pick a document above to start from one. Placeholders like 'Employee Name: ____', 'Mobile Number: ____' and 'Date: ____' are auto-filled from each member's profile."
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground font-mono leading-relaxed resize-y" />

          {mode !== "individual" && (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">
                  {usedTokens.length > 0 ? "Fills in per person:" : "Insert a per-person value:"}
                </span>
                {AGREEMENT_TOKENS.map((t) => {
                  const active = usedTokens.includes(t.token);
                  return (
                    <button
                      key={t.token}
                      type="button"
                      title={active ? `${t.label} — already used` : `Insert ${t.label}`}
                      onClick={() => setBody((b) => `${b}${b.endsWith("\n") || b === "" ? "" : " "}${t.token}`)}
                      className={cn("rounded-md border px-1.5 py-0.5 font-mono text-[10px]",
                        active
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                          : "border-border text-muted-foreground hover:bg-accent")}
                    >
                      {t.token}
                    </button>
                  );
                })}
              </div>

              {/* The hazard worth naming out loud: a figure written out in full reaches everybody. */}
              {leakedValues.length > 0 && (
                <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2" data-test="shared-values-warning">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                    <AlertTriangle className="h-3.5 w-3.5" /> {previewMember?.name}'s {leakedValues.join(", ").toLowerCase()} {leakedValues.length === 1 ? "is" : "are"} written out in full
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Sent to {tickedMembers.length} people, all {tickedMembers.length} receive those same
                    values. Replace them with the {"{{tokens}}"} above, or send this letter to one
                    person at a time.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowPreview((v) => !v)} disabled={!body.trim() || !previewMember}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-border bg-background hover:bg-accent text-foreground disabled:opacity-40">
            <Eye className="w-4 h-4" /> {showPreview ? "Hide" : "Preview"}
          </button>
          <button onClick={handleSend} disabled={sending || !body.trim() || targets.length === 0}
            data-test="agreement-send"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-primary hover:opacity-90 disabled:opacity-40">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending
              ? (sendProgress || "Sending…")
              : mode === "individual"
                ? "Send for signature"
                : `Send to ${tickedMembers.length} member${tickedMembers.length === 1 ? "" : "s"}`}
          </button>
          {mode === "individual" && selected && (
            <span className="text-xs text-muted-foreground">Auto-fills: {selected.name}{selected.phone ? ` · ${selected.phone}` : ""}</span>
          )}
        </div>

        {showPreview && previewMember && body.trim() && (
          <div className="rounded-lg bg-slate-200 p-2 md:p-4 overflow-x-auto" data-test="agreement-preview">
            {mode !== "individual" && (
              <p className="text-[11px] text-slate-600 mb-2 text-center">
                Preview shown with <b>{previewMember.name}</b>'s details — each member gets their own.
              </p>
            )}
            {/* Tokens resolved, so what is on screen is what that person will actually receive —
                a preview showing raw {{tokens}} would be a preview of the template, not the letter. */}
            <AgreementView
              bodyText={textFor(previewMember)}
              memberName={previewMember.name}
              memberPhone={previewMember.phone}
              logoUrl={logo}
              letterhead={!!templateType}
              companySignatories={templateSignatories}
              companyStampUrl={marks.stampUrl}
              companySignedDate={format(new Date(), "yyyy-MM-dd")}
            />
          </div>
        )}
      </div>

      {/* Sent list */}
      <div className="mt-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <h2 className="font-display font-semibold text-foreground">Sent agreements</h2>
          {individualsWithAgreements.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <select value={viewMemberId} onChange={(e) => setViewMemberId(e.target.value)}
                className="border border-border rounded-lg px-2.5 py-1.5 text-xs bg-background text-foreground max-w-[220px]">
                <option value="">View agreement of — all members</option>
                {individualsWithAgreements.map(([uid, name]) => (
                  <option key={uid} value={uid}>{name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        {allSent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
        ) : visibleSent.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border p-4 text-center">No agreements for this member.</p>
        ) : (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {visibleSent.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <button onClick={() => setViewOpen(a)} className="min-w-0 text-left group">
                  <div className="font-medium text-foreground text-sm truncate group-hover:underline underline-offset-2">{a.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    To {a.memberName}
                    {a.sentBy !== user?.uid ? <span className="text-violet-500"> · by {a.sentByName}</span> : ""}
                    {a.createdAt?.seconds ? ` · ${format(new Date(a.createdAt.seconds * 1000), "dd MMM yyyy")}` : ""}
                  </div>
                </button>
                <div className="shrink-0 flex items-center gap-2">
                  {a.status === "signed" ? (
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600">
                      <CheckCircle2 className="w-3 h-3" /> Signed{a.signedDate ? ` · ${format(new Date(a.signedDate), "dd MMM")}` : ""}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600">
                      <Clock className="w-3 h-3" /> Awaiting signature
                    </span>
                  )}
                  <button onClick={() => setViewOpen(a)} title="View this member's agreement"
                    className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10">
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setConfirmDelete(a)} title="Delete agreement"
                    className="p-1.5 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* View one individual's agreement — full document, signature, and PDF download if signed */}
      {viewOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-2 sm:p-4" onClick={() => setViewOpen(null)}>
          <div className="mx-auto max-w-3xl my-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-medium text-white/90 bg-black/30 rounded-lg px-2.5 py-1.5">{viewOpen.memberName}</span>
              <div className="flex items-center gap-2">
                <button onClick={print} disabled={printing} data-test="print-document"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/90 text-slate-800 hover:bg-white">
                  {printing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />} Print
                </button>
                {viewOpen.status === "signed" && (
                  <button onClick={handleDownloadViewed} disabled={downloading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/90 text-slate-800 hover:bg-white">
                    {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Download PDF
                  </button>
                )}
                <button onClick={() => setViewOpen(null)} className="p-1.5 rounded-lg bg-white/90 text-slate-800 hover:bg-white"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="rounded-lg overflow-hidden">
              <AgreementView
                ref={paperRef}
                bodyText={viewOpen.bodyText}
                memberName={viewOpen.memberName}
                memberPhone={viewOpen.memberPhone}
                signatureUrl={viewOpen.signatureUrl}
                signedName={viewOpen.signedName}
                signedDate={viewOpen.signedDate}
                logoUrl={logo}
                {...companySideOf(viewOpen)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-semibold text-foreground mb-1">Delete this agreement?</h3>
            <p className="text-sm text-muted-foreground mb-2">
              "{confirmDelete.title}" sent to <b className="text-foreground">{confirmDelete.memberName}</b> will be permanently removed for both of you.
            </p>
            {confirmDelete.status === "signed" && (
              <p className="text-xs rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-500 px-3 py-2 mb-2">
                ⚠ This agreement is SIGNED — deleting it destroys the signed record permanently. Download the PDF first if you need a copy.
              </p>
            )}
            <div className="flex gap-2 mt-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2 rounded-lg text-sm font-medium border border-border bg-background hover:bg-accent text-foreground">
                Cancel
              </button>
              <button onClick={handleDeleteAgreement} disabled={deleting}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { FileText, Send, Eye, CheckCircle2, Clock, FileSignature } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AppUser } from "@/types";
import { Agreement, extractTitle, sendAgreement, watchSentAgreements } from "@/services/agreements";
import { employmentOf, EMPLOYMENT_LABELS } from "@/services/employment";
import AgreementView from "@/components/agreement/AgreementView";

const DTS_TEMPLATE = `DREAM TEAM SERVICES
FULL-TIME TECHNICAL TEAM MEMBER AGREEMENT

Company Name: DREAM TEAM SERVICES
Email: thedreamteamservicespvt@gmail.com
Contact: +91 9849834102 / +91 9390011378
Address: 50-6-23, Vishnalayam Street, Jagannaickpur, Kakinada, Andhra Pradesh – 533002

Employee Details
Employee Name: ____________________
Mobile Number: ____________________
Designation: Full-Time Technical Team Member

1. Appointment
This Employment Agreement is entered into between DREAM TEAM SERVICES and the employee. The employee agrees to work professionally, honestly and comply with all company policies.

2. Roles & Responsibilities
Manage social media accounts; create advertisements, videos and digital content; handle client requirements; support technical operations; complete assigned work within deadlines; assist with additional company projects.

3. Daily Work Requirements
Complete a minimum of 5 advertisements per working day whenever work is available; maintain quality standards; support additional work requirements.

4. Working Days & Attendance
26 working days per month excluding Sundays. Attendance will be recorded as Full Day, Half Day or Absent. Salary is calculated based on attendance.

5. Leave Policy
2 paid leaves per month. Unused leaves expire monthly. Leave requires prior approval except emergencies.

6. Salary & Payment
Monthly Salary: as agreed. Salary is based on attendance, work performance, quality and responsibilities.

7. Performance
Professional quality work, timely delivery, creativity and accuracy are expected.

8. Communication
Maintain professional communication and respond promptly to official work.

9. Confidentiality & Data Security
The employee shall not disclose, copy, share, transfer or misuse any company information, client information, workflows, business processes, internal logic, SOPs, strategies, source files, passwords, login credentials, or access to any company-owned or company-provided software/services, including but not limited to ChatGPT, Google Flow, AI tools, premium accounts or any other paid subscriptions. Sharing such information with any person or organization without written permission is strictly prohibited. The Company reserves the right to audit and thoroughly review account usage, login history, activity logs and related records of company accounts whenever required. Any confidentiality breach may result in immediate termination, legal action and recovery of damages.

10. Growth
High performers may receive salary hikes, promotions and training opportunities.

11. Company Property
All company accounts, files, devices, prompts, templates, client data and work created during employment remain the exclusive property of DREAM TEAM SERVICES and must be returned or access revoked immediately upon leaving the company.

12. Code of Conduct
Employees must act professionally, avoid conflicts of interest, protect company reputation and follow lawful instructions.

13. Company Rights
The Company may update policies, assign responsibilities and take disciplinary action for any violation of this agreement.

14. Termination
Employment may be terminated according to company policy or immediately for serious misconduct, fraud, confidentiality breaches, unauthorized sharing of company information/accounts or repeated negligence.

15. Acceptance
The employee confirms they have read, understood and accepted all terms and conditions.

Employee Name: ____________________
Employee Signature: ____________________
Date: ____________________`;

const memberProfileLink = (role: string): string =>
  role === "sales_member" ? "/sales/profile" : role === "tech_member" ? "/tech/profile" : "";

export default function SendAgreement() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [sent, setSent] = useState<Agreement[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [body, setBody] = useState<string>("");
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => setAllUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser))));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = watchSentAgreements(user.uid, setSent);
    return () => unsub();
  }, [user?.uid]);

  // Recipients eligible for this admin / lead.
  const members = useMemo(() => {
    if (!user) return [];
    let allowedRoles: string[] = [];
    let teamAdminUid = user.uid;
    if (user.role === "tech_admin") allowedRoles = ["tech_member", "tech_team_leader"];
    else if (user.role === "sales_admin") allowedRoles = ["sales_member"];
    else if (user.role === "tech_team_leader") { allowedRoles = ["tech_member"]; teamAdminUid = user.createdBy; }
    return allUsers
      .filter((u) => allowedRoles.includes(u.role) && u.createdBy === teamAdminUid)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [allUsers, user]);

  const selected = members.find((m) => m.uid === selectedId);

  const handleSend = async () => {
    if (!user || !selected || !body.trim()) {
      toast({ title: "Missing info", description: "Select a member and paste the agreement text.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      await sendAgreement(
        {
          memberId: selected.uid,
          memberName: selected.name,
          memberPhone: selected.phone,
          memberRole: selected.role,
          sentBy: user.uid,
          sentByName: user.name,
          sentByRole: user.role,
          title: extractTitle(body),
          bodyText: body.trim(),
        },
        memberProfileLink(selected.role),
      );
      toast({ title: "Agreement sent", description: `${selected.name} will see it in their profile to sign.` });
      setBody("");
      setSelectedId("");
      setShowPreview(false);
    } catch {
      toast({ title: "Error", description: "Could not send the agreement.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="font-display font-bold text-xl md:text-2xl text-foreground flex items-center gap-2">
          <FileSignature className="w-5 h-5 text-primary" /> Agreements
        </h1>
        <p className="text-muted-foreground text-xs md:text-sm mt-1">
          Paste any agreement text, auto-fill the member's details, preview, and send it for signature.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 md:p-5 space-y-4">
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Send to</label>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
              <option value="">Select a team member…</option>
              {members.map((m) => (
                <option key={m.uid} value={m.uid}>{m.name} · {EMPLOYMENT_LABELS[employmentOf(m.employmentType)]}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={() => setBody(DTS_TEMPLATE)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-border bg-background hover:bg-accent text-foreground">
              <FileText className="w-4 h-4" /> Load DREAM TEAM template
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Agreement text</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10}
            placeholder="Paste the full agreement text here… Placeholders like 'Employee Name: ____', 'Mobile Number: ____' and 'Date: ____' are auto-filled from the member's profile."
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground font-mono leading-relaxed resize-y" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowPreview((v) => !v)} disabled={!body.trim() || !selected}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-border bg-background hover:bg-accent text-foreground disabled:opacity-40">
            <Eye className="w-4 h-4" /> {showPreview ? "Hide" : "Preview"}
          </button>
          <button onClick={handleSend} disabled={sending || !body.trim() || !selected}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-primary hover:opacity-90 disabled:opacity-40">
            <Send className="w-4 h-4" /> {sending ? "Sending…" : "Send for signature"}
          </button>
          {selected && <span className="text-xs text-muted-foreground">Auto-fills: {selected.name}{selected.phone ? ` · ${selected.phone}` : ""}</span>}
        </div>

        {showPreview && selected && body.trim() && (
          <div className="rounded-lg bg-slate-200 p-2 md:p-4 overflow-x-auto">
            <AgreementView bodyText={body} memberName={selected.name} memberPhone={selected.phone} />
          </div>
        )}
      </div>

      {/* Sent list */}
      <div className="mt-6">
        <h2 className="font-display font-semibold text-foreground mb-2">Sent agreements</h2>
        {sent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
        ) : (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {sent.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium text-foreground text-sm truncate">{a.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    To {a.memberName}{a.createdAt?.seconds ? ` · ${format(new Date(a.createdAt.seconds * 1000), "dd MMM yyyy")}` : ""}
                  </div>
                </div>
                {a.status === "signed" ? (
                  <span className="shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600">
                    <CheckCircle2 className="w-3 h-3" /> Signed{a.signedDate ? ` · ${format(new Date(a.signedDate), "dd MMM")}` : ""}
                  </span>
                ) : (
                  <span className="shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600">
                    <Clock className="w-3 h-3" /> Awaiting signature
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

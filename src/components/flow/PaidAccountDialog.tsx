/**
 * A paid account the team shares — ChatGPT for frames, footers and posters; Grok for the animation
 * clips Flow cannot make. Stored with its login and handed to members; no credits are tracked.
 *
 * One dialog adds or edits the account and chooses who it is shared with, so the manager sees in one
 * place how many members are on each subscription.
 */
import { useMemo, useState } from "react";
import { Eye, EyeOff, Loader2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { savePaidAccount, setPaidAccountAssignees, type FlowActor } from "@/services/flowAccounts";
import type { PaidAccount, PaidPlatform } from "@/types/flowAccounts";
import { Field, Modal, buttonCls, inputCls } from "./FlowParts";

export interface TeamMemberOption {
  uid: string;
  name: string;
  role?: string;
}

const PLATFORMS: { key: PaidPlatform; label: string; use: string }[] = [
  { key: "chatgpt", label: "ChatGPT", use: "Frames, footers and posters" },
  { key: "grok", label: "Grok", use: "Animation clips Flow cannot make" },
  { key: "other", label: "Other", use: "Any other paid tool" },
];

export default function PaidAccountDialog({ actor, account, members, onClose }: {
  actor: FlowActor;
  account?: PaidAccount | null;
  members: TeamMemberOption[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [platform, setPlatform] = useState<PaidPlatform>(account?.platform || "chatgpt");
  const [label, setLabel] = useState(account?.label || "");
  const [email, setEmail] = useState(account?.email || "");
  const [password, setPassword] = useState(account?.password || "");
  const [showPassword, setShowPassword] = useState(!account);
  const [plan, setPlan] = useState(account?.plan || "");
  const [renewsOn, setRenewsOn] = useState(account?.renewsOn || "");
  const [notes, setNotes] = useState(account?.notes || "");
  const [assigned, setAssigned] = useState<Set<string>>(new Set(account?.assigneeIds || []));
  const [search, setSearch] = useState("");
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);

  const errors = {
    label: label.trim() ? "" : "Give it a name the team will recognise, e.g. “ChatGPT Plus #1”.",
    email: email.trim() ? "" : "Enter the login email or username.",
    password: password ? "" : "Enter the password.",
  };
  const invalid = Object.values(errors).some(Boolean);
  const shown = (key: keyof typeof errors) => (tried ? errors[key] : "");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => !q || m.name.toLowerCase().includes(q));
  }, [members, search]);

  const toggle = (uid: string) => setAssigned((s) => {
    const next = new Set(s);
    if (next.has(uid)) next.delete(uid); else next.add(uid);
    return next;
  });

  const save = async () => {
    setTried(true);
    if (invalid || saving) return;
    setSaving(true);
    try {
      const id = await savePaidAccount({ platform, label, email, password, plan, renewsOn, notes }, actor, account);
      const assignees = members.filter((m) => assigned.has(m.uid)).map((m) => ({ uid: m.uid, name: m.name, role: m.role }));
      const base: PaidAccount = account || {
        id, platform, label, email, password, assignees: [], assigneeIds: [], teamAdminId: "", addedBy: actor.uid, addedByName: actor.name || "",
      };
      await setPaidAccountAssignees({ ...base, id }, assignees, actor);
      toast({ title: account ? "Paid account saved" : "Paid account added", description: `${label} — shared with ${assignees.length} member${assignees.length === 1 ? "" : "s"}.` });
      onClose();
    } catch (err) {
      console.error("[PaidAccountDialog] save failed:", err);
      toast({ title: "Couldn't save", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      wide
      testId="paid-account-dialog"
      title={account ? "Edit paid account" : "Add a paid account"}
      subtitle="A shared subscription — stored here so its login is in one place, and given to the members who use it."
      onClose={() => !saving && onClose()}
      footer={(
        <>
          <button className={buttonCls.secondary} onClick={onClose} disabled={saving}>Cancel</button>
          <button data-test="paid-save" className={buttonCls.primary} onClick={save} disabled={saving}>
            {saving && <Loader2 size={15} className="animate-spin" />}{account ? "Save" : "Add account"}
          </button>
        </>
      )}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {PLATFORMS.map((p) => (
            <button key={p.key} type="button" data-test={`paid-platform-${p.key}`} onClick={() => setPlatform(p.key)}
              className={`rounded-lg border p-2 text-left transition-colors ${platform === p.key ? "border-primary bg-primary/10" : "border-border hover:bg-accent"}`}>
              <div className="text-sm font-semibold text-foreground">{p.label}</div>
              <div className="text-[10.5px] text-muted-foreground">{p.use}</div>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" error={shown("label")}>
            <input data-test="paid-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ChatGPT Plus #1" className={inputCls} />
          </Field>
          <Field label="Plan (optional)">
            <input data-test="paid-plan" value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="Plus, Pro, SuperGrok…" className={inputCls} />
          </Field>
          <Field label="Login email / username" error={shown("email")}>
            <input data-test="paid-email" value={email} autoComplete="off" onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Password" error={shown("password")}>
            <div className="relative">
              <input data-test="paid-password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={password}
                onChange={(e) => setPassword(e.target.value)} className={`${inputCls} pr-9`} />
              <button type="button" onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>
          <Field label="Renews / ends on (optional)">
            <input data-test="paid-renews" type="date" value={renewsOn} onChange={(e) => setRenewsOn(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Notes (optional)">
            <input data-test="paid-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="2-step code goes to…" className={inputCls} />
          </Field>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              Shared with <b data-test="paid-assigned-count" className="text-foreground">{assigned.size}</b> member{assigned.size === 1 ? "" : "s"}
            </span>
            <div className="relative w-44">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a member"
                className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs text-foreground outline-none focus:border-primary" />
            </div>
          </div>
          <div className="mt-2 grid max-h-52 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {filtered.length === 0 && <p className="text-xs text-muted-foreground">No team members found.</p>}
            {filtered.map((m) => (
              <label key={m.uid} data-test={`paid-member-${m.uid}`}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm ${assigned.has(m.uid) ? "border-primary bg-primary/5" : "border-border hover:bg-accent"}`}>
                <input type="checkbox" checked={assigned.has(m.uid)} onChange={() => toggle(m.uid)} />
                <span className="min-w-0 flex-1 truncate text-foreground">{m.name}</span>
                {m.role === "tech_team_leader" && <span className="text-[10px] text-muted-foreground">Leader</span>}
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

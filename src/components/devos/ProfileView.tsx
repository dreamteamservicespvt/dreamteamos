/**
 * My Development profile (2026-10-19, owner: "the selected preferences are not displaying — require a profile with the
 * details containing the selected skills and category (sales, technical …); keep an option to edit them"). What the
 * person told the onboarding — their work, tools, coding — and their track (the category), shown back to them and
 * editable here (`profile.update`, engine/learner.updatePreferences); plus the focus skills the system picked from their
 * evidence, and the track's history. Before, the answers were stored on the profile and never shown anywhere.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Code2, Loader2, Pencil, Wrench, Briefcase, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { dimensionName, trackName, TRACKS } from "@/devos/core/dimensions";
import { rankLabel } from "@/devos/core/policy";
import { suggestTrack } from "@/devos/core/tracks";
import type { TrackId } from "@/devos/core/types";
import { useDevOs } from "./context";
import { BackButton, Chip, Empty, Loading, Note, RankBadge, Section, TAP, fmtDate } from "./kit";
import { pickedLabels, TrackPicker, WorkQuestions, type Answers } from "./PreferenceFields";

const ROLE_WORD: Record<string, string> = {
  main_admin: "Main admin", tech_admin: "Tech admin", sales_admin: "Sales admin", accounts_admin: "Accounts admin",
  tech_team_leader: "Tech team leader", tech_member: "Tech team", sales_member: "Sales team",
};

export default function ProfileView() {
  const { user, profile, profileLoading, policy, run, busy } = useDevOs();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [track, setTrack] = useState<TrackId>("admin");
  const roleDefault = (policy.defaultTrackByRole[user.role] ?? "admin") as TrackId;
  const suggested = useMemo(() => suggestTrack(answers, roleDefault), [answers, roleDefault]);

  if (profileLoading) return <Loading />;
  if (!profile || profile.onboarding.baseline === "not_started") {
    return <Empty>Your profile starts with the onboarding. <button className="underline min-h-[24px]" onClick={() => navigate("/dev-os/start")}>Get started</button></Empty>;
  }

  const saved = profile.onboarding.answers ?? {};
  const startEdit = () => {
    setAnswers({ coding: ["no"], ...saved });
    setTrack(profile.track);
    setEditing(true);
  };
  const save = async () => {
    if (!(answers.work ?? []).length) {
      toast({ title: "Pick at least one thing your work involves", variant: "destructive" });
      return;
    }
    const r = await run("profile.update", { answers, track }, { label: "profile" });
    if (r) {
      setEditing(false);
      toast({ title: "Profile saved", description: track !== profile.track ? `New tasks now come from ${trackName(track)} work.` : "Your preferences are updated." });
    }
  };

  const rows: { icon: typeof Briefcase; title: string; items: string[]; empty: string }[] = [
    { icon: Briefcase, title: "My work involves", items: pickedLabels(saved, "work"), empty: "Not answered yet" },
    { icon: Wrench, title: "Tools I use most", items: pickedLabels(saved, "tools"), empty: "Not answered yet" },
    { icon: Code2, title: "Coding in my job", items: pickedLabels(saved, "coding"), empty: "No" },
  ];
  const trackInfo = TRACKS.find((t) => t.id === profile.track);

  return (
    <div className="max-w-3xl mx-auto space-y-4" data-test="profile-view">
      <BackButton fallback="/dev-os" fallbackLabel="Home" />

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="h-14 w-14 shrink-0 rounded-full bg-primary/15 text-primary grid place-items-center text-xl font-bold" aria-hidden>{(profile.name || user.name || "?").trim().charAt(0).toUpperCase()}</div>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold leading-tight truncate">{profile.name || user.name}</h2>
            <p className="text-xs text-muted-foreground">{ROLE_WORD[profile.role] ?? profile.role} · in the Development OS since {fmtDate(profile.onboarding.consentAt ?? profile.createdAt)}</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5"><Chip tone="primary">{trackName(profile.track)} track</Chip>{profile.onboarding.baseline !== "complete" && <Chip tone="info">Baseline in progress</Chip>}</div>
          </div>
        </div>
        <div className="shrink-0"><RankBadge level={profile.rank.level} label={rankLabel(policy, profile.rank.level)} /></div>
      </section>

      {!editing ? (
        <Section title="My preferences" hint="What you told us about your work — it shapes the situations in your challenges."
          right={<Button variant="outline" size="sm" className={TAP} onClick={startEdit} data-test="profile-edit"><Pencil className="h-4 w-4 mr-1" /> Edit</Button>}>
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 mb-3" data-test="profile-track">
            <p className="text-xs text-muted-foreground">Category (track)</p>
            <p className="font-semibold">{trackName(profile.track)}</p>
            {trackInfo && <p className="text-xs text-muted-foreground mt-0.5">{trackInfo.purpose}</p>}
            {profile.onboarding.suggested && profile.onboarding.suggested !== profile.track && <p className="text-[11px] text-muted-foreground mt-1">Your answers suggest {trackName(profile.onboarding.suggested)}.</p>}
          </div>
          <dl className="space-y-3">
            {rows.map((r) => (
              <div key={r.title} className="flex gap-3">
                <r.icon className="h-4 w-4 text-primary shrink-0 mt-1" aria-hidden />
                <div className="min-w-0">
                  <dt className="text-sm font-medium">{r.title}</dt>
                  <dd className="flex flex-wrap gap-1.5 mt-1" data-test={`profile-${r.title.split(" ")[0].toLowerCase()}`}>
                    {r.items.length ? r.items.map((x) => <Chip key={x} tone="muted">{x}</Chip>) : <span className="text-xs text-muted-foreground">{r.empty}</span>}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </Section>
      ) : (
        <Section title="Edit my preferences" hint="Change what you do and your track. Your skill scores, rank and history stay as they are.">
          <WorkQuestions answers={answers} onChange={setAnswers} />
          <p className="text-sm font-medium mt-5 mb-2">Category (track)</p>
          <TrackPicker value={track} suggested={suggested} onChange={setTrack} />
          {track !== profile.track && (
            <Note className="mt-3">New tasks will use situations from {trackName(track)} work and its skill weights. Tasks you already have keep theirs.</Note>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-5">
            <Button variant="ghost" className={TAP} disabled={busy === "profile"} onClick={() => setEditing(false)} data-test="profile-cancel">Cancel</Button>
            <Button className={TAP} disabled={busy === "profile"} onClick={save} data-test="profile-save">{busy === "profile" && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Save</Button>
          </div>
        </Section>
      )}

      <Section title="Skills I am focusing on" hint="Chosen from your own results — the system moves them as you improve.">
        {profile.plan.focus.length ? (
          <ul className="space-y-2">
            {profile.plan.focus.map((d, i) => (
              <li key={d} className="flex gap-2 text-sm"><Target className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden /><span><span className="font-medium">{dimensionName(d)}</span>{profile.plan.reasons[i] && <span className="text-muted-foreground"> — {profile.plan.reasons[i].replace(`${dimensionName(d)}: `, "")}</span>}</span></li>
            ))}
          </ul>
        ) : <Note>Your focus skills appear once your baseline is graded.</Note>}
        <Button variant="link" className="px-0 mt-2 min-h-[24px]" onClick={() => navigate("/dev-os/skills")}>See all ten skills</Button>
      </Section>

      {profile.trackHistory.length > 0 && (
        <Section title="Track history" hint="Each change is kept with when and why.">
          <ol className="space-y-2">
            {[...profile.trackHistory].reverse().map((h) => (
              <li key={`${h.track}_${h.from}`} className="flex gap-3 text-sm">
                <span className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" aria-hidden />
                <span className="min-w-0"><span className="font-medium">{trackName(h.track)}</span> <span className="text-muted-foreground">from {fmtDate(h.from)}{h.to ? ` to ${fmtDate(h.to)}` : " · now"} — {h.reason}</span></span>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  );
}

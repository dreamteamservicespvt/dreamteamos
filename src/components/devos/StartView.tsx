/**
 * Onboarding (MSRS §9.1, §7.4): how it works, privacy and the measurement disclaimer, the person's actual work → a
 * suggested track they confirm, then the baseline.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, Loader2, Lock, Repeat, Sparkles, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { DIMENSIONS, TRACKS, MEASUREMENT_DISCLAIMER } from "@/devos/core/dimensions";
import { ONBOARDING_QUESTIONS, suggestTrack } from "@/devos/core/tracks";
import type { TrackId } from "@/devos/core/types";
import { useDevOs } from "./context";
import { Chip, Section, TAP } from "./kit";

export default function StartView() {
  const { user, policy, run, busy, profile } = useDevOs();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [consent, setConsent] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string[]>>({ coding: ["no"] });
  const roleDefault = (policy.defaultTrackByRole[user.role] ?? "admin") as TrackId;
  const suggested = useMemo(() => suggestTrack(answers, roleDefault), [answers, roleDefault]);
  const [track, setTrack] = useState<TrackId | null>(null);
  const chosen = track ?? suggested;

  if (profile?.onboarding.baseline === "in_progress" || profile?.onboarding.baseline === "complete") {
    return (
      <Section title="You have already started" hint="Your baseline and plan are waiting on the Home page.">
        <Button className={TAP} onClick={() => navigate("/dev-os")}>Go to Home</Button>
      </Section>
    );
  }

  const toggle = (q: string, id: string, multi: boolean) => setAnswers((a) => {
    const cur = a[q] ?? [];
    return { ...a, [q]: multi ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id] };
  });

  const start = async () => {
    const r = await run<{ taskId: string }>("onboard", { consent: true, answers, track: chosen }, { label: "onboard" });
    if (r?.taskId) navigate(`/dev-os/play/${r.taskId}`);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4" data-test="devos-start">
      <ol className="flex items-center gap-2 text-xs" aria-label="Steps">
        {["How it works", "Your work", "Your track"].map((s, i) => (
          <li key={s} className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 border", step === i + 1 ? "bg-primary text-primary-foreground border-primary" : step > i + 1 ? "bg-success/10 text-green-800 dark:text-success border-success/30" : "text-muted-foreground border-border")}>
            {step > i + 1 ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="font-semibold">{i + 1}</span>} {s}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <Section title="How the AI Development OS works" id="devos-how">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: Sparkles, t: "Fresh every time", d: "A few short challenges a day from your own kind of work. You never get the same question twice — not even a reworded one." },
              { icon: Repeat, t: "Miss, learn, retry", d: "A coach explains every miss and gives you a fresh try in a new situation. Later, short checks make sure it stuck." },
              { icon: Trophy, t: "Ranks you earn", d: "Basic → Intermediate → Advanced → Pro → Pro Max → Ultra Pro Max. XP shows effort; ranks need real evidence." },
              { icon: Eye, t: "Who sees what", d: "You see everything about yourself. Admins see your results to support your growth. Leaderboards show only a name and a number — and you can hide your name." },
            ].map((x) => (
              <div key={x.t} className="rounded-xl border border-border p-3 flex gap-3">
                <x.icon className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden />
                <div><p className="font-medium text-sm">{x.t}</p><p className="text-xs text-muted-foreground mt-0.5">{x.d}</p></div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <p className="text-sm font-medium mb-2">The ten skills</p>
            <div className="flex flex-wrap gap-1.5">{DIMENSIONS.map((d) => <Chip key={d.id} tone="primary">{d.name}</Chip>)}</div>
          </div>
          <div className="mt-4 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground flex gap-2"><Lock className="h-4 w-4 shrink-0" />{MEASUREMENT_DISCLAIMER}</div>
          <label className="mt-4 flex items-start gap-3 cursor-pointer select-none" htmlFor="devos-consent">
            <Checkbox id="devos-consent" checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" data-test="devos-consent" />
            <span className="text-sm">I understand how my answers are used, who can see my results, and that scores are for development — not an IQ test.</span>
          </label>
          <div className="flex justify-end mt-4">
            <Button className={TAP} disabled={!consent} onClick={() => setStep(2)} data-test="devos-step1-next">Next <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </div>
        </Section>
      )}

      {step === 2 && (
        <Section title="Tell us about your work" hint="Your track comes from what you actually do — not just your title.">
          <div className="space-y-5">
            {ONBOARDING_QUESTIONS.map((q) => (
              <fieldset key={q.id}>
                <legend className="text-sm font-medium mb-2">{q.text}</legend>
                <div className="flex flex-wrap gap-2">
                  {q.options.map((o) => {
                    const on = (answers[q.id] ?? []).includes(o.id);
                    return (
                      <button key={o.id} type="button" onClick={() => toggle(q.id, o.id, q.multi)} aria-pressed={on}
                        className={cn("rounded-xl border px-3 py-2 text-sm text-left transition-colors min-h-[44px]", on ? "border-primary bg-primary/10 text-foreground" : "border-border hover:bg-muted")}
                        data-test={`devos-q-${q.id}-${o.id}`}>
                        {on && <CheckCircle2 className="h-3.5 w-3.5 inline mr-1 text-primary" />}{o.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="flex justify-between mt-5">
            <Button variant="ghost" className={TAP} onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
            <Button className={TAP} onClick={() => setStep(3)} data-test="devos-step2-next">Next <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </div>
        </Section>
      )}

      {step === 3 && (
        <Section title="Your development track" hint="All tracks grow the same ten skills — with situations from that kind of work. An admin can change it later.">
          <div className="grid gap-3 sm:grid-cols-3">
            {TRACKS.map((t) => (
              <button key={t.id} type="button" onClick={() => setTrack(t.id)} aria-pressed={chosen === t.id}
                className={cn("rounded-2xl border p-4 text-left transition-colors", chosen === t.id ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border hover:bg-muted")}
                data-test={`devos-track-${t.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{t.name}</p>
                  {t.id === suggested && <Chip tone="primary">Suggested</Chip>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t.purpose}</p>
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-xl bg-muted/50 p-3 text-sm">
            <p className="font-medium">Next: your baseline</p>
            <p className="text-xs text-muted-foreground mt-0.5">Ten short challenges (about 20 minutes, no hints). Stop any time — every answer is saved. It only sets your starting plan; nobody "fails" a baseline.</p>
          </div>
          <div className="flex justify-between mt-4">
            <Button variant="ghost" className={TAP} onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
            <Button className={TAP} disabled={busy === "onboard"} onClick={start} data-test="devos-start-baseline">
              {busy === "onboard" && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Start my baseline <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </Section>
      )}
    </div>
  );
}

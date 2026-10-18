/**
 * The Administrative Control Center (the brief §13, FR-050 – FR-055, FR-058, FR-060). Platform admins (main + tech
 * admin) see everything and change the policy; the sales admin sees the Sales track, read-only. Every read and change
 * goes through the server, which checks the scope again.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { Activity, AlertTriangle, Bot, ClipboardList, FileText, Gauge, Loader2, Play, RefreshCw, ShieldCheck, Sliders, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DIMENSIONS, DIMENSION_IDS, dimensionName, trackName } from "@/devos/core/dimensions";
import type { DevReport, TrackId } from "@/devos/core/types";
import type { Snapshot } from "@/devos/engine/reports";
import { useDevOs } from "../context";
import { BAD_TEXT, Chip, Empty, GOOD_TEXT, Loading, Note, RankBadge, Ring, Section, TAP, fmtDate, fmtDateTime, timeAgo } from "../kit";

const PersonView = lazy(() => import("./PersonView"));
const PolicyView = lazy(() => import("./PolicyView"));

/** Call an admin action and keep its result (with reload). */
export function useAdminData<T>(action: string, body: Record<string, unknown> = {}, enabled = true) {
  const { run } = useDevOs();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const key = JSON.stringify(body);
  const load = useCallback(async (extra: Record<string, unknown> = {}) => {
    setLoading(true);
    const r = await run<T>(action, { ...JSON.parse(key), ...extra }, { label: action });
    if (r !== null) setData(r);
    setLoading(false);
  }, [run, action, key]);
  useEffect(() => { if (enabled) void load(); }, [load, enabled]);
  return { data, loading, reload: load };
}

// `platform`: the main and tech admin only. The department view (the sales admin) keeps Overview, People and Exceptions,
// each scoped to its track — the question bank, the automation's health and the company reports are company-wide
// (the browser test found the sales admin reading them, and a misleading "the cron has never run").
const TABS = [
  { to: "", label: "Overview", icon: Gauge, end: true }, { to: "people", label: "People", icon: Users },
  { to: "questions", label: "Questions", icon: ClipboardList, platform: true }, { to: "automation", label: "Automation", icon: Bot, platform: true },
  { to: "reports", label: "Reports", icon: FileText, platform: true }, { to: "policy", label: "Policy", icon: Sliders, platform: true },
  { to: "audit", label: "Audit", icon: ShieldCheck, platform: true }, { to: "exceptions", label: "Exceptions", icon: AlertTriangle },
];

export default function AdminView() {
  const { canSeeAdmin, isPlatformAdmin } = useDevOs();
  if (!canSeeAdmin) return <Navigate to="/dev-os" replace />;
  return (
    <div className="space-y-4" data-test="admin-view">
      <nav className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1" aria-label="Control Center sections">
        {TABS.filter((t) => !t.platform || isPlatformAdmin).map((t) => (
          <NavLink key={t.to} to={`/dev-os/admin${t.to ? `/${t.to}` : ""}`} end={t.end}
            className={({ isActive }) => cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm min-h-[40px] border", isActive ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted")}
            data-test={`admin-tab-${t.label.toLowerCase()}`}>
            <t.icon className="h-4 w-4" aria-hidden /> {t.label}
          </NavLink>
        ))}
      </nav>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route index element={<Overview />} />
          <Route path="people" element={<People />} />
          <Route path="people/:uid" element={<PersonView />} />
          <Route path="questions" element={isPlatformAdmin ? <Questions /> : <Navigate to="/dev-os/admin" replace />} />
          <Route path="automation" element={isPlatformAdmin ? <Automation /> : <Navigate to="/dev-os/admin" replace />} />
          <Route path="reports" element={isPlatformAdmin ? <Reports /> : <Navigate to="/dev-os/admin" replace />} />
          <Route path="policy" element={isPlatformAdmin ? <PolicyView /> : <Navigate to="/dev-os/admin" replace />} />
          <Route path="audit" element={isPlatformAdmin ? <Audit /> : <Navigate to="/dev-os/admin" replace />} />
          <Route path="exceptions" element={<Exceptions />} />
          <Route path="*" element={<Navigate to="/dev-os/admin" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}

function Kpi({ label, value, sub, tone = "default" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "default" | "good" | "warn" | "bad" }) {
  return (
    <div className={cn("rounded-2xl border p-4", tone === "bad" ? "border-destructive/30 bg-destructive/5" : tone === "warn" ? "border-warning/40 bg-warning/10" : tone === "good" ? "border-success/30 bg-success/5" : "border-border bg-card")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function Overview() {
  const { policy } = useDevOs();
  const { data: s, loading, reload } = useAdminData<Snapshot>("admin.overview");
  if (loading && !s) return <Loading what="Building the overview" />;
  if (!s) return <Empty>The overview could not be loaded.</Empty>;
  const attention = [...s.people].sort((a, b) => b.flags.length - a.flags.length || (a.summary ?? -1) - (b.summary ?? -1));
  const tracks = (["sales", "technical", "admin"] as TrackId[]).filter((t) => s.counts.byTrack[t]);
  return (
    <div className="space-y-4" data-test="admin-overview">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Mode <strong className="text-foreground">{s.mode}</strong> · policy {s.policyVersion} · built {timeAgo(s.builtAt)}{s.scope && <> · <strong className="text-foreground">{s.scope.map(trackName).join(", ")} track only</strong> (read-only)</>}</p>
        <Button variant="outline" size="sm" className="min-h-[36px]" onClick={() => reload({ fresh: true })}><RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh</Button>
      </div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi label="Baseline done" value={`${s.counts.baselineDone}/${s.counts.profiles}`} sub={`${s.counts.active7d} active in 7 days`} />
        <Kpi label="Quests this week" value={`${pct(s.quests.week.done, s.quests.week.assigned)}%`} sub={`${s.quests.week.done} of ${s.quests.week.assigned} done · today ${s.quests.today.done}/${s.quests.today.assigned}`} tone={s.quests.week.assigned && s.quests.week.done / s.quests.week.assigned < 0.5 ? "warn" : "default"} />
        <Kpi label="Answers" value={s.outcomes.attempts.toLocaleString("en-IN")} sub={`${pct(s.outcomes.passed, s.outcomes.passed + s.outcomes.failed)}% passed · ${s.outcomes.expired} expired`} />
        <Kpi label="Waiting / faults" value={`${s.outcomes.pending} / ${s.outcomes.systemErrors}`} sub="being graded / platform faults (never counted against anyone)" tone={s.outcomes.pending > 5 ? "warn" : "default"} />
      </div>

      <Section title="People" hint="One card each — who needs attention first." right={<Link to="/dev-os/admin/people" className="text-sm underline inline-flex items-center min-h-[24px]">All people</Link>}>
        {attention.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {attention.slice(0, 12).map((p) => (
              <Link key={p.uid} to={`/dev-os/admin/people/${p.uid}`} className="rounded-2xl border border-border p-3 hover:bg-muted/40 transition-colors flex gap-3 min-w-0" data-test={`admin-person-card-${p.uid}`}>
                <Ring value={p.summary} size={52} stroke={6} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{p.name || p.uid}</p>
                  <p className="text-xs text-muted-foreground">{trackName(p.track)} · {p.rankLabel} · {p.xp.toLocaleString("en-IN")} XP</p>
                  <p className="text-xs mt-1">{p.weakest ? <>Weakest: <span className="font-medium">{dimensionName(p.weakest.dim)}</span> ({p.weakest.score})</> : "Not measured yet"}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {p.questToday === "done" && <Chip tone="good">quest done</Chip>}
                    {p.questToday === "open" && <Chip tone="warn">quest open</Chip>}
                    {p.flags.map((f) => <Chip key={f} tone={f === "integrity" ? "bad" : "muted"}>{f}</Chip>)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : <Note>Nobody has started yet. People are invited automatically; share the link /dev-os in your team chat.</Note>}
      </Section>

      <Section title="Skills by track" hint="Average now vs. the average baseline (↑ = grown). Each track is judged on its own tasks and weights — compare tracks with care.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[36rem]">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2 pr-2">Skill</th>{tracks.map((t) => <th key={t} className="py-2 px-2">{trackName(t)} (weight)</th>)}</tr></thead>
            <tbody>
              {DIMENSIONS.map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="py-2 pr-2 font-medium">{d.name}</td>
                  {tracks.map((t) => {
                    const c = s.dims[t][d.id];
                    const gain = c.avg !== null && c.baselineAvg !== null ? c.avg - c.baselineAvg : null;
                    return <td key={t} className="py-2 px-2 tabular-nums">{c.avg ?? "—"}{gain !== null && gain !== 0 && <span className={cn("ml-1 text-xs", gain > 0 ? GOOD_TEXT : BAD_TEXT)}>{gain > 0 ? "↑" : "↓"}{Math.abs(gain)}</span>} <span className="text-xs text-muted-foreground">({policy.weights[t][d.id]}%)</span></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Is the training working?" hint="Second chances, lasting learning and new contexts.">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between"><span>Fresh tries passed after a miss</span><span className="tabular-nums">{s.effectiveness.remediationPassed}/{s.effectiveness.remediationTried} ({pct(s.effectiveness.remediationPassed, s.effectiveness.remediationTried)}%)</span></li>
            <li className="flex justify-between"><span>Retention checks passed</span><span className="tabular-nums">{s.effectiveness.retentionPassed}/{s.effectiveness.retentionTried} ({pct(s.effectiveness.retentionPassed, s.effectiveness.retentionTried)}%)</span></li>
            <li className="flex justify-between"><span>Transfer checks passed</span><span className="tabular-nums">{s.effectiveness.transferPassed}/{s.effectiveness.transferTried} ({pct(s.effectiveness.transferPassed, s.effectiveness.transferTried)}%)</span></li>
          </ul>
        </Section>
        <Section title="Ranks" hint="How many people hold each rank (after their baseline).">
          <ul className="space-y-1.5">
            {s.counts.byRank.map((n, i) => (
              <li key={i} className="flex items-center gap-2"><RankBadge level={(i + 1) as 1} label={policy.rankLabels[i]} size="sm" /><span className="text-sm flex-1">{policy.rankLabels[i]}</span><span className="tabular-nums text-sm font-semibold">{n}</span></li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}

interface StaffRow { uid: string; name: string; role: string; track: TrackId; started: boolean; enrolled: boolean; status: string }

function People() {
  const { data: staff, loading } = useAdminData<StaffRow[]>("admin.staff");
  const { data: snap } = useAdminData<Snapshot>("admin.overview");
  const [q, setQ] = useState("");
  const rows = useMemo(() => (staff ?? []).filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase())).map((s) => ({ ...s, p: snap?.people.find((x) => x.uid === s.uid) })), [staff, snap, q]);
  if (loading && !staff) return <Loading />;
  return (
    <Section title="People" hint="Everyone who can take part. Open a person for their full record." right={<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-9 w-40" aria-label="Search people" />}>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[40rem]">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2">Name</th><th>Track</th><th>Status</th><th>Rank</th><th>Overall</th><th>Last active</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.uid} className="border-t border-border">
                  <td className="py-2"><Link to={`/dev-os/admin/people/${r.uid}`} className="font-medium hover:underline inline-flex items-center min-h-[24px]" data-test={`admin-people-${r.uid}`}>{r.name || r.uid}</Link><p className="text-xs text-muted-foreground">{r.role.replace(/_/g, " ")}</p></td>
                  <td>{trackName(r.track)}</td>
                  <td><Chip tone={!r.enrolled ? "muted" : r.started ? "good" : "warn"}>{!r.enrolled ? "not enrolled" : r.p?.baseline === "complete" ? "active" : r.started ? "baseline" : "not started"}</Chip></td>
                  <td>{r.p?.rankLabel ?? "—"}</td>
                  <td className="tabular-nums">{r.p?.summary !== null && r.p?.summary !== undefined ? Math.round(r.p.summary) : "—"}</td>
                  <td className="text-xs text-muted-foreground">{timeAgo(r.p?.lastActiveAt ?? null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty>No people found.</Empty>}
    </Section>
  );
}

interface QuestionsData {
  pool: { total: number; byKey: Record<string, number> };
  jobs: Record<string, unknown>[];
  quarantined: { id: string; track: string; dim: string; difficulty: number; type: string; question: string }[];
  calibration?: { key: string; reason: string; n: number; correct: number; at: number; until: number; active: boolean }[];
}

/** "rule_application~compute~d3" → "rule_application · compute · level 3"; "ai~sales.logical~d3" → "AI · sales · logical · level 3". */
const patternLabel = (key: string) => {
  const [a, b, d] = key.split("~");
  const level = `level ${d?.replace(/^d/, "")}`;
  return a === "ai" ? `AI · ${(b ?? "").replace(".", " · ")} · ${level}` : `${a.replace(/_/g, " ")} · ${b} · ${level}`;
};

function Questions() {
  const { isPlatformAdmin, run, busy } = useDevOs();
  const { data, loading, reload } = useAdminData<QuestionsData>("admin.questions");
  const [target, setTarget] = useState({ track: "sales", dim: "logical", difficulty: 3, kind: "objective" });
  const generate = async () => {
    const r = await run<{ accepted: number; rejected: number; duplicates: number }>("admin.generate", { target }, { label: "generate" });
    if (r) await reload();
  };
  if (loading && !data) return <Loading />;
  return (
    <div className="space-y-4">
      <Section title="The question bank" hint="Template items are generated per person with computed answers; AI items are validated (an independent solver, rubric checks, duplicate checks) before they enter this pool.">
        <p className="text-sm mb-2">{data?.pool.total ?? 0} validated AI items waiting in the pool.</p>
        <div className="flex flex-wrap gap-1.5">{Object.entries(data?.pool.byKey ?? {}).sort().map(([k, n]) => <Chip key={k} tone="muted">{k.replace(/\|/g, " · ")}: {n}</Chip>)}</div>
        {isPlatformAdmin && (
          <div className="mt-4 rounded-xl bg-muted/40 p-3 grid gap-2 sm:grid-cols-5 items-end">
            <label className="text-xs">Track<select className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm" value={target.track} onChange={(e) => setTarget({ ...target, track: e.target.value })}>{["sales", "technical", "admin"].map((t) => <option key={t} value={t}>{trackName(t as TrackId)}</option>)}</select></label>
            <label className="text-xs">Skill<select className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm" value={target.dim} onChange={(e) => setTarget({ ...target, dim: e.target.value })}>{DIMENSION_IDS.map((d) => <option key={d} value={d}>{dimensionName(d)}</option>)}</select></label>
            <label className="text-xs">Level<select className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm" value={target.difficulty} onChange={(e) => setTarget({ ...target, difficulty: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((d) => <option key={d}>{d}</option>)}</select></label>
            <label className="text-xs">Kind<select className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm" value={target.kind} onChange={(e) => setTarget({ ...target, kind: e.target.value })}><option value="objective">Multiple choice</option><option value="open">Written</option></select></label>
            <Button className="min-h-[40px]" disabled={busy === "generate"} onClick={generate} data-test="admin-generate">{busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}Generate now</Button>
          </div>
        )}
      </Section>
      <Section title="Recent generation runs" hint="What was accepted, and why items were rejected.">
        {data?.jobs.length ? (
          <ul className="divide-y divide-border text-sm">
            {data.jobs.map((j) => {
              const r = (j.result ?? {}) as { generated?: number; accepted?: number; rejected?: number; duplicates?: number; reasons?: string[] };
              const input = (j.input ?? {}) as Record<string, unknown>;
              return (
                <li key={String(j.id)} className="py-2">
                  <div className="flex justify-between gap-2"><span>{String(input.track)} · {dimensionName(String(input.dim) as never)} · level {String(input.difficulty)} · {String(input.kind)}</span><span className="text-xs text-muted-foreground">{fmtDateTime(Number(j.createdAt))}</span></div>
                  <p className="text-xs text-muted-foreground">{r.accepted ?? 0} accepted · {r.rejected ?? 0} rejected · {r.duplicates ?? 0} duplicates{r.reasons?.length ? ` — ${r.reasons.slice(0, 2).join("; ")}` : ""}</p>
                </li>
              );
            })}
          </ul>
        ) : <Note>No generation runs yet — the scheduled job fills the pool from what learners need next.</Note>}
      </Section>
      <Section title="Automatic calibration" hint={`Once a day every question pattern with ${20}+ answers is checked: one almost nobody passes at its level (under 15%), or a hard one nearly everybody passes (over 97%), is not served for 14 days, then measured again from zero.`}>
        {data?.calibration?.length ? (
          <ul className="space-y-1.5 text-sm" data-test="admin-calibration">
            {data.calibration.map((c) => (
              <li key={c.key} className="rounded-lg bg-muted/40 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{patternLabel(c.key)}</span>
                  <Chip tone={c.active ? "warn" : "muted"}>{c.active ? `withdrawn until ${fmtDate(c.until)}` : `back since ${fmtDate(c.until)}`}</Chip>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{c.reason}</p>
              </li>
            ))}
          </ul>
        ) : <Note>No pattern needs it — every question pattern with enough answers passes the check.</Note>}
      </Section>
      <Section title="Quarantined" hint="Withdrawn after an appeal or an admin flag; never served again.">
        {data?.quarantined.length ? <ul className="space-y-1.5 text-sm">{data.quarantined.map((q) => <li key={q.id} className="rounded-lg bg-muted/40 px-3 py-2">{q.question} <span className="text-xs text-muted-foreground">({q.track} · {q.dim} · {q.difficulty})</span></li>)}</ul> : <Note>Nothing quarantined.</Note>}
      </Section>
    </div>
  );
}

function Automation() {
  const { isPlatformAdmin, run, busy } = useDevOs();
  const { data: s, reload } = useAdminData<Snapshot>("admin.overview", { fresh: true });
  const [last, setLast] = useState<Record<string, unknown> | null>(null);
  const h = s?.health;
  const tick = h?.lastTick;
  const runNow = async () => {
    const r = await run<Record<string, unknown>>("admin.tick", {}, { label: "tick" });
    if (r) { setLast(r); await reload({ fresh: true }); }
  };
  const stale = !h?.lastTickAt || Date.now() - h.lastTickAt > 2 * 3_600_000;
  // Keys Google refused (invalid / reported leaked) are skipped for a day — fingerprints only (tick.recordDeadKeys).
  const deadKeys = (h?.deadKeys ?? []).filter((k) => k.until > Date.now()).length;
  return (
    <div className="space-y-4" data-test="admin-automation">
      <Section title="The scheduled worker" hint="Creates quests, expires overdue tasks, grades waiting answers, fills the question pool, runs leagues and seasons, writes the daily report — with every browser closed."
        right={isPlatformAdmin ? <Button size="sm" className="min-h-[36px]" disabled={busy === "tick"} onClick={runNow} data-test="admin-run-tick">{busy === "tick" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Activity className="h-3.5 w-3.5 mr-1" />}Run now</Button> : null}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Kpi label="Last run" value={h?.lastTickAt ? timeAgo(h.lastTickAt) : "never"} sub={h?.lastTickAt ? fmtDateTime(h.lastTickAt) : "the cron has not run yet"} tone={stale ? "warn" : "good"} />
          <Kpi label="AI calls today" value={h?.ai?.calls ?? 0} sub={`${h?.ai?.failures ?? 0} failed${h?.ai?.lastError ? ` · last: ${h.ai.lastError}` : ""}${deadKeys ? ` · ${deadKeys} key${deadKeys > 1 ? "s" : ""} refused by Google, skipped — replace ${deadKeys > 1 ? "them" : "it"} in AI Accounts → API keys` : ""}`} />
          <Kpi label="Question quality today" value={h?.quality?.generated ?? 0} sub={`accepted · ${h?.quality?.rejected ?? 0} rejected · ${h?.quality?.duplicatesBlocked ?? 0} duplicates blocked`} />
        </div>
        {(last ?? tick) && (
          <div className="mt-3">
            <p className="text-xs font-medium mb-1">Steps of the {last ? "run just now" : "last run"}</p>
            <ul className="text-xs space-y-1">{(((last ?? tick) as { steps?: { id: string; ok: boolean; note: string; ms: number }[] }).steps ?? []).map((st) => <li key={st.id} className="flex gap-2"><Chip tone={st.ok ? "good" : "bad"}>{st.id}</Chip><span className="text-muted-foreground">{st.note}</span></li>)}</ul>
          </div>
        )}
        {stale && (
          <div className="mt-4 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm space-y-1">
            <p className="font-medium">Set up the every-30-minutes trigger (one time)</p>
            <ol className="list-decimal pl-5 text-xs space-y-0.5">
              <li>In Vercel → Project → Settings → Environment Variables, add <code>CRON_SECRET</code> (any long random text) and redeploy. The daily backup run then starts by itself.</li>
              <li>On cron-job.org create a job: GET <code>https://dreamteamos.vercel.app/api/devos</code>, header <code>x-cron-secret: &lt;the same text&gt;</code>, every 30 minutes.</li>
              <li>Until then, the app catches up on the server whenever someone opens the Development OS.</li>
            </ol>
          </div>
        )}
        <Note className="mt-3">AI: Gemini, using the same keys as the ad studio (plus working keys in AI Accounts). Free-tier keys may let Google use the text sent for product improvement — only scenarios, rubrics and answers are sent, never names. For production use, a paid key is recommended.</Note>
      </Section>
    </div>
  );
}

function Reports() {
  const { isPlatformAdmin, run, busy } = useDevOs();
  const { data, loading, reload } = useAdminData<DevReport[]>("admin.reports");
  const generate = async () => {
    const r = await run<DevReport>("admin.report", {}, { label: "report" });
    if (r) await reload();
  };
  if (loading && !data) return <Loading />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">{isPlatformAdmin && <Button size="sm" className="min-h-[36px]" disabled={busy === "report"} onClick={generate} data-test="admin-report-now">{busy === "report" && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}Write today's report now</Button>}</div>
      {data?.length ? data.map((r) => (
        <Section key={r.id} title={`Report · ${r.period.to}`} hint={`${r.generator === "ai" ? `Written by AI (${r.model}) from the facts below` : "Written from the facts below"} · every claim cites its facts; inferences are marked as hypotheses`}>
          <ul className="space-y-2">
            {r.claims.map((c, i) => (
              <li key={i} className="text-sm flex gap-2">
                <Chip tone={c.kind === "fact" ? "good" : "warn"}>{c.kind === "fact" ? "fact" : "hypothesis"}</Chip>
                <span>{c.text} <span className="text-xs text-muted-foreground">[{c.facts.join(", ")}]</span></span>
              </li>
            ))}
          </ul>
          {r.nextActions.length > 0 && <div className="mt-3"><p className="text-sm font-medium">Next actions</p><ul className="list-disc pl-5 text-sm">{r.nextActions.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
          <details className="mt-3"><summary className="text-xs text-muted-foreground cursor-pointer">The facts ({r.facts.length})</summary><ul className="text-xs mt-1 space-y-0.5">{r.facts.map((f) => <li key={f.id}><strong>{f.id}</strong> {f.text}</li>)}</ul></details>
        </Section>
      )) : <Empty>No reports yet — the scheduled worker writes one every working day.</Empty>}
    </div>
  );
}

function Audit() {
  const { data, loading } = useAdminData<Record<string, unknown>[]>("admin.audit");
  if (loading && !data) return <Loading />;
  return (
    <Section title="Audit trail" hint="Every admin change and export, signed; a row edited outside the server shows as tampered.">
      {data?.length ? (
        <ul className="divide-y divide-border text-sm">
          {data.map((a) => (
            <li key={String(a.id)} className="py-2 flex flex-wrap items-center justify-between gap-2">
              <span><strong>{String(a.actorName || a.actor)}</strong> · {String(a.action).replace(/_/g, " ")} · <span className="text-muted-foreground">{String(a.target)}</span>{a.detail ? <span className="text-xs text-muted-foreground"> — {String(a.detail)}</span> : null}</span>
              <span className="flex items-center gap-2"><Chip tone={a.integrity === "tampered" ? "bad" : a.integrity === "ok" ? "good" : "muted"}>{String(a.integrity)}</Chip><span className="text-xs text-muted-foreground">{fmtDateTime(Number(a.at))}</span></span>
            </li>
          ))}
        </ul>
      ) : <Empty>No admin actions yet.</Empty>}
    </Section>
  );
}

function Exceptions() {
  const { data, loading } = useAdminData<{ corrections: Record<string, unknown>[]; queue: { uid: string; kind: string; id: string; since: number }[] }>("admin.exceptions");
  if (loading && !data) return <Loading />;
  return (
    <div className="space-y-4">
      <Section title="Waiting for grading" hint="Answers the graders could not settle yet — the scheduled worker retries them (bounded); after the limit they never count against the person.">
        {data?.queue.length ? <ul className="text-sm space-y-1">{data.queue.map((q) => <li key={`${q.uid}-${q.id}`} className="flex justify-between gap-2"><Link className="hover:underline" to={`/dev-os/admin/people/${q.uid}`}>{q.kind} {q.id}</Link><span className="text-xs text-muted-foreground">since {fmtDateTime(q.since)}</span></li>)}</ul> : <Note>Nothing waiting.</Note>}
      </Section>
      <Section title="Reviews and corrections (30 days)" hint="Appeals, re-grades and platform-fault voids. The original results are always kept.">
        {data?.corrections.length ? (
          <ul className="divide-y divide-border text-sm">
            {data.corrections.map((c) => (
              <li key={String(c.id)} className="py-2">
                <div className="flex justify-between gap-2"><span><Chip tone={c.kind === "appeal" ? "info" : "warn"}>{String(c.kind).replace(/_/g, " ")}</Chip> <Link className="hover:underline" to={`/dev-os/admin/people/${String(c.uid)}`}>{String(c.attemptId)}</Link></span><span className="text-xs text-muted-foreground">{fmtDateTime(Number(c.at))}</span></div>
                <p className="text-xs text-muted-foreground mt-0.5">{(c.before as { score: number }).score}% → {(c.after as { score: number }).score}% · “{String(c.reason)}”{c.detail ? ` · ${String(c.detail)}` : ""}</p>
              </li>
            ))}
          </ul>
        ) : <Note>No reviews in the last 30 days.</Note>}
      </Section>
    </div>
  );
}

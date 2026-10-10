import { useMemo, useState } from "react";
import { Check, CheckCircle2, Copy, Download, Eye, EyeOff, Info, Loader2, Search, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { buttonClass, fieldClass } from "./AiModal";
import { prettyDate } from "./FlowAccountDialog";
import { checkGeminiApiKey, removeFlowApiKey, saveApiKeyChecks, setApiKeysInUse, type Actor, type Person } from "@/services/aiAccounts";
import type { FlowAccount, GeminiApiKey } from "@/types/aiAccounts";
import {
  ADGEN_ENV_KEY_LIMIT, API_KEY_STATUS, ENV_KEY_PREFIX, duplicateFingerprints, envFileName, groupKeysByOwner, keysAsEnvFile, keysAsText, maskApiKey, usableKeys,
  type KeyCheck,
} from "@/utils/geminiKeys";
import { todayStr } from "@/utils/flowCredits";
import { copyText, downloadText } from "@/lib/clipboard";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/useConfirm";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "working" | "failed" | "unchecked" | "in_use" | "not_in_use";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const msToDate = (ms?: number) => (ms ? todayStr(new Date(ms)) : "");

/**
 * The tech admin's API keys — only the Gemini keys the team made in its Flow accounts, by person
 * (2026-10-10, utils/geminiKeys). Select any set and copy it (one per line), download it as a .env for
 * Vercel, label it "in use", or check it with Google. AdGen reads its keys from Vercel, so "in use" is
 * the admin's own record of what is deployed; a key Google refuses is left out of every copy and .env.
 */
export default function ApiKeysPanel({
  keys, loading, accounts, people, actor,
}: {
  keys: GeminiApiKey[];
  loading: boolean;
  /** The team's Flow accounts — who still has accounts without a key. */
  accounts: FlowAccount[];
  people: Person[];
  actor: Actor;
}) {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [search, setSearch] = useState("");
  const [person, setPerson] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [checking, setChecking] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const owners = useMemo(() => Object.fromEntries(people.map((p) => [p.uid, p])), [people]);
  const dupes = useMemo(() => duplicateFingerprints(keys), [keys]);
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return keys.filter((k) => {
      const matches = !term || [k.accountEmail, k.ownerName, k.addedByName].some((v) => (v || "").toLowerCase().includes(term));
      const inStatus = status === "all"
        || (status === "in_use" && !!k.inUse) || (status === "not_in_use" && !k.inUse)
        || k.status === status;
      return matches && inStatus && (!person || k.ownerId === person);
    });
  }, [keys, search, status, person]);
  const groups = useMemo(() => groupKeysByOwner(shown), [shown]);
  /** In the order they are listed — the order of the .env's API_KEY_1, 2, 3 … */
  const ordered = useMemo(() => groups.flatMap((g) => g.keys), [groups]);
  const picked = ordered.filter((k) => selected.has(k.id));
  // Every set action works on the ticked keys, or on everything shown when none is ticked.
  const target = picked.length ? picked : ordered;
  const targetLabel = picked.length ? `${picked.length} selected` : `${ordered.length} shown`;

  const missingByOwner = useMemo(() => {
    const out = new Map<string, { name: string; count: number }>();
    for (const a of accounts) {
      if (a.apiKey && a.apiKey.status !== "failed") continue;
      const row = out.get(a.ownerId) || { name: a.ownerName || "—", count: 0 };
      row.count += 1;
      out.set(a.ownerId, row);
    }
    return [...out.entries()].map(([uid, v]) => ({ uid, ...v })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [accounts]);
  const missingTotal = missingByOwner.reduce((sum, m) => sum + m.count, 0);
  const stats = {
    keys: keys.length,
    working: keys.filter((k) => k.status === "working").length,
    failed: keys.filter((k) => k.status === "failed").length,
    inUse: keys.filter((k) => k.inUse).length,
  };

  const toggle = (set: Set<string>, ids: string[], on: boolean) => {
    const next = new Set(set);
    for (const id of ids) { if (on) next.add(id); else next.delete(id); }
    return next;
  };
  const allShownPicked = ordered.length > 0 && ordered.every((k) => selected.has(k.id));

  const copySet = async () => {
    const { keys: out, leftOut } = usableKeys(target);
    if (!out.length) return toast({ title: "No working keys to copy", description: leftOut ? "Every key here is one Google refused." : undefined, variant: "destructive" });
    const ok = await copyText(keysAsText(out));
    toast(ok
      ? { title: `Copied ${plural(out.length, "key")}`, description: `One per line.${leftOut ? ` ${plural(leftOut, "key")} Google refused ${leftOut === 1 ? "was" : "were"} left out.` : ""}` }
      : { title: "Copy failed", description: "Download the .env instead.", variant: "destructive" });
  };

  const downloadEnv = () => {
    const { keys: out, leftOut } = usableKeys(target);
    if (!out.length) return toast({ title: "No working keys to download", variant: "destructive" });
    const today = todayStr();
    downloadText(envFileName(today), keysAsEnvFile(out, { date: prettyDate(today), byName: actor.name }));
    const notes = [
      leftOut ? `${plural(leftOut, "key")} Google refused ${leftOut === 1 ? "was" : "were"} left out.` : "",
      out.length > ADGEN_ENV_KEY_LIMIT ? `AdGen reads only the first ${ADGEN_ENV_KEY_LIMIT}; the rest are in the file for later.` : "",
    ].filter(Boolean).join(" ");
    toast({ title: `Downloaded ${plural(out.length, "key")} as a .env`, description: notes || `${ENV_KEY_PREFIX}1 … ${ENV_KEY_PREFIX}${out.length}` });
  };

  const markInUse = async (list: GeminiApiKey[], inUse: boolean) => {
    if (!list.length || busy) return;
    setBusy(true);
    try {
      await setApiKeysInUse(list, inUse, actor);
      toast({ title: inUse ? `${plural(list.length, "key")} marked in use` : `${plural(list.length, "key")} marked not in use` });
      if (list.length > 1) setSelected(new Set());
    } catch (err) {
      toast({ title: "Could not save that", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  /** Asks Google about each key — four at a time — then saves every answer together. */
  const checkKeys = async (list: GeminiApiKey[]) => {
    if (!list.length || checking) return;
    setChecking({ done: 0, total: list.length });
    const results: { key: GeminiApiKey; check: KeyCheck }[] = [];
    let next = 0;
    const worker = async () => {
      while (next < list.length) {
        const key = list[next++];
        results.push({ key, check: await checkGeminiApiKey(key.key) });
        setChecking({ done: results.length, total: list.length });
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(4, list.length) }, worker));
      await saveApiKeyChecks(results, owners);
      const failed = results.filter((r) => r.check.status === "failed").length;
      const unreached = results.filter((r) => r.check.status === "unchecked").length;
      toast({
        title: `Checked ${plural(results.length, "key")}`,
        description: [`${results.length - failed - unreached} working`, failed ? `${failed} not working — their owners were told` : "", unreached ? `${unreached} not reached` : ""].filter(Boolean).join(" · "),
        ...(failed ? { variant: "destructive" as const } : {}),
      });
    } catch (err) {
      toast({ title: "Could not save the results", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    } finally {
      setChecking(null);
    }
  };

  const remove = async (key: GeminiApiKey) => {
    const { confirmed } = await confirm({
      title: "Remove this API key?",
      description: `${key.accountEmail} goes back to "no key"${key.ownerId !== actor.uid ? `, and ${key.ownerName} is asked to add a new one` : ""}. If it is in Vercel, take it out there too.`,
      confirmText: "Remove",
      variant: "destructive",
    });
    if (!confirmed) return;
    try { await removeFlowApiKey(key, actor, owners[key.ownerId]); toast({ title: "API key removed" }); }
    catch (err) { toast({ title: "Could not remove it", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" }); }
  };

  const copyOne = async (key: GeminiApiKey) => {
    if (await copyText(key.key)) { setCopiedId(key.id); setTimeout(() => setCopiedId((id) => (id === key.id ? null : id)), 1500); }
    else toast({ title: "Copy failed", description: "Tap the eye and copy it by hand.", variant: "destructive" });
  };

  if (loading) return <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4" data-test="api-keys-panel">
      {ConfirmDialog}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "API keys", value: stats.keys, sub: `from ${accounts.length} Flow accounts` },
          { label: "Working", value: stats.working, sub: "Google accepts them", tone: "text-success" },
          { label: "Not working", value: stats.failed, sub: "left out of copies", tone: stats.failed ? "text-destructive" : "" },
          { label: "In use", value: stats.inUse, sub: "marked deployed" },
          { label: "Accounts without a key", value: missingTotal, sub: "members still to add" },
        ].map((c) => (
          <div key={c.label} className="bg-card border border-border rounded-xl p-3 min-w-0" data-test={`keys-stat-${c.label}`}>
            <p className="text-[11px] text-muted-foreground truncate">{c.label}</p>
            <p className={cn("font-display text-xl font-bold text-foreground", c.tone)}>{c.value}</p>
            <p className="text-[10px] text-muted-foreground truncate">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 text-primary mt-px" />
        <p>
          DTS AdGen reads its keys from Vercel (<span className="font-mono">{ENV_KEY_PREFIX}1</span> … <span className="font-mono">{ENV_KEY_PREFIX}{ADGEN_ENV_KEY_LIMIT}</span>).
          Choose the keys, <b className="text-foreground">Download .env</b>, paste it in Vercel → Settings → Environment Variables, redeploy — then <b className="text-foreground">Mark in use</b>.
          Keys Google refuses are left out of every copy and download.
        </p>
      </div>

      {missingByOwner.length ? (
        <div className="text-xs text-muted-foreground" data-test="keys-missing">
          <span className="font-medium text-foreground">Still to add a key: </span>
          {missingByOwner.map((m, i) => (
            <span key={m.uid}>{i ? " · " : ""}{m.name} <b className="text-foreground">{m.count}</b></span>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input className={`${fieldClass} pl-8`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search person or account email" data-test="keys-search" />
        </div>
        <select className={`${fieldClass} sm:w-48`} value={person} onChange={(e) => setPerson(e.target.value)} data-test="keys-person">
          <option value="">Everyone</option>
          {groupKeysByOwner(keys).map((g) => <option key={g.ownerId} value={g.ownerId}>{g.ownerName} ({g.keys.length})</option>)}
        </select>
        <select className={`${fieldClass} sm:w-44`} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} data-test="keys-status">
          <option value="all">All keys</option>
          <option value="working">Working</option>
          <option value="failed">Not working</option>
          <option value="unchecked">Not checked</option>
          <option value="in_use">In use</option>
          <option value="not_in_use">Not in use</option>
        </select>
      </div>

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/95 backdrop-blur px-3 py-2" data-test="keys-actions">
        <label className="inline-flex items-center gap-2 text-xs font-medium text-foreground mr-auto min-h-[24px] cursor-pointer">
          <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={allShownPicked} disabled={!ordered.length}
            onChange={(e) => setSelected((s) => toggle(s, ordered.map((k) => k.id), e.target.checked))} data-test="keys-select-all" />
          {picked.length ? `${picked.length} selected` : "Select all"}
          {picked.length ? <button type="button" className="text-primary hover:underline" onClick={() => setSelected(new Set())}>Clear</button> : null}
        </label>
        <button className={buttonClass.small} onClick={copySet} disabled={!target.length} data-test="keys-copy"><Copy className="h-3.5 w-3.5" /> Copy keys ({target.length})</button>
        <button className={`${buttonClass.small} border-primary/40 text-primary`} onClick={downloadEnv} disabled={!target.length} data-test="keys-env"><Download className="h-3.5 w-3.5" /> Download .env ({target.length})</button>
        <button className={buttonClass.small} onClick={() => checkKeys(target)} disabled={!target.length || !!checking} data-test="keys-check">
          {checking ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking {checking.done}/{checking.total}</> : <><ShieldCheck className="h-3.5 w-3.5" /> Check ({target.length})</>}
        </button>
        {picked.length ? (
          <>
            <button className={`${buttonClass.small} border-success/40 text-success`} onClick={() => markInUse(picked, true)} disabled={busy} data-test="keys-mark-in-use"><CheckCircle2 className="h-3.5 w-3.5" /> Mark in use</button>
            <button className={buttonClass.small} onClick={() => markInUse(picked, false)} disabled={busy} data-test="keys-mark-not-in-use"><XCircle className="h-3.5 w-3.5" /> Not in use</button>
          </>
        ) : null}
        <span className="w-full text-[10px] text-muted-foreground sm:w-auto">Acts on {targetLabel}</span>
      </div>

      {groups.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
          {keys.length ? "No key matches." : "No API keys yet. Members add one on each Flow account in My AI Accounts."}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const ids = g.keys.map((k) => k.id);
            const allPicked = ids.every((id) => selected.has(id));
            const missing = missingByOwner.find((m) => m.uid === g.ownerId)?.count || 0;
            return (
              <section key={g.ownerId} className="bg-card border border-border rounded-xl overflow-hidden" data-test="keys-group">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
                  <label className="inline-flex items-center gap-2 min-w-0 cursor-pointer min-h-[24px]">
                    <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={allPicked} onChange={(e) => setSelected((s) => toggle(s, ids, e.target.checked))} aria-label={`Select ${g.ownerName}'s keys`} />
                    <span className="font-display text-sm font-semibold text-foreground truncate">{g.ownerName}</span>
                  </label>
                  <span className="text-[11px] text-muted-foreground">
                    {plural(g.keys.length, "key")} · {g.keys.filter((k) => k.inUse).length} in use{missing ? <> · <span className="text-warning font-medium">{plural(missing, "account")} without a key</span></> : null}
                  </span>
                </div>
                <ul className="divide-y divide-border">
                  {g.keys.map((k) => {
                    const st = API_KEY_STATUS[k.status] || API_KEY_STATUS.unchecked;
                    const shownKey = revealed.has(k.id);
                    return (
                      <li key={k.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5" data-test="keys-row">
                        <label className="flex items-start gap-2 min-w-0 flex-1 basis-64 cursor-pointer">
                          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" checked={selected.has(k.id)}
                            onChange={(e) => setSelected((s) => toggle(s, [k.id], e.target.checked))} aria-label={`Select ${k.accountEmail}`} data-test="keys-row-select" />
                          <span className="min-w-0">
                            <span className="block font-mono text-xs font-semibold text-foreground truncate" title={k.accountEmail}>{k.accountEmail}</span>
                            <span className={cn("block font-mono text-[11px] text-muted-foreground", shownKey ? "break-all" : "truncate")} data-test="keys-row-key">
                              {shownKey ? k.key : maskApiKey(k.key)}
                            </span>
                            <span className="block text-[10px] text-muted-foreground">
                              added {prettyDate(msToDate(k.addedAt))}
                              {k.addedById !== k.ownerId ? ` by ${k.addedByName}` : ""}
                              {k.inUse && k.inUseAt ? ` · in use since ${prettyDate(msToDate(k.inUseAt))}` : ""}
                            </span>
                            {k.status === "failed" && k.statusMessage ? <span className="block text-[11px] text-destructive">{k.statusMessage}</span> : null}
                            {k.status === "failed" && k.inUse ? <span className="block text-[11px] font-medium text-destructive" data-test="keys-row-dead-in-use">It is marked in use — take it out of Vercel, then mark it not in use.</span> : null}
                            {dupes.has(k.fingerprint) ? <span className="block text-[11px] text-warning font-medium" data-test="keys-row-dupe">The same key is saved on another account.</span> : null}
                          </span>
                        </label>
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap", st.tone)} data-test="keys-row-status">{st.label}</span>
                          <button className={cn(buttonClass.small, k.inUse ? "border-success/50 bg-success/15 text-success" : "")} onClick={() => markInUse([k], !k.inUse)} disabled={busy}
                            aria-pressed={!!k.inUse} data-test="keys-row-in-use">
                            {k.inUse ? <><CheckCircle2 className="h-3.5 w-3.5" /> In use</> : "Mark in use"}
                          </button>
                          <button className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                            onClick={() => setRevealed((s) => toggle(s, [k.id], !s.has(k.id)))} aria-label={shownKey ? "Hide key" : "Show key"}>
                            {shownKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                          <button className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                            onClick={() => copyOne(k)} aria-label="Copy key" data-test="keys-row-copy">
                            {copiedId === k.id ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                          </button>
                          <button className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                            onClick={() => checkKeys([k])} disabled={!!checking} aria-label="Check this key with Google" data-test="keys-row-check">
                            <ShieldCheck className="h-4 w-4" />
                          </button>
                          <button className="h-8 w-8 inline-flex items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
                            onClick={() => remove(k)} aria-label="Remove key" data-test="keys-row-remove">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

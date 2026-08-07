/**
 * Bulk Video Orders — every high-volume order the team owes, on one screen.
 *
 * ── Why it is its own section rather than a filter on the queue ───────────────────────────────
 * The main queue answers "what jobs exist and who has them". Bulk work needs a different question
 * answered: not "is this order assigned" — an order can be assigned and still have six videos
 * nobody has started — but "how many videos are left, and who is making them". A row in a queue of
 * single ads cannot say that, so the numbers lived in somebody's head and the gap showed up at the
 * deadline.
 *
 * ── What it leads with, and why ───────────────────────────────────────────────────────────────
 * Four numbers across the top: ordered, given out, finished, still to make. Read left to right they
 * are the whole state of the department's bulk work in one line, and the one that matters most —
 * videos with nobody on them — is called out in its own colour, because that is the only number
 * somebody can act on right now.
 *
 * Then one card per client, least-finished first, each opening into the board where the videos are
 * actually handed out and ticked off. Client-wise rather than member-wise because a client is what
 * gets delivered and what gets chased; the per-member split is inside each card and totalled at
 * the bottom.
 */
import { useMemo, useState } from "react";
import { Boxes, CheckCircle2, Clock, Search, UserPlus, Users } from "lucide-react";
import {
  bulkSummary, clientProgress, memberProgressAcross, totalBulkStats,
} from "@/utils/bulkVideos";
import BulkVideoBoard from "@/components/work/BulkVideoBoard";
import { bulkCategoryLabel } from "@/utils/serviceCatalog";
import { formatPhoneDisplay } from "@/utils/phone";
import type { AppUser, Order } from "@/types";

export default function BulkOrdersSection({ orders, user, members }: {
  /** Bulk orders only — the caller decides which are live. */
  orders: Order[];
  user: Pick<AppUser, "uid" | "name" | "role"> | null;
  members: Pick<AppUser, "uid" | "name">[];
}) {
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  /** Hides everything already delivered — the default, because finished work is not a to-do. */
  const [hideDone, setHideDone] = useState(true);

  const clients = useMemo(() => clientProgress(orders), [orders]);
  const totals = useMemo(() => totalBulkStats(orders), [orders]);
  const team = useMemo(() => memberProgressAcross(orders), [orders]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (hideDone && c.stats.pending === 0) return false;
      if (!q) return true;
      // Searchable by whoever is asking: the client, their number, or the member making them.
      return [c.clientName, c.order.clientPhone, c.order.packageKey, ...c.members.map((m) => m.name)]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [clients, search, hideDone]);

  const doneCount = clients.filter((c) => c.stats.pending === 0).length;

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center" data-test="bulk-section-empty">
        <Boxes className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground">No bulk video orders yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          When the sales team sells a batch of videos, it will appear here to be shared across the team.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-test="bulk-orders-section">
      {/* The department in four numbers. Big, plain words, no jargon. */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4" data-test="bulk-totals">
        <Tile
          label="Videos ordered" value={totals.total} tone="neutral" icon={Boxes}
          hint={`${clients.length} client${clients.length === 1 ? "" : "s"}`}
        />
        <Tile
          label="Given to the team" value={totals.assigned} tone="info" icon={Users}
          hint="being made now"
        />
        <Tile
          label="Finished" value={totals.completed} tone="success" icon={CheckCircle2}
          hint={`${totals.percent}% of everything`}
        />
        {/*
          The action item. Coloured as a warning only when it is non-zero — a red 0 trains people
          to ignore the colour, and then it cannot warn about anything.
        */}
        <Tile
          label="Not given out" value={totals.unassigned}
          tone={totals.unassigned > 0 ? "warn" : "success"}
          icon={totals.unassigned > 0 ? UserPlus : CheckCircle2}
          hint={totals.unassigned > 0 ? "nobody is making these" : "everything has an owner"}
        />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search a client or a team member…"
            data-test="bulk-search"
            className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
        {doneCount > 0 && (
          <button
            type="button"
            onClick={() => setHideDone((v) => !v)}
            data-test="bulk-toggle-done"
            className={`h-9 rounded-lg border px-3 text-xs font-medium transition-colors ${
              hideDone ? "border-border bg-card text-muted-foreground hover:bg-accent" : "border-primary bg-primary/10 text-primary"
            }`}
          >
            {hideDone ? `Show ${doneCount} delivered` : "Hide delivered"}
          </button>
        )}
      </div>

      {/* One card per client. */}
      <div className="space-y-2">
        {shown.map(({ order, clientName, stats, members: onIt }) => {
          const isOpen = openId === order.id;
          const finished = stats.pending === 0;
          return (
            <div
              key={order.id}
              data-test="bulk-client-card"
              data-client={clientName}
              className={`rounded-xl border bg-card transition-colors ${
                finished ? "border-green-500/40" : stats.unassigned > 0 ? "border-warning/50" : "border-border"
              }`}
            >
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : order.id)}
                className="flex w-full items-center gap-3 p-3 text-left"
              >
                {/* A ring, because a percentage you have to read is slower than one you can see. */}
                <span
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                    finished ? "text-green-600 dark:text-green-400" : "text-indigo-600 dark:text-indigo-400"
                  }`}
                  style={{
                    background: `conic-gradient(currentColor ${stats.percent * 3.6}deg, hsl(var(--muted)) 0deg)`,
                  }}
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-card">{stats.percent}%</span>
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-foreground">{clientName}</span>
                    {finished && <CheckCircle2 size={13} className="shrink-0 text-green-600 dark:text-green-400" />}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {bulkCategoryLabel(order.category, order.bulkAdType)}
                    {order.clientPhone ? ` · ${formatPhoneDisplay(order.clientPhone)}` : ""}
                  </span>
                  <span className="mt-0.5 block text-[11px] font-medium text-foreground" data-test="bulk-client-summary">
                    {bulkSummary(stats)}
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  <span className="block font-mono text-lg font-bold text-foreground">
                    {stats.completed}<span className="text-xs text-muted-foreground">/{stats.total}</span>
                  </span>
                  {stats.unassigned > 0 && (
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold text-warning">
                      <Clock size={9} /> {stats.unassigned} free
                    </span>
                  )}
                </span>
              </button>

              {/* Who is on it, without having to open the card. */}
              {onIt.length > 0 && !isOpen && (
                <div className="flex flex-wrap gap-1 px-3 pb-2.5">
                  {onIt.map((m) => (
                    <span
                      key={m.uid}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {m.name}
                      <span className={`font-mono font-bold ${m.pending === 0 ? "text-green-600 dark:text-green-400" : "text-foreground"}`}>
                        {m.completed}/{m.assigned}
                      </span>
                    </span>
                  ))}
                </div>
              )}

              {isOpen && (
                <div className="border-t border-border p-3">
                  <BulkVideoBoard order={order} user={user} members={members} />
                </div>
              )}
            </div>
          );
        })}

        {shown.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground" data-test="bulk-no-match">
            {search.trim() ? `Nothing matches “${search.trim()}”.` : "Every bulk order has been delivered."}
          </p>
        )}
      </div>

      {/* The team, across every bulk order at once — who is loaded and who is free. */}
      {team.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-3" data-test="bulk-team-progress">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-foreground">
            <Users size={13} className="text-muted-foreground" /> Team progress across all bulk orders
          </p>
          <div className="space-y-1.5">
            {team.map((m) => (
              <div key={m.uid} className="flex items-center gap-2" data-test={`bulk-team-${m.uid}`}>
                <span className="w-28 shrink-0 truncate text-xs font-medium text-foreground">{m.name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className={`block h-full rounded-full transition-all ${m.percent >= 100 ? "bg-green-500" : "bg-indigo-500"}`}
                    style={{ width: `${m.percent}%` }}
                  />
                </span>
                <span className="w-24 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                  {m.completed}/{m.assigned} done
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** One headline number. Deliberately large — this row is read from across a desk. */
function Tile({ label, value, hint, tone, icon: Icon }: {
  label: string;
  value: number;
  hint: string;
  tone: "neutral" | "info" | "success" | "warn";
  icon: typeof Boxes;
}) {
  const tones = {
    neutral: "border-border bg-card text-foreground",
    info: "border-indigo-500/30 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400",
    success: "border-green-500/30 bg-green-500/5 text-green-600 dark:text-green-400",
    warn: "border-warning/50 bg-warning/10 text-warning",
  } as const;

  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`} data-test={`bulk-tile-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center gap-1.5">
        <Icon size={13} className="shrink-0" />
        <span className="truncate text-[11px] font-medium opacity-90">{label}</span>
      </div>
      <p className="font-display mt-0.5 text-2xl font-bold leading-none">{value}</p>
      <p className="mt-1 truncate text-[10px] opacity-70">{hint}</p>
    </div>
  );
}

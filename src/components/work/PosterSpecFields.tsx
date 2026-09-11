/**
 * The poster brief — size, style, occasion (and, on an assignment, how many) — in one block.
 *
 * Used by every place a poster is specified: both New Assignment forms, the three assignment
 * editors, and the AI Platform's Poster Creation panel. One component so the tech admin, the team
 * leader and the member making the poster can never be offered different sizes or different styles.
 *
 * Size is a preset chip (4:5 by default), or Custom → typed as a ratio (5 : 7) or as pixels
 * (1080 × 1350). Style is a card grid from the team's library (services/posterStyles). The occasion
 * is optional: the upcoming festivals and days, soonest first, or anything typed.
 */
import { useMemo, useState } from "react";
import { Lock } from "lucide-react";
import {
  POSTER_RATIO_PRESETS, DEFAULT_POSTER_SIZE, parsePosterSize, posterSizeLabel, tryParsePosterSize,
  POSTER_MIN_PIXELS, POSTER_MAX_PIXELS, POSTER_MAX_RATIO_PART,
} from "@/utils/posterSpec";
import { posterStyleOptions, getPosterStyle, AUTO_POSTER_STYLE, posterStyleLabel } from "@/services/posterStyles";
import { upcomingPosterOccasions, upcomingOccasionLabel } from "@/utils/posterOccasions";

export interface PosterSpecPatch {
  posterSize?: string;
  posterStyle?: string;
  occasion?: string;
  posterCount?: number;
}

interface PosterSpecFieldsProps {
  posterSize: string;
  posterStyle: string;
  occasion: string;
  posterCount?: number;
  onChange: (patch: PosterSpecPatch) => void;
  /** `sm` for the compact edit dialogs; `md` for Work Assign and the AI Platform. */
  size?: "sm" | "md";
  /** Show the "how many posters" field — assignments only. */
  showCount?: boolean;
  /** Fields fixed by the assignment: shown, not editable. */
  locked?: { size?: boolean; style?: boolean; occasion?: boolean };
  /** Override "today" (tests). */
  today?: Date;
  className?: string;
}

const CUSTOM_OCCASION = "__custom_occasion__";

/** A tiny outline of the canvas shape, so 4:5 and 9:16 are told apart at a glance. */
function ShapeIcon({ value, active }: { value: string; active: boolean }) {
  const s = parsePosterSize(value);
  const max = 18;
  const w = s.width >= s.height ? max : Math.max(6, Math.round((max * s.width) / s.height));
  const h = s.height >= s.width ? max : Math.max(6, Math.round((max * s.height) / s.width));
  return (
    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center" aria-hidden>
      <span
        style={{ width: w, height: h }}
        className={`rounded-[3px] border-2 ${active ? "border-primary bg-primary/15" : "border-muted-foreground/50"}`}
      />
    </span>
  );
}

function LockedValue({ label, value, sm }: { label: string; value: string; sm: boolean }) {
  return (
    <div>
      <label className={sm ? "block text-[11px] font-medium text-muted-foreground mb-1" : "block text-sm font-medium text-muted-foreground mb-1"}>{label}</label>
      <div className={`flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 ${sm ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"} text-foreground`}>
        <span className="truncate font-medium">{value}</span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          <Lock className="h-3 w-3" /> Fixed by assignment
        </span>
      </div>
    </div>
  );
}

export default function PosterSpecFields({
  posterSize, posterStyle, occasion, posterCount, onChange,
  size = "md", showCount = false, locked, today, className = "",
}: PosterSpecFieldsProps) {
  const sm = size === "sm";
  const label = sm ? "block text-[11px] font-medium text-muted-foreground mb-1" : "block text-sm font-medium text-muted-foreground mb-1";
  const field = sm
    ? "w-full border rounded-lg px-2.5 py-1.5 text-xs bg-background text-foreground border-border placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20"
    : "w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 outline-none";

  // ── Size ────────────────────────────────────────────────────────────────────────────────
  const current = tryParsePosterSize(posterSize) ?? parsePosterSize(DEFAULT_POSTER_SIZE);
  const isPreset = current.kind === "preset";
  const [customOpen, setCustomOpen] = useState(!isPreset);
  const [customMode, setCustomMode] = useState<"ratio" | "pixels">(current.kind === "pixels" ? "pixels" : "ratio");
  const [ratioW, setRatioW] = useState(current.kind === "ratio" ? current.ratio.split(":")[0] : "5");
  const [ratioH, setRatioH] = useState(current.kind === "ratio" ? current.ratio.split(":")[1] : "7");
  const [pxW, setPxW] = useState(current.kind === "pixels" ? String(current.width) : "1080");
  const [pxH, setPxH] = useState(current.kind === "pixels" ? String(current.height) : "1350");
  const showCustom = customOpen || !isPreset;

  const customValue = customMode === "ratio" ? `${ratioW}:${ratioH}` : `${pxW}x${pxH}`;
  const customValid = tryParsePosterSize(customValue) !== null;

  const applyCustom = (mode: "ratio" | "pixels", a: string, b: string) => {
    const value = mode === "ratio" ? `${a}:${b}` : `${a}x${b}`;
    if (tryParsePosterSize(value)) onChange({ posterSize: value });
  };

  // ── Occasion ────────────────────────────────────────────────────────────────────────────
  const upcoming = useMemo(() => upcomingPosterOccasions(today ?? new Date(), 120), [today]);
  const listed = upcoming.some((o) => o.name === occasion);
  const [customOccasionOpen, setCustomOccasionOpen] = useState(!!occasion && !listed);
  const occasionSelectValue = occasion && listed ? occasion : (customOccasionOpen || occasion) ? CUSTOM_OCCASION : "";

  const style = getPosterStyle(posterStyle);

  return (
    <div className={`space-y-4 ${className}`} data-test="poster-spec">
      {/* Size */}
      {locked?.size ? (
        <LockedValue label="Poster size" value={posterSizeLabel(posterSize)} sm={sm} />
      ) : (
        <div>
          <label className={label}>Poster size</label>
          <div className={`grid grid-cols-2 sm:grid-cols-5 ${sm ? "gap-1.5" : "gap-2"}`}>
            {POSTER_RATIO_PRESETS.map((p) => {
              const active = !showCustom && current.value === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  data-test={`poster-size-${p.value}`}
                  onClick={() => { setCustomOpen(false); onChange({ posterSize: p.value }); }}
                  title={p.hint}
                  className={`flex items-center gap-2 rounded-lg border text-left transition-colors ${sm ? "px-2 py-1.5" : "px-2.5 py-2"} ${
                    active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <ShapeIcon value={p.value} active={active} />
                  <span className="min-w-0 leading-tight">
                    <span className={`block font-mono font-semibold ${sm ? "text-xs" : "text-sm"}`}>{p.label}</span>
                    <span className="block truncate text-[10px] opacity-75">{p.hint}</span>
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              data-test="poster-size-custom"
              onClick={() => setCustomOpen(true)}
              className={`flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors ${sm ? "px-2 py-1.5 text-xs" : "px-2.5 py-2 text-sm"} ${
                showCustom ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              ✏️ Custom
            </button>
          </div>

          {showCustom && (
            <div className="mt-2 rounded-lg border border-border bg-muted/30 p-2.5 space-y-2" data-test="poster-size-custom-panel">
              <div className="inline-flex rounded-lg border border-border bg-background p-0.5 text-[11px] font-medium">
                {(["ratio", "pixels"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    data-test={`poster-custom-${m}`}
                    onClick={() => { setCustomMode(m); applyCustom(m, m === "ratio" ? ratioW : pxW, m === "ratio" ? ratioH : pxH); }}
                    className={`rounded-md px-2.5 py-1 transition-colors ${customMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {m === "ratio" ? "By ratio" : "By pixels"}
                  </button>
                ))}
              </div>
              {customMode === "ratio" ? (
                <div className="flex items-center gap-2">
                  <input type="number" min={1} max={POSTER_MAX_RATIO_PART} value={ratioW} data-test="poster-ratio-w"
                    onChange={(e) => { setRatioW(e.target.value); applyCustom("ratio", e.target.value, ratioH); }}
                    className={`${field} w-20 text-center font-mono`} aria-label="Ratio width" />
                  <span className="font-mono text-muted-foreground">:</span>
                  <input type="number" min={1} max={POSTER_MAX_RATIO_PART} value={ratioH} data-test="poster-ratio-h"
                    onChange={(e) => { setRatioH(e.target.value); applyCustom("ratio", ratioW, e.target.value); }}
                    className={`${field} w-20 text-center font-mono`} aria-label="Ratio height" />
                  <span className="hidden text-[11px] text-muted-foreground sm:inline">width : height</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input type="number" min={POSTER_MIN_PIXELS} max={POSTER_MAX_PIXELS} value={pxW} data-test="poster-px-w"
                    onChange={(e) => { setPxW(e.target.value); applyCustom("pixels", e.target.value, pxH); }}
                    className={`${field} w-24 text-center font-mono`} aria-label="Width in pixels" />
                  <span className="font-mono text-muted-foreground">×</span>
                  <input type="number" min={POSTER_MIN_PIXELS} max={POSTER_MAX_PIXELS} value={pxH} data-test="poster-px-h"
                    onChange={(e) => { setPxH(e.target.value); applyCustom("pixels", pxW, e.target.value); }}
                    className={`${field} w-24 text-center font-mono`} aria-label="Height in pixels" />
                  <span className="text-[11px] text-muted-foreground">px</span>
                </div>
              )}
              {!customValid && (
                <p className="text-[11px] text-destructive">
                  {customMode === "ratio"
                    ? `Use two whole numbers from 1 to ${POSTER_MAX_RATIO_PART}.`
                    : `Use a width and height between ${POSTER_MIN_PIXELS} and ${POSTER_MAX_PIXELS} px.`}
                </p>
              )}
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-muted-foreground" data-test="poster-size-summary">
            Canvas: <span className="font-medium text-foreground">{posterSizeLabel(posterSize)}</span>
          </p>
        </div>
      )}

      {/* Style */}
      {locked?.style ? (
        <LockedValue label="Poster style" value={posterStyleLabel(posterStyle)} sm={sm} />
      ) : (
        <div>
          <label className={label}>Poster style</label>
          <div className={`grid grid-cols-2 ${sm ? "sm:grid-cols-3 gap-1.5" : "sm:grid-cols-3 gap-2"}`}>
            {posterStyleOptions().map((o) => {
              const active = (posterStyle || AUTO_POSTER_STYLE) === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  data-test={`poster-style-${o.id}`}
                  onClick={() => onChange({ posterStyle: o.id })}
                  title={o.short}
                  className={`flex items-start gap-2 rounded-lg border text-left transition-colors ${sm ? "px-2 py-1.5" : "px-2.5 py-2"} ${
                    active ? "border-primary bg-primary/10 ring-1 ring-primary/30" : "border-border hover:bg-accent"
                  }`}
                >
                  <span className={sm ? "text-base leading-none" : "text-lg leading-none"} aria-hidden>{o.emoji}</span>
                  <span className="min-w-0">
                    <span className={`block font-semibold leading-tight ${sm ? "text-[11px]" : "text-xs"} ${active ? "text-primary" : "text-foreground"}`}>{o.label}</span>
                    <span className="block text-[10px] italic leading-tight text-muted-foreground">{o.keyword}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground" data-test="poster-style-explainer">
            {style
              ? <><b className="text-foreground">{style.label}:</b> {style.short}. e.g. {style.references[0].visual.toLowerCase()}.</>
              : <><b className="text-foreground">Best fit:</b> the AI reads the business and picks the strongest style for each concept, using at least two different styles.</>}
          </p>
        </div>
      )}

      {/* Occasion */}
      {locked?.occasion ? (
        <LockedValue label="Occasion" value={occasion || "No occasion — commercial poster"} sm={sm} />
      ) : (
        <div>
          <label className={label}>
            Occasion / festival <span className="font-normal text-muted-foreground/70">(optional)</span>
          </label>
          <select
            value={occasionSelectValue}
            data-test="poster-occasion"
            onChange={(e) => {
              const v = e.target.value;
              if (v === CUSTOM_OCCASION) { setCustomOccasionOpen(true); onChange({ occasion: listed ? "" : occasion }); return; }
              setCustomOccasionOpen(false);
              onChange({ occasion: v });
            }}
            className={field}
          >
            <option value="">No occasion — commercial poster</option>
            {upcoming.length > 0 && (
              <optgroup label="Coming up (soonest first)">
                {upcoming.map((o) => (
                  <option key={`${o.date}-${o.name}`} value={o.name}>{upcomingOccasionLabel(o)}</option>
                ))}
              </optgroup>
            )}
            <option value={CUSTOM_OCCASION}>Type another festival or day…</option>
          </select>
          {occasionSelectValue === CUSTOM_OCCASION && (
            <input
              type="text"
              value={occasion}
              autoFocus={customOccasionOpen && !occasion}
              data-test="poster-occasion-custom"
              onChange={(e) => onChange({ occasion: e.target.value })}
              placeholder="e.g. Bathukamma, Shop anniversary, World Photography Day"
              className={`${field} mt-1.5`}
            />
          )}
          {occasion && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              The style carries the idea; <b className="text-foreground">{occasion}</b> becomes the theme and the greeting.
            </p>
          )}
        </div>
      )}

      {showCount && (
        <div className="max-w-[12rem]">
          <label className={label}>Number of posters</label>
          <input
            type="number"
            min={1}
            max={50}
            value={posterCount ?? 1}
            data-test="poster-count"
            onChange={(e) => onChange({ posterCount: Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 1)) })}
            className={field}
          />
        </div>
      )}
    </div>
  );
}

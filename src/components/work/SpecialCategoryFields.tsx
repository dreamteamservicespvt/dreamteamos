/**
 * The special-category block of the New Assignment form.
 *
 * The tech admin's and the team leader's Work Assign pages are near-identical copies of each other,
 * which is exactly how the two drifted apart before. This block exists once so a new character duo
 * — or a change to how the location question is asked — lands on both pages at the same time.
 *
 * Selecting a pack replaces the human model outright, so the caller hides its own Model and Attire
 * fields while `characterPack` is set; there is no person to dress.
 */
import { characterPackOptions, getCharacterPack } from '@/services/characterPacks';

interface SpecialCategoryFieldsProps {
  characterPack: string;
  realLocationProvided: boolean;
  onChange: (patch: { characterPack?: string; realLocationProvided?: boolean }) => void;
}

export default function SpecialCategoryFields({ characterPack, realLocationProvided, onChange }: SpecialCategoryFieldsProps) {
  const pack = getCharacterPack(characterPack);

  return (
    <div>
      <label className="block text-sm font-medium text-muted-foreground mb-1">Special Category</label>
      <select
        value={characterPack}
        onChange={(e) => onChange({ characterPack: e.target.value })}
        className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none"
      >
        <option value="">Normal ad (with a model)</option>
        {characterPackOptions().map((o) => (
          <option key={o.id} value={o.id}>🎭 {o.label}</option>
        ))}
      </select>

      {pack && (
        <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 space-y-2">
          <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
            <b>{pack.label}</b> — {pack.tagline}. Both characters speak in every clip.
          </p>
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">Did the client send photos of their location?</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { v: true, label: '📷 Yes — use their photos' },
                { v: false, label: '🏙️ No — create the location' },
              ] as const).map(({ v, label }) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => onChange({ realLocationProvided: v })}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    realLocationProvided === v
                      ? 'border-amber-500 bg-amber-500/20 text-amber-700 dark:text-amber-300'
                      : 'border-border text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {realLocationProvided && (
            <p className="text-[10px] text-amber-700 dark:text-amber-300 leading-relaxed">
              The member must upload every photo the client sent into <b>Store / Office Image</b> — each clip is set in a
              different one.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

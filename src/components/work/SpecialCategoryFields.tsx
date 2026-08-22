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
import { characterPackGroups, getCharacterPack } from '@/services/characterPacks';

interface SpecialCategoryFieldsProps {
  characterPack: string;
  realLocationProvided: boolean;
  onChange: (patch: { characterPack?: string; realLocationProvided?: boolean }) => void;
}

export default function SpecialCategoryFields({ characterPack, realLocationProvided, onChange }: SpecialCategoryFieldsProps) {
  const pack = getCharacterPack(characterPack);
  /**
   * The id the dropdown should show as selected.
   *
   * Not the stored id: every job saved before the catalogue existed carries `motu_patlu`, and the
   * options are built from catalogue ids, where that same pack is `duo_motu_patlu`. A <select>
   * handed a value none of its options carry selects NOTHING — so a real Motu & Patlu job opened
   * here showed “Normal ad (with a model)”, hid its own explainer, brought back the Model and
   * Attire fields it has no use for, and wrote the pack away on the next save.
   *
   * Resolving through the pack turns the legacy id into the canonical one for display, and the
   * next save quietly stores the canonical id — a migration that happens only when somebody was
   * editing the job anyway, and never touches a record nobody opened.
   */
  const selectedId = pack?.id ?? characterPack;

  return (
    <div>
      <label className="block text-sm font-medium text-muted-foreground mb-1">Special Category</label>
      <select
        value={selectedId}
        onChange={(e) => onChange({ characterPack: e.target.value })}
        className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none"
      >
        <option value="">Normal ad (with a model)</option>
        {/* Grouped, because thirty-two entries in one flat list is a search rather than a
            choice — a member looking for Shinchan should not read past six deities to find him. */}
        {characterPackGroups().map((group) => (
          <optgroup key={group.family} label={group.label}>
            {group.options.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </optgroup>
        ))}
      </select>

      {pack && (
        <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 space-y-2">
          <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
            <b>{pack.label}</b> — {pack.tagline}.{pack.characters.length > 1 ? ' Both characters speak in every clip.' : ''}
          </p>
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">{pack.usesClientFace ? 'Did the client send photos of their shop?' : 'Did the client send photos of their location?'}</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { v: true, label: '📷 Yes — use their business background' },
                { v: false, label: '🏙️ No — create AI background' },
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
          {/* The face is not the location. On every other entry a client photo is a background
              reference; here it is the identity the whole ad is built from, and there is no ad at
              all without it — so it is stated separately and unconditionally. */}
          {pack.usesClientFace && (
            <p className="text-[10px] leading-relaxed text-amber-700 dark:text-amber-300">
              <b>The owner’s photo is required.</b> Upload a clear, front-facing photo of the owner —
              this exact face is reproduced in every clip. Without it there is nothing to build.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

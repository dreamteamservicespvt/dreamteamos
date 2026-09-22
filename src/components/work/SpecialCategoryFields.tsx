/**
 * The special-category and background block of the New Assignment form.
 *
 * The tech admin's and the team leader's Work Assign pages are near-identical copies of each other,
 * which is exactly how the two drifted apart before. This block exists once so a new character duo
 * — or a change to how the background question is asked — lands on both pages at the same time.
 *
 * Selecting a pack replaces the human model outright, so the caller hides its own Model and Attire
 * fields while `characterPack` is set; there is no person to dress.
 *
 * ── Why the background sits outside the pack block now ───────────────────────────────────────
 * It used to appear only once a cartoon duo was chosen, from when staging two cartoons in a real
 * shop was the only reason anyone uploaded premises photos. It was never a pack question. An
 * ordinary human-model ad shot in the client's own showroom and one shot on a built set are two
 * different products at the same price, and the generator writes a different prompt for each. While
 * the question was pack-only, every other ad reached the pipeline as "build the location" whatever
 * the client had been asked to send.
 *
 * The sales member answers it on the call, and it arrives here already filled in. This form is
 * where the ONLY two people who may change it afterwards do so — the team leader here, and the
 * selling sales member on their own sale. The member making the ad reads it and cannot move it;
 * see `backgroundLocked` in AIPlatformApp.
 */
import { characterPackGroups, getCharacterPack, isCustomPack } from '@/services/characterPacks';

interface SpecialCategoryFieldsProps {
  characterPack: string;
  realLocationProvided: boolean;
  /** Custom Character only: who the character is. Omit on a form that does not carry it. */
  customCharacter?: string;
  onChange: (patch: { characterPack?: string; realLocationProvided?: boolean; customCharacter?: string }) => void;
}

export default function SpecialCategoryFields({ characterPack, realLocationProvided, customCharacter, onChange }: SpecialCategoryFieldsProps) {
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
    <div className="space-y-3">
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
          <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5">
            <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
              <b>{pack.label}</b> — {pack.tagline}.{pack.characters.length > 1 ? ' Both characters speak in every clip.' : ''}
            </p>
            {/* The face is not the location. On every other entry a client photo is a background
                reference; here it is the identity the whole ad is built from, and there is no ad at
                all without it — so it is stated separately and unconditionally. */}
            {pack.usesClientFace && (
              <p className="mt-1.5 text-[10px] leading-relaxed text-amber-700 dark:text-amber-300">
                <b>The owner’s photo is required.</b> Upload a clear, front-facing photo of the owner —
                this exact face is reproduced in every clip. Without it there is nothing to build.
              </p>
            )}
          </div>
        )}

        {/* The custom entry is built entirely from this text — see characterPacks.withCustomCharacter. */}
        {isCustomPack(pack) && customCharacter !== undefined && (
          <div className="mt-2">
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Describe the character <span className="text-red-500">*</span>
            </label>
            <textarea
              data-test="custom-character"
              rows={3}
              value={customCharacter}
              onChange={(e) => onChange({ customCharacter: e.target.value })}
              placeholder="Who or what is the character? e.g. “Lord Hanuman carrying a rice bag for our rice mill”, “a cheerful talking mango for our juice shop”, “a friendly village farmer in a white dhoti”"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none resize-y"
            />
            {!customCharacter.trim() && (
              <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
                Required — the whole character (look, voice, personality) is built from this description.
              </p>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">
          Background <span className="text-[10px] text-muted-foreground/60">(as sold — the member cannot change it)</span>
        </label>
        <select
          data-test="assign-background"
          value={realLocationProvided ? 'real' : 'ai'}
          onChange={(e) => onChange({ realLocationProvided: e.target.value === 'real' })}
          className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none"
        >
          <option value="ai">🏙️ AI background — build the location from the business profile</option>
          <option value="real">📷 Real background — the client's own photos of their premises</option>
        </select>
        {realLocationProvided && (
          <p className="mt-1.5 text-[10px] text-amber-700 dark:text-amber-300 leading-relaxed">
            The member must upload every photo the client sent into <b>Store / Office Image</b> — each clip is set in a
            different one. <b>Nothing can be started until those photos arrive</b>, so check the client chat before assigning.
          </p>
        )}
      </div>
    </div>
  );
}

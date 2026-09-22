/**
 * Model and Attire, for every form that briefs an ad — once.
 *
 * Five forms (two New Assignment pages, two assignment editors, Work Reports) each carried their
 * own copy of these two fields, and every copy hid both the moment ANY special category was
 * picked. That was right for a deity or a cartoon and wrong for the human-model entries —
 * "Normal Ad (Female)", "Normal Ad (Male)", the Real Owner Face pair — which still put a real
 * person on screen. A team leader correcting one of those jobs could not set the attire at all.
 *
 * The rule now lives here:
 *  - no special category → Model and Attire, as before;
 *  - a human-model entry → Attire only, offered for the entry's own gender (the entry decides
 *    who is cast, so a Model toggle would contradict it);
 *  - any other entry → nothing, because deities and cartoons come dressed.
 *
 * Renders grid cells (a fragment), so it drops into the existing form grids unchanged.
 */
import { AttireType, ModelGender, ATTIRE_OPTIONS_BY_GENDER } from "@/types/aiPlatform";
import { ATTIRE_LABELS, attireOptionsFor, castLabelFor } from "@/utils/adRequirement";
import { getCharacterPack, isHumanPack, packModelGender } from "@/services/characterPacks";

export interface ModelAttirePatch {
  modelGender?: ModelGender;
  attireType?: AttireType;
  customAttire?: string;
}

interface ModelAttireFieldsProps {
  characterPack?: string | null;
  modelGender: ModelGender;
  attireType: AttireType;
  customAttire: string;
  onChange: (patch: ModelAttirePatch) => void;
  /** `sm` for the compact edit dialogs, `md` for the full Work Assign form. */
  size?: "sm" | "md";
}

export default function ModelAttireFields({
  characterPack, modelGender, attireType, customAttire, onChange, size = "md",
}: ModelAttireFieldsProps) {
  const pack = getCharacterPack(characterPack);
  if (pack && !isHumanPack(pack)) return null;

  const packGender = packModelGender(pack) as ModelGender | null;
  // The male & female duo has no single gender: attireOptionsFor offers what dresses both of them.
  const options = attireOptionsFor(characterPack, packGender ?? modelGender);
  // An attire left over from the other gender is shown as the first valid option rather than as a
  // blank select; the save path runs the same correction (see resolveModelSpec).
  const shownAttire = options.includes(attireType) ? attireType : options[0];

  const label = size === "sm"
    ? "block text-[11px] font-medium text-muted-foreground mb-1"
    : "block text-sm font-medium text-muted-foreground mb-1";
  const field = size === "sm"
    ? "w-full border rounded-lg px-2.5 py-1.5 text-xs bg-background text-foreground border-border placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20"
    : "w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none";
  const toggle = size === "sm" ? "px-2 py-1.5 rounded-lg text-xs" : "px-3 py-2 rounded-lg text-sm";

  return (
    <>
      {!pack && (
        <div>
          <label className={label}>Model</label>
          <div className={`grid grid-cols-2 ${size === "sm" ? "gap-1.5" : "gap-2"}`}>
            {[ModelGender.FEMALE, ModelGender.MALE].map((g) => (
              <button
                key={g}
                type="button"
                data-test={`model-${g}`}
                onClick={() => {
                  const allowed = ATTIRE_OPTIONS_BY_GENDER[g];
                  onChange({
                    modelGender: g,
                    attireType: allowed.includes(attireType) ? attireType : AttireType.PROFESSIONAL,
                  });
                }}
                className={`${toggle} font-medium border transition-colors ${
                  modelGender === g ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                {g === ModelGender.FEMALE ? "👩 Female" : "👨 Male"}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className={label}>
          Attire
          {pack && (
            <span className="ml-1 font-normal text-muted-foreground/70">
              ({castLabelFor(characterPack)} — set by {pack.label})
            </span>
          )}
        </label>
        <select
          value={shownAttire}
          data-test="attire-select"
          onChange={(e) => onChange({ attireType: e.target.value as AttireType, ...(packGender ? { modelGender: packGender } : {}) })}
          className={field}
        >
          {options.map((a) => (
            <option key={a} value={a}>{ATTIRE_LABELS[a]}</option>
          ))}
        </select>
        {shownAttire === AttireType.CUSTOM && (
          <input
            type="text"
            placeholder="Describe the exact attire…"
            value={customAttire}
            data-test="attire-custom"
            onChange={(e) => onChange({ customAttire: e.target.value })}
            className={`${field} mt-1.5`}
          />
        )}
      </div>
    </>
  );
}

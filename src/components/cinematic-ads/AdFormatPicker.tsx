import { cn } from "@/lib/utils";
import {
  AD_FORMAT_FAMILIES,
  AD_FORMAT_PRESETS,
  GENDER_PAIRINGS,
  TO_CAMERA_SPEAKERS,
  adFormatPreset,
  type AdFormatFamily,
  type AdFormatSelection,
  type Gender,
} from "@/types/cinematicAds";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Check, Clapperboard, MessageSquare, Mic, Wand2 } from "lucide-react";

const FAMILY_ICON: Record<AdFormatFamily, typeof Mic> = {
  ai: Wand2,
  dialogue: MessageSquare,
  voiceover: Mic,
  structure: Clapperboard,
};

interface Props {
  value: AdFormatSelection;
  onChange: (next: AdFormatSelection) => void;
}

/**
 * The ad format picker.
 *
 * This is the first thing chosen and the most consequential: it decides whether anyone
 * speaks on camera, and therefore whether casting is needed, whether the words are
 * dialogue or narration, and whether the clips can go to the cheaper video model at all.
 * The consequences are printed on the card rather than hidden in the pipeline.
 */
export default function AdFormatPicker({ value, onChange }: Props) {
  const selectedPreset = adFormatPreset(value.formatId);

  const select = (formatId: AdFormatSelection["formatId"]) => {
    const preset = adFormatPreset(formatId);
    // Drop sub-options that the new format does not use, so a stale pairing from a
    // previous choice cannot leak into the prompts.
    onChange({
      formatId,
      pairing: preset.supportsPairing ? value.pairing || "male_female" : undefined,
      speakerRole: preset.supportsSpeakerRole ? value.speakerRole || "owner" : undefined,
      speakerGender: preset.supportsSpeakerRole ? value.speakerGender || "male" : undefined,
      characterCount: preset.supportsCharacterCount ? value.characterCount || 3 : undefined,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Clapperboard className="w-5 h-5" />
          Type of Ad *
        </CardTitle>
        <CardDescription>
          This decides the whole ad — who speaks, who you have to cast, and how each clip gets animated.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {AD_FORMAT_FAMILIES.map((family) => {
          const presets = AD_FORMAT_PRESETS.filter((p) => p.family === family.family);
          if (presets.length === 0) return null;
          const Icon = FAMILY_ICON[family.family];

          return (
            <div key={family.family} className="space-y-2">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-semibold flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5" />
                  {family.label}
                </span>
                <span className="text-xs text-muted-foreground">{family.hint}</span>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {presets.map((preset) => {
                  const active = value.formatId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => select(preset.id)}
                      className={cn(
                        "text-left rounded-lg border p-3 transition-colors min-w-0",
                        active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium min-w-0">{preset.label}</span>
                        {active && <Check className="w-4 h-4 text-primary shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{preset.description}</p>
                      <p className="text-[11px] text-muted-foreground/80 mt-1 italic">{preset.bestFor}</p>

                      {preset.id !== "ai_decides" && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          <Badge variant="secondary" className="text-[10px]">
                            {preset.voForm === "dialogue" ? "On-camera dialogue" : "Voice over"}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {preset.castingRequirement === "none"
                              ? "No casting"
                              : preset.castingRequirement === "required"
                                ? "Casting required"
                                : "Casting optional"}
                          </Badge>
                          {preset.animationPlatform === "veo_only" && (
                            <Badge variant="secondary" className="text-[10px]">
                              Veo only
                            </Badge>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Sub-options for whichever format is selected */}
        {(selectedPreset.supportsPairing ||
          selectedPreset.supportsSpeakerRole ||
          selectedPreset.supportsCharacterCount) && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {selectedPreset.label} — cast details
            </p>

            {selectedPreset.supportsPairing && (
              <div className="space-y-1.5">
                <Label className="text-sm">Who is talking?</Label>
                <div className="flex flex-wrap gap-2">
                  {GENDER_PAIRINGS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => onChange({ ...value, pairing: p.value })}
                      className={cn(
                        "px-3 py-1.5 rounded-md border text-sm transition-colors",
                        value.pairing === p.value ? "border-primary bg-primary/10 font-medium" : "hover:border-primary/50",
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedPreset.supportsSpeakerRole && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm">Who speaks to camera?</Label>
                  <div className="flex flex-wrap gap-2">
                    {TO_CAMERA_SPEAKERS.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => onChange({ ...value, speakerRole: s.value })}
                        className={cn(
                          "px-3 py-1.5 rounded-md border text-sm transition-colors",
                          value.speakerRole === s.value ? "border-primary bg-primary/10 font-medium" : "hover:border-primary/50",
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm">Their gender</Label>
                  <div className="flex flex-wrap gap-2">
                    {(["male", "female"] as Gender[]).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => onChange({ ...value, speakerGender: g })}
                        className={cn(
                          "px-3 py-1.5 rounded-md border text-sm capitalize transition-colors",
                          value.speakerGender === g ? "border-primary bg-primary/10 font-medium" : "hover:border-primary/50",
                        )}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {selectedPreset.supportsCharacterCount && (
              <div className="space-y-1.5">
                <Label className="text-sm">How many characters?</Label>
                <Input
                  type="number"
                  min={2}
                  max={8}
                  value={value.characterCount ?? 3}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      characterCount: Math.min(8, Math.max(2, Number(e.target.value) || 3)),
                    })
                  }
                  className="w-24"
                />
                <p className="text-xs text-muted-foreground">
                  Every character needs approved face references, so more characters means more work to keep faces consistent.
                </p>
              </div>
            )}
          </div>
        )}

        {/* What the AI decided, once it has */}
        {value.formatId === "ai_decides" && value.aiChosenFormatId && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
            <p className="text-sm font-semibold">
              AI chose: {adFormatPreset(value.aiChosenFormatId).label}
            </p>
            {value.aiChoiceReason && <p className="text-xs text-muted-foreground mt-1">{value.aiChoiceReason}</p>}
            <p className="text-[11px] text-muted-foreground mt-2">
              Not what you wanted? Pick a format above and generate the brief again.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

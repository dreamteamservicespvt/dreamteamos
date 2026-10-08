import { CLIP_SECONDS, clipLabel, parseLabeledClips } from "./voiceOverFormat";

/**
 * Two-speaker clip scripting for character-pack ads.
 *
 * A normal ad has one voice per clip (see utils/voiceOverFormat). A character-pack ad puts TWO
 * cartoon characters in the same 8-second clip and both must speak, so a clip is no longer a line
 * — it is an ordered exchange.
 *
 * ── The 8-second budget ───────────────────────────────────────────────────────────────────────
 * Every clip carries 18–20 spoken words (≈2.25–2.5 words/sec), whoever speaks them. In a
 * two-hander the clip total stays inside that band — that is what keeps every clip landing on
 * 8 seconds — while the split between the two characters is allowed to breathe.
 *
 * ── Two representations, one source of truth ──────────────────────────────────────────────────
 * Same split-brain approach voiceOverFormat already uses, for the same reason: parsing, validation
 * and repair stay mechanical while humans read something pleasant.
 *
 *   canonical (storage, model contract):   0-8|motu: <line>
 *                                          0-8|patlu: <line>
 *
 *   display (what a member copies):        clip-1[0-8sec]:
 *                                            [Motu]:  <line>
 *                                            [Patlu]: <line>
 *
 * The colon on the header is load-bearing, not decoration: utils/voiceOverFormat's clip-header
 * pattern requires a separator, and without it the whole script parsed as one clip and the AI
 * Platform showed every clip crammed into clip-1's card.
 */

/**
 * Spoken words per 8-second clip — a range, not a single number, and the ONE definition of it.
 *
 * An exact count forced the writer to pad or amputate a line that was otherwise right, and a padded
 * Telugu sentence is immediately audible. A band lands on the same 8 seconds while letting the
 * sentence end where it naturally ends.
 *
 * 18–20 for every ad, single voice or two-hander — the team's call. A ceiling of 22 was tried and
 * the clips came out too long to say comfortably in eight seconds. The normal voice-over validator,
 * its repair and review prompts, the refine editor, the character prompts and the Script Duration
 * Checker all read these two numbers, so this is the one place to change it.
 */
export const MIN_WORDS_PER_CLIP = 18;
export const MAX_WORDS_PER_CLIP = 20;
/** The pace a clip is planned at — the middle of the band. Used to estimate clips from raw text. */
export const TARGET_WORDS_PER_CLIP = 19;
/**
 * A two-hander's clip band — deliberately LOWER than a single voice's.
 *
 * ── Why two speakers get fewer words ─────────────────────────────────────────────────────────
 * Two people sharing eight seconds lose time a single voice never does: the hand-off pause, the second
 * speaker drawing breath, the listener's reaction. At 18–20 words the second line routinely ran out of
 * time, and that is where the video model cut corners — it finished the line in the wrong character's
 * mouth, merged the two, or swapped them ("Motu's closing line in Patlu's voice"). 15–17 words gives each
 * speaker a comfortable half of the clip.
 */
export const MIN_WORDS_PER_DUO_CLIP = 15;
export const MAX_WORDS_PER_DUO_CLIP = 17;
/** Two CHILDREN sharing an 8-second clip — see wordBudgetFor. */
export const MIN_WORDS_PER_KIDS_CLIP = 13;
export const MAX_WORDS_PER_KIDS_CLIP = 15;
/** A single character's share in a two-hander. The two lines must still total inside the duo band above. */
export const MIN_WORDS_PER_LINE = 7;
export const MAX_WORDS_PER_LINE = 9;

export interface WordBudget {
  minClip: number;
  maxClip: number;
  minLine: number;
  maxLine: number;
}

/**
 * The word budget for a clip, given how many people speak in it.
 *
 * ── Why this is not a constant ────────────────────────────────────────────────────
 * The CLIP band is a timing rule: eight seconds of speech is 18–20 words whoever says them. The
 * LINE band only ever existed to split that between two speakers.
 *
 * The catalogue now holds entries with a single speaker, and on those the two bands were applied
 * unchanged — so one line was told to be 8–12 words while its clip had to total 18 or more. Nothing can
 * satisfy both, so every clip of every solo ad failed validation and fell into the repair loop,
 * which then re-imposed the same impossible pair. With one speaker the line IS the clip, so it
 * inherits the clip band.
 */
export function wordBudgetFor(speakerCount: number, options: { children?: boolean } = {}): WordBudget {
  const solo = speakerCount <= 1;
  // Children speak more slowly than an adult presenter, and a video model voicing a child keeps that
  // pace: 15–17 words left the second child gabbling to fit the eight seconds. Two lines of 6–8.
  if (options.children && !solo) {
    return { minClip: MIN_WORDS_PER_KIDS_CLIP, maxClip: MAX_WORDS_PER_KIDS_CLIP, minLine: 6, maxLine: 8 };
  }
  return {
    minClip: solo ? MIN_WORDS_PER_CLIP : MIN_WORDS_PER_DUO_CLIP,
    maxClip: solo ? MAX_WORDS_PER_CLIP : MAX_WORDS_PER_DUO_CLIP,
    minLine: solo ? MIN_WORDS_PER_CLIP : MIN_WORDS_PER_LINE,
    maxLine: solo ? MAX_WORDS_PER_CLIP : MAX_WORDS_PER_LINE,
  };
}

export interface DialogueLine {
  /** Character key, e.g. `motu`. */
  speaker: string;
  text: string;
}

/** One clip: an ordered exchange, one line per character. */
export type DialogueClip = DialogueLine[];

export interface Speaker {
  key: string;
  name: string;
  /**
   * Other labels a script may put on this speaker's lines — a role label's own spellings
   * (`[అమ్మాయి]:` for the Girl), a character's name in the spoken script (`[మోటూ]:`), or the plain
   * kind ("Woman", "Man") in a woman-and-man cast. Read by the parser only; never written.
   *
   * ── Why (2026-10-08) ─────────────────────────────────────────────────────────────────────────
   * A Male & Female Duo script came back with the man's lines labelled `0-8|Man:` instead of
   * `0-8|boy:`. The label was unknown, so the line was read as a continuation of the woman's — every
   * clip became one long line in her voice, and the Veo prompts that read the script made it a
   * one-person video while the frames showed the pair. A label that says who speaks is now matched
   * against everything that can mean that speaker.
   */
  aliases?: string[];
}

// ── Formatting ────────────────────────────────────────────────────────────────────────────────

/** Canonical form — what is stored and what the model is asked to produce. */
export function formatCanonicalDialogue(clips: DialogueClip[], clipSeconds: number = CLIP_SECONDS): string {
  return clips
    .map((clip, index) => {
      const start = index * clipSeconds;
      const range = `${start}-${start + clipSeconds}`;
      return clip.map((line) => `${range}|${line.speaker}: ${line.text.trim()}`).join("\n");
    })
    .join("\n");
}

/** Display form — the labelled block a member reads and pastes. */
export function formatDialogueScript(
  clips: DialogueClip[],
  speakers: Speaker[],
  clipSeconds: number = CLIP_SECONDS,
): string {
  const nameOf = new Map(speakers.map((s) => [s.key, s.name]));
  // Pad the labels so the dialogue text lines up under each other and stays easy to scan.
  const width = Math.max(...speakers.map((s) => s.name.length), 0);
  return clips
    .map((clip, index) => {
      const lines = clip.map((line) => {
        const label = `[${nameOf.get(line.speaker) ?? line.speaker}]:`.padEnd(width + 3);
        return `  ${label} ${line.text.trim()}`;
      });
      // The trailing colon is what makes this a clip header to parseLabeledClips — see the note
      // at the top of this file.
      return [`${clipLabel(index, clipSeconds)}:`, ...lines].join("\n");
    })
    .join("\n\n");
}

// ── Parsing ───────────────────────────────────────────────────────────────────────────────────

/**
 * A speaker label, bracketed or bare.
 *
 * ── Why this is not one word ──────────────────────────────────────────────────────────────────
 * It used to be `([\p{L}\w]+)` — a single word — which silently lost every character whose NAME
 * has a space in it: `[Chhota Bheem]:` and `[Ben 10]:` did not match, so the line fell through to
 * the continuation rule and disappeared. The generated script itself was fine (it is written in the
 * canonical `0-8|bheem:` form, keyed on single-word KEYS), but the display form stored in
 * `voiceOverScript` is written with NAMES, and that is what the Veo prompts and the refine editor
 * re-read — so a Bheem & Chutki ad reached the video prompts with only Chutki's half of the clip,
 * and Ben 10 & Grandpa Max with no dialogue at all.
 *
 * A label is anything up to 40 characters before the separator; only labels that resolve to a known
 * speaker are treated as dialogue (see `resolveSpeaker`), so ordinary prose with a colon in it is
 * still a continuation, exactly as before.
 */
const LABEL = String.raw`(?:\[\s*([^\]\n]{1,40}?)\s*\]|\[?\s*([^:\-–\n\[\]]{1,40}?)\s*)`;
/** `0-8|motu: text`, `0-8|[Chhota Bheem]: text` — the canonical line, carrying its own clip position. */
const RANGED_SPEAKER = new RegExp(String.raw`^(\d+)\s*-\s*(\d+)\s*(?:sec|s)?\s*[|/]\s*${LABEL}\s*[:\-–]\s*(.+)$`, "iu");
/** `clip-1[0-8sec]`, `Clip 1 (0-8 sec):`, `Segment 2`, `Scene 3:`, or a bare `0-8:` on its own line. */
const CLIP_HEADER = /^\s*(?:clip\s*-?\s*(\d+)|segment\s*(\d+)|scene\s*(\d+))\s*(?:\[[^\]]*\]|\([^)]*\))?\s*[:\-–]?\s*$/i;
/** `0-8|text` — a canonical line whose speaker was left out: its clip is still explicit. */
const RANGED_UNLABELLED = /^(\d+)\s*-\s*\d+\s*(?:sec|s)?\s*[|/]\s*(\S.*)$/i;
const BARE_RANGE_HEADER = /^\s*[[(]?(\d+)\s*-\s*\d+\s*(?:sec|s)?[\])]?\s*[:\-–]?\s*$/i;
/** `[Motu]: text`, `[Chhota Bheem]: text`, `Motu: text`, `Motu - text`. */
const SPEAKER_LINE = new RegExp(String.raw`^${LABEL}\s*[:\-–]\s*(.+)$`, "u");
/**
 * A clip header with words after it on the SAME line — `clip-1[0-8sec]: …`, `Clip 2 (8-16 sec) - …`,
 * `Scene 3: …`. The words are the clip's first turn; they used to be read as a speaker named "clip" and
 * dropped, so a one-character script written as plain clip lines came back empty (2026-10-08).
 */
const CLIP_HEADER_WITH_TEXT = /^\s*(?:clip\s*-?\s*(\d+)|segment\s*(\d+)|scene\s*(\d+))\s*(?:\[[^\]]*\]|\([^)]*\))?\s*[:\-–]\s*(\S.*)$/i;
/** `0-8: …` — a single voice's canonical line. Only an exact clip range counts, so "10-15 minutes: …" stays text. */
const RANGE_WITH_TEXT = /^\s*[[(]?(\d{1,3})\s*-\s*(\d{1,3})\s*(?:sec|s)?[\])]?\s*[:\-–]\s*(\S.*)$/i;
/** A time range repeated after a clip header — "Clip 1 – 0-8 sec: text" — belongs to the header. */
const LEADING_RANGE = /^[[(]?\d{1,3}\s*[-–]\s*\d{1,3}\s*(?:sec(?:onds?)?|s)?[\])]?\s*[:\-–]?\s*/i;
/**
 * Where a second turn starts inside one physical line — a canonical `8-16|boy:` or a bracketed
 * `[Boy]:` after other words. A model sometimes writes both lines of a clip on one line; read whole,
 * the second speaker's words became the end of the first speaker's line (2026-10-08). Spoken words
 * never contain either marker, so a cut there is always a new turn. A bracketed time range
 * ("Clip 1 [0-8 sec]:") is a header, never a turn.
 */
const EMBEDDED_RANGED_TURN = /\s+(?=\d{1,3}\s*-\s*\d{1,3}\s*(?:sec|s)?\s*[|/])/g;
const EMBEDDED_BRACKET_TURN = /\s+(?=\[(?!\s*\d{1,3}\s*[-–]\s*\d{1,3}\s*(?:sec(?:onds?)?|s)?\s*\])[^\]\n]{1,40}\]\s*[:\-–])/g;

/**
 * A label as it is matched against the speaker list: brackets, emphasis marks, a parenthetical and
 * doubled spaces dropped, case folded. `**[Chhota  Bheem]**`, `chhota bheem` and `Girl (Priya)` /
 * `girl` are the same character.
 */
const labelKey = (raw: string): string =>
  raw.replace(/\([^)]*\)/g, " ").replace(/[[\]*_`"']/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Who a script may name, and which character each name belongs to.
 *
 * Plain strings are their own key (what the canonical form uses). `Speaker` entries carry the pack's
 * key AND its display name, which is what lets `[Chhota Bheem]:` resolve to the key `bheem` — the
 * only form the rest of the pipeline (validation, frames, Veo, name spellings) understands.
 */
export type SpeakerVocabulary = readonly (string | Speaker)[];

function speakerIndex(vocabulary: SpeakerVocabulary): Map<string, string> {
  const index = new Map<string, string>();
  // Keys and full names first, so a shared last word can never shadow a character's own name.
  for (const entry of vocabulary) {
    if (typeof entry === "string") {
      index.set(labelKey(entry), entry.toLowerCase());
      continue;
    }
    for (const alias of [entry.key, entry.name]) {
      const key = labelKey(alias);
      if (key) index.set(key, entry.key.toLowerCase());
    }
  }
  // A speaker's other labels (Speaker.aliases) — never over a key or a name, and never one that two
  // speakers share: an alias that could mean either of them means neither.
  const claims = new Map<string, Set<string>>();
  for (const entry of vocabulary) {
    if (typeof entry === "string") continue;
    for (const alias of entry.aliases ?? []) {
      const key = labelKey(alias);
      if (!key || index.has(key)) continue;
      claims.set(key, (claims.get(key) ?? new Set()).add(entry.key.toLowerCase()));
    }
  }
  for (const [alias, owners] of claims) if (owners.size === 1) index.set(alias, [...owners][0]);
  // "[Bheem]" for "Chhota Bheem", "[Max]" for "Grandpa Max" — only where nothing else claims it.
  for (const entry of vocabulary) {
    if (typeof entry === "string") continue;
    const parts = entry.name.trim().split(/\s+/);
    const last = labelKey(parts[parts.length - 1] || "");
    if (last && !index.has(last)) index.set(last, entry.key.toLowerCase());
  }
  return index;
}

/** The cast in speaking order — only a `Speaker` list carries it; plain strings are just names to accept. */
function speakingOrder(vocabulary: SpeakerVocabulary): string[] {
  const keys: string[] = [];
  for (const entry of vocabulary) {
    if (typeof entry === "string") continue;
    const key = entry.key.toLowerCase();
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** One physical line cut at every turn that starts inside it (EMBEDDED_*_TURN). */
function splitTurns(line: string): string[] {
  const cuts = new Set<number>();
  for (const pattern of [EMBEDDED_RANGED_TURN, EMBEDDED_BRACKET_TURN]) {
    for (const m of line.matchAll(pattern)) {
      const at = (m.index ?? 0) + m[0].length;
      // A canonical marker counts only when a full `range|label:` follows — never a stray "9-5 / 7".
      if (at > 0 && at < line.length && (pattern === EMBEDDED_BRACKET_TURN || RANGED_SPEAKER.test(line.slice(at)))) cuts.add(at);
    }
  }
  if (cuts.size === 0) return [line];
  const out: string[] = [];
  let from = 0;
  for (const at of [...cuts].sort((a, b) => a - b)) {
    out.push(line.slice(from, at).trim());
    from = at;
  }
  out.push(line.slice(from).trim());
  return out.filter(Boolean);
}

/**
 * A script read as dialogue — the clips, and what the reader had to work out for itself.
 *
 * `unknownLabels`: turns whose label named nobody in the cast (`[Man]:`, `0-8|Narrator:`). Each is still
 * its OWN turn, given to the first speaker who has not spoken in that clip yet (a one-character cast: to
 * that character), because the script's contract is one line each, in order. `unattributed`: words with
 * no label at all at the start of a clip, in a cast of two — read as that clip's first speaker. A model's
 * script may be read that way; a script a PERSON wrote must not be guessed at (see castScriptProblems).
 */
export interface DialogueReading {
  clips: DialogueClip[];
  unknownLabels: { clip: number; label: string }[];
  unattributed: { clip: number; text: string }[];
}

/**
 * Reads a script into clips, tolerating every shape the model realistically emits — canonical
 * lines, display blocks, or plain `Motu:` / `Patlu:` pairs under a clip header.
 *
 * ── A turn is never folded into another speaker's line (2026-10-08) ─────────────────────────────────
 * A line that doesn't name a known character used to be read as a continuation of the line above —
 * right for wrapped prose, wrong for a TURN. A Male & Female Duo script whose man's lines came back as
 * `0-8|Man:` (or `[అబ్బాయి]:`, or on the same line as hers) was read as ONE line per clip in the woman's
 * voice; it shipped like that, and the Veo prompts made a one-person video from it while the frames
 * showed the pair. Now: a canonical `range|label:` line or a bracketed `[Label]:` is always a turn of
 * its own, embedded turns are cut out of a line, and a label is matched against every alias of the cast
 * (Speaker.aliases) before it is placed by its position. Only an UNBRACKETED unknown label ("Offer: …")
 * is still prose and continues the line above.
 *
 * Returns no clips when nothing parseable is found, so callers can fall back.
 */
export function readDialogueScript(
  raw: string,
  vocabulary: SpeakerVocabulary,
  clipSeconds: number = CLIP_SECONDS,
): DialogueReading {
  const reading: DialogueReading = { clips: [], unknownLabels: [], unattributed: [] };
  if (!raw?.trim()) return reading;

  const aliasToKey = speakerIndex(vocabulary);
  const cast = speakingOrder(vocabulary);
  const solo = cast.length === 1;

  const byIndex = new Map<number, DialogueClip>();
  let current = -1;

  const ensure = (index: number): DialogueClip => {
    const existing = byIndex.get(index);
    if (existing) return existing;
    const created: DialogueClip = [];
    byIndex.set(index, created);
    return created;
  };

  const resolveSpeaker = (token: string | undefined): string | null =>
    (token ? aliasToKey.get(labelKey(token)) : undefined) ?? null;

  /**
   * A new turn in clip `index`. A label nobody in the cast answers to goes to the first speaker who has
   * not spoken in this clip yet — or, when every one of them has, keeps its own label so validation
   * names a stranger instead of the line vanishing into someone else's.
   */
  const addTurn = (index: number, label: string | null, text: string) => {
    const clip = ensure(index);
    let speaker = label ? resolveSpeaker(label) : null;
    if (!speaker) {
      if (label) reading.unknownLabels.push({ clip: index + 1, label: label.trim() });
      else if (!solo) reading.unattributed.push({ clip: index + 1, text: text.trim() });
      speaker = (solo ? cast[0] : cast.find((k) => !clip.some((l) => l.speaker === k))) ?? (label ? labelKey(label) : "");
    }
    clip.push({ speaker, text: text.trim() });
    current = index;
  };

  for (const rawLine of raw.split(/\r?\n/)) {
    const whole = rawLine.trim();
    if (!whole) continue;
    if (/^full\s*script\s*:?/i.test(whole)) break;

    for (const segment of splitTurns(whole)) {
      // 1 · Canonical `0-8|motu: text` — its clip is explicit, and it is always a turn.
      const ranged = segment.match(RANGED_SPEAKER);
      if (ranged) {
        const start = Number(ranged[1]);
        const label = ranged[3] ?? ranged[4];
        let index = Math.floor(start / clipSeconds);
        /*
          A range that is not one clip long is a typo for the clip being written. A live 2026-10-08 reply put
          the man's clip-3 answer under "24-24|boy:", between clip 3's "16-24|girl:" and clip 4's lines; read
          by its start it became a third line in clip 4 and clip 3 lost him. It stays in the clip the script
          is on when that clip has no line from this speaker yet; otherwise its start decides, as before.
        */
        if (Number(ranged[2]) - start !== clipSeconds && current >= 0) {
          const speaker = resolveSpeaker(label);
          const clip = byIndex.get(current);
          if (clip && (!speaker || !clip.some((l) => l.speaker === speaker))) index = current;
        }
        addTurn(index, label, ranged[5]);
        continue;
      }

      // 2 · A header on its own line moves the cursor to that clip.
      const header = segment.match(CLIP_HEADER);
      if (header) {
        const n = Number(header[1] ?? header[2] ?? header[3]);
        if (Number.isFinite(n) && n > 0) { current = n - 1; ensure(current); continue; }
      }
      const bare = segment.match(BARE_RANGE_HEADER);
      if (bare) {
        current = Math.floor(Number(bare[1]) / clipSeconds);
        ensure(current);
        continue;
      }

      // A canonical line with its speaker left out is still one turn of its own.
      const unlabelled = segment.match(RANGED_UNLABELLED);
      if (unlabelled) {
        addTurn(Math.floor(Number(unlabelled[1]) / clipSeconds), null, unlabelled[2]);
        continue;
      }

      // …and a header with words after it moves the cursor, then those words are read below.
      let line = segment;
      const headed = segment.match(CLIP_HEADER_WITH_TEXT);
      const ranged1 = headed ? null : segment.match(RANGE_WITH_TEXT);
      if (headed) {
        const n = Number(headed[1] ?? headed[2] ?? headed[3]);
        if (Number.isFinite(n) && n > 0) {
          current = n - 1;
          ensure(current);
          line = headed[4].replace(LEADING_RANGE, "").trim();
          if (!line) continue;
        }
      } else if (ranged1 && Number(ranged1[2]) - Number(ranged1[1]) === clipSeconds && Number(ranged1[1]) % clipSeconds === 0) {
        current = Number(ranged1[1]) / clipSeconds;
        ensure(current);
        line = ranged1[3].trim();
      }

      // 3 · `[Motu]: text` under the current clip — a bracketed label is a turn even when unknown.
      const spoken = line.match(SPEAKER_LINE);
      if (spoken) {
        const label = spoken[1] ?? spoken[2];
        if (resolveSpeaker(label) || spoken[1] !== undefined) {
          addTurn(Math.max(current, 0), label, spoken[3]);
          continue;
        }
      }

      // 4 · Anything else continues the turn above — wrapped output — or, in a clip where nobody has
      //     spoken yet, is that clip's first line (a one-character script needs no labels at all).
      const clip = current >= 0 ? byIndex.get(current) : undefined;
      const last = clip?.[clip.length - 1];
      if (last) { last.text = `${last.text} ${line}`.trim(); continue; }
      if (current >= 0 && cast.length > 0) addTurn(current, null, line);
    }
  }

  if (byIndex.size === 0) return reading;

  const highest = Math.max(...byIndex.keys());
  reading.clips = Array.from({ length: highest + 1 }, (_, i) => byIndex.get(i) ?? []);
  return reading;
}

/** The clips of a script read as dialogue — see readDialogueScript. [] when nothing parseable is found. */
export function parseDialogueClips(
  raw: string,
  speakerAliases: SpeakerVocabulary,
  clipSeconds: number = CLIP_SECONDS,
): DialogueClip[] {
  return readDialogueScript(raw, speakerAliases, clipSeconds).clips;
}

/**
 * The problems that make a script NOT this cast's — the ones that may never ship (2026-10-08).
 *
 * Everything else validateDialogueClips reports (word counts, order, punctuation, a name said twice) is
 * a matter of quality, and a script with such a fault can still be recorded. These are a matter of WHO:
 * a clip with no line from one of the two people on screen is a one-person clip in a two-person ad, a
 * line from a speaker the ad does not have cannot be voiced by anyone in the frame, and the wrong number
 * of clips cannot be matched to the frames. The pipeline checks them before a script is used, the
 * quality gate never prefers a draft that has them, and a run that cannot clear them stops instead of
 * making a video for a different cast. Worded like validateDialogueClips, so the repairs read them alike.
 */
export function castIntegrityIssues(clips: DialogueClip[], expectedClipCount: number, speakers: Speaker[]): string[] {
  const issues: string[] = [];
  if (speakers.length === 0) return issues;
  const known = new Set(speakers.map((s) => s.key));
  if (expectedClipCount > 0 && clips.length !== expectedClipCount) {
    issues.push(`Expected exactly ${expectedClipCount} clips but got ${clips.length}.`);
  }
  clips.forEach((clip, index) => {
    const n = index + 1;
    for (const speaker of speakers) {
      const line = clip.find((l) => l.speaker === speaker.key);
      if (!line) {
        issues.push(speakers.length > 1
          ? `Clip ${n} is missing ${speaker.name}'s line — both characters must speak in every clip.`
          : `Clip ${n} has no line from ${speaker.name}.`);
      } else if (!line.text.trim()) {
        issues.push(`Clip ${n}: ${speaker.name}'s line is empty.`);
      }
    }
    for (const line of clip) {
      if (!known.has(line.speaker)) {
        issues.push(`Clip ${n} has a line from "${line.speaker}", who is not in this ad — every line belongs to ${speakers.map((s) => s.name).join(" or ")}.`);
      }
    }
  });
  return issues;
}

/**
 * The speaker labels of a script that is a DIALOGUE — two or more different labels inside one clip, in
 * the display form (`[Girl]: …` / `[Boy]: …` under a clip header) or the canonical one (`0-8|girl:` /
 * `0-8|boy:`) — or [] when it is not one.
 *
 * A one-presenter ad has nobody to give the second voice to: read as its single voice, a duo's script was
 * spoken by one woman, labels and all (2026-10-08). A single label on its own is a member's label on a
 * presenter's lines, and is left as it is.
 */
export function dialogueLabelsIn(script: string): string[] {
  const labels = new Set<string>();
  for (const clip of parseLabeledClips(script)) {
    const inClip = new Set([...clip.matchAll(/(?:^|\n)\s*\[\s*([^\]\n]{1,40}?)\s*\]\s*:/g)].map((m) => m[1].trim()));
    if (inClip.size > 1) inClip.forEach((l) => labels.add(l));
  }
  const byRange = new Map<string, Set<string>>();
  for (const m of (script || "").matchAll(/^\s*(\d{1,3}\s*-\s*\d{1,3})\s*(?:sec|s)?\s*[|/]\s*\[?\s*([^:\]\n]{1,40}?)\s*\]?\s*[:\-–]/gim)) {
    const range = m[1].replace(/\s+/g, "");
    byRange.set(range, (byRange.get(range) ?? new Set()).add(m[2].trim()));
  }
  for (const inRange of byRange.values()) if (inRange.size > 1) inRange.forEach((l) => labels.add(l));
  return [...labels];
}

/**
 * Why a script a PERSON wrote cannot be read as this cast's — a member's custom script, a pasted final
 * script. Nothing is guessed: a label that names nobody in the ad, or a line with no label in a
 * two-person ad, is the writer's to fix, because guessing is how a line lands in the wrong mouth. A cast
 * member who never speaks at all is refused too — the frames show both people in every clip, and a
 * script that silences one of them is a one-person ad. A clip given to only one of the two is the
 * writer's choice and is allowed (the video has the other one listen and react).
 */
export function castScriptProblems(reading: DialogueReading, speakers: Speaker[]): string[] {
  const problems: string[] = [];
  if (speakers.length === 0) return problems;
  const names = speakers.map((s) => `[${s.name}]`).join(" and ");
  const strangers = [...new Set(reading.unknownLabels.map((u) => u.label))];
  if (strangers.length > 0) {
    problems.push(`${strangers.map((n) => `[${n}]`).join(", ")} ${strangers.length === 1 ? "is not a speaker" : "are not speakers"} in this ad — use exactly ${names}.`);
  }
  const loose = [...new Set(reading.unattributed.map((u) => u.clip))];
  if (loose.length > 0) {
    problems.push(`Clip ${loose.join(", ")} ${loose.length === 1 ? "has a line" : "have lines"} with no speaker — start every line with ${names}: so each person says only their own words.`);
  }
  if (reading.clips.length > 0 && speakers.length > 1 && problems.length === 0) {
    const silent = speakers.filter((s) => !reading.clips.some((clip) => clip.some((l) => l.speaker === s.key && l.text.trim())));
    if (silent.length > 0) {
      problems.push(`${silent.map((s) => s.name).join(" and ")} never ${silent.length === 1 ? "speaks" : "speak"} in this script — in this ad ${speakers.map((s) => s.name).join(" and ")} are both on screen and both speak. Give ${silent.length === 1 ? silent[0].name : "them"} ${silent.length === 1 ? "a line" : "lines"}.`);
    }
  }
  return problems;
}

// ── Name spelling ─────────────────────────────────────────────────────────────────────────────

/** One character's fixed spoken spelling, plus the spellings to rewrite into it. */
export interface NameSpelling {
  spelling: string;
  variants: string[];
}

/**
 * Forces every spoken mention of a character's name to its one fixed spelling.
 *
 * The prompt already asks for this, but a model transliterating a name into a non-Latin script
 * drifts between runs and even between clips of the same ad — so the ad ends up calling the same
 * character two different things. Asking is not enough; this rewrites it.
 *
 * Only the spoken text is touched. The `[Motu]:` labels stay in Latin script because the parser
 * and the whole two-speaker contract are keyed on them.
 */
export function applyNameSpellings(clips: DialogueClip[], spellings: NameSpelling[]): DialogueClip[] {
  const rewrites = spellings
    .flatMap(({ spelling, variants }) => variants.filter((v) => v && v !== spelling).map((v) => ({ from: v, to: spelling })))
    // Longest first, so a variant that contains a shorter one is matched whole rather than in parts.
    .sort((a, b) => b.from.length - a.from.length);
  if (rewrites.length === 0) return clips;

  return clips.map((clip) =>
    clip.map((line) => {
      let text = line.text;
      for (const { from, to } of rewrites) text = text.split(from).join(to);
      return text === line.text ? line : { ...line, text };
    }),
  );
}

// ── Validation ────────────────────────────────────────────────────────────────────────────────

/** Words as a listener hears them — punctuation stripped, script-agnostic so Telugu counts too. */
export function countSpokenWords(text: string): number {
  return text
    .replace(/[.,!?;:"'“”‘’()\[\]—–-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

export interface DialogueValidationOptions {
  minWordsPerClip?: number;
  maxWordsPerClip?: number;
  minWordsPerLine?: number;
  maxWordsPerLine?: number;
  /**
   * The characters whose names are counted, each with every spelling that counts as saying it —
   * the Latin name plus whatever native spellings the pack fixes. Leave empty to skip the check.
   */
  characterNames?: CharacterNameTokens[];
  /**
   * How many times EACH character's name must be spoken across the WHOLE script — exactly this
   * many, not "up to". One grounds who is on screen; a second is a word the business did not get.
   */
  mentionsPerName?: number;
  /** Phrases the script is required to contain, e.g. the town the business is in. */
  requiredPhrases?: RequiredPhrase[];
  /**
   * Labels that must NEVER be spoken, with every spelling they could be written in.
   *
   * A human cast's "names" are role labels — Girl, Boy, Friend, Host. Scripts came back with the
   * two people calling each other by them, which reads to a client like a template nobody filled
   * in. Asking the writer not to do it was not enough, so it is checked and repaired.
   */
  forbiddenNames?: CharacterNameTokens[];
  /**
   * Extra words the FINAL clip may use, per line and in total — given when it has to carry the
   * business's address as well as the invitation. "Where is it?" / "Main Road, near the Clock Tower,
   * Kakinada — come today!" does not fit two 7–9-word lines; it fits a shorter question and a longer
   * answer. The first line may be that much shorter, the second that much longer.
   */
  finalClipSlack?: number;
}

/**
 * Something the ad MUST say, and where.
 *
 * Built for the town / village name: a local ad that never says where the shop is has lost the one
 * thing that makes a viewer stop, so its absence is a validation failure that the repair pass fixes
 * — not a suggestion in the prompt that a model may quietly drop.
 */
export interface RequiredPhrase {
  /** What this is, for the repair message: "the town Bodhan". */
  label: string;
  /** Every spelling that counts as having said it (Latin plus the native-script form). */
  tokens: string[];
  /** 1-based clip it must appear in. Omit to accept it anywhere in the script. */
  clip?: number;
  /** Instruction appended to the repair message, e.g. where to put it. */
  hint?: string;
}

/** One character's name and every spelling of it that counts as a spoken mention. */
export interface CharacterNameTokens {
  /** Display name, for the message a repair pass reads. */
  name: string;
  tokens: string[];
  /**
   * The name MAY be said (at most `mentionsPerName` times) rather than must be — a character who carries
   * the ad alone, whom the writer is told to name "at most once, in clip 1". Validated as "exactly once"
   * before 2026-10-08, so a deity's or a solo cartoon's correct script was sent to repair to add a name.
   */
  optional?: boolean;
}

/**
 * How many times any character's name is spoken across the entire script.
 *
 * Counted on the spoken text only — the `[Motu]:` labels are structure, not dialogue. Matching is
 * plain substring and case-insensitive, which is right for Telugu (no word boundaries to rely on)
 * and good enough for Latin names inside a sentence.
 */
export function countNameMentions(clips: DialogueClip[], nameTokens: string[]): number {
  const tokens = nameTokens.filter(Boolean).map((t) => t.toLowerCase());
  if (tokens.length === 0) return 0;

  let total = 0;
  for (const clip of clips) {
    for (const line of clip) {
      const text = line.text.toLowerCase();
      for (const token of tokens) {
        // split().length - 1 counts non-overlapping occurrences without a regex escape dance.
        total += text.split(token).length - 1;
      }
    }
  }
  return total;
}

/**
 * Structural problems with a parsed script, phrased as instructions the repair pass can act on.
 * Returns [] when the script is sound.
 *
 * Scope is deliberately structural — speaker presence, order, counts, length, punctuation. The
 * language-level checks the standard pipeline already owns (native script, spoken phone numbers,
 * CTA placement) are applied per line by the caller, so there is one implementation of each rule.
 */
export function validateDialogueClips(
  clips: DialogueClip[],
  expectedClipCount: number,
  speakers: Speaker[],
  options: DialogueValidationOptions = {},
): string[] {
  // Unset bands follow the cast size — a two-hander is held to the lower duo band (see wordBudgetFor).
  const budget = wordBudgetFor(speakers.length);
  const {
    minWordsPerClip = budget.minClip,
    maxWordsPerClip = budget.maxClip,
    minWordsPerLine = budget.minLine,
    maxWordsPerLine = budget.maxLine,
    finalClipSlack = 0,
    characterNames = [],
    mentionsPerName = 1,
    requiredPhrases = [],
    forbiddenNames = [],
  } = options;

  const issues: string[] = [];

  /**
   * The things the ad has to say out loud — currently the town it is set in.
   *
   * Checked against a specific clip when one is given, because "somewhere in the script" is not the
   * requirement: the place belongs in clip 1, next to the business's name, where a viewer decides
   * whether this ad is about anywhere near them.
   */
  for (const phrase of requiredPhrases) {
    const scope = typeof phrase.clip === "number" ? clips.slice(phrase.clip - 1, phrase.clip) : clips;
    const said = countNameMentions(scope, phrase.tokens) > 0;
    if (!said) {
      const where = typeof phrase.clip === "number" ? `clip ${phrase.clip}` : "the script";
      issues.push(
        `${phrase.label} is never spoken in ${where}. Rewrite ${where} so it is said out loud, `
        + `exactly once.${phrase.hint ? ` ${phrase.hint}` : ""}`,
      );
    }
  }

  /**
   * BOTH names, each exactly once, in an ad of any length.
   *
   * Counted per character rather than as one total, because the two failures are different and a
   * total would hide them: saying "Motu" twice and "Patlu" never still sums to two. Zero is a
   * failure as much as three — the audience has to hear who each of them is once, and every
   * further mention is a word the client paid for and did not get.
   */
  for (const character of characterNames) {
    const mentions = countNameMentions(clips, character.tokens);
    if (mentions > mentionsPerName) {
      issues.push(
        `${character.name}'s name is spoken ${mentions} times across the whole script — it must be `
        + `exactly ${mentionsPerName}. Remove the extra mention${mentions - mentionsPerName === 1 ? "" : "s"} `
        + `and use those words for the business instead.`,
      );
    } else if (mentions < mentionsPerName && !character.optional) {
      issues.push(
        `${character.name}'s name is never spoken — every ad must name ${character.name} exactly `
        + `${mentionsPerName} time, most naturally in clip 1 where the two greet or address each other.`,
      );
    }
  }
  /**
   * A role label said out loud. Reported per clip, because the repair pass rewrites one clip at a
   * time and "somewhere in the script" is not something it can act on.
   */
  for (const forbidden of forbiddenNames) {
    clips.forEach((clip, index) => {
      if (countNameMentions([clip], forbidden.tokens) === 0) return;
      issues.push(
        `Clip ${index + 1} says "${forbidden.name}" out loud. That is the script's label for who speaks, `
        + `not a name — the two people never address each other by it. Rewrite the line without it, `
        + `keeping the same meaning and length.`,
      );
    });
  }

  const nameOf = new Map(speakers.map((s) => [s.key, s.name]));
  const label = (key: string) => nameOf.get(key) ?? key;
  const seenClips = new Map<string, number>();

  if (clips.length !== expectedClipCount) {
    issues.push(`Expected exactly ${expectedClipCount} clips but got ${clips.length}.`);
  }

  clips.forEach((clip, index) => {
    const n = index + 1;
    const slack = n === expectedClipCount ? Math.max(0, finalClipSlack) : 0;
    const lineMin = Math.max(1, minWordsPerLine - slack);
    const lineMax = maxWordsPerLine + slack;
    const clipMax = maxWordsPerClip + slack;

    if (clip.length !== speakers.length) {
      const names = speakers.map((s) => s.name).join(" and ");
      issues.push(`Clip ${n} must contain exactly ${speakers.length} spoken lines — one for ${names} — but has ${clip.length}.`);
    }

    // Every character speaks in every clip, in the pack's fixed order.
    speakers.forEach((speaker, position) => {
      const actual = clip[position];
      if (!actual) return;
      if (actual.speaker !== speaker.key) {
        issues.push(`Clip ${n}: ${speaker.name} must speak in position ${position + 1}, but ${label(actual.speaker)} does.`);
      }
    });
    for (const speaker of speakers) {
      if (!clip.some((l) => l.speaker === speaker.key)) {
        issues.push(`Clip ${n} is missing ${speaker.name}'s line — both characters must speak in every clip.`);
      }
    }
    const speakerCounts = new Map<string, number>();
    for (const line of clip) speakerCounts.set(line.speaker, (speakerCounts.get(line.speaker) ?? 0) + 1);
    for (const [key, count] of speakerCounts) {
      if (count > 1) issues.push(`Clip ${n}: ${label(key)} speaks ${count} times — each character speaks exactly once per clip.`);
    }

    let total = 0;
    for (const line of clip) {
      const words = countSpokenWords(line.text);
      total += words;

      if (!line.text.trim()) {
        issues.push(`Clip ${n}: ${label(line.speaker)}'s line is empty.`);
        continue;
      }
      if (words < lineMin || words > lineMax) {
        issues.push(`Clip ${n}: ${label(line.speaker)}'s line must be ${lineMin}-${lineMax} words but has ${words}.`);
      }
      if (!/[.!?]$/.test(line.text.trim())) {
        issues.push(`Clip ${n}: ${label(line.speaker)}'s line must end with spoken punctuation.`);
      }
    }

    if (clip.length > 0 && (total < minWordsPerClip || total > clipMax)) {
      issues.push(
        `Clip ${n} must contain ${minWordsPerClip}-${clipMax} spoken words across both `
        + `characters, but has ${total}.`,
      );
    }

    // Two characters saying the same thing reads as a generation fault, not dialogue.
    const texts = clip.map((l) => l.text.trim().toLowerCase());
    if (texts.length === 2 && texts[0] && texts[0] === texts[1]) {
      issues.push(`Clip ${n}: both characters say the same line.`);
    }

    const key = texts.join(" | ");
    if (key.trim()) {
      const firstSeen = seenClips.get(key);
      if (typeof firstSeen === "number") issues.push(`Clip ${n} duplicates clip ${firstSeen}.`);
      else seenClips.set(key, n);
    }
  });

  return issues;
}

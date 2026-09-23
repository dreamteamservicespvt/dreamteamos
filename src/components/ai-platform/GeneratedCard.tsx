import React, { useMemo, useState } from 'react';
import { Copy, Check, Languages, RefreshCw, Send, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STUDIO_IS_DARK } from './brand';
import { transliterateToEnglish } from '@/services/geminiService';
import { clipLabel, formatClipLine, formatClipScript, parseLabeledClips } from '@/utils/voiceOverFormat';
import { splitAttachmentDirective } from '@/utils/locationAssignment';
import AttachmentBanner from './AttachmentBanner';
import type { PromptAttachment } from '@/utils/promptAttachments';

interface GeneratedCardProps {
  title: string;
  content: string | string[];
  isJson?: boolean;
  variant?: 'default' | 'dropdown';
  showTransliteration?: boolean;
  showRefinement?: boolean;
  onRefine?: (additionalInstructions: string) => void;
  isRefining?: boolean;
  sectionType?: 'mainFrame' | 'header' | 'poster' | 'voiceOver' | 'veo';
  hideTitle?: boolean;
  /** Per-clip "attach this photo", resolved to the real uploaded image. Indexed like `content`. */
  attachments?: (PromptAttachment | null)[];
  /**
   * Refine ONE voice-over clip from its own card (0-based index). Only that clip can change — see
   * services/geminiService refineVoiceOver.
   */
  onRefineClip?: (index: number, instructions: string) => void;
  /** The clip being refined right now, so its card shows the spinner. */
  refiningClip?: number | null;
  /** Clips the last refine changed, briefly highlighted so the member sees where to look. */
  highlightClips?: number[];
  /**
   * Refine the SELECTED item of a dropdown card (0-based) — a Veo prompt for one clip. When set, the
   * refine box offers "this clip" beside "all clips".
   */
  onRefineItem?: (index: number, instructions: string) => void;
}

const cleanCodeBlocks = (text: string): string => {
  return text
    .replace(/^```(?:markdown|json|text|plaintext)?\s*\n?/gim, '')
    .replace(/\n?```\s*$/gim, '')
    .replace(/^```\s*\n?/gim, '')
    .replace(/\n?```$/gim, '')
    .trim();
};

export type VoiceClip = { label: string; text: string };

/**
 * Splits a character-ad frame prompt into its "attach this photo" banner and the prompt itself.
 * Re-exported from utils/locationAssignment, which also writes the directive.
 */
export const stripAttachmentDirective = splitAttachmentDirective;

/**
 * Splits a voice-over script into its clips. Accepts every header shape the app can produce or
 * receive — canonical `0-8:`, business-facing `clip-1[0-8sec]:`, and `Segment 1:` — see
 * utils/voiceOverFormat. Labels are regenerated from position, so callers always get the
 * current business-facing form regardless of how the script was stored.
 */
export const parseVoiceOverClips = (text: string): VoiceClip[] => {
  const texts = parseLabeledClips(text);
  if (texts.length > 0) {
    return texts.map((clipText, index) => ({ label: clipLabel(index), text: clipText }));
  }

  // Fallback: unlabelled script — treat everything before "FULL SCRIPT:" as a single clip
  const beforeFullScript = text.split(/FULL\s*SCRIPT\s*:/i)[0].trim();
  return beforeFullScript ? [{ label: clipLabel(0), text: beforeFullScript }] : [];
};

export const GeneratedCard: React.FC<GeneratedCardProps> = ({ 
  title, content, isJson, variant = 'default', showTransliteration = false,
  showRefinement = false, onRefine, isRefining = false, sectionType, hideTitle = false, attachments,
  onRefineClip, refiningClip = null, highlightClips = [], onRefineItem,
}) => {
  const isDark = STUDIO_IS_DARK;
  const [copied, setCopied] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showEnglish, setShowEnglish] = useState(false);
  const [showRefineInput, setShowRefineInput] = useState(false);
  const [refineText, setRefineText] = useState('');
  const [transliteratedText, setTransliteratedText] = useState('');
  const [isTransliterating, setIsTransliterating] = useState(false);
  const [transliterationCache, setTransliterationCache] = useState<Record<string, string>>({});
  const [copiedClipLabel, setCopiedClipLabel] = useState<string | null>(null);
  /** The voice-over clip whose own refine box is open, and what is typed in it. */
  const [clipRefineOpen, setClipRefineOpen] = useState<number | null>(null);
  const [clipRefineText, setClipRefineText] = useState('');

  const items = Array.isArray(content) ? content : [content];
  const currentContent = items[selectedIndex];

  const getText = () => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.join('\n\n');
    return JSON.stringify(content, null, 2);
  };

  let textToDisplay = variant === 'dropdown' ? currentContent : getText();
  if (sectionType === 'mainFrame' || sectionType === 'header') textToDisplay = cleanCodeBlocks(textToDisplay);
  if (showEnglish && showTransliteration && transliteratedText) textToDisplay = transliteratedText;

  const voiceOverClips = useMemo(() => {
    if (sectionType !== 'voiceOver' || isJson) return [];
    return parseVoiceOverClips(textToDisplay);
  }, [sectionType, isJson, textToDisplay]);

  const handleTransliterationToggle = async () => {
    if (showEnglish) { setShowEnglish(false); return; }
    const sourceText = variant === 'dropdown' ? currentContent : getText();
    if (transliterationCache[sourceText]) {
      setTransliteratedText(transliterationCache[sourceText]);
      setShowEnglish(true);
      return;
    }
    setIsTransliterating(true);
    try {
      const result = await transliterateToEnglish(sourceText);
      setTransliteratedText(result);
      setTransliterationCache(prev => ({ ...prev, [sourceText]: result }));
      setShowEnglish(true);
    } catch (error) {
      console.error('Transliteration failed:', error);
    } finally {
      setIsTransliterating(false);
    }
  };

  const handleCopy = () => {
    let copyText = textToDisplay;
    if (sectionType === 'mainFrame' || sectionType === 'header') copyText = cleanCodeBlocks(copyText);
    // The attachment directive is an instruction to the MEMBER, not to the image generator — it is
    // shown as a banner above the prompt and left out of what gets pasted.
    copyText = stripAttachmentDirective(copyText).body;
    // Voice-over copies always leave in the business-facing `clip-1[0-8sec]: …` shape,
    // never the canonical `0-8: …` storage form.
    if (voiceOverClips.length > 0) copyText = formatClipScript(voiceOverClips.map(c => c.text));
    navigator.clipboard.writeText(copyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClipCopy = (index: number, clipText: string) => {
    navigator.clipboard.writeText(formatClipLine(index, clipText));
    setCopiedClipLabel(clipLabel(index));
    setTimeout(() => setCopiedClipLabel(null), 2000);
  };

  const handleRefineSubmit = () => {
    if (refineText.trim() && onRefine) {
      onRefine(refineText.trim());
      setRefineText('');
      setShowRefineInput(false);
    }
  };

  /** "This clip only" from a dropdown card's refine box. */
  const handleRefineItemSubmit = () => {
    if (refineText.trim() && onRefineItem) {
      onRefineItem(selectedIndex, refineText.trim());
      setRefineText('');
      setShowRefineInput(false);
    }
  };

  const handleClipRefineSubmit = (index: number) => {
    if (clipRefineText.trim() && onRefineClip) {
      onRefineClip(index, clipRefineText.trim());
      setClipRefineText('');
      setClipRefineOpen(null);
    }
  };

  const ActionBar = () => (
    <div className="ag-codebar px-4 py-2.5 flex-wrap">
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        {variant === 'dropdown' && items.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            {items.map((_, idx) => {
              const isSelected = selectedIndex === idx;
              const label = sectionType === 'mainFrame' || sectionType === 'veo' ? `Clip ${idx + 1}` : `Segment ${idx + 1}`;

              return (
                <button
                  key={label}
                  onClick={() => setSelectedIndex(idx)}
                  className={cn("ag-chip h-7 text-[11px] transition-all",
                    isSelected ? "ag-badge--run" : "hover:border-violet-400 hover:text-white")}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
        {showTransliteration && (
          <button onClick={handleTransliterationToggle} disabled={isTransliterating}
            className={cn("ag-btn ag-btn--sm h-8 px-2.5 text-xs",
              showEnglish ? "ag-btn--primary" : "ag-btn--secondary",
              isTransliterating && "cursor-wait")}>
            {isTransliterating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
            <span>{isTransliterating ? 'Transliterating...' : showEnglish ? 'Telugu' : 'English'}</span>
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-auto">
        {showRefinement && onRefine && (
          <button onClick={() => setShowRefineInput(!showRefineInput)} disabled={isRefining}
            className={cn("ag-btn ag-btn--sm h-8 px-2.5 text-xs",
              showRefineInput ? "ag-btn--primary" : "ag-btn--secondary")}>
            {isRefining ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            <span>{isRefining ? 'Refining...' : 'Refine'}</span>
          </button>
        )}
        <button onClick={handleCopy}
          className={cn("ag-btn ag-btn--sm h-8 px-2.5 text-xs", copied ? "ag-btn--ok" : "ag-btn--secondary")}>
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className={cn("ag-panel", hideTitle ? "ag-panel--flush" : "mb-6")}>
      <ActionBar />

      {showRefineInput && showRefinement && (
        <div className="px-4 py-3 border-b border-violet-500/20 bg-violet-500/[0.07]">
          <div className="flex items-start space-x-2">
            <textarea value={refineText} onChange={(e) => setRefineText(e.target.value)}
              data-test={`refine-input-${sectionType ?? 'section'}`}
              placeholder={sectionType === 'voiceOver'
                ? 'Describe the change — e.g. "clip 1 should mention 20 years of experience" or "use simpler words". Only the clips it touches change.'
                : onRefineItem && items.length > 1
                  ? `Describe the change — apply it to Clip ${selectedIndex + 1} only, or to all clips.`
                  : "Type your changes or additional requirements here..."}
              className="flex-1 text-sm border px-3 py-2 outline-none resize-none"
              rows={2} disabled={isRefining} />
            <div className="flex flex-col space-y-1">
              {onRefineItem && variant === 'dropdown' && items.length > 1 && (
                <button onClick={handleRefineItemSubmit} disabled={!refineText.trim() || isRefining}
                  data-test="refine-this-clip"
                  title={`Apply to Clip ${selectedIndex + 1} only`}
                  className={cn("ag-btn ag-btn--sm h-8 px-2.5 text-[11px] whitespace-nowrap",
                    refineText.trim() && !isRefining ? "ag-btn--primary" : "ag-btn--secondary")}>Clip {selectedIndex + 1}</button>
              )}
              <button onClick={handleRefineSubmit} disabled={!refineText.trim() || isRefining}
                data-test="refine-submit"
                title={onRefineItem && variant === 'dropdown' && items.length > 1 ? 'Apply to all clips' : 'Refine'}
                className={cn("ag-btn ag-btn--sm h-9 px-2.5",
                  refineText.trim() && !isRefining ? "ag-btn--primary" : "ag-btn--secondary")}>{onRefineItem && variant === 'dropdown' && items.length > 1
                  ? <span className="text-[11px] font-semibold whitespace-nowrap">All clips</span>
                  : <Send className="w-4 h-4" />}</button>
              <button onClick={() => { setShowRefineInput(false); setRefineText(''); }}
                className="ag-btn ag-btn--secondary ag-btn--sm h-9 px-2.5"
              ><X className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 max-h-[300px] overflow-y-auto">
        {isJson ? (
          <pre className="ag-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-slate-300">
            {typeof textToDisplay === 'object' ? JSON.stringify(textToDisplay, null, 2) : textToDisplay}
          </pre>
        ) : sectionType === 'voiceOver' && voiceOverClips.length > 0 ? (
          <div className="space-y-3">
            {voiceOverClips.map((clip, index) => {
              const label = clipLabel(index);
              const isClipCopied = copiedClipLabel === label;
              const isThisRefining = isRefining && refiningClip === index;
              const refineOpen = clipRefineOpen === index;
              const highlighted = highlightClips.includes(index);
              return (
                <div key={label} data-test={`voice-clip-${index + 1}`}
                  className={cn("ag-panel",
                    highlighted && "border-emerald-500/60 ring-1 ring-emerald-500/40")}>
                  <div className="ag-codebar px-3 py-1.5">
                    <span className="ag-mono text-xs font-semibold tracking-wide text-slate-300">
                      {label}
                      {highlighted && <span className="ml-2 font-sans normal-case tracking-normal text-[10px] font-bold text-emerald-300">updated</span>}
                    </span>
                    <div className="flex items-center gap-1">
                    {onRefineClip && (
                      <button
                        onClick={() => { setClipRefineOpen(refineOpen ? null : index); setClipRefineText(''); }}
                        disabled={isRefining}
                        data-test={`refine-clip-${index + 1}`}
                        className={cn("ag-btn ag-btn--sm h-7 px-2 text-[11px]",
                          refineOpen ? "ag-btn--primary" : "ag-btn--secondary")}
                      >
                        {isThisRefining ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        <span>{isThisRefining ? 'Refining...' : 'Refine'}</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleClipCopy(index, clip.text)}
                      className={cn("ag-btn ag-btn--sm h-7 px-2 text-[11px]",
                        isClipCopied ? "ag-btn--ok" : "ag-btn--secondary")}
                    >
                      {isClipCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{isClipCopied ? 'Copied' : 'Copy'}</span>
                    </button>
                    </div>
                  </div>
                  {/* pre-wrap so a two-speaker clip keeps its [Motu]/[Patlu] lines apart. */}
                  <p className="px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-slate-200">
                    {clip.text}
                  </p>
                  {refineOpen && (
                    <div className="px-3 pb-3">
                      <div className="flex items-start gap-2">
                        <textarea
                          autoFocus
                          value={clipRefineText}
                          onChange={(e) => setClipRefineText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleClipRefineSubmit(index);
                            if (e.key === 'Escape') setClipRefineOpen(null);
                          }}
                          data-test={`refine-clip-input-${index + 1}`}
                          rows={2}
                          disabled={isRefining}
                          placeholder={`What should change in ${label}? Only this clip changes.`}
                          className="flex-1 text-sm border px-3 py-2 outline-none resize-none"
                        />
                        <div className="flex flex-col gap-1">
                          <button onClick={() => handleClipRefineSubmit(index)} disabled={!clipRefineText.trim() || isRefining}
                            data-test={`refine-clip-submit-${index + 1}`}
                            className={cn("ag-btn ag-btn--sm h-9 px-2.5",
                              clipRefineText.trim() && !isRefining ? "ag-btn--primary" : "ag-btn--secondary")}>
                            <Send className="w-4 h-4" />
                          </button>
                          <button onClick={() => setClipRefineOpen(null)}
                            className="ag-btn ag-btn--secondary ag-btn--sm h-9 px-2.5">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (() => {
          // A character-ad frame prompt arrives with an "attach this photo" line on top. It is
          // shown as a banner — the member has to act on it BEFORE pasting — and never mixed into
          // the prompt body, which is what they hand to the image generator.
          const { body } = stripAttachmentDirective(String(textToDisplay ?? ''));
          const attachment = attachments?.[selectedIndex] ?? null;
          return (
            <>
              {attachment && <AttachmentBanner attachment={attachment} isDark={isDark} />}
              {/* a prompt is machine text — mono keeps its line breaks and bracketed blocks readable */}
              <div className="ag-mono text-[12.5px] whitespace-pre-wrap leading-[1.75] text-slate-300">
                {body}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
};

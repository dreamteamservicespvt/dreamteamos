import React, { useMemo, useState } from 'react';
import { Copy, Check, ChevronDown, Languages, RefreshCw, Send, X, Loader2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { transliterateToEnglish } from '@/services/geminiService';

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
}

const cleanCodeBlocks = (text: string): string => {
  return text
    .replace(/^```(?:markdown|json|text|plaintext)?\s*\n?/gim, '')
    .replace(/\n?```\s*$/gim, '')
    .replace(/^```\s*\n?/gim, '')
    .replace(/\n?```$/gim, '')
    .trim();
};

type VoiceClip = { label: string; text: string };

const parseVoiceOverClips = (text: string): VoiceClip[] => {
  const lines = text.split(/\r?\n/);
  const headerPattern = /^\s*(\d+\s*-\s*\d+)\s*:\s*(.*)$/;
  const fullScriptPattern = /^\s*FULL\s*SCRIPT\s*:/i;
  const clips: VoiceClip[] = [];
  let current: VoiceClip | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Stop collecting once we hit the "FULL SCRIPT:" section
    if (fullScriptPattern.test(line)) {
      break;
    }

    const match = line.match(headerPattern);

    if (match) {
      if (current && current.text.trim()) clips.push(current);
      current = {
        label: match[1].replace(/\s+/g, ''),
        text: match[2].trim(),
      };
      continue;
    }

    if (!line) continue;
    if (current) {
      current.text = current.text ? `${current.text}\n${line}` : line;
    }
  }

  if (current && current.text.trim()) clips.push(current);
  if (clips.length > 0) return clips;

  // Fallback: use text before FULL SCRIPT section
  const beforeFullScript = text.split(/FULL\s*SCRIPT\s*:/i)[0].trim();
  return beforeFullScript ? [{ label: 'Clip 1', text: beforeFullScript }] : [];
};

export const GeneratedCard: React.FC<GeneratedCardProps> = ({ 
  title, content, isJson, variant = 'default', showTransliteration = false,
  showRefinement = false, onRefine, isRefining = false, sectionType, hideTitle = false
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [copied, setCopied] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showEnglish, setShowEnglish] = useState(false);
  const [showRefineInput, setShowRefineInput] = useState(false);
  const [refineText, setRefineText] = useState('');
  const [transliteratedText, setTransliteratedText] = useState('');
  const [isTransliterating, setIsTransliterating] = useState(false);
  const [transliterationCache, setTransliterationCache] = useState<Record<string, string>>({});
  const [copiedClipLabel, setCopiedClipLabel] = useState<string | null>(null);

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
    navigator.clipboard.writeText(copyText);
    setCopied(true);
    if (copyText.includes('16:9')) {
      alert("IMPORTANT: When pasting the prompt in the image generator, change the ratio to landscape 16:9 for both frame and header!");
    }
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClipCopy = (label: string, clipText: string) => {
    navigator.clipboard.writeText(`${label}: ${clipText}`);
    setCopiedClipLabel(label);
    setTimeout(() => setCopiedClipLabel(null), 2000);
  };

  const handleRefineSubmit = () => {
    if (refineText.trim() && onRefine) {
      onRefine(refineText.trim());
      setRefineText('');
      setShowRefineInput(false);
    }
  };

  const ActionBar = () => (
    <div className={cn("px-4 py-2 border-b flex justify-between items-center", isDark ? "border-slate-700" : "border-slate-200")}>
      <div className="flex items-center space-x-2">
        {variant === 'dropdown' && items.length > 1 && (
          <div className="relative">
            <select value={selectedIndex} onChange={(e) => setSelectedIndex(Number(e.target.value))}
              className={cn("appearance-none border text-xs font-medium py-1 px-3 pr-8 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer",
                isDark ? "bg-slate-700 border-slate-600 text-slate-200" : "bg-white border-slate-300 text-slate-700"
              )}>
              {items.map((_, idx) => (
                <option key={idx} value={idx}>{sectionType === 'mainFrame' ? `Clip ${idx + 1}` : `Segment ${idx + 1}`}</option>
              ))}
            </select>
            <ChevronDown className={cn("absolute right-2 top-1.5 w-3 h-3 pointer-events-none", isDark ? "text-slate-400" : "text-slate-500")} />
          </div>
        )}
        {showTransliteration && (
          <button onClick={handleTransliterationToggle} disabled={isTransliterating}
            className={cn("flex items-center space-x-1 text-xs font-medium px-2 py-1 rounded transition-colors",
              isTransliterating ? "opacity-60 cursor-wait"
                : showEnglish ? (isDark ? "text-purple-400 bg-purple-900/30" : "text-purple-600 bg-purple-50")
                : (isDark ? "text-slate-400 hover:text-purple-400 hover:bg-purple-900/30" : "text-slate-500 hover:text-purple-600 hover:bg-purple-50")
            )}>
            {isTransliterating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
            <span>{isTransliterating ? 'Transliterating...' : showEnglish ? 'Telugu' : 'English'}</span>
          </button>
        )}
      </div>
      <div className="flex items-center space-x-2">
        {showRefinement && onRefine && (
          <button onClick={() => setShowRefineInput(!showRefineInput)} disabled={isRefining}
            className={cn("flex items-center space-x-1 text-xs font-medium px-2 py-1 rounded transition-colors",
              showRefineInput ? (isDark ? "text-blue-400 bg-blue-900/30" : "text-blue-600 bg-blue-50")
                : (isDark ? "text-slate-400 hover:text-blue-400 hover:bg-blue-900/30" : "text-slate-500 hover:text-blue-600 hover:bg-blue-50"),
              isRefining && "opacity-50 cursor-not-allowed"
            )}>
            {isRefining ? <div className={cn("w-3 h-3 border border-t-transparent rounded-full animate-spin", isDark ? "border-blue-400" : "border-blue-600")} /> : <RefreshCw className="w-3 h-3" />}
            <span>{isRefining ? 'Refining...' : 'Refine'}</span>
          </button>
        )}
        <button onClick={handleCopy}
          className={cn("flex items-center space-x-1 text-xs font-medium px-2 py-1 rounded transition-colors",
            copied ? (isDark ? "text-green-400 bg-green-900/30" : "text-green-600 bg-green-50")
              : (isDark ? "text-slate-400 hover:text-blue-400 hover:bg-blue-900/30" : "text-slate-500 hover:text-blue-600 hover:bg-blue-50")
          )}>
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className={cn("shadow-sm overflow-hidden transition-all", hideTitle ? "" : "rounded-xl border mb-6 hover:shadow-md",
      isDark ? (hideTitle ? "bg-slate-800" : "bg-slate-800 border-slate-700") : (hideTitle ? "bg-white" : "bg-white border-slate-200")
    )}>
      <ActionBar />

      {showRefineInput && showRefinement && (
        <div className={cn("px-4 py-3 border-b", isDark ? "bg-blue-900/20 border-blue-900/30" : "bg-blue-50 border-blue-100")}>
          <div className="flex items-start space-x-2">
            <textarea value={refineText} onChange={(e) => setRefineText(e.target.value)}
              placeholder="Type your changes or additional requirements here..."
              className={cn("flex-1 text-sm border rounded-lg px-3 py-2 focus:ring-2 outline-none resize-none",
                isDark ? "bg-slate-800 border-blue-800 text-slate-200 placeholder-slate-500 focus:ring-blue-700" : "bg-white border-blue-200 text-slate-700 focus:ring-blue-300"
              )} rows={2} disabled={isRefining} />
            <div className="flex flex-col space-y-1">
              <button onClick={handleRefineSubmit} disabled={!refineText.trim() || isRefining}
                className={cn("p-2 rounded-lg transition-colors",
                  refineText.trim() && !isRefining ? "bg-blue-600 text-white hover:bg-blue-700" : (isDark ? "bg-slate-700 text-slate-500 cursor-not-allowed" : "bg-slate-200 text-slate-400 cursor-not-allowed")
                )}><Send className="w-4 h-4" /></button>
              <button onClick={() => { setShowRefineInput(false); setRefineText(''); }}
                className={cn("p-2 rounded-lg transition-colors", isDark ? "bg-slate-700 text-slate-400 hover:bg-slate-600" : "bg-slate-200 text-slate-500 hover:bg-slate-300")}
              ><X className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      )}

      <div className={cn("p-4 max-h-[300px] overflow-y-auto", isDark ? "bg-slate-800" : "bg-white")}>
        {isJson ? (
          <pre className={cn("text-xs font-mono whitespace-pre-wrap break-all", isDark ? "text-slate-300" : "text-slate-700")}>
            {typeof textToDisplay === 'object' ? JSON.stringify(textToDisplay, null, 2) : textToDisplay}
          </pre>
        ) : sectionType === 'voiceOver' && voiceOverClips.length > 0 ? (
          <div className="space-y-3">
            {voiceOverClips.map((clip) => {
              const isClipCopied = copiedClipLabel === clip.label;
              return (
                <div key={clip.label} className={cn("rounded-lg border overflow-hidden", isDark ? "border-slate-700" : "border-slate-200")}>
                  <div className={cn("flex items-center justify-between px-3 py-1.5 border-b", isDark ? "bg-slate-700/50 border-slate-600" : "bg-slate-50 border-slate-200")}>
                    <span className={cn("text-xs font-semibold tracking-wide", isDark ? "text-slate-300" : "text-slate-600")}>{clip.label}</span>
                    <button
                      onClick={() => handleClipCopy(clip.label, clip.text)}
                      className={cn(
                        "flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded transition-colors",
                        isClipCopied
                          ? (isDark ? "text-green-400 bg-green-900/30" : "text-green-600 bg-green-50")
                          : (isDark ? "text-slate-400 hover:text-blue-400 hover:bg-blue-900/30" : "text-slate-500 hover:text-blue-600 hover:bg-blue-50")
                      )}
                    >
                      {isClipCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{isClipCopied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <p className={cn("px-3 py-2.5 text-sm leading-relaxed", isDark ? "text-slate-300" : "text-slate-700")}>
                    {clip.text}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={cn("text-sm whitespace-pre-wrap leading-relaxed", isDark ? "text-slate-300" : "text-slate-700")}>
            {textToDisplay}
          </div>
        )}
      </div>
    </div>
  );
};

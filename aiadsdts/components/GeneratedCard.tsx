import React, { useState } from 'react';
import { Copy, Check, ChevronDown, Languages, RefreshCw, Send, X, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useTheme } from '../contexts/ThemeContext';
import { transliterateToEnglish } from '../services/geminiService';

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

// Function to clean markdown code blocks from content
const cleanCodeBlocks = (text: string): string => {
  // Remove ```markdown, ```json, ``` and similar code block markers
  let cleaned = text
    .replace(/^```(?:markdown|json|text|plaintext)?\s*\n?/gim, '')
    .replace(/\n?```\s*$/gim, '')
    .replace(/^```\s*\n?/gim, '')
    .replace(/\n?```$/gim, '');
  return cleaned.trim();
};

export const GeneratedCard: React.FC<GeneratedCardProps> = ({ 
  title, 
  content, 
  isJson,
  variant = 'default',
  showTransliteration = false,
  showRefinement = false,
  onRefine,
  isRefining = false,
  sectionType,
  hideTitle = false
}) => {
  const { resolvedTheme } = useTheme();
  const [copied, setCopied] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showEnglish, setShowEnglish] = useState(false);
  const [showRefineInput, setShowRefineInput] = useState(false);
  const [refineText, setRefineText] = useState('');
  const [transliteratedText, setTransliteratedText] = useState('');
  const [isTransliterating, setIsTransliterating] = useState(false);
  const [transliterationCache, setTransliterationCache] = useState<Record<string, string>>({});

  // For Dropdown Mode
  const items = Array.isArray(content) ? content : [content];
  const currentContent = items[selectedIndex];

  // For Default Mode
  const getText = () => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.join('\n\n');
    return JSON.stringify(content, null, 2);
  };

  let textToDisplay = variant === 'dropdown' ? currentContent : getText();
  
  // Clean code blocks for mainFrame and header prompts
  if (sectionType === 'mainFrame' || sectionType === 'header') {
    textToDisplay = cleanCodeBlocks(textToDisplay);
  }
  
  // Show cached transliteration if available
  if (showEnglish && showTransliteration && transliteratedText) {
    textToDisplay = transliteratedText;
  }

  // Handle transliteration toggle with AI
  const handleTransliterationToggle = async () => {
    if (showEnglish) {
      // Switching back to Telugu — just toggle off
      setShowEnglish(false);
      return;
    }

    const sourceText = variant === 'dropdown' ? currentContent : getText();
    
    // Check cache first
    if (transliterationCache[sourceText]) {
      setTransliteratedText(transliterationCache[sourceText]);
      setShowEnglish(true);
      return;
    }

    // Call Gemini AI for transliteration
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
    // Always clean code blocks when copying mainFrame or header
    if (sectionType === 'mainFrame' || sectionType === 'header') {
      copyText = cleanCodeBlocks(copyText);
    }
    navigator.clipboard.writeText(copyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefineSubmit = () => {
    if (refineText.trim() && onRefine) {
      onRefine(refineText.trim());
      setRefineText('');
      setShowRefineInput(false);
    }
  };

  return (
    <div className={clsx(
      "shadow-sm overflow-hidden transition-all",
      hideTitle ? "" : "rounded-xl border mb-6 hover:shadow-md",
      resolvedTheme === 'dark' 
        ? hideTitle ? "bg-slate-800" : "bg-slate-800 border-slate-700" 
        : hideTitle ? "bg-white" : "bg-white border-slate-200"
    )}>
      {!hideTitle && (
      <div className={clsx(
        "px-4 py-3 border-b flex justify-between items-center flex-wrap gap-2",
        resolvedTheme === 'dark'
          ? "bg-slate-900/50 border-slate-700"
          : "bg-slate-50 border-slate-200"
      )}>
        <div className="flex items-center space-x-3">
          <h3 className={clsx(
            "font-semibold text-sm uppercase tracking-wide",
            resolvedTheme === 'dark' ? "text-slate-200" : "text-slate-800"
          )}>{title}</h3>
          
          {variant === 'dropdown' && items.length > 1 && (
            <div className="relative">
              <select
                value={selectedIndex}
                onChange={(e) => setSelectedIndex(Number(e.target.value))}
                className={clsx(
                  "appearance-none border text-xs font-medium py-1 px-3 pr-8 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer",
                  resolvedTheme === 'dark'
                    ? "bg-slate-700 border-slate-600 text-slate-200"
                    : "bg-white border-slate-300 text-slate-700"
                )}
              >
                {items.map((_, idx) => (
                  <option key={idx} value={idx}>{sectionType === 'mainFrame' ? `Clip ${idx + 1}` : `Segment ${idx + 1}`}</option>
                ))}
              </select>
              <ChevronDown className={clsx(
                "absolute right-2 top-1.5 w-3 h-3 pointer-events-none",
                resolvedTheme === 'dark' ? "text-slate-400" : "text-slate-500"
              )} />
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* Transliteration Button - Only for Telugu Voice Over */}
          {showTransliteration && (
            <button
              onClick={handleTransliterationToggle}
              disabled={isTransliterating}
              className={clsx(
                "flex items-center space-x-1 text-xs font-medium px-2 py-1 rounded transition-colors",
                isTransliterating
                  ? "opacity-60 cursor-wait"
                  : showEnglish 
                    ? resolvedTheme === 'dark' 
                      ? "text-purple-400 bg-purple-900/30" 
                      : "text-purple-600 bg-purple-50"
                    : resolvedTheme === 'dark'
                      ? "text-slate-400 hover:text-purple-400 hover:bg-purple-900/30"
                      : "text-slate-500 hover:text-purple-600 hover:bg-purple-50"
              )}
              title={isTransliterating ? "Transliterating..." : showEnglish ? "Show Telugu" : "Show English Transliteration"}
            >
              {isTransliterating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
              <span>{isTransliterating ? 'Transliterating...' : showEnglish ? 'Telugu' : 'English'}</span>
            </button>
          )}

          {/* Refine Button */}
          {showRefinement && onRefine && (
            <button
              onClick={() => setShowRefineInput(!showRefineInput)}
              disabled={isRefining}
              className={clsx(
                "flex items-center space-x-1 text-xs font-medium px-2 py-1 rounded transition-colors",
                showRefineInput
                  ? resolvedTheme === 'dark'
                    ? "text-blue-400 bg-blue-900/30"
                    : "text-blue-600 bg-blue-50"
                  : resolvedTheme === 'dark'
                    ? "text-slate-400 hover:text-blue-400 hover:bg-blue-900/30"
                    : "text-slate-500 hover:text-blue-600 hover:bg-blue-50",
                isRefining && "opacity-50 cursor-not-allowed"
              )}
              title="Refine this section"
            >
              {isRefining ? (
                <div className={clsx(
                  "w-3 h-3 border border-t-transparent rounded-full animate-spin",
                  resolvedTheme === 'dark' ? "border-blue-400" : "border-blue-600"
                )} />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              <span>{isRefining ? 'Refining...' : 'Refine'}</span>
            </button>
          )}

          {/* Copy Button */}
          <button 
            onClick={handleCopy}
            className={clsx(
              "flex items-center space-x-1 text-xs font-medium px-2 py-1 rounded transition-colors",
              copied 
                ? resolvedTheme === 'dark'
                  ? "text-green-400 bg-green-900/30"
                  : "text-green-600 bg-green-50"
                : resolvedTheme === 'dark'
                  ? "text-slate-400 hover:text-blue-400 hover:bg-blue-900/30"
                  : "text-slate-500 hover:text-blue-600 hover:bg-blue-50"
            )}
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>
      )}

      {/* Compact action bar when title is hidden (inside collapsible) */}
      {hideTitle && (
        <div className={clsx(
          "px-4 py-2 border-b flex justify-between items-center",
          resolvedTheme === 'dark'
            ? "border-slate-700"
            : "border-slate-200"
        )}>
          <div className="flex items-center space-x-2">
            {variant === 'dropdown' && items.length > 1 && (
              <div className="relative">
                <select
                  value={selectedIndex}
                  onChange={(e) => setSelectedIndex(Number(e.target.value))}
                  className={clsx(
                    "appearance-none border text-xs font-medium py-1 px-3 pr-8 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer",
                    resolvedTheme === 'dark'
                      ? "bg-slate-700 border-slate-600 text-slate-200"
                      : "bg-white border-slate-300 text-slate-700"
                  )}
                >
                  {items.map((_, idx) => (
                    <option key={idx} value={idx}>{sectionType === 'mainFrame' ? `Clip ${idx + 1}` : `Segment ${idx + 1}`}</option>
                  ))}
                </select>
                <ChevronDown className={clsx(
                  "absolute right-2 top-1.5 w-3 h-3 pointer-events-none",
                  resolvedTheme === 'dark' ? "text-slate-400" : "text-slate-500"
                )} />
              </div>
            )}
            {showTransliteration && (
              <button
                onClick={handleTransliterationToggle}
                disabled={isTransliterating}
                className={clsx(
                  "flex items-center space-x-1 text-xs font-medium px-2 py-1 rounded transition-colors",
                  isTransliterating
                    ? "opacity-60 cursor-wait"
                    : showEnglish 
                      ? resolvedTheme === 'dark' 
                        ? "text-purple-400 bg-purple-900/30" 
                        : "text-purple-600 bg-purple-50"
                      : resolvedTheme === 'dark'
                        ? "text-slate-400 hover:text-purple-400 hover:bg-purple-900/30"
                        : "text-slate-500 hover:text-purple-600 hover:bg-purple-50"
                )}
                title={isTransliterating ? "Transliterating..." : showEnglish ? "Show Telugu" : "Show English Transliteration"}
              >
                {isTransliterating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
                <span>{isTransliterating ? 'Transliterating...' : showEnglish ? 'Telugu' : 'English'}</span>
              </button>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {showRefinement && onRefine && (
              <button
                onClick={() => setShowRefineInput(!showRefineInput)}
                disabled={isRefining}
                className={clsx(
                  "flex items-center space-x-1 text-xs font-medium px-2 py-1 rounded transition-colors",
                  showRefineInput
                    ? resolvedTheme === 'dark'
                      ? "text-blue-400 bg-blue-900/30"
                      : "text-blue-600 bg-blue-50"
                    : resolvedTheme === 'dark'
                      ? "text-slate-400 hover:text-blue-400 hover:bg-blue-900/30"
                      : "text-slate-500 hover:text-blue-600 hover:bg-blue-50",
                  isRefining && "opacity-50 cursor-not-allowed"
                )}
                title="Refine this section"
              >
                {isRefining ? (
                  <div className={clsx(
                    "w-3 h-3 border border-t-transparent rounded-full animate-spin",
                    resolvedTheme === 'dark' ? "border-blue-400" : "border-blue-600"
                  )} />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                <span>{isRefining ? 'Refining...' : 'Refine'}</span>
              </button>
            )}
            <button 
              onClick={handleCopy}
              className={clsx(
                "flex items-center space-x-1 text-xs font-medium px-2 py-1 rounded transition-colors",
                copied 
                  ? resolvedTheme === 'dark'
                    ? "text-green-400 bg-green-900/30"
                    : "text-green-600 bg-green-50"
                  : resolvedTheme === 'dark'
                    ? "text-slate-400 hover:text-blue-400 hover:bg-blue-900/30"
                    : "text-slate-500 hover:text-blue-600 hover:bg-blue-50"
              )}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Refinement Input Area */}
      {showRefineInput && showRefinement && (
        <div className={clsx(
          "px-4 py-3 border-b",
          resolvedTheme === 'dark'
            ? "bg-blue-900/20 border-blue-900/30"
            : "bg-blue-50 border-blue-100"
        )}>
          <div className="flex items-start space-x-2">
            <textarea
              value={refineText}
              onChange={(e) => setRefineText(e.target.value)}
              placeholder="Type your changes or additional requirements here... (e.g., 'Make the environment more modern' or 'Add more emphasis on trust')"
              className={clsx(
                "flex-1 text-sm border rounded-lg px-3 py-2 focus:ring-2 outline-none resize-none",
                resolvedTheme === 'dark'
                  ? "bg-slate-800 border-blue-800 text-slate-200 placeholder-slate-500 focus:ring-blue-700 focus:border-blue-600"
                  : "bg-white border-blue-200 text-slate-700 focus:ring-blue-300 focus:border-blue-400"
              )}
              rows={2}
              disabled={isRefining}
            />
            <div className="flex flex-col space-y-1">
              <button
                onClick={handleRefineSubmit}
                disabled={!refineText.trim() || isRefining}
                className={clsx(
                  "p-2 rounded-lg transition-colors",
                  refineText.trim() && !isRefining
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : resolvedTheme === 'dark'
                      ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed"
                )}
                title="Submit refinement"
              >
                <Send className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setShowRefineInput(false);
                  setRefineText('');
                }}
                className={clsx(
                  "p-2 rounded-lg transition-colors",
                  resolvedTheme === 'dark'
                    ? "bg-slate-700 text-slate-400 hover:bg-slate-600"
                    : "bg-slate-200 text-slate-500 hover:bg-slate-300"
                )}
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className={clsx(
            "text-xs mt-2",
            resolvedTheme === 'dark' ? "text-blue-400" : "text-blue-600"
          )}>
            💡 Describe what changes you want. Only this section will be regenerated.
          </p>
        </div>
      )}

      <div className={clsx(
        "p-4 max-h-[300px] overflow-y-auto custom-scrollbar",
        resolvedTheme === 'dark' ? "bg-slate-800" : "bg-white"
      )}>
        {isJson ? (
          <pre className={clsx(
            "text-xs font-mono whitespace-pre-wrap",
            resolvedTheme === 'dark' ? "text-slate-300" : "text-slate-600"
          )}>
            {textToDisplay}
          </pre>
        ) : (
          <div className={clsx(
            "text-sm whitespace-pre-wrap leading-relaxed",
            resolvedTheme === 'dark' ? "text-slate-300" : "text-slate-700"
          )}>
            {textToDisplay}
          </div>
        )}
      </div>
    </div>
  );
};

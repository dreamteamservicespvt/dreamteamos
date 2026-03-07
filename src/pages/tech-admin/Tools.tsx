import { useState, useRef, useEffect } from 'react';
import {
  Wrench, Sparkles, Timer, Upload, FileText, Image as ImageIcon,
  Loader2, Copy, Check, ArrowRight, ClipboardList, X, History, User,
  Building2, Calendar, ChevronDown, ChevronRight, Video, PenTool, Search
} from 'lucide-react';
import AIPlatformApp from '@/components/ai-platform/AIPlatformApp';
import { extractScriptFromImage, analyzeScriptDuration, type ScriptAnalysis } from '@/services/geminiService';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/services/firebase';
import type { SavedGeneration } from '@/components/ai-platform/SavedItems';

export default function Tools() {
  const [activeTab, setActiveTab] = useState<'home' | 'ai-platform' | 'script-checker' | 'history'>('home');
  const [scriptInput, setScriptInput] = useState('');
  const [scriptImage, setScriptImage] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ScriptAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedClip, setCopiedClip] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // History state
  const [historyItems, setHistoryItems] = useState<SavedGeneration[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [viewingItem, setViewingItem] = useState<SavedGeneration | null>(null);
  const [copiedHistorySection, setCopiedHistorySection] = useState<string | null>(null);
  const [expandedHistorySections, setExpandedHistorySections] = useState<Record<string, boolean>>({});

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const snap = await getDocs(collection(db, 'ai_generations'));
      const items: SavedGeneration[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as SavedGeneration));
      items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setHistoryItems(items);
    } catch (e) {
      console.error('Failed to load history:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history' && historyItems.length === 0) {
      loadHistory();
    }
  }, [activeTab]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const filteredHistory = historyItems.filter(item => {
    if (!historySearch.trim()) return true;
    const s = historySearch.toLowerCase();
    return (
      (item.businessName || '').toLowerCase().includes(s) ||
      (item.userName || '').toLowerCase().includes(s) ||
      (item.businessType || '').toLowerCase().includes(s) ||
      (item.festivalName || '').toLowerCase().includes(s)
    );
  });

  const handleCopyHistorySection = (key: string, content: string | string[]) => {
    const text = Array.isArray(content) ? content.join('\n\n---\n\n') : content;
    navigator.clipboard.writeText(text);
    setCopiedHistorySection(key);
    setTimeout(() => setCopiedHistorySection(null), 2000);
  };

  const toggleHistorySection = (key: string) => {
    setExpandedHistorySections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // If AI Platform is open, render it fullscreen
  if (activeTab === 'ai-platform') {
    return <AIPlatformApp onClose={() => setActiveTab('home')} />;
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScriptImage(file);
    setIsExtracting(true);
    setError(null);
    try {
      const extracted = await extractScriptFromImage(file);
      if (extracted.trim()) {
        setScriptInput(extracted.trim());
      } else {
        setError('Could not extract text from the image. Try a clearer image.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to extract text from image.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleAnalyze = async () => {
    if (!scriptInput.trim()) return;
    setIsAnalyzing(true);
    setError(null);
    setAnalysis(null);
    try {
      const result = await analyzeScriptDuration(scriptInput.trim());
      setAnalysis(result);
    } catch (err: any) {
      setError(err.message || 'Failed to analyze script.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopyClip = (idx: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedClip(idx);
    setTimeout(() => setCopiedClip(null), 2000);
  };

  const handleReset = () => {
    setScriptInput('');
    setScriptImage(null);
    setAnalysis(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
          <Wrench className="w-6 h-6 text-primary" />
          Tools
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Quick access tools for ad creation and script analysis</p>
      </div>

      {activeTab === 'home' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* AI Ads Platform Card */}
          <button onClick={() => setActiveTab('ai-platform')}
            className="bg-card border border-border rounded-xl p-6 text-left hover:border-primary/40 hover:shadow-lg transition-all group">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center text-white shrink-0">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground text-lg group-hover:text-primary transition-colors">AI Ads Platform</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Create professional ads using AI. Upload business assets, configure settings, and generate main frame prompts, headers, voice-over scripts, VEO prompts, and more.
                </p>
                <div className="flex items-center gap-1 mt-3 text-xs text-primary font-medium">
                  <span>Open Platform</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>
          </button>

          {/* Script Duration Checker Card */}
          <button onClick={() => setActiveTab('script-checker')}
            className="bg-card border border-border rounded-xl p-6 text-left hover:border-primary/40 hover:shadow-lg transition-all group">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-white shrink-0">
                <Timer className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground text-lg group-hover:text-primary transition-colors">Script Duration Checker</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Paste a script or upload an image — the tool extracts the text, splits it into 8-second clips, and tells you the total duration.
                </p>
                <div className="flex items-center gap-1 mt-3 text-xs text-primary font-medium">
                  <span>Open Tool</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>
          </button>

          {/* Ad Generation History Card */}
          <button onClick={() => setActiveTab('history')}
            className="bg-card border border-border rounded-xl p-6 text-left hover:border-primary/40 hover:shadow-lg transition-all group">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-600 to-orange-600 flex items-center justify-center text-white shrink-0">
                <History className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground text-lg group-hover:text-primary transition-colors">Ad Generation History</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Browse all ad generations by every team member. View full details, copy prompts, and track team activity.
                </p>
                <div className="flex items-center gap-1 mt-3 text-xs text-primary font-medium">
                  <span>View History</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>
          </button>
        </div>
      )}

      {activeTab === 'script-checker' && (
        <div className="space-y-4">
          {/* Back button */}
          <button onClick={() => { setActiveTab('home'); handleReset(); }}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowRight className="w-4 h-4 rotate-180" />
            <span>Back to Tools</span>
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Input Panel */}
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Timer className="w-5 h-5 text-emerald-600" />
                  <h2 className="font-semibold text-foreground">Script Duration Checker</h2>
                </div>

                {/* Image Upload */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-muted-foreground mb-2">Upload Script Image (Optional)</label>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  <div className="flex items-center gap-2">
                    <button onClick={() => fileInputRef.current?.click()} disabled={isExtracting}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg bg-background hover:bg-accent/50 transition-colors text-foreground disabled:opacity-50">
                      {isExtracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      <span>{isExtracting ? 'Extracting...' : 'Upload Image'}</span>
                    </button>
                    {scriptImage && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span className="truncate max-w-[150px]">{scriptImage.name}</span>
                        <button onClick={() => { setScriptImage(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                          className="text-red-500 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Text Input */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-muted-foreground mb-2">Or Paste Script Text</label>
                  <textarea
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                    rows={8} placeholder="Paste your script here... (Telugu, Hindi, English, or any language)"
                    value={scriptInput} onChange={(e) => setScriptInput(e.target.value)} />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  <button onClick={handleAnalyze} disabled={!scriptInput.trim() || isAnalyzing}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Timer className="w-4 h-4" />}
                    <span>{isAnalyzing ? 'Analyzing...' : 'Analyze Duration'}</span>
                  </button>
                  {(scriptInput || analysis) && (
                    <button onClick={handleReset}
                      className="px-4 py-2.5 text-sm font-medium border border-border rounded-lg bg-background hover:bg-accent/50 transition-colors text-muted-foreground">
                      Reset
                    </button>
                  )}
                </div>

                {error && (
                  <div className="mt-3 flex items-start gap-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-3 rounded-lg text-sm">
                    <span>{error}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Results Panel */}
            <div className="space-y-4">
              {isAnalyzing && (
                <div className="bg-card border border-border rounded-xl p-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Analyzing script duration...</p>
                </div>
              )}

              {analysis && !isAnalyzing && (
                <>
                  {/* Summary */}
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="font-semibold text-foreground mb-3">Analysis Result</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-background border border-border rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-foreground">{analysis.totalDuration}s</p>
                        <p className="text-[10px] text-muted-foreground">Total Duration</p>
                      </div>
                      <div className="bg-background border border-border rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-foreground">{analysis.clipCount}</p>
                        <p className="text-[10px] text-muted-foreground">8-Second Clips</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {[16, 32, 45, 64].map(pkg => (
                        <div key={pkg} className={`text-center p-2 rounded-lg border text-xs ${analysis.totalDuration <= pkg ? 'border-green-500/50 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'border-border bg-background text-muted-foreground'}`}>
                          <p className="font-bold">{pkg}s</p>
                          <p className="text-[10px]">{pkg / 8} clips</p>
                          {analysis.totalDuration <= pkg && <p className="text-[9px] mt-0.5">✓ Fits</p>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Clips Breakdown */}
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-border">
                      <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-muted-foreground" />
                        Clip Breakdown ({analysis.clips.length} clips)
                      </h3>
                    </div>
                    <div className="divide-y divide-border">
                      {analysis.clips.map((clip, idx) => (
                        <div key={idx} className="px-4 py-3 flex items-start gap-3">
                          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                            {clip.index || idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground">{clip.text}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">~{clip.estimatedSeconds}s</p>
                          </div>
                          <button onClick={() => handleCopyClip(idx, clip.text)}
                            className="p-1.5 rounded text-muted-foreground hover:text-primary transition-colors shrink-0">
                            {copiedClip === idx ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {!analysis && !isAnalyzing && (
                <div className="bg-card border border-border rounded-xl p-12 text-center">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-20" />
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">No Analysis Yet</h3>
                  <p className="text-xs text-muted-foreground">Paste a script or upload an image, then click "Analyze Duration"</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && !viewingItem && (
        <div className="space-y-4">
          <button onClick={() => setActiveTab('home')}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowRight className="w-4 h-4 rotate-180" />
            <span>Back to Tools</span>
          </button>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-amber-600" />
              <h2 className="font-semibold text-foreground">Ad Generation History</h2>
              <span className="text-xs text-muted-foreground">({filteredHistory.length} records)</span>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text" placeholder="Search by name, member..."
                value={historySearch} onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
          </div>

          {loadingHistory ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Loading generation history...</p>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <History className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-20" />
              <h3 className="text-sm font-medium text-muted-foreground mb-1">No History Found</h3>
              <p className="text-xs text-muted-foreground">
                {historySearch ? 'No results match your search.' : 'Ad generations will appear here once team members start creating ads.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredHistory.map(item => (
                <button key={item.id} onClick={() => { setViewingItem(item); setExpandedHistorySections({}); }}
                  className="w-full bg-card border border-border rounded-xl p-4 text-left hover:border-primary/40 hover:shadow transition-all group">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-foreground truncate">{item.businessName || 'Untitled'}</h3>
                        {item.creationMode && (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                            {item.creationMode === 'video' ? 'Video' : 'Poster'}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {item.userName && (
                          <span className="flex items-center gap-1"><User className="w-3 h-3" />{item.userName}</span>
                        )}
                        <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{item.businessType || 'Business'}</span>
                        {item.festivalName && (
                          <span className="text-purple-600 dark:text-purple-400">{item.festivalName}</span>
                        )}
                        <span>{item.duration}s</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(item.createdAt)}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && viewingItem && (
        <div className="space-y-4">
          <button onClick={() => setViewingItem(null)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowRight className="w-4 h-4 rotate-180" />
            <span>Back to History</span>
          </button>

          {/* Header */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-lg font-bold text-foreground mb-1">{viewingItem.businessName || 'Untitled'}</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {viewingItem.userName && (
                <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{viewingItem.userName}</span>
              )}
              <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{viewingItem.businessType || 'Business'}</span>
              <span>{viewingItem.adType === 'festival' ? `Festival: ${viewingItem.festivalName}` : 'Commercial'}</span>
              <span>{viewingItem.duration}s ({Math.ceil(viewingItem.duration / 8)} clips)</span>
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatDate(viewingItem.createdAt)}</span>
            </div>
          </div>

          {/* Sections */}
          {[
            { key: 'mainFrame', title: `Main Frame Prompts (${viewingItem.mainFramePrompts?.length || 0} Clips)`, content: viewingItem.mainFramePrompts, isArray: true },
            { key: 'header', title: 'Header Prompt', content: viewingItem.headerPrompt, isArray: false },
            { key: 'poster', title: 'Poster Design (JSON)', content: viewingItem.posterPrompt, isArray: false },
            { key: 'voiceOver', title: 'Voice Over Script', content: viewingItem.voiceOverScript, isArray: false },
            { key: 'veo', title: `VEO Prompts (${viewingItem.veoPrompts?.length || 0} Segments)`, content: viewingItem.veoPrompts, isArray: true },
          ].filter(s => s.isArray ? (s.content as string[])?.length > 0 : !!(s.content as string)).map(section => (
            <div key={section.key} className="bg-card border border-border rounded-xl overflow-hidden">
              <button onClick={() => toggleHistorySection(section.key)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors">
                <span className="font-semibold text-sm text-foreground">{section.title}</span>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); handleCopyHistorySection(section.key, section.content as any); }}
                    className="p-1 rounded hover:bg-accent transition-colors">
                    {copiedHistorySection === section.key
                      ? <Check className="w-3.5 h-3.5 text-green-500" />
                      : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                  </button>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expandedHistorySections[section.key] ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {expandedHistorySections[section.key] && (
                <div className="px-4 pb-4 border-t border-border pt-3">
                  {section.isArray ? (
                    <div className="space-y-3">
                      {(section.content as string[]).map((item, idx) => (
                        <div key={idx} className="bg-background border border-border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-primary">{section.key === 'mainFrame' ? `Clip ${idx + 1}` : `Segment ${idx + 1}`}</span>
                            <button onClick={() => handleCopyHistorySection(`${section.key}-${idx}`, item)}
                              className="p-1 rounded hover:bg-accent transition-colors">
                              {copiedHistorySection === `${section.key}-${idx}`
                                ? <Check className="w-3 h-3 text-green-500" />
                                : <Copy className="w-3 h-3 text-muted-foreground" />}
                            </button>
                          </div>
                          <p className="text-sm text-foreground whitespace-pre-wrap">{item}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-background border border-border rounded-lg p-3">
                      <p className="text-sm text-foreground whitespace-pre-wrap">{section.content as string}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Stock Image Prompts */}
          {viewingItem.stockImagePrompts && viewingItem.stockImagePrompts.length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <button onClick={() => toggleHistorySection('stock')}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors">
                <span className="font-semibold text-sm text-foreground">Stock Image Prompts ({viewingItem.stockImagePrompts.length})</span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expandedHistorySections['stock'] ? 'rotate-180' : ''}`} />
              </button>
              {expandedHistorySections['stock'] && (
                <div className="px-4 pb-4 border-t border-border pt-3 space-y-2">
                  {viewingItem.stockImagePrompts.map((sp: any, idx: number) => (
                    <div key={idx} className="bg-background border border-border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-primary">{sp.concept || `Stock ${idx + 1}`}</span>
                        <button onClick={() => handleCopyHistorySection(`stock-${idx}`, sp.prompt || JSON.stringify(sp))}
                          className="p-1 rounded hover:bg-accent transition-colors">
                          {copiedHistorySection === `stock-${idx}`
                            ? <Check className="w-3 h-3 text-green-500" />
                            : <Copy className="w-3 h-3 text-muted-foreground" />}
                        </button>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{sp.prompt || JSON.stringify(sp, null, 2)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

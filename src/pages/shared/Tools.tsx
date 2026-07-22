import { useState, useRef, useMemo } from 'react';
import {
  Wrench, Sparkles, Timer, Upload, FileText, Image as ImageIcon,
  Loader2, Copy, Check, ArrowRight, ClipboardList, X, History, User,
  Building2, Calendar, ChevronDown, ChevronRight, Video, PenTool, Search, AlertCircle
} from 'lucide-react';
import AIPlatformApp from '@/components/ai-platform/AIPlatformApp';
import {
  extractScriptFromImage, convertToVoiceOverScript, suggestClipCount, countScriptWords,
  detectScriptLanguage, extractBusinessNameFromInfo, WORDS_PER_CLIP, type ScriptConversion,
} from '@/services/geminiService';
import { db } from '@/services/firebase';
import type { SavedGeneration } from '@/components/ai-platform/SavedItems';
import { useFirestoreCollection } from '@/hooks/useFirestore';
import { useAuthStore } from '@/store/authStore';
import type { AppUser, WorkAssignment } from '@/types';
import { format, subDays, startOfDay } from 'date-fns';
import DashboardDayPicker from '@/components/dashboard/DayPicker';
import { normalizeClipCount } from '@/utils/assignmentDuration';

/** Clip-count presets offered by the Script Duration Checker (matches the ad packages). */
const CLIP_PRESETS = [2, 4, 6, 8] as const;

const SCRIPT_LANGUAGES = ['auto', 'Telugu', 'English', 'Hindi', 'Kannada', 'Tamil', 'Malayalam'] as const;

export default function Tools() {
  const user = useAuthStore(s => s.user);
  const [activeTab, setActiveTab] = useState<'home' | 'ai-platform' | 'script-checker' | 'history'>('home');
  const [scriptInput, setScriptInput] = useState('');
  const [scriptImage, setScriptImage] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [conversion, setConversion] = useState<ScriptConversion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedClip, setCopiedClip] = useState<number | null>(null);
  const [copiedFull, setCopiedFull] = useState(false);
  /** 'auto' lets the pasted text decide; a number pins the script to that many 8s clips. */
  const [clipMode, setClipMode] = useState<'auto' | number | 'custom'>('auto');
  const [customClips, setCustomClips] = useState(3);
  const [scriptLanguage, setScriptLanguage] = useState<string>('auto');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live, no-API preview of what the pasted text will become
  const sourceWordCount = useMemo(() => countScriptWords(scriptInput), [scriptInput]);
  const autoClipCount = useMemo(() => suggestClipCount(scriptInput), [scriptInput]);
  const resolvedClipCount = clipMode === 'auto'
    ? autoClipCount
    : clipMode === 'custom' ? customClips : clipMode;

  // History state
  const { data: allGenerations, loading: loadingHistory, error: generationsError } = useFirestoreCollection<SavedGeneration>('ai_generations');
  const { data: allAssignments, loading: loadingAssignments } = useFirestoreCollection<WorkAssignment>('work_assignments');
  const { data: allUsers } = useFirestoreCollection<AppUser>('users');
  const [historySearch, setHistorySearch] = useState('');
  const [viewingItem, setViewingItem] = useState<SavedGeneration | null>(null);
  const [copiedHistorySection, setCopiedHistorySection] = useState<string | null>(null);
  const [expandedHistorySections, setExpandedHistorySections] = useState<Record<string, boolean>>({});
  const [dayFilter, setDayFilter] = useState<string>('all'); // default to All Days
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  // 5-day labels
  const recentDays = useMemo(() => {
    const days: { date: Date; dateStr: string; label: string }[] = [];
    for (let i = 0; i < 5; i++) {
      const d = subDays(new Date(), i);
      const today = startOfDay(new Date());
      const target = startOfDay(d);
      const diffMs = today.getTime() - target.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      const label = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Yesterday' : `${diffDays} days ago`;
      days.push({ date: startOfDay(d), dateStr: format(d, 'yyyy-MM-dd'), label });
    }
    return days;
  }, []);

  // Members who are tech_member or admin
  const historyMembers = useMemo(() => {
    return allUsers.filter(u => (u.role === 'tech_member' || u.role === 'tech_admin') && u.isActive !== false);
  }, [allUsers]);

  // Build unified history from work_assignments + ai_generations
  const allHistoryEntries = useMemo(() => {
    const genByAssignmentId = new Map<string, SavedGeneration>();
    const genById = new Map<string, SavedGeneration>();
    const standaloneGens: SavedGeneration[] = [];

    for (const gen of allGenerations) {
      if (gen.id) genById.set(gen.id, gen);
      if (gen.workAssignmentId) {
        const existing = genByAssignmentId.get(gen.workAssignmentId);
        if (!existing || (gen.createdAt?.seconds || 0) > (existing.createdAt?.seconds || 0)) {
          genByAssignmentId.set(gen.workAssignmentId, gen);
        }
      } else {
        standaloneGens.push(gen);
      }
    }

    const entries: any[] = [];
    const usedGenIds = new Set<string>();

    for (const a of allAssignments) {
      if (!['completed', 'verified'].includes(a.status)) continue;
      const gen = genByAssignmentId.get(a.id) || (a.savedGenerationId ? genById.get(a.savedGenerationId) : undefined) || null;
      if (gen?.id) usedGenIds.add(gen.id);

      if (gen) {
        entries.push({ ...gen, _hasGeneration: true, _status: a.status });
      } else {
        entries.push({
          id: a.id, userId: a.assignedTo, userName: '',
          businessName: a.businessName || a.displayTitle || a.clientName || 'Untitled',
          businessType: a.category || '', businessInfo: null,
          mainFramePrompts: [], headerPrompt: '', voiceOverScript: '', veoPrompts: [],
          adType: '', attireType: '', duration: parseInt(a.duration) || 0,
          createdAt: a.completedAt || a.assignedAt,
          workAssignmentId: a.id, _hasGeneration: false, _status: a.status,
        });
      }
    }

    for (const gen of allGenerations) {
      if (gen.id && usedGenIds.has(gen.id)) continue;
      entries.push({ ...gen, _hasGeneration: true });
    }

    return entries.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [allGenerations, allAssignments]);

  // Filter by date
  const dateFilteredGenerations = useMemo(() => {
    let items = allHistoryEntries;

    if (selectedDate) {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      items = items.filter((item: any) => {
        if (!item.createdAt) return false;
        const d = item.createdAt.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
        return !isNaN(d.getTime()) && format(d, 'yyyy-MM-dd') === dateStr;
      });
    } else if (dayFilter !== 'all') {
      const dayIndex = parseInt(dayFilter);
      const dayDateStr = recentDays[dayIndex]?.dateStr;
      if (dayDateStr) {
        items = items.filter((item: any) => {
          if (!item.createdAt) return false;
          const d = item.createdAt.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
          return !isNaN(d.getTime()) && format(d, 'yyyy-MM-dd') === dayDateStr;
        });
      }
    }

    return items;
  }, [allHistoryEntries, selectedDate, dayFilter, recentDays]);

  // Group by userId for member cards
  const memberGenerationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    dateFilteredGenerations.forEach((item: any) => {
      counts[item.userId] = (counts[item.userId] || 0) + 1;
    });
    return counts;
  }, [dateFilteredGenerations]);

  // Filtered items for selected member + search
  const filteredHistory = useMemo(() => {
    let items = selectedMemberId
      ? dateFilteredGenerations.filter((item: any) => item.userId === selectedMemberId)
      : dateFilteredGenerations;

    if (historySearch.trim()) {
      const s = historySearch.toLowerCase();
      items = items.filter((item: any) =>
        (item.businessName || '').toLowerCase().includes(s) ||
        (item.userName || '').toLowerCase().includes(s) ||
        (item.businessType || '').toLowerCase().includes(s) ||
        (item.festivalName || '').toLowerCase().includes(s)
      );
    }

    return items;
  }, [dateFilteredGenerations, selectedMemberId, historySearch]);

  // Resolve business name: prefer stored field, then re-extract from businessInfo for old records
  const getBusinessName = (item: SavedGeneration) => {
    if (item.businessName && item.businessName !== 'Untitled') return item.businessName;
    if (item.businessInfo) return extractBusinessNameFromInfo(item.businessInfo) || 'Untitled';
    return item.businessName || 'Untitled';
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

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
    setConversion(null);
    try {
      const result = await convertToVoiceOverScript(scriptInput.trim(), {
        clipCount: clipMode === 'auto' ? 'auto' : resolvedClipCount,
        language: scriptLanguage,
      });
      setConversion(result);
    } catch (err: any) {
      setError(err.message || 'Failed to generate the voice-over script.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  /** Copies one clip in the business-facing form: `clip-1[0-8sec]: <line>`. */
  const handleCopyClip = (idx: number, label: string, text: string) => {
    navigator.clipboard.writeText(`${label}: ${text}`);
    setCopiedClip(idx);
    setTimeout(() => setCopiedClip(null), 2000);
  };

  const handleCopyFullScript = () => {
    if (!conversion) return;
    navigator.clipboard.writeText(conversion.formattedScript);
    setCopiedFull(true);
    setTimeout(() => setCopiedFull(false), 2000);
  };

  const handleReset = () => {
    setScriptInput('');
    setScriptImage(null);
    setConversion(null);
    setError(null);
    setClipMode('auto');
    setScriptLanguage('auto');
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
                  Paste any raw text — AI rewrites it into a professional commercial voice-over script, structured as clip-1[0-8sec], clip-2[8-16sec] and so on.
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
                  <label className="block text-sm font-medium text-muted-foreground mb-2">Or Paste Plain Text</label>
                  <textarea
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                    rows={8}
                    placeholder="Paste the business's raw text here — rough notes, a WhatsApp message, a service list, or an amateur script. Any language works. AI rewrites it into a professional commercial voice-over script."
                    value={scriptInput} onChange={(e) => setScriptInput(e.target.value)} />
                  {sourceWordCount > 0 && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {sourceWordCount} words pasted · detected language: <span className="font-medium text-foreground">{detectScriptLanguage(scriptInput)}</span> · naturally fills <span className="font-medium text-foreground">{autoClipCount} clip{autoClipCount === 1 ? '' : 's'}</span>
                    </p>
                  )}
                </div>

                {/* Clip count — how long the finished ad should be */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-muted-foreground mb-2">Script Duration</label>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setClipMode('auto')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${clipMode === 'auto' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-border text-muted-foreground hover:bg-accent'}`}>
                      Auto{autoClipCount > 0 ? ` (${autoClipCount} clips)` : ''}
                    </button>
                    {CLIP_PRESETS.map(n => (
                      <button key={n} onClick={() => setClipMode(n)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${clipMode === n ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-border text-muted-foreground hover:bg-accent'}`}>
                        {n} clips <span className="font-normal opacity-70">({n * 8}s)</span>
                      </button>
                    ))}
                    <button onClick={() => setClipMode('custom')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${clipMode === 'custom' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-border text-muted-foreground hover:bg-accent'}`}>
                      Custom
                    </button>
                  </div>
                  {clipMode === 'custom' && (
                    <div className="mt-2 flex items-center gap-2">
                      <input type="number" min={1} value={customClips}
                        onChange={(e) => setCustomClips(normalizeClipCount(parseInt(e.target.value)))}
                        className="w-24 border border-border rounded-lg px-3 py-1.5 text-sm bg-background text-foreground focus:ring-2 focus:ring-primary/20 outline-none" />
                      <span className="text-xs text-muted-foreground">clips = {customClips * 8}s total</span>
                    </div>
                  )}
                  {resolvedClipCount > 0 && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Output: <span className="font-medium text-foreground">{resolvedClipCount} clips × 8s = {resolvedClipCount * 8}s</span>, {WORDS_PER_CLIP} words per clip (ads-platform formula)
                    </p>
                  )}
                </div>

                {/* Output language */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-muted-foreground mb-2">Voice-Over Language</label>
                  <select value={scriptLanguage} onChange={(e) => setScriptLanguage(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:ring-2 focus:ring-primary/20 outline-none">
                    {SCRIPT_LANGUAGES.map(l => (
                      <option key={l} value={l}>{l === 'auto' ? 'Same as pasted text (Auto)' : l}</option>
                    ))}
                  </select>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  <button onClick={handleAnalyze} disabled={!scriptInput.trim() || isAnalyzing}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenTool className="w-4 h-4" />}
                    <span>{isAnalyzing ? 'Writing script...' : 'Generate Voice Over Script'}</span>
                  </button>
                  {(scriptInput || conversion) && (
                    <button onClick={handleReset}
                      className="px-4 py-2.5 text-sm font-medium border border-border rounded-lg bg-background hover:bg-accent/50 transition-colors text-muted-foreground">
                      Reset
                    </button>
                  )}
                </div>

                {error && (
                  <div className="mt-3 flex items-start gap-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-3 rounded-lg text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
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
                  <p className="text-sm text-muted-foreground">Rewriting into a professional commercial script...</p>
                </div>
              )}

              {conversion && !isAnalyzing && (
                <>
                  {/* Summary */}
                  <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <h3 className="font-semibold text-foreground">Voice Over Script</h3>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">{conversion.language}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-background border border-border rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-foreground">{conversion.totalDuration}s</p>
                        <p className="text-[10px] text-muted-foreground">Total Duration</p>
                      </div>
                      <div className="bg-background border border-border rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-foreground">{conversion.clipCount}</p>
                        <p className="text-[10px] text-muted-foreground">8-Second Clips</p>
                      </div>
                      <div className="bg-background border border-border rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-foreground">{conversion.clips.reduce((s, c) => s + c.wordCount, 0)}</p>
                        <p className="text-[10px] text-muted-foreground">Spoken Words</p>
                      </div>
                    </div>
                    <button onClick={handleCopyFullScript}
                      className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white transition-all">
                      {copiedFull ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedFull ? 'Copied Complete Script' : 'Copy Complete Voice Over Script'}</span>
                    </button>
                  </div>

                  {/* Clips Breakdown */}
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-border">
                      <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-muted-foreground" />
                        Clip Breakdown ({conversion.clipCount} clips)
                      </h3>
                    </div>
                    <div className="divide-y divide-border">
                      {conversion.clips.map((clip, idx) => (
                        <div key={clip.label} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="text-xs font-bold text-primary font-mono">{clip.label}</span>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] ${clip.wordCount === WORDS_PER_CLIP ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400 font-medium'}`}>
                                {clip.wordCount} words
                              </span>
                              <button onClick={() => handleCopyClip(idx, clip.label, clip.text)}
                                className="p-1.5 rounded text-muted-foreground hover:text-primary transition-colors shrink-0">
                                {copiedClip === idx ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                          <p className="text-sm text-foreground leading-relaxed">{clip.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {!conversion && !isAnalyzing && (
                <div className="bg-card border border-border rounded-xl p-12 text-center">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-20" />
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">No Script Yet</h3>
                  <p className="text-xs text-muted-foreground">Paste plain text or upload an image, pick a duration, then click "Generate Voice Over Script"</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && !viewingItem && (
        <div className="space-y-4">
          <button onClick={() => { if (selectedMemberId) { setSelectedMemberId(null); } else { setActiveTab('home'); } }}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowRight className="w-4 h-4 rotate-180" />
            <span>{selectedMemberId ? 'Back to Members' : 'Back to Tools'}</span>
          </button>

          {/* Header + Filters */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-amber-600" />
                <h2 className="font-semibold text-foreground">Ad Generation History</h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {!selectedDate && (
                  <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}
                    className="border rounded-lg px-2 py-1.5 text-xs bg-background text-foreground border-border focus:ring-2 focus:ring-primary/20 outline-none">
                    {recentDays.map((d, i) => (
                      <option key={d.dateStr} value={String(i)}>{d.label} ({format(d.date, 'dd/MM')})</option>
                    ))}
                    <option value="all">All Days</option>
                  </select>
                )}
                <DashboardDayPicker selectedDate={selectedDate} onSelect={(d) => { setSelectedDate(d); if (d) setDayFilter('0'); }} />
                {selectedDate && (
                  <button onClick={() => setSelectedDate(undefined)} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
                )}
              </div>
            </div>
          </div>

          {/* Member Cards or Member's History */}
          {!selectedMemberId ? (
            <>
              {generationsError ? (
                <div className="bg-card border border-red-300 dark:border-red-800 rounded-xl p-12 text-center">
                  <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
                  <h3 className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">Failed to Load History</h3>
                  <p className="text-xs text-muted-foreground">{generationsError}</p>
                </div>
              ) : loadingHistory || loadingAssignments ? (
                <div className="bg-card border border-border rounded-xl p-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Loading history...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {historyMembers.filter(m => memberGenerationCounts[m.uid] > 0).length === 0 ? (
                    <div className="col-span-full bg-card border border-border rounded-xl p-12 text-center">
                      <History className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-20" />
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">No Generations Found</h3>
                      <p className="text-xs text-muted-foreground">No ad generations for this period.</p>
                    </div>
                  ) : (
                    historyMembers
                      .filter(m => memberGenerationCounts[m.uid] > 0)
                      .sort((a, b) => (memberGenerationCounts[b.uid] || 0) - (memberGenerationCounts[a.uid] || 0))
                      .map(member => (
                        <button key={member.uid} onClick={() => setSelectedMemberId(member.uid)}
                          className="bg-card border border-border rounded-xl p-4 text-left hover:border-primary/40 hover:shadow-md transition-all group">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center font-display font-bold text-amber-700 dark:text-amber-400 text-sm shrink-0">
                              {member.name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-semibold text-foreground truncate block group-hover:text-primary transition-colors">{member.name}</span>
                              <span className="text-xs text-muted-foreground capitalize">{member.role?.replace('_', ' ')}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-lg font-bold text-primary">{memberGenerationCounts[member.uid] || 0}</span>
                              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                            </div>
                          </div>
                        </button>
                      ))
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Selected member header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedMemberId(null)} className="text-xs text-primary hover:underline">← All Members</button>
                  <span className="text-sm font-semibold text-foreground">
                    {historyMembers.find(m => m.uid === selectedMemberId)?.name || 'Member'}
                  </span>
                  <span className="text-xs text-muted-foreground">({filteredHistory.length} records)</span>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text" placeholder="Search by name, type..."
                    value={historySearch} onChange={(e) => setHistorySearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 outline-none" />
                </div>
              </div>

              {filteredHistory.length === 0 ? (
                <div className="bg-card border border-border rounded-xl p-12 text-center">
                  <History className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-20" />
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">No History Found</h3>
                  <p className="text-xs text-muted-foreground">
                    {historySearch ? 'No results match your search.' : 'No generations for this member in this period.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredHistory.map((item: any) => (
                    <button key={item.id} onClick={() => { if (item._hasGeneration !== false) { setViewingItem(item); setExpandedHistorySections({}); } }}
                      className={`w-full bg-card border border-border rounded-xl p-4 text-left transition-all group ${item._hasGeneration !== false ? 'hover:border-primary/40 hover:shadow cursor-pointer' : 'opacity-70 cursor-default'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-foreground truncate">{getBusinessName(item)}</h3>
                            {item._status && (
                              <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${item._status === 'verified' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'}`}>
                                {item._status === 'verified' ? 'Verified' : 'Completed'}
                              </span>
                            )}
                            {item.creationMode && (
                              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                {item.creationMode === 'video' ? 'Video' : 'Poster'}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{item.businessType || 'Business'}</span>
                            {item.festivalName && (
                              <span className="text-purple-600 dark:text-purple-400">{item.festivalName}</span>
                            )}
                            <span>{item.duration}s</span>
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(item.createdAt)}</span>
                          </div>
                        </div>
                        {item._hasGeneration !== false && (
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'history' && viewingItem && (
        <div className="space-y-4">
          <button onClick={() => setViewingItem(null)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowRight className="w-4 h-4 rotate-180" />
            <span>Back to {historyMembers.find(m => m.uid === selectedMemberId)?.name || 'History'}</span>
          </button>

          {/* Header */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-lg font-bold text-foreground mb-1">{getBusinessName(viewingItem)}</h2>
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

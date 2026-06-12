import React, { useState, useEffect, useRef } from 'react';
import {
  Wand2, Sparkles, Layout, Type, Rocket, AlertCircle,
  Loader2, Save, Check, Camera, Video, PenTool, ChevronDown, Copy,
  ExternalLink, StopCircle, ArrowLeft, CheckCircle2, Home, Ratio, Languages, Type as TypeIcon, Music
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { FileUpload } from './FileUpload';
import { GeneratedCard } from './GeneratedCard';
import { SavedItems, SavedGeneration } from './SavedItems';
import { AdFormData, AdType, AttireType, FileStore, GeneratedOutputs, GenerationStatus } from '@/types/aiPlatform';
import { generateAdAssets, extractBusinessOnly, generateStockImagePrompts, refineStockImagePrompt, generateOverlayTexts, refineSection, regenerateVeoFromVoiceOver, SectionType, extractBusinessNameFromInfo } from '@/services/geminiService';
import { collection, addDoc, getDocs, query, where, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/store/authStore';
import type { WorkAssignment } from '@/types';
import { useConfirm } from '@/hooks/useConfirm';

interface AIPlatformAppProps {
  assignment?: WorkAssignment;
  assignmentId?: string;
  onBusinessNameExtracted?: (name: string) => void;
  onClose: () => void;
  onComplete?: () => void;
}

const cleanPromptForClipboard = (content: string) => {
  return content
    .replace(/^```(?:markdown|json|text|plaintext)?\s*\n?/gim, '')
    .replace(/\n?```\s*$/gim, '')
    .replace(/^```\s*\n?/gim, '')
    .replace(/\n?```$/gim, '')
    .trim();
};

// ── DTS brand system (violet → blue → cyan, from "JUST DREAM BIG, WE BUILD IT") ──
const BRAND_GRADIENT = 'bg-gradient-to-r from-violet-600 via-blue-600 to-cyan-500';
const BRAND_GRADIENT_HOVER = 'hover:from-violet-500 hover:via-blue-500 hover:to-cyan-400';
const BRAND_TEXT = 'bg-clip-text text-transparent bg-gradient-to-r from-violet-500 via-blue-500 to-cyan-400';

const AIPlatformApp: React.FC<AIPlatformAppProps> = ({
  assignment, assignmentId, onBusinessNameExtracted, onClose, onComplete
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const user = useAuthStore((s) => s.user);
  const { confirm: showAlert, ConfirmDialog } = useConfirm();

  const [formData, setFormData] = useState<AdFormData>({
    adType: AdType.COMMERCIAL,
    festivalName: '',
    attireType: AttireType.TRADITIONAL,
    duration: 16,
    durationMode: 'preset',
    textInstructions: '',
    aspectRatio: '9:16',
    language: 'Telugu',
    noLogo: false,
    logoNameText: ''
  });

  const [files, setFiles] = useState<FileStore>({
    logo: null, visitingCard: [], storeImage: [],
    productImages: [], flyersPosters: [], voiceRecording: [], textInstructionsFile: []
  });

  const [status, setStatus] = useState<GenerationStatus>({ step: '', isProcessing: false, error: null, progress: 0 });
  const [errorModalDismissed, setErrorModalDismissed] = useState(false);
  const [outputs, setOutputs] = useState<GeneratedOutputs | null>(null);
  const [refiningSection, setRefiningSection] = useState<SectionType | null>(null);
  const [collapsedSections, setCollapsedSections] = useState({
    storeOffice: true, productImages: true, flyersPosters: true, voiceInstructions: true
  });
  const toggleSection = (section: keyof typeof collapsedSections) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };
  const [includeProductsInHeader, setIncludeProductsInHeader] = useState(false);
  const [showSavedItems, setShowSavedItems] = useState(false);
  const [savedItems, setSavedItems] = useState<SavedGeneration[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [viewingSavedItem, setViewingSavedItem] = useState<SavedGeneration | null>(null);
  const [isGeneratingStock, setIsGeneratingStock] = useState(false);
  const [stockImageError, setStockImageError] = useState<string | null>(null);
  const [stockImageTheme, setStockImageTheme] = useState<string>('indian');
  const [copiedStockIdx, setCopiedStockIdx] = useState<number | null>(null);
  const [stockRefineIdx, setStockRefineIdx] = useState<number | null>(null);
  const [stockRefineText, setStockRefineText] = useState('');
  const [refiningStockIdx, setRefiningStockIdx] = useState<number | null>(null);
  const [isGeneratingOverlay, setIsGeneratingOverlay] = useState(false);
  const [overlayError, setOverlayError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const outputPanelRef = useRef<HTMLDivElement>(null);
  const [collapsedOutputs, setCollapsedOutputs] = useState<Record<string, boolean>>({});
  const toggleOutputSection = (section: string) => {
    setCollapsedOutputs(prev => ({ ...prev, [section]: !prev[section] }));
  };
  const [creationMode, setCreationMode] = useState<'video' | 'poster'>('video');
  const [selectedFestivalOption, setSelectedFestivalOption] = useState<string>('');
  const [customFestivalName, setCustomFestivalName] = useState<string>('');
  const [customScript, setCustomScript] = useState<string>('');
  const [useCustomScript, setUseCustomScript] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [languageSearch, setLanguageSearch] = useState('');

  const LANGUAGE_OPTIONS = [
    'Telugu', 'English', 'Hindi', 'Kannada', 'Tamil', 'Malayalam',
    'Marathi', 'Bengali', 'Gujarati', 'Punjabi', 'Urdu', 'Odia', 'Assamese',
  ];

  // #2 — Video Duration is fixed by the assignment's clip count when launched from an assignment
  const durationLocked = !!assignment;

  const CUSTOM_FESTIVAL_OPTION = '__custom_festival__';

  const upcomingFestivals = [
    'Ugadi', 'Sankranthi', 'Maha Shivaratri', 'Holi', 'Sri Rama Navami', 'Hanuman Jayanti',
    'Good Friday', 'Easter', 'Akshaya Tritiya', 'Buddha Purnima', 'Eid ul-Fitr', 'Bakrid',
    'Muharram', 'Raksha Bandhan', 'Krishna Janmashtami', 'Ganesh Chaturthi', 'Onam',
    'Bathukamma', 'Navaratri', 'Dasara', 'Dussehra', 'Diwali', 'Karthika Pournami',
    'Christmas', 'New Year', 'Republic Day', 'Independence Day', 'Gandhi Jayanti'
  ];

  useEffect(() => {
    if (user) loadSavedItems();
  }, [user]);

  // #2 — Prefill & lock Video Duration from the assignment's clip count (clips × 8s),
  // so the member generates exactly what the admin/leader assigned.
  useEffect(() => {
    if (!assignment) return;
    const clips = assignment.clipCount || Math.max(1, Math.floor((parseInt(assignment.duration) || 16) / 8));
    const seconds = Math.min(120, Math.max(8, clips * 8));
    const isPreset = [16, 32, 48, 64].includes(seconds);
    setFormData(prev => ({ ...prev, duration: seconds, durationMode: isPreset ? 'preset' : 'custom' }));
  }, [assignment?.id]);

  // Extract business name whenever outputs change
  useEffect(() => {
    if (outputs?.businessInfo && onBusinessNameExtracted) {
      const name = extractBusinessNameFromInfo(outputs.businessInfo);
      if (name) {
        onBusinessNameExtracted(name);
      }
    }
  }, [outputs?.businessInfo]);

  const loadSavedItems = async () => {
    if (!user) return;
    setLoadingSaved(true);
    try {
      const q = query(collection(db, 'ai_generations'), where('userId', '==', user.uid));
      const snap = await getDocs(q);
      const items: SavedGeneration[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as SavedGeneration));
      items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setSavedItems(items);
    } catch (error) {
      console.error('Failed to load saved items:', error);
    } finally {
      setLoadingSaved(false);
    }
  };

  const handleSave = async () => {
    if (!user || !outputs) return;
    setIsSaving(true);
    try {
      const businessName = extractBusinessNameFromInfo(outputs.businessInfo) || 'Untitled';
      const businessType = outputs.businessInfo?.businessType || outputs.businessInfo?.type || 'Business';
      const docRef = await addDoc(collection(db, 'ai_generations'), {
        userId: user.uid,
        userName: user.name || user.email,
        ...(assignmentId ? { workAssignmentId: assignmentId } : {}),
        businessName, businessType,
        businessInfo: outputs.businessInfo,
        mainFramePrompts: outputs.mainFramePrompts,
        headerPrompt: outputs.headerPrompt,
        posterPrompt: outputs.posterPrompt,
        voiceOverScript: outputs.voiceOverScript,
        veoPrompts: outputs.veoPrompts,
        stockImagePrompts: outputs.stockImagePrompts,
        adType: formData.adType,
        festivalName: formData.festivalName,
        attireType: formData.attireType,
        duration: formData.duration,
        creationMode: creationMode,
        createdAt: serverTimestamp()
      });
      // Link to assignment if exists
      if (assignmentId) {
        await updateDoc(doc(db, 'work_assignments', assignmentId), { savedGenerationId: docRef.id });
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      loadSavedItems();
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectSavedItem = (item: SavedGeneration) => {
    const savedFestivalName = item.festivalName || '';
    const isKnownFestival = savedFestivalName ? upcomingFestivals.includes(savedFestivalName) : false;

    setSelectedFestivalOption(
      savedFestivalName ? (isKnownFestival ? savedFestivalName : CUSTOM_FESTIVAL_OPTION) : ''
    );
    setCustomFestivalName(savedFestivalName && !isKnownFestival ? savedFestivalName : '');

    setViewingSavedItem(item);
    setOutputs({
      businessInfo: item.businessInfo,
      mainFramePrompts: item.mainFramePrompts || [],
      headerPrompt: item.headerPrompt,
      posterPrompt: item.posterPrompt || '',
      voiceOverScript: item.voiceOverScript,
      veoPrompts: item.veoPrompts,
      hasProductImages: false, productImageCount: 0,
      stockImagePrompts: item.stockImagePrompts || null
    });
    setFormData(prev => ({
      ...prev,
      adType: item.adType as AdType,
      festivalName: item.festivalName || '',
      attireType: item.attireType as AttireType,
      duration: item.duration || 16,
      durationMode: 'preset'
    }));
    setShowSavedItems(false);
  };

  const handleDeleteSavedItem = (id: string) => {
    setSavedItems(prev => prev.filter(item => item.id !== id));
  };

  const handleRefineSection = async (section: SectionType, additionalInstructions: string) => {
    if (!outputs) return;
    setRefiningSection(section);
    try {
      let currentContent = '';
      switch (section) {
        case 'mainFrame': currentContent = outputs.mainFramePrompts.join('\n###CLIP###\n'); break;
        case 'header': currentContent = outputs.headerPrompt; break;
        case 'poster': currentContent = outputs.posterPrompt; break;
        case 'voiceOver': currentContent = outputs.voiceOverScript; break;
        case 'veo': currentContent = outputs.veoPrompts.join('\n###SEGMENT###\n'); break;
      }
      const refinedContent = await refineSection(section, currentContent, additionalInstructions, formData, outputs.businessInfo);
      setOutputs(prev => {
        if (!prev) return prev;
        switch (section) {
          case 'mainFrame': {
            const clips = refinedContent.split('###CLIP###').map(p => p.trim()).filter(p => p.length > 0);
            return { ...prev, mainFramePrompts: clips.length > 0 ? clips : [refinedContent] };
          }
          case 'header': return { ...prev, headerPrompt: refinedContent };
          case 'poster': return { ...prev, posterPrompt: refinedContent };
          case 'voiceOver': return { ...prev, voiceOverScript: refinedContent };
          case 'veo': {
            const segs = refinedContent.split("###SEGMENT###").map(p => p.trim()).filter(p => p.length > 0);
            return { ...prev, veoPrompts: segs.length > 0 ? segs : [refinedContent] };
          }
          default: return prev;
        }
      });

      // When the voice-over is refined, regenerate the Veo 3 prompts from the new script
      if (section === 'voiceOver') {
        try {
          const newVeo = await regenerateVeoFromVoiceOver(refinedContent, formData);
          setOutputs(prev => (prev ? { ...prev, veoPrompts: newVeo } : prev));
        } catch (e) {
          console.error('Veo regeneration after voice-over refine failed:', e);
        }
      }
    } catch (error: any) {
      console.error('Refinement error:', error);
    } finally {
      setRefiningSection(null);
    }
  };

  const handleGenerate = async () => {
    const hasNameBoard = !!(formData.noLogo && formData.logoNameText?.trim());
    if (!files.logo && !hasNameBoard) {
      await showAlert({ title: "Missing Logo", description: "Upload a logo image, OR tick 'No logo' and enter the business name to use as a name board.", confirmText: "OK" });
      return;
    }
    if (formData.adType === AdType.FESTIVAL && !formData.festivalName.trim()) {
      await showAlert({ title: "Missing Festival", description: "Please select a festival or enter a custom festival name.", confirmText: "OK" });
      return;
    }
    abortControllerRef.current = new AbortController();
    setErrorModalDismissed(false);
    setStatus({ step: 'Initializing...', isProcessing: true, error: null, progress: 0 });
    setOutputs(null);
    setTimeout(() => outputPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    try {
      let generatedResult: GeneratedOutputs;
      if (creationMode === 'poster') {
        generatedResult = await extractBusinessOnly(formData, files, (step, progress) => {
          if (abortControllerRef.current?.signal.aborted) throw new Error('Generation stopped by user');
          setStatus(prev => ({ ...prev, step, progress }));
        });
      } else {
        generatedResult = await generateAdAssets(formData, files, (step, progress) => {
          if (abortControllerRef.current?.signal.aborted) throw new Error('Generation stopped by user');
          setStatus(prev => ({ ...prev, step, progress }));
        }, {
          includeProductsInHeader,
          customScript: useCustomScript ? customScript : undefined,
          onPartialResult: (partial) => setOutputs(partial)
        });
      }
      setOutputs(generatedResult);
      setStatus(prev => ({ ...prev, isProcessing: false, step: 'Completed', progress: 100 }));

      // Auto-save to history
      if (user) {
        try {
          const bName = extractBusinessNameFromInfo(generatedResult.businessInfo) || 'Untitled';
          const bType = generatedResult.businessInfo?.businessType || generatedResult.businessInfo?.type || 'Business';
          const autoSaveRef = await addDoc(collection(db, 'ai_generations'), {
            userId: user.uid,
            userName: user.name || user.email,
            ...(assignmentId ? { workAssignmentId: assignmentId } : {}),
            businessName: bName, businessType: bType,
            businessInfo: generatedResult.businessInfo,
            mainFramePrompts: generatedResult.mainFramePrompts,
            headerPrompt: generatedResult.headerPrompt,
            posterPrompt: generatedResult.posterPrompt,
            voiceOverScript: generatedResult.voiceOverScript,
            veoPrompts: generatedResult.veoPrompts,
            stockImagePrompts: generatedResult.stockImagePrompts,
            adType: formData.adType,
            festivalName: formData.festivalName,
            attireType: formData.attireType,
            duration: formData.duration,
            creationMode: creationMode,
            createdAt: serverTimestamp()
          });
          if (assignmentId) {
            await updateDoc(doc(db, 'work_assignments', assignmentId), { savedGenerationId: autoSaveRef.id });
          }
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
          loadSavedItems();
        } catch (e) {
          console.error('Auto-save failed:', e);
        }
      }
    } catch (error: any) {
      const isStopped = error.message?.includes('stopped by user');
      setStatus(prev => ({ ...prev, isProcessing: false, error: isStopped ? 'Generation stopped.' : (error.message || "An unexpected error occurred.") }));
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setStatus(prev => ({ ...prev, step: 'Stopping...', isProcessing: false }));
    }
  };

  const handleGenerateStockImages = async () => {
    if (!outputs || !outputs.voiceOverScript) return;
    setIsGeneratingStock(true);
    setStockImageError(null);
    try {
      const clipCount = outputs.veoPrompts?.length || outputs.mainFramePrompts?.length || Math.round(formData.duration / 8);
      const stockPrompts = await generateStockImagePrompts(outputs.voiceOverScript, outputs.businessInfo, formData.adType, formData.festivalName, stockImageTheme, formData.aspectRatio, clipCount);
      setOutputs(prev => prev ? { ...prev, stockImagePrompts: stockPrompts } : prev);
    } catch (error: any) {
      setStockImageError(error.message || 'Failed to generate stock image prompts.');
    } finally {
      setIsGeneratingStock(false);
    }
  };

  // #10 — refine a single B-roll image prompt
  const handleRefineStockImage = async (idx: number) => {
    if (!outputs?.stockImagePrompts || !stockRefineText.trim()) return;
    setRefiningStockIdx(idx);
    try {
      const current = outputs.stockImagePrompts[idx];
      const refined = await refineStockImagePrompt(current.prompt, stockRefineText.trim(), formData.aspectRatio);
      setOutputs(prev => {
        if (!prev?.stockImagePrompts) return prev;
        const next = [...prev.stockImagePrompts];
        next[idx] = { ...next[idx], prompt: refined };
        return { ...prev, stockImagePrompts: next };
      });
      setStockRefineIdx(null);
      setStockRefineText('');
    } catch (error: any) {
      setStockImageError(error.message || 'Failed to refine image prompt.');
    } finally {
      setRefiningStockIdx(null);
    }
  };

  // #14 — generate per-clip on-screen overlay texts + CapCut SFX suggestions
  const handleGenerateOverlayTexts = async () => {
    if (!outputs || !outputs.voiceOverScript) return;
    setIsGeneratingOverlay(true);
    setOverlayError(null);
    try {
      const items = await generateOverlayTexts(outputs.voiceOverScript, outputs.businessInfo, formData.language);
      setOutputs(prev => prev ? { ...prev, overlayTexts: items } : prev);
    } catch (error: any) {
      setOverlayError(error.message || 'Failed to generate overlay texts.');
    } finally {
      setIsGeneratingOverlay(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background overflow-hidden">
      {ConfirmDialog}

      {/* Generation-failed popup — centered so the user can't miss it */}
      {status.error && status.error !== 'Generation stopped.' && !errorModalDismissed && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={cn("w-full max-w-md rounded-xl border shadow-2xl p-6", isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200")}>
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <h3 className={cn("text-lg font-bold text-center mb-2", isDark ? "text-white" : "text-slate-800")}>Ad Generation Failed</h3>
            <p className={cn("text-sm text-center rounded-lg border px-3 py-2 mb-4 break-words", isDark ? "bg-red-900/20 border-red-800/50 text-red-300" : "bg-red-50 border-red-200 text-red-700")}>
              {status.error}
            </p>
            <div className={cn("text-sm space-y-2 mb-5", isDark ? "text-slate-300" : "text-slate-600")}>
              <p className="font-semibold">What to do:</p>
              <ol className="list-decimal list-inside space-y-1.5">
                <li>Close this website (tab) completely, open it again, and retry the generation.</li>
                <li>If it fails again, wait <strong>5–10 minutes</strong> and then try once more.</li>
                <li>If the same problem still continues after that, <strong>contact your admin</strong>.</li>
              </ol>
            </div>
            <button onClick={() => setErrorModalDismissed(true)}
              className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors">
              Close
            </button>
          </div>
        </div>
      )}

      {showSavedItems && (
        <SavedItems items={savedItems} onSelect={handleSelectSavedItem} onDelete={handleDeleteSavedItem}
          onClose={() => setShowSavedItems(false)} isLoading={loadingSaved} userRole={user?.role} />
      )}

      {/* Top Bar — DTS branded */}
      <div className={cn("relative border-b px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between gap-2 shrink-0 backdrop-blur-xl",
        isDark ? "bg-slate-900/90 border-slate-800" : "bg-white/90 border-slate-200"
      )}>
        {/* brand hairline */}
        <div className={cn("absolute bottom-0 inset-x-0 h-[2px] opacity-80", BRAND_GRADIENT)} />

        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button onClick={onClose} aria-label="Back"
            className={cn("flex items-center gap-1 text-sm px-2 sm:px-3 py-1.5 rounded-xl transition-colors shrink-0",
              isDark ? "text-slate-300 hover:bg-slate-800" : "text-slate-600 hover:bg-slate-100"
            )}>
            <ArrowLeft className="w-4 h-4" /><span className="hidden sm:inline">Back</span>
          </button>
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/dts-logo.png" alt="DTS — Dream Team Services"
              className="h-8 sm:h-9 w-8 sm:w-9 rounded-xl object-cover ring-1 ring-white/10 shadow-lg shrink-0" />
            <div className="min-w-0 leading-tight">
              <h1 className={cn("text-base sm:text-lg font-extrabold tracking-tight", BRAND_TEXT)}>AdGen.ai</h1>
              <p className={cn("hidden sm:block text-[9px] font-semibold tracking-[0.18em] uppercase", isDark ? "text-slate-500" : "text-slate-400")}>
                Dream Team Services
              </p>
            </div>
          </div>
        </div>

        {/* Assignment Info Banner */}
        {assignment && (
          <div className={cn("hidden lg:flex items-center gap-2.5 px-3.5 py-1.5 rounded-full text-xs border",
            isDark ? "bg-slate-800/80 text-slate-300 border-slate-700" : "bg-slate-50 text-slate-600 border-slate-200"
          )}>
            <span className={cn("w-1.5 h-1.5 rounded-full", BRAND_GRADIENT)} />
            <span className="font-semibold truncate max-w-[200px]">{assignment.businessName || assignment.displayTitle}</span>
            <span className="opacity-40">·</span>
            <span className="capitalize">{assignment.category}</span>
            <span className="opacity-40">·</span>
            <span>{assignment.clipCount} clips + EC</span>
            <span className="font-mono text-[10px] opacity-50">{assignment.uniqueId}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onComplete && (
            <button onClick={onComplete}
              className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98]">
              <CheckCircle2 className="w-4 h-4" /><span className="hidden sm:inline">Mark Complete</span><span className="sm:hidden">Done</span>
            </button>
          )}
          <button onClick={onClose}
            className={cn("flex items-center gap-1.5 text-xs sm:text-sm font-medium px-3 sm:px-4 py-2 rounded-xl border transition-colors",
              isDark ? "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
            )}>
            <Home className="w-4 h-4" /><span className="hidden md:inline">Close &amp; back to home</span><span className="md:hidden">Home</span>
          </button>
        </div>
      </div>

      {/* Main Content - Scrollable */}
      <div className="flex-1 overflow-y-auto relative">
        {/* ambient brand glows */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-violet-600/10 blur-3xl" />
          <div className="absolute top-1/3 -right-32 w-96 h-96 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 w-80 h-80 rounded-full bg-blue-600/10 blur-3xl" />
        </div>
        <main className="relative max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* LEFT: INPUTS */}
            <div className="lg:col-span-5 space-y-5 sm:space-y-6">
              {/* File Upload */}
              <div className={cn("rounded-2xl border p-4 sm:p-6 shadow-xl",
                isDark ? "bg-slate-900/70 border-slate-800 shadow-black/20 backdrop-blur" : "bg-white/90 border-slate-200 shadow-slate-200/60 backdrop-blur")}>
                <div className="flex items-center gap-3 mb-5 sm:mb-6">
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/25", BRAND_GRADIENT)}>
                    <Layout className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className={cn("text-base sm:text-lg font-bold leading-tight", isDark ? "text-white" : "text-slate-800")}>Assets &amp; Files</h2>
                    <p className={cn("text-[11px]", isDark ? "text-slate-500" : "text-slate-400")}>Step 1 · Upload the business material</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {!formData.noLogo && (
                    <FileUpload label="Business Logo" accept="image/png, image/jpeg" required value={files.logo} onChange={(f) => setFiles(prev => ({ ...prev, logo: f as File }))} helperText="High resolution PNG/JPG" />
                  )}
                  {/* #5 — No-logo option: use business name as a physical name board behind the model */}
                  <div className={cn("rounded-lg border p-3", isDark ? "border-slate-600 bg-slate-700/30" : "border-slate-200 bg-slate-50")}>
                    <label className={cn("flex items-center gap-2 text-sm font-medium cursor-pointer", isDark ? "text-slate-300" : "text-slate-700")}>
                      <input type="checkbox" checked={!!formData.noLogo}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setFormData(prev => ({ ...prev, noLogo: checked }));
                          if (checked) setFiles(prev => ({ ...prev, logo: null }));
                        }}
                        className="rounded border-slate-300" />
                      NO LOGO — use business name as a name board
                    </label>
                    {formData.noLogo && (
                      <input
                        type="text"
                        value={formData.logoNameText || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, logoNameText: e.target.value.toUpperCase() }))}
                        placeholder="BUSINESS NAME"
                        className={cn("mt-2 w-full border rounded-lg px-3 py-2 text-sm uppercase tracking-wide focus:ring-2 outline-none",
                          isDark ? "bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-500 focus:ring-blue-800" : "bg-white border-slate-300 text-slate-700 placeholder-slate-400 focus:ring-blue-200"
                        )}
                      />
                    )}
                  </div>
                  <FileUpload label="Visiting Card" accept="image/*" multiple maxFiles={2} value={files.visitingCard} onChange={(f) => setFiles(prev => ({ ...prev, visitingCard: (f ? (Array.isArray(f) ? f : [f]) : []) as File[] }))} helperText="Front & back (max 2)" />
                  
                  {/* Collapsible sections */}
                  {[
                    { key: 'storeOffice' as const, label: 'Store/Office Images', content: <FileUpload label="" accept="image/*" multiple value={files.storeImage} onChange={(f) => setFiles(prev => ({ ...prev, storeImage: f as File[] }))} helperText="Upload one or more store/office images" /> },
                    { key: 'productImages' as const, label: 'Product Images', content: (
                      <FileUpload label="" accept="image/*" multiple value={files.productImages} onChange={(f) => setFiles(prev => ({ ...prev, productImages: f as File[] }))} helperText="Will appear in main frame & footer" />
                    )},
                    { key: 'flyersPosters' as const, label: 'Flyers / Offer Posters', content: <FileUpload label="" accept="image/*,application/pdf" multiple value={files.flyersPosters} onChange={(f) => setFiles(prev => ({ ...prev, flyersPosters: f as File[] }))} helperText="Upload existing promotional materials" /> },
                    { key: 'voiceInstructions' as const, label: 'Voice Instructions', content: <FileUpload label="" accept="audio/*" multiple value={files.voiceRecording} onChange={(f) => setFiles(prev => ({ ...prev, voiceRecording: (f ? (Array.isArray(f) ? f : [f]) : []) as File[] }))} helperText="Record your requirements" /> },
                  ].map(({ key, label, content: sectionContent }) => (
                    <div key={key} className={cn("border rounded-lg overflow-hidden", isDark ? "border-slate-600" : "border-slate-200")}>
                      <button onClick={() => toggleSection(key)}
                        className={cn("w-full flex items-center justify-between px-3 py-2 text-sm font-semibold transition-colors",
                          isDark ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                        )}>
                        <span>{label}</span>
                        <ChevronDown className={cn("w-4 h-4 transition-transform", !collapsedSections[key] && "rotate-180")} />
                      </button>
                      {!collapsedSections[key] && <div className="p-3 pt-0">{sectionContent}</div>}
                    </div>
                  ))}

                  {/* Product images header checkbox - always visible */}
                  {files.productImages.length > 0 && (
                    <label className={cn("flex items-center gap-2 text-xs cursor-pointer", isDark ? "text-slate-400" : "text-slate-600")}>
                      <input type="checkbox" checked={includeProductsInHeader} onChange={(e) => setIncludeProductsInHeader(e.target.checked)} className="rounded border-slate-300" />
                      Include products in header design
                    </label>
                  )}

                  {/* Text Instructions */}
                  <div>
                    <label className={cn("block text-sm font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>Business Messages / Text Instructions</label>
                    <textarea className={cn("w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none mb-2",
                        isDark ? "bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-500 focus:ring-blue-800" : "bg-white border-slate-300 text-slate-700 focus:ring-blue-200"
                      )} rows={4} placeholder="Paste business messages, requirements, offers..."
                      value={formData.textInstructions} onChange={(e) => setFormData(prev => ({ ...prev, textInstructions: e.target.value }))} />
                    <FileUpload label="" accept=".txt,.pdf,.doc,.docx" multiple value={files.textInstructionsFile} onChange={(f) => setFiles(prev => ({ ...prev, textInstructionsFile: (f ? (Array.isArray(f) ? f : [f]) : []) as File[] }))} helperText="Or upload a text/PDF file" />
                  </div>
                </div>
              </div>

              {/* Configuration */}
              <div className={cn("rounded-2xl border p-4 sm:p-6 shadow-xl",
                isDark ? "bg-slate-900/70 border-slate-800 shadow-black/20 backdrop-blur" : "bg-white/90 border-slate-200 shadow-slate-200/60 backdrop-blur")}>
                <div className="flex items-center gap-3 mb-5 sm:mb-6">
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-lg shadow-violet-600/25", BRAND_GRADIENT)}>
                    <Type className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className={cn("text-base sm:text-lg font-bold leading-tight", isDark ? "text-white" : "text-slate-800")}>Configuration</h2>
                    <p className={cn("text-[11px]", isDark ? "text-slate-500" : "text-slate-400")}>Step 2 · Choose how the ad is made</p>
                  </div>
                </div>
                <div className="space-y-5">
                  {/* Creation Mode */}
                  <div>
                    <label className={cn("block text-sm font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>Creation Mode</label>
                    <div className="grid grid-cols-2 gap-3">
                      {[{ mode: 'video' as const, icon: Video, label: 'Video Ad' }, { mode: 'poster' as const, icon: PenTool, label: 'Poster Only' }].map(({ mode, icon: Icon, label }) => (
                        <button key={mode} onClick={() => setCreationMode(mode)}
                          className={cn("flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all",
                            creationMode === mode
                              ? cn("border-transparent text-white shadow-lg shadow-blue-600/25", BRAND_GRADIENT)
                              : (isDark ? "border-slate-700 hover:border-slate-600 text-slate-400 bg-slate-800/40" : "border-slate-200 hover:border-slate-300 text-slate-600 bg-white")
                          )}>
                          <Icon className="w-4 h-4" /><span>{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* #4a — Aspect Ratio */}
                  <div>
                    <label className={cn("flex items-center gap-1.5 text-sm font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>
                      <Ratio className="w-4 h-4 text-blue-500" /> Aspect Ratio
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {([['9:16', 'Vertical'], ['16:9', 'Horizontal']] as const).map(([r, label]) => (
                        <button key={r} type="button" onClick={() => setFormData(prev => ({ ...prev, aspectRatio: r }))}
                          className={cn("flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all",
                            formData.aspectRatio === r
                              ? (isDark ? "border-blue-500 bg-blue-900/30 text-blue-400" : "border-blue-500 bg-blue-50 text-blue-700")
                              : (isDark ? "border-slate-600 hover:border-slate-500 text-slate-400" : "border-slate-200 hover:border-slate-300 text-slate-600")
                          )}>
                          <span className="font-mono">{r}</span><span className="text-xs opacity-70">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* #4b — Language (searchable) */}
                  <div>
                    <label className={cn("flex items-center gap-1.5 text-sm font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>
                      <Languages className="w-4 h-4 text-purple-500" /> Language
                    </label>
                    <div className="relative">
                      <button type="button" onClick={() => { setLanguageOpen(o => !o); setLanguageSearch(''); }}
                        className={cn("w-full flex items-center justify-between border rounded-lg px-3 py-2 text-sm outline-none",
                          isDark ? "bg-slate-700 border-slate-600 text-slate-200" : "bg-white border-slate-300 text-slate-700"
                        )}>
                        <span>{formData.language}</span>
                        <ChevronDown className={cn("w-4 h-4 transition-transform", languageOpen && "rotate-180")} />
                      </button>
                      {languageOpen && (
                        <div className={cn("absolute z-30 mt-1 w-full rounded-lg border shadow-lg overflow-hidden",
                          isDark ? "bg-slate-800 border-slate-600" : "bg-white border-slate-200")}>
                          <input autoFocus value={languageSearch} onChange={(e) => setLanguageSearch(e.target.value)}
                            placeholder="Search language..."
                            className={cn("w-full px-3 py-2 text-sm border-b outline-none",
                              isDark ? "bg-slate-800 border-slate-600 text-slate-200 placeholder-slate-500" : "bg-white border-slate-200 text-slate-700 placeholder-slate-400")} />
                          <div className="max-h-48 overflow-y-auto">
                            {LANGUAGE_OPTIONS.filter(l => l.toLowerCase().includes(languageSearch.toLowerCase())).map(l => (
                              <button key={l} type="button"
                                onClick={() => { setFormData(prev => ({ ...prev, language: l })); setLanguageOpen(false); setLanguageSearch(''); }}
                                className={cn("w-full text-left px-3 py-2 text-sm transition-colors",
                                  formData.language === l
                                    ? (isDark ? "bg-purple-900/30 text-purple-300" : "bg-purple-50 text-purple-700")
                                    : (isDark ? "text-slate-300 hover:bg-slate-700" : "text-slate-700 hover:bg-slate-100"))}>
                                {l}
                              </button>
                            ))}
                            {LANGUAGE_OPTIONS.filter(l => l.toLowerCase().includes(languageSearch.toLowerCase())).length === 0 && (
                              <p className={cn("px-3 py-2 text-xs", isDark ? "text-slate-500" : "text-slate-400")}>No language found</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Ad Type */}
                  <div>
                    <label className={cn("block text-sm font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>Ad Type</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={() => setFormData(prev => ({ ...prev, adType: AdType.COMMERCIAL }))}
                        className={cn("px-4 py-2 rounded-lg text-sm font-medium border transition-all",
                          formData.adType === AdType.COMMERCIAL
                            ? (isDark ? "border-blue-500 bg-blue-900/30 text-blue-400" : "border-blue-500 bg-blue-50 text-blue-700")
                            : (isDark ? "border-slate-600 hover:border-slate-500 text-slate-400" : "border-slate-200 hover:border-slate-300 text-slate-600")
                        )}>Commercial</button>
                      <button onClick={() => setFormData(prev => ({ ...prev, adType: AdType.FESTIVAL }))}
                        className={cn("px-4 py-2 rounded-lg text-sm font-medium border transition-all",
                          formData.adType === AdType.FESTIVAL
                            ? (isDark ? "border-purple-500 bg-purple-900/30 text-purple-400" : "border-purple-500 bg-purple-50 text-purple-700")
                            : (isDark ? "border-slate-600 hover:border-slate-500 text-slate-400" : "border-slate-200 hover:border-slate-300 text-slate-600")
                        )}>Festival Wishes</button>
                    </div>
                  </div>

                  {/* Festival Name */}
                  {formData.adType === AdType.FESTIVAL && (
                    <div>
                      <label className={cn("block text-sm font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>Festival Name</label>
                      <select className={cn("w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none",
                          isDark ? "bg-slate-700 border-slate-600 text-slate-200 focus:ring-purple-800" : "bg-white border-slate-300 text-slate-700 focus:ring-purple-200"
                        )} value={selectedFestivalOption} onChange={(e) => {
                          const selectedFestival = e.target.value;
                          setSelectedFestivalOption(selectedFestival);
                          setCustomFestivalName('');
                          setFormData(prev => ({ ...prev, festivalName: selectedFestival }));
                        }}>
                        <option value="">-- Select Festival --</option>
                        {upcomingFestivals.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <div className="mt-2 flex items-center gap-2">
                        <span className={cn("text-xs font-medium whitespace-nowrap", isDark ? "text-slate-400" : "text-slate-500")}>Or type custom:</span>
                        <input
                          type="text"
                          value={customFestivalName}
                          onChange={(e) => {
                            const customValue = e.target.value;
                            setCustomFestivalName(customValue);
                            if (customValue.trim()) {
                              setSelectedFestivalOption(CUSTOM_FESTIVAL_OPTION);
                              setFormData(prev => ({ ...prev, festivalName: customValue.trim() }));
                            } else {
                              setSelectedFestivalOption('');
                              setFormData(prev => ({ ...prev, festivalName: '' }));
                            }
                          }}
                          placeholder="Custom festival"
                          className={cn(
                            "flex-1 border rounded-lg px-3 py-1.5 text-sm focus:ring-2 outline-none",
                            isDark
                              ? "bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-500 focus:ring-purple-800"
                              : "bg-white border-slate-300 text-slate-700 placeholder-slate-400 focus:ring-purple-200"
                          )}
                        />
                      </div>
                    </div>
                  )}

                  {/* Attire — Video only */}
                  {creationMode === 'video' && (
                    <div>
                      <label className={cn("block text-sm font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>Model Attire</label>
                      <select className={cn("w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none",
                          isDark ? "bg-slate-700 border-slate-600 text-slate-200 focus:ring-blue-800" : "bg-white border-slate-300 text-slate-700 focus:ring-blue-200"
                        )} value={formData.attireType} onChange={(e) => setFormData(prev => ({ ...prev, attireType: e.target.value as AttireType }))}>
                        <option value={AttireType.PROFESSIONAL}>Professional (Premium Beige/Pastel Suit)</option>
                        <option value={AttireType.TRADITIONAL}>Traditional (Designer Saree)</option>
                      </select>
                    </div>
                  )}

                  {/* Duration — Video only */}
                  {creationMode === 'video' && (
                    <div>
                      <label className={cn("block text-sm font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>Video Duration</label>
                      {durationLocked ? (
                        <div className={cn("flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm",
                          isDark ? "bg-slate-700/60 border-slate-600 text-slate-200" : "bg-slate-100 border-slate-200 text-slate-700")}>
                          <span className="font-mono font-semibold">{formData.duration}s · {Math.round(formData.duration / 8)} clips</span>
                          <span className={cn("text-[11px] px-2 py-0.5 rounded-full", isDark ? "bg-blue-900/40 text-blue-300" : "bg-blue-100 text-blue-700")}>
                            🔒 Fixed by assignment{assignment?.category ? ` · ${assignment.category}` : ''}
                          </span>
                        </div>
                      ) : (
                      <>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <button onClick={() => setFormData(prev => ({ ...prev, durationMode: 'preset', duration: 16 }))}
                          className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                            formData.durationMode === 'preset' ? (isDark ? "border-blue-500 bg-blue-900/30 text-blue-400" : "border-blue-500 bg-blue-50 text-blue-700")
                              : (isDark ? "border-slate-600 text-slate-400" : "border-slate-200 text-slate-600")
                          )}>Preset</button>
                        <button onClick={() => setFormData(prev => ({ ...prev, durationMode: 'custom', duration: 24 }))}
                          className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                            formData.durationMode === 'custom' ? (isDark ? "border-violet-500 bg-violet-900/30 text-violet-400" : "border-violet-500 bg-violet-50 text-violet-700")
                              : (isDark ? "border-slate-600 text-slate-400" : "border-slate-200 text-slate-600")
                          )}>Custom</button>
                      </div>
                      {formData.durationMode === 'preset' ? (
                        <select className={cn("w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none",
                            isDark ? "bg-slate-700 border-slate-600 text-slate-200 focus:ring-blue-800" : "bg-white border-slate-300 text-slate-700 focus:ring-blue-200"
                          )} value={formData.duration} onChange={(e) => setFormData(prev => ({ ...prev, duration: parseInt(e.target.value) }))}>
                          <option value={16}>16 Seconds (2 Clips)</option>
                          <option value={32}>32 Seconds (4 Clips)</option>
                          <option value={48}>48 Seconds (6 Clips)</option>
                          <option value={64}>64 Seconds (8 Clips)</option>
                        </select>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <input type="number" min={8} max={120} step={8}
                            className={cn("w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none",
                              isDark ? "bg-slate-700 border-slate-600 text-slate-200 focus:ring-violet-800" : "bg-white border-slate-300 text-slate-700 focus:ring-violet-200"
                            )} value={formData.duration}
                            onChange={(e) => {
                              let val = Math.round((parseInt(e.target.value) || 8) / 8) * 8;
                              setFormData(prev => ({ ...prev, duration: Math.max(8, Math.min(120, val)) }));
                            }} />
                          <span className={cn("text-sm whitespace-nowrap", isDark ? "text-slate-400" : "text-slate-500")}>sec</span>
                        </div>
                      )}
                      </>
                      )}
                    </div>
                  )}

                  {/* Custom Script Option — Video only */}
                  {creationMode === 'video' && (
                    <div>
                      <label className={cn("flex items-center gap-2 text-sm font-semibold cursor-pointer", isDark ? "text-slate-300" : "text-slate-700")}>
                        <input type="checkbox" checked={useCustomScript} onChange={(e) => setUseCustomScript(e.target.checked)} className="rounded border-slate-300" />
                        Use Custom Script (Business-Provided)
                      </label>
                      {useCustomScript && (
                        <div className="mt-2">
                          <textarea
                            className={cn("w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none",
                              isDark ? "bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-500 focus:ring-blue-800" : "bg-white border-slate-300 text-slate-700 focus:ring-blue-200"
                            )} rows={6} placeholder="Paste the business's raw script here... It will be split into 8-second clips automatically and used for VEO prompts generation."
                            value={customScript} onChange={(e) => setCustomScript(e.target.value)} />
                          {(() => {
                            const wordCount = customScript.trim().split(/\s+/).filter(Boolean).length;
                            const estSeconds = wordCount > 0 ? Math.round(wordCount / 2.3) : 0;
                            const estClips = wordCount > 0 ? Math.max(1, Math.ceil(estSeconds / 8)) : 0;
                            return (
                              <div className={cn("mt-2 p-2.5 rounded-lg border text-xs space-y-1", isDark ? "bg-slate-600/50 border-slate-500" : "bg-blue-50 border-blue-200")}>
                                {wordCount > 0 ? (
                                  <>
                                    <div className="flex items-center justify-between">
                                      <span className={isDark ? "text-slate-300" : "text-slate-600"}>Estimated Duration:</span>
                                      <span className="font-bold text-primary">{estSeconds}s ({estClips} clips × 8s)</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className={isDark ? "text-slate-300" : "text-slate-600"}>Word Count:</span>
                                      <span className="font-medium">{wordCount} words</span>
                                    </div>
                                    {[16, 32, 48, 64].some(p => estSeconds <= p) && (
                                      <div className="flex gap-1.5 mt-1">
                                        {[16, 32, 48, 64].map(p => (
                                          <span key={p} className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium",
                                            estSeconds <= p
                                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                              : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                                          )}>
                                            {p}s {estSeconds <= p ? '✓' : '✗'}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <span className={isDark ? "text-slate-400" : "text-slate-500"}>Paste a script to see duration estimate</span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Generate Button */}
                  <div className="flex space-x-2">
                    <button onClick={handleGenerate} disabled={status.isProcessing}
                      className={cn("flex-1 py-3.5 px-4 rounded-2xl text-white font-bold text-sm flex items-center justify-center space-x-2 transition-all",
                        status.isProcessing
                          ? "bg-slate-500/70 cursor-not-allowed"
                          : cn(BRAND_GRADIENT, BRAND_GRADIENT_HOVER, "shadow-xl shadow-blue-600/30 hover:shadow-blue-500/40 active:scale-[0.99]")
                      )}>
                      {status.isProcessing ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Rocket className="w-5 h-5" />}
                      <span>{status.isProcessing ? 'Processing...' : creationMode === 'poster' ? 'Extract Business Info' : 'Start Generation'}</span>
                    </button>
                    {status.isProcessing && (
                      <button onClick={handleStopGeneration}
                        className="py-3.5 px-4 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm flex items-center space-x-2 active:scale-[0.98] transition-all">
                        <StopCircle className="w-5 h-5" /><span>Stop</span>
                      </button>
                    )}
                  </div>
                  {status.error && (
                    <div className="flex items-start space-x-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-3 rounded-lg text-sm">
                      <AlertCircle className="w-5 h-5 flex-shrink-0" /><span>{status.error}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT: OUTPUTS */}
            <div className="lg:col-span-7" ref={outputPanelRef}>
              {(status.isProcessing || status.step) && (
                <div className={cn("rounded-2xl border px-4 py-3.5 mb-4 shadow-xl",
                  isDark ? "bg-slate-900/70 border-slate-800 shadow-black/20 backdrop-blur" : "bg-white/90 border-slate-200 shadow-slate-200/60 backdrop-blur")}>
                  <div className="flex items-center justify-between mb-2.5">
                    <h2 className={cn("text-sm font-bold", isDark ? "text-white" : "text-slate-800")}>Generation Status</h2>
                    <div className="flex items-center gap-2 text-xs">
                      <Wand2 className={cn("w-3.5 h-3.5 text-blue-500", status.isProcessing && "animate-pulse")} />
                      <span className={cn(status.isProcessing && "animate-pulse", isDark ? "text-slate-400" : "text-slate-600")}>{status.step}</span>
                      <span className={cn("font-mono font-bold text-[11px] px-1.5 py-0.5 rounded-md",
                        isDark ? "bg-slate-800 text-cyan-400" : "bg-slate-100 text-blue-600")}>{Math.round(status.progress)}%</span>
                    </div>
                  </div>
                  <div className={cn("w-full rounded-full h-2 overflow-hidden", isDark ? "bg-slate-800" : "bg-slate-100")}>
                    <div className={cn("h-2 rounded-full transition-all duration-500", BRAND_GRADIENT)} style={{ width: `${status.progress}%` }} />
                  </div>
                </div>
              )}

              {outputs && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className={cn("text-lg sm:text-xl font-extrabold tracking-tight", BRAND_TEXT)}>
                      Generated Assets
                      {viewingSavedItem && <span className="ml-2 text-sm font-normal text-slate-500">(Viewing Saved)</span>}
                    </h2>
                    <div className="flex items-center space-x-2">
                      <button onClick={handleSave} disabled={isSaving || saveSuccess}
                        className={cn("flex items-center space-x-1 text-sm font-medium px-3 py-1.5 rounded-lg transition-all",
                          saveSuccess ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : isSaving ? "bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-700"
                            : "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400"
                        )}>
                        {saveSuccess ? <><Check className="w-4 h-4" /><span>Saved!</span></> : isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Saving...</span></> : <><Save className="w-4 h-4" /><span>Save</span></>}
                      </button>
                    </div>
                  </div>

                  {/* Business Intelligence extracted silently - not shown */}

                  {/* Video Generation Platform Link - at top */}
                  {creationMode === 'video' && (
                    <a href="https://labs.google/fx/tools/flow" target="_blank" rel="noopener noreferrer"
                      className={cn("flex items-center justify-center space-x-3 w-full py-3.5 px-6 rounded-2xl font-semibold text-sm text-white shadow-xl shadow-blue-600/25 hover:shadow-blue-500/35 transition-all active:scale-[0.99]",
                        BRAND_GRADIENT, BRAND_GRADIENT_HOVER)}>
                      <Video className="w-5 h-5" /><span>Open Video Generation Platform</span><ExternalLink className="w-4 h-4 opacity-70" />
                    </a>
                  )}

                  {/* Video outputs */}
                  {creationMode === 'video' && outputs.mainFramePrompts?.length > 0 && (
                      <OutputSection title={`1. Main Frame Prompts (${outputs.mainFramePrompts.length} Clips)`} sectionKey="mainFrame"
                        collapsedOutputs={collapsedOutputs} toggleOutputSection={toggleOutputSection}
                        isDark={isDark} quickCopyItems={outputs.mainFramePrompts}>
                        <GeneratedCard title="Main Frame" content={outputs.mainFramePrompts} variant="dropdown" sectionType="mainFrame"
                          showRefinement={true} onRefine={(i) => handleRefineSection('mainFrame', i)} isRefining={refiningSection === 'mainFrame'} hideTitle />
                      </OutputSection>
                  )}

                  {creationMode === 'video' && outputs.headerPrompt && (
                      <OutputSection title="2. Header Prompt" sectionKey="header"
                        collapsedOutputs={collapsedOutputs} toggleOutputSection={toggleOutputSection}
                        isDark={isDark} copyContent={outputs.headerPrompt}>
                        <GeneratedCard title="Header" content={outputs.headerPrompt} sectionType="header"
                          showRefinement={true} onRefine={(i) => handleRefineSection('header', i)} isRefining={refiningSection === 'header'} hideTitle />
                      </OutputSection>
                  )}

                  {creationMode === 'video' && outputs.posterPrompt && (
                      <OutputSection title="3. Poster Design" sectionKey="poster"
                        collapsedOutputs={collapsedOutputs} toggleOutputSection={toggleOutputSection}
                        isDark={isDark} copyContent={outputs.posterPrompt}>
                        <GeneratedCard title="Poster" content={outputs.posterPrompt} isJson sectionType="poster"
                          showRefinement={true} onRefine={(i) => handleRefineSection('poster', i)} isRefining={refiningSection === 'poster'} hideTitle />
                      </OutputSection>
                  )}

                  {creationMode === 'video' && outputs.voiceOverScript && (
                      <OutputSection title={`4. Voice Over Script (${formData.language || 'Telugu'})`} sectionKey="voiceOver"
                        collapsedOutputs={collapsedOutputs} toggleOutputSection={toggleOutputSection}
                        isDark={isDark}>
                        <GeneratedCard title="Voice Over" content={outputs.voiceOverScript} sectionType="voiceOver"
                          showTransliteration showRefinement={true}
                          onRefine={(i) => handleRefineSection('voiceOver', i)} isRefining={refiningSection === 'voiceOver'} hideTitle />
                      </OutputSection>
                  )}

                  {creationMode === 'video' && outputs.veoPrompts?.length > 0 && (
                      <OutputSection title="5. Veo 3 Video Prompts" sectionKey="veo"
                        collapsedOutputs={collapsedOutputs} toggleOutputSection={toggleOutputSection}
                        isDark={isDark}>
                        <GeneratedCard title="Veo" content={outputs.veoPrompts} variant="dropdown" sectionType="veo"
                          showRefinement={true} onRefine={(i) => handleRefineSection('veo', i)} isRefining={refiningSection === 'veo'} hideTitle />
                      </OutputSection>
                  )}

                  {/* Stock Image Prompts */}
                  {creationMode === 'video' && outputs.voiceOverScript && (
                        <div className={cn("rounded-2xl border overflow-hidden shadow-lg", isDark ? "bg-slate-900/70 border-slate-800 shadow-black/10" : "bg-white border-slate-200 shadow-slate-200/50")}>
                          <div className={cn("relative px-4 py-3 border-b flex justify-between items-center", isDark ? "bg-slate-900/80 border-slate-800" : "bg-slate-50 border-slate-200")}>
                            <div className={cn("absolute left-0 top-0 bottom-0 w-1", BRAND_GRADIENT)} />
                            <div className="flex items-center space-x-2 pl-1.5">
                              <Camera className="w-4 h-4 text-teal-500" />
                              <h3 className={cn("font-semibold text-sm uppercase tracking-wide", isDark ? "text-slate-200" : "text-slate-800")}>6. Stock Image Prompts (B-Roll)</h3>
                            </div>
                            {!outputs.stockImagePrompts && (
                              <div className="flex items-center space-x-2">
                                <select value={stockImageTheme} onChange={(e) => setStockImageTheme(e.target.value)}
                                  className={cn("text-xs font-medium py-1.5 px-2 rounded-lg border", isDark ? "bg-slate-700 border-slate-600 text-slate-200" : "bg-white border-slate-300 text-slate-700")}>
                                  <option value="indian">🇮🇳 Indian</option><option value="american">🇺🇸 American</option>
                                  <option value="middle-eastern">🇦🇪 Middle Eastern</option><option value="european">🇪🇺 European</option>
                                  <option value="east-asian">🇯🇵 East Asian</option><option value="african">🇿🇦 African</option><option value="universal">🌍 Universal</option>
                                </select>
                                <button onClick={handleGenerateStockImages} disabled={isGeneratingStock}
                                  className={cn("flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all",
                                    isGeneratingStock ? (isDark ? "bg-slate-700 text-slate-400 cursor-not-allowed" : "bg-slate-100 text-slate-400")
                                      : (isDark ? "bg-teal-900/40 text-teal-400 hover:bg-teal-900/60 border border-teal-700/50" : "bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200")
                                  )}>
                                  {isGeneratingStock ? <><Loader2 className="w-3 h-3 animate-spin" /><span>Generating...</span></> : <><Sparkles className="w-3 h-3" /><span>Generate</span></>}
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="p-4">
                            {!outputs.stockImagePrompts && !isGeneratingStock && (
                              <div className={cn("text-center py-6", isDark ? "text-slate-500" : "text-slate-400")}>
                                <Camera className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                <p className="text-sm font-medium">Stock image prompts for editing B-roll</p>
                              </div>
                            )}
                            {stockImageError && (
                              <div className="flex items-start space-x-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-3 rounded-lg text-sm">
                                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{stockImageError}</span>
                              </div>
                            )}
                            {isGeneratingStock && (
                              <div className="flex items-center justify-center py-8 space-x-2">
                                <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
                                <span className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Generating stock image prompts...</span>
                              </div>
                            )}
                            {outputs.stockImagePrompts?.map((item: any, idx: number) => (
                              <div key={idx} className={cn("rounded-lg border p-4 mb-3", isDark ? "bg-slate-700/50 border-slate-600" : "bg-slate-50 border-slate-200")}>
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex items-center space-x-2">
                                    <span className={cn("inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold", isDark ? "bg-teal-900/50 text-teal-400" : "bg-teal-100 text-teal-700")}>{item.id || idx + 1}</span>
                                    <span className={cn("font-semibold text-sm", isDark ? "text-slate-200" : "text-slate-700")}>{item.concept}</span>
                                  </div>
                                  <button onClick={() => { navigator.clipboard.writeText(item.prompt); setCopiedStockIdx(idx); setTimeout(() => setCopiedStockIdx(null), 2000); }}
                                    className={cn("flex items-center space-x-1 text-xs px-2 py-1 rounded transition-colors",
                                      copiedStockIdx === idx ? (isDark ? "text-green-400 bg-green-900/30" : "text-green-600 bg-green-50")
                                        : (isDark ? "text-slate-400 hover:text-teal-400" : "text-slate-500 hover:text-teal-600")
                                    )}>
                                    {copiedStockIdx === idx ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                    <span>{copiedStockIdx === idx ? 'Copied' : 'Copy'}</span>
                                  </button>
                                </div>
                                <p className={cn("text-sm leading-relaxed", isDark ? "text-slate-300" : "text-slate-600")}>{item.prompt}</p>
                                {/* #10 — per-image refine */}
                                {stockRefineIdx === idx ? (
                                  <div className="mt-2 flex items-center gap-2">
                                    <input autoFocus value={stockRefineText} onChange={(e) => setStockRefineText(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') handleRefineStockImage(idx); }}
                                      placeholder="Describe the change for this image..."
                                      className={cn("flex-1 border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2",
                                        isDark ? "bg-slate-800 border-slate-600 text-slate-200 focus:ring-teal-800" : "bg-white border-slate-300 text-slate-700 focus:ring-teal-200")} />
                                    <button onClick={() => handleRefineStockImage(idx)} disabled={refiningStockIdx === idx || !stockRefineText.trim()}
                                      className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 inline-flex items-center gap-1">
                                      {refiningStockIdx === idx ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} Apply
                                    </button>
                                    <button onClick={() => { setStockRefineIdx(null); setStockRefineText(''); }}
                                      className={cn("text-xs px-2 py-1.5 rounded-lg", isDark ? "text-slate-400 hover:bg-slate-700" : "text-slate-500 hover:bg-slate-100")}>Cancel</button>
                                  </div>
                                ) : (
                                  <button onClick={() => { setStockRefineIdx(idx); setStockRefineText(''); }}
                                    className={cn("mt-2 inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors",
                                      isDark ? "text-teal-400 hover:bg-teal-900/30" : "text-teal-600 hover:bg-teal-50")}>
                                    <Wand2 className="w-3 h-3" /> Refine this image
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                  )}

                  {/* 7. Overlay Texts (#14) */}
                  {creationMode === 'video' && outputs.voiceOverScript && (
                    <div className={cn("rounded-2xl border overflow-hidden shadow-lg", isDark ? "bg-slate-900/70 border-slate-800 shadow-black/10" : "bg-white border-slate-200 shadow-slate-200/50")}>
                      <div className={cn("relative px-4 py-3 border-b flex justify-between items-center", isDark ? "bg-slate-900/80 border-slate-800" : "bg-slate-50 border-slate-200")}>
                        <div className={cn("absolute left-0 top-0 bottom-0 w-1", BRAND_GRADIENT)} />
                        <div className="flex items-center space-x-2 pl-1.5">
                          <TypeIcon className="w-4 h-4 text-amber-500" />
                          <h3 className={cn("font-semibold text-sm uppercase tracking-wide", isDark ? "text-slate-200" : "text-slate-800")}>7. Overlay Texts</h3>
                        </div>
                        {!outputs.overlayTexts && (
                          <button onClick={handleGenerateOverlayTexts} disabled={isGeneratingOverlay}
                            className={cn("flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all",
                              isGeneratingOverlay ? (isDark ? "bg-slate-700 text-slate-400 cursor-not-allowed" : "bg-slate-100 text-slate-400")
                                : (isDark ? "bg-amber-900/40 text-amber-400 hover:bg-amber-900/60 border border-amber-700/50" : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"))}>
                            {isGeneratingOverlay ? <><Loader2 className="w-3 h-3 animate-spin" /><span>Generating...</span></> : <><Sparkles className="w-3 h-3" /><span>Generate</span></>}
                          </button>
                        )}
                      </div>
                      <div className="p-4">
                        {!outputs.overlayTexts && !isGeneratingOverlay && (
                          <div className={cn("text-center py-6", isDark ? "text-slate-500" : "text-slate-400")}>
                            <TypeIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p className="text-sm font-medium">On-screen overlay texts (1–3 per clip) with a CapCut sound-effect for each — for editing</p>
                          </div>
                        )}
                        {overlayError && (
                          <div className="flex items-start space-x-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-3 rounded-lg text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{overlayError}</span>
                          </div>
                        )}
                        {isGeneratingOverlay && (
                          <div className="flex items-center justify-center py-8 space-x-2">
                            <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                            <span className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Generating overlay texts...</span>
                          </div>
                        )}
                        {outputs.overlayTexts && outputs.overlayTexts.length > 0 && (
                          Array.from(new Set(outputs.overlayTexts.map((o: any) => o.clip))).sort((a: any, b: any) => a - b).map((clip: any) => (
                            <div key={clip} className="mb-3 last:mb-0">
                              <p className={cn("text-[11px] font-semibold uppercase tracking-wide mb-1.5", isDark ? "text-slate-400" : "text-slate-500")}>Clip {clip}</p>
                              {outputs.overlayTexts!.filter((o: any) => o.clip === clip).map((o: any, i: number) => (
                                <div key={i} className={cn("flex items-center justify-between gap-2 rounded-lg border p-2.5 mb-1.5", isDark ? "bg-slate-700/50 border-slate-600" : "bg-slate-50 border-slate-200")}>
                                  <div className="flex items-center gap-2 min-w-0">
                                    <TypeIcon className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                                    <span className={cn("font-medium text-sm truncate", isDark ? "text-slate-200" : "text-slate-700")}>{o.text}</span>
                                  </div>
                                  <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full flex-shrink-0", isDark ? "bg-slate-800 text-amber-300 border border-amber-700/40" : "bg-amber-100 text-amber-700")}>
                                    <Music className="w-3 h-3" /> {o.soundEffect}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ))
                        )}
                        {outputs.overlayTexts && outputs.overlayTexts.length === 0 && (
                          <p className={cn("text-sm text-center py-4", isDark ? "text-slate-500" : "text-slate-400")}>No overlay texts needed for this script.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!outputs && !status.isProcessing && (
                <div className={cn("rounded-2xl border p-8 sm:p-12 text-center shadow-xl",
                  isDark ? "bg-slate-900/70 border-slate-800 shadow-black/20 backdrop-blur" : "bg-white/90 border-slate-200 shadow-slate-200/60 backdrop-blur")}>
                  <div className={cn("w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-600/25", BRAND_GRADIENT)}>
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <h3 className={cn("text-xl font-extrabold mb-1.5 tracking-tight", BRAND_TEXT)}>Just dream big, we build it</h3>
                  <p className={cn("text-sm mb-7", isDark ? "text-slate-400" : "text-slate-500")}>Your complete ad kit — frames, poster, voice-over, Veo prompts, B-roll &amp; overlays.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto text-left">
                    {[
                      { n: '1', t: 'Upload assets', d: 'Logo or name board, cards & store photos' },
                      { n: '2', t: 'Configure', d: 'Mode, ratio, language, attire & duration' },
                      { n: '3', t: 'Generate', d: 'Copy each prompt into the video platform' },
                    ].map(s => (
                      <div key={s.n} className={cn("rounded-xl border p-3.5", isDark ? "bg-slate-800/60 border-slate-700/60" : "bg-slate-50 border-slate-200")}>
                        <span className={cn("inline-flex w-6 h-6 mb-2 rounded-lg text-[11px] font-bold text-white items-center justify-center", BRAND_GRADIENT)}>{s.n}</span>
                        <p className={cn("text-xs font-bold mb-0.5", isDark ? "text-slate-200" : "text-slate-700")}>{s.t}</p>
                        <p className={cn("text-[11px] leading-relaxed", isDark ? "text-slate-500" : "text-slate-400")}>{s.d}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

// Collapsible Output Section wrapper
const OutputSection: React.FC<{
  title: string; sectionKey: string; children: React.ReactNode;
  collapsedOutputs: Record<string, boolean>; toggleOutputSection: (s: string) => void;
  isDark: boolean;
  copyContent?: string;
  quickCopyItems?: string[];
}> = ({ title, sectionKey, children, collapsedOutputs, toggleOutputSection, isDark, copyContent, quickCopyItems }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!copyContent) return;
    const cleaned = cleanPromptForClipboard(copyContent);
    navigator.clipboard.writeText(cleaned);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className={cn("rounded-2xl border overflow-hidden shadow-lg",
      isDark ? "border-slate-800 shadow-black/10" : "border-slate-200 shadow-slate-200/50")}>
      <div className={cn("relative w-full flex items-center justify-between gap-3 px-4 py-3",
        isDark ? "bg-slate-900/80 text-slate-200" : "bg-slate-50 text-slate-800"
      )}>
        <div className={cn("absolute left-0 top-0 bottom-0 w-1", BRAND_GRADIENT)} />
        <div className="min-w-0 flex-1 pl-1.5">
          <span className="font-semibold text-sm uppercase tracking-wide text-left">{title}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {quickCopyItems && quickCopyItems.length > 0 && (
            <MainFrameHeaderActions prompts={quickCopyItems} isDark={isDark} />
          )}
          {copyContent && (
            <span
              onClick={handleCopy}
              className={cn(
                "flex items-center space-x-1 text-xs font-medium px-2 py-1 rounded transition-colors",
                copied
                  ? isDark ? "text-green-400 bg-green-900/30" : "text-green-600 bg-green-50"
                  : isDark ? "text-slate-400 hover:text-blue-400 hover:bg-blue-900/30" : "text-slate-500 hover:text-blue-600 hover:bg-blue-50"
              )}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => toggleOutputSection(sectionKey)}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
              isDark ? "text-slate-400 hover:bg-slate-700 hover:text-white" : "text-slate-500 hover:bg-slate-200 hover:text-slate-900"
            )}
            aria-label={collapsedOutputs[sectionKey] ? `Collapse ${title}` : `Expand ${title}`}
          >
            <ChevronDown className={cn("w-4 h-4 transition-transform", collapsedOutputs[sectionKey] && "rotate-180")} />
          </button>
        </div>
      </div>
      {collapsedOutputs[sectionKey] && children}
    </div>
  );
};

const MainFrameHeaderActions: React.FC<{
  prompts: string[];
  isDark: boolean;
}> = ({ prompts, isDark }) => {
  const promptFingerprint = prompts
    .map((prompt) => cleanPromptForClipboard(prompt))
    .join('||');
  const storageKey = `ai-platform-main-frame-last-copied-${promptFingerprint}`;
  const [copiedKey, setCopiedKey] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(storageKey);
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setCopiedKey(window.localStorage.getItem(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (copiedKey) {
      window.localStorage.setItem(storageKey, copiedKey);
      return;
    }
    window.localStorage.removeItem(storageKey);
  }, [copiedKey, storageKey]);

  const copyText = (event: React.MouseEvent, key: string, content: string) => {
    event.stopPropagation();
    navigator.clipboard.writeText(cleanPromptForClipboard(content));
    setCopiedKey(key);
  };

  const copiedIndex = copiedKey?.startsWith('clip-') ? Number(copiedKey.replace('clip-', '')) : null;
  const copiedFrameLabel = copiedIndex !== null && !Number.isNaN(copiedIndex) ? `F${copiedIndex + 1}` : null;

  const clearCopiedState = (event: React.MouseEvent) => {
    event.stopPropagation();
    setCopiedKey(null);
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap justify-end">
      {copiedFrameLabel && (
        <button
          type="button"
          onClick={clearCopiedState}
          title={`Last copied ${copiedFrameLabel}. Click to clear this marker.`}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all",
            isDark
              ? "border-emerald-500/40 bg-emerald-900/20 text-emerald-300 hover:bg-emerald-900/30"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          )}
        >
          <Check className="w-3 h-3" />
          <span>Last: {copiedFrameLabel}</span>
        </button>
      )}
      {prompts.map((prompt, index) => {
        const key = `clip-${index}`;
        const isCopied = copiedKey === key;
        const frameLabel = `F${index + 1}`;

        return (
          <button
            key={key}
            type="button"
            onClick={(event) => copyText(event, key, prompt)}
            title={`Copy ${frameLabel} main frame prompt`}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-all",
              isCopied
                ? isDark ? "border-emerald-500/50 bg-emerald-900/30 text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                : isDark ? "border-slate-500 bg-white text-slate-900 shadow-sm hover:border-blue-500 hover:text-blue-700" : "border-slate-300 bg-white text-slate-700 shadow-sm hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            )}
          >
            {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3 opacity-70" />}
            <span>{frameLabel}</span>
          </button>
        );
      })}
    </div>
  );
};

export default AIPlatformApp;

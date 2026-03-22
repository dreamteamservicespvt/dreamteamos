import React, { useState, useEffect, useRef } from 'react';
import {
  Wand2, Sparkles, Layout, Type, Mic, Image as ImageIcon, Rocket, AlertCircle,
  Loader2, Bookmark, Save, Check, Camera, Video, PenTool, ChevronDown, Copy,
  ExternalLink, StopCircle, ArrowLeft, CheckCircle2
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { FileUpload } from './FileUpload';
import { GeneratedCard } from './GeneratedCard';
import { SavedItems, SavedGeneration } from './SavedItems';
import { AdFormData, AdType, AttireType, FileStore, GeneratedOutputs, GenerationStatus } from '@/types/aiPlatform';
import { generateAdAssets, extractBusinessOnly, generateStockImagePrompts, refineSection, SectionType, extractBusinessNameFromInfo } from '@/services/geminiService';
import { collection, addDoc, getDocs, query, where, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/store/authStore';
import type { WorkAssignment } from '@/types';
import { useConfirm } from '@/hooks/useConfirm';

interface AIPlatformAppProps {
  assignment?: WorkAssignment;
  assignmentId?: string;
  initialSavedItem?: SavedGeneration;
  onBusinessNameExtracted?: (name: string) => void;
  onClose: () => void;
  onComplete?: () => void;
}

const AIPlatformApp: React.FC<AIPlatformAppProps> = ({
  assignment, assignmentId, initialSavedItem, onBusinessNameExtracted, onClose, onComplete
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
    textInstructions: ''
  });

  const [files, setFiles] = useState<FileStore>({
    logo: null, visitingCard: [], storeImage: [],
    productImages: [], flyersPosters: [], voiceRecording: [], textInstructionsFile: []
  });

  const [status, setStatus] = useState<GenerationStatus>({ step: '', isProcessing: false, error: null, progress: 0 });
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

  const CUSTOM_FESTIVAL_OPTION = '__custom_festival__';

  const upcomingFestivals = [
    'Ugadi', 'Sankranthi', 'Maha Shivaratri', 'Holi', 'Ram Navami', 'Hanuman Jayanti',
    'Good Friday', 'Easter', 'Akshaya Tritiya', 'Buddha Purnima', 'Eid ul-Fitr', 'Bakrid',
    'Muharram', 'Raksha Bandhan', 'Krishna Janmashtami', 'Ganesh Chaturthi', 'Onam',
    'Bathukamma', 'Navaratri', 'Dasara', 'Dussehra', 'Diwali', 'Karthika Pournami',
    'Christmas', 'New Year', 'Republic Day', 'Independence Day', 'Gandhi Jayanti'
  ];

  useEffect(() => {
    if (user) loadSavedItems();
  }, [user]);

  // Auto-load initial saved item when passed from Ads History
  useEffect(() => {
    if (initialSavedItem) {
      handleSelectSavedItem(initialSavedItem);
    }
  }, []);

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
          case 'poster': {
            try { return { ...prev, posterPrompt: JSON.stringify(JSON.parse(refinedContent), null, 2) }; } catch { return { ...prev, posterPrompt: refinedContent }; }
          }
          case 'voiceOver': return { ...prev, voiceOverScript: refinedContent };
          case 'veo': {
            const segs = refinedContent.split("###SEGMENT###").map(p => p.trim()).filter(p => p.length > 0);
            return { ...prev, veoPrompts: segs.length > 0 ? segs : [refinedContent] };
          }
          default: return prev;
        }
      });
    } catch (error: any) {
      console.error('Refinement error:', error);
    } finally {
      setRefiningSection(null);
    }
  };

  const handleGenerate = async () => {
    if (!files.logo) { await showAlert({ title: "Missing Logo", description: "Please upload a logo image to proceed.", confirmText: "OK" }); return; }
    if (formData.adType === AdType.FESTIVAL && !formData.festivalName.trim()) {
      await showAlert({ title: "Missing Festival", description: "Please select a festival or enter a custom festival name.", confirmText: "OK" });
      return;
    }
    abortControllerRef.current = new AbortController();
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
      const stockPrompts = await generateStockImagePrompts(outputs.voiceOverScript, outputs.businessInfo, formData.adType, formData.festivalName, stockImageTheme);
      setOutputs(prev => prev ? { ...prev, stockImagePrompts: stockPrompts } : prev);
    } catch (error: any) {
      setStockImageError(error.message || 'Failed to generate stock image prompts.');
    } finally {
      setIsGeneratingStock(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background overflow-hidden">
      {ConfirmDialog}
      {showSavedItems && (
        <SavedItems items={savedItems} onSelect={handleSelectSavedItem} onDelete={handleDeleteSavedItem}
          onClose={() => setShowSavedItems(false)} isLoading={loadingSaved} userRole={user?.role} />
      )}

      {/* Top Bar */}
      <div className={cn("border-b px-4 h-14 flex items-center justify-between shrink-0",
        isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"
      )}>
        <div className="flex items-center space-x-3">
          <button onClick={onClose} className={cn("flex items-center space-x-1 text-sm px-3 py-1.5 rounded-lg transition-colors",
            isDark ? "text-slate-300 hover:bg-slate-700" : "text-slate-600 hover:bg-slate-100"
          )}>
            <ArrowLeft className="w-4 h-4" /><span>Back</span>
          </button>
          <div className="flex items-center space-x-2">
            <div className="bg-gradient-to-r from-blue-600 to-violet-600 p-1.5 rounded-lg text-white"><Sparkles className="w-4 h-4" /></div>
            <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-violet-700">AdGen.ai</h1>
          </div>
        </div>

        {/* Assignment Info Banner */}
        {assignment && (
          <div className={cn("flex items-center space-x-3 px-3 py-1.5 rounded-lg text-sm",
            isDark ? "bg-slate-700/50 text-slate-300" : "bg-slate-100 text-slate-600"
          )}>
            <span className="font-medium">{assignment.businessName || assignment.displayTitle}</span>
            <span className="text-xs opacity-70">•</span>
            <span className="capitalize">{assignment.category}</span>
            <span className="text-xs opacity-70">•</span>
            <span>{assignment.clipCount} clips + EC</span>
            <span className="font-mono text-[10px] opacity-50">{assignment.uniqueId}</span>
          </div>
        )}

        <div className="flex items-center space-x-2">
          <button onClick={() => setShowSavedItems(true)}
            className={cn("relative flex items-center space-x-1 text-sm px-3 py-1.5 rounded-lg transition-colors",
              isDark ? "text-slate-300 hover:text-blue-400 hover:bg-slate-700" : "text-slate-600 hover:text-blue-600 hover:bg-blue-50"
            )}>
            <Bookmark className="w-4 h-4" /><span className="hidden sm:inline">Saved</span>
            {savedItems.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center">{savedItems.length > 9 ? '9+' : savedItems.length}</span>
            )}
          </button>
          {onComplete && (
            <button onClick={onComplete}
              className="flex items-center space-x-1.5 text-sm font-medium px-4 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors">
              <CheckCircle2 className="w-4 h-4" /><span>Mark Complete</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content - Scrollable */}
      <div className="flex-1 overflow-y-auto">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* LEFT: INPUTS */}
            <div className="lg:col-span-5 space-y-6">
              {/* File Upload */}
              <div className={cn("rounded-xl shadow-sm border p-6", isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200")}>
                <div className="flex items-center space-x-2 mb-6">
                  <Layout className="w-5 h-5 text-blue-600" />
                  <h2 className={cn("text-lg font-bold", isDark ? "text-white" : "text-slate-800")}>Assets & Files</h2>
                </div>
                <div className="space-y-4">
                  <FileUpload label="Business Logo" accept="image/png, image/jpeg" required onChange={(f) => setFiles(prev => ({ ...prev, logo: f as File }))} helperText="High resolution PNG/JPG" />
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
              <div className={cn("rounded-xl shadow-sm border p-6", isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200")}>
                <div className="flex items-center space-x-2 mb-6">
                  <Type className="w-5 h-5 text-purple-600" />
                  <h2 className={cn("text-lg font-bold", isDark ? "text-white" : "text-slate-800")}>Configuration</h2>
                </div>
                <div className="space-y-5">
                  {/* Creation Mode */}
                  <div>
                    <label className={cn("block text-sm font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>Creation Mode</label>
                    <div className="grid grid-cols-2 gap-3">
                      {[{ mode: 'video' as const, icon: Video, label: 'Video Ad', color: 'blue' }, { mode: 'poster' as const, icon: PenTool, label: 'Poster Only', color: 'violet' }].map(({ mode, icon: Icon, label, color }) => (
                        <button key={mode} onClick={() => setCreationMode(mode)}
                          className={cn("flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all",
                            creationMode === mode
                              ? (isDark ? `border-${color}-500 bg-${color}-900/30 text-${color}-400` : `border-${color}-500 bg-${color}-50 text-${color}-700`)
                              : (isDark ? "border-slate-600 hover:border-slate-500 text-slate-400" : "border-slate-200 hover:border-slate-300 text-slate-600")
                          )}>
                          <Icon className="w-4 h-4" /><span>{label}</span>
                        </button>
                      ))}
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
                          <option value={45}>45 Seconds (6 Clips)</option>
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
                                    {[16, 32, 45, 64].some(p => estSeconds <= p) && (
                                      <div className="flex gap-1.5 mt-1">
                                        {[16, 32, 45, 64].map(p => (
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
                      className={cn("flex-1 py-3.5 px-4 rounded-xl text-white font-bold text-sm shadow-lg flex items-center justify-center space-x-2 transition-all",
                        status.isProcessing ? "bg-slate-400 cursor-not-allowed" : "bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700"
                      )}>
                      {status.isProcessing ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Rocket className="w-5 h-5" />}
                      <span>{status.isProcessing ? 'Processing...' : creationMode === 'poster' ? 'Extract Business Info' : 'Start Generation'}</span>
                    </button>
                    {status.isProcessing && (
                      <button onClick={handleStopGeneration}
                        className="py-3.5 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm flex items-center space-x-2">
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
                <div className={cn("rounded-xl shadow-sm border px-4 py-3 mb-4", isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200")}>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className={cn("text-sm font-bold", isDark ? "text-white" : "text-slate-800")}>Generation Status</h2>
                    <div className="flex items-center space-x-2 text-xs animate-pulse">
                      <Wand2 className="w-3.5 h-3.5 text-blue-500" />
                      <span className={cn(isDark ? "text-slate-400" : "text-slate-600")}>{status.step}</span>
                    </div>
                  </div>
                  <div className={cn("w-full rounded-full h-2", isDark ? "bg-slate-700" : "bg-slate-100")}>
                    <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${status.progress}%` }} />
                  </div>
                </div>
              )}

              {outputs && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className={cn("text-xl font-bold", isDark ? "text-white" : "text-slate-800")}>
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
                      className="flex items-center justify-center space-x-3 w-full py-3.5 px-6 rounded-xl font-semibold text-sm bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white shadow-lg hover:shadow-xl transition-all">
                      <Video className="w-5 h-5" /><span>Open Video Generation Platform</span><ExternalLink className="w-4 h-4 opacity-70" />
                    </a>
                  )}

                  {/* Video outputs */}
                  {creationMode === 'video' && outputs.mainFramePrompts?.length > 0 && (
                      <OutputSection title={`1. Main Frame Prompts (${outputs.mainFramePrompts.length} Clips)`} sectionKey="mainFrame"
                        collapsedOutputs={collapsedOutputs} toggleOutputSection={toggleOutputSection}
                        isDark={isDark}>
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
                      <OutputSection title="3. Poster Design (JSON)" sectionKey="poster"
                        collapsedOutputs={collapsedOutputs} toggleOutputSection={toggleOutputSection}
                        isDark={isDark} copyContent={outputs.posterPrompt}>
                        <GeneratedCard title="Poster" content={outputs.posterPrompt} isJson sectionType="poster"
                          showRefinement={true} onRefine={(i) => handleRefineSection('poster', i)} isRefining={refiningSection === 'poster'} hideTitle />
                      </OutputSection>
                  )}

                  {creationMode === 'video' && outputs.voiceOverScript && (
                      <OutputSection title="4. Voice Over Script (Telugu)" sectionKey="voiceOver"
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
                        <div className={cn("rounded-xl shadow-sm border overflow-hidden", isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200")}>
                          <div className={cn("px-4 py-3 border-b flex justify-between items-center", isDark ? "bg-slate-900/50 border-slate-700" : "bg-slate-50 border-slate-200")}>
                            <div className="flex items-center space-x-2">
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
                              </div>
                            ))}
                          </div>
                        </div>
                  )}
                </div>
              )}

              {!outputs && !status.isProcessing && (
                <div className={cn("rounded-xl border p-12 text-center", isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200")}>
                  <Sparkles className={cn("w-16 h-16 mx-auto mb-4 opacity-20", isDark ? "text-slate-600" : "text-slate-300")} />
                  <h3 className={cn("text-lg font-semibold mb-2", isDark ? "text-slate-400" : "text-slate-500")}>Ready to Generate</h3>
                  <p className={cn("text-sm", isDark ? "text-slate-500" : "text-slate-400")}>Upload business assets and configure settings, then click Generate.</p>
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
}> = ({ title, sectionKey, children, collapsedOutputs, toggleOutputSection, isDark, copyContent }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!copyContent) return;
    const cleaned = copyContent
      .replace(/^```(?:markdown|json|text|plaintext)?\s*\n?/gim, '')
      .replace(/\n?```\s*$/gim, '')
      .replace(/^```\s*\n?/gim, '')
      .replace(/\n?```$/gim, '')
      .trim();
    navigator.clipboard.writeText(cleaned);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className={cn("rounded-xl border overflow-hidden", isDark ? "border-slate-700" : "border-slate-200")}>
      <button onClick={() => toggleOutputSection(sectionKey)} className={cn("w-full flex items-center justify-between px-4 py-3 cursor-pointer",
        isDark ? "bg-slate-800 hover:bg-slate-750 text-slate-200" : "bg-slate-50 hover:bg-slate-100 text-slate-800"
      )}>
        <span className="font-semibold text-sm uppercase tracking-wide text-left">{title}</span>
        <div className="flex items-center space-x-2">
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
          <ChevronDown className={cn("w-4 h-4 transition-transform", collapsedOutputs[sectionKey] && "rotate-180")} />
        </div>
      </button>
      {collapsedOutputs[sectionKey] && children}
    </div>
  );
};

export default AIPlatformApp;

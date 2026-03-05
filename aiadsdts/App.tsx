import React, { useState, useEffect, useRef } from 'react';
import { 
  Wand2, 
  Sparkles, 
  Layout, 
  Type, 
  Mic, 
  Image as ImageIcon,
  Rocket,
  AlertCircle,
  LogOut,
  Loader2,
  Bookmark,
  Save,
  Check,
  Camera,
  Video,
  PenTool,
  ChevronDown,
  Copy,
  ExternalLink,
  StopCircle
} from 'lucide-react';
import { FileUpload } from './components/FileUpload';
import { GeneratedCard } from './components/GeneratedCard';
import { Login } from './components/Login';
import { SavedItems } from './components/SavedItems';
import { ThemeToggle } from './components/ThemeToggle';
import { useAuth } from './contexts/AuthContext';
import { useTheme } from './contexts/ThemeContext';
import { AdFormData, AdType, AttireType, FileStore, GeneratedOutputs, GenerationStatus } from './types';
import { generateAdAssets, extractBusinessOnly, generateStockImagePrompts, refineSection, SectionType } from './services/geminiService';
import { saveGeneration, getSavedGenerations, SavedGeneration } from './services/firebase';
import { clsx } from 'clsx';

const App: React.FC = () => {
  const { user, loading, signOut } = useAuth();
  const { resolvedTheme } = useTheme();

  const [formData, setFormData] = useState<AdFormData>({
    adType: AdType.COMMERCIAL,
    festivalName: '',
    attireType: AttireType.TRADITIONAL,
    duration: 16,
    durationMode: 'preset',
    textInstructions: ''
  });

  const [files, setFiles] = useState<FileStore>({
    logo: null,
    visitingCard: null,
    storeImage: null,
    productImages: [],
    flyersPosters: [],
    voiceRecording: null,
    textInstructionsFile: null
  });

  const [status, setStatus] = useState<GenerationStatus>({
    step: '',
    isProcessing: false,
    error: null,
    progress: 0
  });

  const [outputs, setOutputs] = useState<GeneratedOutputs | null>(null);

  // Refinement states for each section
  const [refiningSection, setRefiningSection] = useState<SectionType | null>(null);

  // Collapsed states for file upload sections
  const [collapsedSections, setCollapsedSections] = useState({
    storeOffice: true,
    productImages: true,
    flyersPosters: true,
    voiceInstructions: true
  });
  const toggleSection = (section: keyof typeof collapsedSections) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Header product toggle
  const [includeProductsInHeader, setIncludeProductsInHeader] = useState(false);

  // Save-related states
  const [showSavedItems, setShowSavedItems] = useState(false);
  const [savedItems, setSavedItems] = useState<SavedGeneration[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [viewingSavedItem, setViewingSavedItem] = useState<SavedGeneration | null>(null);

  // Stock image generation states
  const [isGeneratingStock, setIsGeneratingStock] = useState(false);
  const [stockImageError, setStockImageError] = useState<string | null>(null);
  const [stockImageTheme, setStockImageTheme] = useState<string>('indian');
  const [copiedStockIdx, setCopiedStockIdx] = useState<number | null>(null);

  // Abort controller for stopping generation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Upcoming festivals list (dynamic based on current date)
  const upcomingFestivals = [
    'Ugadi',
    'Holi',
    'Ram Navami',
    'Akshaya Tritiya',
    'Eid ul-Fitr',
    'Raksha Bandhan',
    'Krishna Janmashtami',
    'Ganesh Chaturthi',
    'Navaratri',
    'Dasara',
    'Diwali',
    'Kartika Purnima',
    'Christmas',
    'New Year',
    'Sankranthi',
    'Republic Day',
    'Independence Day',
    'Maha Shivaratri',
    'Bathukamma',
    'Onam'
  ];

  // Ref for scrolling to output panel
  const outputPanelRef = useRef<HTMLDivElement>(null);

  // Collapsed states for output sections
  const [collapsedOutputs, setCollapsedOutputs] = useState<Record<string, boolean>>({});
  const toggleOutputSection = (section: string) => {
    setCollapsedOutputs(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Copy state for section header copy buttons
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Helper to clean markdown code blocks
  const cleanCodeBlocks = (text: string): string => {
    let cleaned = text
      .replace(/^```(?:markdown|json|text|plaintext)?\s*\n?/gim, '')
      .replace(/\n?```\s*$/gim, '')
      .replace(/^```\s*\n?/gim, '')
      .replace(/\n?```$/gim, '');
    return cleaned.trim();
  };

  // Copy section content from header without opening
  const handleSectionCopy = (e: React.MouseEvent, sectionKey: string, content: string | string[]) => {
    e.stopPropagation(); // Prevent toggle
    let text = Array.isArray(content) 
      ? content.map((c, i) => `${sectionKey === 'mainFrame' ? `Clip ${i + 1} – Main Frame Prompt` : `Segment ${i + 1}`}\n${c}`).join('\n\n---\n\n') 
      : content;
    // Clean code blocks for mainFrame and header
    if (sectionKey === 'mainFrame' || sectionKey === 'header') {
      text = cleanCodeBlocks(text);
    }
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionKey);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  // Creation mode: 'video' = full pipeline, 'poster' = extract + poster only
  const [creationMode, setCreationMode] = useState<'video' | 'poster'>('video');

  // Load saved items when user is authenticated
  useEffect(() => {
    if (user) {
      loadSavedItems();
    }
  }, [user]);

  const loadSavedItems = async () => {
    if (!user) return;
    setLoadingSaved(true);
    try {
      const items = await getSavedGenerations(user.uid);
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
      const businessName = outputs.businessInfo?.businessName || outputs.businessInfo?.name || 'Untitled';
      const businessType = outputs.businessInfo?.businessType || outputs.businessInfo?.type || 'Business';
      
      await saveGeneration(user.uid, {
        businessName,
        businessType,
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
        duration: formData.duration
      });
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      
      // Reload saved items
      loadSavedItems();
    } catch (error) {
      console.error('Failed to save:', error);
      alert('Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectSavedItem = (item: SavedGeneration) => {
    setViewingSavedItem(item);
    setOutputs({
      businessInfo: item.businessInfo,
      mainFramePrompts: item.mainFramePrompts || ((item as any).mainFramePrompt ? [(item as any).mainFramePrompt] : []),
      headerPrompt: item.headerPrompt,
      posterPrompt: item.posterPrompt || '',
      voiceOverScript: item.voiceOverScript,
      veoPrompts: item.veoPrompts,
      hasProductImages: false,
      productImageCount: 0,
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

  // Handle section refinement
  const handleRefineSection = async (section: SectionType, additionalInstructions: string) => {
    if (!outputs) return;

    setRefiningSection(section);

    try {
      let currentContent = '';
      switch (section) {
        case 'mainFrame':
          currentContent = outputs.mainFramePrompts.join('\n###CLIP###\n');
          break;
        case 'header':
          currentContent = outputs.headerPrompt;
          break;
        case 'poster':
          currentContent = outputs.posterPrompt;
          break;
        case 'voiceOver':
          currentContent = outputs.voiceOverScript;
          break;
        case 'veo':
          currentContent = outputs.veoPrompts.join('\n###SEGMENT###\n');
          break;
      }

      const refinedContent = await refineSection(
        section,
        currentContent,
        additionalInstructions,
        formData,
        outputs.businessInfo
      );

      // Update the specific section in outputs
      setOutputs(prev => {
        if (!prev) return prev;
        
        switch (section) {
          case 'mainFrame': {
            const refinedClips = refinedContent.split('###CLIP###').map(p => p.trim()).filter(p => p.length > 0);
            return { ...prev, mainFramePrompts: refinedClips.length > 0 ? refinedClips : [refinedContent] };
          }
          case 'header':
            return { ...prev, headerPrompt: refinedContent };
          case 'poster':
            // Re-validate JSON
            try {
              const parsed = JSON.parse(refinedContent);
              return { ...prev, posterPrompt: JSON.stringify(parsed, null, 2) };
            } catch {
              return { ...prev, posterPrompt: refinedContent };
            }
          case 'voiceOver':
            return { ...prev, voiceOverScript: refinedContent };
          case 'veo':
            const veoPrompts = refinedContent.split("###SEGMENT###")
              .map(p => p.trim())
              .filter(p => p.length > 0);
            return { ...prev, veoPrompts: veoPrompts.length > 0 ? veoPrompts : [refinedContent] };
          default:
            return prev;
        }
      });
    } catch (error: any) {
      console.error('Refinement error:', error);
      alert(`Failed to refine: ${error.message}`);
    } finally {
      setRefiningSection(null);
    }
  };

  const handleGenerate = async () => {
    if (!files.logo) {
      alert("Please upload a logo image to proceed.");
      return;
    }

    // Create abort controller for this generation
    abortControllerRef.current = new AbortController();

    setStatus({ step: 'Initializing...', isProcessing: true, error: null, progress: 0 });
    setOutputs(null);
    
    // Scroll to output panel so user can see the progress bar
    setTimeout(() => {
      outputPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    try {
      if (creationMode === 'poster') {
        // Poster-only mode: extract business info only, then user creates poster on-demand
        const result = await extractBusinessOnly(formData, files, (step, progress) => {
          if (abortControllerRef.current?.signal.aborted) throw new Error('Generation stopped by user');
          setStatus(prev => ({ ...prev, step, progress }));
        });
        setOutputs(result);
        setStatus(prev => ({ ...prev, isProcessing: false, step: 'Completed', progress: 100 }));
      } else {
        // Full video ad pipeline
        const result = await generateAdAssets(formData, files, (step, progress) => {
          if (abortControllerRef.current?.signal.aborted) throw new Error('Generation stopped by user');
          setStatus(prev => ({ ...prev, step, progress }));
        }, { includeProductsInHeader });
        setOutputs(result);
        setStatus(prev => ({ ...prev, isProcessing: false, step: 'Completed', progress: 100 }));
      }
    } catch (error: any) {
      console.error(error);
      const isStopped = error.message?.includes('stopped by user');
      setStatus(prev => ({ 
        ...prev, 
        isProcessing: false, 
        error: isStopped ? 'Generation stopped.' : (error.message || "An unexpected error occurred.")
      }));
    } finally {
      abortControllerRef.current = null;
    }
  };

  // Stop generation handler
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setStatus(prev => ({ ...prev, step: 'Stopping...', isProcessing: false }));
    }
  };

  // Handle stock image prompt generation (user-triggered, post-process)
  const handleGenerateStockImages = async () => {
    if (!outputs || !outputs.voiceOverScript) return;
    
    setIsGeneratingStock(true);
    setStockImageError(null);

    try {
      const stockPrompts = await generateStockImagePrompts(
        outputs.voiceOverScript,
        outputs.businessInfo,
        formData.adType,
        formData.festivalName,
        stockImageTheme
      );
      
      setOutputs(prev => prev ? { ...prev, stockImagePrompts: stockPrompts } : prev);
    } catch (error: any) {
      console.error('Stock image generation error:', error);
      setStockImageError(error.message || 'Failed to generate stock image prompts.');
    } finally {
      setIsGeneratingStock(false);
    }
  };

  // Show loading spinner while checking auth state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-violet-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!user) {
    return <Login />;
  }

  return (
    <div className={clsx("min-h-screen font-sans transition-colors", 
      resolvedTheme === 'dark' 
        ? "bg-slate-900 text-slate-100" 
        : "bg-slate-50 text-slate-900"
    )}>
      {/* Saved Items Modal */}
      {showSavedItems && (
        <SavedItems
          items={savedItems}
          onSelect={handleSelectSavedItem}
          onDelete={handleDeleteSavedItem}
          onClose={() => setShowSavedItems(false)}
          isLoading={loadingSaved}
        />
      )}

      {/* Navbar */}
      <nav className={clsx(
        "border-b sticky top-0 z-40 transition-colors",
        resolvedTheme === 'dark' 
          ? "bg-slate-800 border-slate-700" 
          : "bg-white border-slate-200"
      )}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="bg-gradient-to-r from-blue-600 to-violet-600 p-2 rounded-lg text-white">
              <Sparkles className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-violet-700">
              AdGen.ai
            </h1>
          </div>
          <div className="flex items-center space-x-2 sm:space-x-4">
            {/* Saved Items Button */}
            <button
              onClick={() => setShowSavedItems(true)}
              className={clsx(
                "relative flex items-center space-x-1 text-sm px-3 py-1.5 rounded-lg transition-colors",
                resolvedTheme === 'dark'
                  ? "text-slate-300 hover:text-blue-400 hover:bg-slate-700"
                  : "text-slate-600 hover:text-blue-600 hover:bg-blue-50"
              )}
            >
              <Bookmark className="w-4 h-4" />
              <span className="hidden sm:inline">Saved</span>
              {savedItems.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center">
                  {savedItems.length > 9 ? '9+' : savedItems.length}
                </span>
              )}
            </button>

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* User Email */}
            <span className={clsx(
              "text-sm font-medium hidden md:block",
              resolvedTheme === 'dark' ? "text-slate-400" : "text-slate-500"
            )}>
              {user.email}
            </span>

            {/* Logout Button */}
            <button
              onClick={() => signOut()}
              className={clsx(
                "flex items-center space-x-1 text-sm px-3 py-1.5 rounded-lg transition-colors",
                resolvedTheme === 'dark'
                  ? "text-slate-300 hover:text-red-400 hover:bg-red-900/30"
                  : "text-slate-600 hover:text-red-600 hover:bg-red-50"
              )}
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT PANEL: INPUTS */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* File Upload Section */}
            <div className={clsx(
              "rounded-xl shadow-sm border p-6 transition-colors",
              resolvedTheme === 'dark' 
                ? "bg-slate-800 border-slate-700" 
                : "bg-white border-slate-200"
            )}>
              <div className="flex items-center space-x-2 mb-6">
                <Layout className="w-5 h-5 text-blue-600" />
                <h2 className={clsx("text-lg font-bold", resolvedTheme === 'dark' ? "text-white" : "text-slate-800")}>Assets & Files</h2>
              </div>
              
              <div className="space-y-4">
                <FileUpload 
                  label="Business Logo" 
                  accept="image/png, image/jpeg" 
                  required
                  onChange={(f) => setFiles(prev => ({ ...prev, logo: f as File }))}
                  helperText="High resolution PNG/JPG"
                />
                
                <FileUpload 
                  label="Visiting Card" 
                  accept="image/*"
                  onChange={(f) => setFiles(prev => ({ ...prev, visitingCard: f as File }))}
                  helperText="Optional"
                />

                {/* Collapsible: Store/Office */}
                <div className={clsx("border rounded-lg overflow-hidden", resolvedTheme === 'dark' ? "border-slate-600" : "border-slate-200")}>
                  <button
                    onClick={() => toggleSection('storeOffice')}
                    className={clsx(
                      "w-full flex items-center justify-between px-3 py-2 text-sm font-semibold transition-colors",
                      resolvedTheme === 'dark' ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    <span>Store/Office Image</span>
                    <ChevronDown className={clsx("w-4 h-4 transition-transform", !collapsedSections.storeOffice && "rotate-180")} />
                  </button>
                  {!collapsedSections.storeOffice && (
                    <div className="p-3 pt-0">
                      <FileUpload 
                        label="" 
                        accept="image/*"
                        onChange={(f) => setFiles(prev => ({ ...prev, storeImage: f as File }))}
                        helperText="Optional"
                      />
                    </div>
                  )}
                </div>

                {/* Collapsible: Product Images */}
                <div className={clsx("border rounded-lg overflow-hidden", resolvedTheme === 'dark' ? "border-slate-600" : "border-slate-200")}>
                  <button
                    onClick={() => toggleSection('productImages')}
                    className={clsx(
                      "w-full flex items-center justify-between px-3 py-2 text-sm font-semibold transition-colors",
                      resolvedTheme === 'dark' ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    <span>Product Images</span>
                    <ChevronDown className={clsx("w-4 h-4 transition-transform", !collapsedSections.productImages && "rotate-180")} />
                  </button>
                  {!collapsedSections.productImages && (
                    <div className="p-3 pt-0">
                      <FileUpload 
                        label="" 
                        accept="image/*" 
                        multiple
                        onChange={(f) => setFiles(prev => ({ ...prev, productImages: f as File[] }))}
                        helperText="Will appear in main frame & footer"
                      />
                      {files.productImages.length > 0 && (
                        <label className={clsx(
                          "flex items-center gap-2 mt-2 text-xs cursor-pointer",
                          resolvedTheme === 'dark' ? "text-slate-400" : "text-slate-600"
                        )}>
                          <input
                            type="checkbox"
                            checked={includeProductsInHeader}
                            onChange={(e) => setIncludeProductsInHeader(e.target.checked)}
                            className="rounded border-slate-300"
                          />
                          Include products in header design
                        </label>
                      )}
                    </div>
                  )}
                </div>

                {/* Collapsible: Flyers / Offer Posters / Brochures */}
                <div className={clsx("border rounded-lg overflow-hidden", resolvedTheme === 'dark' ? "border-slate-600" : "border-slate-200")}>
                  <button
                    onClick={() => toggleSection('flyersPosters')}
                    className={clsx(
                      "w-full flex items-center justify-between px-3 py-2 text-sm font-semibold transition-colors",
                      resolvedTheme === 'dark' ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    <span>Flyers / Offer Posters / Brochures</span>
                    <ChevronDown className={clsx("w-4 h-4 transition-transform", !collapsedSections.flyersPosters && "rotate-180")} />
                  </button>
                  {!collapsedSections.flyersPosters && (
                    <div className="p-3 pt-0">
                      <FileUpload 
                        label="" 
                        accept="image/*,application/pdf" 
                        multiple
                        onChange={(f) => setFiles(prev => ({ ...prev, flyersPosters: f as File[] }))}
                        helperText="Upload existing flyers, offer posters, or promotional materials"
                      />
                    </div>
                  )}
                </div>

                {/* Collapsible: Voice Instructions */}
                <div className={clsx("border rounded-lg overflow-hidden", resolvedTheme === 'dark' ? "border-slate-600" : "border-slate-200")}>
                  <button
                    onClick={() => toggleSection('voiceInstructions')}
                    className={clsx(
                      "w-full flex items-center justify-between px-3 py-2 text-sm font-semibold transition-colors",
                      resolvedTheme === 'dark' ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    <span>Voice Instructions</span>
                    <ChevronDown className={clsx("w-4 h-4 transition-transform", !collapsedSections.voiceInstructions && "rotate-180")} />
                  </button>
                  {!collapsedSections.voiceInstructions && (
                    <div className="p-3 pt-0">
                      <FileUpload 
                        label="" 
                        accept="audio/*"
                        onChange={(f) => setFiles(prev => ({ ...prev, voiceRecording: f as File }))}
                        helperText="Record your requirements"
                      />
                    </div>
                  )}
                </div>
                
                <div>
                  <label className={clsx(
                    "block text-sm font-semibold mb-2",
                    resolvedTheme === 'dark' ? "text-slate-300" : "text-slate-700"
                  )}>Client Messages / Text Instructions</label>
                  <textarea 
                    className={clsx(
                      "w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none mb-2",
                      resolvedTheme === 'dark'
                        ? "bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-500 focus:ring-blue-800"
                        : "bg-white border-slate-300 text-slate-700 focus:ring-blue-200"
                    )}
                    rows={4}
                    placeholder="Paste client's chat messages, WhatsApp text, requirements, offers, special instructions — anything the client shared..."
                    value={formData.textInstructions}
                    onChange={(e) => setFormData(prev => ({ ...prev, textInstructions: e.target.value }))}
                  />
                  <FileUpload 
                    label="" 
                    accept=".txt,.pdf,.doc,.docx"
                    onChange={(f) => setFiles(prev => ({ ...prev, textInstructionsFile: f as File }))}
                    helperText="Or upload a text/PDF file with instructions"
                  />
                </div>
              </div>
            </div>

            {/* Configuration Section */}
            <div className={clsx(
              "rounded-xl shadow-sm border p-6 transition-colors",
              resolvedTheme === 'dark' 
                ? "bg-slate-800 border-slate-700" 
                : "bg-white border-slate-200"
            )}>
              <div className="flex items-center space-x-2 mb-6">
                <Type className="w-5 h-5 text-purple-600" />
                <h2 className={clsx("text-lg font-bold", resolvedTheme === 'dark' ? "text-white" : "text-slate-800")}>Configuration</h2>
              </div>

              <div className="space-y-5">
                {/* Creation Mode */}
                <div>
                  <label className={clsx(
                    "block text-sm font-semibold mb-2",
                    resolvedTheme === 'dark' ? "text-slate-300" : "text-slate-700"
                  )}>Creation Mode</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setCreationMode('video')}
                      className={clsx(
                        "flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all",
                        creationMode === 'video'
                          ? resolvedTheme === 'dark'
                            ? "border-blue-500 bg-blue-900/30 text-blue-400"
                            : "border-blue-500 bg-blue-50 text-blue-700"
                          : resolvedTheme === 'dark'
                            ? "border-slate-600 hover:border-slate-500 text-slate-400"
                            : "border-slate-200 hover:border-slate-300 text-slate-600"
                      )}
                    >
                      <Video className="w-4 h-4" />
                      <span>Video Ad</span>
                    </button>
                    <button
                      onClick={() => setCreationMode('poster')}
                      className={clsx(
                        "flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all",
                        creationMode === 'poster'
                          ? resolvedTheme === 'dark'
                            ? "border-violet-500 bg-violet-900/30 text-violet-400"
                            : "border-violet-500 bg-violet-50 text-violet-700"
                          : resolvedTheme === 'dark'
                            ? "border-slate-600 hover:border-slate-500 text-slate-400"
                            : "border-slate-200 hover:border-slate-300 text-slate-600"
                      )}
                    >
                      <PenTool className="w-4 h-4" />
                      <span>Poster Only</span>
                    </button>
                  </div>
                  <p className={clsx(
                    "text-xs mt-1.5",
                    resolvedTheme === 'dark' ? "text-slate-500" : "text-slate-400"
                  )}>
                    {creationMode === 'video'
                      ? 'Full pipeline: Main Frame, Header, Voice Over, Veo + optional Poster & Stock Images'
                      : 'Extract business info, then create poster design with custom instructions'}
                  </p>
                </div>

                {/* Ad Type */}
                <div>
                  <label className={clsx(
                    "block text-sm font-semibold mb-2",
                    resolvedTheme === 'dark' ? "text-slate-300" : "text-slate-700"
                  )}>Ad Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setFormData(prev => ({ ...prev, adType: AdType.COMMERCIAL }))}
                      className={clsx(
                        "px-4 py-2 rounded-lg text-sm font-medium border transition-all",
                        formData.adType === AdType.COMMERCIAL 
                          ? resolvedTheme === 'dark'
                            ? "border-blue-500 bg-blue-900/30 text-blue-400"
                            : "border-blue-500 bg-blue-50 text-blue-700"
                          : resolvedTheme === 'dark'
                            ? "border-slate-600 hover:border-slate-500 text-slate-400"
                            : "border-slate-200 hover:border-slate-300 text-slate-600"
                      )}
                    >
                      Commercial
                    </button>
                    <button
                      onClick={() => setFormData(prev => ({ ...prev, adType: AdType.FESTIVAL }))}
                      className={clsx(
                        "px-4 py-2 rounded-lg text-sm font-medium border transition-all",
                        formData.adType === AdType.FESTIVAL 
                          ? resolvedTheme === 'dark'
                            ? "border-purple-500 bg-purple-900/30 text-purple-400"
                            : "border-purple-500 bg-purple-50 text-purple-700"
                          : resolvedTheme === 'dark'
                            ? "border-slate-600 hover:border-slate-500 text-slate-400"
                            : "border-slate-200 hover:border-slate-300 text-slate-600"
                      )}
                    >
                      Festival Wishes
                    </button>
                  </div>
                </div>

                {/* Festival Name Input */}
                {formData.adType === AdType.FESTIVAL && (
                   <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className={clsx(
                      "block text-sm font-semibold mb-2",
                      resolvedTheme === 'dark' ? "text-slate-300" : "text-slate-700"
                    )}>Festival Name</label>
                    <select
                      className={clsx(
                        "w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none transition-all",
                        resolvedTheme === 'dark'
                          ? "bg-slate-700 border-slate-600 text-slate-200 focus:ring-purple-800 focus:border-purple-500"
                          : "bg-white border-slate-300 text-slate-700 focus:ring-purple-200 focus:border-purple-500"
                      )}
                      value={formData.festivalName}
                      onChange={(e) => setFormData(prev => ({ ...prev, festivalName: e.target.value }))}
                    >
                      <option value="">-- Select Festival --</option>
                      {upcomingFestivals.map((festival) => (
                        <option key={festival} value={festival}>{festival}</option>
                      ))}
                    </select>
                    <p className={clsx("text-xs mt-1", resolvedTheme === 'dark' ? "text-slate-500" : "text-slate-400")}>
                      Or type custom: 
                      <input 
                        type="text"
                        className={clsx(
                          "ml-2 w-32 border rounded px-2 py-0.5 text-xs",
                          resolvedTheme === 'dark'
                            ? "bg-slate-600 border-slate-500 text-slate-200"
                            : "bg-slate-50 border-slate-200 text-slate-700"
                        )}
                        placeholder="Custom festival"
                        value={!upcomingFestivals.includes(formData.festivalName) ? formData.festivalName : ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, festivalName: e.target.value }))}
                      />
                    </p>
                  </div>
                )}

                {/* Attire Selection — Video mode only */}
                {creationMode === 'video' && (
                <div>
                  <label className={clsx(
                    "block text-sm font-semibold mb-2",
                    resolvedTheme === 'dark' ? "text-slate-300" : "text-slate-700"
                  )}>Model Attire</label>
                  <select 
                    className={clsx(
                      "w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none",
                      resolvedTheme === 'dark'
                        ? "bg-slate-700 border-slate-600 text-slate-200 focus:ring-blue-800"
                        : "bg-white border-slate-300 text-slate-700 focus:ring-blue-200"
                    )}
                    value={formData.attireType}
                    onChange={(e) => setFormData(prev => ({ ...prev, attireType: e.target.value as AttireType }))}
                  >
                    <option value={AttireType.PROFESSIONAL}>Professional (Premium Beige/Pastel Suit)</option>
                    <option value={AttireType.TRADITIONAL}>Traditional (Designer Saree)</option>
                  </select>
                </div>
                )}

                {/* Duration — Video mode only */}
                {creationMode === 'video' && (
                <div>
                  <label className={clsx(
                    "block text-sm font-semibold mb-2",
                    resolvedTheme === 'dark' ? "text-slate-300" : "text-slate-700"
                  )}>Video Duration</label>
                  
                  {/* Duration Mode Toggle */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <button
                      onClick={() => setFormData(prev => ({ ...prev, durationMode: 'preset', duration: 16 }))}
                      className={clsx(
                        "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                        formData.durationMode === 'preset'
                          ? resolvedTheme === 'dark'
                            ? "border-blue-500 bg-blue-900/30 text-blue-400"
                            : "border-blue-500 bg-blue-50 text-blue-700"
                          : resolvedTheme === 'dark'
                            ? "border-slate-600 hover:border-slate-500 text-slate-400"
                            : "border-slate-200 hover:border-slate-300 text-slate-600"
                      )}
                    >
                      Preset
                    </button>
                    <button
                      onClick={() => setFormData(prev => ({ ...prev, durationMode: 'custom', duration: 24 }))}
                      className={clsx(
                        "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                        formData.durationMode === 'custom'
                          ? resolvedTheme === 'dark'
                            ? "border-violet-500 bg-violet-900/30 text-violet-400"
                            : "border-violet-500 bg-violet-50 text-violet-700"
                          : resolvedTheme === 'dark'
                            ? "border-slate-600 hover:border-slate-500 text-slate-400"
                            : "border-slate-200 hover:border-slate-300 text-slate-600"
                      )}
                    >
                      Custom
                    </button>
                  </div>

                  {formData.durationMode === 'preset' ? (
                    <select 
                      className={clsx(
                        "w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none",
                        resolvedTheme === 'dark'
                          ? "bg-slate-700 border-slate-600 text-slate-200 focus:ring-blue-800"
                          : "bg-white border-slate-300 text-slate-700 focus:ring-blue-200"
                      )}
                      value={formData.duration}
                      onChange={(e) => setFormData(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                    >
                      <option value={16}>16 Seconds (2 Clips)</option>
                      <option value={32}>32 Seconds (4 Clips)</option>
                      <option value={64}>64 Seconds (8 Clips)</option>
                    </select>
                  ) : (
                    <div className="flex flex-col space-y-2">
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          min={8}
                          max={120}
                          step={8}
                          className={clsx(
                            "w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none",
                            resolvedTheme === 'dark'
                              ? "bg-slate-700 border-slate-600 text-slate-200 focus:ring-violet-800"
                              : "bg-white border-slate-300 text-slate-700 focus:ring-violet-200"
                          )}
                          placeholder="Enter seconds (8, 16, 24, 32...)"
                          value={formData.duration}
                          onChange={(e) => {
                            let val = parseInt(e.target.value) || 8;
                            // Round to nearest multiple of 8
                            val = Math.round(val / 8) * 8;
                            if (val < 8) val = 8;
                            if (val > 120) val = 120;
                            setFormData(prev => ({ ...prev, duration: val }));
                          }}
                        />
                        <span className={clsx("text-sm whitespace-nowrap", resolvedTheme === 'dark' ? "text-slate-400" : "text-slate-500")}>
                          sec
                        </span>
                      </div>
                      <p className={clsx("text-xs", resolvedTheme === 'dark' ? "text-slate-500" : "text-slate-400")}>
                        {Math.floor(formData.duration / 8)} clip(s) • Must be multiple of 8 sec
                      </p>
                    </div>
                  )}
                </div>
                )}

                {/* Submit Button */}
                <div className="flex space-x-2">
                  <button
                    onClick={handleGenerate}
                    disabled={status.isProcessing}
                    className={clsx(
                      "flex-1 py-3.5 px-4 rounded-xl text-white font-bold text-sm shadow-lg shadow-blue-500/20 flex items-center justify-center space-x-2 transition-all transform active:scale-95",
                      status.isProcessing 
                        ? "bg-slate-400 cursor-not-allowed"
                        : "bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700"
                    )}
                  >
                    {status.isProcessing ? (
                       <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Rocket className="w-5 h-5" />
                    )}
                    <span>{status.isProcessing ? 'Processing...' : creationMode === 'poster' ? 'Extract Business Info' : 'Start Generation'}</span>
                  </button>
                  {status.isProcessing && (
                    <button
                      onClick={handleStopGeneration}
                      className="py-3.5 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm shadow-lg shadow-red-500/20 flex items-center justify-center space-x-2 transition-all transform active:scale-95"
                    >
                      <StopCircle className="w-5 h-5" />
                      <span>Stop</span>
                    </button>
                  )}
                </div>

                {status.error && (
                  <div className="flex items-start space-x-2 bg-red-50 text-red-700 p-3 rounded-lg text-sm">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span>{status.error}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: OUTPUTS */}
          <div className="lg:col-span-7" ref={outputPanelRef}>
            {status.isProcessing || status.step ? (
              <div className={clsx(
                "rounded-xl shadow-sm border px-4 py-3 mb-4 transition-colors",
                resolvedTheme === 'dark' 
                  ? "bg-slate-800 border-slate-700" 
                  : "bg-white border-slate-200"
              )}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className={clsx("text-sm font-bold", resolvedTheme === 'dark' ? "text-white" : "text-slate-800")}>Generation Status</h2>
                  <div className="flex items-center space-x-2 text-xs animate-pulse">
                    <Wand2 className="w-3.5 h-3.5 text-blue-500" />
                    <span className={clsx(resolvedTheme === 'dark' ? "text-slate-400" : "text-slate-600")}>{status.step}</span>
                  </div>
                </div>
                <div className={clsx("w-full rounded-full h-2", resolvedTheme === 'dark' ? "bg-slate-700" : "bg-slate-100")}>
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out" 
                    style={{ width: `${status.progress}%` }}
                  ></div>
                </div>
              </div>
            ) : null}

            {outputs && (
               <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-2">
                    <h2 className={clsx("text-xl font-bold", resolvedTheme === 'dark' ? "text-white" : "text-slate-800")}>
                      Generated Assets
                      {viewingSavedItem && (
                        <span className="ml-2 text-sm font-normal text-slate-500">(Viewing Saved)</span>
                      )}
                    </h2>
                    <div className="flex items-center space-x-2">
                      {/* Save Button */}
                      <button
                        onClick={handleSave}
                        disabled={isSaving || saveSuccess}
                        className={clsx(
                          "flex items-center space-x-1 text-sm font-medium px-3 py-1.5 rounded-lg transition-all",
                          saveSuccess
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : isSaving
                              ? "bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-700"
                              : "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                        )}
                      >
                        {saveSuccess ? (
                          <>
                            <Check className="w-4 h-4" />
                            <span>Saved!</span>
                          </>
                        ) : isSaving ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Saving...</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4" />
                            <span>Save</span>
                          </>
                        )}
                      </button>
                      <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs px-2 py-1 rounded-full font-medium">Ready</span>
                    </div>
                </div>

                {/* Collapsible: Business Intelligence */}
                <div className={clsx(
                  "rounded-xl border overflow-hidden transition-colors",
                  resolvedTheme === 'dark' ? "border-slate-700" : "border-slate-200"
                )}>
                  <div
                    className={clsx(
                      "w-full flex items-center justify-between px-4 py-3 text-left transition-colors cursor-pointer",
                      resolvedTheme === 'dark'
                        ? "bg-slate-800 hover:bg-slate-750 text-slate-200"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-800"
                    )}
                  >
                    <button onClick={() => toggleOutputSection('businessInfo')} className="flex-1 flex items-center text-left">
                      <span className="font-semibold text-sm uppercase tracking-wide">Business Intelligence (Extracted)</span>
                    </button>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={(e) => handleSectionCopy(e, 'businessInfo', typeof outputs.businessInfo === 'object' ? JSON.stringify(outputs.businessInfo, null, 2) : outputs.businessInfo)}
                        className={clsx(
                          "p-1.5 rounded transition-colors",
                          copiedSection === 'businessInfo'
                            ? resolvedTheme === 'dark' ? "text-green-400" : "text-green-600"
                            : resolvedTheme === 'dark' ? "text-slate-400 hover:text-blue-400" : "text-slate-500 hover:text-blue-600"
                        )}
                        title={copiedSection === 'businessInfo' ? 'Copied!' : 'Copy'}
                      >
                        {copiedSection === 'businessInfo' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => toggleOutputSection('businessInfo')} className="p-1">
                        <ChevronDown className={clsx("w-4 h-4 transition-transform", collapsedOutputs['businessInfo'] && "rotate-180")} />
                      </button>
                    </div>
                  </div>
                  {collapsedOutputs['businessInfo'] && (
                    <GeneratedCard 
                        title="Business Intelligence (Extracted)" 
                        content={outputs.businessInfo} 
                        isJson 
                        hideTitle
                    />
                  )}
                </div>
                
                {/* Video Ad outputs — only in video mode */}
                {creationMode === 'video' && outputs.mainFramePrompts && outputs.mainFramePrompts.length > 0 && (
                  <>
                    {/* Collapsible: Main Frame */}
                    <div className={clsx(
                      "rounded-xl border overflow-hidden transition-colors",
                      resolvedTheme === 'dark' ? "border-slate-700" : "border-slate-200"
                    )}>
                      <div
                        className={clsx(
                          "w-full flex items-center justify-between px-4 py-3 text-left transition-colors cursor-pointer",
                          resolvedTheme === 'dark'
                            ? "bg-slate-800 hover:bg-slate-750 text-slate-200"
                            : "bg-slate-50 hover:bg-slate-100 text-slate-800"
                        )}
                      >
                        <button onClick={() => toggleOutputSection('mainFrame')} className="flex-1 flex items-center text-left">
                          <span className="font-semibold text-sm uppercase tracking-wide">1. Main Frame Prompts ({outputs.mainFramePrompts.length} Clips)</span>
                        </button>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={(e) => handleSectionCopy(e, 'mainFrame', outputs.mainFramePrompts)}
                            className={clsx(
                              "p-1.5 rounded transition-colors",
                              copiedSection === 'mainFrame'
                                ? resolvedTheme === 'dark' ? "text-green-400" : "text-green-600"
                                : resolvedTheme === 'dark' ? "text-slate-400 hover:text-blue-400" : "text-slate-500 hover:text-blue-600"
                            )}
                            title={copiedSection === 'mainFrame' ? 'Copied!' : 'Copy All Clips'}
                          >
                            {copiedSection === 'mainFrame' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => toggleOutputSection('mainFrame')} className="p-1">
                            <ChevronDown className={clsx("w-4 h-4 transition-transform", collapsedOutputs['mainFrame'] && "rotate-180")} />
                          </button>
                        </div>
                      </div>
                      {collapsedOutputs['mainFrame'] && (
                        <>
                          <GeneratedCard 
                              title="1. Main Frame Prompts" 
                              content={outputs.mainFramePrompts}
                              variant="dropdown"
                              sectionType="mainFrame"
                              showRefinement={!viewingSavedItem}
                              onRefine={(instructions) => handleRefineSection('mainFrame', instructions)}
                              isRefining={refiningSection === 'mainFrame'}
                              hideTitle
                          />
                          {outputs.hasProductImages && (
                            <div className={clsx(
                              "flex items-center space-x-2 px-4 py-2.5 mx-4 mb-3 rounded-lg border text-sm",
                              resolvedTheme === 'dark'
                                ? "bg-amber-900/20 border-amber-700/50 text-amber-300"
                                : "bg-amber-50 border-amber-200 text-amber-700"
                            )}>
                              <ImageIcon className="w-4 h-4 flex-shrink-0" />
                              <span><strong>Note:</strong> Attach your {outputs.productImageCount} product image(s) alongside this prompt when generating the image. The prompt instructs the AI to place products in the lower portion of the frame.</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Collapsible: Header */}
                    <div className={clsx(
                      "rounded-xl border overflow-hidden transition-colors",
                      resolvedTheme === 'dark' ? "border-slate-700" : "border-slate-200"
                    )}>
                      <div
                        className={clsx(
                          "w-full flex items-center justify-between px-4 py-3 text-left transition-colors cursor-pointer",
                          resolvedTheme === 'dark'
                            ? "bg-slate-800 hover:bg-slate-750 text-slate-200"
                            : "bg-slate-50 hover:bg-slate-100 text-slate-800"
                        )}
                      >
                        <button onClick={() => toggleOutputSection('header')} className="flex-1 flex items-center text-left">
                          <span className="font-semibold text-sm uppercase tracking-wide">2. Header Prompt</span>
                        </button>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={(e) => handleSectionCopy(e, 'header', outputs.headerPrompt)}
                            className={clsx(
                              "p-1.5 rounded transition-colors",
                              copiedSection === 'header'
                                ? resolvedTheme === 'dark' ? "text-green-400" : "text-green-600"
                                : resolvedTheme === 'dark' ? "text-slate-400 hover:text-blue-400" : "text-slate-500 hover:text-blue-600"
                            )}
                            title={copiedSection === 'header' ? 'Copied!' : 'Copy'}
                          >
                            {copiedSection === 'header' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => toggleOutputSection('header')} className="p-1">
                            <ChevronDown className={clsx("w-4 h-4 transition-transform", collapsedOutputs['header'] && "rotate-180")} />
                          </button>
                        </div>
                      </div>
                      {collapsedOutputs['header'] && (
                        <>
                          <GeneratedCard 
                              title="2. Header Prompt" 
                              content={outputs.headerPrompt}
                              sectionType="header"
                              showRefinement={!viewingSavedItem}
                              onRefine={(instructions) => handleRefineSection('header', instructions)}
                              isRefining={refiningSection === 'header'}
                              hideTitle
                          />
                          {outputs.hasProductImages && (
                            <div className={clsx(
                              "flex items-center space-x-2 px-4 py-2.5 mx-4 mb-3 rounded-lg border text-sm",
                              resolvedTheme === 'dark'
                                ? "bg-amber-900/20 border-amber-700/50 text-amber-300"
                                : "bg-amber-50 border-amber-200 text-amber-700"
                            )}>
                              <ImageIcon className="w-4 h-4 flex-shrink-0" />
                              <span><strong>Note:</strong> Attach your {outputs.productImageCount} product image(s) alongside this prompt when generating the image. The prompt instructs the AI to place products in the footer banner strip.</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Collapsible: Poster */}
                    <div className={clsx(
                      "rounded-xl border overflow-hidden transition-colors",
                      resolvedTheme === 'dark' ? "border-slate-700" : "border-slate-200"
                    )}>
                      <div
                        className={clsx(
                          "w-full flex items-center justify-between px-4 py-3 text-left transition-colors cursor-pointer",
                          resolvedTheme === 'dark'
                            ? "bg-slate-800 hover:bg-slate-750 text-slate-200"
                            : "bg-slate-50 hover:bg-slate-100 text-slate-800"
                        )}
                      >
                        <button onClick={() => toggleOutputSection('poster')} className="flex-1 flex items-center text-left">
                          <span className="font-semibold text-sm uppercase tracking-wide">3. Poster Design Prompt (JSON)</span>
                        </button>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={(e) => handleSectionCopy(e, 'poster', outputs.posterPrompt)}
                            className={clsx(
                              "p-1.5 rounded transition-colors",
                              copiedSection === 'poster'
                                ? resolvedTheme === 'dark' ? "text-green-400" : "text-green-600"
                                : resolvedTheme === 'dark' ? "text-slate-400 hover:text-blue-400" : "text-slate-500 hover:text-blue-600"
                            )}
                            title={copiedSection === 'poster' ? 'Copied!' : 'Copy'}
                          >
                            {copiedSection === 'poster' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => toggleOutputSection('poster')} className="p-1">
                            <ChevronDown className={clsx("w-4 h-4 transition-transform", collapsedOutputs['poster'] && "rotate-180")} />
                          </button>
                        </div>
                      </div>
                      {collapsedOutputs['poster'] && (
                        <GeneratedCard 
                            title="3. Poster Design Prompt (JSON)" 
                            content={outputs.posterPrompt}
                            isJson
                            sectionType="poster"
                            showRefinement={!viewingSavedItem}
                            onRefine={(instructions) => handleRefineSection('poster', instructions)}
                            isRefining={refiningSection === 'poster'}
                            hideTitle
                        />
                      )}
                    </div>

                    {/* Collapsible: Voice Over */}
                    <div className={clsx(
                      "rounded-xl border overflow-hidden transition-colors",
                      resolvedTheme === 'dark' ? "border-slate-700" : "border-slate-200"
                    )}>
                      <div
                        className={clsx(
                          "w-full flex items-center justify-between px-4 py-3 text-left transition-colors cursor-pointer",
                          resolvedTheme === 'dark'
                            ? "bg-slate-800 hover:bg-slate-750 text-slate-200"
                            : "bg-slate-50 hover:bg-slate-100 text-slate-800"
                        )}
                      >
                        <button onClick={() => toggleOutputSection('voiceOver')} className="flex-1 flex items-center text-left">
                          <span className="font-semibold text-sm uppercase tracking-wide">4. Voice Over Script (Telugu)</span>
                        </button>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={(e) => handleSectionCopy(e, 'voiceOver', outputs.voiceOverScript)}
                            className={clsx(
                              "p-1.5 rounded transition-colors",
                              copiedSection === 'voiceOver'
                                ? resolvedTheme === 'dark' ? "text-green-400" : "text-green-600"
                                : resolvedTheme === 'dark' ? "text-slate-400 hover:text-blue-400" : "text-slate-500 hover:text-blue-600"
                            )}
                            title={copiedSection === 'voiceOver' ? 'Copied!' : 'Copy'}
                          >
                            {copiedSection === 'voiceOver' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => toggleOutputSection('voiceOver')} className="p-1">
                            <ChevronDown className={clsx("w-4 h-4 transition-transform", collapsedOutputs['voiceOver'] && "rotate-180")} />
                          </button>
                        </div>
                      </div>
                      {collapsedOutputs['voiceOver'] && (
                        <GeneratedCard 
                            title="4. Voice Over Script (Telugu)" 
                            content={outputs.voiceOverScript}
                            sectionType="voiceOver"
                            showTransliteration={true}
                            showRefinement={!viewingSavedItem}
                            onRefine={(instructions) => handleRefineSection('voiceOver', instructions)}
                            isRefining={refiningSection === 'voiceOver'}
                            hideTitle
                        />
                      )}
                    </div>

                    {/* Collapsible: Veo */}
                    <div className={clsx(
                      "rounded-xl border overflow-hidden transition-colors",
                      resolvedTheme === 'dark' ? "border-slate-700" : "border-slate-200"
                    )}>
                      <div
                        className={clsx(
                          "w-full flex items-center justify-between px-4 py-3 text-left transition-colors cursor-pointer",
                          resolvedTheme === 'dark'
                            ? "bg-slate-800 hover:bg-slate-750 text-slate-200"
                            : "bg-slate-50 hover:bg-slate-100 text-slate-800"
                        )}
                      >
                        <button onClick={() => toggleOutputSection('veo')} className="flex-1 flex items-center text-left">
                          <span className="font-semibold text-sm uppercase tracking-wide">5. Veo 3 Video Prompts</span>
                        </button>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={(e) => handleSectionCopy(e, 'veo', outputs.veoPrompts)}
                            className={clsx(
                              "p-1.5 rounded transition-colors",
                              copiedSection === 'veo'
                                ? resolvedTheme === 'dark' ? "text-green-400" : "text-green-600"
                                : resolvedTheme === 'dark' ? "text-slate-400 hover:text-blue-400" : "text-slate-500 hover:text-blue-600"
                            )}
                            title={copiedSection === 'veo' ? 'Copied!' : 'Copy'}
                          >
                            {copiedSection === 'veo' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => toggleOutputSection('veo')} className="p-1">
                            <ChevronDown className={clsx("w-4 h-4 transition-transform", collapsedOutputs['veo'] && "rotate-180")} />
                          </button>
                        </div>
                      </div>
                      {collapsedOutputs['veo'] && (
                        <GeneratedCard 
                            title="5. Veo 3 Video Prompts" 
                            content={outputs.veoPrompts}
                            variant="dropdown"
                            sectionType="veo"
                            showRefinement={!viewingSavedItem}
                            onRefine={(instructions) => handleRefineSection('veo', instructions)}
                            isRefining={refiningSection === 'veo'}
                            hideTitle
                        />
                      )}
                    </div>

                    {/* Video Generation Platform Button */}
                    <a
                      href="https://labs.google/fx/tools/flow"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={clsx(
                        "flex items-center justify-center space-x-3 w-full py-3.5 px-6 rounded-xl font-semibold text-sm transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5",
                        resolvedTheme === 'dark'
                          ? "bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white"
                          : "bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white"
                      )}
                    >
                      <Video className="w-5 h-5" />
                      <span>Open Video Generation Platform</span>
                      <ExternalLink className="w-4 h-4 opacity-70" />
                    </a>
                  </>
                )}

                {/* Stock Image Prompts — User-Triggered Section (Video mode only) */}
                {creationMode === 'video' && outputs.voiceOverScript && (
                <div className={clsx(
                  "rounded-xl shadow-sm border overflow-hidden transition-colors",
                  resolvedTheme === 'dark' 
                    ? "bg-slate-800 border-slate-700" 
                    : "bg-white border-slate-200"
                )}>
                  <div className={clsx(
                    "px-4 py-3 border-b flex justify-between items-center",
                    resolvedTheme === 'dark'
                      ? "bg-slate-900/50 border-slate-700"
                      : "bg-slate-50 border-slate-200"
                  )}>
                    <div className="flex items-center space-x-2">
                      <Camera className="w-4 h-4 text-teal-500" />
                      <h3 className={clsx(
                        "font-semibold text-sm uppercase tracking-wide",
                        resolvedTheme === 'dark' ? "text-slate-200" : "text-slate-800"
                      )}>6. Stock Image Prompts (B-Roll)</h3>
                    </div>
                    {!outputs.stockImagePrompts && (
                      <div className="flex items-center space-x-2">
                        <select
                          value={stockImageTheme}
                          onChange={(e) => setStockImageTheme(e.target.value)}
                          className={clsx(
                            "text-xs font-medium py-1.5 px-2 pr-7 rounded-lg border appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-500",
                            resolvedTheme === 'dark'
                              ? "bg-slate-700 border-slate-600 text-slate-200"
                              : "bg-white border-slate-300 text-slate-700"
                          )}
                        >
                          <option value="indian">🇮🇳 Indian</option>
                          <option value="american">🇺🇸 American</option>
                          <option value="middle-eastern">🇦🇪 Middle Eastern</option>
                          <option value="european">🇪🇺 European</option>
                          <option value="east-asian">🇯🇵 East Asian</option>
                          <option value="african">🇿🇦 African</option>
                          <option value="universal">🌍 Universal</option>
                        </select>
                        <button
                          onClick={handleGenerateStockImages}
                          disabled={isGeneratingStock || !outputs.voiceOverScript}
                          className={clsx(
                            "flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all",
                            isGeneratingStock
                              ? resolvedTheme === 'dark'
                                ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                                : "bg-slate-100 text-slate-400 cursor-not-allowed"
                              : resolvedTheme === 'dark'
                                ? "bg-teal-900/40 text-teal-400 hover:bg-teal-900/60 border border-teal-700/50"
                                : "bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200"
                          )}
                        >
                          {isGeneratingStock ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Generating...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3 h-3" />
                              <span>Generate Stock Prompts</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    {!outputs.stockImagePrompts && !isGeneratingStock && !stockImageError && (
                      <div className={clsx(
                        "text-center py-6",
                        resolvedTheme === 'dark' ? "text-slate-500" : "text-slate-400"
                      )}>
                        <Camera className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm font-medium">Stock image prompts for editing B-roll</p>
                        <p className="text-xs mt-1">Click "Generate Stock Prompts" to create 1-5 image prompts based on your voice-over script</p>
                      </div>
                    )}

                    {stockImageError && (
                      <div className="flex items-start space-x-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-3 rounded-lg text-sm">
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>{stockImageError}</span>
                      </div>
                    )}

                    {isGeneratingStock && (
                      <div className="flex items-center justify-center py-8 space-x-2">
                        <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
                        <span className={clsx("text-sm", resolvedTheme === 'dark' ? "text-slate-400" : "text-slate-500")}>
                          Analyzing voice-over and generating stock image prompts...
                        </span>
                      </div>
                    )}

                    {outputs.stockImagePrompts && outputs.stockImagePrompts.length > 0 && (
                      <div className="space-y-3">
                        {outputs.stockImagePrompts.map((item: any, idx: number) => (
                          <div 
                            key={idx}
                            className={clsx(
                              "rounded-lg border p-4 transition-colors",
                              resolvedTheme === 'dark'
                                ? "bg-slate-700/50 border-slate-600"
                                : "bg-slate-50 border-slate-200"
                            )}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center space-x-2">
                                <span className={clsx(
                                  "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold",
                                  resolvedTheme === 'dark' 
                                    ? "bg-teal-900/50 text-teal-400" 
                                    : "bg-teal-100 text-teal-700"
                                )}>
                                  {item.id || idx + 1}
                                </span>
                                <span className={clsx(
                                  "font-semibold text-sm",
                                  resolvedTheme === 'dark' ? "text-slate-200" : "text-slate-700"
                                )}>
                                  {item.concept}
                                </span>
                              </div>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(item.prompt);
                                  setCopiedStockIdx(idx);
                                  setTimeout(() => setCopiedStockIdx(null), 2000);
                                }}
                                className={clsx(
                                  "flex items-center space-x-1 text-xs px-2 py-1 rounded transition-colors",
                                  copiedStockIdx === idx
                                    ? resolvedTheme === 'dark'
                                      ? "text-green-400 bg-green-900/30"
                                      : "text-green-600 bg-green-50"
                                    : resolvedTheme === 'dark'
                                      ? "text-slate-400 hover:text-teal-400 hover:bg-teal-900/30"
                                      : "text-slate-500 hover:text-teal-600 hover:bg-teal-50"
                                )}
                                title="Copy prompt"
                              >
                                {copiedStockIdx === idx ? <Check className="w-3 h-3" /> : null}
                                <span>{copiedStockIdx === idx ? 'Copied!' : 'Copy'}</span>
                              </button>
                            </div>
                            <p className={clsx(
                              "text-sm leading-relaxed mb-2",
                              resolvedTheme === 'dark' ? "text-slate-300" : "text-slate-600"
                            )}>
                              {item.prompt}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className={clsx(
                                "px-2 py-0.5 rounded font-medium",
                                item.type === 'photo'
                                  ? resolvedTheme === 'dark' ? "bg-blue-900/40 text-blue-400" : "bg-blue-100 text-blue-700"
                                  : resolvedTheme === 'dark' ? "bg-purple-900/40 text-purple-400" : "bg-purple-100 text-purple-700"
                              )}>
                                {item.type === 'photo' ? '📸 Photo' : '🎨 Graphic'}
                              </span>
                              <span className={clsx(
                                "px-2 py-0.5 rounded font-medium",
                                resolvedTheme === 'dark' ? "bg-amber-900/40 text-amber-400" : "bg-amber-100 text-amber-700"
                              )}>
                                🕐 {item.timing}
                              </span>
                              <span className={clsx(
                                "px-2 py-0.5 rounded",
                                resolvedTheme === 'dark' ? "bg-slate-600 text-slate-300" : "bg-slate-200 text-slate-600"
                              )}>
                                📐 {item.usage}
                              </span>
                              {item.insertAt && (
                                <span className={clsx(
                                  "px-2 py-0.5 rounded font-semibold",
                                  resolvedTheme === 'dark' ? "bg-green-900/40 text-green-400" : "bg-green-100 text-green-700"
                                )}>
                                  ▶ Insert at {item.insertAt}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                )}
               </div>
            )}
            
            {!outputs && !status.isProcessing && (
                <div className={clsx(
                  "h-96 flex flex-col items-center justify-center border-2 border-dashed rounded-xl",
                  resolvedTheme === 'dark' 
                    ? "text-slate-500 border-slate-700 bg-slate-800/50" 
                    : "text-slate-400 border-slate-200 bg-slate-50/50"
                )}>
                    <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
                    <p className="font-medium">Generated assets will appear here</p>
                    <p className="text-sm">Upload files and click Start Generation</p>
                </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;

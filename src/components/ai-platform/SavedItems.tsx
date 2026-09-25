import React, { useState } from 'react';
import { Bookmark, Trash2, ChevronRight, Calendar, Building2, PartyPopper, Loader2, X, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STUDIO_IS_DARK } from './brand';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { extractBusinessNameFromInfo } from '@/services/geminiService';
import { useConfirm } from '@/hooks/useConfirm';
import type { PosterConcept, SceneContext, VoiceBrief } from '@/types/aiPlatform';
import type { CoreMessageBrief } from '@/services/prompts/coreMessage';

const getBusinessName = (item: SavedGeneration) => {
  if (item.businessName && item.businessName !== 'Untitled') return item.businessName;
  if (item.businessInfo) return extractBusinessNameFromInfo(item.businessInfo) || 'Untitled';
  return item.businessName || 'Untitled';
};

export interface SavedGeneration {
  id?: string;
  userId: string;
  userName?: string;
  businessName: string;
  businessType: string;
  businessInfo: any;
  mainFramePrompts: string[];
  headerPrompt: string;
  posterPrompt?: string;
  voiceOverScript: string;
  veoPrompts: string[];
  stockImagePrompts?: any[] | null;
  overlayTexts?: any[] | null;
  /** The core message the script was built on — absent on generations saved before it existed. */
  coreMessage?: CoreMessageBrief | null;
  adType: string;
  festivalName?: string;
  gender?: string;
  attireType: string;
  customAttire?: string;
  duration: number;
  creationMode?: string;
  /** Special-category cartoon duo (services/characterPacks id), when this was a pack ad. */
  characterPack?: string | null;
  /** Custom Character only: who the character is. */
  customCharacter?: string;
  /** The FRAME / BACKGROUND INSTRUCTIONS the frames were written against. */
  frameInstructions?: string;
  /** The video's context and per-clip background plan — absent on older generations. */
  sceneContext?: SceneContext | null;
  /** The client's voice note, heard and understood — absent when none was attached. */
  voiceBrief?: VoiceBrief | null;
  /** The voice-over's quality check — see utils/scriptQa. */
  scriptQa?: import('@/utils/scriptQa').ScriptQaSummary | null;
  /** Whether that pack ad used the client's real photos or a generated location. */
  locationMode?: string | null;
  aspectRatio?: string;
  language?: string;
  noLogo?: boolean;
  logoNameText?: string;
  /** Poster Creation output and settings — absent on video generations. */
  posterConcepts?: PosterConcept[] | null;
  posterSize?: string;
  posterStyle?: string;
  posterOccasion?: string;
  posterTextLanguage?: string;
  createdAt: any;
  /** Set when Save updated this generation in place rather than writing a copy. */
  updatedAt?: unknown;
  workAssignmentId?: string;
}

interface SavedItemsProps {
  items: SavedGeneration[];
  onSelect: (item: SavedGeneration) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  isLoading: boolean;
  userRole?: string;
}

export const SavedItems: React.FC<SavedItemsProps> = ({ items, onSelect, onDelete, onClose, isLoading, userRole }) => {
  const isDark = STUDIO_IS_DARK;
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const { confirmed } = await confirm({ title: "Delete Generation", description: "Are you sure you want to delete this saved generation?", confirmText: "Delete", variant: "destructive" });
    if (!confirmed) return;
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, 'ai_generations', id));
      onDelete(id);
    } catch (error) {
      console.error('Failed to delete:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown date';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      {ConfirmDialog}
      <div className="ag-card w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="ag-tile">
              <Bookmark className={cn("w-5 h-5", isDark ? "text-blue-400" : "text-blue-600")} />
            </div>
            <div>
              <h2 className="ag-h2 text-lg text-white">Saved generations</h2>
              <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>{items.length} saved item{items.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="ag-btn ag-btn--icon ag-btn--sm">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
              <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Loading saved items...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bookmark className={cn("w-10 h-10 mb-4", isDark ? "text-slate-600" : "text-slate-400")} />
              <h3 className={cn("text-lg font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>No Saved Items</h3>
              <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Generated campaign assets will appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map((item) => (
                <div key={item.id} onClick={() => onSelect(item)}
                  className={cn("ag-panel ag-lift group relative p-4 cursor-pointer",
                    deletingId === item.id && "opacity-50 pointer-events-none"
                  )}>
                  {userRole !== 'tech_member' && (
                  <button onClick={(e) => handleDelete(e, item.id!)} disabled={deletingId === item.id}
                    className="ag-btn ag-btn--icon ag-btn--sm absolute top-3 right-3 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                    {deletingId === item.id ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin" /> : <Trash2 className="w-4 h-4 text-red-500" />}
                  </button>
                  )}
                  <h3 className={cn("font-semibold mb-1 pr-8 truncate", isDark ? "text-white" : "text-slate-800")}>{getBusinessName(item)}</h3>
                  {item.userName && (
                    <p className={cn("text-xs mb-2 flex items-center gap-1", isDark ? "text-slate-400" : "text-slate-500")}>
                      <User className="w-3 h-3" />{item.userName}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className="ag-chip ag-badge--info h-7 text-xs">
                      <Building2 className="w-3 h-3" /><span>{item.businessType || 'Business'}</span>
                    </span>
                    {item.adType === 'festival' && item.festivalName && (
                      <span className="ag-chip ag-badge--run h-7 text-xs">
                        <PartyPopper className="w-3 h-3" /><span>{item.festivalName}</span>
                      </span>
                    )}
                    <span className="ag-chip ag-num h-7 text-xs">{item.duration}s</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="flex items-center space-x-1"><Calendar className="w-3 h-3" /><span>{formatDate(item.createdAt)}</span></span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

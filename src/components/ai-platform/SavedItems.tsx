import React, { useState } from 'react';
import { Bookmark, Trash2, ChevronRight, Calendar, Building2, PartyPopper, Loader2, X, User } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { extractBusinessNameFromInfo } from '@/services/geminiService';
import { useConfirm } from '@/hooks/useConfirm';

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
  adType: string;
  festivalName?: string;
  attireType: string;
  duration: number;
  creationMode?: string;
  createdAt: any;
  workAssignmentId?: string;
}

interface SavedItemsProps {
  items: SavedGeneration[];
  onSelect: (item: SavedGeneration) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  isLoading: boolean;
}

export const SavedItems: React.FC<SavedItemsProps> = ({ items, onSelect, onDelete, onClose, isLoading }) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
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
      <div className={cn("rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col", isDark ? "bg-slate-800" : "bg-white")}>
        <div className={cn("px-6 py-4 border-b flex items-center justify-between", isDark ? "border-slate-700" : "border-slate-200")}>
          <div className="flex items-center space-x-3">
            <div className={cn("p-2 rounded-lg", isDark ? "bg-blue-900/30" : "bg-blue-100")}>
              <Bookmark className={cn("w-5 h-5", isDark ? "text-blue-400" : "text-blue-600")} />
            </div>
            <div>
              <h2 className={cn("text-lg font-bold", isDark ? "text-white" : "text-slate-800")}>Saved Generations</h2>
              <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>{items.length} saved item{items.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className={cn("p-2 rounded-lg transition-colors", isDark ? "hover:bg-slate-700" : "hover:bg-slate-100")}>
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
                  className={cn("group relative border rounded-xl p-4 cursor-pointer transition-all hover:shadow-lg",
                    isDark ? "bg-slate-700/50 border-slate-600 hover:border-blue-500" : "bg-slate-50 border-slate-200 hover:border-blue-300",
                    deletingId === item.id && "opacity-50 pointer-events-none"
                  )}>
                  <button onClick={(e) => handleDelete(e, item.id!)} disabled={deletingId === item.id}
                    className={cn("absolute top-3 right-3 p-1.5 rounded-lg shadow opacity-0 group-hover:opacity-100 transition-opacity",
                      isDark ? "bg-slate-600 hover:bg-red-900/30" : "bg-white hover:bg-red-50"
                    )}>
                    {deletingId === item.id ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin" /> : <Trash2 className="w-4 h-4 text-red-500" />}
                  </button>
                  <h3 className={cn("font-semibold mb-1 pr-8 truncate", isDark ? "text-white" : "text-slate-800")}>{getBusinessName(item)}</h3>
                  {item.userName && (
                    <p className={cn("text-xs mb-2 flex items-center gap-1", isDark ? "text-slate-400" : "text-slate-500")}>
                      <User className="w-3 h-3" />{item.userName}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className={cn("inline-flex items-center space-x-1 text-xs px-2 py-1 rounded-full", isDark ? "bg-blue-900/30 text-blue-300" : "bg-blue-100 text-blue-700")}>
                      <Building2 className="w-3 h-3" /><span>{item.businessType || 'Business'}</span>
                    </span>
                    {item.adType === 'festival' && item.festivalName && (
                      <span className={cn("inline-flex items-center space-x-1 text-xs px-2 py-1 rounded-full", isDark ? "bg-purple-900/30 text-purple-300" : "bg-purple-100 text-purple-700")}>
                        <PartyPopper className="w-3 h-3" /><span>{item.festivalName}</span>
                      </span>
                    )}
                    <span className={cn("text-xs px-2 py-1 rounded-full", isDark ? "bg-slate-600 text-slate-300" : "bg-slate-200 text-slate-600")}>{item.duration}s</span>
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

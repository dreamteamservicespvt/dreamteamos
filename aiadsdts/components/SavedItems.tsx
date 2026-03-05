import React, { useState } from 'react';
import { 
  Bookmark, 
  Trash2, 
  ChevronRight, 
  Calendar, 
  Building2, 
  PartyPopper,
  Loader2,
  X,
  AlertCircle
} from 'lucide-react';
import { SavedGeneration, deleteGeneration } from '../services/firebase';
import { clsx } from 'clsx';

interface SavedItemsProps {
  items: SavedGeneration[];
  onSelect: (item: SavedGeneration) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  isLoading: boolean;
}

export const SavedItems: React.FC<SavedItemsProps> = ({ 
  items, 
  onSelect, 
  onDelete, 
  onClose,
  isLoading 
}) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this saved generation?')) return;
    
    setDeletingId(id);
    try {
      await deleteGeneration(id);
      onDelete(id);
    } catch (error) {
      console.error('Failed to delete:', error);
      alert('Failed to delete. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown date';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Bookmark className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">Saved Generations</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{items.length} saved item{items.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
              <p className="text-slate-500 dark:text-slate-400">Loading saved items...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-4 bg-slate-100 dark:bg-slate-700 rounded-full mb-4">
                <Bookmark className="w-10 h-10 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">No Saved Items</h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm">
                Generate some ad assets and save them for quick access later.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onSelect(item)}
                  className={clsx(
                    "group relative bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl p-4 cursor-pointer transition-all hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-500",
                    deletingId === item.id && "opacity-50 pointer-events-none"
                  )}
                >
                  {/* Delete Button */}
                  <button
                    onClick={(e) => handleDelete(e, item.id!)}
                    disabled={deletingId === item.id}
                    className="absolute top-3 right-3 p-1.5 bg-white dark:bg-slate-600 rounded-lg shadow opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 dark:hover:bg-red-900/30"
                  >
                    {deletingId === item.id ? (
                      <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 text-red-500" />
                    )}
                  </button>

                  {/* Business Name */}
                  <h3 className="font-semibold text-slate-800 dark:text-white mb-2 pr-8 truncate">
                    {item.businessName || 'Untitled Business'}
                  </h3>

                  {/* Info Row */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className="inline-flex items-center space-x-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full">
                      <Building2 className="w-3 h-3" />
                      <span>{item.businessType || 'Business'}</span>
                    </span>
                    {item.adType === 'festival' && item.festivalName && (
                      <span className="inline-flex items-center space-x-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded-full">
                        <PartyPopper className="w-3 h-3" />
                        <span>{item.festivalName}</span>
                      </span>
                    )}
                    <span className="inline-flex items-center space-x-1 text-xs bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-full">
                      <span>{item.duration}s</span>
                    </span>
                  </div>

                  {/* Date */}
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center space-x-1">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDate(item.createdAt)}</span>
                    </span>
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

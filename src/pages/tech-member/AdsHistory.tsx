import React, { useState, useMemo } from 'react';
import { Loader2, Building2, PartyPopper, Calendar, ChevronRight, Clock, Search } from 'lucide-react';
import { collection, query, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/store/authStore';
import { useFirestoreQuery } from '@/hooks/useFirestore';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { SavedGeneration } from '@/components/ai-platform/SavedItems';
import AIPlatformApp from '@/components/ai-platform/AIPlatformApp';
import { extractBusinessNameFromInfo } from '@/services/geminiService';

const getBusinessName = (item: SavedGeneration) => {
  if (item.businessName && item.businessName !== 'Untitled') return item.businessName;
  if (item.businessInfo) return extractBusinessNameFromInfo(item.businessInfo) || 'Untitled';
  return item.businessName || 'Untitled';
};

const formatDate = (timestamp: any) => {
  if (!timestamp) return 'Unknown date';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const getTimestamp = (item: SavedGeneration): number => {
  if (item.createdAt?.toDate) return item.createdAt.toDate().getTime();
  if (item.createdAt?.seconds) return item.createdAt.seconds * 1000;
  return 0;
};

export default function AdsHistory() {
  const user = useAuthStore((s) => s.user);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const q = useMemo(() =>
    user ? query(collection(db, 'ai_generations'), where('userId', '==', user.uid)) : null,
    [user?.uid]
  );
  const { data: generations, loading } = useFirestoreQuery<SavedGeneration>(q, [user?.uid]);

  // Deduplicate: keep only the latest generation per workAssignmentId
  const deduplicated = useMemo(() => {
    const assignmentMap = new Map<string, SavedGeneration>();
    const standalone: SavedGeneration[] = [];

    for (const item of generations) {
      if (item.workAssignmentId) {
        const existing = assignmentMap.get(item.workAssignmentId);
        if (!existing || getTimestamp(item) > getTimestamp(existing)) {
          assignmentMap.set(item.workAssignmentId, item);
        }
      } else {
        standalone.push(item);
      }
    }

    return [...assignmentMap.values(), ...standalone].sort((a, b) => getTimestamp(b) - getTimestamp(a));
  }, [generations]);

  const [selectedItem, setSelectedItem] = useState<SavedGeneration | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return deduplicated;
    const term = searchTerm.toLowerCase();
    return deduplicated.filter(item =>
      getBusinessName(item).toLowerCase().includes(term) ||
      item.businessType?.toLowerCase().includes(term) ||
      item.festivalName?.toLowerCase().includes(term)
    );
  }, [deduplicated, searchTerm]);

  if (selectedItem) {
    return (
      <AIPlatformApp
        initialSavedItem={selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className={cn("text-2xl font-bold", isDark ? "text-white" : "text-slate-800")}>Ads History</h1>
          <p className={cn("text-sm mt-1", isDark ? "text-slate-400" : "text-slate-500")}>
            {deduplicated.length} generation{deduplicated.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4", isDark ? "text-slate-400" : "text-slate-500")} />
          <input
            type="text"
            placeholder="Search by business name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={cn(
              "w-full pl-10 pr-4 py-2 rounded-lg border text-sm",
              isDark ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500" : "bg-white border-slate-200 text-slate-800 placeholder-slate-400"
            )}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Clock className={cn("w-12 h-12 mb-4", isDark ? "text-slate-600" : "text-slate-400")} />
          <h3 className={cn("text-lg font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>
            {searchTerm ? 'No matching generations' : 'No Ads History'}
          </h3>
          <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
            {searchTerm ? 'Try a different search term.' : 'Your completed ad generations will appear here.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedItem(item)}
              className={cn(
                "group relative border rounded-xl p-4 cursor-pointer transition-all hover:shadow-lg",
                isDark ? "bg-slate-800 border-slate-700 hover:border-blue-500" : "bg-white border-slate-200 hover:border-blue-300"
              )}
            >
              <h3 className={cn("font-semibold mb-1 truncate", isDark ? "text-white" : "text-slate-800")}>
                {getBusinessName(item)}
              </h3>
              <div className="flex flex-wrap gap-2 mb-3 mt-2">
                <span className={cn("inline-flex items-center space-x-1 text-xs px-2 py-1 rounded-full",
                  isDark ? "bg-blue-900/30 text-blue-300" : "bg-blue-100 text-blue-700")}>
                  <Building2 className="w-3 h-3" /><span>{item.businessType || 'Business'}</span>
                </span>
                {item.adType === 'festival' && item.festivalName && (
                  <span className={cn("inline-flex items-center space-x-1 text-xs px-2 py-1 rounded-full",
                    isDark ? "bg-purple-900/30 text-purple-300" : "bg-purple-100 text-purple-700")}>
                    <PartyPopper className="w-3 h-3" /><span>{item.festivalName}</span>
                  </span>
                )}
                <span className={cn("text-xs px-2 py-1 rounded-full",
                  isDark ? "bg-slate-700 text-slate-300" : "bg-slate-200 text-slate-600")}>
                  {item.duration}s
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center space-x-1">
                  <Calendar className="w-3 h-3" /><span>{formatDate(item.createdAt)}</span>
                </span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

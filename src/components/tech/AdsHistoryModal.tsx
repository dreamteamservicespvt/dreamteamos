import { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { format } from "date-fns";
import { db } from "@/services/firebase";
import { Film, Loader2, X, Clock } from "lucide-react";
import type { AppUser } from "@/types";

/**
 * The ads an external creator has generated, for the tech admin to review as history.
 *
 * Every generation is saved to `ai_generations` keyed by the creator's uid — this reads that back
 * for one creator, newest first. Read-only: it's a record of what they made on the platform.
 */
interface AdGeneration {
  id: string;
  businessName?: string;
  businessType?: string;
  adType?: string;
  language?: string;
  duration?: string;
  aspectRatio?: string;
  createdAt?: { seconds?: number };
}

export default function AdsHistoryModal({ member, onClose }: { member: AppUser; onClose: () => void }) {
  const [ads, setAds] = useState<AdGeneration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "ai_generations"), where("userId", "==", member.uid)));
        if (cancelled) return;
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AdGeneration));
        rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setAds(rows);
      } catch {
        if (!cancelled) setAds([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [member.uid]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Film className="h-4 w-4 text-amber-500" /> {member.name}'s ads
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {loading ? "Loading…" : `${ads.length} ad${ads.length === 1 ? "" : "s"} created on the platform`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : ads.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Film className="mx-auto mb-2 h-8 w-8 opacity-30" />
              No ads created yet.
            </div>
          ) : (
            <div className="space-y-2">
              {ads.map((ad) => (
                <div key={ad.id} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-foreground">{ad.businessName || "Untitled"}</span>
                    {ad.createdAt?.seconds && (
                      <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock size={10} /> {format(new Date(ad.createdAt.seconds * 1000), "dd MMM yyyy, hh:mm a")}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {ad.adType && <Chip>{ad.adType}</Chip>}
                    {ad.businessType && <Chip>{ad.businessType}</Chip>}
                    {ad.duration && <Chip>{ad.duration}</Chip>}
                    {ad.aspectRatio && <Chip>{ad.aspectRatio}</Chip>}
                    {ad.language && <Chip>{ad.language}</Chip>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium capitalize text-primary">{children}</span>;
}

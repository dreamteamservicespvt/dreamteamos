import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { ClipboardList, CalendarCheck2, ExternalLink, BellRing } from "lucide-react";

const MEMBER_ROLES = new Set(["tech_member", "sales_member", "tech_team_leader"]);

/** Notification types that deserve a centered popup (agreements have their own mandatory gate). */
const POPUP_TYPES: Record<string, { icon: typeof ClipboardList; accent: string }> = {
  work_assigned: { icon: ClipboardList, accent: "text-primary bg-primary/15" },
  work_editing: { icon: ClipboardList, accent: "text-amber-500 bg-amber-500/15" },
  attendance_update: { icon: CalendarCheck2, accent: "text-emerald-500 bg-emerald-500/15" },
};

interface PopupNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  createdAt?: { seconds?: number };
}

const DISMISS_KEY = "dts_update_popup_dismissed";
const readDismissed = (): Set<string> => {
  try { return new Set(JSON.parse(sessionStorage.getItem(DISMISS_KEY) || "[]")); } catch { return new Set(); }
};
const addDismissed = (id: string) => {
  const set = readDismissed();
  set.add(id);
  sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...set]));
};

/**
 * Center-screen popup for members: fires when an admin / team lead assigns work or
 * updates their attendance. "Open" jumps straight to the relevant page (and marks the
 * notification read); "Later" hides it for this session but keeps the bell unread.
 */
export default function UpdatePopup() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [unread, setUnread] = useState<PopupNotification[]>([]);
  const [dismissedTick, setDismissedTick] = useState(0);

  useEffect(() => {
    if (!user || !MEMBER_ROLES.has(user.role)) return;
    const q = query(collection(db, "notifications"), where("userId", "==", user.uid), where("read", "==", false));
    const unsub = onSnapshot(q, (snap) => {
      setUnread(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PopupNotification)));
    }, () => setUnread([]));
    return () => unsub();
  }, [user?.uid, user?.role]);

  const current = useMemo(() => {
    void dismissedTick; // recompute after a "Later"
    const dismissed = readDismissed();
    const cutoff = Date.now() / 1000 - 24 * 3600; // only recent updates pop up
    return unread
      .filter((n) => POPUP_TYPES[n.type] && !dismissed.has(n.id) && (n.createdAt?.seconds || 0) > cutoff)
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];
  }, [unread, dismissedTick]);

  if (!user || !MEMBER_ROLES.has(user.role) || !current) return null;

  const meta = POPUP_TYPES[current.type];
  const Icon = meta.icon;

  const handleOpen = async () => {
    addDismissed(current.id);
    setDismissedTick((t) => t + 1);
    try { await updateDoc(doc(db, "notifications", current.id), { read: true }); } catch { /* ignore */ }
    if (current.link && current.link !== "/") navigate(current.link);
  };

  const handleLater = () => {
    addDismissed(current.id);
    setDismissedTick((t) => t + 1);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl animate-in fade-in zoom-in-95">
        <div className="flex items-start gap-3">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${meta.accent}`}>
            <Icon size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <BellRing className="w-3.5 h-3.5 text-primary" />
              <h3 className="font-display font-bold text-foreground">{current.title}</h3>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{current.message}</p>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={handleLater}
            className="flex-1 h-10 rounded-lg bg-accent text-foreground text-sm font-medium border border-border">
            Later
          </button>
          <button onClick={handleOpen}
            className="flex-[2] h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 inline-flex items-center justify-center gap-1.5">
            <ExternalLink size={14} /> Open
          </button>
        </div>
      </div>
    </div>
  );
}

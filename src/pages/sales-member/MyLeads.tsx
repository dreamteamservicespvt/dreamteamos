import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuthStore } from "@/store/authStore";
import { uploadToCloudinary } from "@/services/cloudinary";
import { formatCurrency } from "@/utils/formatters";
import type { Lead, LeadStatus, SaleDetail } from "@/types";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Phone, MessageCircle, StickyNote, ChevronDown, ChevronUp,
  Loader2, Check, Upload, ExternalLink, Plus, Trash2,
} from "lucide-react";

const STATUS_OPTIONS: { value: LeadStatus; label: string; color: string }[] = [
  { value: "not_called", label: "Not Called", color: "bg-muted-foreground/15 text-muted-foreground" },
  { value: "answered", label: "Answered", color: "bg-info/15 text-info" },
  { value: "not_answered", label: "Not Answered", color: "bg-warning/15 text-warning" },
  { value: "call_later", label: "Call Later", color: "bg-role-main-admin/15 text-role-main-admin" },
  { value: "not_interested", label: "Not Interested", color: "bg-destructive/15 text-destructive" },
];

const SALE_CATEGORIES = [
  "wishes", "promotional", "cinematic", "digital_marketing", "website", "software", "custom",
] as const;

const PACKAGES: Record<string, { label: string; amount: number }[]> = {
  wishes: [
    { label: "20 Seconds", amount: 499 },
    { label: "40 Seconds", amount: 999 },
  ],
  promotional: [
    { label: "15 Seconds", amount: 499 },
    { label: "30 Seconds", amount: 999 },
    { label: "45 Seconds", amount: 1499 },
    { label: "60 Seconds", amount: 1999 },
  ],
  cinematic: [
    { label: "15 Seconds", amount: 999 },
    { label: "30 Seconds", amount: 1999 },
    { label: "45 Seconds", amount: 2999 },
    { label: "60 Seconds", amount: 3999 },
  ],
  digital_marketing: [
    { label: "Meta Campaign Setup", amount: 2000 },
    { label: "Single Post (IG+FB+SEO)", amount: 250 },
    { label: "Monthly Package — Custom", amount: 0 },
  ],
  website: [],
  software: [],
  custom: [],
};

const WA_TEMPLATES: { label: string; text: string }[] = [
  {
    label: "Greeting",
    text: `Hello! I'm calling from *Dream Team Services* 🎯\n\nWe specialize in:\n• AI Video Ads (starting ₹499)\n• Digital Marketing\n• Website Development\n\nWould you be interested to know more? 😊`,
  },
  {
    label: "Follow Up",
    text: `Hi! Following up from our previous conversation about DTS services. Do you have 5 minutes to discuss? 🙏`,
  },
  {
    label: "Offer",
    text: `Great news! We have special packages starting at just ₹499 for AI video ads. Perfect for your business promotion! 🚀`,
  },
];

export default function MyLeads() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedNotes, setExpandedNotes] = useState<string | null>(null);
  const [expandedSale, setExpandedSale] = useState<string | null>(null);

  // Realtime listener
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "leads"), where("assignedTo", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));
      list.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setLeads(list);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const filtered = leads.filter((l) => {
    const matchSearch =
      l.displayName?.toLowerCase().includes(search.toLowerCase()) ||
      l.phone?.includes(search) ||
      l.realName?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || l.status === statusFilter || (statusFilter === "sale_done" && l.saleDone);
    return matchSearch && matchStatus;
  });

  const updateLead = async (id: string, data: Record<string, any>) => {
    try {
      await updateDoc(doc(db, "leads", id), { ...data, lastUpdated: serverTimestamp() });
    } catch {
      toast({ title: "Error", description: "Failed to update lead.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">My Leads</h1>
        <p className="text-muted-foreground text-sm mt-1">{leads.length} leads assigned to you</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-xs w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none text-sm font-body"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[{ value: "all", label: "All" }, ...STATUS_OPTIONS, { value: "sale_done", label: "Sale Done", color: "bg-success/15 text-success" }].map((s) => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${
                statusFilter === s.value
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-card text-muted-foreground border border-border hover:bg-accent"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lead Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 space-y-3 animate-pulse">
              <div className="h-5 bg-muted rounded w-20" />
              <div className="h-4 bg-muted rounded w-32" />
              <div className="h-8 bg-muted rounded w-full" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Phone size={32} className="mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-muted-foreground text-sm">No leads found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              updateLead={updateLead}
              expandedNotes={expandedNotes}
              setExpandedNotes={setExpandedNotes}
              expandedSale={expandedSale}
              setExpandedSale={setExpandedSale}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Lead Card ─── */

interface LeadCardProps {
  lead: Lead;
  updateLead: (id: string, data: Record<string, any>) => Promise<void>;
  expandedNotes: string | null;
  setExpandedNotes: (id: string | null) => void;
  expandedSale: string | null;
  setExpandedSale: (id: string | null) => void;
}

function LeadCard({ lead, updateLead, expandedNotes, setExpandedNotes, expandedSale, setExpandedSale }: LeadCardProps) {
  const { toast } = useToast();
  const [notes, setNotes] = useState(lead.notes || "");
  const [saleDone, setSaleDone] = useState(lead.saleDone || false);
  const [showSalesList, setShowSalesList] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const allSaleItems = lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);

  // Sync from props
  useEffect(() => { setNotes(lead.notes || ""); }, [lead.notes]);
  useEffect(() => { setSaleDone(lead.saleDone || false); }, [lead.saleDone]);

  const handleDeleteSaleItem = async (itemIndex: number) => {
    const items = [...allSaleItems];
    items.splice(itemIndex, 1);
    const updates: Record<string, any> = { saleItems: items };
    if (items.length === 0) {
      updates.saleDone = false;
      updates.saleDetails = null;
    }
    await updateLead(lead.id, updates);
    toast({ title: "Deleted", description: "Sale item removed." });
  };

  const handleNotesChange = (val: string) => {
    setNotes(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateLead(lead.id, { notes: val }), 500);
  };

  const cleanPhone = lead.phone?.replace(/[^0-9]/g, "") || "";
  const statusInfo = STATUS_OPTIONS.find((s) => s.value === lead.status);

  return (
    <div className={`bg-card border rounded-xl p-4 space-y-3 transition-colors ${
      lead.saleDone ? "border-success/40" : "border-border"
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 mr-2">
          <input
            type="text"
            defaultValue={lead.displayName || ""}
            onBlur={(e) => {
              const val = e.target.value.trim();
              if (val && val !== lead.displayName) updateLead(lead.id, { displayName: val });
            }}
            className="font-display font-bold text-foreground text-lg bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none w-full transition-colors"
            title="Click to edit name"
          />
          {lead.realName && <p className="text-xs text-muted-foreground">{lead.realName}</p>}
        </div>
        {lead.saleDone && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-success/15 text-success">Sale ✓</span>
        )}
      </div>

      {/* Phone + Status on same line */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-mono text-muted-foreground">{lead.phone}</p>
        <select
          value={lead.status}
          onChange={(e) => updateLead(lead.id, { status: e.target.value })}
          className={`h-8 px-3 rounded-full text-xs font-medium border-0 outline-none cursor-pointer ${statusInfo?.color || "bg-muted text-muted-foreground"}`}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <a
          href={`tel:${cleanPhone}`}
          onClick={() => { try { updateLead(lead.id, {}); } catch {} }}
          className="flex-1 h-9 rounded-lg bg-info/10 text-info text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-info/20 transition-colors"
        >
          <Phone size={13} /> Call
        </a>
        <WhatsAppButton phone={cleanPhone} onActivity={() => { try { updateLead(lead.id, {}); } catch {} }} />
        <button
          onClick={() => setExpandedNotes(expandedNotes === lead.id ? null : lead.id)}
          className="flex-1 h-9 rounded-lg bg-accent text-foreground text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-accent/80 transition-colors border border-border"
        >
          <StickyNote size={13} /> Notes
          {expandedNotes === lead.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* Notes */}
      <AnimatePresence>
        {expandedNotes === lead.id && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              maxLength={1000}
              placeholder="Add notes..."
              className="w-full h-24 p-3 rounded-lg bg-background border border-border text-foreground text-sm outline-none focus:border-primary resize-none font-body"
            />
            <p className="text-[10px] text-muted-foreground text-right">{notes.length}/1000</p>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Sale Section */}
      <div className="border-t border-border pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium">Sales ({allSaleItems.length})</span>
          <div className="flex items-center gap-1">
            {allSaleItems.length >= 2 && (
              <button
                onClick={() => setShowSalesList(!showSalesList)}
                className="h-7 px-2 rounded-md bg-accent text-foreground text-xs font-medium hover:bg-accent/80 transition-colors flex items-center gap-1"
              >
                {showSalesList ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {showSalesList ? "Hide" : "Show"}
              </button>
            )}
            <button
              onClick={() => setExpandedSale(expandedSale === lead.id ? null : lead.id)}
              className="h-7 px-3 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors flex items-center gap-1"
            >
              <Plus size={12} /> Add Sale
            </button>
          </div>
        </div>

        {/* Show sales: always show if 0-1 items, collapsible if 2+ */}
        {(allSaleItems.length < 2 || showSalesList) && allSaleItems.map((item, idx) => (
          <div key={idx} className={`text-xs rounded-lg p-2 space-y-1.5 ${item.verificationStatus === "verified" ? "bg-success/10 border border-success/20" : "bg-warning/10 border border-warning/20"}`}>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-foreground capitalize">{item.category?.replace(/_/g, " ")}</span>
                {item.packageKey && item.packageKey !== "custom" && <span className="text-muted-foreground"> • {item.packageKey}</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium text-foreground">{formatCurrency(item.amount)}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${item.verificationStatus === "verified" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                  {item.verificationStatus === "verified" ? "✓" : "⏳"}
                </span>
                {item.verificationStatus === "pending" && (
                  <button
                    onClick={() => handleDeleteSaleItem(idx)}
                    className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Delete sale"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>
            {item.paymentScreenshotUrl && (
              <a
                href={item.paymentScreenshotUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
              >
                <ExternalLink size={10} /> View Payment Screenshot
              </a>
            )}
          </div>
        ))}

        {/* Add Sale Form */}
        <AnimatePresence>
          {expandedSale === lead.id && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <SaleForm lead={lead} updateLead={updateLead} onDone={() => setExpandedSale(null)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─── WhatsApp Button ─── */

function WhatsAppButton({ phone, onActivity }: { phone: string; onActivity?: () => void }) {
  const [showTemplates, setShowTemplates] = useState(false);

  return (
    <div className="relative flex-1">
      <button
        onClick={() => setShowTemplates(!showTemplates)}
        className="w-full h-9 rounded-lg bg-success/10 text-success text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-success/20 transition-colors"
      >
        <MessageCircle size={13} /> WhatsApp
      </button>
      <AnimatePresence>
        {showTemplates && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="absolute bottom-full left-0 right-0 mb-1 bg-card border border-border rounded-lg shadow-xl z-10 overflow-hidden"
          >
            {WA_TEMPLATES.map((t) => (
              <a
                key={t.label}
                href={`https://wa.me/${phone}?text=${encodeURIComponent(t.text)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => { setShowTemplates(false); onActivity?.(); }}
                className="block px-3 py-2 text-xs text-foreground hover:bg-accent transition-colors border-b border-border last:border-0"
              >
                {t.label}
              </a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Sale Form ─── */

function SaleForm({ lead, updateLead, onDone }: { lead: Lead; updateLead: (id: string, data: Record<string, any>) => Promise<void>; onDone: () => void }) {
  const { toast } = useToast();
  const [category, setCategory] = useState("wishes");
  const [packageKey, setPackageKey] = useState("");
  const [customAmount, setCustomAmount] = useState<number>(0);
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const packages = PACKAGES[category] || [];
  const selectedPkg = packages.find((p) => p.label === packageKey);
  const amount = selectedPkg?.amount || customAmount;
  const needsCustomAmount = packages.length === 0 || (selectedPkg && selectedPkg.amount === 0);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadToCloudinary(file);
      setScreenshotUrl(url);
      toast({ title: "Uploaded", description: "Payment screenshot uploaded." });
    } catch {
      toast({ title: "Error", description: "Upload failed.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (amount <= 0) {
      toast({ title: "Error", description: "Please enter a valid amount.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const newItem: SaleDetail = {
      category,
      packageKey: packageKey || "custom",
      customDescription: needsCustomAmount ? `Custom ${category}` : null,
      amount,
      verificationStatus: "pending",
      paymentScreenshotUrl: screenshotUrl || null,
    };
    // Append to existing saleItems array
    const existingItems = lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);
    const updatedItems = [...existingItems, newItem];
    await updateLead(lead.id, { saleDone: true, saleItems: updatedItems, saleDetails: newItem });
    setSaving(false);
    toast({ title: "Sale Added", description: `Sale of ${formatCurrency(amount)} added.` });
    onDone();
  };

  return (
    <div className="space-y-3 bg-background border border-border rounded-lg p-3 mt-2">
      <div className="bg-warning/10 border border-warning/30 text-warning text-xs rounded-md p-2 flex items-center gap-1.5">
        <ExternalLink size={12} /> Verification needed — admin will review
      </div>

      <select
        value={category}
        onChange={(e) => { setCategory(e.target.value); setPackageKey(""); }}
        className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
      >
        {SALE_CATEGORIES.map((c) => (
          <option key={c} value={c}>{c.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</option>
        ))}
      </select>

      {packages.length > 0 && (
        <select
          value={packageKey}
          onChange={(e) => {
            setPackageKey(e.target.value);
            const pkg = packages.find((p) => p.label === e.target.value);
            if (pkg && pkg.amount > 0) setCustomAmount(pkg.amount);
          }}
          className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
        >
          <option value="">Select package</option>
          {packages.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label} {p.amount > 0 ? `— ${formatCurrency(p.amount)}` : ""}
            </option>
          ))}
        </select>
      )}

      {needsCustomAmount && (
        <input
          type="number"
          min={1}
          value={customAmount || ""}
          onChange={(e) => setCustomAmount(Number(e.target.value) || 0)}
          placeholder="Amount (₹)"
          className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary font-mono"
        />
      )}

      <label className="block cursor-pointer">
        <div className="border border-dashed border-border rounded-md p-3 text-center hover:border-primary/50 transition-colors">
          {uploading ? (
            <Loader2 size={16} className="animate-spin text-primary mx-auto" />
          ) : screenshotUrl ? (
            <div className="flex items-center gap-2 justify-center text-xs text-success">
              <Check size={14} /> Payment screenshot uploaded
            </div>
          ) : (
            <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground">
              <Upload size={14} /> Upload payment screenshot
            </div>
          )}
        </div>
        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
      </label>

      <button
        onClick={handleSave}
        disabled={saving || amount <= 0}
        className="w-full h-9 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-xs hover:bg-primary/90 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        {saving ? "Saving..." : `Add Sale — ${formatCurrency(amount)}`}
      </button>
    </div>
  );
}

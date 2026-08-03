/**
 * ID card verification — republishing the public badges every card's QR code resolves to.
 *
 * This card used to also hold the CEO signature and the company stamp. Those moved to
 * `CompanyDocumentsCard`, where they sit beside the rest of the company's identity, because
 * splitting "the company's marks" across two cards meant an admin filling in the address had no
 * reason to think the signature lived somewhere else entirely.
 *
 * What is left is the one job that is genuinely about the cards rather than the letters: each
 * card's QR opens a page confirming the holder works here, and that page reads a small public
 * projection kept in step by the writes that change it. Republishing is the "why is this card not
 * scanning" button — cheap, idempotent, and it removes all doubt.
 */
import { useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { Loader2, QrCode, RefreshCw } from "lucide-react";
import { db } from "@/services/firebase";
import { syncPublicBadge } from "@/services/publicBadge";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";

export default function CompanyMarksCard() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(0);

  if (!user) return null;

  /**
   * Rebuild every active member's public badge.
   *
   * Needed once because the badges did not exist when these people were hired, and useful
   * afterwards as the "why is this card not scanning" button.
   */
  const publishBadges = async () => {
    setPublishing(true);
    setPublished(0);
    try {
      const snap = await getDocs(collection(db, "users"));
      const uids = snap.docs
        .filter((d) => d.data().isActive !== false && !d.data().externalCreator)
        .map((d) => d.id);
      for (const uid of uids) {
        await syncPublicBadge(uid);
        setPublished((n) => n + 1);
      }
      toast({ title: "Badges published", description: `${uids.length} ID cards will now verify.` });
    } catch {
      toast({ title: "Error", description: "Could not publish the badges.", variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 md:p-5" data-test="company-marks-card">
      <div className="mb-3 flex items-start gap-2.5">
        <QrCode size={18} className="mt-0.5 shrink-0 text-primary" />
        <div>
          <h3 className="font-display text-base font-bold text-foreground">ID card verification</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Each card's QR opens a page confirming the holder works here. That page reads a small
            public record — name, employee ID, designation, department, photo — kept in step
            automatically. Republish if a card ever scans as unverified.
          </p>
        </div>
      </div>
      <button
        onClick={publishBadges}
        disabled={publishing}
        data-test="publish-badges"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-50"
      >
        {publishing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        {publishing ? `Publishing… ${published}` : "Republish all badges"}
      </button>
    </div>
  );
}

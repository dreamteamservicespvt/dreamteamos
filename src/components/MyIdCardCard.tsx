/**
 * "My ID card", for someone who has no employment panel to put it in.
 *
 * Team members reach their card through a tab on their employment record. Admins have no such
 * record — they were never onboarded through the HR lifecycle — and an ID card that exists for
 * everyone except the people who issue them is not a card everyone has. So the same panel is
 * offered here, from Settings, built from the user account alone.
 */
import { useState } from "react";
import { ChevronRight, IdCard } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import IdCardModal from "@/components/hr/IdCardModal";

export default function MyIdCardCard() {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-test="my-id-card"
        className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-5 text-left transition-colors hover:bg-accent/30"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15">
          <IdCard size={18} className="text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold text-foreground">My ID card</p>
          <p className="text-xs text-muted-foreground">
            Preview it, then download as PNG to send or PDF to print at card size.
          </p>
        </div>
        <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
      </button>

      {open && <IdCardModal member={user} onClose={() => setOpen(false)} />}
    </>
  );
}

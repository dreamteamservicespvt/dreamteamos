/**
 * "What is this member's password?" — the answer, on demand.
 *
 * The password is fetched when the dialog opens rather than loaded with the team list, so it is
 * read only when an admin actually asks for it: nothing on a team screen carries a password around
 * in memory, and the read is one document rather than one per member.
 */
import { useEffect, useState } from "react";
import { Copy, Check, Eye, EyeOff, KeyRound, Loader2, MessageCircle, X } from "lucide-react";
import { fetchMemberPassword, buildCredentialsMessage } from "@/services/memberCredentials";
import { getWhatsAppUrl } from "@/utils/phone";
import { useToast } from "@/hooks/use-toast";
import type { AppUser } from "@/types";

export default function MemberPasswordModal({ member, onClose }: {
  member: AppUser;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [password, setPassword] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<"email" | "password" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const pw = await fetchMemberPassword(member.uid);
      if (cancelled) return;
      setPassword(pw);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [member.uid]);

  const copy = async (what: "email" | "password", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast({ title: "Couldn't copy", description: "Select the text and copy it by hand.", variant: "destructive" });
    }
  };

  const sendOnWhatsApp = () => {
    if (!member.phone) {
      toast({ title: "No phone number", description: `${member.name} has no phone number saved.`, variant: "destructive" });
      return;
    }
    const message = buildCredentialsMessage({
      email: member.email,
      password,
      loginUrl: window.location.origin,
    });
    window.open(getWhatsAppUrl(member.phone, message), "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display font-bold text-foreground flex items-center gap-2">
              <KeyRound size={16} /> Login details
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">{member.name}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Email</label>
            <div className="flex items-center gap-1.5">
              <p className="flex-1 h-9 px-3 rounded-lg bg-background border border-border text-foreground text-sm font-mono flex items-center truncate">
                {member.email}
              </p>
              <button onClick={() => copy("email", member.email)} title="Copy email"
                className="w-9 h-9 rounded-lg border border-border text-muted-foreground hover:text-primary hover:bg-primary/10 inline-flex items-center justify-center transition-colors">
                {copied === "email" ? <Check size={14} className="text-success" /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Password</label>
            {loading ? (
              <div className="h-9 px-3 rounded-lg bg-background border border-border text-muted-foreground text-sm flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Looking it up…
              </div>
            ) : password ? (
              <div className="flex items-center gap-1.5">
                <p data-test="member-password"
                  className="flex-1 h-9 px-3 rounded-lg bg-background border border-border text-foreground text-sm font-mono flex items-center truncate">
                  {revealed ? password : "•".repeat(Math.min(password.length, 16))}
                </p>
                <button onClick={() => setRevealed((v) => !v)} title={revealed ? "Hide" : "Show"}
                  className="w-9 h-9 rounded-lg border border-border text-muted-foreground hover:text-primary hover:bg-primary/10 inline-flex items-center justify-center transition-colors">
                  {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button onClick={() => copy("password", password)} title="Copy password"
                  className="w-9 h-9 rounded-lg border border-border text-muted-foreground hover:text-primary hover:bg-primary/10 inline-flex items-center justify-center transition-colors">
                  {copied === "password" ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                </button>
              </div>
            ) : (
              /* Members created before passwords were stored, and anyone who changed theirs on a
                 build that predates this. Say so plainly instead of showing an empty box. */
              <p className="text-xs text-muted-foreground bg-background border border-border rounded-lg p-2.5">
                No password saved for this member. It was set before passwords were kept, or changed
                since. Ask them to sign in and set a new one from their profile, and it will be saved
                from then on.
              </p>
            )}
          </div>
        </div>

        <button onClick={sendOnWhatsApp} disabled={loading}
          className="w-full h-9 rounded-lg bg-success/15 text-success border border-success/30 text-sm font-semibold hover:bg-success/25 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
          <MessageCircle size={14} /> Send on WhatsApp
        </button>
      </div>
    </div>
  );
}

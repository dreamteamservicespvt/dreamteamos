/**
 * "Waiting for your approval" in the client's own chat (SMM Delivery Control, phase 7, 2026-10-15).
 *
 * For a Social Media month the chat is the month, so the client sees every post the team sent for approval and
 * answers with one tap: ✔ Approve, or ✎ Changes with what to change (`api/order-chat` `smm-approvals` /
 * `smm-answer`, recorded exactly as the team records an approval, "via the client chat"). Nothing shows for any
 * other chat. Plain words, big buttons — the client is a small business owner on a phone.
 */
import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, PencilLine } from "lucide-react";
import { answerSmmPiece, fetchSmmApprovals, type GuestSmmPiece } from "@/services/orderChatGuest";

const dayOf = (ms: number | null) => {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

export default function ClientSmmApprovals({ chatId }: { chatId: string }) {
  const [pieces, setPieces] = useState<GuestSmmPiece[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [changing, setChanging] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => { fetchSmmApprovals(chatId).then(setPieces); }, [chatId]);
  useEffect(() => {
    load();
    const t = setInterval(load, 120_000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  if (!pieces.length && !message) return null;

  const answer = async (p: GuestSmmPiece, approved: boolean) => {
    setBusy(p.itemId);
    setMessage(null);
    try {
      await answerSmmPiece(chatId, p.itemId, approved, approved ? "" : note);
      setPieces((list) => list.filter((x) => x.itemId !== p.itemId));
      setChanging(null);
      setNote("");
      setMessage(approved ? `Thank you — "${p.title}" is approved.` : `Thank you — the team will change "${p.title}".`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "It could not be saved — please try again.");
      load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div data-test="client-smm-approvals" className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-slate-800">
      {pieces.length > 0 && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-h-[44px] w-full items-center justify-between gap-2 text-left text-sm font-semibold">
          <span>✅ {pieces.length} post{pieces.length === 1 ? " is" : "s are"} waiting for your approval</span>
          <span className="shrink-0 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-white">{open ? "Hide" : "Review"}</span>
        </button>
      )}
      {message && <p className="py-1 text-xs text-slate-600" role="status">{message}</p>}
      {open && (
        <ul className="max-h-[45dvh] space-y-2 overflow-y-auto pb-2">
          {pieces.map((p) => (
            <li key={p.itemId} data-test="client-smm-piece" className="rounded-xl bg-white p-3 shadow-sm">
              <p className="text-sm font-semibold">{p.title}</p>
              <p className="text-xs text-slate-500">{p.label}{p.sentAt ? ` · sent ${dayOf(p.sentAt)}` : ""} — see it in the chat below</p>
              {changing === p.itemId ? (
                <div className="mt-2 space-y-2">
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What should we change?"
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  <div className="flex gap-2">
                    <button type="button" disabled={!!busy || note.trim().length < 3} onClick={() => answer(p, false)}
                      className="min-h-[44px] flex-1 rounded-lg bg-slate-800 px-3 text-sm font-semibold text-white disabled:opacity-50">
                      {busy === p.itemId ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Send the changes"}
                    </button>
                    <button type="button" onClick={() => { setChanging(null); setNote(""); }} className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <button type="button" data-test="client-smm-approve" disabled={!!busy} onClick={() => answer(p, true)}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#008069] px-3 text-sm font-semibold text-white disabled:opacity-50">
                    {busy === p.itemId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
                  </button>
                  <button type="button" disabled={!!busy} onClick={() => { setChanging(p.itemId); setNote(""); }}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold disabled:opacity-50">
                    <PencilLine className="h-4 w-4" /> Changes
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

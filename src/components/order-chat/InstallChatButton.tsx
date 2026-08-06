/**
 * "Add to home screen", for a customer who has never heard the phrase.
 *
 * ── Why a customer wants this ─────────────────────────────────────────────────────────────────
 * The chat lives at a link in a WhatsApp message, and a WhatsApp message scrolls away. A week into
 * a job the customer wants to check their preview and cannot find the link, so they message the
 * salesperson who sold them the ad, who messages the leader, who resends it. Installed, it is an
 * icon on their home screen next to WhatsApp and the problem stops existing. It also makes
 * notifications reliable on iOS, where a browser tab gets none at all.
 *
 * Two paths, because the two platforms could not be less alike:
 *  - Chrome/Edge/Android fire `beforeinstallprompt`, which is captured and replayed on tap.
 *  - iOS Safari has no such event and never will, so the button explains the Share → Add to Home
 *    Screen route in the two sentences it actually takes.
 *
 * Renders nothing at all when there is nothing to offer — already installed, or a browser that
 * cannot do it. A permanently dead "Install" button is worse than no button.
 */
import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches
  || (window.navigator as { standalone?: boolean }).standalone === true;

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent)
  // iPadOS 13+ reports itself as a Mac; a touch point is what gives it away.
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export default function InstallChatButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const capture = (e: Event) => {
      // Chrome shows its own mini-infobar otherwise, which appears over the composer.
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const done = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", done);
    };
  }, []);

  const iosCanInstall = !installed && isIos();
  if (installed || (!prompt && !iosCanInstall)) return null;

  const install = async () => {
    if (iosCanInstall && !prompt) { setShowIosHelp(true); return; }
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    // A dismissed prompt cannot be replayed — the event is single-use.
    setPrompt(null);
    if (outcome === "accepted") setInstalled(true);
  };

  return (
    <>
      <button
        onClick={install}
        data-test="install-chat"
        title="Add this chat to your home screen"
        className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-current transition-colors hover:bg-white/25"
      >
        <Download className="h-3.5 w-3.5" /> Install
      </button>

      {showIosHelp && (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/50 sm:items-center sm:justify-center"
          onClick={() => setShowIosHelp(false)}>
          <div className="w-full rounded-t-2xl bg-white p-5 text-slate-800 sm:max-w-sm sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-semibold">Add to your home screen</p>
              <button onClick={() => setShowIosHelp(false)} aria-label="Close"
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ol className="space-y-3 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <Share className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                <span>Tap the <b className="text-slate-800">Share</b> button at the bottom of Safari.</span>
              </li>
              <li className="flex items-start gap-2">
                <SquarePlus className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                <span>Choose <b className="text-slate-800">Add to Home Screen</b>, then tap Add.</span>
              </li>
            </ol>
            <p className="mt-4 text-[12px] leading-relaxed text-slate-500">
              Your chat then opens like an app, and you will get a notification when the team replies.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

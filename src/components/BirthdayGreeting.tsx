/**
 * Birthdays, on the two screens that matter.
 *
 * For the person whose birthday it is: a greeting the first time they open the platform that day,
 * signed by the company rather than by an app.
 *
 * For everybody else: a quiet strip at the top of the page naming who to wish, plus one bell
 * notification (sent by services/birthdays, which handles the "many people open the app" problem).
 *
 * Mounted once in AppLayout, so it applies wherever anyone happens to be.
 */
import { useEffect, useState } from "react";
import { Cake, PartyPopper, X } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { fetchTeamForBirthdays, notifyBirthdaysOnOpen } from "@/services/birthdays";
import {
  birthdayGreeting, birthdaysOn, birthdaySeenKey, isBirthdayOn, isoDay, namesSentence,
} from "@/utils/birthdays";
import MemberAvatar from "@/components/MemberAvatar";
import type { AppUser } from "@/types";

/** Remembers that this browser has already run today's sweep, so a page change doesn't redo it. */
const sweptKey = (day: string) => `dts_birthday_swept_${day}`;

function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}
function writeFlag(key: string) {
  try { localStorage.setItem(key, "1"); } catch { /* private mode — greet again, no harm */ }
}

export default function BirthdayGreeting() {
  const user = useAuthStore((s) => s.user);
  const [team, setTeam] = useState<AppUser[]>([]);
  const [greetingOpen, setGreetingOpen] = useState(false);
  const [stripDismissed, setStripDismissed] = useState(false);

  const today = new Date();
  const day = isoDay(today);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    (async () => {
      const list = await fetchTeamForBirthdays();
      if (cancelled) return;
      setTeam(list);

      // One sweep per browser per day. The notification itself is keyed per recipient per day too,
      // so a second device cannot produce a second row — this just avoids the pointless writes.
      if (!readFlag(sweptKey(day))) {
        writeFlag(sweptKey(day));
        await notifyBirthdaysOnOpen(list, today);
      }
    })();
    return () => { cancelled = true; };
    // Runs once per session per user; `today` is deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, day]);

  /** Their own birthday — from the user record, which is the copy every screen already has. */
  const mine = isBirthdayOn(user?.dob, today);
  useEffect(() => {
    if (!user?.uid || !mine) return;
    if (readFlag(birthdaySeenKey(user.uid, today))) return;
    setGreetingOpen(true);
    writeFlag(birthdaySeenKey(user.uid, today));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, mine, day]);

  const others = birthdaysOn(team, today).filter((p) => p.uid !== user?.uid);

  if (!user) return null;

  const greeting = birthdayGreeting(user.name, today, user.dob);

  return (
    <>
      {/* Everyone else: who to wish today. */}
      {others.length > 0 && !stripDismissed && (
        <div data-test="birthday-strip"
          className="mb-4 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-transparent px-3 py-2.5">
          <Cake className="h-4 w-4 shrink-0 text-amber-500" />
          <div className="flex -space-x-2">
            {others.slice(0, 4).map((p) => (
              <MemberAvatar key={p.uid} name={p.name} avatar={p.avatar} size={26}
                className="ring-2 ring-background" />
            ))}
          </div>
          <p className="min-w-0 flex-1 text-xs text-foreground">
            <span className="font-semibold">{namesSentence(others.map((p) => p.name))}</span>
            {others.length === 1 ? " is celebrating today" : " are celebrating today"} — send your wishes 🎉
          </p>
          <button onClick={() => setStripDismissed(true)} aria-label="Dismiss"
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Theirs. Shown once a year, the first time they open the platform on the day. */}
      {greetingOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setGreetingOpen(false)} data-test="birthday-greeting">
          <div onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-amber-500/30 bg-card shadow-2xl">
            <div className="bg-gradient-to-br from-amber-500/25 via-primary/15 to-transparent px-6 pb-6 pt-8 text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20">
                <PartyPopper className="h-8 w-8 text-amber-500" />
              </div>
              <h2 className="font-display text-2xl font-bold text-foreground">{greeting.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{greeting.message}</p>
              <p className="mt-4 font-display text-xs font-semibold uppercase tracking-wider text-primary">
                — from everyone at Dream Team Services
              </p>
            </div>
            <div className="p-4">
              <button onClick={() => setGreetingOpen(false)}
                className="h-10 w-full rounded-xl bg-primary font-display text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                Thank you! 🎂
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

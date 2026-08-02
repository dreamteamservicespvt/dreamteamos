/**
 * Birthdays, on the two screens that matter.
 *
 * For the person whose birthday it is: a greeting the first time they open the platform that day,
 * signed by the company rather than by an app.
 *
 * For everybody else: a strip at the top of the page naming who to wish and a button per person
 * that opens WhatsApp with the message already written, plus one bell notification (sent by
 * services/birthdays, which handles the "many people open the app" problem).
 *
 * Mounted once in AppLayout, so it applies wherever anyone happens to be. The cards themselves
 * live in birthday/BirthdayCards so an admin can preview exactly these, not a copy of them.
 */
import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { fetchTeamForBirthdays, notifyBirthdaysOnOpen } from "@/services/birthdays";
import { birthdaysOn, birthdaySeenKey, isBirthdayOn, isoDay } from "@/utils/birthdays";
import { BirthdayGreetingCard, BirthdayTeamStrip } from "@/components/birthday/BirthdayCards";
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

  return (
    <>
      {/* Everyone else: who to wish today, and a tap that actually wishes them. */}
      {!stripDismissed && (
        <BirthdayTeamStrip
          people={others.map((p) => ({ uid: p.uid, name: p.name, avatar: p.avatar, phone: p.phone, dob: p.dob }))}
          senderName={user.name}
          onDismiss={() => setStripDismissed(true)}
        />
      )}

      {/* Theirs. Shown once a year, the first time they open the platform on the day. */}
      {greetingOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setGreetingOpen(false)}
          data-test="birthday-greeting"
        >
          <div onClick={(e) => e.stopPropagation()}>
            <BirthdayGreetingCard
              name={user.name}
              dob={user.dob}
              today={today}
              avatar={user.avatar}
              onClose={() => setGreetingOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}

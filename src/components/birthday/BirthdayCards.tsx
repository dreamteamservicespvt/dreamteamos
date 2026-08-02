/**
 * The two faces of a birthday: the one the person sees, and the one everybody else sees.
 *
 * Both live here rather than inside BirthdayGreeting because an admin needs to be able to look at
 * them on an ordinary Tuesday — and a preview that is a *copy* of the real thing drifts from it
 * within a month. These are the same components the live greeting renders, so what an admin
 * previews is literally what the team gets.
 */
import { Cake, Gift, MessageCircle, PartyPopper, X } from "lucide-react";
import MemberAvatar from "@/components/MemberAvatar";
import { getWhatsAppUrl } from "@/utils/phone";
import { birthdayGreeting, birthdayWishMessage, namesSentence } from "@/utils/birthdays";

export interface Celebrant {
  uid: string;
  name: string;
  avatar?: string | null;
  phone?: string | null;
  dob?: string | null;
}

/**
 * What the birthday person sees, once, the first time they open the platform on the day.
 *
 * Signed by the company rather than by an app: the greeting exists to feel like it came from the
 * people they work with, and an unsigned "Happy Birthday!" from a system feels like neither.
 */
export function BirthdayGreetingCard({ name, dob, today, avatar, onClose, closeLabel = "Thank you! 🎂" }: {
  name: string;
  dob?: string | null;
  today: Date;
  avatar?: string | null;
  onClose?: () => void;
  closeLabel?: string;
}) {
  const greeting = birthdayGreeting(name, today, dob);

  return (
    <div
      className="w-full max-w-sm overflow-hidden rounded-2xl border border-amber-500/30 bg-card shadow-2xl"
      data-test="birthday-greeting-card"
    >
      <div className="relative bg-gradient-to-br from-amber-500/25 via-primary/15 to-transparent px-6 pb-6 pt-8 text-center">
        {/* Confetti, in CSS. A GIF here would be a network request on somebody's birthday. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden opacity-70">
          {[
            "left-[8%] top-[14%] bg-amber-400", "left-[24%] top-[6%] bg-primary",
            "left-[46%] top-[12%] bg-rose-400", "left-[68%] top-[7%] bg-emerald-400",
            "left-[86%] top-[18%] bg-amber-400", "left-[14%] top-[34%] bg-emerald-400",
            "left-[90%] top-[38%] bg-primary",
          ].map((cls) => (
            <span key={cls} className={`absolute h-1.5 w-1.5 rotate-45 rounded-[1px] ${cls}`} />
          ))}
        </div>

        <div className="relative mx-auto mb-3 h-20 w-20">
          {avatar ? (
            <>
              <MemberAvatar name={name} avatar={avatar} size={80} className="ring-4 ring-amber-500/30" />
              <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-white shadow">
                <Cake className="h-3.5 w-3.5" />
              </span>
            </>
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/20">
              <PartyPopper className="h-9 w-9 text-amber-500" />
            </span>
          )}
        </div>

        <h2 className="font-display relative text-2xl font-bold text-foreground">{greeting.title}</h2>
        {greeting.age !== null && (
          <p className="relative mt-1 text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            {greeting.age} today
          </p>
        )}
        <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">{greeting.message}</p>
        <p className="font-display relative mt-4 text-xs font-semibold uppercase tracking-wider text-primary">
          — from everyone at Dream Team Services
        </p>
      </div>

      {onClose && (
        <div className="p-4">
          <button
            onClick={onClose}
            data-test="birthday-greeting-close"
            className="font-display h-10 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {closeLabel}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * What everybody else sees: who to wish, and one tap to actually do it.
 *
 * The WhatsApp button is the whole feature. A banner that only announces a birthday leaves the
 * wishing to whoever remembers to open a separate app and find the number — which is most of the
 * reason birthdays get missed in a company this size.
 */
export function BirthdayTeamStrip({ people, senderName, onDismiss }: {
  people: Celebrant[];
  /** Signs the prefilled message. */
  senderName?: string | null;
  onDismiss?: () => void;
}) {
  if (people.length === 0) return null;
  const many = people.length > 1;

  return (
    <div
      data-test="birthday-strip"
      className="mb-4 overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-transparent"
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Cake className="h-4 w-4 shrink-0 text-amber-500" />
        <div className="flex -space-x-2">
          {people.slice(0, 4).map((p) => (
            <MemberAvatar key={p.uid} name={p.name} avatar={p.avatar} size={26} className="ring-2 ring-background" />
          ))}
        </div>
        <p className="min-w-0 flex-1 text-xs text-foreground">
          <span className="font-semibold">{namesSentence(people.map((p) => p.name))}</span>
          {many ? " are celebrating today" : " is celebrating today"} — send your wishes 🎉
        </p>
        {onDismiss && (
          <button onClick={onDismiss} aria-label="Dismiss"
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* One row per person, so a day with two birthdays does not make you guess who you wished. */}
      <div className="flex flex-wrap gap-2 border-t border-amber-500/20 px-3 py-2">
        {people.map((p) => {
          const message = birthdayWishMessage(p.name, senderName);
          const first = p.name.trim().split(/\s+/)[0] || p.name;
          if (!p.phone) {
            return (
              <span
                key={p.uid}
                title="No phone number on their profile"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-border px-3 text-[11px] font-medium text-muted-foreground"
              >
                <Gift size={12} /> Wish {first} in person
              </span>
            );
          }
          return (
            <a
              key={p.uid}
              href={getWhatsAppUrl(p.phone, message)}
              target="_blank"
              rel="noopener noreferrer"
              data-test="send-wishes"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              <MessageCircle size={12} /> Send wishes to {first}
            </a>
          );
        })}
      </div>
    </div>
  );
}

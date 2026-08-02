/**
 * What this member's birthday will look like — on an ordinary Tuesday.
 *
 * A feature that only appears once a year is a feature nobody can check. This shows an admin both
 * halves of it on demand: the greeting that member will open the platform to, and the strip the
 * rest of the team will see with the WhatsApp button live, so "does it work?" is answerable
 * without waiting for a birthday.
 *
 * It also answers the question behind the question. A birthday can only fire if the platform
 * knows the date, and the single most common reason a birthday is missed is an empty DOB — so
 * that gets said here, plainly, rather than being discovered by its absence in eight months.
 */
import { Cake, CalendarOff, X } from "lucide-react";
import { isBirthdayOn, monthDay, prettyBirthday } from "@/utils/birthdays";
import type { AppUser } from "@/types";
import type { EmployeeProfile } from "@/types/hr";
import { BirthdayGreetingCard, BirthdayTeamStrip } from "./BirthdayCards";

export default function BirthdayPreviewModal({ member, profile, viewerName, onClose }: {
  member: AppUser;
  /** The HR record carries a DOB too, and it is the one HR actually collects. */
  profile?: EmployeeProfile | null;
  /** Whoever is previewing — signs the sample WhatsApp message, exactly as it would in real use. */
  viewerName?: string | null;
  onClose: () => void;
}) {
  const dob = member.dob || profile?.dob || null;
  const today = new Date();
  const isToday = isBirthdayOn(dob, today);

  // With no DOB there is nothing to preview against, so the greeting is shown on the date it
  // WOULD appear — which requires a date. Falls back to today purely to render something.
  const stage = dob ? new Date(`${today.getFullYear()}-${monthDay(dob)}T12:00:00`) : today;
  const stageDate = Number.isNaN(stage.getTime()) ? today : stage;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/60 p-2 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-auto my-4 w-full max-w-2xl rounded-xl border border-border bg-card p-4 md:p-5"
        data-test="birthday-preview-modal"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display flex items-center gap-2 text-lg font-bold text-foreground">
              <Cake size={18} className="text-amber-500" /> Birthday preview
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {dob
                ? <>What happens for {member.name} on {prettyBirthday(dob)}{isToday ? " — which is today" : ""}.</>
                : <>Nothing happens for {member.name} yet — see below.</>}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {!dob && (
          <div
            className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5"
            data-test="no-dob-warning"
          >
            <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
              <CalendarOff size={13} /> No date of birth on record
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {member.name} will never be greeted and the team will never be told to wish them.
              Add their date of birth on the Personal &amp; KYC tab — everything below then works
              on its own, every year.
            </p>
          </div>
        )}

        <div className="space-y-5">
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              1 · What {member.name.split(" ")[0]} sees
            </h4>
            <p className="mb-3 text-[11px] text-muted-foreground">
              Shown once, the first time they open the platform that day.
            </p>
            <div className="flex justify-center rounded-xl bg-accent/40 p-4">
              <BirthdayGreetingCard
                name={member.name}
                dob={dob}
                today={stageDate}
                avatar={member.avatar}
              />
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              2 · What the rest of the team sees
            </h4>
            <p className="mb-3 text-[11px] text-muted-foreground">
              At the top of whatever page they are on, plus one notification. The button opens
              WhatsApp with the message already written — it is live here, so you can try it.
            </p>
            <BirthdayTeamStrip
              people={[{ uid: member.uid, name: member.name, avatar: member.avatar, phone: member.phone, dob }]}
              senderName={viewerName}
            />
            {!member.phone && (
              <p className="text-[11px] text-muted-foreground">
                No phone number on their account, so the team is asked to wish them in person
                instead of being given a WhatsApp button that goes nowhere.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

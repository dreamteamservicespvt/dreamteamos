/**
 * Whose birthday it is.
 *
 * A team that only ever talks about orders and deadlines is a worse team to be on. The company
 * already knows everyone's date of birth — it is collected once, in the HR record, for payroll and
 * statutory reasons — so the only thing missing was for anyone to be told.
 *
 * Kept pure and date-string based (`yyyy-MM-dd`, the shape every other date in this codebase uses)
 * so the awkward cases can be tested rather than discovered: leap-year birthdays, a team member who
 * has not filled in their DOB, and the fact that "today" is whatever day the person reading the
 * screen is having, not the server's.
 */

export interface BirthdayPerson {
  uid: string;
  name: string;
  /** `yyyy-MM-dd`. Absent for anyone who has not filled in their HR details. */
  dob?: string | null;
  avatar?: string | null;
  role?: string;
}

/** `yyyy-MM-dd` for a Date, in the reader's own timezone. */
export function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The `MM-DD` of a date string, or "" when there isn't a usable one. */
export function monthDay(dob: string | null | undefined): string {
  const v = dob?.trim();
  if (!v || v.length < 10) return "";
  const [, m, d] = v.split("-");
  return m && d ? `${m}-${d}` : "";
}

/**
 * Whether `dob` falls on `today`.
 *
 * A 29 February birthday is celebrated on the 28th in common years. Skipping it three years in four
 * is the kind of small unkindness software does by accident, and the person it happens to notices
 * every time.
 */
export function isBirthdayOn(dob: string | null | undefined, today: Date): boolean {
  const md = monthDay(dob);
  if (!md) return false;
  if (md === isoDay(today).slice(5)) return true;

  if (md === "02-29") {
    const year = today.getFullYear();
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return !isLeap && isoDay(today).slice(5) === "02-28";
  }
  return false;
}

/** Everyone whose birthday is today, in name order so the list reads the same for everyone. */
export function birthdaysOn<T extends BirthdayPerson>(people: T[], today: Date): T[] {
  return people
    .filter((p) => isBirthdayOn(p.dob, today))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

/** How old they are turning, when the year of birth is known and plausible. */
export function turningAge(dob: string | null | undefined, today: Date): number | null {
  const year = Number(dob?.slice(0, 4));
  if (!Number.isFinite(year) || year < 1900) return null;
  const age = today.getFullYear() - year;
  return age > 0 && age < 120 ? age : null;
}

/** "Asha and Ravi" / "Asha, Ravi and Kiran" — a list people read, not one they parse. */
export function namesSentence(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** What everyone else is told. */
export function birthdayNoticeMessage(people: BirthdayPerson[]): string {
  const names = namesSentence(people.map((p) => p.name).filter(Boolean));
  return people.length === 1
    ? `It's ${names}'s birthday today 🎂 — send them your wishes!`
    : `It's ${names}'s birthdays today 🎂 — send them your wishes!`;
}

/**
 * What the birthday person sees, from the company rather than from a system.
 *
 * Deliberately signed by Dream Team Services: the greeting exists to feel like it came from the
 * people they work with, and an unsigned "Happy Birthday!" from an app feels like neither.
 */
export function birthdayGreeting(name: string, today: Date, dob?: string | null): {
  title: string;
  message: string;
  age: number | null;
} {
  const age = turningAge(dob, today);
  const first = (name || "").trim().split(/\s+/)[0] || "there";
  return {
    title: `Happy Birthday, ${first}! 🎉`,
    message: age
      ? `Wishing you a wonderful ${age}th year ahead. Thank you for everything you bring to the team — have a brilliant day!`
      : `Wishing you a wonderful year ahead. Thank you for everything you bring to the team — have a brilliant day!`,
    age,
  };
}

/**
 * The key that stops the greeting reappearing every time they change page.
 *
 * Year-scoped rather than a plain "seen" flag, so next year it greets them again — a one-shot flag
 * would silently retire the feature for everyone who has used it once.
 */
export function birthdaySeenKey(uid: string, today: Date): string {
  return `dts_birthday_seen_${uid}_${today.getFullYear()}`;
}

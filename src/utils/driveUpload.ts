/**
 * Where the day's work goes in the Drive.
 *
 * `Name → Month → Day N → Ad type`, and the reason it is computed rather than written on a poster
 * is that "Day 1" is ambiguous the moment you read it on the 14th. Showing somebody the actual
 * folder they need *today* removes the one step where people guess and end up with August work in
 * a July folder.
 *
 * The day number counts within the month, so the 1st is "Day 1" and the 14th is "Day 14" —
 * matching how the team already names them.
 *
 * Pure, so the naming rule is testable and cannot drift between the check-out prompt and anything
 * that later reads these folders.
 */
import { format, getDate } from "date-fns";

/** The folder trail for one person on one day, outermost first. Ad type is chosen by the member. */
export function driveFolderPath(memberName: string, when: Date = new Date()): string[] {
  const name = (memberName || "").trim() || "Your name";
  return [name, format(when, "MMMM"), `Day ${getDate(when)}`];
}

/** The same trail as a single readable string — for a message, a toast, or a stored record. */
export const driveFolderLabel = (memberName: string, when: Date = new Date()): string =>
  driveFolderPath(memberName, when).join(" → ");

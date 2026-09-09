/**
 * What to sell a client next.
 *
 * ── The ladder ───────────────────────────────────────────────────────────────────────────────
 *   ad → social media month → website → software
 *
 * That is the order the business actually climbs, and each rung is a bigger commitment than the one
 * below: an ad proves we can make something they like; a month proves we can keep showing up; a
 * website is infrastructure; software is a project. Pitching the top of the ladder to somebody who
 * has only ever bought a ₹499 wishes video is how a call ends early.
 *
 * ── Why this only SUGGESTS ───────────────────────────────────────────────────────────────────
 * It picks the category the sale form opens on, and nothing more. The member can sell anything from
 * that form — the ladder is what the business prefers, not a rule about what a client may buy, and
 * a client who rings up asking for a logo should not have to be walked past a website first.
 */
import { isAdCategory } from "./serviceCatalog";

/**
 * The rungs, lowest first. Deliberately shorter than the catalogue: these are the four steps of the
 * pitch, not the whole price list. Everything else — logos, posters, listings — is sold when it
 * comes up, and is offered by the gap checklist rather than by this.
 */
export const UPSELL_LADDER = [
  "promotional",
  "social_media_management",
  "website",
  "software",
] as const;

/**
 * Which rung a bought service sits on, or -1 for one that is not on the ladder at all.
 *
 * Every kind of ad counts as the first rung — wishes, cinematic, a bulk order of any of them. They
 * are the same rung of the same pitch, and treating a client with four wishes videos as having
 * bought nothing would keep suggesting them a fifth.
 */
function rungOf(category: string): number {
  if (isAdCategory(category)) return 0;
  return UPSELL_LADDER.indexOf(category as (typeof UPSELL_LADDER)[number]);
}

/**
 * The next rung up from the highest thing this client has already bought.
 *
 * Not "the first rung they do not own": a client who bought a website but has never had an ad is
 * further up the ladder than one who has bought three ads, and suggesting them a promotional video
 * would be walking them back down it.
 *
 * A client with nothing on record starts at the bottom. One who has everything stays at the top —
 * there is always more software to build, and their next ad is the gap checklist's job, not this.
 */
export function nextUpsellCategory(ownedKeys: string[]): string {
  const highest = ownedKeys.reduce((max, key) => Math.max(max, rungOf(key)), -1);
  return UPSELL_LADDER[Math.min(highest + 1, UPSELL_LADDER.length - 1)];
}

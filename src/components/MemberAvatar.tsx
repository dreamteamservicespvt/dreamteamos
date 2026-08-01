/**
 * A person, as a picture.
 *
 * One component for every place a team member appears — team lists, the leaderboard, chat, calls,
 * workload cards, the topbar — so uploading a photo once changes all of them, and so a member with
 * no photo yet looks deliberate everywhere rather than different on each screen.
 *
 * Falls back to initials on a tinted circle. `onError` matters: a Cloudinary URL that has been
 * deleted would otherwise render as a broken-image icon, which looks worse than no photo at all.
 */
import { useEffect, useState } from "react";

/** "Asha Devi" → "AD"; "Ravi" → "RA". Never more than two letters. */
export function initialsOf(name: string | undefined | null): string {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export default function MemberAvatar({
  name, avatar, size = 32, className = "", title,
}: {
  name?: string | null;
  avatar?: string | null;
  /** Pixel diameter. Sized in px rather than by class so callers can match any surrounding row. */
  size?: number;
  className?: string;
  title?: string;
}) {
  const [failed, setFailed] = useState(false);
  // A member who uploads a new photo must not keep showing the broken one they replaced.
  useEffect(() => { setFailed(false); }, [avatar]);

  const style = { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.38)) };
  const shared = `shrink-0 rounded-full object-cover ${className}`;

  if (avatar && !failed) {
    return (
      <img
        src={avatar}
        alt={name || "Team member"}
        title={title || name || undefined}
        style={style}
        onError={() => setFailed(true)}
        className={shared}
        data-test="member-avatar"
      />
    );
  }

  return (
    <span
      style={style}
      title={title || name || undefined}
      data-test="member-avatar-initials"
      className={`inline-flex items-center justify-center bg-primary/15 font-display font-bold text-primary ${shared}`}
    >
      {initialsOf(name)}
    </span>
  );
}

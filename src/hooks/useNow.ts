import { useEffect, useState } from "react";

/**
 * Returns the current time in ms, re-rendering every `intervalMs` (default 1s).
 * Used for live freeze countdowns so "X days left" ticks in real time.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

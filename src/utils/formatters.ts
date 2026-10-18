import { format } from "date-fns";

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Rupees for a chart's value axis: "₹0", "₹500", "₹1.5k", "₹2k", "₹1.2L", "₹3.4Cr".
 *
 * ── Why not `(v / 1000).toFixed(0) + "k"` ──
 * The four revenue charts used that, so a scale of 0 / 500 / 1,000 / 1,500 / 2,000 read
 * "₹0k ₹1k ₹1k ₹2k ₹2k" — two ticks with one label each (seen on the main admin's 7-day chart,
 * 2026-10-19). Under ₹1,000 the amount is written whole; above it one decimal, dropped when zero,
 * keeps neighbouring ticks of a nice scale apart while staying short enough for the axis.
 */
export function formatRupeeAxis(value: number): string {
  const v = Number(value) || 0;
  const a = Math.abs(v);
  const trim = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, "");
  if (a >= 1e7) return `₹${trim(v / 1e7)}Cr`;
  if (a >= 1e5) return `₹${trim(v / 1e5)}L`;
  if (a >= 1000) return `₹${trim(v / 1000)}k`;
  return `₹${Math.round(v)}`;
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * A moment as LOCAL `yyyy-MM-dd HH:mm` — for CSV exports a spreadsheet reads as a date and time.
 *
 * ── Why not `toISOString()` ──
 * `toISOString()` writes UTC ("2026-10-05T19:30:00.000Z"), so a login at 01:00 IST on 6 October came
 * out as the 5th at 19:30 in the session-history exports. People here read times in India time; this
 * is the browser's local time, which for the team is IST.
 */
export function formatLocalDateTime(date: Date): string {
  return format(date, "yyyy-MM-dd HH:mm");
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
}

/**
 * Human "Xd Yh Zm Ws" style duration from a millisecond span. Drops leading zero units
 * and stays compact (max 3 units). Returns "0s" for non-positive spans.
 */
export function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "0s";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins) parts.push(`${mins}m`);
  if (secs && parts.length < 2) parts.push(`${secs}s`);
  return parts.slice(0, 3).join(" ") || "0s";
}

/**
 * Normalize a phone number to E.164-ish form ("+<country code><number>").
 * Accepts any human formatting (spaces, dashes, parens, dots):
 *  - "+<cc>…" / "00<cc>…"  → kept as-is (international)
 *  - 10-digit local        → assumed Indian, "+91" prepended
 *  - "91XXXXXXXXXX" (12)   → "+91XXXXXXXXXX"
 *  - other >10-digit       → assumed to already include a country code, "+" prepended
 */
export function normalizePhone(raw: string): string {
  // Strip spaces, dashes, parens, dots
  let cleaned = raw.replace(/[\s\-().]/g, "");
  if (!cleaned) return "";

  // "00" international dialing prefix → "+"
  if (cleaned.startsWith("00")) cleaned = "+" + cleaned.slice(2);

  // Already has + → country code present; keep digits only after it
  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1).replace(/[^0-9]/g, "");
    return digits ? `+${digits}` : "";
  }

  cleaned = cleaned.replace(/[^0-9]/g, "");
  if (!cleaned) return "";

  // Remove leading 0 (trunk prefix in India)
  if (cleaned.startsWith("0")) cleaned = cleaned.slice(1);

  // Standard Indian local number
  if (cleaned.length === 10) return `+91${cleaned}`;

  // Longer than 10 digits → assume the country code was typed in (91…, 1…, 44…)
  if (cleaned.length > 10) return `+${cleaned}`;

  // Short numbers: keep legacy +91 default
  return `+91${cleaned}`;
}

/**
 * Stable Firestore doc-id for a phone number's global lock.
 * Digits-only (drops the leading "+") so the id is always a valid Firestore key.
 * e.g. "+919876543210" -> "919876543210"
 */
export function phoneLockId(raw: string): string {
  return normalizePhone(raw).replace(/[^0-9]/g, "");
}

/**
 * Format phone for display: +91 XXXXX XXXXX
 */
export function formatPhoneDisplay(phone: string): string {
  if (!phone) return "—";
  const normalized = normalizePhone(phone);
  // If Indian number +91XXXXXXXXXX
  if (normalized.startsWith("+91") && normalized.length === 13) {
    const num = normalized.slice(3);
    return `+91 ${num.slice(0, 5)} ${num.slice(5)}`;
  }
  return normalized;
}

/**
 * Get WhatsApp URL for a phone number
 */
export function getWhatsAppUrl(phone: string, text?: string): string {
  const normalized = normalizePhone(phone);
  // Remove + for WhatsApp URL
  const baseUrl = `https://wa.me/${normalized.replace("+", "")}`;
  if (text) {
    return `${baseUrl}?text=${encodeURIComponent(text)}`;
  }
  return baseUrl;
}

/**
 * Get tel: URL for calling
 */
export function getCallUrl(phone: string): string {
  return `tel:${normalizePhone(phone)}`;
}

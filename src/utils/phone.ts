/**
 * Normalize a phone number: strip spaces/dashes, ensure +91 prefix.
 * If already has a country code (starts with +), leave it.
 * Otherwise prepend +91.
 */
export function normalizePhone(raw: string): string {
  // Strip spaces, dashes, parens
  let cleaned = raw.replace(/[\s\-().]/g, "");
  if (!cleaned) return "";

  // If already has +, assume country code present
  if (cleaned.startsWith("+")) return cleaned;

  // Remove leading 0 (trunk prefix in India)
  if (cleaned.startsWith("0")) cleaned = cleaned.slice(1);

  // Remove leading 91 if it makes number > 10 digits (e.g. 919876543210)
  if (cleaned.length > 10 && cleaned.startsWith("91")) {
    cleaned = cleaned.slice(2);
  }

  return `+91${cleaned}`;
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

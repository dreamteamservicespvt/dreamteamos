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

/**
 * Default WhatsApp greeting prefilled when a sales member opens a lead's chat.
 * `wa.me?text=` only PREFILLS the message — the member can still edit before sending.
 * `clientName` personalises the greeting; `senderName` is the sales member's own name.
 */
export function buildLeadGreeting(clientName?: string | null, senderName?: string | null): string {
  const name = (clientName || "").trim() || "Sir";
  const sender = (senderName || "").trim();
  const introLine = sender
    ? `I'm ${sender} from DREAM TEAM SERVICES`
    : `I'm from DREAM TEAM SERVICES`;
  return [
    `Hi ${name},`,
    ``,
    introLine,
    `Please check our sample works once 🎬`,
    `Also, kindly share your details like logo, brochures, and posters`,
    ``,
    `Once you're free, message us — we'll call you back to discuss about your ad requirements 🚀`,
  ].join("\n");
}


/**
 * Does this stored number match what somebody typed into a search box?
 *
 * ── Why a plain `includes` is not enough ──────────────────────────────────────────────────────
 * Numbers are STORED normalised — `+919849834102`, no spaces — but nobody searches that way. They
 * paste what the client sent them, and a phone number arrives written every way there is:
 *
 *     +91 98498 34102      +91 984 98 34 102      984 98 34 102      09849834102
 *
 * Every one of those failed against the raw substring test, so a member searching for a number
 * they had literally just copied was told they had no such lead — and concluded the search was
 * broken, which it was.
 *
 * Both sides are reduced to digits and compared as a substring, so any grouping works and so does
 * a partial number. A leading zero is dropped because it is a trunk prefix, not part of the
 * number; the country code needs no special handling, since the stored digits end with the local
 * number and `includes` finds it either way.
 *
 * Returns false for a query with no digits in it at all — that is a name search, and matching it
 * against every phone number in the list would return everything.
 */
export function phoneMatchesQuery(phone: string | null | undefined, query: string): boolean {
  const wanted = (query || "").replace(/\D/g, "").replace(/^0+/, "");
  if (!wanted) return false;
  return (phone || "").replace(/\D/g, "").includes(wanted);
}

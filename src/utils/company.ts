/**
 * Company identity, in one place.
 *
 * Anything that represents the business to the outside world — payslips, invoices, agreements —
 * reads from here, so a change of address or GSTIN is a single edit rather than a hunt through
 * document templates.
 */
export const COMPANY = {
  name: "Dream Team Services",
  website: "thedreamteamservices.com",
  email: "thedreamteamservicespvt@gmail.com",
  gstin: "37FWQPR6939Q1ZY",
  /**
   * The registered address, as it should read on a letter.
   *
   * Empty until someone fills it in, and everything that prints it leaves the line out entirely
   * rather than showing a placeholder — a letterhead carrying an invented address is worse than a
   * letterhead carrying none, because only one of the two is a lie a bank might act on.
   *
   * Lines are printed in order; keep it to building, street, area, city, district, state, PIN.
   */
  address: [] as readonly string[],
  /** Printed beside the email on letters and on the back of an ID card. Blank hides it. */
  phone: "",
} as const;

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const ones = ONES[n % 10];
  return ones ? `${tens} ${ones}` : tens;
}

/**
 * Rupee amount in words, Indian numbering (lakh / crore) — required on a payslip so the figure
 * can't be altered after printing.
 */
export function amountInWords(amount: number): string {
  const rupees = Math.floor(Math.abs(amount));
  if (rupees === 0) return "Zero Rupees Only";

  const parts: string[] = [];
  const crore = Math.floor(rupees / 10_000_000);
  const lakh = Math.floor((rupees % 10_000_000) / 100_000);
  const thousand = Math.floor((rupees % 100_000) / 1_000);
  const hundred = Math.floor((rupees % 1_000) / 100);
  const rest = rupees % 100;

  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigits(rest));

  return `${parts.join(" ")} Rupees Only`;
}

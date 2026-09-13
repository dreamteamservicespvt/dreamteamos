export const PRICING: Record<string, Record<string, number>> = {
  // The Promotional prices, because Wishes sells the Promotional packages. The retired `20s` and
  // `40s` are deliberately NOT priced here: an assignment carries its own saved price, and a `40s`
  // key would collide with a genuine 5-clip custom job (durationForClips(5) is "40s") and price it
  // at ₹999 instead of five clips' worth. Old sales resolve through LEGACY_PACKAGE_DURATIONS.
  wishes: { "16s": 499, "32s": 999, "48s": 1499, "64s": 1999 },
  promotional: { "16s": 499, "32s": 999, "48s": 1499, "64s": 1999 },
  cinematic: { "16s": 999, "32s": 1999, "48s": 2999, "64s": 3999 },
  logo: { standard: 499, premium: 999 },
  google_listing: { setup: 999 },
};

export function calculateRevenue(items: { type: string; duration: string; quantity: number; adminApprovedPrice?: number | null }[]) {
  const totalVideos = items.reduce((sum, i) => sum + i.quantity, 0);
  const discountRate = totalVideos >= 20 ? 0.3 : totalVideos >= 10 ? 0.2 : totalVideos >= 5 ? 0.1 : 0;

  const baseRevenue = items.reduce((sum, item) => {
    const price = PRICING[item.type]?.[item.duration] ?? item.adminApprovedPrice ?? 0;
    return sum + price * item.quantity;
  }, 0);

  return Math.round(baseRevenue * (1 - discountRate));
}

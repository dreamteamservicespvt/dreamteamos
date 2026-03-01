export const PRICING: Record<string, Record<string, number>> = {
  wishes: { "20s": 499, "40s": 999 },
  promotional: { "15s": 499, "30s": 999, "45s": 1499, "60s": 1999 },
  cinematic: { "15s": 999, "30s": 1999, "45s": 2999, "60s": 3999 },
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

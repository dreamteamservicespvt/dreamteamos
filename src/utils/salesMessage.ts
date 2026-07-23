/**
 * The order-confirmation the sales member sends the *client* on WhatsApp.
 *
 * This is the customer-facing twin of the tech team's "NEW AD ASSIGNMENT" message: same facts,
 * different audience. It confirms back to the client exactly what they bought and what to expect,
 * so nothing is lost between the call and the delivery. No prices of the tech side, no internal
 * IDs — just the client's own order.
 */
import { categoryLabel } from "@/utils/serviceCatalog";
import { attireLabel } from "@/utils/adRequirement";
import { formatCurrency } from "@/utils/formatters";
import type { Lead, SaleDetail } from "@/types";

export function buildClientSaleMessage(lead: Lead, item: SaleDetail): string {
  const businessName = item.requirement?.businessName || lead.realName || lead.displayName || "";
  const r = item.requirement;
  const isAd = !!r;

  const lines: (string | null)[] = [
    `🙏 *Thank you for choosing Dream Team Services!* 🎬`,
    ``,
    `Here's a quick confirmation of your order:`,
    ``,
    businessName ? `🏢 *Business:* ${businessName}` : null,
    `🎯 *Service:* ${categoryLabel(item.category)}`,
    item.packageKey && item.packageKey !== "custom" ? `📦 *Package:* ${item.packageKey}` : null,
    item.amount ? `💰 *Amount:* ${formatCurrency(item.amount)}` : null,
  ];

  if (isAd && r) {
    lines.push(
      ``,
      `📋 *Your ad details*`,
      r.modelGender ? `👤 *Model:* ${r.modelGender === "male" ? "Male" : "Female"}` : null,
      r.attireType ? `👔 *Attire:* ${attireLabel(r.attireType, r.customAttire)}` : null,
      r.aspectRatio ? `📐 *Format:* ${r.aspectRatio === "9:16" ? "Reel / Story (9:16)" : "Landscape (16:9)"}` : null,
      r.language ? `🗣️ *Language:* ${r.language}` : null,
      r.notes ? `📝 *Your notes:* ${r.notes}` : null,
    );
  }

  if (item.promise?.label) {
    lines.push(``, `⏱️ *Delivery:* within ${item.promise.label}`);
  }

  lines.push(
    ``,
    `We'll get started right away and share your ad soon. 🚀`,
    `For anything at all, just reply here. 💬`,
  );

  return lines.filter((l): l is string => l !== null).join("\n");
}

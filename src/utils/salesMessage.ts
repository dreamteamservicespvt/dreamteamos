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
import { getCharacterPack, packHighlight } from "@/services/characterPacks";
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
    // A special-category ad has no human model, so the client is told who IS in their ad and
    // whether we are using their own photos — telling them "Model: Female" would describe someone
    // who never appears, and it is the client's own confirmation.
    const pack = getCharacterPack(r.specialCategory);
    lines.push(
      ``,
      `📋 *Your ad details*`,
      // Highlighted for the client too — this is the part of the order they are excited about,
      // and it is what makes the confirmation feel like the ad they actually bought.
      pack ? `🎭 *Starring:* ${packHighlight(pack)} 🎭` : null,
      // True of a duo and false of the twenty-three single-speaker entries. A confirmation that
      // promises the client two characters in a one-deity ad is a promise the ad cannot keep.
      pack ? (pack.characters.length > 1
        ? `   ✨ Both characters speak in every clip`
        : `   ✨ ${pack.characters[0].name} presents your business throughout`) : null,
      pack ? (r.realLocationProvided
        ? `📷 *Setting:* your own business background, from the photos you send us`
        : `🏙️ *Setting:* a custom AI background built for your business`) : null,
      !pack && r.modelGender ? `👤 *Model:* ${r.modelGender === "male" ? "Male" : "Female"}` : null,
      !pack && r.attireType ? `👔 *Attire:* ${attireLabel(r.attireType, r.customAttire)}` : null,
      r.aspectRatio ? `📐 *Format:* ${r.aspectRatio === "9:16" ? "Reel / Story (9:16)" : "Landscape (16:9)"}` : null,
      r.language ? `🗣️ *Language:* ${r.language}` : null,
      r.notes ? `📝 *Your notes:* ${r.notes}` : null,
    );
    // The one thing the client has to DO. Without it the job stalls and nobody knows why.
    if (pack && r.realLocationProvided) {
      lines.push(
        ``,
        `📸 *One small thing:* please send us photos of your shop / office — inside, outside, counter, product area. The more angles you send, the better your ad looks.`,
      );
    }
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

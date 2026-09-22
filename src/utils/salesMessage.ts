/**
 * The order-confirmation the sales member sends the *client* on WhatsApp.
 *
 * This is the customer-facing twin of the tech team's "NEW AD ASSIGNMENT" message: same facts,
 * different audience. It confirms back to the client exactly what they bought and what to expect,
 * so nothing is lost between the call and the delivery. No prices of the tech side, no internal
 * IDs — just the client's own order.
 *
 * ── What is deliberately NOT in here ─────────────────────────────────────────────────────────
 * `requirement.notes` is the sales member's aside to the tech team — "client is difficult about
 * the logo", "check the spelling on the board" — and it used to be printed to the client as "Your
 * notes". The brief now has a second box, `businessInfo`, which is the client-facing one: what the
 * business does and what the ad must carry. That is what appears below. The two were one field for
 * as long as the message had nowhere else to put an offer, and the price of that was a production
 * note going out in the customer's own receipt.
 */
import { categoryLabel } from "@/utils/serviceCatalog";
import { packagePlatforms } from "@/utils/serviceCatalog";
import { attireLabel } from "@/utils/adRequirement";
import { getCharacterPack, packHighlight } from "@/services/characterPacks";
import { formatCurrency } from "@/utils/formatters";
import { formatPhoneDisplay } from "@/utils/phone";
import type { Lead, SaleDetail } from "@/types";

/**
 * The condition the 24 hours is actually given under, in the client's own message.
 *
 * The promise was being read as unconditional, because in the confirmation it WAS unconditional —
 * and then a client who sat on their business details for two days, or left the script unread
 * overnight, was told about a deadline they had themselves moved. Saying it here, at the moment
 * they are pleased and reading carefully, is the only place it lands. It is also the wording the
 * one extension on the tech side is measured against — see `utils/promiseSla.extendPromise`.
 */
export const DELIVERY_CAVEAT =
  "_(this is only applied when you confirm your business details before the work begin and you " +
  "respond very quickly when we send you the script for the confirmation — we are not responsible)_";

/** How the ad's setting is described to the client, in their words rather than ours. */
function backgroundLine(realLocationProvided: boolean): string {
  return realLocationProvided
    ? `🏞️ *Background:* your own business background, from the photos you send us`
    : `🏙️ *Background:* a custom AI background built for your business`;
}

export function buildClientSaleMessage(lead: Lead, item: SaleDetail): string {
  const businessName = item.requirement?.businessName || lead.realName || lead.displayName || "";
  const r = item.requirement;
  const isAd = !!r;

  // The number the work is actually about. It falls back to the lead's own phone because that is
  // what the sale form pre-fills it with, and a confirmation that names no number is one the
  // client cannot check against the shop they meant.
  const contact = r?.businessWhatsapp?.trim() || lead.phone || "";
  const platforms = packagePlatforms(item.category, item.packageKey);

  const lines: (string | null)[] = [
    `🙏 *Thank you for choosing Dream Team Services!* 🎬`,
    ``,
    `Here's a quick confirmation of your order:`,
    ``,
    businessName ? `🏢 *Business:* ${businessName}` : null,
    contact ? `📞 *Contact:* ${formatPhoneDisplay(contact)}` : null,
    r?.businessAddress?.trim() ? `📍 *Address:* ${r.businessAddress.trim()}` : null,
    `🎯 *Service:* ${categoryLabel(item.category)}`,
    item.packageKey && item.packageKey !== "custom" ? `📦 *Package:* ${item.packageKey}` : null,
    // Only a social-media month carries these, and it is the fact clients most often remember
    // wrongly — "you said YouTube was included" on a Starter package.
    platforms.length ? `📱 *Platforms:* ${platforms.join(" + ")}` : null,
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
      !pack && r.modelGender ? `👤 *Model:* ${r.modelGender === "male" ? "Male" : "Female"}` : null,
      !pack && r.attireType ? `👔 *Attire:* ${attireLabel(r.attireType, r.customAttire)}` : null,
      // On EVERY ad now, not only a cartoon one. The client is buying either their own premises or
      // a built set, at the same price, and which one it is used to be invisible to them.
      backgroundLine(r.realLocationProvided === true),
      r.aspectRatio ? `📐 *Format:* ${r.aspectRatio === "9:16" ? "Reel / Story (9:16)" : "Landscape (16:9)"}` : null,
      r.language ? `🗣️ *Language:* ${r.language}` : null,
    );

    // The one thing the client has to DO. Without it the job stalls and nobody knows why — and it
    // is now asked of every ad shot in the client's own premises, not just a cartoon one.
    if (r.realLocationProvided) {
      lines.push(
        ``,
        `📸 *One small thing:* please send us photos of your shop / office — inside, outside, counter, product area. The more angles you send, the better your ad looks.`,
      );
    }
    if (pack?.usesClientFace) {
      lines.push(
        `🙂 *And one clear photo of the owner's face* — straight on and well lit. This exact face appears in every clip.`,
      );
    }
    // A custom character is the client's own idea — read it back so they can correct it now.
    if (pack?.family === "custom" && r.customCharacter?.trim()) {
      lines.push(``, `🎭 *Your character:* ${r.customCharacter.trim()}`);
    }
  }

  // What the client told us about their business and what they want the ad to carry — the offer,
  // the tagline, the line they insist on. Read back so they can correct it now rather than after
  // the ad is made, which is the whole reason the delivery promise is conditional on it.
  if (r?.businessInfo?.trim()) {
    lines.push(``, `ℹ️ *About your business & what we'll include*`, r.businessInfo.trim());
  }

  if (item.promise?.label) {
    lines.push(``, `⏱️ *Delivery:* within ${item.promise.label}`, DELIVERY_CAVEAT);
  }

  lines.push(
    ``,
    `We'll get started right away and share your ad soon. 🚀`,
    `For anything at all, just reply here. 💬`,
  );

  return lines.filter((l): l is string => l !== null).join("\n");
}

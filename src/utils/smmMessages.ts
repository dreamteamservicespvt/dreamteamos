/**
 * What we say to a social-media client, and where the words come from.
 *
 * ── Why the defaults live in code ─────────────────────────────────────────────────────────────
 * A template library that starts empty is a template library nobody uses: the first person to need
 * a daily ad report writes one from scratch on their phone, badly, and so does the second. So every
 * message this section sends has a built-in version here, already filled in with the campaign's own
 * numbers, and a saved template in `smm_templates` simply overrides it. Day one works; day thirty,
 * when the team has agreed on better wording, works the same way.
 *
 * ── Why the placeholders are tiny and named ───────────────────────────────────────────────────
 * The people editing these are sales members on a phone, not developers. `{client}` and `{leads}`
 * are legible; anything with dots or brackets in it gets mangled the first time somebody pastes it
 * through WhatsApp. An unknown placeholder is left exactly as typed rather than blanked, so a typo
 * is visible in the preview instead of silently deleting a line.
 */

import { formatCurrency } from "@/utils/formatters";
import {
  adTotals, allAdReports, budgetLedger, clientWaitSummary, extraWork, fulfilment, postLinks,
  postsByPlatform,
} from "@/utils/smmPlan";
import { SMM_CONTENT_KINDS, SMM_PLATFORMS } from "@/types/smm";
import type { SmmAdDayReport, SmmAdRun, SmmCampaign, SmmContentItem, SmmTemplateKind } from "@/types/smm";

/** `{token}` → value. Anything not supplied is left in place, so a typo shows rather than hides. */
export function renderTemplate(body: string, tokens: Record<string, string | number>): string {
  return body.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = tokens[key];
    return value === undefined || value === null ? whole : String(value);
  });
}

/** The placeholders offered when editing a template of each kind — the editor's own cheat sheet. */
export const TEMPLATE_TOKENS: Record<SmmTemplateKind, string[]> = {
  approval_request: ["client", "business", "title", "kind", "date", "time", "platforms"],
  daily_report: ["client", "business", "date", "leads", "spend", "cpr", "reach", "campaign"],
  monthly_report: ["client", "business", "month", "posted", "committed", "leads", "spend", "cpr", "extra", "waitDays"],
  renewal: ["client", "business", "month", "posted", "committed", "leads", "spend", "cpr"],
  extra_work: ["client", "business", "title", "kind", "amount"],
  reminder: ["client", "business", "title", "kind", "days"],
  posting_update: ["client", "business", "title", "kind", "date", "time", "platforms", "links"],
  custom: ["client", "business", "month"],
};

const dateLabel = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[Number(m) - 1] || m} ${y}`;
};

const monthLabel = (ym: string): string => {
  const [y, m] = (ym || "").split("-");
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[Number(m) - 1] || m} ${y}`;
};

const kindLabel = (kind: string): string =>
  SMM_CONTENT_KINDS.find((k) => k.key === kind)?.singular || kind;

const platformLabels = (keys: string[]): string =>
  keys.map((k) => SMM_PLATFORMS.find((p) => p.key === k)?.label || k).join(", ") || "—";

/* ── The built-in messages ──────────────────────────────────────────────────────────────────── */

export const DEFAULT_TEMPLATES: Record<SmmTemplateKind, string> = {
  approval_request:
    "Hello {client}, 🙏\n\n" +
    "Here is the {kind} we have prepared for {business} — *{title}*.\n" +
    "Planned to go live on {date} at {time} on {platforms}.\n\n" +
    "Please have a look and confirm. We post only after your approval, so a quick yes helps us keep your schedule on time. 🙂",

  daily_report:
    "📊 *{business} — Ad report for {date}*\n\n" +
    "• Leads / results: *{leads}*\n" +
    "• Amount spent: *{spend}*\n" +
    "• Cost per result: *{cpr}*\n" +
    "• Reach: {reach}\n\n" +
    "We are monitoring the campaign daily and optimising it. Any questions, just reply here.",

  monthly_report:
    "📅 *{business} — {month} report*\n\n" +
    "*Content delivered:* {posted} of {committed} committed posts\n" +
    "{breakdown}\n\n" +
    "*Advertising:* {leads} leads from {spend} spent (cost per result {cpr})\n" +
    "{extraLine}" +
    "{waitLine}" +
    "\nThank you for working with us this month. Happy to go over any of this on a call. 🙏",

  renewal:
    "Hello {client}, 🙏\n\n" +
    "Your social media package for {business} finishes on {endDate}.\n\n" +
    "This month we delivered *{posted} of {committed}* committed posts and your ads brought *{leads} leads* for {spend} spent.\n\n" +
    "Shall we continue with the next month? We can keep the same plan, or adjust it to what worked best this month.",

  extra_work:
    "Hello {client}, 🙏\n\n" +
    "We have completed an additional {kind} for {business} — *{title}* — outside your committed package for this month.\n\n" +
    "{chargeLine}",

  reminder:
    "Hello {client}, 🙏\n\n" +
    "Just a gentle reminder about the {kind} for {business} — *{title}*. We are waiting on your approval to schedule it ({days} days now), and we would not want your posting schedule to slip.\n\n" +
    "A simple yes is enough and we will take it from there. 🙂",

  /**
   * Sent to the group the moment something goes live, not to the client.
   *
   * Short on purpose: it is read on a phone by people who want to know one thing — is it up, and
   * where. The links carry an account name each, because "here is the link" is useless when the
   * post went on two accounts and only one link arrived.
   */
  posting_update:
    "✅ *Posted — {business}*\n\n" +
    "{kind}: *{title}*\n" +
    "Live on {platforms} · {date}{time}\n\n" +
    "{links}",

  custom: "Hello {client},\n\n",
};

/* ── Builders: campaign + context → a ready message ─────────────────────────────────────────── */

function baseTokens(campaign: SmmCampaign): Record<string, string | number> {
  return {
    client: campaign.clientName || campaign.businessName || "there",
    business: campaign.businessName || campaign.clientName || "your business",
    month: monthLabel(campaign.cycle?.month || ""),
    endDate: dateLabel(campaign.cycle?.endDate),
  };
}

/** "Please approve this before we schedule it." */
export function approvalRequestMessage(
  campaign: SmmCampaign,
  item: SmmContentItem,
  body = DEFAULT_TEMPLATES.approval_request,
): string {
  return renderTemplate(body, {
    ...baseTokens(campaign),
    title: item.title?.trim() || `${kindLabel(item.kind)} (untitled)`,
    kind: kindLabel(item.kind).toLowerCase(),
    date: dateLabel(item.uploadDate),
    time: item.uploadTime || "the scheduled time",
    platforms: platformLabels(item.platforms || []),
  });
}

/** One day of one ad run, as the client is told it. */
export function dailyAdReportMessage(
  campaign: SmmCampaign,
  run: SmmAdRun,
  report: SmmAdDayReport,
  body = DEFAULT_TEMPLATES.daily_report,
): string {
  return renderTemplate(body, {
    ...baseTokens(campaign),
    date: dateLabel(report.date),
    leads: report.leads,
    spend: formatCurrency(report.spend),
    cpr: formatCurrency(report.costPerResult),
    reach: report.reach ? report.reach.toLocaleString("en-IN") : "—",
    campaign: run.name || "your campaign",
  });
}

/**
 * The month, written out.
 *
 * The days-waiting line is included whenever there were any, for every client — not held back for
 * the ones who complain. A number that only turns up during an argument reads as an excuse; the
 * same number sent every month, cheerfully, is simply the record.
 */
export function monthlyReportMessage(
  campaign: SmmCampaign,
  body = DEFAULT_TEMPLATES.monthly_report,
): string {
  const f = fulfilment(campaign);
  const ads = adTotals(allAdReports(campaign));
  const extra = extraWork(campaign.items);
  const wait = clientWaitSummary(campaign.items);

  const breakdown = f.byKind
    .filter((k) => k.committed > 0 || k.posted > 0)
    .map((k) => `• ${SMM_CONTENT_KINDS.find((c) => c.key === k.kind)?.label}: ${k.posted} of ${k.committed}`)
    .join("\n");

  const platforms = postsByPlatform(campaign.items);
  const platformLine = platforms.length
    ? `\n\n*Where they went:* ${platforms.map((p) => `${p.label} (${p.count})`).join(", ")}`
    : "";

  const extraLine = extra.items.length
    ? `\n*Extra work this month:* ${extra.items.length} item${extra.items.length === 1 ? "" : "s"}` +
      (extra.freeCount > 0 ? ` (${extra.freeCount} at no charge)` : "") + "\n"
    : "";

  const waitLine = wait.totalDays > 0
    ? `\n_Note: ${wait.totalDays} day${wait.totalDays === 1 ? "" : "s"} were spent waiting for approvals this month. ` +
      `Faster approvals mean we can post right on schedule._\n`
    : "";

  return renderTemplate(body, {
    ...baseTokens(campaign),
    posted: f.posted,
    committed: f.committed,
    breakdown: breakdown + platformLine,
    leads: ads.leads,
    spend: formatCurrency(ads.spend),
    cpr: formatCurrency(ads.costPerResult),
    extra: extra.items.length,
    waitDays: wait.totalDays,
    extraLine,
    waitLine,
  });
}

/** The renewal ask, which is really just the month's results with a question at the end. */
export function renewalMessage(campaign: SmmCampaign, body = DEFAULT_TEMPLATES.renewal): string {
  const f = fulfilment(campaign);
  const ads = adTotals(allAdReports(campaign));
  return renderTemplate(body, {
    ...baseTokens(campaign),
    posted: f.posted,
    committed: f.committed,
    leads: ads.leads,
    spend: formatCurrency(ads.spend),
    cpr: formatCurrency(ads.costPerResult),
  });
}

/** Telling the client about work done outside the package — billed, or given. */
export function extraWorkMessage(
  campaign: SmmCampaign,
  item: SmmContentItem,
  body = DEFAULT_TEMPLATES.extra_work,
): string {
  const chargeLine = item.extraCharge === "free"
    ? "There is no charge for this one — it is on us for this month. 🙂"
    : item.extraAmount
      ? `The charge for this additional work is *${formatCurrency(item.extraAmount)}*.`
      : "We will confirm the charge for this additional work shortly.";
  return renderTemplate(body, {
    ...baseTokens(campaign),
    title: item.title?.trim() || kindLabel(item.kind),
    kind: kindLabel(item.kind).toLowerCase(),
    amount: item.extraAmount ? formatCurrency(item.extraAmount) : "—",
    chargeLine,
  });
}

/**
 * "It's up — here it is."
 *
 * Sent to the group the moment something goes live, with a link per account. This is the message
 * the team was writing out by hand every time, which is why half of them went out with one link
 * when the post was on two accounts. The links come from the item itself, so it cannot list an
 * account nobody actually posted to.
 */
export function postingUpdateMessage(
  campaign: SmmCampaign,
  item: SmmContentItem,
  body = DEFAULT_TEMPLATES.posting_update,
): string {
  const links = postLinks(item);
  return renderTemplate(body, {
    ...baseTokens(campaign),
    title: item.title?.trim() || kindLabel(item.kind),
    kind: kindLabel(item.kind),
    date: dateLabel(item.uploadDate),
    time: item.uploadTime ? ` ${item.uploadTime}` : "",
    // The accounts it actually went live on, which is not always every account it was planned for.
    platforms: links.length ? links.map((l) => l.label).join(" + ") : platformLabels(item.platforms || []),
    links: links.length
      ? links.map((l) => `${l.label}: ${l.url}`).join("\n")
      : "_Links to follow._",
  });
}

/** The follow-up on an approval that has gone quiet. */
export function approvalChaseMessage(
  campaign: SmmCampaign,
  item: SmmContentItem,
  days: number,
  body = DEFAULT_TEMPLATES.reminder,
): string {
  return renderTemplate(body, {
    ...baseTokens(campaign),
    title: item.title?.trim() || kindLabel(item.kind),
    kind: kindLabel(item.kind).toLowerCase(),
    days,
  });
}

/**
 * The internal line the seller is shown when their ad money is about to run out.
 *
 * Deliberately not a client template: this one is a request for money, and the wording of that is
 * the seller's own judgement about a relationship they have and the app does not.
 */
export function budgetTopUpMessage(campaign: SmmCampaign, today: string): string {
  const ledger = budgetLedger(campaign, today);
  return (
    `Hello ${campaign.clientName || "there"}, 🙏\n\n` +
    `A quick note on the ad budget for ${campaign.businessName}. ` +
    `${formatCurrency(Math.max(0, ledger.balance))} is left with us and tomorrow's campaigns need ` +
    `${formatCurrency(ledger.nextDayNeed)}.\n\n` +
    `Could you top it up today so the ads keep running without a break? Thank you!`
  );
}

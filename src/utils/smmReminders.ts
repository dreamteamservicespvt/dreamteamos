/**
 * What somebody needs to be told about their social-media months today.
 *
 * ── Why reminders are computed rather than scheduled ──────────────────────────────────────────
 * There is no cron on this stack and there never was — the deadline sweep for ordinary orders
 * works the same way (`services/orders.notifyDueOrdersOnOpen`): the app works out what is due when
 * somebody opens it. That is a real constraint, and it shapes where the reminders surface. A tech
 * member is guaranteed to look at exactly two screens every working day — the check-in prompt and
 * the check-out modal — so that is where the month's due work is put in front of them, rather than
 * on a dashboard they may not open.
 *
 * Pure: campaigns in, a list out. The same list drives the popup, the push and the badge.
 */

import {
  clientWaitSummary, budgetLedger, daysLeftInCycle, daysUntilDue, isPosted, isWaitingOnClient,
  itemOwners, approvalWaitDays,
} from "@/utils/smmPlan";
import type { SmmCampaign, SmmContentItem } from "@/types/smm";

/** Three days' notice: long enough to make something, short enough to still be this week's problem. */
export const SMM_REMINDER_DAYS = 3;

/** How long an unanswered approval sits before the seller is asked to chase it. */
export const SMM_APPROVAL_CHASE_DAYS = 2;

/** How early the renewal conversation starts. A month is won back before it ends, not after. */
export const SMM_RENEWAL_NOTICE_DAYS = 5;

export interface SmmDueItem {
  campaignId: string;
  businessName: string;
  clientName: string;
  item: SmmContentItem;
  /** Negative when late, 0 today, positive when still ahead. */
  daysUntil: number;
  overdue: boolean;
}

/**
 * The content this person owes in the next few days, soonest first.
 *
 * Both the maker and the publisher are reminded: one of them has to build it and the other has to
 * put it up, and on a split month they are different people with different halves of the same
 * deadline. An item nobody is assigned to is nobody's reminder — it shows on the campaign instead,
 * where the leader can see it has no owner.
 */
export function dueItemsFor(
  campaigns: SmmCampaign[],
  uid: string,
  today: string,
  withinDays = SMM_REMINDER_DAYS,
): SmmDueItem[] {
  const out: SmmDueItem[] = [];
  for (const campaign of campaigns) {
    if (campaign.status !== "active") continue;
    for (const item of campaign.items) {
      if (isPosted(item)) continue;
      if (!itemOwners(item).includes(uid)) continue;
      const daysUntil = daysUntilDue(item, today);
      if (daysUntil === null) continue;
      if (daysUntil > withinDays) continue;
      out.push({
        campaignId: campaign.id,
        businessName: campaign.businessName,
        clientName: campaign.clientName,
        item,
        daysUntil,
        overdue: daysUntil < 0,
      });
    }
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil);
}

/** Everything of mine that is already late. The subset worth colouring red. */
export function overdueItemsFor(campaigns: SmmCampaign[], uid: string, today: string): SmmDueItem[] {
  return dueItemsFor(campaigns, uid, today).filter((d) => d.overdue);
}

export interface SmmApprovalChaseDue {
  campaignId: string;
  businessName: string;
  clientName: string;
  clientPhone: string;
  item: SmmContentItem;
  waitingDays: number;
  /** How many times somebody has already followed up. */
  chases: number;
}

/**
 * Approvals the client has been sitting on, for whoever has to ring them.
 *
 * Addressed to the SELLER, not to the tech member who made the thing. The seller is the person the
 * client knows and answers to, and asking a tech member to chase a customer they have never spoken
 * to is how a chase does not happen. The tech side sees the same wait on the campaign; they just
 * are not the ones nudged about it.
 */
export function approvalChasesFor(
  campaigns: SmmCampaign[],
  uid: string,
  now = Date.now(),
  afterDays = SMM_APPROVAL_CHASE_DAYS,
): SmmApprovalChaseDue[] {
  const out: SmmApprovalChaseDue[] = [];
  for (const campaign of campaigns) {
    if (campaign.status !== "active") continue;
    if (campaign.soldBy !== uid) continue;
    for (const item of campaign.items) {
      if (!isWaitingOnClient(item)) continue;
      const waitingDays = approvalWaitDays(item.approval, now);
      if (waitingDays < afterDays) continue;
      out.push({
        campaignId: campaign.id,
        businessName: campaign.businessName,
        clientName: campaign.clientName,
        clientPhone: campaign.clientPhone,
        item,
        waitingDays,
        chases: item.approval?.chases?.length || 0,
      });
    }
  }
  return out.sort((a, b) => b.waitingDays - a.waitingDays);
}

export interface SmmBudgetAlert {
  campaignId: string;
  businessName: string;
  clientName: string;
  clientPhone: string;
  balance: number;
  nextDayNeed: number;
}

/**
 * Campaigns whose ad money will not cover tomorrow.
 *
 * The seller is told, because the client's money is the seller's conversation — and because an ad
 * that stops at midnight for want of ₹500 is the kind of failure a client remembers longer than the
 * work that was fine.
 */
export function budgetAlertsFor(campaigns: SmmCampaign[], uid: string, today: string): SmmBudgetAlert[] {
  const out: SmmBudgetAlert[] = [];
  for (const campaign of campaigns) {
    if (campaign.status !== "active") continue;
    if (campaign.soldBy !== uid) continue;
    const ledger = budgetLedger(campaign, today);
    if (!ledger.short) continue;
    out.push({
      campaignId: campaign.id,
      businessName: campaign.businessName,
      clientName: campaign.clientName,
      clientPhone: campaign.clientPhone,
      balance: ledger.balance,
      nextDayNeed: ledger.nextDayNeed,
    });
  }
  return out;
}

export interface SmmRenewalDue {
  campaignId: string;
  businessName: string;
  clientName: string;
  clientPhone: string;
  daysLeft: number;
  postedOfCommitted: string;
}

/**
 * Months about to run out that nobody has pitched yet.
 *
 * Five days, because a renewal is a conversation and not a button — and because the pitch that
 * works is "here is what we did for you", which needs the month to be nearly finished before it
 * can be made.
 */
export function renewalsDueFor(
  campaigns: SmmCampaign[],
  uid: string,
  today: string,
  withinDays = SMM_RENEWAL_NOTICE_DAYS,
): SmmRenewalDue[] {
  const out: SmmRenewalDue[] = [];
  for (const campaign of campaigns) {
    if (campaign.soldBy !== uid) continue;
    if (campaign.status === "renewed") continue;
    if (campaign.renewal?.state === "won" || campaign.renewal?.state === "lost") continue;
    const daysLeft = daysLeftInCycle(campaign.cycle, today);
    if (daysLeft > withinDays) continue;
    const posted = campaign.items.filter((i) => !i.extra && isPosted(i)).length;
    const committed = Object.values(campaign.commitments || {}).reduce((n, v) => n + (v || 0), 0);
    out.push({
      campaignId: campaign.id,
      businessName: campaign.businessName,
      clientName: campaign.clientName,
      clientPhone: campaign.clientPhone,
      daysLeft,
      postedOfCommitted: `${posted}/${committed}`,
    });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

export interface SmmReminders {
  due: SmmDueItem[];
  overdue: SmmDueItem[];
  chases: SmmApprovalChaseDue[];
  budget: SmmBudgetAlert[];
  renewals: SmmRenewalDue[];
  /** Nothing at all to say. Lets a caller skip rendering an empty panel without five checks. */
  empty: boolean;
}

/** Everything this person needs to know today, in one pass over their campaigns. */
export function remindersFor(
  campaigns: SmmCampaign[],
  uid: string,
  today: string,
  now = Date.now(),
): SmmReminders {
  const due = dueItemsFor(campaigns, uid, today);
  const chases = approvalChasesFor(campaigns, uid, now);
  const budget = budgetAlertsFor(campaigns, uid, today);
  const renewals = renewalsDueFor(campaigns, uid, today);
  return {
    due,
    overdue: due.filter((d) => d.overdue),
    chases,
    budget,
    renewals,
    empty: due.length === 0 && chases.length === 0 && budget.length === 0 && renewals.length === 0,
  };
}

/**
 * The key that makes a push notification about one due item fire once, not once per app open.
 *
 * Built from the item and the day it was sent for — never from the clock — so opening the app six
 * times on Tuesday is one alert, and the item genuinely becoming due tomorrow is a new one. Same
 * contract as every other `dedupeKey` in the app; see services/notifications.
 */
export function dueNotificationKey(itemId: string, recipient: string, day: string): string {
  return `smm_due_${itemId}_${recipient}_${day}`;
}

/** "Poster · Dussehra offer — due tomorrow" — the line a notification and a list row both use. */
export function dueLabel(due: SmmDueItem): string {
  const when = due.daysUntil < 0
    ? `${Math.abs(due.daysUntil)} day${Math.abs(due.daysUntil) === 1 ? "" : "s"} late`
    : due.daysUntil === 0 ? "due today"
    : due.daysUntil === 1 ? "due tomorrow"
    : `due in ${due.daysUntil} days`;
  const title = due.item.title?.trim() || "Untitled";
  return `${title} — ${when}`;
}

/** A one-line summary of a whole client's waiting, for the campaign card. */
export function waitLine(campaign: SmmCampaign, now = Date.now()): string {
  const w = clientWaitSummary(campaign.items, now);
  if (w.openCount === 0) return "";
  return `${w.openCount} waiting on client${w.worstDays > 0 ? ` · longest ${w.worstDays}d` : ""}`;
}

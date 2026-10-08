/**
 * Editing a sale that already exists — what changed, whose change wins, what cannot change once the
 * tech side has started, and what reaches the job (2026-10-08).
 *
 * ── The owner's rules this file holds ─────────────────────────────────────────────────────────
 * An edit updates the SAME sale (its `saleId`) and never makes a second one. A sale the tech team is
 * already working on can still be edited — the client rings the salesperson, not the tech team — and
 * the edit keeps the assignment, reaches the job, and is told to the tech admin, the team leader and
 * the member holding the job. Until now an assigned sale could not be edited at all (the seller sent
 * an "update note" and somebody re-typed it into the job by hand).
 *
 * ── Why a three-way merge ──────────────────────────────────────────────────────────────────────
 * The edit form is opened on a copy of the sale and saved minutes later. In between, the sales admin
 * may have approved it, or the member collected the balance from the client. Saving the form's whole
 * copy back wrote the OLD approval and the OLD payment list over the new ones. So only what the form
 * itself changed (its opening copy → its saved copy) is laid onto the sale as it is NOW.
 *
 * Pure: no Firestore, no React. Tested in `src/test/saleEdit.test.ts`.
 */
import { categoryLabel, effectiveAdCategory, isAdCategory, isBulkCategory } from "@/utils/serviceCatalog";
import { discountSummary } from "@/utils/bulkDiscount";
import { formatCurrency } from "@/utils/formatters";
import { assignmentFormFromOrder, attireLabel, resolveModelSpec } from "@/utils/adRequirement";
import { getClipCount } from "@/utils/assignmentDuration";
import { isPosterCategory } from "@/utils/posterSpec";
import { normalizePhone } from "@/utils/phone";
import { timestampMs } from "@/utils/saleIdentity";
import { getCharacterPack } from "@/services/characterPacks";
import type { Order, SaleDetail, WorkAssignment } from "@/types";

/* ── What changed ──────────────────────────────────────────────────────────────────────────── */

/** One line of a sale's edit log. `money` lines are kept from the tech members and team leaders. */
export interface SaleChange {
  text: string;
  /** Price, discount or payment — the tech admin sees these; members and team leaders never do. */
  money: boolean;
}

const humanSeconds = (s?: number | null) => {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m} min${r ? ` ${r} sec` : ""}` : `${r} sec`;
};

/**
 * Every change between two versions of a sale, in the words the edit log and the tech side read.
 *
 * Moved here from `SaleForm` (2026-10-08) so the sales service, the notifications and the tests use
 * the same list. Three things it never noticed are now named, because an edit with "no changes" is
 * thrown away: the advance collected and the payment screenshot (a member fixing the advance had the
 * edit silently dropped), a Custom sale's real service and length, and a social-media month's video
 * length.
 */
export function saleChangeList(prev: SaleDetail, next: SaleDetail): SaleChange[] {
  const out: SaleChange[] = [];
  const add = (text: string, money = false) => out.push({ text, money });
  const pkg = (i: SaleDetail) => (i.packageKey && i.packageKey !== "custom" ? i.packageKey : "Custom");
  if (prev.category !== next.category) add(`Service: ${categoryLabel(prev.category)} → ${categoryLabel(next.category)}`);
  // The kind of video is what the tech team builds, so switching it is a bigger change than the
  // package and has to be named — a bulk order that turned cinematic costs twice as much to make.
  if (isBulkCategory(next.category) && effectiveAdCategory(prev.category, prev.bulkAdType) !== effectiveAdCategory(next.category, next.bulkAdType)) {
    add(`Video type: ${categoryLabel(effectiveAdCategory(prev.category, prev.bulkAdType))} → ${categoryLabel(effectiveAdCategory(next.category, next.bulkAdType))}`);
  }
  if (pkg(prev) !== pkg(next)) add(`Package: ${pkg(prev)} → ${pkg(next)}`);
  if ((prev.customDescription || "") !== (next.customDescription || "")) {
    add(`Description: ${prev.customDescription || "—"} → ${next.customDescription || "—"}`);
  }
  // A Custom sale's real service and length are what the tech side derives the job from.
  if ((prev.customBaseCategory || "") !== (next.customBaseCategory || "")) {
    add(`Custom service: ${prev.customBaseCategory ? categoryLabel(prev.customBaseCategory) : "—"} → ${next.customBaseCategory ? categoryLabel(next.customBaseCategory) : "—"}`);
  }
  if ((prev.customDurationSeconds || 0) !== (next.customDurationSeconds || 0)) {
    add(`Length: ${humanSeconds(prev.customDurationSeconds)} → ${humanSeconds(next.customDurationSeconds)}`);
  }
  // Quantity and discount are the two levers on a bulk price, so a changed total is only half the
  // story — the log has to say which of them moved.
  if ((prev.quantity || 0) !== (next.quantity || 0)) add(`Quantity: ${prev.quantity || 0} → ${next.quantity || 0} videos`);
  if ((prev.discountPercent || 0) !== (next.discountPercent || 0) || (prev.discountAmount || 0) !== (next.discountAmount || 0)) {
    const shown = (i: SaleDetail) => (discountSummary(i).replace(" · ", "").replace(" off", "") || "none");
    add(`Discount: ${shown(prev)} → ${shown(next)}`, true);
  }
  if ((prev.amount || 0) !== (next.amount || 0)) add(`Amount: ${formatCurrency(prev.amount || 0)} → ${formatCurrency(next.amount || 0)}`, true);
  // What was collected at the sale, and the proof of it.
  const advance = (i: SaleDetail) => (i.partialPayment && Array.isArray(i.payments) && i.payments[0] ? i.payments[0].amount || 0 : null);
  if (advance(prev) !== advance(next)) {
    const said = (v: number | null) => (v == null ? "paid in full" : `${formatCurrency(v)} advance`);
    add(`Payment: ${said(advance(prev))} → ${said(advance(next))}`, true);
  }
  if ((prev.paymentScreenshotUrl || "") !== (next.paymentScreenshotUrl || "")) add("Payment screenshot replaced", true);
  // A month's committed content IS the promise — changing it changes what the tech team owes, so
  // it is named in the log rather than folded into a price change nobody can interpret later.
  const smmLine = (i: SaleDetail) => {
    const c = i.smm?.commitments;
    if (!c) return "";
    return `${c.poster || 0} posters, ${c.ai_ad || 0} AI ads, ${c.real_video || 0} real videos`;
  };
  if (smmLine(prev) !== smmLine(next)) add(`Committed content: ${smmLine(prev) || "—"} → ${smmLine(next) || "—"}`);
  const smmAccounts = (i: SaleDetail) => (i.smm?.platforms || []).join(", ");
  if (smmAccounts(prev) !== smmAccounts(next)) add(`Accounts: ${smmAccounts(prev) || "—"} → ${smmAccounts(next) || "—"}`);
  if ((prev.smm?.clipsPerVideo || 0) !== (next.smm?.clipsPerVideo || 0) && (prev.smm || next.smm)) {
    add(`Video length: ${prev.smm?.clipsPerVideo || "—"} clips → ${next.smm?.clipsPerVideo || "—"} clips`);
  }
  if ((prev.promise?.label || "") !== (next.promise?.label || "")) add(`Delivery: ${prev.promise?.label || "—"} → ${next.promise?.label || "—"}`);

  const pr = prev.requirement || {};
  const nr = next.requirement || {};
  if ((pr.language || "") !== (nr.language || "")) add(`Language: ${pr.language || "—"} → ${nr.language || "—"}`);
  // Changing the occasion changes the whole video, so it is logged by name rather than folded into
  // a generic "requirement updated" — a member already building a Diwali ad has to hear about it.
  if ((pr.festival || "") !== (nr.festival || "")) add(`Occasion: ${pr.festival || "—"} → ${nr.festival || "—"}`);
  const model = (v?: string) => (v === "male" ? "Male" : v === "female" ? "Female" : "—");
  if ((pr.modelGender || "") !== (nr.modelGender || "")) add(`Model: ${model(pr.modelGender)} → ${model(nr.modelGender)}`);
  const attire = (r: typeof pr) => (r.attireType ? attireLabel(r.attireType, r.customAttire, r.specialCategory) : "—");
  if (attire(pr) !== attire(nr)) add(`Attire: ${attire(pr)} → ${attire(nr)}`);
  if ((pr.aspectRatio || "") !== (nr.aspectRatio || "")) add(`Ratio: ${pr.aspectRatio || "—"} → ${nr.aspectRatio || "—"}`);
  if ((pr.notes || "") !== (nr.notes || "")) add("Tech notes updated");
  // The client reads this one back in their own confirmation, so a change to it is a change to
  // what we have promised to put on screen — not the same event as an internal note being edited.
  if ((pr.businessInfo || "") !== (nr.businessInfo || "")) add("Business info / what to include updated");
  if ((pr.businessName || "") !== (nr.businessName || "")) add(`Business: ${pr.businessName || "—"} → ${nr.businessName || "—"}`);
  if ((pr.businessWhatsapp || "") !== (nr.businessWhatsapp || "")) add(`Contact: ${pr.businessWhatsapp || "—"} → ${nr.businessWhatsapp || "—"}`);
  if ((pr.businessAddress || "") !== (nr.businessAddress || "")) add(`Address: ${pr.businessAddress || "—"} → ${nr.businessAddress || "—"}`);
  // Switching the special category or the background changes what the tech team must produce,
  // so both are logged by name rather than folded into a generic "requirement updated".
  const special = (r: typeof pr) => getCharacterPack(r.specialCategory)?.label || "Normal ad";
  if (special(pr) !== special(nr)) add(`Special category: ${special(pr)} → ${special(nr)}`);
  if ((pr.customCharacter || "") !== (nr.customCharacter || "")) add("Custom character description updated");
  // Logged on EVERY ad. Flipping an ad from a built location to the client's own photographs
  // changes what has to be collected before anyone can start.
  const loc = (r: typeof pr) => (r.realLocationProvided ? "Real — client's photos" : "AI — location created");
  if (loc(pr) !== loc(nr)) add(`Background: ${loc(pr)} → ${loc(nr)}`);
  return out;
}

/** The edit log's lines — every change, money included (the salesperson's own record). */
export function describeSaleChanges(prev: SaleDetail, next: SaleDetail): string[] {
  return saleChangeList(prev, next).map((c) => c.text);
}

/* ── Whose change wins ─────────────────────────────────────────────────────────────────────── */

/** A value reduced to something comparable: keys sorted, any timestamp as its milliseconds. */
function canonical(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return value;
  const asTs = value as { toMillis?: unknown; seconds?: unknown };
  if (typeof asTs.toMillis === "function" || (typeof asTs.seconds === "number" && Object.keys(value as object).every((k) => k === "seconds" || k === "nanoseconds"))) {
    return { __ms: timestampMs(value) };
  }
  if (Array.isArray(value)) return value.map(canonical);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const v = (value as Record<string, unknown>)[key];
    if (v !== undefined) out[key] = canonical(v);
  }
  return out;
}

/** Deep equality for sale fields, blind to key order and timestamp shape. */
export function sameSaleValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/**
 * Fields an edit form never decides, whatever its copy says. They belong to the sale's identity, its
 * approval, its penalties or its trail — each written by somebody else, at another time.
 */
const NOT_THE_FORMS = new Set([
  "saleId", "submittedAt", "verificationStatus", "verifiedAt", "rejectedAt", "discountApprovedBy",
  "discountApprovedAt", "discountRejectionReason", "penaltyTotal", "penaltyClips", "editLog", "editedAt",
  "enteredBy", "disputed", "proofImageUrl", "proofNote",
]);

/**
 * The sale as it should be saved: the sale as it is NOW, with only what the form changed laid on it.
 *
 * `base` is the copy the form opened on and `next` the copy it built on Save. A field the form did not
 * change keeps whatever it holds now — an approval given, a payment collected or a penalty mirrored
 * while the form was open survives the save. A field the form removed (a bulk sale edited into a
 * single video drops its quantity) is removed.
 *
 * Payments: the form owns only the first payment — the advance taken at the sale. A balance
 * collected later is kept (it is not on the form's copy, and writing the copy back used to lose it).
 */
export function mergeSaleEdit(fresh: SaleDetail, base: SaleDetail, next: SaleDetail): SaleDetail {
  const merged: Record<string, unknown> = { ...fresh };
  const keys = new Set([...Object.keys(base || {}), ...Object.keys(next || {})]);
  for (const key of keys) {
    if (NOT_THE_FORMS.has(key) || key === "payments") continue;
    const b = (base as unknown as Record<string, unknown>)[key];
    const n = (next as unknown as Record<string, unknown>)[key];
    if (sameSaleValue(b, n)) continue;
    if (n === undefined) delete merged[key];
    else merged[key] = n;
  }
  if (!sameSaleValue(base?.payments, next?.payments)) {
    const advance = next?.payments?.[0];
    merged.payments = next?.payments && advance
      ? [advance, ...((fresh.payments || []).slice(1))]
      : (next?.payments ?? null);
  }
  return merged as unknown as SaleDetail;
}

/* ── What cannot change once the tech side has started ─────────────────────────────────────── */

/**
 * Has the tech side started on this sale? An order with a job (assigned, handed in, delivered) — or
 * a job id on it, whatever its status — is work in progress: such a sale cannot be deleted, and its
 * edits reach the people doing the work. A sale whose order is still waiting in the queue has not.
 */
export function saleHasWork(order?: Pick<Order, "status" | "workAssignmentId"> | null): boolean {
  if (!order) return false;
  if (order.workAssignmentId) return true;
  return order.status === "assigned" || order.status === "completed" || order.status === "verified";
}

/**
 * Why an edit cannot be saved on a sale the tech side has started, or null when it can.
 *
 * Everything the client can change their mind about — the business, the brief, the language, the
 * model, the package length, the delivery promise, the price — may be edited. What the job IS may not:
 * a promotional ad that became a website, a bulk order of ten that became six, or a Custom order on a
 * different service would leave a member building the wrong thing, and needs the tech admin to take
 * the work back first.
 */
export function lockedServiceChange(fresh: SaleDetail, next: SaleDetail): string | null {
  const what = "once the tech team has started on it";
  if (fresh.category !== next.category) {
    return `The service can't change ${what} (${categoryLabel(fresh.category)}). Ask the tech admin to take the work back first.`;
  }
  if (effectiveAdCategory(fresh.category, fresh.bulkAdType) !== effectiveAdCategory(next.category, next.bulkAdType)) {
    return `The kind of video can't change ${what}. Ask the tech admin to take the work back first.`;
  }
  if ((fresh.quantity || 1) !== (next.quantity || 1)) {
    return `The number of videos can't change ${what}. Ask the tech admin to take the work back first.`;
  }
  if ((fresh.customBaseCategory || "") !== (next.customBaseCategory || "")) {
    return `The service behind a Custom sale can't change ${what}. Ask the tech admin to take the work back first.`;
  }
  return null;
}

/* ── What reaches the job ──────────────────────────────────────────────────────────────────── */

const resolvedLanguage = (f: { language: string; customLanguage: string }) =>
  (f.language === "Custom" ? (f.customLanguage.trim() || "Custom") : f.language);

/**
 * The fields of a job to rewrite after its sale was edited.
 *
 * The job was filled in from its order by `assignmentFormFromOrder` when it was assigned. The same
 * function is run on the order before and after the edit, and ONLY the fields that came out
 * differently are written to the job — so a change the tech side made to the job itself (the team
 * leader moved it to 16:9) is not undone by a salesperson correcting the business's address.
 *
 * A changed package length re-derives the clips and the member's rate, as at assignment. The
 * delivery promise follows the order's. A social-media month's jobs are never touched here: their
 * month's setup owns them (see services/smmAssign).
 */
export function jobPatchForSaleEdit(
  prevOrder: Order,
  nextOrder: Order,
  job: Pick<WorkAssignment, "category"> & Partial<WorkAssignment>,
  knownLanguages?: string[],
): Record<string, unknown> {
  const before = assignmentFormFromOrder(prevOrder, knownLanguages);
  const after = assignmentFormFromOrder(nextOrder, knownLanguages);
  const patch: Record<string, unknown> = {};
  const current = job as Record<string, unknown>;
  const set = (field: string, value: unknown) => {
    if (!sameSaleValue(current[field], value)) patch[field] = value;
  };
  const poster = isPosterCategory(job.category);

  if (before.businessName !== after.businessName && after.businessName.trim()) {
    set("businessName", after.businessName.trim());
    set("clientName", after.businessName.trim());
  }
  if (before.businessWhatsapp !== after.businessWhatsapp && after.businessWhatsapp.trim()) {
    set("businessWhatsapp", normalizePhone(after.businessWhatsapp));
  }
  if (before.requirementNotes !== after.requirementNotes) set("requirementNotes", (after.requirementNotes || "").trim());
  if (before.businessInfo !== after.businessInfo) set("businessInfo", (after.businessInfo || "").trim());
  if (before.businessAddress !== after.businessAddress) set("businessAddress", (after.businessAddress || "").trim());
  if (resolvedLanguage(before) !== resolvedLanguage(after)) set("language", resolvedLanguage(after));
  // Only a greeting video (or a poster) has an occasion — see createWorkAssignment.
  if (before.festival !== after.festival && (job.category === "wishes" || poster)) set("festival", (after.festival || "").trim());

  if (!poster) {
    if (before.modelGender !== after.modelGender || before.attireType !== after.attireType || before.customAttire !== after.customAttire
      || before.characterPack !== after.characterPack) {
      const spec = resolveModelSpec({
        characterPack: after.characterPack,
        modelGender: after.modelGender,
        attireType: after.attireType,
        customAttire: after.customAttire,
      });
      set("modelGender", spec.modelGender);
      set("attireType", spec.attireType);
      if (spec.attireType === "custom" && spec.customAttire) set("customAttire", spec.customAttire);
    }
    if (before.aspectRatio !== after.aspectRatio) set("aspectRatio", after.aspectRatio);
    if (before.characterPack !== after.characterPack) set("characterPack", after.characterPack || "");
    if (before.customCharacter !== after.customCharacter) set("customCharacter", (after.customCharacter || "").trim());
    if (before.realLocationProvided !== after.realLocationProvided && isAdCategory(job.category)) {
      set("realLocationProvided", after.realLocationProvided === true);
    }
    // The client bought a different length: the job is a different number of clips, at their rate.
    if (before.duration !== after.duration && after.duration) {
      set("duration", after.duration);
      set("clipCount", getClipCount(after.duration));
      set("pricePerUnit", after.pricePerUnit);
      set("totalPrice", after.pricePerUnit);
    }
  }

  if (timestampMs(prevOrder.promise?.dueAt) !== timestampMs(nextOrder.promise?.dueAt) && nextOrder.promise) {
    set("promise", nextOrder.promise);
  }
  return patch;
}

/* ── What the tech side is told ────────────────────────────────────────────────────────────── */

export type SaleEditAudience = "tech_admin" | "tech_team_leader" | "tech_member";

/**
 * The popup a sale edit raises for each person on the tech side.
 *
 * The tech admin reads every change. Team leaders and the member never see money — their screens
 * carry no prices by design — so a price-only edit tells them nothing changes in the work, rather than
 * staying silent: the owner asked for every edit of an assigned sale to be told to all three.
 */
export function saleEditNotice(params: {
  audience: SaleEditAudience;
  business: string;
  /** The job's readable id ("P012"), when there is one job. */
  uniqueId?: string | null;
  editorName: string;
  changes: SaleChange[];
}): { title: string; message: string; lines: string[] } {
  const { audience, business, uniqueId, editorName, changes } = params;
  const lines = (audience === "tech_admin" ? changes : changes.filter((c) => !c.money)).map((c) => c.text);
  const who = editorName || "The salesperson";
  const job = uniqueId ? ` (${uniqueId})` : "";
  const title = `Sale updated — ${business || "a client"}`;
  if (lines.length === 0) {
    return {
      title,
      message: `${who} edited the sale for "${business || "a client"}"${job}. Only its price or payment details changed — nothing changes in the work.`,
      lines,
    };
  }
  const shown = lines.slice(0, 4).join("; ");
  const more = lines.length > 4 ? ` (+${lines.length - 4} more)` : "";
  const tail = audience === "tech_member"
    ? " Your job now shows the new details — check them before you continue."
    : " The job has been updated to match.";
  return {
    title,
    message: `${who} edited the sale for "${business || "a client"}"${job}: ${shown}${more}.${tail}`,
    lines,
  };
}

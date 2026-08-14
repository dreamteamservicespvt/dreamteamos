/**
 * Recording a sale.
 *
 * ── Why it lives here rather than inside My Leads ─────────────────────────────────────────────
 * It was a local component in that page for as long as a sale could only be recorded from a lead.
 * It cannot any more: a sales member upselling an existing customer starts from My Clients, and
 * sending them back to My Leads to find a number they were already looking at is the friction the
 * upsell feature exists to remove.
 *
 * So the form moved out whole, unchanged. Two callers, one implementation — because everything that
 * makes this form correct is in it: the package lists, the discount ladder and the authority limit
 * that decides whether an order reaches the tech team at all, the bulk arithmetic, the freeze
 * rules, the edit log. A second "quick sale" form would be a second copy of all of that, and the
 * two would part company the first time one of them was corrected.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Timestamp } from "firebase/firestore";
import {
  StickyNote, Clock, IndianRupee, Loader2, Check, Upload, ExternalLink, Plus, Lock,
  AlertTriangle, Clapperboard, Pencil, Layers, PartyPopper, Sparkles, BadgePercent, CheckCircle2,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/hooks/use-toast";
import { uploadToCloudinary } from "@/services/cloudinary";
import { upsertOrderForSale } from "@/services/orders";
import { logActivity } from "@/services/activityLog";
import { applySaleFreeze, buildLeadFreezeFields, fetchNumberLock } from "@/services/numberLock";
import { watchAdLanguages, rememberAdLanguage, mergeAdLanguages } from "@/services/adLanguages";
import { characterPackOptions, getCharacterPack } from "@/services/characterPacks";
import { formatCurrency } from "@/utils/formatters";
import { normalizePhone } from "@/utils/phone";
import {
  SALE_CATEGORIES, PACKAGES, categoryLabel, isAdCategory, isBulkCategory, needsDescription,
  packageOptionLabel, bulkTypesFor, effectiveAdCategory,
  DEFAULT_PROMOTIONAL_PACKAGE, CUSTOM_BASE_CATEGORIES,
} from "@/utils/serviceCatalog";
import {
  CLIP_PRESETS, CLIP_SECONDS, clipsForSeconds, humanDuration, priceForClips, secondsForClips,
} from "@/utils/assignmentDuration";
import {
  discountBreakdown, negotiatedFromInput, EARNED_DISCOUNT_PERCENT, EARNED_REASON_LABEL,
  MEMBER_DISCOUNT_LIMIT_PERCENT, type EarnedReason,
} from "@/utils/saleDiscount";
import {
  quoteBulk, suggestedDiscountPercent, maxDiscountAmount, discountSummary,
  MAX_BULK_DISCOUNT_PERCENT, type DiscountMode,
} from "@/utils/bulkDiscount";
import { presetsForCategory, buildPromise, CUSTOM_PRESET_KEY } from "@/utils/promiseSla";
import { AttireType, ModelGender, ATTIRE_OPTIONS_BY_GENDER } from "@/types/aiPlatform";
import {
  ATTIRE_LABELS, DEFAULT_REQUIREMENT, attireForGender, attireLabel, cleanRequirement,
  withRequirementDefaults,
} from "@/utils/adRequirement";
import { CUSTOM_FESTIVAL_OPTION, WISHES_FESTIVALS, isListedFestival } from "@/utils/festivals";
import { collectedOf, newPayment, withPayment } from "@/utils/salePayments";
import SaleSection from "@/components/sales/SaleSection";
import type { Lead, SaleDetail, SaleEditEntry, SalePayment } from "@/types";

type TimestampLike = { toMillis?: () => number; seconds?: number } | null | undefined;

/** Epoch ms from any of the timestamp shapes this data has carried over time. */
function tsToMs(ts: TimestampLike): number {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  return 0;
}

/* ─── Sale Form ─── */

/** Sentinel for "the client wants a language that isn't in the list yet". */
const LANGUAGE_CUSTOM = "__custom__";

/**
 * The same sale with every trace of a bulk order removed — for one that has just been edited into
 * an ordinary single-video category, where a leftover quantity or discount would keep describing a
 * price that no longer exists.
 */
function withoutBulkFields(item: SaleDetail): SaleDetail {
  const {
    quantity, bulkAdType, unitAmount, suggestedDiscountPercent,
    discountMode, discountAmount, discountPercent, discountEdited, ...rest
  } = item;
  return rest;
}

/**
 * A human-readable list of what changed between two versions of a sale, for the edit log.
 * Only fields a sales member can actually change are compared.
 */
function describeSaleChanges(prev: SaleDetail, next: SaleDetail): string[] {
  const out: string[] = [];
  const pkg = (i: SaleDetail) => (i.packageKey && i.packageKey !== "custom" ? i.packageKey : "Custom");
  if (prev.category !== next.category) out.push(`Service: ${categoryLabel(prev.category)} → ${categoryLabel(next.category)}`);
  // The kind of video is what the tech team builds, so switching it is a bigger change than the
  // package and has to be named — a bulk order that turned cinematic costs twice as much to make.
  if (isBulkCategory(next.category) && effectiveAdCategory(prev.category, prev.bulkAdType) !== effectiveAdCategory(next.category, next.bulkAdType)) {
    out.push(`Video type: ${categoryLabel(effectiveAdCategory(prev.category, prev.bulkAdType))} → ${categoryLabel(effectiveAdCategory(next.category, next.bulkAdType))}`);
  }
  if (pkg(prev) !== pkg(next)) out.push(`Package: ${pkg(prev)} → ${pkg(next)}`);
  if ((prev.customDescription || "") !== (next.customDescription || "")) {
    out.push(`Description: ${prev.customDescription || "—"} → ${next.customDescription || "—"}`);
  }
  // Quantity and discount are the two levers on a bulk price, so a changed total is only half the
  // story — the log has to say which of them moved.
  if ((prev.quantity || 0) !== (next.quantity || 0)) out.push(`Quantity: ${prev.quantity || 0} → ${next.quantity || 0} videos`);
  if ((prev.discountPercent || 0) !== (next.discountPercent || 0) || (prev.discountAmount || 0) !== (next.discountAmount || 0)) {
    const shown = (i: SaleDetail) => (discountSummary(i).replace(" · ", "").replace(" off", "") || "none");
    out.push(`Discount: ${shown(prev)} → ${shown(next)}`);
  }
  if ((prev.amount || 0) !== (next.amount || 0)) out.push(`Amount: ${formatCurrency(prev.amount || 0)} → ${formatCurrency(next.amount || 0)}`);
  if ((prev.promise?.label || "") !== (next.promise?.label || "")) out.push(`Delivery: ${prev.promise?.label || "—"} → ${next.promise?.label || "—"}`);

  const pr = prev.requirement || {};
  const nr = next.requirement || {};
  if ((pr.language || "") !== (nr.language || "")) out.push(`Language: ${pr.language || "—"} → ${nr.language || "—"}`);
  // Changing the occasion changes the whole video, so it is logged by name rather than folded into
  // a generic "requirement updated" — a member already building a Diwali ad has to hear about it.
  if ((pr.festival || "") !== (nr.festival || "")) out.push(`Occasion: ${pr.festival || "—"} → ${nr.festival || "—"}`);
  const model = (v?: string) => (v === "male" ? "Male" : v === "female" ? "Female" : "—");
  if ((pr.modelGender || "") !== (nr.modelGender || "")) out.push(`Model: ${model(pr.modelGender)} → ${model(nr.modelGender)}`);
  const attire = (r: typeof pr) => (r.attireType ? attireLabel(r.attireType, r.customAttire) : "—");
  if (attire(pr) !== attire(nr)) out.push(`Attire: ${attire(pr)} → ${attire(nr)}`);
  if ((pr.aspectRatio || "") !== (nr.aspectRatio || "")) out.push(`Ratio: ${pr.aspectRatio || "—"} → ${nr.aspectRatio || "—"}`);
  if ((pr.notes || "") !== (nr.notes || "")) out.push(`Notes updated`);
  if ((pr.businessName || "") !== (nr.businessName || "")) out.push(`Business: ${pr.businessName || "—"} → ${nr.businessName || "—"}`);
  // Switching the special category or the location source changes what the tech team must produce,
  // so both are logged by name rather than folded into a generic "requirement updated".
  const special = (r: typeof pr) => getCharacterPack(r.specialCategory)?.label || "Normal ad";
  if (special(pr) !== special(nr)) out.push(`Special category: ${special(pr)} → ${special(nr)}`);
  const loc = (r: typeof pr) => (r.realLocationProvided ? "Client's photos" : "Location created");
  if (!!pr.specialCategory && !!nr.specialCategory && loc(pr) !== loc(nr)) out.push(`Location: ${loc(pr)} → ${loc(nr)}`);
  return out;
}

export default function SaleForm({ lead, updateLead, onDone, editItem, initialCategory }: {
  lead: Lead;
  updateLead: (id: string, data: Record<string, any>) => Promise<void>;
  /**
   * Closed, and what happened.
   *
   * `heldForApproval` means the discount is past the member's own authority, so no order exists
   * yet — see `upsertOrderForSale`. A caller that shows sales via their orders has nothing at all
   * to display for such a sale, and must be told rather than left looking unchanged.
   */
  onDone: (result?: { heldForApproval: boolean }) => void;
  /** Present when editing an existing sale rather than adding a new one. */
  editItem?: { index: number; item: SaleDetail };
  /**
   * What to open on. Set when the member arrived from an upsell in My Clients, where they had
   * already chosen what they were selling — asking them to pick it a second time is how a Wishes
   * upsell gets recorded as the promotional default nobody changed.
   */
  initialCategory?: string;
}) {
  const { toast } = useToast();
  const saleFormUser = useAuthStore((s) => s.user);
  const editing = !!editItem;
  const ed = editItem?.item;
  // Promotional is what the team sells most, so it's the default; the ₹499 "15 Seconds + Poster"
  // package is pre-selected to match, since that is the one they actually sell most of. When
  // editing, everything starts from the saved sale.
  const [category, setCategory] = useState(ed?.category || initialCategory || "promotional");
  const [packageKey, setPackageKey] = useState(
    ed
      ? (ed.packageKey && ed.packageKey !== "custom" ? ed.packageKey : "")
      // The promotional default only makes sense for a promotional sale; arriving on Wishes with a
      // promotional package pre-picked is a wrong price waiting to be submitted.
      : (!initialCategory || initialCategory === "promotional") ? DEFAULT_PROMOTIONAL_PACKAGE : "",
  );
  const [customAmount, setCustomAmount] = useState<number>(ed?.amount || 0);
  /**
   * What was sold, for the categories that have no package list to say it. Without this a Custom
   * sale reached the tech team as the string "Custom custom" and somebody had to ring back to ask.
   */
  const [description, setDescription] = useState(ed?.customDescription || "");
  /**
   * Bulk videos: which kind, how many, and the discount given. The kind is chosen first because
   * it decides the price list — a bulk order of cinematic ads is priced as cinematic ads.
   */
  const [bulkAdType, setBulkAdType] = useState<string>(
    () => effectiveAdCategory("bulk_ads", ed?.bulkAdType),
  );
  const [quantity, setQuantity] = useState<number>(ed?.quantity || 5);
  const [discountMode, setDiscountMode] = useState<DiscountMode>(ed?.discountMode || "percent");
  // One box, read in whichever unit the toggle is on. Kept as a single value so switching units
  // cannot leave a stale figure behind in the box the member is no longer looking at.
  const [discountValue, setDiscountValue] = useState<number>(
    () => (ed?.discountMode === "amount" ? ed?.discountAmount ?? 0 : ed?.discountPercent ?? 0),
  );
  const [discountTouched, setDiscountTouched] = useState(false);
  /**
   * The discount on an ordinary sale, kept apart from the bulk ladder's.
   *
   * Deliberately its own state rather than sharing the bulk boxes above. They are seeded from the
   * sale being edited, so reusing them meant a bulk order converted to a single video carried its
   * volume discount across as a manual one — the ladder's arithmetic surviving the very edit that
   * was supposed to remove it. `withoutBulkFields` exists to strip exactly that.
   */
  const [manualMode, setManualMode] = useState<DiscountMode>(
    () => (!ed?.quantity && ed?.discountMode === "amount" ? "amount" : "percent"),
  );
  const [manualValue, setManualValue] = useState<number>(() => {
    // A bulk sale's figures belong to the ladder, never to this box.
    if (!ed || (ed.quantity ?? 0) > 1) return 0;
    return ed.discountMode === "amount" ? ed.discountAmount ?? 0 : ed.discountPercent ?? 0;
  });
  /**
   * What the client did to earn a discount, and the screenshot proving it.
   *
   * Two separate claims because a client can do either or both, and each needs its own evidence —
   * a review screenshot does not prove a referral. What they are jointly worth is decided by
   * utils/saleDiscount, not here.
   */
  const [reviewShot, setReviewShot] = useState(ed?.earnedDiscount?.review?.screenshotUrl || "");
  const [referralShot, setReferralShot] = useState(ed?.earnedDiscount?.referral?.screenshotUrl || "");
  const [earnedUploading, setEarnedUploading] = useState<EarnedReason | null>(null);
  /**
   * A Custom sale that is really a listed service at an unlisted length — a two-minute
   * promotional ad. Naming the service and the seconds is what lets the tech pipeline derive a
   * clip count, a price, a poster and a deadline instead of receiving a free-text note.
   */
  const [customBase, setCustomBase] = useState<string>(ed?.customBaseCategory || "");
  /**
   * The length, counted in CLIPS rather than minutes and seconds.
   *
   * ── Why the unit changed ────────────────────────────────────────────────────────────────────
   * The whole production side is built on 8-second clips, so a length typed in minutes and seconds
   * had to be converted before it meant anything — and the conversion happened silently, after the
   * sale. A member who sold "1 minute" had sold 8 clips (64 seconds); one who sold "45 seconds"
   * had sold 6 clips (48). Neither could tell from this form, so the number quoted to the client
   * and the number the tech team built were routinely different, and nobody found out until the
   * finished ad was the wrong length.
   *
   * Picking clips removes the conversion entirely: the number chosen here IS the number of shots
   * that get made, and the seconds are shown beside it so the member still knows what to tell the
   * client. Seeded from the stored seconds so an existing sale re-opens on the length it holds.
   */
  const [customClips, setCustomClips] = useState<number>(
    () => (ed?.customDurationSeconds ? clipsForSeconds(ed.customDurationSeconds) : 0),
  );
  /**
   * The exact time the member typed, when they entered one — kept ONLY so the rounding can be
   * shown back to them.
   *
   * Clips remain the stored unit; this is not a second source of truth for the length. A client
   * who asks for 45 seconds is buying 6 clips, which is 48, and a form that silently accepts "45"
   * and hands the tech team 48 is how a member quotes one number and the company delivers another.
   * Cleared whenever the length is set as clips, so the time boxes go back to mirroring the clips.
   */
  const [typedSeconds, setTypedSeconds] = useState<number | null>(
    () => ed?.customDurationSeconds ?? null,
  );
  /** The auto-priced figure was overridden, so it stops following the duration. */
  const [customPriceTouched, setCustomPriceTouched] = useState(false);
  /**
   * Whether the client paid only part of the price, and how much they actually handed over.
   *
   * Seeded from what is already on the sale so re-opening one shows the real position rather than
   * resetting it to "paid in full" — which would silently wipe a pending balance on any edit.
   */
  const [advanceCollected, setAdvanceCollected] = useState<boolean>(!!ed?.partialPayment);
  const [advanceAmount, setAdvanceAmount] = useState<number>(
    () => (ed?.partialPayment ? collectedOf(ed) : 0),
  );
  const [screenshotUrl, setScreenshotUrl] = useState(ed?.paymentScreenshotUrl || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [freezeDays, setFreezeDays] = useState(1);
  // Duplicate-sale dispute: another member already sold this number → proof required.
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [dupChecking, setDupChecking] = useState(!editing);
  const [proofUrl, setProofUrl] = useState(ed?.proofImageUrl || "");
  const [proofNote, setProofNote] = useState(ed?.proofNote || "");
  const [proofUploading, setProofUploading] = useState(false);
  // Delivery promise / turnaround SLA the member promises the client (countdown starts at sale).
  const [slaPreset, setSlaPreset] = useState<string>(() => {
    const p = ed?.promise;
    if (p && (p.source === "custom" || p.presetKey === CUSTOM_PRESET_KEY)) return CUSTOM_PRESET_KEY;
    if (p?.presetKey) return p.presetKey;
    const opts = presetsForCategory(effectiveAdCategory(ed?.category || "promotional", ed?.bulkAdType));
    return opts.length > 0 ? opts[0].key : CUSTOM_PRESET_KEY;
  });
  const [customDays, setCustomDays] = useState<number>(() => {
    const p = ed?.promise;
    return p?.hours ? Math.max(1, Math.round(p.hours / 24)) : 1;
  });

  /**
   * The client's ad brief. Captured here because the sales member is the only person who ever
   * speaks to the client — it rides the sale into the tech Orders queue and pre-fills the
   * assignment, so nobody re-types it and nothing is lost in a WhatsApp message.
   * Category and duration are deliberately absent: both are derived from what was sold.
   */
  const [req, setReq] = useState(() => {
    const r = withRequirementDefaults(ed?.requirement);
    return {
      businessName: r.businessName || lead.realName || lead.displayName || "",
      businessWhatsapp: r.businessWhatsapp || normalizePhone(lead.phone),
      language: r.language,
      modelGender: r.modelGender as ModelGender,
      attireType: r.attireType as AttireType,
      customAttire: r.customAttire,
      aspectRatio: r.aspectRatio as "9:16" | "16:9",
      notes: r.notes,
      festival: r.festival,
      specialCategory: r.specialCategory,
      realLocationProvided: r.realLocationProvided,
    };
  });
  const [languages, setLanguages] = useState<string[]>(() => mergeAdLanguages(null));
  const [customLanguage, setCustomLanguage] = useState("");
  useEffect(() => watchAdLanguages(setLanguages), []);

  /**
   * The occasion a wishes video is for. Offered as a list because the same twenty-odd festivals
   * come up all year and typing them invites spelling that the generator's theme lookup will not
   * recognise — with a free-text escape, because a client can want a video for their shop's
   * anniversary and no list will ever cover that.
   */
  const [festivalChoice, setFestivalChoice] = useState<string>(
    () => (isListedFestival(req.festival) ? req.festival : req.festival ? CUSTOM_FESTIVAL_OPTION : ""),
  );
  const [customFestival, setCustomFestival] = useState(
    () => (req.festival && !isListedFestival(req.festival) ? req.festival : ""),
  );

  // Only ad deliverables (wishes / promotional / cinematic) have a model, attire and ratio.
  const isAdSale = isAdCategory(category);
  /**
   * A special category replaces the human model outright — the cartoon duo IS the cast — so while
   * one is selected the model and attire pickers come down instead of collecting a spec that the
   * generator will ignore. Priced identically to a normal ad of the same length.
   */
  const salePack = isAdSale ? getCharacterPack(req.specialCategory) : null;
  const usingCustomLanguage = req.language === LANGUAGE_CUSTOM;
  const resolvedLanguage = usingCustomLanguage ? customLanguage.trim() : req.language;
  const languageMissing = isAdSale && usingCustomLanguage && !resolvedLanguage;
  // A saved language that isn't in the shared list yet stays selectable when editing.
  const langOptions = useMemo(() => {
    if (!req.language || req.language === LANGUAGE_CUSTOM) return languages;
    return languages.some((l) => l.toLowerCase() === req.language.toLowerCase()) ? languages : [req.language, ...languages];
  }, [languages, req.language]);

  const isBulk = isBulkCategory(category);
  /**
   * What is really being sold. A bulk order is N videos of one of the three ad kinds, and every
   * rule that follows — the price list, the delivery presets, the brief — belongs to that kind,
   * not to "bulk".
   */
  const adCategory = effectiveAdCategory(category, isBulk ? bulkAdType : undefined);
  const packages = PACKAGES[adCategory] || [];
  const selectedPkg = packages.find((p) => p.label === packageKey);

  /**
   * Only a greeting video has an occasion — and it must have one, because the generator themes the
   * entire ad from it. A wishes sale with the festival left blank reaches the tech team as "make a
   * wishes video" and someone has to ring the client back to ask what for. Bulk wishes counts too:
   * ten Diwali videos are still ten Diwali videos.
   */
  const isWishesSale = adCategory === "wishes";
  const resolvedFestival = (festivalChoice === CUSTOM_FESTIVAL_OPTION ? customFestival : festivalChoice).trim();
  const festivalMissing = isWishesSale && !resolvedFestival;

  /**
   * A bulk order is priced from the quantity, so the amount is computed rather than picked. The
   * quote also reports whether the applied discount left the ladder — that flag is what the tech
   * admin and the sales admin see, and it has to be derived here rather than trusted from a box.
   */
  const bulkQuote = useMemo(
    () => (isBulk ? quoteBulk(quantity, selectedPkg?.amount || 0, discountValue, discountMode) : null),
    [isBulk, quantity, selectedPkg?.amount, discountValue, discountMode],
  );

  /**
   * A Custom sale built on a real service — the two-minute promotional ad the price list has no
   * row for. The length drives the price the same way it drives the work: whole 8-second clips at
   * the category's own per-clip rate, which is exactly how the tech side already prices a
   * non-standard length (see utils/assignmentDuration.priceForClips).
   */
  const isCustomService = category === "custom" && !!customBase;
  // Seconds are now derived from the clips, not the other way round — see `customClips` above.
  const customTotalSeconds = isCustomService ? secondsForClips(customClips) : 0;
  const suggestedCustomPrice = customClips > 0 ? priceForClips(customBase, customClips) : 0;

  /** Setting the length as clips — a preset or the clip box. The time boxes follow it again. */
  const setClips = (clips: number) => {
    setCustomClips(Math.max(0, clips || 0));
    setTypedSeconds(null);
    setCustomPriceTouched(false);
  };

  /** Setting the length as a time. Converted to whole clips, rounding up. */
  const applyMinSec = (mins: number, secs: number) => {
    const total = mins * 60 + secs;
    setTypedSeconds(total);
    setCustomClips(total > 0 ? clipsForSeconds(total) : 0);
    setCustomPriceTouched(false);
  };

  // The time boxes show what was typed while it is being typed, and mirror the clips otherwise.
  const shownSeconds = typedSeconds ?? customTotalSeconds;
  const customMinutes = Math.floor(shownSeconds / 60);
  const customSecondsPart = shownSeconds % 60;
  /** The typed length, when it was not a whole number of clips and had to be rounded up. */
  const roundedUpFrom = typedSeconds && typedSeconds > 0 && customTotalSeconds !== typedSeconds
    ? typedSeconds
    : null;

  /**
   * The suggestion follows the length until the member types their own figure — after that it is
   * their price, because they are the one who quoted it. Suggested, never imposed.
   */
  useEffect(() => {
    if (!isCustomService || customPriceTouched || suggestedCustomPrice <= 0) return;
    setCustomAmount(suggestedCustomPrice);
  }, [isCustomService, suggestedCustomPrice, customPriceTouched]);

  const amount = isBulk ? (bulkQuote?.amount ?? 0) : (selectedPkg?.amount || customAmount);
  const needsCustomAmount = !isBulk && (packages.length === 0 || (selectedPkg && selectedPkg.amount === 0));

  /**
   * Everything coming off this sale, and whether it is the member's to give.
   *
   * The bulk ladder discount is already inside `amount`, so it is passed as the negotiated part
   * and the gross is the pre-discount figure — otherwise a 10% earned discount on an already
   * discounted total would be measured against the wrong number and the 10% rule would let
   * through prices it should have stopped.
   */
  const earned = useMemo(() => ({
    review: reviewShot ? { screenshotUrl: reviewShot } : null,
    referral: referralShot ? { screenshotUrl: referralShot } : null,
  }), [reviewShot, referralShot]);

  const grossBeforeDiscount = isBulk ? (bulkQuote?.grossAmount ?? 0) : amount;

  /**
   * A discount agreed on the call, on an ordinary single sale.
   *
   * Bulk orders have had this for ever, through the volume ladder. Everything else was hard-wired
   * to zero, so a member who agreed ₹100 off a ₹999 poster had no way to record it — they either
   * typed a smaller "custom" amount, which loses the fact that a discount was given at all, or
   * they promised something the system then billed differently.
   *
   * The 10% authority rule needs no special handling here: `discountBreakdown` measures the total
   * coming off, whatever its source, and anything past a member's own limit holds the order back
   * from the tech team until the sales admin confirms the price.
   */
  const manualDiscountAmount = useMemo(
    () => (isBulk ? 0 : negotiatedFromInput(manualMode, manualValue, amount)),
    [isBulk, manualMode, manualValue, amount],
  );

  const discount = useMemo(() => discountBreakdown({
    grossAmount: grossBeforeDiscount,
    negotiatedAmount: isBulk ? (bulkQuote?.discountAmount ?? 0) : manualDiscountAmount,
    earned,
  }), [grossBeforeDiscount, isBulk, bulkQuote?.discountAmount, manualDiscountAmount, earned]);

  /** What the client actually pays, once the earned discount is off as well. */
  const finalAmount = discount.netAmount;

  /**
   * What is still owed, if an advance was taken.
   *
   * Clamped to the price, because a member correcting a figure downwards must never leave the sale
   * showing a negative balance — and because "collected more than the price" is a typo, not a debt.
   */
  const advancePending = advanceCollected
    ? Math.max(0, finalAmount - Math.min(advanceAmount, finalAmount))
    : 0;

  /**
   * The payments this sale should carry once saved.
   *
   * Instalments collected AFTER the advance are preserved untouched — the form owns the advance,
   * not the whole payment history, and rewriting the list wholesale on an ordinary edit would
   * erase a balance somebody had already gone out and collected.
   */
  const buildPayments = (): SalePayment[] | null => {
    if (!advanceCollected) return null;
    const prior = (ed?.partialPayment && Array.isArray(ed.payments)) ? ed.payments : [];
    const advance: SalePayment = {
      id: prior[0]?.id || `pay_${Date.now()}`,
      amount: Math.max(0, Math.min(advanceAmount, finalAmount)),
      // The advance was taken when the sale was made; keep its original stamp on an edit so the
      // money does not silently move to a different day — and a different pay cycle.
      collectedAt: prior[0]?.collectedAt || Timestamp.now(),
      note: "Advance at sale",
      screenshotUrl: screenshotUrl || null,
      ...(saleFormUser ? { byId: saleFormUser.uid, byName: saleFormUser.name } : {}),
    };
    return [advance, ...prior.slice(1)];
  };
  /** Categories with no package list (Custom, Software), plus any explicit "custom quote" tier. */
  const showDescription = needsDescription(category) || (!!selectedPkg && selectedPkg.amount === 0);
  const descriptionRequired = needsDescription(category);
  const descriptionMissing = descriptionRequired && !description.trim();
  const hasProof = !!proofUrl || !!proofNote.trim();
  const slaOptions = presetsForCategory(adCategory);

  /**
   * Whether this form can be submitted, and the one thing standing in the way.
   *
   * Derived once and shared by both save buttons: two buttons each working out their own disabled
   * state is two chances for them to disagree, and a member who can submit with one but not the
   * other has no way of telling which of them is wrong.
   */
  const blockReason =
    uploading ? "Uploading screenshot…"
    : !screenshotUrl ? "Upload screenshot to continue"
    : dupChecking ? "Checking…"
    : isDuplicate && !hasProof ? "Add proof to continue"
    : languageMissing ? "Type the language to continue"
    : festivalMissing ? "Pick the occasion to continue"
    : descriptionMissing ? "Say what was sold to continue"
    : amount <= 0 ? "Pick a package or enter an amount"
    : null;
  const blocked = saving || proofUploading || !!blockReason;

  /**
   * Keep the discount box on the ladder while the member is still choosing a quantity, and stop
   * the moment they type their own number — after that it is their figure, not ours, and silently
   * resetting it when they adjusted the count would undo a decision they had already made.
   *
   * The suggestion follows the box's unit: a member working in rupees is offered the ladder in
   * rupees, so the figure in front of them is always the one they would actually quote.
   */
  const bulkSkipFirst = useRef(editing);
  const suggestedForBox = discountMode === "amount"
    ? Math.round(((selectedPkg?.amount || 0) * quantity * suggestedDiscountPercent(quantity)) / 100)
    : suggestedDiscountPercent(quantity);
  useEffect(() => {
    if (!isBulk) return;
    if (bulkSkipFirst.current) { bulkSkipFirst.current = false; return; }
    if (discountTouched) return;
    setDiscountValue(suggestedForBox);
  }, [isBulk, suggestedForBox, discountTouched]);

  // Default the promise to the category's first preset (or custom) whenever the category changes —
  // but not on the first render when editing, or it would overwrite the saved promise. A bulk order
  // takes its kind's presets: bulk cinematic promises days, not the promotional 24 hours.
  const slaSkipFirst = useRef(editing);
  useEffect(() => {
    if (slaSkipFirst.current) { slaSkipFirst.current = false; return; }
    const opts = presetsForCategory(adCategory);
    setSlaPreset(opts.length > 0 ? opts[0].key : CUSTOM_PRESET_KEY);
  }, [adCategory]);

  // A "duplicate dispute" (proof required) exists ONLY while another member's sale is still inside
  // its freeze/validity window. Once that validity has expired, a new sale by anyone is a legitimate
  // SEPARATE sale — no proof needed (e.g. member A sold yesterday, the freeze ended, member B sells
  // a new ad today). The per-number lock is the source of truth and is always readable.
  useEffect(() => {
    // Editing an existing sale is never a duplicate dispute — it's already this member's sale.
    if (editing) { setDupChecking(false); return; }
    let cancelled = false;
    setDupChecking(true);
    (async () => {
      if (!saleFormUser) { setDupChecking(false); return; }
      let dup = false;
      try {
        const lock = await fetchNumberLock(lead.phone);
        const activeFreezeByOther =
          !!lock?.saleFrozen &&
          tsToMs(lock.saleFrozenUntil) > Date.now() &&
          !!lock.saleById &&
          lock.saleById !== saleFormUser.uid;
        dup = activeFreezeByOther;
      } catch { /* lock unreadable → treat as no active dispute */ }
      if (cancelled) return;
      setIsDuplicate(dup);
      setDupChecking(false);
    })();
    return () => { cancelled = true; };
  }, [lead.phone, saleFormUser, editing]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadToCloudinary(file);
      setScreenshotUrl(url);
      toast({ title: "Uploaded", description: "Payment screenshot uploaded." });
    } catch {
      toast({ title: "Error", description: "Upload failed.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleProofUpload = async (file: File) => {
    setProofUploading(true);
    try {
      const url = await uploadToCloudinary(file);
      setProofUrl(url);
      toast({ title: "Uploaded", description: "Proof image uploaded." });
    } catch {
      toast({ title: "Error", description: "Upload failed.", variant: "destructive" });
    } finally {
      setProofUploading(false);
    }
  };

  const handleSave = async (opts: { keepOpen?: boolean } = {}) => {
    if (amount <= 0) {
      toast({ title: "Error", description: "Please enter a valid amount.", variant: "destructive" });
      return;
    }
    if (descriptionMissing) {
      toast({ title: "Say what was sold", description: `Type what this ${categoryLabel(category)} sale is for — the tech team has no package name to go on.`, variant: "destructive" });
      return;
    }
    if (isBulk && quantity < 2) {
      toast({ title: "How many videos?", description: `A bulk order is two videos or more. For a single one, use ${categoryLabel(adCategory)}.`, variant: "destructive" });
      return;
    }
    if (uploading) {
      toast({ title: "Hold on", description: "Wait for the payment screenshot to finish uploading.", variant: "destructive" });
      return;
    }
    if (!screenshotUrl) {
      toast({ title: "Screenshot required", description: "Upload the payment screenshot before adding the sale.", variant: "destructive" });
      return;
    }
    if (isDuplicate && !hasProof) {
      toast({ title: "Proof required", description: "This number was already sold by another member. Upload a call-record image or write a note as proof.", variant: "destructive" });
      return;
    }
    if (languageMissing) {
      toast({ title: "Language needed", description: "Type the custom language the client asked for.", variant: "destructive" });
      return;
    }
    if (festivalMissing) {
      toast({ title: "Which occasion?", description: "Pick the festival this wishes video is for — the tech team themes the whole ad from it.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const promise = buildPromise({
      presetKey: slaPreset || CUSTOM_PRESET_KEY,
      customHours: slaPreset === CUSTOM_PRESET_KEY ? Math.max(1, Math.round(customDays * 24)) : undefined,
      startMs: Date.now(),
    });
    /**
     * The brief that travels with the sale.
     *
     * Every service carries who it is for and what was asked for; only a video carries the parts
     * that describe how to shoot it. Building it this way rather than "ads get a brief, everything
     * else gets null" is what stopped a Google Business Profile reaching the tech team as a
     * category and an amount with no client name on it. `cleanRequirement` strips the blanks, so a
     * member who fills in nothing still stores `null` exactly as before.
     */
    const requirement = cleanRequirement({
      businessName: req.businessName,
      businessWhatsapp: req.businessWhatsapp.trim() ? normalizePhone(req.businessWhatsapp) : "",
      notes: req.notes,
      ...(isAdSale
        ? {
          language: resolvedLanguage,
          modelGender: req.modelGender,
          attireType: req.attireType,
          customAttire: req.attireType === AttireType.CUSTOM ? req.customAttire : "",
          aspectRatio: req.aspectRatio,
          // Only a greeting video has an occasion. Storing one on a promotional ad would follow it
          // into the generator and theme an ad nobody asked to be themed.
          festival: isWishesSale ? resolvedFestival : "",
          specialCategory: req.specialCategory,
          // Only carried alongside a pack — on a normal ad "no real location" is not a fact about
          // the sale, and storing it would put a meaningless flag on every ordinary order.
          realLocationProvided: req.specialCategory ? req.realLocationProvided : undefined,
        }
        : {}),
    });
    // A language the client asked for that isn't in the list yet joins it for everyone.
    if (isAdSale && usingCustomLanguage && resolvedLanguage) await rememberAdLanguage(resolvedLanguage);

    /**
     * What was sold beyond the package name, and — for a bulk order — the arithmetic behind the
     * price. The quantity and unit price are kept alongside the total so the discount stays
     * auditable: without them, "₹7,592" is a number nobody can check a year later.
     */
    const saleShape = {
      customDescription: showDescription ? description.trim() || null : null,
      /*
        A Custom sale that names a real service and a length stops being a note somebody has to
        read. Only stored when both are present — a Custom sale for something genuinely not on the
        list (a software job) still behaves exactly as it always has.
      */
      customBaseCategory: isCustomService ? customBase : null,
      customDurationSeconds: isCustomService && customTotalSeconds > 0 ? customTotalSeconds : null,
      // What was actually collected, versus what was agreed. See utils/salePayments — a sale with
      // no payment list is one that was paid in full, which is the overwhelming majority.
      partialPayment: advanceCollected,
      payments: buildPayments(),
      // What the client earned, with the proof, and what it was worth.
      earnedDiscount: discount.reasons.length > 0 ? earned : null,
      earnedDiscountAmount: discount.earnedAmount || 0,
      /*
        Over 10% total is more than a member may give alone, so the sale waits for the sales admin
        before it reaches the tech team at all — see services/orders.upsertOrderForSale.
      */
      discountNeedsApproval: discount.needsApproval,
      discountApproval: discount.needsApproval
        ? ((editing && ed?.discountApproval === "approved" && ed?.amount === finalAmount)
            ? "approved" as const   // unchanged price on an already-approved sale keeps its approval
            : "pending" as const)
        : null,
      /*
        An ordinary sale's negotiated discount, recorded in the unit the member gave it in so the
        approvals screen can show "10% off" or "₹100 off" as it was actually agreed.
      */
      ...(!isBulk && manualDiscountAmount > 0
        ? {
            discountMode: manualMode,
            discountAmount: manualDiscountAmount,
            discountPercent: amount > 0 ? Math.round((manualDiscountAmount / amount) * 1000) / 10 : 0,
            discountEdited: true,
          }
        : {}),
      ...(isBulk && bulkQuote
        ? {
            // The kind of video travels with the sale: without it the tech side only knows the
            // order is "bulk", and every price, duration and deadline downstream is keyed by kind.
            bulkAdType,
            quantity: bulkQuote.quantity,
            unitAmount: bulkQuote.unitAmount,
            suggestedDiscountPercent: bulkQuote.suggestedPercent,
            discountMode: bulkQuote.discountMode,
            discountAmount: bulkQuote.discountAmount,
            discountPercent: bulkQuote.discountPercent,
            discountEdited: bulkQuote.edited,
          }
        : {}),
    };

    const existingItems = lead.saleItems || (lead.saleDetails ? [lead.saleDetails] : []);

    // ── Edit an existing sale ────────────────────────────────────────────────
    if (editing && ed && editItem) {
      const updatedItem: SaleDetail = {
        // A sale edited OUT of bulk keeps none of the bulk arithmetic. Spreading the old item
        // wholesale left the quantity and discount behind on what is now a single ad, so the
        // order still announced itself as "×10" and the price no longer reconciled with it.
        ...(isBulk ? ed : withoutBulkFields(ed)),
        category,
        packageKey: packageKey || "custom",
        ...saleShape,
        amount: finalAmount,
        paymentScreenshotUrl: screenshotUrl || null,
        // submittedAt is kept, so the order's deterministic id stays stable.
        promise,
        requirement,
      };
      const changes = describeSaleChanges(ed, updatedItem);
      if (changes.length === 0) { setSaving(false); onDone(); return; }
      updatedItem.editedAt = Timestamp.now();
      updatedItem.editLog = [
        ...(ed.editLog || []),
        { at: Timestamp.now(), byName: saleFormUser?.name || "", changes },
      ];
      const items = existingItems.map((it, i) => (i === editItem.index ? updatedItem : it));
      await updateLead(lead.id, { saleItems: items, saleDetails: items[items.length - 1] });
      // Reflect the change in the tech Orders queue (idempotent; keeps status/assignment).
      try {
        await upsertOrderForSale({
          lead, item: updatedItem, itemIndex: editItem.index,
          soldByName: saleFormUser?.name || lead.displayName || "",
          salesAdminId: saleFormUser?.createdBy || null,
        });
      } catch { /* best-effort */ }
      if (saleFormUser) {
        await logActivity({
          actorId: saleFormUser.uid, actorName: saleFormUser.name, actorRole: "sales_member",
          adminId: saleFormUser.createdBy, action: "edited_sale_item",
          details: { leadId: lead.id, leadName: lead.displayName, amount, category, changes },
        });
      }
      setSaving(false);
      toast({ title: "Sale updated", description: `${changes.length} change${changes.length === 1 ? "" : "s"} saved and logged.` });
      onDone();
      return;
    }

    // ── Add a new sale ───────────────────────────────────────────────────────
    const newItem: SaleDetail = {
      category,
      packageKey: packageKey || "custom",
      ...saleShape,
      amount: finalAmount,
      verificationStatus: "pending",
      paymentScreenshotUrl: screenshotUrl || null,
      submittedAt: Timestamp.now(),
      disputed: isDuplicate,
      proofImageUrl: proofUrl || null,
      proofNote: proofNote.trim() || null,
      promise,
      requirement,
    };
    const updatedItems = [...existingItems, newItem];
    await updateLead(lead.id, { saleDone: true, saleItems: updatedItems, saleDetails: newItem });
    // Push straight to the tech Orders queue — approval is no longer a gate, so the tech team can
    // start immediately. `saleVerified: false` marks it as awaiting the sales admin's sign-off.
    try {
      await upsertOrderForSale({
        lead, item: newItem, itemIndex: updatedItems.length - 1,
        soldByName: saleFormUser?.name || lead.displayName || "",
        salesAdminId: saleFormUser?.createdBy || null,
        saleVerified: false,
      });
    } catch { /* best-effort: the sale is recorded even if the order write fails */ }
    if (saleFormUser) {
      await logActivity({
        actorId: saleFormUser.uid,
        actorName: saleFormUser.name,
        actorRole: "sales_member",
        adminId: saleFormUser.createdBy,
        action: "submitted_sale",
        details: {
          leadId: lead.id,
          leadName: lead.displayName,
          amount,
          category,
          packageKey: packageKey || "custom",
        },
      });
    }
    // Freeze this client so no other member can poach the number while it's sold.
    // Mirror the freeze onto the lead (for the member's list + admin Frozen tab) only after the
    // canonical lock write succeeds, so display never claims a freeze that isn't actually enforced.
    let froze = false;
    if (saleFormUser) {
      try {
        await applySaleFreeze({
          user: { uid: saleFormUser.uid, name: saleFormUser.name },
          phone: lead.phone,
          days: freezeDays,
          leadId: lead.id,
        });
        await updateLead(lead.id, buildLeadFreezeFields(freezeDays, saleFormUser.name));
        froze = true;
      } catch {
        /* non-fatal: the sale is already recorded */
      }
    }
    setSaving(false);
    /*
      What happened, in the terms the member needs.

      An over-discounted sale is NOT with the tech team, and saying it is would have the member
      promise the client a start date that is not going to happen.
    */
    const held = discount.needsApproval;
    const frozenNote = froze
      ? ` Client frozen for ${freezeDays} day${freezeDays > 1 ? "s" : ""}.`
      : "";
    toast({
      title: held ? "Sale saved — waiting on your admin" : "Sale Added",
      description: held
        ? `${formatCurrency(finalAmount)} recorded. ${discount.totalPercent}% off needs your sales admin's approval before it goes to the tech team.${frozenNote}`
        : `Sale of ${formatCurrency(finalAmount)} added & sent to the tech team.${frozenNote}`,
    });
    // Staying open for the next service on the same client, rather than closing and making them
    // find the button again.
    if (opts.keepOpen) { resetForNextService(); return; }
    onDone({ heldForApproval: held });
  };

  /**
   * The form, reset for the next service on the same client.
   *
   * Keeps what belongs to the CLIENT — their brief, their business name, their language — and
   * clears what belongs to the SERVICE. A client buying an ad, a logo and a website answers the
   * "who are you" questions once, and making them re-answer three times is how the second and
   * third sale end up never being recorded.
   */
  const resetForNextService = () => {
    setCategory("promotional");
    setPackageKey(DEFAULT_PROMOTIONAL_PACKAGE);
    setCustomAmount(0);
    setDescription("");
    setCustomBase("");
    setCustomClips(0);
    setTypedSeconds(null);
    setCustomPriceTouched(false);
    setQuantity(5);
    setDiscountValue(0);
    setDiscountTouched(false);
    // The screenshot and the earned discount belong to this payment, not the next one.
    setScreenshotUrl("");
    setReviewShot("");
    setReferralShot("");
  };

  return (
    <div className="space-y-3 bg-background border border-border rounded-lg p-3 mt-2">
      {editing ? (
        <div className="bg-info/10 border border-info/30 text-info text-xs rounded-md p-2 flex items-center gap-1.5">
          <Pencil size={12} /> Editing sale — every change is logged and sent to the tech team
        </div>
      ) : discount.needsApproval ? (
        /* The promise this banner makes has to be true. Over the member's own limit the sale does
           NOT go to the tech team, and telling them it does is how a client gets a start date. */
        <div className="flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
          <Lock size={12} /> Held until your admin approves the {discount.totalPercent}% discount
        </div>
      ) : (
        <div className="bg-warning/10 border border-warning/30 text-warning text-xs rounded-md p-2 flex items-center gap-1.5">
          <ExternalLink size={12} /> Sent to the tech team right away — admin will still verify
        </div>
      )}

      <select
        value={category}
        data-test="sale-category"
        onChange={(e) => { setCategory(e.target.value); setPackageKey(""); }}
        className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
      >
        {SALE_CATEGORIES.map((c) => (
          <option key={c} value={c}>{categoryLabel(c)}</option>
        ))}
      </select>

      {/* Which kind of video the bulk order is made of. Asked BEFORE the package because it is
          what decides the price list — bulk cinematic is priced as cinematic, not as promotional. */}
      {isBulk && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Which videos?</label>
          <select
            value={bulkAdType}
            data-test="bulk-type"
            onChange={(e) => {
              setBulkAdType(e.target.value);
              // The new kind has its own package list, so the old selection means nothing here.
              setPackageKey("");
            }}
            className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
          >
            {bulkTypesFor(category).map((t) => (
              <option key={t} value={t}>{categoryLabel(t)}</option>
            ))}
          </select>
        </div>
      )}

      {packages.length > 0 && (
        <select
          value={packageKey}
          data-test="sale-package"
          onChange={(e) => {
            setPackageKey(e.target.value);
            const pkg = packages.find((p) => p.label === e.target.value);
            if (pkg && pkg.amount > 0) setCustomAmount(pkg.amount);
          }}
          className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
        >
          <option value="">Select package</option>
          {packages.map((p) => (
            /* The monthly quota rides in the option text — a member quoting a package on a live
               call should not have to remember that Pro means eight of everything. */
            <option key={p.label} value={p.label}>{packageOptionLabel(p)}</option>
          ))}
        </select>
      )}

      {/* Bulk videos — quantity drives the price, and the ladder suggests a discount the member may
          keep, change or withhold, in percent or in rupees. Whatever they choose is recorded. */}
      {isBulk && bulkQuote && (
        <div className="space-y-2.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            <Layers size={13} /> Bulk {categoryLabel(adCategory)} order
          </div>
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-[11px] text-muted-foreground">How many videos</label>
              <input
                type="number"
                min={2}
                data-test="bulk-quantity"
                value={quantity || ""}
                onChange={(e) => setQuantity(Number(e.target.value) || 0)}
                className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary font-mono"
              />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between gap-1">
                <label className="text-[11px] text-muted-foreground">Discount</label>
                {/* The unit the client was quoted in. Switching converts what is already typed, so
                    the price on screen never jumps because the member changed how they say it. */}
                <div className="flex rounded-md border border-border overflow-hidden">
                  {(["percent", "amount"] as DiscountMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      data-test={`bulk-discount-mode-${m}`}
                      onClick={() => {
                        if (m === discountMode) return;
                        setDiscountValue(m === "amount" ? bulkQuote.discountAmount : bulkQuote.discountPercent);
                        setDiscountMode(m);
                      }}
                      className={`px-2 h-5 text-[10px] font-medium transition-colors ${
                        discountMode === m ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {m === "percent" ? "%" : "₹"}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="number"
                min={0}
                max={discountMode === "amount" ? maxDiscountAmount(bulkQuote.grossAmount) : MAX_BULK_DISCOUNT_PERCENT}
                data-test="bulk-discount"
                value={discountValue || ""}
                onChange={(e) => { setDiscountTouched(true); setDiscountValue(Number(e.target.value) || 0); }}
                className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary font-mono"
              />
            </div>
          </div>

          {bulkQuote.suggestedPercent > 0 && !bulkQuote.edited && (
            <p className="text-[11px] text-muted-foreground">
              {quantity} videos qualifies for <strong className="text-foreground">{bulkQuote.suggestedPercent}%</strong>
              {" "}({formatCurrency(bulkQuote.suggestedAmount)}) off. You can change or remove it.
            </p>
          )}
          {bulkQuote.edited && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              Suggested {bulkQuote.suggestedPercent}% ({formatCurrency(bulkQuote.suggestedAmount)}), you set{" "}
              {bulkQuote.discountPercent}% ({formatCurrency(bulkQuote.discountAmount)}) — the tech admin and sales admin will see this.
            </p>
          )}
          {discountMode === "amount" && discountValue > maxDiscountAmount(bulkQuote.grossAmount) && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Capped at {formatCurrency(maxDiscountAmount(bulkQuote.grossAmount))} — a bulk discount cannot exceed {MAX_BULK_DISCOUNT_PERCENT}%.
            </p>
          )}
          {quantity > 0 && quantity < 5 && (
            <p className="text-[11px] text-muted-foreground">Discounts start at 5 videos.</p>
          )}

          <div className="space-y-0.5 border-t border-amber-500/20 pt-2 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>{bulkQuote.quantity} × {formatCurrency(bulkQuote.unitAmount)}</span>
              <span className="font-mono">{formatCurrency(bulkQuote.grossAmount)}</span>
            </div>
            {bulkQuote.discountAmount > 0 && (
              <div className="flex justify-between text-green-600 dark:text-green-400">
                <span>Discount {bulkQuote.discountPercent}%</span>
                <span className="font-mono">− {formatCurrency(bulkQuote.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-foreground">
              <span>Client pays</span>
              <span className="font-mono" data-test="bulk-total">{formatCurrency(bulkQuote.amount)}</span>
            </div>
          </div>
        </div>
      )}

      {/*
        Custom, when the client wants a listed service at a length the price list does not carry.

        This is the two-minute promotional ad. Recorded as a free-text note it reached the tech
        team with no duration, no clip count, no price per clip and no deadline, and somebody read
        the note and re-typed all of it — which is where a two-minute sale quietly becomes a
        one-minute build. Naming the service and the seconds makes every rule keyed on a category
        apply to it unchanged.

        Left blank for a Custom sale that genuinely is not one of these (a software job); that
        behaves exactly as it always has.
      */}
      {category === "custom" && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles size={12} className="text-primary" /> Is this one of our services at a different length?
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => { setCustomBase(""); setCustomPriceTouched(false); }}
              data-test="custom-base-none"
              className={`h-8 rounded-lg border px-3 text-[11px] font-medium transition-colors ${
                !customBase ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              No — something else
            </button>
            {CUSTOM_BASE_CATEGORIES.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => { setCustomBase(key); setCustomPriceTouched(false); }}
                data-test={`custom-base-${key}`}
                className={`h-8 rounded-lg border px-3 text-[11px] font-medium transition-colors ${
                  customBase === key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                {categoryLabel(key)}
              </button>
            ))}
          </div>

          {isCustomService && (
            <div className="space-y-2 border-t border-border pt-2">
              <label className="text-xs font-medium text-muted-foreground">
                How long is the video?
              </label>
              {/*
                Tap a size, don't do arithmetic.

                Each button says the same length twice — the number of clips the tech team will
                build, and the number of seconds the client will watch — so the two halves of the
                company are never describing the ad in different units, and a member on the phone
                can read the seconds straight off the button they just pressed.
              */}
              <div className="flex flex-wrap gap-1.5" data-test="custom-clip-presets">
                {CLIP_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setClips(n)}
                    data-test={`custom-clips-${n}`}
                    className={`h-auto rounded-lg border px-3 py-1.5 text-left transition-colors ${
                      customClips === n
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    <span className="block text-[13px] font-semibold leading-tight">{n} clips</span>
                    <span className="block text-[10px] leading-tight opacity-80">
                      {humanDuration(secondsForClips(n))}
                    </span>
                  </button>
                ))}
              </div>
              {/* Anything not on the row above. Still clips, so it still needs no conversion. */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Or type the number of clips:</span>
                <input
                  type="number" min={0} max={200}
                  value={customClips || ""}
                  onChange={(e) => setClips(Number(e.target.value))}
                  data-test="custom-clips-input"
                  className="h-9 w-20 rounded-md border border-border bg-background px-2 text-center font-mono text-sm text-foreground outline-none focus:border-primary"
                />
                {customClips > 0 && (
                  <span className="text-[11px] font-medium text-foreground" data-test="custom-clips">
                    = {humanDuration(customTotalSeconds)} of video
                    {customClips >= 4 ? " + poster" : ""}
                  </span>
                )}
              </div>

              {/*
                The other way round: a client who asked for "one and a half minutes".

                Clips stay the stored unit — they are what gets built and what gets priced — but a
                member should never have to divide by eight on a call. Typing a time converts it
                here, in front of them, and the conversion is shown rather than applied silently:
                a length that is not a whole number of 8-second clips rounds UP, and the member
                needs to see that they are now selling 48 seconds before they quote 45.
              */}
              <div className="flex flex-wrap items-center gap-2" data-test="custom-minsec">
                <span className="text-[11px] text-muted-foreground">Or enter the time:</span>
                <input
                  type="number" min={0} max={30}
                  value={customMinutes || ""}
                  onChange={(e) => applyMinSec(Math.max(0, Number(e.target.value) || 0), customSecondsPart)}
                  data-test="custom-minutes"
                  className="h-9 w-16 rounded-md border border-border bg-background px-2 text-center font-mono text-sm text-foreground outline-none focus:border-primary"
                />
                <span className="text-xs text-muted-foreground">min</span>
                <input
                  type="number" min={0} max={59}
                  value={customSecondsPart || ""}
                  onChange={(e) => applyMinSec(customMinutes, Math.min(59, Math.max(0, Number(e.target.value) || 0)))}
                  data-test="custom-seconds"
                  className="h-9 w-16 rounded-md border border-border bg-background px-2 text-center font-mono text-sm text-foreground outline-none focus:border-primary"
                />
                <span className="text-xs text-muted-foreground">sec</span>
                {customClips > 0 && (
                  <span className="text-[11px] font-semibold text-primary" data-test="custom-minsec-clips">
                    = {customClips} clips
                  </span>
                )}
              </div>
              {/* Said plainly, and only when it actually happened. */}
              {roundedUpFrom !== null && (
                <p className="text-[11px] text-warning" data-test="custom-rounded-up">
                  {roundedUpFrom} sec is not a whole number of {CLIP_SECONDS}-second clips — rounded up
                  to {customClips} clips ({humanDuration(customTotalSeconds)}). The client gets the longer video.
                </p>
              )}
              {suggestedCustomPrice > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {/* Once the member has typed their own figure it stays theirs, even when the
                      length changes — they quoted a price to a client, and a form that quietly
                      re-writes it is a form that changes an agreed price behind their back. */}
                  Our price for this length: <b className="font-mono text-foreground">{formatCurrency(suggestedCustomPrice)}</b>
                  {customPriceTouched && customAmount !== suggestedCustomPrice && (
                    <>
                      {" · "}
                      <button type="button" onClick={() => { setCustomPriceTouched(false); setCustomAmount(suggestedCustomPrice); }}
                        className="font-medium text-primary hover:underline">
                        use it
                      </button>
                    </>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {needsCustomAmount && (
        <div className="space-y-1">
          {isCustomService && (
            <label className="text-xs font-medium text-muted-foreground">
              Amount the client is paying
            </label>
          )}
          <input
            type="number"
            min={1}
            value={customAmount || ""}
            onChange={(e) => { setCustomAmount(Number(e.target.value) || 0); setCustomPriceTouched(true); }}
            placeholder="Amount (₹)"
            data-test="sale-custom-amount"
            className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary font-mono"
          />
        </div>
      )}

      {/*
        What the client earned, and the proof of it.

        A published offer rather than a negotiation: applying it is always within a member's own
        authority, which is why the ordinary case never reaches the approval queue. Each claim
        carries its own screenshot, because a review screenshot does not prove a referral — and
        "they said they left one" is not a review.
      */}
      {amount > 0 && (
        <SaleSection
          testId="earned-discount"
          title={`Client discount — ${EARNED_DISCOUNT_PERCENT}% for a review or a referral`}
          icon={<BadgePercent size={13} className="text-success" />}
          active={discount.reasons.length > 0}
          // Re-opening a sale that already carries a discount shows it: folding away something the
          // member is halfway through editing reads as the form having lost it.
          defaultOpen={discount.reasons.length > 0}
          summary={
            discount.reasons.length > 0
              ? `${discount.earnedPercent}% off — ${discount.reasons.map((r) => EARNED_REASON_LABEL[r]).join(" + ")}`
              : "Not applied — tap if the client left a review or referred someone"
          }
        >
          {(["review", "referral"] as EarnedReason[]).map((reason) => {
            const url = reason === "review" ? reviewShot : referralShot;
            const set = reason === "review" ? setReviewShot : setReferralShot;
            return (
              <div key={reason} className="flex items-center gap-2">
                <label className={`flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 transition-colors ${
                  url ? "border-success/50 bg-success/5" : "border-border hover:border-primary/50"
                }`}>
                  <input
                    type="checkbox"
                    checked={!!url}
                    data-test={`earned-${reason}`}
                    onChange={(e) => {
                      // Unticking clears the proof: a claim with no screenshot is not a claim, and
                      // leaving a stale URL behind would keep the discount alive invisibly.
                      if (!e.target.checked) { set(""); return; }
                      document.getElementById(`earned-file-${reason}`)?.click();
                    }}
                    className="h-3.5 w-3.5 accent-emerald-600"
                  />
                  <span className="flex-1 text-[11.5px] text-foreground">{EARNED_REASON_LABEL[reason]}</span>
                  {earnedUploading === reason && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
                  {url && <CheckCircle2 size={13} className="shrink-0 text-success" />}
                </label>
                <input
                  id={`earned-file-${reason}`}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    setEarnedUploading(reason);
                    try {
                      set(await uploadToCloudinary(file));
                    } catch {
                      toast({ title: "Upload failed", description: "Could not upload that screenshot.", variant: "destructive" });
                    } finally {
                      setEarnedUploading(null);
                    }
                  }}
                />
                {url && (
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground"
                    title="View the screenshot">
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            );
          })}
          {discount.reasons.length === 0 && (
            <p className="text-[10.5px] leading-relaxed text-muted-foreground">
              Tick one and attach the screenshot. Both together are still {EARNED_DISCOUNT_PERCENT}% —
              it is a thank-you, not a running total.
            </p>
          )}
        </SaleSection>
      )}

      {/*
        A discount agreed on the call.

        Folded away by default and tinted the moment it holds something, like the sections either
        side of it — most sales carry no discount, and a box of empty inputs above the Save button
        is what pushes the thing people actually came to press below the fold on a phone.

        Bulk orders are excluded on purpose: their discount comes from the volume ladder just above,
        and offering two ways to discount the same order is how the two end up disagreeing.
      */}
      {!isBulk && amount > 0 && (
        <SaleSection
          testId="manual-discount"
          title="Discount agreed on the call"
          icon={<BadgePercent size={13} className="text-info" />}
          active={manualDiscountAmount > 0}
          defaultOpen={manualDiscountAmount > 0}
          summary={
            manualDiscountAmount > 0
              ? `${formatCurrency(manualDiscountAmount)} off — client pays ${formatCurrency(finalAmount)}`
              : "None — tap if you agreed a price reduction"
          }
        >
          <div className="flex items-center gap-1.5">
            {/* Percent or rupees, because members agree it both ways and converting in their head
                on a call is where the wrong figure gets typed. */}
            <div className="flex shrink-0 overflow-hidden rounded-lg border border-border">
              {(["percent", "amount"] as DiscountMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  data-test={`manual-discount-${m}`}
                  onClick={() => setManualMode(m)}
                  className={`h-8 px-2.5 text-xs font-semibold transition-colors ${
                    manualMode === m ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {m === "percent" ? "%" : "₹"}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={0}
              max={manualMode === "percent" ? 100 : amount}
              value={manualValue || ""}
              data-test="manual-discount-value"
              onChange={(e) => setManualValue(Math.max(0, Number(e.target.value) || 0))}
              placeholder={manualMode === "percent" ? "e.g. 10" : "e.g. 100"}
              className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-primary"
            />
            {manualDiscountAmount > 0 && (
              <button
                type="button"
                onClick={() => setManualValue(0)}
                data-test="manual-discount-clear"
                className="shrink-0 rounded-lg border border-border px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          {/*
            The authority line, said before they save rather than after.

            A member may give MEMBER_DISCOUNT_LIMIT_PERCENT on their own; past that the sale is
            recorded but held back from the tech team until the sales admin confirms the price.
            Discovering that from a job that never arrived is how a client gets promised a delivery
            date nobody is working towards.
          */}
          {manualDiscountAmount > 0 && (
            <p className={`text-[10.5px] leading-relaxed ${discount.needsApproval ? "text-warning" : "text-muted-foreground"}`}>
              {discount.needsApproval ? (
                <>
                  <AlertTriangle size={10} className="mr-1 inline align-[-1px]" />
                  {discount.totalPercent}% off is past the {MEMBER_DISCOUNT_LIMIT_PERCENT}% you can give on your
                  own. The sale is saved, but the tech team will not start it until your sales admin
                  approves the price.
                </>
              ) : (
                <>{discount.totalPercent}% off — within the {MEMBER_DISCOUNT_LIMIT_PERCENT}% you can give on your own, so this goes straight to the tech team.</>
              )}
            </p>
          )}
        </SaleSection>
      )}

      {/* What the client actually pays, once everything is off. */}
      {discount.totalAmount > 0 && (
        <div className="space-y-1 rounded-lg border border-success/30 bg-success/5 p-3 text-xs" data-test="discount-summary">
          <div className="flex justify-between text-muted-foreground">
            <span>Price</span>
            <span className="font-mono">{formatCurrency(discount.grossAmount)}</span>
          </div>
          {discount.earnedAmount > 0 && (
            <div className="flex justify-between text-success">
              <span>{discount.earnedPercent}% — {discount.reasons.map((r) => EARNED_REASON_LABEL[r]).join(" + ")}</span>
              <span className="font-mono">− {formatCurrency(discount.earnedAmount)}</span>
            </div>
          )}
          {discount.negotiatedAmount > 0 && (
            <div className="flex justify-between text-success">
              <span>{discount.negotiatedPercent}% — agreed on the call</span>
              <span className="font-mono">− {formatCurrency(discount.negotiatedAmount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-success/20 pt-1 font-semibold text-foreground">
            <span>Client pays</span>
            <span className="font-mono" data-test="final-amount">{formatCurrency(finalAmount)}</span>
          </div>
        </div>
      )}

      {/*
        Past 10% the sale stops being the member's to conclude.

        Said here, before they submit, rather than discovered later: the sale is still recorded and
        the client is still theirs — what waits is the handover to the tech team, because work
        started against a price nobody agreed cannot be un-started.
      */}
      {discount.needsApproval && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3" data-test="discount-approval-warning">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-warning">
              {discount.totalPercent}% off needs your sales admin's approval
            </p>
            <p className="text-[10.5px] leading-relaxed text-muted-foreground">
              You can give {MEMBER_DISCOUNT_LIMIT_PERCENT}% on your own. This sale will be saved and
              is yours, but it only goes to the tech team once your admin agrees the price — so tell
              the client the work starts after that.
            </p>
          </div>
        </div>
      )}

      {/* There is no package name to describe this sale, so the member has to. Without it the
          order reaches the tech team saying only "Custom" and somebody has to ring back and ask. */}
      {showDescription && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            What was sold{descriptionRequired ? "" : " (optional)"}
          </label>
          <textarea
            rows={2}
            data-test="sale-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={`e.g. Two-day event shoot with edited highlights`}
            className={`w-full px-3 py-2 rounded-md bg-card border text-foreground text-sm outline-none focus:border-primary resize-none ${descriptionMissing ? "border-destructive/60" : "border-border"}`}
          />
        </div>
      )}

      {/* Delivery promise / turnaround SLA — countdown starts at sale, shown to the tech team */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Clock size={12} /> Delivery promise to client
        </label>
        <div className="flex gap-2">
          <select
            value={slaPreset}
            onChange={(e) => setSlaPreset(e.target.value)}
            className="flex-1 h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
          >
            {slaOptions.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
            <option value={CUSTOM_PRESET_KEY}>Custom…</option>
          </select>
          {slaPreset === CUSTOM_PRESET_KEY && (
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                type="number"
                min={1}
                value={customDays || ""}
                onChange={(e) => setCustomDays(Number(e.target.value) || 0)}
                className="w-16 h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary font-mono"
              />
              <span className="text-xs text-muted-foreground">days</span>
            </div>
          )}
        </div>
      </div>

      {/*
        Who the work is for, and what they asked for — on EVERY service.

        ── Why this is no longer ad-only ─────────────────────────────────────────────────────────
        These two fields used to live inside the ad brief, so a Google Business Profile, a logo or
        a website arrived at the tech team with no business name and no note — just a category and
        an amount. Somebody then messaged the sales member to ask who it was for, which is the
        exact hand-off this whole pipeline exists to remove. The name and the note are not ad
        details: they are the answer to "what am I making, and for whom", and every service has one.

        The genuinely ad-specific fields — language, model, attire, ratio, occasion — stay in the
        block below, because none of them mean anything on a website.
      */}
      <div className="space-y-2.5 rounded-md border border-primary/25 bg-primary/5 p-2.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <StickyNote size={13} /> Client details
          <span className="ml-auto text-[10px] font-normal text-muted-foreground">Goes straight to the tech team</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-muted-foreground">Business name</label>
            <input
              type="text"
              value={req.businessName}
              data-test="sale-business-name"
              onChange={(e) => setReq((r) => ({ ...r, businessName: e.target.value }))}
              placeholder="e.g. Sharma Electronics"
              className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Business WhatsApp</label>
            <input
              type="text"
              value={req.businessWhatsapp}
              data-test="sale-business-whatsapp"
              onChange={(e) => setReq((r) => ({ ...r, businessWhatsapp: e.target.value }))}
              placeholder="e.g. 9876543210"
              className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary font-mono"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground">Notes for the tech team</label>
          <textarea
            value={req.notes}
            data-test="sale-notes"
            onChange={(e) => setReq((r) => ({ ...r, notes: e.target.value }))}
            maxLength={1000}
            placeholder={isAdSale
              ? "Anything else the client asked for — offers, tagline, colours, must-say lines…"
              : "Anything the client asked for — links, logins, colours, what they want it to say…"}
            className="w-full h-16 p-2 rounded-md bg-card border border-border text-foreground text-xs outline-none focus:border-primary resize-none"
          />
        </div>
      </div>

      {/* The rest of the ad brief — the parts that only mean something on a video. */}
      {isAdSale && (
        <div className="space-y-2.5 rounded-md border border-primary/25 bg-primary/5 p-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <Clapperboard size={13} /> Video requirement
            <span className="ml-auto text-[10px] font-normal text-muted-foreground">How the ad should be made</span>
          </div>

          {/* The occasion comes first on a greeting video, because it is what the video IS — the
              generator themes the wardrobe, the decorations, the colours and the script from it. */}
          {isWishesSale && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                <PartyPopper size={12} /> Which festival or occasion? *
              </label>
              <select
                value={festivalChoice}
                data-test="sale-festival"
                onChange={(e) => setFestivalChoice(e.target.value)}
                className={`w-full h-9 px-3 rounded-md bg-card border text-foreground text-sm outline-none focus:border-primary ${festivalMissing ? "border-destructive/60" : "border-border"}`}
              >
                <option value="">Select the occasion…</option>
                {WISHES_FESTIVALS.map((f) => <option key={f} value={f}>{f}</option>)}
                {/* A client can want a video for their own anniversary or shop opening — the list
                    is there to save typing, never to limit what can be sold. */}
                <option value={CUSTOM_FESTIVAL_OPTION}>Other occasion…</option>
              </select>
              {festivalChoice === CUSTOM_FESTIVAL_OPTION && (
                <input
                  type="text"
                  data-test="sale-festival-custom"
                  value={customFestival}
                  onChange={(e) => setCustomFestival(e.target.value)}
                  placeholder="e.g. Shop 5th anniversary, Birthday wishes…"
                  className={`w-full h-9 px-3 rounded-md bg-card border text-foreground text-sm outline-none focus:border-primary ${festivalMissing ? "border-destructive/60" : "border-border"}`}
                />
              )}
              <p className="text-[10px] text-muted-foreground">
                The tech team themes the whole video from this — ask the client if you're not sure.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-muted-foreground">Language</label>
              <select
                value={req.language}
                onChange={(e) => setReq((r) => ({ ...r, language: e.target.value }))}
                className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
              >
                {langOptions.map((l) => <option key={l} value={l}>{l}</option>)}
                <option value={LANGUAGE_CUSTOM}>Other language…</option>
              </select>
              {usingCustomLanguage && (
                <input
                  type="text"
                  value={customLanguage}
                  onChange={(e) => setCustomLanguage(e.target.value)}
                  placeholder="Type the language — it's saved for next time"
                  className="w-full h-9 mt-1.5 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
                />
              )}
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Special category</label>
              <select
                value={req.specialCategory}
                onChange={(e) => setReq((r) => ({ ...r, specialCategory: e.target.value }))}
                className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
              >
                <option value="">Normal ad (with a model)</option>
                {characterPackOptions().map((o) => <option key={o.id} value={o.id}>🎭 {o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Where a cartoon-duo ad is set. The tech member cannot start a "client's photos" job
              until those photos arrive, so this is asked while the client is still on the call. */}
          {salePack && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 space-y-2">
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                <b>{salePack.label}</b> — {salePack.tagline}. Both characters speak in every clip. Same price as a normal ad.
              </p>
              <div>
                <label className="text-[11px] text-muted-foreground">Is the client sending photos of their shop / office?</label>
                <div className="grid grid-cols-2 gap-1.5 mt-1">
                  {([
                    { v: true, label: "📷 Yes — use their business background" },
                    { v: false, label: "🏙️ No — create AI background" },
                  ] as const).map(({ v, label }) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => setReq((r) => ({ ...r, realLocationProvided: v }))}
                      className={`h-9 rounded-md text-xs font-medium border transition-colors ${
                        req.realLocationProvided === v
                          ? "border-amber-500 bg-amber-500/20 text-amber-700 dark:text-amber-300"
                          : "border-border bg-card text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {req.realLocationProvided && (
                <p className="text-[10px] text-amber-700 dark:text-amber-300 leading-relaxed">
                  Collect every angle they can send — inside, outside, counter, product shelf. Each clip is set in a
                  different one of their photos, so more photos means a better ad.
                </p>
              )}
            </div>
          )}

          {!salePack && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
            <label className="text-[11px] text-muted-foreground">Model</label>
            <div className="grid grid-cols-2 gap-1.5">
              {[ModelGender.FEMALE, ModelGender.MALE].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setReq((r) => ({ ...r, modelGender: g, attireType: attireForGender(g, r.attireType) }))}
                  className={`h-9 rounded-md text-xs font-medium border transition-colors ${
                    req.modelGender === g ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {g === ModelGender.FEMALE ? "👩 Female" : "👨 Male"}
                </button>
              ))}
            </div>
            </div>
          </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {!salePack && (
            <div>
              <label className="text-[11px] text-muted-foreground">Model attire</label>
              <select
                value={req.attireType}
                onChange={(e) => setReq((r) => ({ ...r, attireType: e.target.value as AttireType }))}
                className="w-full h-9 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
              >
                {ATTIRE_OPTIONS_BY_GENDER[req.modelGender].map((a) => (
                  <option key={a} value={a}>{ATTIRE_LABELS[a]}</option>
                ))}
              </select>
              {req.attireType === AttireType.CUSTOM && (
                <input
                  type="text"
                  value={req.customAttire}
                  onChange={(e) => setReq((r) => ({ ...r, customAttire: e.target.value }))}
                  placeholder="Describe the exact attire…"
                  className="w-full h-9 mt-1.5 px-3 rounded-md bg-card border border-border text-foreground text-sm outline-none focus:border-primary"
                />
              )}
            </div>
            )}
            <div>
              <label className="text-[11px] text-muted-foreground">Aspect ratio</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(["9:16", "16:9"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReq((prev) => ({ ...prev, aspectRatio: r }))}
                    className={`h-9 rounded-md text-xs font-mono font-medium border transition-colors ${
                      req.aspectRatio === r ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

        </div>
      )}

      {/*
        How much of it was actually collected.

        ── Why this is on every sale, not just social media ────────────────────────────────────
        Half up front is the norm on a social-media month, with the rest due once the first post is
        made, posted and the campaign is running. On ads it is not supposed to happen — but it does,
        and there was nowhere to say so, which left a member two bad choices: record the full amount
        and take incentives on money nobody had handed over, or not record the sale at all. Both are
        worse than an honest number, so the box is here for every category.
      */}
      {finalAmount > 0 && (
        <SaleSection
          testId="advance-block"
          title="Payment collected"
          icon={<IndianRupee size={13} className={advanceCollected ? "text-warning" : "text-muted-foreground"} />}
          active={advanceCollected}
          // Opened for a sale that already has a balance, so nobody has to go looking for it.
          defaultOpen={advanceCollected}
          summary={
            !advanceCollected
              ? `Paid in full — ${formatCurrency(finalAmount)} received`
              : advancePending > 0
                ? `${formatCurrency(advancePending)} still to collect from the client`
                : `Full ${formatCurrency(finalAmount)} collected`
          }
        >
          <label className="flex cursor-pointer items-start gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={advanceCollected}
              data-test="advance-toggle"
              onChange={(e) => {
                setAdvanceCollected(e.target.checked);
                // Half is the common case and the one worth pre-filling; it stays editable.
                if (e.target.checked && advanceAmount <= 0) setAdvanceAmount(Math.round(finalAmount / 2));
              }}
              className="mt-0.5 h-3.5 w-3.5 accent-primary"
            />
            <span>
              <b>Advance collected</b> — the client has paid only part of {formatCurrency(finalAmount)} so far
            </span>
          </label>

          {advanceCollected && (
            <div className="space-y-1.5 border-t border-border pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Amount collected now</span>
                <input
                  type="number" min={0} max={finalAmount}
                  value={advanceAmount || ""}
                  data-test="advance-amount"
                  onChange={(e) => setAdvanceAmount(Math.max(0, Math.min(finalAmount, Number(e.target.value) || 0)))}
                  className="h-9 w-28 rounded-md border border-border bg-background px-2 text-right font-mono text-sm text-foreground outline-none focus:border-primary"
                />
                {[0.5, 1].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setAdvanceAmount(Math.round(finalAmount * f))}
                    className="h-7 rounded-md border border-border px-2 text-[11px] font-medium text-muted-foreground hover:bg-accent"
                  >
                    {f === 1 ? "Full" : "50%"}
                  </button>
                ))}
              </div>
              {/* The number that matters, said in rupees rather than left to be worked out. */}
              <p
                className={`text-[11px] font-medium ${advancePending > 0 ? "text-warning" : "text-success"}`}
                data-test="advance-pending"
              >
                {advancePending > 0
                  ? `Pending payment: ${formatCurrency(advancePending)} still to collect from the client.`
                  : "Nothing pending — the full amount has been collected."}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Your revenue and incentives count {formatCurrency(advanceAmount)} today. The rest counts
                on the day you collect it, and this sale will sit in <b>Pending payments</b> until then.
              </p>
            </div>
          )}
        </SaleSection>
      )}

      <label className="block cursor-pointer">
        <div className={`border border-dashed rounded-md p-3 text-center transition-colors ${screenshotUrl ? "border-success/50" : "border-destructive/40 hover:border-primary/50"}`}>
          {uploading ? (
            <div className="flex items-center gap-2 justify-center text-xs text-primary">
              <Loader2 size={16} className="animate-spin" /> Uploading screenshot…
            </div>
          ) : screenshotUrl ? (
            <div className="flex items-center gap-2 justify-center text-xs text-success">
              <Check size={14} /> Payment screenshot uploaded
            </div>
          ) : (
            <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground">
              <Upload size={14} /> Upload payment screenshot <span className="text-destructive">*</span>
            </div>
          )}
        </div>
        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
      </label>

      {/* Duplicate dispute — proof required (another member already sold this number) */}
      {isDuplicate && (
        <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
          <div className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>This number was already sold by another member. Upload a call-record image <b>or</b> write a note as proof of who made the sale.</span>
          </div>
          <label className="block cursor-pointer">
            <div className="border border-dashed border-destructive/40 rounded-md p-2.5 text-center hover:border-destructive/60 transition-colors">
              {proofUploading ? (
                <Loader2 size={16} className="animate-spin text-destructive mx-auto" />
              ) : proofUrl ? (
                <div className="flex items-center gap-2 justify-center text-xs text-success">
                  <Check size={14} /> Proof image uploaded
                </div>
              ) : (
                <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground">
                  <Upload size={14} /> Upload call-record / proof image
                </div>
              )}
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleProofUpload(f); }} />
          </label>
          <textarea
            value={proofNote}
            onChange={(e) => setProofNote(e.target.value)}
            maxLength={500}
            placeholder="…or write a proof note (e.g. called at 3pm, spoke to owner, paid via GPay)"
            className="w-full h-16 p-2 rounded-md bg-card border border-border text-foreground text-xs outline-none focus:border-primary resize-none"
          />
        </div>
      )}

      {/* Freeze duration — protect this sold client from other members. Only when adding: an edit
          doesn't re-freeze (the client is already protected from the original sale). */}
      {!editing && (
        <div className="flex items-center justify-between gap-2 bg-success/5 border border-success/20 rounded-md px-3 h-9">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock size={12} className="text-success" /> Freeze client for
          </span>
          <select
            value={freezeDays}
            onChange={(e) => setFreezeDays(Number(e.target.value))}
            className="h-7 px-2 rounded-md bg-card border border-border text-foreground text-xs outline-none focus:border-primary"
          >
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-2">
        <button
          onClick={() => handleSave()}
          data-test="save-sale"
          disabled={blocked}
          className="w-full h-9 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-xs hover:bg-primary/90 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving
            ? "Saving..."
            : blockReason
              || (editing
                ? `Save changes — ${formatCurrency(finalAmount)}`
                : `Add Sale — ${formatCurrency(finalAmount)}`)}
        </button>

        {/*
          The second thing this client bought, without closing anything.

          A client who takes an ad, a logo and a website does it on one call, and the member is
          still on that call. Saving and being returned to a fresh service form — with the client's
          own details still filled in — is the difference between three sales being recorded and
          one being recorded and two being meant to.
        */}
        {!editing && (
          <button
            onClick={() => handleSave({ keepOpen: true })}
            data-test="save-and-add-another"
            disabled={blocked}
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-40"
          >
            <Plus size={13} /> Save &amp; add another service for this client
          </button>
        )}
      </div>
    </div>
  );
}

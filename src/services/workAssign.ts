/**
 * Creating a work assignment — one implementation, whoever is doing the assigning.
 *
 * The tech admin's and the team leader's Work Assign pages, and the Orders queue, all used to
 * hand-roll the same `addDoc` with slightly different field sets, which is how an assignment made
 * from an order could end up missing the ad spec the sales member captured. There is now one path:
 * pass the spec, optionally pass the order it came from, and the order is linked, flipped to
 * "assigned" and the member notified as part of the same call.
 */
import { collection, doc, deleteDoc, setDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { format } from "date-fns";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { normalizePhone } from "@/utils/phone";
import { categoryLabel, isAdCategory } from "@/utils/serviceCatalog";
import { isPosterCategory, posterSizeLabel, DEFAULT_POSTER_SIZE } from "@/utils/posterSpec";
import { AUTO_POSTER_STYLE } from "@/services/posterStyles";
import { resolveModelSpec } from "@/utils/adRequirement";
import { getCharacterPack, isCustomPack } from "@/services/characterPacks";
import { AttireType, ModelGender } from "@/types/aiPlatform";
import { findUnassignedOrderForPhone, revertOrderToUnassigned } from "@/services/orders";
import { logTechActivity, type ActivityActor } from "@/services/activityLog";
import {
  createOrderChat, attachAssignmentToChat, detachAssignmentFromChat, deleteOrderChat, joinMonthRoom,
} from "@/services/orderChat";
import { orderChatIdOf } from "@/utils/orderChatId";
import { saleIdOfOrderId } from "@/utils/saleIdentity";
import { ORDER_TRACKS } from "@/types";
import type { Order, OrderTrack, WorkAssignment } from "@/types";

/** Sequential, readable work id (W001 / P002 / C003 / O004) — defined with the Orders pipeline. */
export { nextWorkUniqueId } from "@/services/orders";

/** Why a job could not be made for an order — said in words the assigner can act on. */
export class AssignmentRefusedError extends Error {
  constructor(readonly code: "sale_gone" | "order_closed" | "already_assigned", message: string) {
    super(message);
    this.name = "AssignmentRefusedError";
  }
}

/**
 * Does this order take ONE job? An ordinary sale is one ad — one job. A bulk order, a social-media
 * month and a split (tracks) are shared out, one job per person.
 */
function takesOneJob(order: Order, input: { tracks?: OrderTrack[]; smmCampaignId?: string | null }): boolean {
  if (input.smmCampaignId || input.tracks?.length) return false;
  if (order.progress) return false;
  if (order.category === "social_media_management" || order.category === "bulk_ads") return false;
  return !((order.quantity || 1) > 1);
}

/**
 * Whether a job may be made for this order, read inside the transaction (2026-10-08).
 *
 * The order the Assign form holds was read when the form opened. In the meantime its sale can be
 * deleted (the order with it) or someone else can assign it — and `addDoc` then wrote a job anyway: a
 * job in My Work for a sale that no longer existed, or a second job for one ad. Returns the refusal,
 * or null when the job may go ahead.
 */
function assignmentRefusal(order: Order | null, liveJob: WorkAssignment | null, oneJob: boolean): AssignmentRefusedError | null {
  if (!order) {
    return new AssignmentRefusedError("sale_gone", "This sale was deleted by the salesperson, so there is nothing to assign. It has left the queue.");
  }
  if (order.deleted || order.status === "deleted") {
    return new AssignmentRefusedError("order_closed", "This order was removed from the queue. Restore it first if the work is still wanted.");
  }
  if (order.status === "cancelled") {
    return new AssignmentRefusedError("order_closed", "This order was cancelled — its sale was rejected or withdrawn.");
  }
  if (oneJob && liveJob) {
    const who = order.assignedToName ? ` to ${order.assignedToName}` : "";
    return new AssignmentRefusedError("already_assigned", `This order is already assigned${who} (${liveJob.uniqueId || "a job"}). Unassign or reassign that job instead.`);
  }
  return null;
}

function generateAccessCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export interface CreateWorkAssignmentInput {
  assignedTo: string;
  /** The assignee's display name — recorded on the order so the queue reads without a lookup. */
  assignedToName?: string;
  assignerUid: string;
  category: string;
  duration: string;
  clipCount: number;
  pricePerUnit: number;
  uniqueId: string;
  businessName?: string;
  businessWhatsapp?: string;
  modelGender?: string;
  attireType?: string;
  customAttire?: string;
  aspectRatio?: "9:16" | "16:9";
  language?: string;
  /** The occasion a wishes video — or a poster — is for, carried from the sale. */
  festival?: string;
  requirementNotes?: string;
  /** The sale's client-facing brief ("Business info & what to include"). */
  businessInfo?: string;
  /** Where the business is, from the sale. */
  businessAddress?: string;
  /** Poster jobs only. See utils/posterSpec and services/posterStyles. */
  posterSize?: string;
  posterStyle?: string;
  posterCount?: number;
  /** Special-category cartoon duo (a services/characterPacks id), when one was sold. */
  characterPack?: string;
  /** For the Custom Character entry: who the character is, in the team's words. */
  customCharacter?: string;
  /**
   * Whether the client is supplying photographs of their own premises — on EVERY ad job, not only
   * a pack one. The generator writes a different location prompt for each answer, so a job handed
   * out without it is a job the member has to guess at.
   */
  realLocationProvided?: boolean;
  /** The order this fulfils, when it came from the Orders queue. */
  order?: Order | null;
  /**
   * Which parts of a split social-media month this member owns. A member holding two of the three
   * jobs gets ONE assignment naming both, rather than two cards for the same month.
   */
  tracks?: OrderTrack[];
  /**
   * The social-media month this job is for (its campaign id). Lets the month find its members' jobs
   * — to update one instead of duplicating it, and to follow a change of video length — and lets My
   * Work link back to the month's plan. See services/smmAssign.
   */
  smmCampaignId?: string | null;
  /**
   * The client chat this job shares with the rest of its month, for a social-media month with no
   * order behind it (a no-sale month, or one started directly). A sold month's jobs all join the
   * order's room; without this, each person on an orderless month would open a room of their own and
   * the client would be handed two or three links for one month. The room is created by the first job
   * and joined by the rest. See services/smmAssign.
   */
  roomId?: string | null;
  /**
   * The salesperson behind work that has no order — the no-sale month's — so they are in its room the
   * way a seller is in a sold month's. An order-backed job reads its seller off the order.
   */
  soldBy?: { uid: string; name: string } | null;
  /** Shown in the assignee's notification. */
  memberLink?: string;
  /** The assigner's display name, for the client chat this creates. */
  assignerName?: string;
  /**
   * The tech admin over this team, so they can open the client chat too. The assigner is already
   * on it; when a team leader assigns, their admin would otherwise be locked out of a conversation
   * they are answerable for.
   */
  techAdminUid?: string | null;
  /**
   * The person assigning, for the activity feed. Optional so no caller breaks, but every screen
   * that hands work out has the signed-in user and should pass it — an unattributed reassignment
   * is exactly the kind of change nobody can explain a week later.
   */
  actor?: ActivityActor | null;
}

/** Creates the assignment, links + advances any originating order, and notifies the member. */
export async function createWorkAssignment(input: CreateWorkAssignmentInput): Promise<{ id: string; accessCode: string }> {
  const {
    assignedTo, assignedToName, assignerUid, category, duration, clipCount, pricePerUnit, uniqueId,
    businessName, businessWhatsapp, modelGender, attireType, customAttire, aspectRatio,
    language, festival, requirementNotes, characterPack, customCharacter, realLocationProvided,
    businessInfo, businessAddress, posterSize, posterStyle, posterCount,
    order, tracks, smmCampaignId, roomId, soldBy, memberLink = "/tech/my-work", assignerName, techAdminUid, actor,
  } = input;
  const poster = isPosterCategory(category);

  /*
    A human-model special category ("Normal Ad (Female)"…) decides the gender, and the attire has
    to suit it. Normalised here as well as in the forms, because this is the one door every new
    job goes through.
  */
  const modelSpec = modelGender && attireType
    ? resolveModelSpec({
        characterPack,
        modelGender: modelGender as ModelGender,
        attireType: attireType as AttireType,
        customAttire,
      })
    : null;

  const accessCode = generateAccessCode();
  const business = (businessName || "").trim();
  const phone = (businessWhatsapp || "").trim();

  /**
   * Work assigned straight from Work Assign (rather than from the Orders queue) still belongs to
   * a sale if one exists for that client's number — so it adopts the waiting order instead of
   * leaving it stuck in "unassigned" while the work is already being done.
   *
   * Never for a social-media month's job: the month already knows whether it has an order and passes
   * it. A month with none (a no-sale month) must not pick up the client's NEXT month — their renewal
   * sale, waiting in the queue for the same number — and quietly mark that sale as being worked on.
   */
  const candidate = order ?? (phone && !smmCampaignId ? await findUnassignedOrderForPhone(phone, category) : null);
  const ref = doc(collection(db, "work_assignments"));

  /** The job as written — linked to its order (and sale) when it has one. */
  const jobFor = (linkedOrder: Order | null) => {
    /** A shared month room, only for work with no order — an order's room always wins. */
    const sharedRoom = linkedOrder ? null : (roomId || null);
    return {
    assignedTo,
    assignedBy: assignerUid,
    assignedAt: serverTimestamp(),
    assignedAtIso: new Date().toISOString(),
    category,
    clipCount,
    includesEndCredits: false,
    duration,
    pricePerUnit,
    totalPrice: pricePerUnit,
    uniqueId,
    accessCode,
    businessName: business,
    clientName: business,
    ...(phone ? { businessWhatsapp: normalizePhone(phone) } : {}),
    displayTitle: `${categoryLabel(category)} - ${uniqueId}`,
    status: "assigned",
    sessions: [],
    totalDurationSeconds: 0,
    date: format(new Date(), "yyyy-MM-dd"),
    // A poster has no model, no attire and no video ratio — writing the form's defaults onto it
    // would brief a presenter who never appears.
    ...(!poster && modelSpec ? { modelGender: modelSpec.modelGender } : {}),
    ...(!poster && modelSpec ? { attireType: modelSpec.attireType } : {}),
    ...(!poster && modelSpec?.attireType === "custom" && modelSpec.customAttire ? { customAttire: modelSpec.customAttire } : {}),
    ...(!poster && aspectRatio ? { aspectRatio } : {}),
    ...(language ? { language } : {}),
    // Only on a wishes job or a poster — the category decides whether an occasion means anything,
    // and a festival left on a promotional ad would theme one that nobody sold.
    ...((category === "wishes" || poster) && festival?.trim() ? { festival: festival.trim() } : {}),
    ...(requirementNotes?.trim() ? { requirementNotes: requirementNotes.trim() } : {}),
    ...(businessInfo?.trim() ? { businessInfo: businessInfo.trim() } : {}),
    ...(businessAddress?.trim() ? { businessAddress: businessAddress.trim() } : {}),
    ...(poster ? {
      posterSize: posterSize?.trim() || DEFAULT_POSTER_SIZE,
      posterStyle: posterStyle?.trim() || AUTO_POSTER_STYLE,
      ...(posterCount && posterCount > 1 ? { posterCount: Math.floor(posterCount) } : {}),
    } : {}),
    ...(!poster && characterPack ? { characterPack } : {}),
    ...(!poster && characterPack && customCharacter?.trim() && isCustomPack(getCharacterPack(characterPack))
      ? { customCharacter: customCharacter.trim() } : {}),
    /**
     * Where the ad is set, on every ad job.
     *
     * It used to be written only alongside a character pack, on the reasoning that a lone location
     * flag on an ordinary job was noise. It was the opposite of noise: without it every normal ad
     * reached the generator as "build the location", whatever the client had been asked to send,
     * and the member had no way of knowing a boot-full of shop photographs was waiting in the chat.
     *
     * Written for ad categories only — a website job has no location to shoot.
     */
    ...(isAdCategory(category) ? { realLocationProvided: realLocationProvided === true } : {}),
    ...(linkedOrder ? { orderId: linkedOrder.id } : {}),
    // The sale behind the job — its one permanent id (utils/saleIdentity), read off the order.
    ...(linkedOrder && (linkedOrder.saleId || saleIdOfOrderId(linkedOrder.id))
      ? { saleId: linkedOrder.saleId || saleIdOfOrderId(linkedOrder.id) } : {}),
    /**
     * Where this job's conversation lives.
     *
     * The order's own id, because the sales member has been using that room since the sale — the
     * client's brief, their logo and their changes are already in it. Written explicitly rather
     * than derived, so the hundreds of rooms already keyed on an assignment id keep working
     * untouched. See utils/orderChatId.
     */
    ...(linkedOrder ? { chatId: linkedOrder.id } : sharedRoom ? { chatId: sharedRoom } : {}),
    ...(linkedOrder?.promise ? { promise: linkedOrder.promise } : {}),
    ...(tracks?.length ? { tracks } : {}),
    ...(smmCampaignId ? { smmCampaignId } : {}),
    };
  };

  /*
    ── The job and its order, in one transaction (2026-10-08) ─────────────────────────────────────
    The order is read again here, not trusted from the screen: the Assign form holds the copy it
    opened with, and in the meantime the sale may have been deleted (its order with it) or somebody
    else may have assigned it. Writing the job and then updating the order separately left a job in
    My Work for a sale that no longer existed, or a second job for one ad. Now the job is written only
    together with its order's "assigned", and refused when the order is gone, closed or (for a
    one-ad order) already has a job.
  */
  let linkedOrder: Order | null = null;
  if (candidate) {
    const orderRef = doc(db, "orders", candidate.id);
    linkedOrder = await runTransaction(db, async (tx) => {
      const snap = await tx.get(orderRef);
      const fresh = snap.exists() ? ({ ...(snap.data() as Order), id: candidate.id }) : null;
      let liveJob: WorkAssignment | null = null;
      if (fresh?.workAssignmentId) {
        const jobSnap = await tx.get(doc(db, "work_assignments", fresh.workAssignmentId));
        if (jobSnap.exists()) liveJob = { ...(jobSnap.data() as WorkAssignment), id: jobSnap.id };
      }
      const refusal = assignmentRefusal(fresh, liveJob, fresh ? takesOneJob(fresh, { tracks, smmCampaignId }) : true);
      if (refusal) {
        // An order picked up by the client's number, not chosen: it is simply not free any more, so the
        // job goes ahead on its own — exactly as when no waiting order was found.
        if (!order) {
          tx.set(ref, jobFor(null));
          return null;
        }
        throw refusal;
      }
      tx.set(ref, jobFor(fresh));
      tx.update(orderRef, {
        status: "assigned",
        workAssignmentId: ref.id,
        assignedTo,
        assignedToName: assignedToName || null,
        techAdminId: assignerUid,
        updatedAt: serverTimestamp(),
      });
      return fresh;
    });
  } else {
    await setDoc(ref, jobFor(null));
  }
  /** A shared month room, only for work with no order — an order's room always wins. */
  const sharedRoom = linkedOrder ? null : (roomId || null);

  /**
   * The client's chat room, opened with the work.
   *
   * Created here rather than on first use so the leader can hand the link over in the same breath
   * as assigning the job — the whole point is that nobody has to go and build a WhatsApp group
   * before the client can send their logo.
   *
   * The sales member who sold it goes in at the same moment, and for the same reason the room
   * exists at all: clients hand their photos, logos and last-minute changes to whoever they bought
   * from, and until now that person had nowhere to put them. One place, everyone who is working on
   * the ad reading it.
   */
  const chatFields = {
    accessCode,
    uniqueId,
    category,
    businessName: business,
    clientPhone: phone ? normalizePhone(phone) : undefined,
    memberUid: assignedTo,
    memberName: assignedToName,
    assignerUid,
    assignerName,
    techAdminUid,
    soldByUid: linkedOrder?.soldBy ?? soldBy?.uid ?? null,
    soldByName: linkedOrder?.soldByName ?? soldBy?.name ?? null,
    orderId: linkedOrder?.id ?? null,
  };

  if (linkedOrder) {
    // The room is already open and already holds whatever the seller has put in it. Join it.
    await attachAssignmentToChat({
      chatId: linkedOrder.id,
      assignmentId: ref.id,
      accessCode,
      uniqueId,
      memberUid: assignedTo,
      memberName: assignedToName,
      assignerUid,
      assignerName,
      techAdminUid,
      // A sale taken before rooms opened at sale time has nothing to attach to.
      fallback: { ...chatFields, chatId: linkedOrder.id },
    });
  } else if (sharedRoom) {
    // The month's own room: the first job of the month opens it, the rest join it.
    await joinMonthRoom({
      chatId: sharedRoom,
      assignmentId: ref.id,
      accessCode,
      uniqueId,
      memberUid: assignedTo,
      memberName: assignedToName,
      assignerUid,
      assignerName,
      techAdminUid,
      fallback: { ...chatFields, chatId: sharedRoom },
    });
  } else {
    // No sale behind this job, so nothing opened a room earlier — it starts here, on the
    // assignment's own id, exactly as it always did.
    await createOrderChat({ ...chatFields, assignmentId: ref.id });
  }

  // (The order was marked "assigned" in the transaction above, together with the job.)

  // A split month reads as the jobs handed over, not as "N clips" — the member needs to know
  // whether they are making the ads or running the campaigns, which the clip count cannot say.
  const trackNames = (tracks || [])
    .map((t) => ORDER_TRACKS.find((x) => x.key === t)?.label || t)
    .join(" + ");
  const what = trackNames
    ? `${trackNames} on ${business || categoryLabel(category)}`
    : poster
      ? `a new poster${posterCount && posterCount > 1 ? ` ×${posterCount}` : ""} (${posterSizeLabel(posterSize)})${business ? ` for ${business}` : ""}`
      : `a new ${category} work (${clipCount} clips, ${duration})`;

  /**
   * The client’s own words, carried into the notification itself.
   *
   * The note used to travel in one place only: the WhatsApp requirements message the tech admin
   * copies out by hand. Assign through the split dialog, which builds no such message, or simply
   * dismiss the popup without sending, and the member never saw it — which is why it arrived only
   * “sometimes”. It sits on the assignment card now, and it opens with the alert that sends them
   * there, so the first thing they read already contains what the client asked for.
   *
   * Trimmed because a notification is a line, not a brief: the full text lives on the job.
   */
  const clientNote = requirementNotes?.trim() || "";
  const noteForAlert = clientNote
    ? ` 📝 Client asked: ${clientNote.slice(0, 140)}${clientNote.length > 140 ? "…" : ""}`
    : "";

  await sendNotification({
    userId: assignedTo,
    type: "work_assigned",
    title: "New Work Assigned",
    message: `You have been assigned ${what}.${
      linkedOrder?.promise ? ` Deliver within ${linkedOrder.promise.label}.` : ""
    } Access code: ${accessCode}${noteForAlert}`,
    link: memberLink,
    // One assignment is one "you have new work" notification for that member.
    dedupeKey: `work_assigned_${ref.id}_${assignedTo}`,
  });

  await logTechActivity({
    actor,
    action: "assigned_work",
    details: {
      assignmentId: ref.id,
      uniqueId,
      memberUid: assignedTo,
      memberName: assignedToName || "",
      category,
      businessName: business,
      clipCount,
      duration,
      orderId: linkedOrder?.id ?? null,
      // A month split three ways is three different jobs; the feed has to say which one moved.
      tracks: tracks || null,
      fromOrder: !!linkedOrder,
    },
  });

  return { id: ref.id, accessCode };
}

export interface UnassignWorkInput {
  assignmentId: string;
  /** The member losing the work — they are told, rather than finding it gone. */
  assignedTo: string;
  /** The order this fulfilled, when it came from the Orders queue. */
  orderId?: string | null;
  /** Business/display name, for the member's notification. */
  title?: string;
  /** Who took the work back, for the activity feed. */
  actor?: ActivityActor | null;
  /** The member's display name, so the feed reads as a name rather than a uid. */
  assignedToName?: string | null;
  /**
   * Where this job's chat lives — `orderChatIdOf(assignment)`. Defaults to the assignment's own id
   * so a caller that has not been updated still points at the right room for older work.
   */
  chatId?: string | null;
}

/**
 * Takes work back off a member and returns it to the Orders queue.
 *
 * The counterpart to createWorkAssignment, and the missing half of the pipeline: once work was
 * assigned there was no way to undo it, so a job given to the wrong member — or to someone who
 * turned out to be on leave — could only be deleted, which quietly destroyed the sale's link to
 * the tech side. Now the assignment is removed and the order flips back to "unassigned", where
 * anyone can pick it up and assign it to someone else.
 *
 * `returnedToQueue` is false for a job created directly in Work Assign with no order behind it:
 * there is nothing to return it to, and inventing an order would put a job in the sales pipeline
 * that nobody sold. The caller tells the user which of the two happened.
 */
export async function unassignWork(input: UnassignWorkInput): Promise<{ returnedToQueue: boolean }> {
  const { assignmentId, assignedTo, orderId, title, actor, assignedToName } = input;
  const chatId = input.chatId || assignmentId;

  // Order first: if this throws, the assignment is still on the member and the state stays
  // consistent. Deleting first could strand the order as "assigned" to work that no longer exists.
  if (orderId) await revertOrderToUnassigned(orderId);
  await deleteDoc(doc(db, "work_assignments", assignmentId));
  /**
   * The conversation survives the assignment. The room belongs to the ORDER now, and the order is
   * going straight back into the queue — so the client's brief, their logo and everything else in
   * the thread is exactly what the next member needs. See `detachAssignmentFromChat`.
   */
  await detachAssignmentFromChat(
    chatId,
    "This job has gone back to the team queue and will be picked up by another member shortly.",
  );

  await sendNotification({
    userId: assignedTo,
    type: "work_unassigned",
    title: "Work Removed",
    message: `${title ? `"${title}" has` : "A job has"} been taken off your list and returned to the queue. Nothing further is needed from you.`,
    link: "/tech/my-work",
  });

  await logTechActivity({
    actor,
    action: "unassigned_work",
    details: {
      assignmentId,
      memberUid: assignedTo,
      memberName: assignedToName || "",
      businessName: title || "",
      orderId: orderId ?? null,
      returnedToQueue: !!orderId,
    },
  });

  return { returnedToQueue: !!orderId };
}

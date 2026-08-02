/**
 * Creating a work assignment — one implementation, whoever is doing the assigning.
 *
 * The tech admin's and the team leader's Work Assign pages, and the Orders queue, all used to
 * hand-roll the same `addDoc` with slightly different field sets, which is how an assignment made
 * from an order could end up missing the ad spec the sales member captured. There is now one path:
 * pass the spec, optionally pass the order it came from, and the order is linked, flipped to
 * "assigned" and the member notified as part of the same call.
 */
import { collection, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { format } from "date-fns";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { normalizePhone } from "@/utils/phone";
import { categoryLabel } from "@/utils/serviceCatalog";
import { findUnassignedOrderForPhone, revertOrderToUnassigned } from "@/services/orders";
import { createOrderChat, lockOrderChat, deleteOrderChat } from "@/services/orderChat";
import { ORDER_TRACKS } from "@/types";
import type { Order, OrderTrack } from "@/types";

/** Sequential, readable work id (W001 / P002 / C003 / O004) — defined with the Orders pipeline. */
export { nextWorkUniqueId } from "@/services/orders";

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
  /** The occasion a wishes video is for, carried from the sale. */
  festival?: string;
  requirementNotes?: string;
  /** Special-category cartoon duo (a services/characterPacks id), when one was sold. */
  characterPack?: string;
  /** For a pack job: whether the client is supplying photos of their own premises. */
  realLocationProvided?: boolean;
  /** The order this fulfils, when it came from the Orders queue. */
  order?: Order | null;
  /**
   * Which parts of a split social-media month this member owns. A member holding two of the three
   * jobs gets ONE assignment naming both, rather than two cards for the same month.
   */
  tracks?: OrderTrack[];
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
}

/** Creates the assignment, links + advances any originating order, and notifies the member. */
export async function createWorkAssignment(input: CreateWorkAssignmentInput): Promise<{ id: string; accessCode: string }> {
  const {
    assignedTo, assignedToName, assignerUid, category, duration, clipCount, pricePerUnit, uniqueId,
    businessName, businessWhatsapp, modelGender, attireType, customAttire, aspectRatio,
    language, festival, requirementNotes, characterPack, realLocationProvided,
    order, tracks, memberLink = "/tech/my-work", assignerName, techAdminUid,
  } = input;

  const accessCode = generateAccessCode();
  const business = (businessName || "").trim();
  const phone = (businessWhatsapp || "").trim();

  /**
   * Work assigned straight from Work Assign (rather than from the Orders queue) still belongs to
   * a sale if one exists for that client's number — so it adopts the waiting order instead of
   * leaving it stuck in "unassigned" while the work is already being done.
   */
  const linkedOrder = order ?? (phone ? await findUnassignedOrderForPhone(phone, category) : null);

  const ref = await addDoc(collection(db, "work_assignments"), {
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
    ...(modelGender ? { modelGender } : {}),
    ...(attireType ? { attireType } : {}),
    ...(attireType === "custom" && customAttire?.trim() ? { customAttire: customAttire.trim() } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(language ? { language } : {}),
    // Only ever on a wishes job — the category decides whether an occasion means anything, and a
    // festival left on a promotional ad would theme one that nobody sold.
    ...(category === "wishes" && festival?.trim() ? { festival: festival.trim() } : {}),
    ...(requirementNotes?.trim() ? { requirementNotes: requirementNotes.trim() } : {}),
    // The location flag only means something next to a pack, so the two are written together —
    // a lone `realLocationProvided` on an ordinary job would be noise the member has to interpret.
    ...(characterPack ? { characterPack, realLocationProvided: realLocationProvided === true } : {}),
    ...(linkedOrder ? { orderId: linkedOrder.id } : {}),
    ...(linkedOrder?.promise ? { promise: linkedOrder.promise } : {}),
    ...(tracks?.length ? { tracks } : {}),
  });

  /**
   * The client's chat room, opened with the work.
   *
   * Created here rather than on first use so the leader can hand the link over in the same breath
   * as assigning the job — the whole point is that nobody has to go and build a WhatsApp group
   * before the client can send their logo.
   */
  await createOrderChat({
    assignmentId: ref.id,
    accessCode,
    uniqueId,
    businessName: business,
    clientPhone: phone ? normalizePhone(phone) : undefined,
    memberUid: assignedTo,
    memberName: assignedToName,
    assignerUid,
    assignerName,
    techAdminUid,
    orderId: linkedOrder?.id ?? null,
  });

  if (linkedOrder) {
    await updateDoc(doc(db, "orders", linkedOrder.id), {
      status: "assigned",
      workAssignmentId: ref.id,
      assignedTo,
      assignedToName: assignedToName || null,
      techAdminId: assignerUid,
      updatedAt: serverTimestamp(),
    });
  }

  // A split month reads as the jobs handed over, not as "N clips" — the member needs to know
  // whether they are making the ads or running the campaigns, which the clip count cannot say.
  const trackNames = (tracks || [])
    .map((t) => ORDER_TRACKS.find((x) => x.key === t)?.label || t)
    .join(" + ");
  const what = trackNames
    ? `${trackNames} on ${business || categoryLabel(category)}`
    : `a new ${category} work (${clipCount} clips, ${duration})`;

  await sendNotification({
    userId: assignedTo,
    type: "work_assigned",
    title: "New Work Assigned",
    message: `You have been assigned ${what}.${
      linkedOrder?.promise ? ` Deliver within ${linkedOrder.promise.label}.` : ""
    } Access code: ${accessCode}`,
    link: memberLink,
    // One assignment is one "you have new work" notification for that member.
    dedupeKey: `work_assigned_${ref.id}_${assignedTo}`,
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
  const { assignmentId, assignedTo, orderId, title } = input;

  // Order first: if this throws, the assignment is still on the member and the state stays
  // consistent. Deleting first could strand the order as "assigned" to work that no longer exists.
  if (orderId) await revertOrderToUnassigned(orderId);
  await deleteDoc(doc(db, "work_assignments", assignmentId));
  /**
   * The room closes with the assignment, but is not destroyed: the client keeps everything that
   * was said and sent. Work picked back up out of the queue becomes a NEW assignment with its own
   * room and its own link, which is what the leader shares — the alternative, silently reviving a
   * conversation the customer was told had ended, is worse than one more link.
   */
  await lockOrderChat(assignmentId, "This job has been returned to the team queue. This chat is now closed.");

  await sendNotification({
    userId: assignedTo,
    type: "work_unassigned",
    title: "Work Removed",
    message: `${title ? `"${title}" has` : "A job has"} been taken off your list and returned to the queue. Nothing further is needed from you.`,
    link: "/tech/my-work",
  });

  return { returnedToQueue: !!orderId };
}

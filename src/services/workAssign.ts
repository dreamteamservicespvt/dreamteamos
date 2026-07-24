/**
 * Creating a work assignment — one implementation, whoever is doing the assigning.
 *
 * The tech admin's and the team leader's Work Assign pages, and the Orders queue, all used to
 * hand-roll the same `addDoc` with slightly different field sets, which is how an assignment made
 * from an order could end up missing the ad spec the sales member captured. There is now one path:
 * pass the spec, optionally pass the order it came from, and the order is linked, flipped to
 * "assigned" and the member notified as part of the same call.
 */
import { collection, addDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { format } from "date-fns";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { normalizePhone } from "@/utils/phone";
import { categoryLabel } from "@/utils/serviceCatalog";
import { findUnassignedOrderForPhone } from "@/services/orders";
import type { Order } from "@/types";

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
  requirementNotes?: string;
  /** Special-category cartoon duo (a services/characterPacks id), when one was sold. */
  characterPack?: string;
  /** For a pack job: whether the client is supplying photos of their own premises. */
  realLocationProvided?: boolean;
  /** The order this fulfils, when it came from the Orders queue. */
  order?: Order | null;
  /** Shown in the assignee's notification. */
  memberLink?: string;
}

/** Creates the assignment, links + advances any originating order, and notifies the member. */
export async function createWorkAssignment(input: CreateWorkAssignmentInput): Promise<{ id: string; accessCode: string }> {
  const {
    assignedTo, assignedToName, assignerUid, category, duration, clipCount, pricePerUnit, uniqueId,
    businessName, businessWhatsapp, modelGender, attireType, customAttire, aspectRatio,
    language, requirementNotes, characterPack, realLocationProvided,
    order, memberLink = "/tech/my-work",
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
    ...(requirementNotes?.trim() ? { requirementNotes: requirementNotes.trim() } : {}),
    // The location flag only means something next to a pack, so the two are written together —
    // a lone `realLocationProvided` on an ordinary job would be noise the member has to interpret.
    ...(characterPack ? { characterPack, realLocationProvided: realLocationProvided === true } : {}),
    ...(linkedOrder ? { orderId: linkedOrder.id } : {}),
    ...(linkedOrder?.promise ? { promise: linkedOrder.promise } : {}),
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

  await sendNotification({
    userId: assignedTo,
    type: "work_assigned",
    title: "New Work Assigned",
    message: `You have been assigned a new ${category} work (${clipCount} clips, ${duration}).${
      linkedOrder?.promise ? ` Deliver within ${linkedOrder.promise.label}.` : ""
    } Access code: ${accessCode}`,
    link: memberLink,
  });

  return { id: ref.id, accessCode };
}

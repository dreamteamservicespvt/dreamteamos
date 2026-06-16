/**
 * DTS-US review / feedback workflow.
 *
 * A sales admin assigns a member to collect a 5★ Google review from an existing client. The member
 * uploads a screenshot of the 5 stars; the admin verifies it, which unlocks a 10% loyalty discount
 * and enables the member to upload the client's feedback video for our social media.
 *
 * The working copy lives in `review_tasks` (members read/write their own); a small summary is
 * mirrored onto the client doc by admins for the Clients badge.
 */
import {
  collection, doc, addDoc, getDoc, updateDoc, query, where,
  serverTimestamp, type Query, type DocumentData,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import type { AppUser, Client, ReviewTask } from "@/types";

export const LOYALTY_DISCOUNT_PERCENT = 10;

/** Admin assigns a member to collect a 5★ review for a client. Returns the new task id. */
export async function createReviewTask(params: { client: Client; member: AppUser; admin: AppUser }): Promise<string> {
  const { client, member, admin } = params;
  const ref = await addDoc(collection(db, "review_tasks"), {
    clientPhoneId: client.phoneId,
    clientPhone: client.phone,
    clientName: client.name || "",
    businessName: client.name || "",
    assignedTo: member.uid,
    assignedToName: member.name,
    assignedBy: admin.uid,
    salesAdminId: admin.uid,
    status: "requested",
    reviewScreenshotUrl: null,
    fiveStar: false,
    loyaltyDiscountPercent: 0,
    feedbackVideoUrl: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "clients", client.phoneId), {
    reviewTaskId: ref.id,
    reviewStatus: "requested",
    reviewAssignedTo: member.uid,
    reviewAssignedToName: member.name,
    updatedAt: serverTimestamp(),
  });
  await sendNotification({
    userId: member.uid,
    type: "review_assigned",
    title: "Review task assigned",
    message: `Collect a 5★ review from ${client.name || "a client"}, then upload a screenshot of the 5 stars.`,
  });
  return ref.id;
}

/** Member uploads the 5★ screenshot. */
export async function uploadReviewScreenshot(taskId: string, url: string): Promise<void> {
  await updateDoc(doc(db, "review_tasks", taskId), {
    status: "review_uploaded",
    reviewScreenshotUrl: url,
    updatedAt: serverTimestamp(),
  });
}

/** Admin verifies the 5★ → unlocks the 10% loyalty discount and the feedback-video upload. */
export async function verifyFiveStar(task: ReviewTask): Promise<void> {
  await updateDoc(doc(db, "review_tasks", task.id), {
    status: "verified",
    fiveStar: true,
    loyaltyDiscountPercent: LOYALTY_DISCOUNT_PERCENT,
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "clients", task.clientPhoneId), {
    reviewStatus: "verified",
    loyaltyDiscountPercent: LOYALTY_DISCOUNT_PERCENT,
    updatedAt: serverTimestamp(),
  });
  await sendNotification({
    userId: task.assignedTo,
    type: "review_verified",
    title: "5★ verified — discount unlocked",
    message: `${task.clientName}: 10% loyalty discount applied. You can now upload the feedback video.`,
  });
}

/** Admin rejects the uploaded screenshot (not a real 5★) → back to requested. */
export async function rejectReview(taskId: string): Promise<void> {
  await updateDoc(doc(db, "review_tasks", taskId), {
    status: "requested",
    reviewScreenshotUrl: null,
    updatedAt: serverTimestamp(),
  });
}

/** Member uploads the client feedback video (only allowed once the 5★ is verified). */
export async function uploadFeedbackVideo(taskId: string, url: string): Promise<void> {
  await updateDoc(doc(db, "review_tasks", taskId), {
    status: "completed",
    feedbackVideoUrl: url,
    updatedAt: serverTimestamp(),
  });
}

/** A member's assigned review tasks (members can read their own). */
export function myReviewTasksQuery(uid: string): Query<DocumentData> {
  return query(collection(db, "review_tasks"), where("assignedTo", "==", uid));
}

/** One-off fetch (admin Clients detail loads the client's task by id). */
export async function fetchReviewTask(taskId: string): Promise<ReviewTask | null> {
  const snap = await getDoc(doc(db, "review_tasks", taskId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as ReviewTask) : null;
}

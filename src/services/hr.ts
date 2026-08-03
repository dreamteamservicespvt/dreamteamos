import {
  collection, doc, documentId, getDoc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { syncPublicBadge } from "@/services/publicBadge";
import { sendNotification } from "@/services/notifications";
import { deriveStage, noticePeriodFor, lastWorkingDayFor, todayIso } from "@/utils/hrPolicy";
import type {
  AssetRecord, Department, EmployeeProfile, EmploymentStage, EngagementType, KycDocument,
  ProbationReview, SeparationRecord, SeparationStatus, SeparationType,
} from "@/types/hr";

/**
 * The employee lifecycle record: `employee_profiles/{uid}`.
 *
 * Everything about one employee's employment — KYC, terms, probation reviews, assets, exit — is
 * one document, so a profile screen is one read and a live subscription costs one document per
 * open page rather than five. The trade-off is that array members (reviews, assets, KYC files)
 * are written whole; they are small, bounded lists, and the alternative was subcollections that
 * would multiply reads on every screen that shows a member.
 *
 * A Firestore rule matters here as much as the code: this document holds PAN, Aadhaar, address
 * and emergency contact. It must be readable only by the employee themselves and by admins:
 *
 *   match /employee_profiles/{uid} {
 *     allow read: if request.auth != null && (
 *       request.auth.uid == uid ||
 *       get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
 *         in ['main_admin', 'tech_admin', 'sales_admin', 'tech_team_leader']);
 *     allow write: if request.auth != null && (
 *       request.auth.uid == uid ||
 *       get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
 *         in ['main_admin', 'tech_admin', 'sales_admin']);
 *   }
 *
 * That rule has to be set in the Firebase console — it does not live in this repository.
 */

const COLLECTION = "employee_profiles";

export interface Actor {
  uid: string;
  name: string;
}

/** A blank record for someone who has no HR profile yet. Never written until something is saved. */
export function emptyProfile(uid: string, department: Department): EmployeeProfile {
  return {
    uid,
    department,
    stage: "probation",
    probationReviews: [],
    assets: [],
    kycDocuments: [],
    separation: null,
  };
}

const fromSnap = (id: string, data: Record<string, unknown> | undefined, department: Department): EmployeeProfile => ({
  ...emptyProfile(id, department),
  ...(data as Partial<EmployeeProfile>),
  uid: id,
});

/** Live subscription to one employee's HR record. Emits a blank profile when none exists yet. */
export function watchEmployeeProfile(
  uid: string,
  department: Department,
  cb: (profile: EmployeeProfile, exists: boolean) => void,
): () => void {
  if (!uid) { cb(emptyProfile("", department), false); return () => {}; }
  return onSnapshot(
    doc(db, COLLECTION, uid),
    (snap) => cb(fromSnap(uid, snap.data(), department), snap.exists()),
    () => cb(emptyProfile(uid, department), false),
  );
}

/** One-shot read — for places that need the record once (document generation) and not live. */
export async function fetchEmployeeProfile(uid: string, department: Department): Promise<EmployeeProfile> {
  try {
    const snap = await getDoc(doc(db, COLLECTION, uid));
    return fromSnap(uid, snap.data(), department);
  } catch {
    return emptyProfile(uid, department);
  }
}

/**
 * Live HR records for a whole team, in chunked `in` queries.
 *
 * Costs exactly one document read per member — the same as listing them — so the team grid can
 * show who is on probation or serving notice without a per-card subscription.
 */
export function watchTeamProfiles(
  uids: string[],
  department: Department,
  cb: (byUid: Map<string, EmployeeProfile>) => void,
): () => void {
  const ids = [...new Set(uids)].filter(Boolean);
  if (ids.length === 0) { cb(new Map()); return () => {}; }

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

  const results = new Map<number, EmployeeProfile[]>();
  const emit = () => {
    const map = new Map<string, EmployeeProfile>();
    [...results.values()].flat().forEach((p) => map.set(p.uid, p));
    cb(map);
  };

  const unsubs = chunks.map((chunk, idx) =>
    onSnapshot(
      query(collection(db, COLLECTION), where(documentId(), "in", chunk)),
      (snap) => {
        results.set(idx, snap.docs.map((d) => fromSnap(d.id, d.data(), department)));
        emit();
      },
      () => { results.set(idx, []); emit(); },
    ),
  );
  return () => unsubs.forEach((u) => u());
}

/**
 * Write a patch onto the HR record, creating it if this is the first thing ever saved.
 *
 * `merge: true` throughout: two admins editing different tabs of the same profile must not
 * overwrite each other's section.
 */
export async function saveEmployeeProfile(
  uid: string,
  patch: Partial<EmployeeProfile>,
  actor: Actor,
): Promise<void> {
  await setDoc(
    doc(db, COLLECTION, uid),
    {
      uid,
      ...patch,
      updatedAt: serverTimestamp(),
      updatedByName: actor.name,
      ...(patch.createdAt ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true },
  );

  // The HR record holds PAN, Aadhaar and addresses, so it is read only by the person it belongs to
  // and their admin — rightly. But everyone needs to know whose birthday it is, and reading the
  // whole team's HR records to work that out would be both a privacy leak and, on the free tier,
  // a read budget nobody has. So the date of birth alone is mirrored onto the user document, which
  // every screen already loads. Nothing else from the KYC section goes with it.
  if ("dob" in patch) await mirrorDobToUser(uid, patch.dob ?? null);
  if ("photoUrl" in patch) await mirrorPhotoToUser(uid, patch.photoUrl ?? null);

  /**
   * Keep the public badge in step.
   *
   * Only the fields printed on the ID card are published, and only when one of them could have
   * changed — a saved address or PAN must not cost a write to a document the whole internet reads.
   */
  if (BADGE_FIELDS.some((f) => f in patch)) await syncPublicBadge(uid);
}

/** The parts of the HR record that appear on the ID card, and therefore on the public badge. */
const BADGE_FIELDS = ["designation", "department", "photoUrl", "joiningDate", "stage", "separation"] as const;

/**
 * The first photo fills both places; after that they are separate pictures.
 *
 * There are two of them for two different purposes — the avatar the team sees in chat and on
 * calls, and the photograph printed on the ID card — and asking a new member to upload the same
 * face twice on their first day is the kind of small stupidity people remember. So the first
 * upload, whichever screen it happened on, fills the empty one too.
 *
 * After that neither touches the other. Somebody who deliberately puts a formal photograph on
 * their ID card and a casual one on their profile has said exactly what they want, and a mirror
 * that kept overwriting one with the other would be the app arguing with them.
 */
async function mirrorPhotoToUser(uid: string, url: string | null): Promise<void> {
  if (!url) return; // Clearing the ID photograph is not a reason to remove someone's avatar.
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if ((snap.data()?.avatar || "").trim()) return; // They already have one — leave it alone.
    await setDoc(doc(db, "users", uid), { avatar: url, updatedAt: serverTimestamp() }, { merge: true });
  } catch (err) {
    console.error("[hr] could not mirror the photo to the user record:", err);
  }
}

/**
 * The other direction: the first photo set in My Profile also becomes the ID card photograph.
 *
 * `updateDoc`, deliberately — it fails when there is no HR record, and that failure is the correct
 * outcome. Admins have no employment record, and creating an empty one just because they changed
 * their avatar would put people into HR who do not belong there.
 */
export async function mirrorAvatarToProfile(uid: string, url: string | null): Promise<void> {
  if (!url) return;
  try {
    const snap = await getDoc(doc(db, COLLECTION, uid));
    if (!snap.exists()) return;
    if ((snap.data()?.photoUrl || "").trim()) return;
    await updateDoc(doc(db, COLLECTION, uid), { photoUrl: url, updatedAt: serverTimestamp() });
  } catch {
    /* no employment record for this person — nothing to keep in step */
  }
}

/** Best-effort: the HR record is the truth, and a failed mirror must not lose a saved profile. */
async function mirrorDobToUser(uid: string, dob: string | null): Promise<void> {
  try {
    await setDoc(doc(db, "users", uid), { dob, updatedAt: serverTimestamp() }, { merge: true });
  } catch (err) {
    console.error("[hr] could not mirror date of birth to the user record:", err);
  }
}

/**
 * Save the employment terms, and mirror the coarse full-time/part-time flag onto the user doc.
 *
 * `users/{uid}.employmentType` predates this module and still drives the bulk-agreement category
 * and parts of payroll. Interns and contractors have no equivalent there, so those engagements
 * leave it untouched rather than being flattened into a lie.
 *
 * `bySelf` records which side filled it in. An employee entering their own terms leaves them
 * marked self-declared until an admin confirms; an admin saving is itself the confirmation, so
 * the flag clears. See EmployeeProfile.termsSelfDeclared for why that distinction earns its keep.
 */
export async function saveEmploymentTerms(
  uid: string,
  terms: Partial<EmployeeProfile>,
  actor: Actor,
  opts: { bySelf?: boolean } = {},
): Promise<void> {
  const provenance: Partial<EmployeeProfile> = opts.bySelf
    ? {
      termsSelfDeclared: true,
      termsSelfDeclaredOn: todayIso(),
      termsConfirmedByName: null,
      termsConfirmedOn: null,
    }
    : {
      termsSelfDeclared: false,
      termsConfirmedByName: actor.name,
      termsConfirmedOn: todayIso(),
    };
  await saveEmployeeProfile(uid, { ...terms, ...provenance }, actor);
  const engagement = terms.engagementType;
  if (engagement === "full_time" || engagement === "part_time") {
    try {
      await updateDoc(doc(db, "users", uid), { employmentType: engagement, updatedAt: serverTimestamp() });
    } catch {
      // The HR record is the source of truth; a failed mirror must not fail the save.
    }
  }
}

/**
 * Forget that an offer was ever issued or accepted.
 *
 * Called when the last offer letter is deleted — see `deleteDocument`. Written straight rather
 * than through `saveEmploymentTerms`, because withdrawing a letter is not the admin re-agreeing
 * anybody's terms and must not stamp "confirmed by" across the record.
 */
export async function clearOfferDates(uid: string): Promise<void> {
  if (!uid) return;
  await updateDoc(doc(db, COLLECTION, uid), {
    offerIssuedOn: null,
    offerAcceptedOn: null,
    updatedAt: serverTimestamp(),
  });
}

/**
 * The admin agrees the terms the employee entered are what the company actually offered.
 *
 * Separate from editing them, because confirming without changing anything is the common case —
 * the employee usually gets their own joining date and salary right, and making the admin re-type
 * correct values to bless them would guarantee nobody ever does it.
 */
export async function confirmEmploymentTerms(uid: string, actor: Actor): Promise<void> {
  await saveEmployeeProfile(uid, {
    termsSelfDeclared: false,
    termsConfirmedByName: actor.name,
    termsConfirmedOn: todayIso(),
  }, actor);
}

/** Move someone to a new lifecycle stage explicitly (an admin decision, never inferred silently). */
export async function setStage(uid: string, stage: EmploymentStage, actor: Actor): Promise<void> {
  await saveEmployeeProfile(uid, { stage }, actor);
}

/** Re-align the stored stage with what the record now says. Used after a stage-moving change. */
export async function syncStage(profile: EmployeeProfile, actor: Actor): Promise<EmploymentStage> {
  const next = deriveStage(profile);
  if (next !== profile.stage) await saveEmployeeProfile(profile.uid, { stage: next }, actor);
  return next;
}

// ─── KYC documents ──────────────────────────────────────────────────────────

export async function addKycDocument(
  profile: EmployeeProfile,
  document: Omit<KycDocument, "uploadedAt">,
  actor: Actor,
): Promise<void> {
  const next: KycDocument = { ...document, uploadedAt: Timestamp.now() };
  await saveEmployeeProfile(profile.uid, { kycDocuments: [...(profile.kycDocuments || []), next] }, actor);
}

export async function removeKycDocument(profile: EmployeeProfile, id: string, actor: Actor): Promise<void> {
  await saveEmployeeProfile(
    profile.uid,
    { kycDocuments: (profile.kycDocuments || []).filter((d) => d.id !== id) },
    actor,
  );
}

// ─── Assets ─────────────────────────────────────────────────────────────────

/**
 * Record an asset handed to an employee and tell them, because the record is only worth having
 * if they acknowledge it — an unacknowledged asset register proves nothing at exit time.
 */
export async function issueAsset(
  profile: EmployeeProfile,
  asset: AssetRecord,
  actor: Actor,
  opts: { memberLink?: string; memberName?: string } = {},
): Promise<void> {
  await saveEmployeeProfile(profile.uid, { assets: [...(profile.assets || []), asset] }, actor);
  try {
    await sendNotification({
      userId: profile.uid,
      type: "hr_asset",
      title: "Company asset issued",
      message: `${asset.label} was recorded against your name. Please confirm receipt in your profile.`,
      ...(opts.memberLink ? { link: opts.memberLink } : {}),
      dedupeKey: `hr_asset_${profile.uid}_${asset.id}`,
    });
  } catch {
    // The record is what matters; a failed notification must not roll it back.
  }
}

/** The employee confirms they received an asset. Only they can do this — it is their signature. */
export async function acknowledgeAsset(profile: EmployeeProfile, assetId: string, actor: Actor): Promise<void> {
  await saveEmployeeProfile(
    profile.uid,
    {
      assets: (profile.assets || []).map((a) =>
        a.id === assetId ? { ...a, acknowledgedAt: Timestamp.now() } : a),
    },
    actor,
  );
}

export async function returnAsset(
  profile: EmployeeProfile,
  assetId: string,
  details: { returnedOn: string; returnCondition?: AssetRecord["returnCondition"]; returnNote?: string | null },
  actor: Actor,
): Promise<void> {
  await saveEmployeeProfile(
    profile.uid,
    { assets: (profile.assets || []).map((a) => (a.id === assetId ? { ...a, ...details } : a)) },
    actor,
  );
}

export async function removeAsset(profile: EmployeeProfile, assetId: string, actor: Actor): Promise<void> {
  await saveEmployeeProfile(
    profile.uid,
    { assets: (profile.assets || []).filter((a) => a.id !== assetId) },
    actor,
  );
}

// ─── Probation ──────────────────────────────────────────────────────────────

export async function addProbationReview(
  profile: EmployeeProfile,
  review: ProbationReview,
  actor: Actor,
  opts: { memberLink?: string } = {},
): Promise<void> {
  await saveEmployeeProfile(
    profile.uid,
    { probationReviews: [...(profile.probationReviews || []), review] },
    actor,
  );
  try {
    await sendNotification({
      userId: profile.uid,
      type: "hr_review",
      title: "Probation review recorded",
      message: `${actor.name} recorded your review — average score ${review.averageScore}/5.`,
      ...(opts.memberLink ? { link: opts.memberLink } : {}),
      dedupeKey: `hr_review_${profile.uid}_${review.id}`,
    });
  } catch { /* notification is best-effort */ }
}

export async function removeProbationReview(profile: EmployeeProfile, id: string, actor: Actor): Promise<void> {
  await saveEmployeeProfile(
    profile.uid,
    { probationReviews: (profile.probationReviews || []).filter((r) => r.id !== id) },
    actor,
  );
}

/** Probation passed. The employment agreement continues — only the stage and the date change. */
export async function confirmEmployment(
  profile: EmployeeProfile,
  confirmedOn: string,
  actor: Actor,
): Promise<void> {
  await saveEmployeeProfile(
    profile.uid,
    { confirmedOn, stage: "confirmed", probationExtendedTo: null, probationExtensionNote: null },
    actor,
  );
}

/** Probation extended rather than concluded — the stage deliberately stays "probation". */
export async function extendProbation(
  profile: EmployeeProfile,
  extendedTo: string,
  note: string,
  actor: Actor,
): Promise<void> {
  await saveEmployeeProfile(
    profile.uid,
    { probationExtendedTo: extendedTo, probationExtensionNote: note || null, stage: "probation" },
    actor,
  );
}

// ─── Separation ─────────────────────────────────────────────────────────────

/**
 * Open a separation: resignation, termination, end of contract or a misconduct proceeding.
 *
 * The notice period is computed from policy and stored on the record, so a policy change next
 * year cannot silently rewrite what this person was actually told.
 */
export async function submitSeparation(
  profile: EmployeeProfile,
  input: { type: SeparationType; reason: string; submittedOn: string; lastWorkingDay?: string | null },
  actor: Actor,
): Promise<SeparationRecord> {
  const notice = noticePeriodFor(profile, { separationType: input.type });
  const defaultLwd = lastWorkingDayFor(input.submittedOn, notice.days) || input.submittedOn;
  const lastWorkingDay = input.lastWorkingDay || defaultLwd;
  const record: SeparationRecord = {
    type: input.type,
    reason: input.reason,
    submittedOn: input.submittedOn,
    submittedById: actor.uid,
    submittedByName: actor.name,
    noticeDays: notice.days,
    lastWorkingDay,
    earlyRelease: lastWorkingDay < defaultLwd,
    status: "submitted",
    handoverNotes: null,
    handoverDoneOn: null,
    assetsReturnedOn: null,
    accessRevokedOn: null,
    finalSettlementAmount: null,
    finalSettlementOn: null,
    completedOn: null,
  };
  await saveEmployeeProfile(profile.uid, { separation: record, stage: "notice_period" }, actor);
  return record;
}

/** Update the live separation record — acknowledgement, handover, assets, access, settlement. */
export async function updateSeparation(
  profile: EmployeeProfile,
  patch: Partial<SeparationRecord>,
  actor: Actor,
): Promise<void> {
  if (!profile.separation) return;
  const next: SeparationRecord = { ...profile.separation, ...patch };
  const stage: EmploymentStage = next.status === "completed" ? "exited" : "notice_period";
  await saveEmployeeProfile(profile.uid, { separation: next, stage }, actor);
}

/** HR confirms the last working day. Acknowledging is the step the employee is waiting on. */
export async function acknowledgeSeparation(
  profile: EmployeeProfile,
  lastWorkingDay: string,
  actor: Actor,
): Promise<void> {
  if (!profile.separation) return;
  const original = lastWorkingDayFor(profile.separation.submittedOn, profile.separation.noticeDays) || lastWorkingDay;
  const waived = Math.max(0, Math.round(
    (new Date(original).getTime() - new Date(lastWorkingDay).getTime()) / 86_400_000,
  ));
  await updateSeparation(
    profile,
    {
      status: "acknowledged" as SeparationStatus,
      lastWorkingDay,
      earlyRelease: waived > 0,
      waivedDays: waived,
      acknowledgedByName: actor.name,
      acknowledgedAt: serverTimestamp(),
    },
    actor,
  );
  try {
    await sendNotification({
      userId: profile.uid,
      type: "hr_separation",
      title: "Resignation acknowledged",
      message: `Your last working day is confirmed as ${lastWorkingDay}.`,
      dedupeKey: `hr_sep_ack_${profile.uid}_${lastWorkingDay}`,
    });
  } catch { /* notification is best-effort */ }
}

/** Close the exit. Everything on the checklist should be done before this is allowed. */
export async function completeSeparation(profile: EmployeeProfile, actor: Actor): Promise<void> {
  await updateSeparation(profile, { status: "completed", completedOn: todayIso() }, actor);
}

/** Resignation pulled back before the last working day — the employee simply stays. */
export async function withdrawSeparation(
  profile: EmployeeProfile,
  reason: string,
  actor: Actor,
): Promise<void> {
  if (!profile.separation) return;
  const next: SeparationRecord = {
    ...profile.separation,
    status: "withdrawn",
    withdrawnOn: todayIso(),
    withdrawnReason: reason || null,
  };
  await saveEmployeeProfile(
    profile.uid,
    { separation: next, stage: profile.confirmedOn ? "confirmed" : "probation" },
    actor,
  );
}

// ─── Signature (the one an admin uploads once) ──────────────────────────────

/**
 * Store the signatory's signature on their own user document.
 *
 * On the user doc rather than in its own collection because every screen already subscribes to
 * `users`, so the signature that has to appear on a generated letter is there for free at the
 * moment it is needed — no extra read, no loading state on a document preview.
 */
export async function saveCompanySignature(
  uid: string,
  signatureUrl: string,
  designation?: string,
): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    signatureUrl,
    signatureUpdatedAt: serverTimestamp(),
    ...(designation ? { designation } : {}),
    updatedAt: serverTimestamp(),
  });
}

/** Remove a stored signature — used when it was uploaded wrong and has to be replaced cleanly. */
export async function clearCompanySignature(uid: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    signatureUrl: null,
    signatureUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Just the designation, editable without re-uploading the signature image. */
export async function saveSignatoryDesignation(uid: string, designation: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), { designation, updatedAt: serverTimestamp() });
}

export type { EngagementType };

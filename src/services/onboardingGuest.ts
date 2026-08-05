import { doc, getDoc, serverTimestamp, setDoc, updateDoc, collection, addDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import { isNative } from "@/utils/platform";
import type { InvitePublicView, IssuedCredentials, OnboardingInvite } from "@/types/onboarding";

/**
 * The candidate's side of their own hiring.
 *
 * Every call goes to the serverless endpoint. Nothing here reads the invite document directly in
 * production, because the document holds the access code and — after completion — the password,
 * and a browser that can read it can read those. What comes back is the projection the server
 * decided to share.
 *
 * The four digits are re-sent with every action rather than exchanged for a session. There is
 * nothing to keep signed in: three form posts, each of which must prove the same one thing.
 */

const API_BASE = isNative() ? "https://dreamteamos.vercel.app" : "";

export type InviteError =
  | "wrong_code"
  | "locked"
  | "not_found"
  | "revoked"
  | "expired"
  | "closed"
  | "offer_first"
  | "email_taken"
  | "provision_failed"
  | "no_signature"
  | "network";

export interface InviteResult {
  ok: boolean;
  invite?: InvitePublicView;
  credentials?: IssuedCredentials;
  error?: InviteError;
  attemptsLeft?: number;
  retryInSeconds?: number;
}

type Action = "open" | "accept-offer" | "accept-joining" | "decline";

async function call(action: Action, body: Record<string, unknown>): Promise<InviteResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/onboarding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
  } catch {
    return devFallback(action, body);
  }

  let payload: Record<string, unknown> = {};
  try { payload = await res.json(); } catch { /* an HTML error page — treat as unreachable */ }

  if (!res.ok) {
    const error = payload.error as InviteError | undefined;
    // No recognisable error body means no function answered — a plain `vite dev` server, most
    // likely, which serves index.html for anything it does not know.
    if (!error) return devFallback(action, body);
    return {
      ok: false,
      error,
      attemptsLeft: payload.attemptsLeft as number | undefined,
      retryInSeconds: payload.retryInSeconds as number | undefined,
    };
  }

  return {
    ok: true,
    invite: payload.invite as InvitePublicView,
    credentials: payload.credentials as IssuedCredentials | undefined,
  };
}

/** Open the link: prove the code, get back everything the candidate is allowed to see. */
export const openInvite = (inviteId: string, code: string): Promise<InviteResult> =>
  call("open", { inviteId, code });

/** Sign the offer. The signature is already on Cloudinary; only its URL travels. */
export const acceptOffer = (inviteId: string, code: string, signatureUrl: string): Promise<InviteResult> =>
  call("accept-offer", { inviteId, code, signatureUrl });

/** Sign the joining letter. This is the call that creates the account and returns the login. */
export const acceptJoining = (inviteId: string, code: string, signatureUrl: string): Promise<InviteResult> =>
  call("accept-joining", { inviteId, code, signatureUrl });

/** Say no, with a reason the admin will read. */
export const declineInvite = (
  inviteId: string, code: string, step: "offer" | "joining", reason: string,
): Promise<InviteResult> => call("decline", { inviteId, code, step, reason });

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Driving the whole flow against a plain `vite dev` server, which has no serverless functions.
 *
 * Compiled out of production builds — `import.meta.env.DEV` is a literal `false` there, so this
 * entire branch is removed and the only way through remains the server-checked one. It exists so
 * the hiring journey can be walked end to end in a real browser before it is ever deployed, which
 * is the only way to find out that a signature pad does not fit on a phone.
 *
 * It deliberately re-implements provisioning rather than sharing it: the serverless function is
 * the real one, it runs under a service account this page does not have, and the two live in
 * different compilation units. A shared module would have to be written for the weaker of the two.
 */
async function devFallback(action: Action, body: Record<string, unknown>): Promise<InviteResult> {
  if (!import.meta.env.DEV) return { ok: false, error: "network" };
  console.warn("[onboarding] dev fallback: no API server running, acting in the browser");

  const inviteId = String(body.inviteId || "");
  const code = String(body.code || "");
  try {
    const ref = doc(db, "onboarding_invites", inviteId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: false, error: "not_found" };
    const invite = snap.data() as OnboardingInvite;

    if (invite.status === "revoked") return { ok: false, error: "revoked" };
    if (String(invite.accessCode) !== code) return { ok: false, error: "wrong_code", attemptsLeft: 4 };

    const today = new Date().toISOString().slice(0, 10);
    const view = (over: Partial<OnboardingInvite> = {}): InvitePublicView => {
      const merged = { ...invite, ...over };
      return {
        id: inviteId,
        status: merged.status,
        name: merged.name,
        email: merged.email,
        phone: merged.phone,
        department: merged.department,
        designation: merged.designation,
        joiningDate: merged.joiningDate,
        offerValidUntil: merged.offerValidUntil ?? null,
        expired: merged.status === "sent" && !!merged.offerValidUntil && merged.offerValidUntil < today,
        offerLetter: merged.offerLetter,
        joiningLetter: merged.joiningLetter,
        issuedByName: merged.issuedByName,
        issuedByDesignation: merged.issuedByDesignation,
        companySignatureUrl: merged.companySignatureUrl,
        offerSignatureUrl: merged.offerSignatureUrl ?? null,
        offerAcceptedOn: merged.offerAcceptedOn ?? null,
        joiningSignatureUrl: merged.joiningSignatureUrl ?? null,
        joiningAcceptedOn: merged.joiningAcceptedOn ?? null,
        declinedStep: merged.declinedStep ?? null,
        declinedReason: merged.declinedReason ?? null,
      };
    };

    if (action === "open") return { ok: true, invite: view() };

    if (action === "decline") {
      const patch = {
        status: "declined" as const,
        declinedStep: (body.step === "joining" ? "joining" : "offer") as "offer" | "joining",
        declinedReason: String(body.reason || "") || null,
        declinedAt: serverTimestamp(),
      };
      await updateDoc(ref, patch);
      return { ok: true, invite: view(patch as Partial<OnboardingInvite>) };
    }

    const signatureUrl = String(body.signatureUrl || "");
    if (!signatureUrl) return { ok: false, error: "no_signature" };

    if (action === "accept-offer") {
      if (invite.status === "offer_accepted" || invite.status === "completed") return { ok: true, invite: view() };
      const patch = {
        status: "offer_accepted" as const,
        offerSignatureUrl: signatureUrl,
        offerAcceptedOn: today,
        offerAcceptedAt: serverTimestamp(),
      };
      await updateDoc(ref, patch);
      return { ok: true, invite: view(patch as Partial<OnboardingInvite>) };
    }

    // accept-joining
    if (invite.status === "completed") {
      return {
        ok: true,
        invite: view(),
        credentials: {
          email: invite.email,
          password: invite.generatedPassword || "",
          loginUrl: window.location.origin,
        },
      };
    }
    if (invite.status !== "offer_accepted") return { ok: false, error: "offer_first" };

    const { createUserWithoutSignOut } = await import("@/services/secondaryAuth");
    const password = `Dts@${Math.random().toString(36).slice(2, 8)}`;
    let uid: string;
    try {
      const cred = await createUserWithoutSignOut(invite.email, password);
      uid = cred.user.uid;
    } catch (err) {
      return { ok: false, error: (err as { code?: string }).code === "auth/email-already-in-use" ? "email_taken" : "provision_failed" };
    }

    await devProvision(uid, invite, signatureUrl, password, today);
    const patch = {
      status: "completed" as const,
      joiningSignatureUrl: signatureUrl,
      joiningAcceptedOn: today,
      joiningAcceptedAt: serverTimestamp(),
      generatedPassword: password,
      createdUid: uid,
      completedAt: serverTimestamp(),
    };
    await updateDoc(ref, patch);

    return {
      ok: true,
      invite: view(patch as Partial<OnboardingInvite>),
      credentials: { email: invite.email, password, loginUrl: window.location.origin },
    };
  } catch (err) {
    console.error("[onboarding] dev fallback failed", err);
    return { ok: false, error: "network" };
  }
}

/** The dev twin of `provision` in api/onboarding.ts. Kept field-for-field in step with it. */
async function devProvision(
  uid: string,
  invite: OnboardingInvite,
  joiningSignatureUrl: string,
  password: string,
  today: string,
): Promise<void> {
  const stage = !invite.joiningDate || invite.joiningDate > today
    ? "offer_accepted"
    : invite.engagementType === "intern" ? "confirmed" : "probation";

  const userDoc: Record<string, unknown> = {
    uid,
    email: invite.email,
    name: invite.name,
    role: invite.role,
    createdBy: invite.createdBy,
    isActive: true,
    salary: invite.ctcMonthly || 0,
    phone: invite.phone || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (invite.employeeId) userDoc.employeeId = invite.employeeId.trim().toUpperCase();
  if (invite.googleDriveBaseUrl) userDoc.googleDriveBaseUrl = invite.googleDriveBaseUrl;
  if (typeof invite.dailyTarget === "number") userDoc.dailyTarget = invite.dailyTarget;
  if (invite.engagementType === "full_time" || invite.engagementType === "part_time") {
    userDoc.employmentType = invite.engagementType;
  }
  await setDoc(doc(db, "users", uid), userDoc);

  await setDoc(doc(db, "employee_profiles", uid), {
    uid,
    department: invite.department,
    stage,
    engagementType: invite.engagementType,
    designation: invite.designation,
    workLocation: invite.workLocation,
    reportingToName: invite.reportingToName || null,
    joiningDate: invite.joiningDate,
    probationMonths: invite.probationMonths ?? 0,
    ctcMonthly: invite.ctcMonthly || 0,
    salaryPayDay: invite.salaryPayDay ?? null,
    workingHours: invite.workingHours,
    workingDays: invite.workingDays,
    shiftDetails: invite.shiftDetails || null,
    noticeDaysOverride: invite.noticeDays ?? null,
    seniorRole: invite.role === "tech_team_leader",
    signatureUrl: joiningSignatureUrl,
    offerIssuedOn: invite.issuedOn,
    offerAcceptedOn: invite.offerAcceptedOn || today,
    termsSelfDeclared: false,
    termsConfirmedByName: invite.issuedByName,
    termsConfirmedOn: invite.issuedOn,
    probationReviews: [],
    assets: [],
    kycDocuments: [],
    separation: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedByName: invite.issuedByName,
  }, { merge: true });

  const letter = (
    type: "offer_letter" | "appointment_letter",
    source: { title: string; bodyText: string; issuedOn: string },
    signature: string,
    signedDate: string,
  ) => ({
    memberId: uid,
    memberName: invite.name,
    memberPhone: invite.phone || "",
    memberRole: invite.role,
    department: invite.department,
    type,
    title: source.title,
    bodyText: source.bodyText,
    issuedById: invite.issuedById,
    issuedByName: invite.issuedByName,
    issuedByDesignation: invite.issuedByDesignation,
    companySignatureUrl: invite.companySignatureUrl,
    issuedOn: source.issuedOn,
    createdAt: serverTimestamp(),
    requiresEmployeeSignature: true,
    status: "signed",
    employeeSignatureUrl: signature,
    signedName: invite.name,
    signedDate,
    signedAt: serverTimestamp(),
  });

  await addDoc(collection(db, "hr_documents"), letter("offer_letter", invite.offerLetter, invite.offerSignatureUrl || "", invite.offerAcceptedOn || today));
  await addDoc(collection(db, "hr_documents"), letter("appointment_letter", invite.joiningLetter, joiningSignatureUrl, today));

  await setDoc(doc(db, "member_credentials", uid), {
    uid,
    email: invite.email,
    password,
    setBy: invite.createdBy,
    setByName: invite.issuedByName,
    updatedAt: serverTimestamp(),
  });
}

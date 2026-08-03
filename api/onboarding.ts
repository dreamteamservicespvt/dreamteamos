/**
 * The candidate's way through their own hiring, and the moment they become an employee.
 *
 * ── Why everything runs here ──────────────────────────────────────────────────────────────────
 * A candidate has no account — that is the entire point; the account is what they get at the end.
 * So every read and write on their journey happens on the server, under the service account, and
 * no Firestore rule has to be opened to the public for this feature to exist. The alternative was
 * a scoped custom token, as the order chat uses, but that only earns its keep for a live
 * subscription. This is three sequential form posts, and the code costs nothing to re-check.
 *
 * It also means the generated password can be handed over in an HTTP response rather than left
 * sitting in a document the candidate's browser is allowed to re-read.
 *
 * ── What signing the joining letter actually does ─────────────────────────────────────────────
 * It creates the Firebase Auth account and fans the invite out into the records the rest of the
 * app already reads: users, employee_profiles, two signed hr_documents, and member_credentials.
 * From that second on they are an ordinary member — they appear in My Team, their letters are in
 * their Documents tab, and the admin's existing "share credentials" button works on them.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import admin from "firebase-admin";

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}");
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const adminDb = admin.firestore();

/** Wrong codes allowed before the link stops answering, and for how long it stays quiet. */
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const COLLECTION = "onboarding_invites";

/**
 * Only our own pages may call this from a browser.
 *
 * Reflecting whatever `Origin` arrives would let any site on the internet script an offer letter's
 * acceptance from a visitor's browser. Preview deployments are matched by name rather than listed,
 * since their hostnames change with every push.
 */
function allowedOrigin(origin: string): string | null {
  if (!origin) return null;
  if (origin === "https://dreamteamos.vercel.app") return origin;
  if (origin === "https://localhost") return origin;            // the Capacitor shell
  if (/^https:\/\/dreamteamos-[a-z0-9-]+\.vercel\.app$/.test(origin)) return origin;
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return origin; // vite dev
  return null;
}

type InviteDoc = Record<string, any>;

const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** True when `date` is strictly before today. Used for the offer's acceptance deadline. */
const isPast = (date?: string | null): boolean => !!date && date < todayIso();

/**
 * What the candidate's browser is allowed to know.
 *
 * Built by naming every field that goes out, rather than by deleting the ones that must not: a
 * projection you have to remember to strip is one you eventually forget to strip, and the fields
 * being kept back here are the access code and the password.
 */
function publicView(id: string, invite: InviteDoc) {
  return {
    id,
    status: invite.status,
    name: invite.name,
    email: invite.email,
    phone: invite.phone,
    department: invite.department,
    designation: invite.designation,
    joiningDate: invite.joiningDate,
    offerValidUntil: invite.offerValidUntil ?? null,
    expired: invite.status === "sent" && isPast(invite.offerValidUntil),
    offerLetter: invite.offerLetter,
    joiningLetter: invite.joiningLetter,
    issuedByName: invite.issuedByName,
    issuedByDesignation: invite.issuedByDesignation,
    companySignatureUrl: invite.companySignatureUrl,
    companyStampUrl: invite.companyStampUrl ?? null,
    offerSignatureUrl: invite.offerSignatureUrl ?? null,
    offerAcceptedOn: invite.offerAcceptedOn ?? null,
    joiningSignatureUrl: invite.joiningSignatureUrl ?? null,
    joiningAcceptedOn: invite.joiningAcceptedOn ?? null,
    declinedStep: invite.declinedStep ?? null,
    declinedReason: invite.declinedReason ?? null,
  };
}

/**
 * A password that survives being read down a phone line.
 *
 * No characters that get confused when spoken or copied by hand (0/O, 1/l/I), and a fixed readable
 * prefix so the person can see where it starts and ends. Ten characters of this alphabet is far
 * more than a login form ever gets to guess at, and the admin can reset it anyway.
 */
function generatePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = require("crypto").randomBytes(6) as Buffer;
  const body = Array.from(bytes, (b: number) => alphabet[b % alphabet.length]).join("");
  return `Dts@${body}`;
}

/**
 * The stage a new joiner starts in.
 *
 * Someone whose joining date has not arrived is not on probation — they have accepted an offer and
 * are waiting to start. An intern never serves probation at all, so they begin confirmed.
 */
function startingStage(joiningDate: string, engagementType: string): string {
  if (!joiningDate || joiningDate > todayIso()) return "offer_accepted";
  return engagementType === "intern" ? "confirmed" : "probation";
}

/** Tell the admin who raised the invite. Best-effort — a lost notification must not lose a hire. */
async function notifyAdmin(userId: string, title: string, message: string, link: string) {
  try {
    await adminDb.collection("notifications").add({
      userId, type: "hr_document", title, message, link, read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("[onboarding] notify failed", err);
  }
}

/**
 * Check the four digits, and count the misses.
 *
 * Returns the invite when the code is right. Everything else — wrong, locked, missing, cancelled —
 * comes back as a response the caller sends straight on, because every action needs exactly the
 * same door and duplicating it per action is how one of them ends up unguarded.
 */
async function openInvite(
  res: VercelResponse,
  inviteId: unknown,
  code: unknown,
): Promise<{ ref: FirebaseFirestore.DocumentReference; invite: InviteDoc } | null> {
  if (!inviteId || typeof inviteId !== "string") {
    res.status(400).json({ error: "not_found" });
    return null;
  }
  const ref = adminDb.collection(COLLECTION).doc(inviteId);
  const snap = await ref.get();
  if (!snap.exists) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  const invite = (snap.data() || {}) as InviteDoc;

  if (invite.status === "revoked") {
    res.status(410).json({ error: "revoked" });
    return null;
  }

  const lockedUntil = Number(invite.lockedUntil || 0);
  if (lockedUntil > Date.now()) {
    res.status(429).json({ error: "locked", retryInSeconds: Math.ceil((lockedUntil - Date.now()) / 1000) });
    return null;
  }

  if (String(code ?? "") !== String(invite.accessCode)) {
    const attempts = Number(invite.failedAttempts || 0) + 1;
    const nowLocked = attempts >= MAX_ATTEMPTS;
    await ref.update({
      failedAttempts: nowLocked ? 0 : attempts,
      ...(nowLocked ? { lockedUntil: Date.now() + LOCKOUT_MS } : {}),
    });
    res.status(401).json({
      error: nowLocked ? "locked" : "wrong_code",
      attemptsLeft: nowLocked ? 0 : MAX_ATTEMPTS - attempts,
      ...(nowLocked ? { retryInSeconds: Math.ceil(LOCKOUT_MS / 1000) } : {}),
    });
    return null;
  }

  if (invite.failedAttempts) await ref.update({ failedAttempts: 0, lockedUntil: 0 });
  return { ref, invite };
}

/** The login URL a finished candidate is sent to — the same origin they are already standing on. */
const loginUrlFor = (origin: string | null): string => origin || "https://dreamteamos.vercel.app";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = allowedOrigin(req.headers.origin || "");
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { action, inviteId, code } = req.body || {};
    const opened = await openInvite(res, inviteId, code);
    if (!opened) return;                       // openInvite has already answered
    const { ref, invite } = opened;

    // ── Just show me where I am ────────────────────────────────────────────────────────────────
    if (action === "open") {
      return res.status(200).json({ invite: publicView(inviteId, invite) });
    }

    // ── The offer is accepted ──────────────────────────────────────────────────────────────────
    if (action === "accept-offer") {
      const signatureUrl = String(req.body.signatureUrl || "");
      if (!signatureUrl) return res.status(400).json({ error: "no_signature" });
      if (invite.status === "offer_accepted" || invite.status === "completed") {
        return res.status(200).json({ invite: publicView(inviteId, invite) });
      }
      if (invite.status !== "sent") return res.status(409).json({ error: "closed" });
      if (isPast(invite.offerValidUntil)) return res.status(410).json({ error: "expired" });

      const patch = {
        status: "offer_accepted",
        offerSignatureUrl: signatureUrl,
        offerAcceptedOn: todayIso(),
        offerAcceptedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await ref.update(patch);
      await notifyAdmin(
        invite.issuedById,
        "Offer accepted",
        `${invite.name} signed their offer letter and is now reading the joining letter.`,
        invite.department === "tech" ? "/tech-admin/team" : "/sales-admin/team",
      );
      return res.status(200).json({ invite: publicView(inviteId, { ...invite, ...patch }) });
    }

    // ── The joining letter is accepted: this is where an employee is made ──────────────────────
    if (action === "accept-joining") {
      const signatureUrl = String(req.body.signatureUrl || "");
      if (!signatureUrl) return res.status(400).json({ error: "no_signature" });

      // Already done — a refresh, a double tap, a retry after a flaky connection. Hand back the
      // same credentials rather than an error: this person has signed everything and is entitled
      // to their login, however many times the button was pressed.
      if (invite.status === "completed") {
        const settled = await waitForAccount(ref, invite);
        return res.status(200).json({
          invite: publicView(inviteId, settled),
          credentials: {
            email: settled.email,
            password: settled.generatedPassword,
            loginUrl: loginUrlFor(origin),
          },
        });
      }
      if (invite.status !== "offer_accepted") return res.status(409).json({ error: "offer_first" });

      const password = generatePassword();

      // Claim the invite before creating anything. Two requests racing here means exactly one wins
      // the transaction; the other falls into the branch above and waits for the account.
      const claimed = await adminDb.runTransaction(async (tx) => {
        const fresh = await tx.get(ref);
        if ((fresh.data() || {}).status !== "offer_accepted") return false;
        tx.update(ref, {
          status: "completed",
          joiningSignatureUrl: signatureUrl,
          joiningAcceptedOn: todayIso(),
          joiningAcceptedAt: admin.firestore.FieldValue.serverTimestamp(),
          generatedPassword: password,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return true;
      });

      if (!claimed) {
        const settled = await waitForAccount(ref, invite);
        return res.status(200).json({
          invite: publicView(inviteId, settled),
          credentials: {
            email: settled.email,
            password: settled.generatedPassword,
            loginUrl: loginUrlFor(origin),
          },
        });
      }

      try {
        const uid = await provision(invite, signatureUrl, password);
        await ref.update({ createdUid: uid });
        await notifyAdmin(
          invite.issuedById,
          "Joined",
          `${invite.name} signed their joining letter. Their account is active and both letters are on their record.`,
          invite.department === "tech" ? "/tech-admin/team" : "/sales-admin/team",
        );
        const finalInvite = { ...invite, status: "completed", joiningSignatureUrl: signatureUrl, joiningAcceptedOn: todayIso(), createdUid: uid };
        return res.status(200).json({
          invite: publicView(inviteId, finalInvite),
          credentials: { email: invite.email, password, loginUrl: loginUrlFor(origin) },
        });
      } catch (err: any) {
        // Put the invite back where it was, so the admin can fix the problem and the candidate can
        // press the button again. Leaving it "completed" with no account would strand them.
        await ref.update({
          status: "offer_accepted",
          generatedPassword: admin.firestore.FieldValue.delete(),
          completedAt: admin.firestore.FieldValue.delete(),
        });
        const taken = err?.code === "auth/email-already-exists";
        console.error("[onboarding] provisioning failed", err);
        return res.status(taken ? 409 : 500).json({ error: taken ? "email_taken" : "provision_failed" });
      }
    }

    // ── Not accepting, and saying why ──────────────────────────────────────────────────────────
    if (action === "decline") {
      const step = req.body.step === "joining" ? "joining" : "offer";
      const reason = String(req.body.reason || "").slice(0, 500);
      if (invite.status === "completed") return res.status(409).json({ error: "closed" });
      const patch = {
        status: "declined",
        declinedStep: step,
        declinedReason: reason || null,
        declinedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await ref.update(patch);
      await notifyAdmin(
        invite.issuedById,
        "Offer declined",
        `${invite.name} did not sign their ${step === "joining" ? "joining letter" : "offer letter"}${reason ? `: ${reason}` : "."}`,
        invite.department === "tech" ? "/tech-admin/team" : "/sales-admin/team",
      );
      return res.status(200).json({ invite: publicView(inviteId, { ...invite, ...patch }) });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (error) {
    console.error("[onboarding] error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Wait for the request that won the race to finish creating the account.
 *
 * Only reached when the candidate's browser sent the same acceptance twice. Without it the loser
 * would hand over a password for an account that exists a second later, and the candidate would
 * meet a login failure at the one moment they should meet a welcome.
 */
async function waitForAccount(
  ref: FirebaseFirestore.DocumentReference,
  fallback: InviteDoc,
): Promise<InviteDoc> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const snap = await ref.get();
    const data = (snap.data() || {}) as InviteDoc;
    if (data.createdUid) return data;
    await new Promise((r) => setTimeout(r, 750));
  }
  const snap = await ref.get();
  return ((snap.data() || fallback) as InviteDoc);
}

/**
 * Turn an accepted invite into an employee.
 *
 * Everything written here is a record some existing screen already reads — this feature adds no
 * new place to look for a member. The order matters only in that the auth account comes first:
 * everything else is keyed by the uid it returns.
 */
async function provision(invite: InviteDoc, joiningSignatureUrl: string, password: string): Promise<string> {
  const email = String(invite.email || "").trim().toLowerCase();
  const user = await admin.auth().createUser({ email, password, displayName: invite.name });
  const uid = user.uid;
  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = adminDb.batch();

  // ── The account every screen reads ──
  const userDoc: Record<string, unknown> = {
    uid,
    email,
    name: invite.name,
    role: invite.role,
    createdBy: invite.createdBy,
    isActive: true,
    salary: invite.ctcMonthly || 0,
    target: invite.target ?? 0,
    phone: invite.phone || "",
    createdAt: now,
    updatedAt: now,
  };
  if (invite.employeeId) userDoc.employeeId = String(invite.employeeId).trim().toUpperCase();
  if (invite.googleDriveBaseUrl) userDoc.googleDriveBaseUrl = invite.googleDriveBaseUrl;
  if (typeof invite.dailyTarget === "number") userDoc.dailyTarget = invite.dailyTarget;
  if (typeof invite.monthlyTarget === "number") userDoc.monthlyTarget = invite.monthlyTarget;
  // Interns and contractors have no equivalent on the user document, and flattening them into
  // "full_time" there would be a lie payroll would later believe.
  if (invite.engagementType === "full_time" || invite.engagementType === "part_time") {
    userDoc.employmentType = invite.engagementType;
  }
  batch.set(adminDb.collection("users").doc(uid), userDoc);

  // ── The employment record, already filled in and already confirmed ──
  batch.set(adminDb.collection("employee_profiles").doc(uid), {
    uid,
    department: invite.department,
    stage: startingStage(invite.joiningDate, invite.engagementType),
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
    // They photographed it to sign the joining letter — never ask them for it a second time.
    signatureUrl: joiningSignatureUrl,
    offerIssuedOn: invite.issuedOn,
    offerAcceptedOn: invite.offerAcceptedOn || todayIso(),
    // The admin typed these terms and signed the letters that print them, so they are confirmed by
    // definition. Leaving them self-declared would ask the admin to re-approve their own figures.
    termsSelfDeclared: false,
    termsConfirmedByName: invite.issuedByName,
    termsConfirmedOn: invite.issuedOn,
    probationReviews: [],
    assets: [],
    kycDocuments: [],
    separation: null,
    createdAt: now,
    updatedAt: now,
    updatedByName: invite.issuedByName,
  }, { merge: true });

  // ── Both letters, signed by both sides, in the Documents tab everyone already uses ──
  const letter = (
    type: "offer_letter" | "appointment_letter",
    source: Record<string, any>,
    signature: string | null,
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
    companyStampUrl: invite.companyStampUrl ?? null,
    issuedOn: source.issuedOn,
    createdAt: now,
    requiresEmployeeSignature: true,
    status: "signed",
    employeeSignatureUrl: signature,
    signedName: invite.name,
    signedDate,
    signedAt: now,
  });

  // `|| null` rather than trusting the flow: Firestore rejects an undefined field outright, and a
  // rejected batch here would leave a signed candidate with an auth account and no records.
  batch.set(
    adminDb.collection("hr_documents").doc(),
    letter("offer_letter", invite.offerLetter, invite.offerSignatureUrl || null, invite.offerAcceptedOn || todayIso()),
  );
  batch.set(
    adminDb.collection("hr_documents").doc(),
    letter("appointment_letter", invite.joiningLetter, joiningSignatureUrl, todayIso()),
  );

  // ── The password, where the admin's existing "share credentials" button looks for it ──
  batch.set(adminDb.collection("member_credentials").doc(uid), {
    uid,
    email,
    password,
    setBy: invite.createdBy,
    setByName: invite.issuedByName,
    updatedAt: now,
  });

  await batch.commit();
  return uid;
}

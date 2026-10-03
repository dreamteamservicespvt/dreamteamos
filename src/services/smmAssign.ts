/**
 * Putting people on a social-media month — one path, wherever it is done from (2026-10-03).
 *
 * ── Why one path ──────────────────────────────────────────────────────────────────────────────
 * A month could be "assigned" in two places that did different things. The Orders queue's split
 * dialog created job cards (one per person, every time it was used — so re-splitting a month gave
 * everybody a second card) and handed the AI studio the number of VIDEOS in the month as the clip
 * count of each video. The month page only wrote names onto the plan: the member got no job, no
 * access code and no notification, and had no way into the AI studio for it at all.
 *
 * Now the package setup, the month page and the Orders queue all call `assignSmmMonth`:
 *   • the month's seats (makes / posts / runs ads, plus assistants) are written to the plan;
 *   • each person holding a seat has exactly ONE job card for the month, naming every seat they hold —
 *     created if they have none, updated if they already have one, never duplicated;
 *   • each job hands the AI studio the month's own video length (`clipsPerVideo` × 8 seconds);
 *   • somebody taken off the month who has not started has their card withdrawn and is told;
 *     somebody already working on it keeps the card, and the caller is told so a person decides;
 *   • the order reads the same people, so the queue, My Work and the plan cannot disagree;
 *   • a month with no order (a no-sale month) is given jobs the same way, sharing one client chat.
 */
import { collection, deleteDoc, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "@/services/firebase";
import { sendNotification } from "@/services/notifications";
import { createWorkAssignment, nextWorkUniqueId } from "@/services/workAssign";
import { fetchOrder } from "@/services/orders";
import { fetchCampaign, setCampaignTeam } from "@/services/smm";
import { clipsPerVideoOf, isNoSaleMonth, jobsByMember, tracksFromTeam, videoDuration } from "@/utils/smmPackage";
import type { ActivityActor } from "@/services/activityLog";
import type { AppUser, OrderTrack, WorkAssignment } from "@/types";
import type { SmmAssignee, SmmCampaign, SmmTeam } from "@/types/smm";

const SMM_CATEGORY = "social_media_management";

export interface SmmAssignResult {
  created: { uid: string; name: string; id: string; accessCode: string }[];
  updated: { uid: string; name: string; id: string }[];
  withdrawn: { uid: string; name: string }[];
  /** Taken off the month but already working on it. Their card is left for a person to decide. */
  keptStarted: { uid: string; name: string; id: string }[];
  /** In a seat but no longer active, so given nothing. */
  skippedInactive: { uid: string; name: string }[];
}

/** The person giving out the work — the assigner every job records, and whom completion reports to. */
export interface SmmAssigner {
  uid: string;
  name: string;
  role?: string | null;
  createdBy?: string | null;
}

const tsMs = (ts: unknown): number => {
  const t = ts as { toMillis?: () => number; seconds?: number } | null;
  if (!t) return 0;
  if (typeof t.toMillis === "function") return t.toMillis();
  return typeof t.seconds === "number" ? t.seconds * 1000 : 0;
};

/**
 * Every job already given out for a month — by its own link, and by its order for the jobs made
 * before the link existed (the split dialog's cards). Two exact-match queries, no scan.
 */
export async function fetchMonthJobs(campaign: Pick<SmmCampaign, "id" | "orderId">): Promise<WorkAssignment[]> {
  const byId = new Map<string, WorkAssignment>();
  const reads = [getDocs(query(collection(db, "work_assignments"), where("smmCampaignId", "==", campaign.id)))];
  if (campaign.orderId) {
    reads.push(getDocs(query(collection(db, "work_assignments"), where("orderId", "==", campaign.orderId))));
  }
  for (const snap of await Promise.all(reads)) {
    for (const d of snap.docs) byId.set(d.id, { ...(d.data() as WorkAssignment), id: d.id });
  }
  return [...byId.values()];
}

/**
 * The job ids already issued in the "O" series, so a new card gets the next number.
 *
 * Only read when the caller has not got the list (the Orders page has; the board has not). A range
 * on one field — no composite index, and only the O-series rather than every job ever made.
 */
async function issuedOtherSeries(): Promise<WorkAssignment[]> {
  const snap = await getDocs(query(
    collection(db, "work_assignments"),
    where("uniqueId", ">=", "O"),
    where("uniqueId", "<", "P"),
  ));
  return snap.docs.map((d) => ({ id: d.id, uniqueId: (d.data() as WorkAssignment).uniqueId } as WorkAssignment));
}

/** Which of these people are still active. A read that fails does not block the work. */
async function activeOf(uids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  await Promise.all(uids.map(async (uid) => {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (!snap.exists() || (snap.data() as AppUser).isActive !== false) out.add(uid);
    } catch {
      out.add(uid);
    }
  }));
  return out;
}

const sameTracks = (a: OrderTrack[] | undefined, b: OrderTrack[]) =>
  (a || []).length === b.length && b.every((t) => (a || []).includes(t));

/** Not opened, not worked on — taking it back costs the member nothing. */
const untouched = (a: WorkAssignment) =>
  a.status === "assigned" && !(a.totalDurationSeconds > 0) && !(a.sessions?.length);

/** The seats with anybody who is no longer active taken out. */
function withoutInactive(team: SmmTeam, active: Set<string>, skipped: SmmAssignResult["skippedInactive"]): SmmTeam {
  const keep = (who: SmmAssignee | null | undefined): SmmAssignee | null => {
    if (!who?.uid) return null;
    if (active.has(who.uid)) return who;
    if (!skipped.some((s) => s.uid === who.uid)) skipped.push({ uid: who.uid, name: who.name });
    return null;
  };
  return {
    creator: keep(team.creator),
    publisher: keep(team.publisher),
    marketer: keep(team.marketer),
    assistants: (team.assistants || []).filter((a) => active.has(a.uid)),
  };
}

export async function assignSmmMonth(params: {
  campaignId: string;
  team: SmmTeam;
  assigner: SmmAssigner;
  /** For the tech activity feed. Null for the automatic assignment a renewal makes. */
  actor?: ActivityActor | null;
  /** Already-loaded jobs, so the next work id can be worked out without a read. */
  existingAssignments?: WorkAssignment[];
}): Promise<SmmAssignResult> {
  const { campaignId, assigner, actor } = params;
  const result: SmmAssignResult = { created: [], updated: [], withdrawn: [], keptStarted: [], skippedInactive: [] };

  const campaign = await fetchCampaign(campaignId);
  if (!campaign) throw new Error("This month no longer exists.");

  const seatUids = [
    params.team.creator?.uid, params.team.publisher?.uid, params.team.marketer?.uid,
    ...(params.team.assistants || []).map((a) => a.uid),
  ].filter(Boolean) as string[];
  const team = withoutInactive(params.team, await activeOf([...new Set(seatUids)]), result.skippedInactive);

  /*
    A month with no order — a no-sale month, or one started directly before every month had a sale —
    gets its jobs all the same (2026-10-03). It used to get names on the plan only, which left the
    member no way into the AI studio for it. Its jobs share one client chat keyed on the month's own
    id (a sold month's share the order's), and the order bookkeeping at the end is skipped: there is
    no order to keep.
  */
  const order = campaign.orderId ? await fetchOrder(campaign.orderId) : null;
  if (campaign.orderId && (!order || order.deleted || order.status === "deleted")) {
    throw new Error("This month's order has been removed. Set the sale up again from Add SMM sale.");
  }
  const monthRoom = order ? {} : {
    roomId: campaign.id,
    soldBy: isNoSaleMonth(campaign) ? { uid: campaign.soldBy, name: campaign.soldByName } : null,
  };

  const clips = clipsPerVideoOf(campaign);
  const duration = videoDuration(clips);
  const jobs = await fetchMonthJobs(campaign);
  const issued: WorkAssignment[] = [...(params.existingAssignments || await issuedOtherSeries())];
  const newestJobOf = (uid: string) => jobs
    .filter((a) => a.assignedTo === uid)
    .sort((a, b) => tsMs(b.assignedAt) - tsMs(a.assignedAt))[0];

  /*
    The maker goes LAST. Creating a job joins its member to the client's chat as the person the
    client talks to, and the last one created wins — for a month that should be whoever makes it.
  */
  const wanted = jobsByMember(team).sort((a, b) =>
    Number(a.uid === team.creator?.uid) - Number(b.uid === team.creator?.uid));
  const techAdminUid = assigner.role === "tech_team_leader" ? (assigner.createdBy || null) : assigner.uid;

  for (const w of wanted) {
    const job = newestJobOf(w.uid);
    if (job) {
      const patch: Record<string, unknown> = {};
      if (!sameTracks(job.tracks, w.tracks)) patch.tracks = w.tracks;
      if (job.clipCount !== clips || job.duration !== duration) {
        patch.clipCount = clips;
        patch.duration = duration;
      }
      if (job.smmCampaignId !== campaign.id) patch.smmCampaignId = campaign.id;
      if (Object.keys(patch).length > 0) await updateDoc(doc(db, "work_assignments", job.id), patch);
      result.updated.push({ uid: w.uid, name: w.name, id: job.id });
      continue;
    }
    const uniqueId = nextWorkUniqueId(SMM_CATEGORY, issued);
    issued.push({ uniqueId } as WorkAssignment);
    const made = await createWorkAssignment({
      assignedTo: w.uid,
      assignedToName: w.name,
      assignerUid: assigner.uid,
      assignerName: assigner.name,
      techAdminUid,
      category: SMM_CATEGORY,
      duration,
      clipCount: clips,
      pricePerUnit: 0,
      uniqueId,
      businessName: campaign.businessName || order?.businessName,
      businessWhatsapp: order?.clientPhone || campaign.clientPhone,
      requirementNotes: order?.requirement?.notes || undefined,
      businessInfo: order?.requirement?.businessInfo || undefined,
      businessAddress: order?.requirement?.businessAddress || undefined,
      order,
      tracks: w.tracks,
      smmCampaignId: campaign.id,
      ...monthRoom,
      actor: actor ?? null,
    });
    result.created.push({ uid: w.uid, name: w.name, id: made.id, accessCode: made.accessCode });
  }

  // Off the month. A job card does not carry its member's name; the month's seats did.
  const previousNames = new Map<string, string>();
  for (const who of [campaign.team?.creator, campaign.team?.publisher, campaign.team?.marketer, ...(campaign.team?.assistants || [])]) {
    if (who?.uid) previousNames.set(who.uid, who.name);
  }
  const wantedUids = new Set(wanted.map((w) => w.uid));
  const withdrawnIds = new Set<string>();
  for (const job of jobs) {
    if (wantedUids.has(job.assignedTo)) continue;
    // Their part is done and checked — that card is a record of work, not work to take back.
    if (job.status === "completed" || job.status === "verified") continue;
    const name = previousNames.get(job.assignedTo) || "A member";
    if (untouched(job)) {
      await deleteDoc(doc(db, "work_assignments", job.id));
      withdrawnIds.add(job.id);
      result.withdrawn.push({ uid: job.assignedTo, name });
      await sendNotification({
        userId: job.assignedTo,
        type: "work_unassigned",
        title: "Taken off a social media month",
        message: `${campaign.businessName || campaign.clientName}'s social media month has been given to someone else. Nothing you need to do.`,
        link: "/tech/my-work",
        dedupeKey: `smm_job_withdrawn_${job.id}`,
      }).catch(() => undefined);
    } else {
      result.keptStarted.push({ uid: job.assignedTo, name, id: job.id });
    }
  }

  /*
    The order reads the same people. Its tracks are the seats; its "assigned to" is the maker's job,
    or whoever is left; and with nobody left it goes back to the queue as unassigned.
  */
  const live = [
    ...result.created.map((c) => ({ id: c.id, uid: c.uid, name: c.name })),
    ...result.updated.map((u) => ({ id: u.id, uid: u.uid, name: u.name })),
    ...result.keptStarted.map((k) => ({ id: k.id, uid: k.uid, name: k.name })),
  ].filter((j) => !withdrawnIds.has(j.id));
  const primary = live.find((j) => j.uid === team.creator?.uid) || live[0] || null;
  if (order) {
    await updateDoc(doc(db, "orders", order.id), {
      ...(order.progress ? { progress: { ...order.progress, tracks: tracksFromTeam(team) } } : {}),
      ...(primary
        ? {
            ...(order.status === "unassigned" ? { status: "assigned" } : {}),
            workAssignmentId: primary.id,
            assignedTo: primary.uid,
            assignedToName: primary.name,
          }
        : {
            ...(order.status === "assigned" ? { status: "unassigned" } : {}),
            workAssignmentId: null,
            assignedTo: null,
            assignedToName: null,
          }),
    });
  }

  await setCampaignTeam(campaignId, team);
  return result;
}

/**
 * Follow a change of video length on every open job of the month.
 *
 * The AI studio reads the length off the job, so changing it on the month alone would leave the
 * members building the old length. A job already handed in keeps what it was made at.
 */
export async function syncMonthJobsLength(campaign: Pick<SmmCampaign, "id" | "orderId" | "clipsPerVideo">): Promise<number> {
  const clips = clipsPerVideoOf(campaign);
  const duration = videoDuration(clips);
  let changed = 0;
  for (const job of await fetchMonthJobs(campaign)) {
    if (job.status === "completed" || job.status === "verified") continue;
    if (job.category !== SMM_CATEGORY) continue;
    if (job.clipCount === clips && job.duration === duration) continue;
    await updateDoc(doc(db, "work_assignments", job.id), { clipCount: clips, duration, smmCampaignId: campaign.id });
    changed += 1;
  }
  return changed;
}

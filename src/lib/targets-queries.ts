import { prisma } from "./db";
import {
  MAX_TARGET_POINTS,
  deriveStatus,
  isMonthKey,
  type ProofStatus,
} from "./targets";

/**
 * Database side of targets and proofs, and the single place the authorization rules
 * live. Every mutation re-derives who is allowed to do it from the database rather
 * than trusting anything the client sent:
 *
 *   set / change a target   → the coach's DIRECT upline only (F7 says direct)
 *   update progress         → the target's own coach only
 *   ask for proof           → the upline who set that target
 *   attach evidence         → the target's own coach
 *   approve / reject        → the upline who asked
 *
 * "Not allowed" and "not found" return the same failure on purpose, so no route can
 * be used to discover whether another coach's target or proof exists.
 */

export type Denied = { ok: false; error: string };
const DENIED: Denied = { ok: false, error: "Not found" };

/** True only for a DIRECT downline — deliberately not the whole subtree. */
async function isDirectDownline(uplineId: string, coachId: string): Promise<boolean> {
  const coach = await prisma.user.findUnique({
    where: { id: coachId },
    select: { uplineId: true },
  });
  return coach?.uplineId === uplineId;
}

export type TargetWithProofs = {
  id: string;
  month: string;
  targetPoints: number;
  progressPoints: number;
  status: string;
  setBy: { id: string; name: string };
  proofs: {
    id: string;
    status: string;
    requestNote: string | null;
    submitNote: string | null;
    comment: string | null;
    mediaUrl: string | null;
    createdAt: Date;
  }[];
};

const targetSelect = {
  id: true,
  month: true,
  targetPoints: true,
  progressPoints: true,
  status: true,
  coachId: true,
  setById: true,
  setBy: { select: { id: true, name: true } },
  proofs: {
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      status: true,
      requestNote: true,
      submitNote: true,
      comment: true,
      mediaUrl: true,
      createdAt: true,
    },
  },
};

/** The signed-in coach's own target for a month, with any proof requests on it. */
export async function getMyTarget(coachId: string, month: string) {
  if (!isMonthKey(month)) return null;
  return prisma.target.findUnique({
    where: { coachId_month: { coachId, month } },
    select: targetSelect,
  });
}

/**
 * What an upline sees: each direct downline and their target for the month. Activity
 * flows upward (Section 5.4) — this returns points and names of COACHES, never any
 * prospect of theirs.
 */
export async function getDirectLineTargets(uplineId: string, month: string) {
  const downlines = await prisma.user.findMany({
    where: { uplineId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, photoUrl: true, city: true, levelName: true },
  });
  if (downlines.length === 0) return [];

  const targets = await prisma.target.findMany({
    where: { coachId: { in: downlines.map((d) => d.id) }, month },
    select: targetSelect,
  });
  const byCoach = new Map(targets.map((t) => [t.coachId, t]));
  return downlines.map((d) => ({ coach: d, target: byCoach.get(d.id) ?? null }));
}

export type SetTargetResult = { ok: true; id: string } | Denied;

export async function setTarget(
  actorId: string,
  coachId: string,
  month: string,
  points: number
): Promise<SetTargetResult> {
  if (!isMonthKey(month)) return { ok: false, error: "That month is not valid." };
  if (!Number.isInteger(points) || points < 1 || points > MAX_TARGET_POINTS) {
    return { ok: false, error: "Enter a target between 1 and 999999." };
  }
  // A coach cannot set their own target — the point of F7 is that it comes from
  // the upline.
  if (actorId === coachId) return DENIED;
  if (!(await isDirectDownline(actorId, coachId))) return DENIED;

  const existing = await prisma.target.findUnique({
    where: { coachId_month: { coachId, month } },
    select: { progressPoints: true },
  });
  const progress = existing?.progressPoints ?? 0;
  const status = deriveStatus(progress, points, month);

  const target = await prisma.target.upsert({
    where: { coachId_month: { coachId, month } },
    create: { coachId, setById: actorId, month, targetPoints: points, status },
    // setById is refreshed so the person who last set it is the one who can ask
    // for proof on it.
    update: { setById: actorId, targetPoints: points, status },
    select: { id: true },
  });
  return { ok: true, id: target.id };
}

export type ProgressResult =
  | { ok: true; progressPoints: number; status: string; justAchieved: boolean }
  | Denied;

/** Only the target's own coach may move their progress (F7: updated manually). */
export async function updateProgress(
  actorId: string,
  targetId: string,
  points: number
): Promise<ProgressResult> {
  if (!Number.isInteger(points) || points < 0 || points > MAX_TARGET_POINTS) {
    return { ok: false, error: "Enter a number between 0 and 999999." };
  }
  const target = await prisma.target.findUnique({
    where: { id: targetId },
    select: {
      coachId: true,
      month: true,
      targetPoints: true,
      progressPoints: true,
      status: true,
    },
  });
  if (!target || target.coachId !== actorId) return DENIED;

  const status = deriveStatus(points, target.targetPoints, target.month);
  const updated = await prisma.target.update({
    where: { id: targetId },
    data: { progressPoints: points, status },
    select: { progressPoints: true, status: true },
  });
  return {
    ok: true,
    progressPoints: updated.progressPoints,
    status: updated.status,
    // Celebrate the crossing, not every save at or above the line.
    justAchieved: status === "achieved" && target.status !== "achieved",
  };
}

export type ProofResult = { ok: true; id: string } | Denied;

/** Only the upline who set the target may ask for evidence on it. */
export async function requestProof(
  actorId: string,
  targetId: string,
  requestNote: string | null
): Promise<ProofResult> {
  const target = await prisma.target.findUnique({
    where: { id: targetId },
    select: { id: true, setById: true, coachId: true },
  });
  if (!target || target.setById !== actorId) return DENIED;
  // Guard against a stale target whose coach is no longer in this upline's line.
  if (!(await isDirectDownline(actorId, target.coachId))) return DENIED;

  const proof = await prisma.proof.create({
    data: { targetId, requestedById: actorId, requestNote },
    select: { id: true },
  });
  return { ok: true, id: proof.id };
}

/** Only the target's coach may attach evidence, and only while it is unreviewed. */
export async function submitProof(
  actorId: string,
  proofId: string,
  mediaUrl: string | null,
  submitNote: string | null
): Promise<ProofResult> {
  const proof = await prisma.proof.findUnique({
    where: { id: proofId },
    select: { id: true, status: true, target: { select: { coachId: true } } },
  });
  if (!proof || proof.target.coachId !== actorId) return DENIED;
  if (proof.status === "approved") {
    return { ok: false, error: "This one is already approved." };
  }
  if (!mediaUrl && !submitNote) {
    return { ok: false, error: "Add a photo or a short note." };
  }

  await prisma.proof.update({
    where: { id: proofId },
    data: {
      mediaUrl,
      submitNote,
      // Re-submitting after a rejection returns it to the upline's queue.
      status: "submitted",
      submittedAt: new Date(),
      reviewedAt: null,
      comment: null,
    },
  });
  return { ok: true, id: proofId };
}

/** Only the upline who asked may approve or reject. */
export async function reviewProof(
  actorId: string,
  proofId: string,
  decision: Extract<ProofStatus, "approved" | "rejected">,
  comment: string | null
): Promise<ProofResult> {
  const proof = await prisma.proof.findUnique({
    where: { id: proofId },
    select: { id: true, status: true, requestedById: true },
  });
  if (!proof || proof.requestedById !== actorId) return DENIED;
  if (proof.status === "pending") {
    return { ok: false, error: "Nothing has been sent for this yet." };
  }

  await prisma.proof.update({
    where: { id: proofId },
    data: { status: decision, comment, reviewedAt: new Date() },
  });
  return { ok: true, id: proofId };
}

/** Proof requests waiting on the signed-in coach, for the home prompt. */
export async function pendingProofCount(coachId: string): Promise<number> {
  return prisma.proof.count({
    where: { target: { coachId }, status: { in: ["pending", "rejected"] } },
  });
}

/** Submitted proofs waiting on the signed-in upline to review. */
export async function proofsAwaitingReview(uplineId: string): Promise<number> {
  return prisma.proof.count({
    where: { requestedById: uplineId, status: "submitted" },
  });
}

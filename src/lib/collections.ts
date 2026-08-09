import { Timestamp } from "firebase-admin/firestore";
import { db } from "./firebase-admin";

/**
 * Collection names and document-id construction.
 *
 * ## Why the ids look like this
 *
 * Firestore has no unique constraints. The Prisma schema had four, and every one
 * of them protects a correctness property somebody already reasoned through:
 *
 *   unique(coachId, clientId)      D6  — a retried offline sync must not create
 *                                        the same person twice
 *   unique(prospectId, inputsHash) D20 — two concurrent renders must not mint two
 *                                        live 90-day bearer tokens to one person's
 *                                        health data
 *   unique(userId, logDate)        D26 — one log per coach per day *in their own
 *                                        timezone*
 *   unique(coachId, month)             — one target per coach per month
 *
 * The only mechanism Firestore offers that is equally strong is the document id
 * itself: a `set()` on a deterministic id is an upsert, and two racing writers
 * converge on one document instead of creating two. So each constraint becomes an
 * id. Do not replace these with auto-ids and a query — the query is not atomic and
 * the constraint quietly stops existing.
 */

export const COLLECTIONS = {
  users: "users",
  prospects: "prospects",
  reports: "reports",
  dailyLogs: "dailyLogs",
  targets: "targets",
  proofs: "proofs",
  // Not yet written to. Named here so v2.4–v2.6 do not invent variants.
  threads: "threads",
  threadReceipts: "threadReceipts",
  subscriptions: "subscriptions",
  portfolios: "portfolios",
  fcmTokens: "fcmTokens",
} as const;

const SEPARATOR = "__";

/**
 * Firestore rejects ids containing "/", the ids "." and "..", ids over 1500 bytes,
 * and anything matching `__.*__`. `clientId` arrives from the browser (D6), so it
 * is attacker-influenced and gets checked rather than trusted.
 */
function assertValidDocId(id: string, what: string): string {
  if (!id || id.includes("/") || id === "." || id === "..") {
    throw new Error(`Invalid ${what} document id: ${JSON.stringify(id)}`);
  }
  if (/^__.*__$/.test(id)) {
    throw new Error(`Reserved ${what} document id: ${JSON.stringify(id)}`);
  }
  if (Buffer.byteLength(id, "utf8") > 1500) {
    throw new Error(`${what} document id exceeds 1500 bytes`);
  }
  return id;
}

/** D6. Null clientId (QR self-fills, created online in one shot) gets an auto-id. */
export function prospectDocId(coachId: string, clientId: string | null): string | null {
  if (!clientId) return null;
  return assertValidDocId(`${coachId}${SEPARATOR}${clientId}`, "prospect");
}

/** D20. Identity of a report is the inputs that produced it, never a fresh id. */
export function reportDocId(prospectId: string, inputsHash: string): string {
  return assertValidDocId(`${prospectId}${SEPARATOR}${inputsHash}`, "report");
}

/** D26. `dayKey` is the coach's local day ("YYYY-MM-DD"), not a UTC day. */
export function dailyLogDocId(userId: string, dayKey: string): string {
  return assertValidDocId(`${userId}${SEPARATOR}${dayKey}`, "dailyLog");
}

/** month is "YYYY-MM". */
export function targetDocId(coachId: string, month: string): string {
  return assertValidDocId(`${coachId}${SEPARATOR}${month}`, "target");
}

/**
 * Ordered ancestors, nearest first: `uplinePath[0]` is the direct upline.
 *
 * This is what replaces `isInDownline()`, which walked the tree with one query per
 * hop for up to 100 hops. It also lets an upline count their whole line's activity
 * with a single `array-contains` instead of a `groupBy` Firestore cannot express
 * (see PLAN_V2.1a.md §5).
 *
 * Cycle-guarded: a corrupt `uplineId` chain must not hang the migration.
 */
export function buildUplinePath(
  userId: string,
  uplineById: Map<string, string | null>
): string[] {
  const path: string[] = [];
  const seen = new Set<string>([userId]);
  let current = uplineById.get(userId) ?? null;
  while (current && !seen.has(current)) {
    path.push(current);
    seen.add(current);
    current = uplineById.get(current) ?? null;
  }
  return path;
}

export type UserDoc = {
  phone: string;
  name: string;
  photoUrl: string | null;
  city: string | null;
  referralCode: string;
  levelName: string | null;
  uplineId: string | null;
  /** Nearest ancestor first. See buildUplinePath. */
  uplinePath: string[];
  /** Firestore cannot count children; maintained on signup. */
  directDownlineCount: number;
  /** The privacy toggle. Default false is a hard requirement (v1 §5.4). */
  shareProspects: boolean;
  plan: string;
  trialEndsAt: Timestamp | null;
  followupPushOn: string | null;
  createdAt: Timestamp;
};

export type ProspectDoc = {
  coachId: string;
  /** Denormalised from the coach so an upline query needs no join. */
  coachUplinePath: string[];
  clientId: string | null;
  name: string;
  phone: string;
  age: number | null;
  gender: string | null;
  heightCm: number | null;
  weightKg: number | null;
  stage: string;
  nextFollowupAt: Timestamp | null;
  source: string;
  notes: string | null;
  createdAt: Timestamp;
};

export type ReportDoc = {
  prospectId: string;
  /** Denormalised: the public report route resolves by token with no prospect read. */
  coachId: string;
  token: string;
  metricsJson: string;
  inputsHash: string;
  sentAt: Timestamp | null;
  createdAt: Timestamp;
};

export type DailyLogDoc = {
  userId: string;
  /** Local day. The doc id carries this too; the field exists so it is queryable. */
  dayKey: string;
  logDate: Timestamp;
  uplinePath: string[];
  servings: number;
  memberships: number;
  sessions: number;
  invites: number;
  followupsDone: number;
  note: string | null;
  createdAt: Timestamp;
};

export type TargetDoc = {
  coachId: string;
  setById: string;
  uplinePath: string[];
  month: string;
  targetPoints: number;
  progressPoints: number;
  status: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type ProofDoc = {
  targetId: string;
  coachId: string;
  requestedById: string;
  requestNote: string | null;
  status: string;
  mediaUrl: string | null;
  submitNote: string | null;
  comment: string | null;
  createdAt: Timestamp;
  submittedAt: Timestamp | null;
  reviewedAt: Timestamp | null;
};

export const users = () => db.collection(COLLECTIONS.users);
export const prospects = () => db.collection(COLLECTIONS.prospects);
export const reports = () => db.collection(COLLECTIONS.reports);
export const dailyLogs = () => db.collection(COLLECTIONS.dailyLogs);
export const targets = () => db.collection(COLLECTIONS.targets);
export const proofs = () => db.collection(COLLECTIONS.proofs);

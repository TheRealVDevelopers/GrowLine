import { randomInt } from "crypto";
import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { db } from "./firebase-admin";
import {
  COLLECTIONS,
  referralCodeDocId,
  referralCodes,
  users,
} from "./collections";

/**
 * User reads and writes against Firestore.
 *
 * `AppUser` is deliberately shape-compatible with the Prisma `User` model it
 * replaces — same field names, `Date` rather than `Timestamp` — so the nine
 * screens calling `getSessionUser()` need no changes at all. It adds `uplinePath`
 * and `directDownlineCount`, which Prisma had no equivalent of (D36).
 */

export type AppUser = {
  id: string;
  phone: string;
  name: string;
  photoUrl: string | null;
  city: string | null;
  uplineId: string | null;
  uplinePath: string[];
  directDownlineCount: number;
  referralCode: string;
  levelName: string | null;
  plan: string;
  /** Required in the Prisma model it replaces, so kept non-null here too. */
  trialEndsAt: Date;
  shareProspects: boolean;
  followupPushOn: string | null;
  createdAt: Date;
};

const toDate = (v: unknown): Date | null =>
  v instanceof Timestamp ? v.toDate() : null;

export function toAppUser(snap: DocumentSnapshot): AppUser | null {
  const d = snap.data();
  if (!d) return null;
  return {
    id: snap.id,
    phone: d.phone,
    name: d.name,
    photoUrl: d.photoUrl ?? null,
    city: d.city ?? null,
    uplineId: d.uplineId ?? null,
    uplinePath: d.uplinePath ?? [],
    directDownlineCount: d.directDownlineCount ?? 0,
    referralCode: d.referralCode,
    levelName: d.levelName ?? null,
    plan: d.plan ?? "trial",
    // Epoch rather than "now" when absent: a missing date should read as an
    // expired trial the coach can see, not a fresh one silently granted.
    trialEndsAt: toDate(d.trialEndsAt) ?? new Date(0),
    shareProspects: d.shareProspects === true,
    followupPushOn: d.followupPushOn ?? null,
    createdAt: toDate(d.createdAt) ?? new Date(0),
  };
}

export async function getUserById(id: string): Promise<AppUser | null> {
  return toAppUser(await users().doc(id).get());
}

export async function getUserByPhone(phone: string): Promise<AppUser | null> {
  const snap = await users().where("phone", "==", phone).limit(1).get();
  return snap.empty ? null : toAppUser(snap.docs[0]);
}

/**
 * Resolves a referral code through its reservation document (D41).
 *
 * Two document reads and no query, which also means no single-field index and no
 * chance of returning the wrong coach if two ever shared a code — the reservation
 * makes that state unreachable rather than merely unlikely.
 */
export async function getUserByReferralCode(code: string): Promise<AppUser | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const claim = await referralCodes().doc(referralCodeDocId(trimmed)).get();
  if (!claim.exists) return null;
  const uid = claim.data()?.uid as string | undefined;
  return uid ? getUserById(uid) : null;
}

export async function getUsersByIds(ids: string[]): Promise<AppUser[]> {
  if (ids.length === 0) return [];
  const refs = ids.map((id) => users().doc(id));
  const snaps = await db.getAll(...refs);
  return snaps.map(toAppUser).filter((u): u is AppUser => u !== null);
}

// No 0/O/1/I — codes get read aloud and typed on cheap keyboards.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const CLAIM_ATTEMPTS = 20;

function candidateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/**
 * A code that is free *at the moment you ask*, which is not the same as a code you
 * own. Only exported for the migration backfill, which claims codes that already
 * exist rather than inventing them.
 *
 * Do not use this to pick a code and then write it in a separate step — that is
 * precisely the race D41 fixes. Claiming happens inside createUser's transaction.
 */
export async function isReferralCodeFree(code: string): Promise<boolean> {
  return !(await referralCodes().doc(referralCodeDocId(code)).get()).exists;
}

const TRIAL_DAYS = 60;

/**
 * Creates the user document for an already-authenticated Firebase user.
 *
 * `uid` is the Firebase Auth uid and becomes the document id — the invariant
 * D34 established, which is what lets Security Rules compare `request.auth.uid`
 * with no lookup. Migrated users carry their old cuid as their uid; users who
 * sign up from here get a Firebase-minted one. Both are simply "the uid".
 *
 * The upline's `directDownlineCount` moves in the same transaction as the new
 * user, because Firestore cannot count children and a counter that drifts is
 * worse than no counter.
 */
export async function createUser(params: {
  uid: string;
  phone: string;
  name: string;
  city: string;
  photoUrl: string | null;
  upline: AppUser | null;
}): Promise<AppUser> {
  const { uid, phone, name, city, photoUrl, upline } = params;

  // Nearest ancestor first, so the new user's path is their upline prepended to
  // the upline's own path (collections.ts buildUplinePath, same ordering).
  const uplinePath = upline ? [upline.id, ...upline.uplinePath] : [];

  const base = {
    phone,
    name,
    city,
    photoUrl,
    uplineId: upline?.id ?? null,
    uplinePath,
    directDownlineCount: 0,
    levelName: null,
    // v2 §8 cancels the trial model; `plan` stays until v2.6 replaces it with
    // tiers, so a migrated row and a new row keep the same shape until then.
    plan: "trial",
    trialEndsAt: Timestamp.fromDate(new Date(Date.now() + TRIAL_DAYS * 86_400_000)),
    shareProspects: false, // v1 §5.4 — never default this to true
    followupPushOn: null,
    createdAt: Timestamp.now(),
  };

  /**
   * The code is claimed INSIDE the transaction that writes the user (D41).
   *
   * Reading "is this code free?" beforehand and writing it afterwards is what the
   * Prisma unique constraint used to make safe: two signups could both read free
   * and both write, and the database refused the second. Firestore will not. So the
   * reservation document is read and created in the same transaction, which
   * Firestore aborts if anyone else claimed it in between.
   */
  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
    const code = candidateCode();
    const claimRef = referralCodes().doc(referralCodeDocId(code));
    let taken = false;

    await db.runTransaction(async (tx) => {
      if ((await tx.get(claimRef)).exists) {
        taken = true;
        return;
      }
      tx.create(claimRef, { uid, createdAt: Timestamp.now() });
      tx.set(users().doc(uid), { ...base, referralCode: code });
      if (upline) {
        tx.update(users().doc(upline.id), {
          directDownlineCount: FieldValue.increment(1),
        });
      }
    });

    if (!taken) return (await getUserById(uid))!;
  }

  // 32^6 codes against 20 tries: reaching here means the space is genuinely
  // crowded, not that we were unlucky. Failing loudly beats issuing a duplicate.
  throw new Error("Could not claim a unique referral code");
}

export async function updateUser(
  id: string,
  data: Partial<{
    name: string;
    city: string;
    photoUrl: string | null;
    levelName: string | null;
    shareProspects: boolean;
    followupPushOn: string | null;
  }>
): Promise<AppUser | null> {
  await users().doc(id).update(data);
  return getUserById(id);
}

/** Direct downlines only. Deeper levels come from uplinePath queries (D36). */
export async function getDirectDownlines(uplineId: string): Promise<AppUser[]> {
  const snap = await db
    .collection(COLLECTIONS.users)
    .where("uplineId", "==", uplineId)
    .orderBy("createdAt", "asc")
    .get();
  return snap.docs.map(toAppUser).filter((u): u is AppUser => u !== null);
}

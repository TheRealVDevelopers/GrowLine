import { randomInt } from "crypto";
import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { db } from "./firebase-admin";
import { COLLECTIONS, users } from "./collections";

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
  trialEndsAt: Date | null;
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
    trialEndsAt: toDate(d.trialEndsAt),
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

export async function getUserByReferralCode(code: string): Promise<AppUser | null> {
  const snap = await users().where("referralCode", "==", code).limit(1).get();
  return snap.empty ? null : toAppUser(snap.docs[0]);
}

export async function getUsersByIds(ids: string[]): Promise<AppUser[]> {
  if (ids.length === 0) return [];
  const refs = ids.map((id) => users().doc(id));
  const snaps = await db.getAll(...refs);
  return snaps.map(toAppUser).filter((u): u is AppUser => u !== null);
}

// No 0/O/1/I — codes get read aloud and typed on cheap keyboards.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function generateReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)];
    if (!(await getUserByReferralCode(code))) return code;
  }
  throw new Error("Could not generate a unique referral code");
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
  const referralCode = await generateReferralCode();

  // Nearest ancestor first, so the new user's path is their upline prepended to
  // the upline's own path (collections.ts buildUplinePath, same ordering).
  const uplinePath = upline ? [upline.id, ...upline.uplinePath] : [];

  const doc = {
    phone,
    name,
    city,
    photoUrl,
    uplineId: upline?.id ?? null,
    uplinePath,
    directDownlineCount: 0,
    referralCode,
    levelName: null,
    // v2 §8 cancels the trial model; `plan` stays until v2.6 replaces it with
    // tiers, so a migrated row and a new row keep the same shape until then.
    plan: "trial",
    trialEndsAt: Timestamp.fromDate(new Date(Date.now() + TRIAL_DAYS * 86_400_000)),
    shareProspects: false, // v1 §5.4 — never default this to true
    followupPushOn: null,
    createdAt: Timestamp.now(),
  };

  await db.runTransaction(async (tx) => {
    tx.set(users().doc(uid), doc);
    if (upline) {
      tx.update(users().doc(upline.id), {
        directDownlineCount: FieldValue.increment(1),
      });
    }
  });

  return (await getUserById(uid))!;
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

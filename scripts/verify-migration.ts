/**
 * Asserts the things the migration actually claims — not just that rows arrived.
 *
 *   npx tsx scripts/verify-migration.ts
 *
 * Row counts matching proves very little on their own: a migration can move every
 * row and still put the tree, the day boundaries or the document ids somewhere
 * wrong. These are the claims PLAN_V2.1a.md makes, each one checked.
 */
import "dotenv/config";
import { auth, db } from "../src/lib/firebase-admin";
import { COLLECTIONS, dailyLogDocId, reportDocId } from "../src/lib/collections";

const ROOT = "usr_root0000000000000000";
const ASHA = "usr_asha0000000000000000";
const BHAV = "usr_bhav0000000000000000";
const CHAN = "usr_chan0000000000000000";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  console.log("\nVerifying migration\n");

  // --- Decision 1: the Auth uid IS the old cuid -------------------------------
  const authUser = await auth.getUser(ASHA);
  check("Auth uid equals the pre-existing cuid", authUser.uid === ASHA, authUser.uid);
  check("Auth phone preserved in E.164", authUser.phoneNumber === "+919000000002", authUser.phoneNumber ?? "none");

  // Every foreign key still resolves, because no id was ever rewritten.
  const ashaDoc = await db.collection(COLLECTIONS.users).doc(ASHA).get();
  check("user doc id equals the Auth uid", ashaDoc.exists && ashaDoc.id === authUser.uid);

  // --- uplinePath: ordered, nearest ancestor first ----------------------------
  const chan = (await db.collection(COLLECTIONS.users).doc(CHAN).get()).data()!;
  const path: string[] = chan.uplinePath;
  check("uplinePath is nearest-ancestor-first", path[0] === ASHA && path[1] === ROOT, JSON.stringify(path));
  check("root has an empty uplinePath",
    ((await db.collection(COLLECTIONS.users).doc(ROOT).get()).data()!.uplinePath as string[]).length === 0);
  check("directDownlineCount is materialised",
    (await db.collection(COLLECTIONS.users).doc(ROOT).get()).data()!.directDownlineCount === 2);

  // --- Decision 3: the team roll-up WITHOUT groupBy ---------------------------
  // This is the query that replaces the four groupBy aggregations in team.ts.
  // Asha's path is [root]; Chandan's is [asha, root] — so both are in root's line.
  const augustLogs = await db
    .collection(COLLECTIONS.dailyLogs)
    .where("uplinePath", "array-contains", ROOT)
    .where("dayKey", ">=", "2026-08-01")
    .count()
    .get();
  check("whole-line month roll-up via array-contains + count()",
    augustLogs.data().count === 6, `${augustLogs.data().count} logs (expected 6)`);

  // The July log must be excluded — D26's month boundary, in IST not UTC.
  const julyOnly = await db
    .collection(COLLECTIONS.dailyLogs)
    .where("uplinePath", "array-contains", ROOT)
    .where("dayKey", "==", "2026-07-31")
    .count()
    .get();
  check("month boundary respected (July logs not counted as August)",
    julyOnly.data().count === 2, `${julyOnly.data().count} logs on 2026-07-31`);

  // --- D26: the composite id IS the uniqueness constraint ---------------------
  const logId = dailyLogDocId(ASHA, "2026-08-09");
  const log = await db.collection(COLLECTIONS.dailyLogs).doc(logId).get();
  check("daily log addressable by userId__dayKey", log.exists, logId);
  check("stored dayKey is the coach's local day", log.data()?.dayKey === "2026-08-09");

  // --- D20: one report identity per set of inputs -----------------------------
  const reportSnap = await db.collection(COLLECTIONS.reports).limit(1).get();
  const report = reportSnap.docs[0];
  check("report id is prospectDocId__inputsHash",
    report.id === reportDocId(report.data().prospectId, report.data().inputsHash), report.id);
  check("report token preserved intact",
    report.data().token === "Xk7mQp2RtY9wLb4NcF6vHs3JdG8zA5eU");

  // --- D6: offline-capture idempotency survived as a doc id -------------------
  const queued = await db.collection(COLLECTIONS.prospects)
    .where("clientId", "!=", null).limit(1).get();
  const q = queued.docs[0];
  check("queued capture id is coachId__clientId",
    q.id === `${q.data().coachId}__${q.data().clientId}`, q.id);

  const qr = await db.collection(COLLECTIONS.prospects).where("source", "==", "qr").get();
  check("QR self-fill kept an id with no clientId component",
    qr.docs.length === 1 && qr.docs[0].data().clientId === null);

  // --- Privacy: the data the v2.1b rules test will need -----------------------
  const share = (await db.collection(COLLECTIONS.users).doc(ASHA).get()).data()!.shareProspects;
  const noShare = (await db.collection(COLLECTIONS.users).doc(BHAV).get()).data()!.shareProspects;
  check("shareProspects migrated per-user, not defaulted", share === true && noShare === false,
    `asha=${share} bhavana=${noShare}`);

  // --- OTP table is gone, not carried over ------------------------------------
  const otp = await db.collection("otpCodes").count().get();
  check("otp_codes NOT migrated (Firebase Auth owns this now)", otp.data().count === 0);

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

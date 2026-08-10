import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

/**
 * Cloud Functions for Growline (BUILD_PROMPT_V2 §3, §11.2).
 *
 * Two jobs only:
 *
 *   1. Maintain the roll-up counters the home screen reads, so it never pays for
 *      an aggregation on load.
 *   2. Fire the morning follow-up reminder on a schedule, replacing the external
 *      cron that used to POST /api/notifications/daily.
 *
 * Deliberately NOT here: anything the app can do correctly at write time.
 * `directDownlineCount` moves inside the signup transaction (users.ts) and
 * `uplinePath` is stamped on write (D36) — a Function doing either would be an
 * eventually-consistent copy of a value that is already exact.
 */

setGlobalOptions({ region: "asia-south1", maxInstances: 10 });

initializeApp();
const db = getFirestore();

/**
 * Keeps `users.thisMonthActivity` current as daily logs are written.
 *
 * This is the one v2 §3 asks for by name. The team tree does not depend on it —
 * that reads logs directly via `uplinePath` + `count()` (D36) — so if this
 * Function is down the tree stays correct and only the home summary goes stale.
 * That is the intended failure mode: a counter should never be the only copy of
 * a number a screen needs.
 */
export const onDailyLogWritten = onDocumentWritten("dailyLogs/{logId}", async (event) => {
  const after = event.data?.after.data();
  const before = event.data?.before.data();
  const userId = (after ?? before)?.userId as string | undefined;
  if (!userId) return;

  const created = !before && !!after;
  const deleted = !!before && !after;
  if (!created && !deleted) return; // an edit does not change the count

  const monthPrefix = ((after ?? before)?.dayKey as string).slice(0, 7);
  const current = await db
    .collection("dailyLogs")
    .where("userId", "==", userId)
    .where("dayKey", ">=", `${monthPrefix}-01`)
    .where("dayKey", "<=", `${monthPrefix}-31`)
    .count()
    .get();

  // Recomputed rather than incremented. An increment that runs twice — a retry, a
  // redeploy mid-write — is silently wrong forever, and nothing would ever notice.
  await db.collection("users").doc(userId).set(
    {
      thisMonthActivity: {
        month: monthPrefix,
        logs: current.data().count,
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );
});

/**
 * The morning follow-up reminder (D23).
 *
 * Hourly, not daily, and the per-coach decision is unchanged: a single daily cron
 * fires at one UTC moment, which is the middle of the night for someone. Each
 * coach is notified only when it is morning in *their* timezone and only once per
 * local day, tracked by `users.followupPushOn`.
 *
 * The logic still lives in the route so it has one home; this only replaces the
 * external scheduler that used to call it. The route fails closed without
 * CRON_SECRET, so that is passed here rather than removed.
 */
export const morningReminder = onSchedule(
  { schedule: "every 60 minutes", timeZone: "Etc/UTC", secrets: ["CRON_SECRET"] },
  async () => {
    const base = process.env.SITE_URL;
    const secret = process.env.CRON_SECRET;
    if (!base || !secret) {
      console.error("morningReminder: SITE_URL or CRON_SECRET missing — not sending");
      return;
    }
    const res = await fetch(`${base}/api/notifications/daily`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    });
    if (!res.ok) {
      console.error(`morningReminder: ${res.status} ${await res.text()}`);
      return;
    }
    const body = (await res.json()) as { toNotify?: number; coachesConsidered?: number };
    console.log(
      `morningReminder: considered ${body.coachesConsidered ?? 0}, notified ${body.toNotify ?? 0}`
    );
  }
);

/**
 * Purges prospect health data after 180 days of inactivity (v2 §5.3).
 *
 * Scheduled here rather than in v2.3 because the collection it acts on is being
 * created now, and a retention rule that arrives after the data does is a
 * retention rule that has already been broken once.
 *
 * Contact details survive; height, weight and derived metrics do not. The reports
 * go with them — they are the derived metrics, in a form a prospect can still open
 * (D17), so leaving them would make the purge cosmetic.
 */
const RETENTION_DAYS = 180;

export const purgeStaleHealthData = onSchedule(
  { schedule: "every day 03:00", timeZone: "Asia/Kolkata" },
  async () => {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    const stale = await db
      .collection("prospects")
      .where("createdAt", "<", cutoff)
      .where("heightCm", "!=", null)
      .limit(400)
      .get();

    let purged = 0;
    for (const docSnap of stale.docs) {
      const reports = await db
        .collection("reports")
        .where("prospectId", "==", docSnap.id)
        .get();
      const batch = db.batch();
      for (const r of reports.docs) batch.delete(r.ref);
      batch.update(docSnap.ref, {
        heightCm: null,
        weightKg: null,
        age: null,
        gender: null,
        healthPurgedAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();
      purged++;
    }
    // Logged, per v2 §5.3 — a purge nobody can evidence is not a control.
    console.log(`purgeStaleHealthData: purged ${purged} prospect(s)`);
  }
);

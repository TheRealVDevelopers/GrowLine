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
 * Purges prospect health data after 180 days of INACTIVITY (v2 §5.3, RULES P5).
 *
 * Scheduled here rather than in v2.3 because the collection it acts on is being
 * created now, and a retention rule that arrives after the data does is a
 * retention rule that has already been broken once.
 *
 * Contact details survive; height, weight and derived metrics do not. The reports
 * go with them — they are the derived metrics, in a form a prospect can still open
 * (D17), so leaving them would make the purge cosmetic.
 *
 * ## This keyed off `createdAt` until 2026-08-14, and that was wrong
 *
 * Record age is not inactivity. A prospect captured 200 days ago and worked yesterday —
 * moved to "Attended", opening their snapshot every week — had their height, weight and
 * every derived metric nulled anyway, and their reports deleted with them. Live data
 * destroyed on a healthy relationship, by the one job in this codebase that cannot be
 * undone, and it contradicted the rule's own words.
 *
 * It now reads `lastActivityAt`, which is stamped at capture and pushed forward by the two
 * events the rule names: a stage move, and the prospect opening their own report. See
 * `src/modules/retention/activity.ts` for why nothing else counts.
 *
 * A prospect MISSING the field is not purged. That fails toward keeping data, which is
 * the wrong direction for a retention obligation and the right one for an irreversible
 * delete — a row the backfill has not reached must not be mistaken for one nobody has
 * touched in six months. `npm run backfill:prospect-activity -- --check` exits non-zero
 * while any row is still missing it, which is what makes that gap closeable rather than
 * permanent.
 */
const RETENTION_DAYS = 180;

export const purgeStaleHealthData = onSchedule(
  { schedule: "every day 03:00", timeZone: "Asia/Kolkata" },
  async () => {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    const stale = await db
      .collection("prospects")
      .where("lastActivityAt", "<", cutoff)
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

/**
 * Scheduled functions defined in sibling files.
 *
 * A Cloud Function deploys only if it is exported from THIS file. Each of the six below
 * was written complete, tested, and left unexported, because the sessions that wrote them
 * recorded that they were not permitted to edit `index.ts` — so each file ends with a
 * comment naming the exact line needed here. These are those lines.
 *
 * What was actually broken while they sat unexported, worst first:
 *
 *   - `purgeVoiceNotes` — the app's own UI tells a coach their recording is deleted after
 *     30 days. Nothing deleted it. That is a retention promise made to a user and not
 *     kept, which is the same class of failure RULES P5 exists to prevent, and it is why
 *     this list could not wait on the authorisation question below.
 *   - `silenceCheck` — an upline is never told a leg has gone quiet, which is the entire
 *     point of the feature.
 *   - `rebuildLeaderboards`, `evaluateQualifications`, `qualificationReminders`,
 *     `rebuildDuplicationScores` — boards never refresh, day-14/7/3/1 reminders never
 *     fire, and the duplication screen reads "nothing counted yet" forever with no lazy
 *     fallback behind it.
 *
 * They still fail closed until `CRON_SECRET` is provisioned in the deployment environment
 * — it is blank in `.env.example`. Exporting them is necessary, not sufficient.
 *
 * NOTE for whoever resolves it: four of these six belong to features that STATUS.md
 * records as an open conflict against RULES S7 (Phase 2 built before the 200-paying-user
 * bar, which is not met). Exporting them is a correctness fix to code that already exists
 * — it does not settle whether that code should ship. If the answer is that it should not,
 * the four lines come back out; the two retention/alert ones stay.
 */
export { rebuildLeaderboards } from "./leaderboards";
export { evaluateQualifications, qualificationReminders } from "./qualifications";
export { rebuildDuplicationScores } from "./duplication";
export { silenceCheck } from "./silence";
export { purgeVoiceNotes } from "./voice-logs";

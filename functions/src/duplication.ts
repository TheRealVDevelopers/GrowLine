import { onSchedule } from "firebase-functions/v2/scheduler";

/**
 * The scheduled rebuild of every coach's duplication reading (F20).
 *
 * ## Shape
 *
 * A thin caller, like `morningReminder` in index.ts and `rebuildLeaderboards` in
 * leaderboards.ts: the aggregation lives in the app at `/api/duplication/rebuild` so
 * it has one home and is runnable by hand against the emulator. `functions/` is a
 * separate build with its own dependency tree and cannot import
 * `src/modules/duplication/compute.ts`; copying it here would be a second copy of an
 * aggregation that has to agree with itself.
 *
 * ## NOT WIRED UP — read this before assuming the number refreshes itself
 *
 * A Cloud Function is deployed only if it is exported from `functions/src/index.ts`,
 * and this branch is not permitted to edit that file. So this function EXISTS but is
 * not deployed. One line in index.ts turns it on:
 *
 *     export { rebuildDuplicationScores } from "./duplication";
 *
 * Until somebody adds it, a reading is produced only when something POSTs the route
 * with CRON_SECRET, and until the first one runs the screen says plainly that
 * nothing has been counted yet rather than showing a zero. A zero is a verdict on a
 * line; "not counted yet" is the truth.
 *
 * ## Once a day, at 04:00
 *
 * The window is 28 days and rolls one day at a time, so this number genuinely cannot
 * move much between one morning and the next — running it every three hours like the
 * boards would spend eight whole-organisation reads a day to shift a percentage
 * point. 04:00 India time is after the latest evening logs are in and before anybody
 * opens the app, so the reading a coach sees at breakfast includes yesterday.
 */
export const rebuildDuplicationScores = onSchedule(
  { schedule: "every day 04:00", timeZone: "Asia/Kolkata", secrets: ["CRON_SECRET"] },
  async () => {
    const base = process.env.SITE_URL;
    const secret = process.env.CRON_SECRET;
    if (!base || !secret) {
      console.error("rebuildDuplicationScores: SITE_URL or CRON_SECRET missing — not running");
      return;
    }

    const res = await fetch(`${base}/api/duplication/rebuild`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    });
    if (!res.ok) {
      console.error(`rebuildDuplicationScores: ${res.status} ${await res.text()}`);
      return;
    }
    const body = (await res.json()) as { scored?: number; cleared?: number };
    console.log(
      `rebuildDuplicationScores: ${body.scored ?? 0} reading(s), ${body.cleared ?? 0} cleared`
    );
  }
);

import { onSchedule } from "firebase-functions/v2/scheduler";

/**
 * The scheduled rebuild of the leaderboard snapshots (F13).
 *
 * ## Shape
 *
 * A thin caller, exactly like `morningReminder` in index.ts: the aggregation lives
 * in the app at `/api/leaderboards/rebuild` so it has one home, is runnable by hand
 * against the emulator, and does not exist twice in two packages that drift apart.
 * `functions/` is a separate build with its own dependency tree — it cannot import
 * `src/modules/leaderboards/compute.ts`, and copying it here would be the second
 * copy of an aggregation whose whole job is to agree with itself.
 *
 * ## NOT WIRED UP — read this before assuming boards refresh themselves
 *
 * A Cloud Function is deployed only if it is exported from `functions/src/index.ts`,
 * and this branch is not permitted to edit that file. So this function EXISTS but is
 * not deployed. One line in index.ts turns it on:
 *
 *     export { rebuildLeaderboards } from "./leaderboards";
 *
 * Until somebody adds it, the boards refresh only when something POSTs the route
 * with CRON_SECRET. The screen always shows when a board was last built, so a stale
 * board says so rather than quietly presenting last week's ranking as today's.
 *
 * ## Every three hours
 *
 * A board is a standings table, not a live score. Three hours keeps it feeling
 * current while the whole-organisation read it performs happens eight times a day
 * rather than every time a coach opens the screen — which is the entire reason the
 * snapshots exist.
 */
export const rebuildLeaderboards = onSchedule(
  { schedule: "every 3 hours", timeZone: "Asia/Kolkata", secrets: ["CRON_SECRET"] },
  async () => {
    const base = process.env.SITE_URL;
    const secret = process.env.CRON_SECRET;
    if (!base || !secret) {
      console.error("rebuildLeaderboards: SITE_URL or CRON_SECRET missing — not running");
      return;
    }

    const res = await fetch(`${base}/api/leaderboards/rebuild`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    });
    if (!res.ok) {
      console.error(`rebuildLeaderboards: ${res.status} ${await res.text()}`);
      return;
    }
    const body = (await res.json()) as { boardsWritten?: number; scopes?: number };
    console.log(
      `rebuildLeaderboards: ${body.boardsWritten ?? 0} board(s) across ${body.scopes ?? 0} scope(s)`
    );
  }
);

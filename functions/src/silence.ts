import { onSchedule } from "firebase-functions/v2/scheduler";

/**
 * The scheduled silence check (session 4, feature 3).
 *
 * ## Shape
 *
 * A thin caller, like `morningReminder` in index.ts and `rebuildLeaderboards` beside
 * this file: the whole judgement lives in the app at `/api/silence`, so it has one
 * home, is runnable by hand against the emulator, and does not exist twice in two
 * packages with separate dependency trees that drift apart.
 *
 * ## NOT WIRED UP — read this before assuming uplines are being told anything
 *
 * A Cloud Function is deployed only if it is exported from `functions/src/index.ts`,
 * and this branch is not permitted to edit that file. So this function EXISTS but is
 * not deployed. One line in index.ts turns it on:
 *
 *     export { silenceCheck } from "./silence";
 *
 * Until somebody adds it, the check runs only when something POSTs the route with
 * CRON_SECRET. Nothing degrades in the meantime — no alert is simply no alert, and the
 * team tree still shows who logged today, which is where this notification would have
 * sent them anyway.
 *
 * ## Once a day, at 9am
 *
 * Morning, so an upline reads it at a time when ringing somebody is reasonable. A
 * notification about a person's quiet fortnight arriving at 11pm is the same sentence
 * with a completely different tone, and there is no urgency here that justifies it —
 * a leg that has been quiet for nine days does not become worse overnight.
 *
 * Asia/Kolkata rather than per-coach local time, unlike the follow-up reminder. That
 * reminder is about the recipient's own day and has to land in their morning; this one
 * is about somebody else's fortnight and a fixed daily run is honest for a pilot that
 * is entirely in one country. The day it is not, this becomes hourly with the same
 * per-user local-morning test `morningReminder` already carries.
 */
export const silenceCheck = onSchedule(
  { schedule: "every day 09:00", timeZone: "Asia/Kolkata", secrets: ["CRON_SECRET"] },
  async () => {
    const base = process.env.SITE_URL;
    const secret = process.env.CRON_SECRET;
    if (!base || !secret) {
      console.error("silenceCheck: SITE_URL or CRON_SECRET missing — not running");
      return;
    }

    const res = await fetch(`${base}/api/silence`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    });
    if (!res.ok) {
      console.error(`silenceCheck: ${res.status} ${await res.text()}`);
      return;
    }
    const body = (await res.json()) as { sent?: number; legsConsidered?: number };
    console.log(
      `silenceCheck: ${body.sent ?? 0} alert(s) across ${body.legsConsidered ?? 0} leg(s)`
    );
  }
);

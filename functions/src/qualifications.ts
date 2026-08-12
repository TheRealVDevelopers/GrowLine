import { onSchedule } from "firebase-functions/v2/scheduler";

/**
 * The two scheduled jobs behind event qualifications (F14).
 *
 * ## Shape
 *
 * Thin callers, exactly like `morningReminder` in index.ts and `rebuildLeaderboards`
 * in leaderboards.ts: the work lives in the app, at `/api/qualifications/evaluate`
 * and `/api/qualifications/reminders`, so it has one home, is runnable by hand
 * against the emulator, and does not exist twice in two packages that drift apart.
 * `functions/` is a separate build with its own dependency tree — it cannot import
 * `src/modules/qualifications/evaluate.ts`.
 *
 * ## NOT WIRED UP — read this before assuming reminders go out
 *
 * A Cloud Function is deployed only if it is exported from `functions/src/index.ts`,
 * and this branch is not permitted to edit that file. So both functions EXIST and
 * neither is deployed. Two lines in index.ts turn them on:
 *
 *     export { evaluateQualifications, qualificationReminders } from "./qualifications";
 *
 * Until somebody adds that, the trackers still work — the create path evaluates
 * synchronously and a stale screen refreshes itself on open (`ensureFresh` in
 * evaluate.ts) — but nothing is PUSHED. The escalating reminders are the part that
 * genuinely does not happen without a scheduler, because they are the only piece that
 * has to reach a coach who is not looking at the app.
 */

/**
 * Every three hours, matching the boards.
 *
 * A qualification is a standings table with a deadline, not a live score. Three hours
 * keeps the numbers current while the whole-line read it performs happens eight times
 * a day rather than once per screen open, which is the entire reason the rows are
 * stored instead of computed on the page.
 */
export const evaluateQualifications = onSchedule(
  { schedule: "every 3 hours", timeZone: "Asia/Kolkata", secrets: ["CRON_SECRET"] },
  async () => {
    const body = await call("evaluate");
    if (body) {
      console.log(`evaluateQualifications: ${body.evaluated ?? 0} qualification(s)`);
    }
  }
);

/**
 * Once a day, at nine in the morning, India time.
 *
 * Daily rather than hourly because the escalation bands are measured in DAYS
 * (reminders.ts) — an hourly job would find every due coach already marked on its
 * second run and spend the rest of the day rediscovering that.
 *
 * Nine in the morning rather than the evening: the reminder names something a coach
 * can still act on today, and telling somebody at 9pm that it is the last day is a
 * message about a door that has already shut. `morningReminder` resolves each coach's
 * own local morning because push subscriptions carry a timezone; this audience is in
 * one zone (v1 §1) and the qualification's own deadline is stated in it, so the
 * schedule is pinned to the same zone rather than inferring it per device.
 */
export const qualificationReminders = onSchedule(
  { schedule: "0 9 * * *", timeZone: "Asia/Kolkata", secrets: ["CRON_SECRET"] },
  async () => {
    const body = await call("reminders");
    if (body) {
      const outcomes = (body.outcomes ?? []) as { notified?: number }[];
      const notified = outcomes.reduce((n, o) => n + (o.notified ?? 0), 0);
      console.log(
        `qualificationReminders: ${notified} coach(es) across ${outcomes.length} qualification(s)`
      );
    }
  }
);

/** Shared POST, so a missing secret is reported the same way by both jobs. */
async function call(
  path: "evaluate" | "reminders"
): Promise<Record<string, unknown> | null> {
  const base = process.env.SITE_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error(`qualifications/${path}: SITE_URL or CRON_SECRET missing — not running`);
    return null;
  }

  const res = await fetch(`${base}/api/qualifications/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
  if (!res.ok) {
    console.error(`qualifications/${path}: ${res.status} ${await res.text()}`);
    return null;
  }
  return (await res.json()) as Record<string, unknown>;
}

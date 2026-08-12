import { onSchedule } from "firebase-functions/v2/scheduler";

/**
 * The scheduled purge of uncounted voice notes (session 4, feature 1).
 *
 * A recording a coach made and never turned into numbers is invisible to every screen,
 * counted by nothing, and readable by nobody but its author. Keeping it indefinitely
 * stores personal data — audio of somebody's working day, which may name the people
 * they met — for a purpose nobody can state. Thirty days, then it goes, and the
 * recorder says so on screen before the coach speaks so the deletion is expected rather
 * than a surprise.
 *
 * Counted notes are untouched: their audio was already dropped at the moment the numbers
 * landed in the daily log, and what remains is a small receipt tying that log to the
 * capture that produced it.
 *
 * ## Shape, and the same warning as its neighbours
 *
 * A thin caller — the work is at `/api/voice-logs/purge`. And like `silenceCheck` and
 * `rebuildLeaderboards`, this function EXISTS but is NOT DEPLOYED, because a function
 * ships only if it is exported from `functions/src/index.ts` and this branch may not
 * edit that file. One line turns it on:
 *
 *     export { purgeVoiceNotes } from "./voice-logs";
 *
 * This one matters more than the others going unwired. A leaderboard that stops
 * rebuilding shows a stale date and says so on screen. A retention rule that never runs
 * is invisible: the app tells every coach their recording is deleted after thirty days,
 * and nothing deletes it. Whoever wires the first of these functions should wire this
 * one, and the same argument `purgeStaleHealthData` makes in index.ts applies — a
 * retention rule that arrives after the data does has already been broken once.
 *
 * Nightly, at an hour when nobody is recording.
 */
export const purgeVoiceNotes = onSchedule(
  { schedule: "every day 03:30", timeZone: "Asia/Kolkata", secrets: ["CRON_SECRET"] },
  async () => {
    const base = process.env.SITE_URL;
    const secret = process.env.CRON_SECRET;
    if (!base || !secret) {
      console.error("purgeVoiceNotes: SITE_URL or CRON_SECRET missing — not running");
      return;
    }

    const res = await fetch(`${base}/api/voice-logs/purge`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    });
    if (!res.ok) {
      console.error(`purgeVoiceNotes: ${res.status} ${await res.text()}`);
      return;
    }
    const body = (await res.json()) as { deleted?: number; cutoffKey?: string };
    // Logged, per the same discipline v2 §5.3 asks of the health purge: a deletion
    // nobody can evidence is not a retention control.
    console.log(
      `purgeVoiceNotes: deleted ${body.deleted ?? 0} note(s) older than ${body.cutoffKey ?? "?"}`
    );
  }
);

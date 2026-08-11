import { Timestamp } from "firebase-admin/firestore";
import { dailyLogDocId, dailyLogs } from "./collections";
import { getUserById } from "./users";
import { APP_TIMEZONE } from "./day";
import {
  EMPTY_LOG,
  MAX_BACKFILL_DAYS,
  logDateFor,
  loggedToday,
  shiftKey,
  streakState,
  todayKey,
  type DailyLogValues,
} from "./daily-log";

/**
 * Database side of the daily log. Split from daily-log.ts so the log form (a client
 * component) can use the field definitions and streak maths without pulling the
 * server data layer into the browser bundle (D25 — the same reason, now that the
 * driver is firebase-admin rather than SQLite).
 */

/** Enough history to compute any streak we display, and no more. */
const STREAK_WINDOW_DAYS = 400;

/** Today's log (or null), plus the streak it belongs to. */
export async function getLogState(
  userId: string,
  timeZone: string = APP_TIMEZONE,
  now = new Date()
) {
  const today = todayKey(timeZone, now);
  // Day keys sort lexicographically, so the window is a string range — no date
  // arithmetic on the query side and no timezone drift (D26).
  const since = shiftKey(today, -STREAK_WINDOW_DAYS);

  const snap = await dailyLogs()
    .where("userId", "==", userId)
    .where("dayKey", ">=", since)
    .orderBy("dayKey", "desc")
    .get();

  const keys = snap.docs.map((d) => d.data().dayKey as string);
  const todayDoc = snap.docs.find((d) => d.data().dayKey === today);
  const t = todayDoc?.data();
  const streak = streakState(keys, today);

  return {
    today,
    values: t
      ? {
          servings: t.servings,
          memberships: t.memberships,
          sessions: t.sessions,
          invites: t.invites,
          followupsDone: t.followupsDone,
          note: t.note ?? null,
        }
      : { ...EMPTY_LOG },
    hasLoggedToday: loggedToday(keys, today),
    streak: streak.days,
    /** The Streak Shield has already covered a miss this month — the flame says so. */
    shieldUsed: streak.shieldUsed,
  };
}

export type SaveLogResult =
  | { ok: true; streak: number; loggedKey: string; wasFirstSaveOfDay: boolean }
  | { ok: false; error: string };

/**
 * Writes one day's log.
 *
 * D26's `unique(userId, logDate)` is now the document id, so re-saving corrects
 * the day rather than creating a second row and a retried offline sync stays
 * idempotent — the same guarantee, enforced by the primary key.
 */
export async function saveLog(
  userId: string,
  key: string,
  values: DailyLogValues,
  timeZone: string = APP_TIMEZONE,
  now = new Date()
): Promise<SaveLogResult> {
  const today = todayKey(timeZone, now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return { ok: false, error: "That date is not valid." };
  }
  if (key > today) {
    return { ok: false, error: "You can't log a day that hasn't happened yet." };
  }
  const age = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${key}T00:00:00Z`)) / 86_400_000
  );
  if (age > MAX_BACKFILL_DAYS) {
    return { ok: false, error: "That day is too far back to log now." };
  }

  const ref = dailyLogs().doc(dailyLogDocId(userId, key));

  // Read before writing so a milestone is celebrated for the act of logging the
  // day, not replayed every time the coach corrects a number (D27).
  const existing = await ref.get();

  // uplinePath is stamped at write time so the upline's roll-up is one
  // array-contains query rather than a groupBy Firestore cannot express (D36).
  // Frozen here: moving a coach in the tree would not re-stamp old logs.
  const user = existing.exists ? null : await getUserById(userId);

  const data = {
    servings: values.servings,
    memberships: values.memberships,
    sessions: values.sessions,
    invites: values.invites,
    followupsDone: values.followupsDone,
    note: values.note,
  };

  if (existing.exists) {
    await ref.update(data);
  } else {
    await ref.set({
      userId,
      dayKey: key,
      logDate: Timestamp.fromDate(logDateFor(key, timeZone)),
      uplinePath: user?.uplinePath ?? [],
      ...data,
      createdAt: Timestamp.now(),
    });
  }

  const state = await getLogState(userId, timeZone, now);
  return {
    ok: true,
    streak: state.streak,
    loggedKey: key,
    wasFirstSaveOfDay: !existing.exists,
  };
}

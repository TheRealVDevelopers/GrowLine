import { prisma } from "./db";
import { APP_TIMEZONE, dayKey } from "./day";
import {
  EMPTY_LOG,
  MAX_BACKFILL_DAYS,
  logDateFor,
  loggedToday,
  streakFromKeys,
  todayKey,
  type DailyLogValues,
} from "./daily-log";

/**
 * Database side of the daily log. Split from daily-log.ts so the log form (a client
 * component) can use the field definitions and streak maths without pulling the
 * SQLite driver into the browser bundle.
 */

/** Enough history to compute any streak we display, and no more. */
const STREAK_WINDOW_DAYS = 400;

type LogRow = {
  logDate: Date;
  servings: number;
  memberships: number;
  sessions: number;
  invites: number;
  followupsDone: number;
  note: string | null;
};

function toValues(row: LogRow | null): DailyLogValues | null {
  if (!row) return null;
  return {
    servings: row.servings,
    memberships: row.memberships,
    sessions: row.sessions,
    invites: row.invites,
    followupsDone: row.followupsDone,
    note: row.note,
  };
}

/** Today's log (or null), plus the streak it belongs to. */
export async function getLogState(
  userId: string,
  timeZone: string = APP_TIMEZONE,
  now = new Date()
) {
  const today = todayKey(timeZone, now);
  const since = new Date(now.getTime() - STREAK_WINDOW_DAYS * 86_400_000);

  const rows = await prisma.dailyLog.findMany({
    where: { userId, logDate: { gte: since } },
    orderBy: { logDate: "desc" },
    select: {
      logDate: true,
      servings: true,
      memberships: true,
      sessions: true,
      invites: true,
      followupsDone: true,
      note: true,
    },
  });

  const keys = rows.map((r) => dayKey(r.logDate, timeZone));
  const todayRow = rows.find((r) => dayKey(r.logDate, timeZone) === today) ?? null;

  return {
    today,
    values: toValues(todayRow) ?? { ...EMPTY_LOG },
    hasLoggedToday: loggedToday(keys, today),
    streak: streakFromKeys(keys, today),
  };
}

export type SaveLogResult =
  | { ok: true; streak: number; loggedKey: string; wasFirstSaveOfDay: boolean }
  | { ok: false; error: string };

/**
 * Writes one day's log. Upsert on (userId, logDate) so re-saving corrects the day
 * rather than creating a second row, and so a retried offline sync is idempotent.
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

  const logDate = logDateFor(key, timeZone);
  const data = {
    servings: values.servings,
    memberships: values.memberships,
    sessions: values.sessions,
    invites: values.invites,
    followupsDone: values.followupsDone,
    note: values.note,
  };

  // Checked before writing so a milestone is celebrated for the act of logging the
  // day, not replayed every time the coach corrects a number.
  const existing = await prisma.dailyLog.findUnique({
    where: { userId_logDate: { userId, logDate } },
    select: { id: true },
  });

  await prisma.dailyLog.upsert({
    where: { userId_logDate: { userId, logDate } },
    create: { userId, logDate, ...data },
    update: data,
  });

  const state = await getLogState(userId, timeZone, now);
  return {
    ok: true,
    streak: state.streak,
    loggedKey: key,
    wasFirstSaveOfDay: existing === null,
  };
}

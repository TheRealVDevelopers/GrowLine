import { APP_TIMEZONE, dayKey, startOfDayInZone, todayRange } from "./day";

/**
 * The daily log (F6) — the habit engine.
 *
 * Six fields exactly, which is the Section 5.6 ceiling: five counts and one note.
 * Nothing else may be added here; a seventh field would break the rule and the
 * 30-second evening entry it protects.
 *
 * PURE ONLY — no database import, because the log form is a client component.
 * Queries live in daily-log-queries.ts.
 */

export const LOG_FIELDS = [
  { key: "servings", label: "Shakes / servings", hint: "made or served today" },
  { key: "memberships", label: "New members", hint: "joined today" },
  { key: "sessions", label: "Sessions or parties", hint: "you ran today" },
  { key: "invites", label: "Invites given", hint: "people you invited" },
  { key: "followupsDone", label: "Follow-ups done", hint: "people you contacted" },
] as const;

export type LogFieldKey = (typeof LOG_FIELDS)[number]["key"];

export type DailyLogValues = Record<LogFieldKey, number> & { note: string | null };

export const EMPTY_LOG: DailyLogValues = {
  servings: 0,
  memberships: 0,
  sessions: 0,
  invites: 0,
  followupsDone: 0,
  note: null,
};

/** A day's counts are small; anything larger is a typo or a stuck button. */
export const MAX_COUNT = 999;
/** F6 says "one-line note". */
export const MAX_NOTE = 140;

/**
 * How far back a log may be dated. Offline captures can be days old by the time
 * they sync, but unlimited backfill would let a streak be manufactured after the
 * fact — and the streak is only worth anything if it reflects real days.
 */
export const MAX_BACKFILL_DAYS = 14;

/**
 * The canonical instant for a local day, used as `log_date`.
 *
 * Storing local midnight as a UTC instant is what makes `unique(user_id, log_date)`
 * mean "one log per coach per day in their own timezone". A raw `new Date()` would
 * give a UTC day and split an Indian evening across two rows.
 */
export function logDateFor(key: string, timeZone: string = APP_TIMEZONE): Date {
  return startOfDayInZone(key, timeZone);
}

export function todayKey(timeZone: string = APP_TIMEZONE, now = new Date()): string {
  return todayRange(timeZone, now).key;
}

/** Calendar-day arithmetic on a day key, free of timezone drift. */
export function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0)), "UTC");
}

export function daysBetweenKeys(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000
  );
}

/**
 * Consecutive days logged, counting back from today.
 *
 * If today has no log yet the streak is measured from yesterday, so a coach who
 * logged for ten days straight still sees "10" at 4pm rather than a zero that
 * implies they already lost it.
 */
export function streakFromKeys(loggedKeys: string[], today: string): number {
  if (loggedKeys.length === 0) return 0;
  const set = new Set(loggedKeys);
  const anchor = set.has(today) ? today : shiftKey(today, -1);
  if (!set.has(anchor)) return 0;

  let streak = 0;
  let cursor = anchor;
  while (set.has(cursor)) {
    streak++;
    cursor = shiftKey(cursor, -1);
  }
  return streak;
}

/** Whether today itself is logged — what the team view shows as a live signal. */
export function loggedToday(loggedKeys: string[], today: string): boolean {
  return loggedKeys.includes(today);
}

export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365] as const;

export function milestoneFor(streak: number): number | null {
  return STREAK_MILESTONES.includes(streak as (typeof STREAK_MILESTONES)[number])
    ? streak
    : null;
}

/**
 * Milestone copy. Celebrates the habit, never earnings — no income promise may
 * ever appear here (Section 5.3).
 */
export function milestoneMessage(days: number): string {
  switch (days) {
    case 3:
      return "Three days in a row. This is how a habit starts.";
    case 7:
      return "A full week logged. Most people never get this far.";
    case 14:
      return "Two weeks straight. Your line can see this.";
    case 30:
      return "Thirty days. This is who you are now.";
    case 60:
      return "Sixty days without a gap. Remarkable discipline.";
    case 100:
      return "One hundred days. A hundred days of showing up.";
    case 200:
      return "Two hundred days. Very few people reach this.";
    default:
      return "A full year of showing up every single day.";
  }
}

export function totalActivity(values: DailyLogValues): number {
  return LOG_FIELDS.reduce((sum, f) => sum + (values[f.key] || 0), 0);
}

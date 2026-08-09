import { prisma } from "./db";
import { APP_TIMEZONE, todayRange } from "./day";

/**
 * Database side of follow-ups. Split from followup.ts so client components can use
 * the date and copy helpers without pulling the SQLite driver into the browser
 * bundle — importing `./db` from anything a "use client" file touches breaks the
 * build with "Can't resolve 'fs'".
 */

/**
 * Counts for the home screen and the morning reminder.
 *
 * Overdue and today are counted separately but summed into `due`: the coach sees one
 * number to act on, and the overdue part is named so the total can never read as
 * "all caught up" when last week's people are still waiting.
 */
export async function followupCounts(
  coachId: string,
  timeZone: string = APP_TIMEZONE,
  now = new Date()
) {
  const { start, end } = todayRange(timeZone, now);
  const [overdue, today] = await Promise.all([
    prisma.prospect.count({
      where: { coachId, nextFollowupAt: { not: null, lt: start } },
    }),
    prisma.prospect.count({
      where: { coachId, nextFollowupAt: { gte: start, lt: end } },
    }),
  ]);
  return { overdue, today, due: overdue + today };
}

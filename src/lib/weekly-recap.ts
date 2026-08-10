import { Timestamp } from "firebase-admin/firestore";
import { dailyLogs, prospects } from "./collections";
import { APP_TIMEZONE } from "./day";
import { shiftKey, todayKey } from "./daily-log";

/**
 * The Weekly Recap (v2 §4, dopamine map #6) — "the brag loop".
 *
 * A shareable summary of the week, so the coach's own pride becomes Growline's
 * marketing. The numbers are counts of work done, never earnings: RULES L4 and
 * D30 apply here exactly as they do on the targets screen, and a "your week was
 * worth ₹X" card would be the single most shareable violation the app could
 * produce.
 */

export type WeeklyRecap = {
  from: string;
  to: string;
  peopleMet: number;
  invites: number;
  memberships: number;
  sessions: number;
  streak: number;
  /** True when the week is empty — there is nothing to brag about yet. */
  empty: boolean;
};

export async function getWeeklyRecap(
  userId: string,
  streak: number,
  timeZone: string = APP_TIMEZONE,
  now = new Date()
): Promise<WeeklyRecap> {
  const to = todayKey(timeZone, now);
  const from = shiftKey(to, -6); // seven days inclusive

  const [logSnap, metSnap] = await Promise.all([
    dailyLogs()
      .where("userId", "==", userId)
      .where("dayKey", ">=", from)
      .where("dayKey", "<=", to)
      .get(),
    // Prospects carry a timestamp rather than a day key, so this one is a range
    // on createdAt — built from the local day boundary, not `new Date()` (E1).
    prospects()
      .where("coachId", "==", userId)
      .where("createdAt", ">=", Timestamp.fromDate(startOfLocalDay(from, timeZone)))
      .count()
      .get(),
  ]);

  let invites = 0;
  let memberships = 0;
  let sessions = 0;
  for (const doc of logSnap.docs) {
    const d = doc.data();
    invites += d.invites ?? 0;
    memberships += d.memberships ?? 0;
    sessions += d.sessions ?? 0;
  }
  const peopleMet = metSnap.data().count;

  return {
    from,
    to,
    peopleMet,
    invites,
    memberships,
    sessions,
    streak,
    empty: peopleMet === 0 && invites === 0 && memberships === 0 && sessions === 0,
  };
}

/** Local midnight for a day key, as a UTC instant — the D26 rule, reused. */
function startOfLocalDay(key: string, timeZone: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d);
  const guess = new Date(naive);
  const asLocal = new Date(guess.toLocaleString("en-US", { timeZone }));
  const offset = guess.getTime() - asLocal.getTime();
  return new Date(naive + offset);
}

/**
 * The share text.
 *
 * Counts and a streak. No currency, no rank, no company name (L1, L4) — this
 * string is the one piece of the app most likely to be screenshotted and
 * forwarded, so it is also the one most likely to be read by a regulator.
 */
export function recapShareText(r: WeeklyRecap): string {
  const parts: string[] = [];
  if (r.peopleMet) parts.push(`${r.peopleMet} people met`);
  if (r.invites) parts.push(`${r.invites} invited`);
  if (r.memberships) parts.push(`${r.memberships} joined`);
  if (r.sessions) parts.push(`${r.sessions} sessions`);
  if (r.streak) parts.push(`streak ${r.streak} 🔥`);
  return `My week: ${parts.join(" · ")}`;
}

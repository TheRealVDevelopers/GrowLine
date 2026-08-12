import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";
import { dailyLogs, users } from "@/lib/collections";
import { APP_TIMEZONE, dayKey } from "@/lib/day";
import { daysBetweenKeys, shiftKey } from "@/lib/daily-log";
import { makeWindow, type DayWindow } from "@/modules/shared-new/window";
import { DUPLICATION_SCORES, duplicationScoreDocId, type DuplicationScoreDoc } from "./docs";
import {
  MEASURED_DEPTH,
  WINDOW_DAYS,
  isActive,
  scoreLine,
  type Member,
} from "./score";

/**
 * Building every coach's duplication reading. Runs on a schedule, on the server.
 *
 * ## Why this is a scheduled job and not a page query
 *
 * A coach's score depends on everybody up to three levels below them, and on every
 * day those people logged in the last four weeks. Computed on page load that is a
 * whole-line read per open, on a ₹10K Android, for a number that moves by fractions
 * of a percent between one morning and the next. Computed here it is two collection
 * reads for the entire organisation, however many coaches then look at it.
 *
 * The consequence is that the number on the screen is as old as the last run, so the
 * screen SAYS how old it is — the same honesty N21a settled for the qualification
 * list. A reading presented as this minute's, that is actually Tuesday's, is worse
 * than a reading labelled Tuesday.
 *
 * ## The whole tree in one pass
 *
 * `uplinePath` (D36) is ordered nearest-ancestor-first, so a user whose path begins
 * `[asha, root]` is at depth 1 below Asha and depth 2 below Root. Every membership
 * in the organisation therefore falls out of ONE loop over the users: for each
 * person, their first three ancestors each gain a member at the matching depth.
 *
 * That slice of three is also the answer to "which depth are we measuring" — the
 * ancestry runs the whole way up (a line can be 100 deep), and we deliberately read
 * only the first three entries. See score.ts for why.
 *
 * ## No names, no money
 *
 * Nothing written by this job identifies a person. Levels are counts of people, and
 * a count is what P1 lets flow up a line. Not one figure here is money, a rate of
 * change, or a projection (L4).
 */

type Person = {
  id: string;
  uplinePath: string[];
  /** Days of the window this person has been in the line, capped at the window. */
  availableDays: number;
  daysLogged: number;
};

export type ComputeResult = {
  /** Coaches who had a line and got a reading. */
  scored: number;
  /** Coaches with no line, whose stale reading was removed. */
  cleared: number;
  window: DayWindow;
  generatedAt: Date;
};

/** The rolling window ending today, in the coach's own zone (E1). */
export function currentWindow(now = new Date(), timeZone = APP_TIMEZONE): DayWindow {
  const toKey = dayKey(now, timeZone);
  return makeWindow(shiftKey(toKey, -(WINDOW_DAYS - 1)), toKey, timeZone);
}

/**
 * How much of the window a person has actually been here for.
 *
 * Someone who joined a fortnight ago has had a fortnight, not four weeks — which is
 * what both the tenure rule and the pro-rated activity bar are computed from. Day
 * keys are compared as strings because they sort chronologically (D26), so no
 * timezone arithmetic happens here at all.
 */
export function availableDaysFor(joinKey: string, window: DayWindow): number {
  const startKey = joinKey > window.fromKey ? joinKey : window.fromKey;
  const days = daysBetweenKeys(startKey, window.toKey) + 1;
  return Math.min(WINDOW_DAYS, Math.max(0, days));
}

async function loadPeople(window: DayWindow): Promise<Person[]> {
  const [userSnap, logSnap] = await Promise.all([
    users().get(),
    // One range on one field — no composite index, same as the boards job.
    dailyLogs()
      .where("dayKey", ">=", window.fromKey)
      .where("dayKey", "<=", window.toKey)
      .get(),
  ]);

  // A Set rather than a counter: the doc id already guarantees one log per coach per
  // day (D26), and counting rows would silently double a day if that ever changed.
  const daysBy = new Map<string, Set<string>>();
  for (const doc of logSnap.docs) {
    const d = doc.data();
    const userId = d.userId as string;
    const set = daysBy.get(userId) ?? new Set<string>();
    set.add(d.dayKey as string);
    daysBy.set(userId, set);
  }

  return userSnap.docs.map((doc) => {
    const u = doc.data();
    const createdAt = (u.createdAt as Timestamp | undefined)?.toDate?.() ?? new Date(0);
    return {
      id: doc.id,
      uplinePath: (u.uplinePath as string[]) ?? [],
      availableDays: availableDaysFor(dayKey(createdAt, window.timeZone), window),
      daysLogged: daysBy.get(doc.id)?.size ?? 0,
    };
  });
}

/** Every coach's line, keyed by the coach, from one pass over the organisation. */
export function membersByCoach(people: Person[]): Map<string, Member[]> {
  const out = new Map<string, Member[]>();
  for (const person of people) {
    person.uplinePath.slice(0, MEASURED_DEPTH).forEach((ancestorId, index) => {
      const member: Member = {
        userId: person.id,
        depth: index + 1,
        availableDays: person.availableDays,
        daysLogged: person.daysLogged,
      };
      out.set(ancestorId, [...(out.get(ancestorId) ?? []), member]);
    });
  }
  return out;
}

export async function computeAllDuplicationScores(now = new Date()): Promise<ComputeResult> {
  const window = currentWindow(now);
  const people = await loadPeople(window);
  const lines = membersByCoach(people);
  const generatedAt = Timestamp.fromDate(now);

  let scored = 0;
  let cleared = 0;
  let batch = db.batch();
  let pending = 0;
  const flush = async (force = false) => {
    if (pending >= 400 || (force && pending > 0)) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  };

  for (const person of people) {
    const ref = db.collection(DUPLICATION_SCORES).doc(duplicationScoreDocId(person.id));
    const members = lines.get(person.id);

    /**
     * A coach with nobody below them has their reading DELETED rather than skipped.
     *
     * N6a's correction, in a second place and for the same reason: skipping leaves
     * whatever the last run wrote sitting in Firestore, still readable by the coach
     * it belongs to. The case that empties a line is most often the line moving —
     * a downline reparented to another upline — and the coach they left would keep
     * reading a breakdown of a team that is no longer theirs, indefinitely.
     *
     * Deleting a document that is not there is a no-op, so this needs no read to
     * find out. It costs one write per lineless coach per run. If that ever needs
     * cutting, cut it by reading which readings exist — never by going back to a
     * silent skip.
     */
    if (!members || members.length === 0) {
      batch.delete(ref);
      pending += 1;
      cleared++;
      await flush();
      continue;
    }

    const result = scoreLine(members);
    const doc: DuplicationScoreDoc = {
      userId: person.id,
      score: result.score,
      reason: result.reason,
      levels: result.levels,
      lineSize: result.lineSize,
      pendingCount: result.pendingCount,
      deepestLevel: result.deepestLevel,
      deepestActiveLevel: result.deepestActiveLevel,
      // Context beside the number, never inside it (score.ts).
      own: {
        daysLogged: person.daysLogged,
        active: isActive({
          userId: person.id,
          depth: 1,
          availableDays: person.availableDays,
          daysLogged: person.daysLogged,
        }),
      },
      fromKey: window.fromKey,
      toKey: window.toKey,
      windowDays: WINDOW_DAYS,
      timeZone: window.timeZone,
      generatedAt,
    };

    batch.set(ref, doc);
    pending += 1;
    scored++;
    await flush();
  }

  await flush(true);
  return { scored, cleared, window, generatedAt: now };
}

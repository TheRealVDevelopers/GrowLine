import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { isPushConfigured, sendToUser } from "@/lib/push";
import { daysLeft } from "@/modules/shared-new/window";
import {
  qualificationProgress,
  qualifications,
  type ProgressDoc,
  type QualificationDoc,
} from "./docs";
import { progressDocId } from "./ids";
import { windowOf } from "./model";
import { nudgeFor, standingOf } from "./progress";
import { bandId, dueBand, reminderMessage } from "./reminders";

/**
 * Sending the escalating reminders. Server only; the schedule and the copy are in
 * `reminders.ts`, which is pure.
 *
 * ## What stops a reminder being sent twice
 *
 * `remindersSent` on the coach's own progress row, written with `arrayUnion` so two
 * runs racing each other converge on one entry instead of two. It lives there rather
 * than on the user document for the reason N6 records about the opt-out flag: this
 * branch may not write to an existing collection, and the row is keyed by
 * (qualification, coach) anyway, which is exactly the grain the bookkeeping needs.
 *
 * The band is marked as sent even when the coach turned out to have no working device.
 * Otherwise a coach who has never enabled notifications is "due" on every run for the
 * rest of the qualification, and the job spends its budget rediscovering that.
 *
 * ## Dry run
 *
 * `dryRun` computes exactly what would be sent and writes nothing, which is how this
 * is verified without a push service configured — the same affordance
 * `/api/notifications/daily` has, and for the same reason.
 */

export type ReminderOutcome = {
  qualificationId: string;
  title: string;
  daysLeft: number;
  band: string;
  /** Coaches the band was due for. */
  due: number;
  /** Coaches marked as reminded (equal to `due` outside a dry run). */
  notified: number;
  /** Push endpoints that accepted it. Zero is normal — most coaches have no device. */
  devices: number;
};

export type ReminderRun = {
  pushConfigured: boolean;
  dryRun: boolean;
  qualificationsConsidered: number;
  outcomes: ReminderOutcome[];
};

export async function sendDueReminders(
  now = new Date(),
  dryRun = false
): Promise<ReminderRun> {
  // Open only. A closed qualification is never reminded about — see `dueBand`.
  const snap = await qualifications()
    .where("closesAt", ">", Timestamp.fromDate(now))
    .get();

  const outcomes: ReminderOutcome[] = [];

  for (const doc of snap.docs) {
    const q = doc.data() as QualificationDoc;
    const left = daysLeft(windowOf(q), now);
    const band = dueBand(left);
    if (band === null) continue;
    const id = bandId(band);

    const rows = await qualificationProgress()
      .where("qualificationId", "==", doc.id)
      .where("kind", "==", "progress")
      .get();

    let due = 0;
    let notified = 0;
    let devices = 0;

    for (const rowDoc of rows.docs) {
      const row = rowDoc.data() as ProgressDoc;
      // Nobody who is already in is nagged about being in.
      if (row.qualified) continue;
      if ((row.remindersSent ?? []).includes(id)) continue;
      due++;
      if (dryRun) continue;

      const standing = standingOf(q.criteria, row.values, row.baseline, row.unchecked);
      const result = await sendToUser(
        row.userId,
        reminderMessage(doc.id, q.title, left, nudgeFor(standing, left))
      );
      devices += result.sent;

      await qualificationProgress()
        .doc(progressDocId(doc.id, row.userId))
        .update({ remindersSent: FieldValue.arrayUnion(id) });
      notified++;
    }

    outcomes.push({
      qualificationId: doc.id,
      title: q.title,
      daysLeft: left,
      band: id,
      due,
      notified,
      devices,
    });
  }

  return {
    pushConfigured: isPushConfigured(),
    dryRun,
    qualificationsConsidered: snap.size,
    outcomes,
  };
}

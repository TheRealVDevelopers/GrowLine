import type { LogFieldKey } from "@/lib/daily-log";

/**
 * The voice note (session 4, feature 1) — a second way into the daily log.
 *
 * PURE ONLY. The recorder is a client component and imports from here, so nothing in
 * this file may touch `firebase-admin` (E2's rule, with the driver renamed).
 *
 * ## What a voice note IS, and what it is not
 *
 * It is a CAPTURE, not a log. F6's counts are what rolls up to an upline, feeds the
 * streak, and fills the boards — and audio is none of those things. So a note is only
 * finished when it has become five integers in `dailyLogs`, written by the existing
 * writer through `PUT /api/logs`. This module never writes a daily log itself and
 * never writes to `dailyLogs`; it hands the numbers to the one pipe that already owns
 * them.
 *
 * That distinction is the whole design. A voice-note feature that quietly stores audio
 * nobody counts would show a coach "logged by voice for 10 days" while their upline
 * saw ten days of silence, their streak sat at zero, and — worse — the silence alert
 * in this same session accused them of having gone quiet. The recorder therefore
 * always ends on a confirm step, and the copy says so before the coach speaks.
 *
 * ## Where the audio lives, and why it is not in Firebase Storage
 *
 * It is not. Firebase Storage is not wired up in this repository: there is no
 * `storageBucket` in `src/lib/firebase.ts`, no bucket on the Admin app, no
 * `firebase/storage` import anywhere in `src`, the emulator set does not start it, and
 * `storage.rules` is a deliberate deny-all whose header says in as many words that the
 * uploader, the bucket and the rules must land in ONE change. Wiring it needs edits to
 * `src/lib/firebase.ts` and `firebase.json`, and this branch may not touch either.
 *
 * Appending a permissive Storage rule for an uploader that cannot exist is precisely
 * what that header warns against, so nothing was appended there.
 *
 * The audio therefore rides on the note document as base64, which is the precedent
 * already set for proof media (D3, D33). It is bounded hard — see the caps below —
 * because a Firestore document has a 1 MiB ceiling and a blob near it makes every read
 * of the collection expensive.
 */

/** Long enough for five numbers spoken out loud, short enough to stay small. */
export const MAX_DURATION_MS = 15_000;

/**
 * Raw audio ceiling, before base64. 200 KB becomes ~273 KB encoded — a quarter of
 * Firestore's 1 MiB document limit, so a long-winded note still lands with room to
 * spare rather than failing at save time with nothing the coach can do about it.
 */
export const MAX_AUDIO_BYTES = 200 * 1024;

/**
 * Opus at 24 kbps mono. 15 seconds is ~45 KB, well inside the ceiling, and speech at
 * this rate is perfectly intelligible — this is a note to self, not a recording.
 */
export const AUDIO_BITS_PER_SECOND = 24_000;

/**
 * How long an UNCOUNTED note survives.
 *
 * A recording of a coach's working day that never became numbers is invisible to every
 * screen, counted by nothing, and readable by nobody but its author. Keeping it
 * indefinitely stores personal data for no purpose, which is the thing v2 §5.3 already
 * decided about prospect health data. Thirty days is long enough that a coach who
 * recorded on a train and lost signal can come back and finish it.
 */
export const UNCOUNTED_TTL_DAYS = 30;

export const VOICE_LOG_STATUSES = ["uncounted", "counted"] as const;
export type VoiceLogStatus = (typeof VOICE_LOG_STATUSES)[number];

/**
 * The collection. New, and written ONLY by the API route through the Admin SDK.
 *
 * Deviation recorded: the brief for these branches listed four new collections, all
 * from sessions 1–3. Session 4 asks for a voice note that "lives in your own
 * collection and references the day", which needs a fifth. Named here so nothing
 * invents a variant later.
 */
export const VOICE_LOGS = "voiceLogs";

/**
 * One note per coach per local day, as a document id.
 *
 * The same reasoning as `dailyLogDocId` (D26, D35): re-recording corrects the day
 * instead of accumulating a second note, and a retried save on a weak signal converges
 * on one document rather than two. A coach who records twice on a road meant to
 * replace what they said, not to file it twice.
 */
export function voiceLogDocId(userId: string, dayKey: string): string {
  if (!userId || !dayKey || userId.includes("/") || dayKey.includes("/")) {
    throw new Error("Invalid voiceLog document id");
  }
  return `${userId}__${dayKey}`;
}

/** The document, as the route writes it. */
export type VoiceLogDoc = {
  userId: string;
  /** The coach's local day (D26). The doc id carries it too; the field is queryable. */
  dayKey: string;
  status: VoiceLogStatus;
  durationMs: number;
  mimeType: string;
  /**
   * base64 audio, or null once the note has been counted.
   *
   * Dropped at the moment the numbers land in `dailyLogs`: the counts and the
   * transcript are the durable artifacts, and audio of somebody's working day is the
   * most sensitive thing in the row. Keeping it after it has done its job would be
   * storing a recording for no reason anyone could state.
   */
  audioBase64: string | null;
  /** What the phone's own speech recognition heard, or null when it heard nothing. */
  transcript: string | null;
  /** The fields the parser was confident about. Empty when nothing parsed. */
  heard: LogFieldKey[];
  /** What the coach actually confirmed, once they have. Null while uncounted. */
  countedValues: Record<LogFieldKey, number> | null;
  createdAt: FirebaseTimestampLike;
  countedAt: FirebaseTimestampLike | null;
};

/**
 * Structural stand-in for `Timestamp`, so this file stays importable by the browser.
 * The server module casts to the real thing; nothing here reads the value.
 */
export type FirebaseTimestampLike = { toDate(): Date };

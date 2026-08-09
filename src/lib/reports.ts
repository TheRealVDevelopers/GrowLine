import { Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { reportDocId, reports } from "./collections";

/**
 * Report reads and writes against Firestore.
 *
 * D20's `unique(prospectId, inputsHash)` is now the document id (D35), which is
 * what keeps its guarantee intact: report creation runs during a GET page render,
 * so two tabs — or a save racing the refresh that follows it — would otherwise
 * mint two rows, meaning two live 90-day bearer tokens to the same person's
 * health data, only one of which the coach ever sees or can mark as sent.
 */

export type AppReport = {
  id: string;
  prospectId: string;
  coachId: string | null;
  token: string;
  metricsJson: string;
  inputsHash: string;
  sentAt: Date | null;
  createdAt: Date;
};

const toDate = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : null);

export function toAppReport(snap: DocumentSnapshot): AppReport | null {
  const d = snap.data();
  if (!d) return null;
  return {
    id: snap.id,
    prospectId: d.prospectId,
    coachId: d.coachId ?? null,
    token: d.token,
    metricsJson: d.metricsJson,
    inputsHash: d.inputsHash,
    sentAt: toDate(d.sentAt),
    createdAt: toDate(d.createdAt) ?? new Date(0),
  };
}

export async function getReportByToken(token: string): Promise<AppReport | null> {
  const snap = await reports().where("token", "==", token).limit(1).get();
  return snap.empty ? null : toAppReport(snap.docs[0]);
}

export async function getReportByInputs(
  prospectId: string,
  inputsHash: string
): Promise<AppReport | null> {
  return toAppReport(await reports().doc(reportDocId(prospectId, inputsHash)).get());
}

/**
 * Creates the report for this set of inputs, or refreshes an expired one in place.
 *
 * `set()` on the deterministic id is the upsert D20 needs: concurrent renders
 * converge on one document instead of creating two. A refresh keeps the same
 * identity but takes a new token and timestamp, and clears `sentAt` — the coach
 * has not sent the new link yet.
 */
export async function upsertReport(params: {
  prospectId: string;
  coachId: string | null;
  inputsHash: string;
  token: string;
  metricsJson: string;
}): Promise<AppReport> {
  const id = reportDocId(params.prospectId, params.inputsHash);
  await reports().doc(id).set({
    prospectId: params.prospectId,
    coachId: params.coachId,
    inputsHash: params.inputsHash,
    token: params.token,
    metricsJson: params.metricsJson,
    sentAt: null,
    createdAt: Timestamp.now(),
  });
  return (await toAppReport(await reports().doc(id).get()))!;
}

/** F4 — drives the report → send rate metric in Section 13. */
export async function markReportSent(id: string): Promise<void> {
  await reports().doc(id).update({ sentAt: Timestamp.now() });
}

/**
 * The guard on every scheduler-called route in these modules.
 *
 * Written once here rather than a third time inline: `/api/leaderboards/rebuild` and
 * `/api/notifications/daily` each carry their own copy, and a security check that
 * exists in three places is a security check that will be fixed in two of them.
 * (The existing two are not touched — they belong to work already merged.)
 *
 * FAILS CLOSED with no secret configured. These endpoints are not a data leak, but
 * each one makes the server read a large slice of the organisation on demand, as
 * often as anybody likes.
 */

export type CronCheck = { ok: true } | { ok: false; status: number; error: string };

/** Constant time, so the secret cannot be probed a character at a time. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkCronSecret(req: Request, what: string): CronCheck {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: `${what} are not configured on this server.`,
    };
  }
  const header =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    req.headers.get("x-cron-secret") ??
    "";
  if (!timingSafeEqual(header, secret)) {
    return { ok: false, status: 401, error: "Not allowed" };
  }
  return { ok: true };
}

import { NextResponse } from "next/server";
import { computeAllBoards } from "@/modules/leaderboards/compute";

/**
 * Rebuilds every board (F13). Called by a scheduler, never by a browser.
 *
 * The aggregation lives here rather than inside the Cloud Function for the reason
 * `morningReminder` already established in functions/src/index.ts: the logic keeps
 * one home, in the app, and the scheduled function is a thin caller. It also means
 * this is runnable by hand against the emulator without deploying anything.
 *
 * Guarded by CRON_SECRET, and FAILS CLOSED without one. An open endpoint here is not
 * a data leak but it is a way to make the server read every log in the organisation
 * on demand, as often as somebody likes.
 */

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Boards are not configured on this server." },
      { status: 503 }
    );
  }

  const header =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    req.headers.get("x-cron-secret") ??
    "";
  if (!timingSafeEqual(header, secret)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }

  const result = await computeAllBoards();
  return NextResponse.json({
    ok: true,
    boardsWritten: result.boardsWritten,
    boardsSkipped: result.boardsSkipped,
    scopes: result.scopes,
    generatedAt: result.generatedAt.toISOString(),
  });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";

/** Turning reminders off must actually delete the subscription, not just hide a toggle. */
export async function POST(req: Request) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const endpoint = String((body as Record<string, unknown>)?.endpoint ?? "");

  // Scoped to this coach so one person cannot delete another's subscription by
  // guessing an endpoint. deleteMany so an already-removed row is not an error.
  await prisma.pushSubscription.deleteMany({
    where: endpoint ? { userId: uid, endpoint } : { userId: uid },
  });
  return NextResponse.json({ ok: true });
}

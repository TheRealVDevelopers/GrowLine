import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { updateProgress } from "@/lib/targets-queries";

/** The coach moves their own progress (F7: "updates progress manually"). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const points = Number((body ?? {})?.progressPoints);

  const result = await updateProgress(uid, id, points);
  if (!result.ok) {
    const status = result.error === "Not found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result);
}

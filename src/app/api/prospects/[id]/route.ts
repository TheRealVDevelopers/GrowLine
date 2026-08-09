import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { parseProspectInput } from "@/lib/prospect";
import { ensureCurrentReport } from "@/lib/report";

/**
 * Updating a prospect's details is how a coach fills in the age/height/weight
 * they didn't have on the road, which is what unlocks the full report.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.prospect.findUnique({
    where: { id },
    select: { id: true, coachId: true },
  });
  // Same 404 for "not yours" as for "not found" — never confirm that another
  // coach's prospect id exists.
  if (!existing || existing.coachId !== uid) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = parseProspectInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const prospect = await prisma.prospect.update({
    where: { id },
    data: parsed.value,
    select: {
      id: true,
      age: true,
      gender: true,
      heightCm: true,
      weightKg: true,
    },
  });

  // Details changed, so the report may need reissuing (new link, old one intact).
  const report = await ensureCurrentReport(prospect);
  return NextResponse.json({ ok: true, reportToken: report?.token ?? null });
}

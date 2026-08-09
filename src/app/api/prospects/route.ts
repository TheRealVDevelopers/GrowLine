import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { parseProspectInput } from "@/lib/prospect";
import { ensureCurrentReport } from "@/lib/report";

const MAX_CLIENT_ID = 64;

export async function GET() {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  // Scoped to the signed-in coach only. An upline has no route to these rows
  // (Section 5.4) — only activity counts ever travel upward.
  const prospects = await prisma.prospect.findMany({
    where: { coachId: uid },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      phone: true,
      age: true,
      gender: true,
      heightCm: true,
      weightKg: true,
      stage: true,
      source: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ prospects });
}

export async function POST(req: Request) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = parseProspectInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const rawClientId = (body as Record<string, unknown>)?.clientId;
  const clientId =
    typeof rawClientId === "string" && rawClientId.length > 0
      ? rawClientId.slice(0, MAX_CLIENT_ID)
      : null;

  // Replaying a queued capture must not create a second person.
  if (clientId) {
    const existing = await prisma.prospect.findUnique({
      where: { coachId_clientId: { coachId: uid, clientId } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ ok: true, id: existing.id, duplicate: true });
    }
  }

  const prospect = await prisma.prospect.create({
    data: { coachId: uid, clientId, source: "manual", ...parsed.value },
    select: {
      id: true,
      name: true,
      age: true,
      gender: true,
      heightCm: true,
      weightKg: true,
    },
  });
  // F3: the report is generated on save, not on demand, so it's ready to send.
  const report = await ensureCurrentReport(prospect);
  return NextResponse.json({
    ok: true,
    id: prospect.id,
    name: prospect.name,
    reportToken: report?.token ?? null,
  });
}

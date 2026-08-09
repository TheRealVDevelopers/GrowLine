import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseProspectInput } from "@/lib/prospect";
import { ensureCurrentReport } from "@/lib/report";

// Unauthenticated endpoint (Mode B) — the prospect never installs anything, so
// abuse is bounded per coach rather than per session.
const MAX_PER_CODE_PER_HOUR = 40;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const coach = await prisma.user.findUnique({
    where: { referralCode: code.toUpperCase() },
    select: { id: true },
  });
  if (!coach) {
    return NextResponse.json(
      { error: "This link isn't valid. Please ask for a new one." },
      { status: 404 }
    );
  }

  const recent = await prisma.prospect.count({
    where: {
      coachId: coach.id,
      source: "qr",
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });
  if (recent >= MAX_PER_CODE_PER_HOUR) {
    return NextResponse.json(
      { error: "Too many submissions right now. Please try again later." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = parseProspectInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const prospect = await prisma.prospect.create({
    data: { coachId: coach.id, source: "qr", ...parsed.value },
    select: {
      id: true,
      age: true,
      gender: true,
      heightCm: true,
      weightKg: true,
    },
  });
  // Generate the report now so it's waiting for the coach (F3). The token is
  // deliberately NOT returned — the prospect gets the link from the coach, so
  // that the coach stays the one who makes contact.
  await ensureCurrentReport(prospect);
  // Nothing about the coach or their other prospects is returned.
  return NextResponse.json({ ok: true });
}

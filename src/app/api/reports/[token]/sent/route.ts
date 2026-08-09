import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { isValidReportToken } from "@/lib/report-token";

/**
 * Marks a report as sent when the coach opens the WhatsApp share (F4). Feeds the
 * report -> send rate in Section 13, so it records the FIRST send only.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const { token } = await params;
  if (!isValidReportToken(token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const report = await prisma.report.findUnique({
    where: { token },
    select: { id: true, sentAt: true, prospect: { select: { coachId: true } } },
  });
  if (!report || report.prospect.coachId !== uid) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!report.sentAt) {
    await prisma.report.update({
      where: { id: report.id },
      data: { sentAt: new Date() },
    });
  }
  return NextResponse.json({ ok: true });
}

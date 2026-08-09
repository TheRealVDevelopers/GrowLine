import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidReportToken } from "@/lib/report-token";
import { isReportExpired } from "@/lib/report";

/**
 * Erasure at the request of the person the data is about. Holding the snapshot
 * link is the authorisation — the same bearer secret that grants read access.
 * Deletes the prospect, which cascades to their reports.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!isValidReportToken(token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const report = await prisma.report.findUnique({
    where: { token },
    select: { prospectId: true, createdAt: true },
  });
  if (!report || isReportExpired(report.createdAt)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // deleteMany, not delete: a double-tap on a laggy connection would otherwise
  // make the second request 500 and tell someone their erasure failed when it
  // had already succeeded — the worst possible impression for a privacy control.
  await prisma.prospect.deleteMany({ where: { id: report.prospectId } });
  return NextResponse.json({ ok: true });
}

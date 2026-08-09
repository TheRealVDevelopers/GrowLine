import { cache } from "react";
import { prisma } from "./db";
import { isValidReportToken } from "./report-token";
import { isReportExpired, parseSnapshot, type ReportSnapshot } from "./report";

export type LoadedReport = {
  id: string;
  token: string;
  snapshot: ReportSnapshot;
  firstName: string;
  coachId: string;
  coach: {
    name: string;
    photoUrl: string | null;
    city: string | null;
    phone: string;
  };
};

/**
 * Shared loader for every public report surface (page, PNG, preview, PDF) so the
 * token check, the expiry check and the first-name-only rule can never drift
 * apart between them.
 */
export const loadReportForRender = cache(
  async (token: string): Promise<LoadedReport | null> => {
    if (!isValidReportToken(token)) return null;
    const row = await prisma.report.findUnique({
      where: { token },
      select: {
        id: true,
        token: true,
        metricsJson: true,
        createdAt: true,
        prospect: {
          select: {
            name: true,
            coachId: true,
            coach: { select: { name: true, photoUrl: true, city: true, phone: true } },
          },
        },
      },
    });
    if (!row || isReportExpired(row.createdAt)) return null;
    const snapshot = parseSnapshot(row.metricsJson);
    if (!snapshot) return null;

    return {
      id: row.id,
      token: row.token,
      snapshot,
      // First name only: these images end up in group chats.
      firstName: row.prospect.name.trim().split(/\s+/)[0],
      coachId: row.prospect.coachId,
      coach: row.prospect.coach,
    };
  }
);

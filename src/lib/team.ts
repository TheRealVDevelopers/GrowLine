import { prisma } from "./db";
import { APP_TIMEZONE, dayKey, startOfDayInZone, todayRange } from "./day";

export type TeamNode = {
  id: string;
  name: string;
  photoUrl: string | null;
  city: string | null;
  logsThisMonth: number;
  /** F6's accountability loop: has this coach logged today, right now. */
  loggedToday: boolean;
  targetPct: number | null;
  directCount: number;
  children: TeamNode[];
  /** true when this node has downlines in the DB beyond the rendered depth */
  hasMore: boolean;
};

/**
 * Month and day boundaries in the app's timezone, not the server's.
 *
 * These previously used server-local time. On a UTC host that counted the wrong
 * month for Indian coaches for the first 5.5 hours of every 1st, and read the wrong
 * "today" every night — which would have quietly corrupted the roll-ups this phase
 * is built on.
 */
function monthStart(timeZone: string = APP_TIMEZONE, now = new Date()): Date {
  const [year, month] = dayKey(now, timeZone).split("-");
  return startOfDayInZone(`${year}-${month}-01`, timeZone);
}

export function currentMonthKey(
  timeZone: string = APP_TIMEZONE,
  now = new Date()
): string {
  return dayKey(now, timeZone).slice(0, 7);
}

/** Walks up from userId; true if uplineId is an ancestor (or the user itself). */
export async function isInDownline(uplineId: string, userId: string): Promise<boolean> {
  let current: string | null = userId;
  for (let hops = 0; hops < 100 && current; hops++) {
    if (current === uplineId) return true;
    const row: { uplineId: string | null } | null = await prisma.user.findUnique({
      where: { id: current },
      select: { uplineId: true },
    });
    current = row?.uplineId ?? null;
  }
  return false;
}

/**
 * Tree of rootId + downlines, capped at `depth` levels per Section 11.
 * Nodes carry this month's activity summary (logs done, target %).
 */
export async function buildTeamTree(rootId: string, depth = 3): Promise<TeamNode | null> {
  const select = { id: true, name: true, photoUrl: true, city: true, uplineId: true };
  const root = await prisma.user.findUnique({ where: { id: rootId }, select });
  if (!root) return null;

  const all = [root];
  let frontier = [rootId];
  for (let level = 0; level < depth && frontier.length > 0; level++) {
    const rows = await prisma.user.findMany({
      where: { uplineId: { in: frontier } },
      select,
      orderBy: { createdAt: "asc" },
    });
    all.push(...rows);
    frontier = rows.map((r) => r.id);
  }

  const ids = all.map((u) => u.id);
  const today = todayRange();
  // Still a fixed number of queries regardless of team size — one more grouped
  // count, not one per node.
  const [logGroups, todayLogs, targets, childGroups] = await Promise.all([
    prisma.dailyLog.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, logDate: { gte: monthStart() } },
      _count: { _all: true },
    }),
    prisma.dailyLog.findMany({
      where: {
        userId: { in: ids },
        logDate: { gte: today.start, lt: today.end },
      },
      select: { userId: true },
    }),
    prisma.target.findMany({
      where: { coachId: { in: ids }, month: currentMonthKey() },
      select: { coachId: true, targetPoints: true, progressPoints: true },
    }),
    prisma.user.groupBy({
      by: ["uplineId"],
      where: { uplineId: { in: ids } },
      _count: { _all: true },
    }),
  ]);

  const logsBy = new Map(logGroups.map((g) => [g.userId, g._count._all]));
  const loggedTodayIds = new Set(todayLogs.map((l) => l.userId));
  const targetBy = new Map(
    targets.map((t) => [
      t.coachId,
      t.targetPoints > 0 ? Math.round((t.progressPoints / t.targetPoints) * 100) : null,
    ])
  );
  const childCountBy = new Map(childGroups.map((g) => [g.uplineId, g._count._all]));

  const nodeBy = new Map<string, TeamNode>();
  for (const u of all) {
    nodeBy.set(u.id, {
      id: u.id,
      name: u.name,
      photoUrl: u.photoUrl,
      city: u.city,
      logsThisMonth: logsBy.get(u.id) ?? 0,
      loggedToday: loggedTodayIds.has(u.id),
      targetPct: targetBy.get(u.id) ?? null,
      directCount: childCountBy.get(u.id) ?? 0,
      children: [],
      hasMore: false,
    });
  }
  for (const u of all) {
    if (u.id !== rootId && u.uplineId && nodeBy.has(u.uplineId)) {
      nodeBy.get(u.uplineId)!.children.push(nodeBy.get(u.id)!);
    }
  }
  for (const node of nodeBy.values()) {
    node.hasMore = node.children.length === 0 && node.directCount > 0;
  }
  return nodeBy.get(rootId)!;
}

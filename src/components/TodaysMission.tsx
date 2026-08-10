import Link from "next/link";

/**
 * Today's Mission (v2 §4, dopamine map #3) — the first thing on app open, and what
 * v2 calls "the recommendation engine of v2". Three items at most, each generated
 * from the coach's own data, each one tap from the action.
 *
 * ## A conflict in the spec, resolved toward the hard rule
 *
 * v2 §4's example copy for this card reads:
 *
 *     "🎯 ₹-equivalent: 400 VP to cross 75%"
 *
 * That breaks v1 §5.3 and D30 — no income promises, and a target is a count of
 * points with no currency, conversion or projection. RULES L4 is a legal line, and
 * an illustrative example in a design section does not outrank it. So the item
 * says points and stops. See DECISIONS.md D40.
 *
 * ## Why three, and why in this order
 *
 * The order is fixed by what is closest to being lost: the streak resets at
 * midnight, a follow-up is already someone waiting, the target has all month. One
 * item is not a list; four is a to-do app.
 */

export type Mission = {
  key: string;
  icon: string;
  text: string;
  href: string;
};

export function buildMissions(input: {
  streak: number;
  loggedToday: boolean;
  followupsDue: number;
  targetPoints: number | null;
  progressPoints: number | null;
}): Mission[] {
  const missions: Mission[] = [];

  // 1. The streak, because it is the only one with a deadline tonight.
  if (!input.loggedToday) {
    missions.push({
      key: "log",
      icon: "🔥",
      text:
        input.streak > 0
          ? `Log today to keep your ${input.streak}-day streak`
          : "Log today's work — takes 30 seconds",
      href: "/log",
    });
  }

  // 2. Follow-ups, because each one is a person already waiting.
  if (input.followupsDue > 0) {
    missions.push({
      key: "followups",
      icon: "📞",
      text: `${input.followupsDue} follow-up${input.followupsDue === 1 ? "" : "s"} waiting`,
      href: "/prospects?due=1",
    });
  }

  // 3. The target. Points only — no rupee figure, no conversion (D40).
  if (input.targetPoints && input.progressPoints !== null) {
    const pct = Math.round((input.progressPoints / input.targetPoints) * 100);
    const nextMark = [25, 50, 75, 100].find((m) => pct < m);
    if (nextMark) {
      const needed = Math.ceil((nextMark / 100) * input.targetPoints) - input.progressPoints;
      missions.push({
        key: "target",
        icon: "🎯",
        text: `${needed.toLocaleString("en-IN")} points to cross ${nextMark}%`,
        href: "/targets",
      });
    }
  }

  return missions.slice(0, 3);
}

export default function TodaysMission({ missions }: { missions: Mission[] }) {
  if (missions.length === 0) {
    return (
      <section className="rounded-2xl border border-hairline bg-surface p-5">
        <h2 className="font-display text-lg font-semibold text-text">
          Nothing waiting
        </h2>
        <p className="mt-1 text-sm text-text-dim">
          Logged, followed up, on target. Go and meet someone new.
        </p>
        <Link
          href="/prospects/new"
          className="neopop metal-gold mt-4 inline-flex h-12 items-center px-5 font-semibold"
        >
          Add a new person
        </Link>
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl border border-hairline bg-surface p-5"
      data-testid="todays-mission"
    >
      <h2 className="font-display text-lg font-semibold text-text">Today&apos;s Mission</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {missions.map((m) => (
          <li key={m.key}>
            <Link
              href={m.href}
              data-testid={`mission-${m.key}`}
              // 48px minimum tap target (v1 §9), one tap to the action.
              className="flex min-h-12 items-center gap-3 rounded-xl bg-elevated px-4 py-3 text-text"
            >
              <span aria-hidden className="text-xl leading-none">
                {m.icon}
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium">{m.text}</span>
              <span aria-hidden className="text-text-dim">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { daysUntil, todayHeading } from "@/lib/dates";
import { followupCounts } from "@/lib/followup-queries";
import { getLogState } from "@/lib/daily-log-queries";
import {
  getMyTarget,
  pendingProofCount,
  proofsAwaitingReview,
} from "@/lib/targets-queries";
import { currentMonth, progressPercent } from "@/lib/targets";
import InviteButtons from "@/components/InviteButtons";
import { TeamIcon } from "@/components/icons";

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // directDownlineCount is materialised on the user document, maintained in the
  // same transaction as the signup that creates a downline — Firestore cannot
  // count children, and this page should not pay for a query to find out.
  const directCount = user.directDownlineCount;
  const [followups, logState, myTarget, proofsToAnswer, proofsToReview] =
    await Promise.all([
      followupCounts(user.id),
      getLogState(user.id),
      getMyTarget(user.id, currentMonth()),
      pendingProofCount(user.id),
      proofsAwaitingReview(user.id),
    ]);
  const trialDaysLeft = daysUntil(user.trialEndsAt);
  const firstName = user.name.split(" ")[0];
  const today = todayHeading();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Hello, {firstName} 👋</h1>
        <p className="mt-1 text-navy/60">{today}</p>
      </div>

      {user.plan === "trial" && (
        <Link
          href="/settings"
          className="flex items-center justify-between rounded-2xl bg-surface px-5 py-4"
        >
          <span>
            Free trial · <b>{trialDaysLeft} days</b> left
          </span>
          <span className="text-sm font-medium text-gold-600">Details</span>
        </Link>
      )}

      {/* Today's work, above everything else. Overdue people are named as late so
          the number cannot be read as "all caught up" (F5). */}
      {followups.due > 0 && (
        <Link
          href="/prospects?due=1"
          className="flex items-center justify-between gap-3 rounded-2xl bg-gold-100 px-5 py-4"
        >
          <span>
            <span className="block text-3xl font-bold">{followups.due}</span>
            <span className="text-sm text-navy/70">
              {followups.due === 1 ? "person to follow up" : "people to follow up"}
              {followups.overdue > 0 && ` · ${followups.overdue} from earlier`}
            </span>
          </span>
          <span className="shrink-0 text-sm font-medium text-gold-600">See them</span>
        </Link>
      )}

      {/* Proof requests are the only thing here that is waiting on another person,
          so they sit above the routine daily prompts. */}
      {proofsToAnswer > 0 && (
        <Link
          href="/targets"
          className="flex items-center justify-between gap-3 rounded-2xl bg-gold-100 px-5 py-4"
        >
          <span>
            <span className="block text-lg font-semibold">
              {proofsToAnswer === 1
                ? "Your upline asked for proof"
                : `${proofsToAnswer} proof requests`}
            </span>
            <span className="text-sm text-navy/70">Send a photo or a line</span>
          </span>
          <span className="shrink-0 text-sm font-medium text-gold-600">Open</span>
        </Link>
      )}

      {proofsToReview > 0 && (
        <Link
          href="/targets"
          className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-5 py-4"
        >
          <span>
            <span className="block text-lg font-semibold">
              {proofsToReview === 1
                ? "1 proof to check"
                : `${proofsToReview} proofs to check`}
            </span>
            <span className="text-sm text-navy/70">Your line is waiting on you</span>
          </span>
          <span className="shrink-0 text-sm font-medium text-gold-600">Review</span>
        </Link>
      )}

      {/* The habit prompt (F6). Framed as an invitation when unlogged and as
          recognition once done — never as a scolding. */}
      <Link
        href="/log"
        className={`flex items-center justify-between gap-3 rounded-2xl px-5 py-4 ${
          logState.hasLoggedToday ? "bg-surface" : "bg-navy text-white"
        }`}
      >
        <span>
          <span className="block text-lg font-semibold">
            {logState.hasLoggedToday ? "Today is logged" : "Log today's work"}
          </span>
          <span
            className={`text-sm ${
              logState.hasLoggedToday ? "text-navy/70" : "text-white/75"
            }`}
          >
            {logState.streak > 0
              ? `${logState.streak} ${logState.streak === 1 ? "day" : "days"} in a row 🔥`
              : "Takes about 30 seconds"}
          </span>
        </span>
        <span
          className={`shrink-0 text-sm font-medium ${
            logState.hasLoggedToday ? "text-gold-600" : "text-gold"
          }`}
        >
          {logState.hasLoggedToday ? "Change it" : "Open"}
        </span>
      </Link>

      {/* Fastest path to the day's most common action (Section 4.1) */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/prospects/new"
          className="flex h-14 flex-1 items-center justify-center rounded-xl bg-gold text-lg font-semibold text-navy"
        >
          + New Person
        </Link>
        <Link
          href="/prospects/qr"
          className="flex h-14 items-center justify-center rounded-xl border border-navy/20 px-4 font-medium"
        >
          My QR code
        </Link>
      </div>

      <section className="rounded-2xl bg-navy p-5 text-white">
        <h2 className="text-sm font-medium text-white/70">My referral code</h2>
        <p className="mt-1 text-4xl font-bold tracking-[0.25em] text-gold">
          {user.referralCode}
        </p>
        <p className="mb-4 mt-2 text-sm text-white/70">
          Every coach who signs up with your code joins your line — automatically.
        </p>
        <InviteButtons code={user.referralCode} dark />
      </section>

      {/* My Target lives here rather than in the bottom nav, which Section 9 fixes
          at five tabs. */}
      <Link
        href="/targets"
        className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-5 py-4"
      >
        <span className="min-w-0">
          <span className="block text-sm text-navy/70">My Target</span>
          {myTarget ? (
            <>
              <span className="block text-2xl font-bold tabular-nums">
                {myTarget.progressPoints.toLocaleString("en-IN")}
                <span className="text-base font-medium text-navy/70">
                  {" / "}
                  {myTarget.targetPoints.toLocaleString("en-IN")}
                </span>
              </span>
              <span className="text-sm text-navy/70">
                {progressPercent(myTarget.progressPoints, myTarget.targetPoints).pct}% this
                month
              </span>
            </>
          ) : (
            <span className="block font-medium">Not set for this month</span>
          )}
        </span>
        <span className="shrink-0 text-sm font-medium text-gold-600">
          {myTarget ? "Update" : "See"}
        </span>
      </Link>

      <Link
        href="/team"
        className="flex items-center gap-4 rounded-2xl bg-surface px-5 py-4"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-100 text-gold-600">
          <TeamIcon className="h-6 w-6" />
        </span>
        <span className="flex-1">
          <span className="block text-2xl font-bold">{directCount}</span>
          <span className="text-sm text-navy/60">
            {directCount === 1 ? "coach" : "coaches"} in my direct line
          </span>
        </span>
        <span className="text-sm font-medium text-gold-600">My Team</span>
      </Link>

      <section className="rounded-2xl border border-navy/10 px-5 py-4">
        <h2 className="font-semibold">Coming next on Growline</h2>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm text-navy/60">
          <li>• Set targets with your upline</li>
          <li>• Get messages from your line</li>
        </ul>
      </section>
    </div>
  );
}
